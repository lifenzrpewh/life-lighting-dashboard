import { useEffect, useState } from 'react'

import type { Channel, LinkState } from '../shared/reading.js'
import { readingOf, unread } from '../shared/reading.js'
import type { DeskState } from '../shared/desk.js'
import type { Schedule } from '../shared/service.js'
import { SHOW_STALE_AFTER_MS, type Showfile } from '../shared/showfile.js'
import { RUN_ORDER_STALE_AFTER_MS } from '../shared/backend.js'
import type { MaPaneReport } from '../shared/ma-pane.js'
import { StatusBar } from './components/StatusBar.js'
import { FoldedRunOrder, RunOrder } from './components/RunOrder.js'
import { MaPane, paneSummary } from './components/MaPane.js'
import { SettingsPanel } from './components/SettingsPanel.js'
import { useMode } from './mode.js'
import { SCENARIOS, SCENARIO_LABEL, mockState, type Scenario } from './mock.js'

const DEV = import.meta.env.DEV

type Sources = { link: LinkState; schedule: Channel<Schedule>; showfile: Channel<Showfile> }

/** What the app knows with no transport wired: nothing, and it says so.
 *
 *  This is not a placeholder awaiting real data — it is the correct state today:
 *  the channels are proven on the desk, but none is wired into the app yet. When
 *  the transport lands it replaces the source, not this shape. */
function coldSources(now: number): Sources {
	return {
		link: { state: 'unreachable', since: now },
		schedule: unread<Schedule>(),
		showfile: unread<Showfile>(),
	}
}

/** The console's own words for a failed read, if the newest attempt failed
 *  with some. A timeout has none: the `?` and "no answer" say it all. */
function failureOf<T>(channel: Channel<T>): string | null {
	const latest = channel.latest
	return latest !== null && !latest.ok && latest.reason === 'error' ? latest.detail : null
}

export function App() {
	const [now, setNow] = useState(() => Date.now())
	// 'real' is dev's way to watch main's own link, against onPC or a stand-in,
	// in a window rather than the full-screen kiosk. The run order stays cold.
	const [scenario, setScenario] = useState<Scenario | 'real'>('cold')
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
			if (e.key === '0') return setScenario('real')
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
	// then cold is exactly right: no preload, no main, no desk. Polled in dev too,
	// for the 'real' scenario.
	const [mainLink, setMainLink] = useState<LinkState | null>(null)
	useEffect(() => {
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

	// The showfile, as main holds it: what LifeBridge's `show` verb said, stamped
	// on the wall clock so the age derived here is true. Polled like the link;
	// it changes rarely, but its age is shown and must not lag.
	const [mainShowfile, setMainShowfile] = useState<Channel<Showfile> | null>(null)
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.showfile().then((c) => alive && setMainShowfile(c))
		poll()
		const id = setInterval(poll, 1000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])

	// The run order, as main last read it from the backend. Main reads every
	// 30 s; this only has to keep the age on screen current.
	const [mainSchedule, setMainSchedule] = useState<Channel<Schedule> | null>(null)
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.runOrder().then((c) => alive && setMainSchedule(c))
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

	// Channel B is polled even in dev, unlike the link above. The mock desk drives
	// the four READING states; this is the real console, and being able to watch
	// real fader traffic arrive while the mock exercises the failure modes is the
	// whole point of having both on screen at once.
	const [desk, setDesk] = useState<DeskState | null>(null)
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.deskState().then((d) => alive && setDesk(d))
		poll()
		// 2 Hz. Main already coalesces to 10 Hz; this only has to be fast enough
		// that "heard 0s ago" does not visibly lag a fader being moved.
		const id = setInterval(poll, 500)
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

	const sources: Sources =
		DEV && scenario !== 'real'
			? mockState(scenario, now)
			: {
					...coldSources(now),
					...(mainLink === null ? {} : { link: mainLink }),
					...(mainShowfile === null ? {} : { showfile: mainShowfile }),
					...(mainSchedule === null ? {} : { schedule: mainSchedule }),
				}

	// Judged by its own reads, not the console link: null (src/shared/reading.ts).
	const schedule = readingOf(sources.schedule, now, null, RUN_ORDER_STALE_AFTER_MS)
	const showfile = readingOf(sources.showfile, now, sources.link, SHOW_STALE_AFTER_MS)

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{DEV && (
				<div className="flex items-center gap-3 bg-warn px-4 py-1.5 text-xs font-semibold text-booth-bg">
					{scenario === 'real' ? (
						<>
							<span className="tracking-widest">DEV — REAL CONSOLE LINK</span>
							<span className="font-normal">the link, showfile and run order are main's own</span>
						</>
					) : (
						<>
							<span className="tracking-widest">MOCK DESK — NOT A REAL CONSOLE</span>
							<span className="font-normal">{SCENARIO_LABEL[scenario]}</span>
						</>
					)}
					<span className="ml-auto font-normal opacity-80">
						{['0 real', ...SCENARIOS.map((s, i) => `${i + 1} ${s}`)].join('   ')}
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
				onReloadPane={
					pane?.pane.state === 'showing' || pane?.pane.state === 'connecting' ? () => window.life?.retryMaPane() : null
				}
				settingsOpen={settingsOpen}
				onSettings={() => setSettingsOpen(!settingsOpen)}
				desk={desk}
				showfile={showfile}
				showfileFailure={failureOf(sources.showfile)}
			/>

			{/* Above the pane, never over it: a native view cannot be overlaid. */}
			{sources.link.state === 'unreachable' && (
				<div className="border-b border-state-unreachable/40 bg-state-unreachable/15 px-6 py-2 text-sm">
					<span className="text-state-unreachable">
						No console link — console readings are unknown, and the dashboard can't confirm the MA picture is current.
					</span>{' '}
					<span className="text-booth-dim">The web remote shows its own “disconnected” once it notices.</span>
				</div>
			)}

			{/* The run order is a sibling of the pane, never an overlay on it, so
			    "never covered" is a fact about the layout rather than a rule
			    someone has to remember. The buttons are the MA's own, in the pane. */}
			<div className="flex min-h-0 flex-1">
				{runOrderOpen ? (
					<RunOrder schedule={schedule} failure={failureOf(sources.schedule)} onFold={() => setRunOrderOpen(false)} />
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
