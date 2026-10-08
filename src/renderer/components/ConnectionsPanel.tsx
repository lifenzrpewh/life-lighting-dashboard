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

import { useEffect, useState } from 'react'
import { ChevronRight, RotateCw } from 'lucide-react'

import type { ConnectionStatus, RowId } from '../../shared/connections.js'
import type { SettingsView } from '../../shared/settings.js'

import { addressOf, isOff } from './SettingsPanel.js'
import { toneText } from './settings/parts.js'
import { Button, Dot, Sheet } from './ui.js'
import { sentence } from './vocabulary.js'

export function ConnectionsPanel({
	rows,
	operator,
	onOpen,
	onClose,
}: {
	rows: readonly ConnectionStatus[]
	operator: boolean
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
				<ul className="mx-auto flex max-w-4xl flex-col gap-1.5 px-6 py-6">
					{rows.every((r) => r.tone === 'off') && (
						// A fresh install: every row off, which reads as a broken screen
						// unless something says it is only empty.
						<li className="mb-2 rounded-lg bg-booth-raise px-5 py-3 text-sm">
							Nothing is set up yet. {operator ? 'Tap a connection to set it up in Settings; start with the Console.' : 'Admin sets them up, in Settings.'}
						</li>
					)}
					{rows.map((r) => (
						<li key={r.id} className="flex items-center gap-2">
							<div className="min-w-0 flex-1">
								<StatusRow
									row={r}
									address={view === null ? null : addressOf(view, r.id)}
									off={view !== null && isOff(view, r.id)}
									onOpen={operator ? () => onOpen(r.id) : null}
								/>
							</div>
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

/** One connection: dot, name, state in a word, its detail, its address. A
 *  button in Admin, a plain row otherwise, so a volunteer's tap does nothing
 *  that looks like it should have. */
function StatusRow({ row, address, off, onOpen }: { row: ConnectionStatus; address: string | null; off: boolean; onOpen: (() => void) | null }) {
	const body = (
		<>
			<span className="flex justify-center">
				<Dot tone={row.tone} />
			</span>
			<span className="flex min-w-0 flex-col leading-tight">
				<span className="truncate text-lg font-medium">{row.name}</span>
				<span className="mt-1 flex min-w-0 items-baseline gap-2 text-sm">
					<span className={`shrink-0 ${toneText[row.tone]}`}>{sentence(row.status)}</span>
					{row.detail !== null && <span className="truncate text-booth-dim">· {row.detail}</span>}
				</span>
			</span>
			{address !== null ? (
				<span className={`max-w-56 truncate font-mono text-sm text-booth-dim ${off ? 'line-through opacity-60' : ''}`}>{address}</span>
			) : (
				<span />
			)}
			{onOpen !== null ? <ChevronRight size={20} className="text-booth-dim" aria-hidden /> : <span />}
		</>
	)
	const frame =
		'grid min-h-[4.5rem] w-full grid-cols-[1.25rem_1fr_auto_1.25rem] items-center gap-4 rounded-xl bg-booth-panel px-5 py-3 text-left ring-1 ring-booth-edge ring-inset'
	if (onOpen === null) return <div className={frame}>{body}</div>
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label={`${row.name}: ${sentence(row.status)}. Open in Settings.`}
			className={`${frame} transition-colors hover:bg-booth-hover active:bg-booth-hover`}
		>
			{body}
		</button>
	)
}
