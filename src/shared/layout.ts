// The screen's layout: windows on a grid, MA3-style, each with tabs (the
// owner, 2026-10-04). It replaces the two slots and their divider.
//
// The owner's decisions:
// - A 12 × 8 grid. Windows never overlap: a native page (the MA, the run
//   order, an embed) cannot be drawn over, and MA3's windows do not overlap
//   either. Added, moved and resized by dragging, snapping to cells.
// - Each window has tabs: tap to switch, + to add a view, × to remove one. Any
//   view in any tab, duplicates allowed.
// - The MA shows once. A second MA tab says so and offers "Move it here". The
//   run order and every embed are pages too, so they follow the same rule: a
//   page is in one place at a time. (A second Cue Manager page could sync its
//   offline queue twice; one page cannot.)
// - A turned-off connection's tabs disappear, and come back when it is on.
// - Arranging (windows, and adding or removing tabs) is operator mode only,
//   behind an Edit layout switch. Switching tabs is everyone's.
// - The default, fresh or with nothing saved: the run order on the left third,
//   the MA on the right two-thirds, as the slots were.
//
// THE RULE THIS FILE ENFORCES: a layout always holds. Every change here returns
// a layout whose windows are inside the grid and overlap nothing, or returns
// the layout it was given. Nothing off storage is trusted until it passes the
// same test. And the screen never rearranges itself: a view that stops
// answering keeps its tab, which says so in its own place.

import { embedIdOf, type Embed, type EmbedView } from './embeds.js'

/** The views that come with Pāua. */
export type BuiltInView = 'cue' | 'ma' | 'arena' | 'clips' | 'video'

/** A built-in view, or an embed someone added in Connections (./embeds.ts). */
export type ViewId = BuiltInView | EmbedView

/** Every built-in view, in the + menu's order. Embeds follow, in theirs. */
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

export const COLS = 12
export const ROWS = 8

/** The smallest a window may be, in cells: room for a strip of tabs and
 *  something under it. */
export const MIN_W = 2
export const MIN_H = 2

/** A place on the grid, in cells: column, row, width, height. */
export type Box = { x: number; y: number; w: number; h: number }

export type Tab = { id: string; view: ViewId }

export type GridWindow = Box & {
	id: string
	tabs: Tab[]
	/** The tab showing, by id; null only when the window has no tabs. */
	active: string | null
}

export type Layout = {
	windows: GridWindow[]
	/** Which tab each page is shown in, when more than one tab holds it and
	 *  someone tapped "Move it here". By view; a tab id that has gone, or is not
	 *  showing, is passed over (`homeOf`). */
	homes: Partial<Record<ViewId, string>>
}

/** The screen as it was before there were windows: the run order on the
 *  left third, the MA on the right two-thirds. */
export const DEFAULT_LAYOUT: Layout = {
	windows: [
		{ id: 'w1', x: 0, y: 0, w: 4, h: 8, tabs: [{ id: 't1', view: 'cue' }], active: 't1' },
		{ id: 'w2', x: 4, y: 0, w: 8, h: 8, tabs: [{ id: 't2', view: 'ma' }], active: 't2' },
	],
	homes: {},
}

// ─── Geometry ──────────────────────────────────────────────────────────────

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const inGrid = (b: Box) =>
	[b.x, b.y, b.w, b.h].every(Number.isInteger) &&
	b.x >= 0 &&
	b.y >= 0 &&
	b.w >= MIN_W &&
	b.h >= MIN_H &&
	b.x + b.w <= COLS &&
	b.y + b.h <= ROWS

/** Whether `box` may be where it is: inside the grid, big enough, and over no
 *  other window. `self` is the window being moved, which may overlap itself. */
export function fits(layout: Layout, box: Box, self: string | null = null): boolean {
	return inGrid(box) && layout.windows.every((w) => w.id === self || !overlaps(w, box))
}

/** The biggest free place on the grid, or null when there is no room for even
 *  the smallest window. Ties go to the top-left. */
export function freeBox(layout: Layout): Box | null {
	let best: Box | null = null
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			for (let h = ROWS - y; h >= MIN_H; h--) {
				for (let w = COLS - x; w >= MIN_W; w--) {
					if (best !== null && w * h <= best.w * best.h) break
					const box = { x, y, w, h }
					if (fits(layout, box)) best = box
				}
			}
		}
	}
	return best
}

// ─── Changes ───────────────────────────────────────────────────────────────

const replace = (layout: Layout, id: string, f: (w: GridWindow) => GridWindow): Layout => ({
	...layout,
	windows: layout.windows.map((w) => (w.id === id ? f(w) : w)),
})

/** A new window in the biggest free place, showing `view`, or empty for
 *  null. Unchanged when there is no room: make a window smaller first. */
export function addWindow(layout: Layout, view: ViewId | null, ids: { window: string; tab: string }): Layout {
	const box = freeBox(layout)
	if (box === null) return layout
	const tabs = view === null ? [] : [{ id: ids.tab, view }]
	return { ...layout, windows: [...layout.windows, { ...box, id: ids.window, tabs, active: tabs[0]?.id ?? null }] }
}

export function removeWindow(layout: Layout, id: string): Layout {
	return { ...layout, windows: layout.windows.filter((w) => w.id !== id) }
}

/** Move or resize a window to `box`: done only if it fits, otherwise nothing
 *  changes, so a drag over another window simply does not land there. */
export function placeWindow(layout: Layout, id: string, box: Box): Layout {
	const win = layout.windows.find((w) => w.id === id)
	if (win === undefined || !fits(layout, box, id)) return layout
	if (win.x === box.x && win.y === box.y && win.w === box.w && win.h === box.h) return layout
	return replace(layout, id, (w) => ({ ...w, x: box.x, y: box.y, w: box.w, h: box.h }))
}

/** A new tab for `view` in a window, shown at once. */
export function addTab(layout: Layout, windowId: string, view: ViewId, tabId: string): Layout {
	if (!layout.windows.some((w) => w.id === windowId)) return layout
	return replace(layout, windowId, (w) => ({ ...w, tabs: [...w.tabs, { id: tabId, view }], active: tabId }))
}

/** Take a tab away. The window shows its neighbour, or nothing. */
export function removeTab(layout: Layout, windowId: string, tabId: string): Layout {
	return replace(layout, windowId, (w) => {
		const i = w.tabs.findIndex((t) => t.id === tabId)
		if (i < 0) return w
		const tabs = w.tabs.filter((t) => t.id !== tabId)
		const active = w.active !== tabId ? w.active : (tabs[Math.min(i, tabs.length - 1)]?.id ?? null)
		return { ...w, tabs, active }
	})
}

export function selectTab(layout: Layout, windowId: string, tabId: string): Layout {
	const win = layout.windows.find((w) => w.id === windowId)
	if (win === undefined || win.active === tabId || !win.tabs.some((t) => t.id === tabId)) return layout
	return replace(layout, windowId, (w) => ({ ...w, active: tabId }))
}

/** "Move it here": show `view`'s page in this tab rather than wherever it is. */
export function makeHome(layout: Layout, view: ViewId, tabId: string): Layout {
	return layout.homes[view] === tabId ? layout : { ...layout, homes: { ...layout.homes, [view]: tabId } }
}

// ─── What shows ────────────────────────────────────────────────────────────

/** The tab a window shows, among those `visible` lets through: its own active
 *  tab while that is visible, otherwise its first visible one. A tab hidden
 *  because its connection is off is passed over, not forgotten: on again, the
 *  window shows it again. */
export function shownTab(win: GridWindow, visible: (view: ViewId) => boolean): Tab | null {
	const tabs = win.tabs.filter((t) => visible(t.view))
	return tabs.find((t) => t.id === win.active) ?? tabs[0] ?? null
}

/** The tab `view`'s page is drawn in: the one someone moved it to, while that
 *  tab is showing, otherwise the first window's (in the layout's order) that
 *  shows it. Null when no window shows it. */
export function homeOf(layout: Layout, view: ViewId, visible: (view: ViewId) => boolean): string | null {
	const showing = layout.windows.map((w) => shownTab(w, visible)).filter((t): t is Tab => t !== null && t.view === view)
	const chosen = layout.homes[view]
	return (showing.find((t) => t.id === chosen) ?? showing[0])?.id ?? null
}

/** Every view some window is showing now. */
export function viewsShown(layout: Layout, visible: (view: ViewId) => boolean): ViewId[] {
	return layout.windows.map((w) => shownTab(w, visible)?.view).filter((v): v is ViewId => v !== undefined)
}

// ─── Off storage ───────────────────────────────────────────────────────────

const ID = /^[A-Za-z0-9_-]{1,32}$/

function windowFrom(v: unknown): GridWindow | null {
	if (typeof v !== 'object' || v === null) return null
	const r = v as Record<string, unknown>
	const { id, x, y, w, h, tabs, active } = r
	if (typeof id !== 'string' || !ID.test(id) || !Array.isArray(tabs)) return null
	const box = { x, y, w, h } as Box
	if (!inGrid(box)) return null
	const goodTabs: Tab[] = []
	for (const t of tabs) {
		const tr = t as Record<string, unknown> | null
		if (typeof tr !== 'object' || tr === null) return null
		if (typeof tr['id'] !== 'string' || !ID.test(tr['id']) || !isViewId(tr['view'])) return null
		goodTabs.push({ id: tr['id'], view: tr['view'] })
	}
	const activeId = typeof active === 'string' && goodTabs.some((t) => t.id === active) ? active : (goodTabs[0]?.id ?? null)
	return { id, x: box.x, y: box.y, w: box.w, h: box.h, tabs: goodTabs, active: activeId }
}

/** A layout off this machine's storage. Anything that does not hold (windows
 *  off the grid or over each other, an id used twice) is the default: a layout
 *  that half-loaded could hide the MA. The two slots' layout, from before the
 *  grid, becomes the default's two windows holding what the slots held. */
export function layoutFrom(stored: unknown): Layout {
	let v: unknown = stored
	if (typeof stored === 'string') {
		try {
			v = JSON.parse(stored)
		} catch {
			return DEFAULT_LAYOUT
		}
	}
	if (typeof v !== 'object' || v === null) return DEFAULT_LAYOUT
	const r = v as Record<string, unknown>

	// The slots' layout (until 2026-10-05): { left, right }.
	if (!('windows' in r)) {
		const { left, right } = r
		if (!isViewId(left) || !isViewId(right) || left === right) return DEFAULT_LAYOUT
		const [a, b] = DEFAULT_LAYOUT.windows as [GridWindow, GridWindow]
		return {
			windows: [
				{ ...a, tabs: [{ id: 't1', view: left }] },
				{ ...b, tabs: [{ id: 't2', view: right }] },
			],
			homes: {},
		}
	}

	if (!Array.isArray(r['windows'])) return DEFAULT_LAYOUT
	const windows: GridWindow[] = []
	for (const raw of r['windows']) {
		const w = windowFrom(raw)
		if (w === null) return DEFAULT_LAYOUT
		windows.push(w)
	}
	const ids = [...windows.map((w) => w.id), ...windows.flatMap((w) => w.tabs.map((t) => t.id))]
	if (new Set(ids).size !== ids.length) return DEFAULT_LAYOUT
	const layout: Layout = { windows: [], homes: {} }
	for (const w of windows) {
		if (!fits(layout, w)) return DEFAULT_LAYOUT
		layout.windows.push(w)
	}
	const homes = r['homes']
	if (typeof homes === 'object' && homes !== null) {
		for (const [view, tab] of Object.entries(homes)) {
			if (isViewId(view) && typeof tab === 'string' && ids.includes(tab)) layout.homes[view] = tab
		}
	}
	return layout
}

/** A fresh id for a window or tab, unlike any in `layout`. */
export function freshId(layout: Layout, prefix: 'w' | 't', random: () => number = Math.random): string {
	const taken = new Set([...layout.windows.map((w) => w.id), ...layout.windows.flatMap((w) => w.tabs.map((t) => t.id))])
	for (;;) {
		const id = `${prefix}${Math.floor(random() * 36 ** 6).toString(36)}`
		if (!taken.has(id)) return id
	}
}
