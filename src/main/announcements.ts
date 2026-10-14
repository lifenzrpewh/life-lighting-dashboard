// ProPresenter's announcements, main's half (../shared/announcements.ts has the
// rules and § LOADING the steps): read the three playlists, copy the week's
// lower thirds into the folder, and write the output playlist.
//
// Reads are anyone's and asked only while the view shows. The copy and the
// write are Admin's (kiosk.ts checks), and the write is the only thing that
// changes ProPresenter: one PUT of one playlist, by the name in settings, read
// back before it is called done (CLAUDE.md: every write is unconfirmed until a
// read-back shows it).

import path from 'node:path'

import { listPictures, placeFile, setAside, numbered } from '../bridge/announcement-files.js'
import { findByCodeIndexed } from '../bridge/media-files.js'
import { decodePlaylist, decodePlaylistTree, findPlaylist } from '../bridge/propresenter-playlist.js'
import {
	outputName,
	playlistBody,
	sameOrder,
	type AnnouncementsRead,
	type CopyOutcome,
	type FolderRead,
	type PlaylistRead,
	type Section,
	type Session,
	type WantedAnnouncement,
	type WriteResult,
} from '../shared/announcements.js'
import type { Settings } from '../shared/settings.js'
import { getJson } from './http-poll.js'

const TIMEOUT_MS = 3_000

const baseOf = (s: Settings) => (s.proPresenterHost === null ? null : `http://${s.proPresenterHost}:${s.proPresenterPort}/v1`)

/** One playlist by name: `kind` is presentation playlists (`playlist`) or the
 *  Media Bin's (`media/playlist`). */
async function readOne(base: string, kind: 'playlist' | 'media/playlist', name: string): Promise<PlaylistRead> {
	const at = () => Date.now()
	const list = await getJson(`${base}/${kind === 'playlist' ? 'playlists' : 'media/playlists'}`, TIMEOUT_MS)
	if (!list.ok) return { ok: false, detail: `ProPresenter: ${list.detail}`, at: at() }
	const all = decodePlaylistTree(list.body)
	if (!all.ok) return { ok: false, detail: `ProPresenter's playlists: ${all.detail}`, at: at() }
	const found = findPlaylist(all.value, name)
	if (!found.ok) return { ok: false, detail: kind === 'playlist' ? found.detail : found.detail.replace('no playlist', 'no Media Bin playlist'), at: at() }
	const one = await getJson(`${base}/${kind}/${encodeURIComponent(found.value.uuid)}`, TIMEOUT_MS)
	if (!one.ok) return { ok: false, detail: `ProPresenter's "${found.value.name}": ${one.detail}`, at: at() }
	const items = decodePlaylist(one.body)
	if (!items.ok) return { ok: false, detail: `ProPresenter's "${found.value.name}": ${items.detail}`, at: at() }
	return { ok: true, name: found.value.name, uuid: found.value.uuid, items: items.value, at: at() }
}

/** The announcements folder's pictures. */
async function readFolder(s: Settings): Promise<FolderRead> {
	if (s.announcementsFolder === null) return { ok: false, detail: 'No announcements folder: Settings › ProPresenter › Announcements', at: Date.now() }
	try {
		return { ok: true, names: await listPictures(s.announcementsFolder), at: Date.now() }
	} catch (e) {
		return { ok: false, detail: `the announcements folder ${s.announcementsFolder}: ${(e as Error).message}`, at: Date.now() }
	}
}

export async function readAnnouncements(s: Settings, session: Session): Promise<AnnouncementsRead> {
	const base = baseOf(s)
	if (base === null) {
		const off: PlaylistRead = { ok: false, detail: 'ProPresenter is not set up: Settings › ProPresenter', at: Date.now() }
		return { output: off, media: off, folder: await readFolder(s) }
	}
	const [output, media, folder] = await Promise.all([
		readOne(base, 'playlist', outputName(s.announcementsPlaylist, session)),
		readOne(base, 'media/playlist', s.announcementsMediaPlaylist),
		readFolder(s),
	])
	return { output, media, folder }
}

/** The drive's file for a code: a plain name before a `- Copy` or `(2)`, newest
 *  first (as the media fetch picks). */
const isCopy = (file: string) => /(?:[\s_-]+copy(?:\s*\(\d+\))?|\s*\(\d+\))$/i.test(path.basename(file, path.extname(file)))

/** Copy `codes`, in the playlist's order, into the folder, numbered; set last
 *  week's aside. */
export async function copyAnnouncements(s: Settings, codes: readonly string[]): Promise<{ ok: true; outcomes: CopyOutcome[]; setAside: string[] } | { ok: false; detail: string }> {
	if (s.announcementsFolder === null) return { ok: false, detail: 'No announcements folder: Settings › ProPresenter › Announcements' }
	if (s.graphicsFolder === null) return { ok: false, detail: 'No graphics folder to copy from: Settings › Arena' }
	const dir = s.announcementsFolder
	const outcomes: CopyOutcome[] = []
	const keep = new Set<string>()
	for (const [i, code] of codes.entries()) {
		const found = await findByCodeIndexed(s.graphicsFolder, code)
		if (!found.ok) return { ok: false, detail: found.detail }
		const src = [...found.found].sort((a, b) => Number(isCopy(a.path)) - Number(isCopy(b.path)))[0]
		if (src === undefined) {
			outcomes.push({ code, state: 'not-on-drive', detail: `no file for ${code} in ${s.graphicsFolder}` })
			continue
		}
		const name = numbered(i + 1, src.path)
		const r = await placeFile(src.path, dir, name)
		if (!r.ok) {
			outcomes.push({ code, state: 'failed', detail: r.detail })
			continue
		}
		keep.add(name)
		outcomes.push({ code, state: r.copied ? 'copied' : 'already', name })
	}
	let moved: string[] = []
	try {
		moved = await setAside(dir, keep)
	} catch (e) {
		return { ok: false, detail: `the announcements folder ${dir}: ${(e as Error).message}` }
	}
	console.log(
		`[announcements] copied into ${dir}: ${outcomes.map((o) => `${o.code} ${o.state}`).join(', ') || 'nothing'}${moved.length > 0 ? `; set aside ${moved.join(', ')}` : ''}`,
	)
	return { ok: true, outcomes, setAside: moved }
}

/** Write the output playlist for `session` from the media playlist: the
 *  sections and codes the page confirmed, in that order. */
export async function writeAnnouncements(s: Settings, session: Session, want: readonly { code: string; section: Section }[]): Promise<WriteResult> {
	const base = baseOf(s)
	if (base === null) return { ok: false, detail: 'ProPresenter is not set up' }
	const name = outputName(s.announcementsPlaylist, session)
	const [output, media, folder] = await Promise.all([readOne(base, 'playlist', name), readOne(base, 'media/playlist', s.announcementsMediaPlaylist), readFolder(s)])
	if (!output.ok) return { ok: false, detail: output.detail }
	if (!media.ok) return { ok: false, detail: media.detail }
	if (!folder.ok) return { ok: false, detail: folder.detail }
	const full: WantedAnnouncement[] = want.map((w) => ({ code: w.code, section: w.section, title: '', label: null, file: null }))
	const body = playlistBody(full, media.items, output.items, folder.names)
	if (!body.ok)
		return { ok: false, detail: body.missing.length === 0 ? 'nothing in the folder to write' : `not in "${media.name}" yet: ${body.missing.join(', ')}` }
	let status: number
	try {
		const r = await fetch(`${base}/playlist/${encodeURIComponent(output.uuid)}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body.items),
			signal: AbortSignal.timeout(TIMEOUT_MS * 2),
		})
		status = r.status
	} catch (e) {
		return { ok: false, detail: `ProPresenter did not answer the write: ${(e as Error).message}` }
	}
	if (status !== 204 && status !== 200) {
		console.log(`[announcements] write to "${output.name}" refused: HTTP ${status}`)
		return { ok: false, detail: `ProPresenter refused the write (HTTP ${status})` }
	}
	const back = await readOne(base, 'playlist', name)
	if (!back.ok) return { ok: false, detail: `written, but not read back: ${back.detail}` }
	if (!sameOrder(body.items, back.items)) return { ok: false, detail: `written, but "${back.name}" reads back differently` }
	console.log(
		`[announcements] wrote "${back.name}": ${body.items.map((i) => i.id.name).join(' | ')}${body.leftOut.length > 0 ? `; left out, no file: ${body.leftOut.join(', ')}` : ''}`,
	)
	return { ok: true, items: body.items.length, leftOut: body.leftOut }
}
