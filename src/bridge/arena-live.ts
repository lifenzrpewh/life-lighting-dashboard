// What Arena is playing, off its websocket: `ws://<host>:<port>/api/v1`.
//
// ✅ 2026-10-03, Arena 7.28.0 on Windows (docs/VISUALS_DASHBOARD.md § Seen on Arena):
// - On connect, and again after every clip connect, clear or change of preview,
//   Arena pushes the whole composition (~1.3 MB) to every listener, asked or not.
//   Which clip plays comes from there.
// - A fader moving is pushed only to a subscriber:
//   `{"action":"subscribe","parameter":"/parameter/by-id/<id>"}` answers one
//   `parameter_subscribed`, then a `parameter_update` per change, each
//   `{ id, value, valuetype, path, type }`.
// - An id Arena does not know answers `{ path, error }` and nothing else.
//
// So a composition gives the tree and the parameter id of every level in it, and
// the subscriptions keep those levels current between pushes. Parameter ids held
// across pushes; they are not assumed to survive a reconnect.
//
// THE RULE THIS FILE ENFORCES: as in ./arena.ts, a composition of the wrong shape
// fails whole, with what was wrong. A layer with no readable fader is not a layer
// at full, and a clip state this file does not know is not "not playing".

import type { ArenaClip, ArenaStatus } from '../shared/arena.js'
import type { Decoded } from './ontime.js'

type Level = { id: number; value: number }
type Flag = { id: number; value: boolean }

/** A composition, reduced to what the status needs plus the parameter id behind
 *  every level, so an update can find its place. */
export type ArenaTree = {
	master: Level
	deck: string | null
	groups: { name: string; master: Level; bypassed: Flag }[]
	layers: { name: string; group: string | null; master: Level; bypassed: Flag; playing: ArenaClip | null }[]
}

/** Every state Arena 7.28 offers for a clip's `connected`. */
const CLIP_STATES = ['Empty', 'Disconnected', 'Previewing', 'Connected', 'Connected & previewing'] as const

/** Playing, whatever the preview monitor shows: selecting another clip turns
 *  `Connected & previewing` into `Connected` without anything changing on output. */
const PLAYING: readonly string[] = ['Connected', 'Connected & previewing']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)

function level(v: unknown, what: string): Decoded<Level> {
	if (!isObject(v) || !isId(v['id'])) return { ok: false, detail: `${what} is not a parameter` }
	const value = v['value']
	if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, detail: `${what} has no level` }
	return { ok: true, value: { id: v['id'], value } }
}

function flag(v: unknown, what: string): Decoded<Flag> {
	if (!isObject(v) || !isId(v['id'])) return { ok: false, detail: `${what} is not a parameter` }
	const value = v['value']
	if (typeof value !== 'boolean') return { ok: false, detail: `${what} is not on or off` }
	return { ok: true, value: { id: v['id'], value } }
}

function text(v: unknown, what: string): Decoded<string> {
	if (!isObject(v) || typeof v['value'] !== 'string') return { ok: false, detail: `${what} has no name` }
	return { ok: true, value: v['value'].trim() }
}

/** The clip a layer is playing, or null. The first connected clip if Arena ever
 *  says more than one (during a transition, perhaps: not yet seen). */
function playingOf(clips: unknown[], layer: string): Decoded<ArenaClip | null> {
	let playing: ArenaClip | null = null
	// Every clip is read, not only up to the playing one: a clip whose state
	// cannot be read fails the layer wherever it sits.
	for (const [i, clip] of clips.entries()) {
		const what = `${layer} clip ${i + 1}`
		if (!isObject(clip) || !isObject(clip['connected'])) return { ok: false, detail: `${what} has no state` }
		const state = clip['connected']['value']
		if (typeof state !== 'string' || !(CLIP_STATES as readonly string[]).includes(state)) {
			return { ok: false, detail: `${what} is ${JSON.stringify(state)}, a state this does not know` }
		}
		if (!PLAYING.includes(state) || playing !== null) continue
		const name = text(clip['name'], what)
		if (!name.ok) return name
		const thumb = clip['thumbnail']
		const path = isObject(thumb) && typeof thumb['path'] === 'string' ? thumb['path'] : null
		const video = clip['video']
		const fileinfo = isObject(video) ? video['fileinfo'] : undefined
		const missing = isObject(fileinfo) && fileinfo['exists'] === false
		playing = { name: name.value, thumbnail: path, missing }
	}
	return { ok: true, value: playing }
}

export function decodeComposition(body: unknown): Decoded<ArenaTree> {
	if (!isObject(body) || !Array.isArray(body['layers'])) return { ok: false, detail: 'not an Arena composition' }

	const master = level(body['master'], 'the composition master')
	if (!master.ok) return master

	const decks = body['decks']
	if (!Array.isArray(decks)) return { ok: false, detail: 'the composition has no decks' }
	let deck: string | null = null
	for (const [i, d] of decks.entries()) {
		if (!isObject(d)) return { ok: false, detail: `deck ${i + 1} is not a deck` }
		const selected = flag(d['selected'], `deck ${i + 1}`)
		if (!selected.ok) return selected
		if (!selected.value.value) continue
		const name = text(d['name'], `deck ${i + 1}`)
		if (!name.ok) return name
		deck = name.value
		break
	}

	// Groups name their layers by id. Absent is no groups; present and wrong fails.
	const rawGroups = body['layergroups'] ?? []
	if (!Array.isArray(rawGroups)) return { ok: false, detail: 'the layer groups are not a list' }
	const groups: ArenaTree['groups'] = []
	const groupOf = new Map<number, string>()
	for (const [i, g] of rawGroups.entries()) {
		const what = `layer group ${i + 1}`
		if (!isObject(g) || !Array.isArray(g['layers'])) return { ok: false, detail: `${what} is not a group` }
		const name = text(g['name'], what)
		if (!name.ok) return name
		const gm = level(g['master'], `${name.value}'s master`)
		if (!gm.ok) return gm
		const gb = flag(g['bypassed'], `${name.value}'s bypass`)
		if (!gb.ok) return gb
		for (const l of g['layers']) {
			if (!isObject(l) || !isId(l['id'])) return { ok: false, detail: `${name.value} names a layer without an id` }
			groupOf.set(l['id'], name.value)
		}
		groups.push({ name: name.value, master: gm.value, bypassed: gb.value })
	}

	const layers: ArenaTree['layers'] = []
	for (const [i, l] of body['layers'].entries()) {
		if (!isObject(l) || !isId(l['id']) || !Array.isArray(l['clips'])) return { ok: false, detail: `layer ${i + 1} is not a layer` }
		const name = text(l['name'], `layer ${i + 1}`)
		if (!name.ok) return name
		const lm = level(l['master'], `${name.value}'s master`)
		if (!lm.ok) return lm
		const lb = flag(l['bypassed'], `${name.value}'s bypass`)
		if (!lb.ok) return lb
		const playing = playingOf(l['clips'], name.value)
		if (!playing.ok) return playing
		layers.push({ name: name.value, group: groupOf.get(l['id']) ?? null, master: lm.value, bypassed: lb.value, playing: playing.value })
	}

	return { ok: true, value: { master: master.value, deck, groups, layers } }
}

/** Every parameter whose changes are pushed only to a subscriber. Which clip
 *  plays is not among them: that comes with every composition. */
export function subscriptionsOf(tree: ArenaTree): number[] {
	return [
		tree.master.id,
		...tree.groups.flatMap((g) => [g.master.id, g.bypassed.id]),
		...tree.layers.flatMap((l) => [l.master.id, l.bypassed.id]),
	]
}

/** The message that asks Arena for one parameter's changes. */
export function subscribeMessage(id: number): string {
	return JSON.stringify({ action: 'subscribe', parameter: `/parameter/by-id/${id}` })
}

/** Fold one parameter's new value into the tree. `null` when the id is not one
 *  of the tree's levels; a value of the wrong kind for its level fails. */
export function applyParameter(tree: ArenaTree, id: number, value: unknown): Decoded<ArenaTree> | null {
	const all: (Level | Flag)[] = [tree.master, ...tree.groups.flatMap((g) => [g.master, g.bypassed]), ...tree.layers.flatMap((l) => [l.master, l.bypassed])]
	const target = all.find((p) => p.id === id)
	if (target === undefined) return null
	const wanted = typeof target.value
	if (typeof value !== wanted || (wanted === 'number' && !Number.isFinite(value))) {
		return { ok: false, detail: `parameter ${id} sent ${JSON.stringify(value)}, not a ${wanted === 'number' ? 'level' : 'flag'}` }
	}
	// The kind was checked against the target above, so the value fits it.
	const set = <P extends Level | Flag>(p: P): P => (p.id === id ? ({ ...p, value } as P) : p)
	return {
		ok: true,
		value: {
			master: set(tree.master),
			deck: tree.deck,
			groups: tree.groups.map((g) => ({ ...g, master: set(g.master), bypassed: set(g.bypassed) })),
			layers: tree.layers.map((l) => ({ ...l, master: set(l.master), bypassed: set(l.bypassed) })),
		},
	}
}

/** The tree without its parameter ids: what crosses to anyone else. */
export function statusOf(tree: ArenaTree): ArenaStatus {
	return {
		master: tree.master.value,
		deck: tree.deck,
		groups: tree.groups.map((g) => ({ name: g.name, master: g.master.value, bypassed: g.bypassed.value })),
		layers: tree.layers.map((l) => ({ name: l.name, group: l.group, master: l.master.value, bypassed: l.bypassed.value, playing: l.playing })),
	}
}

/** One websocket message, sorted. A composition is handed back parsed, so the
 *  1.3 MB is read once. */
export type ArenaMessage =
	| { kind: 'composition'; body: Record<string, unknown> }
	| { kind: 'parameter'; id: number; value: unknown }
	| { kind: 'refused'; path: string; detail: string }
	| { kind: 'other'; type: string }
	| { kind: 'unreadable'; detail: string }

export function decodeMessage(raw: string): ArenaMessage {
	let msg: unknown
	try {
		msg = JSON.parse(raw)
	} catch {
		return { kind: 'unreadable', detail: `not JSON, ${raw.length} bytes` }
	}
	if (!isObject(msg)) return { kind: 'unreadable', detail: 'not an object' }
	const type = msg['type']
	if (type === 'parameter_update' || type === 'parameter_subscribed') {
		if (!isId(msg['id']) || !('value' in msg)) return { kind: 'unreadable', detail: `${type} without an id and value` }
		return { kind: 'parameter', id: msg['id'], value: msg['value'] }
	}
	if (typeof msg['error'] === 'string') return { kind: 'refused', path: String(msg['path'] ?? '?'), detail: msg['error'] }
	if (type === undefined && Array.isArray(msg['layers'])) return { kind: 'composition', body: msg }
	return { kind: 'other', type: typeof type === 'string' ? type : 'untyped' }
}
