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
import { checkCommand, emptyWire, openWire, type ArenaWire } from '../bridge/arena-control.js'
import { fileUrlOf } from '../bridge/media-files.js'
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
import {
	ARENA_POLL_MS,
	ARENA_REQUEST_TIMEOUT_MS,
	type ArenaCommand,
	type ArenaCommandResult,
	type ArenaProduct,
	type ArenaSource,
	type ArenaStatus,
} from '../shared/arena.js'
import { record, unread, type Channel, type ReadResult } from '../shared/reading.js'
import type { Settings } from '../shared/settings.js'
import { getJson, poll } from './http-poll.js'

/** How long after the websocket closes before trying again. */
const RECONNECT_MS = 5_000

export type ArenaHandle = {
	source(): ArenaSource
	/** What Arena is playing, or null when settings name no Arena. */
	status(): Channel<ArenaStatus> | null
	/** Something from the Clips view: checked against the composition held
	 *  here, then sent (../bridge/arena-control.ts). */
	command(raw: unknown): Promise<ArenaCommandResult>
	/** The media fetch: load `file`, which main copied, into a clip that is
	 *  not playing, or one the operator agreed to replace on screen (`live`,
	 *  ../bridge/arena-control.ts `openWire`). */
	open(clipId: number, file: string, live: boolean): Promise<ArenaCommandResult>
	/** Empty an old foreground's slot (../bridge/arena-control.ts, `emptyWire`). */
	empty(clipId: number, code: string): Promise<ArenaCommandResult>
	stop(): void
}

export function startArena(s: Settings): ArenaHandle {
	if (s.arenaHost === null) {
		const none = async () => ({ ok: false, detail: 'no Arena is set up' }) as const
		return { source: () => null, status: () => null, command: none, open: none, empty: none, stop() {} }
	}
	const live = watchArena(`ws://${s.arenaHost}:${s.arenaPort}/api/v1`, `http://${s.arenaHost}:${s.arenaPort}/api/v1`)
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
		command: (raw) => live.command(raw),
		open: (clipId, file, onScreen) => live.open(clipId, file, onScreen),
		empty: (clipId, code) => live.empty(clipId, code),
		stop() {
			link.stop()
			live.stop()
		},
	}
}

function watchArena(
	url: string,
	rest: string,
): {
	status(): Channel<ArenaStatus>
	answered(): void
	command(raw: unknown): Promise<ArenaCommandResult>
	open(clipId: number, file: string, live: boolean): Promise<ArenaCommandResult>
	empty(clipId: number, code: string): Promise<ArenaCommandResult>
	stop(): void
} {
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
	/** Put a checked command on the wire. Each REST call waits for the one
	 *  before, so a release never overtakes its press. */
	const send = async (wire: ArenaWire): Promise<ArenaCommandResult> => {
		if (wire.kind === 'socket') {
			if (socket === null || !open) return { ok: false, detail: 'the websocket to Arena is not open' }
			socket.send(wire.message)
			return { ok: true }
		}
		for (const call of wire.calls) {
			try {
				const text = call.body !== null && typeof call.body === 'object'
				const r = await fetch(rest + call.path, {
					method: 'POST',
					headers: call.body === null ? {} : { 'content-type': text ? 'text/plain' : 'application/json' },
					body: call.body === null ? null : typeof call.body === 'object' ? call.body.text : JSON.stringify(call.body),
					signal: AbortSignal.timeout(ARENA_REQUEST_TIMEOUT_MS),
				})
				if (!r.ok) return { ok: false, detail: `Arena answered ${r.status}` }
			} catch (e) {
				const why = (e as Error).name === 'TimeoutError' ? 'Arena did not answer in time' : (e as Error).message
				console.log(`[arena] sending failed: ${why}`)
				return { ok: false, detail: why }
			}
		}
		return { ok: true }
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
		async command(raw) {
			const latest = channel.latest
			// Only against a composition read on this connection: an id from a
			// stale or failed read may name something Arena no longer has.
			if (!open || latest === null || !latest.ok) return { ok: false, detail: 'Arena is not answering, so nothing was sent' }
			const checked = checkCommand(raw, latest.value)
			if (!checked.ok) return { ok: false, detail: checked.detail }
			const { command, wire } = checked.value
			if (command.kind !== 'fader') console.log(`[arena] ${describe(command, latest.value)}`)
			return send(wire)
		},
		async open(clipId, file, onScreen) {
			const latest = channel.latest
			if (!open || latest === null || !latest.ok) return { ok: false, detail: 'Arena is not answering, so nothing was loaded' }
			const wire = openWire(latest.value, clipId, fileUrlOf(file), onScreen)
			if (!wire.ok) return { ok: false, detail: wire.detail }
			const layer = latest.value.layers.find((l) => l.slots.some((s) => s.id === clipId))
			const column = (layer?.slots.findIndex((s) => s.id === clipId) ?? -1) + 1
			const playing = layer?.slots[column - 1]?.state === 'playing'
			console.log(`[arena] loading ${file} into ${layer?.name ?? 'a layer'}, column ${column}${playing ? ', ON SCREEN (the operator said yes)' : ''}`)
			return send(wire.value)
		},
		async empty(clipId, code) {
			const latest = channel.latest
			if (!open || latest === null || !latest.ok) return { ok: false, detail: 'Arena is not answering, so nothing was cleared' }
			const wire = emptyWire(latest.value, clipId, code)
			if (!wire.ok) return { ok: false, detail: wire.detail }
			const layer = latest.value.layers.find((l) => l.slots.some((s) => s.id === clipId))
			const column = (layer?.slots.findIndex((s) => s.id === clipId) ?? -1) + 1
			console.log(`[arena] clearing old foreground ${code} from ${layer?.name ?? 'a layer'}, column ${column}`)
			return send(wire.value)
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

/** A command, in words for the kiosk log: what was fired, so the log says
 *  what someone asked for when the screen is asked about afterwards. */
function describe(command: ArenaCommand, tree: ArenaTree): string {
	switch (command.kind) {
		case 'clip': {
			const layer = tree.layers.find((l) => l.slots.some((s) => s.id === command.clipId))
			const slot = layer?.slots.find((s) => s.id === command.clipId)
			return `fired: ${slot?.name ?? 'a clip'} on ${layer?.name ?? 'its layer'}`
		}
		case 'column':
			return `fired: ${tree.columns.find((c) => c.id === command.columnId)?.name ?? 'a column'}`
		case 'clear':
			return `cleared: ${tree.layers.find((l) => l.id === command.layerId)?.name ?? 'a layer'}`
		case 'fader':
			return `fader: ${tree.layers.find((l) => l.id === command.layerId)?.name ?? 'a layer'} to ${command.value.toFixed(2)}`
	}
}
