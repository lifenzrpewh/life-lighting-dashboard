import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { readShow } from '../dist/src/bridge/channel-c.js'
import { encodeOscString } from '../dist/src/bridge/osc.js'
import { QUIET_MS } from '../dist/src/bridge/ping.js'
import { createShowfileReader, OLD_PROBE_DETAIL, otherBuildDetail, showCommand } from '../dist/src/bridge/showfile.js'
import { LIFEBRIDGE_BUILD as B } from '../dist/src/shared/lifebridge-build.js'
import { readingOf } from '../dist/src/shared/reading.js'
import { SHOW_REFRESH_MS, SHOW_STALE_AFTER_MS, SHOW_TIMEOUT_MS, SHOW_WATCHED_REFRESH_MS } from '../dist/src/shared/showfile.js'

const T0 = 1_000_000
const LIVE = { state: 'live', roundTripMs: 40 }
const msg = (address, ...args) => ({ address, args })
const str = (value) => ({ type: 's', value })
/** A reply as this build of LifeBridge sends it: its stamp first. */
const stamped = (value) => str(`${B}|${value}`)

const ON_BASE = {
	name: 'Mount Eden Base',
	base: 'Mount Eden Base',
	baseFrom: 'uservar',
	onBase: true,
	version: '2.3.2.0',
}
const SHOW = { kind: 'show', show: ON_BASE }

// --- the ask -----------------------------------------------------------------

test('the ask is one plugin call, and it survives the trip to the console', () => {
	assert.equal(showCommand(), 'Call Plugin "LifeBridge" "watch"')
	assert.ok(encodeOscString('/life/cmd', showCommand()).ok)
})

test('the verb asked for is a verb LifeBridge dispatches', () => {
	// If the plugin renames it and this does not follow, every ask comes back
	// `unknown verb` and the chip says so, but only once someone is looking.
	const lua = fs.readFileSync(new URL('../console-plugin/LifeBridge.lua', import.meta.url), 'utf8')
	assert.match(lua, /if verb == 'watch' then return watchVerb\(\) end/)
})

test('the stale threshold is derived from the watched cadence and the ping it rides on', () => {
	assert.equal(SHOW_STALE_AFTER_MS, SHOW_WATCHED_REFRESH_MS + QUIET_MS + SHOW_TIMEOUT_MS)
})

test('the build Pāua expects is the stamp the plugin carries', () => {
	const lua = fs.readFileSync(new URL('../console-plugin/LifeBridge.lua', import.meta.url), 'utf8')
	assert.match(B, /^lb-[0-9a-f]{8}$/)
	assert.match(lua, new RegExp(`^local BUILD = '${B}'$`, 'm'))
})

// --- the reply, as showVerb writes it ----------------------------------------
// The literals are the ones console-plugin/_test_lifebridge.lua asserts the
// plugin emits, so the two ends are held to one format.

test('on the base show', () => {
	const r = readShow(msg('/life/show', stamped('2.3.2.0|base|uservar|Mount Eden Base|Mount Eden Base')), 'life')
	assert.deepEqual(r, { ok: true, reply: SHOW })
})

test('on another show, against SaveGuard\'s default base', () => {
	const r = readShow(msg('/life/show', stamped('2.3.2.0|other|default|Sunday 21 Sep|LIFE Basefile Master')), 'life')
	assert.deepEqual(r, {
		ok: true,
		reply: {
			kind: 'show',
			show: { name: 'Sunday 21 Sep', base: 'LIFE Basefile Master', baseFrom: 'default', onBase: false, version: '2.3.2.0' },
		},
	})
})

test('the verdict is the console\'s, never re-derived from the names', () => {
	// The names arrive mangled (non-ASCII, commas), so two that differ on the
	// console can arrive equal. The chip must follow SaveGuard, not the strings.
	const r = readShow(msg('/life/show', stamped('2.3.2.0|other|uservar|T-maki|T-maki')), 'life')
	assert.equal(r.ok && r.reply.kind === 'show' && r.reply.show.onBase, false)
})

test('a console that cannot read its own showfile name says so', () => {
	const r = readShow(msg('/life/show', stamped('2.3.2.0|unreadable')), 'life')
	assert.deepEqual(r, { ok: true, reply: { kind: 'unreadable', version: '2.3.2.0' } })
})

test('any other build is recognised, and nothing it says is read as a name', () => {
	const other = (m) => readShow(m, 'life')
	// Every build before stamps: its refusals, its unstamped show and watch.
	assert.deepEqual(other(msg('/life/error', str('unknown verb show'))), { ok: true, reply: { kind: 'other-build', build: null } })
	assert.deepEqual(other(msg('/life/error', str('unknown verb watch'))), { ok: true, reply: { kind: 'other-build', build: null } })
	assert.deepEqual(other(msg('/life/show', str('2.3.2.0|base|uservar|Mount Eden Base|Mount Eden Base'))), {
		ok: true,
		reply: { kind: 'other-build', build: null },
	})
	assert.deepEqual(other(msg('/life/watch', str('started'))), { ok: true, reply: { kind: 'other-build', build: null } })
	// A stamped build that is not this one.
	assert.deepEqual(other(msg('/life/show', str('lb-0badc0de|2.3.2.0|base|uservar|A|A'))), {
		ok: true,
		reply: { kind: 'other-build', build: 'lb-0badc0de' },
	})
	assert.match(otherBuildDetail('lb-0badc0de'), new RegExp(`build lb-0badc0de, and this Pāua works only with ${B}`))
	assert.match(otherBuildDetail(null), /an older build, from before build stamps/)
})

test('the watcher says what it did', () => {
	for (const state of ['started', 'already', 'expired', 'stopped']) {
		assert.deepEqual(readShow(msg('/life/watch', stamped(state)), 'life'), { ok: true, reply: { kind: 'watch', state } })
	}
	assert.equal(readShow(msg('/life/watch', stamped('sleeping')), 'life').reason, 'bad-args')
	assert.equal(readShow(msg('/life/watch', stamped('started|again')), 'life').reason, 'bad-args')
})

test('another verb\'s refusal, a ping, and channel B are not show replies', () => {
	for (const m of [
		msg('/life/error', str('unknown verb pnig')),
		msg('/life/ping', str('a1b2.3')),
		msg('/life/14.14.1.6.1005', str('FaderMaster'), { type: 'i', value: 3 }, { type: 'f', value: 51.2 }),
		// SendOSC prepends the Prefix; an address that already has it is a bug
		// on the sending side, not a reply.
		msg('/life/life/show', stamped('2.3.2.0|base|uservar|A|A')),
		// This build never refuses show or watch; any other error is not ours.
		msg('/life/error', stamped('unknown verb pnig')),
	]) {
		assert.equal(readShow(m, 'life').reason, 'other-channel', m.address)
	}
})

test('a reply of any other shape is refused, never read loosely', () => {
	for (const value of [
		'2.3.2.0|base|uservar|Mount Eden Base', // a field short: which one is missing?
		'2.3.2.0|base|uservar|Mount|Eden|Base', // a `|` the plugin should have replaced
		'2.3.2.0|yes|uservar|A|A', // not a verdict this build knows
		'2.3.2.0|base|guess|A|A',
		'2.3.2.0|base|uservar||A', // no name is not a name
		'2.3.2.0|base|uservar|A|',
		'|base|uservar|A|A',
		'2.3.2.0|other',
		'',
	]) {
		assert.equal(readShow(msg('/life/show', stamped(value)), 'life').reason, 'bad-args', value)
	}
	assert.equal(readShow(msg('/life/show', { type: 'i', value: 1 }), 'life').reason, 'bad-args')
	assert.equal(readShow(msg('/life/show'), 'life').reason, 'bad-args')
	assert.equal(readShow(msg('/life/show', str('a'), str('b')), 'life').reason, 'bad-args')
})

// --- the reader: what it records ---------------------------------------------

test('boot is never-read: UNKNOWN, not a name', () => {
	const r = createShowfileReader()
	assert.deepEqual(readingOf(r.channel(T0), T0, LIVE, SHOW_STALE_AFTER_MS), { state: 'unknown', why: 'never-read' })
})

test('an answer is recorded as a read, when it arrived', () => {
	const r = createShowfileReader()
	r.asked(T0)
	r.reply(SHOW, T0 + 80)
	assert.deepEqual(r.channel(T0 + 100).latest, { ok: true, value: ON_BASE, at: T0 + 80 })
})

test('an ask with no answer becomes a timeout, and never a name', () => {
	const r = createShowfileReader()
	r.asked(T0)
	assert.equal(r.channel(T0 + SHOW_TIMEOUT_MS - 1).latest, null)
	assert.deepEqual(r.channel(T0 + SHOW_TIMEOUT_MS).latest, { ok: false, reason: 'timeout', at: T0 + SHOW_TIMEOUT_MS })
	assert.deepEqual(readingOf(r.channel(T0 + SHOW_TIMEOUT_MS), T0 + SHOW_TIMEOUT_MS, LIVE, SHOW_STALE_AFTER_MS), {
		state: 'unknown',
		why: 'timeout',
	})
})

test('a timeout after a good read keeps the name, aged', () => {
	const r = createShowfileReader()
	r.reply(SHOW, T0)
	r.asked(T0 + 60_000)
	const now = T0 + 60_000 + SHOW_TIMEOUT_MS
	assert.deepEqual(readingOf(r.channel(now), now, LIVE, SHOW_STALE_AFTER_MS), {
		state: 'stale',
		value: ON_BASE,
		ageMs: now - T0,
	})
})

test('a late answer is still what the console said, and replaces the timeout', () => {
	const r = createShowfileReader()
	r.asked(T0)
	r.channel(T0 + SHOW_TIMEOUT_MS + 1)
	r.reply(SHOW, T0 + SHOW_TIMEOUT_MS + 500)
	assert.equal(r.channel(T0 + SHOW_TIMEOUT_MS + 600).latest.ok, true)
})

test('an unreadable name and an out-of-date plugin are failures with the reason', () => {
	const r = createShowfileReader()
	r.reply({ kind: 'unreadable', version: '2.3.2.0' }, T0)
	assert.match(r.channel(T0).latest.detail, /could not read its own showfile name/)
	r.reply({ kind: 'other-build', build: null }, T0 + 1)
	assert.match(r.channel(T0 + 1).latest.detail, /Delete it on the console, import the LifeBridge.xml/)
	assert.deepEqual(readingOf(r.channel(T0 + 1), T0 + 1, LIVE, SHOW_STALE_AFTER_MS), { state: 'unknown', why: 'error' })
})

test('another build, asked or pushed, stops every ask from this link', () => {
	const r = createShowfileReader()
	r.reply(SHOW, T0)
	r.reply({ kind: 'other-build', build: 'lb-0badc0de' }, T0 + 60_000)
	assert.equal(r.refused(), otherBuildDetail('lb-0badc0de'))
	assert.equal(r.channel(T0 + 60_000).latest.detail, otherBuildDetail('lb-0badc0de'))
	for (let now = T0 + 60_000; now < T0 + 60 * 60_000; now += QUIET_MS) {
		assert.equal(r.due(now, 'quiet-gap'), false)
		assert.equal(r.due(now, 'link-up'), false)
		assert.equal(r.due(now, 'watch-ended'), false)
	}
	// A second refusal does not replace the first reason.
	r.reply({ kind: 'other-build', build: null }, T0 + 61_000)
	assert.equal(r.refused(), otherBuildDetail('lb-0badc0de'), 'the first reason stands')
})

// --- the watcher's cadence --------------------------------------------------

test('a running watcher stretches the refresh to ten minutes', () => {
	const r = createShowfileReader()
	assert.equal(r.due(T0, 'link-up'), true)
	r.asked(T0)
	r.reply(SHOW, T0 + 50)
	r.reply({ kind: 'watch', state: 'started' }, T0 + 51)
	assert.equal(r.due(T0 + SHOW_REFRESH_MS, 'quiet-gap'), false, 'not every minute')
	assert.equal(r.due(T0 + SHOW_WATCHED_REFRESH_MS - 1, 'quiet-gap'), false)
	assert.equal(r.due(T0 + SHOW_WATCHED_REFRESH_MS, 'quiet-gap'), true)
	// The ask's answer is a fresh read: LIVE across the whole watched refresh.
	r.asked(T0 + SHOW_WATCHED_REFRESH_MS)
	r.reply(SHOW, T0 + SHOW_WATCHED_REFRESH_MS + 50)
	r.reply({ kind: 'watch', state: 'already' }, T0 + SHOW_WATCHED_REFRESH_MS + 51)
	const later = T0 + 2 * SHOW_WATCHED_REFRESH_MS
	assert.equal(readingOf(r.channel(later), later, LIVE, SHOW_STALE_AFTER_MS).state, 'live')
})

test('an expired watcher is asked again at once; a stopped one at the next quiet gap', () => {
	const r = createShowfileReader()
	r.asked(T0)
	r.reply(SHOW, T0 + 50)
	r.reply({ kind: 'watch', state: 'started' }, T0 + 51)
	r.reply({ kind: 'watch', state: 'expired' }, T0 + 30 * 60_000)
	assert.equal(r.due(T0 + 30 * 60_000, 'watch-ended'), true)
	r.asked(T0 + 30 * 60_000)
	assert.equal(r.due(T0 + 30 * 60_000 + 1, 'watch-ended'), false, 'never two in flight')
	r.reply(SHOW, T0 + 30 * 60_000 + 50)
	r.reply({ kind: 'watch', state: 'started' }, T0 + 30 * 60_000 + 51)
	r.reply({ kind: 'watch', state: 'stopped' }, T0 + 31 * 60_000)
	assert.equal(r.due(T0 + 31 * 60_000 + QUIET_MS, 'quiet-gap'), true, 'ended: ask in the next gap')
})

test('no answer, or a link-up, means no watcher is assumed', () => {
	const r = createShowfileReader()
	r.asked(T0)
	r.reply(SHOW, T0 + 50)
	r.reply({ kind: 'watch', state: 'started' }, T0 + 51)
	assert.equal(r.due(T0 + 1000, 'link-up'), true, 'a Load drops the link and ends the watcher')
	r.asked(T0 + 1000)
	r.channel(T0 + 1000 + SHOW_TIMEOUT_MS)
	assert.equal(r.due(T0 + 1000 + SHOW_REFRESH_MS, 'quiet-gap'), true, 'back to the minute')
})

test('a watched quiet hour costs about six asks, not sixty', () => {
	const r = createShowfileReader()
	let asks = 0
	for (let now = T0; now < T0 + 60 * 60_000; now += QUIET_MS) {
		if (r.due(now, asks === 0 ? 'link-up' : 'quiet-gap')) {
			r.asked(now)
			r.reply(SHOW, now + 50)
			r.reply({ kind: 'watch', state: asks === 0 ? 'started' : 'already' }, now + 51)
			asks += 1
		}
	}
	assert.ok(asks >= 5 && asks <= 7, `${asks} asks in a watched quiet hour`)
})

// --- the old probe: suspected in Central's crash, 2026-10-19/20 ---------------

test('any probe push under our prefix is recognised as the probe', () => {
	// The 2026-09-21 build sends /probe/int, /probe/float and /probe/string as it
	// goes, then /probe/summary and a /probe/result per probe.
	for (const m of [
		msg('/life/probe/int', { type: 'i', value: 1 }),
		msg('/life/probe/summary', str('MA3 2.3.2.0: 9/10 passed')),
		msg('/life/probe/result', str('[2.3.2.0] hook.objectchange=FAIL exists but no call form returned a hook id')),
	]) {
		assert.deepEqual(readShow(m, 'life'), { ok: true, reply: { kind: 'probe' } }, m.address)
	}
	assert.equal(readShow(msg('/companion/probe/summary', str('x')), 'life').reason, 'other-channel')
	assert.equal(readShow(msg('/life/probes', str('x')), 'life').reason, 'other-channel')
})

test('the old probe answering an ask stops every ask from this link, link-up included', () => {
	const r = createShowfileReader()
	assert.equal(r.refused(), null)
	assert.equal(r.due(T0, 'link-up'), true)
	r.asked(T0)
	r.reply({ kind: 'probe' }, T0 + 40)
	r.reply({ kind: 'probe' }, T0 + 41)
	const latest = r.channel(T0 + 41).latest
	assert.equal(latest.ok, false)
	assert.equal(latest.detail, OLD_PROBE_DETAIL)
	assert.match(OLD_PROBE_DETAIL, /Delete it on the console, import the LifeBridge.xml from this version of Pāua, then restart Pāua/)
	assert.equal(r.refused(), OLD_PROBE_DETAIL)
	// An hour of quiet gaps and link-ups: not one more call to the plugin.
	for (let now = T0 + QUIET_MS; now < T0 + 60 * 60_000; now += QUIET_MS) {
		assert.equal(r.due(now, 'quiet-gap'), false)
		assert.equal(r.due(now, 'link-up'), false)
	}
	assert.equal(r.channel(T0 + 60 * 60_000).latest.detail, OLD_PROBE_DETAIL, 'never overwritten by a timeout')
})

test('a probe that lands just after the ask timed out still counts', () => {
	const r = createShowfileReader()
	r.asked(T0)
	assert.equal(r.channel(T0 + SHOW_TIMEOUT_MS).latest.reason, 'timeout')
	r.reply({ kind: 'probe' }, T0 + SHOW_TIMEOUT_MS + 500)
	assert.equal(r.channel(T0 + SHOW_TIMEOUT_MS + 500).latest.detail, OLD_PROBE_DETAIL)
	assert.equal(r.due(T0 + SHOW_REFRESH_MS, 'quiet-gap'), false)
})

test('a probe nobody asked for (run by hand on a current build) changes nothing', () => {
	const r = createShowfileReader()
	r.asked(T0)
	r.reply(SHOW, T0 + 50)
	r.reply({ kind: 'probe' }, T0 + 30_000)
	assert.equal(r.refused(), null)
	assert.equal(r.channel(T0 + 30_000).latest.value.name, 'Mount Eden Base')
	assert.equal(r.due(T0 + SHOW_REFRESH_MS, 'quiet-gap'), true)
})

test('a push from the watcher is recorded with no ask in flight', () => {
	const r = createShowfileReader()
	r.reply(SHOW, T0)
	r.reply({ kind: 'show', show: { ...ON_BASE, name: 'test', onBase: false } }, T0 + 60_000)
	assert.equal(r.channel(T0 + 60_000).latest.value.name, 'test')
})

test('the channel is the same object until something new is recorded', () => {
	// link.ts logs a showfile change by identity; a fresh object per call would
	// log every quarter second.
	const r = createShowfileReader()
	r.reply(SHOW, T0)
	assert.equal(r.channel(T0 + 1), r.channel(T0 + 2))
})

test('a name is LIVE for one refresh cadence, then STALE with its age', () => {
	const r = createShowfileReader()
	r.reply(SHOW, T0)
	assert.equal(readingOf(r.channel(T0), T0 + SHOW_STALE_AFTER_MS - 1, LIVE, SHOW_STALE_AFTER_MS).state, 'live')
	const late = readingOf(r.channel(T0), T0 + SHOW_STALE_AFTER_MS, LIVE, SHOW_STALE_AFTER_MS)
	assert.equal(late.state, 'stale')
	assert.equal(late.ageMs, SHOW_STALE_AFTER_MS)
})

test('a dead link drops even a fresh name to UNKNOWN', () => {
	const r = createShowfileReader()
	r.reply(SHOW, T0)
	const dead = { state: 'unreachable', since: T0 }
	assert.deepEqual(readingOf(r.channel(T0), T0, dead, SHOW_STALE_AFTER_MS), { state: 'unknown', why: 'unreachable' })
})

// --- the reader: when it asks ------------------------------------------------

test('link-up always asks: a load is a likely reason the link went down', () => {
	const r = createShowfileReader()
	r.asked(T0)
	r.reply(SHOW, T0 + 50)
	assert.equal(r.due(T0 + 1000, 'link-up'), true)
})

test('never two asks in flight', () => {
	const r = createShowfileReader()
	r.asked(T0)
	assert.equal(r.due(T0 + 1, 'link-up'), false)
	assert.equal(r.due(T0 + SHOW_TIMEOUT_MS, 'link-up'), true)
})

test('a quiet gap asks only once a refresh is due', () => {
	const r = createShowfileReader()
	r.asked(T0)
	r.reply(SHOW, T0 + 50)
	assert.equal(r.due(T0 + SHOW_REFRESH_MS - 1, 'quiet-gap'), false)
	assert.equal(r.due(T0 + SHOW_REFRESH_MS, 'quiet-gap'), true)
})

test('a console that never answers is not asked in every quiet gap', () => {
	// No plugin, or one without the verb: without this, two lines every 15 s
	// for as long as it stays broken.
	const r = createShowfileReader()
	let asks = 0
	for (let now = T0; now < T0 + 60 * 60_000; now += QUIET_MS) {
		if (r.due(now, 'quiet-gap')) {
			r.asked(now)
			asks += 1
		}
	}
	// One a minute, the refresh: never one every 15 s gap (240).
	assert.ok(asks <= 60, `${asks} asks in an hour of silence`)
})

test('a quiet hour costs about sixty asks: two command lines a minute', () => {
	// The ping goes out every QUIET_MS on a quiet console; each is a gap.
	const r = createShowfileReader()
	r.asked(T0)
	r.reply(SHOW, T0 + 50)
	let asks = 1
	for (let now = T0 + QUIET_MS; now < T0 + 60 * 60_000; now += QUIET_MS) {
		if (r.due(now, 'quiet-gap')) {
			r.asked(now)
			r.reply(SHOW, now + 80)
			asks += 1
		}
	}
	const linesPerMinute = (asks * 2) / 60
	assert.ok(asks >= 45 && asks <= 61, `${asks} asks in a quiet hour`)
	assert.ok(linesPerMinute <= 2.05, `${linesPerMinute.toFixed(2)} lines a minute`)
})
