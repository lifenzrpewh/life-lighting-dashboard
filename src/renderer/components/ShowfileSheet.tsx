// The showfile sheet: Save As at the top, Load at the bottom behind deliberate
// emptiness (docs/PLAN.md Phase 3). It opens from the showfile chip and takes
// the right slot's place, as Connections does.
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

import { useEffect, useRef, useState } from 'react'

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
import { HOLD_MS } from '../mode.js'
import { chipLabel } from './vocabulary.js'

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
	const why = !operator ? 'Operator mode only: hold the mode chip for 3 s.' : !linkLive ? 'The console is not answering.' : null
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
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex h-12 shrink-0 items-center gap-3 border-b border-booth-edge px-4">
				<span className={chipLabel}>Showfile</span>
				<span className="min-w-0 flex-1 truncate text-sm">
					{current === null ? 'not read' : current.name}
					{current?.onBase && <span className="ml-3 text-xs font-semibold tracking-widest text-warn">ON BASE SHOW</span>}
				</span>
				<button type="button" onClick={onClose} className="h-10 rounded-md border border-booth-edge px-4 text-sm active:bg-booth-edge">
					Close
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
				{why !== null && <p className="mb-4 text-sm text-booth-dim">{why}</p>}
				{pending !== null && (
					<p className={`mb-4 text-sm ${confirmed ? 'text-state-live' : overdue ? 'text-warn' : 'text-booth-dim'}`}>
						{confirmed
							? `${pending.kind === 'save' ? 'Saved as' : 'Loaded'} “${pending.name}”. The console says so.`
							: overdue
								? `Sent, but the console has not said it ${pending.kind === 'save' ? 'saved' : 'loaded'} “${pending.name}”. Look at the console.`
								: `Sent. Waiting for the console to say “${pending.name}”…`}
					</p>
				)}
				{refused !== null && <p className="mb-4 text-sm text-state-unreachable">Not sent: {refused}</p>}

				<section>
					<h2 className={chipLabel}>Save as</h2>
					<div className="mt-3 flex items-center gap-3">
						<span className="min-w-0 flex-1 truncate rounded-md border border-booth-edge bg-booth-panel px-4 py-3 font-mono text-lg">{offered}</span>
						<button
							type="button"
							onClick={() => setOffered(offeredName(campus, new Date()))}
							className="h-12 shrink-0 rounded-md border border-booth-edge px-4 text-sm active:bg-booth-edge"
						>
							New time
						</button>
					</div>
					<Budget used={offered.length} />
					{problem !== null && <p className="mt-2 text-sm text-warn">{problem}</p>}
					{campus === null && <p className="mt-2 text-sm text-booth-dim">Set this booth’s campus in Connections › Console and names begin with it.</p>}
					<button
						type="button"
						disabled={!canAct || problem !== null}
						onClick={saveAs}
						className="mt-4 h-12 rounded-md border border-booth-ink px-6 text-sm font-semibold active:scale-[0.98] disabled:opacity-30"
					>
						Save as “{offered}”
					</button>
				</section>

				{/* Deliberate emptiness: Load never shares a neighbourhood with Save As. */}
				<div className="h-40" />

				<section className="border-t border-booth-edge pt-5">
					<h2 className={chipLabel}>Load another show</h2>
					<p className="mt-2 text-sm text-booth-dim">
						The console goes quiet while it loads. If the show has no OSC row for this dashboard, the link stays down until
						one is loaded that has.
					</p>
					{list === null || list === 'asking' ? (
						<button
							type="button"
							disabled={!canAct || list === 'asking'}
							onClick={askList}
							className="mt-4 h-12 rounded-md border border-booth-edge px-6 text-sm active:bg-booth-edge disabled:opacity-30"
						>
							{list === 'asking' ? 'Asking the console…' : 'List the shows on the console'}
						</button>
					) : !list.ok ? (
						<div className="mt-4 flex items-center gap-3">
							<p className="text-sm text-state-unreachable">{list.detail}</p>
							<button type="button" onClick={askList} className="h-10 shrink-0 rounded-md border border-booth-edge px-4 text-sm">
								Ask again
							</button>
						</div>
					) : list.shows.length === 0 ? (
						<p className="mt-4 text-sm text-booth-dim">The console has no show files.</p>
					) : (
						<ul className="mt-4 max-h-80 overflow-y-auto rounded-md border border-booth-edge">
							{list.shows.map((s) => (
								<li key={s.name}>
									<button
										type="button"
										// The loaded show is not offered: its name is already the one the
										// read-back would wait for, so a Load of it could never be confirmed.
										disabled={!s.loadable || current?.name === s.name}
										onClick={() => setChosen(s.name)}
										className={`flex h-12 w-full items-center gap-3 border-b border-booth-edge/60 px-4 text-left text-sm disabled:opacity-40 ${
											chosen === s.name ? 'bg-booth-edge' : 'active:bg-booth-panel'
										}`}
									>
										<span className="min-w-0 flex-1 truncate">{s.name}</span>
										{current?.name === s.name && <span className="text-xs text-booth-dim">loaded now</span>}
										{!s.loadable && <span className="text-xs text-booth-dim">load it at the console</span>}
									</button>
								</li>
							))}
						</ul>
					)}
					<label className="mt-4 flex h-12 items-center gap-3 text-sm">
						<input type="checkbox" checked={saveFirst} onChange={(e) => setSaveFirst(e.target.checked)} className="size-5" />
						Save the current show first
					</label>
					<HoldButton disabled={!canAct || chosen === null} label={chosen === null ? 'Pick a show to load' : `Hold to load “${chosen}”`} onHeld={load} />
				</section>
			</div>
		</div>
	)
}

/** The 31-character budget, and the string it measures. */
function Budget({ used }: { used: number }) {
	const over = used > SHOW_NAME_MAX
	return (
		<div className="mt-2 flex items-center gap-3">
			<span className="h-1.5 w-48 overflow-hidden rounded-full bg-booth-edge">
				<span className={`block h-full ${over ? 'bg-state-unreachable' : 'bg-booth-ink'}`} style={{ width: `${Math.min(100, (used / SHOW_NAME_MAX) * 100)}%` }} />
			</span>
			<span className={`text-xs tabular-nums ${over ? 'text-state-unreachable' : 'text-booth-dim'}`}>
				{used} of {SHOW_NAME_MAX} characters MA keeps · exactly what is sent
			</span>
		</div>
	)
}

/** Fires only after a full hold, like the mode chip; a lifted finger cancels. */
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
			className="relative mt-3 h-14 w-full overflow-hidden rounded-md border border-warn px-6 text-sm font-semibold text-warn disabled:border-booth-edge disabled:text-booth-dim disabled:opacity-40"
		>
			{holding && (
				<span aria-hidden className="absolute inset-0 origin-left bg-warn/25" style={{ animation: `hold-fill ${HOLD_MS}ms linear forwards` }} />
			)}
			<span className="relative">{holding ? 'Keep holding…' : label}</span>
		</button>
	)
}
