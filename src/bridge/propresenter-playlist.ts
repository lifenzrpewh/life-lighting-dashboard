// ProPresenter's playlists, off its REST API, for the announcements check
// (../shared/announcements.ts).
//
// ⚠️ UNVERIFIED: the shapes are openapi.propresenter.com's, as
// spikes/propresenter-playlist.mjs reads them; not yet seen from a real
// ProPresenter.
// - `GET /v1/playlists` → a tree: `[{ id: { uuid, name, index }, field_type:
//   'playlist' | 'group', children?: [...] }]`.
// - `GET /v1/playlist/<uuid>` → `{ id, items: [{ id: { uuid, name, index },
//   type: 'media' | 'presentation' | 'header' | …, is_hidden, is_pco }] }`.
//
// THE RULE THIS FILE ENFORCES: a reply of the wrong shape fails whole. A
// playlist half-read would say the missing half's announcements are missing.

import type { PlaylistItem } from '../shared/announcements.js'
import type { Decoded } from './ontime.js'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** `{ uuid, name }` from an `id`, or null. */
function idOf(v: unknown): { uuid: string; name: string } | null {
	if (!isObject(v)) return null
	const { uuid, name } = v
	return typeof uuid === 'string' && uuid !== '' && typeof name === 'string' ? { uuid, name } : null
}

/** Every playlist in the tree (groups opened), by name. */
export function decodePlaylistTree(body: unknown): Decoded<{ uuid: string; name: string }[]> {
	if (!Array.isArray(body)) return { ok: false, detail: 'the playlists reply is not a list' }
	const out: { uuid: string; name: string }[] = []
	const walk = (nodes: unknown[]): string | null => {
		for (const node of nodes) {
			if (!isObject(node)) return 'a playlist is not an object'
			const id = idOf(node['id'])
			if (id === null) return 'a playlist has no id'
			const children = node['children']
			if (Array.isArray(children)) {
				const failed = walk(children)
				if (failed !== null) return failed
			}
			if (node['field_type'] !== 'group') out.push({ uuid: id.uuid, name: id.name.trim() })
		}
		return null
	}
	const failed = walk(body)
	return failed === null ? { ok: true, value: out } : { ok: false, detail: failed }
}

/** One playlist's items, in its order. */
export function decodePlaylist(body: unknown): Decoded<PlaylistItem[]> {
	if (!isObject(body) || !Array.isArray(body['items'])) return { ok: false, detail: 'the playlist reply has no items' }
	const out: PlaylistItem[] = []
	for (const [i, raw] of body['items'].entries()) {
		if (!isObject(raw)) return { ok: false, detail: `item ${i + 1} is not an object` }
		const id = idOf(raw['id'])
		if (id === null) return { ok: false, detail: `item ${i + 1} has no id` }
		const type = raw['type']
		if (typeof type !== 'string') return { ok: false, detail: `item "${id.name}" has no type` }
		out.push({ uuid: id.uuid, name: id.name.trim(), type, hidden: raw['is_hidden'] === true })
	}
	return { ok: true, value: out }
}

/** The playlist named `name` (case and spaces aside), or why not. Two of one
 *  name is said, never one picked: which the booth means is not known. */
export function findPlaylist(all: readonly { uuid: string; name: string }[], name: string): Decoded<{ uuid: string; name: string }> {
	const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
	const hits = all.filter((p) => key(p.name) === key(name))
	if (hits.length === 0) return { ok: false, detail: `ProPresenter has no playlist named "${name}"` }
	if (hits.length > 1) return { ok: false, detail: `ProPresenter has ${hits.length} playlists named "${name}"` }
	return { ok: true, value: hits[0]! }
}
