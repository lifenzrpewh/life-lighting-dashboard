// The media check's pieces, shared by the Arena view's Media line and the
// Holding view (./HoldingView.tsx), where the check is laid out as Arena's
// columns and every fix is made. The state is ../useMediaCheck.ts; the rules
// are ../../shared/media-check.ts and ../../shared/holding.ts.
//
// The Media line is one line (the owner, 2026-10-05: "feels very wall of
// texty"): the service and how many need a look. A tap opens the Holding view
// in the Arena view's place; the per-code list it used to open is gone, since
// the Holding view shows the same answers as pictures.

import { useState } from 'react'
import { ChevronRight, TriangleAlert } from 'lucide-react'

import type { ArenaStatus } from '../../shared/arena.js'
import { columnNamesOf, placementWords, type Placement, type UpdateStep } from '../../shared/holding.js'
import type { LookbookService } from '../../shared/media-check.js'
import { megabytes, type FetchRequest, type FetchStates } from '../../shared/media-fetch.js'
import { useMediaCheck, type Load, type MediaCheckState } from '../useMediaCheck.js'
import { chipLabel } from './vocabulary.js'

export function MediaCheck({ status, now, onOpen }: { status: ArenaStatus; now: number; onOpen: () => void }) {
	const m = useMediaCheck(status, now, false)
	const total = m.check === null ? 0 : Object.values(m.check.counts).reduce((a, b) => a + b, 0)
	return (
		<button
			type="button"
			onClick={onOpen}
			className={`flex h-12 w-full min-w-0 shrink-0 items-center gap-3 border-b border-booth-edge px-4 text-left text-sm hover:bg-booth-strip ${m.trouble > 0 ? 'bg-warn/10' : ''}`}
		>
			<span className={chipLabel}>Media</span>
			{/* The verdict keeps its room; the service's name gives way first. */}
			{m.service !== null && <span className="min-w-0 truncate text-booth-dim">{m.service.name}</span>}
			<span className="shrink-0">
				<Summary m={m} total={total} />
			</span>
			<span className="ml-auto flex shrink-0 items-center gap-1 text-booth-dim">
				Holding
				<ChevronRight size={18} aria-hidden />
			</span>
		</button>
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

/** What a Place, an Update or Update all will copy and load into Arena, before
 *  it does: nothing is sent until Load (the owner, 2026-10-05). Two questions
 *  are asked apart, each off until ticked: a file only the lookbook has, and a
 *  clip on screen now. */
export function Confirm({ m }: { m: MediaCheckState }) {
	const [lookbook, setLookbook] = useState(false)
	const [live, setLive] = useState(false)
	if (m.asking === null) return null
	const { title, steps, unplaced, sources } = m.asking
	const fromLookbook = sources === null ? 0 : steps.filter((s) => sources[s.request.code]?.from === 'lookbook').length
	const onScreen = steps.flatMap((s) => m.onScreen(s).map((c) => ({ code: s.request.code, where: c.where })))
	const sending = m.toSend({ lookbook, live })
	const done = (answers: { lookbook: boolean; live: boolean } | null) => {
		if (answers !== null) m.confirm(answers)
		else m.cancel()
		setLookbook(false)
		setLive(false)
	}
	return (
		<div className="my-2 flex flex-col gap-2 rounded-lg bg-booth-raise p-3 text-sm ring-1 ring-warn/60 ring-inset">
			<p className="font-medium">{title}</p>
			<ul className="flex flex-col gap-0.5 text-xs">
				{steps.map((s) => {
					const src = sources?.[s.request.code]
					return (
						<li key={s.request.code} className="flex min-w-0 items-baseline gap-2">
							<span className="min-w-0 flex-1 truncate">{s.what}</span>
							<span className={`max-w-[40%] shrink-0 truncate ${src?.from === 'drive' ? 'text-booth-dim' : 'text-warn'}`} title={src?.from === 'none' ? src.detail : undefined}>
								{src === undefined
									? sources === null
										? 'looking on the drive…'
										: 'not checked'
									: src.from === 'drive'
										? 'from the drive'
										: src.from === 'lookbook'
											? 'only in the lookbook'
											: `left out: ${src.detail}`}
							</span>
						</li>
					)
				})}
				{unplaced
					.filter((u) => u.kind !== 'unnamed' && u.kind !== 'no-file')
					.map((u) => (
						<li key={`${u.item}:${u.code}`} className="truncate text-booth-dim">
							{u.code} ({u.label ?? u.title}): left out, {u.detail}
						</li>
					))}
			</ul>
			{fromLookbook > 0 && (
				<Tick on={lookbook} onChange={setLookbook} tone="warn">
					Download {fromLookbook} from the lookbook: not on the graphics drive as the lookbook has {fromLookbook === 1 ? 'it' : 'them'}
				</Tick>
			)}
			{onScreen.length > 0 && (
				<Tick on={live} onChange={setLive} tone="live">
					Replace {onScreen.length === 1 ? 'a clip' : `${onScreen.length} clips`} on screen now ({[...new Set(onScreen.map((c) => `${c.code} in ${c.where}`))].join(', ')}): the
					audience sees it change
				</Tick>
			)}
			<div className="flex flex-wrap items-center gap-2">
				{sources === null ? (
					<span className="flex h-10 items-center text-xs text-booth-dim">Looking on the drive…</span>
				) : sending.length === 0 ? (
					<span className="flex h-10 items-center text-xs text-booth-dim">Nothing to load{fromLookbook + onScreen.length > 0 ? ' unless ticked' : ''}</span>
				) : (
					<SmallButton onClick={() => done({ lookbook, live })} tone={live && onScreen.length > 0 ? 'live' : 'plain'}>
						{live && onScreen.length > 0 ? `Load, replacing ${onScreen.length} on screen` : `Load ${sending.length === 1 ? '1' : sending.length}`}
					</SmallButton>
				)}
				<SmallButton onClick={() => done(null)}>Cancel</SmallButton>
			</div>
		</div>
	)
}

/** A question in a confirmation, off until ticked. */
function Tick({ on, onChange, tone, children }: { on: boolean; onChange: (on: boolean) => void; tone: 'warn' | 'live'; children: React.ReactNode }) {
	const colour = tone === 'live' ? 'text-overtime' : 'text-warn'
	return (
		<label className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-xs ${colour} ${on ? 'bg-booth-hover' : ''}`}>
			<input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 accent-current" />
			{tone === 'live' && <TriangleAlert size={16} className="shrink-0" aria-hidden />}
			<span className="min-w-0">{children}</span>
		</label>
	)
}

/** Placing one code of one item in its column, said. */
export function placeStep(p: Placement): UpdateStep {
	return {
		request: { code: p.code, want: p.want, clipIds: [p.clipId], lookbookPath: p.lookbookPath, allowLookbook: false, allowLive: [] },
		what: `${p.code} (${p.label ?? p.title}) into ${placementWords(p)}`,
	}
}

/** Loading a newer file into clips, said: where, or how many. */
export function updateStep(req: FetchRequest, status: ArenaStatus): UpdateStep {
	if (req.clipIds.length === 0) return { request: req, what: `${req.code}: copy into the local folder only (no place in Arena)` }
	const places = req.clipIds.map((id) => placeOf(id, status)).filter((p) => p !== null)
	const where = places.length === 1 ? places[0] : `${req.clipIds.length} clips with the old file`
	return { request: req, what: `${req.code} into ${where}` }
}

function placeOf(clipId: number, status: ArenaStatus): string | null {
	for (const layer of status.layers) {
		const i = layer.slots.findIndex((s) => s.id === clipId)
		if (i >= 0) return `${layer.name} · ${columnNamesOf(layer, status)[i] || `column ${i + 1}`}`
	}
	return null
}

/** A fetch still going: no second tap until it ends. */
export const under = (f: FetchStates[string] | undefined) => f?.state === 'finding' || f?.state === 'copying' || f?.state === 'loading'

/** How a fetch is going, in a word or two. */
export function fetchShort(fetch: FetchStates[string]): string {
	switch (fetch.state) {
		case 'finding':
			return 'finding'
		case 'copying':
			return fetch.total === 0 ? 'copying' : `${Math.round((fetch.done / fetch.total) * 100)}%`
		case 'loading':
			return fetch.of > 1 ? `loading ${fetch.done + 1}/${fetch.of}` : 'loading'
		case 'sent':
			return fetch.from === 'lookbook' ? 'sent, from the lookbook' : 'sent'
		case 'copied':
			return 'copied, not loaded'
		case 'failed':
			return 'failed'
	}
}

/** How a fetch is going, in full. */
export function FetchWords({ fetch, refused }: { fetch: FetchStates[string] | undefined; refused: string | undefined }) {
	if (refused !== undefined) return <span className="text-xs text-warn">{refused}</span>
	if (fetch === undefined) return null
	switch (fetch.state) {
		case 'copying':
			return (
				<span className="flex items-center gap-2 text-xs text-booth-dim tabular-nums">
					<span className="h-1.5 w-24 overflow-hidden rounded-full bg-booth-edge">
						<span className="block h-full bg-booth-ink" style={{ width: `${fetch.total === 0 ? 100 : (fetch.done / fetch.total) * 100}%` }} />
					</span>
					{megabytes(fetch.done)} of {megabytes(fetch.total)} MB
				</span>
			)
		case 'sent':
			return (
				<span className="text-xs text-booth-dim">
					Sent {fetch.file}
					{fetch.from === 'lookbook' ? ' (from the lookbook)' : ''}
					{fetch.clips > 1 ? ` to ${fetch.clips} clips` : ''}
				</span>
			)
		case 'copied':
			return (
				<span className="text-xs text-booth-dim">
					{fetch.from === 'lookbook' ? 'Downloaded' : 'Copied'} {fetch.file} here; put it in Arena by hand
				</span>
			)
		case 'failed':
			return <span className="text-xs text-warn">{fetch.detail}</span>
		default:
			return <span className="text-xs text-booth-dim">{fetchShort(fetch)}…</span>
	}
}

export function fileName(path: string): string {
	return path.split(/[\\/]/).at(-1) ?? path
}

export function SmallButton({ onClick, children, tone = 'plain' }: { onClick: () => void; children: React.ReactNode; tone?: 'plain' | 'live' }) {
	const colour = tone === 'live' ? 'bg-overtime/20 text-overtime ring-1 ring-overtime/60 ring-inset hover:bg-overtime/30' : 'bg-booth-raise hover:bg-booth-hover'
	return (
		<button type="button" onClick={onClick} className={`h-10 shrink-0 rounded-lg px-3.5 text-sm font-medium active:scale-[0.98] ${colour}`}>
			{children}
		</button>
	)
}
