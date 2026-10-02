// The two slots: which view is in each (docs/VISUALS_DASHBOARD.md, piece 4).
//
// The owner's answers, 2026-10-03: both slots pick; a view is in one slot at a
// time, so picking the other slot's view swaps them; everyone may pick; each
// machine remembers its layout.
//
// THE RULE THIS FILE ENFORCES: the picker offers only what is answering, but a
// slot keeps its view when that view stops answering. The screen never
// rearranges itself under a volunteer; the view says it is not answering, in
// its own place. So `offered` always includes what the slots already hold, and
// nothing here ever moves a view because a source went quiet.

export type ViewId = 'cue' | 'ma' | 'arena'

/** Every view, in the picker's order. */
export const VIEWS: readonly ViewId[] = ['cue', 'ma', 'arena']

export const VIEW_LABEL: Record<ViewId, string> = {
	cue: 'Run order',
	ma: 'MA',
	arena: 'Arena',
}

export type Slot = 'left' | 'right'

export type Layout = Record<Slot, ViewId>

/** The screen as it was before there were slots: the run order beside the MA. */
export const DEFAULT_LAYOUT: Layout = { left: 'cue', right: 'ma' }

const other = (slot: Slot): Slot => (slot === 'left' ? 'right' : 'left')

/** Put `view` in `slot`. If the other slot holds it, the two swap. */
export function pick(layout: Layout, slot: Slot, view: ViewId): Layout {
	if (layout[slot] === view) return layout
	const o = other(slot)
	return layout[o] === view ? { ...layout, [slot]: view, [o]: layout[slot] } : { ...layout, [slot]: view }
}

/** What a slot's picker offers: every view that is answering, and both views
 *  already on screen whether answering or not, in the picker's order. */
export function offered(layout: Layout, answering: Record<ViewId, boolean>): ViewId[] {
	return VIEWS.filter((v) => answering[v] || v === layout.left || v === layout.right)
}

/** Which slot holds `view`, or null when neither does. */
export function slotOf(layout: Layout, view: ViewId): Slot | null {
	return layout.left === view ? 'left' : layout.right === view ? 'right' : null
}

const isView = (v: unknown): v is ViewId => typeof v === 'string' && (VIEWS as readonly string[]).includes(v)

/** A layout off this machine's storage. Anything that is not two different,
 *  known views is the default: a view removed in a later version, or storage
 *  edited by hand, must not leave a slot holding nothing. */
export function layoutFrom(stored: unknown): Layout {
	if (typeof stored !== 'string') return DEFAULT_LAYOUT
	let v: unknown
	try {
		v = JSON.parse(stored)
	} catch {
		return DEFAULT_LAYOUT
	}
	if (typeof v !== 'object' || v === null) return DEFAULT_LAYOUT
	const { left, right } = v as Record<string, unknown>
	return isView(left) && isView(right) && left !== right ? { left, right } : DEFAULT_LAYOUT
}
