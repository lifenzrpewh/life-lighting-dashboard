// The screen's layout: windows that never overlap, MA3-style, each with tabs
// (the owner, 2026-10-04). It replaces the two slots and their divider.
//
// The owner's decisions:
// - Windows go anywhere, any size (2026-10-05: "freeform with no grid, but
//   keep the logic of the grid so they don't overlap"; the 12 × 8 grid of
//   2026-10-04 snapped every drag to a cell, a twelfth of the width at a
//   time). A dragged edge snaps to the screen's edge or another window's edge
//   when it comes near one, so edges meant to meet meet exactly. Windows never
//   overlap: a native page (the MA, the run order, an embed) cannot be drawn
//   over, and MA3's windows do not overlap either.
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
// a layout whose windows are on the screen and overlap nothing, or returns
// the layout it was given. Nothing off storage is trusted until it passes the
// same test. And the screen never rearranges itself: a view that stops
// answering keeps its tab, which says so in its own place.

import { embedIdOf, type Embed, type EmbedView } from './embeds.js'

/** The views that come with Pāua. */
export type BuiltInView = 'cue' | 'ma' | 'arena' | 'clips' | 'holding' | 'lookbook' | 'video'

/** A built-in view, or an embed someone added in Connections (./embeds.ts). */
export type ViewId = BuiltInView | EmbedView

/** Every built-in view, in the + menu's order. Embeds follow, in theirs. */
export const VIEWS: readonly BuiltInView[] = ['cue', 'ma', 'arena', 'clips', 'holding', 'lookbook', 'video']

export const VIEW_LABEL: Record<BuiltInView, string> = {
	cue: 'Run order',
	ma: 'MA',
	arena: 'Arena',
	/** Arena's clip grid, to fire from (./components/ClipsView.tsx). */
	clips: 'Clips',
	/** The holding layers against today's run sheet, to prepare (./components/HoldingView.tsx). */
	holding: 'Holding',
	/** The run sheet's moments as the lookbook draws them, big, against Arena (./components/LookbookView.tsx). */
	lookbook: 'Lookbook',
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

/** The screen in units, whatever its size in pixels. Fine enough that a drag
 *  follows a finger (a unit is under 2 px on a 1920 screen), and whole numbers,
 *  so two edges that meet are exactly equal: the shared-edge drag finds its
 *  windows by that. A grid layout's cells (until 2026-10-05) are these × 100. */
export const WIDTH = 1200
export const HEIGHT = 800

/** The smallest a window may be, in units: an eighth of the screen each way,
 *  room for a strip of tabs and something under it. */
export const MIN_W = 150
export const MIN_H = 100

/** A place on the screen, in units: left, top, width, height. */
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
	/** In units (2), not a grid's cells: so storage can tell the two apart. */
	v: 2
}

/** The screen as it was before there were windows: the run order on the
 *  left third, the MA on the right two-thirds. */
export const DEFAULT_LAYOUT: Layout = {
	windows: [
		{ id: 'w1', x: 0, y: 0, w: 400, h: 800, tabs: [{ id: 't1', view: 'cue' }], active: 't1' },
		{ id: 'w2', x: 400, y: 0, w: 800, h: 800, tabs: [{ id: 't2', view: 'ma' }], active: 't2' },
	],
	homes: {},
	v: 2,
}

// ─── Geometry ──────────────────────────────────────────────────────────────

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const onScreen = (b: Box) =>
	[b.x, b.y, b.w, b.h].every(Number.isInteger) &&
	b.x >= 0 &&
	b.y >= 0 &&
	b.w >= MIN_W &&
	b.h >= MIN_H &&
	b.x + b.w <= WIDTH &&
	b.y + b.h <= HEIGHT

/** Whether `box` may be where it is: on the screen, big enough, and over no
 *  other window. `self` is the window being moved, which may overlap itself. */
export function fits(layout: Layout, box: Box, self: string | null = null): boolean {
	return onScreen(box) && layout.windows.every((w) => w.id === self || !overlaps(w, box))
}

/** The lines along one axis an edge may come to rest on: the screen's two
 *  edges and both edges of every window but `self`. */
function linesOf(layout: Layout, axis: 'x' | 'y', self: string | null): number[] {
	const out = new Set([0, axis === 'x' ? WIDTH : HEIGHT])
	for (const w of layout.windows) {
		if (w.id === self) continue
		out.add(axis === 'x' ? w.x : w.y)
		out.add(axis === 'x' ? w.x + w.w : w.y + w.h)
	}
	return [...out].sort((a, b) => a - b)
}

/** The line nearest `v` within `tol`, or null: a magnet, not a grid. */
export function snapLine(v: number, lines: readonly number[], tol: number): number | null {
	let best: number | null = null
	for (const l of lines) if (Math.abs(l - v) <= tol && (best === null || Math.abs(l - v) < Math.abs(best - v))) best = l
	return best
}

/** Which edges a drag moves. All four is the whole window. */
export type Edges = { l: boolean; r: boolean; t: boolean; b: boolean }
export const MOVE: Edges = { l: true, r: true, t: true, b: true }

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)
const crosses = (a: Box, b: Box, axis: 'x' | 'y') =>
	axis === 'x' ? a.y < b.y + b.h && b.y < a.y + a.h : a.x < b.x + b.w && b.x < a.x + a.w

/** One axis of a resize: the moving edge where the drag puts it, snapped to a
 *  line within `tol`, kept on the screen and at least the smallest size. */
function resizeAxis(box: Box, from: Box, lo: boolean, hi: boolean, d: number, lines: readonly number[], tol: number, axis: 'x' | 'y'): Box {
	const [p, s, min, max] = axis === 'x' ? (['x', 'w', MIN_W, WIDTH] as const) : (['y', 'h', MIN_H, HEIGHT] as const)
	const end = from[p] + from[s]
	if (lo) {
		const raw = clamp(from[p] + d, 0, end - min)
		const at = snapLine(raw, lines, tol)
		const start = at !== null && at <= end - min ? at : raw
		return { ...box, [p]: start, [s]: end - start }
	}
	if (hi) {
		const raw = clamp(end + d, from[p] + min, max)
		const at = snapLine(raw, lines, tol)
		const stop = at !== null && at >= from[p] + min ? at : raw
		return { ...box, [s]: stop - from[p] }
	}
	return box
}

/** A resized edge stopped flush against the first window in its way, along
 *  `axis`. The windows in the way are those across from the box now and on
 *  the far side of where the edge started. */
function stopAxis(layout: Layout, id: string, box: Box, from: Box, lo: boolean, hi: boolean, axis: 'x' | 'y'): Box {
	const [p, s] = axis === 'x' ? (['x', 'w'] as const) : (['y', 'h'] as const)
	const others = layout.windows.filter((w) => w.id !== id && crosses(w, box, axis))
	if (lo) {
		const limit = Math.max(0, ...others.filter((w) => w[p] + w[s] <= from[p]).map((w) => w[p] + w[s]))
		if (box[p] >= limit) return box
		return { ...box, [p]: limit, [s]: box[p] + box[s] - limit }
	}
	if (hi) {
		const limit = Math.min(axis === 'x' ? WIDTH : HEIGHT, ...others.filter((w) => w[p] >= from[p] + from[s]).map((w) => w[p]))
		if (box[p] + box[s] <= limit) return box
		return { ...box, [s]: limit - box[p] }
	}
	return box
}

/** Where window `id` goes when `edges` of `start` are dragged by `dx`, `dy`
 *  units. The drag follows the finger, and an edge within `tol` units of the
 *  screen's edge or another window's snaps onto it. A resized edge stops flush
 *  against a window in its way rather than going over it. A moved window is
 *  not stopped: where it would land on another, `fits` says no and the caller
 *  shows it refused. */
export function dragBox(layout: Layout, id: string, start: Box, edges: Edges, dx: number, dy: number, tol: { x: number; y: number }): Box {
	const from = { x: start.x, y: start.y, w: start.w, h: start.h }
	const xs = linesOf(layout, 'x', id)
	const ys = linesOf(layout, 'y', id)
	if (edges.l && edges.r && edges.t && edges.b) {
		/** The nearer snap of either edge, as a shift. */
		const shift = (start: number, size: number, lines: readonly number[], t: number) => {
			const a = snapLine(start, lines, t)
			const b = snapLine(start + size, lines, t)
			const da = a === null ? null : a - start
			const db = b === null ? null : b - (start + size)
			if (da === null) return db ?? 0
			if (db === null) return da
			return Math.abs(da) <= Math.abs(db) ? da : db
		}
		let x = clamp(from.x + dx, 0, WIDTH - from.w)
		let y = clamp(from.y + dy, 0, HEIGHT - from.h)
		x = clamp(x + shift(x, from.w, xs, tol.x), 0, WIDTH - from.w)
		y = clamp(y + shift(y, from.h, ys, tol.y), 0, HEIGHT - from.h)
		return { x, y, w: from.w, h: from.h }
	}
	const sized = resizeAxis(resizeAxis(from, from, edges.l, edges.r, dx, xs, tol.x, 'x'), from, edges.t, edges.b, dy, ys, tol.y, 'y')
	// A corner moves both ways: stop one axis, then the other, whichever order
	// lands somewhere that fits.
	const xFirst = stopAxis(layout, id, stopAxis(layout, id, sized, from, edges.l, edges.r, 'x'), from, edges.t, edges.b, 'y')
	if (fits(layout, xFirst, id)) return xFirst
	const yFirst = stopAxis(layout, id, stopAxis(layout, id, sized, from, edges.t, edges.b, 'y'), from, edges.l, edges.r, 'x')
	return fits(layout, yFirst, id) ? yFirst : sized
}

/** The biggest free place on the screen, or null when there is no room for
 *  even the smallest window. Ties go to the top-left. The biggest free place
 *  always has each edge on the screen's or a window's, so only those lines are
 *  tried. */
export function freeBox(layout: Layout): Box | null {
	const xs = linesOf(layout, 'x', null)
	const ys = linesOf(layout, 'y', null)
	let best: Box | null = null
	for (const [i, y] of ys.entries()) {
		for (const [j, x] of xs.entries()) {
			for (const y2 of ys.slice(i + 1)) {
				for (const x2 of xs.slice(j + 1)) {
					const box = { x, y, w: x2 - x, h: y2 - y }
					if (best !== null && box.w * box.h <= best.w * best.h) continue
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

/** Drag a tab (Edit layout, the owner's ask, 2026-10-05: reorganise without
 *  removing and adding): to before `beforeTabId` in `toWindow`, or its end
 *  when null, in the same window or another. It keeps its id, so a page whose
 *  home it is goes with it, and it is shown where it lands. The window it
 *  left shows its neighbour. */
export function moveTab(layout: Layout, fromWindow: string, tabId: string, toWindow: string, beforeTabId: string | null): Layout {
	const from = layout.windows.find((w) => w.id === fromWindow)
	const tab = from?.tabs.find((t) => t.id === tabId)
	const to = layout.windows.find((w) => w.id === toWindow)
	if (from === undefined || tab === undefined || to === undefined || beforeTabId === tabId) return layout
	if (beforeTabId !== null && !to.tabs.some((t) => t.id === beforeTabId)) return layout
	const taken = fromWindow === toWindow ? layout : removeTab(layout, fromWindow, tabId)
	const next = replace(taken, toWindow, (w) => {
		const rest = w.tabs.filter((t) => t.id !== tabId)
		const at = beforeTabId === null ? rest.length : rest.findIndex((t) => t.id === beforeTabId)
		return { ...w, tabs: [...rest.slice(0, at), tab, ...rest.slice(at)], active: tabId }
	})
	const same = (a: Layout, b: Layout) => JSON.stringify(a.windows) === JSON.stringify(b.windows)
	return same(next, layout) ? layout : next
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

/** A window off storage, its place × `scale`: 100 for a grid layout's cells. */
function windowFrom(v: unknown, scale: number): GridWindow | null {
	if (typeof v !== 'object' || v === null) return null
	const r = v as Record<string, unknown>
	const { id, x, y, w, h, tabs, active } = r
	if (typeof id !== 'string' || !ID.test(id) || !Array.isArray(tabs)) return null
	if (![x, y, w, h].every(Number.isInteger)) return null
	const box = { x: (x as number) * scale, y: (y as number) * scale, w: (w as number) * scale, h: (h as number) * scale }
	if (!onScreen(box)) return null
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
 *  off the screen or over each other, an id used twice) is the default: a
 *  layout that half-loaded could hide the MA. The two slots' layout, from
 *  before windows, becomes the default's two windows holding what the slots
 *  held; a grid layout's cells (no `v`) become units, each window where it
 *  was. */
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
			v: 2,
		}
	}

	if (!Array.isArray(r['windows'])) return DEFAULT_LAYOUT
	// The 12 × 8 grid's layout (2026-10-04 to 2026-10-05) has no `v`.
	const scale = r['v'] === 2 ? 1 : WIDTH / 12
	const windows: GridWindow[] = []
	for (const raw of r['windows']) {
		const w = windowFrom(raw, scale)
		if (w === null) return DEFAULT_LAYOUT
		windows.push(w)
	}
	const ids = [...windows.map((w) => w.id), ...windows.flatMap((w) => w.tabs.map((t) => t.id))]
	if (new Set(ids).size !== ids.length) return DEFAULT_LAYOUT
	const layout: Layout = { windows: [], homes: {}, v: 2 }
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

// ─── Saved layouts ─────────────────────────────────────────────────────────
//
// Named layouts on this machine (the owner, 2026-10-04): everyone may switch
// between them, from the status bar; saving and deleting is arranging, so
// operator mode's. A saved layout keeps its windows, their tabs and which tab
// shows.

export type SavedLayout = { name: string; layout: Layout }

export const LAYOUT_NAME_MAX = 24
export const SAVED_LAYOUTS_MAX = 12

/** Why `name` will not do, or null. */
export function layoutNameError(name: string): string | null {
	if (name.trim() === '') return 'A name is needed.'
	if (name.trim().length > LAYOUT_NAME_MAX) return `At most ${LAYOUT_NAME_MAX} characters.`
	if (/[\u0000-\u001f\u007f]/.test(name)) return 'Letters, numbers and punctuation only.'
	return null
}

/** Save `layout` as `name`, replacing one of the same name (any case), in
 *  place. Null when the list is full and the name is new. */
export function saveLayout(saved: readonly SavedLayout[], name: string, layout: Layout): SavedLayout[] | null {
	const n = name.trim()
	const i = saved.findIndex((s) => s.name.toLowerCase() === n.toLowerCase())
	if (i >= 0) return saved.map((s, j) => (j === i ? { name: n, layout } : s))
	if (saved.length >= SAVED_LAYOUTS_MAX) return null
	return [...saved, { name: n, layout }]
}

export function deleteLayout(saved: readonly SavedLayout[], name: string): SavedLayout[] {
	return saved.filter((s) => s.name !== name)
}

/** Whether two layouts are the same arrangement: the same windows in the same
 *  places with the same tabs. Which tab shows is not compared, so switching a
 *  tab still reads as the layout it came from. */
export function sameArrangement(a: Layout, b: Layout): boolean {
	const key = (l: Layout) =>
		JSON.stringify(
			l.windows
				.map((w) => [w.x, w.y, w.w, w.h, w.tabs.map((t) => t.view)])
				.sort((p, q) => (p[1] as number) - (q[1] as number) || (p[0] as number) - (q[0] as number)),
		)
	return key(a) === key(b)
}

/** The saved layouts off this machine's storage. A layout that does not hold
 *  is dropped on its own; the rest stay. */
export function savedLayoutsFrom(stored: unknown): SavedLayout[] {
	if (typeof stored !== 'string') return []
	let v: unknown
	try {
		v = JSON.parse(stored)
	} catch {
		return []
	}
	if (!Array.isArray(v)) return []
	const out: SavedLayout[] = []
	for (const s of v) {
		if (typeof s !== 'object' || s === null) continue
		const { name, layout } = s as Record<string, unknown>
		if (typeof name !== 'string' || layoutNameError(name) !== null) continue
		if (out.some((o) => o.name.toLowerCase() === name.trim().toLowerCase())) continue
		// layoutFrom falls back to the default for anything broken; a saved
		// layout that broke is not the default, so it is dropped instead.
		const l = layoutFrom(layout)
		if (l === DEFAULT_LAYOUT && JSON.stringify(layout) !== JSON.stringify(DEFAULT_LAYOUT)) continue
		out.push({ name: name.trim(), layout: l })
		if (out.length === SAVED_LAYOUTS_MAX) break
	}
	return out
}

// ─── Seams: resizing for everyone ──────────────────────────────────────────
//
// The edge two windows share drags for everyone, volunteers too (the owner,
// 2026-10-05: "the original ability we had to just adjust the windows", the
// divider's). Only the shared edge moves: windows on one side grow as those on
// the other shrink, so nothing is added, removed or moved, and the windows
// still fill what they filled. Arranging stays in Edit layout.

/** A shared edge: the line `at` (upright for 'x', level for 'y'), the windows
 *  ending on it (`before`) and starting on it (`after`), and the stretch of it
 *  they share, in units along the other axis. */
export type Seam = { axis: 'x' | 'y'; at: number; from: number; to: number; before: string[]; after: string[] }

/** Every seam in the layout. Windows meeting on the same line and touching
 *  each other along it move together, so one drag never tears a window off
 *  its neighbour. */
export function seams(layout: Layout): Seam[] {
	const out: Seam[] = []
	for (const axis of ['x', 'y'] as const) {
		const lo = (w: Box) => (axis === 'x' ? w.x : w.y)
		const size = (w: Box) => (axis === 'x' ? w.w : w.h)
		const crossLo = (w: Box) => (axis === 'x' ? w.y : w.x)
		const crossHi = (w: Box) => (axis === 'x' ? w.y + w.h : w.x + w.w)
		// Every line a window starts on, but the screen's own edge.
		for (const at of [...new Set(layout.windows.map(lo))].filter((n) => n > 0).sort((a, b) => a - b)) {
			const before = layout.windows.filter((w) => lo(w) + size(w) === at)
			const after = layout.windows.filter((w) => lo(w) === at)
			const pairs = before.flatMap((a) =>
				after.filter((b) => Math.max(crossLo(a), crossLo(b)) < Math.min(crossHi(a), crossHi(b))).map((b) => [a, b] as const),
			)
			// Pairs sharing a window are one seam.
			const groups: Array<{ before: Set<GridWindow>; after: Set<GridWindow>; pairs: Array<readonly [GridWindow, GridWindow]> }> = []
			for (const pair of pairs) {
				const joined = groups.filter((g) => g.before.has(pair[0]) || g.after.has(pair[1]))
				const group = { before: new Set([pair[0]]), after: new Set([pair[1]]), pairs: [pair] }
				for (const g of joined) {
					g.before.forEach((w) => group.before.add(w))
					g.after.forEach((w) => group.after.add(w))
					group.pairs.push(...g.pairs)
					groups.splice(groups.indexOf(g), 1)
				}
				groups.push(group)
			}
			for (const g of groups) {
				out.push({
					axis,
					at,
					from: Math.min(...g.pairs.map(([a, b]) => Math.max(crossLo(a), crossLo(b)))),
					to: Math.max(...g.pairs.map(([a, b]) => Math.min(crossHi(a), crossHi(b)))),
					before: [...g.before].map((w) => w.id),
					after: [...g.after].map((w) => w.id),
				})
			}
		}
	}
	return out
}

/** How far a seam may go, as the lines it may sit on: no window on it smaller
 *  than MIN_W × MIN_H, and none growing into a window that is not on it. */
export function seamRange(layout: Layout, seam: Seam): { lo: number; hi: number } {
	const axis = seam.axis
	const [p, s] = axis === 'x' ? (['x', 'w'] as const) : (['y', 'h'] as const)
	const min = axis === 'x' ? MIN_W : MIN_H
	const before = layout.windows.filter((w) => seam.before.includes(w.id))
	const after = layout.windows.filter((w) => seam.after.includes(w.id))
	const others = layout.windows.filter((w) => !seam.before.includes(w.id) && !seam.after.includes(w.id))
	// A window before the seam grows towards the far side; one after, back.
	const ahead = others.filter((o) => o[p] >= seam.at && before.some((b) => crosses(o, b, axis))).map((o) => o[p])
	const behind = others.filter((o) => o[p] + o[s] <= seam.at && after.some((a) => crosses(o, a, axis))).map((o) => o[p] + o[s])
	return {
		lo: Math.max(...before.map((b) => b[p] + min), ...behind),
		hi: Math.min(...after.map((a) => a[p] + a[s] - min), ...ahead),
	}
}

/** Move a seam towards the line `want`, as far as it may go (`seamRange`), so
 *  a fast drag past the limit still lands on it. */
export function moveSeam(layout: Layout, seam: Seam, want: number): Layout {
	const range = seamRange(layout, seam)
	const to = clamp(Math.round(want), range.lo, range.hi)
	if (to === seam.at) return layout
	const x = seam.axis === 'x'
	const next: Layout = {
		...layout,
		windows: layout.windows.map((w) => {
			if (seam.before.includes(w.id)) return x ? { ...w, w: to - w.x } : { ...w, h: to - w.y }
			if (seam.after.includes(w.id)) return x ? { ...w, x: to, w: w.x + w.w - to } : { ...w, y: to, h: w.y + w.h - to }
			return w
		}),
	}
	const moved = next.windows.filter((w) => seam.before.includes(w.id) || seam.after.includes(w.id))
	return moved.every((w) => fits(next, w, w.id)) ? next : layout
}
