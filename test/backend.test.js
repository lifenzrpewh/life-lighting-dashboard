import test from 'node:test'
import assert from 'node:assert/strict'

import { pairUrl, readPairCreated, readPairPoll } from '../dist/src/backend/pairing.js'
import { campusOf, paths, pickPlan, planStart, read, toService } from '../dist/src/backend/run-order.js'
import { apiKeyRole, needsRefresh, REFRESH_AHEAD_MS, sessionFrom, sessionFromDisk } from '../dist/src/backend/session.js'
import { RUN_ORDER_POLL_MS, RUN_ORDER_STALE_AFTER_MS, RUN_ORDER_TIMEOUT_MS } from '../dist/src/shared/backend.js'
import { readingOf, record, unread } from '../dist/src/shared/reading.js'

const CAMPUS = '3f2b8c1e-0d4a-4b6e-9a5f-1c2d3e4f5a6b'
const FIELD = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const USER = '11111111-2222-4333-8444-555555555555'

const pad = (n) => String(n).padStart(2, '0')

/** A plan at a local wall-clock time, as the backend's rows carry it: PCO
 *  writes the church's own clock with a `Z` on the end (planStart). */
function plan(id, y, mo, d, h, mi, type = 'Mount Eden 9:30am', title = null) {
	return {
		id,
		title,
		sort_date: `${y}-${pad(mo)}-${pad(d)}`,
		starts: `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00Z`,
		pco_service_types: { name: type, visible: true },
	}
}

// --- the requests ------------------------------------------------------------

test('every query names its table and the columns it reads', () => {
	const q = new URL(`https://x${paths.plans(CAMPUS, '2026-10-03')}`)
	assert.equal(q.pathname, '/rest/v1/pco_plans')
	assert.equal(q.searchParams.get('select'), 'id,title,sort_date,starts:raw->attributes->>sort_date,pco_service_types!inner(name,visible)')
	assert.equal(q.searchParams.get('campus_id'), `eq.${CAMPUS}`)
	assert.equal(q.searchParams.get('pco_service_types.visible'), 'is.true')
	assert.equal(q.searchParams.get('sort_date'), 'gte.2026-10-03')

	const n = new URL(`https://x${paths.notes([FIELD], ['101', '102'])}`)
	assert.equal(n.searchParams.get('pco_item_id'), 'in.(101,102)')
	assert.equal(n.searchParams.get('deleted_at'), 'is.null')

	const f = new URL(`https://x${paths.fields(CAMPUS)}`)
	assert.equal(f.searchParams.get('key'), 'eq.lighting_cues')
	assert.equal(f.searchParams.get('or'), `(campus_id.is.null,campus_id.eq.${CAMPUS})`)
})

test('an id of the wrong shape never reaches a query string', () => {
	assert.throws(() => paths.campus('x,campus_id.neq.0'))
	assert.throws(() => paths.items('1&select=*'))
	assert.throws(() => paths.notes([FIELD], ['1)']))
	assert.throws(() => paths.roles('not-a-uuid'))
})

// --- the shapes accepted -----------------------------------------------------

test('a response of the wrong shape is refused whole', () => {
	assert.equal(read.items([{ id: '1', sequence: 1, item_type: 'song', title: 'A', length_seconds: 200 }]).ok, true)
	assert.equal(read.items([{ id: '1', sequence: '1', item_type: 'song', title: 'A', length_seconds: 200 }]).ok, false)
	assert.equal(read.items({ message: 'JWT expired' }).ok, false)
	assert.equal(read.plans([{ id: '1', title: null, sort_date: '2026-10-04', starts: null, pco_service_types: null }]).ok, false)
	assert.equal(read.permissions(['notes.view', 3]).ok, false)
	assert.equal(read.notes([{ pco_item_id: '1', value_text: null }]).ok, true)
})

// --- the campus --------------------------------------------------------------

test('the campus is the one the booth device is scoped to', () => {
	assert.deepEqual(campusOf([{ campus_id: CAMPUS }], ['notes.view']), { ok: true, value: { campusId: CAMPUS, canEdit: false } })
})

test('an account that cannot read notes is refused, not read as "no notes"', () => {
	// RLS answers a forbidden read with [], so this is the only place it shows.
	const r = campusOf([{ campus_id: CAMPUS }], ['embeds.view'])
	assert.equal(r.ok, false)
	assert.match(r.detail, /notes\.view/)
})

test('a campus is never guessed', () => {
	assert.match(campusOf([], ['notes.view']).detail, /no role/)
	assert.match(campusOf([{ campus_id: null }], ['notes.view']).detail, /every campus/)
	const two = campusOf([{ campus_id: CAMPUS }, { campus_id: '3f2b8c1e-0d4a-4b6e-9a5f-000000000000' }], ['notes.view'])
	assert.match(two.detail, /2 campuses/)
})

test('an account that can also edit is allowed, and said', () => {
	assert.equal(campusOf([{ campus_id: CAMPUS }], ['notes.view', 'notes.edit']).value.canEdit, true)
})

// --- the plan ----------------------------------------------------------------

test('of two services today, the one starting nearer now', () => {
	const am = plan('am', 2026, 10, 4, 9, 30)
	const pm = plan('pm', 2026, 10, 4, 18, 0, 'Mount Eden 6pm')
	assert.equal(pickPlan([am, pm], new Date(2026, 9, 4, 8, 0).getTime()).id, 'am')
	assert.equal(pickPlan([am, pm], new Date(2026, 9, 4, 12, 0).getTime()).id, 'am')
	assert.equal(pickPlan([am, pm], new Date(2026, 9, 4, 15, 0).getTime()).id, 'pm')
	assert.equal(pickPlan([am, pm], new Date(2026, 9, 4, 21, 0).getTime()).id, 'pm')
})

test('midweek, the next plan, so Sunday\'s notes can be checked', () => {
	const sun = plan('sun', 2026, 10, 4, 9, 30)
	const next = plan('next', 2026, 10, 11, 9, 30)
	assert.equal(pickPlan([next, sun], new Date(2026, 8, 30, 20, 0).getTime()).id, 'sun')
})

test('yesterday\'s plan is not today\'s, and nothing ahead is null', () => {
	const past = plan('past', 2026, 9, 27, 9, 30)
	assert.equal(pickPlan([past], new Date(2026, 8, 30, 9, 0).getTime()), null)
	assert.equal(pickPlan([], Date.now()), null)
})

// --- the service -------------------------------------------------------------

test('PCO\'s sort_date is the church\'s wall clock, whatever the Z says', () => {
	// The real row, 2026-10-01: Central AM, plan 90226424, a 9:00 service. PCO's
	// own plan_times has it at 2026-10-03T20:00:00Z. Run in Auckland, where the
	// old reading (a true instant) put it at 22:00 the evening before.
	const tz = process.env.TZ
	process.env.TZ = 'Pacific/Auckland'
	try {
		const central = { ...plan('90226424', 2026, 10, 4, 9, 0), starts: '2026-10-04T09:00:00Z' }
		assert.equal(planStart(central), Date.parse('2026-10-03T20:00:00Z'))
		assert.equal(new Date(planStart(central)).getHours(), 9)
		// Either side of the daylight-saving change, 09:00Z is still 9:00.
		const nzst = { ...central, starts: '2026-09-20T09:00:00Z' }
		assert.equal(planStart(nzst), Date.parse('2026-09-19T21:00:00Z'))
		// Picked on its own morning, not the evening before.
		assert.equal(pickPlan([central], Date.parse('2026-10-03T19:30:00Z'))?.id, '90226424')
		assert.equal(pickPlan([central], Date.parse('2026-10-03T08:00:00Z'))?.id, '90226424')
	} finally {
		if (tz === undefined) delete process.env.TZ
		else process.env.TZ = tz
	}
})

test('a start PCO did not write is no start, never a guess', () => {
	for (const starts of [null, '', 'soon', '2026-10-04']) assert.equal(planStart({ ...plan('p', 2026, 10, 4, 9, 0), starts }), null, String(starts))
	assert.equal(new Date(planStart({ ...plan('p', 2026, 10, 4, 9, 0), starts: '2026-10-04T18:30' })).getMinutes(), 30)
})

test('rows become the service, in PCO order, with PCO\'s own kinds', () => {
	const p = plan('p1', 2026, 10, 4, 9, 30, 'Mount Eden 9:30am', '  ')
	const items = [
		{ id: '3', sequence: 3, item_type: 'song', title: 'Great Are You', length_seconds: 270 },
		{ id: '1', sequence: 1, item_type: 'header', title: 'Worship', length_seconds: 0 },
		{ id: '4', sequence: 4, item_type: 'livestream', title: 'Stream', length_seconds: null },
		{ id: '2', sequence: 2, item_type: 'media', title: null, length_seconds: 300 },
	]
	const s = toService('Mount Eden', p, items, [])
	assert.equal(s.date, '2026-10-04')
	assert.equal(s.serviceType, 'Mount Eden 9:30am')
	assert.equal(s.planTitle, null, 'a blank title is no title')
	assert.equal(s.nowItemId, null, 'the backend has no current item')
	assert.deepEqual(
		s.items.map((i) => [i.pcoItemId, i.kind, i.title, i.lengthSec]),
		[
			['1', 'header', 'Worship', null], // PCO's 0 is "no length", never 0:00
			['2', 'media', '', 300],
			['3', 'song', 'Great Are You', 270],
			['4', 'other', 'Stream', null], // a type not taught is kept, not dropped
		],
	)
})

test('a note is the text written; a cleared or blank one is none', () => {
	const p = plan('p1', 2026, 10, 4, 9, 30)
	const items = [
		{ id: '1', sequence: 1, item_type: 'song', title: 'A', length_seconds: 200 },
		{ id: '2', sequence: 2, item_type: 'song', title: 'B', length_seconds: 200 },
		{ id: '3', sequence: 3, item_type: 'song', title: 'C', length_seconds: 200 },
	]
	const notes = [
		{ pco_item_id: '1', value_text: '  deep blue, slow build  ' },
		{ pco_item_id: '2', value_text: '' }, // the PWA writes '' to clear
		{ pco_item_id: '3', value_text: 'campus note' },
		{ pco_item_id: '3', value_text: 'global note' }, // two Lighting fields: both kept
	]
	const s = toService('Mount Eden', p, items, notes)
	assert.deepEqual(
		s.items.map((i) => i.lightingNote),
		['deep blue, slow build', null, 'campus note\nglobal note'],
	)
})

// --- the reading -------------------------------------------------------------

test('the run order is judged by its own reads, not the console link', () => {
	const c = record(unread(), { ok: true, value: 'x', at: 1_000 })
	assert.equal(readingOf(c, 1_500, null, RUN_ORDER_STALE_AFTER_MS).state, 'live')
	const failing = record(c, { ok: false, reason: 'timeout', at: 2_000 })
	assert.deepEqual(readingOf(failing, 5_000, null, RUN_ORDER_STALE_AFTER_MS), { state: 'stale', value: 'x', ageMs: 4_000 })
})

test('a run order kept from an earlier run shows as old from the first frame', () => {
	const booted = { latest: null, lastOk: { value: 'x', at: 1_000 } }
	assert.deepEqual(readingOf(booted, 61_000, null, RUN_ORDER_STALE_AFTER_MS), { state: 'stale', value: 'x', ageMs: 60_000 })
})

test('the run order goes stale after two missed reads and the third\'s timeout', () => {
	assert.equal(RUN_ORDER_STALE_AFTER_MS, 2 * RUN_ORDER_POLL_MS + RUN_ORDER_TIMEOUT_MS)
})

// --- the session ---------------------------------------------------------------

const jwt = (payload) =>
	['{"alg":"HS256"}', JSON.stringify(payload), 'sig'].map((p, i) => (i < 2 ? Buffer.from(p).toString('base64url') : p)).join('.')

test('only an anon key is an anon key', () => {
	assert.equal(apiKeyRole(jwt({ role: 'anon', iss: 'supabase' })), 'anon')
	// Same shape, bypasses RLS: config.ts refuses it by this answer.
	assert.equal(apiKeyRole(jwt({ role: 'service_role' })), 'service_role')
	assert.equal(apiKeyRole('eyJ...'), null)
	assert.equal(apiKeyRole('a.b.c'), null)
})

test('a GoTrue answer becomes a session, or is refused', () => {
	const body = { access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: { id: USER, email: 'booth@x.org' } }
	assert.deepEqual(sessionFrom(body, 1_000), {
		ok: true,
		value: { accessToken: 'at', refreshToken: 'rt', expiresAt: 1_000 + 3_600_000, userId: USER, email: 'booth@x.org' },
	})
	assert.equal(sessionFrom({ ...body, expires_at: 2_000 }, 1_000).value.expiresAt, 2_000_000)
	assert.equal(sessionFrom({ ...body, refresh_token: '' }, 1_000).ok, false)
	assert.equal(sessionFrom({ error: 'invalid_grant' }, 1_000).ok, false)
})

test('a session is refreshed before it runs out, not after', () => {
	const s = { accessToken: 'a', refreshToken: 'r', expiresAt: 10 * 60_000, userId: USER, email: null }
	assert.equal(needsRefresh(s, s.expiresAt - REFRESH_AHEAD_MS - 1), false)
	assert.equal(needsRefresh(s, s.expiresAt - REFRESH_AHEAD_MS + 1), true)
})

test('a session off disk is checked, not trusted', () => {
	const s = { accessToken: 'a', refreshToken: 'r', expiresAt: 5, userId: USER, email: null }
	assert.deepEqual(sessionFromDisk(s), s)
	assert.equal(sessionFromDisk({ ...s, expiresAt: '5' }), null)
	assert.equal(sessionFromDisk(null), null)
})

// --- pairing -------------------------------------------------------------------

test('pairing answers are read as the backend writes them', () => {
	const nonce = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
	assert.deepEqual(readPairCreated({ nonce, expires_at: '2026-09-30T10:03:00Z' }), {
		ok: true,
		value: { nonce, expiresAt: Date.parse('2026-09-30T10:03:00Z') },
	})
	assert.equal(readPairCreated({ error: 'boom' }).ok, false)
	assert.deepEqual(readPairPoll({ status: 'pending' }).value, { status: 'pending' })
	assert.deepEqual(readPairPoll({ status: 'approved', token_hash: 'h' }).value, { status: 'approved', tokenHash: 'h' })
	assert.equal(readPairPoll({ status: 'approved' }).ok, false)
	assert.equal(readPairPoll({ status: 'maybe' }).ok, false)
})

test('the QR points at the PWA\'s approve page on the backend, not the kiosk', () => {
	assert.equal(
		pairUrl('https://visuals.prodapps.life', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
		'https://visuals.prodapps.life/pair?nonce=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
	)
})
