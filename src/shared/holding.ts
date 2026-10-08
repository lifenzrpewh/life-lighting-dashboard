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

import type { ArenaLayer, ArenaSlot, ArenaStatus } from './arena.js'
import { ARENA_TYPES, fileStem, lookbookStem, mediaCodeOf, sameFile, sameKey, type FileSizes, type LookbookItem } from './media-check.js'
import type { FetchRequest } from './media-fetch.js'

/** Each type's layer, by name. The A-screen layer was PRE & POST until the
 *  owner renamed it A SCREEN BG (2026-10-05); a campus not yet renamed still
 *  works. */
export const TYPE_LAYER: Record<string, RegExp> = {
	B: /^hold\s*bg$/i,
	F: /^hold\s*fg$/i,
	A: /^(?:a\s*screens?\s*bg|pre\s*(?:&|and)?\s*post)$/i,
}
const TYPE_LAYER_NAME: Record<string, string> = { B: 'HOLD BG', F: 'HOLD FG', A: 'A SCREEN BG' }

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
export function reserved(layer: ArenaLayer, column: number, status: ArenaStatus): boolean {
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
	why: 'named' | 'promo-alike' | 'promo-free' | 'promo-empty' | 'chosen' | 'fill' | 'overflow'
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

/** The layer's last named column, counted from 0, or -1 when none is named. */
function lastNamed(layer: ArenaLayer, status: ArenaStatus): number {
	return columnNamesOf(layer, status).reduce((at, n, i) => (unnamed(n) ? at : i), -1)
}

/** Where overflow goes on a layer (the owner, 2026-10-08): its empty clips
 *  after its last named column, left to right, each with its column counted
 *  from 1. Never a loaded clip or one on screen, never a reserved column, and
 *  none while the layer's columns are not named. */
export function overflowSlots(layer: ArenaLayer, status: ArenaStatus): { slot: ArenaSlot; column: number }[] {
	const last = lastNamed(layer, status)
	if (last < 0) return []
	return layer.slots.flatMap((slot, i) => (i > last && slot.state === 'empty' && !reserved(layer, i + 1, status) ? [{ slot, column: i + 1 }] : []))
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

/** The Arena codes an item calls for, each with the lookbook's file name. */
function arenaCodes(item: LookbookItem): { code: string; type: string; want: string | null; path: string | null }[] {
	const out: { code: string; type: string; want: string | null; path: string | null }[] = []
	for (const raw of item.codes) {
		const c = mediaCodeOf(raw)
		if (c === null || !ARENA_TYPES.includes(c.type) || out.some((o) => o.code === c.code)) continue
		const file = item.files[c.code]
		out.push({ code: c.code, type: c.type, want: file === undefined ? null : lookbookStem(file), path: file ?? null })
	}
	return out
}

/** Every run-sheet item's codes, into its column: what is missing from
 *  where it belongs, and what has no place. A code already in its column (any
 *  version: an old one is Update's, by `clipsToUpdate`) needs nothing. */
export function planPlacements(
	items: LookbookItem[],
	status: ArenaStatus,
): {
	placements: Placement[]
	unplaced: Unplaced[]
	/** Each item's column (counted from 0), for those that have one. */
	columns: Map<number, number>
	/** The column names the items were placed by. */
	names: string[]
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
	const promoColumns = names.flatMap((n, i) => (norm(n).startsWith('PROMO') ? [i] : []))

	// Which column each item goes in. PROMO items first find the column that
	// already holds their piece, so no other item takes it.
	const columnOf = new Map<number, { column: number; why: Placement['why'] } | { none: Unplaced['kind']; detail: string }>()
	const takenPromo = new Set<number>()
	const promoItems: number[] = []
	for (const [i, item] of items.entries()) {
		if (arenaCodes(item).length === 0) continue
		if (!anyNamed) {
			columnOf.set(i, { none: 'unnamed', detail: `Arena's columns aren't named yet: name them ${COLUMN_NAMES}` })
			continue
		}
		const named = namedColumn(item, names)
		if (named !== null) columnOf.set(i, { column: named, why: 'named' })
		else if (isPromo(item)) promoItems.push(i)
		else columnOf.set(i, { none: 'no-column', detail: `no column named ${item.label ?? item.title}` })
	}
	// The item's piece: its foreground, or its background when it has none.
	const keyOf = (item: LookbookItem) => {
		const codes = arenaCodes(item)
		return codes.find((c) => c.type === 'F') ?? codes.find((c) => c.type === 'B') ?? codes[0]
	}
	const slotAt = (type: string, column: number) => layerOf(type)?.slots[column]
	const choose = (pass: (key: NonNullable<ReturnType<typeof keyOf>>, column: number) => number | null, why: Placement['why']) => {
		for (const i of promoItems) {
			if (columnOf.has(i)) continue
			const key = keyOf(items[i] as LookbookItem)
			if (key === undefined) continue
			let best: { column: number; score: number } | null = null
			for (const column of promoColumns) {
				if (takenPromo.has(column)) continue
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
		if (!columnOf.has(i)) columnOf.set(i, { none: 'no-promo', detail: promoColumns.length === 0 ? 'no PROMO columns in Arena' : 'every PROMO column is in use today' })
	}

	const placements: Placement[] = []
	const unplaced: Unplaced[] = []
	// Overflow: each layer's spare clips, handed out in run-sheet order, and
	// which clip each code already took (a code two one-offs share takes one).
	const spare = new Map<string, { slot: ArenaSlot; column: number }[]>()
	const spareOf = (type: string, layer: ArenaLayer) => {
		let q = spare.get(type)
		if (q === undefined) spare.set(type, (q = overflowSlots(layer, status)))
		return q
	}
	const overflowed = new Map<string, Placement>()
	for (const [i, item] of items.entries()) {
		const where = columnOf.get(i)
		if (where === undefined) continue
		const base = { item: i, title: item.title, label: item.label }
		for (const c of arenaCodes(item)) {
			if ('none' in where) {
				// A one-off already on its layer was placed by hand: done.
				const oneOff = where.none === 'no-column' || where.none === 'no-promo'
				const layer = layerOf(c.type)
				if (oneOff && layer?.slots.some((s) => slotCode(s) === c.code) === true) continue
				if (oneOff && OVERFLOWS.has(c.type) && c.want !== null && layer !== undefined) {
					const key = `${c.type}:${c.code}`
					const taken = overflowed.get(key)
					if (taken !== undefined) {
						placements.push({ ...taken, ...base })
						continue
					}
					const next = spareOf(c.type, layer).shift()
					if (next !== undefined) {
						const p: Placement = {
							...base,
							code: c.code,
							want: c.want,
							lookbookPath: c.path ?? '',
							layer: layer.name,
							column: next.column,
							columnName: columnNamesOf(layer, status)[next.column - 1] ?? '',
							clipId: next.slot.id,
							replaces: null,
							why: 'overflow',
							live: false,
						}
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
						detail: `${where.detail}, and no empty clip left on ${layer.name} after ${lastName} (column ${last + 1})`,
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
			const layer = layerOf(c.type)
			const slot = layer?.slots[where.column]
			if (layer === undefined || slot === undefined) {
				unplaced.push({ ...base, code: c.code, want: c.want, kind: 'no-layer', detail: `no ${TYPE_LAYER_NAME[c.type] ?? 'such'} layer in this composition` })
				continue
			}
			if (slotCode(slot) === c.code) continue
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
	const columns = new Map<number, number>()
	for (const [i, where] of columnOf) if (!('none' in where)) columns.set(i, where.column)
	return { placements, unplaced, columns, names }
}

/** The background the rest of the service uses (the owner, 2026-10-06): the
 *  commonest B code among the items that are not Doors Open, Pre & Post,
 *  Preach or an announcement, the earliest on a tie. Null when none of them
 *  has one the lookbook has a file for: said, not guessed from the others. */
export function normalBackground(items: LookbookItem[]): { code: string; want: string; path: string } | null {
	const counts = new Map<string, { code: string; want: string; path: string; n: number }>()
	for (const item of items) {
		if (isPre(item) || isPost(item) || isPrePost(item) || isPreach(item) || isPromo(item)) continue
		for (const c of arenaCodes(item)) {
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
export function backgroundGaps(items: LookbookItem[], status: ArenaStatus): Placement[] {
	const normal = normalBackground(items)
	const layer = status.layers.find((l) => TYPE_LAYER['B']?.test(l.name.trim()))
	if (normal === null || layer === undefined) return []
	const names = columnNamesOf(layer, status)
	const today = codesOn(items)
	// A clip a run-sheet item takes (its own column, or overflow) is the
	// item's: overflow comes first, though by the rules the two never meet.
	const taken = new Set(planPlacements(items, status).placements.map((p) => p.clipId))
	return fillColumns(items, status).flatMap((column): Placement[] => {
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
export function fillColumns(items: LookbookItem[], status: ArenaStatus): number[] {
	const layer = status.layers.find((l) => TYPE_LAYER['B']?.test(l.name.trim()))
	if (layer === undefined || normalBackground(items) === null) return []
	const last = columnNamesOf(layer, status).reduce((at, n, i) => (norm(n).startsWith('PROMO') ? i : at), -1)
	const { columns } = planPlacements(items, status)
	const claimed = new Set<number>()
	for (const [i, column] of columns) if (arenaCodes(items[i] as LookbookItem).some((c) => c.type === 'B')) claimed.add(column)
	const out: number[] = []
	for (let column = 0; column <= last && column < layer.slots.length; column++) {
		if (!claimed.has(column) && !videoBackground(columnNamesOf(layer, status)[column] ?? '')) out.push(column + 1)
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
): number[] {
	const out: number[] = []
	for (const layer of status.layers) {
		for (const slot of layer.slots) {
			if (slotCode(slot) !== code) continue
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
	const extra = p.why === 'overflow' ? ', an empty clip past the named columns' : ''
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
): { steps: UpdateStep[]; unplaced: Unplaced[] } {
	const { placements, unplaced } = planPlacements(items, status)
	const byCode = new Map<string, { want: string; path: string | null; update: number[]; place: Placement[] }>()
	for (const item of items) {
		for (const c of arenaCodes(item)) {
			if (c.want === null || byCode.has(c.code)) continue
			byCode.set(c.code, { want: c.want, path: c.path, update: clipsToUpdate(c.code, c.want, c.path ?? '', status, marks, sizes), place: [] })
		}
	}
	for (const p of placements) byCode.get(p.code)?.place.push(p)
	const fill = backgroundGaps(items, status)
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
export function oldForegrounds(items: LookbookItem[], status: ArenaStatus, excluding: ReadonlySet<number> = new Set()): OldClip[] {
	const layer = status.layers.find((l) => TYPE_LAYER['F']?.test(l.name.trim()))
	if (layer === undefined || items.length === 0) return []
	const today = codesOn(items)
	const names = columnNamesOf(layer, status)
	return layer.slots.flatMap((slot, i) => {
		const code = slotCode(slot)
		if (slot.state !== 'loaded' || code === null || today.has(code) || excluding.has(slot.id) || reserved(layer, i + 1, status)) return []
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
export function looksOf(items: LookbookItem[], status: ArenaStatus, marks: ReadonlySet<string>, sizes?: FileSizes): Look[] {
	const { placements, unplaced, columns, names } = planPlacements(items, status)
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
			const state: CodeState = !ARENA_TYPES.includes(type)
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
export function lookSteps(index: number, items: LookbookItem[], status: ArenaStatus, marks: ReadonlySet<string>, sizes?: FileSizes): UpdateStep[] {
	const item = items[index]
	if (item === undefined) return []
	const { placements } = planPlacements(items, status)
	const steps: UpdateStep[] = []
	for (const c of arenaCodes(item)) {
		if (c.want === null) continue
		const update = clipsToUpdate(c.code, c.want, c.path ?? '', status, marks, sizes)
		const step = stepFor(c.code, c.want, c.path, update, placements.filter((p) => p.item === index && p.code === c.code))
		if (step !== null) steps.push(step)
	}
	return steps
}
