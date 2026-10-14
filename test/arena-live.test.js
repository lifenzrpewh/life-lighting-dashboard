import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
	applyParameter,
	decodeComposition,
	decodeMessage,
	statusOf,
	subscribeMessage,
	subscriptionsOf,
	unsubscribeMessage,
} from '../dist/src/bridge/arena-live.js'
import { clipIdOfThumbnail, clipTime, formatClipTime, thumbnailUrl } from '../dist/src/shared/arena.js'

// Arena 7.28.0's composition as `GET /api/v1/composition` gave it on 2026-10-03,
// show OH2026, pruned from 1.3 MB to the fields read here: PLAYBACK has a Solid
// Color connected, and VFX 1 holds the owner's 39.27 s video, disconnected. The
// VFX group runs at 1.795, A SCREENS at 0.578.
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
	assert.equal(playback.playing.name, 'Solid Color')
	assert.equal(playback.playing.missing, false)
	const version = real().layers[2].clips[0].thumbnail.last_update
	assert.deepEqual(playback.playing.thumbnail, { clipId: 1771294214183, version })
	assert.equal(thumbnailUrl(playback.playing.thumbnail), `arena://thumbnail/1771294214183?v=${version}`)
	assert.equal(clipIdOfThumbnail(thumbnailUrl(playback.playing.thumbnail)), 1771294214183)
	// Loaded but disconnected is not playing; nor is an empty layer.
	assert.equal(status.layers.filter((l) => l.playing !== null).length, 1)
	assert.equal(status.layers[7].master, 0)
})

test('previewing elsewhere does not stop a clip playing', () => {
	const body = real()
	body.layers[2].clips[0].connected.value = 'Connected & previewing'
	body.layers[4].clips[0].connected.value = 'Previewing'
	const status = statusOf(decoded(body))
	assert.equal(status.layers[2].playing?.name, 'Solid Color')
	assert.equal(status.layers[4].playing, null)
})

test('a clip whose file is not on this machine says so', () => {
	const body = real()
	body.layers[4].clips[0].connected.value = 'Connected'
	body.layers[4].clips[0].video.fileinfo.exists = false
	const vfx1 = statusOf(decoded(body)).layers[4]
	assert.equal(vfx1.playing?.name, 'MicrosoftTeams-video')
	assert.equal(vfx1.playing?.missing, true)
})

test("Arena's placeholder thumbnail is no thumbnail", () => {
	// VFX 1's video, as Arena gave it before drawing one: `is_default`, the dummy.
	const body = real()
	body.layers[4].clips[0].connected.value = 'Connected'
	assert.equal(body.layers[4].clips[0].thumbnail.is_default, true)
	assert.equal(statusOf(decoded(body)).layers[4].playing?.thumbnail, null)
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
	// Master and speed; each group's master, bypass and speed; each layer's
	// master and bypass; the playing Solid Color's position, mode, direction, speed.
	assert.equal(ids.length, 2 + 3 * 3 + 10 * 2 + 4)
	assert.equal(new Set(ids).size, ids.length)
	assert.equal(subscribeMessage(1790926228713), '{"action":"subscribe","parameter":"/parameter/by-id/1790926228713"}')

	// VFX 1's master, at 1 in the fixture, moved to 0.5.
	const moved = applyParameter(tree, 1790926228713, 0.5)
	assert.ok(moved?.ok)
	const after = statusOf(moved.value)
	assert.equal(after.layers[4].master, 0.5)
	assert.equal(after.layers[5].master, 0)
	assert.equal(statusOf(tree).layers[4].master, 1, 'the old tree is untouched')

	const bypass = applyParameter(tree, tree.groups[1].bypassed.id, true)
	assert.ok(bypass?.ok)
	assert.equal(statusOf(bypass.value).groups[1].bypassed, true)
})

test('a run of updates lands each on its own, leaving what it does not touch shared', () => {
	const tree = decoded(real())
	const vfx1 = tree.layers[4].master.id
	let t = tree
	for (const v of [0.1, 0.2, 0.3]) {
		const r = applyParameter(t, vfx1, v)
		assert.ok(r?.ok)
		t = r.value
	}
	const bypass = applyParameter(t, tree.groups[1].bypassed.id, true)
	assert.ok(bypass?.ok)
	t = bypass.value
	const s = statusOf(t)
	assert.equal(s.layers[4].master, 0.3)
	assert.equal(s.groups[1].bypassed, true)
	// Everything else reads as it did, and the tree has the same parameters.
	assert.deepEqual({ ...s, layers: s.layers.filter((_, i) => i !== 4), groups: s.groups.filter((_, i) => i !== 1) }, {
		...statusOf(tree),
		layers: statusOf(tree).layers.filter((_, i) => i !== 4),
		groups: statusOf(tree).groups.filter((_, i) => i !== 1),
	})
	assert.deepEqual(subscriptionsOf(t), subscriptionsOf(tree))
	assert.equal(t.layers[0], tree.layers[0], 'a layer not touched is the same object')
	assert.equal(t.columns, tree.columns)
	// The derived tree still knows the wrong kind and an unknown id.
	assert.equal(applyParameter(t, vfx1, true)?.ok, false)
	assert.equal(applyParameter(t, 999, 0.5), null)
})

test("a tree's status is worked out once, and a new tree gets its own", () => {
	const tree = decoded(real())
	const s = statusOf(tree)
	assert.equal(statusOf(tree), s)
	const moved = applyParameter(tree, tree.layers[4].master.id, 0.5)
	assert.ok(moved?.ok)
	assert.notEqual(statusOf(moved.value), s)
	assert.equal(statusOf(moved.value).layers[4].master, 0.5)
	assert.equal(s.layers[4].master, 1)
})

test('an update for another parameter is not ours; one of the wrong kind fails', () => {
	const tree = decoded(real())
	assert.equal(applyParameter(tree, 999, 0.5), null)
	assert.equal(applyParameter(tree, tree.master.id, true)?.ok, false)
	assert.equal(applyParameter(tree, tree.layers[0].bypassed.id, 1)?.ok, false)
	assert.equal(applyParameter(tree, tree.master.id, Number.NaN)?.ok, false)
})

/** The owner's video, connected on VFX 1 at `position` with `playmode`. */
const videoPlaying = (position, playmode = 'Loop') => {
	const body = real()
	const clip = body.layers[4].clips[0]
	clip.connected.value = 'Connected'
	clip.transport.position.value = position
	clip.transport.controls.playmode.value = playmode
	return decoded(body)
}

const transportOf = (tree) => statusOf(tree).layers[4].playing.transport

test("a clip's time left runs at its group's speed, as seen 2026-10-03", () => {
	const tree = videoPlaying(20000)
	const t = transportOf(tree)
	assert.equal(t.lengthMs, 39270)
	assert.ok(Math.abs(t.rate - 1.7951) < 0.001, String(t.rate))
	const left = clipTime(t)
	assert.equal(left.kind, 'left')
	// 19.27 s of clip at 1.795 is 10.7 s of real time, not 19.
	assert.ok(Math.abs(left.ms - 19270 / t.rate) < 0.001, String(left.ms))
	assert.equal(left.loops, true)
	assert.equal(formatClipTime(left.ms), '0:11')

	// The position, pushed ~100 times a second, lands on the playing clip.
	const later = applyParameter(tree, tree.layers[4].playing.transport.position.id, 38000)
	assert.ok(later?.ok)
	assert.equal(transportOf(later.value).positionMs, 38000)
	// And the group's speed is followed too.
	const slower = applyParameter(tree, tree.groups[2].speed.id, 1)
	assert.ok(slower?.ok)
	assert.ok(Math.abs(clipTime(transportOf(slower.value)).ms - 19270) < 0.001)
	assert.ok(subscriptionsOf(tree).includes(tree.layers[4].playing.transport.position.id))
})

test('play once counts down, holds at its end, and random has no end', () => {
	const once = clipTime(transportOf(videoPlaying(30000, 'Play Once & Clear')))
	assert.equal(once.kind, 'left')
	assert.equal(once.loops, false)
	assert.deepEqual(clipTime(transportOf(videoPlaying(39270, 'Play Once & Hold'))), { kind: 'held' })
	assert.deepEqual(clipTime(transportOf(videoPlaying(39230, 'Play Once & Hold'))), { kind: 'held' })
	assert.equal(clipTime(transportOf(videoPlaying(39000, 'Play Once & Hold'))).kind, 'left')
	assert.deepEqual(clipTime(transportOf(videoPlaying(1000, 'Random'))), { kind: 'none' })
	assert.deepEqual(clipTime(null), { kind: 'none' })
})

test('backwards counts to the start; paused keeps its time to the end', () => {
	const t = { positionMs: 9000, lengthMs: 39270, playmode: 'Loop', direction: '<', rate: 1 }
	assert.equal(clipTime(t).ms, 9000)
	// Paused says no direction, so it is measured to the end, as forward play is.
	assert.deepEqual(clipTime({ ...t, direction: '||' }), { kind: 'paused', ms: 30270 })
	assert.equal(clipTime({ ...t, direction: '>', rate: 2 }).ms, (39270 - 9000) / 2)
})

test('a clip time reads as minutes and whole seconds, rounded up', () => {
	assert.equal(formatClipTime(0), '0:00')
	assert.equal(formatClipTime(1), '0:01')
	assert.equal(formatClipTime(59000), '0:59')
	assert.equal(formatClipTime(59001), '1:00')
	assert.equal(formatClipTime(725000), '12:05')
	assert.equal(formatClipTime(-50), '0:00')
})

test('a clip off the timeline has no transport; a malformed one fails whole', () => {
	const synced = real()
	synced.layers[2].clips[0].transporttype.value = 'BPM Sync'
	assert.equal(statusOf(decoded(synced)).layers[2].playing.transport, null)
	const broken = real()
	delete broken.layers[2].clips[0].transport.controls.playmode
	assert.deepEqual(decodeComposition(broken), { ok: false, detail: "PLAYBACK's Solid Color's play mode is not a parameter" })
	assert.equal(unsubscribeMessage(5), '{"action":"unsubscribe","parameter":"/parameter/by-id/5"}')
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
