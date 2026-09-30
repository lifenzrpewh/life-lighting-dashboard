// Volunteer and operator mode (docs/PLAN.md, Mode switching).
//
// The mode is which MA user the pane is logged in as: volunteer is the
// volunteer user (Remote by default), operator is the LD's. What each may do
// is set on the console, in those users' rights.
//
// Boots into volunteer, always, and nothing here is remembered across a
// restart. In: a 3-second hold on the mode chip. Out: one tap, or 15 minutes
// with no input anywhere, which logs the pane back to the volunteer user.
// Becoming more restricted is always safe, so leaving is easy and entering is
// not.

import { useEffect, useRef, useState } from 'react'

import { operatorExpired, type Mode } from '../shared/ma-pane.js'

export type { Mode }

/** Long enough that a palm resting on the chip is not an elevation. */
export const HOLD_MS = 3_000

/** `paneLastInputAt` is input inside the MA pane, which the renderer cannot
 *  see for itself: an operator working in the MA is not idle. */
export function useMode(now: number, paneLastInputAt: number | null) {
	const [mode, setMode] = useState<Mode>('volunteer')
	const lastInput = useRef(Date.now())

	useEffect(() => {
		const mark = () => {
			lastInput.current = Date.now()
		}
		window.addEventListener('pointerdown', mark, true)
		window.addEventListener('keydown', mark, true)
		return () => {
			window.removeEventListener('pointerdown', mark, true)
			window.removeEventListener('keydown', mark, true)
		}
	}, [])

	// Checked on the 1 s clock, so the drop needs nothing to happen to arrive.
	useEffect(() => {
		if (mode !== 'operator') return
		if (operatorExpired(Math.max(lastInput.current, paneLastInputAt ?? 0), now)) setMode('volunteer')
	}, [mode, now, paneLastInputAt])

	return {
		mode,
		enter: () => {
			lastInput.current = Date.now()
			setMode('operator')
		},
		leave: () => setMode('volunteer'),
	}
}
