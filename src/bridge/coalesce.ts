// Newest-wins buffer, so channel B cannot drive the renderer flat out.
//
// WHY THIS EXISTS: one sweep of two executor faders pushed 771 messages in 30 s
// on 2026-09-21 — ~26 a second, and that was two controls on an otherwise idle
// desk (docs/MA3_READ_MODEL.md § Channel B). Handing those to React as they
// arrive would re-render the board tens of times a second to show a fader that a
// human eye reads as one smooth move. Every intermediate value is thrown away by
// the next frame anyway; the only question is whether we pay to render it first.
//
// THE RULE THIS FILE ENFORCES: coalescing drops SUPERSEDED values, never unseen
// ones. Each key keeps its newest value until someone drains it, so the last
// position of every fader always survives. A buffer that dropped the newest
// under load would leave a fader rendered at a level it is no longer at, which is
// the same class of lie as a stale read shown as live.
//
// Deliberately time-free: no timers, no clock, no "every N ms". When to drain is
// the caller's decision (main drives it off a frame interval), which is what
// makes this testable without faking time.

/** What a drain produced, with enough to see the buffer earning its place. */
export type Drained<T> = {
	/** Newest value per key, in the order the keys were FIRST seen. Stable
	 *  ordering matters: a board whose tiles reshuffle because a fader moved
	 *  would be unreadable. */
	updates: { key: string; value: T }[]
	/** Raw values absorbed since the last drain — 771 in the capture above. */
	absorbed: number
	/** How many of those were overwritten before anyone saw them. `absorbed`
	 *  minus `updates.length`. Worth logging: if this is ever 0 under load the
	 *  coalescer is not doing anything and something upstream has changed. */
	superseded: number
}

export type Coalescer<T> = {
	/** Take one value. Overwrites any pending value for the same key. */
	absorb: (key: string, value: T) => void
	/** Take everything pending and reset. Returns an empty `updates` when
	 *  nothing arrived — which is the normal state of a quiet desk, and must not
	 *  be mistaken for the desk being gone. See `linkFromRequests`. */
	drain: () => Drained<T>
	/** Keys currently waiting. For diagnostics only; nothing should branch on it. */
	pending: () => number
}

export function createCoalescer<T>(): Coalescer<T> {
	// A Map keeps insertion order, and re-setting an existing key does NOT move
	// it to the end — which is exactly the stable ordering promised above.
	let buffer = new Map<string, T>()
	let absorbed = 0

	return {
		absorb(key, value) {
			absorbed += 1
			buffer.set(key, value)
		},

		drain() {
			const updates = Array.from(buffer, ([key, value]) => ({ key, value }))
			const drained: Drained<T> = {
				updates,
				absorbed,
				superseded: absorbed - updates.length,
			}
			// Replaced, not cleared: the array above is built from this Map, and
			// reusing it would be fine today but is one refactor away from
			// handing the caller a collection that mutates under them.
			buffer = new Map<string, T>()
			absorbed = 0
			return drained
		},

		pending() {
			return buffer.size
		},
	}
}
