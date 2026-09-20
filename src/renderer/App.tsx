import { useEffect, useState } from 'react'

import type { Channel, LinkState, WriteOutcome } from '../shared/reading.js'
import { readingOf, unread } from '../shared/reading.js'
import type { Board, Tile } from '../shared/board.js'
import type { Service } from '../shared/service.js'
import { StatusBar } from './components/StatusBar.js'
import { RunOrder } from './components/RunOrder.js'
import { NowPanel } from './components/NowPanel.js'
import { TileGrid } from './components/TileGrid.js'
import { BottomRail } from './components/BottomRail.js'
import { SCENARIOS, SCENARIO_LABEL, mockState, type Scenario } from './mock.js'

const DEV = import.meta.env.DEV

type Sources = { link: LinkState; service: Channel<Service>; board: Channel<Board> }

/** What the app knows with no transport wired: nothing, and it says so.
 *
 *  This is not a placeholder awaiting real data — it is the correct state today
 *  (docs/PLAN.md Phase 0 spike 1: no OSC packet has been observed arriving). When
 *  the transport lands it replaces the source, not this shape. */
function coldSources(now: number): Sources {
	return {
		link: { state: 'unreachable', since: now },
		service: unread<Service>(),
		board: unread<Board>(),
	}
}

export function App() {
	const [now, setNow] = useState(() => Date.now())
	const [scenario, setScenario] = useState<Scenario>('cold')
	const [lastWrite, setLastWrite] = useState<{ label: string; outcome: WriteOutcome } | null>(null)

	// The clock is real time; ages derive from it, so STALE arrives on its own
	// rather than needing something to happen.
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(id)
	}, [])

	useEffect(() => {
		if (!DEV) return
		const onKey = (e: KeyboardEvent) => {
			const i = Number(e.key) - 1
			const picked = SCENARIOS[i]
			if (picked !== undefined) setScenario(picked)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	// Outside dev, the link is whatever main reports — main owns state truth, and
	// the renderer must not form its own opinion about a desk it cannot see.
	// `window.life` is absent when the renderer is opened in a plain browser, and
	// then cold is exactly right: no preload, no main, no desk.
	const [mainLink, setMainLink] = useState<LinkState | null>(null)
	useEffect(() => {
		if (DEV) return
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.linkState().then((l) => alive && setMainLink(l))
		poll()
		const id = setInterval(poll, 1000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])

	const sources: Sources = DEV
		? mockState(scenario, now)
		: { ...coldSources(now), ...(mainLink === null ? {} : { link: mainLink }) }

	const service = readingOf(sources.service, now, sources.link)
	const board = readingOf(sources.board, now, sources.link)

	// No transport exists yet, so a press cannot have been sent. Saying "sent ·
	// unconfirmed" here would be the first lie in the codebase.
	const act = (label: string) =>
		setLastWrite({
			label,
			outcome: { state: 'failed', at: Date.now(), detail: 'no console transport wired yet' },
		})

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{DEV && (
				<div className="flex items-center gap-3 bg-warn px-4 py-1.5 text-xs font-semibold text-booth-bg">
					<span className="tracking-widest">MOCK DESK — NOT A REAL CONSOLE</span>
					<span className="font-normal">{SCENARIO_LABEL[scenario]}</span>
					<span className="ml-auto font-normal opacity-80">
						{SCENARIOS.map((s, i) => `${i + 1} ${s}`).join('   ')}
					</span>
				</div>
			)}

			<StatusBar link={sources.link} now={now} />

			{sources.link.state === 'unreachable' && (
				<div className="border-b border-state-unreachable/40 bg-state-unreachable/15 px-6 py-2 text-sm text-state-unreachable">
					Console unreachable — every value on this screen is unknown. Buttons still send.
				</div>
			)}

			{/* Left spine and bottom rail are grid siblings of the main pane, never
			    overlays on top of it. "Must never be covered" is therefore a fact
			    about the layout rather than a rule someone has to remember. */}
			<div className="flex min-h-0 flex-1">
				<RunOrder service={service} />
				<main className="flex min-w-0 flex-1 flex-col">
					<NowPanel service={service} lastWrite={lastWrite} onGo={() => act('GO THIS ITEM')} />
					<TileGrid board={board} onFire={(t: Tile) => act(t.label)} />
				</main>
			</div>

			<BottomRail onAct={act} />
		</div>
	)
}
