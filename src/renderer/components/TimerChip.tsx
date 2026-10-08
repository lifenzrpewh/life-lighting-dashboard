// The countdown chip: the next event and the time to it, from OnTime while an
// event is running there, from ProPresenter otherwise. One at a time. Which one
// is chosen in src/shared/timer.ts, not here.
//
// READ-ONLY, like the rest of the status bar: it starts, stops and sends
// nothing to either program.

import { useEffect, useState } from 'react'

import { matchReading } from '../../shared/reading.js'
import {
	chooseTimer,
	formatCountdown,
	onTimeRunning,
	onTimeRemaining,
	proPresenterShown,
	type OnTimeAside,
	type OnTimeNow,
	type ProPresenterNow,
	type TimerSources,
} from '../../shared/timer.js'
import { formatAge, staleContent, stateClass, unknownWhy } from './vocabulary.js'

/** Finer than the status bar's one-second clock, so a countdown does not hold a
 *  number for nearly two seconds when its tick and the clock's fall apart. */
const TICK_MS = 250

export function useNow(): number {
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), TICK_MS)
		return () => clearInterval(id)
	}, [])
	return now
}

/** The bar's countdown (./StatusBar.tsx): the number big, and under it what
 *  it counts to, as a track's title sits over its artist (the 2026-10-08
 *  look). Folded, the two side by side on one line. Which program it is from
 *  is in its label, not on the bar: the caption says what matters. */
export function TimerChip({ sources, compact = false }: { sources: TimerSources | null; compact?: boolean }) {
	const now = useNow()
	if (sources === null) return null
	const face = timerFace(sources, now)
	if (face === null) return null
	return <BarFace face={face} compact={compact} />
}

/** What a countdown shows, whichever program it is from and however big it
 *  is drawn: the chip in the bar and the Timer view (./TimerView.tsx) both
 *  draw this, so they cannot disagree. */
export type TimerFace = {
	source: 'OnTime' | 'ProPresenter'
	/** What the number counts to, or why there is none. */
	caption: string
	/** The countdown in ms; null with `number` is a timer with no time to give. */
	ms: number | null
	/** Whether there is a countdown to draw at all. */
	number: boolean
	/** The stage message, where ProPresenter has no timer counting. */
	text: string | null
	over: boolean
	extra: string | null
	ageMs: number | null
	unknown: boolean
	/** What OnTime is, when it is not answering. */
	note: OnTimeAside
}

/** The face for `sources` at `now`, or null when neither program is set up. */
export function timerFace(sources: TimerSources, now: number): TimerFace | null {
	const view = chooseTimer(sources, now)
	const blank = { ms: null, number: false, text: null, over: false, extra: null, ageMs: null, unknown: false, note: null }
	switch (view.kind) {
		case 'none':
			return null
		case 'ontime': {
			const ontime = (value: OnTimeNow, live: boolean, ageMs: number | null): TimerFace => {
				if (!onTimeRunning(value)) return { ...blank, source: 'OnTime', caption: 'No event running', ageMs }
				const remaining = onTimeRemaining(value, view.readAt ?? now, now, live)
				// What the countdown is counting to: the next event, by name. At the end of
				// the rundown there is none, and it counts to the end of this one.
				const caption =
					value.nextTitle !== null
						? `Next: “${value.nextTitle || 'Untitled event'}”`
						: value.nowTitle !== null
							? `End of ${value.nowTitle || 'this event'}`
							: 'End of rundown'
				return {
					...blank,
					source: 'OnTime',
					caption,
					ms: remaining,
					number: true,
					over: remaining !== null && remaining < 0,
					extra: value.playback === 'pause' ? 'Paused' : null,
					ageMs,
				}
			}
			return matchReading(view.reading, {
				live: (v) => ontime(v, true, null),
				stale: (v, ageMs) => ontime(v, false, ageMs),
				unknown: (why) => ({ ...blank, source: 'OnTime', caption: `? ${unknownWhy[why]}`, unknown: true }),
			})
		}
		case 'propresenter': {
			const pro = (value: ProPresenterNow, ageMs: number | null): TimerFace => {
				const shown = proPresenterShown(value, view.wanted)
				if (shown.kind === 'timer') {
					const ms = shown.timer.seconds * 1000
					// The stage message labels the timer, `Wrap up: 3:38`, and the timer's
					// own name is never shown (the owner's call, 2026-10-02): the message
					// is what the stage is being told, the name is just ProPresenter's.
					return { ...blank, source: 'ProPresenter', caption: value.message ?? 'Timer', ms, number: true, over: ms < 0, ageMs, note: view.ontimeAside }
				}
				// Said, not hidden: the booth asked for this timer, and an empty chip
				// would read as "nothing running" when it is "renamed or deleted".
				const caption =
					shown.kind === 'missing' ? `No timer “${shown.name}” in ProPresenter` : value.message === null ? 'No timer running' : null
				return { ...blank, source: 'ProPresenter', caption: caption ?? 'Stage message', text: value.message, ageMs, note: view.ontimeAside }
			}
			return matchReading(view.reading, {
				live: (v) => pro(v, null),
				stale: (v, ageMs) => pro(v, ageMs),
				unknown: (why) => ({ ...blank, source: 'ProPresenter', caption: `? ${unknownWhy[why]}`, unknown: true, note: view.ontimeAside }),
			})
		}
	}
}

/** A countdown is a reading, not a control: no surface while live, so it can
 *  never be mistaken for a button. STALE and UNKNOWN take their outlines, and
 *  STALE dims the value and says its age at full strength. Red once it passes
 *  zero and counts up, from either program (the owner's call, 2026-10-02),
 *  with a small jump as it goes over, so it reads across the booth. */
function BarFace({ face, compact }: { face: TimerFace; compact: boolean }) {
	const stale = face.ageMs !== null
	const frame = face.unknown ? stateClass.unknown : stale ? stateClass.stale : stateClass.live
	const value = face.number ? (face.ms === null ? '–:––' : formatCountdown(face.ms)) : face.unknown ? '?' : null
	// The unknown caption begins with its own `?`; the number slot holds it.
	const caption = face.unknown ? `${face.source} ${face.caption.replace(/^\? /, '')}` : face.caption
	const aside =
		face.note?.state === 'unknown' ? (
			<span className="text-booth-dim">OnTime ? {unknownWhy[face.note.why]}</span>
		) : face.note?.state === 'stale' ? (
			<span className="text-state-stale">OnTime {formatAge(face.note.ageMs)}</span>
		) : null
	return (
		<span
			title={`${face.source} · ${face.caption}`}
			aria-label={`${face.source}: ${face.caption}${value === null ? '' : `, ${value}`}`}
			className={`flex min-w-0 rounded-ctl border-2 ${frame} ${face.over ? 'text-overtime' : ''} ${
				compact ? 'flex-row items-baseline gap-2 px-1.5' : 'flex-col items-end justify-center gap-1.5 px-2 py-0.5'
			}`}
		>
			{value !== null ? (
				<span
					key={String(face.over)}
					className={`leading-none font-extrabold tracking-tight tabular-nums ${face.over ? 'animate-over-pop' : ''} ${stale ? staleContent : ''} ${
						compact ? 'text-base' : 'text-[26px]'
					}`}
				>
					{value}
				</span>
			) : face.text !== null ? (
				<span className={`max-w-[20rem] truncate leading-none font-extrabold ${stale ? staleContent : ''} ${compact ? 'text-sm' : 'text-lg'}`}>{face.text}</span>
			) : null}
			<span className={`flex max-w-[22rem] min-w-0 items-baseline gap-1.5 leading-none whitespace-nowrap ${compact ? 'text-xs' : 'text-[12.5px]'}`}>
				<span className={`truncate font-medium ${face.over ? '' : 'text-booth-dim'} ${value === null && face.text === null && !compact ? 'text-sm' : ''}`}>
					{face.extra !== null && <span className="mr-1.5 rounded-ctl bg-booth-raise px-1.5 text-booth-ink">{face.extra}</span>}
					{caption}
				</span>
				{stale && <span className="font-bold text-state-stale">{formatAge(face.ageMs!)}</span>}
				{aside}
			</span>
		</span>
	)
}
