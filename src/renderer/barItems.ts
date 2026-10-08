// What the top bar shows, per computer (the owner, 2026-10-08): Admin may hide
// any reading or button a booth does not use, in Settings › Top bar. A
// convenience of this computer's, kept in its storage like the folded bar
// (`paua.barCollapsed`), so a machine that keeps nothing shows everything.
//
// Not hideable: the mode lock (or nobody could reach Admin to show anything
// again), Settings (Admin's only, and the way back to this list) and the
// fold chevron.

import { useState } from 'react'

export const BAR_ITEMS = ['console', 'countdown', 'clock', 'guide', 'layouts', 'connections', 'mark'] as const
export type BarItem = (typeof BAR_ITEMS)[number]

export const BAR_ITEM_LABEL: Record<BarItem, { name: string; what: string }> = {
	console: { name: 'Console', what: 'Whether the console answers, and its show; opens Save As and Load' },
	countdown: { name: 'Countdown', what: 'OnTime’s or ProPresenter’s timer' },
	clock: { name: 'Clock', what: 'The time and date' },
	guide: { name: 'Guide', what: 'The Creative Guide' },
	layouts: { name: 'Layouts', what: 'Switch between saved layouts' },
	connections: { name: 'Connections', what: 'What is up and what is down, and its dot' },
	mark: { name: 'Mark', what: 'The flag that marks a moment in the log, for testers' },
}

const KEY = 'paua.barHidden'

function read(): ReadonlySet<BarItem> {
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
		return new Set(Array.isArray(raw) ? BAR_ITEMS.filter((i) => raw.includes(i)) : [])
	} catch {
		return new Set()
	}
}

/** The items hidden on this computer, and a way to hide or show one. */
export function useBarHidden(): [ReadonlySet<BarItem>, (item: BarItem, hidden: boolean) => void] {
	const [hidden, setHidden] = useState(read)
	const set = (item: BarItem, hide: boolean) => {
		const next = new Set(hidden)
		if (hide) next.add(item)
		else next.delete(item)
		setHidden(next)
		try {
			if (next.size === 0) localStorage.removeItem(KEY)
			else localStorage.setItem(KEY, JSON.stringify([...next]))
		} catch {
			// Kept for this run only.
		}
	}
	return [hidden, set]
}
