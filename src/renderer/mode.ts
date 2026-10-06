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

import { createContext, useContext, useEffect, useRef, useState } from 'react'

import { operatorExpired, type Mode } from '../shared/ma-pane.js'

export type { Mode }

/** Whether the screen is in operator mode, for any view that has buttons only
 *  operator mode may use. Those buttons are not drawn at all in volunteer mode
 *  (the owner, 2026-10-06: Update all and the like "not even show up"), not
 *  drawn and refused: main still refuses them, which is the guard; this is
 *  only what a volunteer sees. The kiosk provides it from its mode chip, a
 *  pop-out from main (`useMainMode`). */
export const OperatorContext = createContext(false)
export const useOperator = () => useContext(OperatorContext)

/** The kiosk's mode, as main holds it, for a pop-out: asked every second, so
 *  the idle drop reaches a pop-out's buttons too. Volunteer until main says. */
export function useMainMode(): Mode {
	const [mode, setMode] = useState<Mode>('volunteer')
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.mode().then((m) => alive && setMode(m))
		poll()
		const id = setInterval(poll, 1000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])
	return mode
}

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
