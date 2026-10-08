// The Holding view (the owner's idea, 2026-10-05; docs/VISUALS_DASHBOARD.md
// § The Holding view): Arena's holding layers as rows of their clips, each
// marked against today's run sheet, to prepare a service, not to play it.
//
// Pictures over words (the owner, 2026-10-05: "the less cluttered the
// better, but still needs to convey the same info"):
// - A clip that is right says nothing but its code. Only what needs a look is
//   marked: amber for a file that may differ, differs, or is missing; faded
//   for a clip this service does not use; green when on screen, as in Clips.
// - What belongs in a column and is not there yet stands in that column as a
//   dashed tile with the lookbook's picture: tap it to place it.
// - What has no column (a one-off) goes into an empty clip past the named
//   columns on its layer, drawn there dashed like any placement (the owner,
//   2026-10-08: overflow). What does not fit even there waits in the tray
//   above the grid, counted as "didn't fit": tap it, then a lit slot on its
//   layer, for this service (../../shared/holding.ts).
// - One line on top: the service, what needs a look, fetches under way,
//   Update all and Check again. The service's details open from its name.
// - A tap on a clip opens it: Arena's picture beside the lookbook's, and the
//   two answers, "Use the lookbook's" and "Arena's is right".
//
// Inspect only: a tap never fires a clip (Clips is for playing). Every change
// asks first (Confirm) and is the operator's: main refuses outside operator
// mode, and in volunteer mode the buttons that change anything are not drawn
// (the owner, 2026-10-06), so what goes where shows but cannot be tapped.
// HOLD BG's gaps show where the normal background goes (../../shared/holding.ts,
// `backgroundGaps`). Layers top first as Arena's panel reads; PLAYBACK last and only when
// it holds something, since it is rarely used.

import { useState } from 'react'
import { ArrowLeft, FileX, RefreshCw, X } from 'lucide-react'

import { thumbnailUrl, type ArenaLayer, type ArenaSlot, type ArenaStatus } from '../../shared/arena.js'
import {
	COLUMN_NAMES,
	columnNamesOf,
	clipsToUpdate,
	codesOn,
	fillColumns,
	holdingLayers,
	normalBackground,
	reserved,
	slotCode,
	slotMark,
	TYPE_LAYER,
	type Placement,
	type SlotMark,
	type Unplaced,
} from '../../shared/holding.js'
import { lookbookStem, lookbookThumbUrl, TYPE_NAMES, mediaCodeOf } from '../../shared/media-check.js'
import type { FetchStates } from '../../shared/media-fetch.js'
import type { Channel } from '../../shared/reading.js'
import { useMediaCheck, type MediaCheckState } from '../useMediaCheck.js'
import { useOperator } from '../mode.js'
import { ArenaReading } from './ArenaView.js'
import { Confirm, FetchWords, ServiceLine, SmallButton, Summary, fetchShort, fileName, placeStep, under, updateStep } from './MediaCheck.js'
import { chipLabel, formatAge, staleContent } from './vocabulary.js'

export function HoldingView({ status, now }: { status: Channel<ArenaStatus> | null | undefined; now: number }) {
	return <ArenaReading status={status} now={now} render={(s, ageMs) => <Holding status={s} ageMs={ageMs} now={now} />} />
}

/** What is being placed by hand: one code of one item, into a slot of its layer. */
type Choosing = { item: number; title: string; label: string | null; code: string; want: string; lookbookPath: string }
type Picked = { kind: 'clip'; id: number } | { kind: 'choose'; what: Choosing } | null

const unnamedColumn = (name: string) => /^column\s*#?\s*\d*$/i.test(name.trim()) || name.trim() === ''
const needsLook = (mark: SlotMark | null) => mark === 'may-differ' || mark === 'different' || mark === 'missing'

/** `onBack`: shown in the Arena view's place, with a way back to it. */
export function Holding({ status, ageMs, now, onBack }: { status: ArenaStatus; ageMs: number | null; now: number; onBack?: () => void }) {
	const m = useMediaCheck(status, now, true)
	const operator = useOperator()
	const [picked, setPicked] = useState<Picked>(null)
	const [details, setDetails] = useState(false)
	const [fetchNote, setFetchNote] = useState<string | null>(null)
	const items = m.runSheet ?? []
	const today = codesOn(items)
	const layers = holdingLayers(status).filter((l) => !/^playback$/i.test(l.name.trim()) || l.slots.some((s) => s.state !== 'empty'))
	const choosing = picked?.kind === 'choose' ? picked.what : null
	const total = m.check === null ? 0 : Object.values(m.check.counts).reduce((a, b) => a + b, 0)
	const headerNames = layers[0] === undefined ? status.columns.map((c) => c.name) : columnNamesOf(layers[0], status)
	const named = headerNames.some((n) => !unnamedColumn(n))
	// What goes where it is not yet: drawn in its slot.
	const ghosts = new Map<string, Placement>()
	for (const p of [...m.placements, ...m.fills]) if (!ghosts.has(`${p.layer}:${p.column}`)) ghosts.set(`${p.layer}:${p.column}`, p)
	// HOLD BG's columns for the normal background: a one-off background may
	// be chosen into one that holds it.
	const fillable = new Set(fillColumns(items, status))
	const normal = normalBackground(items)?.code ?? null
	// What has no column: the tray. Columns not named yet are said once, above.
	const tray = m.unplaced.filter((u) => u.kind !== 'unnamed')

	/** A slot a code may be placed in by hand: on its type's layer, not a
	 *  reserved column, and empty or not on this run sheet. One on screen may
	 *  be picked; the confirmation asks about it apart. */
	const freeFor = (what: Choosing, layer: ArenaLayer, slot: ArenaSlot, column: number) => {
		const type = mediaCodeOf(what.code)?.type ?? ''
		if (TYPE_LAYER[type]?.test(layer.name.trim()) !== true) return false
		const mark = slotMark(slot, items, today, m.same, m.sizes)
		const filler = TYPE_LAYER['B']?.test(layer.name.trim()) === true && fillable.has(column) && slot.state !== 'playing'
		if (filler && normal !== null && slotCode(slot) === normal) return true
		return !reserved(layer, column, status) && (mark === 'empty' || mark === 'not-today')
	}

	const tapSlot = (layer: ArenaLayer, slot: ArenaSlot, column: number) => {
		if (choosing === null) {
			const ghost = ghosts.get(`${layer.name}:${column}`)
			if (ghost !== undefined) return operator ? m.ask('Place', [placeStep(ghost)]) : undefined
			return setPicked(picked?.kind === 'clip' && picked.id === slot.id ? null : { kind: 'clip', id: slot.id })
		}
		if (!freeFor(choosing, layer, slot, column)) return
		m.ask('Place', [
			placeStep({
				...choosing,
				layer: layer.name,
				column,
				columnName: columnNamesOf(layer, status)[column - 1] ?? '',
				clipId: slot.id,
				replaces: slot.state === 'empty' ? null : { code: slotCode(slot), name: slot.name },
				why: 'chosen',
				live: slot.state === 'playing',
			}),
		])
		setPicked(null)
	}

	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="max-h-[55%] shrink-0 overflow-y-auto border-b border-booth-edge px-4">
				<div className="flex h-12 min-w-0 items-center gap-3 text-sm">
					{onBack !== undefined && (
						<button type="button" onClick={onBack} className="-ml-2 flex h-10 shrink-0 items-center gap-1.5 rounded-ctl px-2 text-booth-dim hover:bg-booth-hover" aria-label="Back to Arena">
							<ArrowLeft size={18} aria-hidden />
							Arena
						</button>
					)}
					<span className={chipLabel}>Holding</span>
					<button type="button" onClick={() => setDetails(!details)} className="min-w-0 truncate rounded-ctl px-1 text-booth-dim hover:text-booth-ink">
						{m.service !== null ? `${m.service.name}${m.byHand ? ' (picked)' : ''}` : 'Which service?'}
					</button>
					<span className="shrink-0">
						<Summary m={m} total={total} />
					</span>
					<Activity fetches={m.fetches} refused={m.refused} now={now} onTap={(code) => setFetchNote(fetchNote === code ? null : code)} />
					<span className="ml-auto flex shrink-0 items-center gap-2">
						{operator && m.oldFgs.length > 0 && <SmallButton onClick={m.askClearOld}>Clear old FGs ({m.oldFgs.length})</SmallButton>}
						{operator && m.plannedUpdate.steps.length > 0 && <SmallButton onClick={m.askUpdateAll}>Update all</SmallButton>}
						<button type="button" onClick={m.readItemsAgain} aria-label="Check again" title="Check again" className="grid size-10 place-items-center rounded-ctl bg-booth-raise hover:bg-booth-hover">
							<RefreshCw size={16} aria-hidden />
						</button>
					</span>
				</div>
				{fetchNote !== null && (m.fetches[fetchNote] !== undefined || m.refused[fetchNote] !== undefined) && (
					<p className="flex items-center gap-2 pb-2 text-xs">
						<span className="font-mono">{fetchNote}</span>
						<FetchWords fetch={m.fetches[fetchNote]} refused={m.refused[fetchNote]} />
					</p>
				)}
				{ageMs !== null && <p className="pb-2 text-xs text-state-stale">{formatAge(ageMs)} · Arena is not answering; this may not be what it has</p>}
				{(details || m.service === null) && (
					<div className="border-t border-booth-edge/60">
						<ServiceLine m={m} />
						{m.items.kind === 'read' && (
							<p className="pb-2 text-xs text-booth-dim">
								{m.items.read.ok ? `Run sheet read ${formatAge(Math.max(0, now - m.items.read.at))}` : <span className="text-warn">{m.items.read.detail}</span>}
							</p>
						)}
					</div>
				)}
				{!named && m.runSheet !== null && (
					<p className="mb-2 rounded-ctl bg-booth-raise p-3 text-sm">
						Name Arena&rsquo;s columns <b>{COLUMN_NAMES}</b> to place by column. Until then nothing is placed.
					</p>
				)}
				<Confirm key={m.asking?.id} m={m} />
				{tray.length > 0 && (
					<Tray m={m} tray={tray} operator={operator} choosing={choosing} onChoose={(what) => setPicked(what === null ? null : { kind: 'choose', what })} />
				)}
			</div>
			<div className={`min-h-0 flex-1 overflow-auto ${ageMs !== null ? staleContent : ''}`}>
				{choosing !== null && (
					<p className="sticky top-0 left-0 z-20 bg-booth-bg px-4 py-2 text-sm">
						Tap a lit slot for <span className="font-mono">{choosing.code}</span> ({choosing.label ?? choosing.title}), for this service
					</p>
				)}
				<table className="border-separate border-spacing-0">
					<thead>
						<tr>
							<th className="sticky top-0 left-0 z-10 h-8 min-w-28 bg-booth-bg" />
							{(layers[0]?.slots ?? []).map((_, i) => {
								const name = headerNames[i] ?? ''
								return (
									<th key={i} className="sticky top-0 bg-booth-bg px-1 text-xs font-normal text-booth-dim">
										{unnamedColumn(name) ? i + 1 : name}
									</th>
								)
							})}
						</tr>
					</thead>
					<tbody>
						{layers.map((layer) => (
							<tr key={layer.id}>
								<th className="sticky left-0 z-10 min-w-28 border-b border-booth-edge/60 bg-booth-bg px-3 text-left text-sm font-normal">
									{layer.name}
									{/^playback$/i.test(layer.name.trim()) && <span className="block text-xs text-booth-dim">rarely used</span>}
								</th>
								{layer.slots.map((slot, i) => {
									const mark = m.check === null ? null : slotMark(slot, items, today, m.same, m.sizes)
									const target = choosing !== null && freeFor(choosing, layer, slot, i + 1)
									const ghost = choosing === null ? ghosts.get(`${layer.name}:${i + 1}`) : undefined
									const columnName = columnNamesOf(layer, status)[i] ?? ''
									return (
										<td key={slot.id} className="border-b border-booth-edge/60 p-1">
											{ghost !== undefined ? (
												<Ghost m={m} p={ghost} operator={operator} onTap={() => tapSlot(layer, slot, i + 1)} />
											) : (
												<Tile
													slot={slot}
													mark={mark}
													reservedNote={
														reserved(layer, i + 1, status) ? (unnamedColumn(columnName) ? (i + 1 === 3 ? 'Countdown' : 'Broadcast BG') : columnName) : null
													}
													picked={picked?.kind === 'clip' && picked.id === slot.id}
													target={target}
													dim={choosing !== null && !target}
													onTap={() => tapSlot(layer, slot, i + 1)}
												/>
											)}
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
				<Legend operator={operator} />
				{picked?.kind === 'clip' && <Inspect m={m} status={status} operator={operator} clipId={picked.id} onClose={() => setPicked(null)} />}
			</div>
		</div>
	)
}

/** Fetches under way, or ended in the last while, as small chips; a failure
 *  stays a few minutes and says why when tapped. */
function Activity({ fetches, refused, now, onTap }: { fetches: FetchStates; refused: Record<string, string>; now: number; onTap: (code: string) => void }) {
	const shown = Object.entries(fetches).filter(([, f]) => under(f) || now - f.at < (f.state === 'failed' ? 300_000 : 20_000))
	const refusals = Object.entries(refused)
	if (shown.length === 0 && refusals.length === 0) return null
	return (
		<span className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden">
			{shown.map(([code, f]) => (
				<button
					key={code}
					type="button"
					onClick={() => onTap(code)}
					className={`h-7 shrink-0 rounded-ctl px-2 text-xs tabular-nums ${f.state === 'failed' ? 'bg-warn/15 text-warn' : 'bg-booth-raise text-booth-dim'}`}
				>
					<span className="font-mono">{code}</span> {fetchShort(f)}
				</button>
			))}
			{refusals.map(([code]) => (
				<button key={`r${code}`} type="button" onClick={() => onTap(code)} className="h-7 shrink-0 rounded-ctl bg-warn/15 px-2 text-xs text-warn">
					<span className="font-mono">{code}</span> refused
				</button>
			))}
		</span>
	)
}

/** What has no column: one-offs to choose a slot for, and what cannot be
 *  placed, each with the lookbook's picture. */
function Tray({
	m,
	tray,
	operator,
	choosing,
	onChoose,
}: {
	m: MediaCheckState
	tray: Unplaced[]
	/** Volunteer mode shows what waits, not a way to place it. */
	operator: boolean
	choosing: Choosing | null
	onChoose: (what: Choosing | null) => void
}) {
	// More than the named columns and the empty clips past them could take (the
	// owner, 2026-10-08): said plainly, placed by hand.
	const didntFit = tray.filter((u) => u.didntFit === true).length
	return (
		<div className="mb-3 flex min-w-0 items-center gap-2 overflow-x-auto">
			<span className="shrink-0 text-xs text-booth-dim">No column</span>
			{didntFit > 0 && (
				<span className="shrink-0 text-xs text-warn" title="No empty clip left past the named columns: choose a slot for each by hand">
					{didntFit} didn&rsquo;t fit
				</span>
			)}
			{tray.map((u) => {
				const file = m.runSheet?.[u.item]?.files[u.code] ?? null
				const what: Choosing | null =
					u.want === null || file === null || u.kind === 'no-layer' ? null : { item: u.item, title: u.title, label: u.label, code: u.code, want: u.want, lookbookPath: file }
				const active = choosing !== null && choosing.item === u.item && choosing.code === u.code
				const busy = under(m.fetches[u.code])
				return (
					<button
						key={`${u.item}:${u.code}`}
						type="button"
						disabled={!operator || what === null || busy}
						onClick={() => onChoose(active ? null : what)}
						title={u.detail}
						className={`relative h-16 w-28 shrink-0 overflow-hidden rounded-ctl text-left disabled:cursor-default ${active ? 'accent-ring' : 'border border-dashed border-accent-hi/70'} ${what === null ? 'opacity-50' : ''}`}
					>
						{file !== null && <Picture url={lookbookThumbUrl(file)} fill />}
						<span className="absolute inset-x-0 bottom-0 flex flex-col bg-black/70 px-1.5 py-0.5 text-[11px] leading-tight">
							<span className="font-mono">{u.code}</span>
							<span className="truncate text-booth-dim">{what === null ? shortWhy(u) : (u.label ?? u.title)}</span>
						</span>
					</button>
				)
			})}
			{choosing !== null && <SmallButton onClick={() => onChoose(null)}>Cancel</SmallButton>}
		</div>
	)
}

function shortWhy(u: Unplaced): string {
	switch (u.kind) {
		case 'no-file':
			return 'no file in the lookbook'
		case 'no-layer':
			return u.detail
		default:
			return u.label ?? u.title
	}
}

/** Where a run-sheet item belongs and is not yet: the lookbook's picture in its
 *  slot, dashed. A tap asks to place it. */
function Ghost({ m, p, operator, onTap }: { m: MediaCheckState; p: Placement; operator: boolean; onTap: () => void }) {
	const busy = under(m.fetches[p.code])
	return (
		<button
			type="button"
			onClick={onTap}
			disabled={busy || !operator}
			title={`${p.code} goes here${p.replaces === null ? '' : `, replacing ${p.replaces.name}`}`}
			className={`relative block h-16 w-28 overflow-hidden rounded-ctl border-2 border-dashed text-left disabled:cursor-default ${p.live ? 'border-state-live' : 'border-accent-hi/80'}`}
		>
			<span className="absolute inset-0 opacity-60">
				<Picture url={lookbookThumbUrl(p.lookbookPath)} fill />
			</span>
			<span className="absolute top-1 right-1 rounded bg-black/75 px-1 text-[11px] text-accent-hi">{busy ? fetchShort(m.fetches[p.code] as FetchStates[string]) : operator ? '+ place' : 'goes here'}</span>
			<span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-0.5 font-mono text-[11px]">{p.code}</span>
		</button>
	)
}

/** A clip, with its thumbnail and its code; marked only when it needs a look. */
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
		? 'accent-ring'
		: picked
			? 'ring-2 ring-booth-ink'
			: needsLook(mark)
				? 'outline-4 -outline-offset-4 outline-warn'
				: slot.state === 'playing'
					? 'outline-4 -outline-offset-4 outline-state-live'
					: ''
	const faded = dim || (!target && (mark === 'not-today' || mark === 'no-code'))
	if (slot.state === 'empty') {
		return (
			<button
				type="button"
				onClick={onTap}
				className={`flex h-16 w-28 items-end rounded-ctl border border-dashed border-booth-edge/70 p-1 text-left text-[11px] text-booth-faint ${target ? 'accent-ring' : ''} ${dim ? 'opacity-40' : ''}`}
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
			className={`relative block h-16 w-28 overflow-hidden rounded-ctl bg-booth-raise text-left ${ring} ${faded ? 'opacity-45' : ''}`}
		>
			{url !== null && failed !== url && <img src={url} alt="" draggable={false} onError={() => setFailed(url)} className="absolute inset-0 size-full object-cover" />}
			<span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-0.5 text-[11px]">
				{code !== null ? <span className="font-mono">{code}</span> : slot.name}
			</span>
			{needsLook(mark) && (
				<span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/75 text-warn">
					{mark === 'missing' ? <FileX size={13} aria-label="File missing" /> : <span className="size-2.5 rounded-full bg-warn" aria-label="May differ" />}
				</span>
			)}
			{slot.state === 'playing' && needsLook(mark) && <span className="absolute top-1 left-1 size-2.5 rounded-full bg-state-live" aria-label="On screen" />}
		</button>
	)
}

/** What the marks mean, once, under the grid. */
function Legend({ operator }: { operator: boolean }) {
	const item = 'flex items-center gap-1.5'
	return (
		<div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-3 text-xs text-booth-dim">
			<span className={item}>
				<span className="size-2.5 rounded-full bg-warn" /> needs a look{operator ? ' (tap it)' : ''}
			</span>
			<span className={item}>
				<FileX size={13} className="text-warn" /> file missing
			</span>
			<span className={item}>
				<span className="h-3 w-4 rounded-sm border-2 border-dashed border-accent-hi/80" /> {operator ? 'goes here: tap to place' : 'goes here'}
			</span>
			<span className={item}>
				<span className="h-3 w-4 rounded-sm ring-2 ring-state-live" /> on screen
			</span>
			<span className={item}>
				<span className="h-3 w-4 rounded-sm bg-booth-dim opacity-45" /> not this service
			</span>
		</div>
	)
}

const VERDICT: Record<SlotMark, string> = {
	empty: 'Empty',
	today: 'This service',
	different: 'Another file than the lookbook’s',
	'may-differ': 'Named differently from the lookbook’s',
	confirmed: 'Same as the lookbook’s, confirmed by hand',
	missing: 'File missing on this computer',
	'not-today': 'Not this service: free to replace',
	'no-code': 'No media code: left alone',
}

/** One clip, looked at: Arena's picture beside the lookbook's, and the two
 *  answers to a clip that needs a look. */
function Inspect({ m, status, operator, clipId, onClose }: { m: MediaCheckState; status: ArenaStatus; operator: boolean; clipId: number; onClose: () => void }) {
	let found: { slot: ArenaSlot; layer: string; column: string } | null = null
	for (const layer of status.layers) {
		const i = layer.slots.findIndex((s) => s.id === clipId)
		if (i >= 0) {
			const name = columnNamesOf(layer, status)[i] ?? ''
			found = { slot: layer.slots[i] as ArenaSlot, layer: layer.name, column: unnamedColumn(name) ? `column ${i + 1}` : name }
		}
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
	const answers = operator && code !== null && want !== null && file !== null && slot.file !== null && (needsLook(mark) || mark === 'confirmed')
	return (
		<div className="m-4 flex max-w-3xl flex-col gap-3 rounded-ctl bg-booth-panel p-4 text-sm ring-1 ring-booth-edge ring-inset">
			<div className="flex items-center gap-3">
				<span className="min-w-0 flex-1 truncate">
					<span className="font-medium">
						{found.layer} · {found.column}
					</span>
					{code !== null && <span className="text-booth-dim"> · {TYPE_NAMES[mediaCodeOf(code)?.type ?? ''] ?? ''}</span>}
					<span className={needsLook(mark) ? 'text-warn' : 'text-booth-dim'}> · {m.check === null ? 'not checked' : VERDICT[mark]}</span>
					{slot.state === 'playing' && <span className="text-state-live"> · on screen</span>}
				</span>
				<button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-ctl hover:bg-booth-hover">
					<X size={18} aria-hidden />
				</button>
			</div>
			<div className="flex flex-wrap gap-4">
				<figure className="flex flex-col gap-1">
					<Picture url={arenaUrl} large />
					<figcaption className="max-w-64 truncate text-xs text-booth-dim" title={slot.file ?? slot.name}>
						Arena · {slot.file === null ? slot.name : fileName(slot.file)}
					</figcaption>
				</figure>
				{file !== null && want !== null && mark !== 'today' && (
					<figure className="flex flex-col gap-1">
						<Picture url={lookbookThumbUrl(file)} large />
						<figcaption className="max-w-64 truncate text-xs text-booth-dim" title={want}>
							Lookbook · {want}
						</figcaption>
					</figure>
				)}
			</div>
			{answers && (
				<div className="flex flex-wrap items-center gap-2">
					{!under(fetch) && mark !== 'confirmed' && (
						<SmallButton
							onClick={() =>
								m.ask('Use the lookbook’s', [
									updateStep(
										{ code, want, clipIds: clipsToUpdate(code, want, file, status, m.same, m.sizes), lookbookPath: file, allowLookbook: false, allowLive: [] },
										status,
									),
								])
							}
						>
							Use the lookbook&rsquo;s
						</SmallButton>
					)}
					{!under(fetch) && mark !== 'missing' && (
						<SmallButton onClick={() => m.markSame({ code, file: slot.file as string, want, same: mark !== 'confirmed' })}>
							{mark === 'confirmed' ? 'Undo' : 'Arena’s is right'}
						</SmallButton>
					)}
					<FetchWords fetch={fetch} refused={m.refused[code]} />
				</div>
			)}
		</div>
	)
}

function Picture({ url, large = false, fill = false }: { url: string | null; large?: boolean; fill?: boolean }) {
	const [failed, setFailed] = useState<string | null>(null)
	const size = fill ? 'absolute inset-0 size-full' : large ? 'h-36 w-64' : 'h-12 w-20'
	if (url === null || failed === url) return <span className={`${size} shrink-0 rounded-ctl bg-booth-raise`} />
	return <img src={url} alt="" draggable={false} onError={() => setFailed(url)} className={`${size} shrink-0 rounded-ctl bg-booth-raise ${fill ? 'object-cover' : 'object-contain'}`} />
}
