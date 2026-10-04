// Popping a view out into a window of its own (docs/VISUALS_DASHBOARD.md § Pop
// a view out).
//
// The owner's answers, 2026-10-03: any of the three views may pop out; it works
// on one screen as well as two, in a window that stays on top of the kiosk; and
// while a view is out, its slot says so and offers to bring it back, so the
// layout never changes by itself. Closing the window, by its Back button or the
// system's own close, brings the view home.
//
// THE RULES THIS FILE ENFORCES:
// - A pop-out opens where it can be reached. A remembered place is used only
//   while its top edge is still on a display, because a window whose title bar
//   is off every screen cannot be moved back by a finger. Otherwise it opens on
//   a display other than the kiosk's when there is one (the Arena op's second
//   monitor), and on the kiosk's own when there is not.
// - Anything off storage that is not a sane rectangle is forgotten, not trusted.

import { isViewId, type ViewId } from './layout.js'

export type Box = { x: number; y: number; width: number; height: number }

/** A display as main sees it: where windows may go on it. */
export type Display = { id: number; workArea: Box }

/** A pop-out's size when nothing is remembered: room for the MA's layout view,
 *  smaller than any booth screen. */
export const POPOUT_SIZE = { width: 1024, height: 720 }

/** Small enough to tuck aside, big enough that the Back button and the page
 *  under it are still usable. */
export const POPOUT_MIN = { width: 480, height: 360 }

/** How far below a window's top edge must be on a display for it to count as
 *  reachable: about a title bar's height. */
const GRAB = 24

const inside = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height

/** Where a pop-out opens: `saved` while it can still be reached, otherwise the
 *  default size, centred, on another display than the kiosk's if there is one. */
export function popoutBounds(saved: Box | null, displays: readonly Display[], kioskDisplay: number): Box {
	if (saved !== null) {
		const grabX = saved.x + saved.width / 2
		const grabY = saved.y + GRAB / 2
		if (displays.some((d) => inside(d.workArea, grabX, grabY))) return saved
	}
	const on = displays.find((d) => d.id !== kioskDisplay) ?? displays.find((d) => d.id === kioskDisplay) ?? displays[0]
	if (on === undefined) return { x: 0, y: 0, ...POPOUT_SIZE }
	const a = on.workArea
	const width = Math.min(POPOUT_SIZE.width, a.width)
	const height = Math.min(POPOUT_SIZE.height, a.height)
	return { x: Math.round(a.x + (a.width - width) / 2), y: Math.round(a.y + (a.height - height) / 2), width, height }
}

const isBox = (v: unknown): v is Box => {
	if (typeof v !== 'object' || v === null) return false
	const { x, y, width, height } = v as Record<string, unknown>
	return (
		[x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
		(width as number) >= POPOUT_MIN.width &&
		(height as number) >= POPOUT_MIN.height
	)
}

/** Each view's remembered place, off this machine's storage. A view with
 *  nothing sane remembered is simply absent. */
export function popoutPlacesFrom(stored: unknown): Partial<Record<ViewId, Box>> {
	if (typeof stored !== 'string') return {}
	let v: unknown
	try {
		v = JSON.parse(stored)
	} catch {
		return {}
	}
	if (typeof v !== 'object' || v === null) return {}
	const places: Partial<Record<ViewId, Box>> = {}
	for (const [view, b] of Object.entries(v)) {
		if (!isViewId(view)) continue
		if (isBox(b)) places[view] = { x: b.x, y: b.y, width: b.width, height: b.height }
	}
	return places
}

/** The view a pop-out window's page shows, from its address's query, or null
 *  for the kiosk itself. */
export function popoutViewOf(search: string): ViewId | null {
	const v = new URLSearchParams(search).get('popout')
	return isViewId(v) ? v : null
}
