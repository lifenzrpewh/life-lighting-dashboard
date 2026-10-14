// The Announcements view (2026-10-14, the owner's ask: ProPresenter's lower
// thirds checked, then loaded): the service the media check follows against
// ProPresenter's announcement playlists. The rules and the three loading steps
// are ../../shared/announcements.ts.
//
// Each lower third the run sheet calls for, in the playlist's order (NORMAL
// NOTICES, then PROMOS), with where it has got to: the folder's Smart
// Playlist, the media playlist a person drags it into, and the output playlist
// the show plays from. Admin sees the two writes: Copy to the folder, and
// Write the output playlist (confirmed first). Everyone sees the check.
//
// Arena is not needed: the service and run sheet come from the lookbook, and
// an Arena not answering only empties what the media check knows of Arena.

import { useEffect, useState } from 'react'
import { Check, CircleAlert, Copy, ListOrdered, RefreshCw } from 'lucide-react'

import type { ArenaStatus } from '../../shared/arena.js'
import {
	SECTION_HEADER,
	checkAnnouncements,
	itemOf,
	sessionOf,
	wantedAnnouncements,
	type AnnouncementsRead,
	type CopyOutcome,
	type PlaylistRead,
	type WriteResult,
} from '../../shared/announcements.js'
import { lookbookThumbUrl } from '../../shared/media-check.js'
import type { Channel } from '../../shared/reading.js'
import { useOperator } from '../mode.js'
import { useMediaCheck } from '../useMediaCheck.js'
import { ServiceLine } from './MediaCheck.js'
import { Button } from './ui.js'
import { chipLabel, formatAge } from './vocabulary.js'

/** How often the playlists are asked again while the view is on screen. */
const READ_EVERY_MS = 10_000

const NO_ARENA: ArenaStatus = { master: 0, deck: null, groups: [], layers: [], columns: [] }

type Copied = { ok: true; outcomes: CopyOutcome[]; setAside: string[] } | { ok: false; detail: string }

export function AnnouncementsView({ status, now }: { status: Channel<ArenaStatus> | null | undefined; now: number }) {
	const arena = status?.lastOk?.value ?? NO_ARENA
	const m = useMediaCheck(arena, now, false)
	const operator = useOperator()
	const [details, setDetails] = useState(false)
	const session = m.service === null ? null : sessionOf(m.service)

	const [read, setRead] = useState<AnnouncementsRead | null>(null)
	const [reading, setReading] = useState(false)
	const ask = () => {
		const api = window.life
		if (session === null || api === undefined) return
		setReading(true)
		void api.announcements(session).then((r) => {
			setReading(false)
			const none: PlaylistRead = { ok: false, detail: 'Pāua did not answer', at: Date.now() }
			setRead(r ?? { output: none, media: none, smart: none })
		})
	}
	useEffect(() => {
		setRead(null)
		ask()
		const id = setInterval(ask, READ_EVERY_MS)
		return () => clearInterval(id)
	}, [session])

	const [copying, setCopying] = useState(false)
	const [copied, setCopied] = useState<Copied | null>(null)
	const [confirming, setConfirming] = useState(false)
	const [writing, setWriting] = useState(false)
	const [written, setWritten] = useState<WriteResult | null>(null)

	const want = wantedAnnouncements(m.runSheet ?? [])
	const output = read?.output.ok === true ? read.output : null
	const media = read?.media.ok === true ? read.media.items : null
	const smart = read?.smart.ok === true ? read.smart.items : null
	const check = output === null ? null : checkAnnouncements(output.name, want, output.items)
	const there = check?.rows.filter((r) => r.state === 'there').length ?? 0
	const inMedia = media === null ? 0 : want.filter((w) => itemOf(media, w.code) !== null).length
	const outcomeOf = (code: string) => (copied?.ok === true ? copied.outcomes.find((o) => o.code === code) : undefined)

	const copy = () => {
		const api = window.life
		if (api === undefined || want.length === 0) return
		setCopying(true)
		setCopied(null)
		void api.copyAnnouncements(want.map((w) => w.code)).then((r) => {
			setCopying(false)
			setCopied(r)
			ask()
		})
	}
	const write = () => {
		const api = window.life
		if (api === undefined || session === null) return
		setConfirming(false)
		setWriting(true)
		setWritten(null)
		void api.writeAnnouncements(session, want.map(({ code, section }) => ({ code, section }))).then((r) => {
			setWriting(false)
			setWritten(r)
			ask()
		})
	}

	const summary =
		check === null ? null : want.length === 0 ? (
			<span className="text-booth-dim">No lower thirds on this run sheet</span>
		) : check.ok ? (
			<span className="text-state-live">All in {check.playlist}</span>
		) : (
			<span className="text-warn">
				{there} of {want.length} in {check.playlist}
				{check.extras.length > 0 && ` · ${check.extras.length} not on this run sheet`}
			</span>
		)
	const failed = read === null ? [] : [read.output, read.media, read.smart].flatMap((r) => (r.ok ? [] : [r.detail]))

	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="shrink-0 border-b border-booth-edge px-4">
				<div className="flex h-12 min-w-0 items-center gap-3 text-sm">
					<span className={chipLabel}>Announcements</span>
					<button type="button" onClick={() => setDetails(!details)} className="min-w-0 truncate rounded-ctl px-1 text-booth-dim hover:text-booth-ink">
						{m.service !== null ? `${m.service.name}${m.byHand ? ' (picked)' : ''}` : 'Which service?'}
					</button>
					<span className="min-w-0 truncate font-bold tabular-nums">{summary}</span>
					<span className="ml-auto flex shrink-0 items-center gap-2">
						{read !== null && <span className="text-xs text-booth-dim">read {formatAge(Math.max(0, now - read.output.at))}</span>}
						<button
							type="button"
							onClick={() => {
								m.readItemsAgain()
								ask()
							}}
							disabled={reading}
							aria-label="Check again"
							title="Check again"
							className="grid size-10 place-items-center rounded-ctl bg-booth-raise hover:bg-booth-hover disabled:opacity-50"
						>
							<RefreshCw size={16} aria-hidden className={reading ? 'animate-spin' : ''} />
						</button>
					</span>
				</div>
				{(details || m.service === null) && (
					<div className="border-t border-booth-edge/60">
						<ServiceLine m={m} />
					</div>
				)}
				{operator && want.length > 0 && read !== null && (
					<div className="flex flex-col gap-2 border-t border-booth-edge/60 py-3 text-sm">
						<div className="flex min-w-0 flex-wrap items-center gap-3">
							<span className="w-6 text-center font-bold text-booth-dim">1</span>
							<Button size="sm" icon={Copy} disabled={copying} onClick={copy}>
								{copying ? 'Copying…' : 'Copy to the folder'}
							</Button>
							<span className="min-w-0 text-booth-dim">
								{copied === null
									? `The ${want.length} lower thirds, numbered in order, for "${read.smart.ok ? read.smart.name : 'the Smart Playlist'}".`
									: copied.ok
										? `${copied.outcomes.filter((o) => o.state !== 'not-on-drive' && o.state !== 'failed').length} in the folder${
												copied.setAside.length > 0 ? `, ${copied.setAside.length} old set aside` : ''
											}${copied.outcomes.some((o) => o.state === 'not-on-drive' || o.state === 'failed') ? '; some not copied, below' : ''}.`
										: copied.detail}
							</span>
						</div>
						<div className="flex min-w-0 items-center gap-3">
							<span className="w-6 text-center font-bold text-booth-dim">2</span>
							<span className={inMedia === want.length ? 'text-state-live' : 'text-booth-ink'}>
								{inMedia === want.length
									? `All ${want.length} in "${read.media.ok ? read.media.name : 'the media playlist'}".`
									: `In ProPresenter, drag the new ones from "${read.smart.ok ? read.smart.name : 'the Smart Playlist'}" into "${
											read.media.ok ? read.media.name : 'the media playlist'
										}": ${inMedia} of ${want.length} there.`}
							</span>
						</div>
						<div className="flex min-w-0 flex-wrap items-center gap-3">
							<span className="w-6 text-center font-bold text-booth-dim">3</span>
							{confirming ? (
								<>
									<span className="text-booth-ink">
										Replace everything in "{output?.name}" with {SECTION_HEADER.notices} and {SECTION_HEADER.promos}, in the order below?
									</span>
									<Button size="sm" variant="warn" onClick={write}>
										Write it
									</Button>
									<Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
										Not now
									</Button>
								</>
							) : (
								<>
									<Button size="sm" icon={ListOrdered} disabled={writing || inMedia !== want.length || output === null} onClick={() => setConfirming(true)}>
										{writing ? 'Writing…' : `Write "${output?.name ?? 'the playlist'}"`}
									</Button>
									<span className="min-w-0 text-booth-dim">
										{written === null
											? inMedia !== want.length
												? 'Once every one is in the media playlist.'
												: 'Headers and order, read back after.'
											: written.ok
												? `Written and read back: ${written.items} items.`
												: written.detail}
									</span>
								</>
							)}
						</div>
					</div>
				)}
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				{failed.map((f) => (
					<p key={f} className="pb-1 text-center text-warn">
						{f}
					</p>
				))}
				{check !== null && (
					<div className="mx-auto flex max-w-[1400px] flex-col gap-2">
						{want.map((w, i) => {
							const row = check.rows.find((r) => r.code === w.code)
							const o = outcomeOf(w.code)
							const header = i === 0 || want[i - 1]?.section !== w.section
							return (
								<div key={w.code} className="flex flex-col gap-2">
									{header && <p className="pt-2 text-xs font-bold tracking-wider text-booth-dim">{SECTION_HEADER[w.section]}</p>}
									<div className={`flex min-w-0 items-center gap-4 rounded-win bg-booth-panel p-2 pr-4 ${row?.state === 'there' ? '' : 'ring-2 ring-warn'}`}>
										<span className="w-8 shrink-0 text-center text-lg tabular-nums text-booth-dim">{i + 1}</span>
										{/* A lower third is white words on nothing: on grey, as the lookbook shows it. */}
										<div className="relative aspect-video w-48 shrink-0 overflow-hidden rounded-ctl bg-neutral-600">
											{w.file !== null && <img src={lookbookThumbUrl(w.file, 'thumbnail') ?? undefined} alt="" className="absolute inset-0 size-full object-contain" />}
										</div>
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="truncate text-base font-bold">{w.code}</span>
											<span className="truncate text-sm text-booth-dim">
												{w.title}
												{w.label !== null && ` · ${w.label}`}
											</span>
											{o !== undefined && (o.state === 'not-on-drive' || o.state === 'failed') && <span className="truncate text-sm text-warn">{o.detail}</span>}
										</span>
										<Step label="Folder" on={smart === null ? null : itemOf(smart, w.code) !== null} />
										<Step label="Media" on={media === null ? null : itemOf(media, w.code) !== null} />
										{row?.state === 'there' ? (
											<span className="flex shrink-0 items-center gap-2 text-state-live">
												<Check size={20} aria-hidden /> In the playlist, item {row.at + 1}
											</span>
										) : (
											<span className="flex shrink-0 items-center gap-2 font-bold text-warn">
												<CircleAlert size={20} aria-hidden /> Not in the playlist
											</span>
										)}
									</div>
								</div>
							)
						})}
						{check.extras.length > 0 && (
							<div className="mt-4 rounded-win bg-booth-panel p-4">
								<p className="pb-2 text-sm font-bold text-warn">In {check.playlist}, not on this run sheet</p>
								{check.extras.map((x) => (
									<p key={`${x.at}`} className="truncate text-sm">
										Item {x.at + 1}: {x.name}
									</p>
								))}
							</div>
						)}
						{check.others > 0 && (
							<p className="mt-2 text-sm text-booth-dim">
								{check.others} other item{check.others === 1 ? '' : 's'} in the playlist (headers, or no lower-third code in the name), left alone by the check.
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	)
}

/** Whether a lower third has reached one of the steps; null: not known (that
 *  playlist could not be read). */
function Step({ label, on }: { label: string; on: boolean | null }) {
	const tone = on === null ? 'text-booth-faint' : on ? 'text-state-live' : 'text-booth-dim'
	return (
		<span className={`flex w-20 shrink-0 items-center gap-1 text-xs ${tone}`} title={on === null ? `${label}: not read` : on ? `${label}: there` : `${label}: not yet`}>
			{on === true ? <Check size={14} aria-hidden /> : <span aria-hidden className="inline-block size-3.5 rounded-full border border-current" />}
			{label}
		</span>
	)
}
