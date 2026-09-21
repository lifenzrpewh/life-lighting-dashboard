import test from 'node:test'
import assert from 'node:assert/strict'

import { decodeOsc } from '../dist/src/bridge/osc.js'
import { readExecutorUpdate } from '../dist/src/bridge/channel-b.js'
import { createCoalescer } from '../dist/src/bridge/coalesce.js'

// --- packet construction -----------------------------------------------------
//
// Built byte by byte rather than with an encoder, on purpose. If the test used an
// encoder of my own writing it would share any padding mistake with the decoder
// and both would agree on something wrong. The padding here is computed by hand
// from the OSC 1.0 rule (null terminator, then out to a multiple of 4) and the
// total length is asserted, so a padding bug fails loudly instead of cancelling.

function paddedString(str) {
	const bytes = Array.from(str, (c) => c.charCodeAt(0))
	bytes.push(0)
	while (bytes.length % 4 !== 0) bytes.push(0)
	return bytes
}

function int32(n) {
	const b = new Uint8Array(4)
	new DataView(b.buffer).setInt32(0, n, false)
	return Array.from(b)
}

function float32(n) {
	const b = new Uint8Array(4)
	new DataView(b.buffer).setFloat32(0, n, false)
	return Array.from(b)
}

/** The exact message shape captured off the desk on 2026-09-21. */
function faderPacket({ address = '/life/14.14.1.6.1005', control = 'FaderMaster', code = 3, value = 51.294 } = {}) {
	return new Uint8Array([
		...paddedString(address),
		...paddedString(',sif'),
		...paddedString(control),
		...int32(code),
		...float32(value),
	])
}

// --- decoder -----------------------------------------------------------------

test('the real desk packet decodes, and its padding is what OSC 1.0 says', () => {
	const packet = faderPacket()

	// 20-char address -> 21 with terminator -> 24 padded
	// 4-char tags     -> 5                  -> 8
	// 11-char string  -> 12                 -> 12 (already aligned)
	// int + float     -> 4 + 4
	assert.equal(packet.length, 24 + 8 + 12 + 4 + 4, 'hand-computed packet length')

	const result = decodeOsc(packet)
	assert.equal(result.ok, true)
	assert.equal(result.message.address, '/life/14.14.1.6.1005')
	assert.deepEqual(
		result.message.args.map((a) => a.type),
		['s', 'i', 'f'],
	)
	assert.equal(result.message.args[0].value, 'FaderMaster')
	assert.equal(result.message.args[1].value, 3)
	// float32 cannot hold 51.294 exactly; the round trip is what matters.
	assert.ok(Math.abs(result.message.args[2].value - 51.294) < 0.001)
})

test('a string argument landing exactly on a 4-byte boundary still gets a terminator', () => {
	// "abcd" is 4 bytes; the terminator forces a whole extra word of padding. Get
	// this wrong and every argument after it is read at the wrong offset.
	const packet = faderPacket({ control: 'abcd' })
	assert.equal(packet.length, 24 + 8 + 8 + 4 + 4)

	const result = decodeOsc(packet)
	assert.equal(result.ok, true)
	assert.equal(result.message.args[0].value, 'abcd')
	assert.equal(result.message.args[1].value, 3)
})

test('an unsupported type tag fails the WHOLE message, not just that argument', () => {
	// This is the rule the file exists for. A blob is sized by a length prefix we
	// do not read, so everything after it would be decoded at the wrong offset —
	// and would look like perfectly ordinary numbers.
	const packet = new Uint8Array([
		...paddedString('/life/14.14.1.6.1005'),
		...paddedString(',bf'),
		...int32(4),
		...float32(99.9),
	])

	const result = decodeOsc(packet)
	assert.equal(result.ok, false)
	assert.equal(result.reason, 'unsupported-type')
	assert.match(result.detail, /'b'/)
})

test('a truncated numeric argument is rejected rather than read short', () => {
	const full = faderPacket()
	const result = decodeOsc(full.slice(0, full.length - 2))
	assert.equal(result.ok, false)
	assert.equal(result.reason, 'malformed')
	assert.match(result.detail, /truncated f/)
})

test('an empty packet and a non-OSC payload both fail, with different reasons', () => {
	assert.equal(decodeOsc(new Uint8Array([])).reason, 'empty')

	// No leading slash: not an OSC address.
	const notOsc = new Uint8Array([...paddedString('hello'), ...paddedString(',i'), ...int32(1)])
	const result = decodeOsc(notOsc)
	assert.equal(result.ok, false)
	assert.equal(result.reason, 'malformed')
})

test('an address with no type tags is a legal message with no arguments', () => {
	const result = decodeOsc(new Uint8Array(paddedString('/life/ping')))
	assert.equal(result.ok, true)
	assert.deepEqual(result.message.args, [])
})

// --- channel B interpretation ------------------------------------------------

test('the desk message becomes an executor update, object taken from the last component', () => {
	const decoded = decodeOsc(faderPacket())
	const result = readExecutorUpdate(decoded.message, 'life')

	assert.equal(result.ok, true)
	assert.deepEqual(result.update, {
		path: '14.14.1.6.1005',
		object: 1005,
		control: 'FaderMaster',
		code: 3,
		value: result.update.value,
	})
	assert.ok(Math.abs(result.update.value - 51.294) < 0.001)
})

test('the level is carried through unscaled — not normalised to 0..1', () => {
	const decoded = decodeOsc(faderPacket({ value: 54.468 }))
	const result = readExecutorUpdate(decoded.message, 'life')
	assert.ok(result.update.value > 1, 'a percent must not be squashed into a fraction')
})

test('a channel C push is other-channel, not an error — they share one port', () => {
	const packet = new Uint8Array([...paddedString('/life/probe/summary'), ...paddedString(',s'), ...paddedString('27/30 passed')])
	const decoded = decodeOsc(packet)
	const result = readExecutorUpdate(decoded.message, 'life')

	assert.equal(result.ok, false)
	assert.equal(result.reason, 'other-channel')
})

test('another talker on the same port is ignored, because the prefix must match', () => {
	const decoded = decodeOsc(faderPacket({ address: '/qlab/14.14.1.6.1005' }))
	const result = readExecutorUpdate(decoded.message, 'life')

	assert.equal(result.ok, false)
	assert.equal(result.reason, 'other-channel')
})

test('an unrecognised argument shape is refused rather than read three-of-many', () => {
	const packet = new Uint8Array([
		...paddedString('/life/14.14.1.6.1005'),
		...paddedString(',sif'),
		...paddedString('FaderMaster'),
		...int32(3),
		...float32(50),
	])
	// Same bytes, but claim a shape we have never seen on a desk.
	const swapped = new Uint8Array(packet)
	swapped.set(paddedString(',sfi'), paddedString('/life/14.14.1.6.1005').length)

	const decoded = decodeOsc(swapped)
	const result = readExecutorUpdate(decoded.message, 'life')
	assert.equal(result.ok, false)
	assert.equal(result.reason, 'bad-args')
	assert.match(result.detail, /expected sif/)
})

// --- coalescer ---------------------------------------------------------------

test('newest wins per key, and the drain reports what it swallowed', () => {
	const c = createCoalescer()
	c.absorb('14.14.1.6.1005', 10)
	c.absorb('14.14.1.6.1005', 20)
	c.absorb('14.14.1.6.1005', 30)

	const drained = c.drain()
	assert.deepEqual(drained.updates, [{ key: '14.14.1.6.1005', value: 30 }])
	assert.equal(drained.absorbed, 3)
	assert.equal(drained.superseded, 2)
})

test('the last position of every fader survives — coalescing drops superseded, never unseen', () => {
	const c = createCoalescer()
	// Two controls interleaved, the shape the desk actually produces.
	for (let i = 1; i <= 100; i += 1) {
		c.absorb('a', i)
		c.absorb('b', i * 2)
	}

	const drained = c.drain()
	assert.equal(drained.absorbed, 200)
	assert.equal(drained.updates.length, 2)
	assert.deepEqual(drained.updates, [
		{ key: 'a', value: 100 },
		{ key: 'b', value: 200 },
	])
})

test('key order is the order first seen, so tiles do not reshuffle when a fader moves', () => {
	const c = createCoalescer()
	c.absorb('first', 1)
	c.absorb('second', 1)
	c.absorb('first', 2) // re-setting must not move it to the end

	assert.deepEqual(
		c.drain().updates.map((u) => u.key),
		['first', 'second'],
	)
})

test('draining resets, and a quiet desk drains empty rather than repeating itself', () => {
	const c = createCoalescer()
	c.absorb('a', 1)
	assert.equal(c.drain().updates.length, 1)

	const second = c.drain()
	assert.deepEqual(second.updates, [])
	assert.equal(second.absorbed, 0)
	assert.equal(second.superseded, 0)
	assert.equal(c.pending(), 0)
})

test('the capture that motivated this: 771 packets over two controls become 2 updates', () => {
	const c = createCoalescer()
	for (let i = 0; i < 771; i += 1) c.absorb(i % 2 === 0 ? '1004' : '1005', i)

	const drained = c.drain()
	assert.equal(drained.absorbed, 771)
	assert.equal(drained.updates.length, 2)
	assert.equal(drained.superseded, 769)
})
