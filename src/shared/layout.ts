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

import { embedIdOf, type Embed, type EmbedView } from './embeds.js'

/** The views that come with Pāua. */
export type BuiltInView = 'cue' | 'ma' | 'arena' | 'clips' | 'video'

/** A built-in view, or an embed someone added in Connections (./embeds.ts). */
export type ViewId = BuiltInView | EmbedView

/** Every built-in view, in the picker's order. Embeds follow, in theirs. */
export const VIEWS: readonly BuiltInView[] = ['cue', 'ma', 'arena', 'clips', 'video']

export const VIEW_LABEL: Record<BuiltInView, string> = {
	cue: 'Run order',
	ma: 'MA',
	arena: 'Arena',
	/** Arena's clip grid, to fire from (./components/ClipsView.tsx). */
	clips: 'Clips',
	video: 'Video',
}

/** A built-in view, or any embed's view by its shape. Whether that embed still
 *  exists is the caller's question: a layout outlives an embed removed. */
export function isViewId(v: unknown): v is ViewId {
	return typeof v === 'string' && ((VIEWS as readonly string[]).includes(v) || embedIdOf(v) !== null)
}

/** What a view is called: its label, or an embed's own name. */
export function viewLabel(view: ViewId, embeds: readonly Embed[]): string {
	const id = embedIdOf(view)
	if (id === null) return VIEW_LABEL[view as BuiltInView]
	return embeds.find((e) => e.id === id)?.name ?? 'Embed'
}

/** The views main draws as pages of their own, over the box that holds them:
 *  the MA, the run order and every embed. A page is in one place at a time. */
export function isNative(view: ViewId): boolean {
	return view === 'ma' || view === 'cue' || embedIdOf(view) !== null
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
 *  already on screen whether answering or not, in the picker's order. Embeds
 *  are `extra`, after the built-in views, and always answer: their pages say
 *  for themselves when they cannot load. */
export function offered(
	layout: Layout,
	answering: Record<BuiltInView, boolean>,
	extra: readonly ViewId[] = [],
): ViewId[] {
	const all: ViewId[] = [...VIEWS, ...extra]
	return all.filter(
		(v) => (embedIdOf(v) !== null || answering[v as BuiltInView] === true) || v === layout.left || v === layout.right,
	)
}

/** Which slot holds `view`, or null when neither does. */
export function slotOf(layout: Layout, view: ViewId): Slot | null {
	return layout.left === view ? 'left' : layout.right === view ? 'right' : null
}

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
	return isViewId(left) && isViewId(right) && left !== right ? { left, right } : DEFAULT_LAYOUT
}
