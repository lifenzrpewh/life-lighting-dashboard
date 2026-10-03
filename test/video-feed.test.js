import test from 'node:test'
import assert from 'node:assert/strict'

import { VIDEO_STALLED_AFTER_MS, videoPicture } from '../dist/src/shared/video-feed.js'

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
