// OnTime's runtime state, off its HTTP API: `GET /api/poll`.
//
// 🔬 RESEARCHED 2026-10-02 against cpvalente/ontime master (v4.14.0), not yet
// against a running OnTime: the reply is `{ payload: RuntimeStore }`
// (apps/server/src/api-integration/integration.controller.ts), whose shape is
// packages/types/src/definitions/runtime/RuntimeStore.type.ts. The fields read
// here are in v3 too.
//
// Which number is "time to the next event":
// - an event is running (play, pause, or roll with one loaded): `timer.current`,
//   what is left of it, so the next one starts when it reaches zero.
// - roll, between events: `timer.secondaryTimer`, which OnTime documents as
//   "used to count to an event start in roll mode".
//
// THE RULE THIS FILE ENFORCES: a reply that is not the shape above fails whole,
// with what was wrong. Nothing here defaults a missing field into a time: a
// countdown that reads 0:00 because a field was absent would be believed.

import type { OnTimeNow, OnTimePlayback } from '../shared/timer.js'

export type Decoded<T> = { ok: true; value: T } | { ok: false; detail: string }

const PLAYBACKS: readonly OnTimePlayback[] = ['play', 'pause', 'roll', 'stop', 'armed']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const msOrNull = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v))

/** An event's title, or null for no event. An event with a blank title is still
 *  an event, so it comes back as '' and the chip names it as untitled. */
function titleOf(event: unknown, field: string): Decoded<string | null> {
	if (event === null || event === undefined) return { ok: true, value: null }
	if (!isObject(event)) return { ok: false, detail: `${field} is not an event` }
	const title = event['title']
	if (typeof title !== 'string') return { ok: false, detail: `${field} has no title` }
	return { ok: true, value: title.trim() }
}

export function decodeOnTimePoll(body: unknown): Decoded<OnTimeNow> {
	if (!isObject(body) || !isObject(body['payload'])) return { ok: false, detail: 'not an OnTime poll reply' }
	const store = body['payload']
	const timer = store['timer']
	if (!isObject(timer)) return { ok: false, detail: 'the reply has no timer' }

	const playback = timer['playback']
	if (typeof playback !== 'string' || !(PLAYBACKS as readonly string[]).includes(playback)) {
		return { ok: false, detail: `unknown playback ${JSON.stringify(playback)}` }
	}
	const current = timer['current']
	const secondary = timer['secondaryTimer'] ?? null
	if (!msOrNull(current) || !msOrNull(secondary)) return { ok: false, detail: 'the timer is not in milliseconds' }

	const now = titleOf(store['eventNow'], 'eventNow')
	if (!now.ok) return now
	const next = titleOf(store['eventNext'], 'eventNext')
	if (!next.ok) return next

	const between = playback === 'roll' && now.value === null
	return {
		ok: true,
		value: {
			playback: playback as OnTimePlayback,
			nowTitle: now.value,
			nextTitle: next.value,
			remainingMs: between ? secondary : current,
		},
	}
}
