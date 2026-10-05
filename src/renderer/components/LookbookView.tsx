// The Lookbook view (the owner, 2026-10-05: "mimics the lookbook idea, have the
// images BIG and obvious", beside the Holding view, not instead of it, and not
// the lookbook embedded, so the looks can still be loaded).
//
// Holding is Arena's shape: layers by columns, every clip. This is the
// service's: one card per moment of the run sheet, in order, its picture as
// the lookbook composes it (background and foreground together) and its
// A-screen or lower third beside, so the booth sees what each moment will look
// like and whether Arena has it. Both read the same check
// (../../shared/holding.ts, `looksOf`), so they never disagree, and both load
// through the same confirmation.
//
// Pictures over words: a moment that is all there says nothing but its codes.
// One that is not has an amber ring and a Load button; one on screen in Arena
// a green ring. A one-off with no column says to place it in Holding, where
// its slot is chosen.

import { useState } from 'react'
import { Check, FileX, RefreshCw } from 'lucide-react'

import type { ArenaStatus } from '../../shared/arena.js'
import { lookSteps, looksOf, type CodeState, type Look } from '../../shared/holding.js'
import { lookbookThumbUrl, mediaCodeOf, type LookbookItem } from '../../shared/media-check.js'
import type { Channel } from '../../shared/reading.js'
import { useMediaCheck, type MediaCheckState } from '../useMediaCheck.js'
import { ArenaReading } from './ArenaView.js'
import { Confirm, FetchWords, ServiceLine, SmallButton, fetchShort, under } from './MediaCheck.js'
import { Button } from './ui.js'
import { chipLabel, formatAge, staleContent } from './vocabulary.js'

export function LookbookView({ status, now }: { status: Channel<ArenaStatus> | null | undefined; now: number }) {
	return <ArenaReading status={status} now={now} render={(s, ageMs) => <Lookbook status={s} ageMs={ageMs} now={now} />} />
}

function Lookbook({ status, ageMs, now }: { status: ArenaStatus; ageMs: number | null; now: number }) {
	const m = useMediaCheck(status, now, true)
	const [details, setDetails] = useState(false)
	const items = m.runSheet ?? []
	const looks = looksOf(items, status, m.same, m.sizes).filter((l) => (items[l.item]?.codes.length ?? 0) > 0)
	const ready = looks.filter((l) => l.ready).length
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="max-h-[55%] shrink-0 overflow-y-auto border-b border-booth-edge px-4">
				<div className="flex h-12 min-w-0 items-center gap-3 text-sm">
					<span className={chipLabel}>Lookbook</span>
					<button type="button" onClick={() => setDetails(!details)} className="min-w-0 truncate rounded-lg px-1 text-booth-dim hover:text-booth-ink">
						{m.service !== null ? `${m.service.name}${m.byHand ? ' (picked)' : ''}` : 'Which service?'}
					</button>
					{m.runSheet !== null && (
						<span className={`shrink-0 tabular-nums ${ready === looks.length ? 'text-state-live' : 'text-warn'}`}>
							{ready === looks.length ? 'All in Arena' : `${ready} of ${looks.length} in Arena`}
						</span>
					)}
					<span className="ml-auto flex shrink-0 items-center gap-2">
						{m.plannedUpdate.steps.length > 0 && <SmallButton onClick={m.askUpdateAll}>Load all</SmallButton>}
						<button type="button" onClick={m.readItemsAgain} aria-label="Check again" title="Check again" className="grid size-10 place-items-center rounded-lg bg-booth-raise hover:bg-booth-hover">
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
				<Confirm key={m.asking?.id} m={m} />
			</div>
			<div className={`min-h-0 flex-1 overflow-y-auto p-4 ${ageMs !== null ? staleContent : ''}`}>
				<div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 600px), 1fr))' }}>
					{looks.map((look) => (
						<Card key={look.item} m={m} status={status} item={items[look.item] as LookbookItem} look={look} order={look.item + 1} />
					))}
				</div>
				{m.runSheet !== null && looks.length === 0 && <p className="p-6 text-center text-booth-dim">This run sheet has no media.</p>}
			</div>
		</div>
	)
}

/** One moment: its picture big, its A-screen or lower third beside its name,
 *  its codes, and Load when Arena lacks any of it. */
function Card({ m, status, item, look, order }: { m: MediaCheckState; status: ArenaStatus; item: LookbookItem; look: Look; order: number }) {
	const fileOf = (type: string) => look.codes.find((c) => c.type === type && item.files[c.code] !== undefined)
	// The lookbook's composed picture; else its foreground or background alone.
	const main = item.preview ?? item.files[fileOf('F')?.code ?? ''] ?? item.files[fileOf('B')?.code ?? ''] ?? null
	const side = fileOf('A') ?? fileOf('T')
	const sideFile = side === undefined ? null : (item.files[side.code] ?? null)
	const steps = look.ready ? [] : lookSteps(look.item, m.runSheet ?? [], status, m.same, m.sizes)
	const busy = look.codes.filter((c) => under(m.fetches[c.code]))
	const failed = look.codes.find((c) => m.fetches[c.code]?.state === 'failed' || m.refused[c.code] !== undefined)
	const ring = look.live ? 'ring-2 ring-state-live' : look.ready ? 'ring-1 ring-booth-edge' : 'ring-2 ring-warn/70'
	return (
		<article className={`flex min-w-0 flex-col overflow-hidden rounded-xl bg-booth-panel ${ring}`}>
			<div className="relative w-full bg-black" style={{ aspectRatio: '5800 / 2037' }}>
				<Picture url={main === null ? null : lookbookThumbUrl(main, 'large')} />
				<span className="absolute top-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-sm tabular-nums">{order}</span>
				{look.live && <span className="absolute top-2 left-12 rounded-md bg-state-live px-2 py-0.5 text-sm font-medium text-booth-bg">On screen</span>}
				{look.ready && (
					<span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/70 text-state-live" aria-label="All in Arena">
						<Check size={18} aria-hidden />
					</span>
				)}
			</div>
			<div className="flex min-w-0 gap-3 p-3">
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<div className="flex min-w-0 items-baseline gap-2">
						<h3 className="min-w-0 truncate text-lg font-medium">{item.title}</h3>
						{item.label !== null && <span className="min-w-0 truncate text-booth-dim">{item.label}</span>}
						{look.column !== null && look.column.name !== '' && (
							<span className="ml-auto shrink-0 rounded bg-booth-raise px-1.5 py-0.5 text-xs text-booth-dim">{look.column.name}</span>
						)}
					</div>
					<div className="flex flex-wrap gap-1.5">
						{look.codes.map((c) => (
							<CodeChip key={c.code} code={c.code} state={c.state} fetch={m.fetches[c.code]} />
						))}
					</div>
					{!look.ready && (
						<div className="flex min-w-0 flex-wrap items-center gap-2">
							{steps.length > 0 && busy.length === 0 && (
								<Button size="sm" variant="primary" onClick={() => m.ask(`Load ${item.label ?? item.title}`, steps)}>
									Load
								</Button>
							)}
							{look.codes.some((c) => c.state === 'no-place') && <span className="text-xs text-booth-dim">No column of its own: choose its slot in Holding</span>}
							{failed !== undefined && <FetchWords fetch={m.fetches[failed.code]} refused={m.refused[failed.code]} />}
						</div>
					)}
				</div>
				{sideFile !== null && side !== undefined && (
					<figure className="w-40 shrink-0">
						{/* A lower third is white words on nothing: on grey, as the lookbook shows it. */}
						<div className={`relative aspect-video w-full overflow-hidden rounded-md ${side.type === 'T' ? 'bg-neutral-600' : 'bg-black'}`}>
							<Picture url={lookbookThumbUrl(sideFile)} />
						</div>
						<figcaption className="mt-1 truncate text-[11px] text-booth-dim">{side.type === 'A' ? 'A-screen' : 'Lower third'}</figcaption>
					</figure>
				)}
			</div>
		</article>
	)
}

/** A code, quiet when it is right; marked only when it needs something. */
function CodeChip({ code, state, fetch }: { code: string; state: CodeState; fetch: MediaCheckState['fetches'][string] | undefined }) {
	const going = under(fetch)
	const style: Record<CodeState, string> = {
		ready: 'bg-booth-raise text-booth-ink',
		place: 'border border-dashed border-nacre-blue/80 text-nacre-blue',
		look: 'bg-warn/15 text-warn',
		missing: 'bg-warn/15 text-warn',
		'no-place': 'border border-dashed border-booth-edge text-booth-dim',
		'no-file': 'text-booth-faint line-through',
		'not-arena': 'text-booth-faint',
	}
	const title: Record<CodeState, string> = {
		ready: 'In its column, the lookbook’s file',
		place: 'Not in its column yet',
		look: 'Arena’s file may differ from the lookbook’s',
		missing: 'Arena cannot find its file on this computer',
		'no-place': 'No column of its own',
		'no-file': 'The lookbook has no file for it',
		'not-arena': `Not Arena’s (${mediaCodeOf(code)?.type === 'T' ? 'a lower third' : 'another program’s'})`,
	}
	return (
		<span title={title[state]} className={`inline-flex h-7 items-center gap-1 rounded-md px-2 font-mono text-xs ${style[state]}`}>
			{state === 'missing' && <FileX size={12} aria-hidden />}
			{state === 'place' && !going && '+'}
			{code}
			{going && fetch !== undefined && <span className="font-sans text-booth-dim">{fetchShort(fetch)}</span>}
		</span>
	)
}

function Picture({ url }: { url: string | null }) {
	const [failed, setFailed] = useState<string | null>(null)
	if (url === null || failed === url) return <span className="absolute inset-0 bg-booth-raise" />
	return <img src={url} alt="" draggable={false} onError={() => setFailed(url)} className="absolute inset-0 size-full object-contain" />
}
