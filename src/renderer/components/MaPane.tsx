// The MA pane's renderer half: the box the console's web remote is placed in,
// and what is said in it when there is nothing to show.
//
// The web remote itself is a native view that main draws ON TOP of this box
// (src/main/ma-pane.ts), and only once a page from the console has loaded.
// Everything rendered here is therefore what someone sees when the pane is NOT
// showing the MA — which is exactly when they need to be told why.
//
// THE RULE THIS FILE ENFORCES: the native view goes where this box is, and
// nowhere else. The box is re-measured after every render, not only on resize,
// because a layout that shifts without resizing (a bar appearing above) would
// otherwise leave the view somewhere it no longer belongs.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

import type { MaPaneReport, MaPaneState, Mode, PaneRect } from '../../shared/ma-pane.js'

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
				? `${hostOf(pane.url)} · still ${pane.user}: no operator user set`
				: `${hostOf(pane.url)} · ${pane.user}`
		case 'failed':
			return `${hostOf(pane.url)} not reachable`
	}
}

function Message({ pane, now }: { pane: MaPaneState | null; now: number }) {
	if (pane === null) {
		return <Say head="No MA pane here" body="The MA pane exists only inside the kiosk." />
	}
	switch (pane.state) {
		case 'no-address':
			return (
				<Say
					head="No console address set"
					body="There is nothing to connect to yet. Set the console's address in Settings, in operator mode."
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
			return (
				<Say
					head="MA web remote not reachable"
					body={`${pane.url} — ${pane.detail}. Is Web Remote on at the console (Menu › Network)?`}
				>
					<div className="mt-5 flex items-center justify-center gap-4 text-sm">
						<span className="text-booth-dim">{wait > 0 ? `trying again in ${wait}s` : 'trying again…'}</span>
						<button
							type="button"
							onClick={() => window.life?.retryMaPane()}
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

function Say({ head, body, children }: { head: string; body: string; children?: ReactNode }) {
	return (
		<div className="max-w-md px-6 text-center">
			<p className="text-lg">{head}</p>
			<p className="mt-2 text-sm break-words text-booth-dim">{body}</p>
			{children}
		</div>
	)
}

const sameRect = (a: PaneRect | null, b: PaneRect | null) =>
	a === b ||
	(a !== null && b !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)

export function MaPane({
	report,
	hidden,
	now,
}: {
	report: MaPaneReport | null
	/** Keep the connection, but take the view away: the settings panel is
	 *  standing in the pane's place. */
	hidden: boolean
	now: number
}) {
	const box = useRef<HTMLDivElement>(null)
	const sent = useRef<PaneRect | null | undefined>(undefined)

	const place = () => {
		const el = box.current
		let rect: PaneRect | null = null
		if (!hidden && el !== null) {
			const r = el.getBoundingClientRect()
			rect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
		}
		if (sent.current !== undefined && sameRect(sent.current, rect)) return
		sent.current = rect
		window.life?.placeMaPane(rect)
	}

	// After every render (the clock alone re-renders once a second)...
	const latest = useRef(place)
	useLayoutEffect(() => {
		latest.current = place
		place()
	})
	// ...and on every resize in between, so a fold or window change tracks.
	useEffect(() => {
		const el = box.current
		if (el === null) return
		const ro = new ResizeObserver(() => latest.current())
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	// Unmounting closes the connection. It happens when the renderer goes away,
	// which main also covers, since a crashed renderer cannot say goodbye.
	useEffect(
		() => () => {
			sent.current = undefined
			window.life?.releaseMaPane()
		},
		[],
	)

	return (
		<div ref={box} className={`min-h-0 min-w-0 flex-1 items-center justify-center bg-booth-bg ${hidden ? 'hidden' : 'flex'}`}>
			<Message pane={report?.pane ?? null} now={now} />
		</div>
	)
}
