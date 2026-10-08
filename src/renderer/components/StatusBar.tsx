// Top band: READ-ONLY. Status where you look; actions where your hand rests.
// Nothing in here fires, stores, or deletes anything. The mode button,
// Guide, Layouts, Edit layout (operator mode), Connections and the console card are the only controls,
// and none of them touches the show: the console card opens a sheet, whose Save As and
// Load are behind operator mode and their own guards (./ShowfileSheet.tsx).
//
// Kept to what a volunteer acts on during a service (the owner's call,
// 2026-10-02): the console's link, the show, the countdown and the clock. Every
// other connection's health is in Connections, and its dot is the alarm that
// says to look there.
//
// Three zones since 2026-10-05 (the owner: "starting to feel a bit messy"):
// the console on the left, one card for whether it is there and which show it
// is on; time in the true centre, biggest on the bar; the controls on the
// right. Operator mode lays the nacre line along the bar's foot, so the mode
// is visible from across the booth without being the loudest thing on it.
//
// Slimmer since the afternoon of 2026-10-05 (the owner: "seems to take A LOT
// of screen space"): 60 px, the countdown one line, and a chevron that
// collapses the bar to a 36 px strip of the same readings (link, show,
// countdown, clock, the connections' dot, the mode), remembered on this
// computer. The strip's controls are Layouts (the owner, 2026-10-06: layouts
// "still appear in the collapsed view") and the chevron back.

import { useEffect, useState } from 'react'
import { BookOpen, Check, ChevronDown, ChevronUp, Flag, PanelsTopLeft, Pencil, Settings } from 'lucide-react'

import type { LinkState, Reading, UnknownReason } from '../../shared/reading.js'
import { matchReading } from '../../shared/reading.js'
import type { Tone } from '../../shared/connections.js'
import type { Mode } from '../../shared/ma-pane.js'
import type { Showfile } from '../../shared/showfile.js'
import type { TimerSources } from '../../shared/timer.js'
import { ModeChip } from './ModeChip.js'
import { TimerChip } from './TimerChip.js'
import { Button, Dot, IconButton } from './ui.js'
import { chip, formatAge, staleContent, stateClass, unknownWhy } from './vocabulary.js'

/** A round trip in milliseconds, which is what `roundTripMs` holds. Tenths
 *  below 10 ms, because a console on this computer answers in well under one
 *  and "0 ms" would read as no measurement at all. */
function formatRoundTrip(ms: number): string {
	return ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`
}

/** The console in one card: whether it answers, and the show it has loaded.
 *  The show is in the four states. On the base show the card is amber and
 *  says so for as long as that is true: a state, not a dialog to dismiss
 *  (docs/PLAN.md, Phase 3). The verdict is SaveGuard's, made on the console;
 *  this only shows it. A tap opens the showfile sheet: Save As and Load. */
function ConsoleCard({
	link,
	detail,
	showfile,
	failure,
	open,
	onOpen,
}: {
	link: LinkState
	/** The round trip is a number for the operator; a volunteer needs only
	 *  whether the console is there. */
	detail: boolean
	showfile: Reading<Showfile>
	failure: string | null
	open: boolean
	onOpen: () => void
}) {
	const live = link.state === 'live'
	const linkWords = live ? (
		<span className="text-state-live">Live{detail && <span className="ml-1.5 text-booth-dim tabular-nums">{formatRoundTrip(link.roundTripMs)}</span>}</span>
	) : (
		<span className="text-state-unreachable">Not answering</span>
	)

	type Body = { show: Showfile | null; ageMs: number | null; why: UnknownReason | null }
	const body = matchReading<Showfile, Body>(showfile, {
		live: (show) => ({ show, ageMs: null, why: null }),
		stale: (show, ageMs) => ({ show, ageMs, why: null }),
		unknown: (why) => ({ show: null, ageMs: null, why }),
	})
	const stale = body.ageMs !== null
	const onBase = body.show?.onBase === true
	// Amber belongs to ON BASE SHOW (theme.css). STALE keeps its own marks on
	// top: the dashed outline, the dimmed name, the age at full strength.
	const frame = onBase
		? `border-warn bg-warn/12 ${stale ? 'border-dashed' : 'border-solid'}`
		: body.why !== null
			? stateClass.unknown
			: stale
				? stateClass.stale
				: stateClass.live

	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label="The console and its show: Save As and Load"
			aria-expanded={open}
			className={`${chip} ${frame} h-12 max-w-[36rem] gap-3.5 pr-3 pl-4 text-left transition-colors hover:bg-booth-hover ${open ? 'bg-booth-hover' : ''}`}
		>
			<Dot tone={live ? 'live' : 'down'} />
			<span className="flex min-w-0 flex-col leading-tight">
				<span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
					<span className="text-booth-dim">Console ·</span>
					{linkWords}
					{onBase && <span className="font-semibold text-warn">· On base show</span>}
				</span>
				<span className={`truncate font-mono text-[15px] ${stale ? staleContent : ''}`}>
					{body.show !== null ? (
						body.show.name
					) : (
						<span className="text-booth-dim">
							? {unknownWhy[body.why!]}
							{/* What went wrong, when the console said: an out-of-date
							    plugin is something the LD can fix, and "read failed"
							    alone does not say how. */}
							{body.why === 'error' && failure !== null && <span className="ml-2 font-sans text-xs">{failure}</span>}
						</span>
					)}
				</span>
			</span>
			{stale && <span className="text-xs whitespace-nowrap text-state-stale">{formatAge(body.ageMs!)}</span>}
			<ChevronDown size={18} className="shrink-0 text-booth-dim" aria-hidden />
		</button>
	)
}

/** Now, from the same clock the ages derive from: not a literal, and not the
 *  service's own date, which is a different fact and can disagree. */
function Clock({ now }: { now: number }) {
	const d = new Date(now)
	const parts = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).formatToParts(d)
	const time = parts
		.filter((p) => p.type !== 'dayPeriod')
		.map((p) => p.value)
		.join('')
		.trim()
	const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? null
	const date = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
	return (
		<span className="flex shrink-0 flex-col leading-none">
			<span className="flex items-baseline gap-1.5">
				<span className="text-[24px] font-medium tracking-tight tabular-nums">{time}</span>
				{period !== null && <span className="text-sm font-medium text-booth-dim">{period}</span>}
			</span>
			<span className="mt-0.5 text-xs text-booth-dim">{date}</span>
		</span>
	)
}

export function StatusBar({
	link,
	consoleOn,
	now,
	mode,
	onEnter,
	onLeave,
	connectionsOpen,
	onMark,
	guideOpen,
	onGuide,
	layoutName,
	layoutsOpen,
	onLayouts,
	editing,
	onEditLayout,
	onConnections,
	settingsOpen,
	onSettings,
	showfileOpen,
	onShowfile,
	connections,
	showfile,
	showfileFailure,
	timers,
	collapsed,
	onCollapse,
}: {
	link: LinkState
	/** False when the console is turned off in Connections: no link, no show. */
	consoleOn: boolean
	now: number
	mode: Mode
	onEnter: () => void
	onLeave: () => void
	connectionsOpen: boolean
	/** "Mark this moment": a line in the log for a tester. Answers which mark,
	 *  or null when it could not be written. */
	onMark: () => Promise<number | null>
	/** The Creative Guide (../../shared/guide.ts), for everyone to read. */
	guideOpen: boolean
	onGuide: () => void
	/** The saved layout on screen, if it is one (../../shared/layout.ts). */
	layoutName: string | null
	layoutsOpen: boolean
	/** Open Layouts: everyone may switch; operator mode edits and saves. */
	onLayouts: () => void
	/** Edit layout, on the bar as well as in Layouts (the owner's ask,
	 *  2026-10-05): operator mode only; tapped again, it finishes. */
	editing: boolean
	onEditLayout: () => void
	onConnections: () => void
	/** Settings (./SettingsPanel.tsx): Admin only, not drawn otherwise. */
	settingsOpen: boolean
	onSettings: () => void
	showfileOpen: boolean
	/** Open the showfile sheet. */
	onShowfile: () => void
	/** The worst of the connections that are set up (src/shared/connections.ts). */
	connections: Tone
	showfile: Reading<Showfile>
	/** Why the last showfile read failed, in the console's words, if it did. */
	showfileFailure: string | null
	/** OnTime and ProPresenter, as main last heard them. */
	timers: TimerSources | null
	/** The bar folded to a strip. */
	collapsed: boolean
	onCollapse: (collapsed: boolean) => void
}) {
	const operator = mode === 'operator'
	const open = 'bg-booth-hover ring-1 ring-inset ring-booth-dim/40'
	if (collapsed) {
		return <Strip {...{ link, consoleOn, now, operator, connections, showfile, timers, layoutName, layoutsOpen, onLayouts }} onExpand={() => onCollapse(false)} />
	}
	return (
		<header className="relative grid h-[60px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-6 border-b border-booth-edge bg-booth-panel px-4">
			{/* The console: is it there, and which show it is on. */}
			<div className="flex min-w-0 items-center">
				{consoleOn && (
					<ConsoleCard
						link={link}
						detail={operator}
						showfile={showfile}
						failure={showfileFailure}
						open={showfileOpen}
						onOpen={onShowfile}
					/>
				)}
			</div>

			{/* The time: what comes next, and what it is now. */}
			<div className="flex min-w-0 items-center gap-7">
				<TimerChip sources={timers} />
				<Clock now={now} />
			</div>

			{/* Controls, where the hand rests. None touches the show. */}
			<div className="flex min-w-0 items-center justify-end gap-2">
				<Button icon={BookOpen} onClick={onGuide} pressed={guideOpen} className={guideOpen ? open : ''}>
					Guide
				</Button>
				<Button icon={PanelsTopLeft} onClick={onLayouts} pressed={layoutsOpen} className={`max-w-72 ${layoutsOpen ? open : ''}`}>
					<span className="truncate">{layoutName ?? 'Layouts'}</span>
					<ChevronDown size={16} className="-mr-1 text-booth-dim" aria-hidden />
				</Button>
				{operator && (
					<Button icon={editing ? Check : Pencil} onClick={onEditLayout} pressed={editing} className={editing ? open : ''}>
						{editing ? 'Done' : 'Edit layout'}
					</Button>
				)}
				{/* For everyone: a volunteer can see what is down and say so. The
				    fields are in Settings, Admin's. */}
				<Button onClick={onConnections} pressed={connectionsOpen} className={connectionsOpen ? open : ''}>
					<Dot tone={connections} />
					Connections
				</Button>
				<MarkButton onMark={onMark} />
				{operator && <IconButton icon={Settings} label="Settings" onClick={onSettings} pressed={settingsOpen} />}
				{/* Boots into volunteer, always, and never remembers otherwise. */}
				<ModeChip mode={mode} onEnter={onEnter} onLeave={onLeave} />
				<IconButton icon={ChevronUp} label="Fold the bar away" onClick={() => onCollapse(true)} />
			</div>

			{operator && <span aria-hidden className="nacre-line absolute inset-x-0 -bottom-px h-0.5" />}
		</header>
	)
}

/** The bar folded: the same readings in one 36 px line, and the way back. */
function Strip({
	link,
	consoleOn,
	now,
	operator,
	connections,
	showfile,
	timers,
	layoutName,
	layoutsOpen,
	onLayouts,
	onExpand,
}: {
	link: LinkState
	consoleOn: boolean
	now: number
	operator: boolean
	connections: Tone
	showfile: Reading<Showfile>
	timers: TimerSources | null
	layoutName: string | null
	layoutsOpen: boolean
	onLayouts: () => void
	onExpand: () => void
}) {
	const live = link.state === 'live'
	const show = matchReading<Showfile, { name: string | null; stale: boolean; onBase: boolean }>(showfile, {
		live: (s) => ({ name: s.name, stale: false, onBase: s.onBase }),
		stale: (s) => ({ name: s.name, stale: true, onBase: s.onBase }),
		unknown: () => ({ name: null, stale: false, onBase: false }),
	})
	const time = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
	return (
		<header className="relative flex h-9 shrink-0 items-center gap-4 border-b border-booth-edge bg-booth-panel pl-4 text-sm">
			{consoleOn && (
				<span className="flex min-w-0 items-center gap-2">
					<Dot tone={live ? 'live' : 'down'} size="sm" />
					<span className={live ? 'text-state-live' : 'text-state-unreachable'}>{live ? 'Live' : 'Not answering'}</span>
					{show.name !== null && (
						<span className={`truncate font-mono text-xs ${show.onBase ? 'text-warn' : ''} ${show.stale ? staleContent : ''}`}>
							{show.name}
							{show.onBase && ' · on base show'}
						</span>
					)}
				</span>
			)}
			<span className="ml-auto flex shrink-0 items-center gap-4">
				<TimerChip sources={timers} compact />
				<span className="font-medium tabular-nums">{time}</span>
				<span className="flex items-center gap-1.5 text-xs text-booth-dim">
					<Dot tone={connections} size="sm" />
					Connections
				</span>
				<span className={`text-xs ${operator ? 'text-booth-ink' : 'text-booth-dim'}`}>{operator ? 'Admin' : 'Volunteer'}</span>
				<button
					type="button"
					onClick={onLayouts}
					aria-pressed={layoutsOpen}
					aria-label="Layouts"
					className={`flex h-9 max-w-56 items-center gap-1.5 px-3 text-xs hover:bg-booth-raise ${layoutsOpen ? 'bg-booth-hover text-booth-ink' : 'text-booth-dim hover:text-booth-ink'}`}
				>
					<PanelsTopLeft size={15} strokeWidth={1.8} className="shrink-0" aria-hidden />
					<span className="truncate">{layoutName ?? 'Layouts'}</span>
					<ChevronDown size={14} className="shrink-0" aria-hidden />
				</button>
			</span>
			<button
				type="button"
				onClick={onExpand}
				aria-label="Show the bar"
				title="Show the bar"
				className="grid h-full w-14 shrink-0 place-items-center text-booth-dim hover:bg-booth-raise hover:text-booth-ink"
			>
				<ChevronDown size={18} aria-hidden />
			</button>
			{operator && <span aria-hidden className="nacre-line absolute inset-x-0 -bottom-px h-0.5" />}
		</header>
	)
}

/** "Mark this moment" (the owner, 2026-10-04): a tester taps it when something
 *  happens, and the log has a line at that moment to find. It says which mark
 *  for a moment, so the tester can write the number down. A flag, not a word:
 *  it is for testers, and a volunteer can leave it be. */
function MarkButton({ onMark }: { onMark: () => Promise<number | null> }) {
	const [marked, setMarked] = useState<number | null>(null)
	useEffect(() => {
		if (marked === null) return
		const t = setTimeout(() => setMarked(null), 3_000)
		return () => clearTimeout(t)
	}, [marked])
	return (
		<button
			type="button"
			onClick={() => void onMark().then(setMarked)}
			aria-label="Mark this moment in the log"
			title="Mark this moment in the log"
			className={`inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg transition-colors active:scale-[0.97] ${
				marked !== null ? 'bg-state-live/15 px-4 text-sm font-medium text-state-live' : 'w-12 text-booth-dim hover:bg-booth-raise hover:text-booth-ink'
			}`}
		>
			<Flag size={19} strokeWidth={1.8} aria-hidden />
			{marked !== null && `Mark ${marked}`}
		</button>
	)
}
