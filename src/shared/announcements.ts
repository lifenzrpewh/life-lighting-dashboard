// ProPresenter's announcements (the owner, 2026-10-14): is the booth's
// "Announcements AM" (or PM) playlist what this service's run sheet calls for,
// in its order?
//
// The owner's answers, 2026-10-14:
// - The playlist is named "Announcements AM", or "Announcements PM" for an
//   evening service, and holds each announcement as its own item.
// - Each item is a picture or video, named by its file, so the name carries the
//   lookbook code (`CT123 Youth Camp.png`).
// - What belongs there is the T codes (lower thirds) of the run sheet's
//   announcement items, in run-sheet order. An announcement is what Holding
//   calls one (./holding.ts `isPromo`), so the two never disagree.
// - Someone puts them in by hand today. The files are on the graphics drive /
//   the NAS, which the ProPresenter computer (another machine) also reaches.
//
// This file only compares. Reading the playlist is ../bridge/propresenter-playlist.ts;
// putting the files in is a later step (docs/VISUALS_DASHBOARD.md
// § ProPresenter announcements).
//
// THE RULE THIS FILE ENFORCES: as in the media check, nothing unsettled is
// "ok". A run sheet with no announcement T codes says so rather than reading as
// a playlist that is right; an item whose name carries no code is kept and
// counted, never guessed at.

import { isPromo } from './holding.js'
import { mediaCodeOf, type LookbookItem } from './media-check.js'

/** One lower third the run sheet calls for, in its order. */
export type WantedAnnouncement = {
	code: string
	/** The run-sheet item it is on. */
	title: string
	/** The lookbook's current file for it, or null when it has none. */
	file: string | null
}

/** The T codes of the announcement items, in run-sheet order, each once. */
export function wantedAnnouncements(items: readonly LookbookItem[]): WantedAnnouncement[] {
	const out: WantedAnnouncement[] = []
	const seen = new Set<string>()
	for (const item of items) {
		if (!isPromo(item)) continue
		for (const raw of item.codes) {
			const code = mediaCodeOf(raw)
			if (code === null || code.type !== 'T' || seen.has(code.code)) continue
			seen.add(code.code)
			out.push({ code: code.code, title: item.title, file: item.files[code.code] ?? null })
		}
	}
	return out
}

export const PLAYLIST_AM = 'Announcements AM'
export const PLAYLIST_PM = 'Announcements PM'

/** Which playlist a service's announcements go in: its name's AM or PM if it
 *  says, else its start time (noon on is PM). Null when neither tells. */
export function playlistFor(service: { name: string; time: string | null }): string | null {
	if (/\bPM\b/i.test(service.name)) return PLAYLIST_PM
	if (/\bAM\b/i.test(service.name)) return PLAYLIST_AM
	const hour = Number(/^(\d{1,2}):\d{2}/.exec(service.time ?? '')?.[1] ?? NaN)
	if (!Number.isFinite(hour)) return null
	return hour >= 12 ? PLAYLIST_PM : PLAYLIST_AM
}

/** One item of a ProPresenter playlist, as ../bridge/propresenter-playlist.ts
 *  reads it. */
export type PlaylistItem = {
	uuid: string
	name: string
	/** ProPresenter's word: `media`, `presentation`, `header`, `placeholder`… */
	type: string
	hidden: boolean
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
	/** The wanted ones that are there stand in run-sheet order. */
	ordered: boolean
	/** Everything wanted is there, in order, and nothing else coded T is. */
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
	const places = rows.flatMap((r) => (r.state === 'there' ? [r.at] : []))
	const ordered = places.every((at, i) => i === 0 || at > places[i - 1]!)
	const ok = want.length > 0 && rows.every((r) => r.state === 'there') && ordered && extras.length === 0
	return { playlist, rows, extras, others, ordered, ok }
}

/** Main's answer to the playlist ask: its items, or why not, and when. */
export type PlaylistRead = { ok: true; name: string; items: PlaylistItem[]; at: number } | { ok: false; detail: string; at: number }

/** Only these are asked for: main reads no playlist by a name the page makes up. */
export const isAnnouncementPlaylist = (name: unknown): name is string => name === PLAYLIST_AM || name === PLAYLIST_PM
