// The windows on the screen (../../shared/layout.ts): each with a strip of tabs
// and a body its view fills.
//
// A native page (the MA, the run order, an embed) is drawn by main over the
// body of the one tab that is its home, so the strip above is the only part of
// a window that page cannot cover. That is why the tabs and the view's own
// buttons live in it.
//
// EDITING (operator mode, behind Edit layout): every page stands in as a
// picture of itself, so the windows can be drawn over. Drag a window's body to
// move it, its edges or corners to resize it. The drag follows the finger; an
// edge near the screen's edge or another window's snaps onto it, a resized
// edge stops flush against a window in its way, and a move onto another window
// is shown in red and not taken. + adds a tab, × takes one away, and the
// strip's × removes the window. A tab is dragged along its strip to reorder
// it, or onto another window to move it there (the owner, 2026-10-05: "don't
// have to delete them to allow them to be reorganised"); a nacre bar shows
// where it will land.
//
// OUT OF EDITING, for everyone: tap a tab, and drag the edge two windows share
// (a grip in the gap between them, the one place a page cannot cover) to give
// one more room and the other less, as the old divider did. Pages stand in as
// pictures while it is dragged.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Move, PanelTop, Plus, Trash2, X } from 'lucide-react'

import {
	HEIGHT,
	MOVE,
	WIDTH,
	dragBox,
	fits,
	moveSeam,
	seams,
	shownTab,
	snapLine,
	type Box,
	type Edges,
	type GridWindow,
	type Layout,
	type Seam,
	type Tab,
	type ViewId,
} from '../../shared/layout.js'
import { Button, IconButton, Placeholder, viewIcon } from './ui.js'

/** The padding round the windows and the gap between them, in px: the gap is
 *  where a shared edge is grabbed, so it is a finger's width, as the divider
 *  was. */
const PAD = 4
const GAP = 12

/** How near, in px, an edge comes to another before it snaps onto it. */
const SNAP = 16

/** Units along one axis as CSS, inside the padding: a window at 0 starts at
 *  the padding, one ending at the far edge ends at it, and two that meet are a
 *  gap apart. `less` takes the gap off a size. */
const INNER = `(100% + ${GAP - 2 * PAD}px)`
const along = (units: number, total: number, less = 0) => `calc(${PAD}px + ${INNER} * ${units / total} - ${less}px)`
const span = (units: number, total: number) => `calc(${INNER} * ${units / total} - ${GAP}px)`
const place = (b: Box) => ({ left: along(b.x, WIDTH), top: along(b.y, HEIGHT), width: span(b.w, WIDTH), height: span(b.h, HEIGHT) })

/** Px per unit across and down, from the screen's size now. */
function scaleOf(el: HTMLElement): { x: number; y: number } {
	const r = el.getBoundingClientRect()
	return { x: (r.width - 2 * PAD + GAP) / WIDTH, y: (r.height - 2 * PAD + GAP) / HEIGHT }
}

export type GridProps = {
	layout: Layout
	editing: boolean
	/** Whether a view's tab is on screen at all (its connection is on). */
	visible: (view: ViewId) => boolean
	labelOf: (view: ViewId) => string
	/** What + offers, in its order. */
	offer: readonly ViewId[]
	/** What a window's shown tab has in its body. */
	body: (win: GridWindow, tab: Tab) => ReactNode
	/** The body's ref, for the tab a native page is drawn in. */
	boxRef: (win: GridWindow, tab: Tab) => ((el: HTMLElement | null) => void) | undefined
	/** The shown view's own buttons, at the strip's far end. */
	actions: (win: GridWindow, tab: Tab) => ReactNode
	onSelect: (windowId: string, tabId: string) => void
	onAddTab: (windowId: string, view: ViewId) => void
	onRemoveTab: (windowId: string, tabId: string) => void
	/** A tab dragged: to before `beforeTabId` in `toWindow`, or its end. */
	onMoveTab: (fromWindow: string, tabId: string, toWindow: string, beforeTabId: string | null) => void
	onRemoveWindow: (windowId: string) => void
	onPlace: (windowId: string, box: Box) => void
	/** A window just added: its "Add a view" menu opens at once, since an
	 *  empty window is only ever added to be filled. */
	fresh?: string | null
	/** A shared edge was let go here: the whole layout, both sides resized. */
	onResize: (layout: Layout) => void
	/** A shared edge is being dragged: pages stand in as pictures until it ends. */
	onSeamStart: () => void
	onSeamEnd: () => void
}

export function Grid(p: GridProps) {
	const gridRef = useRef<HTMLDivElement>(null)
	const start = useRef<{ id: string; from: Box; px: number; py: number; edges: Edges; scale: { x: number; y: number } } | null>(null)
	const [drag, setDrag] = useState<{ id: string; box: Box; ok: boolean } | null>(null)
	const latest = useRef(drag)
	latest.current = drag
	const [adding, setAdding] = useState<string | null>(null)

	// A tab being dragged (editing only): where it came from, where the pointer
	// is, and where it would land. A press that never moves is a tap.
	const tabStart = useRef<{ win: string; tab: string; px: number; py: number; moved: boolean } | null>(null)
	const [tabDrag, setTabDrag] = useState<{ win: string; tab: string; label: string; x: number; y: number; to: { win: string; before: string | null } | null } | null>(
		null,
	)
	const tabLatest = useRef(tabDrag)
	tabLatest.current = tabDrag
	/** Where a tab let go at (x, y) lands: before the tab under it (after it,
	 *  past its middle), or the end of the window under it. */
	const landing = (x: number, y: number): { win: string; before: string | null } | null => {
		const el = document.elementFromPoint(x, y)
		const overTab = el?.closest<HTMLElement>('[data-tab]')
		if (overTab != null) {
			const win = overTab.dataset['win'] as string
			const r = overTab.getBoundingClientRect()
			if (x < r.left + r.width / 2) return { win, before: overTab.dataset['tab'] as string }
			const next = overTab.nextElementSibling?.closest<HTMLElement>('[data-tab]')
			return { win, before: next?.dataset['tab'] ?? null }
		}
		const overWin = el?.closest<HTMLElement>('[data-win]')
		return overWin == null ? null : { win: overWin.dataset['win'] as string, before: null }
	}
	const tabHandle = (win: GridWindow, t: Tab) =>
		!p.editing
			? {}
			: {
					onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
						e.currentTarget.setPointerCapture(e.pointerId)
						tabStart.current = { win: win.id, tab: t.id, px: e.clientX, py: e.clientY, moved: false }
					},
					onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
						const s = tabStart.current
						if (s === null) return
						if (!s.moved && Math.hypot(e.clientX - s.px, e.clientY - s.py) < 8) return
						s.moved = true
						setTabDrag({ win: s.win, tab: s.tab, label: p.labelOf(t.view), x: e.clientX, y: e.clientY, to: landing(e.clientX, e.clientY) })
					},
					onPointerUp: () => {
						const d = tabLatest.current
						if (d !== null && d.to !== null) p.onMoveTab(d.win, d.tab, d.to.win, d.to.before)
						setTabDrag(null)
						// The click that follows a drag is not a tap; the next one is.
						setTimeout(() => (tabStart.current = null), 0)
					},
					onPointerCancel: () => {
						tabStart.current = null
						setTabDrag(null)
					},
				}
	/** A tap on a tab selects it; the end of a drag does not. */
	const dragged = () => tabStart.current?.moved === true
	useEffect(() => {
		if (p.fresh != null) setAdding(p.fresh)
	}, [p.fresh])

	// A shared edge being dragged, and the layout it would make.
	const seamStart = useRef<{ seam: Seam; at: number; scale: number } | null>(null)
	const [seamDrag, setSeamDrag] = useState<Layout | null>(null)
	const seamLatest = useRef(seamDrag)
	seamLatest.current = seamDrag
	const shown = seamDrag ?? p.layout
	/** A seam drag over: keep where it got to, or not. Once only. */
	const endSeam = (keep: boolean) => {
		if (seamStart.current === null) return
		const next = seamLatest.current
		seamStart.current = null
		setSeamDrag(null)
		if (keep && next !== null && next !== p.layout) p.onResize(next)
		p.onSeamEnd()
	}

	/** Pointer handlers for a handle that moves `edges` of `win`. A press keeps
	 *  every move until it lifts (pointer capture), so a drag that runs off the
	 *  handle, or off the window, still lands. */
	const handle = (win: GridWindow, edges: Edges) => ({
		onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
			const grid = gridRef.current
			if (grid === null) return
			e.currentTarget.setPointerCapture(e.pointerId)
			e.stopPropagation()
			const from = { x: win.x, y: win.y, w: win.w, h: win.h }
			start.current = { id: win.id, from, px: e.clientX, py: e.clientY, edges, scale: scaleOf(grid) }
			setDrag({ id: win.id, box: from, ok: true })
		},
		onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
			const s = start.current
			if (s === null) return
			const dx = Math.round((e.clientX - s.px) / s.scale.x)
			const dy = Math.round((e.clientY - s.py) / s.scale.y)
			const box = dragBox(p.layout, s.id, s.from, s.edges, dx, dy, { x: SNAP / s.scale.x, y: SNAP / s.scale.y })
			const d = latest.current
			if (d !== null && d.box.x === box.x && d.box.y === box.y && d.box.w === box.w && d.box.h === box.h) return
			setDrag({ id: s.id, box, ok: fits(p.layout, box, s.id) })
		},
		onPointerUp: () => {
			const d = latest.current
			if (d !== null && d.ok) p.onPlace(d.id, d.box)
			start.current = null
			setDrag(null)
		},
		onPointerCancel: () => {
			start.current = null
			setDrag(null)
		},
	})

	return (
		<div ref={gridRef} className="relative min-h-0 flex-1 bg-booth-bg">
			{shown.windows.map((win) => {
				const tab = shownTab(win, p.visible)
				const tabs = win.tabs.filter((t) => p.visible(t.view))
				const moving = drag?.id === win.id ? drag : null
				const box = moving?.box ?? win
				const target = tabDrag?.to?.win === win.id && tabDrag.win !== win.id
				const ring =
					target
						? 'ring-2 ring-nacre-blue'
						: moving !== null
						? moving.ok
							? 'ring-2 ring-nacre-blue'
							: 'ring-2 ring-state-unreachable'
						: p.editing
							? 'ring-1 ring-nacre-blue/50'
							: 'ring-1 ring-booth-edge'
				return (
					<section
						key={win.id}
						data-win={win.id}
						style={place(box)}
						className={`absolute z-10 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-booth-panel ${ring}`}
					>
						<div className="flex h-12 shrink-0 items-stretch gap-0.5 border-b border-booth-edge bg-booth-strip pr-1.5 pl-1">
							<div role="tablist" className="flex min-w-0 items-stretch overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
								{tabs.map((t) => {
									const on = t.id === tab?.id
									const TabIcon = viewIcon(t.view)
									return (
										<span
											key={t.id}
											data-win={win.id}
											data-tab={t.id}
											className={`relative flex shrink-0 items-center ${tabDrag?.tab === t.id ? 'opacity-40' : ''}`}
										>
											{tabDrag?.to?.win === win.id && tabDrag.to.before === t.id && (
												<span aria-hidden className="nacre-line absolute inset-y-2 -left-0.5 w-1 rounded-full" />
											)}
											<button
												type="button"
												role="tab"
												aria-selected={on}
												onClick={() => !dragged() && p.onSelect(win.id, t.id)}
												{...tabHandle(win, t)}
												title={p.editing ? 'Drag to move this tab' : undefined}
												className={`flex h-full shrink-0 items-center gap-2 px-3.5 text-sm font-medium transition-colors ${p.editing ? 'cursor-grab touch-none' : ''} ${
													on ? 'text-booth-ink' : 'text-booth-dim hover:text-booth-ink'
												}`}
											>
												<TabIcon size={17} strokeWidth={1.8} aria-hidden />
												{p.labelOf(t.view)}
											</button>
											{p.editing && (
												<button
													type="button"
													onClick={() => p.onRemoveTab(win.id, t.id)}
													aria-label={`Remove the ${p.labelOf(t.view)} tab`}
													title={`Remove the ${p.labelOf(t.view)} tab`}
													className="-ml-2 mr-1 grid size-8 shrink-0 place-items-center rounded-md text-booth-dim hover:bg-booth-raise hover:text-booth-ink"
												>
													<X size={15} aria-hidden />
												</button>
											)}
											{on && <span aria-hidden className="nacre-line absolute inset-x-2.5 bottom-0 h-[3px] rounded-t-full" />}
										</span>
									)
								})}
								{tabDrag?.to?.win === win.id && tabDrag.to.before === null && (
									<span aria-hidden className="nacre-line my-2 w-1 shrink-0 rounded-full" />
								)}
								{tabs.length === 0 && !p.editing && <span className="flex items-center px-3.5 text-sm text-booth-dim">Empty</span>}
							</div>
							{p.editing && (
								<span className="flex items-center">
									<IconButton
										icon={Plus}
										size="sm"
										label="Add a tab"
										pressed={adding === win.id}
										onClick={() => setAdding(adding === win.id ? null : win.id)}
									/>
								</span>
							)}
							<span className="ml-auto" />
							<span className="flex items-center gap-1">
								{!p.editing && tab !== null && p.actions(win, tab)}
								{p.editing && (
									<Button size="sm" variant="ghost" icon={Trash2} onClick={() => p.onRemoveWindow(win.id)}>
										Remove window
									</Button>
								)}
							</span>
						</div>
						<div ref={tab === null ? undefined : p.boxRef(win, tab)} className="relative flex min-h-0 min-w-0 flex-1 bg-booth-bg">
							{tab === null ? (
								<div className="flex flex-1 items-center justify-center">
									<Placeholder
										icon={PanelTop}
										head={win.tabs.length === 0 ? 'An empty window' : 'Its views are turned off'}
										body={
											win.tabs.length === 0
												? p.editing
													? 'Tap + in its strip to put a view here, or remove the window.'
													: 'In Admin, Layouts › Edit this layout puts a view here.'
												: 'Turn them on again in Settings.'
										}
									/>
								</div>
							) : (
								p.body(win, tab)
							)}
							{p.editing && (
								<>
									{/* The body moves the window; its edges and corners resize it. */}
									<div
										{...handle(win, MOVE)}
										className={`absolute inset-0 flex cursor-grab touch-none items-end justify-center pb-12 active:cursor-grabbing ${
											moving !== null && !moving.ok ? 'bg-state-unreachable/15' : 'bg-booth-bg/55'
										}`}
									>
										<span className="pointer-events-none flex items-center gap-2.5 rounded-xl bg-booth-raise px-4 py-3 text-sm text-booth-ink shadow-lg ring-1 ring-booth-edge">
											<Move size={19} strokeWidth={1.8} aria-hidden />
											{moving !== null && !moving.ok ? 'Not over another window' : 'Drag to move'}
										</span>
									</div>
									<EdgeHandles win={win} handle={handle} />
								</>
							)}
							{p.editing && adding === win.id && (
								<AddMenu
									offer={p.offer}
									labelOf={p.labelOf}
									onPick={(v) => {
										setAdding(null)
										p.onAddTab(win.id, v)
									}}
								/>
							)}
						</div>
					</section>
				)
			})}
			{tabDrag !== null && (
				<span
					aria-hidden
					style={{ left: tabDrag.x + 12, top: tabDrag.y + 12 }}
					className="pointer-events-none fixed z-50 rounded-lg bg-booth-raise px-3.5 py-2 text-sm font-medium shadow-2xl ring-1 ring-nacre-blue"
				>
					{tabDrag.label}
				</span>
			)}
			{!p.editing &&
				seams(p.layout).map((seam) => {
					const upright = seam.axis === 'x'
					const [total, cross] = upright ? [WIDTH, HEIGHT] : [HEIGHT, WIDTH]
					// Kept while dragged, so the grip keeps its press: `at` moves.
					const key = seamKey(seam)
					const dragging = seamStart.current !== null && seamKey(seamStart.current.seam) === key
					// The dragged grip follows the windows it moves.
					const first = shown.windows.find((w) => w.id === seam.before[0])
					const at = dragging && first !== undefined ? (upright ? first.x + first.w : first.y + first.h) : seam.at
					const line = along(at, total, GAP)
					const from = along(seam.from, cross)
					const length = span(seam.to - seam.from, cross)
					return (
						<div
							key={key}
							role="separator"
							aria-orientation={upright ? 'vertical' : 'horizontal'}
							aria-label="Drag to give one window more room and the other less"
							onPointerDown={(e) => {
								const grid = gridRef.current
								if (grid === null) return
								e.currentTarget.setPointerCapture(e.pointerId)
								const scale = scaleOf(grid)
								seamStart.current = { seam, at: upright ? e.clientX : e.clientY, scale: upright ? scale.x : scale.y }
								setSeamDrag(p.layout)
								p.onSeamStart()
							}}
							onPointerMove={(e) => {
								const s = seamStart.current
								if (s === null) return
								const x = s.seam.axis === 'x'
								const want = s.seam.at + ((x ? e.clientX : e.clientY) - s.at) / s.scale
								// Snaps to the edges of windows not on the seam, so it can
								// line up with them.
								const off = p.layout.windows.filter((w) => !s.seam.before.includes(w.id) && !s.seam.after.includes(w.id))
								const lines = off.flatMap((w) => (x ? [w.x, w.x + w.w] : [w.y, w.y + w.h]))
								const next = moveSeam(p.layout, s.seam, snapLine(want, lines, SNAP / s.scale) ?? want)
								if (next !== seamLatest.current) setSeamDrag(next)
							}}
							onPointerUp={() => endSeam(true)}
							onPointerCancel={() => endSeam(false)}
							// The press taken away (another pointer, the window losing
							// focus): ends where it got to, and never leaves the pages as
							// pictures waiting for a lift that will not come.
							onLostPointerCapture={() => endSeam(true)}
							onContextMenu={(e) => e.preventDefault()}
							style={
								upright
									? { left: line, top: from, width: GAP, height: length }
									: { top: line, left: from, height: GAP, width: length }
							}
							className={`group absolute z-20 flex touch-none items-center justify-center ${upright ? 'cursor-col-resize' : 'cursor-row-resize'}`}
						>
							<span
								className={`rounded-full transition-colors ${upright ? 'h-14 w-1.5' : 'h-1.5 w-14'} ${
									dragging ? 'bg-nacre-blue' : 'bg-booth-faint group-hover:bg-booth-dim group-active:bg-nacre-blue'
								}`}
							/>
						</div>
					)
				})}
		</div>
	)
}

const seamKey = (seam: Seam) => `${seam.axis}:${seam.before.join(',')}|${seam.after.join(',')}`

/** Bands along each edge and squares at each corner, big enough for a
 *  finger, each drawn: a bracket at the corners and a pill mid-edge, so what
 *  can be dragged is seen rather than found by hovering, which a finger
 *  cannot do. */
function EdgeHandles({ win, handle }: { win: GridWindow; handle: (win: GridWindow, edges: Edges) => object }) {
	const band = 'group absolute z-10 touch-none flex items-center justify-center'
	const pill = 'rounded-full bg-nacre-blue/70 transition-colors group-hover:bg-nacre-blue group-active:bg-nacre-blue'
	const corner = 'pointer-events-none absolute size-5 border-nacre-blue/80 transition-colors group-hover:border-nacre-blue'
	const e = (l: boolean, r: boolean, t: boolean, b: boolean): Edges => ({ l, r, t, b })
	return (
		<>
			<div {...handle(win, e(true, false, false, false))} className={`${band} inset-y-10 left-0 w-6 cursor-ew-resize`}>
				<span className={`${pill} h-12 w-1.5`} />
			</div>
			<div {...handle(win, e(false, true, false, false))} className={`${band} inset-y-10 right-0 w-6 cursor-ew-resize`}>
				<span className={`${pill} h-12 w-1.5`} />
			</div>
			<div {...handle(win, e(false, false, true, false))} className={`${band} inset-x-10 top-0 h-6 cursor-ns-resize`}>
				<span className={`${pill} h-1.5 w-12`} />
			</div>
			<div {...handle(win, e(false, false, false, true))} className={`${band} inset-x-10 bottom-0 h-6 cursor-ns-resize`}>
				<span className={`${pill} h-1.5 w-12`} />
			</div>
			<div {...handle(win, e(true, false, true, false))} className={`${band} top-0 left-0 size-10 cursor-nwse-resize`}>
				<span className={`${corner} top-1.5 left-1.5 rounded-tl-md border-t-4 border-l-4`} />
			</div>
			<div {...handle(win, e(false, true, true, false))} className={`${band} top-0 right-0 size-10 cursor-nesw-resize`}>
				<span className={`${corner} top-1.5 right-1.5 rounded-tr-md border-t-4 border-r-4`} />
			</div>
			<div {...handle(win, e(true, false, false, true))} className={`${band} bottom-0 left-0 size-10 cursor-nesw-resize`}>
				<span className={`${corner} bottom-1.5 left-1.5 rounded-bl-md border-b-4 border-l-4`} />
			</div>
			<div {...handle(win, e(false, true, false, true))} className={`${band} right-0 bottom-0 size-10 cursor-nwse-resize`}>
				<span className={`${corner} right-1.5 bottom-1.5 rounded-br-md border-r-4 border-b-4`} />
			</div>
		</>
	)
}

/** + : every view that may be on screen, each with its icon. */
function AddMenu({ offer, labelOf, onPick }: { offer: readonly ViewId[]; labelOf: (v: ViewId) => string; onPick: (v: ViewId) => void }) {
	return (
		<div className="absolute top-2 left-2 z-20 flex max-h-[calc(100%-1rem)] w-64 animate-rise flex-col overflow-y-auto rounded-xl bg-booth-raise p-1.5 shadow-2xl ring-1 ring-booth-edge">
			<span className="px-3 pt-2 pb-1.5 text-xs font-medium text-booth-dim">Add a view</span>
			{offer.map((v) => {
				const ViewIcon = viewIcon(v)
				return (
					<button
						key={v}
						type="button"
						onClick={() => onPick(v)}
						className="flex h-12 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-booth-hover active:bg-booth-hover"
					>
						<ViewIcon size={18} strokeWidth={1.8} className="text-booth-dim" aria-hidden />
						{labelOf(v)}
					</button>
				)
			})}
		</div>
	)
}
