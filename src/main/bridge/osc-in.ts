// The socket for channels B and C. Main owns this; the renderer never sees a packet.
//
// WHY THIS EXISTS: `src/bridge/` decodes and coalesces, and is pure so it can be
// tested without a desk. This is the part that cannot be: a UDP socket, a bind
// that can fail, and a timer. Keeping them apart is why 16 tests cover the hard
// logic while this file stays small enough to read in one go.
//
// THE RULE THIS FILE ENFORCES: silence is reported as silence. This module says
// what it has heard and when, and nothing more — it never concludes the desk is
// gone. Channel B speaks only on change, so a quiet desk mid-sermon emits nothing
// for minutes and is perfectly healthy (docs/MA3_READ_MODEL.md § Channel B). The
// judgement about liveness belongs to whoever has a request/response loop to make
// it with; see `linkFromRequests` in src/shared/reading.ts.

import dgram from 'node:dgram'

import { decodeOsc, type OscMessage } from '../../bridge/osc.js'
import { readExecutorUpdate } from '../../bridge/channel-b.js'
import { createCoalescer } from '../../bridge/coalesce.js'
import type { DeskState, ExecutorLevel } from '../../shared/desk.js'

/** The Prefix of the console's OSC entry, as recorded in CLAUDE.md's working
 *  config. Not a setting: it is the name the setup asks the LD to type, and
 *  both channels check it. The port is a setting (src/shared/settings.ts)
 *  because it has to change when onPC shares this computer. */
export const OSC_PREFIX = 'life'

/** 10 Hz. Fast enough that a fader move reads as continuous to an eye 30 cm
 *  away, slow enough that the ~26/s channel B can produce cannot outrun it.
 *  Measured rather than guessed: 1221 packets drained to 267 frames at this
 *  rate on the desk, 2026-09-21. */
export const DRAIN_HZ = 10

export type ChannelBHandle = {
	/** Everything main knows from channel B, ready to hand to the renderer. */
	deskState: () => DeskState
	stop: () => void
}

export type ChannelBOptions = {
	port: number
	/** Listen on this address exactly, beside a program that holds the port on
	 *  every address. For onPC on this computer: see the bind below. */
	beside?: string
	prefix?: string
	drainHz?: number
	/** Called with the settled updates of one frame. Never called with an empty
	 *  set: a quiet desk should cost the renderer nothing at all. */
	onFrame?: (updates: ExecutorLevel[]) => void
	/** Every message that decoded, channel B and C alike, for the link: anything
	 *  the console says is proof it is there. Called before the channel B read,
	 *  so a message this file then rejects was still heard. */
	onMessage?: (message: OscMessage) => void
	/** Bind failure. EADDRINUSE usually means grandMA3 onPC is running on this
	 *  computer and holds the port; see the bind below for why that is loud. */
	onBindError?: (error: NodeJS.ErrnoException) => void
}

export function startChannelB(options: ChannelBOptions): ChannelBHandle {
	const port = options.port
	const prefix = options.prefix ?? OSC_PREFIX
	const drainHz = options.drainHz ?? DRAIN_HZ

	const coalescer = createCoalescer<ExecutorLevel>()
	// Insertion-ordered, so the renderer sees controls in the order the desk
	// first mentioned them rather than a set that reshuffles as faders move.
	const executors = new Map<string, ExecutorLevel>()

	let packets = 0
	let rejected = 0
	let lastHeardAt: number | null = null
	let listening = false

	// No `reuseAddr`, on purpose. On macOS libuv implements it as SO_REUSEPORT,
	// and measured on this project's Mac (2026-09-30): when both sockets set it,
	// the second bind SUCCEEDS and hears nothing, every packet going to the first
	// holder. So if onPC opens its port that way, a reusing listener would report
	// itself listening to a desk it can never hear. Without the option the bind
	// fails with EADDRINUSE whatever the other process did, and the screen says
	// "not bound" instead of "not heard yet".
	//
	// `beside` is the one exception, and a measured one (2026-09-30, onPC 2.3.2
	// on macOS). onPC holds every OSC row's port on all addresses, the rows that
	// only send included, so a reply row sending to 127.0.0.1:8004 leaves 8004
	// taken. A socket on 127.0.0.1:8004 EXACTLY can still bind beside it, with
	// the reuse option and only with it, and receives everything sent there,
	// because the more specific address wins. The silent failure reuse allows
	// is covered here by the link itself: if the echoes do not arrive, the link
	// stays unreachable, whatever this socket believes.
	// ⚠️ macOS only so far. Windows has its own rules for this; untried.
	const socket = dgram.createSocket({ type: 'udp4', reuseAddr: options.beside !== undefined })

	socket.on('listening', () => {
		listening = true
	})

	socket.on('message', (buf) => {
		packets += 1
		const at = Date.now()
		lastHeardAt = at

		// Node pools Buffers, so `buf.buffer` is usually a larger shared block.
		// The byteOffset/byteLength window is not optional — without it the
		// decoder reads whatever else happens to be sitting in the pool.
		const decoded = decodeOsc(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
		if (!decoded.ok) {
			rejected += 1
			return
		}
		options.onMessage?.(decoded.message)

		const read = readExecutorUpdate(decoded.message, prefix)
		if (!read.ok) {
			// `other-channel` is a channel C push sharing this port — expected
			// traffic, and counting it as a fault would make a healthy desk look
			// broken. Only a shape we should have understood counts as rejected.
			if (read.reason !== 'other-channel') rejected += 1
			return
		}

		coalescer.absorb(read.update.path, { ...read.update, at })
	})

	socket.on('error', (error: NodeJS.ErrnoException) => {
		// A bind that failed must not leave the app looking like a desk that went
		// quiet. `listening` stays false and the caller is told, so the two can be
		// told apart on screen.
		listening = false
		options.onBindError?.(error)
	})

	socket.bind(port, options.beside)

	const timer = setInterval(() => {
		const drained = coalescer.drain()
		if (drained.updates.length === 0) return
		for (const { key, value } of drained.updates) executors.set(key, value)
		options.onFrame?.(drained.updates.map((u) => u.value))
	}, Math.round(1000 / drainHz))

	// One fewer thing holding the event loop open during shutdown.
	timer.unref?.()

	return {
		deskState: () => ({
			executors: Array.from(executors.values()),
			lastHeardAt,
			packets,
			rejected,
			listening,
			port,
		}),
		stop: () => {
			clearInterval(timer)
			// close() throws if the socket never bound. Nothing useful can be done
			// about that during teardown, and letting it propagate would mask the
			// bind error that actually matters.
			try {
				socket.close()
			} catch {
				/* already closed, or never bound */
			}
		},
	}
}
