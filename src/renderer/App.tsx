import { useEffect, useState } from 'react'

import type { Channel, LinkState } from '../shared/reading.js'
import { readingOf, unread } from '../shared/reading.js'
import type { DeskState } from '../shared/desk.js'
import { SHOW_STALE_AFTER_MS, type Showfile } from '../shared/showfile.js'
import type { MaPaneReport } from '../shared/ma-pane.js'
import type { CuePaneReport } from '../shared/cue-pane.js'
import { TIMER_STALE_AFTER_MS, type TimerSources } from '../shared/timer.js'
import { ARENA_STALE_AFTER_MS, arenaVersion, type ArenaSource } from '../shared/arena.js'
import { consoleStatus, cueStatus, polledStatus, worstTone, type ConnectionStatus } from '../shared/connections.js'
import { StatusBar } from './components/StatusBar.js'
import { CuePane, FoldedCuePane } from './components/CuePane.js'
import { Divider } from './components/Divider.js'
import { useCueWidth } from './cueWidth.js'
import { MaPane, paneSummary } from './components/MaPane.js'
import { ConnectionsPanel } from './components/ConnectionsPanel.js'
import { useMode } from './mode.js'
import { SCENARIOS, SCENARIO_LABEL, mockState, type Scenario } from './mock.js'

const DEV = import.meta.env.DEV

type Sources = { link: LinkState; showfile: Channel<Showfile> }

/** What the app knows with no transport wired: nothing, and it says so.
 *
 *  This is not a placeholder awaiting real data — it is the correct state today:
 *  the channels are proven on the desk, but none is wired into the app yet. When
 *  the transport lands it replaces the source, not this shape. */
function coldSources(now: number): Sources {
	return {
		link: { state: 'unreachable', since: now },
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
	const [connectionsOpen, setConnectionsOpen] = useState(false)
	const cueWidth = useCueWidth()

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

	// OnTime and ProPresenter, as main last heard them. Real in dev too: they are
	// not the console, so the mock desk has nothing to say about them. Polled
	// faster than the rest, so a ProPresenter timer, which cannot be counted
	// down here, is never far behind the one on stage.
	const [timers, setTimers] = useState<TimerSources | null>(null)
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.timers().then((t) => alive && setTimers(t))
		poll()
		const id = setInterval(poll, 250)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])

	// Arena's link, as main last heard it. Real in dev too, like the timers.
	// Undefined until main has answered once: a renderer that has not asked yet
	// is not an Arena that is not set up.
	const [arena, setArena] = useState<ArenaSource | undefined>(undefined)
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.arena().then((a) => alive && setArena(a))
		poll()
		const id = setInterval(poll, 1_000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])

	// The run order is the Cue Manager itself, in its own pane: real in dev
	// too, like the MA pane. Polled for its load state and its last input.
	const [cue, setCue] = useState<CuePaneReport | null>(null)
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.cuePane().then((r) => alive && setCue(r ?? null))
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

	// Input in either pane counts: an LD writing notes in the Cue Manager is
	// as busy as one working the MA.
	const inputs = [pane?.lastInputAt ?? null, cue?.lastInputAt ?? null].filter((t): t is number => t !== null)
	const { mode, enter, leave } = useMode(now, inputs.length === 0 ? null : Math.max(...inputs))

	// The mode is which MA user the pane is (src/renderer/mode.ts). Main does the
	// login; the renderer only says which. Connections closes on any change of
	// mode, by a tap or by the idle drop: it stands in the MA pane's place, and a
	// volunteer left looking at it after the drop would have no MA.
	useEffect(() => {
		window.life?.setMaPaneMode(mode)
		setConnectionsOpen(false)
	}, [mode])

	const sources: Sources =
		DEV && scenario !== 'real'
			? mockState(scenario, now)
			: {
					...coldSources(now),
					...(mainLink === null ? {} : { link: mainLink }),
					...(mainShowfile === null ? {} : { showfile: mainShowfile }),
				}

	const showfile = readingOf(sources.showfile, now, sources.link, SHOW_STALE_AFTER_MS)

	// Every connection, once: the tab's rows, and the worst of them on the
	// status bar's button. Outside the kiosk there is no main to ask, so the
	// polled sources read as not set up rather than as down.
	const connections: ConnectionStatus[] = [
		consoleStatus(sources.link, pane?.pane ?? null),
		polledStatus('ontime', 'OnTime', timers?.ontime ?? null, now, TIMER_STALE_AFTER_MS, (v) =>
			v.playback === 'play' || v.playback === 'pause' || v.playback === 'roll' ? (v.nowTitle ?? null) : 'no event running',
		),
		polledStatus('propresenter', 'ProPresenter', timers?.propresenter ?? null, now, TIMER_STALE_AFTER_MS, () =>
			timers?.proPresenterTimer == null ? null : `follows “${timers.proPresenterTimer}”`,
		),
		polledStatus('arena', 'Arena', arena ?? null, now, ARENA_STALE_AFTER_MS, (p) => `${p.name} ${arenaVersion(p)}`),
		cueStatus(cue?.pane ?? null),
	]

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{DEV && (
				<div className="flex items-center gap-3 bg-warn px-4 py-1.5 text-xs font-semibold text-booth-bg">
					{scenario === 'real' ? (
						<>
							<span className="tracking-widest">DEV — REAL CONSOLE LINK</span>
							<span className="font-normal">the link and showfile are main's own; the run order is the real Cue Manager</span>
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
				onReloadPane={
					pane?.pane.state === 'showing' || pane?.pane.state === 'connecting' ? () => window.life?.retryMaPane() : null
				}
				connectionsOpen={connectionsOpen}
				onConnections={() => setConnectionsOpen(!connectionsOpen)}
				connections={worstTone(connections)}
				showfile={showfile}
				showfileFailure={failureOf(sources.showfile)}
				timers={timers}
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
				<CuePane report={cue} folded={!runOrderOpen} onFold={() => setRunOrderOpen(false)} width={cueWidth.width} now={now} />
				{runOrderOpen ? (
					<Divider
						width={cueWidth.width}
						onDrag={cueWidth.set}
						onDone={cueWidth.commit}
						onFold={() => {
							cueWidth.revert()
							setRunOrderOpen(false)
						}}
						onReset={cueWidth.reset}
					/>
				) : (
					<FoldedCuePane onOpen={() => setRunOrderOpen(true)} />
				)}
				<main className="flex min-w-0 flex-1 flex-col">
					{/* Always mounted, so the connection survives the Connections tab
					    standing in its place. */}
					<MaPane report={pane} hidden={connectionsOpen} now={now} />
					{connectionsOpen && (
						<ConnectionsPanel
							rows={connections}
							operator={mode === 'operator'}
							paneSummary={paneSummary(pane, mode)}
							desk={desk}
							now={now}
							onClose={() => setConnectionsOpen(false)}
						/>
					)}
				</main>
			</div>
		</div>
	)
}
