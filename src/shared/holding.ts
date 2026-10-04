// The Holding view's rules (docs/VISUALS_DASHBOARD.md § The Holding view): what
// each clip in the holding layers is to today's run sheet, where media that is
// not in Arena should go, and what Update all would do.
//
// The owner, 2026-10-05:
// - A-screens live in the first layer, PRE & POST: column 1 is Pre (Walk In),
//   column 2 Post (Walk Out). Only campuses with IMAG screens have them.
// - Backgrounds go on HOLD BG, foregrounds on HOLD FG. PLAYBACK is rarely used
//   and nothing from the lookbook goes there.
// - On HOLD BG, column 3 is the Countdown and column 4 the Video / Broadcast
//   Background: never offered as a home. Other layers have no such columns.
// - Each service has its own deck (AM, PM), so a clip whose code is not on
//   this run sheet is free to be replaced.
//
// THE RULES THIS FILE ENFORCES:
// - A home is a suggestion with its reason, never a decision: the operator
//   confirms it, or taps another slot.
// - Never a playing clip, never a clip this run sheet still uses, never a
//   reserved column, never two codes into one slot.
// - Nothing found is said ("no place found"), not filled in with a guess.

import type { ArenaLayer, ArenaSlot, ArenaStatus } from './arena.js'
import { fileStem, lookbookStem, mediaCodeOf, sameKey, type LookbookItem, type MediaCheck } from './media-check.js'
import type { FetchRequest } from './media-fetch.js'

/** Each type's home layer, by name. */
const HOME_LAYER: Record<string, RegExp> = {
	B: /^hold\s*bg$/i,
	F: /^hold\s*fg$/i,
	A: /^pre\s*(?:&|and)?\s*post$/i,
}

/** The layers the Holding view shows, top first as Arena's panel reads:
 *  HOLDING's and PRE & POST, PLAYBACK last as it is rarely used. */
export function holdingLayers(status: ArenaStatus): ArenaLayer[] {
	const top = [...status.layers].reverse()
	const holding = top.filter((l) => l.group !== null && /holding/i.test(l.group) && !/playback/i.test(l.name))
	const pre = top.filter((l) => HOME_LAYER['A']?.test(l.name.trim()))
	const playback = top.filter((l) => /^playback$/i.test(l.name.trim()))
	return [...holding.filter((l) => !pre.includes(l)), ...pre, ...playback.filter((l) => !holding.includes(l))]
}

/** A column never offered as a home (counted from 1). */
export function reserved(layer: ArenaLayer, column: number): boolean {
	return HOME_LAYER['B']?.test(layer.name.trim()) === true && (column === 3 || column === 4)
}

/** The code a clip carries: in its file's name, else its clip name. */
export function slotCode(slot: ArenaSlot): string | null {
	if (slot.state === 'empty') return null
	const file = slot.file ?? slot.missingFile
	return (file !== null ? mediaCodeOf(fileStem(file))?.code : undefined) ?? mediaCodeOf(slot.name)?.code ?? null
}

/** Every code on the run sheet, any type: a lower third's code is not a clip,
 *  but nothing named on the sheet is "not used today". */
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
	/** On the run sheet, under another name than the lookbook's. */
	| 'may-differ'
	/** Another name, but an operator has confirmed it is the same file. */
	| 'confirmed'
	/** On the run sheet, but Arena cannot find its file on this computer. */
	| 'missing'
	/** A code the run sheet does not use: free to be replaced. */
	| 'not-today'
	/** No code in its name: not the lookbook's media. Left alone. */
	| 'no-code'

export function slotMark(slot: ArenaSlot, items: LookbookItem[], today: ReadonlySet<string>, marks: ReadonlySet<string>): SlotMark {
	if (slot.state === 'empty') return 'empty'
	const code = slotCode(slot)
	if (code === null) return 'no-code'
	if (!today.has(code)) return 'not-today'
	if (slot.missingFile !== null) return 'missing'
	const file = items.map((i) => i.files[code]).find((f) => f !== undefined)
	if (file === undefined || slot.file === null) return 'today'
	const want = lookbookStem(file)
	if (fileStem(slot.file).toLowerCase() === want.toLowerCase()) return 'today'
	return marks.has(sameKey(code, slot.file, want)) ? 'confirmed' : 'may-differ'
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

/** A suggested home for a code that is not in Arena. */
export type Home = {
	clipId: number
	layer: string
	/** Counted from 1. */
	column: number
	why: 'pre' | 'post' | 'looks-like' | 'not-used-today' | 'empty'
	/** What is there now and would be replaced, or null for an empty slot. */
	replaces: { code: string | null; name: string } | null
}

export type HomeFor = { code: string; want: string; home: Home | null; detail: string | null }

/** A home for every code the check found not in Arena, in run-sheet order,
 *  each in a slot of its own. */
export function suggestHomes(items: LookbookItem[], check: MediaCheck, status: ArenaStatus): HomeFor[] {
	const today = codesOn(items)
	const taken = new Set<number>()
	const out: HomeFor[] = []
	const seen = new Set<string>()
	for (const item of check.items) {
		for (const c of item.codes) {
			if (c.state !== 'not-loaded' || seen.has(c.code)) continue
			seen.add(c.code)
			const r = homeFor(c.code, c.want, item.label, status, today, taken)
			if (r.home !== null) taken.add(r.home.clipId)
			out.push({ code: c.code, want: c.want, ...r })
		}
	}
	return out
}

function homeFor(
	code: string,
	want: string,
	label: string | null,
	status: ArenaStatus,
	today: ReadonlySet<string>,
	taken: ReadonlySet<number>,
): { home: Home | null; detail: string | null } {
	const type = mediaCodeOf(code)?.type ?? ''
	const pattern = HOME_LAYER[type]
	const layer = pattern === undefined ? undefined : status.layers.find((l) => pattern.test(l.name.trim()))
	if (layer === undefined) {
		const name = type === 'A' ? 'PRE & POST' : type === 'B' ? 'HOLD BG' : 'HOLD FG'
		return { home: null, detail: `no ${name} layer in this composition` }
	}
	const slots = layer.slots.map((slot, i) => ({ slot, column: i + 1, code: slotCode(slot) }))
	const free = (s: (typeof slots)[number]) =>
		!taken.has(s.slot.id) && s.slot.state !== 'playing' && !reserved(layer, s.column) && (s.code === null ? s.slot.state === 'empty' : !today.has(s.code))
	const home = (s: (typeof slots)[number], why: Home['why']): Home => ({
		clipId: s.slot.id,
		layer: layer.name,
		column: s.column,
		why,
		replaces: s.slot.state === 'empty' ? null : { code: s.code, name: s.slot.name },
	})

	// A-screens: Pre and Post have their columns.
	if (type === 'A' && label !== null) {
		const column = /walk\s*in|\bpre\b/i.test(label) ? 1 : /walk\s*out|\bpost\b/i.test(label) ? 2 : null
		const s = column === null ? undefined : slots[column - 1]
		if (s !== undefined) {
			if (free(s)) return { home: home(s, column === 1 ? 'pre' : 'post'), detail: null }
			return { home: null, detail: `${layer.name} · column ${column} is in use` }
		}
	}
	// A newer version of something already there.
	let best: { s: (typeof slots)[number]; score: number } | null = null
	for (const s of slots) {
		if (s.code === null || !free(s)) continue
		const score = likeness(want, s.slot.file ?? s.slot.name)
		if (score >= LIKENESS_MIN && (best === null || score > best.score)) best = { s, score }
	}
	if (best !== null) return { home: home(best.s, 'looks-like'), detail: null }
	// Last week's piece, then an empty column.
	const stale = slots.find((s) => s.code !== null && free(s))
	if (stale !== undefined) return { home: home(stale, 'not-used-today'), detail: null }
	const empty = slots.find((s) => s.slot.state === 'empty' && free(s))
	if (empty !== undefined) return { home: home(empty, 'empty'), detail: null }
	return { home: null, detail: `no free column on ${layer.name}` }
}

/** Every clip carrying `code` that is not the lookbook's `want`, or whose file
 *  is missing: a fetch loads the new file into all of them, not only the first
 *  (CB095 sits in 18 columns of HOLD BG). Confirmed-same clips are left. */
export function clipsToUpdate(code: string, want: string, status: ArenaStatus, marks: ReadonlySet<string>): number[] {
	const out: number[] = []
	for (const layer of status.layers) {
		for (const slot of layer.slots) {
			if (slotCode(slot) !== code) continue
			if (slot.missingFile !== null) {
				out.push(slot.id)
				continue
			}
			if (slot.file === null) continue
			if (fileStem(slot.file).toLowerCase() === want.toLowerCase()) continue
			if (marks.has(sameKey(code, slot.file, want))) continue
			out.push(slot.id)
		}
	}
	return out
}

/** One line of Update all, to show before it runs. */
export type UpdateStep = { request: FetchRequest; what: string }

/** What Update all would do: every code that may differ or is missing loaded
 *  afresh into each of its clips, and every code not in Arena placed in its
 *  suggested home. Codes with no home are listed apart, not guessed. */
export function updatePlan(
	items: LookbookItem[],
	check: MediaCheck,
	status: ArenaStatus,
	marks: ReadonlySet<string>,
): { steps: UpdateStep[]; homeless: HomeFor[] } {
	const steps: UpdateStep[] = []
	const seen = new Set<string>()
	for (const item of check.items) {
		for (const c of item.codes) {
			if (seen.has(c.code)) continue
			if (c.state === 'other-version' || c.state === 'not-on-disk') {
				seen.add(c.code)
				const clipIds = clipsToUpdate(c.code, c.want, status, marks)
				if (clipIds.length === 0) continue
				const into = clipIds.length === 1 ? 'its clip' : `its ${clipIds.length} clips`
				steps.push({ request: { code: c.code, want: c.want, clipIds }, what: `${c.code}: load ${c.want} into ${into}` })
			}
		}
	}
	const homes = suggestHomes(items, check, status)
	for (const h of homes) {
		if (h.home === null) continue
		const where = `${h.home.layer} · column ${h.home.column}`
		const replacing = h.home.replaces === null ? '' : `, replacing ${h.home.replaces.name}`
		steps.push({ request: { code: h.code, want: h.want, clipIds: [h.home.clipId] }, what: `${h.code}: place ${h.want} in ${where}${replacing}` })
	}
	return { steps, homeless: homes.filter((h) => h.home === null) }
}
