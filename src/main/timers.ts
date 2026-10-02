// The countdown chip's sources: OnTime and ProPresenter, asked over HTTP.
//
// WHY MAIN ASKS, NOT THE RENDERER: the renderer is sandboxed and owns no truth;
// main reads every source and the renderer ages what main says, as it does for
// the console. Both programs are on the booth network, so these are plain LAN
// requests, one at a time per program, never overlapping: a slow answer delays
// the next ask rather than stacking asks behind it.
//
// THE RULE THIS FILE ENFORCES: what reaches the Channel is what the program
// said. A request that times out is a timeout, a reply of the wrong shape is an
// error with what was wrong, and neither ever becomes a time.
//
// Stamped on the wall clock: the renderer ages and counts down by Date.now(),
// and these reads have no monotonic partner to drift from.

import { decodeOnTimePoll, type Decoded } from '../bridge/ontime.js'
import { decodeProPresenter } from '../bridge/propresenter.js'
import type { Channel, ReadResult } from '../shared/reading.js'
import { record, unread } from '../shared/reading.js'
import type { Settings } from '../shared/settings.js'
import {
	ONTIME_POLL_MS,
	PROPRESENTER_POLL_MS,
	TIMER_REQUEST_TIMEOUT_MS,
	type OnTimeNow,
	type ProPresenterNow,
	type TimerSources,
} from '../shared/timer.js'

export type TimersHandle = {
	/** The programs' channels. Which ProPresenter timer to follow is a setting
	 *  the caller adds, so naming one needs no restart and loses no reading. */
	sources(): Pick<TimerSources, 'ontime' | 'propresenter'>
	stop(): void
}

/** GET a JSON body, or say why not. A timeout is its own reason. */
async function getJson(url: string): Promise<{ ok: true; body: unknown } | { ok: false; timeout: boolean; detail: string }> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(TIMER_REQUEST_TIMEOUT_MS), cache: 'no-store' })
		if (!response.ok) return { ok: false, timeout: false, detail: `HTTP ${response.status}` }
		return { ok: true, body: await response.json() }
	} catch (e) {
		const name = (e as Error).name
		if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, timeout: true, detail: 'no answer' }
		const cause = (e as { cause?: { code?: string } }).cause?.code
		return { ok: false, timeout: false, detail: cause === 'ECONNREFUSED' ? 'nothing is listening there' : String(cause ?? (e as Error).message) }
	}
}

/** One source: ask, decode, record, wait, ask again. */
function poll<T>(options: {
	label: string
	every: number
	read: () => Promise<{ ok: true; decoded: Decoded<T> } | { ok: false; timeout: boolean; detail: string }>
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
		if (fault !== lastFault) console.log(fault === '' ? `[timers] ${options.label} answering` : `[timers] ${options.label}: ${fault}`)
		lastFault = fault
	}

	const tick = async () => {
		const outcome = await options.read()
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

export function startTimers(s: Settings): TimersHandle {
	const ontime =
		s.onTimeHost === null
			? null
			: poll<OnTimeNow>({
					label: 'OnTime',
					every: ONTIME_POLL_MS,
					read: async () => {
						const r = await getJson(`http://${s.onTimeHost}:${s.onTimePort}/api/poll`)
						return r.ok ? { ok: true, decoded: decodeOnTimePoll(r.body) } : r
					},
				})

	const propresenter =
		s.proPresenterHost === null || s.proPresenterPort === null
			? null
			: poll<ProPresenterNow>({
					label: 'ProPresenter',
					every: PROPRESENTER_POLL_MS,
					read: async () => {
						const base = `http://${s.proPresenterHost}:${s.proPresenterPort}/v1`
						const [timers, message] = await Promise.all([getJson(`${base}/timers/current`), getJson(`${base}/stage/message`)])
						if (!timers.ok) return timers
						if (!message.ok) return message
						return { ok: true, decoded: decodeProPresenter(timers.body, message.body) }
					},
				})

	return {
		sources: () => ({ ontime: ontime?.channel() ?? null, propresenter: propresenter?.channel() ?? null }),
		stop() {
			ontime?.stop()
			propresenter?.stop()
		},
	}
}
