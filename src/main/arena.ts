// Arena: its link, asked over HTTP like the countdown's sources, and what it is
// playing, over its websocket (docs/VISUALS_DASHBOARD.md, piece 2).
//
// The link says whether there is an Arena to ask. The websocket keeps a status:
// each composition Arena pushes (on connect, and after every clip connect or
// clear) gives the tree; subscriptions keep its faders current between pushes.
// Each push is ~1.3 MB, parsed here once, and only the summary goes further.
//
// The Arena view (src/renderer/components/ArenaView.tsx) shows it in a slot.
// What plays is also logged once per change, `[arena] playing: PLAYBACK Solid
// Color`, so the kiosk log says what was on when someone asks afterwards.
//
// Arena says nothing while idle, so the websocket's silence cannot age the
// status. The link poll does: each answer while the socket is open restamps the
// status, so an Arena that stops answering takes its status STALE with it.

import { decodeArenaProduct } from '../bridge/arena.js'
import {
	applyParameter,
	decodeComposition,
	decodeMessage,
	statusOf,
	subscribeMessage,
	subscriptionsOf,
	unsubscribeMessage,
	type ArenaTree,
} from '../bridge/arena-live.js'
import { ARENA_POLL_MS, ARENA_REQUEST_TIMEOUT_MS, type ArenaProduct, type ArenaSource, type ArenaStatus } from '../shared/arena.js'
import { record, unread, type Channel, type ReadResult } from '../shared/reading.js'
import type { Settings } from '../shared/settings.js'
import { getJson, poll } from './http-poll.js'

/** How long after the websocket closes before trying again. */
const RECONNECT_MS = 5_000

export type ArenaHandle = {
	source(): ArenaSource
	/** What Arena is playing, or null when settings name no Arena. */
	status(): Channel<ArenaStatus> | null
	stop(): void
}

export function startArena(s: Settings): ArenaHandle {
	if (s.arenaHost === null) return { source: () => null, status: () => null, stop() {} }
	const live = watchArena(`ws://${s.arenaHost}:${s.arenaPort}/api/v1`)
	const link = poll<ArenaProduct>({
		log: 'arena',
		label: 'Arena',
		every: ARENA_POLL_MS,
		read: async () => {
			const r = await getJson(`http://${s.arenaHost}:${s.arenaPort}/api/v1/product`, ARENA_REQUEST_TIMEOUT_MS)
			const outcome = r.ok ? ({ ok: true, decoded: decodeArenaProduct(r.body) } as const) : r
			if (outcome.ok && outcome.decoded.ok) live.answered()
			return outcome
		},
	})
	return {
		source: () => link.channel(),
		status: () => live.status(),
		stop() {
			link.stop()
			live.stop()
		},
	}
}

function watchArena(url: string): { status(): Channel<ArenaStatus>; answered(): void; stop(): void } {
	let channel = unread<ArenaTree>()
	let socket: WebSocket | null = null
	let open = false
	let subscribed = new Set<number>()
	let retry: ReturnType<typeof setTimeout> | null = null
	let stopped = false
	// Logged once per distinct fault or change, as ./http-poll.ts does.
	let lastFault: string | null = null
	let lastPlaying: string | null = null

	const fault = (detail: string) => {
		if (detail !== lastFault) console.log(`[arena] websocket: ${detail}`)
		lastFault = detail
	}

	const put = (result: ReadResult<ArenaTree>) => {
		channel = record(channel, result)
		if (!result.ok) {
			fault(result.reason === 'timeout' ? 'no answer' : result.detail)
			return
		}
		if (lastFault !== null) console.log('[arena] websocket: reading')
		lastFault = null
	}

	/** Which clips play only changes with a composition, so it is logged from
	 *  there, not from the ~100 position updates a second in between. */
	const logPlaying = (tree: ArenaTree) => {
		const playing = tree.layers.flatMap((l) => (l.playing === null ? [] : [`${l.name} ${l.playing.name}${l.playing.missing ? ' (file missing)' : ''}`])).join(' · ')
		const line = playing === '' ? 'nothing' : playing
		if (line !== lastPlaying) console.log(`[arena] playing: ${line}`)
		lastPlaying = line
	}

	const onMessage = (data: unknown) => {
		if (typeof data !== 'string') return fault('a message that is not text')
		const msg = decodeMessage(data)
		const at = Date.now()
		switch (msg.kind) {
			case 'composition': {
				const tree = decodeComposition(msg.body)
				if (!tree.ok) return put({ ok: false, reason: 'error', at, detail: tree.detail })
				put({ ok: true, value: tree.value, at })
				logPlaying(tree.value)
				// Subscribe to what is new, and let go of what is gone: a clip
				// no longer playing would otherwise keep sending its position.
				const wanted = new Set(subscriptionsOf(tree.value))
				for (const id of wanted) if (!subscribed.has(id)) socket?.send(subscribeMessage(id))
				for (const id of subscribed) if (!wanted.has(id)) socket?.send(unsubscribeMessage(id))
				subscribed = wanted
				return
			}
			case 'parameter': {
				const latest = channel.latest
				if (latest === null || !latest.ok) return
				const next = applyParameter(latest.value, msg.id, msg.value)
				if (next === null) return
				return put(next.ok ? { ok: true, value: next.value, at } : { ok: false, reason: 'error', at, detail: next.detail })
			}
			case 'refused':
				return fault(`Arena refused ${msg.path}: ${msg.detail}`)
			case 'unreadable':
				return fault(msg.detail)
			case 'other':
				return
		}
	}

	const connect = () => {
		retry = null
		if (stopped) return
		let ws: WebSocket
		try {
			ws = new WebSocket(url)
		} catch (e) {
			put({ ok: false, reason: 'error', at: Date.now(), detail: (e as Error).message })
			retry = setTimeout(connect, RECONNECT_MS)
			return
		}
		socket = ws
		ws.addEventListener('open', () => {
			open = true
		})
		ws.addEventListener('message', (e) => onMessage(e.data))
		// Either ends it, once. A refused connection fires `error` and never
		// `close` in Node 22 (seen 2026-10-03), so waiting for `close` alone
		// would never try again.
		const end = () => {
			if (socket !== ws) return
			socket = null
			ws.close()
			// Arena's ids are not assumed to survive a reconnect: subscribe afresh
			// from whatever composition the next connection brings.
			subscribed = new Set()
			put({ ok: false, reason: 'error', at: Date.now(), detail: open ? 'the websocket closed' : 'cannot connect' })
			open = false
			if (!stopped) retry = setTimeout(connect, RECONNECT_MS)
		}
		ws.addEventListener('error', end)
		ws.addEventListener('close', end)
	}
	connect()

	return {
		status() {
			const { latest, lastOk } = channel
			return {
				latest: latest === null || !latest.ok ? latest : { ...latest, value: statusOf(latest.value) },
				lastOk: lastOk === null ? null : { value: statusOf(lastOk.value), at: lastOk.at },
			}
		},
		answered() {
			const latest = channel.latest
			if (open && latest !== null && latest.ok) channel = record(channel, { ok: true, value: latest.value, at: Date.now() })
		},
		stop() {
			stopped = true
			if (retry !== null) clearTimeout(retry)
			socket?.close()
			socket = null
		},
	}
}
