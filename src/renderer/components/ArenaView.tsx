// What Arena is playing (docs/VISUALS_DASHBOARD.md, piece 2), as a view a slot
// can hold: each layer, the clip connected on it, the time it has left, its
// fader and bypass, under its layer group, with the deck and the composition
// master above.
//
// The time left is real time, at the clip's speed × its group's × the
// composition's (../../shared/arena.ts `clipTime`). The owner's answers,
// 2026-10-03: one on every layer, not one chip for the booth; a loop counts to
// its loop point; a Play Once & Hold clip at its end reads 0:00, held.
//
// Layers run top to bottom as Arena's own layer panel does: the highest layer
// first, layer 1 last. Arena's composition lists them the other way round
// (layer 1 is `/composition/layers/1`), so they are reversed here, and an Arena
// operator reads the same stack in both places.
//
// The status comes from main, where the websocket is (src/main/arena.ts),
// in the four states like everything else: STALE dims the board and says how
// old it is, and an Arena not answering is said in the slot, never drawn as an
// empty composition.

import { useState, type ReactNode } from 'react'

import {
	ARENA_STALE_AFTER_MS,
	clipTime,
	formatClipTime,
	missingMedia,
	thumbnailUrl,
	type ArenaClip,
	type ArenaGroup,
	type ArenaLayer,
	type ArenaStatus,
} from '../../shared/arena.js'
import { matchReading, readingOf, type Channel } from '../../shared/reading.js'
import { Say } from './MaPane.js'
import { Centered } from './Slot.js'
import { chipLabel, formatAge, staleContent, unknownWhy } from './vocabulary.js'

export function ArenaView({ status, now }: { status: Channel<ArenaStatus> | null | undefined; now: number }) {
	return <ArenaReading status={status} now={now} render={(s, ageMs, failure) => <Board status={s} ageMs={ageMs} failure={failure} />} />
}

/** Arena's status in its four states, for any view drawn from it: not heard,
 *  not set up and not answering are said in the slot, and a status is drawn
 *  only live or stale (with its age and the newest failure). */
export function ArenaReading({
	status,
	now,
	render,
}: {
	status: Channel<ArenaStatus> | null | undefined
	now: number
	render: (status: ArenaStatus, ageMs: number | null, failure: string | null) => ReactNode
}) {
	if (status === undefined) {
		return (
			<Centered>
				<Say head="Arena" body={window.life === undefined ? 'Arena is shown only inside the kiosk.' : 'Not heard yet.'} />
			</Centered>
		)
	}
	if (status === null) {
		return (
			<Centered>
				<Say head="No Arena set up" body="Set Arena's address in Connections, in operator mode." />
			</Centered>
		)
	}
	const latest = status.latest
	const failure = latest !== null && !latest.ok && latest.reason === 'error' ? latest.detail : null
	return matchReading(readingOf(status, now, null, ARENA_STALE_AFTER_MS), {
		live: (s) => render(s, null, null),
		stale: (s, ageMs) => render(s, ageMs, failure),
		unknown: (why) => (
			<Centered>
				<Say
					head="Arena not answering"
					body={`${failure ?? unknownWhy[why]}. Is Arena open, with its web server on (Preferences › Web Server)?`}
				/>
			</Centered>
		),
	})
}

type Section = { group: ArenaGroup | null; layers: ArenaLayer[] }

/** Top of the stack first, a new section wherever the group changes. */
function sectionsOf(status: ArenaStatus): Section[] {
	const sections: Section[] = []
	for (const layer of [...status.layers].reverse()) {
		const last = sections.at(-1)
		if (last !== undefined && (last.group?.name ?? null) === layer.group) last.layers.push(layer)
		else sections.push({ group: status.groups.find((g) => g.name === layer.group) ?? null, layers: [layer] })
	}
	return sections
}

function Board({ status, ageMs, failure }: { status: ArenaStatus; ageMs: number | null; failure: string | null }) {
	const stale = ageMs !== null
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="flex h-11 shrink-0 items-center gap-3 border-b border-booth-edge px-4 text-sm">
				<span className={`flex min-w-0 items-center gap-3 ${stale ? staleContent : ''}`}>
					<span className={chipLabel}>Deck</span>
					{status.deck === null ? <span className="text-booth-dim">none selected</span> : <span className="truncate">{status.deck}</span>}
				</span>
				{/* The age at full strength: it explains why the rest is dimmed. */}
				{stale && (
					<span className="truncate text-xs text-state-stale">
						{formatAge(ageMs)}
						{failure !== null && ` · ${failure}`}
					</span>
				)}
				<span className={`ml-auto flex shrink-0 items-center gap-3 ${stale ? staleContent : ''}`}>
					<span className={chipLabel}>Master</span>
					<Level value={status.master} />
				</span>
			</div>
			<MissingMediaNotice status={status} />
			<div className={`min-h-0 flex-1 overflow-y-auto ${stale ? staleContent : ''}`}>
				{sectionsOf(status).map((section, i) => (
					<section key={i}>
						{section.group !== null && (
							<div className="flex h-9 items-center gap-3 bg-booth-panel px-4">
								<span className={chipLabel}>{section.group.name}</span>
								{section.group.bypassed && <Bypassed />}
								<span className="ml-auto" />
								<Level value={section.group.master} />
							</div>
						)}
						{section.layers.map((layer, j) => (
							<LayerRow key={j} layer={layer} />
						))}
					</section>
				))}
			</div>
		</div>
	)
}

function LayerRow({ layer }: { layer: ArenaLayer }) {
	const clip = layer.playing
	return (
		<div className="flex h-14 items-center gap-3 border-b border-booth-edge/60 px-4">
			<Thumbnail clip={clip} />
			<div className="min-w-0 flex-1">
				<div className={chipLabel}>{layer.name}</div>
				<div className="flex min-w-0 items-center gap-2 text-sm">
					{clip === null ? <span className="text-booth-dim">—</span> : <span className="truncate">{clip.name}</span>}
					{/* Amber: connected, and Arena cannot find its file, so the
					    layer shows nothing. That is "look at this". */}
					{clip?.missing && <span className="shrink-0 text-xs text-warn">file missing</span>}
				</div>
			</div>
			{clip !== null && <TimeLeft clip={clip} />}
			{layer.bypassed && <Bypassed />}
			<Level value={layer.master} />
		</div>
	)
}

/** What the clip has left, in real time. A loop is marked ↻: at 0:00 it goes
 *  round again rather than ending. */
function TimeLeft({ clip }: { clip: ArenaClip }) {
	const t = clipTime(clip.transport)
	const box = 'flex w-24 shrink-0 items-baseline justify-end gap-1.5 tabular-nums'
	const note = 'text-[10px] font-semibold tracking-widest text-booth-dim uppercase'
	switch (t.kind) {
		case 'none':
			return null
		case 'held':
			return (
				<span className={box}>
					<span className="text-lg">0:00</span>
					<span className={note}>held</span>
				</span>
			)
		case 'paused':
			return (
				<span className={box}>
					<span className="text-lg text-booth-dim">{formatClipTime(t.ms)}</span>
					<span className={note}>paused</span>
				</span>
			)
		case 'left':
			return (
				<span className={box}>
					<span className="text-lg">{formatClipTime(t.ms)}</span>
					{t.loops && (
						<span className="text-sm text-booth-dim" aria-label="loops">
							↻
						</span>
					)}
				</span>
			)
	}
}

function Thumbnail({ clip }: { clip: ArenaClip | null }) {
	const url = clip?.thumbnail ? thumbnailUrl(clip.thumbnail) : null
	// A picture that would not load leaves the frame empty, not broken.
	const [failed, setFailed] = useState<string | null>(null)
	return (
		<span className="h-10 w-[72px] shrink-0 overflow-hidden rounded bg-booth-panel">
			{url !== null && failed !== url && (
				<img src={url} alt="" draggable={false} onError={() => setFailed(url)} className="size-full object-cover" />
			)}
		</span>
	)
}

/** Every clip whose file is not on this computer (the owner's "keeping Arena
 *  in sync", 2026-10-03), said above the board in amber, before a service
 *  finds it: connecting such a clip shows nothing. Nothing when all is there. */
export function MissingMediaNotice({ status }: { status: ArenaStatus }) {
	const [open, setOpen] = useState(false)
	const missing = missingMedia(status)
	if (missing.length === 0) return null
	return (
		<div className="shrink-0 border-b border-booth-edge bg-warn/10">
			<button type="button" onClick={() => setOpen(!open)} className="flex h-11 w-full items-center gap-3 px-4 text-left text-sm text-warn">
				<span className="truncate">
					{missing.length === 1 ? '1 clip cannot find its file' : `${missing.length} clips cannot find their files`} on this computer
				</span>
				<span className="ml-auto shrink-0 text-xs">{open ? 'Hide' : 'Show'}</span>
			</button>
			{open && (
				<ul className="max-h-60 overflow-y-auto px-4 pb-3 text-sm">
					{missing.map((m, i) => (
						<li key={i} className="flex min-w-0 flex-col py-1.5">
							<span className="truncate">
								{m.layer} · column {m.column} · {m.clip}
							</span>
							<span className="truncate text-xs text-booth-dim">{m.file}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

function Bypassed() {
	return <span className="shrink-0 rounded bg-booth-edge px-2 py-0.5 text-[10px] font-semibold tracking-widest">BYPASSED</span>
}

/** A fader, 0–1, as a bar and a percentage. */
function Level({ value }: { value: number }) {
	const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100)
	return (
		<span className="flex shrink-0 items-center gap-2">
			<span className="h-1.5 w-16 overflow-hidden rounded-full bg-booth-edge">
				<span className="block h-full bg-booth-ink" style={{ width: `${pct}%` }} />
			</span>
			<span className="w-9 text-right text-xs tabular-nums text-booth-dim">{pct}%</span>
		</span>
	)
}
