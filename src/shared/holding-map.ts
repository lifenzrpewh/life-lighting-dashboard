// The Holding map (the owner, 2026-10-11): what each of Arena's named HOLDING
// columns takes, per layer, and which code families go to which layer, set per
// computer in Settings › Holding, with presets and a way back to the defaults.
//
// WHY: the rules in ./holding.ts were one campus's pattern written as code
// (PRE takes Doors Open, PROMO takes the announcements, COUNTDOWN is left
// alone). The owner: "I personally don't mind if each campus has the ability
// to tweak things. I want it to stay powerful and flexible and as agnostic as
// possible." So the pattern became the DEFAULT, and a campus can say, column
// by column, what differs. An empty map is exactly the old behaviour, which
// the tests hold it to.
//
// WHAT A CAMPUS CAN SAY:
// - A column's run-sheet items (`takes`): words matched against an item's
//   label (the whole label) or its title and label (anywhere in them). Left
//   unset, the column keeps its default (PRE: Doors Open and Walk In; a PROMO:
//   announcements and promos; anything else: the item labelled with its name).
//   Empty, it takes nothing. Several columns taking the same items share them
//   out, as the PROMO columns always have.
// - Each layer of a column (a cell):
//     auto     the default rule
//     item     the item's own code, and nothing else (no normal background)
//     normal   the service's normal background (HOLD BG), whatever the item has
//     leave    left alone: nothing placed, filled, updated or cleared there
//     fixed    always this code, whatever the run sheet says
// - A code family (the two letters, campus then type: CF is Central's
//   foregrounds, NB North's backgrounds) to a layer, or to none. Unset, the
//   type letter decides as before: B, F and A to their layers, the rest none.
//
// Columns are keyed by name with only letters and digits, upper case
// (`Promo 1` is PROMO1), so a preset made at one campus means the same
// columns at another that names them the same way.
//
// THE RULES THIS FILE ENFORCES:
// - A map read from storage or a file is checked whole; anything not of this
//   shape is refused, never half-taken.
// - Nothing here writes to Arena. The map only changes what ./holding.ts
//   suggests, and every write is still confirmed first.

import { ARENA_TYPES, mediaCodeOf } from './media-check.js'

export type LayerKey = 'B' | 'F' | 'A'
export const LAYER_KEYS: readonly LayerKey[] = ['B', 'F', 'A']

export type Cell = { kind: 'auto' } | { kind: 'item' } | { kind: 'normal' } | { kind: 'leave' } | { kind: 'fixed'; code: string }
export type CellKind = Cell['kind']

export type ColumnRule = {
	/** The run-sheet words this column takes; unset is its default, empty
	 *  takes nothing. */
	takes?: string[]
	cells?: Partial<Record<LayerKey, Cell>>
}

export type HoldingMap = {
	/** Two letters (`CB`) to a layer, or `none`. */
	families: Record<string, LayerKey | 'none'>
	/** By column name, letters and digits only, upper case. */
	columns: Record<string, ColumnRule>
}

export const DEFAULT_MAP: HoldingMap = { families: {}, columns: {} }

/** A map saved under a name, to switch to or pass to another computer. */
export type HoldingPreset = { name: string; map: HoldingMap }

export const PRESETS_MAX = 12
export const PRESET_NAME_MAX = 40
const WORD_MAX = 40
const WORDS_MAX = 12

/** A column's key: `Promo 1` is PROMO1. */
export const columnKey = (name: string): string => name.toUpperCase().replace(/[^A-Z0-9]/g, '')

const AUTO: Cell = { kind: 'auto' }

export function ruleOf(map: HoldingMap, columnName: string): ColumnRule | undefined {
	const key = columnKey(columnName)
	return key === '' ? undefined : map.columns[key]
}

export function cellOf(map: HoldingMap, columnName: string, layer: LayerKey): Cell {
	return ruleOf(map, columnName)?.cells?.[layer] ?? AUTO
}

/** The words a column takes when they are set, or undefined for its default. */
export function takesOf(map: HoldingMap, columnName: string): string[] | undefined {
	return ruleOf(map, columnName)?.takes
}

/** Which layer a code goes to: its family's, when the map names one, else its
 *  type letter's. Null for a code Arena does not hold. */
export function layerOfCode(map: HoldingMap, code: string): LayerKey | null {
	const c = mediaCodeOf(code)
	if (c === null) return null
	const family = map.families[`${c.campus}${c.type}`]
	if (family !== undefined) return family === 'none' ? null : family
	return ARENA_TYPES.includes(c.type) ? (c.type as LayerKey) : null
}

/** Does an item answer to these words: one is its whole label, or appears in
 *  its title or label. */
export function takesItem(words: readonly string[], item: { title: string; label: string | null }): boolean {
	const label = columnKey(item.label ?? '')
	const text = `${item.title} ${item.label ?? ''}`.toLowerCase()
	return words.some((w) => {
		const word = w.trim()
		if (word === '') return false
		return (label !== '' && label === columnKey(word)) || text.includes(word.toLowerCase())
	})
}

/** A column's default, said, for Settings: what it takes when nothing is set. */
export function defaultTakesWords(columnName: string): string {
	const key = columnKey(columnName)
	if (key === '') return 'Nothing (not named)'
	if (/^PRE\d*$/.test(key)) return 'Doors Open, Walk In'
	if (/^POST\d*$/.test(key)) return 'End, Walk Out'
	if (key.startsWith('PROMO')) return 'Announcements, promos'
	if (key.startsWith('PREACH')) return 'The message'
	if (/COUNTDOWN|VIDEO|BROADCAST/.test(key)) return 'Nothing'
	return `The item labelled ${columnName.trim()}`
}

/** The same map with one column's rule changed, emptied rules dropped. */
export function withRule(map: HoldingMap, columnName: string, change: (rule: ColumnRule) => ColumnRule): HoldingMap {
	const key = columnKey(columnName)
	if (key === '') return map
	const next = change(map.columns[key] ?? {})
	const cells = Object.fromEntries(Object.entries(next.cells ?? {}).filter(([, c]) => c !== undefined && c.kind !== 'auto'))
	const rule: ColumnRule = {
		...(next.takes === undefined ? {} : { takes: next.takes }),
		...(Object.keys(cells).length === 0 ? {} : { cells }),
	}
	const columns = { ...map.columns }
	if (rule.takes === undefined && rule.cells === undefined) delete columns[key]
	else columns[key] = rule
	return { ...map, columns }
}

export function withFamily(map: HoldingMap, family: string, layer: LayerKey | 'none' | null): HoldingMap {
	const families = { ...map.families }
	if (layer === null) delete families[family]
	else families[family] = layer
	return { ...map, families }
}

/** Whether a map says anything at all. */
export const isDefault = (map: HoldingMap): boolean => Object.keys(map.families).length === 0 && Object.keys(map.columns).length === 0

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function cellFrom(raw: unknown): Cell | null {
	if (!isObject(raw)) return null
	const kind = raw['kind']
	if (kind === 'auto' || kind === 'item' || kind === 'normal' || kind === 'leave') return { kind }
	if (kind === 'fixed') {
		const code = typeof raw['code'] === 'string' ? mediaCodeOf(raw['code'])?.code : undefined
		return code === undefined || code !== String(raw['code']).trim().toUpperCase() ? null : { kind: 'fixed', code }
	}
	return null
}

/** A map from storage or a file, checked whole, or null. */
export function holdingMapFrom(raw: unknown): HoldingMap | null {
	if (!isObject(raw) || !isObject(raw['families']) || !isObject(raw['columns'])) return null
	const families: HoldingMap['families'] = {}
	for (const [k, v] of Object.entries(raw['families'])) {
		if (!/^[A-Z]{2}$/.test(k) || (v !== 'none' && !LAYER_KEYS.includes(v as LayerKey))) return null
		families[k] = v as LayerKey | 'none'
	}
	const columns: HoldingMap['columns'] = {}
	for (const [k, v] of Object.entries(raw['columns'])) {
		if (!/^[A-Z0-9]{1,40}$/.test(k) || !isObject(v)) return null
		const rule: ColumnRule = {}
		if (v['takes'] !== undefined) {
			const takes = v['takes']
			if (!Array.isArray(takes) || takes.length > WORDS_MAX || !takes.every((w) => typeof w === 'string' && w.length <= WORD_MAX)) return null
			rule.takes = takes.map((w: string) => w.trim()).filter((w) => w !== '')
		}
		if (v['cells'] !== undefined) {
			if (!isObject(v['cells'])) return null
			const cells: Partial<Record<LayerKey, Cell>> = {}
			for (const [layer, c] of Object.entries(v['cells'])) {
				const cell = cellFrom(c)
				if (!LAYER_KEYS.includes(layer as LayerKey) || cell === null) return null
				if (cell.kind !== 'auto') cells[layer as LayerKey] = cell
			}
			if (Object.keys(cells).length > 0) rule.cells = cells
		}
		if (rule.takes !== undefined || rule.cells !== undefined) columns[k] = rule
	}
	return { families, columns }
}

/** Presets from storage or a file, each checked; the bad ones left out. */
export function presetsFrom(raw: unknown): HoldingPreset[] {
	if (!Array.isArray(raw)) return []
	const out: HoldingPreset[] = []
	for (const p of raw) {
		if (!isObject(p) || typeof p['name'] !== 'string') continue
		const name = p['name'].trim().slice(0, PRESET_NAME_MAX)
		const map = holdingMapFrom(p['map'])
		if (name === '' || map === null || out.some((o) => o.name === name)) continue
		out.push({ name, map })
		if (out.length === PRESETS_MAX) break
	}
	return out
}

/** A file holding one preset, as Export writes it and Import reads it. */
export const PRESET_FILE_KIND = 'paua-holding-preset'

export function presetFile(preset: HoldingPreset): string {
	return JSON.stringify({ kind: PRESET_FILE_KIND, version: 1, name: preset.name, map: preset.map }, null, 2)
}

/** A preset from a file's text, or why not, in words. */
export function presetFromFile(text: string): { ok: true; preset: HoldingPreset } | { ok: false; detail: string } {
	let raw: unknown
	try {
		raw = JSON.parse(text)
	} catch {
		return { ok: false, detail: 'That file is not a Pāua Holding preset (not JSON).' }
	}
	if (!isObject(raw) || raw['kind'] !== PRESET_FILE_KIND) return { ok: false, detail: 'That file is not a Pāua Holding preset.' }
	const [preset] = presetsFrom([{ name: raw['name'], map: raw['map'] }])
	return preset === undefined ? { ok: false, detail: 'That preset is damaged or from a newer Pāua; nothing was taken.' } : { ok: true, preset }
}
