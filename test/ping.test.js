import test from 'node:test'
import assert from 'node:assert/strict'
import dgram from 'node:dgram'

import { decodeOsc, encodeOscString } from '../dist/src/bridge/osc.js'
import { readPing } from '../dist/src/bridge/channel-c.js'
import {
	createPingTracker,
	pingCommand,
	PING_INTERVAL_MS,
	PING_TIMEOUT_MS,
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

test('the ping command is the plugin call, token last', () => {
	assert.equal(pingCommand('a1b2.3'), 'Call Plugin "LifeBridge" "ping a1b2.3"')
})

// --- channel C: the echo -----------------------------------------------------

const msg = (address, ...args) => ({ address, args })

test('an echo reads as the plugin writes it: version, bar, token', () => {
	const r = readPing(msg('/life/ping', { type: 's', value: '2.3.2.0|a1b2.3' }), 'life')
	assert.deepEqual(r, { ok: true, reply: { version: '2.3.2.0', echo: 'a1b2.3' } })
})

test('channel B and other channel C pushes are other-channel, not errors', () => {
	for (const address of ['/life/14.14.1.6.1005', '/life/probe/summary', '/companion/ping']) {
		assert.equal(readPing(msg(address, { type: 's', value: 'x|y' }), 'life').reason, 'other-channel', address)
	}
})

test('a doubled prefix is not a ping: that was the plugin addressing itself wrong', () => {
	// ✅ 2026-09-21: SendOSC prepends the Prefix, so a plugin that wrote
	// /life/ping arrived as /life/life/ping. Reading that as an echo would hide
	// the bug the plugin was fixed for.
	assert.equal(readPing(msg('/life/life/ping', { type: 's', value: 'v|t' }), 'life').reason, 'other-channel')
})

test('an echo of the wrong shape is refused', () => {
	assert.equal(readPing(msg('/life/ping', { type: 'i', value: 3 }), 'life').reason, 'bad-args')
	assert.equal(readPing(msg('/life/ping'), 'life').reason, 'bad-args')
	assert.equal(readPing(msg('/life/ping', { type: 's', value: 'no bar here' }), 'life').reason, 'bad-args')
})

// --- the tracker -------------------------------------------------------------

test('boot is unreachable, since boot', () => {
	const t = createPingTracker('s1', T0)
	assert.deepEqual(t.link(T0 + 500), { state: 'unreachable', since: T0 })
})

test('an answered ping makes the link live, with its round trip', () => {
	const t = createPingTracker('s1', T0)
	const token = t.send(T0)
	assert.deepEqual(t.answer(token, T0 + 12), { ok: true, roundTripMs: 12 })
	assert.deepEqual(t.link(T0 + 12), { state: 'live', roundTripMs: 12 })
})

test('an echo from another run, or never sent, matches nothing', () => {
	const t = createPingTracker('s1', T0)
	t.send(T0)
	for (const stray of ['s0.1', 's1.99', '', 's1.1 ']) {
		assert.equal(t.answer(stray, T0 + 5).ok, false, JSON.stringify(stray))
	}
	assert.equal(t.link(T0 + 5).state, 'unreachable')
	assert.equal(t.stats().unmatched, 4)
})

test('each token answers once', () => {
	const t = createPingTracker('s1', T0)
	const token = t.send(T0)
	assert.ok(t.answer(token, T0 + 5).ok)
	assert.equal(t.answer(token, T0 + 6).ok, false)
})

test('an answer after the timeout is ignored, and the ping counts as missed', () => {
	const t = createPingTracker('s1', T0)
	const token = t.send(T0)
	assert.equal(t.answer(token, T0 + PING_TIMEOUT_MS).ok, false)
	assert.equal(t.stats().misses, 1)
	assert.equal(t.link(T0 + PING_TIMEOUT_MS).state, 'unreachable', 'never answered, so still down since boot')
})

/** Ping every interval, answering none; return the time of the last send. */
function missFrom(t, start, count) {
	let at = start
	for (let i = 0; i < count; i += 1) {
		at = start + i * PING_INTERVAL_MS
		t.send(at)
	}
	return at
}

test('a live link survives two misses and goes down on the third, dated when it went', () => {
	const t = createPingTracker('s1', T0)
	t.answer(t.send(T0), T0 + 10)

	const start = T0 + PING_INTERVAL_MS
	const last = missFrom(t, start, UNANSWERED_BEFORE_UNREACHABLE)
	const thirdSentAt = start + (UNANSWERED_BEFORE_UNREACHABLE - 1) * PING_INTERVAL_MS
	assert.equal(last, thirdSentAt)

	const secondTimesOut = start + PING_INTERVAL_MS + PING_TIMEOUT_MS
	assert.equal(t.link(secondTimesOut).state, 'live', 'two misses is a slow desk, not a dead one')

	const down = t.link(thirdSentAt + PING_TIMEOUT_MS + 5_000)
	assert.deepEqual(down, { state: 'unreachable', since: thirdSentAt + PING_TIMEOUT_MS })
})

test('a desk that never answers stays down since boot, however long it is asked', () => {
	const t = createPingTracker('s1', T0)
	const last = missFrom(t, T0, 30)
	assert.deepEqual(t.link(last + PING_TIMEOUT_MS), { state: 'unreachable', since: T0 })
})

test('a desk that comes back is live again at once', () => {
	const t = createPingTracker('s1', T0)
	t.answer(t.send(T0), T0 + 10)
	const last = missFrom(t, T0 + PING_INTERVAL_MS, 5)
	assert.equal(t.link(last + PING_TIMEOUT_MS).state, 'unreachable')

	const back = last + PING_TIMEOUT_MS + 1
	t.answer(t.send(back), back + 7)
	assert.deepEqual(t.link(back + 7), { state: 'live', roundTripMs: 7 })
})

test('answering a later ping drops the earlier ones without counting them missed', () => {
	// All three inside one timeout, so none has expired on its own.
	const t = createPingTracker('s1', T0)
	t.send(T0)
	t.send(T0 + 300)
	const third = t.send(T0 + 600)
	t.answer(third, T0 + 603)
	assert.deepEqual(
		{ misses: t.stats().misses, outstanding: t.stats().outstanding },
		{ misses: 0, outstanding: 0 },
	)
	assert.equal(t.link(T0 + 10 * PING_TIMEOUT_MS).state, 'live', 'nothing left to time out')
})

test('outstanding pings stay bounded however long the desk is silent', () => {
	const t = createPingTracker('s1', T0)
	missFrom(t, T0, 3_600)
	assert.ok(t.stats().outstanding <= Math.ceil(PING_TIMEOUT_MS / PING_INTERVAL_MS) + 1, `${t.stats().outstanding} outstanding`)
})

test('a session that could break the command line is refused', () => {
	for (const bad of ['', 'a b', 'a"b', 'a.b', 'café']) {
		assert.throws(() => createPingTracker(bad, T0), JSON.stringify(bad))
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

	// Plays the console: runs nothing, only echoes the token as pingVerb would.
	console_.on('message', (buf) => {
		const d = decodeOsc(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
		const cmd = d.ok && d.message.address === `/${PREFIX}/cmd` ? d.message.args[0]?.value : null
		const token = typeof cmd === 'string' ? /^Call Plugin "LifeBridge" "ping (\S+)"$/.exec(cmd)?.[1] : undefined
		if (token === undefined) return
		const reply = encodeOscString('/life/ping', `stand-in|${token}`)
		if (reply.ok) console_.send(reply.bytes, replyPort, '127.0.0.1')
	})

	const t = createPingTracker('udp1', Date.now())
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
	assert.equal(reply.version, 'stand-in')
	assert.equal(reply.echo, token)
	assert.ok(answer.ok)
	assert.equal(t.link(Date.now()).state, 'live')

	console_.close()
	dashboard.close()
})
