// The console link: is the console there? Asked only when there is reason to doubt.
//
// WHY THIS EXISTS: liveness needs a request that can go unanswered. Channel B is
// the console talking unprompted, so it can prove the console is there and never
// that it is not (`linkFromRequests` in src/shared/reading.ts). So when the
// console has been quiet, the dashboard asks: it sends `SendOSC` over channel A,
// and the console answers by sending that message back over channel C.
//
// WHY IT ASKS SO RARELY: every ping is a line on the console's command line
// (❌ 2026-09-30, onPC 2.3.2.0: a ping a second through the plugin wrote two
// lines a second, `call Plugin` and `SendOSC`, and buried the history). So:
//   - anything the console says counts as proof it is there, and resets the wait.
//     A console someone is working is never pinged at all;
//   - after QUIET_MS of silence, one ping;
//   - a miss is confirmed at once with another, so one lost packet does not turn
//     the screen red, and three in a row do, about 21 s after the console last
//     spoke (agreed with the operator, 2026-09-30);
//   - while down, or before anything has answered, retry every RETRY_MS.
// Silence is still never read as death: it only ever leads to a question.
//
// THE RULE THIS FILE ENFORCES: an echo counts only if it answers a ping this run
// sent and has not given up on. Every token carries a per-run session part, so an
// echo still in flight from before a restart, or one meant for a second dashboard
// on the same port, cannot turn the link green.
//
// Deliberately time-free, like the coalescer: the caller passes `now` and owns the
// timer. Pass a monotonic clock. A wall clock that steps back would leave every
// ping looking young, and the link would stay LIVE through a dead console for as
// long as the step.

import { linkFromRequests, UNANSWERED_BEFORE_UNREACHABLE, type LinkState } from '../shared/reading.js'

/** How long the console may be silent before it is asked. */
export const QUIET_MS = 15_000

/** How long a ping may take before it counts as unanswered. Measured round trips
 *  are ~50 ms on onPC, so this is generous: a console busy for a second is slow,
 *  not gone. An answer after it is ignored, so a verdict does not depend on when
 *  someone last asked for the link. */
export const PING_TIMEOUT_MS = 2_000

/** How often to ask while down, or before the first answer. Slow enough not to
 *  fill a command line that is receiving but cannot answer (a reply row set up
 *  wrong), fast enough to notice a console coming back. */
export const RETRY_MS = 5_000

/** The OSC row the console answers through: the row that sends to this
 *  computer. The same row LifeBridge sends through (`OSC_ENTRY` in
 *  console-plugin/LifeBridge.lua); a test holds the two together. */
export const REPLY_ROW = 3

/** The command that makes the console answer: it sends `/ping` back through
 *  REPLY_ROW, and SendOSC prepends the row's Prefix, so it arrives as
 *  `/life/ping` (✅ 2026-09-21). One command, one line on the command line, and
 *  no plugin involved, so a stale plugin cannot turn the link red. */
export function pingCommand(token: string): string {
	return `SendOSC ${REPLY_ROW} "/ping,s,${token}"`
}

export type PingAnswer =
	| { ok: true; roundTripMs: number }
	/** Never sent by this run, or already given up on. */
	| { ok: false; reason: 'unknown-token' }

export type PingStats = {
	sent: number
	answered: number
	/** Echoes that matched nothing outstanding: late, or not ours. */
	unmatched: number
	/** Pings in a row that timed out with nothing heard since. */
	misses: number
	outstanding: number
}

export type LinkTracker = {
	/** Should a ping go out now? Asked by the caller's timer. */
	due(now: number): boolean
	/** Record a new ping, and return the token it must carry. */
	send(now: number): string
	/** An echo came back carrying `token`. */
	answer(token: string, now: number): PingAnswer
	/** The console said something else: channel B, or another channel C push. */
	heard(now: number): void
	link(now: number): LinkState
	stats(): PingStats
}

/** `session` must differ on every run. It goes out inside a command string, so
 *  it is held to letters and digits. */
export function createLinkTracker(session: string, startedAt: number): LinkTracker {
	if (!/^[A-Za-z0-9]+$/.test(session)) throw new Error(`ping session must be alphanumeric, got ${JSON.stringify(session)}`)

	// At most one ping is ever in flight, but a Map keeps the bookkeeping honest
	// if that changes.
	const outstanding = new Map<string, number>()
	let seq = 0
	let misses = 0
	let lastRoundTripMs: number | null = null
	let lastHeardAt: number | null = null
	let lastSentAt: number | null = null
	// Boot counts as down, since nothing has answered yet.
	let downSince = startedAt
	let sent = 0
	let answered = 0
	let unmatched = 0

	const expire = (now: number) => {
		for (const [token, at] of outstanding) {
			if (now - at < PING_TIMEOUT_MS) break
			outstanding.delete(token)
			misses += 1
			// The moment a live link went down, not the moment someone asked:
			// `since` is a fact about the console. A link that never answered has
			// been down since boot, and keeps saying so.
			if (misses === UNANSWERED_BEFORE_UNREACHABLE && lastRoundTripMs !== null) downSince = at + PING_TIMEOUT_MS
		}
	}

	const isDown = () => lastRoundTripMs === null || misses >= UNANSWERED_BEFORE_UNREACHABLE

	return {
		due(now) {
			expire(now)
			if (outstanding.size > 0) return false
			if (isDown()) return lastSentAt === null || now - lastSentAt >= RETRY_MS
			// A miss not yet confirmed either way: ask again at once.
			if (misses > 0) return true
			return now - Math.max(lastHeardAt ?? startedAt, lastSentAt ?? startedAt) >= QUIET_MS
		},

		send(now) {
			expire(now)
			seq += 1
			sent += 1
			lastSentAt = now
			const token = `${session}.${seq}`
			outstanding.set(token, now)
			return token
		},

		answer(token, now) {
			expire(now)
			const at = outstanding.get(token)
			if (at === undefined) {
				unmatched += 1
				return { ok: false, reason: 'unknown-token' }
			}
			// Anything sent before this one is dropped, not counted as missed: the
			// console has just answered, so those were lost or overtaken.
			for (const older of outstanding.keys()) {
				outstanding.delete(older)
				if (older === token) break
			}
			misses = 0
			answered += 1
			lastHeardAt = now
			lastRoundTripMs = now - at
			return { ok: true, roundTripMs: lastRoundTripMs }
		},

		heard(now) {
			// Proof the console is there, but not a round trip: it cannot make a
			// link live that has never answered, because LIVE carries a measured
			// round trip and there is none to show.
			expire(now)
			lastHeardAt = now
			misses = 0
		},

		link(now) {
			expire(now)
			const verdict = linkFromRequests(misses, lastRoundTripMs, now)
			return verdict.state === 'unreachable' ? { state: 'unreachable', since: downSince } : verdict
		},

		stats: () => ({ sent, answered, unmatched, misses, outstanding: outstanding.size }),
	}
}
