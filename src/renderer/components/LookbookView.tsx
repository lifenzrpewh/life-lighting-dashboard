// The Lookbook view: the service's media, one card per moment of the run
// sheet, as the lookbook composes it, against Arena and ProPresenter, to get a
// service ready: load, check, fix.
//
// One view since 2026-10-14 (the owner's interview, that evening): Holding
// (Arena's grid, its plan beside it, a tray, a legend, a result line) and the
// Lookbook (one big card a moment) said the same things in five places, and
// the owner wanted "easy to understand what is happening at a glance". So:
// - One card per moment, in service order, with a state anyone reads from
//   across the booth: In Arena, To load, Loading, On screen, or the problem
//   itself (Wrong file?, File missing, No spot, Didn't load; "2 problems" for
//   more), not a word that only says something is wrong (the owner, 2026-10-22).
// - Its pieces as chips (BG, FG, A, LT), each saying where it goes or what is
//   wrong in a word; nothing said about a piece that is right but its code.
// - A problem sits on its own card with its fix there (Compare, Choose a slot,
//   It's there), and the top line's "n problems" shows only those.
// - Load: tick cards and Load n, one confirmation for all of them; or Update
//   all, as before. A card changes in place as its files load; the top count is
//   the result.
// - Which parts (the owner, 2026-10-14: "choose which PART of it you load, but
//   keeping it clean"): the chips are the switches. Ticking a card lights every
//   part with something to load; a tap on a chip leaves that part out, or, on a
//   card not ticked, picks just that part. Nothing else on screen.
// - Where it lands (the owner, 2026-10-22: "no obvious idea what things are
//   going where … UNLESS you know the arena layout"): each card says "Lands in
//   PROMO 2 · column 12 · replaces CF455" over a strip of Arena's columns with
//   its own lit, and has Move (Admin): its layer's clips, lit where it may go,
//   a PROMO or spare column only, a taken one a swap. A move lasts this service.
// - Card size is a zoom, per computer: Big (as the Lookbook was), Two a row,
//   Rows, or Map (the owner, 2026-10-22): Arena's holding grid, each column's
//   moment over it, what will load dashed; tap a moment, then a lit column, to
//   move it, as Move does.
// - Lower thirds read-only from ProPresenter's announcement playlist (the
//   Announcements view's check); loading them from here is for later.
//
// Every change asks first (Confirm) and is Admin's: main refuses otherwise, and
// for a volunteer the buttons are not drawn (the owner, 2026-10-06). The rules
// are ../../shared/holding.ts (`looksOf`, `lookSteps`, `moveTargets`), the same
// as Update all's, never a second guess.

import { useEffect, useState } from 'react'
import { Check, FileX, Grid3x3, LayoutGrid, Minus, Rows3, Square, RefreshCw, X } from 'lucide-react'

import { thumbnailUrl, type ArenaLayer, type ArenaStatus } from '../../shared/arena.js'
import { checkAnnouncements, sessionOf, wantedAnnouncements } from '../../shared/announcements.js'
import { COLUMN_NAMES, codesOn, columnNamesOf, holdingLayers, layerKeyOf, lookSteps, looksOf, slotCode, slotMark, type CodeState, type Landing, type Look, type Placement, type UpdateStep } from '../../shared/holding.js'
import { lookbookThumbUrl, mediaCodeOf, type LookbookItem } from '../../shared/media-check.js'
import type { Channel } from '../../shared/reading.js'
import { useMediaCheck, type MediaCheckState } from '../useMediaCheck.js'
import { useOperator } from '../mode.js'
import { ArenaReading } from './ArenaView.js'
import { FileCompare, ReplaceButton, ThereButton, needsLook } from './FileCompare.js'
import { Confirm, FetchWords, ServiceLine, SmallButton, fetchShort, under } from './MediaCheck.js'
import { Button } from './ui.js'
import { chipLabel, formatAge, staleContent } from './vocabulary.js'

export function LookbookView({ status, now }: { status: Channel<ArenaStatus> | null | undefined; now: number }) {
	return <ArenaReading status={status} now={now} render={(s, ageMs) => <Lookbook status={s} ageMs={ageMs} now={now} />} />
}

/** How big a card is: the owner's zoom (2026-10-14), Big by default; or the
 *  Map in place of the cards (2026-10-22). */
type Size = 'big' | 'two' | 'rows' | 'map'
const SIZE_KEY = 'paua.lookbook.size'
function storedSize(): Size {
	try {
		const v = localStorage.getItem(SIZE_KEY)
		return v === 'two' || v === 'rows' || v === 'map' ? v : 'big'
	} catch {
		return 'big'
	}
}

const unnamedColumn = (name: string) => /^column\s*#?\s*\d*$/i.test(name.trim()) || name.trim() === ''

/** A moment's code to move, as `moveTargets` and `askMoveTo` take it. */
type Choosing = { item: number; code: string }

/** Each step once per code: two moments sharing a background load it once,
 *  into every clip either asked for. */
function mergeSteps(steps: UpdateStep[]): UpdateStep[] {
	const out = new Map<string, UpdateStep>()
	for (const s of steps) {
		const had = out.get(s.request.code)
		if (had === undefined) out.set(s.request.code, s)
		else
			out.set(s.request.code, {
				request: { ...had.request, clipIds: [...new Set([...had.request.clipIds, ...s.request.clipIds])] },
				what: had.what === s.what ? had.what : `${had.what}; ${s.what}`,
			})
	}
	return [...out.values()]
}

/** What a card says from across the booth. */
type CardState = 'loading' | 'needs' | 'load' | 'ready' | 'other'

export function Lookbook({ status, ageMs, now, onBack }: { status: ArenaStatus; ageMs: number | null; now: number; onBack?: () => void }) {
	const m = useMediaCheck(status, now, true)
	const operator = useOperator()
	const [details, setDetails] = useState(false)
	const [size, setSizeState] = useState<Size>(storedSize)
	const setSize = (s: Size) => {
		setSizeState(s)
		try {
			localStorage.setItem(SIZE_KEY, s)
		} catch {
			// Kept for this view only.
		}
	}
	const [onlyNeeds, setOnlyNeeds] = useState(false)
	// The parts picked to load, by moment: each a set of codes.
	const [picked, setPicked] = useState<ReadonlyMap<number, ReadonlySet<string>>>(new Map())
	const lowerThirds = useLowerThirds(m)

	const items = m.runSheet ?? []
	const looks = looksOf(items, status, m.same, m.sizes, m.map, m.pins).filter((l) => l.codes.length > 0)
	const stepsOf = new Map(looks.map((l) => [l.item, l.ready ? [] : lookSteps(l.item, items, status, m.same, m.sizes, m.map, m.pins)]))
	const stateOf = (look: Look): CardState => {
		if (look.codes.some((c) => under(m.fetches[c.code]))) return 'loading'
		if (problemsOf(look, m).length > 0) return 'needs'
		if ((stepsOf.get(look.item) ?? []).length > 0) return 'load'
		if (look.codes.every((c) => c.state === 'not-arena')) return 'other'
		return 'ready'
	}
	const states = new Map(looks.map((l) => [l.item, stateOf(l)]))
	const count = (s: CardState) => [...states.values()].filter((x) => x === s).length
	const arenaLooks = looks.filter((l) => states.get(l.item) !== 'other')
	const ready = count('ready')
	const toLoad = count('load')
	const needs = count('needs')
	const problemCount = looks.reduce((n, l) => n + (states.get(l.item) === 'needs' ? groupProblems(problemsOf(l, m)).length : 0), 0)
	const loading = count('loading')
	// A part can be picked while its moment has a step for it: Admin, not loading.
	const loadableCodes = (i: number): string[] =>
		!operator || states.get(i) === 'loading' ? [] : [...new Set((stepsOf.get(i) ?? []).map((st) => st.request.code))]
	// Picks hold only while their part can still be loaded.
	const pickedOf = (i: number): string[] => {
		const can = loadableCodes(i)
		return [...(picked.get(i) ?? [])].filter((c) => can.includes(c))
	}
	const pickedItems = looks.map((l) => l.item).filter((i) => pickedOf(i).length > 0)
	const parts = pickedItems.reduce((n, i) => n + pickedOf(i).length, 0)
	useEffect(() => {
		if (onlyNeeds && needs === 0) setOnlyNeeds(false)
	}, [onlyNeeds, needs])
	const setPicks = (i: number, codes: string[]) => {
		const next = new Map(picked)
		if (codes.length === 0) next.delete(i)
		else next.set(i, new Set(codes))
		setPicked(next)
	}
	/** The card's tick: everything it can load, or nothing. */
	const tickCard = (i: number) => setPicks(i, pickedOf(i).length > 0 ? [] : loadableCodes(i))
	/** A chip: in or out. */
	const tickPart = (i: number, code: string) => {
		const now = pickedOf(i)
		setPicks(i, now.includes(code) ? now.filter((c) => c !== code) : [...now, code])
	}
	const stepsPicked = (i: number) => {
		const codes = pickedOf(i)
		return (stepsOf.get(i) ?? []).filter((st) => codes.includes(st.request.code))
	}
	const loadPicked = () => {
		const steps = mergeSteps(pickedItems.flatMap(stepsPicked))
		if (steps.length === 0) return
		const one = pickedItems.length === 1 ? items[pickedItems[0] as number] : undefined
		m.ask(`Load ${one !== undefined ? one.title : `${pickedItems.length} moments`}`, steps, [], [], () => setPicked(new Map()))
	}
	const holding = holdingLayers(status)[0]
	const headerNames = holding === undefined ? status.columns.map((c) => c.name) : columnNamesOf(holding, status)
	const named = headerNames.some((n) => !unnamedColumn(n))
	const shown = onlyNeeds ? looks.filter((l) => states.get(l.item) === 'needs') : looks

	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="max-h-[55%] shrink-0 overflow-y-auto border-b border-booth-edge px-4">
				<div className="flex min-h-12 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-1 text-sm">
					{onBack !== undefined && (
						<button type="button" onClick={onBack} className="-ml-2 h-10 shrink-0 rounded-ctl px-2 text-booth-dim hover:bg-booth-hover">
							← Arena
						</button>
					)}
					<span className={chipLabel}>Lookbook</span>
					<button type="button" onClick={() => setDetails(!details)} className="min-w-0 truncate rounded-ctl px-1 text-booth-dim hover:text-booth-ink">
						{m.service !== null ? `${m.service.name}${m.byHand ? ' (picked)' : ''}` : 'Which service?'}
					</button>
					{m.runSheet !== null && arenaLooks.length > 0 && (
						<span className="flex shrink-0 items-center gap-3 tabular-nums">
							<span className={ready === arenaLooks.length ? 'font-bold text-state-live' : ''}>
								{ready === arenaLooks.length ? 'All in Arena' : `${ready} of ${arenaLooks.length} in Arena`}
							</span>
							{loading > 0 && <span className="text-accent-hi">{loading} loading…</span>}
							{toLoad > 0 && <span className="text-accent-hi">{toLoad} to load</span>}
							{needs > 0 && (
								<button
									type="button"
									onClick={() => setOnlyNeeds(!onlyNeeds)}
									aria-pressed={onlyNeeds}
									className={`h-8 rounded-ctl px-2.5 font-bold ${onlyNeeds ? 'bg-warn text-black' : 'bg-warn/15 text-warn hover:bg-warn/25'}`}
								>
									{problemCount} problem{problemCount === 1 ? '' : 's'}{onlyNeeds ? ' · show all' : ''}
								</button>
							)}
						</span>
					)}
					<span className="ml-auto flex shrink-0 items-center gap-2">
						<SizeSwitch size={size} onSize={setSize} />
						{operator && parts > 0 && (
							<Button variant="primary" size="sm" onClick={loadPicked}>
								Load {parts} {parts === 1 ? 'part' : 'parts'}
							</Button>
						)}
						{operator && m.plannedUpdate.steps.length > 0 && <SmallButton onClick={m.askUpdateAll}>Update all</SmallButton>}
						{operator && m.plannedUpdate.steps.length === 0 && m.oldFgs.length > 0 && <SmallButton onClick={m.askClearOld}>Clear old FGs ({m.oldFgs.length})</SmallButton>}
						<button type="button" onClick={m.readItemsAgain} aria-label="Check again" title="Check again" className="grid size-10 place-items-center rounded-ctl bg-booth-raise hover:bg-booth-hover">
							<RefreshCw size={16} aria-hidden />
						</button>
					</span>
				</div>
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
			</div>
			<div className={`@container min-h-0 flex-1 overflow-y-auto p-4 ${ageMs !== null ? staleContent : ''}`}>
				{size === 'map' && <LandingMap m={m} status={status} looks={looks} states={states} operator={operator} names={headerNames} />}
				<div hidden={size === 'map'} className={size === 'two' ? 'mx-auto grid max-w-[2200px] grid-cols-1 gap-4 @3xl:grid-cols-2' : `mx-auto flex max-w-[2200px] flex-col ${size === 'big' ? 'gap-6' : 'gap-2'}`}>
					{(size === 'map' ? [] : shown).map((look) => (
						<Card
							key={look.item}
							m={m}
							status={status}
							operator={operator}
							item={items[look.item] as LookbookItem}
							look={look}
							state={states.get(look.item) ?? 'other'}
							size={size}
							loadable={loadableCodes(look.item)}
							picked={pickedOf(look.item)}
							onTick={() => tickCard(look.item)}
							onPart={(code) => tickPart(look.item, code)}
							onLoad={() => {
								const chosen = stepsPicked(look.item)
								const steps = chosen.length > 0 ? chosen : (stepsOf.get(look.item) ?? [])
								m.ask(`Load ${items[look.item]?.title ?? ''}`, steps, [], [], () => setPicks(look.item, []))
							}}
							lowerThirds={lowerThirds}
							columnNames={headerNames}
						/>
					))}
				</div>
				{m.runSheet !== null && looks.length === 0 && <p className="p-6 text-center text-booth-dim">This run sheet has no media.</p>}
			</div>
		</div>
	)
}

/** The zoom: three sizes of card. */
function SizeSwitch({ size, onSize }: { size: Size; onSize: (s: Size) => void }) {
	const options: { value: Size; label: string; icon: typeof Square }[] = [
		{ value: 'big', label: 'Big', icon: Square },
		{ value: 'two', label: 'Two a row', icon: LayoutGrid },
		{ value: 'rows', label: 'Rows', icon: Rows3 },
		{ value: 'map', label: 'Map', icon: Grid3x3 },
	]
	return (
		<span role="radiogroup" aria-label="Card size" className="inline-flex rounded-ctl bg-booth-raise p-1">
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					role="radio"
					aria-checked={o.value === size}
					aria-label={o.label}
					title={o.label}
					onClick={() => onSize(o.value)}
					className={`grid size-8 place-items-center rounded-[3px] ${o.value === size ? 'bg-accent text-accent-ink' : 'text-booth-dim hover:text-booth-ink'}`}
				>
					<o.icon size={16} aria-hidden />
				</button>
			))}
		</span>
	)
}

/** What on a card needs a person: a code whose file differs or is missing,
 *  one with no column, a load that failed or was refused. */
function problemsOf(look: Look, m: MediaCheckState): { code: string; kind: 'look' | 'missing' | 'no-place' | 'failed' }[] {
	const out: { code: string; kind: 'look' | 'missing' | 'no-place' | 'failed' }[] = []
	for (const c of look.codes) {
		const f = m.fetches[c.code]
		if (f?.state === 'failed' || m.refused[c.code] !== undefined) out.push({ code: c.code, kind: 'failed' })
		else if (c.state === 'look' || c.state === 'missing' || c.state === 'no-place') out.push({ code: c.code, kind: c.state })
	}
	return out
}

const TYPE_SHORT: Record<string, string> = { B: 'BG', F: 'FG', A: 'A', T: 'LT', D: 'CD' }

/** Lower thirds as ProPresenter's announcement playlist has them, by code:
 *  read-only, the Announcements view's own check, asked every 30 s while shown.
 *  Empty when there is no ProPresenter, no service or no playlist. */
function useLowerThirds(m: MediaCheckState): ReadonlyMap<string, 'there' | 'missing'> {
	const [found, setFound] = useState<ReadonlyMap<string, 'there' | 'missing'>>(new Map())
	const session = m.service === null ? null : sessionOf(m.service)
	const want = wantedAnnouncements(m.runSheet ?? [])
	const key = `${session}|${want.map((w) => w.code).join(',')}`
	useEffect(() => {
		const api = window.life
		if (session === null || api === undefined || want.length === 0) return setFound(new Map())
		let alive = true
		const ask = () =>
			void api.announcements(session).then((r) => {
				if (!alive) return
				if (r === undefined || !r.output.ok) return setFound(new Map())
				const check = checkAnnouncements(r.output.name, want, r.output.items)
				setFound(new Map(check.rows.map((row) => [row.code, row.state])))
			})
		ask()
		const id = setInterval(ask, 30_000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [key])
	return found
}

function Card({
	m,
	status,
	operator,
	item,
	look,
	state,
	size,
	loadable,
	picked,
	onTick,
	onPart,
	onLoad,
	lowerThirds,
	columnNames,
}: {
	m: MediaCheckState
	status: ArenaStatus
	operator: boolean
	item: LookbookItem
	look: Look
	state: CardState
	size: Size
	/** Its parts with something to load, for Admin: what may be picked. */
	loadable: string[]
	/** Its parts picked for Load n. */
	picked: string[]
	onTick: () => void
	onPart: (code: string) => void
	/** Load this card: its picked parts, or all of it. */
	onLoad: () => void
	lowerThirds: ReadonlyMap<string, 'there' | 'missing'>
	/** HOLDING's column names, for the strip. */
	columnNames: string[]
}) {
	// What is open under the card: a code's files compared, or a slot to choose.
	const [open, setOpen] = useState<{ kind: 'compare' | 'slot'; code: string } | null>(null)
	const fileOf = (type: string) => look.codes.find((c) => c.type === type && item.files[c.code] !== undefined)
	// The lookbook's composed picture; else its foreground or background alone.
	const main = item.preview ?? item.files[fileOf('F')?.code ?? ''] ?? item.files[fileOf('B')?.code ?? ''] ?? null
	const side = fileOf('A') ?? fileOf('T')
	const sideFile = side === undefined ? null : (item.files[side.code] ?? null)
	const problems = problemsOf(look, m)
	const pinned = m.pins.some((p) => p.item === look.item)
	const big = size === 'big'
	const ring = look.live ? 'ring-4 ring-state-live' : state === 'needs' ? 'ring-2 ring-warn' : picked.length > 0 ? 'ring-2 ring-accent-hi' : ''
	const typeOf = (code: string) => TYPE_SHORT[look.codes.find((c) => c.code === code)?.type ?? ''] ?? code
	// Load says what it loads when only some parts are picked: "Load BG".
	const loadWords = picked.length > 0 && picked.length < loadable.length ? `Load ${picked.map(typeOf).join(', ')}` : 'Load'
	const key = keyOf(look, item)

	const picture = (
		<div className={`relative w-full overflow-hidden bg-black ${size === 'rows' ? 'rounded-ctl' : ''}`} style={{ aspectRatio: '5800 / 2037' }}>
			<Img url={main === null ? null : lookbookThumbUrl(main, size === 'rows' ? 'thumbnail' : 'large')} />
			<span className={`absolute top-2 left-2 rounded-ctl bg-black/70 px-2 tabular-nums ${big ? 'py-1 text-lg' : 'text-sm'}`}>{look.item + 1}</span>
		</div>
	)
	const sidePicture =
		sideFile === null || side === undefined ? null : (
			<figure className={big ? 'w-[38%] max-w-[720px] shrink-0' : 'w-28 shrink-0'}>
				{/* A lower third is white words on nothing: on grey, as the lookbook shows it. */}
				<div className={`relative aspect-video w-full overflow-hidden rounded-ctl ${side.type === 'T' ? 'bg-neutral-600' : 'bg-black'}`}>
					<Img url={lookbookThumbUrl(sideFile, big ? 'large' : 'thumbnail')} />
				</div>
				{big && <figcaption className="mt-1.5 truncate text-sm text-booth-dim">{side.type === 'A' ? 'A-screen' : 'Lower third'}</figcaption>}
			</figure>
		)
	const words = (
		<div className="flex min-w-0 flex-1 flex-col gap-2">
			<div className="flex min-w-0 items-start gap-3">
				{loadable.length > 0 && <Tick on={picked.length === 0 ? false : picked.length === loadable.length ? true : 'some'} onClick={onTick} />}
				<div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
					<h3 className={`min-w-0 font-extrabold tracking-tight ${big ? 'text-3xl' : 'text-lg'}`}>{item.title}</h3>
					{item.label !== null && <span className={`min-w-0 text-booth-dim ${big ? 'text-xl' : 'text-sm'}`}>{item.label}</span>}
				</div>
				<StateBadge state={state} live={look.live} big={big} problems={groupProblems(problems)} />
			</div>
			<div className="flex flex-wrap gap-1.5">
				{look.codes.map((c) => (
					<Piece
						key={c.code}
						m={m}
						item={look.item}
						code={c.code}
						type={c.type}
						state={c.state}
						lowerThird={lowerThirds.get(c.code)}
						pick={loadable.includes(c.code) ? { on: picked.includes(c.code), any: picked.length > 0, onTap: () => onPart(c.code) } : null}
					/>
				))}
			</div>
			{problems.length > 0 && (
				<div className="flex flex-col gap-1.5">
					{/* No column is the moment's, not a code's: one line, one Choose a slot, the rest following. */}
					{groupProblems(problems).map((p) => (
						<Problem
							key={p.codes.join(' ')}
							m={m}
							codes={p.codes}
							kind={p.kind}
							operator={operator}
							onCompare={() => setOpen({ kind: 'compare', code: p.codes[0] as string })}
							onSlot={() => setOpen({ kind: 'slot', code: p.codes[0] as string })}
						/>
					))}
				</div>
			)}
			{look.lands !== null && <Lands lands={look.lands} names={columnNames} big={big} />}
			{operator && (loadable.length > 0 || pinned || (key !== undefined && look.lands !== null && state !== 'loading')) && (
				<div className="flex flex-wrap items-center gap-2">
					{loadable.length > 0 && (
						<Button variant="primary" size="sm" onClick={onLoad}>
							{loadWords}
						</Button>
					)}
					{key !== undefined && look.lands !== null && state !== 'loading' && <SmallButton onClick={() => setOpen({ kind: 'slot', code: key.code })}>Move</SmallButton>}
					{pinned && (
						<span className="text-xs text-booth-dim">
							Moved for this service ·{' '}
							<button type="button" onClick={() => m.unpin(look.item)} className="underline hover:text-booth-ink">
								Put back
							</button>
						</span>
					)}
				</div>
			)}
		</div>
	)

	return (
		<article className={`flex min-w-0 flex-col overflow-hidden rounded-win bg-booth-panel ${ring}`}>
			{size === 'rows' ? (
				<div className="flex min-w-0 items-start gap-4 p-2">
					<div className="w-[34%] max-w-[560px] shrink-0">{picture}</div>
					{sidePicture}
					{words}
				</div>
			) : (
				<>
					{picture}
					<div className={`flex min-w-0 ${big ? 'gap-5 p-4' : 'gap-3 p-3'}`}>
						{sidePicture}
						{words}
					</div>
				</>
			)}
			{open !== null && (
				<div className="border-t border-booth-edge/60 p-3">
					<div className="mb-2 flex items-center gap-2 text-sm">
						<span className="font-medium">{open.kind === 'compare' ? `${open.code}: Arena's file and the lookbook's` : `Move ${item.label ?? item.title}: tap where it should land`}</span>
						<button type="button" onClick={() => setOpen(null)} aria-label="Close" className="ml-auto grid size-9 place-items-center rounded-ctl hover:bg-booth-hover">
							<X size={16} aria-hidden />
						</button>
					</div>
					{open.kind === 'compare' ? (
						<Compare m={m} status={status} operator={operator} code={open.code} />
					) : (
						<SlotPicker m={m} status={status} what={{ item: look.item, code: open.code }} here={look.lands?.column ?? null} onDone={() => setOpen(null)} />
					)}
				</div>
			)}
		</article>
	)
}

/** The card's tick: all its parts, some (a dash), or none. */
function Tick({ on, onClick }: { on: boolean | 'some'; onClick: () => void }) {
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={on === 'some' ? 'mixed' : on}
			aria-label="Tick to load with others"
			onClick={onClick}
			className={`grid size-8 shrink-0 place-items-center rounded-ctl border-2 ${on !== false ? 'border-accent-hi bg-accent-hi text-black' : 'border-booth-edge hover:border-booth-ink'}`}
		>
			{on === true && <Check size={18} strokeWidth={3} aria-hidden />}
			{on === 'some' && <Minus size={18} strokeWidth={3} aria-hidden />}
		</button>
	)
}

/** A problem's name on its card's badge. */
const PROBLEM_BADGE: Record<Trouble['kind'], string> = { look: 'Wrong file?', missing: 'File missing', 'no-place': 'No spot', failed: "Didn't load" }

function StateBadge({ state, live, big, problems }: { state: CardState; live: boolean; big: boolean; problems: Trouble[] }) {
	const text = big ? 'text-base px-3 h-9' : 'text-xs px-2 h-7'
	if (live) return <span className={`inline-flex shrink-0 items-center rounded-ctl bg-state-live font-extrabold text-black ${text}`}>On screen</span>
	switch (state) {
		case 'ready':
			return (
				<span className={`inline-flex shrink-0 items-center gap-1 font-bold text-state-live ${text}`}>
					<Check size={big ? 18 : 14} aria-hidden /> In Arena
				</span>
			)
		case 'load':
			return <span className={`inline-flex shrink-0 items-center rounded-ctl bg-accent-hi/15 font-bold text-accent-hi ${text}`}>To load</span>
		case 'needs':
			return <span className={`inline-flex shrink-0 items-center rounded-ctl bg-warn font-bold text-black ${text}`}>{problems.length === 1 ? PROBLEM_BADGE[(problems[0] as Trouble).kind] : `${problems.length} problems`}</span>
		case 'loading':
			return <span className={`inline-flex shrink-0 items-center rounded-ctl bg-booth-raise font-bold text-accent-hi ${text}`}>Loading…</span>
		case 'other':
			return null
	}
}

/** One piece of a moment: its kind and code, and a word only when it is not
 *  simply right. A part with something to load is a switch for Admin (`pick`):
 *  lit while picked, faded while its card has other parts picked and not it. */
function Piece({
	m,
	item,
	code,
	type,
	state,
	lowerThird,
	pick,
}: {
	m: MediaCheckState
	item: number
	code: string
	type: string
	state: CodeState
	lowerThird: 'there' | 'missing' | undefined
	pick: { on: boolean; any: boolean; onTap: () => void } | null
}) {
	const fetch = m.fetches[code]
	const going = under(fetch)
	const placement = m.placements.find((p) => p.item === item && p.code === code)
	const where = placement === undefined ? null : unnamedColumn(placement.columnName) ? `column ${placement.column}` : placement.columnName
	const [tone, word] = going
		? ['bg-booth-raise text-accent-hi', fetch === undefined ? '' : fetchShort(fetch)]
		: state === 'not-arena'
			? type === 'T'
				? lowerThird === 'there'
					? ['bg-booth-raise text-booth-ink', 'in ProPresenter']
					: lowerThird === 'missing'
						? ['bg-warn/15 text-warn', 'not in ProPresenter']
						: ['text-booth-dim', '']
				: ['text-booth-faint', 'not Arena’s']
			: ({
					ready: ['bg-booth-raise text-booth-ink', ''],
					place: ['border border-dashed border-accent-hi/80 text-accent-hi', where === null ? 'to load' : `→ ${where}`],
					look: ['bg-warn/15 text-warn', 'may differ'],
					missing: ['bg-warn/15 text-warn', 'file missing'],
					'no-place': ['bg-warn/15 text-warn', 'no column'],
					'no-file': ['text-booth-faint', 'no file in the lookbook'],
				} as const)[state]
	const inner = (
		<>
			<span className="text-xs font-bold opacity-70">{TYPE_SHORT[type] ?? type}</span>
			<span className="font-mono">{code}</span>
			{state === 'missing' && !going && <FileX size={12} aria-hidden />}
			{word !== '' && <span>{word}</span>}
		</>
	)
	if (pick === null) return <span className={`inline-flex h-8 items-center gap-1.5 rounded-ctl px-2 text-sm ${tone}`}>{inner}</span>
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={pick.on}
			aria-label={`${TYPE_SHORT[type] ?? type} ${code}: ${pick.on ? 'will load; tap to leave it out' : 'tap to load it'}`}
			onClick={pick.onTap}
			className={`inline-flex h-8 items-center gap-1.5 rounded-ctl px-2 text-sm transition-opacity active:scale-95 ${
				pick.on ? 'bg-accent-hi font-medium text-black' : `${tone} ${pick.any ? 'opacity-45' : ''}`
			}`}
		>
			{inner}
		</button>
	)
}

type Trouble = { codes: string[]; kind: 'look' | 'missing' | 'no-place' | 'failed' }

/** A card's problems as lines: each code its own, but every code with no
 *  column together. */
function groupProblems(problems: { code: string; kind: Trouble['kind'] }[]): Trouble[] {
	// Chosen by its foreground first: the background follows it into the column (Holding's rule).
	const rank = (code: string) => ['F', 'A', 'B'].indexOf(mediaCodeOf(code)?.type ?? '') >>> 0
	const noPlace = problems
		.filter((p) => p.kind === 'no-place')
		.map((p) => p.code)
		.sort((a, b) => rank(a) - rank(b))
	return [...problems.filter((p) => p.kind !== 'no-place').map((p) => ({ codes: [p.code], kind: p.kind })), ...(noPlace.length > 0 ? [{ codes: noPlace, kind: 'no-place' as const }] : [])]
}

/** A problem on its card, in words, with its fix. */
function Problem({
	m,
	codes,
	kind,
	operator,
	onCompare,
	onSlot,
}: {
	m: MediaCheckState
	codes: string[]
	kind: Trouble['kind']
	operator: boolean
	onCompare: () => void
	onSlot: () => void
}) {
	const code = codes[0] as string
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-2 rounded-ctl bg-warn/10 px-2.5 py-1.5 text-sm">
			{kind !== 'no-place' && <span className="font-mono text-warn">{code}</span>}
			{kind === 'failed' ? (
				<FetchWords fetch={m.fetches[code]} refused={m.refused[code]} />
			) : (
				<span className="text-warn">
					{kind === 'look' ? "Arena's file may not be the lookbook's" : kind === 'missing' ? 'Arena cannot find its file on this computer' : 'No spot: no column of its own, or none left'}
				</span>
			)}
			{operator && (
				<span className="ml-auto flex items-center gap-2">
					{(kind === 'look' || kind === 'missing') && <SmallButton onClick={onCompare}>Compare</SmallButton>}
					{kind === 'no-place' && <SmallButton onClick={onSlot}>Choose a spot</SmallButton>}
					{kind === 'failed' && m.fetches[code]?.state === 'failed' && m.fetches[code].clash === true && <ReplaceButton onClick={() => m.replaceLocal(code)} />}
					{kind === 'failed' && <ThereButton onClick={() => m.itsThere(code)} />}
				</span>
			)}
		</div>
	)
}

/** A code's clips that need a look, each against the lookbook's file. */
function Compare({ m, status, operator, code }: { m: MediaCheckState; status: ArenaStatus; operator: boolean; code: string }) {
	const items = m.runSheet ?? []
	const today = codesOn(items)
	const slots = status.layers.flatMap((l) => l.slots.filter((s) => slotCode(s) === code && needsLook(slotMark(s, items, today, m.same, m.sizes))))
	const first = slots[0]
	if (first === undefined) return <p className="text-sm text-booth-dim">Nothing to compare now.</p>
	return (
		<div className="flex flex-col gap-2">
			{slots.length > 1 && <p className="text-xs text-booth-dim">{slots.length} clips carry it; the first is shown, and the answer covers them all.</p>}
			<FileCompare m={m} status={status} slot={first} operator={operator} />
		</div>
	)
}

/** Its layer's clips, to tap one: lit where the moment may go (`moveTargets`),
 *  a taken one saying whom it swaps with. */
function SlotPicker({ m, status, what, here, onDone }: { m: MediaCheckState; status: ArenaStatus; what: Choosing; here: number | null; onDone: () => void }) {
	const targets = m.moveTargets(what)
	const layer: ArenaLayer | undefined = status.layers.find((l) => l.slots.some((s) => targets.has(s.id)))
	if (layer === undefined) return <p className="text-sm text-booth-dim">Nowhere to move it: every PROMO and spare column is taken or kept for something.</p>
	const names = columnNamesOf(layer, status)
	const items = m.runSheet ?? []
	return (
		<div className="flex flex-col gap-2">
			<p className="text-xs text-booth-dim">
				{layer.name}: a PROMO or spare column. On another moment&rsquo;s, the two swap. The rest of the moment follows; it asks before loading.
			</p>
			<div className="flex gap-2 overflow-x-auto pb-1">
				{layer.slots.map((slot, i) => {
					const target = targets.get(slot.id)
					const name = names[i] ?? ''
					const url = slot.thumbnail === null ? null : thumbnailUrl(slot.thumbnail)
					const other = target?.swap == null ? null : items[target.swap]
					return (
						<button
							key={slot.id}
							type="button"
							disabled={target === undefined}
							onClick={() => {
								m.askMoveTo(what, i + 1)
								onDone()
							}}
							className={`flex w-28 shrink-0 flex-col gap-1 text-left ${target !== undefined || here === i + 1 ? '' : 'opacity-35'}`}
						>
							<span
								className={`relative block h-16 w-28 overflow-hidden rounded-ctl ${slot.state === 'empty' ? 'border border-dashed border-booth-edge' : 'bg-booth-raise'} ${target !== undefined ? 'ring-2 ring-accent-hi' : here === i + 1 ? 'ring-2 ring-booth-ink' : ''}`}
							>
								{url !== null && <Img url={url} cover />}
								{slot.state !== 'empty' && <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 text-[11px]">{slotCode(slot) ?? slot.name}</span>}
							</span>
							<span className="truncate text-xs text-booth-dim">{unnamedColumn(name) ? `Column ${i + 1}` : name}</span>
							{here === i + 1 && <span className="truncate text-xs font-bold">Here now</span>}
							{other != null && <span className="truncate text-xs text-accent-hi">Swap with {other.label ?? other.title}</span>}
						</button>
					)
				})}
			</div>
		</div>
	)
}

/** The piece a look is moved by: its foreground, else background, else A-screen. */
function keyOf(look: Look, item: LookbookItem | undefined) {
	const movable = look.codes.filter((c) => c.state !== 'not-arena' && c.state !== 'no-file' && item?.files[c.code] !== undefined)
	return ['F', 'B', 'A'].map((t) => movable.find((c) => c.type === t)).find((c) => c !== undefined)
}

/** The Map size (the owner, 2026-10-22): Arena's holding grid as Arena lays it
 *  out, each column's moment written over it, its clips as they are or, dashed,
 *  as they will be. Tap a moment to see where it lands; in Admin, then a lit
 *  column to move it there, on another moment's a swap, as Move does. */
function LandingMap({
	m,
	status,
	looks,
	states,
	operator,
	names,
}: {
	m: MediaCheckState
	status: ArenaStatus
	looks: Look[]
	states: ReadonlyMap<number, CardState>
	operator: boolean
	names: string[]
}) {
	const [chosen, setChosen] = useState<number | null>(null)
	const items = m.runSheet ?? []
	const today = codesOn(items)
	const layers = holdingLayers(status).filter((l) => layerKeyOf(l) !== null)
	const width = Math.max(names.length, ...layers.map((l) => l.slots.length))
	const columns = Array.from({ length: width }, (_, i) => i + 1)
	const momentAt = new Map<number, Look>()
	for (const l of looks) if (l.lands !== null && !momentAt.has(l.lands.column)) momentAt.set(l.lands.column, l)
	const chosenLook = looks.find((l) => l.item === chosen)
	const key = chosenLook === undefined ? undefined : keyOf(chosenLook, items[chosenLook.item])
	const lit = new Map<number, number | null>()
	if (operator && chosenLook !== undefined && key !== undefined) for (const t of m.moveTargets({ item: chosenLook.item, code: key.code }).values()) lit.set(t.column, t.swap)
	const planned = [...m.placements.filter((p) => p.item >= 0), ...m.fills]
	const troubled = new Set(looks.flatMap((l) => problemsOf(l, m).map((p) => p.code)))
	const noSpot = looks.filter((l) => l.lands === null && l.codes.some((c) => c.state === 'no-place'))
	const nameOf = (l: Look) => items[l.item]?.label ?? items[l.item]?.title ?? ''
	const tap = (column: number) => {
		if (chosenLook !== undefined && key !== undefined && lit.has(column)) {
			m.askMoveTo({ item: chosenLook.item, code: key.code }, column)
			return setChosen(null)
		}
		const at = momentAt.get(column)
		setChosen(at === undefined || at.item === chosen ? null : at.item)
	}
	// A column no moment uses and named for nothing (or COUNTDOWN and the like) is a sliver.
	const thin = (c: number) => !momentAt.has(c) && !lit.has(c) && (unnamedColumn(names[c - 1] ?? '') || /count\s*down|video|broadcast/i.test(names[c - 1] ?? '')) && !planned.some((p) => p.column === c)
	const grid = { gridTemplateColumns: `2.5rem ${columns.map((c) => (thin(c) ? 'minmax(0,0.35fr)' : 'minmax(0,1fr)')).join(' ')}` }

	return (
		<div className="mx-auto flex max-w-[2200px] flex-col gap-3">
			<div className="grid gap-1" style={grid}>
				<span />
				{columns.map((c) => {
					const name = names[c - 1] ?? ''
					const at = momentAt.get(c)
					const me = at !== undefined && at.item === chosen
					const swap = lit.get(c)
					return (
						<button
							key={c}
							type="button"
							onClick={() => tap(c)}
							title={unnamedColumn(name) ? `Column ${c}` : name}
							className={`flex min-w-0 flex-col items-center rounded-ctl px-0.5 py-1 text-center ${me ? 'bg-accent text-accent-ink' : lit.has(c) ? 'ring-2 ring-accent-hi' : 'hover:bg-booth-hover'}`}
						>
							<span className={`w-full truncate text-xs font-bold ${me ? '' : /^promo/i.test(name.trim()) ? 'text-accent-hi' : 'text-booth-dim'}`}>{thin(c) ? '' : unnamedColumn(name) ? c : name}</span>
							<span className={`w-full truncate text-xs ${me ? '' : at !== undefined && states.get(at.item) === 'needs' ? 'text-warn' : 'text-booth-ink'}`}>
								{swap != null ? 'swap' : at === undefined ? '\u00a0' : nameOf(at)}
							</span>
						</button>
					)
				})}
				{layers.map((layer) => (
					<MapRow key={layer.id} layer={layer} columns={columns} planned={planned} items={items} today={today} troubled={troubled} lit={lit} chosenColumn={chosenLook?.lands?.column ?? null} thin={thin} onTap={tap} />
				))}
			</div>
			<p className="rounded-ctl bg-booth-panel px-3 py-2 text-sm text-booth-dim">
				{chosenLook !== undefined ? (
					<>
						<b className="font-bold text-booth-ink">{nameOf(chosenLook)}</b>
						{chosenLook.lands !== null ? ` ${chosenLook.lands.replaces !== null ? 'lands in' : 'is in'} ${chosenLook.lands.name === '' ? `column ${chosenLook.lands.column}` : `${chosenLook.lands.name} · column ${chosenLook.lands.column}`}` : ' has no spot yet'}
						{chosenLook.lands?.replaces != null && (chosenLook.lands.replaces === 'empty' ? ' · into an empty clip' : ` · replaces ${chosenLook.lands.replaces}`)}
						{chosenLook.lands?.why === 'moved' && ' · moved for this service'}
						{operator && (lit.size > 0 ? '. Tap a lit column to move it; on another moment\u2019s, the two swap.' : '. Nowhere free to move it.')}
					</>
				) : (
					`Dashed: will load · faded: not this service · amber: a problem · green: on screen. Tap a moment to see where it lands${operator ? ', then a lit column to move it' : ''}.`
				)}
			</p>
			{noSpot.length > 0 && (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="text-warn">No spot:</span>
					{noSpot.map((l) => (
						<button
							key={l.item}
							type="button"
							onClick={() => setChosen(l.item === chosen ? null : l.item)}
							className={`h-8 rounded-ctl px-2.5 ${l.item === chosen ? 'bg-accent text-accent-ink' : 'bg-warn/15 text-warn hover:bg-warn/25'}`}
						>
							{nameOf(l)}
						</button>
					))}
				</div>
			)}
			{m.pins.length > 0 && operator && (
				<p className="text-xs text-booth-dim">
					{m.pins.length} moved for this service:{' '}
					{m.pins.map((p, i) => (
						<span key={p.item}>
							{i > 0 && ', '}
							{items[p.item]?.label ?? items[p.item]?.title}{' '}
							<button type="button" onClick={() => m.unpin(p.item)} className="underline hover:text-booth-ink">
								Put back
							</button>
						</span>
					))}
				</p>
			)}
		</div>
	)
}

/** One layer of the Map: each clip as it is, or, dashed, what will load into it. */
function MapRow({
	layer,
	columns,
	planned,
	items,
	today,
	troubled,
	lit,
	chosenColumn,
	thin,
	onTap,
}: {
	layer: ArenaLayer
	columns: number[]
	planned: Placement[]
	items: LookbookItem[]
	today: ReadonlySet<string>
	troubled: ReadonlySet<string>
	lit: ReadonlyMap<number, number | null>
	chosenColumn: number | null
	thin: (c: number) => boolean
	onTap: (c: number) => void
}) {
	const k = layerKeyOf(layer)
	return (
		<>
			<span className="self-center text-xs font-bold text-booth-dim" title={layer.name}>
				{k === 'F' ? 'FG' : k === 'B' ? 'BG' : 'A'}
			</span>
			{columns.map((c) => {
				const slot = layer.slots[c - 1]
				if (slot === undefined) return <span key={c} />
				const p = planned.find((x) => x.clipId === slot.id)
				const code = p?.code ?? slotCode(slot)
				const file = p === undefined ? null : (items.find((it) => it.files[p.code] !== undefined)?.files[p.code] ?? null)
				const url = p !== undefined ? (file === null ? null : lookbookThumbUrl(file, 'thumbnail')) : slot.thumbnail === null ? null : thumbnailUrl(slot.thumbnail)
				const old = p === undefined && slot.state !== 'empty' && (code === null || !today.has(code))
				const ring = slot.state === 'playing' ? 'ring-2 ring-state-live' : code !== null && troubled.has(code) ? 'ring-2 ring-warn' : ''
				const frame = p !== undefined ? 'border border-dashed border-accent-hi' : slot.state === 'empty' ? 'border border-dashed border-booth-edge' : 'bg-booth-raise'
				return (
					<button
						key={c}
						type="button"
						onClick={() => onTap(c)}
						title={p !== undefined ? `${p.code} will load${p.replaces !== null ? `, replacing ${p.replaces.code ?? p.replaces.name}` : ''}` : slot.state === 'empty' ? 'Empty' : (code ?? slot.name)}
						className={`relative block aspect-video min-w-0 overflow-hidden rounded-ctl ${frame} ${ring} ${old ? 'opacity-40' : ''} ${c === chosenColumn ? 'outline outline-2 outline-accent' : lit.has(c) ? 'outline outline-1 outline-accent-hi' : ''}`}
					>
						{url !== null && !thin(c) && <Img url={url} cover />}
						{code !== null && !thin(c) && (
							<span className={`absolute inset-x-0 bottom-0 truncate px-1 text-[11px] font-mono ${p !== undefined ? 'bg-black/80 text-accent-hi' : 'bg-black/70'}`}>{code}</span>
						)}
					</button>
				)
			})}
		</>
	)
}

/** Where a moment lands, in words over a strip of Arena's columns with its
 *  own lit: anyone reads it, Arena or not. */
function Lands({ lands, names, big }: { lands: Landing; names: string[]; big: boolean }) {
	const where = lands.name === '' ? `column ${lands.column}` : lands.name
	const extra = lands.name === '' ? null : `column ${lands.column}`
	const going = lands.replaces !== null
	const replaces = lands.replaces === null ? null : lands.replaces === 'empty' ? 'into an empty clip' : `replaces ${lands.replaces}`
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<div className="flex items-end gap-0.5" aria-hidden>
				{names.map((n, i) => {
					const me = i + 1 === lands.column
					const plain = unnamedColumn(n)
					return (
						<span
							key={i}
							title={plain ? `Column ${i + 1}` : n}
							className={`block min-w-0 overflow-hidden rounded-[2px] text-center text-[11px] leading-5 font-bold ${me ? 'h-5 bg-accent text-accent-ink' : `h-2.5 ${plain ? 'bg-booth-edge' : 'bg-booth-raise'}`}`}
							style={{ flex: me ? '2.5 1 0' : plain ? '0.5 1 0' : '1 1 0' }}
						>
							{me ? (plain ? lands.column : n) : ''}
						</span>
					)
				})}
			</div>
			<p className={`min-w-0 text-booth-dim ${big ? 'text-base' : 'text-sm'}`}>
				{going ? 'Lands in' : 'In'} <b className="font-bold text-booth-ink">{where}</b>
				{extra !== null && ` · ${extra}`}
				{replaces !== null && ` · ${replaces}`}
			</p>
		</div>
	)
}

function Img({ url, cover = false }: { url: string | null; cover?: boolean }) {
	const [failed, setFailed] = useState<string | null>(null)
	if (url === null || failed === url) return <span className="absolute inset-0 bg-booth-raise" />
	return <img src={url} alt="" draggable={false} onError={() => setFailed(url)} className={`absolute inset-0 size-full ${cover ? 'object-cover' : 'object-contain'}`} />
}
