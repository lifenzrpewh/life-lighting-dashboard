// The link's round trip: a ping out over channel A, its echo back over channel C.
//
// WHY THIS EXISTS: the link pill has said UNREACHABLE since the first build, and
// correctly, because liveness needs a request that can go unanswered. Channel B
// is the console talking unprompted, so it can prove the desk is there and never
// that it is not (`linkFromRequests` in src/shared/reading.ts). This is the
// bookkeeping for those requests: which are outstanding, which ran out of time,
// and what the last answer cost.
//
// THE RULE THIS FILE ENFORCES: a reply counts only if it answers a ping this run
// sent and has not given up on. Every token carries a per-run session part, so an
// echo still in flight from before a restart, or one meant for a second dashboard
// on the same port, cannot turn the link green.
//
// Deliberately time-free, like the coalescer: the caller passes `now` and owns
// the timer. Pass a monotonic clock. A wall clock that steps back would leave
// every ping looking young, and the link would stay LIVE through a dead desk
// for as long as the step.

import { linkFromRequests, UNANSWERED_BEFORE_UNREACHABLE, type LinkState } from '../shared/reading.js'

/** One ping a second, as docs/PLAN.md has it. With three misses to UNREACHABLE,
 *  a dead desk is admitted to within about five seconds. */
export const PING_INTERVAL_MS = 1_000

/** How long a ping may take before it counts as unanswered. Twice the interval,
 *  so a console busy for a second is slow rather than gone. An answer after this
 *  is ignored: it would otherwise count or not depending on when someone last
 *  asked for the link, and a verdict should not depend on who is looking. */
export const PING_TIMEOUT_MS = 2_000

/** The plugin's name in the console's plugin pool, as imported from
 *  console-plugin/LifeBridge.xml. */
export const PLUGIN_NAME = 'LifeBridge'

/** The command that makes the console answer a ping.
 *
 *  ⚠️ UNVERIFIED. `Call Plugin "Wings"` is ✅ (MA3_SYNTAX_REFERENCE.md), but
 *  handing a plugin an ARGUMENT has never been observed: the ping verb has never
 *  run on a console, because the desk kept the old build in memory (❌
 *  2026-09-21). The plugin scans every argument for the first string rather
 *  than trusting a position, which covers a different slot but not a
 *  different syntax. First check at any console. */
export function pingCommand(token: string): string {
	return `Call Plugin "${PLUGIN_NAME}" "ping ${token}"`
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
	/** Pings in a row that timed out with nothing answered since. */
	misses: number
	outstanding: number
}

export type PingTracker = {
	/** Record a new ping, and return the token it must carry. */
	send(now: number): string
	/** An echo came back carrying `token`. */
	answer(token: string, now: number): PingAnswer
	link(now: number): LinkState
	stats(): PingStats
}

/** `session` must differ on every run. It goes out inside a command string, so
 *  it is held to letters and digits. */
export function createPingTracker(session: string, startedAt: number): PingTracker {
	if (!/^[A-Za-z0-9]+$/.test(session)) throw new Error(`ping session must be alphanumeric, got ${JSON.stringify(session)}`)

	// Token to send time, oldest first: a Map keeps insertion order, and pings
	// are inserted in the order they are sent.
	const outstanding = new Map<string, number>()
	let seq = 0
	let misses = 0
	let lastRoundTripMs: number | null = null
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
			// `since` is a fact about the desk. A link that never answered has
			// been down since boot, and keeps saying so.
			if (misses === UNANSWERED_BEFORE_UNREACHABLE && lastRoundTripMs !== null) downSince = at + PING_TIMEOUT_MS
		}
	}

	return {
		send(now) {
			expire(now)
			seq += 1
			sent += 1
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
			// Older pings still waiting are dropped, not counted as misses: the
			// desk has just answered a later one, so it is up and those packets
			// were lost or overtaken.
			for (const older of outstanding.keys()) {
				outstanding.delete(older)
				if (older === token) break
			}
			misses = 0
			answered += 1
			lastRoundTripMs = now - at
			return { ok: true, roundTripMs: lastRoundTripMs }
		},

		link(now) {
			expire(now)
			const verdict = linkFromRequests(misses, lastRoundTripMs, now)
			return verdict.state === 'unreachable' ? { state: 'unreachable', since: downSince } : verdict
		},

		stats: () => ({ sent, answered, unmatched, misses, outstanding: outstanding.size }),
	}
}
