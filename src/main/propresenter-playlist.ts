// The announcements check's read (../shared/announcements.ts): ProPresenter's
// "Announcements AM" or "PM", asked when the view wants it, never polled.
// Read-only: nothing here writes to ProPresenter.

import { decodePlaylist, decodePlaylistTree, findPlaylist } from '../bridge/propresenter-playlist.js'
import type { PlaylistRead } from '../shared/announcements.js'
import type { Settings } from '../shared/settings.js'
import { getJson } from './http-poll.js'

const TIMEOUT_MS = 3_000

export async function readAnnouncementPlaylist(s: Settings, name: string): Promise<PlaylistRead> {
	const at = () => Date.now()
	if (s.proPresenterHost === null) return { ok: false, detail: 'ProPresenter is not set up: Settings › ProPresenter', at: at() }
	const base = `http://${s.proPresenterHost}:${s.proPresenterPort}/v1`
	const tree = await getJson(`${base}/playlists`, TIMEOUT_MS)
	if (!tree.ok) return { ok: false, detail: `ProPresenter: ${tree.detail}`, at: at() }
	const all = decodePlaylistTree(tree.body)
	if (!all.ok) return { ok: false, detail: `ProPresenter's playlists: ${all.detail}`, at: at() }
	const found = findPlaylist(all.value, name)
	if (!found.ok) return { ok: false, detail: found.detail, at: at() }
	const one = await getJson(`${base}/playlist/${encodeURIComponent(found.value.uuid)}`, TIMEOUT_MS)
	if (!one.ok) return { ok: false, detail: `ProPresenter's "${found.value.name}": ${one.detail}`, at: at() }
	const items = decodePlaylist(one.body)
	if (!items.ok) return { ok: false, detail: `ProPresenter's "${found.value.name}": ${items.detail}`, at: at() }
	console.log(`[propresenter] read "${found.value.name}": ${items.value.length} items`)
	return { ok: true, name: found.value.name, items: items.value, at: at() }
}
