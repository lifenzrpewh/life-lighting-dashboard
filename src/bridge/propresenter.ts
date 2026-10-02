// ProPresenter's timers and stage message, off its REST API (7.9 and later).
//
// ✅ VERIFIED 2026-10-02 against ProPresenter 18.2 on Windows, from the shapes
// researched in openapi.propresenter.com:
// - `GET /v1/timers/current` → `[{ id: { uuid, name, index }, time, state }]`,
//   every timer whether running or not, `time` a string such as `00:03:38`.
//   Seen: running, stopped, and complete (a countdown that may not overrun
//   ends `00:00:00` complete). Not yet seen: overrunning, overran, and the
//   `-00:00:02` and `.00` forms; the spec's own example also says `overrun`,
//   so that is read as overrunning.
// - `GET /v1/stage/message` → a JSON string, `""` when no message is up.
// - `GET /v1/version` is 404 on 18.2. Nothing here depends on it.
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
	return { ok: true, value: { timers: read, message: text === '' ? null : text } }
}
