// How wide the run order column is: dragged by its divider, remembered on this
// computer, and never so wide or so narrow that either pane stops working.
//
// WHY THE LIMITS: the Cue Manager is built for a phone, and narrower than
// MIN_PX it wraps song titles; the MA pane holds the volunteer's buttons, so it
// keeps at least MA_MIN_PX whatever the column does. The width is a convenience
// for this screen, so it lives in this browser's storage and nowhere else, and
// a storage that will not read or write costs only the remembering.

import { useCallback, useEffect, useState } from 'react'

/** 26rem: a phone's width, the column's width before it could be dragged. */
export const DEFAULT_PX = 416
export const MIN_PX = 320
/** The most the column may take of the window. */
const MAX_SHARE = 0.6
/** What the MA pane always keeps. */
const MA_MIN_PX = 640
/** Dragged this far past the narrowest, a release folds the column away. */
export const FOLD_BELOW_PX = MIN_PX - 120

const KEY = 'life.cueWidth'

/** The widest the column may be in a window this wide. */
export function maxWidth(windowPx: number): number {
	return Math.max(MIN_PX, Math.min(windowPx * MAX_SHARE, windowPx - MA_MIN_PX))
}

export function clampWidth(px: number, windowPx: number): number {
	return Math.round(Math.min(Math.max(px, MIN_PX), maxWidth(windowPx)))
}

function remembered(): number {
	try {
		const n = Number(localStorage.getItem(KEY))
		return Number.isFinite(n) && n > 0 ? n : DEFAULT_PX
	} catch {
		return DEFAULT_PX
	}
}

function remember(px: number): void {
	try {
		localStorage.setItem(KEY, String(px))
	} catch {
		// Not remembered; the width still applies until the next start.
	}
}

/** The column's width, clamped to the window as it is now. `set` is for
 *  every step of a drag; `commit` stores where it ended; `revert` goes back to
 *  the last width committed, for a drag that ended in a fold, so the column
 *  opens again where it was rather than where the finger left it. */
export function useCueWidth() {
	const [wanted, setWanted] = useState(remembered)
	const [committed, setCommitted] = useState(wanted)
	const [windowPx, setWindowPx] = useState(() => window.innerWidth)
	useEffect(() => {
		const onResize = () => setWindowPx(window.innerWidth)
		window.addEventListener('resize', onResize)
		return () => window.removeEventListener('resize', onResize)
	}, [])

	const width = clampWidth(wanted, windowPx)
	const commit = useCallback(
		(px: number) => {
			const c = clampWidth(px, windowPx)
			setWanted(c)
			setCommitted(c)
			remember(c)
		},
		[windowPx],
	)
	return { width, set: setWanted, commit, revert: () => setWanted(committed), reset: () => commit(DEFAULT_PX) }
}
