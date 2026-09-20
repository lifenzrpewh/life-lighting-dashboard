import test from 'node:test'
import assert from 'node:assert/strict'

import {
	unread,
	record,
	readingOf,
	matchReading,
	linkFromRequests,
	STALE_AFTER_MS,
	UNANSWERED_BEFORE_UNREACHABLE,
} from '../dist/src/shared/reading.js'

const LIVE = { state: 'live', roundTripMs: 12 }
const DEAD = { state: 'unreachable', since: 0 }

const T0 = 1_000_000

test('boot is UNKNOWN, not off and not zero', () => {
	const r = readingOf(unread(), T0, LIVE)
	assert.deepEqual(r, { state: 'unknown', why: 'never-read' })
	// The specific failure being prevented: a boot state that renders as 0%
	// tells the operator the rig is dark when we simply have not looked yet.
	assert.ok(!('value' in r))
})

test('a fresh read is LIVE', () => {
	const c = record(unread(), { ok: true, value: 78, at: T0 })
	assert.deepEqual(readingOf(c, T0 + 500, LIVE), { state: 'live', value: 78 })
})

test('an aged read is STALE and carries its age', () => {
	const c = record(unread(), { ok: true, value: 78, at: T0 })
	const r = readingOf(c, T0 + STALE_AFTER_MS, LIVE)
	assert.equal(r.state, 'stale')
	assert.equal(r.value, 78)
	assert.equal(r.ageMs, STALE_AFTER_MS)
})

test('the plan\'s own example: a timeout four minutes after a good read shows "78% · 4m ago"', () => {
	// This is the case the whole Channel shape exists for. The read is failing
	// NOW, but we had a real value four minutes ago, and an aged number the
	// operator can judge beats a `?` they cannot.
	let c = record(unread(), { ok: true, value: 78, at: T0 })
	const fourMin = 4 * 60 * 1000
	c = record(c, { ok: false, reason: 'timeout', at: T0 + fourMin })

	const r = readingOf(c, T0 + fourMin, LIVE)
	assert.equal(r.state, 'stale')
	assert.equal(r.value, 78)
	assert.equal(r.ageMs, fourMin, 'age is measured from the good read, not the failed one')
})

test('a failure never overwrites the last good value', () => {
	let c = record(unread(), { ok: true, value: 78, at: T0 })
	c = record(c, { ok: false, reason: 'error', at: T0 + 10, detail: 'no route to host' })
	c = record(c, { ok: false, reason: 'timeout', at: T0 + 20 })
	assert.deepEqual(c.lastOk, { value: 78, at: T0 })
})

test('a failure with nothing behind it is UNKNOWN, carrying which kind', () => {
	const t = record(unread(), { ok: false, reason: 'timeout', at: T0 })
	assert.deepEqual(readingOf(t, T0, LIVE), { state: 'unknown', why: 'timeout' })

	const e = record(unread(), { ok: false, reason: 'error', at: T0, detail: 'bad prefix' })
	assert.deepEqual(readingOf(e, T0, LIVE), { state: 'unknown', why: 'error' })
})

test('UNREACHABLE drops even a fresh value to UNKNOWN', () => {
	// Every element on the board goes at the same instant. A tile still showing a
	// confident number through a dead link is the exact failure this app exists
	// to prevent, so the link outranks the value's own freshness.
	const c = record(unread(), { ok: true, value: 78, at: T0 })
	const r = readingOf(c, T0, DEAD)
	assert.deepEqual(r, { state: 'unknown', why: 'unreachable' })
	assert.ok(!('value' in r))
})

test('matchReading forces a branch per state and is the only way to a value', () => {
	const render = (reading) =>
		matchReading(reading, {
			live: (v) => `${v}%`,
			stale: (v, age) => `${v}% · ${Math.round(age / 60000)}m ago`,
			unknown: (why) => `? (${why})`,
		})

	const c = record(unread(), { ok: true, value: 78, at: T0 })
	assert.equal(render(readingOf(c, T0, LIVE)), '78%')
	assert.equal(render(readingOf(c, T0 + 4 * 60 * 1000, LIVE)), '78% · 4m ago')
	assert.equal(render(readingOf(unread(), T0, LIVE)), '? (never-read)')
	assert.equal(render(readingOf(c, T0, DEAD)), '? (unreachable)')
})

test('silence does not kill the link — only unanswered requests do', () => {
	// THE TRAP: channel B only speaks on change. A quiet desk mid-sermon is
	// silent for minutes and perfectly healthy. Throwing a full-width UNREACHABLE
	// bar across the screen during the quietest part of the service, because
	// nothing happened to change, would be a self-inflicted wound.
	assert.equal(linkFromRequests(0, 12, T0).state, 'live')
	assert.equal(linkFromRequests(UNANSWERED_BEFORE_UNREACHABLE - 1, 12, T0).state, 'live')
	assert.equal(linkFromRequests(UNANSWERED_BEFORE_UNREACHABLE, 12, T0).state, 'unreachable')
})

test('a link that has never answered is unreachable, not live-with-zero-latency', () => {
	assert.equal(linkFromRequests(0, null, T0).state, 'unreachable')
})
