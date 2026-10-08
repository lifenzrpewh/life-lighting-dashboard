import test from 'node:test'
import assert from 'node:assert/strict'

import { NO_PICTURE_AFTER_MS, VIDEO_STALLED_AFTER_MS, currentFrame, describeGpus, explainNoPicture, fitWindow, plainVideoFailure, videoFit, videoPicture } from '../dist/src/shared/video-feed.js'

const feed = (over) => ({ senders: ['Arena - Multiview'], showing: 'Arena - Multiview', lastFrame: null, fps: 0, failure: null, watched: true, ...over })

test('no sender on the machine is said, not drawn as a black picture', () => {
	assert.deepEqual(videoPicture(feed({ senders: [], showing: null }), 0), { state: 'no-sender' })
})

test('a sender with no frame yet is waiting, with whatever went wrong', () => {
	assert.deepEqual(videoPicture(feed({ failure: 'not connected' }), 0), {
		state: 'waiting',
		sender: 'Arena - Multiview',
		failure: 'not connected',
	})
})

test('frames arriving are showing; frames stopping is said, with how long', () => {
	const at = 10_000
	const lastFrame = { at, width: 1920, height: 1080, sender: 'Arena - Multiview' }
	assert.equal(videoPicture(feed({ lastFrame }), at + 100).state, 'showing')
	assert.equal(videoPicture(feed({ lastFrame }), at + VIDEO_STALLED_AFTER_MS).state, 'showing')
	assert.deepEqual(videoPicture(feed({ lastFrame }), at + 5_000), {
		state: 'stalled',
		sender: 'Arena - Multiview',
		sinceMs: 5_000,
		failure: null,
	})
})

test("another sender's last frame is no picture: waiting, not its picture under this name", () => {
	// Picked B while A was showing, or A gone and B next by name. A's frame
	// must not be called B's, nor be "the last picture B sent", nor size Fit.
	const lastFrame = { at: 10_000, width: 1282, height: 722, sender: 'Arena - A' }
	const switched = feed({ senders: ['Arena - A', 'Arena - B'], showing: 'Arena - B', lastFrame })
	assert.equal(currentFrame(switched), null)
	assert.deepEqual(videoPicture(switched, 10_100), { state: 'waiting', sender: 'Arena - B', failure: null })
	assert.deepEqual(videoPicture(switched, 60_000), { state: 'waiting', sender: 'Arena - B', failure: null })
	assert.deepEqual(currentFrame(feed({ showing: 'Arena - A', lastFrame })), lastFrame)
})

test("Arena's 16-bit picture is refused in words that say what to change", () => {
	// The addon's words on 2026-10-03, Arena with High Detail on.
	assert.match(plainVideoFailure('Unsupported DXGI_FORMAT for shared texture: 11'), /16-bit.*High Detail/)
	assert.match(plainVideoFailure('Unsupported DXGI_FORMAT for shared texture: 24'), /DXGI format 24/)
	assert.equal(plainVideoFailure('Shared texture receiver is not connected'), 'Shared texture receiver is not connected')
})

test('the picture is drawn whole, at the scale its space allows', () => {
	const { scale, best } = videoFit({ width: 1920, height: 1080 }, { width: 1596, height: 1456 })
	assert.equal(scale, 1596 / 1920)
	assert.deepEqual(best, { width: 1596, height: 1456 })
})

test('Fit sizes a pop-out to the picture, inside the room it has', () => {
	const picture = { width: 1920, height: 1080 }
	// A 56 px strip above a 1000x664 space: as tall as now, wider.
	assert.deepEqual(fitWindow({ picture, space: { width: 1000, height: 664 }, content: { width: 1000, height: 720 }, room: { width: 2000, height: 1200 } }), {
		width: Math.round(664 * (16 / 9)),
		height: 720,
	})
	// Too wide for the room: as wide as the room, shorter.
	const narrow = fitWindow({ picture, space: { width: 1000, height: 664 }, content: { width: 1000, height: 720 }, room: { width: 1000, height: 1200 } })
	assert.deepEqual(narrow, { width: 1000, height: Math.round(1000 / (16 / 9)) + 56 })
})

const attempt = (over) => ({ sender: 'Arena - Multiview', notConnected: 0, otherError: null, imported: 0, delivered: 0, stuckSend: false, ...over })
const twoCards = describeGpus({
	gpuDevice: [
		{ active: true, vendorId: 0x8086, deviceId: 0x9a49, driverVersion: '31.0.101.4502' },
		{ active: false, vendorId: 0x10de, deviceId: 0x25a2 },
	],
})

test('the graphics cards Chromium sees are said in a line, and counted', () => {
	assert.equal(twoCards.count, 2)
	assert.equal(twoCards.software, false)
	assert.match(twoCards.words, /^Intel 0x9a49, driver 31\.0\.101\.4502 \(Pāua draws with this one\); NVIDIA 0x25a2$/)
	assert.equal(describeGpus({ gpuDevice: [{ active: true, vendorId: 0x1414, deviceId: 0x8c }] }).software, true)
	// Not the expected shape: unknown, never guessed.
	assert.equal(describeGpus(null), null)
	assert.equal(describeGpus({ gpuDevice: [] }), null)
	assert.equal(describeGpus({}), null)
})

test('listed but never opened is said as two graphics cards, not left waiting', () => {
	// The addon's words when the sender's texture will not open on its device
	// (upstream spout_bridge.cpp, refresh_sender), while the list still has it.
	const why = explainNoPicture(attempt({ notConnected: 1800 }), { listed: true, gpus: twoCards })
	assert.match(why, /cannot be opened here/)
	assert.match(why, /This computer has 2 graphics cards/)
	assert.match(why, /Windows Settings › System › Display › Graphics/)
	// Cards not known: still said, as a possibility.
	assert.match(explainNoPicture(attempt({ notConnected: 3 }), { listed: true, gpus: null }), /If this computer has two graphics cards/)
	// Gone from the list is gone, not a graphics card.
	assert.match(explainNoPicture(attempt({ notConnected: 3 }), { listed: false, gpus: twoCards }), /has gone/)
})

test('every way of no picture has words; a frame through has none', () => {
	assert.equal(explainNoPicture(attempt({ delivered: 1, notConnected: 5 }), { listed: true, gpus: null }), null)
	assert.match(explainNoPicture(attempt({ imported: 300 }), { listed: true, gpus: twoCards }), /none reaches the screen.*this computer has 2/)
	assert.match(explainNoPicture(attempt({ stuckSend: true, imported: 1 }), { listed: true, gpus: null }), /Restart video/)
	assert.match(explainNoPicture(attempt({ otherError: 'Unsupported DXGI_FORMAT for shared texture: 11' }), { listed: true, gpus: null }), /High Detail/)
	assert.match(explainNoPicture(attempt({}), { listed: true, gpus: null }), new RegExp(`no picture in ${NO_PICTURE_AFTER_MS / 1000} s`))
	const software = describeGpus({ gpuDevice: [{ active: true, vendorId: 0x1414, deviceId: 0x8c }] })
	assert.match(explainNoPicture(attempt({ notConnected: 9 }), { listed: true, gpus: software }), /without a graphics card/)
})
