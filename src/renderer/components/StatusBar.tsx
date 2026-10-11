// Top band: READ-ONLY. Status where you look; actions where your hand rests.
// Nothing in here fires, stores, or deletes anything. Layouts, the alerts,
// Connections, Mark (while testing), Settings (Admin) and the lock are the
// controls, and none of them touches the show.
//
// THE 2026-10-08 LOOK (the owner's, over nine rounds in the "Pāua palette"
// playground, https://claude.ai/artifact/KpEQSRUpXMdCC4cJHjQQbQ). Three zones,
// quiet while everything answers and loud when not:
// - Left: Layouts, where you are, then an alert lane that is empty on a good
//   day. It speaks only when something needs a look: the console on its base
//   show (amber, solid, opens Save As and Load), the console not answering, or
//   another connection down or behind (named when one, counted when more;
//   opens Connections). Each but the base show's has a × that puts it away
//   until it changes or clears and comes back (the owner, 2026-10-11). The console card that stood here went: the show is on
//   the console itself and on Connections' Console row ("they can see the
//   showfile in the console itself", the owner), and the two moments it
//   mattered are the alerts.
// - Centre: the countdown and the clock, each a big number over a grey line
//   (what it counts to; the date), a hairline between them. Folded, each line
//   sits beside its number.
// - Right: one tray of same-sized square tools: Connections (its dot a badge
//   on it), Mark while Testing is on (Settings › Top bar), Settings in Admin,
//   and the lock, which in Admin is the selected blue and says so.
//
// FOLDING (the owner chose a handle over a More menu, which took two presses):
// a handle on the bar's bottom edge, inside the bar since nothing may be drawn
// over a page. Tap it, or drag it up to fold and down to unfold. Folded is the
// same bar at 34 px, every item in its place and doing all it does unfolded
// (the owner, 2026-10-08: things must not move under the finger). Remembered
// on this computer.
// Instant, not animated: the pages main draws are placed from the windows
// under the bar, and a sliding bar would drag them through a re-placement a
// frame.
//
// THE TIME IS NEVER COVERED (the owner's bug, 2026-10-08: in Admin the clock
// went behind the buttons). The zones are flex, the sides sharing what is left
// beside the time: the layout's name truncates and the alert lane clips first.
// Should even the tray not fit, the time moves off true centre rather than
// under anything.
//
// Admin hides any reading a booth does not use (Settings › Top bar,
// ../barItems.ts), per computer. The lock, Settings and the handle always stay.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Activity, ChevronDown, Download, Flag, Lock, LockOpen, PanelsTopLeft, Settings, X } from 'lucide-react'

import type { LinkState, Reading } from '../../shared/reading.js'
import type { ConnectionStatus, Tone } from '../../shared/connections.js'
import { worstTone } from '../../shared/connections.js'
import type { Mode } from '../../shared/ma-pane.js'
import type { Showfile } from '../../shared/showfile.js'
import type { TimerSources } from '../../shared/timer.js'
import type { UpdateState } from '../../shared/updates.js'
import type { BarItem } from '../barItems.js'
import { TimerChip, timerFace } from './TimerChip.js'
import { Dot, type Icon } from './ui.js'
import { sentence } from './vocabulary.js'

/** Now, from the same clock the ages derive from: not a literal, and not the
 *  service's own date, which is a different fact and can disagree. The date
 *  under the time; folded, beside it. */
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
		<span className={`flex shrink-0 px-2 ${compact ? 'flex-row-reverse items-baseline gap-2' : 'flex-col items-start gap-1.5'}`}>
			<span className="flex items-baseline gap-1 leading-none">
				<span className={`${compact ? 'text-base' : 'text-[26px]'} font-extrabold tracking-tight tabular-nums`}>{time}</span>
				{period !== null && <span className={`${compact ? 'text-[11px]' : 'text-[13px]'} font-bold text-booth-dim`}>{period}</span>}
			</span>
			<span className={`leading-none font-medium whitespace-nowrap text-booth-dim ${compact ? 'text-xs' : 'text-[12.5px]'}`}>{date}</span>
		</span>
	)
}

/** Something that needs a look, said in words on the left of the bar. A tap
 *  opens where it can be dealt with; its × puts it away (the owner,
 *  2026-10-11), all but the base show's. */
type Alert = { key: string; tone: Tone | 'warn' | 'news'; words: string; open: 'showfile' | 'connections' | 'updates'; dismissable: boolean }

/** One alert as it stands: a dismissal holds for these words only, so an
 *  alert that changes, or clears and comes back, is said again. */
const alertId = (a: Alert) => `${a.key}\n${a.words}`

/** What the alert lane says now. Empty on a good day. */
function alertsOf(link: LinkState, consoleOn: boolean, showfile: Reading<Showfile>, rows: readonly ConnectionStatus[], updates: UpdateState | null): Alert[] {
	const alerts: Alert[] = []
	const show = showfile.state === 'unknown' ? null : showfile.value
	// SaveGuard's verdict, made on the console; this only says it (docs/PLAN.md,
	// Phase 3): a state for as long as it is true, not a dialog to dismiss. The
	// one alert with no ×: a show saved over the base is the mistake it is for.
	if (consoleOn && show?.onBase === true)
		alerts.push({ key: 'base', tone: 'warn', words: `On the base show: ${show.name}`, open: 'showfile', dismissable: false })
	if (consoleOn && link.state === 'unreachable')
		alerts.push({ key: 'console', tone: 'down', words: 'Console not answering', open: 'connections', dismissable: true })
	const others = rows.filter((r) => r.id !== 'console' && (r.tone === 'down' || r.tone === 'stale'))
	if (others.length === 1) {
		const r = others[0]!
		alerts.push({ key: `row:${r.id}`, tone: r.tone, words: `${r.name}: ${sentence(r.status).toLowerCase()}`, open: 'connections', dismissable: true })
	} else if (others.length > 1) {
		alerts.push({ key: 'rows', tone: worstTone(others), words: `${others.length} connections need a look`, open: 'connections', dismissable: true })
	}
	// Last, and quiet: news, not a fault. A tap opens Settings › This computer
	// (Admin's passcode first), where Update asks once more.
	if (updates?.state === 'available') alerts.push({ key: 'update', tone: 'news', words: `Pāua ${updates.version} is out`, open: 'updates', dismissable: true })
	if (updates?.state === 'downloading' || updates?.state === 'installing')
		alerts.push({
			key: 'update',
			tone: 'news',
			words: updates.state === 'installing' ? `Installing Pāua ${updates.version}` : `Downloading Pāua ${updates.version}`,
			open: 'updates',
			dismissable: true,
		})
	return alerts
}

const alertTone: Record<Alert['tone'], string> = {
	warn: 'bg-warn text-black',
	down: 'bg-state-unreachable/15 text-state-unreachable',
	stale: 'bg-state-stale/15 text-state-stale',
	live: 'bg-state-live/15 text-state-live',
	off: 'bg-booth-raise text-booth-dim',
	news: 'bg-accent/25 text-booth-ink',
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
	testing,
	onMark,
	layoutName,
	layoutsOpen,
	onLayouts,
	onConnections,
	settingsOpen,
	onSettings,
	onShowfile,
	rows,
	showfile,
	timers,
	hidden,
	collapsed,
	onCollapse,
	updates,
	onUpdates,
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
	/** Settings › Top bar › Testing (../barItems.ts): Mark is on the bar. */
	testing: boolean
	/** "Mark this moment": a line in the log for a tester. Answers which mark,
	 *  or null when it could not be written. */
	onMark: () => Promise<number | null>
	/** The saved layout on screen, if it is one (../../shared/layout.ts). */
	layoutName: string | null
	layoutsOpen: boolean
	/** Open Layouts: everyone may switch, save and delete (2026-10-08). */
	onLayouts: () => void
	onConnections: () => void
	/** Settings (./SettingsPanel.tsx): Admin only, not drawn otherwise. */
	settingsOpen: boolean
	onSettings: () => void
	/** Open the showfile sheet: the base-show alert's tap. */
	onShowfile: () => void
	/** Every connection's row (src/shared/connections.ts): the badge is the
	 *  worst of those set up, and the alerts name what is down. */
	rows: readonly ConnectionStatus[]
	showfile: Reading<Showfile>
	/** OnTime and ProPresenter, as main last heard them. */
	timers: TimerSources | null
	/** What Admin has hidden on this computer (../barItems.ts). */
	hidden: ReadonlySet<BarItem>
	/** The bar folded: 34 px, the same items in the same places. */
	collapsed: boolean
	onCollapse: (collapsed: boolean) => void
	/** What the updater last knew: a new version is said in the alert lane. */
	updates: UpdateState | null
	/** The update alert's tap. */
	onUpdates: () => void
}) {
	const admin = mode === 'operator'
	const compact = collapsed
	const shows = (item: BarItem) => !hidden.has(item)
	const said = alertsOf(link, consoleOn, showfile, rows, updates)
	// Put away by their ×, until they change or clear. In memory only: a
	// restart says everything again. Connections' badge still shows the worst,
	// so a fault put away here is never a fault unsaid.
	const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
	const saidIds = said.map(alertId).join('\n\n')
	useEffect(() => {
		const ids = new Set(saidIds.split('\n\n'))
		setDismissed((d) => {
			const kept = [...d].filter((id) => ids.has(id))
			return kept.length === d.size ? d : new Set(kept)
		})
	}, [saidIds])
	const alerts = said.filter((a) => !dismissed.has(alertId(a)))
	// Only while there is something to count: otherwise the chip draws nothing
	// (not set up, not answering, nothing running), and nor may its divider.
	const face = timers === null ? null : timerFace(timers, now)
	const countdown = shows('countdown') && face !== null && !face.idle ? <TimerChip sources={timers} compact={compact} /> : null
	const clock = shows('clock') ? <Clock now={now} compact={compact} /> : null

	const [marked, setMarked] = useState<number | null>(null)
	useEffect(() => {
		if (marked === null) return
		const t = setTimeout(() => setMarked(null), 3_000)
		return () => clearTimeout(t)
	}, [marked])

	return (
		<header
			className={`relative flex shrink-0 items-center bg-booth-bg ${
				compact ? 'h-[34px] gap-3 px-1.5 pb-1.5' : 'h-16 gap-4 px-2.5 pb-2'
			}`}
		>
			{/* Where you are, and what needs a look. Gives way first. */}
			<div className="flex min-w-0 flex-1 basis-0 items-center gap-2.5">
				{shows('layouts') && (
					<button
						type="button"
						onClick={onLayouts}
						aria-pressed={layoutsOpen}
						aria-label={layoutName === null ? 'Layouts' : `Layouts: ${layoutName}`}
						title={layoutName === null ? 'Layouts' : `Layouts: ${layoutName}`}
						className={`inline-flex min-w-0 shrink-0 items-center rounded-ctl font-bold whitespace-nowrap transition-[background-color,color,transform] duration-150 active:scale-95 ${
							compact ? 'h-7 gap-1.5 px-2 text-[13px]' : 'h-[42px] gap-2 px-3 text-sm'
						} ${layoutsOpen ? 'bg-accent text-accent-ink' : 'text-booth-ink hover:bg-booth-raise'}`}
					>
						<PanelsTopLeft size={compact ? 16 : 20} strokeWidth={2} aria-hidden className="shrink-0" />
						<span className={`truncate ${compact ? 'max-w-40' : 'max-w-56'}`}>{layoutName ?? 'Layouts'}</span>
						<ChevronDown size={compact ? 14 : 16} strokeWidth={2} aria-hidden className={`-ml-0.5 shrink-0 ${layoutsOpen ? '' : 'text-booth-faint'}`} />
					</button>
				)}
				<span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
					{alerts.map((a) => (
						<span
							key={a.key}
							className={`inline-flex min-w-0 shrink-0 animate-slide-in items-stretch overflow-hidden rounded-ctl font-bold whitespace-nowrap ${
								compact ? 'h-6 text-xs' : 'h-9 text-[13.5px]'
							} ${alertTone[a.tone]}`}
						>
							<button
								type="button"
								onClick={a.open === 'showfile' ? onShowfile : a.open === 'updates' ? onUpdates : onConnections}
								title={a.words}
								className={`inline-flex min-w-0 items-center gap-2 transition-[filter,transform] hover:brightness-115 active:scale-95 ${
									compact ? 'pl-2' : 'pl-3'
								} ${a.dismissable ? (compact ? 'pr-1' : 'pr-1.5') : compact ? 'pr-2' : 'pr-3'}`}
							>
								{a.tone === 'warn' ? (
									<span aria-hidden className="size-2 shrink-0 rounded-full bg-black" />
								) : a.tone === 'news' ? (
									<Download size={compact ? 13 : 15} strokeWidth={2.2} aria-hidden className="shrink-0" />
								) : (
									<Dot tone={a.tone} size="sm" />
								)}
								<span className="truncate">{a.words}</span>
							</button>
							{a.dismissable && (
								<button
									type="button"
									onClick={() => setDismissed((d) => new Set(d).add(alertId(a)))}
									aria-label={`Put away: ${a.words}`}
									title="Put away until it changes"
									className={`grid shrink-0 place-items-center opacity-70 transition-[opacity,background-color] hover:bg-black/15 hover:opacity-100 active:bg-black/25 ${
										compact ? 'w-6' : 'w-9'
									}`}
								>
									<X size={compact ? 13 : 16} strokeWidth={2.4} aria-hidden />
								</button>
							)}
						</span>
					))}
				</span>
			</div>

			{/* The time: what comes next, and what it is now. Never shrinks. */}
			<div className={`flex shrink-0 items-center ${compact ? 'gap-3' : 'gap-4'}`}>
				{countdown}
				{countdown !== null && clock !== null && <span aria-hidden className={`w-px bg-booth-hover ${compact ? 'h-3.5' : 'h-[34px]'}`} />}
				{clock}
			</div>

			{/* Controls, where the hand rests. None touches the show. */}
			<div className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-1">
				{marked !== null && (
					<span
						className={`inline-flex min-w-0 animate-slide-in items-center truncate rounded-ctl bg-state-live font-bold text-black ${
							compact ? 'h-6 px-2 text-xs' : 'h-8 px-3 text-[13px]'
						}`}
					>
						Mark {marked} written to the log
					</span>
				)}
				<span className="flex shrink-0 items-center gap-0.5">
					{shows('connections') && (
						<Tool icon={Activity} label="Connections" onClick={onConnections} pressed={connectionsOpen} compact={compact}>
							<span
								className={`absolute grid place-items-center rounded-full ${compact ? 'top-0.5 right-0.5 size-2.5' : 'top-1.5 right-1.5 size-3'} ${
									connectionsOpen ? 'bg-accent' : 'bg-booth-bg group-hover:bg-booth-raise'
								}`}
							>
								<Dot tone={worstTone(rows)} size="sm" />
							</span>
						</Tool>
					)}
					{testing && (
						<Tool icon={Flag} label="Mark this moment in the log" onClick={() => void onMark().then(setMarked)} compact={compact} />
					)}
					{admin && <Tool icon={Settings} label="Settings" onClick={onSettings} pressed={settingsOpen} compact={compact} />}
					{/* Boots into volunteer, always, and never remembers otherwise. */}
					<LockButton admin={admin} asking={asking} onEnter={onEnter} onLeave={onLeave} compact={compact} />
				</span>
			</div>

			<FoldHandle collapsed={collapsed} onCollapse={onCollapse} />
		</header>
	)
}

/** One of the tray's square tools: an icon, labelled for a screen reader and a
 *  tooltip, the selected blue while what it opens is open. */
function Tool({
	icon: IconC,
	label,
	onClick,
	pressed,
	compact,
	children,
}: {
	icon: Icon
	label: string
	onClick: () => void
	pressed?: boolean
	compact: boolean
	children?: ReactNode
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			className={`group relative inline-grid shrink-0 place-items-center rounded-ctl transition-[background-color,color,transform] duration-150 active:scale-90 ${
				compact ? 'size-7' : 'size-[42px]'
			} ${pressed ? 'bg-accent text-accent-ink' : 'text-booth-ink hover:bg-booth-raise'}`}
		>
			<IconC size={compact ? 16 : 20} strokeWidth={2} aria-hidden />
			{children}
		</button>
	)
}

/** The mode: a lock, for a volunteer; in Admin the selected blue, open, and
 *  saying Admin, so the mode is seen from across the booth. Tap it as
 *  volunteer and Admin asks for its passcode (./PasscodeSheet.tsx), or opens
 *  at once when none is set; tap it in Admin to go back. Entering Admin
 *  reveals, it never acts: it changes what is on screen and sends nothing. */
function LockButton({
	admin,
	asking,
	onEnter,
	onLeave,
	compact,
}: {
	admin: boolean
	asking: boolean
	onEnter: () => void
	onLeave: () => void
	compact: boolean
}) {
	const LockIcon = admin ? LockOpen : Lock
	return (
		<button
			type="button"
			onClick={() => (admin ? onLeave() : onEnter())}
			aria-label={admin ? 'Admin. Tap to go back to volunteer.' : 'Volunteer. Tap for Admin.'}
			aria-pressed={asking || undefined}
			title={admin ? 'Back to volunteer' : 'Admin'}
			className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-ctl font-bold transition-[background-color,color,transform] duration-150 active:scale-90 ${
				admin ? (compact ? 'h-7 px-2 text-[13px]' : 'h-[42px] px-3.5 text-sm') : compact ? 'size-7' : 'size-[42px]'
			} ${admin || asking ? 'bg-accent text-accent-ink' : 'text-booth-ink hover:bg-booth-raise'}`}
		>
			<LockIcon key={String(admin)} size={compact ? 16 : 20} strokeWidth={2} aria-hidden className="animate-pop" />
			{admin && 'Admin'}
		</button>
	)
}

/** The handle on the bar's bottom edge: a tap folds or unfolds, a drag up
 *  folds and a drag down unfolds. Inside the bar: nothing is drawn over a
 *  page. */
function FoldHandle({ collapsed, onCollapse }: { collapsed: boolean; onCollapse: (collapsed: boolean) => void }) {
	const from = useRef<number | null>(null)
	/** A drag has folded or unfolded: the click that ends it is not a tap. */
	const dragged = useRef(false)
	const [held, setHeld] = useState(false)
	const label = collapsed ? 'Show the full bar (or drag down)' : 'Fold the bar (or drag up)'
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId)
				from.current = e.clientY
				dragged.current = false
				setHeld(true)
			}}
			onPointerMove={(e) => {
				if (from.current === null) return
				const dy = e.clientY - from.current
				if ((dy < -12 && !collapsed) || (dy > 12 && collapsed)) {
					dragged.current = true
					from.current = null
					setHeld(false)
					onCollapse(!collapsed)
				}
			}}
			onPointerUp={() => {
				from.current = null
				setHeld(false)
			}}
			onPointerCancel={() => {
				from.current = null
				setHeld(false)
			}}
			onClick={() => {
				if (dragged.current) {
					dragged.current = false
					return
				}
				onCollapse(!collapsed)
			}}
			className={`group absolute bottom-0 left-1/2 z-10 grid w-[84px] -translate-x-1/2 cursor-ns-resize touch-none place-items-center rounded-ctl ${
				collapsed ? 'h-2' : 'h-4'
			}`}
		>
			<i
				aria-hidden
				className={`block rounded-full transition-[background-color,width] duration-150 ${collapsed ? 'h-[3px]' : 'h-1'} ${
					held ? 'w-14 bg-booth-ink' : `bg-booth-faint group-hover:w-[52px] group-hover:bg-booth-dim ${collapsed ? 'w-8' : 'w-10'}`
				}`}
			/>
		</button>
	)
}
