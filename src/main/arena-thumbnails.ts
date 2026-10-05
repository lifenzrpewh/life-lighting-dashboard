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
import { LOOKBOOK_SCHEME, LOOKBOOK_TIMEOUT_MS, LOOKBOOK_URL, lookbookPictureOf, type LookbookSize } from '../shared/media-check.js'

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
 *  Arena, on `lookbook://thumbnail/storage/library/…`, and the Lookbook
 *  view's big ones on `lookbook://large/…`. Only a library still or an
 *  item's composed preview is asked for (`lookbookPictureOf`), shrunk (the
 *  library's are as big as 5800 px). A library file is kept: its name carries
 *  its upload time, so a new upload is a new address. A preview is not: the
 *  lookbook redraws it at the same address when the run sheet changes. */
const LOOKBOOK_WIDTH: Record<LookbookSize, number> = { thumbnail: 480, large: 1600 }
const LOOKBOOK_KEPT = 60
const lookbookKept = new Map<string, Buffer>()

export function serveLookbookThumbnails(): void {
	protocol.handle(LOOKBOOK_SCHEME, async (request) => {
		const picture = lookbookPictureOf(request.url)
		if (picture === null) return new Response(null, { status: 404 })
		const { path, size } = picture
		const key = `${size}:${path}`
		const library = path.startsWith('/storage/library/')
		const kept = library ? lookbookKept.get(key) : undefined
		// A photo stays a JPEG (a large preview as PNG is megabytes); anything
		// else a PNG, which keeps a foreground's transparency.
		const jpeg = /\.jpe?g$/i.test(path)
		const reply = (b: Buffer) =>
			new Response(new Uint8Array(b), {
				headers: { 'content-type': jpeg ? 'image/jpeg' : 'image/png', 'cache-control': library ? 'max-age=86400' : 'max-age=60' },
			})
		if (kept !== undefined) return reply(kept)
		try {
			const r = await fetch(LOOKBOOK_URL + path, { signal: AbortSignal.timeout(LOOKBOOK_TIMEOUT_MS * 2) })
			if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) return new Response(null, { status: 502 })
			const image = nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer()))
			if (image.isEmpty()) return new Response(null, { status: 502 })
			const width = LOOKBOOK_WIDTH[size]
			const small = image.getSize().width > width ? image.resize({ width, quality: 'good' }) : image
			const out = jpeg ? small.toJPEG(85) : small.toPNG()
			if (library) {
				lookbookKept.set(key, out)
				if (lookbookKept.size > LOOKBOOK_KEPT) lookbookKept.delete(lookbookKept.keys().next().value as string)
			}
			return reply(out)
		} catch {
			return new Response(null, { status: 504 })
		}
	})
}
