// Top band: READ-ONLY. Status where you look; actions where your hand rests.
// Nothing in here fires, stores, or deletes anything. The mode lock, Guide,
// Layouts, Connections, Settings (Admin) and the console card are the
// controls, and none of them touches the show: the console card opens a
// sheet, whose Save As and Load are Admin's and behind their own guards
// (./ShowfileSheet.tsx).
//
// Kept to what a volunteer acts on during a service (the owner's call,
// 2026-10-02): the console's link, the show, the countdown and the clock. Every
// other connection's health is in Connections, and its dot is the alarm that
// says to look there.
//
// Three zones since 2026-10-05 (the owner: "starting to feel a bit messy"):
// the console on the left, one card for whether it is there and which show it
// is on; time in the true centre, biggest on the bar; the controls on the
// right. Admin lays the nacre line along the bar's foot, so the mode is
// visible from across the booth without being the loudest thing on it.
//
// ONE BAR, TWO HEIGHTS (the owner, 2026-10-08): folded is the same bar at 36 px
// with smaller type and icons, every item in the same place and every button
// doing all it does unfolded. It was a separate strip with its own
// arrangement and fewer controls (2026-10-05, the owner: the bar "seems to
// take A LOT of screen space"), so things moved under the finger. The fold is
// remembered on this computer. Edit layout left the bar the same day; it is
// in Layouts › Edit this layout.
//
// THE TIME IS NEVER COVERED (the owner's bug, 2026-10-08: in Admin the clock
// went behind the buttons). The zones are flex, not a 1fr/auto/1fr grid,
// whose right column let its buttons spill left over the centre once Admin
// added one. The sides give way first: the console card truncates, and the
// buttons drop their words for their icons when they would not fit their
// half. Should even the icons not fit, the time moves off true centre rather
// than under anything.
//
// Admin hides any item a booth does not use (Settings › Top bar,
// ../barItems.ts), per computer. The lock, Settings and the chevron always stay.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpen, ChevronDown, ChevronUp, Flag, PanelsTopLeft, Settings } from 'lucide-react'

import type { LinkState, Reading, UnknownReason } from '../../shared/reading.js'
import { matchReading } from '../../shared/reading.js'
import type { Tone } from '../../shared/connections.js'
import type { Mode } from '../../shared/ma-pane.js'
import type { Showfile } from '../../shared/showfile.js'
import type { TimerSources } from '../../shared/timer.js'
import type { BarItem } from '../barItems.js'
import { ModeChip } from './ModeChip.js'
import { TimerChip } from './TimerChip.js'
import { Dot, type Icon } from './ui.js'
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
 *  this only shows it. A tap opens the showfile sheet: Save As and Load,
 *  folded or not. */
function ConsoleCard({
	link,
	detail,
	showfile,
	failure,
	open,
	compact,
	onOpen,
}: {
	link: LinkState
	/** The round trip is a number for Admin; a volunteer needs only whether
	 *  the console is there. */
	detail: boolean
	showfile: Reading<Showfile>
	failure: string | null
	open: boolean
	/** The folded bar: one line. */
	compact: boolean
	onOpen: () => void
}) {
	const live = link.state === 'live'
	const linkWords = live ? (
		<span className="text-state-live">
			Live{detail && !compact && <span className="ml-1.5 text-booth-dim tabular-nums">{formatRoundTrip(link.roundTripMs)}</span>}
		</span>
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

	const name =
		body.show !== null ? (
			body.show.name
		) : (
			<span className="text-booth-dim">
				? {unknownWhy[body.why!]}
				{/* What went wrong, when the console said: an out-of-date
				    plugin is something the LD can fix, and "read failed"
				    alone does not say how. */}
				{body.why === 'error' && failure !== null && !compact && <span className="ml-2 font-sans text-xs">{failure}</span>}
			</span>
		)

	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label="The console and its show: Save As and Load"
			aria-expanded={open}
			className={`${chip} ${frame} max-w-[36rem] min-w-0 text-left transition-colors hover:bg-booth-hover ${open ? 'bg-booth-hover' : ''} ${
				compact ? 'h-7 gap-2 pr-1.5 pl-2.5' : 'h-12 gap-3.5 pr-3 pl-4'
			}`}
		>
			<Dot tone={live ? 'live' : 'down'} size={compact ? 'sm' : 'md'} />
			{compact ? (
				<span className="flex min-w-0 items-baseline gap-2 text-xs whitespace-nowrap">
					{linkWords}
					<span className={`min-w-0 truncate font-mono ${onBase ? 'text-warn' : ''} ${stale ? staleContent : ''}`}>{name}</span>
					{onBase && <span className="shrink-0 font-semibold text-warn">· base</span>}
				</span>
			) : (
				<span className="flex min-w-0 flex-col leading-tight">
					<span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap">
						<span className="text-booth-dim">Console ·</span>
						{linkWords}
						{onBase && <span className="font-semibold text-warn">· On base show</span>}
					</span>
					<span className={`truncate font-mono text-[15px] ${stale ? staleContent : ''}`}>{name}</span>
				</span>
			)}
			{stale && <span className="shrink-0 text-xs whitespace-nowrap text-state-stale">{formatAge(body.ageMs!)}</span>}
			<ChevronDown size={compact ? 14 : 18} className="shrink-0 text-booth-dim" aria-hidden />
		</button>
	)
}

/** Now, from the same clock the ages derive from: not a literal, and not the
 *  service's own date, which is a different fact and can disagree. Folded, the
 *  time alone. */
function Clock({ now, compact }: { now: number; compact: boolean }) {
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
				<span className={`${compact ? 'text-base' : 'text-[24px]'} font-medium tracking-tight tabular-nums`}>{time}</span>
				{period !== null && <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-booth-dim`}>{period}</span>}
			</span>
			{!compact && <span className="mt-0.5 text-xs text-booth-dim">{date}</span>}
		</span>
	)
}

/** A button on the bar: an icon and its word, the word dropped when the bar is
 *  short of room (`bare`), smaller when folded. Always labelled, for a screen
 *  reader and a tooltip. */
function BarButton({
	icon: IconC,
	lead,
	label,
	words,
	trail,
	onClick,
	pressed,
	compact,
	bare,
	maxWords,
}: {
	icon?: Icon
	/** Drawn before the words in place of an icon: the Connections dot. */
	lead?: ReactNode
	label: string
	/** What the button says, when there is room. */
	words: ReactNode
	trail?: ReactNode
	onClick: () => void
	pressed: boolean
	compact: boolean
	bare: boolean
	maxWords?: string
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={pressed}
			aria-label={label}
			title={label}
			className={`inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors select-none active:scale-[0.98] ${
				compact ? `h-8 text-xs ${bare ? 'min-w-9 px-2' : 'gap-1.5 px-2.5'}` : `h-12 text-base ${bare ? 'min-w-12 px-3' : 'gap-2.5 px-5'}`
			} ${
				pressed
					? 'bg-booth-hover text-booth-ink ring-1 ring-booth-dim/40 ring-inset'
					: compact
						? 'text-booth-dim hover:bg-booth-raise hover:text-booth-ink'
						: 'bg-booth-raise text-booth-ink hover:bg-booth-hover'
			}`}
		>
			{IconC !== undefined && <IconC size={compact ? 15 : 20} strokeWidth={1.8} aria-hidden className="shrink-0" />}
			{lead}
			{!bare && <span className={`truncate ${maxWords ?? ''}`}>{words}</span>}
			{trail}
		</button>
	)
}

export function StatusBar({
	link,
	consoleOn,
	now,
	mode,
	onEnter,
	onLeave,
	asking,
	connectionsOpen,
	onMark,
	guideOpen,
	onGuide,
	layoutName,
	layoutsOpen,
	onLayouts,
	onConnections,
	settingsOpen,
	onSettings,
	showfileOpen,
	onShowfile,
	connections,
	showfile,
	showfileFailure,
	timers,
	hidden,
	collapsed,
	onCollapse,
}: {
	link: LinkState
	/** False when the console is turned off in Settings: no link, no show. */
	consoleOn: boolean
	now: number
	mode: Mode
	onEnter: () => void
	onLeave: () => void
	/** The passcode sheet is open. */
	asking: boolean
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
	/** Open Layouts: everyone may switch; Admin edits and saves. */
	onLayouts: () => void
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
	/** What Admin has hidden on this computer (../barItems.ts). */
	hidden: ReadonlySet<BarItem>
	/** The bar folded: 36 px, the same items in the same places. */
	collapsed: boolean
	onCollapse: (collapsed: boolean) => void
}) {
	const operator = mode === 'operator'
	const compact = collapsed
	const shows = (item: BarItem) => !hidden.has(item)

	// How many words the buttons keep: only as many as fit in their half of
	// the bar beside the time. 0, all; 1, Guide and Connections are icons and
	// the layout's name shorter; 2, every button an icon, the lock too.
	// Measured, since what fits depends on the mode, the layout's name, what
	// is hidden and the screen.
	const bar = useRef<HTMLElement | null>(null)
	const centre = useRef<HTMLDivElement | null>(null)
	const right = useRef<HTMLDivElement | null>(null)
	const [tight, setTight] = useState<0 | 1 | 2>(0)
	const widths = useRef<number[]>([])
	const measureKey = `${operator}|${compact}|${layoutName}|${[...hidden].join()}|${consoleOn}`
	// What the buttons hold changed: try the words again, before paint.
	useLayoutEffect(() => {
		widths.current = []
		setTight(0)
	}, [measureKey])
	useLayoutEffect(() => {
		const measure = () => {
			const b = bar.current
			const c = centre.current
			const r = right.current
			if (b === null || c === null || r === null) return
			const style = getComputedStyle(b)
			const inner = b.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
			const gap = parseFloat(style.columnGap) || 0
			const half = (inner - c.offsetWidth - 2 * gap) / 2
			widths.current[tight] = r.scrollWidth
			if (tight < 2 && r.scrollWidth > half + 0.5) setTight((tight + 1) as 1 | 2)
			else if (tight > 0 && (widths.current[tight - 1] ?? Infinity) <= half) setTight((tight - 1) as 0 | 1)
		}
		measure()
		const ro = new ResizeObserver(measure)
		if (bar.current !== null) ro.observe(bar.current)
		if (centre.current !== null) ro.observe(centre.current)
		return () => ro.disconnect()
	}, [tight, measureKey])
	const bare = tight === 2

	return (
		<header
			ref={bar}
			className={`relative flex shrink-0 items-center overflow-hidden border-b border-booth-edge bg-booth-panel ${
				compact ? 'h-9 gap-3 px-2' : 'h-[60px] gap-6 px-4'
			}`}
		>
			{/* The console: is it there, and which show it is on. Gives way first. */}
			<div className="flex min-w-0 flex-1 basis-0 items-center">
				{consoleOn && shows('console') && (
					<ConsoleCard
						link={link}
						detail={operator}
						showfile={showfile}
						failure={showfileFailure}
						open={showfileOpen}
						compact={compact}
						onOpen={onShowfile}
					/>
				)}
			</div>

			{/* The time: what comes next, and what it is now. Never shrinks. */}
			<div ref={centre} className={`flex shrink-0 items-center ${compact ? 'gap-4' : 'gap-7'}`}>
				{shows('countdown') && <TimerChip sources={timers} compact={compact} />}
				{shows('clock') && <Clock now={now} compact={compact} />}
			</div>

			{/* Controls, where the hand rests. None touches the show. Never
			    narrower than its buttons: past its half, they lose their words. */}
			<div ref={right} className={`flex flex-1 basis-0 items-center justify-end ${compact ? 'gap-1' : 'gap-2'}`}>
				{shows('guide') && (
					<BarButton icon={BookOpen} label="Guide" words="Guide" onClick={onGuide} pressed={guideOpen} compact={compact} bare={tight > 0} />
				)}
				{shows('layouts') && (
					<BarButton
						icon={PanelsTopLeft}
						label={layoutName === null ? 'Layouts' : `Layouts: ${layoutName}`}
						words={layoutName ?? 'Layouts'}
						maxWords={tight > 0 ? 'max-w-28' : compact ? 'max-w-40' : 'max-w-56'}
						trail={<ChevronDown size={compact ? 13 : 16} className="-mr-1 shrink-0 text-booth-dim" aria-hidden />}
						onClick={onLayouts}
						pressed={layoutsOpen}
						compact={compact}
						bare={bare}
					/>
				)}
				{/* For everyone: a volunteer can see what is down and say so. The
				    fields are in Settings, Admin's. */}
				{shows('connections') && (
					<BarButton
						lead={<Dot tone={connections} size={compact ? 'sm' : 'md'} />}
						label="Connections"
						words="Connections"
						onClick={onConnections}
						pressed={connectionsOpen}
						compact={compact}
						bare={tight > 0}
					/>
				)}
				{shows('mark') && <MarkButton onMark={onMark} compact={compact} />}
				{operator && <SquareButton icon={Settings} label="Settings" onClick={onSettings} pressed={settingsOpen} compact={compact} />}
				{/* Boots into volunteer, always, and never remembers otherwise. */}
				<ModeChip mode={mode} onEnter={onEnter} onLeave={onLeave} compact={compact} bare={bare} asking={asking} />
				<SquareButton
					icon={compact ? ChevronDown : ChevronUp}
					label={compact ? 'Show the bar at full height' : 'Fold the bar away'}
					onClick={() => onCollapse(!compact)}
					compact={compact}
				/>
			</div>

			{operator && <span aria-hidden className="nacre-line absolute inset-x-0 bottom-0 h-0.5" />}
		</header>
	)
}

/** An icon alone, the size of the bar's other buttons. */
function SquareButton({
	icon: IconC,
	label,
	onClick,
	pressed,
	compact,
}: {
	icon: Icon
	label: string
	onClick: () => void
	pressed?: boolean
	compact: boolean
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			className={`inline-flex shrink-0 items-center justify-center rounded-lg transition-colors active:scale-[0.96] ${compact ? 'size-8' : 'size-12'} ${
				pressed ? 'bg-booth-hover text-booth-ink ring-1 ring-booth-dim/40 ring-inset' : 'text-booth-dim hover:bg-booth-raise hover:text-booth-ink'
			}`}
		>
			<IconC size={compact ? 16 : 20} strokeWidth={1.8} aria-hidden />
		</button>
	)
}

/** "Mark this moment" (the owner, 2026-10-04): a tester taps it when something
 *  happens, and the log has a line at that moment to find. It says which mark
 *  for a moment, so the tester can write the number down. A flag, not a word:
 *  it is for testers, and a volunteer can leave it be. */
function MarkButton({ onMark, compact }: { onMark: () => Promise<number | null>; compact: boolean }) {
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
			className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg transition-colors active:scale-[0.97] ${compact ? 'h-8' : 'h-12'} ${
				marked !== null
					? `bg-state-live/15 font-medium text-state-live ${compact ? 'px-2.5 text-xs' : 'px-4 text-sm'}`
					: `${compact ? 'w-8' : 'w-12'} text-booth-dim hover:bg-booth-raise hover:text-booth-ink`
			}`}
		>
			<Flag size={compact ? 15 : 19} strokeWidth={1.8} aria-hidden />
			{marked !== null && `Mark ${marked}`}
		</button>
	)
}
