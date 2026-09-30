// Top band: READ-ONLY. Status where you look; actions where your hand rests.
// Nothing in here fires, stores, or deletes anything. The mode chip and, in
// operator mode, Settings are the only controls, and neither touches the show.

import type { LinkState } from '../../shared/reading.js'
import type { Mode } from '../../shared/ma-pane.js'
import { ModeChip } from './ModeChip.js'

function LinkPill({ link }: { link: LinkState }) {
	if (link.state === 'live') {
		return (
			<span className="flex items-center gap-2 text-state-live">
				<span className="size-2 rounded-full bg-state-live" />
				LIVE {link.roundTripMs.toFixed(1)}s
			</span>
		)
	}
	return (
		<span className="flex items-center gap-2 text-state-unreachable">
			<span className="size-2 rounded-full bg-state-unreachable" />
			UNREACHABLE
		</span>
	)
}

export function StatusBar({
	link,
	now,
	mode,
	onEnter,
	onLeave,
	pane,
	settingsOpen,
	onSettings,
}: {
	link: LinkState
	now: number
	mode: Mode
	onEnter: () => void
	onLeave: () => void
	/** The MA pane's own status, in a few words (paneSummary). */
	pane: string
	settingsOpen: boolean
	onSettings: () => void
}) {
	const clock = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
	// Today, from the same clock the ages derive from — not a literal, and not
	// the service's own date, which is a different fact and can disagree.
	const date = new Date(now).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })
	return (
		<header className="flex items-center gap-6 border-b border-booth-edge bg-booth-panel px-6 py-3 text-sm">
			<LinkPill link={link} />
			<span className="text-booth-dim">{date}</span>
			<span className="min-w-0 truncate text-booth-dim">MA · {pane}</span>
			<span className="ml-auto text-2xl font-medium tabular-nums">{clock}</span>
			{/* Boots into volunteer, always, and never remembers otherwise. */}
			<ModeChip mode={mode} onEnter={onEnter} onLeave={onLeave} />
			{mode === 'operator' && (
				<button
					type="button"
					onClick={onSettings}
					className={`rounded border px-4 py-2 text-xs tracking-widest ${
						settingsOpen ? 'border-booth-ink bg-booth-ink text-booth-bg' : 'border-booth-edge text-booth-dim'
					}`}
				>
					SETTINGS
				</button>
			)}
			<span className="text-booth-dim">Showfile ▸</span>
		</header>
	)
}
