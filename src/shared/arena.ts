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
	/** Arena's own path for its thumbnail, `/api/v1/composition/clips/by-id/<id>/thumbnail`,
	 *  or null when Arena gives none. Relative to Arena's web server. */
	thumbnail: string | null
	/** Arena says the clip's file is not on this machine. A generator has no file
	 *  and is never missing. */
	missing: boolean
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

/** `7.28`, or `7.28.1` when the micro version says something. */
export function arenaVersion(p: ArenaProduct): string {
	return p.micro === 0 ? `${p.major}.${p.minor}` : `${p.major}.${p.minor}.${p.micro}`
}
