// Resolume Arena: is its web server answering, and which Arena is it.
//
// WHY THIS EXISTS: the Visuals Dashboard offers a view only while its source
// answers (docs/VISUALS_DASHBOARD.md, "the slots offer only what is
// answering"). This is the link every Arena view hangs off, the way the console
// link is for the MA pane. The decoder is main-side (src/bridge/arena.ts); the
// shape lives here because the renderer needs it.
//
// ✅ 2026-10-02, Arena 7.28.0 on Windows: Preferences › Web Server, port 8080,
// `GET /api/v1/product` → `{ name, major, minor, micro, revision }`.

import type { Channel } from './reading.js'

/** How often main asks. A link check, not a feed: what plays is a later piece,
 *  over Arena's websocket. */
export const ARENA_POLL_MS = 2_000

/** A request that has not answered in this long has failed. */
export const ARENA_REQUEST_TIMEOUT_MS = 1_500

/** A read older than this is STALE: two missed polls. */
export const ARENA_STALE_AFTER_MS = 2 * ARENA_POLL_MS + ARENA_REQUEST_TIMEOUT_MS

/** Arena's own web server default. */
export const DEFAULT_ARENA_PORT = 8080

export type ArenaProduct = {
	/** `Arena`, or `Avenue` on the smaller product, as Arena says it. */
	name: string
	major: number
	minor: number
	micro: number
}

/** What main hands the renderer: null when settings name no Arena. Not set up
 *  is a different fact from not answering. */
export type ArenaSource = Channel<ArenaProduct> | null

/** A clip, as much of it as says what is playing. */
export type ArenaClip = {
	name: string
	/** Arena's thumbnail for the clip, or null when Arena gives none. `version`
	 *  is Arena's `last_update` (also the image's ETag), so a new picture gets a
	 *  new address. Shown through main: see `thumbnailUrl`. */
	thumbnail: { clipId: number; version: string } | null
	/** Arena says the clip's file is not on this machine. A generator has no file
	 *  and is never missing. */
	missing: boolean
	/** Where the clip is in its timeline, or null when it has none this reads
	 *  (a clip synced to the BPM rather than on a `Timeline`). */
	transport: ArenaTransport | null
}

/** A connected clip's place in its timeline (docs/VISUALS_DASHBOARD.md § a
 *  video clip's transport). Positions are milliseconds of the CLIP, which runs
 *  at `rate` of the clock's speed. */
export type ArenaTransport = {
	positionMs: number
	/** The transport's length, its position's max: not the file's duration. */
	lengthMs: number
	playmode: string
	/** `>` forward, `<` back, `||` paused, as Arena writes them. */
	direction: string
	/** Clip ms per real ms: the clip's speed × its layer group's × the
	 *  composition's. LIFE's VFX group at 1.795 played a 39 s clip in 22 s. */
	rate: number
}

/** What a layer's clip has left, in real time. */
export type ClipTime =
	/** Counting down. `loops`: Loop or Bounce, so at zero it goes round again. */
	| { kind: 'left'; ms: number; loops: boolean }
	/** Play Once & Hold, at its end, holding the last frame. */
	| { kind: 'held' }
	| { kind: 'paused'; ms: number }
	/** No end to count to: Random, or a clip with no timeline. */
	| { kind: 'none' }

/** Within this many clip-milliseconds of the end is at the end. Arena stops
 *  pushing a held clip's position once it stops moving, and a push every ~10 ms
 *  at up to ~2× speed leaves the last one this close or closer. ⚠️ The exact
 *  value a held clip settles on is not yet seen. */
export const END_SLACK_MS = 50

export function clipTime(t: ArenaTransport | null): ClipTime {
	if (t === null || t.playmode === 'Random') return { kind: 'none' }
	const backwards = t.direction === '<'
	const toEnd = Math.max(0, backwards ? t.positionMs : t.lengthMs - t.positionMs)
	if (t.playmode === 'Play Once & Hold' && toEnd <= END_SLACK_MS) return { kind: 'held' }
	if (t.direction === '||' || t.rate <= 0) return { kind: 'paused', ms: toEnd / (t.rate > 0 ? t.rate : 1) }
	return { kind: 'left', ms: toEnd / t.rate, loops: t.playmode === 'Loop' || t.playmode === 'Bounce' }
}

/** `0:42`, `12:05`: whole seconds, rounded up, so 0:00 means it is over. */
export function formatClipTime(ms: number): string {
	const s = Math.ceil(Math.max(0, ms) / 1000)
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** One layer, in Arena's composition order. */
export type ArenaLayer = {
	name: string
	/** The layer group it sits in, or null outside any group. */
	group: string | null
	/** The layer fader, 0–1. */
	master: number
	bypassed: boolean
	/** The clip Arena says is connected on this layer, or null for none. A clip
	 *  that is only previewing is not playing. */
	playing: ArenaClip | null
}

export type ArenaGroup = {
	name: string
	master: number
	bypassed: boolean
}

/** What Arena is playing (docs/VISUALS_DASHBOARD.md, piece 2). */
export type ArenaStatus = {
	/** The composition master, 0–1. */
	master: number
	/** The selected deck, or null when Arena marks none. */
	deck: string | null
	groups: ArenaGroup[]
	layers: ArenaLayer[]
}

/** The scheme main answers clip thumbnails on. The renderer's page allows no
 *  remote origins, so it asks main, which asks only the Arena in settings
 *  (src/main/arena-thumbnails.ts). */
export const THUMBNAIL_SCHEME = 'arena'

export function thumbnailUrl(t: { clipId: number; version: string }): string {
	return `${THUMBNAIL_SCHEME}://thumbnail/${t.clipId}?v=${encodeURIComponent(t.version)}`
}

/** The clip id in a thumbnail address, or null when it is not one. Main
 *  answers nothing else on the scheme. */
export function clipIdOfThumbnail(url: string): number | null {
	let u: URL
	try {
		u = new URL(url)
	} catch {
		return null
	}
	const m = /^\/(\d{1,20})$/.exec(u.pathname)
	if (u.protocol !== `${THUMBNAIL_SCHEME}:` || u.host !== 'thumbnail' || m === null) return null
	const id = Number(m[1])
	return Number.isSafeInteger(id) ? id : null
}

/** `7.28`, or `7.28.1` when the micro version says something. */
export function arenaVersion(p: ArenaProduct): string {
	return p.micro === 0 ? `${p.major}.${p.minor}` : `${p.major}.${p.minor}.${p.micro}`
}
