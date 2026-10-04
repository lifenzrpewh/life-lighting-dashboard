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
// Also the owner's: B on HOLD BG, F on HOLD FG, A on PRE & POST; nothing from
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

/** Each type's layer, by name. */
const TYPE_LAYER: Record<string, RegExp> = {
	B: /^hold\s*bg$/i,
	F: /^hold\s*fg$/i,
	A: /^pre\s*(?:&|and)?\s*post$/i,
}
const TYPE_LAYER_NAME: Record<string, string> = { B: 'HOLD BG', F: 'HOLD FG', A: 'PRE & POST' }

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
 *  HOLDING's and PRE & POST, PLAYBACK last as it is rarely used. */
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
	/** Its own column by name, or which PROMO column and why; `chosen` by hand. */
	why: 'named' | 'promo-alike' | 'promo-free' | 'promo-empty' | 'chosen'
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
}

const isPromo = (item: LookbookItem) => /announce|promo/i.test(`${item.title} ${item.label ?? ''}`)
const isPre = (item: LookbookItem) => /walk\s*in|doors?\s*open|^pre$/i.test(item.label ?? '') || /doors?\s*open/i.test(item.title)
const isPost = (item: LookbookItem) => /walk\s*out|^post$/i.test(item.label ?? '') || /^\s*end\b/i.test(item.title)

/** The column (counted from 0) an item has by name, or null. */
function namedColumn(item: LookbookItem, names: string[]): number | null {
	const find = (want: string) => {
		const i = names.findIndex((n) => norm(n) === want)
		return i < 0 ? null : i
	}
	if (isPre(item)) return find('PRE')
	if (isPost(item)) return find('POST')
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
export function planPlacements(items: LookbookItem[], status: ArenaStatus): { placements: Placement[]; unplaced: Unplaced[] } {
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
	for (const [i, item] of items.entries()) {
		const where = columnOf.get(i)
		if (where === undefined) continue
		const base = { item: i, title: item.title, label: item.label }
		for (const c of arenaCodes(item)) {
			if ('none' in where) {
				// A one-off already on its layer was placed by hand: done.
				const oneOff = where.none === 'no-column' || where.none === 'no-promo'
				if (oneOff && layerOf(c.type)?.slots.some((s) => slotCode(s) === c.code) === true) continue
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
	return { placements, unplaced }
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
	return `${p.layer} · ${column}${p.replaces === null ? '' : `, replacing ${p.replaces.code ?? p.replaces.name}`}`
}

/** One line of a confirmation, to show before it runs. */
export type UpdateStep = { request: FetchRequest; what: string }

/** What Update all would do, one step per code: its file into every clip
 *  with an old or missing version, and into every column it is missing from.
 *  What has no place is listed apart, never guessed. */
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
	const steps: UpdateStep[] = []
	for (const [code, { want, path, update, place }] of byCode) {
		const clipIds = [...new Set([...update, ...place.map((p) => p.clipId)])]
		if (clipIds.length === 0) continue
		const parts = [
			...(update.length === 0 ? [] : [update.length === 1 ? 'its clip with the old file' : `its ${update.length} clips with the old file`]),
			...place.map(placementWords),
		]
		steps.push({ request: { code, want, clipIds, lookbookPath: path, allowLookbook: false, allowLive: [] }, what: `${code} into ${parts.join('; ')}` })
	}
	return { steps, unplaced }
}
