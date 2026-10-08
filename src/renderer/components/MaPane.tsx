// The MA pane's renderer half: what is said in its slot when there is nothing
// to show.
//
// The web remote itself is a native view that main draws ON TOP of its slot's
// body (src/main/ma-pane.ts, ./Slot.tsx), and only once a page from the console
// has loaded. Everything rendered here is therefore what someone sees when the
// pane is NOT showing the MA — which is exactly when they need to be told why.
// Where it goes is ../panePlacement.ts, from the App.

import type { ReactNode } from 'react'
import { RotateCw, SlidersHorizontal } from 'lucide-react'

import type { MaPaneReport, MaPaneState, Mode } from '../../shared/ma-pane.js'
import { Button, Placeholder, type Icon } from './ui.js'

function hostOf(url: string): string {
	return new URL(url).hostname
}

/** A few words for the status bar. `showing` says what it is and no more: a
 *  page loaded for that user, which is not the same as the console being live. */
export function paneSummary(report: MaPaneReport | null, mode: Mode): string {
	if (report === null) return 'kiosk only'
	const { pane } = report
	switch (pane.state) {
		case 'no-address':
			return 'no console address set'
		case 'idle':
			return 'not connected'
		case 'connecting':
			return `connecting to ${hostOf(pane.url)} as ${pane.user}`
		case 'showing':
			return mode === 'operator' && !report.hasOperatorUser
				? `${hostOf(pane.url)} · still ${pane.user}: no admin user set`
				: `${hostOf(pane.url)} · ${pane.user}`
		case 'failed':
			return `${hostOf(pane.url)} not reachable`
	}
}

export function MaMessage({ pane, now }: { pane: MaPaneState | null; now: number }) {
	if (pane === null) {
		return <Say head="No MA pane here" body="The MA pane exists only inside the kiosk." />
	}
	switch (pane.state) {
		case 'no-address':
			return (
				<Say
					head="No console address set"
					body="There is nothing to connect to yet. Set the console's address in Connections, in Admin."
				/>
			)
		case 'idle':
			return <Say head="Not connected" body={pane.url} />
		case 'connecting':
			return <Say head="Connecting to the MA web remote…" body={`${pane.url} as ${pane.user}`} />
		case 'showing':
			// Normally hidden under the MA itself; seen only for the instant
			// before main puts the view back over it.
			return <Say head="MA web remote" body={hostOf(pane.url)} />
		case 'failed': {
			const wait = Math.max(0, Math.ceil((pane.retryAt - now) / 1000))
			// A console with every slot taken takes the connection and says
			// nothing, so silence gets its own words: the fix is somewhere else.
			const [head, body] =
				pane.cause === 'no-answer'
					? [
							'MA web remote not answering',
							`${pane.url} took the connection but sent nothing back (${pane.detail}). Usually every web remote slot is in use: close the web remote on another phone or laptop.`,
						]
					: ['MA web remote not reachable', `${pane.url} — ${pane.detail}. Is Web Remote on at the console (Menu › Network)?`]
			return (
				<Say head={head} body={body}>
					<div className="mt-6 flex items-center justify-center gap-4 text-sm">
						<span className="text-booth-dim">{wait > 0 ? `trying again in ${wait}s` : 'trying again…'}</span>
<Button size="sm" icon={RotateCw} onClick={() => window.life?.retryMaPane()}>
							Try now
						</Button>
					</div>
				</Say>
			)
		}
	}
}

/** A view's words when its page is not there (./ui.tsx `Placeholder`). The
 *  MA's own icon unless the caller names another. */
export function Say({ head, body, icon = SlidersHorizontal, children }: { head: string; body: string; icon?: Icon; children?: ReactNode }) {
	return (
		<Placeholder icon={icon} head={head} body={body}>
			{children}
		</Placeholder>
	)
}

/** A body's message, in the middle of it: what someone sees while a native
 *  page is not drawn over it. */
export function Centered({ children }: { children: ReactNode }) {
	return <div className="flex min-w-0 flex-1 items-center justify-center">{children}</div>
}
