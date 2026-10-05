import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { checkCommand, emptyWire } from '../dist/src/bridge/arena-control.js'
import { decodeComposition, statusOf } from '../dist/src/bridge/arena-live.js'
import { missingMedia } from '../dist/src/shared/arena.js'

// The same pruned OH2026 composition the decoder's tests read, with the real
// columns: 10 layers, 9 columns, PLAYBACK's Solid Color connected.
const real = () => JSON.parse(fs.readFileSync(new URL('./fixtures/arena-composition-oh2026.json', import.meta.url), 'utf8'))
const tree = (body = real()) => {
	const r = decodeComposition(body)
	assert.ok(r.ok, r.detail)
	return r.value
}
const vfx1 = (t) => t.layers.find((l) => l.name === 'VFX 1')

test('every cell and column is read, with the ids a tap fires', () => {
	const t = tree()
	assert.equal(t.columns.length, 9)
	// Arena's default `Column #` is the column's number, as its panel shows it.
	assert.deepEqual(
		t.columns.map((c) => c.name),
		['Column 1', 'Column 2', 'Column 3', 'Column 4', 'Column 5', 'Column 6', 'Column 7', 'Column 8', 'Column 9'],
	)
	assert.ok(t.layers.every((l) => l.slots.length === 9))
	const v = vfx1(t)
	assert.deepEqual(
		v.slots.slice(0, 3).map((s) => [s.name, s.state, s.missingFile]),
		[
			['MicrosoftTeams-video', 'loaded', null],
			['Solid Color', 'loaded', null],
			['', 'empty', null],
		],
	)
	const playback = t.layers.find((l) => l.name === 'PLAYBACK')
	assert.equal(playback.slots[0].state, 'playing')
	// The renderer gets the cells and columns too, without parameter ids.
	const status = statusOf(t)
	assert.deepEqual(status.columns, t.columns)
	assert.equal(status.layers[4].id, v.id)
	assert.equal(status.layers[4].master.id, undefined)
})

test('a column or clip state this does not know fails the composition whole', () => {
	const body = real()
	body.columns[3].connected.value = 'Half connected'
	const r = decodeComposition(body)
	assert.equal(r.ok, false)
	assert.match(r.detail, /column 4 is "Half connected"/)
	const none = real()
	delete none.columns
	assert.match(decodeComposition(none).detail, /no columns/)
})

test('a clip whose file is not on this machine is listed, top layer first', () => {
	const body = real()
	body.layers[4].clips[0].video.fileinfo = { path: 'I:\\VFX Media Renamed\\0412 Walls.mov', exists: false }
	const status = statusOf(tree(body))
	assert.deepEqual(missingMedia(status), [{ layer: 'VFX 1', column: 1, clip: 'MicrosoftTeams-video', file: 'I:\\VFX Media Renamed\\0412 Walls.mov' }])
	// All there: nothing to say.
	assert.deepEqual(missingMedia(statusOf(tree())), [])
})

test("a tap is one bodiless POST (Arena's short click), by id, on the clip or column", () => {
	const t = tree()
	const clip = vfx1(t).slots[0]
	const r = checkCommand({ kind: 'clip', clipId: clip.id }, t)
	assert.ok(r.ok, r.detail)
	// Not `true` then `false`: on 2026-10-04 that only selected an unselected
	// clip, so the first tap on each layer did nothing.
	assert.deepEqual(r.value.wire, { kind: 'rest', calls: [{ path: `/composition/clips/by-id/${clip.id}/connect`, body: null }] })
	const col = checkCommand({ kind: 'column', columnId: t.columns[1].id }, t)
	assert.ok(col.ok)
	assert.equal(col.value.wire.calls[0].path, `/composition/columns/by-id/${t.columns[1].id}/connect`)
})

test('clear disconnects the layer; the fader is a set on its master over the socket', () => {
	const t = tree()
	const v = vfx1(t)
	const clear = checkCommand({ kind: 'clear', layerId: v.id }, t)
	assert.deepEqual(clear.value.wire, { kind: 'rest', calls: [{ path: `/composition/layers/by-id/${v.id}/clear`, body: null }] })
	const fader = checkCommand({ kind: 'fader', layerId: v.id, value: 0.3 }, t)
	assert.deepEqual(JSON.parse(fader.value.wire.message), { action: 'set', parameter: `/parameter/by-id/${v.master.id}`, value: 0.3 })
})

test('nothing is sent for what the composition does not hold, or the wrong shape', () => {
	const t = tree()
	const v = vfx1(t)
	const refuse = (raw, why) => {
		const r = checkCommand(raw, t)
		assert.equal(r.ok, false, JSON.stringify(raw))
		assert.match(r.detail, why)
	}
	refuse({ kind: 'clip', clipId: 123 }, /no longer in the composition/)
	refuse({ kind: 'clip', clipId: v.slots[2].id }, /empty/)
	refuse({ kind: 'clip', clipId: '1771294214183' }, /without a clip/)
	refuse({ kind: 'column', columnId: v.id }, /no longer in the composition/)
	refuse({ kind: 'clear', layerId: v.slots[0].id }, /no longer in the composition/)
	refuse({ kind: 'fader', layerId: v.id, value: 1.5 }, /0 to 1/)
	refuse({ kind: 'fader', layerId: v.id, value: Number.NaN }, /0 to 1/)
	refuse({ kind: 'clearclips', layerId: v.id }, /not one of the four/)
	refuse(null, /not a command/)
})

test('no command can reach the endpoints that empty a slot or a layer', () => {
	// `/clips/by-id/<id>/clear` removes a clip's media and settings, and
	// `/layers/by-id/<id>/clearclips` every clip on a layer. Every path this
	// module can build, for every id in the composition, is checked.
	const t = tree()
	const commands = [
		...t.layers.flatMap((l) => l.slots.filter((s) => s.state !== 'empty').map((s) => ({ kind: 'clip', clipId: s.id }))),
		...t.columns.map((c) => ({ kind: 'column', columnId: c.id })),
		...t.layers.map((l) => ({ kind: 'clear', layerId: l.id })),
	]
	assert.ok(commands.length > 20)
	for (const c of commands) {
		const r = checkCommand(c, t)
		assert.ok(r.ok, r.detail)
		for (const call of r.value.wire.calls) {
			assert.doesNotMatch(call.path, /clearclips/)
			assert.doesNotMatch(call.path, /\/clips\/.*\/clear/)
			assert.match(call.path, /^\/composition\/(clips|columns)\/by-id\/\d+\/connect$|^\/composition\/layers\/by-id\/\d+\/clear$/)
		}
	}
})

test('Clear old FGs empties only a HOLD FG clip still holding the code shown, never one on screen', () => {
	const t = tree()
	const fg = t.layers.find((l) => l.name === 'HOLD FG')
	const at = (i, slot) => (fg.slots[i] = { ...fg.slots[i], ...slot })
	at(0, { name: 'CF561-Sunday-UpdateDetails', state: 'loaded', file: 'C:\Media\CF561-Sunday-UpdateDetails.png', missingFile: null })
	at(1, { name: 'CF593-Sunday-Prayer', state: 'playing', file: 'C:\Media\CF593-Sunday-Prayer.png', missingFile: null })
	at(2, { name: '', state: 'empty', file: null, missingFile: null })
	const id = fg.slots[0].id
	assert.deepEqual(emptyWire(t, id, 'CF561').value, { kind: 'rest', calls: [{ path: `/composition/clips/by-id/${id}/clear`, body: null }] })
	assert.match(emptyWire(t, id, 'CF999').detail, /no longer holds CF999/)
	assert.match(emptyWire(t, fg.slots[1].id, 'CF593').detail, /on screen/)
	assert.match(emptyWire(t, fg.slots[2].id, 'CF561').detail, /already empty/)
	assert.match(emptyWire(t, vfx1(t).slots[0].id, 'CF561').detail, /only old foregrounds/)
	assert.match(emptyWire(t, 999999, 'CF561').detail, /no longer in the composition/)
})
