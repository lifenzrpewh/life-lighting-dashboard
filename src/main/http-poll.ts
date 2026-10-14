// Asking a program on the booth network over HTTP, again and again: the
// countdown's sources (./timers.ts) and Arena's link (./arena.ts).
//
// One request at a time per source, never overlapping: a slow answer delays the
// next ask rather than stacking asks behind it.
//
// THE RULE THIS FILE ENFORCES: what reaches the Channel is what the program
// said. A request that times out is a timeout, a reply of the wrong shape is an
// error with what was wrong, and neither ever becomes a value.
//
// Stamped on the wall clock: the renderer ages by Date.now(), and these reads
// have no monotonic partner to drift from.

import type { Decoded } from '../bridge/ontime.js'
import type { Channel, ReadResult } from '../shared/reading.js'
import { record, unread } from '../shared/reading.js'

export type Fetched = { ok: true; body: unknown } | { ok: false; timeout: boolean; detail: string }

/** GET a JSON body, or say why not. A timeout is its own reason. */
export async function getJson(url: string, timeoutMs: number): Promise<Fetched> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
		if (!response.ok) return { ok: false, timeout: false, detail: `HTTP ${response.status}` }
		return { ok: true, body: await response.json() }
	} catch (e) {
		const name = (e as Error).name
		if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, timeout: true, detail: 'no answer' }
		const cause = (e as { cause?: { code?: string } }).cause?.code
		return { ok: false, timeout: false, detail: cause === 'ECONNREFUSED' ? 'nothing is listening there' : String(cause ?? (e as Error).message) }
	}
}

export type Polled<T> = { ok: true; decoded: Decoded<T> } | { ok: false; timeout: boolean; detail: string }

/** One source: ask, decode, record, wait, ask again. */
export function poll<T>(options: {
	/** Names the source in the log, `[<log>] <label> answering`. */
	log: string
	label: string
	every: number
	read: () => Promise<Polled<T>>
}): { channel(): Channel<T>; stop(): void } {
	let channel = unread<T>()
	let timer: ReturnType<typeof setTimeout> | null = null
	let stopped = false
	// Logged once per distinct fault, like channel A: a program that is closed
	// answers every poll the same way, and a line a second would bury the log.
	let lastFault: string | null = null

	const put = (result: ReadResult<T>) => {
		channel = record(channel, result)
		const fault = result.ok ? '' : result.reason === 'timeout' ? 'no answer' : result.detail
		if (fault !== lastFault) console.log(fault === '' ? `[${options.log}] ${options.label} answering` : `[${options.log}] ${options.label}: ${fault}`)
		lastFault = fault
	}

	const tick = async () => {
		// A read that throws is an error reading, and the next ask still comes:
		// before, it ended the loop for good, the source frozen on its last read.
		let outcome: Polled<T>
		try {
			outcome = await options.read()
		} catch (e) {
			outcome = { ok: false, timeout: false, detail: `the read failed: ${(e as Error)?.message ?? String(e)}` }
		}
		if (stopped) return
		const at = Date.now()
		if (!outcome.ok) put(outcome.timeout ? { ok: false, reason: 'timeout', at } : { ok: false, reason: 'error', at, detail: outcome.detail })
		else if (!outcome.decoded.ok) put({ ok: false, reason: 'error', at, detail: outcome.decoded.detail })
		else put({ ok: true, value: outcome.decoded.value, at })
		timer = setTimeout(() => void tick(), options.every)
		timer.unref?.()
	}
	void tick()

	return {
		channel: () => channel,
		stop() {
			stopped = true
			if (timer !== null) clearTimeout(timer)
		},
	}
}
