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
// strip's × removes the window.
//
// OUT OF EDITING, for everyone: tap a tab, and drag the edge two windows share
// (a grip in the gap between them, the one place a page cannot cover) to give
// one more room and the other less, as the old divider did. Pages stand in as
// pictures while it is dragged.

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

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

/** The padding round the windows and the gap between them, in px: the gap is
 *  where a shared edge is grabbed, so it is a finger's width, as the divider
 *  was. */
const PAD = 4
const GAP = 12

/** How near, in px, an edge comes to another before it snaps onto it. */
const SNAP = 16

const label = 'text-[10px] font-semibold tracking-widest uppercase'

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
	onRemoveWindow: (windowId: string) => void
	onPlace: (windowId: string, box: Box) => void
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
				return (
					<section
						key={win.id}
						style={place(box)}
						className={`absolute z-10 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-sm bg-booth-panel ${
							moving === null ? '' : moving.ok ? 'ring-2 ring-booth-ink' : 'ring-2 ring-state-unreachable opacity-80'
						}`}
					>
						<div className="flex h-12 shrink-0 items-center gap-1 border-b border-booth-edge px-1">
							<div role="tablist" className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
								{tabs.map((t) => (
									<span key={t.id} className="flex shrink-0 items-center">
										<button
											type="button"
											role="tab"
											aria-selected={t.id === tab?.id}
											onClick={() => p.onSelect(win.id, t.id)}
											className={`${label} h-10 shrink-0 rounded-md px-3 active:scale-[0.98] ${
												t.id === tab?.id ? 'bg-booth-ink text-booth-bg' : 'text-booth-dim active:bg-booth-edge'
											}`}
										>
											{p.labelOf(t.view)}
										</button>
										{p.editing && (
											<button
												type="button"
												onClick={() => p.onRemoveTab(win.id, t.id)}
												aria-label={`Remove the ${p.labelOf(t.view)} tab`}
												className="h-10 w-8 shrink-0 rounded-md text-booth-dim active:bg-booth-edge"
											>
												×
											</button>
										)}
									</span>
								))}
								{tabs.length === 0 && !p.editing && <span className={`${label} px-3 text-booth-dim`}>Empty</span>}
							</div>
							{p.editing && (
								<button
									type="button"
									onClick={() => setAdding(adding === win.id ? null : win.id)}
									aria-label="Add a tab"
									aria-expanded={adding === win.id}
									className="h-10 w-10 shrink-0 rounded-md border border-booth-edge text-lg text-booth-dim active:bg-booth-edge"
								>
									+
								</button>
							)}
							<span className="ml-auto" />
							{!p.editing && tab !== null && p.actions(win, tab)}
							{p.editing && (
								<button
									type="button"
									onClick={() => p.onRemoveWindow(win.id)}
									aria-label="Remove this window"
									className="h-10 shrink-0 rounded-md border border-booth-edge px-3 text-xs text-booth-dim active:bg-booth-edge"
								>
									Remove window
								</button>
							)}
						</div>
						<div ref={tab === null ? undefined : p.boxRef(win, tab)} className="relative flex min-h-0 min-w-0 flex-1 bg-booth-bg">
							{tab === null ? (
								<div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-booth-dim">
									{win.tabs.length === 0
										? p.editing
											? 'Tap + to put a view here, or remove this window.'
											: 'Nothing here. In operator mode, Edit layout puts a view here.'
										: 'Its views are turned off in Connections.'}
								</div>
							) : (
								p.body(win, tab)
							)}
							{p.editing && (
								<>
									{/* The body moves the window; its edges resize it. */}
									<div
										{...handle(win, MOVE)}
										className="absolute inset-0 flex cursor-move touch-none items-end justify-center bg-booth-bg/40 pb-6"
									>
										<span className="rounded-md bg-booth-panel px-4 py-2 text-xs text-booth-dim">
											Drag to move · drag an edge to resize
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
								className={`rounded-full ${upright ? 'h-12 w-1.5' : 'h-1.5 w-12'} ${
									dragging ? 'bg-booth-ink' : 'bg-booth-edge group-hover:bg-booth-dim'
								}`}
							/>
						</div>
					)
				})}
		</div>
	)
}

const seamKey = (seam: Seam) => `${seam.axis}:${seam.before.join(',')}|${seam.after.join(',')}`

/** Bands along each edge and squares at each corner, big enough for a finger. */
function EdgeHandles({ win, handle }: { win: GridWindow; handle: (win: GridWindow, edges: Edges) => object }) {
	const band = 'absolute touch-none bg-booth-ink/0 hover:bg-booth-ink/20 active:bg-booth-ink/30'
	const e = (l: boolean, r: boolean, t: boolean, b: boolean): Edges => ({ l, r, t, b })
	return (
		<>
			<div {...handle(win, e(true, false, false, false))} className={`${band} inset-y-6 left-0 w-5 cursor-ew-resize`} />
			<div {...handle(win, e(false, true, false, false))} className={`${band} inset-y-6 right-0 w-5 cursor-ew-resize`} />
			<div {...handle(win, e(false, false, true, false))} className={`${band} inset-x-6 top-0 h-5 cursor-ns-resize`} />
			<div {...handle(win, e(false, false, false, true))} className={`${band} inset-x-6 bottom-0 h-5 cursor-ns-resize`} />
			<div {...handle(win, e(true, false, true, false))} className={`${band} top-0 left-0 size-6 cursor-nwse-resize`} />
			<div {...handle(win, e(false, true, true, false))} className={`${band} top-0 right-0 size-6 cursor-nesw-resize`} />
			<div {...handle(win, e(true, false, false, true))} className={`${band} bottom-0 left-0 size-6 cursor-nesw-resize`} />
			<div {...handle(win, e(false, true, false, true))} className={`${band} right-0 bottom-0 size-6 cursor-nwse-resize`} />
		</>
	)
}

/** + : every view that may be on screen. */
function AddMenu({ offer, labelOf, onPick }: { offer: readonly ViewId[]; labelOf: (v: ViewId) => string; onPick: (v: ViewId) => void }) {
	return (
		<div className="absolute top-2 left-2 z-20 flex max-h-[calc(100%-1rem)] w-56 flex-col overflow-y-auto rounded-md border border-booth-edge bg-booth-panel py-1 shadow-lg">
			{offer.map((v) => (
				<button key={v} type="button" onClick={() => onPick(v)} className="h-12 shrink-0 px-4 text-left text-sm active:bg-booth-edge">
					{labelOf(v)}
				</button>
			))}
		</div>
	)
}
