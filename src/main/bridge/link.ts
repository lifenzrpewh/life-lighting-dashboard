// The console link: the timer and socket around src/bridge/ping.ts.
//
// WHY THIS EXISTS: ping.ts keeps the books and decides when to ask, and is pure;
// this is the part that cannot be: a timer, a socket, and the messages off the
// reply port.
//
// THE RULE THIS FILE ENFORCES: the link is LIVE only on evidence from the console
// itself. An echo of our own ping, or anything else it says under our prefix.
// Never a send that did not error, and never an address that resolves.
//
// The showfile read (../../bridge/showfile.ts) rides here too, because its
// moments to ask are the link's: when it comes up, and in the quiet gaps where a
// ping goes out anyway. It never decides the link. A console with a stale or
// missing LifeBridge still pings green, as it must, and says what is wrong with
// the plugin on the showfile chip instead.

import { performance } from 'node:perf_hooks'

import { readPing, readShow } from '../../bridge/channel-c.js'
import type { OscMessage } from '../../bridge/osc.js'
import { createLinkTracker, pingCommand, type PingStats } from '../../bridge/ping.js'
import { createShowfileReader, OLD_PROBE_DETAIL, otherBuildDetail, type AskMoment } from '../../bridge/showfile.js'
import { collectShowList, readShows, type ShowListCollector } from '../../bridge/show-list.js'
import {
	loadCommand,
	loadProblem,
	saveAsCommand,
	saveAsProblem,
	type ShowList,
	type ShowWriteResult,
} from '../../shared/showfile-write.js'
import type { Channel, LinkState, ReadResult } from '../../shared/reading.js'
import type { Showfile } from '../../shared/showfile.js'
import { createCommandSender, type CommandSender } from './osc-out.js'

/** Epoch-scaled but monotonic: wall time at startup, plus a clock that never
 *  steps. ping.ts needs the monotonic part (see its header), and `since` still
 *  reads as a time of day. */
const clock = () => performance.timeOrigin + performance.now()

/** A moment on `clock`, as the same moment on the wall clock the renderer ages
 *  things by. The monotonic clock stops while the computer sleeps, so the two
 *  drift apart, and a read stamped with one and aged by the other would come
 *  out the wrong age. Converting the age, not the stamp, keeps it true. */
const onWallClock = (at: number) => Date.now() - (clock() - at)

function wallChannel<T>(channel: Channel<T>): Channel<T> {
	const latest: ReadResult<T> | null = channel.latest && { ...channel.latest, at: onWallClock(channel.latest.at) }
	const lastOk = channel.lastOk && { ...channel.lastOk, at: onWallClock(channel.lastOk.at) }
	return { latest, lastOk }
}

/** How often to ask ping.ts whether a ping is due. Local and cheap: nothing goes
 *  to the console unless one is. Fine-grained so a miss is confirmed promptly. */
const TICK_MS = 250

export type LinkHandle = {
	link(): LinkState
	/** What the console has said about its showfile, stamped on the wall clock
	 *  for the renderer to age. */
	showfile(): Channel<Showfile>
	/** Offer a message off the reply port: an echo, or other proof of life. */
	offer(message: OscMessage): void
	/** The console's show files, from LifeBridge's `shows` verb. One ask at a
	 *  time: a second call while one is out gets the same answer. */
	listShows(): Promise<ShowList>
	/** Save As, by an offered name (../../shared/showfile-write.ts). Sent is
	 *  not saved: the watcher's push of the new name is the read-back. */
	saveAs(name: string): ShowWriteResult
	/** Load a show. The link drops while the console loads; link-up asks the
	 *  name again, and that is the read-back. */
	load(name: string, saveFirst: boolean): ShowWriteResult
	stats(): PingStats
	stop(): void
}

export function startLink(options: {
	/** Null when settings name no console: then nothing is sent, and the link
	 *  stays unreachable since boot, which is the truth. */
	host: string | null
	port: number
	prefix: string
	/** Different on every run, so no echo from an earlier run can match. */
	session: string
	onSendError?: (detail: string) => void
	/** The link went live or down. For the log: a booth log that says when the
	 *  console went away is worth more than one that says nothing. */
	onChange?: (link: LinkState) => void
	/** Something new about the showfile: a read, a failure, a timeout. For the
	 *  log, like onChange. */
	onShowfile?: (result: ReadResult<Showfile>) => void
}): LinkHandle {
	const tracker = createLinkTracker(options.session, clock())
	const showfile = createShowfileReader()
	const ours = `/${options.prefix}/`
	let sender: CommandSender | null = null
	let timer: ReturnType<typeof setInterval> | null = null
	/** The show asked for after a Save As; cleared on stop, so it cannot fire
	 *  into a closed socket when the address changes within the wait. */
	let askAfterSave: ReturnType<typeof setTimeout> | null = null
	let lastState = tracker.link(clock()).state
	let lastShow = showfile.channel(clock()).latest

	/** How long the show list may take: several messages, one line each. */
	const SHOWS_TIMEOUT_MS = 10_000
	let listing: { collector: ShowListCollector; done: (list: ShowList) => void; promise: Promise<ShowList> } | null = null

	/** Why a write cannot go now, or null: only to a console that is
	 *  answering, so a command is never queued blind into a silent link. */
	const cannotSend = (): string | null => {
		if (sender === null) return 'No console is set up.'
		if (tracker.link(clock()).state !== 'live') return 'The console is not answering, so nothing was sent.'
		return null
	}

	const askShow = (moment: AskMoment) => {
		const now = clock()
		if (sender === null || !showfile.due(now, moment)) return
		sender.send(showfile.command())
		showfile.asked(now)
	}

	const check = () => {
		const now = clock()
		const link = tracker.link(now)
		if (link.state !== lastState) {
			options.onChange?.(link)
			if (link.state === 'live') askShow('link-up')
		}
		lastState = link.state
		const latest = showfile.channel(now).latest
		if (latest !== lastShow && latest !== null) options.onShowfile?.(latest)
		lastShow = latest
	}

	if (options.host !== null) {
		const target = createCommandSender({
			host: options.host,
			port: options.port,
			prefix: options.prefix,
			onError: options.onSendError,
		})
		sender = target
		const tick = () => {
			const now = clock()
			if (tracker.due(now)) {
				// Read before the ping goes out: a live link with no miss to confirm
				// means this ping is here because the console has been quiet.
				const quiet = tracker.link(now).state === 'live' && tracker.stats().misses === 0
				target.send(pingCommand(tracker.send(now)))
				if (quiet) askShow('quiet-gap')
			}
			check()
		}
		tick()
		timer = setInterval(tick, TICK_MS)
		timer.unref?.()
	}

	return {
		link: () => tracker.link(clock()),
		showfile: () => wallChannel(showfile.channel(clock())),
		offer(message) {
			// An echo that matches nothing (late, or another run's) is not a round
			// trip, but it did come from the console, so it still counts as heard.
			const read = readPing(message, options.prefix)
			const answered = read.ok && tracker.answer(read.reply.echo, clock()).ok
			if (!answered && message.address.startsWith(ours)) tracker.heard(clock())
			const show = readShow(message, options.prefix)
			if (show.ok && show.reply.kind === 'probe' && listing !== null) {
				// The old probe answered the show list's call: same verdict.
				showfile.refuse(clock(), OLD_PROBE_DETAIL)
				listing.done({ ok: false, detail: OLD_PROBE_DETAIL })
			} else if (show.ok) {
				showfile.reply(show.reply, clock())
				// The watcher's lifetime ran out: a fresh one now, quiet or not.
				if (show.reply.kind === 'watch' && show.reply.state === 'expired') askShow('watch-ended')
			}
			const shows = readShows(message, options.prefix)
			if (shows.ok && shows.reply.kind === 'other-build') showfile.refuse(clock(), otherBuildDetail(shows.reply.build))
			if (shows.ok && listing !== null) {
				const list = listing.collector.offer(shows.reply)
				if (list !== null) listing.done(list)
			}
			check()
		},
		listShows() {
			if (listing !== null) return listing.promise
			const why = cannotSend() ?? showfile.refused()
			if (why !== null) return Promise.resolve({ ok: false, detail: why })
			let done: (list: ShowList) => void = () => {}
			const promise = new Promise<ShowList>((resolve) => {
				const timer = setTimeout(() => done({ ok: false, detail: `The console did not send its show list in ${SHOWS_TIMEOUT_MS / 1000} s.` }), SHOWS_TIMEOUT_MS)
				done = (list) => {
					clearTimeout(timer)
					listing = null
					resolve(list)
				}
			})
			listing = { collector: collectShowList(), done: (list) => done(list), promise }
			sender?.send('Call Plugin "LifeBridge" "shows"')
			return promise
		},
		saveAs(name) {
			const why = cannotSend()
			if (why !== null) return { ok: false, detail: why }
			const latest = showfile.channel(clock()).latest
			const base = latest !== null && latest.ok ? latest.value.base : null
			const problem = saveAsProblem(name, base)
			if (problem !== null) return { ok: false, detail: problem }
			sender?.send(saveAsCommand(name))
			// The watcher pushes the new name within a second when it runs; an
			// ask restarts it when it does not (an older plugin, a Load since).
			if (askAfterSave !== null) clearTimeout(askAfterSave)
			askAfterSave = setTimeout(() => {
				askAfterSave = null
				askShow('link-up')
			}, 1_500)
			askAfterSave.unref?.()
			return { ok: true }
		},
		load(name, saveFirst) {
			const why = cannotSend()
			if (why !== null) return { ok: false, detail: why }
			const problem = loadProblem(name)
			if (problem !== null) return { ok: false, detail: problem }
			sender?.send(loadCommand(name, saveFirst))
			return { ok: true }
		},
		stats: () => tracker.stats(),
		stop() {
			if (timer !== null) clearInterval(timer)
			if (askAfterSave !== null) clearTimeout(askAfterSave)
			sender?.close()
		},
	}
}
