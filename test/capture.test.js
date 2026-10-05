import test from 'node:test'
import assert from 'node:assert/strict'

import { captureIdOf, captureInputsFrom, captureShortName, captureView, plainCaptureFailure } from '../dist/src/shared/capture.js'
import { applyPatch, DEFAULT_SETTINGS, fromDisk } from '../dist/src/shared/settings.js'
import { captureStatus, viewIsOn } from '../dist/src/shared/connections.js'
import { isNative, isViewId, layoutFrom, viewLabel } from '../dist/src/shared/layout.js'

const card = { id: 'cap123', name: 'DeckLink Mini Recorder', device: 'Blackmagic WDM Capture', on: true }

test("a camera's name drops Windows' USB ids, and is cut to fit a tab", () => {
	assert.equal(captureShortName('FHD Webcam (13d3:56dd)'), 'FHD Webcam')
	assert.equal(captureShortName('OBS Virtual Camera'), 'OBS Virtual Camera')
	assert.equal(captureShortName('Decklink Video Capture (2)'), 'Decklink Video Capture (2)')
	assert.equal(captureShortName('A very long camera name that goes on and on').length, 32)
})

test('a stored list of capture inputs is all good or nothing', () => {
	assert.deepEqual(captureInputsFrom([card]), [card])
	for (const bad of [
		null,
		[{ ...card, id: 'Cap 1' }],
		[{ ...card, name: ' ' }],
		[{ ...card, device: '' }],
		[{ ...card, on: 'yes' }],
		[card, { ...card, id: 'other1' }], // one device twice
		[card, { ...card, device: 'OBS Virtual Camera' }], // one id twice
	]) {
		assert.equal(captureInputsFrom(bad), null, JSON.stringify(bad))
	}
})

test('settings keep capture inputs, and a bad list off disk costs only itself', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { captureInputs: [card] })
	assert.equal(r.ok, true)
	assert.deepEqual(r.settings.captureInputs, [card])
	assert.equal(applyPatch(DEFAULT_SETTINGS, { captureInputs: [card, card] }).ok, false)
	assert.deepEqual(fromDisk({ captureInputs: [{ ...card, id: '' }] }).captureInputs, [])
})

test('a capture input is a view, by its shape, drawn by the page', () => {
	const view = captureView(card.id)
	assert.equal(view, 'capture:cap123')
	assert.equal(captureIdOf(view), card.id)
	assert.equal(captureIdOf('ndi:cap123'), null)
	assert.ok(isViewId(view))
	assert.equal(isNative(view), false)
	assert.equal(viewLabel(view, [], [], [card]), 'DeckLink Mini Recorder')
	assert.equal(viewLabel(view, [], [], []), 'Capture')
	assert.equal(viewIsOn(view, [], [], [], [card]), true)
	assert.equal(viewIsOn(view, [], [], [], [{ ...card, on: false }]), false)
	assert.equal(layoutFrom(JSON.stringify({ left: view, right: 'ma' })).windows[0].tabs[0].view, view)
})

test("the browser's refusals are said in words a booth can act on", () => {
	assert.match(plainCaptureFailure('NotReadableError', 'Could not start video source'), /Start Virtual Camera/)
	assert.match(plainCaptureFailure('NotFoundError', ''), /not on this computer/)
	assert.equal(plainCaptureFailure('SomethingNew', 'its own words'), 'its own words')
})

test("a capture input's row: off, not found is down, found is there, LIVE while shown", () => {
	const now = 100_000
	assert.equal(captureStatus({ ...card, on: false }, null, now).status, 'turned off')
	assert.equal(captureStatus(card, { present: null, live: null, failure: null }, now).tone, 'off')
	assert.equal(captureStatus(card, { present: false, live: null, failure: null }, now).status, 'not found')
	assert.equal(captureStatus(card, { present: true, live: null, failure: null }, now).status, 'found')
	assert.equal(captureStatus(card, { present: true, live: null, failure: 'Another program is using it.' }, now).status, 'not opening')
	assert.equal(captureStatus(card, { present: true, live: { width: 1920, height: 1080, fps: 50, at: now - 9_000 }, failure: null }, now).status, 'no picture')
	const live = captureStatus(card, { present: true, live: { width: 1920, height: 1080, fps: 29.97, at: now - 100 }, failure: null }, now)
	assert.equal(live.status, 'LIVE')
	assert.equal(live.detail, '1920×1080, 30 fps')
	assert.equal(live.id, 'capture:cap123')
})
