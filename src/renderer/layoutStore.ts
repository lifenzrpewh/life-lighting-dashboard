// The layout on screen (../shared/layout.ts), and the named layouts saved on
// this computer.
//
// A convenience for this screen, so both live in this browser's storage: a
// storage that will not read or write costs only the remembering. The
// layout's key is the slots' old one, so a booth's two slots come back as its
// two windows.

import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_LAYOUT, layoutFrom, savedLayoutsFrom, type Layout, type SavedLayout } from '../shared/layout.js'

const KEY = 'life.layout'
const SAVED_KEY = 'paua.layouts'

function read<T>(key: string, from: (stored: unknown) => T, fallback: T): T {
	try {
		return from(localStorage.getItem(key))
	} catch {
		return fallback
	}
}

function write(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {
		// Not remembered; it still holds until the next start.
	}
}

export function useLayout(): {
	layout: Layout
	update: (change: (l: Layout) => Layout) => void
	saved: SavedLayout[]
	setSaved: (saved: SavedLayout[]) => void
} {
	const [layout, setLayout] = useState(() => read(KEY, layoutFrom, DEFAULT_LAYOUT))
	const [saved, setSaved] = useState(() => read(SAVED_KEY, savedLayoutsFrom, []))
	useEffect(() => write(KEY, layout), [layout])
	useEffect(() => write(SAVED_KEY, saved), [saved])
	const update = useCallback((change: (l: Layout) => Layout) => setLayout(change), [])
	return { layout, update, saved, setSaved }
}
