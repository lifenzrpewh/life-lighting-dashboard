// The state vocabulary, in one place, used identically everywhere.
//
// docs/PLAN.md gives four renderings and insists they are one vocabulary. If
// LIVE looks different in the run order than on the showfile chip, an operator
// has to learn the screen twice. So nothing below is allowed to be re-styled
// locally.

import type { UnknownReason } from '../../shared/reading.js'

/** LIVE full contrast, solid. STALE 60% contrast, dashed underline. UNKNOWN
 *  dotted border and a `?` in place of the value. */
export const stateClass: Record<'live' | 'stale' | 'unknown', string> = {
	live: 'border-solid border-booth-edge',
	stale: 'border-dashed border-state-stale/50',
	unknown: 'border-dotted border-state-unknown/60',
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
			<span className="ml-2 text-xs uppercase tracking-wide">{unknownWhy[why]}</span>
		</span>
	)
}
