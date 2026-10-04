// The run order: the visuals app itself (src/shared/cue-pane.ts), in a native
// view main draws over its slot's body (./Slot.tsx), once a page has loaded.
//
// Everything rendered here is what someone sees when the app is NOT showing.
// The slot's strip carries Reload, for a page that has gone wrong in a way the
// app does not notice.

import type { CuePaneState } from '../../shared/cue-pane.js'
import { ListChecks, RotateCw } from 'lucide-react'

import { Say } from './MaPane.js'
import { Button } from './ui.js'

export function CueMessage({ pane, now }: { pane: CuePaneState | null; now: number }) {
	if (pane === null) return <Say icon={ListChecks} head="No Cue Manager here" body="The Cue Manager is shown only inside the kiosk." />
	switch (pane.state) {
		case 'idle':
		case 'connecting':
			return <Say icon={ListChecks} head="Opening the Cue Manager…" body={new URL(pane.url).host} />
		case 'showing':
			// Under the app itself; seen only for the instant before it is shown.
			return <Say icon={ListChecks} head="Cue Manager" body={new URL(pane.url).host} />
		case 'failed': {
			const wait = Math.max(0, Math.ceil((pane.retryAt - now) / 1000))
			return (
				<Say
					head="Cue Manager not reachable"
					body={`${new URL(pane.url).host}: ${pane.detail}. Once it has opened here, it keeps working offline; until then it needs the internet.`}
				>
					<div className="mt-6 flex items-center justify-center gap-4 text-sm">
						<span className="text-booth-dim">{wait > 0 ? `trying again in ${wait}s` : 'trying again…'}</span>
<Button size="sm" icon={RotateCw} onClick={() => window.life?.retryCuePane()}>
							Try now
						</Button>
					</div>
				</Say>
			)
		}
	}
}
