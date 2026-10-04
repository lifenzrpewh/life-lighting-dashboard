// The Holding view (the owner's idea, 2026-10-05; docs/VISUALS_DASHBOARD.md
// § The Holding view): Arena's holding layers as rows of their clips, each
// marked against today's run sheet, to prepare a service, not to play it.
//
// - Inspect only: a tap on a clip opens what it is, and never fires it (Clips
//   is for playing).
// - Each run-sheet item belongs in its column, by Arena's column names (PRE,
//   POST, WTL, NSL, BIBLES, WTG, PROMO: ../../shared/holding.ts). What is not
//   there waits in To place, with the lookbook's own picture; Place puts it in
//   its column, Choose lets the next tap on a free slot be the place instead.
// - Every change asks first (Confirm, as in the Media row) and is the
//   operator's: main refuses outside operator mode.
// - Layers top first as Arena's panel reads; PLAYBACK last and only when it
//   holds something, since it is rarely used.

import { useState } from 'react'

import { thumbnailUrl, type ArenaLayer, type ArenaSlot, type ArenaStatus } from '../../shared/arena.js'
import {
	COLUMN_NAMES,
	columnNamesOf,
	clipsToUpdate,
	codesOn,
	holdingLayers,
	placementWords,
	reserved,
	slotCode,
	slotMark,
	type Placement,
	type SlotMark,
	type Unplaced,
} from '../../shared/holding.js'
import { lookbookStem, lookbookThumbUrl, TYPE_NAMES, mediaCodeOf } from '../../shared/media-check.js'
import type { Channel } from '../../shared/reading.js'
import { useMediaCheck, type MediaCheckState } from '../useMediaCheck.js'
import { ArenaReading } from './ArenaView.js'
import { Confirm, FetchWords, ReadLine, ServiceLine, SmallButton, Summary, fileName, placeStep, under, updateStep } from './MediaCheck.js'
import { chipLabel, formatAge, staleContent } from './vocabulary.js'

export function HoldingView({ status, now }: { status: Channel<ArenaStatus> | null | undefined; now: number }) {
	return <ArenaReading status={status} now={now} render={(s, ageMs) => <Holding status={s} ageMs={ageMs} now={now} />} />
}

/** What is being placed by hand: one code of one item, into a slot of its layer. */
type Choosing = { item: number; title: string; label: string | null; code: string; want: string; lookbookPath: string }
type Picked = { kind: 'clip'; id: number } | { kind: 'choose'; what: Choosing } | null

const TYPE_LAYER: Record<string, RegExp> = { B: /^hold\s*bg$/i, F: /^hold\s*fg$/i, A: /^pre\s*(?:&|and)?\s*post$/i }
const unnamedColumn = (name: string) => /^column\s*#?\s*\d*$/i.test(name.trim()) || name.trim() === ''

function Holding({ status, ageMs, now }: { status: ArenaStatus; ageMs: number | null; now: number }) {
	const m = useMediaCheck(status, now, true)
	const [picked, setPicked] = useState<Picked>(null)
	const items = m.runSheet ?? []
	const today = codesOn(items)
	const layers = holdingLayers(status).filter((l) => !/^playback$/i.test(l.name.trim()) || l.slots.some((s) => s.state !== 'empty'))
	const choosing = picked?.kind === 'choose' ? picked.what : null
	const total = m.check === null ? 0 : Object.values(m.check.counts).reduce((a, b) => a + b, 0)
	const headerNames = layers[0] === undefined ? status.columns.map((c) => c.name) : columnNamesOf(layers[0], status)
	const named = headerNames.some((n) => !unnamedColumn(n))

	/** A slot a code may be placed in by hand: on its type's layer, not
	 *  playing, not a reserved column, and empty or not on this run sheet. */
	const freeFor = (what: Choosing, layer: ArenaLayer, slot: ArenaSlot, column: number) => {
		const type = mediaCodeOf(what.code)?.type ?? ''
		if (TYPE_LAYER[type]?.test(layer.name.trim()) !== true) return false
		const mark = slotMark(slot, items, today, m.same, m.sizes)
		return slot.state !== 'playing' && !reserved(layer, column, status) && (mark === 'empty' || mark === 'not-today')
	}

	const tapSlot = (layer: ArenaLayer, slot: ArenaSlot, column: number) => {
		if (choosing === null) return setPicked({ kind: 'clip', id: slot.id })
		if (!freeFor(choosing, layer, slot, column)) return
		m.ask('Place', [
			placeStep({
				...choosing,
				layer: layer.name,
				column,
				columnName: columnNamesOf(layer, status)[column - 1] ?? '',
				clipId: slot.id,
				replaces: slot.state === 'empty' ? null : { code: slotCode(slot), name: slot.name },
				why: 'named',
			}),
		])
		setPicked(null)
	}

	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="max-h-[55%] shrink-0 overflow-y-auto border-b border-booth-edge px-4">
				<div className="flex h-12 min-w-0 items-center gap-3 text-sm">
					<span className={chipLabel}>Holding</span>
					{m.service !== null && <span className="min-w-0 truncate text-booth-dim">{m.service.name}</span>}
					<span className="shrink-0">
						<Summary m={m} total={total} />
					</span>
				</div>
				{ageMs !== null && <p className="pb-2 text-xs text-state-stale">{formatAge(ageMs)} · Arena is not answering; this may not be what it has</p>}
				<ServiceLine m={m} />
				{m.service !== null && <ReadLine m={m} now={now} />}
				{!named && m.runSheet !== null && (
					<p className="mb-2 rounded-lg bg-booth-raise p-3 text-sm">
						Arena&rsquo;s columns aren&rsquo;t named yet, so nothing is placed. Name them in Arena: <b>{COLUMN_NAMES}</b> (as many PROMO
						columns as this campus has). Every other column is left alone.
					</p>
				)}
				<Confirm m={m} />
				<ToPlace
					m={m}
					choosing={choosing}
					onChoose={(what) => setPicked(what === null ? null : { kind: 'choose', what })}
				/>
			</div>
			<div className={`min-h-0 flex-1 overflow-auto ${ageMs !== null ? staleContent : ''}`}>
				{choosing !== null && (
					<p className="sticky top-0 left-0 z-20 bg-booth-bg px-4 py-2 text-sm">
						Tap a lit slot for {choosing.code} ({choosing.label ?? choosing.title}): empty, or not on this run sheet.
					</p>
				)}
				<table className="border-separate border-spacing-0">
					<thead>
						<tr>
							<th className="sticky top-0 left-0 z-10 h-8 min-w-32 bg-booth-bg" />
							{(layers[0]?.slots ?? []).map((_, i) => {
								const name = headerNames[i] ?? ''
								return (
									<th key={i} className="sticky top-0 bg-booth-bg px-1 text-xs font-normal text-booth-dim">
										{unnamedColumn(name) ? i + 1 : `${name} · ${i + 1}`}
									</th>
								)
							})}
						</tr>
					</thead>
					<tbody>
						{layers.map((layer) => (
							<tr key={layer.id}>
								<th className="sticky left-0 z-10 min-w-32 border-b border-booth-edge/60 bg-booth-bg px-3 text-left text-sm font-normal">
									{layer.name}
									{/^playback$/i.test(layer.name.trim()) && <span className="block text-xs text-booth-dim">rarely used</span>}
								</th>
								{layer.slots.map((slot, i) => {
									const mark = slotMark(slot, items, today, m.same, m.sizes)
									const target = choosing !== null && freeFor(choosing, layer, slot, i + 1)
									const columnName = columnNamesOf(layer, status)[i] ?? ''
									return (
										<td key={slot.id} className="border-b border-booth-edge/60 p-1">
											<Tile
												slot={slot}
												mark={m.check === null ? null : mark}
												reservedNote={
													reserved(layer, i + 1, status) ? (unnamedColumn(columnName) ? (i + 1 === 3 ? 'Countdown' : 'Broadcast BG') : columnName) : null
												}
												picked={picked?.kind === 'clip' && picked.id === slot.id}
												target={target}
												dim={choosing !== null && !target}
												onTap={() => tapSlot(layer, slot, i + 1)}
											/>
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
				{picked?.kind === 'clip' && <Inspect m={m} status={status} clipId={picked.id} onClose={() => setPicked(null)} />}
			</div>
		</div>
	)
}

/** What is not where its item belongs, with the lookbook's picture and its
 *  column; and what has no place, with why. */
function ToPlace({ m, choosing, onChoose }: { m: MediaCheckState; choosing: Choosing | null; onChoose: (what: Choosing | null) => void }) {
	const unplaced = m.unplaced.filter((u) => u.kind !== 'no-file' && u.kind !== 'unnamed')
	if (m.placements.length === 0 && unplaced.length === 0) return null
	return (
		<div className="mb-3 flex flex-col gap-2">
			<span className="text-xs text-booth-dim">To place</span>
			{m.placements.map((p) => (
				<PlaceRow key={`${p.item}:${p.code}`} m={m} p={p} u={null} choosing={choosing} onChoose={onChoose} />
			))}
			{unplaced.map((u) => (
				<PlaceRow key={`${u.item}:${u.code}`} m={m} p={null} u={u} choosing={choosing} onChoose={onChoose} />
			))}
		</div>
	)
}

function PlaceRow({
	m,
	p,
	u,
	choosing,
	onChoose,
}: {
	m: MediaCheckState
	p: Placement | null
	u: Unplaced | null
	choosing: Choosing | null
	onChoose: (what: Choosing | null) => void
}) {
	const one = (p ?? u) as Placement | Unplaced
	const file = m.runSheet?.[one.item]?.files[one.code] ?? null
	const thumb = file === null ? null : lookbookThumbUrl(file)
	const fetch = m.fetches[one.code]
	const what: Choosing | null =
		one.want === null || file === null ? null : { item: one.item, title: one.title, label: one.label, code: one.code, want: one.want, lookbookPath: file }
	const active = choosing !== null && choosing.item === one.item && choosing.code === one.code
	return (
		<div className={`flex min-w-0 items-center gap-3 rounded-lg p-2 ${active ? 'bg-booth-raise nacre-ring' : 'bg-booth-panel ring-1 ring-booth-edge ring-inset'}`}>
			<Picture url={thumb} />
			<span className="flex min-w-0 flex-1 flex-col text-sm">
				<span className="truncate">
					<span className="font-mono text-xs">{one.code}</span> {one.label ?? one.title}
					<span className="text-booth-dim"> · {one.want ?? 'no file in the lookbook'}</span>
				</span>
				<span className={`truncate text-xs ${p === null ? 'text-warn' : 'text-booth-dim'}`}>
					{p !== null ? `Goes in ${placementWords(p)}` : `No place: ${u?.detail ?? ''}`}
				</span>
			</span>
			<FetchWords fetch={fetch} refused={m.refused[one.code]} />
			{!under(fetch) && (
				<>
					{p !== null && <SmallButton onClick={() => m.ask('Place', [placeStep(p)])}>Place</SmallButton>}
					{what !== null && <SmallButton onClick={() => onChoose(active ? null : what)}>{active ? 'Cancel' : 'Choose'}</SmallButton>}
				</>
			)}
		</div>
	)
}

/** A clip, with its thumbnail and what it is to today's run sheet. Playing is
 *  green as in Clips; may differ and a missing file amber; a clip the run
 *  sheet does not use faded. */
function Tile({
	slot,
	mark,
	reservedNote,
	picked,
	target,
	dim,
	onTap,
}: {
	slot: ArenaSlot
	mark: SlotMark | null
	reservedNote: string | null
	picked: boolean
	target: boolean
	dim: boolean
	onTap: () => void
}) {
	const url = slot.thumbnail === null ? null : thumbnailUrl(slot.thumbnail)
	const [failed, setFailed] = useState<string | null>(null)
	const ring = target
		? 'nacre-ring'
		: picked
			? 'ring-2 ring-booth-ink'
			: slot.state === 'playing'
				? 'ring-2 ring-state-live'
				: mark === 'may-differ' || mark === 'different' || mark === 'missing'
					? 'ring-2 ring-warn'
					: 'ring-1 ring-booth-edge'
	const faded = dim || (!target && (mark === 'not-today' || mark === 'no-code'))
	if (slot.state === 'empty') {
		return (
			<button
				type="button"
				onClick={onTap}
				className={`flex h-16 w-28 items-end rounded-lg border border-dashed border-booth-edge/70 p-1 text-left text-[11px] text-booth-faint ${target ? 'nacre-ring' : ''} ${dim ? 'opacity-40' : ''}`}
			>
				{reservedNote}
			</button>
		)
	}
	const code = slotCode(slot)
	return (
		<button
			type="button"
			onClick={onTap}
			className={`relative block h-16 w-28 overflow-hidden rounded-lg bg-booth-raise text-left ${ring} ${faded ? 'opacity-45' : ''}`}
		>
			{url !== null && failed !== url && <img src={url} alt="" draggable={false} onError={() => setFailed(url)} className="absolute inset-0 size-full object-cover" />}
			<span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-black/40 px-1.5 py-0.5 text-[11px]">
				{code !== null ? <span className="font-mono">{code}</span> : slot.name}
				{mark === 'today' && ' ✓'}
				{mark === 'confirmed' && ' ✓ by hand'}
			</span>
			{(mark === 'may-differ' || mark === 'different' || mark === 'missing') && (
				<span className="absolute top-1 left-1 rounded bg-black/75 px-1 text-[11px] font-medium text-warn">{mark === 'missing' ? 'File missing' : mark === 'different' ? 'Different file' : 'May differ'}</span>
			)}
		</button>
	)
}

/** One clip, looked at: what it is, and for one that may differ, Arena's
 *  picture beside the lookbook's, with Same and Update. */
function Inspect({ m, status, clipId, onClose }: { m: MediaCheckState; status: ArenaStatus; clipId: number; onClose: () => void }) {
	let found: { slot: ArenaSlot; layer: string; column: number } | null = null
	for (const layer of status.layers) {
		const i = layer.slots.findIndex((s) => s.id === clipId)
		if (i >= 0) found = { slot: layer.slots[i] as ArenaSlot, layer: layer.name, column: i + 1 }
	}
	if (found === null) return null
	const { slot } = found
	const items = m.runSheet ?? []
	const mark = slotMark(slot, items, codesOn(items), m.same, m.sizes)
	const code = slotCode(slot)
	const file = code === null ? null : (items.map((i) => i.files[code]).find((f) => f !== undefined) ?? null)
	const want = file === null ? null : lookbookStem(file)
	const fetch = code === null ? undefined : m.fetches[code]
	const arenaUrl = slot.thumbnail === null ? null : thumbnailUrl(slot.thumbnail)
	const words: Record<SlotMark, string> = {
		empty: 'Empty',
		today: 'On this run sheet',
		different: 'On this run sheet, but not the lookbook’s file (another size)',
		'may-differ': 'On this run sheet, under another name than the lookbook’s',
		confirmed: 'On this run sheet; confirmed the same by hand',
		missing: 'On this run sheet, but Arena cannot find its file on this computer',
		'not-today': 'Not on this run sheet: free to be replaced',
		'no-code': 'No media code in its name: left alone',
	}
	return (
		<div className="m-4 flex max-w-3xl flex-col gap-3 rounded-lg bg-booth-panel p-4 text-sm ring-1 ring-booth-edge ring-inset">
			<div className="flex items-center gap-3">
				<span className="min-w-0 flex-1 truncate font-medium">
					{found.layer} · column {found.column}
					{code !== null && <span className="text-booth-dim"> · {TYPE_NAMES[mediaCodeOf(code)?.type ?? ''] ?? ''}</span>}
				</span>
				<SmallButton onClick={onClose}>Close</SmallButton>
			</div>
			<p className={mark === 'may-differ' || mark === 'different' || mark === 'missing' ? 'text-warn' : 'text-booth-dim'}>
				{m.check === null ? 'Not checked against a run sheet' : words[mark]}
				{slot.state === 'playing' && ' · playing now'}
			</p>
			<div className="flex flex-wrap gap-4">
				<figure className="flex flex-col gap-1">
					<Picture url={arenaUrl} large />
					<figcaption className="max-w-64 truncate text-xs text-booth-dim">In Arena: {slot.file === null ? slot.name : fileName(slot.file)}</figcaption>
				</figure>
				{file !== null && want !== null && mark !== 'today' && (
					<figure className="flex flex-col gap-1">
						<Picture url={lookbookThumbUrl(file)} large />
						<figcaption className="max-w-64 truncate text-xs text-booth-dim">The lookbook: {want}</figcaption>
					</figure>
				)}
			</div>
			{code !== null && want !== null && file !== null && slot.file !== null && (mark === 'may-differ' || mark === 'different' || mark === 'confirmed' || mark === 'missing') && (
				<div className="flex items-center gap-2">
					<FetchWords fetch={fetch} refused={m.refused[code]} />
					{!under(fetch) && mark !== 'missing' && (
						<SmallButton onClick={() => m.markSame({ code, file: slot.file as string, want, same: mark !== 'confirmed' })}>
							{mark === 'confirmed' ? 'Undo' : 'Same'}
						</SmallButton>
					)}
					{!under(fetch) && mark !== 'confirmed' && (
						<SmallButton
							onClick={() =>
								m.ask('Update', [
									updateStep(
										{ code, want, clipIds: clipsToUpdate(code, want, file, status, m.same, m.sizes), lookbookPath: file, allowLookbook: false },
										status,
									),
								])
							}
						>
							Update
						</SmallButton>
					)}
				</div>
			)}
		</div>
	)
}

function Picture({ url, large = false }: { url: string | null; large?: boolean }) {
	const [failed, setFailed] = useState<string | null>(null)
	const size = large ? 'h-36 w-64' : 'h-12 w-20'
	if (url === null || failed === url) return <span className={`${size} shrink-0 rounded-md bg-booth-raise`} />
	return <img src={url} alt="" draggable={false} onError={() => setFailed(url)} className={`${size} shrink-0 rounded-md bg-booth-raise object-contain`} />
}
