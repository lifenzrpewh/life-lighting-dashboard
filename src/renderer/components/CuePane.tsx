// The run order column: the visuals app itself (src/shared/cue-pane.ts), in a
// native view main draws over the box below, once a page has loaded.
//
// Everything rendered here is what someone sees when the app is NOT showing,
// plus the strip above it, which a native view cannot cover: the fold, and a
// Reload for a page that has gone wrong in a way the app does not notice.

import { useRef } from 'react'

import type { CuePaneReport, CuePaneState } from '../../shared/cue-pane.js'
import { usePanePlacement } from '../panePlacement.js'
import { Say } from './MaPane.js'
import { barButton } from './vocabulary.js'

function Message({ pane, now }: { pane: CuePaneState | null; now: number }) {
	if (pane === null) return <Say head="No Cue Manager here" body="The Cue Manager is shown only inside the kiosk." />
	switch (pane.state) {
		case 'idle':
		case 'connecting':
			return <Say head="Opening the Cue Manager…" body={new URL(pane.url).host} />
		case 'showing':
			// Under the app itself; seen only for the instant before it is shown.
			return <Say head="Cue Manager" body={new URL(pane.url).host} />
		case 'failed': {
			const wait = Math.max(0, Math.ceil((pane.retryAt - now) / 1000))
			return (
				<Say
					head="Cue Manager not reachable"
					body={`${new URL(pane.url).host}: ${pane.detail}. Once it has opened here, it keeps working offline; until then it needs the internet.`}
				>
					<div className="mt-5 flex items-center justify-center gap-4 text-sm">
						<span className="text-booth-dim">{wait > 0 ? `trying again in ${wait}s` : 'trying again…'}</span>
						<button
							type="button"
							onClick={() => window.life?.retryCuePane()}
							className="rounded border border-booth-edge px-5 py-2 active:scale-[0.98]"
						>
							Try now
						</button>
					</div>
				</Say>
			)
		}
	}
}

export function FoldedCuePane({ onOpen }: { onOpen: () => void }) {
	return (
		<nav className="flex w-14 shrink-0 flex-col border-r border-booth-edge bg-booth-panel">
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

/** Always mounted, folded or not, so folding hides the app and never reloads
 *  it: a note half-typed survives a fold. */
export function CuePane({
	report,
	folded,
	onFold,
	width,
	now,
}: {
	report: CuePaneReport | null
	folded: boolean
	onFold: () => void
	/** In pixels: the divider beside it sets it (../cueWidth.ts). */
	width: number
	now: number
}) {
	const box = useRef<HTMLDivElement>(null)
	usePanePlacement(box, folded, (rect) => window.life?.placeCuePane(rect))

	const showing = report?.pane.state === 'showing'
	return (
		// Its width is the divider's; the limits, and why, are in ../cueWidth.ts.
		<nav style={{ width }} className={`shrink-0 flex-col bg-booth-panel ${folded ? 'hidden' : 'flex'}`}>
			<div className="flex h-12 items-center gap-2 border-b border-booth-edge pr-1 pl-4">
				<h2 className="text-[10px] font-semibold tracking-widest text-booth-dim uppercase">Run order</h2>
				<span className="ml-auto" />
				{showing && (
					<button type="button" onClick={() => window.life?.retryCuePane()} className={`${barButton} h-9`} aria-label="Reload the run order">
						↻
					</button>
				)}
				<button
					type="button"
					onClick={onFold}
					aria-label="Fold the run order away"
					className="h-10 w-12 rounded-md text-lg text-booth-dim active:bg-booth-edge"
				>
					‹
				</button>
			</div>
			<div ref={box} className="flex min-h-0 flex-1 items-center justify-center bg-booth-bg">
				<Message pane={report?.pane ?? null} now={now} />
			</div>
		</nav>
	)
}
