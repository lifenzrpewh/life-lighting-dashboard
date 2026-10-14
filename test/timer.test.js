import test from 'node:test'
import assert from 'node:assert/strict'

import { decodeOnTimePoll } from '../dist/src/bridge/ontime.js'
import { decodeProPresenter, parseProPresenterTime } from '../dist/src/bridge/propresenter.js'
import { record, unread } from '../dist/src/shared/reading.js'
import { DEFAULT_SETTINGS, applyPatch, fromDisk, patchFrom } from '../dist/src/shared/settings.js'
import { TIMER_STALE_AFTER_MS, chooseTimer, formatCountdown, onTimeRemaining, proPresenterShown } from '../dist/src/shared/timer.js'

const T0 = 1_000_000

/** A poll reply in v4's shape, with only what the decoder reads changed. */
const poll = ({ playback = 'play', current = 245_000, secondaryTimer = null, eventNow, eventNext } = {}) => ({
	payload: {
		clock: 36_000_000,
		timer: { addedTime: 0, current, duration: 600_000, elapsed: 0, expectedFinish: null, phase: 'default', playback, secondaryTimer, startedAt: null },
		eventNow: eventNow === undefined ? { id: 'a', title: 'Worship' } : eventNow,
		eventNext: eventNext === undefined ? { id: 'b', title: 'Announcements' } : eventNext,
		eventFlag: null,
		groupNow: null,
	},
})

const channelOf = (value, at = T0) => record(unread(), { ok: true, value, at })

// --- OnTime --------------------------------------------------------------------

test('OnTime: a running event counts to the next one, by name', () => {
	const r = decodeOnTimePoll(poll())
	assert.deepEqual(r, { ok: true, value: { playback: 'play', nowTitle: 'Worship', nextTitle: 'Announcements', remainingMs: 245_000 } })
})

test('OnTime: between events in roll, the secondary timer counts to the next start', () => {
	const r = decodeOnTimePoll(poll({ playback: 'roll', current: null, secondaryTimer: 90_000, eventNow: null }))
	assert.ok(r.ok)
	assert.equal(r.value.remainingMs, 90_000)
	assert.equal(r.value.nextTitle, 'Announcements')
})

test('OnTime: a reply of the wrong shape fails whole, never as a time', () => {
	assert.equal(decodeOnTimePoll({}).ok, false)
	assert.equal(decodeOnTimePoll({ payload: {} }).ok, false)
	assert.equal(decodeOnTimePoll(poll({ playback: 'rewind' })).ok, false)
	assert.equal(decodeOnTimePoll(poll({ current: '4:05' })).ok, false)
	assert.equal(decodeOnTimePoll(poll({ eventNext: { id: 'b' } })).ok, false, 'an event with no title')
})

test('OnTime: counted down between reads only while live and running', () => {
	const v = { playback: 'play', nowTitle: 'A', nextTitle: 'B', remainingMs: 10_000 }
	assert.equal(onTimeRemaining(v, T0, T0 + 2_500, true), 7_500)
	assert.equal(onTimeRemaining(v, T0, T0 + 2_500, false), 10_000, 'stale is shown as said')
	assert.equal(onTimeRemaining({ ...v, playback: 'pause' }, T0, T0 + 2_500, true), 10_000, 'paused does not move')
})

// --- ProPresenter --------------------------------------------------------------

test('ProPresenter: time strings, signed, with or without a fraction', () => {
	assert.equal(parseProPresenterTime('00:05:00'), 300)
	assert.equal(parseProPresenterTime('-00:00:02'), -2)
	assert.equal(parseProPresenterTime('00:00:01.00'), 1)
	assert.equal(parseProPresenterTime('1:02:03'), 3723)
	assert.equal(parseProPresenterTime('5:00'), null)
	assert.equal(parseProPresenterTime(''), null)
})

const PP_TIMERS = [
	{ id: { uuid: 'x', name: 'Countdown Timer', index: 0 }, time: '00:00:01', state: 'stopped' },
	{ id: { uuid: 'y', name: 'Countdown To Time', index: 1 }, time: '-00:00:02', state: 'overrun' },
	{ id: { uuid: 'z', name: 'Elapsed Timer', index: 2 }, time: '00:21:43', state: 'running' },
]

test('ProPresenter: every timer in its order, and the stage message', () => {
	const r = decodeProPresenter(PP_TIMERS, ' Wrap up ')
	assert.deepEqual(r, {
		ok: true,
		value: {
			timers: [
				{ name: 'Countdown Timer', seconds: 1, state: 'stopped' },
				{ name: 'Countdown To Time', seconds: -2, state: 'overrunning' },
				{ name: 'Elapsed Timer', seconds: 1303, state: 'running' },
			],
			message: 'Wrap up',
		},
	})
	assert.deepEqual(decodeProPresenter([], ''), { ok: true, value: { timers: [], message: null } })
})

test('ProPresenter 18.2 as seen 2026-10-02: a countdown that may not overrun ends complete', () => {
	const r = decodeProPresenter(
		[
			{ id: { uuid: '8807759a', name: 'Segment Countdown', index: 0 }, time: '00:00:00', state: 'complete' },
			{ id: { uuid: 'bec33532', name: 'PreShow Countdown', index: 1 }, time: '05:00:00', state: 'stopped' },
		],
		'Timer to Message',
	)
	assert.ok(r.ok)
	assert.deepEqual(proPresenterShown(r.value, null), { kind: 'idle' }, 'complete is not counting')
})

test('the chip follows the first counting timer unless one is named', () => {
	const r = decodeProPresenter(PP_TIMERS, '')
	assert.ok(r.ok)
	assert.equal(proPresenterShown(r.value, null).timer.name, 'Countdown To Time')
	assert.equal(proPresenterShown(r.value, 'Elapsed Timer').timer.name, 'Elapsed Timer')
	assert.deepEqual(proPresenterShown(r.value, 'Countdown Timer'), { kind: 'idle' }, 'named and stopped: nothing counting')
})

test('a named timer ProPresenter does not have is missing, never another timer', () => {
	const r = decodeProPresenter(PP_TIMERS, '')
	assert.ok(r.ok)
	assert.deepEqual(proPresenterShown(r.value, 'Service Countdown'), { kind: 'missing', name: 'Service Countdown' })
	assert.deepEqual(proPresenterShown(r.value, 'elapsed timer'), { kind: 'missing', name: 'elapsed timer' }, 'exact, as listed')
})

test('ProPresenter: a time it cannot read fails the read, not shown as zero', () => {
	const r = decodeProPresenter([{ id: { name: 'T' }, time: 'soon', state: 'running' }], '')
	assert.equal(r.ok, false)
	assert.equal(decodeProPresenter([{ id: { name: 'T' }, time: '00:00:01', state: 'paused' }], '').ok, false)
	assert.equal(decodeProPresenter({}, '').ok, false)
	assert.equal(decodeProPresenter([], null).ok, false)
})

// --- choosing ------------------------------------------------------------------

const RUNNING = { playback: 'play', nowTitle: 'A', nextTitle: 'B', remainingMs: 1000 }
const STOPPED = { ...RUNNING, playback: 'stop' }
const PP = { timers: [], message: 'Hi' }

test('OnTime is shown whenever an event is running there', () => {
	const v = chooseTimer({ ontime: channelOf(RUNNING), propresenter: channelOf(PP), proPresenterTimer: null }, T0)
	assert.equal(v.kind, 'ontime')
})

test('otherwise ProPresenter, alone', () => {
	const v = chooseTimer({ ontime: channelOf(STOPPED), propresenter: channelOf(PP), proPresenterTimer: null }, T0)
	assert.equal(v.kind, 'propresenter')
	assert.equal(v.ontimeAside, null)
})

test('an OnTime that cannot be read is said beside ProPresenter, not taken as idle', () => {
	const failed = record(unread(), { ok: false, reason: 'timeout', at: T0 })
	const v = chooseTimer({ ontime: failed, propresenter: channelOf(PP), proPresenterTimer: null }, T0)
	assert.equal(v.kind, 'propresenter')
	assert.deepEqual(v.ontimeAside, { state: 'unknown', why: 'timeout' })
})

test('an OnTime gone quiet after saying stopped is said too, with its age', () => {
	const quiet = record(channelOf(STOPPED), { ok: false, reason: 'timeout', at: T0 + 2_000 })
	const v = chooseTimer({ ontime: quiet, propresenter: channelOf(PP, T0 + 4_000), proPresenterTimer: null }, T0 + 4_000)
	assert.equal(v.kind, 'propresenter')
	assert.deepEqual(v.ontimeAside, { state: 'stale', ageMs: 4_000 })
})

test('a stale OnTime that last said running is still OnTime, aged', () => {
	const v = chooseTimer({ ontime: channelOf(RUNNING), propresenter: channelOf(PP, T0 + 10_000), proPresenterTimer: null }, T0 + TIMER_STALE_AFTER_MS + 1)
	assert.equal(v.kind, 'ontime')
	assert.equal(v.reading.state, 'stale')
})

test('the named timer travels with the ProPresenter view', () => {
	const v = chooseTimer({ ontime: null, propresenter: channelOf(PP), proPresenterTimer: 'Game Timer' }, T0)
	assert.equal(v.wanted, 'Game Timer')
})

test('one program set up is shown alone; none set up shows nothing', () => {
	assert.equal(chooseTimer({ ontime: channelOf(STOPPED), propresenter: null, proPresenterTimer: null }, T0).kind, 'ontime')
	assert.equal(chooseTimer({ ontime: null, propresenter: channelOf(PP), proPresenterTimer: null }, T0).kind, 'propresenter')
	assert.equal(chooseTimer({ ontime: null, propresenter: null, proPresenterTimer: null }, T0).kind, 'none')
})

test('countdowns read as people read them', () => {
	assert.equal(formatCountdown(245_000), '4:05')
	assert.equal(formatCountdown(244_100), '4:05', 'rounded up while counting down')
	assert.equal(formatCountdown(3_750_000), '1:02:30')
	assert.equal(formatCountdown(0), '0:00')
	assert.equal(formatCountdown(-12_400), '+0:12')
	// Overtime counts whole seconds past, as a stopwatch does.
	assert.equal(formatCountdown(-400), '+0:00')
	// Not a number is the no-value dash, never NaN:NaN or a time.
	assert.equal(formatCountdown(NaN), '\u2013:\u2013\u2013')
	assert.equal(formatCountdown(Infinity), '\u2013:\u2013\u2013')
})

// --- settings ------------------------------------------------------------------

test('settings: neither program is used until an address is set', () => {
	assert.equal(DEFAULT_SETTINGS.onTimeHost, null)
	assert.equal(DEFAULT_SETTINGS.onTimePort, 4001)
	assert.equal(DEFAULT_SETTINGS.proPresenterHost, null)
	assert.equal(DEFAULT_SETTINGS.proPresenterPort, 1025, 'the port LIFE booths use (the owner, 2026-10-08)')
})

test('settings: ProPresenter on 1025 unless told otherwise', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { proPresenterHost: '10.11.60.50' })
	assert.ok(r.ok)
	assert.equal(r.settings.proPresenterPort, 1025)
	assert.equal(applyPatch(DEFAULT_SETTINGS, { proPresenterPort: 0 }).ok, false)
	assert.equal(patchFrom({ proPresenterPort: null }), null, 'no blank port any more')
	const ok = applyPatch(DEFAULT_SETTINGS, { proPresenterHost: '10.11.60.50', proPresenterPort: 50001, onTimeHost: ' 10.11.60.51 ' })
	assert.ok(ok.ok)
	assert.equal(ok.settings.onTimeHost, '10.11.60.51')
	assert.equal(applyPatch(DEFAULT_SETTINGS, { onTimeHost: 'http://x' }).ok, false)
})

test('settings: the timer fields survive the disk and the IPC boundary', () => {
	const s = fromDisk({ onTimeHost: 'ontime.local', onTimePort: 4002, proPresenterHost: '10.0.0.9', proPresenterPort: 1025 })
	assert.equal(s.onTimeHost, 'ontime.local')
	assert.equal(s.onTimePort, 4002)
	assert.equal(s.proPresenterPort, 1025)
	assert.equal(patchFrom({ onTimePort: '4001' }), null, 'a known key of the wrong type rejects the patch')
})

test('settings: the ProPresenter timer is named, or blank for whichever runs', () => {
	assert.equal(DEFAULT_SETTINGS.proPresenterTimer, null)
	const named = applyPatch(DEFAULT_SETTINGS, { proPresenterTimer: 'Segment Countdown' })
	assert.ok(named.ok)
	assert.equal(named.settings.proPresenterTimer, 'Segment Countdown')
	const blank = applyPatch(named.settings, { proPresenterTimer: '  ' })
	assert.ok(blank.ok)
	assert.equal(blank.settings.proPresenterTimer, null)
	assert.equal(applyPatch(DEFAULT_SETTINGS, { proPresenterTimer: 'a\nb' }).ok, false)
	assert.equal(fromDisk({ proPresenterTimer: 'Game Timer' }).proPresenterTimer, 'Game Timer')
	assert.equal(fromDisk({ proPresenterTimer: 7 }).proPresenterTimer, null)
	assert.equal(patchFrom({ proPresenterTimer: 7 }), null)
	assert.deepEqual(patchFrom({ proPresenterTimer: null }), { proPresenterTimer: null })
})
