// An embed (../../shared/embeds.ts): a web page main draws over its box once it
// has loaded. Everything here is what someone sees when it is NOT showing, and
// the zoom on its strip.

import type { EmbedPaneState } from '../../shared/embeds.js'
import { Globe, Minus, Plus, RotateCw } from 'lucide-react'

import { Say } from './MaPane.js'
import { Button } from './ui.js'

const hostOf = (url: string) => {
	try {
		return new URL(url).host
	} catch {
		return url
	}
}

export function EmbedMessage({ name, pane, now, onRetry }: { name: string; pane: EmbedPaneState | null; now: number; onRetry: () => void }) {
	if (pane === null) return <Say icon={Globe} head={name} body="Embeds are shown only inside the kiosk." />
	switch (pane.state) {
		case 'idle':
		case 'connecting':
			return <Say icon={Globe} head={`Opening ${name}…`} body={hostOf(pane.url)} />
		case 'showing':
			// Under the page itself; seen only for the instant before it is shown.
			return <Say icon={Globe} head={name} body={hostOf(pane.url)} />
		case 'failed': {
			const wait = Math.max(0, Math.ceil((pane.retryAt - now) / 1000))
			return (
				<Say icon={Globe} head={`${name} is not loading`} body={`${hostOf(pane.url)}: ${pane.detail}.`}>
					<div className="mt-6 flex items-center justify-center gap-4 text-sm">
						<span className="text-booth-dim">{wait > 0 ? `trying again in ${wait}s` : 'trying again…'}</span>
<Button size="sm" icon={RotateCw} onClick={onRetry}>
							Try now
						</Button>
					</div>
				</Say>
			)
		}
	}
}

/** − 100 % +, on an embed's strip. Tapping the number goes back to 100 %. */
export function ZoomControl({ name, zoom, onZoom }: { name: string; zoom: number; onZoom: (by: -1 | 0 | 1) => void }) {
	return (
		<span className="flex h-10 shrink-0 items-center rounded-ctl bg-booth-raise">
			<button type="button" onClick={() => onZoom(-1)} className="grid h-10 w-9 place-items-center rounded-l-lg text-booth-dim hover:text-booth-ink" aria-label={`Zoom ${name} out`} title="Zoom out">
				<Minus size={16} aria-hidden />
			</button>
			<button
				type="button"
				onClick={() => onZoom(0)}
				className="h-10 w-14 text-center text-sm tabular-nums"
				aria-label={`${name} at ${Math.round(zoom * 100)} %; tap for 100 %`}
				title="Back to 100%"
			>
				{Math.round(zoom * 100)}%
			</button>
			<button type="button" onClick={() => onZoom(1)} className="grid h-10 w-9 place-items-center rounded-r-lg text-booth-dim hover:text-booth-ink" aria-label={`Zoom ${name} in`} title="Zoom in">
				<Plus size={16} aria-hidden />
			</button>
		</span>
	)
}
