#!/usr/bin/env node
// Channel B, end to end, against a real desk — the decoder and coalescer the app
// will actually use, not a parallel implementation.
//
// WHY THIS EXISTS: `spikes/osc-probe.mjs` has its own inline decoder, which is
// right for a diagnostic that must work when everything else is broken. But that
// means a green probe says nothing about whether `src/bridge/` is correct. This
// imports the REAL modules out of dist/ and points them at the desk, so a pass
// here is a pass for the code that ships. The unit tests are ⚠️ until this runs;
// harness-green alone is not a desk observation.
//
// SAFETY: sends NOTHING. Binds a local port and listens. It cannot affect a desk.
//
// Usage:
//   npm run build && node spikes/channel-b-live.mjs --prefix life --listen 8003
//   node spikes/channel-b-live.mjs --prefix life --wait 30 --hz 10

import dgram from 'node:dgram'
import process from 'node:process'

import { decodeOsc } from '../dist/src/bridge/osc.js'
import { readExecutorUpdate } from '../dist/src/bridge/channel-b.js'
import { createCoalescer } from '../dist/src/bridge/coalesce.js'

const argv = process.argv.slice(2)
const args = {}
for (let i = 0; i < argv.length; i += 1) {
	const a = argv[i]
	if (!a.startsWith('--')) continue
	const next = argv[i + 1]
	args[a.slice(2)] = next !== undefined && !next.startsWith('-') ? next : true
}

if (args.help === true || args.h === true) {
	console.log(`channel B live check — decodes with src/bridge/, sends nothing

  --prefix <s>   OSC entry Prefix (default "life")
  --listen <n>   local port (default 8003)
  --wait <s>     seconds to listen (default 30)
  --hz <n>       coalescer drain rate (default 10)
`)
	process.exit(0)
}

const PREFIX = args.prefix ?? 'life'
const LISTEN = Number(args.listen ?? 8003)
const WAIT = Number(args.wait ?? 30)
const HZ = Number(args.hz ?? 10)

// Counted separately so a silent run can say WHICH kind of silence it was.
const tally = { packets: 0, undecodable: 0, otherChannel: 0, badShape: 0, updates: 0 }
const failures = []
const coalescer = createCoalescer()
let frames = 0
let framesWithWork = 0

// No reuseAddr: on macOS a reusing socket can bind "successfully" beside onPC
// and hear nothing (measured 2026-09-30, see src/main/bridge/osc-in.ts).
const sock = dgram.createSocket({ type: 'udp4' })

sock.on('message', (buf) => {
	tally.packets += 1

	// Node hands us a Buffer; the decoder takes a Uint8Array and must be given
	// this exact byte range, not the whole pooled allocation behind it.
	const decoded = decodeOsc(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
	if (!decoded.ok) {
		tally.undecodable += 1
		if (failures.length < 5) failures.push(`${decoded.reason}: ${decoded.detail}`)
		return
	}

	const read = readExecutorUpdate(decoded.message, PREFIX)
	if (!read.ok) {
		if (read.reason === 'other-channel') tally.otherChannel += 1
		else {
			tally.badShape += 1
			if (failures.length < 5) failures.push(`${read.reason}: ${read.detail}`)
		}
		return
	}

	tally.updates += 1
	coalescer.absorb(read.update.path, read.update)
})

sock.on('error', (err) => {
	console.error(`\nLISTEN FAILED: ${err.message}`)
	if (err.code === 'EADDRINUSE') {
		console.error('  Port already held — if onPC runs on this machine it owns the OSC port.')
	}
	process.exit(1)
})

sock.bind(LISTEN, () => {
	console.log('channel B live check')
	console.log(`  listen  0.0.0.0:${LISTEN}   prefix ${JSON.stringify(PREFIX)}`)
	console.log(`  drain   ${HZ} Hz for ${WAIT}s   (sending nothing)\n`)
	console.log('  Move an executor fader.\n')
})

// The drain loop is what main will do off a frame interval. Printing only the
// frames that carried something keeps a quiet desk quiet on screen — silence
// here is normal and is NOT evidence the desk is gone.
const timer = setInterval(() => {
	frames += 1
	const drained = coalescer.drain()
	if (drained.updates.length === 0) return

	framesWithWork += 1
	const line = drained.updates
		.map(({ value }) => `${value.object}=${value.value.toFixed(1)}`)
		.join('  ')
	console.log(`  [frame ${String(frames).padStart(3)}] ${line}   (${drained.absorbed} pkt -> ${drained.updates.length})`)
}, Math.round(1000 / HZ))

setTimeout(() => {
	clearInterval(timer)
	sock.close()

	const { packets, undecodable, otherChannel, badShape, updates } = tally
	console.log('\n--- RESULT ---')
	if (packets === 0) {
		console.log('NO DATA. Nothing arrived, which says nothing about the decoder.')
		console.log('  Check the OSC entry destination is THIS machine, Send is Yes, and')
		console.log('  that something actually moved. Call the plugin to prove the')
		console.log('  destination independently — see CLAUDE.md.')
		process.exit(0)
	}

	console.log(`packets           ${packets}`)
	console.log(`  channel B       ${updates}`)
	console.log(`  other channel   ${otherChannel}  (channel C pushes etc — expected, not errors)`)
	console.log(`  undecodable     ${undecodable}`)
	console.log(`  wrong shape     ${badShape}`)
	for (const f of failures) console.log(`      ${f}`)

	if (updates > 0) {
		const ratio = (updates / Math.max(framesWithWork, 1)).toFixed(1)
		console.log(`\ncoalescer         ${updates} updates -> ${framesWithWork} rendered frames (${ratio}x)`)
	}

	// A decoder that silently drops everything would otherwise read as a pass.
	const clean = undecodable === 0 && badShape === 0
	console.log(
		`\n${clean && updates > 0 ? 'PASS' : updates === 0 ? 'INCONCLUSIVE' : 'FAIL'}: ` +
			(updates === 0
				? 'packets arrived but none were channel B executor updates.'
				: clean
					? 'every packet decoded, and the shipped decoder read the real desk.'
					: 'some packets did not decode — see above.'),
	)
	process.exit(clean && updates > 0 ? 0 : 1)
}, WAIT * 1000)
