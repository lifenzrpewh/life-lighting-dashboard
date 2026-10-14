// ProPresenter's announcements (the owner, 2026-10-14): is the booth's
// "Announcements AM" (or PM) playlist what this service's run sheet calls for,
// in its order?
//
// The owner's answers, 2026-10-14, and Central's ProPresenter read the same day
// (10.11.60.7, ProPresenter on the booth network):
// - The playlists are "-Announcements AM", "-Announcements PM" and
//   "-Announcements EVENT" (the dash is theirs: names match without it).
// - Each item is a picture, named by its file without the extension, so the
//   name carries the lookbook code (`CT108-Sunday-ConnectWithUs`), under two
//   headers: NORMAL NOTICES (the standing ones) and PROMOS.
// - What belongs there is EVERY T code (lower third) on the run sheet. The
//   owner said the announcements' T codes; on Central's real run sheets of 11
//   and 18 October every T code is a notice or a promo, the Welcome moments'
//   (WTL, NSL, WTG) as much as the announcements', and all of them are in the
//   playlist. Speaker titles have a playlist of their own and no T code on
//   those run sheets.
// - ORDER IS NOT CHECKED: the playlist is not in run-sheet order. The standing
//   notices come first in a fixed order (WTL, NSL, Bibles, WTG), then the
//   promos. Whether to hold it to a rule is the owner's to say.
// - Someone puts them in by hand today. The files are on the graphics drive /
//   the NAS, which the ProPresenter computer (another machine) also reaches.
//
// LOADING (2026-10-14, each step proven on Central's ProPresenter, PAUA TEST;
// docs/VISUALS_DASHBOARD.md § ProPresenter announcements). ProPresenter's
// playlist write takes pictures only by their Media Bin id, and refuses a Smart
// Playlist's, so a week's load is:
// 1. Pāua copies the T files into the announcements folder, numbered in the
//    order below, and touches them: a Smart Playlist on a network folder
//    notices a file once it is modified after landing.
// 2. A person drags them from the Smart Playlist into an ordinary media
//    playlist (the one step the API cannot do).
// 3. Pāua writes the output playlist from that media playlist (`playlistBody`):
//    NORMAL NOTICES, the standing ones in their fixed order, then PROMOS, the
//    rest in run-sheet order (the owner, 2026-10-14). Admin only, confirmed.
// Every name is a setting (Settings › ProPresenter › Announcements), and a
// campus that does not use them turns them off there.
//
// Reading and writing are ../bridge/propresenter-playlist.ts and
// ../main/announcements.ts; the files are ../bridge/announcement-files.ts.
//
// THE RULE THIS FILE ENFORCES: as in the media check, nothing unsettled is
// "ok". A run sheet with no announcement T codes says so rather than reading as
// a playlist that is right; an item whose name carries no code is kept and
// counted, never guessed at.

import { mediaCodeOf, type LookbookItem } from './media-check.js'

/** NORMAL NOTICES: the standing notices, in this order, by the run-sheet
 *  item's `Media No.` label (Central's real labels, 11 and 18 October). */
export const STANDING_LABELS: readonly string[] = ['WTL', 'NSL', 'BIBLES', 'WTG']

export type Section = 'notices' | 'promos'

/** The headers Central's playlists carry, written as they are. */
export const SECTION_HEADER: Record<Section, string> = { notices: 'NORMAL NOTICES', promos: 'PROMOS' }

/** One lower third the run sheet calls for. */
export type WantedAnnouncement = {
	code: string
	/** The run-sheet item it is on. */
	title: string
	/** Its `Media No.` label (`WTL`, `Prayer & Fasting`), or null. */
	label: string | null
	/** The lookbook's current file for it, or null when it has none. */
	file: string | null
	section: Section
}

const standingIndex = (label: string | null) => (label === null ? -1 : STANDING_LABELS.indexOf(label.trim().toUpperCase()))

/** Every T code on the run sheet, each once, in the order the playlist takes
 *  them: the standing notices in their fixed order, then everything else in
 *  run-sheet order. */
export function wantedAnnouncements(items: readonly LookbookItem[]): WantedAnnouncement[] {
	const out: WantedAnnouncement[] = []
	const seen = new Set<string>()
	for (const item of items) {
		for (const raw of item.codes) {
			const code = mediaCodeOf(raw)
			if (code === null || code.type !== 'T' || seen.has(code.code)) continue
			seen.add(code.code)
			const section: Section = standingIndex(item.label) >= 0 ? 'notices' : 'promos'
			out.push({ code: code.code, title: item.title, label: item.label, file: item.files[code.code] ?? null, section })
		}
	}
	const rank = (w: WantedAnnouncement) => (w.section === 'notices' ? standingIndex(w.label) : STANDING_LABELS.length)
	// Stable: promos keep their run-sheet order among themselves.
	return out.map((w, i) => ({ w, i })).sort((a, b) => rank(a.w) - rank(b.w) || a.i - b.i).map(({ w }) => w)
}

/** Which of a booth's announcement playlists a service uses: its name's AM or
 *  PM (`Central AM 18th October`), else EVENT (`Central Team Night`). */
export type Session = 'AM' | 'PM' | 'EVENT'
export const SESSIONS: readonly Session[] = ['AM', 'PM', 'EVENT']

export function sessionOf(service: { name: string }): Session {
	if (/\bPM\b/i.test(service.name)) return 'PM'
	if (/\bAM\b/i.test(service.name)) return 'AM'
	return 'EVENT'
}

/** The output playlist's name: the setting's base and the session
 *  (`Announcements AM`; Central's "-Announcements AM" matches it, the dash aside). */
export const outputName = (base: string, session: Session) => `${base.trim()} ${session}`

export const DEFAULT_OUTPUT_BASE = 'Announcements'

export const PLAYLIST_AM = outputName(DEFAULT_OUTPUT_BASE, 'AM')
export const PLAYLIST_PM = outputName(DEFAULT_OUTPUT_BASE, 'PM')
export const PLAYLIST_EVENT = outputName(DEFAULT_OUTPUT_BASE, 'EVENT')

/** The default output playlist for a service. */
export function playlistFor(service: { name: string }, base = DEFAULT_OUTPUT_BASE): string {
	return outputName(base, sessionOf(service))
}

export type HeaderColor = { red: number; green: number; blue: number; alpha: number }

/** Central's headers' grey, for a header the playlist does not have yet. */
export const GREY: HeaderColor = { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 }

/** One item of a ProPresenter playlist, as ../bridge/propresenter-playlist.ts
 *  reads it. */
export type PlaylistItem = {
	uuid: string
	name: string
	/** ProPresenter's word: `media`, `image`, `presentation`, `header`… */
	type: string
	hidden: boolean
	/** A header's colour. */
	color?: HeaderColor
}

/** What became of one wanted lower third. `at` is the item's place in the
 *  playlist, from 0. */
export type AnnouncementRow =
	| { code: string; title: string; state: 'there'; at: number }
	| { code: string; title: string; state: 'missing'; file: string | null }

export type AnnouncementCheck = {
	playlist: string
	/** Every wanted lower third, in run-sheet order. */
	rows: AnnouncementRow[]
	/** Lower thirds in the playlist the run sheet does not call for: last
	 *  week's, most likely. */
	extras: { name: string; code: string; at: number }[]
	/** Items with no lower-third code in their name (a header, a presentation,
	 *  a picture named otherwise): left alone, only counted. */
	others: number
	/** Everything wanted is there, and nothing else coded T is. Order is not
	 *  checked (the header). */
	ok: boolean
}

/** The playlist against the run sheet. An empty `want` is never `ok`: there is
 *  nothing to say the playlist is right about. */
export function checkAnnouncements(playlist: string, want: readonly WantedAnnouncement[], items: readonly PlaylistItem[]): AnnouncementCheck {
	const placeOf = new Map<string, number>()
	const extras: AnnouncementCheck['extras'] = []
	let others = 0
	const wanted = new Set(want.map((w) => w.code))
	for (const [at, item] of items.entries()) {
		const code = mediaCodeOf(item.name)
		if (code === null || code.type !== 'T') {
			others++
			continue
		}
		if (!wanted.has(code.code)) extras.push({ name: item.name, code: code.code, at })
		else if (!placeOf.has(code.code)) placeOf.set(code.code, at)
		// A second copy of a wanted one is one too many: said as an extra.
		else extras.push({ name: item.name, code: code.code, at })
	}
	const rows: AnnouncementRow[] = want.map((w) => {
		const at = placeOf.get(w.code)
		return at === undefined ? { code: w.code, title: w.title, state: 'missing', file: w.file } : { code: w.code, title: w.title, state: 'there', at }
	})
	const ok = want.length > 0 && rows.every((r) => r.state === 'there') && extras.length === 0
	return { playlist, rows, extras, others, ok }
}

/** Main's answer to a playlist ask: its items, or why not, and when. */
export type PlaylistRead = { ok: true; name: string; uuid: string; items: PlaylistItem[]; at: number } | { ok: false; detail: string; at: number }

/** The newest item in a playlist carrying `code`: the last, since a picture
 *  dragged in again lands at the end. */
export function itemOf(items: readonly PlaylistItem[], code: string): PlaylistItem | null {
	for (let i = items.length - 1; i >= 0; i--) if (mediaCodeOf(items[i]!.name)?.code === code) return items[i]!
	return null
}

/** One item of ProPresenter's playlist write, as its spec and Central took it. */
export type PutItem = {
	id: { uuid: string | null; name: string; index: number }
	type: 'header' | 'media'
	header_color?: HeaderColor
	is_hidden: false
	is_pco: false
}

/** The output playlist's whole new list: each section's header (its colour
 *  kept from the playlist now, else grey) and its pictures by their Media Bin
 *  ids in `media`. Every wanted code must be there, or nothing is written. */
export function playlistBody(
	want: readonly WantedAnnouncement[],
	media: readonly PlaylistItem[],
	current: readonly PlaylistItem[],
): { ok: true; items: PutItem[] } | { ok: false; missing: string[] } {
	const missing = want.filter((w) => itemOf(media, w.code) === null).map((w) => w.code)
	if (want.length === 0 || missing.length > 0) return { ok: false, missing }
	const colorOf = (header: string) => current.find((i) => i.type === 'header' && i.name.trim().toUpperCase() === header)?.color ?? GREY
	const items: PutItem[] = []
	for (const section of ['notices', 'promos'] as const) {
		const these = want.filter((w) => w.section === section)
		if (these.length === 0) continue
		const header = SECTION_HEADER[section]
		items.push({ id: { uuid: null, name: header, index: items.length }, type: 'header', header_color: colorOf(header), is_hidden: false, is_pco: false })
		for (const w of these) {
			const it = itemOf(media, w.code)!
			items.push({ id: { uuid: it.uuid, name: it.name, index: items.length }, type: 'media', is_hidden: false, is_pco: false })
		}
	}
	return { ok: true, items }
}

/** Whether a playlist read back after a write holds what was written: the same
 *  headers and lower thirds, in the same order (entry ids are ProPresenter's
 *  own and change). */
export function sameOrder(written: readonly PutItem[], read: readonly PlaylistItem[]): boolean {
	const key = (type: string, name: string) => (type === 'header' ? `h:${name.trim().toUpperCase()}` : `t:${mediaCodeOf(name)?.code ?? name}`)
	const a = written.map((i) => key(i.type, i.id.name))
	const b = read.map((i) => key(i.type, i.name))
	return a.length === b.length && a.every((k, i) => k === b[i])
}

/** What a copy into the folder did for one code. */
export type CopyOutcome =
	| { code: string; state: 'copied' | 'already'; name: string }
	| { code: string; state: 'not-on-drive' | 'failed'; detail: string }

/** Main's answer to the three reads the Announcements view needs. */
export type AnnouncementsRead = {
	/** The output playlist for the session asked. */
	output: PlaylistRead
	/** The ordinary media playlist the pictures are dragged into. */
	media: PlaylistRead
	/** The Smart Playlist on the folder. */
	smart: PlaylistRead
}

export type WriteResult = { ok: true; items: number } | { ok: false; detail: string }

/** A lower-third code the page may hand main: `CT108`. */
export const isTCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]T\d{3}$/.test(v)
