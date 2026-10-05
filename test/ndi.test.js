import test from 'node:test'
import assert from 'node:assert/strict'

import { ndiIdOf, ndiMachine, ndiPicture, ndiShortName, ndiSourcesFrom, ndiStep, ndiView } from '../dist/src/shared/ndi.js'
import { applyPatch, DEFAULT_SETTINGS, fromDisk } from '../dist/src/shared/settings.js'
import { ndiStatus, viewIsOn } from '../dist/src/shared/connections.js'
import { isNative, isViewId, layoutFrom, viewLabel } from '../dist/src/shared/layout.js'

const arena = { id: 'abc123', name: 'Arena - Composition', source: '2413-RUAP (Arena - Composition)', on: true }
const runtime = { ok: true, version: 'NDI SDK WIN64 5.6.0.0' }
const feedOf = (over = {}) => ({ id: arena.id, name: arena.name, source: arena.source, watched: true, lastFrame: null, fps: 0, failure: null, ...over })

test('a source is called by the part in brackets, cut to fit a tab', () => {
	assert.equal(ndiShortName('2413-RUAP (Arena - Composition)'), 'Arena - Composition')
	assert.equal(ndiShortName('BOOTH-PC (ProPresenter (Audience))'), 'ProPresenter (Audience)')
	assert.equal(ndiMachine('BOOTH-PC (ProPresenter (Audience))'), 'BOOTH-PC')
	assert.equal(ndiShortName('No brackets'), 'No brackets')
	assert.equal(ndiShortName('PC (A very long source name that goes on and on)').length, 32)
})

test('a stored list of sources is all good or nothing', () => {
	assert.deepEqual(ndiSourcesFrom([arena]), [arena])
	assert.deepEqual(ndiSourcesFrom([{ ...arena, name: '  Arena - Composition ' }]), [arena])
	for (const bad of [
		null,
		[{ ...arena, id: 'A B' }],
		[{ ...arena, name: '' }],
		[{ ...arena, source: '' }],
		[{ ...arena, source: 'x\u0000' }],
		[{ ...arena, on: 1 }],
		[arena, { ...arena, id: 'other1' }], // one source twice
		[arena, { ...arena, source: 'PC (Other)' }], // one id twice
	]) {
		assert.equal(ndiSourcesFrom(bad), null, JSON.stringify(bad))
	}
})

test('settings keep NDI sources, and a bad list off disk costs only itself', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { ndiSources: [arena] })
	assert.equal(r.ok, true)
	assert.deepEqual(r.settings.ndiSources, [arena])
	assert.equal(applyPatch(DEFAULT_SETTINGS, { ndiSources: [arena, arena] }).ok, false)
	const disk = fromDisk({ ndiSources: [{ ...arena, on: 'yes' }], arenaHost: '127.0.0.1' })
	assert.deepEqual(disk.ndiSources, [])
	assert.equal(disk.arenaHost, '127.0.0.1')
})

test('a source is a view, by its shape, and drawn by the page', () => {
	const view = ndiView(arena.id)
	assert.equal(view, 'ndi:abc123')
	assert.equal(ndiIdOf(view), arena.id)
	assert.equal(ndiIdOf('embed:abc123'), null)
	assert.ok(isViewId(view))
	assert.equal(isViewId('ndi:'), false)
	assert.equal(isNative(view), false)
	assert.equal(viewLabel(view, [], [arena]), 'Arena - Composition')
	assert.equal(viewLabel(view, [], []), 'NDI')
	assert.equal(viewIsOn(view, [], [], [arena]), true)
	assert.equal(viewIsOn(view, [], [], [{ ...arena, on: false }]), false)
	assert.equal(viewIsOn(view, [], [], []), false)
	// A layout holding one survives being read back.
	assert.equal(layoutFrom(JSON.stringify({ left: view, right: 'ma' })).windows[0].tabs[0].view, view)
})

test('a frame is thinned by whole steps, never below the space it fills', () => {
	const composition = { width: 5800, height: 2036 }
	assert.equal(ndiStep(composition, null), 1)
	// Drawn whole: 2016×708 in this window, so sent 1933×678, not 5800 wide.
	assert.equal(ndiStep(composition, { width: 2016, height: 1490 }), 3)
	assert.equal(ndiStep(composition, { width: 1700, height: 900 }), 3)
	assert.equal(ndiStep(composition, { width: 853, height: 600 }), 7)
	assert.equal(ndiStep({ width: 1920, height: 1080 }, { width: 960, height: 1000 }), 2)
	// Under half again as big as drawn: sent whole.
	assert.equal(ndiStep({ width: 1920, height: 1080 }, { width: 1400, height: 900 }), 1)
	assert.equal(ndiStep({ width: 1920, height: 1080 }, { width: 2560, height: 1440 }), 1)
	assert.equal(ndiStep(composition, { width: 1, height: 1 }), 16)
	assert.equal(ndiStep(composition, { width: 0, height: 0 }), 1)
})

test('the picture says when it is missing, waiting, showing or stopped', () => {
	const now = 100_000
	const ndi = (over = {}) => ({ runtime, found: [arena.source], feeds: [], ...over })
	assert.equal(ndiPicture(ndi({ runtime: { ok: false, detail: 'not installed' } }), feedOf(), now).state, 'no-runtime')
	assert.equal(ndiPicture(ndi({ found: [] }), feedOf(), now).state, 'not-found')
	// Before NDI has been asked, nothing is "not found" yet.
	assert.equal(ndiPicture(ndi({ runtime: null, found: [] }), feedOf(), now).state, 'waiting')
	assert.equal(ndiPicture(ndi(), feedOf(), now).state, 'waiting')
	const frame = { at: now - 500, width: 2900, height: 1018, full: { width: 5800, height: 2036 } }
	assert.equal(ndiPicture(ndi(), feedOf({ lastFrame: frame }), now).state, 'showing')
	const stalled = ndiPicture(ndi({ found: [] }), feedOf({ lastFrame: { ...frame, at: now - 5_000 } }), now)
	assert.equal(stalled.state, 'stalled')
	assert.equal(stalled.failure, 'The source has left the network.')
})

test("a source's row: off, not found is down, found is there, LIVE while shown", () => {
	const now = 100_000
	const frame = { at: now - 100, width: 1920, height: 1080, full: { width: 1920, height: 1080 } }
	assert.equal(ndiStatus({ ...arena, on: false }, null, now).status, 'turned off')
	assert.equal(ndiStatus(arena, null, now).tone, 'off')
	assert.equal(ndiStatus(arena, { runtime: { ok: false, detail: 'x' }, found: [], feeds: [] }, now).tone, 'down')
	assert.equal(ndiStatus(arena, { runtime, found: [], feeds: [] }, now).status, 'not found')
	assert.equal(ndiStatus(arena, { runtime, found: [arena.source], feeds: [feedOf({ watched: false })] }, now).status, 'found')
	assert.equal(ndiStatus(arena, { runtime, found: [arena.source], feeds: [feedOf()] }, now).tone, 'stale')
	const live = ndiStatus(arena, { runtime, found: [arena.source], feeds: [feedOf({ lastFrame: frame, fps: 30 })] }, now)
	assert.equal(live.status, 'LIVE')
	assert.equal(live.detail, '1920×1080, 30 fps')
	assert.equal(live.id, 'ndi:abc123')
})
