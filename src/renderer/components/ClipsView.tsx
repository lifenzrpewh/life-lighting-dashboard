// The trigger screen: Arena's clip grid, to fire from (docs/VISUALS_DASHBOARD.md
// § Answered, 2026-10-03 evening). For a single-screen volunteer op, so
// everyone may: tap a clip to play it, fire a column, clear a layer, drag a
// layer's fader.
//
// WHAT IT NEVER DOES:
// - Draw a tap as done. A clip shows playing when Arena's next push says so
//   (src/bridge/arena-control.ts); until then the tapped cell only says it was
//   sent, and a refusal is said in words above the grid.
// - Fire from a stale picture. While Arena is stale or not answering nothing
//   here takes a tap: the grid may no longer be what Arena has.
// - Offer an empty column. Arena fires a column by stopping every layer whose
//   cell in it is empty, so an empty column is a blackout on one tap.
//
// Layers run top to bottom as Arena's own panel does, highest first, like the
// Arena view; columns left to right. The layer's controls stay at the left and
// the column buttons along the top while the grid scrolls under them.

import { useEffect, useRef, useState } from 'react'

import { thumbnailUrl, type ArenaCommand, type ArenaLayer, type ArenaSlot, type ArenaStatus } from '../../shared/arena.js'
import type { Channel } from '../../shared/reading.js'
import { ArenaReading, MissingMediaNotice } from './ArenaView.js'
import { chipLabel, formatAge, staleContent } from './vocabulary.js'

/** A fader drag is sent at most this often; the last position always is. */
const FADER_SEND_MS = 50
/** A tapped cell says "sent" this long, or until Arena's push shows it. */
const SENT_MS = 1_500

export function ClipsView({ status, now }: { status: Channel<ArenaStatus> | null | undefined; now: number }) {
	return <ArenaReading status={status} now={now} render={(s, ageMs, failure) => <Grid status={s} ageMs={ageMs} failure={failure} />} />
}

function Grid({ status, ageMs, failure }: { status: ArenaStatus; ageMs: number | null; failure: string | null }) {
	const stale = ageMs !== null
	const [refused, setRefused] = useState<string | null>(null)
	const [sent, setSent] = useState<{ key: string; at: number } | null>(null)

	const fire = (command: ArenaCommand, key: string) => {
		if (stale) return
		setSent({ key, at: Date.now() })
		void window.life?.arenaCommand(command).then((r) => setRefused(r.ok ? null : r.detail))
	}
	useEffect(() => {
		if (sent === null) return
		const id = setTimeout(() => setSent(null), SENT_MS)
		return () => clearTimeout(id)
	}, [sent])

	const layers = [...status.layers].reverse()
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			{(stale || refused !== null) && (
				<div className="flex h-9 shrink-0 items-center gap-3 border-b border-booth-edge px-4 text-xs">
					{stale && (
						<span className="truncate text-state-stale">
							{formatAge(ageMs)}
							{failure !== null && ` · ${failure}`} · firing is off until Arena answers
						</span>
					)}
					{!stale && refused !== null && <span className="truncate text-state-unreachable">Not sent: {refused}</span>}
				</div>
			)}
			<MissingMediaNotice status={status} />
			<div className={`min-h-0 flex-1 overflow-auto ${stale ? staleContent : ''}`}>
				<table className="border-separate border-spacing-0">
					<thead>
						<tr>
							<th className="sticky top-0 left-0 z-20 h-12 min-w-52 border-b border-booth-edge bg-booth-bg px-3 text-left">
								<span className={chipLabel}>Layers</span>
							</th>
							{status.columns.map((c) => {
								const key = `column:${c.id}`
								return (
									<th key={c.id} className="sticky top-0 z-10 border-b border-booth-edge bg-booth-bg p-1">
										<button
											type="button"
											disabled={stale || c.state === 'empty'}
											onClick={() => fire({ kind: 'column', columnId: c.id }, key)}
											className={`h-10 w-32 truncate rounded-ctl px-2 text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-30 ${
												c.state === 'playing' ? 'bg-state-live/12 text-state-live ring-1 ring-state-live/70 ring-inset' : 'bg-booth-raise hover:bg-booth-hover'
											} ${sent?.key === key ? 'bg-booth-hover' : ''}`}
										>
											{c.name}
										</button>
									</th>
								)
							})}
						</tr>
					</thead>
					<tbody>
						{layers.map((layer) => (
							<tr key={layer.id}>
								<th className="sticky left-0 z-10 border-b border-booth-edge/60 bg-booth-bg px-3 py-1 text-left font-normal">
									<LayerControls layer={layer} disabled={stale} onClear={() => fire({ kind: 'clear', layerId: layer.id }, `clear:${layer.id}`)} />
								</th>
								{layer.slots.map((slot) => (
									<td key={slot.id} className="border-b border-booth-edge/60 p-1">
										<Cell
											slot={slot}
											disabled={stale}
											sent={sent?.key === `clip:${slot.id}`}
											onFire={() => fire({ kind: 'clip', clipId: slot.id }, `clip:${slot.id}`)}
										/>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}

function LayerControls({ layer, disabled, onClear }: { layer: ArenaLayer; disabled: boolean; onClear: () => void }) {
	return (
		<div className="flex w-52 flex-col gap-1.5">
			<div className="flex min-w-0 items-center gap-2">
				<span className="min-w-0 flex-1 truncate text-sm">{layer.name}</span>
				{layer.bypassed && <span className="shrink-0 rounded-full bg-booth-raise px-2 py-0.5 text-xs text-booth-dim">Bypassed</span>}
				<button
					type="button"
					disabled={disabled || layer.playing === null}
					onClick={onClear}
					aria-label={`Clear ${layer.name}`}
					className="h-9 shrink-0 rounded-ctl bg-booth-raise px-3 text-sm font-medium hover:bg-booth-hover active:scale-[0.98] disabled:opacity-30"
				>
					Clear
				</button>
			</div>
			<Fader layer={layer} disabled={disabled} />
		</div>
	)
}

/** A layer's fader, as wide as a thumb can drag. While the finger is down it
 *  shows the finger's place; once lifted, Arena's own value again, so a fader
 *  Arena did not take snaps back to what Arena has. */
function Fader({ layer, disabled }: { layer: ArenaLayer; disabled: boolean }) {
	const [dragging, setDragging] = useState<number | null>(null)
	const lastSent = useRef(0)
	const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

	const send = (value: number, final: boolean) => {
		if (pending.current !== null) clearTimeout(pending.current)
		pending.current = null
		const go = () => {
			lastSent.current = Date.now()
			void window.life?.arenaCommand({ kind: 'fader', layerId: layer.id, value })
		}
		const wait = FADER_SEND_MS - (Date.now() - lastSent.current)
		if (final || wait <= 0) go()
		else pending.current = setTimeout(go, wait)
	}
	useEffect(() => () => {
		if (pending.current !== null) clearTimeout(pending.current)
	}, [])

	const valueAt = (e: React.PointerEvent<HTMLDivElement>) => {
		const r = e.currentTarget.getBoundingClientRect()
		return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
	}
	const shown = dragging ?? layer.master
	const pct = Math.round(Math.min(Math.max(shown, 0), 1) * 100)
	return (
		<div className="flex items-center gap-2">
			<div
				role="slider"
				aria-label={`${layer.name} fader`}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={pct}
				aria-disabled={disabled}
				className={`relative h-8 flex-1 touch-none rounded-ctl bg-booth-raise ${disabled ? 'opacity-30' : ''}`}
				onPointerDown={(e) => {
					if (disabled) return
					e.currentTarget.setPointerCapture(e.pointerId)
					const v = valueAt(e)
					setDragging(v)
					send(v, false)
				}}
				onPointerMove={(e) => {
					if (dragging === null) return
					const v = valueAt(e)
					setDragging(v)
					send(v, false)
				}}
				onPointerUp={(e) => {
					if (dragging === null) return
					send(valueAt(e), true)
					setDragging(null)
				}}
				onPointerCancel={() => setDragging(null)}
			>
				<span className="absolute inset-y-0 left-0 rounded-ctl bg-booth-hover" style={{ width: `${pct}%` }} />
				<span className="absolute inset-y-1 w-1.5 -translate-x-1/2 rounded-full bg-booth-ink" style={{ left: `${pct}%` }} />
			</div>
			<span className="w-9 text-right text-xs tabular-nums text-booth-dim">{pct}%</span>
		</div>
	)
}

function Cell({ slot, disabled, sent, onFire }: { slot: ArenaSlot; disabled: boolean; sent: boolean; onFire: () => void }) {
	const url = slot.thumbnail === null ? null : thumbnailUrl(slot.thumbnail)
	const [failed, setFailed] = useState<string | null>(null)
	if (slot.state === 'empty') return <div className="h-20 w-32 rounded-ctl border border-dashed border-booth-edge/70" />
	// Green: on output. Amber: Arena cannot find its file, so firing it shows
	// nothing. A cell just tapped is lit until Arena's push says what happened.
	const ring = slot.state === 'playing' ? 'ring-2 ring-state-live' : slot.missingFile !== null ? 'ring-2 ring-warn' : 'ring-1 ring-booth-edge'
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onFire}
			className={`relative block h-20 w-32 overflow-hidden rounded-ctl bg-booth-raise text-left transition-transform active:scale-[0.97] disabled:cursor-default ${ring} ${sent ? 'brightness-150' : ''}`}
		>
			{url !== null && failed !== url && (
				<img src={url} alt="" draggable={false} onError={() => setFailed(url)} className="absolute inset-0 size-full object-cover" />
			)}
			<span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-black/40 px-2 py-1 text-xs">{slot.name}</span>
			{slot.missingFile !== null && (
				<span className="absolute top-1 left-1 rounded bg-black/75 px-1.5 text-[11px] font-medium text-warn">File missing</span>
			)}
		</button>
	)
}
