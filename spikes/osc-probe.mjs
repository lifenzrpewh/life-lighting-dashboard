#!/usr/bin/env node
// Phase 0, spikes 1 and 3 — the write path and the listen port.
//
// Spike 1: does `/<prefix>/cmd` over OSC actually execute a command?
//   OSC_PROTOCOL.md marks this 🔬 RESEARCHED, never verified on a desk. The
//   dashboard's entire write path rests on it.
// Spike 3: can we bind a listen port for console feedback, and does the console
//   push anything back? On a machine also running onPC, onPC owns the OSC port.
//
// SAFETY: the default command is a no-op that changes nothing on the desk.
// Pass --cmd "..." to send your own. Never point this at a console running a
// service. Use a scratch show.
//
// Usage:
//   node spikes/osc-probe.mjs --host 192.168.1.50 --port 8000 --prefix life
//   node spikes/osc-probe.mjs --host 127.0.0.1 --cmd 'Go+ Sequence 9001'

import dgram from 'node:dgram'
import process from 'node:process'

const args = Object.fromEntries(
	process.argv.slice(2).reduce((acc, a, i, arr) => {
		if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] ?? 'true'])
		return acc
	}, []),
)

const HOST = args.host ?? '127.0.0.1'
const PORT = Number(args.port ?? 8000)
const PREFIX = (args.prefix ?? '').replace(/^\/+|\/+$/g, '')
const LISTEN = Number(args.listen ?? PORT)
const WAIT = Number(args.wait ?? 8)
// A command that is observable on the console's command line but mutates nothing.
const CMD = args.cmd ?? 'Help'

/** Minimal OSC 1.0 encoder. One string argument is all `/cmd` takes. */
function oscMessage(address, str) {
	const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))])
	return Buffer.concat([
		pad(Buffer.from(address, 'ascii')),
		pad(Buffer.from(',s', 'ascii')),
		pad(Buffer.from(str, 'ascii')),
	])
}

/** Enough of an OSC decoder to prove something came back. */
function describe(buf) {
	const end = buf.indexOf(0)
	const address = buf.subarray(0, end === -1 ? buf.length : end).toString('ascii')
	return `${address}  (${buf.length} bytes)  ${JSON.stringify(buf.toString('latin1').replace(/\0+/g, ' ').trim()).slice(0, 160)}`
}

const addr = PREFIX === '' ? '/cmd' : `/${PREFIX}/cmd`

console.log(`grandMA3 OSC probe`)
console.log(`  send    ${HOST}:${PORT}${addr}`)
console.log(`  listen  0.0.0.0:${LISTEN}`)
console.log(`  command ${JSON.stringify(CMD)}\n`)

if (PREFIX === '') {
	console.log('NOTE: no --prefix given. OSC_PROTOCOL.md records that grandMA3 runs a')
	console.log('      command only at /<prefix>/cmd — a bare /cmd with the wrong or')
	console.log('      missing prefix is SILENTLY IGNORED. If nothing happens, this is')
	console.log('      the first thing to check.\n')
}

let received = 0
const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })

sock.on('message', (buf, rinfo) => {
	received += 1
	console.log(`  <- ${rinfo.address}:${rinfo.port}  ${describe(buf)}`)
})

sock.on('error', (err) => {
	console.error(`\nLISTEN FAILED: ${err.message}`)
	if (err.code === 'EADDRINUSE') {
		console.error('  Port is already held. If grandMA3 onPC runs on this machine it owns')
		console.error('  the OSC port exclusively — actions will still work, feedback will not.')
		console.error('  That is spike 3: give the dashboard its own OSC entry and port.')
	}
	console.error('\n  Sending anyway (outbound does not need the bind).')
	send()
})

sock.on('listening', () => {
	console.log(`  bound ${LISTEN} OK — listening\n`)
	send()
})

function send() {
	const msg = oscMessage(addr, CMD)
	sock.send(msg, PORT, HOST, (err) => {
		if (err) {
			console.error(`  SEND FAILED: ${err.message}`)
			process.exit(1)
		}
		console.log(`  -> sent ${msg.length} bytes\n`)
		console.log(`  Watch the console's command line. Waiting ${WAIT}s for any OSC back...\n`)
		setTimeout(finish, WAIT * 1000)
	})
}

function finish() {
	console.log('\n--- RESULT ---')
	console.log('Spike 1 (write path) — PASS only if the command appeared on the console')
	console.log('  command line. UDP send success proves nothing: it is fire-and-forget.')
	console.log('  If nothing appeared, check in order:')
	console.log('    1. the OSC entry\'s Prefix matches --prefix')
	console.log('    2. "Receive Command" is ON in that OSC entry')
	console.log('    3. the entry\'s port matches --port')
	console.log(`Spike 3 (listen path) — ${received > 0 ? `PASS: ${received} message(s) received` : 'NO DATA received'}`)
	if (received === 0) {
		console.log('  No inbound OSC. Either the console has no OSC entry pointing back at')
		console.log('  this machine with Send enabled, or nothing changed while we waited.')
		console.log('  Try moving an executor fader during the wait window.')
	}
	sock.close()
}

try {
	sock.bind(LISTEN)
} catch {
	send()
}
