import type { Reading, WriteOutcome } from '../../shared/reading.js'
import { matchReading } from '../../shared/reading.js'
import type { Service } from '../../shared/service.js'
import { currentItem, formatLength } from '../../shared/service.js'
import { Unknown, staleContent } from './vocabulary.js'

function Outcome({ outcome }: { outcome: WriteOutcome }) {
	switch (outcome.state) {
		case 'confirmed':
			return <span className="text-state-live">confirmed by read-back</span>
		case 'sent-unconfirmed':
			// The honest resting state of every write. `Cmd()` discards its return,
			// so this is not a transient on the way to success — it can stay here.
			return <span className="text-state-stale">sent · unconfirmed</span>
		case 'failed':
			return <span className="text-state-unreachable">not sent — {outcome.detail}</span>
	}
}

export function NowPanel({
	service,
	lastWrite,
	onGo,
}: {
	service: Reading<Service>
	lastWrite: { label: string; outcome: WriteOutcome } | null
	onGo: () => void
}) {
	const heading = matchReading(service, {
		live: (s) => describe(s),
		stale: (s) => describe(s),
		unknown: (why) => <Unknown why={why} />,
	})

	return (
		<div className="flex items-center gap-6 px-6 py-5">
			<div className="min-w-0 flex-1">
				<div className="text-xs uppercase tracking-widest text-booth-dim">Now</div>
				{/* Same 60% as everywhere else. The age is not repeated here — the
				    spine already carries it, and this heading is the same read. */}
				<div
					className={`mt-1 truncate text-2xl ${service.state === 'stale' ? staleContent : ''}`}
				>
					{heading}
				</div>
				{lastWrite !== null && (
					<div className="mt-2 text-sm">
						<span className="text-booth-dim">{lastWrite.label} · </span>
						<Outcome outcome={lastWrite.outcome} />
					</div>
				)}
			</div>

			{/* Firing THIS item is an explicit act. Advancing PCO never does it. */}
			<button
				type="button"
				onClick={onGo}
				className="h-24 w-56 shrink-0 rounded border-2 border-booth-ink bg-booth-ink text-lg font-semibold tracking-wide text-booth-bg active:scale-[0.98]"
			>
				GO THIS ITEM
			</button>
		</div>
	)
}

function describe(s: Service) {
	const item = currentItem(s)
	// null is "the service has not started", which is a different fact from
	// "we are on item 1" — so it gets different words, not a fallback to items[0].
	if (item === null) return <span className="text-booth-dim">service not started</span>
	const length = formatLength(item.lengthSec)
	return (
		<>
			<span className="text-booth-dim">{item.kind} · </span>
			<span>{item.title}</span>
			{length !== null && <span className="text-booth-dim"> · {length}</span>}
		</>
	)
}
