// Where a native pane sits, for both the MA pane and the Cue Manager pane.
//
// The box is an element, not a fixed ref, because a view moves between slots
// (../shared/layout.ts): the slot holding it hands over its body, and this
// follows. Called from a place in the tree that never unmounts, so a view
// changing slots moves, and is never torn down and connected again.
//
// THE RULE THIS FILE ENFORCES: the native view goes where its box is, and
// nowhere else. No box (no slot holds the view) is hidden. The box is re-measured after every render, not only on resize,
// because a layout that shifts without resizing (a bar appearing above) would
// otherwise leave the view somewhere it no longer belongs.

import { useEffect, useLayoutEffect, useRef } from 'react'

import type { PaneRect } from '../shared/ma-pane.js'

const sameRect = (a: PaneRect | null, b: PaneRect | null) =>
	a === b ||
	(a !== null && b !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)

/** Measure `box` after every render and on every resize, and tell main when
 *  it moved. `hidden`, or no box, sends null: keep the page, take the view away. */
export function usePanePlacement(
	box: HTMLElement | null,
	hidden: boolean,
	send: (rect: PaneRect | null) => void,
): void {
	const sent = useRef<PaneRect | null | undefined>(undefined)

	const place = () => {
		const el = box
		let rect: PaneRect | null = null
		if (!hidden && el !== null) {
			const r = el.getBoundingClientRect()
			rect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
		}
		if (sent.current !== undefined && sameRect(sent.current, rect)) return
		sent.current = rect
		send(rect)
	}

	// After every render (the clock alone re-renders once a second)...
	const latest = useRef(place)
	useLayoutEffect(() => {
		latest.current = place
		place()
	})
	// ...and on every resize in between, so a fold or window change tracks.
	useEffect(() => {
		if (box === null) return
		const ro = new ResizeObserver(() => latest.current())
		ro.observe(box)
		return () => ro.disconnect()
	}, [box])

	// Forgotten on unmount, so a remount always says where it is.
	useEffect(
		() => () => {
			sent.current = undefined
		},
		[],
	)
}
