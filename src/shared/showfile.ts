// The loaded showfile, as LifeBridge's `show` verb reports it.
//
// WHY THIS EXISTS: the decoder is main-side (src/bridge/) and the chip is in the
// renderer, which the web build compiles without src/bridge/. So the shape lives
// here, as desk.ts does for channel B.
//
// THE RULE THIS FILE ENFORCES: `onBase` is SaveGuard's verdict, made on the
// console, and nothing here re-derives it. The names are mangled on the way over
// (see `name`), so comparing them at this end could disagree with the guard that
// actually refuses the save. They are carried to be shown, and that is all.

/** How long a read may go before a quiet gap asks again. The cadence and why it
 *  is this slow are in src/bridge/showfile.ts. One minute since 2026-10-02 (was
 *  five): the watcher carries every change but a Load, which ends it, so this
 *  is how soon a Load reaches the chip on a quiet console (the owner's call). */
export const SHOW_REFRESH_MS = 60_000

/** How long an ask may take before it counts as unanswered. A plugin call is
 *  slower than a bare SendOSC, and a busy console slower still; an answer after
 *  this is still recorded, as a read at the moment it arrived. */
export const SHOW_TIMEOUT_MS = 5_000

/** A name older than this is STALE. Derived, not configured: on a quiet console
 *  a read is at most one refresh old, plus the 15 s quiet spell before the gap
 *  that asks (QUIET_MS in src/bridge/ping.ts; a test holds the two together),
 *  plus the answer. Older means the console has been too busy to ask, and a
 *  Load could have happened unseen. */
export const SHOW_STALE_AFTER_MS = SHOW_REFRESH_MS + 15_000 + SHOW_TIMEOUT_MS

export type Showfile = {
	/** The loaded show, normalised as SaveGuard normalises it: no path, no
	 *  `.show`. As the console SENT it, which is not always how it is spelled:
	 *  SendOSC carries ASCII only and splits on commas (✅ 2026-09-21, 2026-09-30),
	 *  so LifeBridge rewrites non-ASCII to `-`, commas to `;` and `|` to `/`
	 *  before it leaves. For display only. */
	name: string
	/** The base show it was compared against, mangled the same way. */
	base: string
	/** Where `base` came from: the show's own `SGV2_BaseShow`, or SaveGuard's
	 *  built-in default because the show has none (the generator never ran). */
	baseFrom: 'uservar' | 'default'
	/** SaveGuard's verdict: an in-place save here would be refused. */
	onBase: boolean
	/** The console version that answered. Every desk answer is version-specific. */
	version: string
}
