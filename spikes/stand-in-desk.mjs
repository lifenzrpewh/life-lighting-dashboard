#!/usr/bin/env node
// A stand-in console for the link, for running the kiosk with no desk and no onPC.
//
// WHY THIS EXISTS: the ping round trip has three halves in main (the sender, the
// reply socket, the timer) that the unit tests cannot reach. This answers pings
// the way LifeBridge's `pingVerb` does, so the real app can be run end to end.
//
// ⚠️ IT IS NOT A DESK, and proves nothing about one. It answers the command
// string src/bridge/ping.ts sends, which is exactly the part still unverified on
// a console: a wrong `Call Plugin` syntax passes here and fails on the MA. It
// runs nothing else it is sent, and says so. Its echoes carry the version
// `stand-in`, so nothing downstream can mistake them for a console's.
//
// It holds the OSC port the way onPC does, so on one computer the dashboard
// needs a reply port of its own: the same setup onPC needs, rehearsed.
//
// Usage (after `npm run build`):
//   node spikes/stand-in-desk.mjs                       # console port 8003, replies to 127.0.0.1:8004
//   node spikes/stand-in-desk.mjs --silent-after 20     # stop answering after 20 s
//   node spikes/stand-in-desk.mjs --port 8003 --reply-port 8004 --reply-host 127.0.0.1

import dgram from 'node:dgram'
import process from 'node:process'

import { decodeOsc, encodeOscString } from '../dist/src/bridge/osc.js'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
	const i = argv.indexOf(`--${name}`)
	return i === -1 || argv[i + 1] === undefined ? fallback : argv[i + 1]
}

const PORT = Number(flag('port', 8003))
const REPLY_HOST = flag('reply-host', '127.0.0.1')
const REPLY_PORT = Number(flag('reply-port', 8004))
const SILENT_AFTER_S = flag('silent-after', null)
const PREFIX = 'life'
// The exact form src/bridge/ping.ts sends. Kept literal rather than imported so
// a change there fails here, where someone will notice, instead of passing.
const PING = /^Call Plugin "LifeBridge" "ping (\S+)"$/

const started = Date.now()
const silent = () => SILENT_AFTER_S !== null && Date.now() - started > Number(SILENT_AFTER_S) * 1000
let answered = 0
let lastSilentNote = 0

const sock = dgram.createSocket('udp4')

sock.on('message', (buf, from) => {
	const d = decodeOsc(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
	if (!d.ok) return console.log(`  ?? ${from.address}:${from.port} undecodable: ${d.detail}`)
	const cmd = d.message.address === `/${PREFIX}/cmd` ? d.message.args[0]?.value : undefined
	if (typeof cmd !== 'string') return console.log(`  -- ${d.message.address} (not a command; ignored)`)

	const token = PING.exec(cmd)?.[1]
	if (token === undefined) return console.log(`  -- ${JSON.stringify(cmd)} (a stand-in runs nothing; ignored)`)
	if (silent()) {
		if (Date.now() - lastSilentNote > 5000) console.log('  .. silent: pings arriving, none answered')
		lastSilentNote = Date.now()
		return
	}

	const reply = encodeOscString(`/${PREFIX}/ping`, `stand-in|${token}`)
	if (!reply.ok) return console.log(`  !! could not encode reply: ${reply.detail}`)
	sock.send(reply.bytes, REPLY_PORT, REPLY_HOST)
	answered += 1
	if (answered === 1 || answered % 10 === 0) console.log(`  <> ping ${token} answered (${answered} so far)`)
})

sock.on('error', (e) => {
	console.error(`stand-in could not listen on ${PORT}: ${e.message}`)
	if (e.code === 'EADDRINUSE') console.error('  Something already holds it: onPC, or another stand-in.')
	process.exit(1)
})

sock.bind(PORT, () => {
	console.log('STAND-IN DESK: not a console. Answers pings only; runs nothing.')
	console.log(`  commands in on  :${PORT}  (/${PREFIX}/cmd)`)
	console.log(`  echoes out to   ${REPLY_HOST}:${REPLY_PORT}  (/${PREFIX}/ping)`)
	if (SILENT_AFTER_S !== null) console.log(`  goes silent after ${SILENT_AFTER_S}s`)
	console.log('')
})

process.on('SIGINT', () => {
	console.log(`\nstand-in: answered ${answered} ping(s)`)
	process.exit(0)
})
