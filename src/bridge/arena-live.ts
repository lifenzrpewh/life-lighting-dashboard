// What Arena is playing, off its websocket: `ws://<host>:<port>/api/v1`.
//
// ✅ 2026-10-03, Arena 7.28.0 on Windows (docs/VISUALS_DASHBOARD.md § Seen on Arena):
// - On connect, and again after every clip connect, clear or change of preview,
//   Arena pushes the whole composition (~1.3 MB) to every listener, asked or not.
//   Which clip plays comes from there.
// - A fader moving, or a clip's position, is pushed only to a subscriber:
//   `{"action":"subscribe","parameter":"/parameter/by-id/<id>"}` answers one
//   `parameter_subscribed`, then a `parameter_update` per change, each
//   `{ id, value, valuetype, path, type }`. `unsubscribe` takes the same shape
//   (Arena's own example page uses it).
// - An id Arena does not know answers `{ path, error }` and nothing else.
// - A connected clip's position is pushed ~100 times a second, in milliseconds of
//   the clip, which runs at its speed × its group's × the composition's.
//
// So a composition gives the tree and the parameter id of everything in it that
// moves, and the subscriptions keep those current between pushes. Parameter ids
// held across pushes; they are not assumed to survive a reconnect.
//
// THE RULE THIS FILE ENFORCES: as in ./arena.ts, a composition of the wrong shape
// fails whole, with what was wrong. A layer with no readable fader is not a layer
// at full, and a clip state this file does not know is not "not playing".

import type { ArenaClip, ArenaColumn, ArenaSlot, ArenaStatus, SlotState } from '../shared/arena.js'
import type { Decoded } from './ontime.js'

type Param<T> = { id: number; value: T }
type Level = Param<number>
type Flag = Param<boolean>
type Choice = Param<string>

type TreeTransport = {
	/** Its value in clip-milliseconds; `max` is the transport's length. */
	position: Level & { max: number }
	playmode: Choice
	direction: Choice
	speed: Level
}

type TreeClip = Omit<ArenaClip, 'transport'> & { transport: TreeTransport | null }

/** A composition, reduced to what the status needs plus the parameter id behind
 *  everything that moves, so an update can find its place. */
export type ArenaTree = {
	master: Level
	speed: Level
	deck: string | null
	groups: { name: string; master: Level; bypassed: Flag; speed: Level }[]
	layers: { id: number; name: string; group: string | null; master: Level; bypassed: Flag; playing: TreeClip | null; slots: ArenaSlot[] }[]
	columns: ArenaColumn[]
}

/** Every state Arena 7.28 offers for a clip's `connected`. */
const CLIP_STATES = ['Empty', 'Disconnected', 'Previewing', 'Connected', 'Connected & previewing'] as const

/** Playing, whatever the preview monitor shows: selecting another clip turns
 *  `Connected & previewing` into `Connected` without anything changing on output. */
const PLAYING: readonly string[] = ['Connected', 'Connected & previewing']

/** Every state Arena 7.28 offers for a column's `connected`. */
const COLUMN_STATES = ['Empty', 'Disconnected', 'Connected'] as const

const slotState = (state: string): SlotState => (state === 'Empty' ? 'empty' : PLAYING.includes(state) ? 'playing' : 'loaded')

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

function choice(v: unknown, what: string): Decoded<Choice> {
	if (!isObject(v) || !isId(v['id'])) return { ok: false, detail: `${what} is not a parameter` }
	const value = v['value']
	if (typeof value !== 'string') return { ok: false, detail: `${what} has no setting` }
	return { ok: true, value: { id: v['id'], value } }
}

function text(v: unknown, what: string): Decoded<string> {
	if (!isObject(v) || typeof v['value'] !== 'string') return { ok: false, detail: `${what} has no name` }
	return { ok: true, value: v['value'].trim() }
}

/** A playing clip's transport. Null for a clip not on a `Timeline` (synced to the
 *  BPM, not yet seen), whose position is not in milliseconds. */
function transportOf(clip: Record<string, unknown>, what: string): Decoded<TreeTransport | null> {
	const type = clip['transporttype']
	if (!isObject(type) || type['value'] !== 'Timeline') return { ok: true, value: null }
	const t = clip['transport']
	if (!isObject(t) || !isObject(t['controls'])) return { ok: false, detail: `${what} has no transport` }
	const position = level(t['position'], `${what}'s position`)
	if (!position.ok) return position
	const max = (t['position'] as Record<string, unknown>)['max']
	if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) return { ok: false, detail: `${what} has no length` }
	const c = t['controls']
	const playmode = choice(c['playmode'], `${what}'s play mode`)
	if (!playmode.ok) return playmode
	const direction = choice(c['playdirection'], `${what}'s direction`)
	if (!direction.ok) return direction
	const speed = level(c['speed'], `${what}'s speed`)
	if (!speed.ok) return speed
	return { ok: true, value: { position: { ...position.value, max }, playmode: playmode.value, direction: direction.value, speed: speed.value } }
}

/** A clip's thumbnail, or null. ✅ 2026-10-03: a clip Arena has not drawn a
 *  thumbnail for says `is_default: true` and points at `/thumbnail/dummy`, a
 *  blank image. That is Arena giving none, so it reads as none. */
function thumbnailOf(clip: Record<string, unknown>): ArenaClip['thumbnail'] {
	const thumb = clip['thumbnail']
	const version = isObject(thumb) && thumb['is_default'] !== true ? thumb['last_update'] : undefined
	return isId(clip['id']) && (typeof version === 'string' || typeof version === 'number') ? { clipId: clip['id'], version: String(version) } : null
}

/** The file Arena says is not on this machine, or null. ✅ 2026-10-03: a
 *  missing file reads `video.fileinfo.exists: false`; a generator has no
 *  `fileinfo` at all. A clip's sound has a `fileinfo` of its own. */
function missingFileOf(clip: Record<string, unknown>): string | null {
	for (const part of ['video', 'audio']) {
		const p = clip[part]
		const info = isObject(p) ? p['fileinfo'] : undefined
		if (isObject(info) && info['exists'] === false) {
			return typeof info['path'] === 'string' && info['path'] !== '' ? info['path'] : '(a file Arena does not name)'
		}
	}
	return null
}

/** Every cell of a layer, and the clip it is playing, or null. The first
 *  connected clip if Arena ever says more than one (during a transition,
 *  perhaps: not yet seen). */
function clipsOf(clips: unknown[], layer: string): Decoded<{ playing: TreeClip | null; slots: ArenaSlot[] }> {
	let playing: TreeClip | null = null
	const slots: ArenaSlot[] = []
	// Every clip is read, not only up to the playing one: a clip whose state
	// cannot be read fails the layer wherever it sits.
	for (const [i, clip] of clips.entries()) {
		const what = `${layer} clip ${i + 1}`
		if (!isObject(clip) || !isObject(clip['connected'])) return { ok: false, detail: `${what} has no state` }
		const state = clip['connected']['value']
		if (typeof state !== 'string' || !(CLIP_STATES as readonly string[]).includes(state)) {
			return { ok: false, detail: `${what} is ${JSON.stringify(state)}, a state this does not know` }
		}
		if (!isId(clip['id'])) return { ok: false, detail: `${what} has no id` }
		const named: Decoded<string> = state === 'Empty' ? { ok: true, value: '' } : text(clip['name'], what)
		if (!named.ok) return named
		const missingFile = state === 'Empty' ? null : missingFileOf(clip)
		slots.push({ id: clip['id'], name: named.value, state: slotState(state), thumbnail: state === 'Empty' ? null : thumbnailOf(clip), missingFile })
		if (!PLAYING.includes(state) || playing !== null) continue
		const transport = transportOf(clip, `${layer}'s ${named.value}`)
		if (!transport.ok) return transport
		playing = { name: named.value, thumbnail: thumbnailOf(clip), missing: missingFile !== null, transport: transport.value }
	}
	return { ok: true, value: { playing, slots } }
}

/** The columns, in order. Arena's default name `Column #` stands for the
 *  column's number, as its own panel shows it. */
function columnsOf(raw: unknown): Decoded<ArenaColumn[]> {
	if (!Array.isArray(raw)) return { ok: false, detail: 'the composition has no columns' }
	const columns: ArenaColumn[] = []
	for (const [i, c] of raw.entries()) {
		const what = `column ${i + 1}`
		if (!isObject(c) || !isId(c['id']) || !isObject(c['connected'])) return { ok: false, detail: `${what} is not a column` }
		const state = c['connected']['value']
		if (typeof state !== 'string' || !(COLUMN_STATES as readonly string[]).includes(state)) {
			return { ok: false, detail: `${what} is ${JSON.stringify(state)}, a state this does not know` }
		}
		const name = text(c['name'], what)
		if (!name.ok) return name
		columns.push({ id: c['id'], name: name.value.replaceAll('#', String(i + 1)), state: slotState(state) })
	}
	return { ok: true, value: columns }
}

export function decodeComposition(body: unknown): Decoded<ArenaTree> {
	if (!isObject(body) || !Array.isArray(body['layers'])) return { ok: false, detail: 'not an Arena composition' }

	const master = level(body['master'], 'the composition master')
	if (!master.ok) return master
	const speed = level(body['speed'], "the composition's speed")
	if (!speed.ok) return speed

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
		const gs = level(g['speed'], `${name.value}'s speed`)
		if (!gs.ok) return gs
		for (const l of g['layers']) {
			if (!isObject(l) || !isId(l['id'])) return { ok: false, detail: `${name.value} names a layer without an id` }
			groupOf.set(l['id'], name.value)
		}
		groups.push({ name: name.value, master: gm.value, bypassed: gb.value, speed: gs.value })
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
		const clips = clipsOf(l['clips'], name.value)
		if (!clips.ok) return clips
		layers.push({
			id: l['id'],
			name: name.value,
			group: groupOf.get(l['id']) ?? null,
			master: lm.value,
			bypassed: lb.value,
			playing: clips.value.playing,
			slots: clips.value.slots,
		})
	}

	const columns = columnsOf(body['columns'])
	if (!columns.ok) return columns

	return { ok: true, value: { master: master.value, speed: speed.value, deck, groups, layers, columns: columns.value } }
}

/** Every parameter in the tree that moves: what to subscribe to. Which clip
 *  plays is not among them: that comes with every composition. */
function paramsOf(tree: ArenaTree): Param<unknown>[] {
	const transport = (t: TreeTransport | null) => (t === null ? [] : [t.position, t.playmode, t.direction, t.speed])
	return [
		tree.master,
		tree.speed,
		...tree.groups.flatMap((g) => [g.master, g.bypassed, g.speed]),
		...tree.layers.flatMap((l) => [l.master, l.bypassed, ...transport(l.playing?.transport ?? null)]),
	]
}

export function subscriptionsOf(tree: ArenaTree): number[] {
	return paramsOf(tree).map((p) => p.id)
}

/** The message that asks Arena for one parameter's changes. */
export function subscribeMessage(id: number): string {
	return JSON.stringify({ action: 'subscribe', parameter: `/parameter/by-id/${id}` })
}

/** The message that stops them: for a clip no longer playing, whose position
 *  would otherwise keep arriving ~100 times a second for nothing. */
export function unsubscribeMessage(id: number): string {
	return JSON.stringify({ action: 'unsubscribe', parameter: `/parameter/by-id/${id}` })
}

/** Fold one parameter's new value into the tree. `null` when the id is not one
 *  of the tree's; a value of the wrong kind for its parameter fails. */
export function applyParameter(tree: ArenaTree, id: number, value: unknown): Decoded<ArenaTree> | null {
	const target = paramsOf(tree).find((p) => p.id === id)
	if (target === undefined) return null
	const wanted = typeof target.value
	if (typeof value !== wanted || (wanted === 'number' && !Number.isFinite(value))) {
		const kind = wanted === 'number' ? 'a number' : wanted === 'boolean' ? 'on or off' : 'a setting'
		return { ok: false, detail: `parameter ${id} sent ${JSON.stringify(value)}, not ${kind}` }
	}
	// The kind was checked against the target above, so the value fits it.
	const set = <P extends Param<unknown>>(p: P): P => (p.id === id ? ({ ...p, value } as P) : p)
	const transport = (t: TreeTransport | null): TreeTransport | null =>
		t === null ? null : { position: set(t.position), playmode: set(t.playmode), direction: set(t.direction), speed: set(t.speed) }
	return {
		ok: true,
		value: {
			master: set(tree.master),
			speed: set(tree.speed),
			deck: tree.deck,
			columns: tree.columns,
			groups: tree.groups.map((g) => ({ ...g, master: set(g.master), bypassed: set(g.bypassed), speed: set(g.speed) })),
			layers: tree.layers.map((l) => ({
				...l,
				master: set(l.master),
				bypassed: set(l.bypassed),
				playing: l.playing === null ? null : { ...l.playing, transport: transport(l.playing.transport) },
			})),
		},
	}
}

/** The tree without its parameter ids: what crosses to anyone else. A clip's
 *  rate is worked out here, where its group's speed is known. */
export function statusOf(tree: ArenaTree): ArenaStatus {
	const groupSpeed = new Map(tree.groups.map((g) => [g.name, g.speed.value]))
	return {
		master: tree.master.value,
		deck: tree.deck,
		groups: tree.groups.map((g) => ({ name: g.name, master: g.master.value, bypassed: g.bypassed.value })),
		layers: tree.layers.map((l) => {
			const clip = l.playing
			const t = clip?.transport ?? null
			const rate = t === null ? 0 : t.speed.value * (l.group === null ? 1 : (groupSpeed.get(l.group) ?? 1)) * tree.speed.value
			return {
				id: l.id,
				name: l.name,
				group: l.group,
				master: l.master.value,
				bypassed: l.bypassed.value,
				playing:
					clip === null
						? null
						: {
								name: clip.name,
								thumbnail: clip.thumbnail,
								missing: clip.missing,
								transport:
									t === null
										? null
										: { positionMs: t.position.value, lengthMs: t.position.max, playmode: t.playmode.value, direction: t.direction.value, rate },
							},
				slots: l.slots,
			}
		}),
		columns: tree.columns,
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
