// What Arena is playing (docs/VISUALS_DASHBOARD.md, piece 2), as a view a slot
// can hold: each layer, the clip connected on it, its fader and bypass, under
// its layer group, with the deck and the composition master above.
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

import { useState } from 'react'

import { ARENA_STALE_AFTER_MS, thumbnailUrl, type ArenaClip, type ArenaGroup, type ArenaLayer, type ArenaStatus } from '../../shared/arena.js'
import { matchReading, readingOf, type Channel } from '../../shared/reading.js'
import { Say } from './MaPane.js'
import { Centered } from './Slot.js'
import { chipLabel, formatAge, staleContent, unknownWhy } from './vocabulary.js'

export function ArenaView({ status, now }: { status: Channel<ArenaStatus> | null | undefined; now: number }) {
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
		live: (s) => <Board status={s} ageMs={null} failure={null} />,
		stale: (s, ageMs) => <Board status={s} ageMs={ageMs} failure={failure} />,
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
			{layer.bypassed && <Bypassed />}
			<Level value={layer.master} />
		</div>
	)
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
