// The console link: a ping a second over channel A, echoes matched off channel C.
//
// WHY THIS EXISTS: src/bridge/ping.ts keeps the books and is pure; this is the
// timer and the socket around it. `linkState()` in kiosk.ts returned UNREACHABLE
// unconditionally until this landed, because nothing round-tripped.
//
// THE RULE THIS FILE ENFORCES: the link is LIVE only while echoes come back.
// Nothing else counts: not channel B traffic, not a send that did not error, not
// an address that resolves.

import { performance } from 'node:perf_hooks'

import { readPing } from '../../bridge/channel-c.js'
import type { OscMessage } from '../../bridge/osc.js'
import { createPingTracker, pingCommand, PING_INTERVAL_MS, type PingStats } from '../../bridge/ping.js'
import type { LinkState } from '../../shared/reading.js'
import { createCommandSender, type CommandSender } from './osc-out.js'

/** Epoch-scaled but monotonic: wall time at startup, plus a clock that never
 *  steps. ping.ts needs the monotonic part (see its header), and `since` still
 *  reads as a time of day. */
const clock = () => performance.timeOrigin + performance.now()

export type LinkHandle = {
	link(): LinkState
	/** Offer a message off the reply port. Anything that is not a ping echo is
	 *  ignored, since channel C carries more than pings. */
	offer(message: OscMessage): void
	/** The console version from the last echo, or null before one. */
	version(): string | null
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
}): LinkHandle {
	const tracker = createPingTracker(options.session, clock())
	let version: string | null = null
	let sender: CommandSender | null = null
	let timer: ReturnType<typeof setInterval> | null = null

	if (options.host !== null) {
		const target = createCommandSender({
			host: options.host,
			port: options.port,
			prefix: options.prefix,
			onError: options.onSendError,
		})
		sender = target
		const ping = () => target.send(pingCommand(tracker.send(clock())))
		ping()
		timer = setInterval(ping, PING_INTERVAL_MS)
		timer.unref?.()
	}

	return {
		link: () => tracker.link(clock()),
		offer(message) {
			const read = readPing(message, options.prefix)
			if (!read.ok) return
			if (tracker.answer(read.reply.echo, clock()).ok) version = read.reply.version
		},
		version: () => version,
		stats: () => tracker.stats(),
		stop() {
			if (timer !== null) clearInterval(timer)
			sender?.close()
		},
	}
}
