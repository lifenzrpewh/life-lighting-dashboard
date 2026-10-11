// What main's updater last knew (../shared/updates.ts), polled like the link,
// because main owns it. Null outside the kiosk (the mock in a browser).

import { useEffect, useState } from 'react'

import type { UpdateState } from '../shared/updates.js'

export function useUpdates(): UpdateState | null {
	const [state, setState] = useState<UpdateState | null>(null)
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.updateState().then((u) => alive && setState(u ?? null))
		poll()
		// 1 Hz: a download's progress reads as moving; the rest changes hourly.
		const id = setInterval(poll, 1_000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])
	return state
}
