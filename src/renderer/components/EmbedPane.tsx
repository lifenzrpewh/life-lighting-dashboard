// An embed (../../shared/embeds.ts): a web page main draws over its box once it
// has loaded. Everything here is what someone sees when it is NOT showing, and
// the zoom on its strip.

import type { EmbedPaneState } from '../../shared/embeds.js'
import { Say } from './MaPane.js'
import { barButton } from './vocabulary.js'

const hostOf = (url: string) => {
	try {
		return new URL(url).host
	} catch {
		return url
	}
}

export function EmbedMessage({ name, pane, now, onRetry }: { name: string; pane: EmbedPaneState | null; now: number; onRetry: () => void }) {
	if (pane === null) return <Say head={name} body="Embeds are shown only inside the kiosk." />
	switch (pane.state) {
		case 'idle':
		case 'connecting':
			return <Say head={`Opening ${name}…`} body={hostOf(pane.url)} />
		case 'showing':
			// Under the page itself; seen only for the instant before it is shown.
			return <Say head={name} body={hostOf(pane.url)} />
		case 'failed': {
			const wait = Math.max(0, Math.ceil((pane.retryAt - now) / 1000))
			return (
				<Say head={`${name} is not loading`} body={`${hostOf(pane.url)}: ${pane.detail}.`}>
					<div className="mt-5 flex items-center justify-center gap-4 text-sm">
						<span className="text-booth-dim">{wait > 0 ? `trying again in ${wait}s` : 'trying again…'}</span>
						<button type="button" onClick={onRetry} className="rounded border border-booth-edge px-5 py-2 active:scale-[0.98]">
							Try now
						</button>
					</div>
				</Say>
			)
		}
	}
}

/** − 100 % +, on an embed's strip. Tapping the number goes back to 100 %. */
export function ZoomControl({ name, zoom, onZoom }: { name: string; zoom: number; onZoom: (by: -1 | 0 | 1) => void }) {
	return (
		<span className="flex shrink-0 items-center">
			<button type="button" onClick={() => onZoom(-1)} className={`${barButton} h-9 rounded-r-none px-3 text-base`} aria-label={`Zoom ${name} out`}>
				−
			</button>
			<button
				type="button"
				onClick={() => onZoom(0)}
				className={`${barButton} h-9 w-16 justify-center rounded-none border-x-0 tabular-nums`}
				aria-label={`${name} at ${Math.round(zoom * 100)} %; tap for 100 %`}
			>
				{Math.round(zoom * 100)}%
			</button>
			<button type="button" onClick={() => onZoom(1)} className={`${barButton} h-9 rounded-l-none px-3 text-base`} aria-label={`Zoom ${name} in`}>
				+
			</button>
		</span>
	)
}
