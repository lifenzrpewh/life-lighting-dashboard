import test from 'node:test'
import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import fs from 'node:fs'

import { decodeOsc, encodeOscString } from '../dist/src/bridge/osc.js'
import { readPing } from '../dist/src/bridge/channel-c.js'
import {
	createLinkTracker,
	pingCommand,
	PING_TIMEOUT_MS,
	QUIET_MS,
	REPLY_ROW,
	RETRY_MS,
} from '../dist/src/bridge/ping.js'
import { UNANSWERED_BEFORE_UNREACHABLE } from '../dist/src/shared/reading.js'

// Built by hand, as in channel-b.test.js: an encoder checked only against its
// own decoder can share a padding mistake with it and pass.
function paddedString(str) {
	const bytes = Array.from(str, (c) => c.charCodeAt(0))
	bytes.push(0)
	while (bytes.length % 4 !== 0) bytes.push(0)
	return bytes
}

const T0 = 1_000_000

// --- channel A encoding ------------------------------------------------------

test('a command encodes to exactly the bytes OSC 1.0 says', () => {
	const r = encodeOscString('/life/cmd', 'Help')
	assert.ok(r.ok)
	// 9 chars -> 12 · ',s' -> 4 · 'Help' -> 8 (a full word of padding after an aligned string)
	assert.deepEqual(Array.from(r.bytes), [...paddedString('/life/cmd'), ...paddedString(',s'), ...paddedString('Help')])
	assert.equal(r.bytes.length, 12 + 4 + 8)
})

test('an encoded command decodes back to itself', () => {
	const cmd = pingCommand('a1b2c3d4.17')
	const r = encodeOscString('/life/cmd', cmd)
	assert.ok(r.ok)
	const d = decodeOsc(r.bytes)
	assert.ok(d.ok)
	assert.deepEqual(d.message, { address: '/life/cmd', args: [{ type: 's', value: cmd }] })
})

test('non-ASCII and NUL are refused, never sent in part', () => {
	// The em-dash is the one the desk already mangled (b \0 \20, 2026-09-21);
	// the NUL would end the OSC string, so the console would run half a command.
	for (const bad of ['Go — now', 'Go\u0000 Sequence 1', 'tab\there']) {
		const r = encodeOscString('/life/cmd', bad)
		assert.equal(r.ok, false, JSON.stringify(bad))
		assert.equal(r.reason, 'not-ascii')
	}
	assert.equal(encodeOscString('life/cmd', 'Help').reason, 'bad-address')
})

test('the ping is one SendOSC through the reply row: one line on the command line', () => {
	// ❌ 2026-09-30: through the plugin, each ping wrote TWO lines (call Plugin,
	// then SendOSC). The console's own SendOSC answers with one.
	assert.equal(pingCommand('a1b2.3'), 'SendOSC 3 "/ping,s,a1b2.3"')
})

test('the reply row is the row LifeBridge sends through', () => {
	// Both answer through the row that sends to this computer. If one moves and
	// the other does not, the link or the plugin goes quiet with no error.
	const lua = fs.readFileSync(new URL('../console-plugin/LifeBridge.lua', import.meta.url), 'utf8')
	const entry = /^local OSC_ENTRY = (\d+)/m.exec(lua)
	assert.ok(entry, 'OSC_ENTRY not found in LifeBridge.lua')
	assert.equal(Number(entry[1]), REPLY_ROW)
})

// --- channel C: the echo -----------------------------------------------------

const msg = (address, ...args) => ({ address, args })

test('an echo is the token, exactly as the ping carried it', () => {
	const r = readPing(msg('/life/ping', { type: 's', value: 'a1b2.3' }), 'life')
	assert.deepEqual(r, { ok: true, reply: { echo: 'a1b2.3' } })
})

test('channel B and other channel C pushes are other-channel, not errors', () => {
	for (const address of ['/life/14.14.1.6.1005', '/life/probe/summary', '/companion/ping']) {
		assert.equal(readPing(msg(address, { type: 's', value: 'x' }), 'life').reason, 'other-channel', address)
	}
})

test('a doubled prefix is not a ping: that was a sender addressing itself wrong', () => {
	// ✅ 2026-09-21: SendOSC prepends the Prefix, so an address written as
	// /life/ping arrives as /life/life/ping. Reading that as an echo would hide
	// the bug the plugin was fixed for.
	assert.equal(readPing(msg('/life/life/ping', { type: 's', value: 't' }), 'life').reason, 'other-channel')
})

test('an echo of the wrong shape is refused', () => {
	assert.equal(readPing(msg('/life/ping', { type: 'i', value: 3 }), 'life').reason, 'bad-args')
	assert.equal(readPing(msg('/life/ping'), 'life').reason, 'bad-args')
})

// --- the tracker: the verdict ------------------------------------------------

test('boot is unreachable, since boot', () => {
	const t = createLinkTracker('s1', T0)
	assert.deepEqual(t.link(T0 + 500), { state: 'unreachable', since: T0 })
})

test('an answered ping makes the link live, with its round trip', () => {
	const t = createLinkTracker('s1', T0)
	const token = t.send(T0)
	assert.deepEqual(t.answer(token, T0 + 12), { ok: true, roundTripMs: 12 })
	assert.deepEqual(t.link(T0 + 12), { state: 'live', roundTripMs: 12 })
})

test('an echo from another run, or never sent, matches nothing', () => {
	const t = createLinkTracker('s1', T0)
	t.send(T0)
	for (const stray of ['s0.1', 's1.99', '', 's1.1 ']) {
		assert.equal(t.answer(stray, T0 + 5).ok, false, JSON.stringify(stray))
	}
	assert.equal(t.link(T0 + 5).state, 'unreachable')
	assert.equal(t.stats().unmatched, 4)
})

test('each token answers once', () => {
	const t = createLinkTracker('s1', T0)
	const token = t.send(T0)
	assert.ok(t.answer(token, T0 + 5).ok)
	assert.equal(t.answer(token, T0 + 6).ok, false)
})

test('an answer after the timeout is ignored, and the ping counts as missed', () => {
	const t = createLinkTracker('s1', T0)
	const token = t.send(T0)
	assert.equal(t.answer(token, T0 + PING_TIMEOUT_MS).ok, false)
	assert.equal(t.stats().misses, 1)
	assert.equal(t.link(T0 + PING_TIMEOUT_MS).state, 'unreachable', 'never answered, so still down since boot')
})

test('the console talking cannot make a link live that has never answered', () => {
	// LIVE carries a measured round trip, and fader traffic measures nothing.
	const t = createLinkTracker('s1', T0)
	t.heard(T0 + 100)
	assert.deepEqual(t.link(T0 + 100), { state: 'unreachable', since: T0 })
})

/** Drive the tracker the way link.ts does: tick, and send whenever due, never
 *  answering. Returns what was sent, and when. */
function runUnanswered(t, from, until, tick = 250) {
	const sends = []
	for (let now = from; now <= until; now += tick) {
		if (t.due(now)) {
			t.send(now)
			sends.push(now)
		}
	}
	return sends
}

/** A tracker that has answered once, at T0. */
function liveAtT0() {
	const t = createLinkTracker('s1', T0)
	t.answer(t.send(T0), T0 + 10)
	return t
}

// --- the tracker: when it asks -----------------------------------------------

test('a quiet console is asked once per quiet spell, not once a second', () => {
	const t = liveAtT0()
	assert.equal(t.due(T0 + 10 + QUIET_MS - 1), false)
	assert.equal(t.due(T0 + 10 + QUIET_MS), true)
})

test('a console that keeps talking is never asked at all', () => {
	// The whole point: an LD working the console must not see a ping line.
	const t = liveAtT0()
	let asked = 0
	for (let now = T0 + 1000; now < T0 + 10 * 60_000; now += 250) {
		if (now % 5_000 === 0) t.heard(now) // a fader move every five seconds
		if (t.due(now)) asked += 1
	}
	assert.equal(asked, 0)
	assert.equal(t.link(T0 + 10 * 60_000).state, 'live')
})

test('a healthy quiet console costs about four commands a minute', () => {
	const t = liveAtT0()
	let sent = 0
	for (let now = T0 + 250; now < T0 + 60_000; now += 250) {
		if (t.due(now)) {
			t.answer(t.send(now), now + 50)
			sent += 1
		}
	}
	assert.ok(sent >= 3 && sent <= 4, `${sent} pings in a quiet minute`)
})

test('a miss is confirmed at once, and three make it unreachable about 21 s after the last word', () => {
	const t = liveAtT0()
	const lastWord = T0 + 10
	const sends = runUnanswered(t, T0 + 250, T0 + 40_000)

	// The quiet ping, then two confirmations as soon as each one times out.
	const quiet = sends[0] - lastWord
	assert.ok(quiet >= QUIET_MS && quiet < QUIET_MS + 250, `first ask ${quiet} ms after the last word, within one tick of QUIET_MS`)
	assert.ok(sends[1] - sends[0] <= PING_TIMEOUT_MS + 250, 'second ask follows the first miss at once')
	assert.ok(sends[2] - sends[1] <= PING_TIMEOUT_MS + 250, 'third ask follows the second miss at once')

	const wentDown = sends[UNANSWERED_BEFORE_UNREACHABLE - 1] + PING_TIMEOUT_MS
	assert.deepEqual(t.link(T0 + 40_000), { state: 'unreachable', since: wentDown })

	// The same run, stopped just short of the third timeout: a tracker only moves
	// forward, so the earlier moment needs its own.
	const before = liveAtT0()
	runUnanswered(before, T0 + 250, wentDown - 1)
	assert.equal(before.link(wentDown - 1).state, 'live', 'two misses is a slow console, not a dead one')
	const after = wentDown - lastWord
	assert.ok(after >= 20_000 && after <= 23_000, `unreachable ${after} ms after the console last spoke`)
})

test('one lost packet does not turn the screen red', () => {
	const t = liveAtT0()
	const first = runUnanswered(t, T0 + 250, T0 + 10 + QUIET_MS + PING_TIMEOUT_MS)
	assert.equal(first.length, 1)
	// The confirmation is answered: the link never left LIVE.
	const now = T0 + 10 + QUIET_MS + PING_TIMEOUT_MS + 250
	assert.ok(t.due(now))
	t.answer(t.send(now), now + 40)
	assert.deepEqual(t.link(now + 40), { state: 'live', roundTripMs: 40 })
	assert.equal(t.stats().misses, 0)
})

test('while down it retries slowly, and the console talking brings it straight back', () => {
	const t = liveAtT0()
	const sends = runUnanswered(t, T0 + 250, T0 + 120_000)
	const down = sends.slice(UNANSWERED_BEFORE_UNREACHABLE)
	for (let i = 1; i < down.length; i += 1) assert.ok(down[i] - down[i - 1] >= RETRY_MS, 'retries no faster than RETRY_MS')
	assert.equal(t.link(T0 + 120_000).state, 'unreachable')

	t.heard(T0 + 120_100)
	assert.equal(t.link(T0 + 120_100).state, 'live')
})

test('a console that never answers is asked every RETRY_MS, and stays down since boot', () => {
	const t = createLinkTracker('s1', T0)
	const sends = runUnanswered(t, T0, T0 + 60_000)
	assert.equal(sends[0], T0, 'asks at once on boot')
	assert.ok(sends.length <= 60_000 / RETRY_MS + 1, `${sends.length} asks in a minute`)
	assert.deepEqual(t.link(T0 + 60_000), { state: 'unreachable', since: T0 })
})

test('only one ping is ever in flight', () => {
	const t = createLinkTracker('s1', T0)
	runUnanswered(t, T0, T0 + 60_000, 50)
	assert.ok(t.stats().outstanding <= 1)
})

test('a session that could break the command line is refused', () => {
	for (const bad of ['', 'a b', 'a"b', 'a.b', 'a,b', 'café']) {
		assert.throws(() => createLinkTracker(bad, T0), JSON.stringify(bad))
	}
})

// --- over a real socket ------------------------------------------------------
//
// Node pools small Buffers, so a received packet usually sits at a non-zero
// offset in a larger block. That trap only shows on a real socket.

test('a ping round-trips over real UDP: encode, send, decode, echo, match', async () => {
	const PREFIX = 'life'
	const console_ = dgram.createSocket('udp4')
	const dashboard = dgram.createSocket('udp4')
	const bound = (s) => new Promise((res) => s.bind(0, '127.0.0.1', () => res(s.address().port)))
	const consolePort = await bound(console_)
	const replyPort = await bound(dashboard)

	// Plays the console: runs nothing, only echoes the token as SendOSC would.
	console_.on('message', (buf) => {
		const d = decodeOsc(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
		const cmd = d.ok && d.message.address === `/${PREFIX}/cmd` ? d.message.args[0]?.value : null
		const token = typeof cmd === 'string' ? /^SendOSC 3 "\/ping,s,(\S+)"$/.exec(cmd)?.[1] : undefined
		if (token === undefined) return
		const reply = encodeOscString('/life/ping', token)
		if (reply.ok) console_.send(reply.bytes, replyPort, '127.0.0.1')
	})

	const t = createLinkTracker('udp1', Date.now())
	const answered = new Promise((resolve) => {
		dashboard.on('message', (buf) => {
			const d = decodeOsc(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
			if (!d.ok) return
			const r = readPing(d.message, PREFIX)
			if (r.ok) resolve({ reply: r.reply, answer: t.answer(r.reply.echo, Date.now()) })
		})
	})

	const token = t.send(Date.now())
	const out = encodeOscString(`/${PREFIX}/cmd`, pingCommand(token))
	assert.ok(out.ok)
	dashboard.send(out.bytes, consolePort, '127.0.0.1')

	const { reply, answer } = await answered
	assert.equal(reply.echo, token)
	assert.ok(answer.ok)
	assert.equal(t.link(Date.now()).state, 'live')

	console_.close()
	dashboard.close()
})
