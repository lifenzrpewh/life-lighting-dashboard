// The Announcements view (2026-10-14, the owner's ask: ProPresenter's lower
// thirds checked, then loaded): ProPresenter's "Announcements AM" or "PM"
// against the service the media check follows, one row per lower third the
// run sheet calls for, in its order. The rules are ../../shared/announcements.ts.
//
// Read-only for now: nothing here writes to ProPresenter. Loading is the next
// step (docs/VISUALS_DASHBOARD.md § ProPresenter announcements).
//
// Arena is not needed: the service and run sheet come from the lookbook, and
// an Arena not answering only empties what the media check knows of Arena.

import { useEffect, useState } from 'react'
import { Check, CircleAlert, RefreshCw } from 'lucide-react'

import type { ArenaStatus } from '../../shared/arena.js'
import { checkAnnouncements, playlistFor, wantedAnnouncements, type PlaylistRead } from '../../shared/announcements.js'
import { lookbookThumbUrl } from '../../shared/media-check.js'
import type { Channel } from '../../shared/reading.js'
import { useMediaCheck } from '../useMediaCheck.js'
import { ServiceLine } from './MediaCheck.js'
import { chipLabel, formatAge } from './vocabulary.js'

/** How often the playlist is asked again while the view is on screen. */
const READ_EVERY_MS = 30_000

const NO_ARENA: ArenaStatus = { master: 0, deck: null, groups: [], layers: [], columns: [] }

export function AnnouncementsView({ status, now }: { status: Channel<ArenaStatus> | null | undefined; now: number }) {
	const arena = status?.lastOk?.value ?? NO_ARENA
	const m = useMediaCheck(arena, now, false)
	const [details, setDetails] = useState(false)
	const playlist = m.service === null ? null : playlistFor(m.service)

	const [read, setRead] = useState<PlaylistRead | null>(null)
	const [reading, setReading] = useState(false)
	const ask = () => {
		const api = window.life
		if (playlist === null || api === undefined) return
		setReading(true)
		void api.proPresenterPlaylist(playlist).then((r) => {
			setReading(false)
			setRead(r ?? { ok: false, detail: 'Pāua did not answer', at: Date.now() })
		})
	}
	useEffect(() => {
		setRead(null)
		ask()
		const id = setInterval(ask, READ_EVERY_MS)
		return () => clearInterval(id)
	}, [playlist])

	const want = wantedAnnouncements(m.runSheet ?? [])
	const check = read?.ok === true ? checkAnnouncements(read.name, want, read.items) : null
	const there = check?.rows.filter((r) => r.state === 'there').length ?? 0

	const summary =
		check === null ? null : want.length === 0 ? (
			<span className="text-booth-dim">No lower thirds on this run sheet's announcements</span>
		) : check.ok ? (
			<span className="text-state-live">All in {check.playlist}, in order</span>
		) : (
			<span className="text-warn">
				{there} of {want.length} in {check.playlist}
				{!check.ordered && ' · out of order'}
				{check.extras.length > 0 && ` · ${check.extras.length} not on this run sheet`}
			</span>
		)

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
						{read !== null && <span className="text-xs text-booth-dim">read {formatAge(Math.max(0, now - read.at))}</span>}
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
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				{m.service !== null && playlist === null && (
					<Said>Not known whether "{m.service.name}" is AM or PM, so not which playlist to check.</Said>
				)}
				{read?.ok === false && <Said tone="warn">{read.detail}</Said>}
				{check !== null && (
					<div className="mx-auto flex max-w-[1400px] flex-col gap-2">
						{check.rows.map((row, i) => {
							const file = want[i]?.file ?? null
							return (
								<div key={row.code} className={`flex min-w-0 items-center gap-4 rounded-win bg-booth-panel p-2 pr-4 ${row.state === 'there' ? '' : 'ring-2 ring-warn'}`}>
									<span className="w-8 shrink-0 text-center text-lg tabular-nums text-booth-dim">{i + 1}</span>
									{/* A lower third is white words on nothing: on grey, as the lookbook shows it. */}
									<div className="relative aspect-video w-48 shrink-0 overflow-hidden rounded-ctl bg-neutral-600">
										{file !== null && <img src={lookbookThumbUrl(file, 'thumbnail') ?? undefined} alt="" className="absolute inset-0 size-full object-contain" />}
									</div>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate text-base font-bold">{row.code}</span>
										<span className="truncate text-sm text-booth-dim">{row.title}</span>
									</span>
									{row.state === 'there' ? (
										<span className="flex shrink-0 items-center gap-2 text-state-live">
											<Check size={20} aria-hidden /> In the playlist, item {row.at + 1}
										</span>
									) : (
										<span className="flex shrink-0 items-center gap-2 font-bold text-warn">
											<CircleAlert size={20} aria-hidden /> Not in the playlist
										</span>
									)}
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
								{check.others} other item{check.others === 1 ? '' : 's'} in the playlist (no lower-third code in the name), left alone.
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	)
}

function Said({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
	return <p className={`p-6 text-center ${tone === 'warn' ? 'text-warn' : 'text-booth-dim'}`}>{children}</p>
}
