import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Check, PictureInPicture2, Plus, RotateCw, SquareStack, Unplug } from 'lucide-react'

import { embedIdOf, embedView, type Embed, type EmbedReport } from '../shared/embeds.js'
import { ndiIdOf, ndiView, type NdiSource, type NdiState } from '../shared/ndi.js'
import { NdiStrip, NdiView } from './components/NdiView.js'

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
	ndiStatus,
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
import { Centered, MaMessage, paneSummary } from './components/MaPane.js'
import { ArenaView } from './components/ArenaView.js'
import { ClipsView } from './components/ClipsView.js'
import { HoldingView } from './components/HoldingView.js'
import { LookbookView } from './components/LookbookView.js'
import { VideoStrip, VideoView, type VideoSpace } from './components/VideoView.js'
import type { VideoFeedState } from '../shared/video-feed.js'
import { Still } from './components/Still.js'
import { Button, IconButton, Placeholder } from './components/ui.js'
import {
	VIEWS,
	addTab,
	addWindow,
	freshId,
	homeOf,
	isNative,
	makeHome,
	placeWindow,
	removeTab,
	moveTab,
	removeWindow,
	sameArrangement,
	selectTab,
	viewLabel,
	viewsShown,
	type GridWindow,
	type Tab,
	type ViewId,
} from '../shared/layout.js'
import { Grid } from './components/Grid.js'
import { LayoutsPanel } from './components/LayoutsPanel.js'
import { EmbedMessage, ZoomControl } from './components/EmbedPane.js'
import { useLayout } from './layoutStore.js'
import { usePopouts } from './popouts.js'
import { PanePlacer } from './panePlacement.js'
import { ConnectionsPanel } from './components/ConnectionsPanel.js'
import { ShowfileSheet } from './components/ShowfileSheet.js'
import { GuideSheet } from './components/GuideSheet.js'
import { GUIDE } from '../shared/guide.js'
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

/** Where this computer remembers the top bar folded. */
const BAR_KEY = 'paua.barCollapsed'

export function App() {
	const [now, setNow] = useState(() => Date.now())
	// 'real' is dev's way to watch main's own link, against onPC or a stand-in,
	// in a window rather than the full-screen kiosk. The run order stays cold.
	const [scenario, setScenario] = useState<Scenario | 'real'>('cold')
	// Arranging the windows: operator mode only (../shared/layout.ts).
	const [editing, setEditing] = useState(false)
	// The top bar folded to a strip: a convenience of this computer's, so a
	// machine that keeps nothing shows the bar.
	const [barCollapsed, setBarCollapsed] = useState(() => {
		try {
			return localStorage.getItem(BAR_KEY) === '1'
		} catch {
			return false
		}
	})
	const collapseBar = (on: boolean) => {
		setBarCollapsed(on)
		try {
			if (on) localStorage.setItem(BAR_KEY, '1')
			else localStorage.removeItem(BAR_KEY)
		} catch {
			// Kept for this run only.
		}
	}
	const [connectionsOpen, setConnectionsOpen] = useState(false)
	// The showfile sheet (Save As, Load) takes the right slot's place as
	// Connections does; one at a time. The campus is read as it opens, for the
	// name Save As offers.
	const [showfileOpen, setShowfileOpen] = useState(false)
	const [campus, setCampus] = useState<string | null>(null)
	// The Creative Guide (../shared/guide.ts), in the windows' place like the
	// sheets above; one at a time. Its page is placed over the sheet's body.
	const [guideOpen, setGuideOpen] = useState(false)
	const [guideBox, setGuideBox] = useState<HTMLElement | null>(null)
	const openShowfile = () => {
		setGuideOpen(false)
		setLayoutsOpen(false)
		setConnectionsOpen(false)
		setEditing(false)
		setShowfileOpen(!showfileOpen)
		void window.life?.settings().then((s) => setCampus(s.campus))
	}
	// The connections turned off in Connections (../shared/settings.ts `off`):
	// read on start and again whenever Connections saves.
	// The embeds (../shared/embeds.ts) are read with it: added, removed and
	// turned off in the same place.
	const [off, setOff] = useState<ConnectionId[]>([])
	const [embeds, setEmbeds] = useState<Embed[]>([])
	const [ndiSources, setNdiSources] = useState<NdiSource[]>([])
	// Nothing on screen is moved for a view that is off until the settings
	// that say so have been read: before then, every embed looks removed.
	const [settingsRead, setSettingsRead] = useState(false)
	const readOff = () =>
		void window.life?.settings().then((s) => {
			setOff(s.off)
			setEmbeds(s.embeds)
			setNdiSources(s.ndiSources)
			setSettingsRead(true)
		})
	useEffect(readOff, [])
	const label = (view: ViewId) => viewLabel(view, embeds, ndiSources)
	const { layout, update, saved, setSaved } = useLayout()
	// The saved layouts (./components/LayoutsPanel.tsx), in the grid's place.
	const [layoutsOpen, setLayoutsOpen] = useState(false)
	const layoutName = saved.find((l) => sameArrangement(l.layout, layout))?.name ?? null
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

	// NDI (../shared/ndi.ts): what the network has and how each added source
	// is received. Asked only once a source is added, since asking starts NDI.
	const [ndi, setNdi] = useState<NdiState | null | undefined>(undefined)
	const anyNdi = ndiSources.length > 0
	useEffect(() => {
		const api = window.life
		if (api === undefined || !anyNdi) return
		let alive = true
		const poll = () => void api.ndi().then((v) => alive && setNdi(v))
		poll()
		const id = setInterval(poll, 500)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [anyNdi])

	// The space the picture has, for the strip's size readout. Fit is a
	// pop-out's: a window on the grid snaps to cells, so it cannot take a
	// picture's exact shape.
	const [videoSpace, setVideoSpace] = useState<VideoSpace | null>(null)

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

	// The pages main draws (the MA, the run order, each embed) are placed from
	// here, which never unmounts, over the body of the tab that is their home
	// (./panePlacement.ts). A page in no tab, behind Connections or popped out
	// is hidden, and keeps its page: the Cue Manager its half-typed note, the MA
	// its connection. A popped-out page is placed by its own window, and main
	// ignores the kiosk about it until it is back.
	// One box per page, by view. Each view's ref callback is made once and
	// kept, so React does not hand a box over and back on every render.
	const [boxes, setBoxes] = useState<Record<string, HTMLElement | null>>({})
	const boxRefs = useRef(new Map<ViewId, (el: HTMLElement | null) => void>())
	const boxRefOf = (view: ViewId) => {
		let ref = boxRefs.current.get(view)
		if (ref === undefined) {
			ref = (el) => setBoxes((b) => (b[view] === el ? b : { ...b, [view]: el }))
			boxRefs.current.set(view, ref)
		}
		return ref
	}

	// While the layout is edited, each page stands still as a picture of
	// itself and the live page is hidden (../main/pane-snapshot.ts): the grid's
	// handles are drawn over the windows, and a native page cannot be drawn
	// over. The pictures outlast the editing by a moment, so the live page is
	// back over its box before the picture under it goes.
	// The pictures are taken before editing starts: once it has, the pages are
	// hidden and there is nothing to take a picture of.
	const [stills, setStills] = useState<Record<string, string | null> | null>(null)
	const editTurn = useRef(0)
	const startEditing = () => {
		const id = ++editTurn.current
		const pictures = window.life?.snapshotPanes() ?? Promise.resolve({})
		void pictures.then((s) => {
			if (editTurn.current !== id) return
			setStills(s)
			setEditing(true)
		})
	}
	// A shared edge being dragged (./components/Grid.tsx): pictures for its
	// length too, as the divider had, because a page reflowing on every step
	// trails the finger. A page with no picture stays live.
	const [frozen, setFrozen] = useState(false)
	const startSeam = () => {
		const id = ++editTurn.current
		void window.life?.snapshotPanes().then((s) => {
			if (editTurn.current !== id) return
			setStills(s)
			setFrozen(true)
		})
	}
	const endSeam = () => {
		const id = ++editTurn.current
		setFrozen(false)
		setTimeout(() => editTurn.current === id && setStills(null), 300)
	}
	useEffect(() => {
		if (editing) return
		const id = ++editTurn.current
		const t = setTimeout(() => editTurn.current === id && setStills(null), 300)
		return () => clearTimeout(t)
	}, [editing])

	/** Every page main draws, and how this screen places it. */
	const pages: Array<{ view: ViewId; send: (rect: PaneRect | null) => void }> = [
		{ view: 'ma', send: (rect) => window.life?.placeMaPane(rect) },
		{ view: 'cue', send: (rect) => window.life?.placeCuePane(rect) },
		...embeds
			.filter((e) => e.on)
			.map((e) => ({ view: embedView(e.id), send: (rect: PaneRect | null) => window.life?.placeEmbed(e.id, rect) })),
	]
	const pageHidden = (view: ViewId) => popped.has(view) || editing || (frozen && stills?.[view] != null)
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
		setEditing(false)
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
		.concat(ndiSources.map((s) => ndiStatus(s, ndi ?? null, now)))
	const consoleOn = !off.includes('console')

	// A tab whose connection is off is not on screen (../shared/layout.ts),
	// and comes back when it is on. Until settings are read, nothing is off:
	// every embed would otherwise look removed for a moment.
	const visible = (v: ViewId) => !settingsRead || viewIsOn(v, off, embeds, ndiSources)
	const embedViews = embeds.filter((e) => e.on).map((e) => embedView(e.id))
	const ndiViews = ndiSources.filter((s) => s.on).map((s) => ndiView(s.id))
	/** What a window's + offers: every view that may be on screen. */
	const offer = [...VIEWS, ...embedViews, ...ndiViews].filter(visible)
	const maShown = viewsShown(layout, visible).includes('ma')

	/** A view's own buttons, in its window's strip. Reload reconnects a picture
	 *  and fires nothing. A popped-out view's buttons are in its own window. */
	const actionsOf = (view: ViewId) => {
		if (popped.has(view)) return null
		const reload = (text: string, onClick: () => void) => <IconButton icon={RotateCw} size="sm" label={text} onClick={onClick} />
		const out =
			window.life === undefined ? null : (
				<IconButton icon={PictureInPicture2} size="sm" label={`Pop ${label(view)} out into its own window`} onClick={() => popOut(view)} />
			)
		const ndiId = ndiIdOf(view)
		if (ndiId !== null) {
			return (
				<>
					<NdiStrip id={ndiId} ndi={ndi} now={now} />
					{out}
				</>
			)
		}
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
			case 'holding':
			case 'lookbook':
				return out
			case 'video':
				return (
					<>
						<VideoStrip feed={videoFeed} space={videoSpace} />
						{out}
					</>
				)
		}
	}

	const bodyOf = (_win: GridWindow, tab: Tab) => {
		const view = tab.view
		// The tab keeps the view's place while it is out (../shared/popout.ts).
		if (popped.has(view)) {
			return (
				<Centered>
					<Placeholder
						icon={PictureInPicture2}
						head={`${label(view)} is in its own window`}
						body="Show brings that window to the front. Bring back puts it here again."
					>
						<div className="mt-6 flex justify-center gap-3">
							<Button variant="primary" onClick={() => window.life?.showPopout(view)}>
								Show
							</Button>
							<Button onClick={() => bringBack(view)}>Bring back</Button>
						</div>
					</Placeholder>
				</Centered>
			)
		}
		if (isNative(view) && homeOf(layout, view, visible) !== tab.id) {
			// A page is in one place at a time. Not its home: say where it is, and
			// offer to bring it here. Everyone may: it moves a page, not a window.
			return (
				<Centered>
					<Placeholder icon={SquareStack} head={`${label(view)} is showing in another window`} body="It can be in one place at a time.">
						<Button icon={ArrowLeftRight} className="mt-6" onClick={() => update((l) => makeHome(l, view, tab.id))}>
							Move it here
						</Button>
					</Placeholder>
				</Centered>
			)
		}
		if (isNative(view) && (editing || frozen)) {
			const still = stills?.[view] ?? null
			if (still !== null) return <Still src={still} side="left" />
			if (editing) {
				return (
					<Centered>
						<Placeholder head={label(view)} body="Shown again when the layout is done." />
					</Centered>
				)
			}
		}
		const ndiId = ndiIdOf(view)
		if (ndiId !== null) return <NdiView id={ndiId} ndi={ndi} now={now} />
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
			case 'holding':
				return <HoldingView status={arenaStatus} now={now} />
			case 'lookbook':
				return <LookbookView status={arenaStatus} now={now} />
			case 'video':
				return <VideoView feed={videoFeed} now={now} onSpace={setVideoSpace} />
		}
	}


	/** A new id for a window or tab, unlike any in the layout now. */
	const newId = (prefix: 'w' | 't') => freshId(layout, prefix)
	const [noRoom, setNoRoom] = useState(false)
	const [fresh, setFresh] = useState<string | null>(null)
	useEffect(() => {
		if (!noRoom) return
		const t = setTimeout(() => setNoRoom(false), 4_000)
		return () => clearTimeout(t)
	}, [noRoom])

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{pages.map((p) => (
				<PanePlacer key={p.view} box={boxes[p.view] ?? null} hidden={pageHidden(p.view)} send={p.send} />
			))}
			<PanePlacer box={guideOpen ? guideBox : null} hidden={!guideOpen} send={(rect) => window.life?.placeEmbed(GUIDE.id, rect)} />
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
				showfileOpen={showfileOpen}
				onMark={() =>
					window.life?.mark(
						`${mode}; layout ${layoutName === null ? 'unsaved' : `"${layoutName}"`}; showing ${viewsShown(layout, visible).map(label).join(', ') || 'nothing'}`,
					) ?? Promise.resolve(null)
				}
				layoutName={layoutName}
				layoutsOpen={layoutsOpen}
				guideOpen={guideOpen}
				onGuide={() => {
					setConnectionsOpen(false)
					setShowfileOpen(false)
					setLayoutsOpen(false)
					setEditing(false)
					setGuideOpen(!guideOpen)
				}}
				onLayouts={() => {
					setGuideOpen(false)
					setConnectionsOpen(false)
					setShowfileOpen(false)
					setEditing(false)
					setLayoutsOpen(!layoutsOpen)
				}}
				editing={editing}
				onEditLayout={() => {
					if (editing) return setEditing(false)
					setGuideOpen(false)
					setConnectionsOpen(false)
					setShowfileOpen(false)
					setLayoutsOpen(false)
					startEditing()
				}}
				onConnections={() => {
					setGuideOpen(false)
					setLayoutsOpen(false)
					setShowfileOpen(false)
					setEditing(false)
					setConnectionsOpen(!connectionsOpen)
				}}
				onShowfile={openShowfile}
				connections={worstTone(connections)}
				showfile={showfile}
				showfileFailure={failureOf(sources.showfile)}
				timers={timers}
				collapsed={barCollapsed}
				onCollapse={collapseBar}
			/>

			{/* Above the windows, never over them: a native view cannot be overlaid.
			    Only while a window shows the MA: an Arena machine with no console
			    has nothing to be told about one. */}
			{maShown && sources.link.state === 'unreachable' && (
				<div className="flex shrink-0 items-center gap-3 border-b border-state-unreachable/30 bg-state-unreachable/10 px-5 py-2.5 text-sm">
					<Unplug size={18} className="shrink-0 text-state-unreachable" aria-hidden />
					<span className="text-state-unreachable">The console is not answering, so Pāua can't confirm the MA picture is current.</span>
					<span className="text-booth-dim">The web remote shows its own “disconnected” once it notices.</span>
				</div>
			)}

			{editing && (
				// Above the grid: while editing, pages are pictures, and the bar says
				// what can be done and how to finish.
				<div className="nacre-tint relative flex h-16 shrink-0 animate-rise items-center gap-4 border-b border-nacre-blue/40 bg-booth-panel px-5">
					<span className="text-base font-medium">Editing the layout</span>
					<span className={`min-w-0 truncate text-sm ${noRoom ? 'text-state-stale' : 'text-booth-dim'}`}>
						{noRoom
							? 'No room for another window. Make one smaller first.'
							: 'Drag a window to move it, an edge or corner to resize, a tab to reorder it or move it to another window. + adds a tab, × takes one away.'}
					</span>
					<span className="ml-auto flex shrink-0 items-center gap-2">
						<Button
							icon={Plus}
							onClick={() => {
								const id = newId('w')
								const next = addWindow(layout, null, { window: id, tab: newId('t') })
								if (next === layout) setNoRoom(true)
								else {
									update(() => next)
									setFresh(id)
								}
							}}
						>
							Add window
						</Button>
						<Button variant="primary" icon={Check} onClick={() => setEditing(false)} className="px-6">
							Done
						</Button>
					</span>
				</div>
			)}

			{/* The windows on the grid (../shared/layout.ts), siblings and never
			    overlays, so "never covered" is a fact about the layout rather than
			    a rule someone has to remember. Connections and the showfile sheet
			    stand in the grid's place; every page is hidden, not closed. */}
			<main className="flex min-h-0 min-w-0 flex-1 flex-col">
				{guideOpen ? (
					<GuideSheet report={embedReport(GUIDE.id)} now={now} boxRef={setGuideBox} onClose={() => setGuideOpen(false)} />
				) : connectionsOpen ? (
					<ConnectionsPanel
						rows={connections}
						operator={mode === 'operator'}
						paneSummary={paneSummary(pane, mode)}
						desk={desk}
						now={now}
						onChanged={readOff}
						onClose={() => setConnectionsOpen(false)}
					/>
				) : layoutsOpen ? (
					<LayoutsPanel
						layout={layout}
						saved={saved}
						operator={mode === 'operator'}
						onSwitch={(l) => update(() => l)}
						onSaved={setSaved}
						labelOf={label}
						onEdit={() => {
							setLayoutsOpen(false)
							startEditing()
						}}
						onClose={() => setLayoutsOpen(false)}
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
					<Grid
						layout={layout}
						editing={editing}
						visible={visible}
						labelOf={label}
						offer={offer}
						body={bodyOf}
						boxRef={(_win, tab) =>
							isNative(tab.view) && !editing && homeOf(layout, tab.view, visible) === tab.id ? boxRefOf(tab.view) : undefined
						}
						actions={(_win, tab) => actionsOf(tab.view)}
						onSelect={(w, t) => update((l) => selectTab(l, w, t))}
						onAddTab={(w, v) => update((l) => addTab(l, w, v, freshId(l, 't')))}
						onRemoveTab={(w, t) => update((l) => removeTab(l, w, t))}
						onMoveTab={(from, t, to, before) => update((l) => moveTab(l, from, t, to, before))}
						onRemoveWindow={(w) => update((l) => removeWindow(l, w))}
						onPlace={(w, box) => update((l) => placeWindow(l, w, box))}
						fresh={fresh}
						onResize={(l) => update(() => l)}
						onSeamStart={startSeam}
						onSeamEnd={endSeam}
					/>
				)}
			</main>
		</div>
	)
}
