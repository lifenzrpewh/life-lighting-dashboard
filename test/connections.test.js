import test from 'node:test'
import assert from 'node:assert/strict'

import { CONNECTIONS, CONNECTION_OF_VIEW, consoleStatus, cueStatus, polledStatus, turnedOff, videoStatus, viewIsOn, worstTone } from '../dist/src/shared/connections.js'
import { record, unread } from '../dist/src/shared/reading.js'

const T0 = 1_000_000
const ok = (value, at = T0) => record(unread(), { ok: true, value, at })
const detail = (v) => `v${v}`

test('a connection that is not set up is off, never down', () => {
	assert.equal(polledStatus('arena', 'Arena', null, T0, 5_000, detail).tone, 'off')
	assert.equal(consoleStatus({ state: 'unreachable', since: T0 }, { state: 'no-address' }).tone, 'off')
})

test('the dot is the worst of what is set up, and off only when nothing is', () => {
	const live = polledStatus('ontime', 'OnTime', ok(1), T0, 5_000, detail)
	const off = polledStatus('arena', 'Arena', null, T0, 5_000, detail)
	const stale = polledStatus('propresenter', 'ProPresenter', ok(1, T0 - 6_000), T0, 5_000, detail)
	const down = consoleStatus({ state: 'unreachable', since: T0 }, null)
	assert.equal(worstTone([live, off]), 'live', 'an Arena nobody set up does not redden the dot')
	assert.equal(worstTone([live, stale, off]), 'stale')
	assert.equal(worstTone([live, stale, down]), 'down')
	assert.equal(worstTone([off]), 'off')
})

test('a polled source: live with its detail, stale with its age, down with the reason', () => {
	assert.deepEqual(polledStatus('arena', 'Arena', ok(7), T0, 5_000, detail), {
		id: 'arena',
		name: 'Arena',
		tone: 'live',
		status: 'LIVE',
		detail: 'v7',
	})
	const failed = record(ok(7, T0 - 6_000), { ok: false, reason: 'error', at: T0, detail: 'nothing is listening there' })
	const stale = polledStatus('arena', 'Arena', failed, T0, 5_000, detail)
	assert.equal(stale.tone, 'stale')
	assert.equal(stale.status, '6s ago')
	assert.equal(stale.detail, 'nothing is listening there', 'the fix, not the old value')
	const never = record(unread(), { ok: false, reason: 'timeout', at: T0 })
	assert.deepEqual(
		{ ...polledStatus('ontime', 'OnTime', never, T0, 5_000, detail) },
		{ id: 'ontime', name: 'OnTime', tone: 'down', status: 'no answer', detail: null },
	)
	assert.equal(polledStatus('ontime', 'OnTime', unread(), T0, 5_000, detail).status, 'not heard yet')
})

test('the console: LIVE with its round trip, else unreachable', () => {
	const live = consoleStatus({ state: 'live', roundTripMs: 0.8 }, null)
	assert.equal(live.tone, 'live')
	assert.equal(live.detail, '0.8 ms')
	assert.equal(consoleStatus({ state: 'live', roundTripMs: 70.4 }, null).detail, '70 ms')
	assert.equal(consoleStatus({ state: 'unreachable', since: T0 }, { state: 'idle', url: 'x', user: 'Remote' }).tone, 'down')
})

test('the Cue Manager: a page loaded is live, a failed load says why', () => {
	assert.equal(cueStatus({ state: 'showing', url: 'u', since: T0 }).tone, 'live')
	assert.equal(cueStatus({ state: 'connecting', url: 'u', since: T0 }).tone, 'stale')
	const failed = cueStatus({ state: 'failed', url: 'u', at: T0, cause: 'error', detail: 'ERR_NAME_NOT_RESOLVED', retryAt: T0 })
	assert.equal(failed.tone, 'down')
	assert.equal(failed.detail, 'ERR_NAME_NOT_RESOLVED')
	assert.equal(cueStatus(null).tone, 'off')
})

test('a connection turned off is off, in its own words, and never touches the dot', () => {
	const row = turnedOff('arena', 'Arena')
	assert.deepEqual(row, { id: 'arena', name: 'Arena', tone: 'off', status: 'turned off', detail: null })
	const live = polledStatus('ontime', 'OnTime', ok(1), T0, 5_000, detail)
	assert.equal(worstTone([live, row]), 'live')
})

test('every view belongs to a connection, and the video feed is its own, not Arena’s', () => {
	assert.equal(CONNECTION_OF_VIEW.video, 'video')
	assert.equal(CONNECTION_OF_VIEW.clips, 'arena')
	assert.equal(CONNECTION_OF_VIEW.ma, 'console')
	assert.ok(Object.values(CONNECTION_OF_VIEW).every((id) => CONNECTIONS.includes(id)))
})

test('the video feed: no sender is down; a sender is live, named with its size', () => {
	const feed = { senders: [], showing: null, lastFrame: null, fps: 0, failure: null, watched: true }
	assert.equal(videoStatus(null, T0).tone, 'off')
	assert.equal(videoStatus(feed, T0).tone, 'down')
	const showing = { ...feed, senders: ['Arena'], showing: 'Arena', lastFrame: { at: T0, width: 1920, height: 1080, sender: 'Arena' } }
	assert.deepEqual(videoStatus(showing, T0 + 100), { id: 'video', name: 'Video feed', tone: 'live', status: 'LIVE', detail: 'Arena, 1920×1080' })
})

test('the video feed: a sender listed but no picture is never LIVE', () => {
	// 2026-10-08: a booth listed Arena, the view waited, and this row said LIVE.
	const listed = { senders: ['Arena'], showing: 'Arena', lastFrame: null, fps: 0, failure: null, watched: true }
	assert.deepEqual(videoStatus(listed, T0), { id: 'video', name: 'Video feed', tone: 'stale', status: 'waiting', detail: 'Arena' })
	assert.deepEqual(videoStatus({ ...listed, failure: 'cannot be opened here' }, T0), {
		id: 'video',
		name: 'Video feed',
		tone: 'down',
		status: 'no picture',
		detail: 'cannot be opened here',
	})
	const old = { ...listed, lastFrame: { at: T0, width: 1920, height: 1080, sender: 'Arena' } }
	assert.equal(videoStatus(old, T0 + 60_000).status, 'stalled')
	// Nobody watching receives nothing: found, not a fault.
	assert.deepEqual(videoStatus({ ...listed, watched: false }, T0), { id: 'video', name: 'Video feed', tone: 'live', status: 'found', detail: 'Arena' })
})

test('the Timer view is on while either countdown program is', () => {
	// 2026-10-08: it follows the chip's rule, OnTime else ProPresenter.
	assert.equal(viewIsOn('timer', [], []), true)
	assert.equal(viewIsOn('timer', ['ontime'], []), true)
	assert.equal(viewIsOn('timer', ['propresenter'], []), true)
	assert.equal(viewIsOn('timer', ['ontime', 'propresenter'], []), false)
	// The Guide is LIFE's page, not a connection: on whatever is off.
	assert.equal(viewIsOn('guide', ['console', 'arena', 'cue', 'ontime', 'propresenter', 'video'], []), true)
})
