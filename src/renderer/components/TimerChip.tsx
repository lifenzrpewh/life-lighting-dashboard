// The countdown chip: the next event and the time to it, from OnTime while an
// event is running there, from ProPresenter otherwise. One at a time. Which one
// is chosen in src/shared/timer.ts, not here.
//
// READ-ONLY, like the rest of the status bar: it starts, stops and sends
// nothing to either program.

import { useEffect, useState, type ReactNode } from 'react'

import { matchReading } from '../../shared/reading.js'
import {
	chooseTimer,
	formatCountdown,
	onTimeRunning,
	onTimeRemaining,
	type OnTimeAside,
	type OnTimeNow,
	type ProPresenterNow,
	type TimerSources,
} from '../../shared/timer.js'
import { Unknown, chip, chipLabel, formatAge, staleContent, stateClass, unknownWhy } from './vocabulary.js'

/** Finer than the status bar's one-second clock, so a countdown does not hold a
 *  number for nearly two seconds when its tick and the clock's fall apart. */
const TICK_MS = 250

function useNow(): number {
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), TICK_MS)
		return () => clearInterval(id)
	}, [])
	return now
}

export function TimerChip({ sources }: { sources: TimerSources | null }) {
	const now = useNow()
	if (sources === null) return null
	const view = chooseTimer(sources, now)

	switch (view.kind) {
		case 'none':
			return null
		case 'ontime':
			return matchReading(view.reading, {
				live: (v) => <OnTime value={v} remaining={onTimeRemaining(v, view.readAt ?? now, now, true)} ageMs={null} />,
				stale: (v, ageMs) => <OnTime value={v} remaining={onTimeRemaining(v, view.readAt ?? now, now, false)} ageMs={ageMs} />,
				unknown: (why) => (
					<Frame source="OnTime" ageMs={null} unknown>
						<Unknown why={why} />
					</Frame>
				),
			})
		case 'propresenter':
			return matchReading(view.reading, {
				live: (v) => <ProPresenter value={v} ageMs={null} ontime={view.ontimeAside} />,
				stale: (v, ageMs) => <ProPresenter value={v} ageMs={ageMs} ontime={view.ontimeAside} />,
				unknown: (why) => (
					<Frame source="ProPresenter" ageMs={null} unknown note={view.ontimeAside}>
						<Unknown why={why} />
					</Frame>
				),
			})
	}
}

function OnTime({ value, remaining, ageMs }: { value: OnTimeNow; remaining: number | null; ageMs: number | null }) {
	if (!onTimeRunning(value)) {
		return (
			<Frame source="OnTime" ageMs={ageMs}>
				<span className="text-sm text-booth-dim">no event running</span>
			</Frame>
		)
	}
	// What the countdown is counting to: the next event, by name. At the end of
	// the rundown there is none, and it counts to the end of this one.
	const label =
		value.nextTitle !== null
			? value.nextTitle || 'Untitled event'
			: value.nowTitle !== null
				? `End of ${value.nowTitle || 'this event'}`
				: 'End of rundown'
	return (
		<Frame source="OnTime" ageMs={ageMs}>
			<Countdown label={label} ms={remaining} />
			{value.playback === 'pause' && <span className="text-xs tracking-widest text-booth-dim">PAUSED</span>}
		</Frame>
	)
}

function ProPresenter({ value, ageMs, ontime }: { value: ProPresenterNow; ageMs: number | null; ontime: OnTimeAside }) {
	return (
		<Frame source="ProPresenter" ageMs={ageMs} note={ontime}>
			{value.timer !== null && <Countdown label={value.timer.name || 'Timer'} ms={value.timer.seconds * 1000} />}
			{value.message !== null && <span className="max-w-[24rem] truncate text-sm">{value.message}</span>}
			{value.timer === null && value.message === null && <span className="text-sm text-booth-dim">no timer running</span>}
		</Frame>
	)
}

function Countdown({ label, ms }: { label: string; ms: number | null }) {
	return (
		<span className="flex min-w-0 items-baseline gap-3">
			<span className="max-w-[20rem] truncate text-sm">{label}</span>
			<span className="text-2xl font-medium tabular-nums">{ms === null ? '–:––' : formatCountdown(ms)}</span>
		</span>
	)
}

function Frame({
	source,
	ageMs,
	unknown = false,
	note = null,
	children,
}: {
	source: 'OnTime' | 'ProPresenter'
	ageMs: number | null
	unknown?: boolean
	/** What OnTime is, when it is not answering. */
	note?: OnTimeAside
	children: ReactNode
}) {
	const stale = ageMs !== null
	const frame = unknown ? stateClass.unknown : stale ? stateClass.stale : stateClass.live
	return (
		<span className={`${chip} ${frame}`}>
			<span className={chipLabel}>{source}</span>
			<span className={`flex min-w-0 items-center gap-3 ${stale ? staleContent : ''}`}>{children}</span>
			{stale && <span className="text-xs whitespace-nowrap text-state-stale">{formatAge(ageMs)}</span>}
			{/* An event may be running in OnTime that nobody can see: said here,
			    beside the ProPresenter timer standing in for it. */}
			{note?.state === 'unknown' && (
				<span className="text-xs whitespace-nowrap text-booth-dim">OnTime ? {unknownWhy[note.why]}</span>
			)}
			{note?.state === 'stale' && (
				<span className="text-xs whitespace-nowrap text-state-stale">OnTime {formatAge(note.ageMs)}</span>
			)}
		</span>
	)
}
