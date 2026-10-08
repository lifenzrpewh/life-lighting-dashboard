// What the top bar shows, per computer (the owner, 2026-10-08): Admin may hide
// any reading or button a booth does not use, in Settings › Top bar. A
// convenience of this computer's, kept in its storage like the folded bar
// (`paua.barCollapsed`), so a machine that keeps nothing shows everything.
//
// Not hideable: the mode lock (or nobody could reach Admin to show anything
// again), Settings (Admin's only, and the way back to this list) and the
// fold handle. Since the 2026-10-08 look the console card has gone (the show
// is on the console itself and on Connections' Console row, the bar speaking
// up only for the base show or a console not answering), the Guide is a view
// for a window, and Mark is on the bar only while Testing is on.

import { useState } from 'react'

export const BAR_ITEMS = ['countdown', 'clock', 'layouts', 'connections'] as const
export type BarItem = (typeof BAR_ITEMS)[number]

export const BAR_ITEM_LABEL: Record<BarItem, { name: string; what: string }> = {
	countdown: { name: 'Countdown', what: 'OnTime’s or ProPresenter’s timer' },
	clock: { name: 'Clock', what: 'The time and date' },
	layouts: { name: 'Layouts', what: 'Switch between saved layouts' },
	connections: { name: 'Connections', what: 'What is up and what is down, and its dot' },
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

const TESTING_KEY = 'paua.testing'

/** Testing (the owner, 2026-10-08): while a field test is on, Mark sits on the
 *  bar, and one tap writes a numbered line to the log at that moment. Off,
 *  the bar has no flag a volunteer might wonder about. Per computer. */
export function useTesting(): [boolean, (on: boolean) => void] {
	const [on, setOn] = useState(() => {
		try {
			return localStorage.getItem(TESTING_KEY) === '1'
		} catch {
			return false
		}
	})
	const set = (next: boolean) => {
		setOn(next)
		try {
			if (next) localStorage.setItem(TESTING_KEY, '1')
			else localStorage.removeItem(TESTING_KEY)
		} catch {
			// Kept for this run only.
		}
	}
	return [on, set]
}
