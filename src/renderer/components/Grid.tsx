// The windows on the screen (../../shared/layout.ts): each with a strip of tabs
// and a body its view fills.
//
// A native page (the MA, the run order, an embed) is drawn by main over the
// body of the one tab that is its home, so the strip above is the only part of
// a window that page cannot cover. That is why the tabs and the view's own
// buttons live in it.
//
// EDITING (Edit layout, for everyone since 2026-10-08, the owner's ask: a
// layout touches nothing on the show, so a volunteer may arrange one; started
// from the pencil at the end of any window's strip, ended by Done in the bar
// above): every page stands in as a picture of itself, so the windows can be
// drawn over. Drag a window's body to
// move it, its edges or corners to resize it. The drag follows the finger; an
// edge near the screen's edge or another window's snaps onto it, a resized
// edge stops flush against a window in its way, and a move onto another window
// is shown in red and not taken. + adds a tab, × takes one away, and the
// strip's × removes the window. A tab is dragged along its strip to reorder
// it, or onto another window to move it there (the owner, 2026-10-05: "don't
// have to delete them to allow them to be reorganised"); a blue bar shows
// where it will land.
//
// NAMING, in or out of editing: a double tap on a tab names it in this layout
// (2026-10-08, the owner's ask: "Stage cam" rather than "Video"; a double tap
// rather than a pencil on each tab since 2026-10-11, the owner: the pencils
// were unneeded and crowded the strip); emptied, it takes its view's own name
// again. The double tap is counted from two clicks, not `dblclick`, so a
// finger on the booth screen gets it whatever the touch emulation does.
//
// OUT OF EDITING, for everyone: tap a tab, and drag the edge two windows share
// (a grip in the gap between them, the one place a page cannot cover) to give
// one more room and the other less, as the old divider did. Pages stand in as
// pictures while it is dragged.
//
// BARE (Show mode, ../showMode.ts): no strips and no edge grips. Each window
// is its shown tab's body alone, so a page takes the strip's room, and nothing
// on the windows can be changed.

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Check, Move, PanelTop, Pencil, Plus, Trash2, X } from 'lucide-react'

/** Two taps on one tab this close together, in ms, are a double tap. */
const DOUBLE_TAP = 450

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
	TAB_LABEL_MAX,
	tabTitle,
	tabView,
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
	/** Show mode: no strips, no edge grips, nothing to change. */
	bare?: boolean
	/** Whether a tab is on screen at all (its connection is on). */
	visible: (tab: Tab) => boolean
	/** A view's name, for + . */
	labelOf: (view: ViewId) => string
	/** A tab's name without one of its own: its view's, or its feed's. */
	nameOf: (tab: Tab) => string
	/** What + offers, in its order. */
	offer: readonly ViewId[]
	/** What a window's shown tab has in its body. */
	body: (win: GridWindow, tab: Tab) => ReactNode
	/** The body's ref, for the tab a native page is drawn in. */
	boxRef: (win: GridWindow, tab: Tab) => ((el: HTMLElement | null) => void) | undefined
	/** The shown view's own buttons, at the strip's far end. */
	actions: (win: GridWindow, tab: Tab) => ReactNode
	onSelect: (windowId: string, tabId: string) => void
	/** A window's pencil: the whole screen into Edit layout. */
	onEdit: () => void
	onAddTab: (windowId: string, view: ViewId) => void
	onRemoveTab: (windowId: string, tabId: string) => void
	/** A tab named in this layout; empty gives it its view's name back. */
	onRenameTab: (windowId: string, tabId: string, label: string) => void
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
	// The tab being named, and what has been typed so far.
	const [naming, setNaming] = useState<{ win: string; tab: string; text: string } | null>(null)
	// The last tap on a tab, for a double tap.
	const lastTap = useRef<{ tab: string; at: number } | null>(null)
	const titleOf = (t: Tab) => tabTitle(t, p.nameOf)
	const endNaming = (keep: boolean) => {
		if (naming !== null && keep) p.onRenameTab(naming.win, naming.tab, naming.text)
		setNaming(null)
	}
	useEffect(() => setNaming(null), [p.editing])
	/** A tap on a tab shows it; a second soon after on the same tab names it. */
	const tapTab = (win: GridWindow, t: Tab) => {
		const now = Date.now()
		const last = lastTap.current
		if (last !== null && last.tab === t.id && now - last.at < DOUBLE_TAP) {
			lastTap.current = null
			setNaming({ win: win.id, tab: t.id, text: t.label ?? '' })
			return
		}
		lastTap.current = { tab: t.id, at: now }
		p.onSelect(win.id, t.id)
	}

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
						setTabDrag({ win: s.win, tab: s.tab, label: titleOf(t), x: e.clientX, y: e.clientY, to: landing(e.clientX, e.clientY) })
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
				const tabs = win.tabs.filter(p.visible)
				const moving = drag?.id === win.id ? drag : null
				const box = moving?.box ?? win
				const target = tabDrag?.to?.win === win.id && tabDrag.win !== win.id
				const ring =
					target
						? 'ring-2 ring-accent-hi'
						: moving !== null
						? moving.ok
							? 'ring-2 ring-accent-hi'
							: 'ring-2 ring-state-unreachable'
						: p.editing
							? 'ring-2 ring-accent-hi/60'
							: ''
				return (
					<section
						key={win.id}
						data-win={win.id}
						style={place(box)}
						className={`absolute z-10 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-win bg-booth-panel ${ring}`}
					>
						{!p.bare && (
							<div className="flex h-14 shrink-0 items-center gap-1 bg-booth-strip px-2">
								<div role="tablist" className="relative flex h-full min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
									<TabFill on={tab?.id ?? null} tabs={`${p.editing}|${naming?.tab ?? ''}|${tabs.map((t) => `${t.id}:${titleOf(t)}`).join('|')}`} />
									{tabs.map((t) => {
										const on = t.id === tab?.id
										const TabIcon = viewIcon(tabView(t))
										return (
											<span
												key={t.id}
												data-win={win.id}
												data-tab={t.id}
												data-tab-button={on ? 'on' : undefined}
												className={`relative flex h-10 shrink-0 items-center rounded-ctl ${tabDrag?.tab === t.id ? 'opacity-40' : ''}`}
											>
												{tabDrag?.to?.win === win.id && tabDrag.to.before === t.id && (
													<span aria-hidden className="absolute inset-y-2 -left-1 w-1 rounded-full bg-accent-hi" />
												)}
												{naming?.tab === t.id ? (
													<form
														className="flex h-full shrink-0 items-center gap-1.5 pr-1 pl-3"
														onSubmit={(e) => {
															e.preventDefault()
															endNaming(true)
														}}
													>
														<TabIcon size={17} strokeWidth={2} className={on ? 'text-accent-ink' : 'text-booth-dim'} aria-hidden />
														<input
															autoFocus
															value={naming.text}
															maxLength={TAB_LABEL_MAX}
															placeholder={p.nameOf(t)}
															aria-label={`Name the ${titleOf(t)} tab; empty for ${p.nameOf(t)}`}
															onChange={(e) => setNaming({ ...naming, text: e.target.value })}
															onKeyDown={(e) => e.key === 'Escape' && endNaming(false)}
															onBlur={() => endNaming(true)}
															className="h-8 w-40 rounded-ctl bg-booth-bg px-2.5 text-sm font-medium text-booth-ink ring-1 ring-accent-hi outline-none placeholder:text-booth-faint"
														/>
														<IconButton icon={Check} size="sm" label="Keep this name" onClick={() => endNaming(true)} />
													</form>
												) : (
													<button
														type="button"
														role="tab"
														aria-selected={on}
														onClick={() => !dragged() && tapTab(win, t)}
														{...tabHandle(win, t)}
														title={p.editing ? 'Drag to move this tab; double-tap to name it' : 'Double-tap to name this tab'}
														className={`relative flex h-10 shrink-0 items-center gap-2 rounded-ctl text-sm font-bold transition-[color,background-color,transform] duration-150 active:scale-95 ${p.editing ? 'cursor-grab touch-none pr-1.5 pl-4' : 'px-4'} ${
															on ? 'text-accent-ink' : 'text-booth-dim hover:bg-booth-raise hover:text-booth-ink'
														}`}
													>
														<TabIcon size={17} strokeWidth={2} aria-hidden />
														{titleOf(t)}
													</button>
												)}
												{p.editing && naming?.tab !== t.id && (
													<button
														type="button"
														onClick={() => p.onRemoveTab(win.id, t.id)}
														aria-label={`Remove the ${titleOf(t)} tab`}
														title={`Remove the ${titleOf(t)} tab`}
														className={`relative mr-1 grid size-8 shrink-0 place-items-center rounded-ctl ${
															on ? 'text-accent-ink/75 hover:bg-black/15 hover:text-accent-ink' : 'text-booth-dim hover:bg-booth-raise hover:text-booth-ink'
														}`}
													>
														<X size={15} aria-hidden />
													</button>
												)}
											</span>
										)
									})}
									{tabDrag?.to?.win === win.id && tabDrag.to.before === null && (
										<span aria-hidden className="my-2 h-8 w-1 shrink-0 rounded-full bg-accent-hi" />
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
									{!p.editing && <IconButton icon={Pencil} size="sm" label="Edit the layout: move, resize and add windows and tabs" onClick={p.onEdit} />}
									{p.editing && (
										<Button size="sm" variant="ghost" icon={Trash2} onClick={() => p.onRemoveWindow(win.id)}>
											Remove window
										</Button>
									)}
								</span>
							</div>
						)}
						<div ref={tab === null ? undefined : p.boxRef(win, tab)} className="relative flex min-h-0 min-w-0 flex-1 bg-booth-panel">
							{tab === null ? (
								<div className="flex flex-1 items-center justify-center">
									<Placeholder
										icon={PanelTop}
										head={win.tabs.length === 0 ? 'An empty window' : 'Its views are turned off'}
										body={
											win.tabs.length === 0
												? p.editing
													? 'Tap + in its strip to put a view here, or remove the window.'
													: p.bare
												? 'Show mode is on. Leave it to change the layout.'
												: 'The pencil in its strip edits the layout; then + puts a view here.'
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
										<span className="pointer-events-none flex items-center gap-2.5 rounded-win bg-booth-raise px-4 py-3 text-sm text-booth-ink shadow-lg ring-1 ring-booth-edge">
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
					className="pointer-events-none fixed z-50 rounded-ctl bg-booth-raise px-3.5 py-2 text-sm font-medium shadow-2xl ring-1 ring-accent-hi"
				>
					{tabDrag.label}
				</span>
			)}
			{!p.editing &&
				!p.bare &&
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
									dragging ? 'bg-accent-hi' : 'bg-booth-faint group-hover:bg-booth-dim group-active:bg-accent-hi'
								}`}
							/>
						</div>
					)
				})}
		</div>
	)
}

/** The tab showing is filled in the selected blue, behind its words, and the
 *  fill slides from the tab that was showing to the one tapped (the owner's
 *  references, 2026-10-08: one colour fill marks what is selected). Placed by
 *  measuring, so a renamed tab or a resized window carries it along without
 *  the slide. */
function TabFill({ on, tabs }: { on: string | null; /** What the strip holds: placed again when it changes. */ tabs: string }) {
	const ref = useRef<HTMLSpanElement | null>(null)
	const last = useRef<string | null>(null)
	useLayoutEffect(() => {
		const fill = ref.current
		const list = fill?.parentElement
		if (fill == null || list == null) return
		const place = (slide: boolean) => {
			const button = list.querySelector<HTMLElement>('[data-tab-button="on"]')
			if (button === null) {
				fill.style.opacity = '0'
				return
			}
			const x = button.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft
			fill.style.transition = slide ? 'transform 320ms cubic-bezier(.3,.8,.2,1), width 320ms cubic-bezier(.3,.8,.2,1)' : 'none'
			fill.style.opacity = '1'
			fill.style.transform = `translateX(${x}px)`
			fill.style.width = `${button.offsetWidth}px`
		}
		place(last.current !== null && last.current !== on)
		last.current = on
		const ro = new ResizeObserver(() => place(false))
		ro.observe(list)
		for (const b of list.querySelectorAll('[data-tab]')) ro.observe(b)
		return () => ro.disconnect()
	}, [on, tabs])
	return <span ref={ref} aria-hidden className="pointer-events-none absolute top-[calc(50%-20px)] left-0 h-10 rounded-ctl bg-accent opacity-0" />
}

const seamKey = (seam: Seam) => `${seam.axis}:${seam.before.join(',')}|${seam.after.join(',')}`

/** Bands along each edge and squares at each corner, big enough for a
 *  finger, each drawn: a bracket at the corners and a pill mid-edge, so what
 *  can be dragged is seen rather than found by hovering, which a finger
 *  cannot do. */
function EdgeHandles({ win, handle }: { win: GridWindow; handle: (win: GridWindow, edges: Edges) => object }) {
	const band = 'group absolute z-10 touch-none flex items-center justify-center'
	const pill = 'rounded-full bg-accent-hi/70 transition-colors group-hover:bg-accent-hi group-active:bg-accent-hi'
	const corner = 'pointer-events-none absolute size-5 border-accent-hi/80 transition-colors group-hover:border-accent-hi'
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
		<div className="absolute top-2 left-2 z-20 flex max-h-[calc(100%-1rem)] w-64 animate-rise flex-col overflow-y-auto rounded-win bg-booth-raise p-1.5 shadow-2xl ring-1 ring-booth-edge">
			<span className="px-3 pt-2 pb-1.5 text-xs font-medium text-booth-dim">Add a view</span>
			{offer.map((v) => {
				const ViewIcon = viewIcon(v)
				return (
					<button
						key={v}
						type="button"
						onClick={() => onPick(v)}
						className="flex h-12 shrink-0 items-center gap-3 rounded-ctl px-3 text-left text-sm hover:bg-booth-hover active:bg-booth-hover"
					>
						<ViewIcon size={18} strokeWidth={1.8} className="text-booth-dim" aria-hidden />
						{labelOf(v)}
					</button>
				)
			})}
		</div>
	)
}
