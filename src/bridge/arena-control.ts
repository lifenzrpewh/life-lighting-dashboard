// What the Clips view may ask Arena to do, and exactly what goes on the wire
// for it (docs/VISUALS_DASHBOARD.md § Answered, 2026-10-03 evening: tap a clip,
// fire a column, clear a layer, drag a layer's fader; everyone may).
//
// THE RULES THIS FILE ENFORCES:
// - Four things from the page and no others, and two from main: loading a
//   file the media fetch copied (`openWire`, ../shared/media-fetch.ts), never
//   into a clip that is playing unless the operator said so; and emptying an
//   old foreground the operator ticked (`emptyWire`), never anything else.
// - From the page, four things and no others. Every request is built here from a template
//   with an id in it; nothing from the page becomes a path. Arena's API has
//   neighbours that destroy the show: `/clips/by-id/<id>/clear` empties a
//   clip slot ("removing all tracks and settings"), `/layers/by-id/<id>/clearclips`
//   empties a whole layer. A slip of one word, so test/arena-control.test.js
//   fails if any path built here could be either.
// - Every id is checked against the composition main holds before anything is
//   sent. A tap on a picture a second old must not fire whatever now sits at
//   that place, so ids, not positions, and only ids that are still there.
// - Sent is not done. What plays is read back from Arena's next push; the
//   view never draws a clip as playing because it was tapped.
//
// ✅ On Arena 7.28, 2026-10-04:
// - Connecting a clip or a column is one POST with no body, which Arena's own
//   API description calls a short click (a press and a release). It connected
//   66 of 66 VFX clips, selected or not, and column 1. A press and a release
//   sent as `true` then `false` did NOT: an unselected clip was only
//   selected, a selected one stayed previewing, and in the kiosk the first tap
//   on each layer did nothing. (An earlier note, 2026-10-03, had this the
//   other way round; checked variant by variant with settle time, it is this.)
// - `POST /composition/layers/by-id/<id>/clear` disconnects what plays on it.
// - A fader set over the websocket, `{"action":"set","parameter":
//   "/parameter/by-id/<id>","value":0.3}`, moved VFX 4's master and was pushed
//   back to the subscriber, so the read-back comes free.

import type { ArenaCommand } from '../shared/arena.js'
import { slotCode, TYPE_LAYER } from '../shared/holding.js'
import type { ArenaTree } from './arena-live.js'
import type { Decoded } from './ontime.js'

/** What to do on the wire for one command. */
export type ArenaWire =
	/** POSTs to Arena's REST API, in order, each `body` sent as JSON, or as
	 *  text when it is `{ text }`. */
	| { kind: 'rest'; calls: { path: string; body: boolean | null | { text: string } }[] }
	/** One message on the websocket main already holds. */
	| { kind: 'socket'; message: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0

/** A command off the page, checked for shape and against the composition.
 *  Anything else fails, with why. */
export function checkCommand(raw: unknown, tree: ArenaTree): Decoded<{ command: ArenaCommand; wire: ArenaWire }> {
	if (!isObject(raw)) return { ok: false, detail: 'not a command' }
	switch (raw['kind']) {
		case 'clip': {
			const clipId = raw['clipId']
			if (!isId(clipId)) return { ok: false, detail: 'a clip command without a clip' }
			const found = tree.layers.flatMap((l) => l.slots).find((s) => s.id === clipId)
			if (found === undefined) return { ok: false, detail: 'that clip is no longer in the composition' }
			if (found.state === 'empty') return { ok: false, detail: 'that slot is empty' }
			return { ok: true, value: { command: { kind: 'clip', clipId }, wire: click(`/composition/clips/by-id/${clipId}/connect`) } }
		}
		case 'column': {
			const columnId = raw['columnId']
			if (!isId(columnId)) return { ok: false, detail: 'a column command without a column' }
			if (!tree.columns.some((c) => c.id === columnId)) return { ok: false, detail: 'that column is no longer in the composition' }
			return { ok: true, value: { command: { kind: 'column', columnId }, wire: click(`/composition/columns/by-id/${columnId}/connect`) } }
		}
		case 'clear': {
			const layerId = raw['layerId']
			if (!isId(layerId)) return { ok: false, detail: 'a clear command without a layer' }
			if (!tree.layers.some((l) => l.id === layerId)) return { ok: false, detail: 'that layer is no longer in the composition' }
			return { ok: true, value: { command: { kind: 'clear', layerId }, wire: { kind: 'rest', calls: [{ path: `/composition/layers/by-id/${layerId}/clear`, body: null }] } } }
		}
		case 'fader': {
			const layerId = raw['layerId']
			const value = raw['value']
			if (!isId(layerId)) return { ok: false, detail: 'a fader command without a layer' }
			if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return { ok: false, detail: 'a fader goes from 0 to 1' }
			const layer = tree.layers.find((l) => l.id === layerId)
			if (layer === undefined) return { ok: false, detail: 'that layer is no longer in the composition' }
			return {
				ok: true,
				value: {
					command: { kind: 'fader', layerId, value },
					wire: { kind: 'socket', message: JSON.stringify({ action: 'set', parameter: `/parameter/by-id/${layer.master.id}`, value }) },
				},
			}
		}
		default:
			return { ok: false, detail: `not one of the four things the Clips view may do: ${JSON.stringify(raw['kind'])}` }
	}
}

/** Load a file into a clip: main's alone, for the media fetch. The clip must
 *  still be in the composition, and not playing unless `live` (the operator
 *  said yes to replacing it on screen), because a load into a playing clip
 *  changes the output there and then. ✅ Arena 7.28, 2026-10-05: 204, and the
 *  clip read back with the file. */
export function openWire(tree: ArenaTree, clipId: number, fileUrl: string, live = false): Decoded<ArenaWire> {
	if (!isId(clipId)) return { ok: false, detail: 'not a clip' }
	if (!fileUrl.startsWith('file:///')) return { ok: false, detail: 'not a file on this computer' }
	const slot = tree.layers.flatMap((l) => l.slots).find((s) => s.id === clipId)
	if (slot === undefined) return { ok: false, detail: 'that clip is no longer in the composition' }
	if (slot.state === 'playing' && !live) return { ok: false, detail: 'that clip is playing; nothing is loaded into a clip on output' }
	return { ok: true, value: { kind: 'rest', calls: [{ path: `/composition/clips/by-id/${clipId}/open`, body: { text: fileUrl } }] } }
}

/** Empty an old foreground's clip slot: main's alone, for Clear old FGs (the
 *  owner, 2026-10-05; ../shared/holding.ts `oldForegrounds`), never the Clips
 *  view's. This is the `/clips/by-id/<id>/clear` the header warns of, so it is
 *  allowed only where the confirmation said: a clip on the foreground layer
 *  (HOLD FG), still holding the code the operator was shown, and not on
 *  screen. A slot that changed since is left alone. ⚠️ What Arena 7.28 does
 *  with it is its API's word ("removing all tracks and settings"), not yet
 *  watched here. */
export function emptyWire(tree: ArenaTree, clipId: number, code: string): Decoded<ArenaWire> {
	if (!isId(clipId)) return { ok: false, detail: 'not a clip' }
	const layer = tree.layers.find((l) => l.slots.some((s) => s.id === clipId))
	const slot = layer?.slots.find((s) => s.id === clipId)
	if (layer === undefined || slot === undefined) return { ok: false, detail: 'that clip is no longer in the composition' }
	if (TYPE_LAYER['F']?.test(layer.name.trim()) !== true) return { ok: false, detail: `only old foregrounds are cleared, and this clip is on ${layer.name}` }
	if (slot.state === 'empty') return { ok: false, detail: 'that slot is already empty' }
	if (slot.state === 'playing') return { ok: false, detail: 'that clip is on screen; nothing on screen is cleared' }
	if (slotCode(slot) !== code) return { ok: false, detail: `that slot no longer holds ${code}` }
	return { ok: true, value: { kind: 'rest', calls: [{ path: `/composition/clips/by-id/${clipId}/clear`, body: null }] } }
}

/** A tap, as Arena wants it: one POST with no body, its short click. */
function click(path: string): ArenaWire {
	return { kind: 'rest', calls: [{ path, body: null }] }
}
