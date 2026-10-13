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
// The plan beside the grid (the owner, 2026-10-13: "we don't really know what
// it's doing sometimes"): every moment of the run sheet, each code, and what
// Update all does with it or why it does nothing (`explainPlan`). A tap on a
// line opens its clip. Under the top line, the latest run's result stays until
// the next: loaded, failed (tap for why), already there.
//
// Inspect only: a tap never fires a clip (Clips is for playing). Every change
// asks first (Confirm) and is the operator's: main refuses outside operator
// mode, and in volunteer mode the buttons that change anything are not drawn
// (the owner, 2026-10-06), so what goes where shows but cannot be tapped.
// HOLD BG's gaps show where the normal background goes (../../shared/holding.ts,
// `backgroundGaps`). Layers top first as Arena's panel reads; PLAYBACK last and only when
// it holds something, since it is rarely used.

import { useState } from 'react'
import { ArrowLeft, FileX, Hand, ListChecks, RefreshCw, X } from 'lucide-react'

import { thumbnailUrl, type ArenaLayer, type ArenaSlot, type ArenaStatus } from '../../shared/arena.js'
import {
	COLUMN_NAMES,
	columnNamesOf,
	codesOn,
	holdingLayers,
	reserved,
	slotCode,
	slotMark,
	type Placement,
	type PlanLine,
	type SlotMark,
	type Unplaced,
} from '../../shared/holding.js'
import { lookbookStem, lookbookThumbUrl, TYPE_NAMES, mediaCodeOf } from '../../shared/media-check.js'
import { runCounts, type FetchRun, type FetchStates } from '../../shared/media-fetch.js'
import type { Channel } from '../../shared/reading.js'
import { useMediaCheck, type MediaCheckState } from '../useMediaCheck.js'
import { useOperator } from '../mode.js'
import { ArenaReading } from './ArenaView.js'
import { FileCompare, FilesToCheck, Picture, ThereButton, needsLook } from './FileCompare.js'
import { Confirm, FetchWords, ServiceLine, SmallButton, Summary, fetchShort, placeStep, under } from './MediaCheck.js'
import { chipLabel, formatAge, staleContent } from './vocabulary.js'

export function HoldingView({ status, now }: { status: Channel<ArenaStatus> | null | undefined; now: number }) {
	return <ArenaReading status={status} now={now} render={(s, ageMs) => <Holding status={s} ageMs={ageMs} now={now} />} />
}

/** What is being placed by hand: one code of one item, into a slot of its layer. */
type Choosing = { item: number; title: string; label: string | null; code: string; want: string; lookbookPath: string }
type Picked = { kind: 'clip'; id: number } | { kind: 'choose'; what: Choosing } | null

/** Whether the plan is open beside the grid: open unless this computer closed it. */
const PLAN_KEY = 'paua.holding.planClosed'
function planOpenAtFirst(): boolean {
	try {
		return localStorage.getItem(PLAN_KEY) !== '1'
	} catch {
		return true
	}
}

const unnamedColumn = (name: string) => /^column\s*#?\s*\d*$/i.test(name.trim()) || name.trim() === ''

/** `onBack`: shown in the Arena view's place, with a way back to it. */
export function Holding({ status, ageMs, now, onBack }: { status: ArenaStatus; ageMs: number | null; now: number; onBack?: () => void }) {
	const m = useMediaCheck(status, now, true)
	const operator = useOperator()
	const [picked, setPicked] = useState<Picked>(null)
	const [details, setDetails] = useState(false)
	const [fetchNote, setFetchNote] = useState<string | null>(null)
	const [planOpen, setPlanOpen] = useState(planOpenAtFirst)
	// Files to check in the grid's place (the owner, 2026-10-13).
	const [filesOpen, setFilesOpen] = useState(false)
	const togglePlan = () => {
		setPlanOpen(!planOpen)
		try {
			localStorage.setItem(PLAN_KEY, planOpen ? '1' : '0')
		} catch {
			// Kept for this view only.
		}
	}
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
	// Codes whose file needs a look, for Files to check.
	const fileTrouble = new Set(
		status.layers.flatMap((l) => l.slots.filter((x) => needsLook(slotMark(x, items, today, m.same, m.sizes))).map((x) => slotCode(x) ?? '')),
	).size
	// What has no column: the tray. Columns not named yet are said once, above.
	const tray = m.unplaced.filter((u) => u.kind !== 'unnamed')
	// Placing by hand (the owner, 2026-10-13: "send a clip and place it anywhere
	// with a confirm"): any column on its layer no other moment has.
	const targets = choosing === null ? new Set<number>() : m.pinTargets(choosing)
	/** A moment's code, to place by hand, or null without a lookbook file. */
	const chooseFor = (item: number, code: string): Choosing | null => {
		const it = items[item]
		const file = it?.files[code]
		return it === undefined || file === undefined ? null : { item, title: it.title, label: it.label, code, want: lookbookStem(file), lookbookPath: file }
	}
	const choose = (what: Choosing | null) => setPicked(what === null ? null : { kind: 'choose', what })

	const tapSlot = (layer: ArenaLayer, slot: ArenaSlot, column: number) => {
		if (choosing === null) {
			const ghost = ghosts.get(`${layer.name}:${column}`)
			if (ghost !== undefined) return operator ? m.ask('Place', [placeStep(ghost)]) : undefined
			return setPicked(picked?.kind === 'clip' && picked.id === slot.id ? null : { kind: 'clip', id: slot.id })
		}
		if (!targets.has(slot.id)) return
		m.askPlaceAt(choosing, column)
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
						{m.runSheet !== null && (
							<button
								type="button"
								onClick={() => setFilesOpen(!filesOpen)}
								aria-pressed={filesOpen}
								className={`h-10 rounded-ctl px-3 text-sm ${filesOpen ? 'bg-accent text-accent-ink' : fileTrouble > 0 ? 'bg-warn/15 text-warn hover:bg-warn/25' : 'bg-booth-raise hover:bg-booth-hover'}`}
							>
								Files to check{fileTrouble > 0 ? ` (${fileTrouble})` : ''}
							</button>
						)}
						<button
							type="button"
							onClick={togglePlan}
							aria-pressed={planOpen}
							title={planOpen ? 'Hide the plan' : 'Show the plan'}
							className={`flex h-10 items-center gap-1.5 rounded-ctl px-3 text-sm ${planOpen ? 'bg-accent text-accent-ink' : 'bg-booth-raise hover:bg-booth-hover'}`}
						>
							<ListChecks size={16} aria-hidden />
							Plan
						</button>
						<button type="button" onClick={m.readItemsAgain} aria-label="Check again" title="Check again" className="grid size-10 place-items-center rounded-ctl bg-booth-raise hover:bg-booth-hover">
							<RefreshCw size={16} aria-hidden />
						</button>
					</span>
				</div>
				{fetchNote !== null && (m.fetches[fetchNote] !== undefined || m.refused[fetchNote] !== undefined) && (
					<p className="flex items-center gap-2 pb-2 text-xs">
						<span className="font-mono">{fetchNote}</span>
						<FetchWords fetch={m.fetches[fetchNote]} refused={m.refused[fetchNote]} />
						{operator && m.fetches[fetchNote]?.state === 'failed' && <ThereButton onClick={() => m.itsThere(fetchNote)} />}
					</p>
				)}
				{m.lastRun !== null && <RunLine run={m.lastRun} fetches={m.fetches} onThere={operator ? m.itsThere : null} />}
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
					<Tray m={m} tray={tray} operator={operator} choosing={choosing} onChoose={choose} />
				)}
			</div>
			<div className="flex min-h-0 flex-1">
			<div className={`min-h-0 min-w-0 flex-1 overflow-auto ${ageMs !== null ? staleContent : ''}`}>
				{filesOpen ? (
					<FilesToCheck m={m} status={status} operator={operator} onClose={() => setFilesOpen(false)} />
				) : (
				<>
				{choosing !== null && (
					<p className="sticky top-0 left-0 z-20 bg-booth-bg px-4 py-2 text-sm">
						Tap a lit slot for <span className="font-mono">{choosing.code}</span> ({choosing.label ?? choosing.title}), for this service: the rest of it follows into
						that column. <button type="button" onClick={() => setPicked(null)} className="ml-2 underline">Cancel</button>
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
									const target = choosing !== null && targets.has(slot.id)
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
														reserved(layer, i + 1, status, m.map) ? (unnamedColumn(columnName) ? (i + 1 === 3 ? 'Countdown' : 'Broadcast BG') : columnName) : null
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
				{picked?.kind === 'clip' && <Inspect m={m} status={status} operator={operator} clipId={picked.id} onClose={() => setPicked(null)} onPlace={(item, code) => choose(chooseFor(item, code))} />}
				</>
				)}
			</div>
			{planOpen && m.runSheet !== null && (
				<PlanPanel
					lines={m.planLines}
					picked={picked?.kind === 'clip' ? picked.id : null}
					onPick={(id) => setPicked({ kind: 'clip', id })}
					pinned={new Set(m.pins.map((p) => p.item))}
					onPlace={operator ? (item, code) => choose(chooseFor(item, code)) : null}
					onUnpin={operator ? m.unpin : null}
				/>
			)}
			</div>
		</div>
	)
}

const TONE: Record<PlanLine['notes'][number]['tone'], string> = {
	do: 'bg-accent-hi',
	ok: 'bg-state-live',
	warn: 'bg-warn',
	quiet: 'bg-booth-faint',
}

/** The plan, beside the grid: each moment, each code, what happens to it and
 *  why. Blue: Update all loads it; green: nothing to do, and why; amber: no
 *  place or no file; grey: not Arena's. */
function PlanPanel({
	lines,
	picked,
	onPick,
	pinned,
	onPlace,
	onUnpin,
}: {
	lines: PlanLine[]
	picked: number | null
	onPick: (clipId: number) => void
	/** Moments placed by hand for this service. */
	pinned: ReadonlySet<number>
	/** Admin: place a moment's code by hand, or take a hand placement back. */
	onPlace: ((item: number, code: string) => void) | null
	onUnpin: ((item: number) => void) | null
}) {
	const counts = { do: 0, ok: 0, warn: 0, quiet: 0 }
	for (const l of lines) for (const n of l.notes) counts[n.tone] += 1
	return (
		<aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-booth-edge px-3 pb-4 text-xs">
			<p className="sticky top-0 z-10 flex flex-wrap gap-x-3 bg-booth-bg py-2 text-booth-dim">
				<span className="font-medium text-booth-ink">Plan</span>
				{counts.do > 0 && <span>{counts.do} to load</span>}
				{counts.warn > 0 && <span className="text-warn">{counts.warn} with no place</span>}
				<span>{counts.ok} right</span>
			</p>
			{lines.length === 0 && <p className="text-booth-dim">Nothing on this run sheet for Arena.</p>}
			{lines.map((l) => (
				<div key={`${l.item}:${l.title}`} className="border-t border-booth-edge/60 py-1.5">
					<p className="flex items-baseline gap-2">
						<span className="min-w-0 flex-1 truncate font-medium">
							{l.label ?? l.title}
							{l.label !== null && l.label !== l.title && <span className="font-normal text-booth-dim"> · {l.title}</span>}
						</span>
						{pinned.has(l.item) && (
							<span className="shrink-0 text-booth-dim">
								by hand
								{onUnpin !== null && (
									<button type="button" onClick={() => onUnpin(l.item)} className="ml-1.5 underline hover:text-booth-ink">
										Undo
									</button>
								)}
							</span>
						)}
					</p>
					{l.notes.map((n) => {
						const row = (
							<>
								<span className={`mt-1 size-2 shrink-0 rounded-full ${TONE[n.tone]}`} />
								<span className="w-11 shrink-0 font-mono">{n.code}</span>
								<span className={`min-w-0 flex-1 ${n.tone === 'warn' ? 'text-warn' : n.tone === 'do' ? '' : 'text-booth-dim'}`}>{n.words}</span>
							</>
						)
						const placeable = onPlace !== null && l.item >= 0 && n.tone !== 'quiet' && !n.words.startsWith('the lookbook has no file') && !n.words.startsWith('the normal background')
						return (
							<div key={n.code} className="flex items-start gap-1">
								{n.clipId === null ? (
									<p className="flex min-w-0 flex-1 gap-2 py-0.5">{row}</p>
								) : (
									<button
										type="button"
										onClick={() => onPick(n.clipId as number)}
										className={`flex min-w-0 flex-1 gap-2 rounded-ctl py-0.5 text-left hover:bg-booth-hover ${picked === n.clipId ? 'bg-booth-raise' : ''}`}
									>
										{row}
									</button>
								)}
								{placeable && (
									<button
										type="button"
										onClick={() => onPlace(l.item, n.code)}
										title={`Place ${n.code} by hand, anywhere on its layer`}
										className="h-6 shrink-0 rounded-ctl px-1.5 text-booth-dim hover:bg-booth-hover hover:text-booth-ink"
									>
										Place…
									</button>
								)}
							</div>
						)
					})}
				</div>
			))}
		</aside>
	)
}

/** The latest run's result, kept until the next (the owner, 2026-10-13):
 *  loaded, failed, already there; a tap lists each code and why. */
function RunLine({ run, fetches, onThere }: { run: FetchRun; fetches: FetchStates; onThere: ((code: string) => void) | null }) {
	const [open, setOpen] = useState(false)
	const n = runCounts(run, fetches)
	const time = new Date(run.at).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })
	const done = run.codes.length - n.going
	const bad = n.failed > 0
	return (
		<div className="pb-2 text-xs">
			<button type="button" onClick={() => setOpen(!open)} className={`flex min-h-8 w-full flex-wrap items-center gap-x-3 rounded-ctl px-2 text-left ${bad ? 'bg-warn/10' : 'bg-booth-raise'}`}>
				<span className="text-booth-dim">
					{run.label.replace(/:.*$/, '')}, {time}
				</span>
				{n.going > 0 ? (
					<span>
						{done} of {run.codes.length} done…
					</span>
				) : (
					<>
						<span>{n.loaded} loaded</span>
						{n.doubted > 0 && <span className="text-warn">{n.doubted} after Arena said no</span>}
						{n.byHand > 0 && <span className="text-warn">{n.byHand} said to be there by hand</span>}
						{n.failed > 0 && <span className="font-medium text-warn">{n.failed} failed</span>}
						{n.copied > 0 && <span>{n.copied} copied only</span>}
						{run.already > 0 && <span className="text-booth-dim">{run.already} already there</span>}
					</>
				)}
				<span className="ml-auto text-booth-dim">{open ? 'Hide' : 'Each code'}</span>
			</button>
			{open && (
				<ul className="mt-1 flex flex-col gap-0.5 px-2">
					{run.codes.map((code) => {
						const f = fetches[code]
						return (
							<li key={code} className="flex items-baseline gap-2">
								<span className="w-11 shrink-0 font-mono">{code}</span>
								{f === undefined || f.at < run.at ? <span className="text-booth-dim">waiting</span> : <FetchWords fetch={f} refused={undefined} />}
								{onThere !== null && f?.state === 'failed' && f.at >= run.at && <ThereButton onClick={() => onThere(code)} />}
							</li>
						)
					})}
					{Object.entries(run.refused).map(([code, why]) => (
						<li key={`r${code}`} className="flex items-baseline gap-2">
							<span className="w-11 shrink-0 font-mono">{code}</span>
							<span className="text-warn">not sent: {why}</span>
						</li>
					))}
				</ul>
			)}
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
					className={`h-7 shrink-0 rounded-ctl px-2 text-xs tabular-nums ${f.state === 'failed' || f.state === 'by-hand' || (f.state === 'sent' && f.doubted !== undefined) ? 'bg-warn/15 text-warn' : 'bg-booth-raise text-booth-dim'}`}
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
			{mark === 'confirmed' && (
				<span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/75 text-warn" title="Said to be right by hand">
					<Hand size={12} aria-label="By hand" />
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
				<Hand size={13} className="text-warn" /> right, said by hand
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
	confirmed: 'Right, said by hand',
	missing: 'File missing on this computer',
	'not-today': 'Not this service: free to replace',
	'no-code': 'No media code: left alone',
}

/** One clip, looked at: Arena's picture beside the lookbook's, and the two
 *  answers to a clip that needs a look. */
function Inspect({
	m,
	status,
	operator,
	clipId,
	onClose,
	onPlace,
}: {
	m: MediaCheckState
	status: ArenaStatus
	operator: boolean
	clipId: number
	onClose: () => void
	/** Place this clip's moment somewhere else by hand. */
	onPlace: (item: number, code: string) => void
}) {
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
	const fetch = code === null ? undefined : m.fetches[code]
	// The moment this clip is: the one the plan has in this clip, else the first with its code.
	const owner =
		code === null
			? undefined
			: (m.planLines.find((l) => l.item >= 0 && l.notes.some((n) => n.code === code && n.clipId === clipId)) ?? m.planLines.find((l) => l.item >= 0 && l.notes.some((n) => n.code === code)))
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
			<FileCompare m={m} status={status} slot={slot} operator={operator} />
			{operator && owner !== undefined && code !== null && !under(fetch) && (
				<div className="flex flex-wrap items-center gap-2">
					<SmallButton onClick={() => onPlace(owner.item, code)}>Place {owner.label ?? owner.title} elsewhere…</SmallButton>
					<span className="text-xs text-booth-dim">any free column on its layer; the rest of it follows</span>
				</div>
			)}
		</div>
	)
}
