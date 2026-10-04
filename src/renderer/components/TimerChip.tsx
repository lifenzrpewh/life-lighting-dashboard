// The countdown chip: the next event and the time to it, from OnTime while an
// event is running there, from ProPresenter otherwise. One at a time. Which one
// is chosen in src/shared/timer.ts, not here.
//
// READ-ONLY, like the rest of the status bar: it starts, stops and sends
// nothing to either program.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

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

function useNow(): number {
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), TICK_MS)
		return () => clearInterval(id)
	}, [])
	return now
}

/** The collapsed bar's chip: one line, no frame's padding, the number small. */
const Compact = createContext(false)

export function TimerChip({ sources, compact = false }: { sources: TimerSources | null; compact?: boolean }) {
	return (
		<Compact.Provider value={compact}>
			<Chosen sources={sources} />
		</Compact.Provider>
	)
}

function Chosen({ sources }: { sources: TimerSources | null }) {
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
					<Frame source="OnTime" ageMs={null} unknown caption={`? ${unknownWhy[why]}`}>
						{null}
					</Frame>
				),
			})
		case 'propresenter':
			return matchReading(view.reading, {
				live: (v) => <ProPresenter value={v} wanted={view.wanted} ageMs={null} ontime={view.ontimeAside} />,
				stale: (v, ageMs) => <ProPresenter value={v} wanted={view.wanted} ageMs={ageMs} ontime={view.ontimeAside} />,
				unknown: (why) => (
					<Frame source="ProPresenter" ageMs={null} unknown note={view.ontimeAside} caption={`? ${unknownWhy[why]}`}>
						{null}
					</Frame>
				),
			})
	}
}

function OnTime({ value, remaining, ageMs }: { value: OnTimeNow; remaining: number | null; ageMs: number | null }) {
	if (!onTimeRunning(value)) {
		return (
			<Frame source="OnTime" ageMs={ageMs} caption="No event running">
				{null}
			</Frame>
		)
	}
	// What the countdown is counting to: the next event, by name. At the end of
	// the rundown there is none, and it counts to the end of this one.
	const label =
		value.nextTitle !== null
			? `Next: “${value.nextTitle || 'Untitled event'}”`
			: value.nowTitle !== null
				? `End of ${value.nowTitle || 'this event'}`
				: 'End of rundown'
	const over = remaining !== null && remaining < 0
	return (
		<Frame source="OnTime" ageMs={ageMs} caption={label} over={over} extra={value.playback === 'pause' ? 'Paused' : null}>
			<Big ms={remaining} />
		</Frame>
	)
}

function ProPresenter({
	value,
	wanted,
	ageMs,
	ontime,
}: {
	value: ProPresenterNow
	wanted: string | null
	ageMs: number | null
	ontime: OnTimeAside
}) {
	const shown = proPresenterShown(value, wanted)
	if (shown.kind === 'timer') {
		const ms = shown.timer.seconds * 1000
		// The stage message labels the timer, `Wrap up: 3:38`, and the timer's
		// own name is never shown (the owner's call, 2026-10-02): the message
		// is what the stage is being told, the name is just ProPresenter's.
		return (
			<Frame source="ProPresenter" ageMs={ageMs} note={ontime} caption={value.message ?? 'Timer'} over={ms < 0}>
				<Big ms={ms} />
			</Frame>
		)
	}
	// Said, not hidden: the booth asked for this timer, and an empty chip
	// would read as "nothing running" when it is "renamed or deleted".
	const caption =
		shown.kind === 'missing' ? `No timer “${shown.name}” in ProPresenter` : value.message === null ? 'No timer running' : null
	return (
		<Frame source="ProPresenter" ageMs={ageMs} note={ontime} caption={caption ?? 'Stage message'}>
			{value.message !== null && <span className="max-w-[24rem] truncate text-base">{value.message}</span>}
		</Frame>
	)
}

/** The number, big. Red once it passes zero and counts up, from either
 *  program (the owner's call, 2026-10-02), with its caption, so it reads
 *  across the booth. Zero itself is not yet over. */
function Big({ ms }: { ms: number | null }) {
	const compact = useContext(Compact)
	return <span className={`${compact ? 'text-base' : 'text-[26px]'} leading-none font-medium tracking-tight tabular-nums`}>{ms === null ? '–:––' : formatCountdown(ms)}</span>
}

/** A countdown is a reading, not a control: no surface while live, so it can
 *  never be mistaken for a button. STALE and UNKNOWN take their outlines. */
function Frame({
	source,
	ageMs,
	caption,
	unknown = false,
	over = false,
	extra = null,
	note = null,
	children,
}: {
	source: 'OnTime' | 'ProPresenter'
	ageMs: number | null
	/** What the number counts to, or why there is none. */
	caption: string
	unknown?: boolean
	over?: boolean
	extra?: string | null
	/** What OnTime is, when it is not answering. */
	note?: OnTimeAside
	children: ReactNode
}) {
	const compact = useContext(Compact)
	const stale = ageMs !== null
	const frame = unknown ? stateClass.unknown : stale ? stateClass.stale : stateClass.live
	// Nothing to count: one line, quieter, so an idle or silent program does
	// not take the room a running countdown would.
	const quiet = children === null || children === undefined || children === false
	return (
		// Caption and number side by side (2026-10-05, the owner: the bar "seems
		// to take A LOT of screen space"), so the chip is one line high.
		<span className={`flex min-w-0 items-center gap-3 rounded-lg border ${compact ? 'h-7 px-2' : 'h-11 px-3'} ${frame} ${over ? 'text-overtime' : ''}`}>
			<span className={`flex min-w-0 items-center gap-3 ${stale ? staleContent : ''}`}>
				<span className={`flex max-w-[22rem] items-center gap-1.5 truncate ${quiet && !compact ? 'text-sm' : 'text-xs'} ${over ? '' : 'text-booth-dim'}`}>
					<span className="font-medium">{source}</span>
					<span>·</span>
					<span className="truncate">{caption}</span>
					{extra !== null && <span className="rounded bg-booth-raise px-1.5 text-booth-ink">{extra}</span>}
				</span>
				{children}
			</span>
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
