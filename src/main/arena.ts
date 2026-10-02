// Arena's link: its web server, asked over HTTP like the countdown's sources.
//
// A link check only. What Arena is playing comes over its websocket, a later
// piece (docs/VISUALS_DASHBOARD.md); this says whether there is an Arena to ask.

import { decodeArenaProduct } from '../bridge/arena.js'
import { ARENA_POLL_MS, ARENA_REQUEST_TIMEOUT_MS, type ArenaProduct, type ArenaSource } from '../shared/arena.js'
import type { Settings } from '../shared/settings.js'
import { getJson, poll } from './http-poll.js'

export type ArenaHandle = {
	source(): ArenaSource
	stop(): void
}

export function startArena(s: Settings): ArenaHandle {
	if (s.arenaHost === null) return { source: () => null, stop() {} }
	const link = poll<ArenaProduct>({
		log: 'arena',
		label: 'Arena',
		every: ARENA_POLL_MS,
		read: async () => {
			const r = await getJson(`http://${s.arenaHost}:${s.arenaPort}/api/v1/product`, ARENA_REQUEST_TIMEOUT_MS)
			return r.ok ? { ok: true, decoded: decodeArenaProduct(r.body) } : r
		},
	})
	return { source: () => link.channel(), stop: () => link.stop() }
}
