// The left spine. Never covered by anything, which is enforced by it being a
// grid column rather than a thing overlays are asked politely to avoid.
//
// It is the only part of this screen a volunteer understands without training,
// and the one thing beside the MA that the MA cannot show: the PCO run order
// and the LD's notes from the week. So it is also the part that must never lie
// about what it does not know.
//
// It folds to a strip, one tap each way, to give the MA the full width. Folded
// is not hidden: the strip stays, so the way back is always on screen.

import type { Reading } from '../../shared/reading.js'
import { matchReading } from '../../shared/reading.js'
import type { Schedule, Service, ServiceItem } from '../../shared/service.js'
import { formatLength } from '../../shared/service.js'
import { Unknown, formatAge, staleContent, stateClass } from './vocabulary.js'

/** "2026-09-21" as "Sun 21 Sep", on this computer's calendar. */
function formatDay(iso: string): string {
	const [y, m, d] = iso.split('-').map(Number)
	if (y === undefined || m === undefined || d === undefined) return iso
	return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

function Row({ item, isNow }: { item: ServiceItem; isNow: boolean }) {
	// A PCO header divides the run order into sections; it is not an item.
	if (item.kind === 'header') {
		return (
			<li className="px-4 pt-5 pb-1 text-xs font-semibold uppercase tracking-widest text-booth-dim">
				{item.title}
			</li>
		)
	}

	const length = formatLength(item.lengthSec)
	return (
		<li className={isNow ? 'mx-2 my-1 rounded border-2 border-booth-ink/70 px-3 py-3' : 'px-4 py-3'}>
			<div className="flex items-baseline gap-3">
				<span className={`flex-1 truncate ${item.kind === 'song' ? '' : 'text-booth-dim'}`}>
					{item.title === '' ? 'Untitled' : item.title}
				</span>
				{/* No start times: the backend syncs none (src/shared/service.ts). */}
				{length !== null && <span className="text-sm tabular-nums text-booth-dim">{length}</span>}
			</div>
			{/* Written in the Visuals App during the week, read here on Sunday.
			    Every row that has one shows it: there is no current item to single
			    out yet. */}
			{item.lightingNote !== null && (
				<p className="mt-1 border-l-2 border-booth-edge pl-3 text-sm whitespace-pre-line text-booth-ink/80 italic">
					“{item.lightingNote}”
				</p>
			)}
		</li>
	)
}

function Plan({ service }: { service: Service }) {
	return (
		<div className="border-b border-booth-edge px-4 py-3">
			<div className="text-sm">
				{formatDay(service.date)} · {service.serviceType}
			</div>
			{service.planTitle !== null && <div className="text-xs text-booth-dim">{service.planTitle}</div>}
		</div>
	)
}

function List({ schedule, ageMs, failure }: { schedule: Schedule; ageMs: number | null; failure: string | null }) {
	const { service } = schedule
	return (
		<>
			{ageMs !== null && (
				<p className="px-4 pt-2 text-xs text-state-stale">
					run order {formatAge(ageMs)}
					{failure !== null && ` · ${failure}`}
				</p>
			)}
			<div className={`flex min-h-0 flex-1 flex-col ${ageMs === null ? '' : staleContent}`}>
				{service === null ? (
					// An answer, not a failure: the backend has no plan ahead for
					// this campus. Not an empty list, which would read as a service
					// with nothing in it.
					<p className="px-6 py-8 text-center text-sm text-booth-dim">
						No plan ahead for {schedule.campus} in Planning Center.
					</p>
				) : (
					<>
						<Plan service={service} />
						<ul className="overflow-y-auto pb-4">
							{service.items.map((item) => (
								<Row key={item.pcoItemId} item={item} isNow={item.pcoItemId === service.nowItemId} />
							))}
						</ul>
					</>
				)}
			</div>
		</>
	)
}

export function FoldedRunOrder({ onOpen }: { onOpen: () => void }) {
	return (
		<nav className="flex w-14 shrink-0 flex-col border-r-2 border-booth-edge bg-booth-panel">
			<button
				type="button"
				onClick={onOpen}
				aria-label="Show the run order"
				className="flex flex-1 flex-col items-center gap-4 pt-5 text-booth-dim active:bg-booth-edge"
			>
				<span className="text-lg">›</span>
				<span className="text-xs font-semibold uppercase tracking-widest [writing-mode:vertical-rl]">Run order</span>
			</button>
		</nav>
	)
}

export function RunOrder({
	schedule,
	failure,
	onFold,
}: {
	schedule: Reading<Schedule>
	/** Why the last read failed, in words someone can act on, if it did. */
	failure: string | null
	onFold: () => void
}) {
	return (
		<nav
			className={`flex w-[22rem] shrink-0 flex-col border-r-2 bg-booth-panel ${
				stateClass[schedule.state]
			}`}
		>
			<div className="flex items-center gap-3 border-b border-booth-edge py-1 pl-4 pr-1">
				<h2 className="text-xs font-semibold uppercase tracking-widest text-booth-dim">Run order</h2>
				<span className="ml-auto text-xs text-booth-dim">PCO</span>
				<button
					type="button"
					onClick={onFold}
					aria-label="Fold the run order away"
					className="h-10 w-12 rounded text-lg text-booth-dim active:bg-booth-edge"
				>
					‹
				</button>
			</div>

			{matchReading(schedule, {
				live: (s) => <List schedule={s} ageMs={null} failure={null} />,
				stale: (s, ageMs) => <List schedule={s} ageMs={ageMs} failure={failure} />,
				// NOT an empty list. A run order we could not read renders as a
				// question, because "no items" is a claim about the service and this
				// is a fact about us.
				unknown: (why) => (
					<div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
						<Unknown why={why} />
						<p className="text-xs text-booth-dim">{failure ?? 'The run order has not been read.'}</p>
					</div>
				),
			})}
		</nav>
	)
}
