// Top band: READ-ONLY. Status where you look; actions where your hand rests.
// Nothing in here fires, stores, or deletes anything. The mode chip, Reload MA
// and, in operator mode, Settings are the only controls, and none touches the
// show: Reload MA only loads the web remote's page again.

import type { LinkState, Reading } from '../../shared/reading.js'
import { matchReading } from '../../shared/reading.js'
import type { Mode } from '../../shared/ma-pane.js'
import type { Showfile } from '../../shared/showfile.js'
import type { TimerSources } from '../../shared/timer.js'
import { ModeChip } from './ModeChip.js'
import { TimerChip } from './TimerChip.js'
import type { DeskState } from '../../shared/desk.js'
import { Unknown, barButton, chip, chipLabel, formatAge, staleContent, stateClass } from './vocabulary.js'

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
		return <span className="whitespace-nowrap text-warn">OSC port {desk.port} not bound</span>
	}

	if (desk.lastHeardAt === null) {
		return <span className="whitespace-nowrap text-booth-dim">desk not heard yet</span>
	}

	return (
		<span className="whitespace-nowrap text-booth-dim">
			desk {formatAge(now - desk.lastHeardAt)} · {desk.executors.length}{' '}
			{desk.executors.length === 1 ? 'control' : 'controls'}
			{/* Should sit at zero forever. A number climbing here means the desk is
			    saying something we are reading wrong, and silence about it would be
			    the worst option. */}
			{desk.rejected > 0 && <span className="text-warn"> · {desk.rejected} rejected</span>}
		</span>
	)
}

/** A round trip in milliseconds, which is what `roundTripMs` holds. Tenths
 *  below 10 ms, because a console on this computer answers in well under one
 *  and "0 ms" would read as no measurement at all. */
function formatRoundTrip(ms: number): string {
	return ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`
}

/** The link's verdict. The round trip is a number for the operator; a
 *  volunteer needs only whether the console is there. */
function LinkPill({ link, detail }: { link: LinkState; detail: boolean }) {
	if (link.state === 'live') {
		return (
			<span className="flex items-center gap-2 whitespace-nowrap text-state-live">
				<span className="size-2 rounded-full bg-state-live" />
				LIVE{detail && <span className="text-booth-dim">{formatRoundTrip(link.roundTripMs)}</span>}
			</span>
		)
	}
	return (
		<span className="flex items-center gap-2 whitespace-nowrap text-state-unreachable">
			<span className="size-2 rounded-full bg-state-unreachable" />
			UNREACHABLE
		</span>
	)
}

/** The loaded showfile, in the four states. On the base show it is amber and
 *  reads ON BASE SHOW for as long as that is true: a state, not a dialog to
 *  dismiss (docs/PLAN.md, Phase 3). The verdict is SaveGuard's, made on the
 *  console; this only shows it.
 *
 *  No ▸ yet. The sheet it will open (Save As, Load) is not built, and an arrow
 *  on something that does nothing when tapped teaches people to stop trying. */
function ShowfileChip({ showfile, failure }: { showfile: Reading<Showfile>; failure: string | null }) {
	return matchReading(showfile, {
		live: (show) => <ShowName show={show} ageMs={null} />,
		stale: (show, ageMs) => <ShowName show={show} ageMs={ageMs} />,
		unknown: (why) => (
			<span className={`${chip} ${stateClass.unknown}`}>
				<span className={chipLabel}>Show</span>
				<Unknown why={why} />
				{/* What went wrong, when the console said: an out-of-date plugin is
				    something the LD can fix, and "read failed" alone does not say how. */}
				{why === 'error' && failure !== null && <span className="truncate text-xs text-booth-dim">{failure}</span>}
			</span>
		),
	})
}

function ShowName({ show, ageMs }: { show: Showfile; ageMs: number | null }) {
	const stale = ageMs !== null
	// Amber belongs to ON BASE SHOW (theme.css). STALE keeps its own marks on
	// top: the dashed border, the dimmed name, the age at full strength.
	const frame = show.onBase
		? `border-warn bg-warn/15 ${stale ? 'border-dashed' : 'border-solid'}`
		: stale
			? stateClass.stale
			: stateClass.live
	return (
		<span className={`${chip} ${frame}`}>
			<span className={`flex min-w-0 items-center gap-3 ${stale ? staleContent : ''}`}>
				{show.onBase ? (
					<span className="text-xs font-semibold tracking-widest whitespace-nowrap text-warn">ON BASE SHOW</span>
				) : (
					<span className={chipLabel}>Show</span>
				)}
				<span className="truncate text-sm">{show.name}</span>
			</span>
			{stale && <span className="text-xs whitespace-nowrap text-state-stale">{formatAge(ageMs)}</span>}
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
	onReloadPane,
	settingsOpen,
	onSettings,
	desk,
	showfile,
	showfileFailure,
	timers,
}: {
	link: LinkState
	now: number
	mode: Mode
	onEnter: () => void
	onLeave: () => void
	/** The MA pane's own status, in a few words (paneSummary). */
	pane: string
	/** Reload the MA pane; null when there is no page to reload. */
	onReloadPane: (() => void) | null
	settingsOpen: boolean
	onSettings: () => void
	/** What channel B has heard: an observation, beside the link's verdict. */
	desk: DeskState | null
	showfile: Reading<Showfile>
	/** Why the last showfile read failed, in the console's words, if it did. */
	showfileFailure: string | null
	/** OnTime and ProPresenter, as main last heard them. */
	timers: TimerSources | null
}) {
	const clock = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
	// Today, from the same clock the ages derive from — not a literal, and not
	// the service's own date, which is a different fact and can disagree.
	const date = new Date(now).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
	const operator = mode === 'operator'
	return (
		<header className="flex h-16 shrink-0 items-center gap-4 border-b border-booth-edge bg-booth-panel px-4 text-sm">
			{/* The console: is it there, and which show is it on. */}
			<LinkPill link={link} detail={operator} />
			<ShowfileChip showfile={showfile} failure={showfileFailure} />
			{/* For the operator only: what the wire has heard and where the pane
			    is pointed. A volunteer has the pane itself to look at. */}
			{operator && (
				<span className="flex min-w-0 items-center gap-4 text-xs">
					<DeskPill desk={desk} now={now} />
					<span className="min-w-0 truncate text-booth-dim">MA · {pane}</span>
				</span>
			)}

			{/* The time: what comes next, and what it is now. */}
			<span className="ml-auto flex min-w-0 items-center">
				<TimerChip sources={timers} />
			</span>
			<span className="flex shrink-0 flex-col items-end leading-tight">
				<span className="text-2xl font-medium tabular-nums">{clock}</span>
				<span className="text-xs text-booth-dim">{date}</span>
			</span>

			{/* Controls, where the hand rests. None touches the show. */}
			<span className="flex shrink-0 items-center gap-2 border-l border-booth-edge pl-4">
				{/* Beside the pane, never over it. The pane reloads itself when MA's
				    page is stuck in a state it never leaves; this is for whatever
				    that does not recognise. It reconnects the picture and fires
				    nothing. */}
				{onReloadPane !== null && (
					<button type="button" onClick={onReloadPane} className={barButton}>
						↻ MA
					</button>
				)}
				{operator && (
					<button
						type="button"
						onClick={onSettings}
						className={settingsOpen ? `${barButton} border-booth-ink bg-booth-ink text-booth-bg` : barButton}
					>
						SETTINGS
					</button>
				)}
				{/* Boots into volunteer, always, and never remembers otherwise. */}
				<ModeChip mode={mode} onEnter={onEnter} onLeave={onLeave} />
			</span>
		</header>
	)
}
