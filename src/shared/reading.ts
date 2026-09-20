// The four states, as types — the app's whole honesty story.
//
// WHY THIS EXISTS: `ma3-mcp/server.py:184` is literally `send(...) or "No groups
// found"`. That one line makes a slow desk indistinguishable from an empty show,
// and the operator has no way to tell. This file is the structural answer: there
// is no expression in this codebase that turns a failed read into a value.
//
// THE RULE THIS FILE ENFORCES: you cannot reach a value without saying, in the
// same breath, what you will render when there isn't one. `matchReading` demands
// a branch per state, so `?? 0` and `|| "off"` have nowhere to live. Rendering a
// timeout as a value is a type error, not a code-review item.
//
// Deliberately absent: any `valueOr(fallback)` / `unwrap()` / `.value ?? x`
// helper. Such a function would be the bug, wearing a bow. Don't add one.
//
// NOTE ON SCOPE: LIVE / STALE / UNKNOWN describe one value. UNREACHABLE describes
// the link, and its rendering is a full-width bar — but it also drives every
// value on screen to UNKNOWN at the same instant, which is why it is an input to
// the derivation below rather than a fourth member of `Reading`. One vocabulary,
// two scopes, and the compiler keeps them straight.

/** One read attempt, as the bridge reports it. Note there is no success-shaped
 *  failure: a timeout carries no value, so no caller can accidentally render one. */
export type ReadResult<T> =
	| { ok: true; value: T; at: number }
	| { ok: false; reason: 'timeout'; at: number }
	| { ok: false; reason: 'error'; at: number; detail: string }

/** Why a value is not being shown. Carried on UNKNOWN so a tile can say which
 *  kind of nothing it is looking at — 'never-read' is boot, and is NOT 'off'. */
export type UnknownReason = 'never-read' | 'timeout' | 'error' | 'unreachable'

/** What the UI renders for one value. `value` exists on LIVE and STALE only;
 *  that absence is the load-bearing part of this type. */
export type Reading<T> =
	| { state: 'live'; value: T }
	| { state: 'stale'; value: T; ageMs: number }
	| { state: 'unknown'; why: UnknownReason }

/** A value we track over time: the newest attempt, plus the last one that worked.
 *  Keeping `lastOk` separately is what lets a timeout degrade to STALE-with-age
 *  ("78% · 4m ago") instead of collapsing straight to `?`. */
export type Channel<T> = {
	latest: ReadResult<T> | null
	lastOk: { value: T; at: number } | null
}

/** The link itself. Silence is NOT evidence of death — see `linkFromRequests`. */
export type LinkState =
	| { state: 'live'; roundTripMs: number }
	| { state: 'unreachable'; since: number }

/** A value older than this is shown as STALE rather than LIVE.
 *
 *  Derived, not configured: the plugin answers a 40-sequence snapshot inside one
 *  8 ms slice (docs/MA3_READ_MODEL.md — a sequence resolve is ~0.01 ms), so the
 *  refresh is sub-second. Three seconds is several missed refreshes — long enough
 *  that one dropped UDP packet doesn't flap the whole board to STALE, short
 *  enough that a genuinely dead feed admits it while the operator still has time
 *  to do something about it. */
export const STALE_AFTER_MS = 3_000

/** A channel that has never been read. Boot state is UNKNOWN, not off, and not
 *  zero: at startup we have no idea what the rig is doing, and saying so is the
 *  entire point. */
export function unread<T>(): Channel<T> {
	return { latest: null, lastOk: null }
}

/** Fold a new attempt into a channel. A failure never overwrites `lastOk` —
 *  that is what keeps the last good value available to age honestly. */
export function record<T>(channel: Channel<T>, result: ReadResult<T>): Channel<T> {
	return {
		latest: result,
		lastOk: result.ok ? { value: result.value, at: result.at } : channel.lastOk,
	}
}

/** Derive what to render. The only way a value reaches the UI.
 *
 *  `link` comes first in the precedence order on purpose: when the desk is
 *  unreachable, every element drops to UNKNOWN together, at the same instant. A
 *  board where half the tiles kept showing confident numbers through a dead link
 *  would be the exact failure this app exists to prevent. */
export function readingOf<T>(channel: Channel<T>, now: number, link: LinkState): Reading<T> {
	if (link.state === 'unreachable') return { state: 'unknown', why: 'unreachable' }

	const { latest, lastOk } = channel
	if (latest === null) return { state: 'unknown', why: 'never-read' }

	if (latest.ok) {
		const ageMs = now - latest.at
		return ageMs < STALE_AFTER_MS
			? { state: 'live', value: latest.value }
			: { state: 'stale', value: latest.value, ageMs }
	}

	// The read failed. If we ever had a value, show it WITH its age rather than
	// hiding it — an aged number the operator can judge beats a `?` they can't.
	// Uncapped by design: the age is always rendered, so it cannot mislead.
	if (lastOk !== null) return { state: 'stale', value: lastOk.value, ageMs: now - lastOk.at }

	return { state: 'unknown', why: latest.reason }
}

/** Render a reading. Every branch is required — omit one and it will not compile,
 *  which is the whole mechanism. There is no default case and never will be. */
export function matchReading<T, R>(
	reading: Reading<T>,
	on: {
		live: (value: T) => R
		stale: (value: T, ageMs: number) => R
		unknown: (why: UnknownReason) => R
	},
): R {
	switch (reading.state) {
		case 'live':
			return on.live(reading.value)
		case 'stale':
			return on.stale(reading.value, reading.ageMs)
		case 'unknown':
			return on.unknown(reading.why)
	}
}

/** Link health from unanswered requests — NOT from inbound silence.
 *
 *  THE TRAP: channel B is the console's native OSC out, which only speaks when
 *  something changes. A quiet desk mid-sermon is silent for minutes and is
 *  perfectly healthy. Treating that silence as death would throw a full-width
 *  UNREACHABLE bar across the screen during the quietest, most exposed part of
 *  the service. So liveness is only ever inferred from snapshot requests we sent
 *  and did not get an answer to. */
export const UNANSWERED_BEFORE_UNREACHABLE = 3

export function linkFromRequests(
	unanswered: number,
	lastRoundTripMs: number | null,
	now: number,
): LinkState {
	if (unanswered >= UNANSWERED_BEFORE_UNREACHABLE || lastRoundTripMs === null) {
		return { state: 'unreachable', since: now }
	}
	return { state: 'live', roundTripMs: lastRoundTripMs }
}

/** The outcome of a write. `Cmd()` discards its return, so a command that failed
 *  is structurally indistinguishable from one that worked: 'sent-unconfirmed' is
 *  the honest resting state of every write until a read-back moves it. It is not
 *  a transient on the way to success — a write can stay here forever. */
export type WriteOutcome =
	| { state: 'confirmed'; at: number }
	| { state: 'sent-unconfirmed'; sentAt: number }
	| { state: 'failed'; at: number; detail: string }
