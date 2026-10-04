// The state vocabulary, in one place, used identically everywhere.
//
// docs/PLAN.md gives four renderings and insists they are one vocabulary. If
// LIVE looks different in the run order than on the showfile chip, an operator
// has to learn the screen twice. So nothing below is allowed to be re-styled
// locally.

import type { UnknownReason } from '../../shared/reading.js'

/** LIVE full contrast, no outline. STALE 60% contrast and a dashed outline.
 *  UNKNOWN a dotted outline and a `?` in place of the value. (Since the 2026-10-05
 *  look, a live card has no outline at all: the outline appears only when there
 *  is something to say.) */
export const stateClass: Record<'live' | 'stale' | 'unknown', string> = {
	live: 'border-solid border-transparent',
	stale: 'border-dashed border-state-stale/60',
	unknown: 'border-dotted border-state-unknown',
}

/** STALE's 60% contrast, as opacity on the CONTENT rather than a text colour on
 *  the container. A colour is overridden by every child that sets its own — which
 *  is all of them — so the container-colour version silently rendered stale
 *  values at full brightness. Opacity composes; it cannot be shouted down.
 *
 *  Applied to the values only. The age label stays at full strength: it is the
 *  part that explains why everything else is dimmed, so dimming it too would
 *  hide the explanation along with the thing being explained. */
export const staleContent = 'opacity-60'

/** The one shape every chip in the status bar takes, so the bar reads as a
 *  row of like things: same height, same corners, same spacing. The state
 *  classes above go on top of it. */
export const chip = 'flex h-12 min-w-0 items-center gap-3 rounded-lg border bg-booth-raise px-3.5'

/** The small label naming what a value is (Show, OnTime, Deck). Sentence
 *  case since 2026-10-05: a screen of uppercase labels all shouted at once. */
export const chipLabel = 'text-xs font-medium whitespace-nowrap text-booth-dim'

/** A quiet button in a bar: chip-sized, so it lines up with the chips. */
export const barButton =
	'inline-flex h-10 shrink-0 items-center rounded-lg bg-booth-raise px-3.5 text-sm font-medium whitespace-nowrap text-booth-ink transition-colors hover:bg-booth-hover active:scale-[0.98]'

/** A status word as a person writes it: "LIVE" as "Live". The shared code
 *  speaks in the old capitals; the screen does not shout them. */
export function sentence(word: string): string {
	return word === word.toUpperCase() && /[A-Z]/.test(word) ? word.charAt(0) + word.slice(1).toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1)
}

export function formatAge(ms: number): string {
	const s = Math.round(ms / 1000)
	if (s < 60) return `${s}s ago`
	const m = Math.round(s / 60)
	if (m < 60) return `${m}m ago`
	const h = Math.floor(m / 60)
	return `${h}h ${m % 60}m ago`
}

/** Why there is no value, in words an operator can act on. "Nothing read yet" is
 *  not the same sentence as "the desk stopped answering", and conflating them is
 *  how someone concludes the rig is dark when we simply have not looked. */
export const unknownWhy: Record<UnknownReason, string> = {
	'never-read': 'not read yet',
	timeout: 'no answer',
	error: 'read failed',
	unreachable: 'desk unreachable',
}

/** The `?` that stands IN PLACE OF a value — never beside one, never a zero. */
export function Unknown({ why }: { why: UnknownReason }) {
	return (
		<span className="text-booth-dim">
			<span className="text-2xl leading-none">?</span>
			<span className="ml-2 text-sm">{unknownWhy[why]}</span>
		</span>
	)
}
