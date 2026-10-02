// Which view is in each slot, remembered on this computer (the owner's call,
// 2026-10-03): an Arena machine opens on Arena, a lighting booth on the MA.
//
// Like the left slot's width (./leftWidth.ts), a convenience for this screen:
// it lives in this browser's storage, and a storage that will not read or
// write costs only the remembering. The rules are ../shared/layout.ts.

import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_LAYOUT, layoutFrom, pick, type Layout, type Slot, type ViewId } from '../shared/layout.js'

const KEY = 'life.layout'

function remembered(): Layout {
	try {
		return layoutFrom(localStorage.getItem(KEY))
	} catch {
		return DEFAULT_LAYOUT
	}
}

export function useSlots(): { layout: Layout; choose: (slot: Slot, view: ViewId) => void } {
	const [layout, setLayout] = useState(remembered)
	useEffect(() => {
		try {
			localStorage.setItem(KEY, JSON.stringify(layout))
		} catch {
			// Not remembered; the layout still holds until the next start.
		}
	}, [layout])
	const choose = useCallback((slot: Slot, view: ViewId) => setLayout((l) => pick(l, slot, view)), [])
	return { layout, choose }
}
