// Arena's clip thumbnails, for the renderer, on `arena://thumbnail/<clipId>`.
//
// WHY: the renderer's page allows no remote origins (src/renderer/index.html),
// and widening that to Arena's host would mean widening it to any host a
// setting can name. Main asks instead, and only ever for one thing: a clip's
// thumbnail, from the Arena in settings at the moment of asking.
//
// ✅ 2026-10-03, Arena 7.28: `GET /api/v1/composition/clips/by-id/<id>/thumbnail`
// is a PNG (768 bytes for a generator, 31 KB for a video), its ETag the clip's
// `thumbnail.last_update`, which is why the address carries `?v=`: a new
// picture is a new address, and an old one can be cached.

import { protocol } from 'electron'

import { ARENA_REQUEST_TIMEOUT_MS, THUMBNAIL_SCHEME, clipIdOfThumbnail } from '../shared/arena.js'

/** Before the app is ready, as Electron requires. Standard, so the address
 *  parses as host and path; secure, so a page on https or file may show it. */
export function registerThumbnailScheme(): void {
	protocol.registerSchemesAsPrivileged([{ scheme: THUMBNAIL_SCHEME, privileges: { standard: true, secure: true } }])
}

/** After ready. `arena` is read on every request, so a changed address takes
 *  effect at once. */
export function serveThumbnails(arena: () => { host: string; port: number } | null): void {
	protocol.handle(THUMBNAIL_SCHEME, async (request) => {
		const id = clipIdOfThumbnail(request.url)
		const at = arena()
		if (id === null || at === null) return new Response(null, { status: 404 })
		try {
			const r = await fetch(`http://${at.host}:${at.port}/api/v1/composition/clips/by-id/${id}/thumbnail`, {
				signal: AbortSignal.timeout(ARENA_REQUEST_TIMEOUT_MS),
			})
			const type = r.headers.get('content-type') ?? ''
			// Only a picture goes through: whatever else answers on that port stays there.
			if (!r.ok || !type.startsWith('image/')) return new Response(null, { status: 502 })
			return new Response(await r.arrayBuffer(), { headers: { 'content-type': type, 'cache-control': 'max-age=86400' } })
		} catch {
			return new Response(null, { status: 504 })
		}
	})
}
