import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { applyParameter, decodeComposition, decodeMessage, statusOf, subscribeMessage, subscriptionsOf } from '../dist/src/bridge/arena-live.js'
import { clipIdOfThumbnail, thumbnailUrl } from '../dist/src/shared/arena.js'

// Arena 7.28.0's composition as `GET /api/v1/composition` gave it on 2026-10-03,
// show OH2026, pruned from 1.3 MB to the fields read here: PLAYBACK has a Solid
// Color connected, VFX 4's video file is on a drive this box does not have.
const real = () => JSON.parse(fs.readFileSync(new URL('./fixtures/arena-composition-oh2026.json', import.meta.url), 'utf8'))

const decoded = (body) => {
	const r = decodeComposition(body)
	assert.ok(r.ok, r.detail)
	return r.value
}

test('the real composition: what plays, where, and how loud', () => {
	const status = statusOf(decoded(real()))
	assert.equal(status.master, 1)
	assert.equal(status.deck, 'TILL THE WALLS')
	assert.deepEqual(
		status.groups.map((g) => g.name),
		['A SCREENS', 'HOLDING', 'VFX'],
	)
	assert.deepEqual(
		status.layers.map((l) => l.name),
		['PRE & POST', 'HOLD BG', 'PLAYBACK', 'HOLD FG', 'VFX 1', 'VFX 2', 'VFX 3', 'VFX 4', 'VFX 5', 'VFX 6'],
	)
	const playback = status.layers[2]
	assert.equal(playback.group, 'HOLDING')
	assert.equal(playback.master, 1)
	assert.equal(playback.bypassed, false)
	assert.deepEqual(playback.playing, {
		name: 'Solid Color',
		thumbnail: { clipId: 1771294214183, version: '17909283400139180' },
		missing: false,
	})
	assert.equal(thumbnailUrl(playback.playing.thumbnail), 'arena://thumbnail/1771294214183?v=17909283400139180')
	assert.equal(clipIdOfThumbnail(thumbnailUrl(playback.playing.thumbnail)), 1771294214183)
	// Loaded but disconnected is not playing; nor is an empty layer.
	assert.equal(status.layers.filter((l) => l.playing !== null).length, 1)
	assert.equal(status.layers[7].master, 0)
})

test('previewing elsewhere does not stop a clip playing', () => {
	const body = real()
	body.layers[2].clips[0].connected.value = 'Connected'
	body.layers[7].clips[1].connected.value = 'Previewing'
	const status = statusOf(decoded(body))
	assert.equal(status.layers[2].playing?.name, 'Solid Color')
	assert.equal(status.layers[7].playing, null)
})

test('a clip whose file is not on this machine says so', () => {
	const body = real()
	body.layers[7].clips[1].connected.value = 'Connected'
	const vfx4 = statusOf(decoded(body)).layers[7]
	assert.equal(vfx4.playing?.name, 'Flicker-Glitch-Digital-Looping-HD-60fps')
	assert.equal(vfx4.playing?.missing, true)
})

test('a composition of the wrong shape fails whole, saying what', () => {
	const cases = [
		[(b) => delete b.layers, 'not an Arena composition'],
		[(b) => (b.master.value = null), 'the composition master has no level'],
		[(b) => delete b.decks, 'the composition has no decks'],
		[(b) => (b.layers[2].master = { id: 1 }), "PLAYBACK's master has no level"],
		[(b) => (b.layers[2].bypassed.value = 0), "PLAYBACK's bypass is not on or off"],
		[(b) => (b.layers[2].clips[0].connected.value = 'Fading'), 'PLAYBACK clip 1 is "Fading", a state this does not know'],
		[(b) => delete b.layers[2].clips[3].connected, 'PLAYBACK clip 4 has no state'],
		[(b) => (b.layergroups = {}), 'the layer groups are not a list'],
	]
	for (const [spoil, detail] of cases) {
		const body = real()
		spoil(body)
		assert.deepEqual(decodeComposition(body), { ok: false, detail })
	}
	assert.equal(decodeComposition('<html>').ok, false)
})

test('main answers only thumbnail addresses on its scheme', () => {
	for (const bad of [
		'arena://thumbnail/../product',
		'arena://thumbnail/12/34',
		'arena://elsewhere/12',
		'http://thumbnail/12',
		'arena://thumbnail/',
		'arena://thumbnail/1e5',
		'not a url',
	]) {
		assert.equal(clipIdOfThumbnail(bad), null, bad)
	}
})

test('no selected deck is null, never the first deck', () => {
	const body = real()
	body.decks[0].selected.value = false
	assert.equal(statusOf(decoded(body)).deck, null)
})

test('subscriptions cover every level, and an update lands on its own', () => {
	const tree = decoded(real())
	const ids = subscriptionsOf(tree)
	assert.equal(ids.length, 1 + 3 * 2 + 10 * 2)
	assert.equal(new Set(ids).size, ids.length)
	assert.equal(subscribeMessage(1790926228713), '{"action":"subscribe","parameter":"/parameter/by-id/1790926228713"}')

	// VFX 1's master, 0 → 0.5, as the fader moved on 2026-10-03.
	const moved = applyParameter(tree, 1790926228713, 0.5)
	assert.ok(moved?.ok)
	const after = statusOf(moved.value)
	assert.equal(after.layers[4].master, 0.5)
	assert.equal(after.layers[5].master, 0)
	assert.equal(statusOf(tree).layers[4].master, 0, 'the old tree is untouched')

	const bypass = applyParameter(tree, tree.groups[1].bypassed.id, true)
	assert.ok(bypass?.ok)
	assert.equal(statusOf(bypass.value).groups[1].bypassed, true)
})

test('an update for another parameter is not ours; one of the wrong kind fails', () => {
	const tree = decoded(real())
	assert.equal(applyParameter(tree, 999, 0.5), null)
	assert.equal(applyParameter(tree, tree.master.id, true)?.ok, false)
	assert.equal(applyParameter(tree, tree.layers[0].bypassed.id, 1)?.ok, false)
	assert.equal(applyParameter(tree, tree.master.id, Number.NaN)?.ok, false)
})

test('messages as Arena sent them, 2026-10-03', () => {
	assert.deepEqual(
		decodeMessage(
			'{"id":1790926228153,"valuetype":"ParamRange","min":0.0,"max":1.0,"in":0.0,"out":1.0,"value":1.0,"path":"/composition/layers/1/master","type":"parameter_subscribed"}',
		),
		{ kind: 'parameter', id: 1790926228153, value: 1 },
	)
	assert.deepEqual(decodeMessage('{"id":1790926225765,"valuetype":"ParamTrigger","value":true,"path":"/composition/decks/1/select","type":"parameter_update"}'), {
		kind: 'parameter',
		id: 1790926225765,
		value: true,
	})
	assert.deepEqual(decodeMessage('{"path":"/parameter/by-id/999","error":"Invalid parameter path"}'), {
		kind: 'refused',
		path: '/parameter/by-id/999',
		detail: 'Invalid parameter path',
	})
	assert.deepEqual(decodeMessage('{"type":"sources_update","value":{"audio":[],"video":[]}}'), { kind: 'other', type: 'sources_update' })
	assert.equal(decodeMessage(JSON.stringify(real())).kind, 'composition')
	assert.equal(decodeMessage('{"type":"parameter_update","value":1}').kind, 'unreadable')
	assert.equal(decodeMessage('not json').kind, 'unreadable')
})
