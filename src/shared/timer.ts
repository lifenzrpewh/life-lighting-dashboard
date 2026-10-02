// The countdown chip: what OnTime and ProPresenter say, and which one is shown.
//
// WHY THIS EXISTS: the booth wants one timer, the one counting to whatever comes
// next, without looking across the room at a stage screen. Two programs can
// know it. OnTime runs the service's rundown; ProPresenter runs its own timers
// and a stage message. The decoders are main-side (src/bridge/ontime.ts,
// src/bridge/propresenter.ts); the shapes and the choosing live here, because
// the renderer needs both.
//
// THE RULE THIS FILE ENFORCES: OnTime wins whenever it says an event is running,
// and only then. ProPresenter is shown otherwise, never beside it: one timer at
// a time (the owner's call, 2026-10-02). An OnTime that cannot be read, or has
// not been for a while, is not "no event running": ProPresenter is shown, and
// the chip says what OnTime is, because an event may be running there unseen.

import type { Channel, Reading, UnknownReason } from './reading.js'
import { readingOf } from './reading.js'

/** How often main asks each program. OnTime carries milliseconds and a
 *  playback state, so the renderer counts down between reads; ProPresenter
 *  sends a rounded string with no direction, so it is asked twice as often. */
export const ONTIME_POLL_MS = 1_000
export const PROPRESENTER_POLL_MS = 500

/** A request that has not answered in this long has failed. */
export const TIMER_REQUEST_TIMEOUT_MS = 1_500

/** A read older than this is STALE: three missed polls of the slower source. */
export const TIMER_STALE_AFTER_MS = 3 * ONTIME_POLL_MS

/** OnTime's own playback states (packages/types Playback.type.ts, v4). */
export type OnTimePlayback = 'play' | 'pause' | 'roll' | 'stop' | 'armed'

export type OnTimeNow = {
	playback: OnTimePlayback
	/** The running event's title, or null between events in roll. */
	nowTitle: string | null
	/** The event after it, or null at the end of the rundown. */
	nextTitle: string | null
	/** Milliseconds until the next thing starts, as of the read. Negative is
	 *  overtime. Null when OnTime has no timer to give. */
	remainingMs: number | null
}

/** True while OnTime has an event under way. A paused event is still under way:
 *  it is the one on stage. Stop and armed are not. */
export function onTimeRunning(now: OnTimeNow): boolean {
	return now.playback === 'play' || now.playback === 'pause' || now.playback === 'roll'
}

/** OnTime's countdown at `at`, from a read stamped `readAt`. Counted down only
 *  while the clock is actually running and the read is LIVE: a stale value is
 *  shown as it was said, with its age, never carried forward. */
export function onTimeRemaining(now: OnTimeNow, readAt: number, at: number, live: boolean): number | null {
	if (now.remainingMs === null) return null
	const ticking = live && (now.playback === 'play' || now.playback === 'roll')
	return ticking ? now.remainingMs - (at - readAt) : now.remainingMs
}

export type ProPresenterTimer = {
	name: string
	/** Signed whole seconds, as ProPresenter's string said (it rounds). */
	seconds: number
	state: 'stopped' | 'running' | 'complete' | 'overrunning' | 'overran'
}

export type ProPresenterNow = {
	/** Every timer ProPresenter has, in its own order. Which one the chip shows
	 *  is `proPresenterShown`'s call, so the settings panel can list them all. */
	timers: ProPresenterTimer[]
	/** The stage display message, or null when none is up. */
	message: string | null
}

/** What main hands the renderer. A source is null when settings name no
 *  address for it: not configured is a different fact from not answering. */
export type TimerSources = {
	ontime: Channel<OnTimeNow> | null
	propresenter: Channel<ProPresenterNow> | null
	/** The ProPresenter timer to follow, by name, from settings. Null: the
	 *  first one counting. */
	proPresenterTimer: string | null
}

/** A timer is worth showing while it is counting: running, or running over. */
export const counting = (t: ProPresenterTimer) => t.state === 'running' || t.state === 'overrunning'

/** Which ProPresenter timer the chip shows. A booth can have several timers
 *  running at once (a service countdown and a game timer, say), so the timer
 *  can be named in settings (the owner's call, 2026-10-02).
 *
 *  A named timer that ProPresenter does not have is `missing`, said as such. It
 *  never falls back to whichever timer happens to be running: a countdown to
 *  the wrong thing, shown under the right place, would be believed. */
export type ProPresenterShown =
	| { kind: 'timer'; timer: ProPresenterTimer }
	| { kind: 'idle' }
	| { kind: 'missing'; name: string }

export function proPresenterShown(now: ProPresenterNow, wanted: string | null): ProPresenterShown {
	if (wanted === null) {
		const first = now.timers.find(counting)
		return first === undefined ? { kind: 'idle' } : { kind: 'timer', timer: first }
	}
	const named = now.timers.find((t) => t.name === wanted)
	if (named === undefined) return { kind: 'missing', name: wanted }
	return counting(named) ? { kind: 'timer', timer: named } : { kind: 'idle' }
}

/** What the chip shows. */
export type TimerView =
	/** Neither program is set up: no chip at all. */
	| { kind: 'none' }
	| { kind: 'ontime'; reading: Reading<OnTimeNow>; readAt: number | null }
	| {
			kind: 'propresenter'
			reading: Reading<ProPresenterNow>
			/** The timer to follow, carried for `proPresenterShown`. */
			wanted: string | null
			/** What OnTime is, when it is not answering: null when it is not set
			 *  up, or is answering with nothing running. */
			ontimeAside: OnTimeAside
	  }

export type OnTimeAside = null | { state: 'stale'; ageMs: number } | { state: 'unknown'; why: UnknownReason }

/** The one place the choice is made. */
export function chooseTimer(sources: TimerSources, now: number): TimerView {
	const ontime = sources.ontime === null ? null : readingOf(sources.ontime, now, null, TIMER_STALE_AFTER_MS)
	const readAt = sources.ontime?.lastOk?.at ?? null

	if (ontime !== null && ontime.state !== 'unknown' && onTimeRunning(ontime.value)) {
		return { kind: 'ontime', reading: ontime, readAt }
	}
	if (sources.propresenter !== null) {
		return {
			kind: 'propresenter',
			reading: readingOf(sources.propresenter, now, null, TIMER_STALE_AFTER_MS),
			wanted: sources.proPresenterTimer,
			ontimeAside:
				ontime?.state === 'unknown'
					? { state: 'unknown', why: ontime.why }
					: ontime?.state === 'stale'
						? { state: 'stale', ageMs: ontime.ageMs }
						: null,
		}
	}
	if (ontime !== null) return { kind: 'ontime', reading: ontime, readAt }
	return { kind: 'none' }
}

/** A countdown as a person reads it: `4:05`, `1:02:30`, and overtime as `+0:12`.
 *  Rounded up while counting down, so 0:00 arrives when the time is actually up
 *  rather than a second early. */
export function formatCountdown(ms: number): string {
	const over = ms < 0
	const total = over ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000)
	const h = Math.floor(total / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = total % 60
	const ss = String(s).padStart(2, '0')
	const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
	return over ? `+${body}` : body
}
