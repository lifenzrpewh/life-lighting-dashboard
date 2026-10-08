// Connections: every program the dashboard talks to, one row each, its state
// in a word and the one detail that matters. Opens in the windows' place,
// because a native view cannot be drawn over, and closes back to them.
//
// A list to read, for everyone, since 2026-10-08 (the owner's choice: split
// Connections into status and Settings). A volunteer can see what is down and
// tell someone, and there is nothing here to move by accident. In Admin, a
// row is a way into Settings at that connection, where its fields are
// (./SettingsPanel.tsx). The statuses come from src/shared/connections.ts, the
// same rows the status bar's dot is the worst of.
//
// One action, for anyone (2026-10-08, merged from the video-restart branch):
// Restart video beside the Video feed's row. It fires nothing anywhere else;
// it lets the receivers go and opens them again (src/main/video-feed.ts).
//
// THE SHOW lives on the Console row since the 2026-10-08 look took the console
// card off the bar (./StatusBar.tsx): its name in the four states, and
// Showfile beside the row for Save As and Load (./ShowfileSheet.tsx, whose
// writes are Admin's and behind their own guards). The bar still speaks up
// for the base show and a console not answering.

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronRight, RotateCw, Save } from 'lucide-react'

import type { ConnectionStatus, RowId } from '../../shared/connections.js'
import { matchReading, type Reading } from '../../shared/reading.js'
import type { SettingsView } from '../../shared/settings.js'
import type { Showfile } from '../../shared/showfile.js'

import { addressOf, isOff } from './SettingsPanel.js'
import { toneText } from './settings/parts.js'
import { Button, Dot, Sheet } from './ui.js'
import { formatAge, sentence, staleContent, unknownWhy } from './vocabulary.js'

export function ConnectionsPanel({
	rows,
	operator,
	showfile,
	showfileFailure,
	onShowfile,
	onOpen,
	onClose,
}: {
	rows: readonly ConnectionStatus[]
	operator: boolean
	/** The console's show, or null while the console is turned off. */
	showfile: Reading<Showfile> | null
	/** Why the last showfile read failed, in the console's words, if it did. */
	showfileFailure: string | null
	/** Open the showfile sheet: Save As and Load. */
	onShowfile: () => void
	/** Admin tapped a row: open Settings at it. */
	onOpen: (id: RowId) => void
	onClose: () => void
}) {
	// The addresses, for the row's aside. Read once; nothing here changes them.
	const [view, setView] = useState<SettingsView | null>(null)
	useEffect(() => void window.life?.settings().then(setView), [])

	return (
		<Sheet
			title="Connections"
			description={operator ? 'What Pāua talks to. Tap one to change it in Settings.' : 'What Pāua talks to, and whether each is answering.'}
			onClose={onClose}
		>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<ul className="mx-auto flex max-w-4xl flex-col px-5 pt-2 pb-6">
					{rows.every((r) => r.tone === 'off') && (
						// A fresh install: every row off, which reads as a broken screen
						// unless something says it is only empty.
						<li className="mb-2 rounded-ctl bg-booth-raise px-5 py-3 text-[15px]">
							Nothing is set up yet. {operator ? 'Tap a connection to set it up in Settings; start with the Console.' : 'Admin sets them up, in Settings.'}
						</li>
					)}
					{rows.map((r, i) => (
						<li key={r.id} className="flex animate-rise items-center gap-2" style={{ animationDelay: `${i * 24}ms` }}>
							<div className="min-w-0 flex-1">
								<StatusRow
									row={r}
									show={r.id === 'console' && showfile !== null ? <ShowName showfile={showfile} failure={showfileFailure} /> : null}
									address={view === null ? null : addressOf(view, r.id)}
									off={view !== null && isOff(view, r.id)}
									onOpen={operator ? () => onOpen(r.id) : null}
								/>
							</div>
							{r.id === 'console' && showfile !== null && (
								<Button icon={Save} onClick={onShowfile}>
									Showfile
								</Button>
							)}
							{r.id === 'video' && r.tone !== 'off' && window.life !== undefined && (
								<Button icon={RotateCw} onClick={() => window.life?.restartVideo()}>
									Restart video
								</Button>
							)}
						</li>
					))}
				</ul>
			</div>
		</Sheet>
	)
}

/** The console's show, in the four states: its name; dimmed with its age when
 *  STALE; `?` and why when UNKNOWN; amber when it is the base show. */
function ShowName({ showfile, failure }: { showfile: Reading<Showfile>; failure: string | null }) {
	return matchReading<Showfile, ReactNode>(showfile, {
		live: (show) => <Named show={show} />,
		stale: (show, ageMs) => (
			<>
				<span className={staleContent}>
					<Named show={show} />
				</span>
				<span className="ml-2 font-bold text-state-stale">{formatAge(ageMs)}</span>
			</>
		),
		unknown: (why) => (
			<span className="text-booth-dim">
				Show ? {unknownWhy[why]}
				{why === 'error' && failure !== null && <span className="ml-2">{failure}</span>}
			</span>
		),
	})
}

function Named({ show }: { show: Showfile }) {
	return show.onBase ? <span className="font-bold text-warn">On the base show: {show.name}</span> : <span className="text-booth-ink">{show.name}</span>
}

/** One connection: dot, name, state in a word, its detail, its address. A
 *  button in Admin, a plain row otherwise, so a volunteer's tap does nothing
 *  that looks like it should have. Rows without boxes (the 2026-10-08 look):
 *  a square tile holds the dot. */
function StatusRow({
	row,
	show,
	address,
	off,
	onOpen,
}: {
	row: ConnectionStatus
	/** The Console row's second line: its show. */
	show: ReactNode
	address: string | null
	off: boolean
	onOpen: (() => void) | null
}) {
	const body = (
		<>
			<span className="grid size-12 place-items-center rounded-win bg-booth-raise">
				<Dot tone={row.tone} size="lg" />
			</span>
			<span className="flex min-w-0 flex-col leading-tight">
				<span className="truncate text-lg font-extrabold tracking-tight">{row.name}</span>
				<span className="mt-1 flex min-w-0 items-baseline gap-2 text-sm">
					<span className={`shrink-0 font-bold ${toneText[row.tone]}`}>{sentence(row.status)}</span>
					{row.detail !== null && <span className="truncate text-booth-dim">{row.detail}</span>}
				</span>
				{show !== null && <span className="mt-1 truncate text-sm">{show}</span>}
			</span>
			{address !== null ? (
				<span className={`max-w-56 truncate text-sm font-medium text-booth-dim ${off ? 'line-through opacity-60' : ''}`}>{address}</span>
			) : (
				<span />
			)}
			{onOpen !== null ? <ChevronRight size={20} className="text-booth-dim" aria-hidden /> : <span />}
		</>
	)
	const frame = 'grid min-h-[4.75rem] w-full grid-cols-[3rem_1fr_auto_1.25rem] items-center gap-4 rounded-win px-3 py-2.5 text-left'
	if (onOpen === null) return <div className={frame}>{body}</div>
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label={`${row.name}: ${sentence(row.status)}. Open in Settings.`}
			className={`${frame} transition-[background-color,transform] duration-150 hover:bg-booth-panel active:scale-[0.99] active:bg-booth-panel`}
		>
			{body}
		</button>
	)
}
