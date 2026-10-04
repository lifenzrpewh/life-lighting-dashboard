// The layout on screen (../shared/layout.ts), remembered on this computer.
//
// A convenience for this screen, so it lives in this browser's storage: a
// storage that will not read or write costs only the remembering. The key is
// the slots' old one, so a booth's two slots come back as its two windows.

import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_LAYOUT, layoutFrom, type Layout } from '../shared/layout.js'

const KEY = 'life.layout'

function remembered(): Layout {
	try {
		return layoutFrom(localStorage.getItem(KEY))
	} catch {
		return DEFAULT_LAYOUT
	}
}

export function useLayout(): { layout: Layout; update: (change: (l: Layout) => Layout) => void } {
	const [layout, setLayout] = useState(remembered)
	useEffect(() => {
		try {
			localStorage.setItem(KEY, JSON.stringify(layout))
		} catch {
			// Not remembered; the layout still holds until the next start.
		}
	}, [layout])
	const update = useCallback((change: (l: Layout) => Layout) => setLayout(change), [])
	return { layout, update }
}
