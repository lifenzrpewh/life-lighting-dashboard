// The showfile sheet: Save As on the left, Load on the far right, the width of
// the screen apart (docs/PLAN.md Phase 3: Load never shares a neighbourhood
// with Save As; until 2026-10-05 that distance was a gap down the page). It
// opens from the console card and takes the windows' place, as Connections
// does.
//
// WHAT IT NEVER DOES:
// - Say saved or loaded because a command went. Each waits for the console to
//   read the new name back through LifeBridge (the chip's own read), and says
//   when that has not come.
// - Offer a typed name. Save As offers one, campus then New Zealand date and
//   time, and shows the exact string that will be sent against MA's 31.
// - Load on a tap. Load is operator mode, a live link, a choice of what
//   happens to the show being replaced (save it first, ticked), and a 3 s hold.
// - Act in volunteer mode. Everyone may look; main refuses anything else.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Clock, List, Save } from 'lucide-react'

import type { Reading } from '../../shared/reading.js'
import type { Showfile } from '../../shared/showfile.js'
import {
	LOAD_CONFIRM_MS,
	SAVE_CONFIRM_MS,
	SHOW_NAME_MAX,
	offeredName,
	saveAsProblem,
	type ShowList,
} from '../../shared/showfile-write.js'
import { Button, Card, SectionTitle, Sheet } from './ui.js'

/** A Load is held for 3 s, so a brush of the screen never loads a show. The
 *  mode lock had the same hold until 2026-10-08; it is a passcode now. */
const HOLD_MS = 3_000

type Pending = { kind: 'save' | 'load'; name: string; at: number }

export function ShowfileSheet({
	showfile,
	linkLive,
	operator,
	campus,
	now,
	onClose,
}: {
	showfile: Reading<Showfile>
	linkLive: boolean
	operator: boolean
	campus: string | null
	now: number
	onClose: () => void
}) {
	const current = showfile.state === 'live' || showfile.state === 'stale' ? showfile.value : null
	// Offered when the sheet opens, and again on request: a name that changed
	// under the finger each minute would not be the name that was read.
	const [offered, setOffered] = useState(() => offeredName(campus, new Date()))
	const [pending, setPending] = useState<Pending | null>(null)
	const [refused, setRefused] = useState<string | null>(null)
	const [list, setList] = useState<ShowList | 'asking' | null>(null)
	const [chosen, setChosen] = useState<string | null>(null)
	const [saveFirst, setSaveFirst] = useState(true)

	const canAct = operator && linkLive
	const why = !operator ? 'Save As and Load are Admin’s: tap Volunteer (top right) and enter the passcode.' : !linkLive ? 'The console is not answering.' : null
	const problem = saveAsProblem(offered, current?.base ?? null)

	// The read-back: the console's own name for its show, through LifeBridge.
	const confirmed = pending !== null && current !== null && current.name === pending.name
	const overdue = pending !== null && !confirmed && now - pending.at > (pending.kind === 'save' ? SAVE_CONFIRM_MS : LOAD_CONFIRM_MS)

	const saveAs = () => {
		if (!canAct || problem !== null) return
		setRefused(null)
		void window.life?.saveShowAs(offered).then((r) => {
			if (r.ok) setPending({ kind: 'save', name: offered, at: Date.now() })
			else setRefused(r.detail)
		})
	}
	const load = () => {
		if (!canAct || chosen === null) return
		setRefused(null)
		void window.life?.loadShow(chosen, saveFirst).then((r) => {
			if (r.ok) setPending({ kind: 'load', name: chosen, at: Date.now() })
			else setRefused(r.detail)
		})
	}
	const askList = () => {
		if (!canAct) return
		setList('asking')
		void window.life?.listShows().then(setList)
	}

	return (
		<Sheet
			title="Showfile"
			description={
				<>
					{current === null ? 'Not read' : <span className="font-mono text-booth-ink">{current.name}</span>}
					{current?.onBase && <span className="ml-3 font-semibold text-warn">On base show</span>}
				</>
			}
			onClose={onClose}
		>
			<div className="min-h-0 flex-1 overflow-y-auto p-6">
				{(why !== null || pending !== null || refused !== null) && (
					<div className="mb-6 flex flex-col gap-2">
						{why !== null && <Notice tone="dim">{why}</Notice>}
						{pending !== null && (
							<Notice tone={confirmed ? 'live' : overdue ? 'warn' : 'dim'}>
								{confirmed
									? `${pending.kind === 'save' ? 'Saved as' : 'Loaded'} “${pending.name}”. The console says so.`
									: overdue
										? `Sent, but the console has not said it ${pending.kind === 'save' ? 'saved' : 'loaded'} “${pending.name}”. Look at the console.`
										: `Sent. Waiting for the console to say “${pending.name}”…`}
							</Notice>
						)}
						{refused !== null && <Notice tone="down">Not sent: {refused}</Notice>}
					</div>
				)}

				{/* Save As and Load are operator mode's: in volunteer mode they are not
				    drawn at all (the owner, 2026-10-06), and the notice says why. */}
				{operator && (
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-24 gap-y-6">
						<Card>
							<SectionTitle aside="A new file, named for now. The show stays loaded.">Save as</SectionTitle>
							<div className="flex items-center gap-3">
								<span className="min-w-0 flex-1 truncate rounded-ctl bg-booth-bg px-4 py-3 font-mono text-lg ring-1 ring-booth-edge ring-inset">
									{offered}
								</span>
								<Button icon={Clock} onClick={() => setOffered(offeredName(campus, new Date()))}>
									New time
								</Button>
							</div>
							<Budget used={offered.length} />
							{problem !== null && <p className="text-sm text-warn">{problem}</p>}
							{campus === null && <p className="text-sm text-booth-dim">Set this booth’s campus in Settings › Console and names begin with it.</p>}
							<Button variant="primary" icon={Save} disabled={!canAct || problem !== null} onClick={saveAs} className="self-start">
								Save as “{offered}”
							</Button>
						</Card>

						<Card>
							<SectionTitle>Load another show</SectionTitle>
							<p className="text-sm text-booth-dim">
								The console goes quiet while it loads. If the show has no OSC row for this dashboard, the link stays down until
								one is loaded that has.
							</p>
							{list === null || list === 'asking' ? (
								<Button icon={List} disabled={!canAct || list === 'asking'} onClick={askList} className="self-start">
									{list === 'asking' ? 'Asking the console…' : 'List the shows on the console'}
								</Button>
							) : !list.ok ? (
								<div className="flex items-center gap-3">
									<p className="text-sm text-state-unreachable">{list.detail}</p>
									<Button size="sm" onClick={askList}>
										Ask again
									</Button>
								</div>
							) : list.shows.length === 0 ? (
								<p className="text-sm text-booth-dim">The console has no show files.</p>
							) : (
								<ul className="max-h-80 overflow-y-auto rounded-ctl bg-booth-bg p-1 ring-1 ring-booth-edge ring-inset">
									{list.shows.map((s) => (
										<li key={s.name}>
											<button
												type="button"
												// The loaded show is not offered: its name is already the one the
												// read-back would wait for, so a Load of it could never be confirmed.
												disabled={!s.loadable || current?.name === s.name}
												onClick={() => setChosen(s.name)}
												className={`flex h-12 w-full items-center gap-3 rounded-ctl px-3 text-left text-sm disabled:opacity-40 ${
													chosen === s.name ? 'bg-booth-raise ring-1 ring-warn/60 ring-inset' : 'hover:bg-booth-strip'
												}`}
											>
												<span className="min-w-0 flex-1 truncate font-mono">{s.name}</span>
												{current?.name === s.name && <span className="text-xs text-booth-dim">loaded now</span>}
												{!s.loadable && <span className="text-xs text-booth-dim">load it at the console</span>}
											</button>
										</li>
									))}
								</ul>
							)}
							<label className="flex h-12 items-center gap-3 text-sm">
								<input type="checkbox" checked={saveFirst} onChange={(e) => setSaveFirst(e.target.checked)} className="size-5 accent-[var(--color-accent-hi)]" />
								Save the current show first
							</label>
							<HoldButton disabled={!canAct || chosen === null} label={chosen === null ? 'Pick a show to load' : `Hold to load “${chosen}”`} onHeld={load} />
						</Card>
					</div>
				)}
			</div>
		</Sheet>
	)
}

/** A line above the two cards: what was sent and what the console said. */
function Notice({ tone, children }: { tone: 'dim' | 'live' | 'warn' | 'down'; children: ReactNode }) {
	const colour = { dim: 'bg-booth-panel text-booth-dim', live: 'bg-state-live/10 text-state-live', warn: 'bg-warn/10 text-warn', down: 'bg-state-unreachable/10 text-state-unreachable' }[tone]
	return <p className={`rounded-ctl px-4 py-3 text-sm ${colour}`}>{children}</p>
}

/** The 31-character budget, and the string it measures. */
function Budget({ used }: { used: number }) {
	const over = used > SHOW_NAME_MAX
	return (
		<div className="flex items-center gap-3">
			<span className="h-1.5 w-48 overflow-hidden rounded-full bg-booth-edge">
				<span className={`block h-full ${over ? 'bg-state-unreachable' : 'bg-booth-ink'}`} style={{ width: `${Math.min(100, (used / SHOW_NAME_MAX) * 100)}%` }} />
			</span>
			<span className={`text-xs tabular-nums ${over ? 'text-state-unreachable' : 'text-booth-dim'}`}>
				{used} of {SHOW_NAME_MAX} characters MA keeps · exactly what is sent
			</span>
		</div>
	)
}

/** Fires only after a full hold, like the mode button; a lifted finger cancels. */
function HoldButton({ disabled, label, onHeld }: { disabled: boolean; label: string; onHeld: () => void }) {
	const [holding, setHolding] = useState(false)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const cancel = () => {
		if (timer.current !== null) clearTimeout(timer.current)
		timer.current = null
		setHolding(false)
	}
	useEffect(() => cancel, [])
	return (
		<button
			type="button"
			disabled={disabled}
			onPointerDown={() => {
				if (disabled) return
				setHolding(true)
				timer.current = setTimeout(() => {
					cancel()
					onHeld()
				}, HOLD_MS)
			}}
			onPointerUp={cancel}
			onPointerLeave={cancel}
			onPointerCancel={cancel}
			onContextMenu={(e) => e.preventDefault()}
			className="relative h-14 w-full overflow-hidden rounded-ctl px-6 text-base font-semibold text-warn ring-1 ring-warn/70 ring-inset disabled:text-booth-dim disabled:opacity-40 disabled:ring-booth-edge"
		>
			{holding && (
				<span aria-hidden className="absolute inset-0 origin-left bg-warn/25" style={{ animation: `hold-fill ${HOLD_MS}ms linear forwards` }} />
			)}
			<span className="relative">{holding ? 'Keep holding…' : label}</span>
		</button>
	)
}
