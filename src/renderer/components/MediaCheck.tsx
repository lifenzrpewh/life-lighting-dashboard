// The media check, inside the Arena view (the owner's choice, 2026-10-04): pick
// a service from the lookbook, and every B, F and A code its run sheet calls for
// is marked loaded, not in Arena, file missing, another version, or not
// checkable. The rules are ../../shared/media-check.ts; the reads are main's
// (src/main/lookbook.ts), asked only when someone opens or re-checks.
//
// It re-compares on every Arena update, so loading the right clip clears its
// mark without asking the lookbook again. The run sheet is asked again only by
// Check again: the lookbook is a hosted app beyond the booth, not a feed.

import { useEffect, useState } from 'react'

import type { ArenaStatus } from '../../shared/arena.js'
import {
	checkMedia,
	nzDate,
	offeredServices,
	TYPE_NAMES,
	mediaCodeOf,
	type CodeCheck,
	type LookbookItem,
	type LookbookRead,
	type LookbookService,
} from '../../shared/media-check.js'
import { chipLabel, formatAge } from './vocabulary.js'

/** The service last picked on this machine: a convenience, so a re-opened
 *  kiosk checks the same service. Only offered again while the lookbook still
 *  lists it. */
const PICKED_KEY = 'paua.mediaCheck.service'

function remembered(): string | null {
	try {
		return localStorage.getItem(PICKED_KEY)
	} catch {
		return null
	}
}

function remember(id: string): void {
	try {
		localStorage.setItem(PICKED_KEY, id)
	} catch {
		// A machine that keeps nothing asks again next time.
	}
}

type Load<T> = { kind: 'idle' } | { kind: 'reading' } | { kind: 'read'; read: LookbookRead<T> }

export function MediaCheck({ status, now }: { status: ArenaStatus; now: number }) {
	const [open, setOpen] = useState(false)
	const [campus, setCampus] = useState<string | null>(null)
	const [services, setServices] = useState<Load<LookbookService[]>>({ kind: 'idle' })
	const [picked, setPicked] = useState<string | null>(remembered)
	const [items, setItems] = useState<Load<LookbookItem[]>>({ kind: 'idle' })

	const life = window.life
	const readServices = () => {
		if (life === undefined) return
		setServices({ kind: 'reading' })
		void life.lookbookServices().then((read) => setServices({ kind: 'read', read }))
	}
	const readItems = (id: string) => {
		if (life === undefined) return
		setItems({ kind: 'reading' })
		void life.lookbookItems(id).then((read) => setItems({ kind: 'read', read }))
	}

	// Asked the first time the check opens, not before: a closed panel costs
	// the lookbook nothing.
	useEffect(() => {
		if (!open || services.kind !== 'idle') return
		readServices()
		// The campus orders the list; a pop-out has no settings, and lists all.
		void life?.settings().then((s) => setCampus(s?.campus ?? null))
	}, [open])

	const offered = services.kind === 'read' && services.read.ok ? offeredServices(services.read.value, nzDate(new Date(now)), campus) : []
	const service = offered.find((s) => s.id === picked) ?? null

	// A remembered service is read once the lookbook still lists it.
	useEffect(() => {
		if (service !== null && items.kind === 'idle') readItems(service.id)
	}, [service?.id])

	const pick = (id: string) => {
		setPicked(id)
		remember(id)
		readItems(id)
	}

	const check = items.kind === 'read' && items.read.ok ? checkMedia(items.read.value, status) : null
	const trouble = check === null ? 0 : check.counts['not-loaded'] + check.counts['not-on-disk'] + check.counts['other-version']
	const unsettled = check?.counts['no-lookbook-file'] ?? 0
	const total = check === null ? 0 : Object.values(check.counts).reduce((a, b) => a + b, 0)

	let summary: React.ReactNode
	if (service === null) summary = <span className="text-booth-dim">Pick a service</span>
	else if (items.kind === 'reading') summary = <span className="text-booth-dim">Reading the lookbook…</span>
	else if (items.kind === 'read' && !items.read.ok) summary = <span className="text-warn">The lookbook could not be read</span>
	else if (check === null) summary = <span className="text-booth-dim">Not checked</span>
	else if (total === 0) summary = <span className="text-booth-dim">No Arena media on this run sheet</span>
	else if (trouble > 0) summary = <span className="text-warn">{trouble === 1 ? '1 to look at' : `${trouble} to look at`}</span>
	else if (unsettled > 0) summary = <span className="text-booth-dim">{unsettled === 1 ? '1 the lookbook has no file for' : `${unsettled} the lookbook has no file for`}</span>
	else summary = <span>All {total} loaded</span>

	return (
		<div className={`shrink-0 border-b border-booth-edge ${trouble > 0 ? 'bg-warn/10' : ''}`}>
			<button type="button" onClick={() => setOpen(!open)} className="flex h-11 w-full min-w-0 items-center gap-3 px-4 text-left text-sm">
				<span className={chipLabel}>Media</span>
				{/* The verdict keeps its room; the service's name gives way first. */}
				{service !== null && <span className="min-w-0 truncate text-booth-dim">{service.name}</span>}
				<span className="shrink-0">{summary}</span>
				<span className="ml-auto shrink-0 text-xs text-booth-dim">{open ? 'Hide' : 'Show'}</span>
			</button>
			{open && (
				<div className="max-h-[60vh] overflow-y-auto px-4 pb-3">
					<ServicePicker load={services} offered={offered} picked={service?.id ?? null} onPick={pick} onRetry={readServices} />
					{service !== null && <Result load={items} check={check} now={now} onAgain={() => readItems(service.id)} />}
				</div>
			)}
		</div>
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
					className={`flex h-11 min-w-0 flex-col justify-center rounded-md border px-3 text-left text-xs active:scale-[0.98] ${
						s.id === picked ? 'border-booth-ink bg-booth-edge' : 'border-booth-edge'
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

function Result({ load, check, now, onAgain }: { load: Load<LookbookItem[]>; check: ReturnType<typeof checkMedia> | null; now: number; onAgain: () => void }) {
	if (load.kind !== 'read') return <p className="py-2 text-sm text-booth-dim">Reading the run sheet…</p>
	const read = load.read
	return (
		<div>
			<div className="flex items-center gap-3 border-t border-booth-edge py-2 text-xs text-booth-dim">
				<span className="min-w-0 flex-1 truncate">
					{read.ok ? `Run sheet read ${formatAge(Math.max(0, now - read.at))}` : <span className="text-warn">{read.detail}</span>}
				</span>
				<SmallButton onClick={onAgain}>Check again</SmallButton>
			</div>
			{check?.items.map((item, i) => (
				<div key={i} className="border-t border-booth-edge/60 py-2">
					<div className="truncate text-sm">
						{item.title}
						{item.label !== null && <span className="text-booth-dim"> · {item.label}</span>}
					</div>
					<ul className="mt-1 flex flex-col gap-1">
						{item.codes.map((c, j) => (
							<CodeRow key={j} check={c} />
						))}
					</ul>
				</div>
			))}
		</div>
	)
}

/** One code: what it is, and what became of it. Amber only where someone must
 *  act; a code the check could not settle is said, never shown as loaded. */
function CodeRow({ check }: { check: CodeCheck }) {
	const type = TYPE_NAMES[mediaCodeOf(check.code)?.type ?? ''] ?? ''
	const where = (at: { layer: string; column: number }) => `${at.layer} · column ${at.column}`
	let state: React.ReactNode
	let detail: string | null = null
	switch (check.state) {
		case 'ok':
			state = <span className="text-booth-dim">✓ {where(check.at)}</span>
			break
		case 'not-loaded':
			state = <span className="text-warn">not in Arena</span>
			break
		case 'not-on-disk':
			state = <span className="text-warn">file missing on this computer</span>
			detail = `${where(check.at)} · ${check.at.file}`
			break
		case 'other-version':
			state = <span className="text-warn">another version</span>
			detail = `${where(check.at)} has ${fileName(check.at.file)}; the lookbook has ${check.want}`
			break
		case 'no-lookbook-file':
			state = <span className="text-booth-dim">? the lookbook has no file{check.at !== null && ` · in ${where(check.at)}`}</span>
			break
	}
	return (
		<li className="flex min-w-0 flex-col text-sm">
			<span className="flex min-w-0 items-baseline gap-2">
				<span className="w-14 shrink-0 font-mono text-xs">{check.code}</span>
				<span className="w-20 shrink-0 text-xs text-booth-dim">{type}</span>
				<span className="min-w-0 truncate">{state}</span>
			</span>
			{detail !== null && <span className="truncate pl-[8.5rem] text-xs text-booth-dim">{detail}</span>}
		</li>
	)
}

function fileName(path: string): string {
	return path.split(/[\\/]/).at(-1) ?? path
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
	return (
		<button type="button" onClick={onClick} className="h-9 shrink-0 rounded-md border border-booth-edge px-3 text-xs text-booth-dim active:bg-booth-edge">
			{children}
		</button>
	)
}
