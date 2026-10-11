// The Holding map in use on this computer, and its presets
// (../shared/holding-map.ts). Kept in this computer's storage, like the saved
// layouts: one store for the kiosk and every pop-out, which hear each other
// through the storage event, so Holding popped out follows Settings at once.

import { useSyncExternalStore } from 'react'

import { DEFAULT_MAP, holdingMapFrom, presetsFrom, type HoldingMap, type HoldingPreset } from '../shared/holding-map.js'

const KEY = 'paua.holdingMap'
const PRESETS_KEY = 'paua.holdingPresets'

export type HoldingMapState = {
	map: HoldingMap
	/** The preset last chosen or saved, if any: the map may have changed since. */
	preset: string | null
	presets: HoldingPreset[]
}

function readJson(key: string): unknown {
	try {
		const raw = localStorage.getItem(key)
		return raw === null ? null : JSON.parse(raw)
	} catch {
		return null
	}
}

function load(): HoldingMapState {
	const stored = readJson(KEY) as { map?: unknown; preset?: unknown } | null
	const map = (stored !== null && holdingMapFrom(stored.map)) || DEFAULT_MAP
	const preset = typeof stored?.preset === 'string' ? stored.preset : null
	return { map, preset, presets: presetsFrom(readJson(PRESETS_KEY)) }
}

let state = load()
const listeners = new Set<() => void>()

function set(next: HoldingMapState): void {
	state = next
	try {
		localStorage.setItem(KEY, JSON.stringify({ map: next.map, preset: next.preset }))
		localStorage.setItem(PRESETS_KEY, JSON.stringify(next.presets))
	} catch {
		// Not remembered; it holds until the next start.
	}
	for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	const onStorage = (e: StorageEvent) => {
		if (e.key !== KEY && e.key !== PRESETS_KEY) return
		state = load()
		listener()
	}
	window.addEventListener('storage', onStorage)
	return () => {
		listeners.delete(listener)
		window.removeEventListener('storage', onStorage)
	}
}

/** The map Holding, Lookbook and the media check follow. */
export function useHoldingMap(): HoldingMap {
	return useSyncExternalStore(subscribe, () => state.map)
}

export function useHoldingMapState(): HoldingMapState {
	return useSyncExternalStore(subscribe, () => state)
}

export const holdingMapActions = {
	/** The map changed by hand: the preset's name stays, as the one it came from. */
	setMap: (map: HoldingMap) => set({ ...state, map }),
	/** Back to the default rules. */
	reset: () => set({ ...state, map: DEFAULT_MAP, preset: null }),
	/** Switch to a saved preset. */
	use: (name: string) => {
		const p = state.presets.find((x) => x.name === name)
		if (p !== undefined) set({ ...state, map: p.map, preset: p.name })
	},
	/** Save the map on screen under a name; the same name replaces it. */
	save: (name: string) => {
		const others = state.presets.filter((p) => p.name !== name)
		set({ ...state, preset: name, presets: [...others, { name, map: state.map }].sort((a, b) => a.name.localeCompare(b.name)) })
	},
	/** A preset from another computer: kept, and put in use. */
	take: (preset: HoldingPreset) => {
		const others = state.presets.filter((p) => p.name !== preset.name)
		set({ map: preset.map, preset: preset.name, presets: [...others, preset].sort((a, b) => a.name.localeCompare(b.name)) })
	},
	remove: (name: string) => set({ ...state, preset: state.preset === name ? null : state.preset, presets: state.presets.filter((p) => p.name !== name) }),
}
