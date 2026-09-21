// Top band: READ-ONLY. Status where you look; actions where your hand rests.
// Nothing in here fires, stores, or deletes anything.

import type { LinkState } from '../../shared/reading.js'
import type { DeskState } from '../../shared/desk.js'
import { formatAge } from './vocabulary.js'

/** What channel B has actually heard — an OBSERVATION, sat deliberately apart
 *  from the link pill's VERDICT.
 *
 *  The two can disagree and that is correct: the link is UNREACHABLE because
 *  nothing has round-tripped, while the desk may be pushing fader levels at us
 *  this second. Collapsing them into one green dot is how "we heard something"
 *  quietly becomes "everything is fine", which is the failure this app exists
 *  to refuse. Uses none of the state colours, because this is not a Reading. */
function DeskPill({ desk, now }: { desk: DeskState | null; now: number }) {
	// No main process at all — the renderer is open in a plain browser.
	if (desk === null) return null

	if (!desk.listening) {
		// A port that would not bind is a fault to act on, not a quiet desk.
		// Amber is reserved for exactly this.
		return <span className="text-warn">OSC port not bound</span>
	}

	if (desk.lastHeardAt === null) {
		return <span className="text-booth-dim">desk not heard yet</span>
	}

	return (
		<span className="text-booth-dim">
			desk {formatAge(now - desk.lastHeardAt)} · {desk.executors.length}{' '}
			{desk.executors.length === 1 ? 'control' : 'controls'}
			{/* Should sit at zero forever. A number climbing here means the desk is
			    saying something we are reading wrong, and silence about it would be
			    the worst option. */}
			{desk.rejected > 0 && <span className="text-warn"> · {desk.rejected} rejected</span>}
		</span>
	)
}

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
	desk,
}: {
	link: LinkState
	now: number
	desk: DeskState | null
}) {
	const clock = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
	// Today, from the same clock the ages derive from — not a literal, and not
	// the service's own date, which is a different fact and can disagree.
	const date = new Date(now).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })
	return (
		<header className="flex items-center gap-6 border-b border-booth-edge bg-booth-panel px-6 py-3 text-sm">
			<LinkPill link={link} />
			<DeskPill desk={desk} now={now} />
			<span className="text-booth-dim">{date}</span>
			<span className="ml-auto text-2xl font-medium tabular-nums">{clock}</span>
			{/* Boots into volunteer, always, and never remembers otherwise. */}
			<span className="rounded border border-booth-edge px-3 py-1 text-xs tracking-widest text-booth-dim">
				VOLUNTEER
			</span>
			<span className="text-booth-dim">Showfile ▸</span>
		</header>
	)
}
