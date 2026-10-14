// Volunteer and Admin (docs/PLAN.md, Mode switching). Admin was called
// operator mode until 2026-10-08, and the code still says `operator`.
//
// The mode is which MA user the pane is logged in as: volunteer is the
// volunteer user (Remote by default), Admin is the LD's. What each may do is
// set on the console, in those users' rights.
//
// Boots into volunteer, always, and nothing here is remembered across a
// restart. In: the passcode, checked by main (../shared/admin.ts), or a tap
// when none is set; a 3-second hold until 2026-10-08. Out: one tap, or the
// timeout Settings › Admin picks (15 minutes unless changed) with no input
// anywhere, which logs the pane back to the volunteer user. Becoming more
// restricted is always safe, so leaving is easy and entering is not.

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

/** `paneLastInputAt` is input inside the MA pane, the run order and embeds,
 *  which the renderer cannot see for itself: an LD working in the MA is not
 *  idle. `idleMs` is Settings › Admin's timeout. */
export function useMode(now: number, paneLastInputAt: number | null, idleMs: number) {
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
		if (operatorExpired(Math.max(lastInput.current, paneLastInputAt ?? 0), now, idleMs)) setMode('volunteer')
	}, [mode, now, paneLastInputAt, idleMs])

	return {
		mode,
		/** Main has let the screen in (`unlockAdmin`): follow it. */
		enter: () => {
			lastInput.current = Date.now()
			setMode('operator')
		},
		leave: () => setMode('volunteer'),
	}
}
