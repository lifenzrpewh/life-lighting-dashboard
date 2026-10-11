#!/usr/bin/env node
// A stand-in Arena for a computer without one (the Mac): enough of Arena 7.28's
// API for Pāua's Arena row, Holding and Settings › Holding to have something
// real-shaped to read. Read-only: it answers the product poll and sends one
// composition over the websocket on connect, and ignores everything sent to it.
//
//   node spikes/arena-stand-in.mjs [port] [composition.json]
//
// Defaults: port 8090, the OH2026 composition in test/fixtures, with the
// HOLDING group's columns given Central's names (PRE, POST, …, PROMO 1 to 6) so
// the Holding map has rows. Point Pāua's Arena setting at 127.0.0.1:<port>.
//
// The websocket is hand-rolled (the handshake and unmasked text frames out),
// because nothing in the repo serves one and a dependency for a spike is one
// too many.

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[2] ?? 8090)
const file = process.argv[3] ?? path.join(here, '..', 'test', 'fixtures', 'arena-composition-oh2026.json')
const composition = JSON.parse(fs.readFileSync(file, 'utf8'))

// Central's HOLDING names, as the owner named them on 2026-10-05.
const CENTRAL = ['PRE', 'POST', 'Column #', 'Column #', 'WTL', 'NSL', 'BIBLES', 'WTG', 'COUNTDOWN', 'Column #', 'PROMO 1', 'PROMO 2', 'PROMO 3', 'PROMO 4', 'PROMO 5', 'PROMO 6']
let id = 9_000_000_000
for (const g of composition.layergroups ?? []) {
	if (!/holding/i.test(g.name?.value ?? '') || (g.columns ?? []).length > 0) continue
	const count = composition.columns.length
	g.columns = CENTRAL.slice(0, count).map((name) => ({ id: id++, name: { id: id++, valuetype: 'ParamString', value: name } }))
}
const body = JSON.stringify(composition)

const server = http.createServer((req, res) => {
	if (req.url === '/api/v1/product') {
		res.writeHead(200, { 'content-type': 'application/json' })
		return res.end(JSON.stringify({ name: 'Arena (stand-in)', major: 7, minor: 28, micro: 0, revision: 0 }))
	}
	res.writeHead(404)
	res.end()
})

/** One unmasked text frame, any length. */
function frame(text) {
	const data = Buffer.from(text)
	const head =
		data.length < 126
			? Buffer.from([0x81, data.length])
			: data.length < 65536
				? Buffer.from([0x81, 126, data.length >> 8, data.length & 255])
				: (() => {
						const h = Buffer.alloc(10)
						h[0] = 0x81
						h[1] = 127
						h.writeBigUInt64BE(BigInt(data.length), 2)
						return h
					})()
	return Buffer.concat([head, data])
}

server.on('upgrade', (req, socket) => {
	const key = req.headers['sec-websocket-key']
	if (typeof key !== 'string') return socket.destroy()
	const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
	socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
	socket.write(frame(body))
	console.log(`[stand-in] a client connected; sent the composition (${body.length} bytes)`)
	// Whatever it sends (subscriptions) is read and dropped; a close frame ends it.
	socket.on('data', (d) => {
		if ((d[0] & 0x0f) === 0x8) socket.end()
	})
	socket.on('error', () => {})
})

server.listen(port, '127.0.0.1', () => console.log(`[stand-in] Arena on http://127.0.0.1:${port}/api/v1 (${path.basename(file)})`))
