// The console link: the timer and socket around src/bridge/ping.ts.
//
// WHY THIS EXISTS: ping.ts keeps the books and decides when to ask, and is pure;
// this is the part that cannot be: a timer, a socket, and the messages off the
// reply port.
//
// THE RULE THIS FILE ENFORCES: the link is LIVE only on evidence from the console
// itself. An echo of our own ping, or anything else it says under our prefix.
// Never a send that did not error, and never an address that resolves.

import { performance } from 'node:perf_hooks'

import { readPing } from '../../bridge/channel-c.js'
import type { OscMessage } from '../../bridge/osc.js'
import { createLinkTracker, pingCommand, type PingStats } from '../../bridge/ping.js'
import type { LinkState } from '../../shared/reading.js'
import { createCommandSender, type CommandSender } from './osc-out.js'

/** Epoch-scaled but monotonic: wall time at startup, plus a clock that never
 *  steps. ping.ts needs the monotonic part (see its header), and `since` still
 *  reads as a time of day. */
const clock = () => performance.timeOrigin + performance.now()

/** How often to ask ping.ts whether a ping is due. Local and cheap: nothing goes
 *  to the console unless one is. Fine-grained so a miss is confirmed promptly. */
const TICK_MS = 250

export type LinkHandle = {
	link(): LinkState
	/** Offer a message off the reply port: an echo, or other proof of life. */
	offer(message: OscMessage): void
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
}): LinkHandle {
	const tracker = createLinkTracker(options.session, clock())
	const ours = `/${options.prefix}/`
	let sender: CommandSender | null = null
	let timer: ReturnType<typeof setInterval> | null = null
	let lastState = tracker.link(clock()).state

	const check = () => {
		const now = tracker.link(clock())
		if (now.state !== lastState) options.onChange?.(now)
		lastState = now.state
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
			if (tracker.due(now)) target.send(pingCommand(tracker.send(now)))
			check()
		}
		tick()
		timer = setInterval(tick, TICK_MS)
		timer.unref?.()
	}

	return {
		link: () => tracker.link(clock()),
		offer(message) {
			// An echo that matches nothing (late, or another run's) is not a round
			// trip, but it did come from the console, so it still counts as heard.
			const read = readPing(message, options.prefix)
			const answered = read.ok && tracker.answer(read.reply.echo, clock()).ok
			if (!answered && message.address.startsWith(ours)) tracker.heard(clock())
			check()
		},
		stats: () => tracker.stats(),
		stop() {
			if (timer !== null) clearInterval(timer)
			sender?.close()
		},
	}
}
