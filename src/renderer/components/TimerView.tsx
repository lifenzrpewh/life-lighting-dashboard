// The Timer view (the owner, 2026-10-08, item 1): the countdown beside the
// clock, as a view any window can hold, as big as its window. Several tabs may
// show it.
//
// The same countdown as the chip, never another: it draws `timerFace`
// (./TimerChip.tsx), which follows `chooseTimer` (../../shared/timer.ts),
// OnTime while an event is running there, ProPresenter otherwise. No source of
// its own to pick (the plainest choice, 2026-10-08): two timers on one screen
// that could disagree would be read as one.
//
// READ-ONLY: it starts, stops and sends nothing. A countdown that cannot be
// read is said in words, never a number.

import { Timer } from 'lucide-react'

import { formatCountdown, type TimerSources } from '../../shared/timer.js'
import { Centered, Say } from './MaPane.js'
import { timerFace, useNow } from './TimerChip.js'
import { formatAge, staleContent, unknownWhy } from './vocabulary.js'

export function TimerView({ sources }: { sources: TimerSources | null | undefined }) {
	const now = useNow()
	if (sources === undefined || sources === null) {
		return (
			<Centered>
				<Say icon={Timer} head="Timer" body={window.life === undefined ? 'The countdown is shown only inside the kiosk.' : 'Not heard yet.'} />
			</Centered>
		)
	}
	const face = timerFace(sources, now)
	if (face === null) {
		return (
			<Centered>
				<Say icon={Timer} head="No countdown set up" body="OnTime or ProPresenter, in Settings, gives this view its countdown." />
			</Centered>
		)
	}
	// Nothing to count: said quietly, the way the bar now says nothing at all
	// (the owner, 2026-10-11), rather than a big `?`. Which program, and why,
	// stays in the words.
	if (face.idle) {
		const why = face.unknown ? `${face.source}: ${face.caption.replace(/^\? /, '')}` : `${face.source}: ${face.caption.toLowerCase()}`
		return (
			<Centered>
				<Say icon={Timer} head="No countdown running" body={`${why}.`} />
			</Centered>
		)
	}
	const digits = face.number ? (face.ms === null ? '–:––' : formatCountdown(face.ms)) : null
	// As big as the window lets it be: by its width for its length in figures,
	// and by its height, whichever is smaller (container units, so a window,
	// not the screen, sets the size).
	const big = digits === null ? null : `min(${Math.round(160 / Math.max(digits.length, 4))}cqw, 62cqh)`
	return (
		<div className="relative flex min-h-0 min-w-0 flex-1 bg-booth-bg p-6" style={{ containerType: 'size' }}>
			<div
				className={`flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-[2cqh] text-center ${face.ageMs !== null ? staleContent : ''} ${
					face.over ? 'text-overtime' : ''
				}`}
			>
				<span className={`flex max-w-full items-center gap-[1.5cqw] truncate text-[min(4.5cqw,7cqh)] ${face.over ? '' : 'text-booth-dim'}`}>
					<span className="font-medium">{face.source}</span>
					<span>·</span>
					<span className="truncate">{face.caption}</span>
					{face.extra !== null && <span className="rounded bg-booth-raise px-[1cqw] text-booth-ink">{face.extra}</span>}
				</span>
				{digits !== null && (
					<span style={{ fontSize: big ?? undefined }} className="leading-none font-medium tracking-tight tabular-nums">
						{digits}
					</span>
				)}
				{digits === null && face.text !== null && (
					<span className="max-w-full text-[min(7cqw,12cqh)] leading-tight font-medium break-words">{face.text}</span>
				)}
			</div>
			{/* Beside the picture, never instead of it: how old, and what OnTime is. */}
			<div className="pointer-events-none absolute right-[3cqw] bottom-[3cqh] flex flex-col items-end gap-1 text-[min(3cqw,5cqh)]">
				{face.ageMs !== null && <span className="text-state-stale">{formatAge(face.ageMs)}</span>}
				{face.note?.state === 'unknown' && <span className="text-booth-dim">OnTime ? {unknownWhy[face.note.why]}</span>}
				{face.note?.state === 'stale' && <span className="text-state-stale">OnTime {formatAge(face.note.ageMs)}</span>}
			</div>
		</div>
	)
}
