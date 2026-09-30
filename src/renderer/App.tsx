import { useEffect, useState } from 'react'

import type { Channel, LinkState } from '../shared/reading.js'
import { readingOf, unread } from '../shared/reading.js'
import type { Service } from '../shared/service.js'
import type { MaPaneReport } from '../shared/ma-pane.js'
import { StatusBar } from './components/StatusBar.js'
import { FoldedRunOrder, RunOrder } from './components/RunOrder.js'
import { MaPane, paneSummary } from './components/MaPane.js'
import { SettingsPanel } from './components/SettingsPanel.js'
import { useMode } from './mode.js'
import { SCENARIOS, SCENARIO_LABEL, mockState, type Scenario } from './mock.js'

const DEV = import.meta.env.DEV

type Sources = { link: LinkState; service: Channel<Service> }

/** What the app knows with no transport wired: nothing, and it says so.
 *
 *  This is not a placeholder awaiting real data — it is the correct state today:
 *  the channels are proven on the desk, but none is wired into the app yet. When
 *  the transport lands it replaces the source, not this shape. */
function coldSources(now: number): Sources {
	return {
		link: { state: 'unreachable', since: now },
		service: unread<Service>(),
	}
}

export function App() {
	const [now, setNow] = useState(() => Date.now())
	const [scenario, setScenario] = useState<Scenario>('cold')
	const [runOrderOpen, setRunOrderOpen] = useState(true)
	const [settingsOpen, setSettingsOpen] = useState(false)

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

	// The MA pane is real in dev too: it is a page from the console, not a value
	// the mock desk could fake. Polled, like the link, because main owns it.
	const [pane, setPane] = useState<MaPaneReport | null>(null)
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.maPane().then((r) => alive && setPane(r))
		poll()
		const id = setInterval(poll, 1000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])

	const { mode, enter, leave } = useMode(now, pane?.lastInputAt ?? null)

	// The mode is which MA user the pane is (src/renderer/mode.ts). Main does the
	// login; the renderer only says which. Settings close with operator mode, by
	// a tap or by the idle drop, so a volunteer never inherits an open panel.
	useEffect(() => {
		window.life?.setMaPaneMode(mode)
		if (mode === 'volunteer') setSettingsOpen(false)
	}, [mode])

	const sources: Sources = DEV
		? mockState(scenario, now)
		: { ...coldSources(now), ...(mainLink === null ? {} : { link: mainLink }) }

	const service = readingOf(sources.service, now, sources.link)

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

			<StatusBar
				link={sources.link}
				now={now}
				mode={mode}
				onEnter={enter}
				onLeave={leave}
				pane={paneSummary(pane, mode)}
				settingsOpen={settingsOpen}
				onSettings={() => setSettingsOpen(!settingsOpen)}
			/>

			{/* Above the pane, never over it: a native view cannot be overlaid. */}
			{sources.link.state === 'unreachable' && (
				<div className="border-b border-state-unreachable/40 bg-state-unreachable/15 px-6 py-2 text-sm">
					<span className="text-state-unreachable">
						No console link — readings here are unknown, and the dashboard can't confirm the MA picture is current.
					</span>{' '}
					<span className="text-booth-dim">The web remote shows its own “disconnected” once it notices.</span>
				</div>
			)}

			{/* The run order is a sibling of the pane, never an overlay on it, so
			    "never covered" is a fact about the layout rather than a rule
			    someone has to remember. The buttons are the MA's own, in the pane. */}
			<div className="flex min-h-0 flex-1">
				{runOrderOpen ? (
					<RunOrder service={service} onFold={() => setRunOrderOpen(false)} />
				) : (
					<FoldedRunOrder onOpen={() => setRunOrderOpen(true)} />
				)}
				<main className="flex min-w-0 flex-1 flex-col">
					{/* Always mounted, so the connection survives the settings panel
					    standing in its place. */}
					<MaPane report={pane} hidden={settingsOpen} now={now} />
					{settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
				</main>
			</div>
		</div>
	)
}
