// Which views are popped out of their slots (../shared/popout.ts), as main
// holds it. Main owns the windows, so this asks rather than remembers; a tap
// is shown at once, and the next answer from main is the truth either way.

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ViewId } from '../shared/layout.js'

export function usePopouts(): {
	popped: ReadonlySet<ViewId>
	popOut: (view: ViewId) => void
	bringBack: (view: ViewId) => void
} {
	const [popped, setPopped] = useState<ReadonlySet<ViewId>>(new Set())
	// Counts taps, so an answer asked for before one cannot undo it.
	const taps = useRef(0)

	// Polled, like everything main owns. Fast enough that a pop-out closed by
	// its own window is back in its slot before anyone looks for it.
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => {
			const asked = taps.current
			void api.popouts().then((v) => alive && asked === taps.current && setPopped(new Set(v)))
		}
		poll()
		const id = setInterval(poll, 300)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])

	const popOut = useCallback((view: ViewId) => {
		if (window.life === undefined) return
		window.life.popOut(view)
		taps.current++
		setPopped((p) => new Set([...p, view]))
	}, [])
	const bringBack = useCallback((view: ViewId) => {
		window.life?.bringBack(view)
		taps.current++
		setPopped((p) => new Set([...p].filter((v) => v !== view)))
	}, [])

	return { popped, popOut, bringBack }
}
