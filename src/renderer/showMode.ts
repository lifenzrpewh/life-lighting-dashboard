// Show mode (the owner, 2026-10-13: "a fullscreen that takes away the windows'
// tops and locks the screen to whatever mode it is in, to use the space").
//
// While it is on:
// - The windows lose their strips: no tabs, no view buttons, no pencil. Each
//   window shows the tab that was showing, and its page takes the strip's room.
// - The layout holds: no Edit layout, no Layouts, no edge to drag between
//   windows.
// - The mode is volunteer: going in leaves Admin (the owner, 2026-10-14), so
//   a screen left in Show mode never holds Admin's loads and writes for
//   whoever comes by. The lock gives way to Show mode's own button.
//
// IN: anyone, from the bar's tray. It only takes things away, Admin included.
// OUT, locked (the default): Admin's way in (./components/PasscodeSheet.tsx),
// whatever the mode: the passcode if one is set, a tap if not. Leaving lands in
// Admin, as the passcode always does. A lock anyone could undo with a tap would
// not be one.
// OUT, unlocked (Settings › Admin › Leaving Show mode, the owner's to choose,
// 2026-10-14): a tap, for anyone, back to volunteer. Show mode is then only
// the space, not a lock.
//
// Remembered on this computer, so a restart mid-service (the watchdog's) comes
// back as it was. The mode itself still boots volunteer (./mode.ts).

import { useState } from 'react'

const KEY = 'paua.showMode'

export function useShowMode(): [boolean, (on: boolean) => void] {
	const [on, setOn] = useState(() => {
		try {
			return localStorage.getItem(KEY) === '1'
		} catch {
			return false
		}
	})
	const set = (next: boolean) => {
		setOn(next)
		try {
			if (next) localStorage.setItem(KEY, '1')
			else localStorage.removeItem(KEY)
		} catch {
			// Kept for this run only.
		}
	}
	return [on, set]
}
