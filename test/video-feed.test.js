import test from 'node:test'
import assert from 'node:assert/strict'

import { VIDEO_STALLED_AFTER_MS, fitLeftWidth, fitWindow, plainVideoFailure, videoFit, videoPicture } from '../dist/src/shared/video-feed.js'

const feed = (over) => ({ senders: ['Arena - Multiview'], showing: 'Arena - Multiview', lastFrame: null, fps: 0, failure: null, ...over })

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
	const lastFrame = { at, width: 1920, height: 1080 }
	assert.equal(videoPicture(feed({ lastFrame }), at + 100).state, 'showing')
	assert.equal(videoPicture(feed({ lastFrame }), at + VIDEO_STALLED_AFTER_MS).state, 'showing')
	assert.deepEqual(videoPicture(feed({ lastFrame }), at + 5_000), {
		state: 'stalled',
		sender: 'Arena - Multiview',
		sinceMs: 5_000,
		failure: null,
	})
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

test('Fit moves the divider so the slot takes the picture shape', () => {
	// Video on the right, 1600x1450, a 16:9 picture: the slot wants 2578 wide,
	// so the left slot gives up 978.
	const picture = { width: 1920, height: 1080 }
	assert.equal(fitLeftWidth({ side: 'right', picture, space: { width: 1600, height: 1450 }, leftWidth: 1000 }), 22)
	// On the left the same picture widens the left slot.
	assert.equal(fitLeftWidth({ side: 'left', picture, space: { width: 400, height: 900 }, leftWidth: 400 }), 1600)
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
