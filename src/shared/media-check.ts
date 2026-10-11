// The media check (docs/VISUALS_DASHBOARD.md § the media check): is every coded
// piece of media the run sheet calls for loaded in Arena, on this computer, and
// the version the lookbook has?
//
// WHY THIS EXISTS: the run sheet names media by LIFE's code (`CF588` is Central
// foreground 588) in PCO's `Media No.` column, and the comms team keeps
// replacing files. A clip that is missing, or last week's version, is found by
// the congregation unless it is found before. The lookbook app
// (lookbooks-lifenz.replit.app) already reads `Media No.` into codes and points
// each code at its current file, so the list comes from there, and this file
// only compares it with what Arena holds.
//
// The owner's answers, 2026-10-04:
// - The lookbook is the truth for which version is current (it tracks uploads,
//   and the booth's Arena loads the same files, named as the NAS names them).
// - Arena holds B (backgrounds), F (foregrounds) and A (A-screens). Lower
//   thirds (T) live elsewhere, so they are not looked for in Arena.
// - "Up to date" is three things: loaded at all, the file on this computer, and
//   the lookbook's version.
// - The booth picks the service from a list.
//
// THE RULE THIS FILE ENFORCES: a code the check could not settle is never "ok".
// A lookbook read that failed, or a code the lookbook has no file for, says so.
//
// A name that differs is only a guess at a different file (the owner,
// 2026-10-05: CB095 was the same picture, uploaded to the lookbook as `-v5`),
// so it reads "may differ", and an operator may confirm it the same by hand. The
// mark holds for that pair of names only: a new file on either side, and the
// check asks again. It is shown as confirmed by hand, never as a plain ✓.

import type { ArenaStatus } from './arena.js'

/** Where the lookbook answers. Public reads, no sign-in (seen 2026-10-04). */
export const LOOKBOOK_URL = 'https://lookbooks-lifenz.replit.app'

/** A lookbook request that has not answered in this long has failed. */
export const LOOKBOOK_TIMEOUT_MS = 8_000

/** How far ahead the service list reaches: this week's services, for a check
 *  during the week as well as on the day. */
export const LOOKBOOK_DAYS_AHEAD = 7

/** How far back and ahead the run order's plan is looked for: the Cue
 *  Manager can be on last week's service or one weeks off. */
export const PLAN_DAYS_BACK = 21
export const PLAN_DAYS_AHEAD = 42

/** The code types Arena holds (the owner, 2026-10-04). */
export const ARENA_TYPES: readonly string[] = ['B', 'F', 'A']

/** What each type letter is, for the screen. */
export const TYPE_NAMES: Record<string, string> = {
	B: 'background',
	F: 'foreground',
	A: 'A-screen',
	T: 'lower third',
	D: 'countdown',
}

/** A campus letter, a type letter, three digits: `CB095`, `CF588`. Found
 *  anywhere in a name (the owner: "somewhere in the name"), but not inside a
 *  longer run of letters or digits. */
const CODE = /(?<![A-Za-z0-9])([A-Za-z])([A-Za-z])(\d{3})(?!\d)/

export type MediaCode = { code: string; campus: string; type: string }

/** The first code in a name, upper-cased, or null. */
export function mediaCodeOf(name: string): MediaCode | null {
	const m = CODE.exec(name)
	if (m === null) return null
	const [, campus, type, digits] = m as unknown as [string, string, string, string]
	const code = `${campus}${type}${digits}`.toUpperCase()
	return { code, campus: campus.toUpperCase(), type: type.toUpperCase() }
}

/** The scheme main answers the lookbook's pictures on, shrunk to a thumbnail
 *  (src/main/arena-thumbnails.ts): the renderer's page allows no remote
 *  origins, so main asks the lookbook, and only for one of its library files. */
export const LOOKBOOK_SCHEME = 'lookbook'

/** A lookbook library file: `/storage/library/C/CF588-…_1789857226772.png`. */
const LIBRARY_PATH = /^\/storage\/library\/[A-Za-z]\/[^/\\]{1,200}\.(?:png|jpe?g|webp|gif)$/i
/** A run-sheet item's picture as the lookbook composes it, background and
 *  foreground together: `/storage/previews/<week>/<service>/0.jpg`. */
const PREVIEW_PATH = /^\/storage\/previews\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/\d{1,4}\.(?:png|jpe?g|webp)$/i

export const isLookbookPicture = (path: string): boolean => LIBRARY_PATH.test(path) || PREVIEW_PATH.test(path)

/** How big main makes a lookbook picture: a thumbnail for a tile, large for
 *  the Lookbook view's cards. */
export type LookbookSize = 'thumbnail' | 'large'

/** The address for a lookbook picture, or null for one that is not a still
 *  picture (a video has nothing to shrink). */
export function lookbookThumbUrl(path: string, size: LookbookSize = 'thumbnail'): string | null {
	return isLookbookPicture(path) ? `${LOOKBOOK_SCHEME}://${size}${path.split('/').map(encodeURIComponent).join('/')}` : null
}

/** The picture's path and size in a lookbook picture address, or null. */
export function lookbookPictureOf(url: string): { path: string; size: LookbookSize } | null {
	try {
		const u = new URL(url)
		if (u.protocol !== `${LOOKBOOK_SCHEME}:` || (u.host !== 'thumbnail' && u.host !== 'large')) return null
		const path = u.pathname.split('/').map(decodeURIComponent).join('/')
		return isLookbookPicture(path) ? { path, size: u.host } : null
	} catch {
		return null
	}
}

/** The library path in a lookbook thumbnail address, or null. */
export function lookbookPathOf(url: string): string | null {
	return lookbookPictureOf(url)?.path ?? null
}

/** A file's name without its folder or extension, whichever separator the
 *  path uses: Arena's are Windows paths, the lookbook's are URL paths. */
export function fileStem(path: string): string {
	const base = path.split(/[\\/]/).at(-1) ?? path
	const dot = base.lastIndexOf('.')
	return dot > 0 ? base.slice(0, dot) : base
}

/** The name a lookbook file had on the NAS: the lookbook appends its upload
 *  time, `CF588-Sunday-ReloSeries-WalkInV2_1789857226772.png` (seen
 *  2026-10-04), and the booth's copy carries the NAS name. */
export function lookbookStem(path: string): string {
	return fileStem(path).replace(/_\d{10,}$/, '')
}

/** One of today's services, as the lookbook lists it. */
export type LookbookService = {
	id: string
	name: string
	/** `2026-10-04`. */
	date: string
	/** `09:00`, or null when the lookbook gives none. */
	time: string | null
	/** `central`, as the lookbook keys campuses. */
	campus: string
	/** The Planning Center plan it is linked to, or null: how the check finds
	 *  the service the run order has open. */
	planId: string | null
}

/** One run-sheet item, as the lookbook resolves it. */
export type LookbookItem = {
	title: string
	/** What the `Media No.` note calls it, `Walk In`, or null. */
	label: string | null
	/** Every code on the item, in the note's order. */
	codes: string[]
	/** The lookbook's current file for each code it found one for, by code. */
	files: Record<string, string>
	/** Codes the lookbook could not find a file for. */
	missingCodes: string[]
	/** The lookbook's own picture of the moment, its background and foreground
	 *  composed (`previewPath`), when it has made one. */
	preview?: string | null
}

export type LookbookRead<T> = { ok: true; value: T; at: number } | { ok: false; detail: string; at: number }

/** Where a code was found in Arena. */
export type Place = {
	layer: string
	column: number
	file: string
	/** Arena's clip id, for the media fetch. */
	clipId: number
}

/** What became of one code. */
export type CodeCheck =
	/** Loaded, on this computer, and the lookbook's version. */
	| { code: string; state: 'ok'; at: Place }
	/** Nowhere in Arena. `want` is the lookbook's name and `wantPath` its file
	 *  in the lookbook's library, for the media fetch. */
	| { code: string; state: 'not-loaded'; want: string; wantPath: string }
	/** Loaded, but Arena cannot find the file on this computer. */
	| { code: string; state: 'not-on-disk'; at: Place; want: string; wantPath: string }
	/** Loaded, but not the lookbook's file: told by size when both sizes are
	 *  known (`by: 'size'`, a different file), else by name (`'name'`, may differ). */
	| { code: string; state: 'other-version'; at: Place; want: string; wantPath: string; by: 'size' | 'name' }
	/** Not the lookbook's file, but an operator has said it is the same. */
	| { code: string; state: 'same-by-hand'; at: Place; want: string; wantPath: string }
	/** The lookbook has no file for it, so its version cannot be checked. Where
	 *  Arena has it, if anywhere. */
	| { code: string; state: 'no-lookbook-file'; at: Place | null }

/** `index` is the item's place in the run sheet, for the placements
 *  (./holding.ts) that are per item. */
export type ItemCheck = { index: number; title: string; label: string | null; codes: CodeCheck[] }

export type MediaCheck = {
	items: ItemCheck[]
	/** How many distinct codes are in each state. */
	counts: Record<CodeCheck['state'], number>
}

/** Every clip in Arena that carries a code, by code: its file where Arena
 *  names one, else its clip name. Top layer first, as Arena's panel reads. */
function loadedCodes(status: ArenaStatus): Map<string, (Place & { onDisk: boolean })[]> {
	const found = new Map<string, (Place & { onDisk: boolean })[]>()
	for (const layer of [...status.layers].reverse()) {
		layer.slots.forEach((slot, i) => {
			if (slot.state === 'empty') return
			const file = slot.file ?? slot.missingFile ?? slot.name
			const code = mediaCodeOf(fileStem(file)) ?? mediaCodeOf(slot.name)
			if (code === null) return
			const places = found.get(code.code) ?? []
			places.push({ layer: layer.name, column: i + 1, file, clipId: slot.id, onDisk: slot.missingFile === null })
			found.set(code.code, places)
		})
	}
	return found
}

/** What an operator's "same" mark is kept under: the code, Arena's file name
 *  and the lookbook's, without folder, extension or case. */
export function sameKey(code: string, arenaFile: string, want: string): string {
	return `${code.toUpperCase()}|${fileStem(arenaFile).toLowerCase()}|${want.toLowerCase()}`
}

/** The most marks kept; the oldest go first. */
export const SAME_MARKS_MAX = 500

/** Marks as read back from storage: anything not a key is dropped. */
export function sameMarksFrom(raw: unknown): string[] {
	if (!Array.isArray(raw)) return []
	return raw.filter((k): k is string => typeof k === 'string' && k.length <= 600 && /^[A-Z]{2}\d{3}\|[^|]+\|[^|]+$/.test(k)).slice(-SAME_MARKS_MAX)
}

export type SameMark = { code: string; file: string; want: string; same: boolean }

/** A mark as the page sent it, or null. Main builds the key from it, with `sameKey`. */
export function sameMarkFrom(raw: unknown): SameMark | null {
	if (typeof raw !== 'object' || raw === null) return null
	const { code, file, want, same } = raw as Record<string, unknown>
	const short = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 260 && !s.includes('|')
	if (typeof code !== 'string' || !/^[A-Za-z]{2}\d{3}$/.test(code) || !short(file) || !short(want) || typeof same !== 'boolean') return null
	return { code, file, want, same }
}

/** One code against what Arena holds. Several clips may carry it; the best
 *  answer wins, so a right copy anywhere is enough. */
function checkCode(
	code: string,
	want: { stem: string; path: string } | null,
	places: (Place & { onDisk: boolean })[],
	marks: ReadonlySet<string>,
	sizes: FileSizes | undefined,
): CodeCheck {
	const strip = ({ onDisk: _, ...p }: Place & { onDisk: boolean }): Place => p
	if (places.length === 0) return want === null ? { code, state: 'no-lookbook-file', at: null } : { code, state: 'not-loaded', want: want.stem, wantPath: want.path }
	if (want === null) return { code, state: 'no-lookbook-file', at: strip(places[0] as Place & { onDisk: boolean }) }
	const w = { want: want.stem, wantPath: want.path }
	const right = places.find((p) => p.onDisk && sameFile(p.file, want.path, want.stem, sizes))
	if (right !== undefined) return { code, state: 'ok', at: strip(right) }
	// A missing file has no size to compare: its name says whether it was the right one.
	const rightButGone = places.find((p) => !p.onDisk && fileStem(p.file).toLowerCase() === want.stem.toLowerCase())
	if (rightButGone !== undefined) return { code, state: 'not-on-disk', at: strip(rightButGone), ...w }
	const marked = places.find((p) => p.onDisk && marks.has(sameKey(code, p.file, want.stem)))
	if (marked !== undefined) return { code, state: 'same-by-hand', at: strip(marked), ...w }
	const first = places[0] as Place & { onDisk: boolean }
	if (!first.onDisk) return { code, state: 'not-on-disk', at: strip(first), ...w }
	const by = sizes?.arena[first.file] !== undefined && sizes.lookbook[want.path] !== undefined ? 'size' : 'name'
	return { code, state: 'other-version', at: strip(first), ...w, by }
}

/** File sizes, by path: Arena's files on this computer and the lookbook's
 *  library files, as main read them (src/main/media-sizes.ts). */
export type FileSizes = { arena: Record<string, number>; lookbook: Record<string, number> }

/** Whether Arena's file is the lookbook's. ✅ 2026-10-05: the lookbook's
 *  files are byte for byte the graphics drive's (CF588, CF445, CF449, CF546,
 *  CF593 and CA635 the same size to the byte), so equal sizes are the same
 *  file whatever it is called, and the name says nothing but the code (the
 *  owner: the rest of a name is for the comms team). Without both sizes, the
 *  names are compared, as before sizes were read. */
export function sameFile(arenaFile: string, lookbookPath: string, stem: string, sizes: FileSizes | undefined): boolean {
	const a = sizes?.arena[arenaFile]
	const l = sizes?.lookbook[lookbookPath]
	if (a !== undefined && l !== undefined) return a === l
	return fileStem(arenaFile).toLowerCase() === stem.toLowerCase()
}

/** The run sheet's items against Arena. Only the types Arena holds are
 *  checked; an item with none of them is left out. `same` holds the keys
 *  (`sameKey`) an operator has marked the same; `sizes`, when read, tell a
 *  file by its size rather than its name (`sameFile`). */
export function checkMedia(
	items: LookbookItem[],
	status: ArenaStatus,
	same: ReadonlySet<string> = new Set(),
	sizes?: FileSizes,
	/** Whether a code is Arena's: the Holding map's code families
	 *  (./holding-map.ts `layerOfCode`); by type letter when not given. */
	isArena: (code: string) => boolean = (code) => ARENA_TYPES.includes(mediaCodeOf(code)?.type ?? ''),
): MediaCheck {
	const loaded = loadedCodes(status)
	const counts: MediaCheck['counts'] = { ok: 0, 'not-loaded': 0, 'not-on-disk': 0, 'other-version': 0, 'same-by-hand': 0, 'no-lookbook-file': 0 }
	const seen = new Set<string>()
	const out: ItemCheck[] = []
	for (const [index, item] of items.entries()) {
		const codes: CodeCheck[] = []
		for (const raw of item.codes) {
			const parsed = mediaCodeOf(raw)
			if (parsed === null || !isArena(parsed.code)) continue
			const file = item.files[parsed.code]
			const result = checkCode(parsed.code, file === undefined ? null : { stem: lookbookStem(file), path: file }, loaded.get(parsed.code) ?? [], same, sizes)
			codes.push(result)
			if (!seen.has(parsed.code)) {
				seen.add(parsed.code)
				counts[result.state] += 1
			}
		}
		if (codes.length > 0) out.push({ index, title: item.title, label: item.label, codes })
	}
	return { items: out, counts }
}

/** The services worth offering: from today, for `days` days, this campus's
 *  first when the booth's campus is set and matches, soonest first. */
export function offeredServices(services: LookbookService[], today: string, campus: string | null): LookbookService[] {
	const key = (campus ?? '').trim().toLowerCase()
	const ours = (s: LookbookService) => key !== '' && (s.campus.toLowerCase() === key || s.name.toLowerCase().startsWith(key))
	return services
		.filter((s) => s.date >= today)
		.sort((a, b) => Number(ours(b)) - Number(ours(a)) || a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.name.localeCompare(b.name))
}

/** The New Zealand date, `2026-10-04`, plus `days`: the lookbook's dates are
 *  New Zealand days. */
export function nzDate(at: Date, days = 0): string {
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
	if (days === 0) return parts
	const [y, m, d] = parts.split('-').map(Number) as [number, number, number]
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
