import { useEffect, useRef, useState } from 'react'

import { embedIdOf, embedView, type Embed, type EmbedReport } from '../shared/embeds.js'

import type { Channel, LinkState } from '../shared/reading.js'
import { readingOf, unread } from '../shared/reading.js'
import type { DeskState } from '../shared/desk.js'
import { SHOW_STALE_AFTER_MS, type Showfile } from '../shared/showfile.js'
import type { MaPaneReport, PaneRect } from '../shared/ma-pane.js'
import type { CuePaneReport } from '../shared/cue-pane.js'
import { TIMER_STALE_AFTER_MS, type TimerSources } from '../shared/timer.js'
import { ARENA_STALE_AFTER_MS, arenaVersion, type ArenaSource, type ArenaStatus } from '../shared/arena.js'
import {
	consoleStatus,
	cueStatus,
	embedStatus,
	viewIsOn,
	polledStatus,
	turnedOff,
	videoStatus,
	worstTone,
	type ConnectionId,
	type ConnectionStatus,
} from '../shared/connections.js'
import { StatusBar } from './components/StatusBar.js'
import { CueMessage } from './components/CuePane.js'
import { Divider } from './components/Divider.js'
import { useLeftWidth } from './leftWidth.js'
import { MaMessage, Say, paneSummary } from './components/MaPane.js'
import { ArenaView } from './components/ArenaView.js'
import { ClipsView } from './components/ClipsView.js'
import { VideoStrip, VideoView, type VideoSpace } from './components/VideoView.js'
import { currentFrame, fitLeftWidth, type VideoFeedState } from '../shared/video-feed.js'
import { Centered, FoldedSlot, Slot } from './components/Slot.js'
import { Still } from './components/Still.js'
import { barButton } from './components/vocabulary.js'
import { VIEWS, isNative, offered, slotOf, viewLabel, type Slot as SlotId, type ViewId } from '../shared/layout.js'
import { EmbedMessage, ZoomControl } from './components/EmbedPane.js'
import { useSlots } from './slots.js'
import { usePopouts } from './popouts.js'
import { PanePlacer } from './panePlacement.js'
import { ConnectionsPanel } from './components/ConnectionsPanel.js'
import { ShowfileSheet } from './components/ShowfileSheet.js'
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
	const [leftOpen, setLeftOpen] = useState(true)
	const [connectionsOpen, setConnectionsOpen] = useState(false)
	// The showfile sheet (Save As, Load) takes the right slot's place as
	// Connections does; one at a time. The campus is read as it opens, for the
	// name Save As offers.
	const [showfileOpen, setShowfileOpen] = useState(false)
	const [campus, setCampus] = useState<string | null>(null)
	const openShowfile = () => {
		setConnectionsOpen(false)
		setShowfileOpen(!showfileOpen)
		void window.life?.settings().then((s) => setCampus(s.campus))
	}
	// The connections turned off in Connections (../shared/settings.ts `off`):
	// read on start and again whenever Connections saves.
	// The embeds (../shared/embeds.ts) are read with it: added, removed and
	// turned off in the same place.
	const [off, setOff] = useState<ConnectionId[]>([])
	const [embeds, setEmbeds] = useState<Embed[]>([])
	// Nothing on screen is moved for a view that is off until the settings
	// that say so have been read: before then, every embed looks removed.
	const [settingsRead, setSettingsRead] = useState(false)
	const readOff = () =>
		void window.life?.settings().then((s) => {
			setOff(s.off)
			setEmbeds(s.embeds)
			setSettingsRead(true)
		})
	useEffect(readOff, [])
	const label = (view: ViewId) => viewLabel(view, embeds)
	const leftWidth = useLeftWidth()
	const { layout, choose } = useSlots()
	const { popped, popOut, bringBack } = usePopouts()

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

	// What Arena is playing, for the Arena view. Faster than its link, so a
	// fader moved in Arena is not visibly behind here. Undefined until main has
	// answered once, like the link above.
	const [arenaStatus, setArenaStatus] = useState<Channel<ArenaStatus> | null | undefined>(undefined)
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.arenaStatus().then((a) => alive && setArenaStatus(a))
		poll()
		const id = setInterval(poll, 250)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])

	// The video feed's senders and its last frame, for the picker and the
	// view's words. The frames themselves never pass through here.
	const [videoFeed, setVideoFeed] = useState<VideoFeedState | null | undefined>(undefined)
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.videoFeed().then((v) => alive && setVideoFeed(v))
		poll()
		const id = setInterval(poll, 500)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])

	// The space the picture has, for the strip's size readout and for Fit.
	const [videoSpace, setVideoSpace] = useState<VideoSpace | null>(null)
	/** Fit: move the divider so the video's slot takes the picture's shape,
	 *  rather than changing the resolution in Arena. The slots' own limits
	 *  still apply, so a picture too wide for them stays letterboxed. */
	const fitVideo = () => {
		const side = slotOf(layout, 'video')
		const picture = videoFeed == null ? null : currentFrame(videoFeed)
		if (side === null || picture === null || videoSpace === null) return
		// Folded, the divider is not on screen: moving it would change only the
		// width the left slot comes back at, which nobody asked for.
		if (!leftOpen) return
		leftWidth.commit(fitLeftWidth({ side, picture, space: videoSpace, leftWidth: leftWidth.width }))
	}

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

	// Each embed's page, as main holds it. Polled like the run order.
	const [embedReports, setEmbedReports] = useState<EmbedReport[]>([])
	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let alive = true
		const poll = () => void api.embeds().then((r) => alive && setEmbedReports(r))
		poll()
		const id = setInterval(poll, 1000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])
	const embedReport = (id: string) => embedReports.find((r) => r.id === id) ?? null

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

	// The two native views are placed from here, which never unmounts, over
	// whichever slot's body holds them (./panePlacement.ts). A view in neither
	// slot, in the folded left one, or behind Connections is hidden, and keeps
	// its page: the Cue Manager its half-typed note, the MA its connection. A
	// popped-out view is placed by its own window, and main ignores the kiosk
	// about it until it is back.
	// One box per page, by view. Each view's ref callback is made once and
	// kept, so React does not hand a box over and back on every render.
	const [boxes, setBoxes] = useState<Record<string, HTMLElement | null>>({})
	const boxRefs = useRef(new Map<ViewId, (el: HTMLElement | null) => void>())
	const boxRefOf = (view: ViewId) => {
		if (!isNative(view)) return undefined
		let ref = boxRefs.current.get(view)
		if (ref === undefined) {
			ref = (el) => setBoxes((b) => (b[view] === el ? b : { ...b, [view]: el }))
			boxRefs.current.set(view, ref)
		}
		return ref
	}

	// While the divider is dragged, each page stands still as a picture of
	// itself and the live view is hidden (../main/pane-snapshot.ts): a page
	// reflowing on every step trailed the finger. A pane with no picture stays
	// live. The pictures outlast the drag by a moment, so the live view is back
	// over its box before the picture under it goes.
	const [stills, setStills] = useState<Record<string, string | null> | null>(null)
	const [frozen, setFrozen] = useState(false)
	const drag = useRef(0)
	const startDrag = () => {
		const id = ++drag.current
		void window.life?.snapshotPanes().then((s) => {
			if (drag.current !== id) return
			setStills(s)
			setFrozen(true)
		})
	}
	const endDrag = () => {
		const id = ++drag.current
		setFrozen(false)
		setTimeout(() => drag.current === id && setStills(null), 300)
	}

	/** Every page main draws, and how this screen places it. */
	const pages: Array<{ view: ViewId; send: (rect: PaneRect | null) => void }> = [
		{ view: 'ma', send: (rect) => window.life?.placeMaPane(rect) },
		{ view: 'cue', send: (rect) => window.life?.placeCuePane(rect) },
		...embeds
			.filter((e) => e.on)
			.map((e) => ({ view: embedView(e.id), send: (rect: PaneRect | null) => window.life?.placeEmbed(e.id, rect) })),
	]
	const pageHidden = (view: ViewId) =>
		popped.has(view) || (!leftOpen && layout.left === view) || (frozen && stills?.[view] != null)
	// Unmounting closes the MA connection. It happens when the renderer goes
	// away, which main also covers, since a crashed renderer cannot say goodbye.
	useEffect(
		() => () => {
			window.life?.releaseMaPane()
		},
		[],
	)

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
	const inputs = [pane?.lastInputAt ?? null, cue?.lastInputAt ?? null, ...embedReports.map((r) => r.lastInputAt)].filter(
		(t): t is number => t !== null,
	)
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
		videoStatus(videoFeed ?? null),
	]
		.map((row) => (off.includes(row.id as ConnectionId) ? turnedOff(row.id, row.name) : row))
		.concat(embeds.map((e) => embedStatus(e, embedReport(e.id)?.pane ?? null)))
	const consoleOn = !off.includes('console')

	// What the pickers offer (../shared/layout.ts): a view whose source answers.
	// The MA answers when the link is live or the console's web remote has
	// loaded: either is the console responding.
	const arenaAnswering = connections.find((c) => c.id === 'arena')?.tone === 'live'
	const answering: Record<ViewId, boolean> = {
		cue: true,
		ma: sources.link.state === 'live' || pane?.pane.state === 'showing',
		arena: arenaAnswering,
		clips: arenaAnswering,
		video: (videoFeed?.senders.length ?? 0) > 0,
	}
	// A view whose connection is off is not offered, even in its own slot.
	const shown = (v: ViewId) => viewIsOn(v, off, embeds)
	const embedViews = embeds.filter((e) => e.on).map((e) => embedView(e.id))
	const choices = offered(layout, answering, embedViews).filter(shown)
	// A slot left holding a view that was just turned off takes the first view
	// still on, answering first. Turning a connection off is someone's choice,
	// so this is not the screen rearranging itself under a volunteer.
	useEffect(() => {
		if (!settingsRead) return
		for (const side of ['left', 'right'] as const) {
			if (shown(layout[side])) continue
			const other = layout[side === 'left' ? 'right' : 'left']
			const candidates = [...VIEWS, ...embedViews].filter((v) => shown(v) && v !== other)
			const next = candidates.find((v) => !(v in answering) || answering[v as keyof typeof answering]) ?? candidates[0]
			if (next !== undefined) choose(side, next)
		}
	})
	const maShown = layout.left === 'ma' || layout.right === 'ma'

	/** A view's own buttons, in its slot's strip. Reload reconnects a picture
	 *  and fires nothing. A popped-out view's buttons are in its own window. */
	const actionsOf = (view: ViewId) => {
		if (popped.has(view)) return null
		const reload = (label: string, onClick: () => void) => (
			<button type="button" onClick={onClick} className={`${barButton} h-9`} aria-label={label}>
				↻
			</button>
		)
		const out =
			window.life === undefined ? null : (
				<button
					type="button"
					onClick={() => popOut(view)}
					className={`${barButton} h-9`}
					aria-label={`Pop ${label(view)} out into its own window`}
				>
					Pop out
				</button>
			)
		const embedId = embedIdOf(view)
		if (embedId !== null) {
			const r = embedReport(embedId)
			return (
				<>
					{r !== null && <ZoomControl name={label(view)} zoom={r.zoom} onZoom={(by) => window.life?.zoomEmbed(embedId, by)} />}
					{out}
					{r?.pane.state === 'showing' && reload(`Reload ${label(view)}`, () => window.life?.retryEmbed(embedId))}
				</>
			)
		}
		switch (view) {
			case 'cue':
				return (
					<>
						{out}
						{cue?.pane.state === 'showing' && reload('Reload the run order', () => window.life?.retryCuePane())}
					</>
				)
			case 'ma':
				return (
					<>
						{out}
						{(pane?.pane.state === 'showing' || pane?.pane.state === 'connecting') &&
							reload('Reload the MA', () => window.life?.retryMaPane())}
					</>
				)
			case 'arena':
			case 'clips':
				return out
			case 'video':
				return (
					<>
						<VideoStrip feed={videoFeed} space={videoSpace} onFit={fitVideo} />
						{out}
					</>
				)
		}
	}

	const bodyOf = (view: ViewId, side: SlotId) => {
		// The slot keeps the view's place while it is out (../shared/popout.ts).
		if (popped.has(view)) {
			return (
				<Centered>
					<Say head={`${label(view)} is popped out`} body="It is in its own window, on top of this one.">
						<button
							type="button"
							onClick={() => bringBack(view)}
							className="mt-5 h-12 rounded-md border border-booth-edge px-6 text-sm active:scale-[0.98] active:bg-booth-edge"
						>
							Bring back
						</button>
					</Say>
				</Centered>
			)
		}
		const still = isNative(view) ? (stills?.[view] ?? null) : null
		if (still !== null) return <Still src={still} side={side} />
		const embedId = embedIdOf(view)
		if (embedId !== null) {
			return (
				<Centered>
					<EmbedMessage
						name={label(view)}
						pane={window.life === undefined ? null : (embedReport(embedId)?.pane ?? { state: 'idle', url: embeds.find((e) => e.id === embedId)?.url ?? '' })}
						now={now}
						onRetry={() => window.life?.retryEmbed(embedId)}
					/>
				</Centered>
			)
		}
		switch (view) {
			case 'cue':
				return (
					<Centered>
						<CueMessage pane={cue?.pane ?? null} now={now} />
					</Centered>
				)
			case 'ma':
				return (
					<Centered>
						<MaMessage pane={pane?.pane ?? null} now={now} />
					</Centered>
				)
			case 'arena':
				return <ArenaView status={arenaStatus} now={now} />
			case 'clips':
				return <ClipsView status={arenaStatus} now={now} />
			case 'video':
				return <VideoView feed={videoFeed} now={now} onSpace={setVideoSpace} />
		}
	}


	const slot = (side: SlotId, extra: { width?: number; folded?: boolean; onFold?: () => void }) => {
		const view = layout[side]
		return (
			<Slot
				key={side}
				view={view}
				labelOf={label}
				choices={choices}
				onPick={(v) => choose(side, v)}
				actions={actionsOf(view)}
				boxRef={boxRefOf(view)}
				{...extra}
			>
				{bodyOf(view, side)}
			</Slot>
		)
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{pages.map((p) => (
				<PanePlacer key={p.view} box={boxes[p.view] ?? null} hidden={pageHidden(p.view)} send={p.send} />
			))}
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
				consoleOn={consoleOn}
				now={now}
				mode={mode}
				onEnter={enter}
				onLeave={leave}
				connectionsOpen={connectionsOpen}
				onConnections={() => {
					setShowfileOpen(false)
					setConnectionsOpen(!connectionsOpen)
				}}
				onShowfile={openShowfile}
				connections={worstTone(connections)}
				showfile={showfile}
				showfileFailure={failureOf(sources.showfile)}
				timers={timers}
			/>

			{/* Above the slots, never over them: a native view cannot be overlaid.
			    Only while a slot holds the MA: an Arena machine with no console
			    has nothing to be told about one. */}
			{maShown && sources.link.state === 'unreachable' && (
				<div className="border-b border-state-unreachable/40 bg-state-unreachable/15 px-6 py-2 text-sm">
					<span className="text-state-unreachable">
						No console link — console readings are unknown, and the dashboard can't confirm the MA picture is current.
					</span>{' '}
					<span className="text-booth-dim">The web remote shows its own “disconnected” once it notices.</span>
				</div>
			)}

			{/* Two slots side by side (../shared/layout.ts), siblings and never
			    overlays, so "never covered" is a fact about the layout rather than
			    a rule someone has to remember. Connections stands in the right
			    slot's place; whatever native view was there is hidden, not closed. */}
			<div className="flex min-h-0 flex-1">
				{slot('left', {
					width: leftWidth.width,
					folded: !leftOpen,
					onFold: () => setLeftOpen(false),
				})}
				{leftOpen ? (
					<Divider
						width={leftWidth.width}
						onStart={startDrag}
						onDrag={leftWidth.set}
						onDone={(px) => {
							endDrag()
							leftWidth.commit(px)
						}}
						onFold={() => {
							endDrag()
							leftWidth.revert()
							setLeftOpen(false)
						}}
						onReset={leftWidth.reset}
					/>
				) : (
					<FoldedSlot label={label(layout.left)} onOpen={() => setLeftOpen(true)} />
				)}
				<main className="flex min-w-0 flex-1 flex-col">
					{connectionsOpen ? (
						<ConnectionsPanel
							rows={connections}
							operator={mode === 'operator'}
							paneSummary={paneSummary(pane, mode)}
							desk={desk}
							now={now}
							onChanged={readOff}
							onClose={() => setConnectionsOpen(false)}
						/>
					) : showfileOpen ? (
						<ShowfileSheet
							showfile={showfile}
							linkLive={sources.link.state === 'live'}
							operator={mode === 'operator'}
							campus={campus}
							now={now}
							onClose={() => setShowfileOpen(false)}
						/>
					) : (
						slot('right', {})
					)}
				</main>
			</div>
		</div>
	)
}
