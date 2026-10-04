// The media check, inside the Arena view (the owner's choice, 2026-10-04):
// every B, F and A code the run sheet calls for, in run-sheet order, marked
// loaded, not in Arena, file missing, may differ, or not checkable. The service
// is the run order's, or one picked by hand. Its state is ../useMediaCheck.ts,
// shared with the Holding view (./HoldingView.tsx), which shows the same
// answers laid out as Arena's columns; the rules are ../../shared/media-check.ts
// and ../../shared/holding.ts.
//
// Operator mode for every change (main refuses otherwise): Fetch (into every
// clip with the old file), Place (into the suggested slot), Same, Update all.
// It re-compares on every Arena update, so loading the right clip clears its
// mark without asking the lookbook again.

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import type { ArenaStatus } from '../../shared/arena.js'
import { clipsToUpdate, placementWords, type Placement, type Unplaced, type UpdateStep } from '../../shared/holding.js'
import { TYPE_NAMES, mediaCodeOf, type CodeCheck, type LookbookService, type SameMark } from '../../shared/media-check.js'
import { megabytes, type FetchRequest, type FetchStates } from '../../shared/media-fetch.js'
import { useMediaCheck, type Load, type MediaCheckState } from '../useMediaCheck.js'
import { chipLabel, formatAge } from './vocabulary.js'

export function MediaCheck({ status, now }: { status: ArenaStatus; now: number }) {
	const [open, setOpen] = useState(false)
	const m = useMediaCheck(status, now, open)
	const total = m.check === null ? 0 : Object.values(m.check.counts).reduce((a, b) => a + b, 0)
	return (
		<div className={`shrink-0 border-b border-booth-edge ${m.trouble > 0 ? 'bg-warn/10' : ''}`}>
			<button type="button" onClick={() => setOpen(!open)} className="flex h-12 w-full min-w-0 items-center gap-3 px-4 text-left text-sm">
				<span className={chipLabel}>Media</span>
				{/* The verdict keeps its room; the service's name gives way first. */}
				{m.service !== null && <span className="min-w-0 truncate text-booth-dim">{m.service.name}</span>}
				<span className="shrink-0">
					<Summary m={m} total={total} />
				</span>
				<ChevronDown size={18} className={`ml-auto shrink-0 text-booth-dim transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
			</button>
			{open && (
				<div className="max-h-[60vh] overflow-y-auto px-4 pb-3">
					<ServiceLine m={m} />
					{m.service !== null && <Result m={m} status={status} now={now} />}
				</div>
			)}
		</div>
	)
}

/** The check in a few words: what to look at, or that all is loaded. */
export function Summary({ m, total }: { m: MediaCheckState; total: number }) {
	const { check } = m
	if (m.service === null) return m.byHand ? <span className="text-booth-dim">Pick a service</span> : <FollowWords plan={m.plan} load={m.followedLoad} short />
	if (m.items.kind === 'reading') return <span className="text-booth-dim">Reading the lookbook…</span>
	if (m.items.kind === 'read' && !m.items.read.ok) return <span className="text-warn">The lookbook could not be read</span>
	if (check === null) return <span className="text-booth-dim">Not checked</span>
	if (total === 0) return <span className="text-booth-dim">No Arena media on this run sheet</span>
	if (m.trouble > 0) return <span className="text-warn">{m.trouble === 1 ? '1 to look at' : `${m.trouble} to look at`}</span>
	const unsettled = check.counts['no-lookbook-file']
	if (unsettled > 0) return <span className="text-booth-dim">{unsettled === 1 ? '1 the lookbook has no file for' : `${unsettled} the lookbook has no file for`}</span>
	if (check.counts['same-by-hand'] > 0) return <span>All {total} loaded, {check.counts['same-by-hand']} confirmed the same by hand</span>
	return <span>All {total} loaded</span>
}

/** Which service is checked, and the switch between following the run order
 *  and picking by hand. */
export function ServiceLine({ m }: { m: MediaCheckState }) {
	return (
		<>
			<div className="flex min-w-0 items-center gap-3 py-2 text-sm">
				{m.byHand ? (
					<span className="min-w-0 flex-1 text-booth-dim">Picked by hand</span>
				) : (
					<span className="min-w-0 flex-1 truncate">
						<FollowWords plan={m.plan} load={m.followedLoad} short={false} />
					</span>
				)}
				<SmallButton onClick={() => m.follow(m.byHand)}>{m.byHand ? 'Follow the run order' : 'Pick by hand'}</SmallButton>
			</div>
			{m.byHand && <ServicePicker load={m.services} offered={m.offered} picked={m.service?.id ?? null} onPick={m.pick} onRetry={m.readServices} />}
		</>
	)
}

/** Where following the run order has got to. Never a guess: a run order with
 *  no service open, or one the lookbook does not have, says so. */
function FollowWords({ plan, load, short }: { plan: string | null; load: Load<LookbookService | null> | null; short: boolean }) {
	const lead = short ? '' : 'Following the run order: '
	if (plan === null) return <span className="text-booth-dim">{short ? 'The run order has no service open' : `${lead}it has no service open`}</span>
	if (load === null || load.kind !== 'read') return <span className="text-booth-dim">{short ? 'Finding the run order’s service…' : 'Following the run order…'}</span>
	if (!load.read.ok) return <span className="text-warn">{short ? 'The lookbook could not be read' : `${lead}${load.read.detail}`}</span>
	if (load.read.value === null) return <span className="text-booth-dim">{short ? 'This service isn’t in the lookbook yet' : `${lead}its service isn’t in the lookbook yet`}</span>
	const s = load.read.value
	return (
		<span>
			{lead}
			{s.name}
			<span className="text-booth-dim">
				{' '}
				· {s.date}
				{s.time !== null && ` · ${s.time}`}
			</span>
		</span>
	)
}

function ServicePicker({
	load,
	offered,
	picked,
	onPick,
	onRetry,
}: {
	load: Load<LookbookService[]>
	offered: LookbookService[]
	picked: string | null
	onPick: (id: string) => void
	onRetry: () => void
}) {
	if (load.kind !== 'read') return <p className="py-2 text-sm text-booth-dim">Reading the lookbook’s services…</p>
	if (!load.read.ok) {
		return (
			<p className="flex items-center gap-3 py-2 text-sm text-warn">
				<span className="min-w-0 flex-1">{load.read.detail}</span>
				<SmallButton onClick={onRetry}>Try again</SmallButton>
			</p>
		)
	}
	if (offered.length === 0) return <p className="py-2 text-sm text-booth-dim">The lookbook has no services from today to a week ahead.</p>
	return (
		<div className="flex flex-wrap gap-2 py-2">
			{offered.map((s) => (
				<button
					key={s.id}
					type="button"
					onClick={() => onPick(s.id)}
					className={`flex h-12 min-w-0 flex-col justify-center rounded-lg px-3.5 text-left text-xs transition-colors active:scale-[0.98] ${
						s.id === picked ? 'bg-booth-raise nacre-ring' : 'bg-booth-panel ring-1 ring-booth-edge ring-inset hover:bg-booth-strip'
					}`}
				>
					<span className="truncate text-sm">{s.name}</span>
					<span className="text-booth-dim">
						{s.date}
						{s.time !== null && ` · ${s.time}`}
					</span>
				</button>
			))}
		</div>
	)
}

/** When the run sheet was read, Check again, and Update all. */
export function ReadLine({ m, now }: { m: MediaCheckState; now: number }) {
	if (m.items.kind !== 'read') return <p className="py-2 text-sm text-booth-dim">Reading the run sheet…</p>
	const read = m.items.read
	return (
		<div className="flex items-center gap-3 border-t border-booth-edge py-2 text-xs text-booth-dim">
			<span className="min-w-0 flex-1 truncate">
				{read.ok ? `Run sheet read ${formatAge(Math.max(0, now - read.at))}` : <span className="text-warn">{read.detail}</span>}
			</span>
			{m.plannedUpdate.steps.length > 0 && <SmallButton onClick={m.askUpdateAll}>Update all</SmallButton>}
			<SmallButton onClick={m.readItemsAgain}>Check again</SmallButton>
		</div>
	)
}

/** What a Fetch, a Place or Update all will copy and load into Arena, before
 *  it does: nothing is sent until Load (the owner, 2026-10-05). */
export function Confirm({ m }: { m: MediaCheckState }) {
	if (m.asking === null) return null
	const { title, steps, unplaced } = m.asking
	return (
		<div className="my-2 rounded-lg bg-booth-raise p-3 text-sm ring-1 ring-warn/60 ring-inset">
			<p className="mb-2 font-medium">{title}</p>
			<ul className="mb-2 flex flex-col gap-1 text-xs">
				{steps.map((s) => (
					<li key={s.request.code} className="truncate">
						{s.what}
					</li>
				))}
				{unplaced
					.filter((u) => u.kind !== 'unnamed')
					.map((u) => (
						<li key={`${u.item}:${u.code}`} className="truncate text-booth-dim">
							{u.code} ({u.label ?? u.title}): left out, {u.detail}
						</li>
					))}
				{unplaced.some((u) => u.kind === 'unnamed') && (
					<li className="text-booth-dim">Nothing placed: {unplaced.find((u) => u.kind === 'unnamed')?.detail}</li>
				)}
			</ul>
			<p className="mb-2 text-xs text-booth-dim">
				Copied from the graphics folder into the local folder, then loaded into Arena. Never into a playing clip; nothing is overwritten. Operator mode.
			</p>
			<div className="flex gap-2">
				<SmallButton onClick={m.confirm}>Load</SmallButton>
				<SmallButton onClick={m.cancel}>Cancel</SmallButton>
			</div>
		</div>
	)
}

/** Placing one code of one item in its column, said. */
export function placeStep(p: Placement): UpdateStep {
	return { request: { code: p.code, want: p.want, clipIds: [p.clipId] }, what: `${p.code} (${p.label ?? p.title}): ${p.want} into ${placementWords(p)}` }
}

/** Loading a newer file into clips, said: where, or how many. */
export function updateStep(req: FetchRequest, status: ArenaStatus): UpdateStep {
	if (req.clipIds.length === 0) return { request: req, what: `${req.code}: copy ${req.want} into the local folder only (no place in Arena)` }
	const places = req.clipIds.map((id) => placeOf(id, status)).filter((p) => p !== null)
	const where = places.length === 1 ? places[0] : `${req.clipIds.length} clips with the old file`
	return { request: req, what: `${req.code}: load ${req.want} into ${where}` }
}

function placeOf(clipId: number, status: ArenaStatus): string | null {
	for (const layer of status.layers) {
		const i = layer.slots.findIndex((s) => s.id === clipId)
		if (i >= 0) return `${layer.name} · ${status.columns[i]?.name ?? 'column'} (column ${i + 1})`
	}
	return null
}

function Result({ m, status, now }: { m: MediaCheckState; status: ArenaStatus; now: number }) {
	return (
		<div>
			<ReadLine m={m} now={now} />
			<Confirm m={m} />
			{m.check?.items.map((item) => (
				<div key={item.index} className="border-t border-booth-edge/60 py-2">
					<div className="truncate text-sm">
						{item.title}
						{item.label !== null && <span className="text-booth-dim"> · {item.label}</span>}
					</div>
					<ul className="mt-1 flex flex-col gap-1">
						{item.codes.map((c, j) => (
							<CodeRow
								key={j}
								check={c}
								m={m}
								status={status}
								placement={m.placements.find((p) => p.item === item.index && p.code === c.code) ?? null}
								unplaced={m.unplaced.find((u) => u.item === item.index && u.code === c.code) ?? null}
							/>
						))}
					</ul>
				</div>
			))}
		</div>
	)
}

/** One code of one item: what it is, what became of it, and whether it is in
 *  its item's column. Amber only where someone must act; a code the check
 *  could not settle is said, never shown as loaded. */
function CodeRow({
	check,
	m,
	status,
	placement,
	unplaced,
}: {
	check: CodeCheck
	m: MediaCheckState
	status: ArenaStatus
	placement: Placement | null
	unplaced: Unplaced | null
}) {
	const type = TYPE_NAMES[mediaCodeOf(check.code)?.type ?? ''] ?? ''
	const where = (at: { layer: string; column: number }) => `${at.layer} · column ${at.column}`
	const fetch = m.fetches[check.code]
	const noPlace = unplaced !== null && unplaced.kind !== 'no-file' ? `No place: ${unplaced.detail}` : null
	let state: React.ReactNode
	let detail: string | null = null
	switch (check.state) {
		case 'ok':
		case 'same-by-hand':
			if (placement !== null) {
				state = <span className="text-warn">not in {placement.columnName || 'its column'}</span>
				detail = `In ${where(check.at)}; goes in ${placementWords(placement)}`
			} else {
				state = (
					<span className="text-booth-dim">
						✓ {where(check.at)}
						{check.state === 'same-by-hand' && ' · confirmed the same by hand'}
					</span>
				)
				detail = noPlace ?? (check.state === 'same-by-hand' ? `${fileName(check.at.file)}; the lookbook has ${check.want}` : null)
			}
			break
		case 'not-loaded':
			state = <span className="text-warn">not in Arena</span>
			detail = placement !== null ? `Goes in ${placementWords(placement)}` : noPlace
			break
		case 'not-on-disk':
			state = <span className="text-warn">file missing on this computer</span>
			detail = `${where(check.at)} · ${check.at.file}`
			break
		case 'other-version':
			state = <span className="text-warn">may differ</span>
			detail = `${where(check.at)} has ${fileName(check.at.file)}; the lookbook has ${check.want}`
			break
		case 'no-lookbook-file':
			state = <span className="text-booth-dim">? the lookbook has no file{check.at !== null && ` · in ${where(check.at)}`}</span>
			break
	}
	// An update loads every clip with the old or missing file; Place puts the
	// code in its item's column; Copy here only copies, when there is no place.
	const update: FetchRequest | null =
		check.state === 'other-version' || check.state === 'not-on-disk'
			? { code: check.code, want: check.want, clipIds: clipsToUpdate(check.code, check.want, status, m.same) }
			: null
	const copyOnly = check.state === 'not-loaded' && placement === null ? { code: check.code, want: check.want, clipIds: [] } : null
	const mark: SameMark | null =
		check.state === 'other-version' || check.state === 'same-by-hand'
			? { code: check.code, file: check.at.file, want: check.want, same: check.state === 'other-version' }
			: null
	const any = update !== null || copyOnly !== null || placement !== null || mark !== null
	return (
		<li className="flex min-w-0 flex-col text-sm">
			<span className="flex min-w-0 items-center gap-2">
				<span className="w-14 shrink-0 font-mono text-xs">{check.code}</span>
				<span className="w-20 shrink-0 text-xs text-booth-dim">{type}</span>
				<span className="min-w-0 truncate">{state}</span>
				{any && (
					<span className="ml-auto flex shrink-0 items-center gap-2">
						<FetchWords fetch={fetch} refused={m.refused[check.code]} />
						{!under(fetch) && (
							<>
								{mark !== null && <SmallButton onClick={() => m.markSame(mark)}>{mark.same ? 'Same' : 'Undo'}</SmallButton>}
								{update !== null && <SmallButton onClick={() => m.ask('Fetch', [updateStep(update, status)])}>Fetch</SmallButton>}
								{placement !== null && <SmallButton onClick={() => m.ask('Place', [placeStep(placement)])}>Place</SmallButton>}
								{copyOnly !== null && <SmallButton onClick={() => m.ask('Copy here', [updateStep(copyOnly, status)])}>Copy here</SmallButton>}
							</>
						)}
					</span>
				)}
			</span>
			{detail !== null && <span className="truncate pl-[8.5rem] text-xs text-booth-dim">{detail}</span>}
		</li>
	)
}

/** A fetch still going: no second tap until it ends. */
export const under = (f: FetchStates[string] | undefined) => f?.state === 'finding' || f?.state === 'copying' || f?.state === 'loading'

/** How a fetch is going, in a few words beside its code. */
export function FetchWords({ fetch, refused }: { fetch: FetchStates[string] | undefined; refused: string | undefined }) {
	if (refused !== undefined) return <span className="max-w-72 truncate text-xs text-warn">{refused}</span>
	if (fetch === undefined) return null
	switch (fetch.state) {
		case 'finding':
			return <span className="text-xs text-booth-dim">finding it…</span>
		case 'copying':
			return (
				<span className="flex items-center gap-2 text-xs text-booth-dim tabular-nums">
					<span className="h-1.5 w-24 overflow-hidden rounded-full bg-booth-edge">
						<span className="block h-full bg-booth-ink" style={{ width: `${fetch.total === 0 ? 100 : (fetch.done / fetch.total) * 100}%` }} />
					</span>
					{megabytes(fetch.done)} of {megabytes(fetch.total)} MB
				</span>
			)
		case 'loading':
			return (
				<span className="text-xs text-booth-dim">
					loading into Arena{fetch.of > 1 ? ` (${fetch.done + 1} of ${fetch.of})` : ''}…
				</span>
			)
		case 'sent':
			return (
				<span className="max-w-72 truncate text-xs text-booth-dim">
					sent {fetch.file}
					{fetch.clips > 1 ? ` to ${fetch.clips} clips` : ''}; checking…
				</span>
			)
		case 'copied':
			return <span className="max-w-72 truncate text-xs text-booth-dim">copied {fetch.file} here; put it in Arena by hand</span>
		case 'failed':
			return (
				<span className="max-w-72 truncate text-xs text-warn" title={fetch.detail}>
					{fetch.detail}
				</span>
			)
	}
}

export function fileName(path: string): string {
	return path.split(/[\\/]/).at(-1) ?? path
}

export function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
	return (
		<button type="button" onClick={onClick} className="h-10 shrink-0 rounded-lg bg-booth-raise px-3.5 text-sm font-medium hover:bg-booth-hover active:scale-[0.98]">
			{children}
		</button>
	)
}
