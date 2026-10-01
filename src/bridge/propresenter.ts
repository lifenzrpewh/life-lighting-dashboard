// ProPresenter's timers and stage message, off its REST API (7.9 and later).
//
// 🔬 RESEARCHED 2026-10-02 against openapi.propresenter.com, not yet against a
// running ProPresenter:
// - `GET /v1/timers/current` → `[{ id: { uuid, name, index }, time, state }]`,
//   `time` a string such as `00:05:00`, `-00:00:02` or `00:00:01.00`, `state`
//   one of stopped, running, complete, overrunning, overran. The spec's own
//   example also says `overrun`, so that is read as overrunning.
// - `GET /v1/stage/message` → a JSON string, `""` when no message is up.
//
// THE RULE THIS FILE ENFORCES: as in ./ontime.ts, a reply of the wrong shape
// fails whole. A time string that does not parse fails the read; it is never
// shown as zero, and never shown raw as if it had been understood.

import type { ProPresenterNow, ProPresenterTimer } from '../shared/timer.js'
import type { Decoded } from './ontime.js'

const STATES: Record<string, ProPresenterTimer['state']> = {
	stopped: 'stopped',
	running: 'running',
	complete: 'complete',
	overrunning: 'overrunning',
	overrun: 'overrunning',
	overran: 'overran',
}

/** `HH:MM:SS`, optionally signed and with a fraction, as whole seconds.
 *  Truncated toward zero, the way ProPresenter itself shows it. */
export function parseProPresenterTime(text: string): number | null {
	const m = /^(-)?(\d+):([0-5]\d):([0-5]\d)(?:\.\d+)?$/.exec(text.trim())
	if (m === null) return null
	const seconds = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4])
	return m[1] === '-' ? -seconds : seconds
}

/** A timer is worth showing while it is counting: running, or running over. */
const counting = (t: ProPresenterTimer) => t.state === 'running' || t.state === 'overrunning'

export function decodeProPresenter(timers: unknown, message: unknown): Decoded<ProPresenterNow> {
	if (!Array.isArray(timers)) return { ok: false, detail: 'the timers reply is not a list' }
	const read: ProPresenterTimer[] = []
	for (const raw of timers) {
		if (typeof raw !== 'object' || raw === null) return { ok: false, detail: 'a timer is not an object' }
		const { id, time, state } = raw as Record<string, unknown>
		const name = typeof id === 'object' && id !== null ? (id as Record<string, unknown>)['name'] : undefined
		if (typeof name !== 'string') return { ok: false, detail: 'a timer has no name' }
		if (typeof time !== 'string') return { ok: false, detail: `timer "${name}" has no time` }
		const seconds = parseProPresenterTime(time)
		if (seconds === null) return { ok: false, detail: `timer "${name}" reads ${JSON.stringify(time)}` }
		const known = typeof state === 'string' ? STATES[state] : undefined
		if (known === undefined) return { ok: false, detail: `timer "${name}" is ${JSON.stringify(state)}` }
		read.push({ name: name.trim(), seconds, state: known })
	}
	if (typeof message !== 'string') return { ok: false, detail: 'the stage message is not text' }
	const text = message.trim()
	return { ok: true, value: { timer: read.find(counting) ?? null, message: text === '' ? null : text } }
}
