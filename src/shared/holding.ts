// The Holding view's rules (docs/VISUALS_DASHBOARD.md § The Holding view): what
// each clip in the holding layers is to today's run sheet, which column each
// run-sheet item belongs in, and what Update all would do.
//
// A COLUMN IS ONE MOMENT OF THE SERVICE, ACROSS EVERY LAYER (the owner,
// 2026-10-05, after a first version filled HOLD FG from column 1 and put
// Welcome in Post): Doors Open's background, foreground and A-screen all sit
// in the PRE column, End's in POST, and so on. Which column is which is read
// from Arena's own column names, the pattern every campus follows:
//
//   PRE    Doors Open / Walk In          POST   End / Walk Out
//   WTL, NSL, BIBLES, WTG                the item with that run-sheet label,
//                                        always the same column
//   PROMO  (as many as the campus has)   announcements and promos
//   PREACH (if a campus names one)       the message's background
//   anything else (COUNTDOWN, …)         never placed into
//
// A label with no column of its own goes to a PROMO column if it is an
// announcement or promo; otherwise it is a ONE-OFF (the owner, 2026-10-05:
// "things it doesn't know, you can decide where they go for that service"):
// the operator chooses a slot on its layer, and once its code sits anywhere on
// that layer it counts as placed. Arena is the record, so the choice lasts as
// long as this service's deck and the next service asks again. A label that
// comes back every week is the sign to name a column after it. Columns still named
// Arena's default (`Column #`) mean nothing is placed, and the view says
// which names to use. Nothing is guessed from what a column happens to hold.
//
// THE NORMAL BACKGROUND FILLS THE GAPS (the owner, 2026-10-06: "update all the
// backgrounds in the bg layer up to promo 6, including the blank ones, to use
// whatever the normal bg is"). The normal background is the one the rest of
// the service uses, leaving out Doors Open, Pre & Post, Preach and the
// announcements, which may have their own (`normalBackground`). Every HOLD BG
// slot from the first column to the last PROMO that no run-sheet item's own
// background claims, empty or holding one this service does not use, gets it
// (`backgroundGaps`). The Countdown column and Central's unnamed 3 and 4 too
// (the owner, 2026-10-06); not a column named VIDEO or BROADCAST, not one on
// screen, not a clip with no code.
//
// MORE THAN THE NAMED COLUMNS TAKE: OVERFLOW (the owner, 2026-10-08, for the
// four or five one-off events a year whose lookbook has far more foregrounds
// or backgrounds than the composition has named columns). A code on HOLD FG or
// HOLD BG with no column of its own (a one-off, or a promo past the last free
// PROMO) goes, in run-sheet order, into that layer's EMPTY clips after its
// last named column (`overflowSlots`). Never a loaded clip, never one on
// screen; what still does not fit is said ("didn't fit") and waits in the No
// column tray to be placed by hand. Capacity is whatever Arena reports, never a
// count assumed. Normal services are unchanged: a named column still wins.
// A ONE-OFF TAKES ONE COLUMN ACROSS ITS LAYERS (the owner, 2026-10-13: the
// column is fired, so its FG and BG come up together): its foreground finds the
// column, and its background goes into the same column on HOLD BG wherever else
// its code sits, or the normal background when it has none of its own. HOLD BG
// clips there that this service does not use are replaced ("replace old ones");
// never one on screen, never an item's own column (`placeOneOff`).
// Overflow and the normal background's gaps never meet: the gaps stop at the
// last PROMO, overflow starts after the last named column (and `backgroundGaps`
// leaves any clip a placement takes, to be sure). An overflow clip, once
// loaded, carries a code this run sheet uses, so it is never an old foreground.
//
// Also the owner's: B on HOLD BG, F on HOLD FG, A on A SCREEN BG; nothing from
// the lookbook on PLAYBACK; each service has its own deck, so a clip this run
// sheet does not use may be replaced.
//
// The names are the LAYER GROUP's columns (the owner named HOLDING's and A
// SCREENS's, 2026-10-05; the composition's own stayed `Column #`): each layer
// reads its group's, and the composition's only when its group names none.
//
// THE RULES THIS FILE ENFORCES:
// - A placement is a suggestion with its reason; the operator confirms it.
// - Never two PROMO items into one column, never a column whose name says it
//   is for something else. A placement into a clip on screen is allowed but
//   marked `live`: the confirmation asks about it apart (the owner,
//   2026-10-05).
// - Nothing found is said, not filled in with a guess.
//
// THE HOLDING MAP (./holding-map.ts, 2026-10-11): every rule above is the
// DEFAULT. A campus may say, per column, which run-sheet items it takes, and
// per layer of it: the item only, the normal background, leave it alone, or a
// fixed code; and which layer each code family goes to. Every function here
// takes the map last, and an empty one (the default) is exactly the rules
// above.

import type { ArenaLayer, ArenaSlot, ArenaStatus } from './arena.js'
import { TYPE_NAMES, fileStem, lookbookStem, mediaCodeOf, sameFile, sameKey, type FileSizes, type LookbookItem } from './media-check.js'
import type { FetchRequest } from './media-fetch.js'
import { DEFAULT_MAP, LAYER_KEYS, cellOf, layerOfCode, takesItem, takesOf, type HoldingMap, type LayerKey } from './holding-map.js'

/** Each type's layer, by name. The A-screen layer was PRE & POST until the
 *  owner renamed it A SCREEN BG (2026-10-05); a campus not yet renamed still
 *  works. */
export const TYPE_LAYER: Record<string, RegExp> = {
	B: /^hold\s*bg$/i,
	F: /^hold\s*fg$/i,
	A: /^(?:a\s*screens?\s*bg|pre\s*(?:&|and)?\s*post)$/i,
}
const TYPE_LAYER_NAME: Record<string, string> = { B: 'HOLD BG', F: 'HOLD FG', A: 'A SCREEN BG' }

/** Which of the three a layer is, by its name, or null (PLAYBACK). */
export function layerKeyOf(layer: ArenaLayer): LayerKey | null {
	return LAYER_KEYS.find((k) => TYPE_LAYER[k]?.test(layer.name.trim()) === true) ?? null
}

/** A slot's cell in the map: by its column's name over its layer. */
function slotCell(layer: ArenaLayer, column: number, status: ArenaStatus, map: HoldingMap) {
	const key = layerKeyOf(layer)
	return key === null ? ({ kind: 'auto' } as const) : cellOf(map, columnNamesOf(layer, status)[column - 1] ?? '', key)
}

/** The names a campus gives its columns, for the screen. */
export const COLUMN_NAMES = 'PRE, POST, WTL, NSL, BIBLES, WTG and PROMO'

/** A name with only its letters and digits, upper case: `Promo 3` is PROMO3. */
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Arena's default column name (`Column #`, `Column 3`): not a name. */
const unnamed = (name: string) => /^column\s*#?\s*\d*$/i.test(name.trim()) || name.trim() === ''

/** The column names over a layer: its group's, or the composition's when its
 *  group names none (or it is in no group). */
export function columnNamesOf(layer: ArenaLayer, status: ArenaStatus): string[] {
	const group = layer.group === null ? undefined : status.groups.find((g) => g.name === layer.group)
	const own = group?.columns ?? []
	if (own.some((n) => !unnamed(n))) return layer.slots.map((_, i) => own[i] ?? '')
	return layer.slots.map((_, i) => status.columns[i]?.name ?? '')
}

/** The layers the Holding view shows, top first as Arena's panel reads:
 *  HOLDING's and A SCREEN BG, PLAYBACK last as it is rarely used. */
export function holdingLayers(status: ArenaStatus): ArenaLayer[] {
	const top = [...status.layers].reverse()
	const holding = top.filter((l) => l.group !== null && /holding/i.test(l.group) && !/playback/i.test(l.name))
	const pre = top.filter((l) => TYPE_LAYER['A']?.test(l.name.trim()))
	const playback = top.filter((l) => /^playback$/i.test(l.name.trim()))
	return [...holding.filter((l) => !pre.includes(l)), ...pre, ...playback.filter((l) => !holding.includes(l))]
}

/** A column a person cannot pick either: one named for something the
 *  lookbook does not fill (COUNTDOWN, a video background), or, in a
 *  composition whose columns are not named yet, HOLD BG's 3 and 4. */
export function reserved(layer: ArenaLayer, column: number, status: ArenaStatus, map: HoldingMap = DEFAULT_MAP): boolean {
	// The map first: left alone is reserved; told what to hold, it is not.
	const cell = slotCell(layer, column, status, map)
	if (cell.kind === 'leave') return true
	if (cell.kind !== 'auto') return false
	const name = columnNamesOf(layer, status)[column - 1] ?? ''
	if (/count\s*down|video|broadcast/i.test(name)) return true
	return unnamed(name) && TYPE_LAYER['B']?.test(layer.name.trim()) === true && (column === 3 || column === 4)
}

/** The code a clip carries: in its file's name, else its clip name. */
export function slotCode(slot: ArenaSlot): string | null {
	if (slot.state === 'empty') return null
	const file = slot.file ?? slot.missingFile
	return (file !== null ? mediaCodeOf(fileStem(file))?.code : undefined) ?? mediaCodeOf(slot.name)?.code ?? null
}

/** Every code on the run sheet, any type: nothing named on the sheet is
 *  "not used today". */
export function codesOn(items: LookbookItem[]): Set<string> {
	const out = new Set<string>()
	for (const item of items) for (const raw of item.codes) {
		const c = mediaCodeOf(raw)
		if (c !== null) out.add(c.code)
	}
	return out
}

/** What a clip is to today's run sheet. */
export type SlotMark =
	| 'empty'
	/** On the run sheet, the lookbook's file (or the lookbook has none to compare). */
	| 'today'
	/** On the run sheet, not the lookbook's file: another size. */
	| 'different'
	/** On the run sheet, another name than the lookbook's, and no sizes to tell. */
	| 'may-differ'
	/** Another name, but an operator has confirmed it is the same file. */
	| 'confirmed'
	/** On the run sheet, but Arena cannot find its file on this computer. */
	| 'missing'
	/** A code the run sheet does not use: free to be replaced. */
	| 'not-today'
	/** No code in its name: not the lookbook's media. Left alone. */
	| 'no-code'

export function slotMark(
	slot: ArenaSlot,
	items: LookbookItem[],
	today: ReadonlySet<string>,
	marks: ReadonlySet<string>,
	sizes?: FileSizes,
): SlotMark {
	if (slot.state === 'empty') return 'empty'
	const code = slotCode(slot)
	if (code === null) return 'no-code'
	if (!today.has(code)) return 'not-today'
	if (slot.missingFile !== null) return 'missing'
	const file = items.map((i) => i.files[code]).find((f) => f !== undefined)
	if (file === undefined || slot.file === null) return 'today'
	const want = lookbookStem(file)
	if (sameFile(slot.file, file, want, sizes)) return 'today'
	if (marks.has(sameKey(code, slot.file, want))) return 'confirmed'
	return sizes?.arena[slot.file] !== undefined && sizes.lookbook[file] !== undefined ? 'different' : 'may-differ'
}

/** The words of a media name that say what it is: no code, no "Sunday", no
 *  versions, months, numbers or campus words. `CF464-Sunday-EXP-NextStepsLounge`
 *  is next, steps, lounge. */
export function nameWords(name: string): Set<string> {
	const stem = fileStem(name).replace(/(?<![A-Za-z0-9])[A-Za-z]{2}\d{3}(?!\d)/g, ' ')
	const words = stem
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.split(/[^A-Za-z0-9]+/)
		.map((w) => w.toLowerCase())
		.filter((w) => w.length > 1 && !STOP.has(w) && !/^v?\d+$/.test(w))
	return new Set(words)
}

const STOP = new Set([
	'sunday', 'sun', 'am', 'pm', 'exp', 'updated', 'update', 'new', 'final', 'copy', 'all', 'allcampus', 'campus',
	'central', 'north', 'west', 'east', 'south', 'tga', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep',
	'sept', 'oct', 'nov', 'dec', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september',
	'october', 'november', 'december',
])

/** How alike two names are, 0 to 1: the words they share over all their words. */
export function likeness(a: string, b: string): number {
	const x = nameWords(a)
	const y = nameWords(b)
	if (x.size === 0 || y.size === 0) return 0
	let shared = 0
	for (const w of x) if (y.has(w)) shared += 1
	return shared / (x.size + y.size - shared)
}

/** Names this alike are taken for the same piece, a newer version of it. */
export const LIKENESS_MIN = 0.5

/** One code of one run-sheet item, going into its column on its layer. */
export type Placement = {
	/** The item's place in the run sheet. */
	item: number
	title: string
	label: string | null
	code: string
	/** The lookbook's file name, without folder or extension. */
	want: string
	/** Its file in the lookbook's library. */
	lookbookPath: string
	layer: string
	/** Counted from 1. */
	column: number
	columnName: string
	clipId: number
	/** What is there now and would be replaced, or null for an empty slot. */
	replaces: { code: string | null; name: string } | null
	/** Its own column by name, or which PROMO column and why; `chosen` by
	 *  hand; `fill`, the normal background into a gap (`backgroundGaps`);
	 *  `overflow`, an empty clip after the layer's last named column, for a code
	 *  with no column of its own (`overflowSlots`). */
	why: 'named' | 'promo-alike' | 'promo-free' | 'promo-empty' | 'chosen' | 'fill' | 'overflow' | 'fixed'
	/** The slot is playing: loading changes what is on screen. */
	live: boolean
}

/** A code that has no place, and why: said, never guessed. */
export type Unplaced = {
	item: number
	title: string
	label: string | null
	code: string
	want: string | null
	kind: 'unnamed' | 'no-column' | 'no-promo' | 'no-layer' | 'no-file'
	detail: string
	/** It would have gone into an empty clip after the last named column, and
	 *  there was none left: said as "didn't fit", placed by hand. */
	didntFit?: true
}

/** A code that needs nothing, and why (the owner, 2026-10-13: "I think we
 *  don't really know what it's doing"): in its column already, a one-off
 *  already on its layer, or a cell the Holding map gives to something else.
 *  Kept so the plan can say it, not left silent. */
export type Settled = {
	item: number
	code: string
	layer: string
	/** Counted from 1. */
	column: number
	columnName: string
	clipId: number | null
	why: 'in-column' | 'on-layer' | 'leave' | 'fixed' | 'normal'
}

/** The layer's last named column, counted from 0, or -1 when none is named. */
function lastNamed(layer: ArenaLayer, status: ArenaStatus): number {
	return columnNamesOf(layer, status).reduce((at, n, i) => (unnamed(n) ? at : i), -1)
}

/** Where overflow goes on a layer (the owner, 2026-10-08): its empty clips
 *  after its last named column, left to right, each with its column counted
 *  from 1. Never a loaded clip or one on screen, never a reserved column, and
 *  none while the layer's columns are not named. */
export function overflowSlots(
	layer: ArenaLayer,
	status: ArenaStatus,
	map: HoldingMap = DEFAULT_MAP,
	/** Given, a loaded clip whose code is not in it (not this service's) is
	 *  spare too, never one on screen or with no code: HOLD BG's (the owner,
	 *  2026-10-13: "replace old ones"). */
	today?: ReadonlySet<string>,
): { slot: ArenaSlot; column: number }[] {
	const last = lastNamed(layer, status)
	if (last < 0) return []
	const spare = (slot: ArenaSlot) => {
		if (slot.state === 'empty') return true
		if (today === undefined || slot.state === 'playing') return false
		const code = slotCode(slot)
		return code !== null && !today.has(code)
	}
	return layer.slots.flatMap((slot, i) =>
		i > last && spare(slot) && !reserved(layer, i + 1, status, map) && slotCell(layer, i + 1, status, map).kind === 'auto' ? [{ slot, column: i + 1 }] : [],
	)
}

/** The types that overflow: foregrounds and backgrounds (the owner's rule names
 *  HOLD FG and HOLD BG; an A-screen one-off still waits to be placed by hand). */
const OVERFLOWS = new Set(['F', 'B'])

const isPromo = (item: LookbookItem) => /announce|promo/i.test(`${item.title} ${item.label ?? ''}`)
const isPre = (item: LookbookItem) => /walk\s*in|doors?\s*open|^pre$/i.test(item.label ?? '') || /doors?\s*open/i.test(item.title)
const isPost = (item: LookbookItem) => /walk\s*out|^post$/i.test(item.label ?? '') || /^\s*end\b/i.test(item.title)
const isPrePost = (item: LookbookItem) => /pre\s*(?:&|and)\s*post/i.test(`${item.title} ${item.label ?? ''}`)
/** The message: `Message (Incl. Altar Call)`, labelled `Preach BG`. */
const isPreach = (item: LookbookItem) => /preach|sermon/i.test(`${item.title} ${item.label ?? ''}`) || /^\s*message\b/i.test(item.title)

/** The column (counted from 0) an item has by name, or null. */
function namedColumn(item: LookbookItem, names: string[]): number | null {
	const find = (want: string) => {
		const i = names.findIndex((n) => norm(n) === want)
		return i < 0 ? null : i
	}
	if (isPre(item)) return find('PRE')
	if (isPost(item)) return find('POST')
	if (isPreach(item)) {
		const own = find('PREACH')
		if (own !== null) return own
	}
	if (item.label !== null && norm(item.label) !== '') return find(norm(item.label))
	return null
}

/** The Arena codes an item calls for, each with the layer it goes to (its
 *  family's in the map, else its type letter's) and the lookbook's file name. */
function arenaCodes(item: LookbookItem, map: HoldingMap = DEFAULT_MAP): { code: string; type: LayerKey; want: string | null; path: string | null }[] {
	const out: { code: string; type: LayerKey; want: string | null; path: string | null }[] = []
	for (const raw of item.codes) {
		const c = mediaCodeOf(raw)
		const type = c === null ? null : layerOfCode(map, c.code)
		if (c === null || type === null || out.some((o) => o.code === c.code)) continue
		const file = item.files[c.code]
		out.push({ code: c.code, type, want: file === undefined ? null : lookbookStem(file), path: file ?? null })
	}
	return out
}

/** The map's fixed codes (`fixed` cells): each slot that does not hold its
 *  code yet, to be placed. The file is the run sheet's for that code when it
 *  has one, else the drive's newest by code (../main/media-fetch.ts). */
export function fixedPlacements(items: LookbookItem[], status: ArenaStatus, map: HoldingMap = DEFAULT_MAP): Placement[] {
	const out: Placement[] = []
	for (const layer of status.layers) {
		const key = layerKeyOf(layer)
		if (key === null) continue
		const names = columnNamesOf(layer, status)
		layer.slots.forEach((slot, i) => {
			const cell = cellOf(map, names[i] ?? '', key)
			if (cell.kind !== 'fixed' || slotCode(slot) === cell.code) return
			const file = items.map((it) => it.files[cell.code]).find((f) => f !== undefined)
			out.push({
				item: -1,
				title: `Always ${cell.code} here`,
				label: null,
				code: cell.code,
				want: file === undefined ? cell.code : lookbookStem(file),
				lookbookPath: file ?? '',
				layer: layer.name,
				column: i + 1,
				columnName: names[i] ?? '',
				clipId: slot.id,
				replaces: slot.state === 'empty' ? null : { code: slotCode(slot), name: slot.name },
				why: 'fixed',
				live: slot.state === 'playing',
			})
		})
	}
	return out
}

/** Every run-sheet item's codes, into its column: what is missing from
 *  where it belongs, and what has no place. A code already in its column (any
 *  version: an old one is Update's, by `clipsToUpdate`) needs nothing. */
export function planPlacements(
	items: LookbookItem[],
	status: ArenaStatus,
	map: HoldingMap = DEFAULT_MAP,
): {
	placements: Placement[]
	unplaced: Unplaced[]
	/** Each item's column (counted from 0), for those that have one. */
	columns: Map<number, number>
	/** The column names the items were placed by. */
	names: string[]
	/** What needs nothing, and why. */
	settled: Settled[]
} {
	const today = codesOn(items)
	const layerOf = (type: string) => {
		const p = TYPE_LAYER[type]
		return p === undefined ? undefined : status.layers.find((l) => p.test(l.name.trim()))
	}
	// An item's column is found by the names over the foreground's layer
	// (HOLDING's), or the background's, or the A-screen's; its other codes go
	// in the same column on theirs.
	const home = layerOf('F') ?? layerOf('B') ?? layerOf('A')
	const names = home === undefined ? status.columns.map((c) => c.name) : columnNamesOf(home, status)
	const anyNamed = names.some((n) => !unnamed(n))
	// Columns whose items the map sets are out of the default rules' sight.
	const custom = names.flatMap((n, i) => {
		const takes = takesOf(map, n)
		return takes === undefined || unnamed(n) ? [] : [{ column: i, takes }]
	})
	const autoNames = names.map((n, i) => (custom.some((c) => c.column === i) ? '' : n))
	const promoColumns = autoNames.flatMap((n, i) => (norm(n).startsWith('PROMO') ? [i] : []))

	// Which column each item goes in. Items several columns take (the PROMO
	// columns, or columns the map gives the same words) first find the column
	// that already holds their piece, so no other item takes it.
	const columnOf = new Map<number, { column: number; why: Placement['why'] } | { none: Unplaced['kind']; detail: string }>()
	const takenPromo = new Set<number>()
	const poolOf = new Map<number, { columns: number[]; promo: boolean }>()
	for (const [i, item] of items.entries()) {
		if (arenaCodes(item, map).length === 0) continue
		if (!anyNamed) {
			columnOf.set(i, { none: 'unnamed', detail: `Arena's columns aren't named yet: name them ${COLUMN_NAMES}` })
			continue
		}
		const mine = custom.filter((c) => takesItem(c.takes, item)).map((c) => c.column)
		const named = mine.length === 0 ? namedColumn(item, autoNames) : null
		if (mine.length === 1) columnOf.set(i, { column: mine[0] as number, why: 'named' })
		else if (mine.length > 1) poolOf.set(i, { columns: mine, promo: false })
		else if (named !== null) columnOf.set(i, { column: named, why: 'named' })
		else if (isPromo(item)) poolOf.set(i, { columns: promoColumns, promo: true })
		else columnOf.set(i, { none: 'no-column', detail: `no column named ${item.label ?? item.title}` })
	}
	const promoItems = [...poolOf.keys()]
	// The item's piece: its foreground, or its background when it has none.
	const keyOf = (item: LookbookItem) => {
		const codes = arenaCodes(item, map)
		return codes.find((c) => c.type === 'F') ?? codes.find((c) => c.type === 'B') ?? codes[0]
	}
	const slotAt = (type: string, column: number) => layerOf(type)?.slots[column]
	const choose = (pass: (key: NonNullable<ReturnType<typeof keyOf>>, column: number) => number | null, why: Placement['why']) => {
		for (const i of promoItems) {
			if (columnOf.has(i)) continue
			const key = keyOf(items[i] as LookbookItem)
			if (key === undefined) continue
			let best: { column: number; score: number } | null = null
			for (const column of poolOf.get(i)?.columns ?? []) {
				if (takenPromo.has(column) || cellOf(map, names[column] ?? '', key.type).kind === 'leave') continue
				const score = pass(key, column)
				if (score !== null && (best === null || score > best.score)) best = { column, score }
			}
			if (best !== null) {
				takenPromo.add(best.column)
				columnOf.set(i, { column: best.column, why })
			}
		}
	}
	const free = (slot: ArenaSlot | undefined) => slot !== undefined && slot.state !== 'playing' && (slot.state === 'empty' || !today.has(slotCode(slot) ?? ''))
	// Already there; then an older version of it; then last week's promo; then empty.
	choose((key, column) => {
		const s = slotAt(key.type, column)
		return s !== undefined && slotCode(s) === key.code ? 1 : null
	}, 'promo-alike')
	choose((key, column) => {
		const s = slotAt(key.type, column)
		if (s === undefined || s.state === 'empty' || !free(s) || key.want === null) return null
		const score = likeness(key.want, s.file ?? s.name)
		return score >= LIKENESS_MIN ? score : null
	}, 'promo-alike')
	choose((key, column) => {
		const s = slotAt(key.type, column)
		return s !== undefined && s.state !== 'empty' && free(s) ? -column : null
	}, 'promo-free')
	choose((key, column) => (slotAt(key.type, column)?.state === 'empty' ? -column : null), 'promo-empty')
	for (const i of promoItems) {
		if (columnOf.has(i)) continue
		const pool = poolOf.get(i)
		columnOf.set(
			i,
			pool?.promo !== false
				? { none: 'no-promo', detail: promoColumns.length === 0 ? 'no PROMO columns in Arena' : 'every PROMO column is in use today' }
				: { none: 'no-promo', detail: 'every column taking it is in use today' },
		)
	}

	const placements: Placement[] = []
	const unplaced: Unplaced[] = []
	const settled: Settled[] = []
	const settle = (item: number, code: string, layer: ArenaLayer | undefined, type: string, column: number, why: Settled['why']) => {
		const names = layer === undefined ? [] : columnNamesOf(layer, status)
		settled.push({
			item,
			code,
			layer: layer?.name ?? TYPE_LAYER_NAME[type] ?? type,
			column: column + 1,
			columnName: names[column] ?? '',
			clipId: layer?.slots[column]?.id ?? null,
			why,
		})
	}
	// Overflow: each layer's spare clips, handed out in run-sheet order, and
	// which clip each code already took (a code two one-offs share takes one).
	// `claimed`: every clip an overflow placement took, by its code, so no two
	// one-offs land in one clip.
	const claimed = new Map<number, string>()
	const spare = new Map<string, { slot: ArenaSlot; column: number }[]>()
	const spareOf = (type: string, layer: ArenaLayer) => {
		let q = spare.get(type)
		if (q === undefined) spare.set(type, (q = overflowSlots(layer, status, map, type === 'B' ? today : undefined)))
		return q
	}
	const overflowed = new Map<string, Placement>()
	const normal = normalBackground(items, map)
	// Columns an item has by name: a one-off's background never replaces theirs.
	const namedColumns = new Set([...columnOf.values()].flatMap((w) => ('none' in w ? [] : [w.column])))
	const fgLayer = layerOf('F')
	const bgLayer = layerOf('B')
	const overflowPlacement = (base: { item: number; title: string; label: string | null }, c: { code: string; want: string; path: string | null }, layer: ArenaLayer, column: number): Placement => {
		const slot = layer.slots[column] as ArenaSlot
		claimed.set(slot.id, c.code)
		return {
			...base,
			code: c.code,
			want: c.want,
			lookbookPath: c.path ?? '',
			layer: layer.name,
			column: column + 1,
			columnName: columnNamesOf(layer, status)[column] ?? '',
			clipId: slot.id,
			replaces: slot.state === 'empty' ? null : { code: slotCode(slot), name: slot.name },
			why: 'overflow',
			live: false,
		}
	}
	/** Whether HOLD BG's clip in `column` (from 0) can take a one-off's
	 *  background `code`: it holds it already, or another one-off just put it
	 *  there; it is free (empty, or a code this service does not use, the owner,
	 *  2026-10-13: "replace old ones"; or the normal background, outside any
	 *  item's own column); or not (null). Never a clip on screen, a reserved
	 *  column or one the map gives to something else. */
	const bgTakes = (column: number, code: string): 'there' | 'shared' | 'free' | null => {
		const slot = bgLayer?.slots[column]
		if (bgLayer === undefined || slot === undefined) return null
		if (claimed.has(slot.id)) return claimed.get(slot.id) === code ? 'shared' : null
		if (slotCode(slot) === code) return 'there'
		if (slot.state === 'playing' || reserved(bgLayer, column + 1, status, map) || slotCell(bgLayer, column + 1, status, map).kind !== 'auto') return null
		if (slot.state === 'empty') return 'free'
		const held = slotCode(slot)
		if (held === null) return null
		if (!today.has(held)) return 'free'
		return normal !== null && held === normal.code && !namedColumns.has(column) ? 'free' : null
	}
	/** A ONE-OFF IS ONE COLUMN, ACROSS ITS LAYERS (the owner, 2026-10-13: the
	 *  column is fired, so FG and BG come up together; a one-off's background
	 *  that went elsewhere, or nowhere because its code sat in other columns,
	 *  did not follow). The foreground finds the column: where it already is on
	 *  HOLD FG (placed by hand or an earlier run), where another one-off sharing
	 *  it went, else the first empty clip past the last named column whose HOLD
	 *  BG clip can take the background too (else the first that takes the
	 *  foreground alone, the background then said). The background goes in the
	 *  same column, wherever else its code is; with none of its own, the normal
	 *  background (the owner, 2026-10-13). Returns the codes it dealt with. */
	const placeOneOff = (
		i: number,
		base: { item: number; title: string; label: string | null },
		where: { none: Unplaced['kind']; detail: string },
		codes: ReturnType<typeof arenaCodes>,
		fg: { code: string; want: string; path: string | null },
	): Set<string> => {
		const own = codes.find((c) => c.type === 'B' && c.want !== null)
		const bg = own !== undefined ? { code: own.code, want: own.want as string, path: own.path, normal: false } : normal === null ? undefined : { ...normal, normal: true }
		const done = new Set([fg.code, ...(own === undefined ? [] : [own.code])])
		if (fgLayer === undefined) return new Set()
		let column: number
		const on = fgLayer.slots.findIndex((s) => slotCode(s) === fg.code)
		const prior = overflowed.get(`F:${fg.code}`)
		if (on >= 0) {
			column = on
			settle(i, fg.code, fgLayer, 'F', on, 'on-layer')
		} else if (prior !== undefined) {
			column = prior.column - 1
			placements.push({ ...prior, ...base })
		} else {
			const last = Math.max(lastNamed(fgLayer, status), bgLayer === undefined ? -1 : lastNamed(bgLayer, status))
			const fits = lastNamed(fgLayer, status) < 0 ? [] : fgLayer.slots.flatMap((slot, c) =>
				c > last && slot.state === 'empty' && !claimed.has(slot.id) && !reserved(fgLayer, c + 1, status, map) && slotCell(fgLayer, c + 1, status, map).kind === 'auto' ? [c] : [],
			)
			const pick = fits.find((c) => bg === undefined || bgTakes(c, bg.code) !== null) ?? fits[0]
			if (pick === undefined) {
				const lastName = columnNamesOf(fgLayer, status)[last] ?? ''
				const detail = `${where.detail}, and no empty clip left on ${fgLayer.name} after ${lastName} (column ${last + 1})`
				unplaced.push({ ...base, code: fg.code, want: fg.want, kind: where.none, detail, didntFit: true })
				if (own !== undefined) unplaced.push({ ...base, code: own.code, want: own.want, kind: where.none, detail: `goes with ${fg.code}, which didn't fit`, didntFit: true })
				return done
			}
			column = pick
			const p = overflowPlacement(base, fg, fgLayer, column)
			overflowed.set(`F:${fg.code}`, p)
			placements.push(p)
		}
		if (bg === undefined || bgLayer === undefined) return done
		const takes = bgTakes(column, bg.code)
		if (takes === 'there') {
			if (!bg.normal) settle(i, bg.code, bgLayer, 'B', column, 'in-column')
		} else if (takes === 'shared') {
			const first = placements.find((p) => p.clipId === bgLayer.slots[column]?.id)
			if (first !== undefined) placements.push({ ...first, ...base })
		} else if (takes === 'free') {
			placements.push(overflowPlacement(base, bg, bgLayer, column))
		} else if (!bg.normal) {
			const slot = bgLayer.slots[column]
			const held = slot === undefined ? null : slotCode(slot)
			const why = slot === undefined ? 'there is no clip there' : slot.state === 'playing' ? 'that clip is on screen' : held === null ? `it holds ${slot.name}, which is not the lookbook's` : `it holds ${held}, which this service uses`
			unplaced.push({ ...base, code: bg.code, want: bg.want, kind: where.none, detail: `${fg.code} is in column ${column + 1}, but ${bgLayer.name} there can't take its background: ${why}` })
		}
		return done
	}
	for (const [i, item] of items.entries()) {
		const where = columnOf.get(i)
		if (where === undefined) continue
		const base = { item: i, title: item.title, label: item.label }
		const codes = arenaCodes(item, map)
		const oneOffItem = 'none' in where && (where.none === 'no-column' || where.none === 'no-promo')
		const fg = oneOffItem ? codes.find((c) => c.type === 'F' && c.want !== null) : undefined
		const dealt = fg !== undefined && 'none' in where ? placeOneOff(i, base, where, codes, { code: fg.code, want: fg.want as string, path: fg.path }) : new Set<string>()
		for (const c of codes) {
			if (dealt.has(c.code)) continue
			if ('none' in where) {
				// A one-off already on its layer was placed by hand: done.
				const oneOff = where.none === 'no-column' || where.none === 'no-promo'
				const layer = layerOf(c.type)
				const onLayer = oneOff ? (layer?.slots.findIndex((s) => slotCode(s) === c.code) ?? -1) : -1
				if (onLayer >= 0) {
					settle(i, c.code, layer, c.type, onLayer, 'on-layer')
					continue
				}
				if (oneOff && OVERFLOWS.has(c.type) && c.want !== null && layer !== undefined) {
					const key = `${c.type}:${c.code}`
					const taken = overflowed.get(key)
					if (taken !== undefined) {
						placements.push({ ...taken, ...base })
						continue
					}
					const queue = spareOf(c.type, layer)
					let next = queue.shift()
					while (next !== undefined && claimed.has(next.slot.id)) next = queue.shift()
					if (next !== undefined) {
						const p = overflowPlacement(base, { code: c.code, want: c.want, path: c.path }, layer, next.column - 1)
						overflowed.set(key, p)
						placements.push(p)
						continue
					}
					const last = lastNamed(layer, status)
					const lastName = columnNamesOf(layer, status)[last] ?? ''
					unplaced.push({
						...base,
						code: c.code,
						want: c.want,
						kind: where.none,
						detail: `${where.detail}, and no ${c.type === 'B' ? 'free' : 'empty'} clip left on ${layer.name} after ${lastName} (column ${last + 1})`,
						didntFit: true,
					})
					continue
				}
				unplaced.push({ ...base, code: c.code, want: c.want, kind: where.none, detail: where.detail })
				continue
			}
			if (c.want === null) {
				unplaced.push({ ...base, code: c.code, want: null, kind: 'no-file', detail: 'the lookbook has no file' })
				continue
			}
			// The map's word on this cell: left alone, the normal background's,
			// or a fixed code's (placed by `fixedPlacements`): not the item's.
			const cell = cellOf(map, names[where.column] ?? '', c.type)
			const layer = layerOf(c.type)
			if (cell.kind === 'leave' || cell.kind === 'fixed' || (cell.kind === 'normal' && c.type === 'B')) {
				settle(i, c.code, layer, c.type, where.column, cell.kind)
				continue
			}
			const slot = layer?.slots[where.column]
			if (layer === undefined || slot === undefined) {
				unplaced.push({ ...base, code: c.code, want: c.want, kind: 'no-layer', detail: `no ${TYPE_LAYER_NAME[c.type] ?? 'such'} layer in this composition` })
				continue
			}
			if (slotCode(slot) === c.code) {
				settle(i, c.code, layer, c.type, where.column, 'in-column')
				continue
			}
			placements.push({
				...base,
				code: c.code,
				want: c.want,
				lookbookPath: c.path ?? '',
				layer: layer.name,
				column: where.column + 1,
				columnName: columnNamesOf(layer, status)[where.column] || (names[where.column] ?? ''),
				clipId: slot.id,
				replaces: slot.state === 'empty' ? null : { code: slotCode(slot), name: slot.name },
				why: where.why,
				live: slot.state === 'playing',
			})
		}
	}
	placements.push(...fixedPlacements(items, status, map))
	const columns = new Map<number, number>()
	for (const [i, where] of columnOf) if (!('none' in where)) columns.set(i, where.column)
	return { placements, unplaced, columns, names, settled }
}

/** The background the rest of the service uses (the owner, 2026-10-06): the
 *  commonest B code among the items that are not Doors Open, Pre & Post,
 *  Preach or an announcement, the earliest on a tie. Null when none of them
 *  has one the lookbook has a file for: said, not guessed from the others. */
export function normalBackground(items: LookbookItem[], map: HoldingMap = DEFAULT_MAP): { code: string; want: string; path: string } | null {
	const counts = new Map<string, { code: string; want: string; path: string; n: number }>()
	for (const item of items) {
		if (isPre(item) || isPost(item) || isPrePost(item) || isPreach(item) || isPromo(item)) continue
		for (const c of arenaCodes(item, map)) {
			if (c.type !== 'B' || c.want === null || c.path === null) continue
			const seen = counts.get(c.code)
			if (seen === undefined) counts.set(c.code, { code: c.code, want: c.want, path: c.path, n: 1 })
			else seen.n += 1
		}
	}
	let best: { code: string; want: string; path: string; n: number } | null = null
	for (const c of counts.values()) if (best === null || c.n > best.n) best = c
	return best === null ? null : { code: best.code, want: best.want, path: best.path }
}

/** The HOLD BG slots the normal background goes into (the owner, 2026-10-06:
 *  "update all the backgrounds in the bg layer up to promo 6, including the
 *  blank ones"): from the first column to the last PROMO, every slot no
 *  run-sheet item's own background claims (those are `planPlacements`'),
 *  that is empty or holds a code this service does not use. Never a column
 *  named for something else, a clip on screen or one with no code. Nothing
 *  while the columns have no PROMO, since then where to stop is unknown. */
export function backgroundGaps(items: LookbookItem[], status: ArenaStatus, map: HoldingMap = DEFAULT_MAP): Placement[] {
	const normal = normalBackground(items, map)
	const layer = status.layers.find((l) => TYPE_LAYER['B']?.test(l.name.trim()))
	if (normal === null || layer === undefined) return []
	const names = columnNamesOf(layer, status)
	const today = codesOn(items)
	// A clip a run-sheet item takes (its own column, or overflow) is the
	// item's: overflow comes first, though by the rules the two never meet.
	const taken = new Set(planPlacements(items, status, map).placements.map((p) => p.clipId))
	return fillColumns(items, status, map).flatMap((column): Placement[] => {
		const slot = layer.slots[column - 1]
		if (slot === undefined || slot.state === 'playing' || taken.has(slot.id)) return []
		const code = slotCode(slot)
		if (slot.state !== 'empty' && (code === null || today.has(code))) return []
		return [
			{
				item: -1,
				title: 'The normal background',
				label: null,
				code: normal.code,
				want: normal.want,
				lookbookPath: normal.path,
				layer: layer.name,
				column,
				columnName: names[column - 1] ?? '',
				clipId: slot.id,
				replaces: slot.state === 'empty' ? null : { code, name: slot.name },
				why: 'fill',
				live: false,
			},
		]
	})
}

/** A column named for the video / broadcast background, the vignetted black
 *  behind videos at the other campuses: never filled. */
const videoBackground = (name: string) => /video|broadcast/i.test(name)

/** The HOLD BG columns (counted from 1) the normal background is for, whatever
 *  they hold now: up to the last PROMO, not claimed by an item's own
 *  background, not a video background. The Countdown column and Central's
 *  unnamed 3 and 4 are filled (the owner, 2026-10-06: "yes they should"),
 *  though nothing else is placed there. A one-off background may be
 *  chosen into one that holds the normal background, as into a free slot. */
export function fillColumns(items: LookbookItem[], status: ArenaStatus, map: HoldingMap = DEFAULT_MAP): number[] {
	const layer = status.layers.find((l) => TYPE_LAYER['B']?.test(l.name.trim()))
	if (layer === undefined || normalBackground(items, map) === null) return []
	const names = columnNamesOf(layer, status)
	const last = names.reduce((at, n, i) => (norm(n).startsWith('PROMO') ? i : at), -1)
	const { columns } = planPlacements(items, status, map)
	const claimed = new Set<number>()
	for (const [i, column] of columns) if (arenaCodes(items[i] as LookbookItem, map).some((c) => c.type === 'B')) claimed.add(column)
	const out: number[] = []
	for (let column = 0; column < layer.slots.length; column++) {
		// The map's word first: normal anywhere it says so, nothing where it
		// says the item only, a fixed code or leave alone.
		const cell = cellOf(map, names[column] ?? '', 'B')
		if (cell.kind === 'normal') out.push(column + 1)
		else if (cell.kind === 'auto' && column <= last && !claimed.has(column) && !videoBackground(names[column] ?? '')) out.push(column + 1)
	}
	return out
}

/** Every clip carrying `code` that is not the lookbook's `want`, or whose file
 *  is missing: an update loads the new file into all of them, not only the
 *  first (CB095 sits in 18 columns of HOLD BG). Confirmed-same clips are left. */
export function clipsToUpdate(
	code: string,
	want: string,
	wantPath: string,
	status: ArenaStatus,
	marks: ReadonlySet<string>,
	sizes?: FileSizes,
	map: HoldingMap = DEFAULT_MAP,
): number[] {
	const out: number[] = []
	for (const layer of status.layers) {
		for (const [i, slot] of layer.slots.entries()) {
			if (slotCode(slot) !== code) continue
			// Left alone means left alone: not even a newer file.
			if (slotCell(layer, i + 1, status, map).kind === 'leave') continue
			if (slot.missingFile !== null) {
				out.push(slot.id)
				continue
			}
			if (slot.file === null) continue
			if (sameFile(slot.file, wantPath, want, sizes)) continue
			if (marks.has(sameKey(code, slot.file, want))) continue
			out.push(slot.id)
		}
	}
	return out
}

/** Where a placement goes, said: `HOLD FG · POST (column 2), replacing CF445`. */
export function placementWords(p: Placement): string {
	const column = unnamed(p.columnName) ? `column ${p.column}` : `${p.columnName} (column ${p.column})`
	const extra = p.why === 'overflow' ? (p.replaces === null ? ', an empty clip past the named columns' : ', past the named columns') : p.why === 'fixed' ? ', its fixed code' : ''
	return `${p.layer} · ${column}${extra}${p.replaces === null ? '' : `, replacing ${p.replaces.code ?? p.replaces.name}`}`
}

/** One line of a confirmation, to show before it runs. */
export type UpdateStep = { request: FetchRequest; what: string }

/** What Update all would do, one step per code: its file into every clip
 *  with an old or missing version, into every column it is missing from, and
 *  the normal background into HOLD BG's gaps (`backgroundGaps`). What has no
 *  place is listed apart, never guessed. */
export function updatePlan(
	items: LookbookItem[],
	status: ArenaStatus,
	marks: ReadonlySet<string>,
	sizes?: FileSizes,
	map: HoldingMap = DEFAULT_MAP,
): { steps: UpdateStep[]; unplaced: Unplaced[] } {
	const { placements, unplaced } = planPlacements(items, status, map)
	const byCode = new Map<string, { want: string; path: string | null; update: number[]; place: Placement[] }>()
	for (const item of items) {
		for (const c of arenaCodes(item, map)) {
			if (c.want === null || byCode.has(c.code)) continue
			byCode.set(c.code, { want: c.want, path: c.path, update: clipsToUpdate(c.code, c.want, c.path ?? '', status, marks, sizes, map), place: [] })
		}
	}
	for (const p of placements) {
		// A fixed code the run sheet does not name has its own step.
		if (!byCode.has(p.code)) byCode.set(p.code, { want: p.want, path: p.lookbookPath === '' ? null : p.lookbookPath, update: [], place: [] })
		byCode.get(p.code)?.place.push(p)
	}
	const fill = backgroundGaps(items, status, map)
	const steps: UpdateStep[] = []
	for (const [code, { want, path, update, place }] of byCode) {
		const step = stepFor(code, want, path, update, place, fill.filter((p) => p.code === code))
		if (step !== null) steps.push(step)
	}
	return { steps, unplaced }
}

/** One code's step: its file into the clips with an old one, the slots it
 *  is placed in and the gaps it fills, or null when there is nothing to do. */
function stepFor(code: string, want: string, path: string | null, update: number[], place: Placement[], fill: Placement[] = []): UpdateStep | null {
	const clipIds = [...new Set([...update, ...place.map((p) => p.clipId), ...fill.map((p) => p.clipId)])]
	if (clipIds.length === 0) return null
	// Two items sharing an overflow clip: said once.
	place = place.filter((p, i) => place.findIndex((q) => q.clipId === p.clipId) === i)
	const gaps = fill.map((p) => (unnamed(p.columnName) ? `${p.column}` : p.columnName))
	const parts = [
		...(update.length === 0 ? [] : [update.length === 1 ? 'its clip with the old file' : `its ${update.length} clips with the old file`]),
		...place.map(placementWords),
		...(fill.length === 0 ? [] : [`the gaps in ${fill[0]?.layer} as the normal background (${gaps.join(', ')})`]),
	]
	return { request: { code, want, clipIds, lookbookPath: path, allowLookbook: false, allowLive: [] }, what: `${code} into ${parts.join('; ')}` }
}

/** A clip to empty: where it is, and the code it must still hold when main
 *  empties it, so a slot that changed since the confirmation is left alone. */
export type OldClip = { clipId: number; code: string; layer: string; column: number; columnName: string }

/** Old foregrounds (the owner, 2026-10-05: "a clear old FGs button when
 *  updating all", asked, not done unasked): clips on HOLD FG whose code this
 *  run sheet does not use, so last week's announcements cannot be fired by
 *  mistake. Not one on screen, not one in a column named for something else
 *  (COUNTDOWN), not one without a code (not the lookbook's), and not one
 *  `excluding` names (an update is about to load into it). */
export function oldForegrounds(
	items: LookbookItem[],
	status: ArenaStatus,
	excluding: ReadonlySet<number> = new Set(),
	map: HoldingMap = DEFAULT_MAP,
): OldClip[] {
	const layer = status.layers.find((l) => TYPE_LAYER['F']?.test(l.name.trim()))
	if (layer === undefined || items.length === 0) return []
	const today = codesOn(items)
	const names = columnNamesOf(layer, status)
	return layer.slots.flatMap((slot, i) => {
		const code = slotCode(slot)
		if (slot.state !== 'loaded' || code === null || today.has(code) || excluding.has(slot.id) || reserved(layer, i + 1, status, map)) return []
		// A fixed code is meant to be there, run sheet or not.
		if (slotCell(layer, i + 1, status, map).kind === 'fixed') return []
		return [{ clipId: slot.id, code, layer: layer.name, column: i + 1, columnName: unnamed(names[i] ?? '') ? `column ${i + 1}` : (names[i] ?? '') }]
	})
}

/** What one code of a run-sheet item is in Arena, for the Lookbook view:
 *  - `ready`: in its column, the lookbook's file, found on this computer
 *  - `place`: not yet in its column
 *  - `look`: its file may differ or differs from the lookbook's somewhere
 *  - `missing`: a clip carrying it cannot find its file
 *  - `no-place`: it has no column (a one-off) or no layer, said, not guessed
 *  - `no-file`: the lookbook has no file for it
 *  - `not-arena`: not Arena's (a lower third, a countdown) */
export type CodeState = 'ready' | 'place' | 'look' | 'missing' | 'no-place' | 'no-file' | 'not-arena'

/** One moment of the service as the Lookbook view draws it. */
export type Look = {
	item: number
	codes: { code: string; type: string; state: CodeState }[]
	/** Its column, counted from 1, and that column's name, when it has one. */
	column: { number: number; name: string } | null
	/** Something of it is on screen in Arena now: a clip of its codes playing in its column. */
	live: boolean
	/** Everything of Arena's is where it belongs and right. */
	ready: boolean
}

/** Every run-sheet item as a look: what each of its codes is in Arena. */
export function looksOf(items: LookbookItem[], status: ArenaStatus, marks: ReadonlySet<string>, sizes?: FileSizes, map: HoldingMap = DEFAULT_MAP): Look[] {
	const { placements, unplaced, columns, names } = planPlacements(items, status, map)
	const today = codesOn(items)
	// A code's worst mark over every clip carrying it: one of CB095's eighteen
	// with an old file is enough to look at.
	const worst = new Map<string, SlotMark>()
	for (const layer of status.layers) {
		for (const slot of layer.slots) {
			const code = slotCode(slot)
			if (code === null || !today.has(code)) continue
			const mark = slotMark(slot, items, today, marks, sizes)
			if (mark === 'missing' || (mark !== 'today' && mark !== 'confirmed' && worst.get(code) !== 'missing')) worst.set(code, mark)
		}
	}
	return items.map((item, i) => {
		const column = columns.get(i)
		const codes = arenaCodesAll(item).map(({ code, type }) => {
			const state: CodeState = layerOfCode(map, code) === null
				? 'not-arena'
				: item.files[code] === undefined
					? 'no-file'
					: unplaced.some((u) => u.item === i && u.code === code)
						? 'no-place'
						: placements.some((p) => p.item === i && p.code === code)
							? 'place'
							: worst.get(code) === 'missing'
								? 'missing'
								: worst.has(code)
									? 'look'
									: 'ready'
			return { code, type, state }
		})
		const live =
			column !== undefined &&
			codes.some(({ code }) => status.layers.some((l) => l.slots[column]?.state === 'playing' && slotCode(l.slots[column] as ArenaSlot) === code))
		return {
			item: i,
			codes,
			column: column === undefined ? null : { number: column + 1, name: names[column] ?? '' },
			live,
			// The lookbook having no file is the lookbook's to fix, not Arena's.
			ready: codes.every((c) => c.state === 'ready' || c.state === 'not-arena' || c.state === 'no-file'),
		}
	})
}

/** Every code on an item, each once, with its type letter, in the note's order. */
function arenaCodesAll(item: LookbookItem): { code: string; type: string }[] {
	const out: { code: string; type: string }[] = []
	for (const raw of item.codes) {
		const c = mediaCodeOf(raw)
		if (c !== null && !out.some((o) => o.code === c.code)) out.push({ code: c.code, type: c.type })
	}
	return out
}

/** What loading one look would do: each of its codes into the clips with an
 *  old file and into its column. A code it shares with other items (a
 *  background) is updated everywhere it is old, since a code is one piece,
 *  but placed only in this item's column. */
export function lookSteps(
	index: number,
	items: LookbookItem[],
	status: ArenaStatus,
	marks: ReadonlySet<string>,
	sizes?: FileSizes,
	map: HoldingMap = DEFAULT_MAP,
): UpdateStep[] {
	const item = items[index]
	if (item === undefined) return []
	const { placements } = planPlacements(items, status, map)
	const steps: UpdateStep[] = []
	for (const c of arenaCodes(item, map)) {
		if (c.want === null) continue
		const update = clipsToUpdate(c.code, c.want, c.path ?? '', status, marks, sizes, map)
		const step = stepFor(c.code, c.want, c.path, update, placements.filter((p) => p.item === index && p.code === c.code))
		if (step !== null) steps.push(step)
	}
	return steps
}

/** One code of one moment, as the plan says it: what will happen to it, or why
 *  nothing will. `do`: Update all would load it somewhere; `ok`: nothing to
 *  do, and why; `warn`: it has no place, or no file; `quiet`: not Arena's. */
export type PlanNote = { code: string; tone: 'do' | 'ok' | 'warn' | 'quiet'; words: string; clipId: number | null }

/** One moment of the run sheet in the plan, or (`item` -1) a step no moment
 *  owns: the normal background's gaps, a fixed code. */
export type PlanLine = { item: number; title: string; label: string | null; notes: PlanNote[] }

/** Where a column is, said: `PROMO 2 (column 10)`, or `column 13`. */
function columnWords(name: string, column: number): string {
	return unnamed(name) ? `column ${column}` : `${name} (column ${column})`
}

/** The plan, in words (the owner, 2026-10-13): every moment of the run sheet,
 *  each of its codes, and what Update all would do with it or why it would do
 *  nothing. The same rules as `updatePlan`, read back, never a second guess. */
export function explainPlan(
	items: LookbookItem[],
	status: ArenaStatus,
	marks: ReadonlySet<string>,
	sizes?: FileSizes,
	map: HoldingMap = DEFAULT_MAP,
): PlanLine[] {
	const { placements, unplaced, settled } = planPlacements(items, status, map)
	const today = codesOn(items)
	const confirmed = new Set<string>()
	for (const layer of status.layers) {
		for (const slot of layer.slots) {
			const code = slotCode(slot)
			if (code !== null && today.has(code) && slotMark(slot, items, today, marks, sizes) === 'confirmed') confirmed.add(code)
		}
	}
	const lines: PlanLine[] = items.map((item, i) => {
		const notes = arenaCodesAll(item).map(({ code, type }): PlanNote => {
			if (layerOfCode(map, code) === null) return { code, tone: 'quiet', words: `not Arena\u2019s (${TYPE_NAMES[type] ?? 'another program'})`, clipId: null }
			const file = item.files[code]
			if (file === undefined) return { code, tone: 'warn', words: 'the lookbook has no file for it', clipId: null }
			const lost = unplaced.find((u) => u.item === i && u.code === code)
			if (lost !== undefined) return { code, tone: 'warn', words: lost.didntFit === true ? `didn't fit: ${lost.detail}` : `no place: ${lost.detail}`, clipId: null }
			const update = clipsToUpdate(code, lookbookStem(file), file, status, marks, sizes, map)
			const old = update.length === 0 ? null : update.length === 1 ? 'its clip with another file gets the lookbook’s' : `its ${update.length} clips with another file get the lookbook’s`
			const placed = placements.filter((p) => p.item === i && p.code === code)
			if (placed.length > 0) {
				const words = [`into ${placed.map(placementWords).join('; ')}`, ...(old === null ? [] : [old])].join('; ')
				return { code, tone: 'do', words, clipId: placed[0]?.clipId ?? null }
			}
			const s = settled.find((x) => x.item === i && x.code === code)
			const where = s === undefined ? '' : `${s.layer} · ${columnWords(s.columnName, s.column)}`
			const settledWords =
				s === undefined
					? 'nothing to place'
					: s.why === 'in-column'
						? `in ${where}`
						: s.why === 'on-layer'
							? `no column of its own; already in ${where}`
							: s.why === 'leave'
								? `${where} is Leave alone (Settings › Holding)`
								: s.why === 'fixed'
									? `${where} holds a fixed code (Settings › Holding)`
									: `${where} takes the normal background (Settings › Holding)`
			if (old !== null) return { code, tone: 'do', words: `${settledWords}; ${old}`, clipId: update[0] ?? null }
			const sure = confirmed.has(code) ? '; confirmed the same by hand' : ''
			return { code, tone: 'ok', words: `${settledWords}${sure}`, clipId: s?.clipId ?? null }
		})
		// What goes with a moment that is not one of its codes: the normal
		// background into a one-off's column.
		const own = new Set(notes.map((n) => n.code))
		for (const p of placements) {
			if (p.item !== i || own.has(p.code)) continue
			own.add(p.code)
			notes.push({ code: p.code, tone: 'do', words: `the normal background, into ${placementWords(p)}`, clipId: p.clipId })
		}
		return { item: i, title: item.title, label: item.label, notes }
	})
	const fill = backgroundGaps(items, status, map)
	const first = fill[0]
	if (first !== undefined) {
		const gaps = fill.map((p) => (unnamed(p.columnName) ? `${p.column}` : p.columnName))
		lines.push({
			item: -1,
			title: 'The normal background',
			label: null,
			notes: [{ code: first.code, tone: 'do', words: `into the gaps in ${first.layer}: ${gaps.join(', ')}`, clipId: first.clipId }],
		})
	}
	for (const p of placements.filter((x) => x.why === 'fixed')) {
		lines.push({ item: -1, title: p.title, label: null, notes: [{ code: p.code, tone: 'do', words: `into ${placementWords(p)}`, clipId: p.clipId }] })
	}
	return lines
}
