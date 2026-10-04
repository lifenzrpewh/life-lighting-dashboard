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

import { nativeImage, protocol } from 'electron'

import { ARENA_REQUEST_TIMEOUT_MS, THUMBNAIL_SCHEME, clipIdOfThumbnail } from '../shared/arena.js'
import { LOOKBOOK_SCHEME, LOOKBOOK_TIMEOUT_MS, LOOKBOOK_URL, lookbookPathOf } from '../shared/media-check.js'

/** Before the app is ready, as Electron requires. Standard, so the address
 *  parses as host and path; secure, so a page on https or file may show it. */
export function registerThumbnailScheme(): void {
	protocol.registerSchemesAsPrivileged([
		{ scheme: THUMBNAIL_SCHEME, privileges: { standard: true, secure: true } },
		{ scheme: LOOKBOOK_SCHEME, privileges: { standard: true, secure: true } },
	])
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

/** The lookbook's pictures, for media the Holding view shows before it is in
 *  Arena, on `lookbook://thumbnail/storage/library/…`. Only a library still
 *  is asked for (`lookbookPathOf`), shrunk to 480 px wide (the library's
 *  are as big as 5800 px), and kept: a library file's name carries its upload
 *  time, so a new upload is a new address. */
const LOOKBOOK_THUMB_WIDTH = 480
const LOOKBOOK_KEPT = 60
const lookbookKept = new Map<string, Buffer>()

export function serveLookbookThumbnails(): void {
	protocol.handle(LOOKBOOK_SCHEME, async (request) => {
		const path = lookbookPathOf(request.url)
		if (path === null) return new Response(null, { status: 404 })
		const kept = lookbookKept.get(path)
		const png = (b: Buffer) => new Response(new Uint8Array(b), { headers: { 'content-type': 'image/png', 'cache-control': 'max-age=86400' } })
		if (kept !== undefined) return png(kept)
		try {
			const r = await fetch(LOOKBOOK_URL + path, { signal: AbortSignal.timeout(LOOKBOOK_TIMEOUT_MS * 2) })
			if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) return new Response(null, { status: 502 })
			const image = nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer()))
			if (image.isEmpty()) return new Response(null, { status: 502 })
			const small = image.getSize().width > LOOKBOOK_THUMB_WIDTH ? image.resize({ width: LOOKBOOK_THUMB_WIDTH, quality: 'good' }) : image
			const out = small.toPNG()
			lookbookKept.set(path, out)
			if (lookbookKept.size > LOOKBOOK_KEPT) lookbookKept.delete(lookbookKept.keys().next().value as string)
			return png(out)
		} catch {
			return new Response(null, { status: 504 })
		}
	})
}
