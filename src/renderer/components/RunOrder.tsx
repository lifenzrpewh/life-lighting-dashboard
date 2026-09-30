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
import type { Service, ServiceItem } from '../../shared/service.js'
import { formatLength } from '../../shared/service.js'
import { Unknown, formatAge, staleContent, stateClass } from './vocabulary.js'

function Row({ item, isNow }: { item: ServiceItem; isNow: boolean }) {
	const length = formatLength(item.lengthSec)

	if (!isNow) {
		return (
			<li className="flex items-baseline gap-3 px-4 py-3 text-booth-dim">
				<span className="text-xs">▸</span>
				<span className="flex-1 truncate">{item.title}</span>
				<span className="tabular-nums text-sm">{item.startsAt}</span>
			</li>
		)
	}

	return (
		<li className="mx-2 my-2 rounded border-2 border-booth-ink/70 bg-booth-bg px-4 py-4">
			<div className="flex items-baseline gap-2 text-xs uppercase tracking-widest text-booth-dim">
				<span>Now</span>
				<span>·</span>
				<span>{item.kind}</span>
				{length !== null && <span className="ml-auto tabular-nums">{length}</span>}
			</div>
			<div className="mt-1 text-xl font-medium">{item.title}</div>
			{/* Written in the Visuals App during the week, read here on Sunday. */}
			{item.lightingNote !== null && (
				<p className="mt-2 border-l-2 border-booth-edge pl-3 text-sm text-booth-ink/80 italic">
					“{item.lightingNote}”
				</p>
			)}
		</li>
	)
}

function List({ service, ageMs }: { service: Service; ageMs: number | null }) {
	return (
		<>
			{ageMs !== null && (
				<p className="px-4 pb-2 text-xs text-state-stale">run order {formatAge(ageMs)}</p>
			)}
			<ul className={`overflow-y-auto ${ageMs === null ? '' : staleContent}`}>
				{service.items.map((item) => (
					<Row key={item.pcoItemId} item={item} isNow={item.pcoItemId === service.nowItemId} />
				))}
			</ul>
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

export function RunOrder({ service, onFold }: { service: Reading<Service>; onFold: () => void }) {
	return (
		<nav
			className={`flex w-[22rem] shrink-0 flex-col border-r-2 bg-booth-panel ${
				stateClass[service.state]
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

			{matchReading(service, {
				live: (s) => <List service={s} ageMs={null} />,
				stale: (s, ageMs) => <List service={s} ageMs={ageMs} />,
				// NOT an empty list. A run order we could not read renders as a
				// question, because "no items" is a claim about the service and this
				// is a fact about us.
				unknown: (why) => (
					<div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
						<Unknown why={why} />
						<p className="text-xs text-booth-dim">The run order has not been read.</p>
					</div>
				),
			})}
		</nav>
	)
}
