import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Check, MonitorPlay, PictureInPicture2, Plus, RotateCw, SquareStack, Unplug } from 'lucide-react'

import { embedIdOf, embedView, type Embed, type EmbedReport } from '../shared/embeds.js'
import { ndiIdOf, type NdiSource, type NdiState } from '../shared/ndi.js'
import { NdiStrip, NdiView } from './components/NdiView.js'
import { captureIdOf, type CaptureInput } from '../shared/capture.js'
import { FeedChooser, FeedMenu, SPOUT_KIND, feedName, shortSender, type FeedOptions } from './components/FeedPicker.js'
import { CaptureStrip, CaptureView } from './components/CaptureView.js'
import { captureStateOf, useCameras } from './capture.js'

import type { Channel, LinkState } from '../shared/reading.js'
import { readingOf, unread } from '../shared/reading.js'
import type { DeskState } from '../shared/desk.js'
import { useUpdates } from './useUpdates.js'
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
	captureStatus,
	viewIsOn,
	polledStatus,
	turnedOff,
	videoStatus,
	type ConnectionId,
	type ConnectionStatus,
} from '../shared/connections.js'
import { StatusBar } from './components/StatusBar.js'
import { CueMessage } from './components/CuePane.js'
import { Centered, MaMessage, paneSummary } from './components/MaPane.js'
import { ArenaView } from './components/ArenaView.js'
import { ClipsView } from './components/ClipsView.js'
import { LookbookView } from './components/LookbookView.js'
import { AnnouncementsView } from './components/AnnouncementsView.js'
import { VideoStrip, VideoView, type VideoSpace } from './components/VideoView.js'
import { TimerView } from './components/TimerView.js'
import type { VideoFeedState } from '../shared/video-feed.js'
import { Still } from './components/Still.js'
import { Button, IconButton, Placeholder } from './components/ui.js'
import { Say } from './components/MaPane.js'
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
	renameTab,
	moveTab,
	removeWindow,
	sameArrangement,
	selectTab,
	setTabFeed,
	shownTab,
	tabTitle,
	tabView,
	viewLabel,
	viewsShown,
	type GridWindow,
	type Tab,
	type VideoChoice,
	type ViewId,
} from '../shared/layout.js'
import { Grid } from './components/Grid.js'
import { LayoutsPanel } from './components/LayoutsPanel.js'
import { EmbedMessage, ZoomControl } from './components/EmbedPane.js'
import { useLayout } from './layoutStore.js'
import { usePopouts } from './popouts.js'
import { PanePlacer } from './panePlacement.js'
import { ConnectionsPanel } from './components/ConnectionsPanel.js'
import { SettingsPanel, type SettingsPage } from './components/SettingsPanel.js'
import { PasscodeSheet } from './components/PasscodeSheet.js'
import { DEFAULT_ADMIN_TIMEOUT_MIN } from '../shared/admin.js'
import { ShowfileSheet } from './components/ShowfileSheet.js'
import { GUIDE } from '../shared/guide.js'
import { OperatorContext, useMode } from './mode.js'
import { useBarHidden, useTesting } from './barItems.js'
import { useShowMode } from './showMode.js'
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

/** The sheets that stand in the windows' place. */
type SheetId = 'connections' | 'settings' | 'showfile' | 'passcode'

/** Where this computer remembers the top bar folded. */
const BAR_KEY = 'paua.barCollapsed'

export function App() {
	const [now, setNow] = useState(() => Date.now())
	// 'real' is dev's way to watch main's own link, against onPC or a stand-in,
	// in a window rather than the full-screen kiosk. The run order stays cold.
	const [scenario, setScenario] = useState<Scenario | 'real'>('cold')
	// Arranging the windows: everyone's since 2026-10-08, from a window's
	// pencil (../shared/layout.ts).
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
	// What Admin has hidden on the bar, on this computer (./barItems.ts).
	const [barHidden, setBarHidden] = useBarHidden()
	// Testing: Mark on the bar, on this computer (./barItems.ts).
	const [testing, setTesting] = useTesting()
	// Show mode (./showMode.ts): no strips, the layout and the mode held. On
	// this computer, across a restart. `leavingShow`: the passcode sheet is open
	// as its way out.
	const [show, setShow] = useShowMode()
	const [leavingShow, setLeavingShow] = useState(false)
	// The sheets that stand in the windows' place, one at a time: Connections
	// (a list to read), Settings (Admin's), the showfile sheet (Save As, Load).
	// The campus is read as the showfile sheet opens, for the name Save As
	// offers.
	const [sheet, setSheet] = useState<SheetId | null>(null)
	const [settingsStart, setSettingsStart] = useState<SettingsPage | null>(null)
	const connectionsOpen = sheet === 'connections'
	const showfileOpen = sheet === 'showfile'
	const settingsOpen = sheet === 'settings'
	const [campus, setCampus] = useState<string | null>(null)
	/** Open a sheet, or close it if it is the one open. Layouts and Edit
	 *  layout give way to it. */
	const toggleSheet = (id: SheetId) => {
		setLayoutsOpen(false)
		setEditing(false)
		setSheet(sheet === id ? null : id)
	}
	const openShowfile = () => {
		toggleSheet('showfile')
		void window.life?.settings().then((s) => setCampus(s.campus))
	}
	const openSettings = (start: SettingsPage | null) => {
		setLayoutsOpen(false)
		setEditing(false)
		setSettingsStart(start)
		setSheet('settings')
	}
	// The connections turned off in Connections (../shared/settings.ts `off`):
	// read on start and again whenever Connections saves.
	// The embeds (../shared/embeds.ts) are read with it: added, removed and
	// turned off in the same place.
	const [off, setOff] = useState<ConnectionId[]>([])
	const [embeds, setEmbeds] = useState<Embed[]>([])
	const [ndiSources, setNdiSources] = useState<NdiSource[]>([])
	const [captureInputs, setCaptureInputs] = useState<CaptureInput[]>([])
	// Nothing on screen is moved for a view that is off until the settings
	// that say so have been read: before then, every embed looks removed.
	const [settingsRead, setSettingsRead] = useState(false)
	// Settings › Admin's timeout (../shared/admin.ts), read with the rest.
	// Settings › ProPresenter › Announcements: off hides the Announcements view.
	const [announcementsOn, setAnnouncementsOn] = useState(true)
	const [adminIdleMs, setAdminIdleMs] = useState(DEFAULT_ADMIN_TIMEOUT_MIN * 60_000)
	// Settings › Admin: whether leaving Show mode asks Admin's way in.
	const [showLocked, setShowLocked] = useState(true)
	const readOff = () =>
		void window.life?.settings().then((s) => {
			setOff(s.off)
			setEmbeds(s.embeds)
			setNdiSources(s.ndiSources)
			setCaptureInputs(s.captureInputs)
			setAdminIdleMs(s.adminTimeoutMin * 60_000)
			setShowLocked(s.showModeLocked)
			setAnnouncementsOn(s.announcementsOn)
			setSettingsRead(true)
		})
	useEffect(readOff, [])
	const label = (view: ViewId) => viewLabel(view, embeds, ndiSources, captureInputs)
	const { layout, update, saved, setSaved } = useLayout()
	// The saved layouts (./components/LayoutsPanel.tsx), a dropdown over the
	// windows; the pages stand in as pictures while it is open (below).
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

	// The cameras this computer has (./capture.ts), once a capture input is
	// added: for their rows, and for a view to say one has gone.
	const cameras = useCameras(captureInputs.length > 0)

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
	// The Layouts dropdown (the owner, 2026-10-06: "on top of the screen, not
	// take you to a whole different screen"): drawn over the windows, so the
	// pages are pictures while it is open, taken before it opens.
	const openLayouts = () => {
		const id = ++editTurn.current
		const pictures = window.life?.snapshotPanes() ?? Promise.resolve({})
		void pictures.then((s) => {
			if (editTurn.current !== id) return
			setStills(s)
			setLayoutsOpen(true)
		})
	}
	// Not a turn of its own: the pictures outlast editing and the dropdown by
	// a moment, and a turn started meanwhile keeps them.
	useEffect(() => {
		if (editing || layoutsOpen) return
		const id = editTurn.current
		const t = setTimeout(() => editTurn.current === id && setStills(null), 300)
		return () => clearTimeout(t)
	}, [editing, layoutsOpen])

	/** Every page main draws, and how this screen places it. */
	const pages: Array<{ view: ViewId; send: (rect: PaneRect | null) => void }> = [
		{ view: 'ma', send: (rect) => window.life?.placeMaPane(rect) },
		{ view: 'cue', send: (rect) => window.life?.placeCuePane(rect) },
		{ view: 'guide', send: (rect) => window.life?.placeEmbed(GUIDE.id, rect) },
		...embeds
			.filter((e) => e.on)
			.map((e) => ({ view: embedView(e.id), send: (rect: PaneRect | null) => window.life?.placeEmbed(e.id, rect) })),
	]
	const pageHidden = (view: ViewId) => popped.has(view) || editing || layoutsOpen || (frozen && stills?.[view] != null)
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
	const updates = useUpdates()
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
	const { mode, enter, leave } = useMode(now, inputs.length === 0 ? null : Math.max(...inputs), adminIdleMs)
	// Volunteer tapped (../shared/admin.ts): the passcode sheet, or straight in
	// when none is set. Main decides either way; the screen follows. Outside
	// the kiosk (a browser on the renderer alone) there is no main to ask.
	const askAdmin = async () => {
		if (sheet === 'passcode') return setSheet(null)
		const api = window.life
		if (api === undefined) return enter()
		const state = await api.adminState()
		if (state === undefined) return
		if (state.hasPasscode) {
			setLayoutsOpen(false)
			setEditing(false)
			return setSheet('passcode')
		}
		const r = await api.unlockAdmin(null)
		if (r?.ok === true) enter()
	}
	// Into Show mode: anyone, at once. Whatever stood over the windows goes,
	// and so does Admin (the owner, 2026-10-14: "showmode should just knock you
	// out of admin when it locks it"): a screen left in Show mode is a
	// volunteer's, its loads and writes with it, however long it stands.
	const enterShow = () => {
		setSheet(null)
		setEditing(false)
		setLayoutsOpen(false)
		if (mode === 'operator') leave()
		setShow(true)
	}
	// Out of Show mode (./showMode.ts): Admin's way in, whatever the mode, or,
	// unlocked, a tap, back to volunteer.
	const outOfShow = () => {
		enter()
		setShow(false)
		setLeavingShow(false)
	}
	const leaveShow = async () => {
		if (sheet === 'passcode') {
			setSheet(null)
			return setLeavingShow(false)
		}
		if (!showLocked) {
			setShow(false)
			return setLeavingShow(false)
		}
		const api = window.life
		if (api === undefined) return outOfShow()
		const state = await api.adminState()
		if (state === undefined) return
		if (state.hasPasscode) {
			setLeavingShow(true)
			return setSheet('passcode')
		}
		const r = await api.unlockAdmin(null)
		if (r?.ok === true) outOfShow()
	}

	// The mode is which MA user the pane is (src/renderer/mode.ts). Main does the
	// login; the renderer only says which. Connections closes on any change of
	// mode, by a tap or by the idle drop: it stands in the MA pane's place, and a
	// volunteer left looking at it after the drop would have no MA.
	useEffect(() => {
		window.life?.setMaPaneMode(mode)
		setSheet(null)
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
		videoStatus(videoFeed ?? null, now),
	]
		.map((row) => (off.includes(row.id as ConnectionId) ? turnedOff(row.id, row.name) : row))
		.concat(embeds.map((e) => embedStatus(e, embedReport(e.id)?.pane ?? null)))
		.concat(ndiSources.map((s) => ndiStatus(s, ndi ?? null, now)))
		.concat(captureInputs.map((c) => captureStatus(c, captureStateOf(c.device, cameras), now)))
	const consoleOn = !off.includes('console')

	// A tab whose connection is off is not on screen (../shared/layout.ts),
	// and comes back when it is on. Until settings are read, nothing is off:
	// every embed would otherwise look removed for a moment.
	const visibleView = (v: ViewId) => !settingsRead || viewIsOn(v, off, embeds, ndiSources, captureInputs, announcementsOn)
	/** A tab is on screen while its view is (a Video tab's feed's view). A
	 *  Video tab with no feed yet always is, so its feed can be picked. */
	const visible = (t: Tab) => (t.view === 'video' && t.feed == null) || visibleView(tabView(t))
	const embedViews = embeds.filter((e) => e.on).map((e) => embedView(e.id))
	/** What a window's + offers: every view that may be on screen. Video is
	 *  one, whatever feeds there are (2026-10-08): the tab picks its feed.
	 *  Offered even with the Video feed's connection off, for NDI and capture. */
	const offer = [...VIEWS, ...embedViews].filter((v) => v === 'video' || visibleView(v))
	const maShown = viewsShown(layout, visible).includes('ma')

	// One Video view for every feed (./components/FeedPicker.tsx). What each
	// tab is called without a name of its own: its feed's.
	const nameOf = (t: Tab) => (t.view === 'video' ? feedName(t.feed, ndiSources, captureInputs) : label(t.view))
	const titleOf = (t: Tab) => tabTitle(t, nameOf)
	const feedOptions: FeedOptions = {
		senders: videoFeed == null ? null : videoFeed.senders,
		videoOff: off.includes('video'),
		spoutKind: SPOUT_KIND,
		ndi: ndiSources,
		capture: captureInputs,
	}
	// This computer's Spout or Syphon engine receives one sender at a time
	// (src/main/video-feed.ts, kept as it is). The senders the Video tabs on
	// screen ask for by name: while they ask for one, it is shown; while they
	// ask for two, each tab not shown says so and offers to show its own.
	const spoutWanted = [
		...new Set(
			layout.windows
				.map((w) => shownTab(w, visible))
				.flatMap((t) =>
					t !== null && t.view === 'video' && (t.feed?.kind === 'spout' || t.feed?.kind === 'syphon') && t.feed.name !== null ? [t.feed.name] : [],
				),
		),
	]
	const spoutWantedKey = spoutWanted.join('\n')
	const sendersKey = videoFeed?.senders.join('\n') ?? ''
	useEffect(() => {
		const want = spoutWanted.length === 1 ? spoutWanted[0] : undefined
		if (want === undefined || videoFeed == null) return
		if (videoFeed.showing !== want && videoFeed.senders.includes(want)) window.life?.chooseVideo(want)
	}, [spoutWantedKey, videoFeed?.showing, sendersKey])
	/** Whether the engine shows what this Spout or Syphon tab asks for. */
	const spoutShowsMine = (feed: VideoChoice) =>
		(feed.kind !== 'spout' && feed.kind !== 'syphon') || feed.name === null || videoFeed?.showing === feed.name
	const pickFeed = (win: GridWindow, tab: Tab, feed: VideoChoice) => update((l) => setTabFeed(l, win.id, tab.id, feed))

	/** A view's own buttons, in its window's strip. Reload reconnects a picture
	 *  and fires nothing. A popped-out view's buttons are in its own window. */
	const actionsOf = (win: GridWindow, tab: Tab) => {
		const view = tabView(tab)
		// A Video tab's feed is its own pick, in its strip, out or not.
		const menu = tab.view === 'video' ? <FeedMenu options={feedOptions} current={tab.feed} onPick={(f) => pickFeed(win, tab, f)} /> : null
		if (popped.has(view)) return menu
		const reload = (text: string, onClick: () => void) => <IconButton icon={RotateCw} size="sm" label={text} onClick={onClick} />
		const out =
			window.life === undefined || (tab.view === 'video' && tab.feed == null) ? null : (
				<IconButton icon={PictureInPicture2} size="sm" label={`Pop ${titleOf(tab)} out into its own window`} onClick={() => popOut(view)} />
			)
		const captureId = captureIdOf(view)
		if (captureId !== null) {
			return (
				<>
					<CaptureStrip input={captureInputs.find((c) => c.id === captureId)} now={now} />
					{menu}
					{out}
				</>
			)
		}
		const ndiId = ndiIdOf(view)
		if (ndiId !== null) {
			return (
				<>
					<NdiStrip id={ndiId} ndi={ndi} now={now} />
					{menu}
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
			case 'guide': {
				const r = embedReport(GUIDE.id)
				return (
					<>
						{r !== null && <ZoomControl name={GUIDE.name} zoom={r.zoom} onZoom={(by) => window.life?.zoomEmbed(GUIDE.id, by)} />}
						{out}
						{r?.pane.state === 'showing' && reload('Reload the guide', () => window.life?.retryEmbed(GUIDE.id))}
					</>
				)
			}
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
			case 'lookbook':
			case 'announcements':
			case 'timer':
				return out
			case 'video':
				return (
					<>
						{/* The size readout only while this tab's own sender is the one shown. */}
						{tab.feed != null && <VideoStrip feed={videoFeed} space={spoutShowsMine(tab.feed) ? videoSpace : null} />}
						{menu}
						{out}
					</>
				)
		}
	}

	const bodyOf = (win: GridWindow, tab: Tab) => {
		const view = tabView(tab)
		// Show mode holds the layout (./showMode.ts): what a tab shows is not
		// chosen or moved from inside it either.
		if (tab.view === 'video' && tab.feed == null) {
			if (show) {
				return (
					<Centered>
						<Placeholder icon={SquareStack} head="No video feed chosen" body="Leave Show mode to pick one." />
					</Centered>
				)
			}
			return <FeedChooser options={feedOptions} onPick={(f) => pickFeed(win, tab, f)} />
		}
		// The tab keeps the view's place while it is out (../shared/popout.ts).
		if (popped.has(view)) {
			// Every Spout or Syphon tab shares the one picture (and its window):
			// say which sender is out, not this tab's name over another's picture.
			const sender = videoFeed?.showing ?? null
			const head =
				view === 'video'
					? `The ${SPOUT_KIND === 'syphon' ? 'Syphon' : 'Spout'} picture${sender === null ? '' : ` (“${shortSender(sender)}”)`} is in its own window`
					: `${titleOf(tab)} is in its own window`
			return (
				<Centered>
					<Placeholder
						icon={PictureInPicture2}
						head={head}
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
						{!show && (
							<Button icon={ArrowLeftRight} className="mt-6" onClick={() => update((l) => makeHome(l, view, tab.id))}>
								Move it here
							</Button>
						)}
					</Placeholder>
				</Centered>
			)
		}
		if (isNative(view) && (editing || frozen || layoutsOpen)) {
			const still = stills?.[view] ?? null
			if (still !== null) return <Still src={still} side="left" />
			if (editing || layoutsOpen) {
				return (
					<Centered>
						<Placeholder head={label(view)} body={editing ? 'Shown again when the layout is done.' : 'Shown again when Layouts closes.'} />
					</Centered>
				)
			}
		}
		const ndiId = ndiIdOf(view)
		if (ndiId !== null) return <NdiView id={ndiId} ndi={ndi} now={now} />
		const captureId = captureIdOf(view)
		if (captureId !== null) return <CaptureView input={captureInputs.find((c) => c.id === captureId)} cameras={cameras} now={now} />
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
			case 'guide':
				return (
					<Centered>
						<EmbedMessage
							name={GUIDE.name}
							pane={window.life === undefined ? null : (embedReport(GUIDE.id)?.pane ?? { state: 'idle', url: GUIDE.url })}
							now={now}
							onRetry={() => window.life?.retryEmbed(GUIDE.id)}
						/>
					</Centered>
				)
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
			case 'lookbook':
				return <LookbookView status={arenaStatus} now={now} />
			case 'announcements':
				return <AnnouncementsView status={arenaStatus} now={now} />
			case 'video':
				return spoutBody(tab.feed)
			case 'timer':
				return <TimerView sources={window.life === undefined ? null : timers} />
		}
	}


	/** A Spout or Syphon tab: the picture while the engine shows its sender,
	 *  otherwise why not, in words. Never another sender's picture under this
	 *  tab's name. */
	const spoutBody = (feed: VideoChoice | null | undefined) => {
		const name = feed != null && (feed.kind === 'spout' || feed.kind === 'syphon') ? feed.name : null
		const picture = <VideoView feed={videoFeed} now={now} onSpace={setVideoSpace} />
		if (name === null || videoFeed == null) return picture
		const word = SPOUT_KIND === 'syphon' ? 'Syphon' : 'Spout'
		const restart =
			window.life === undefined ? null : (
				<div className="mt-6 flex justify-center">
					<Button size="sm" icon={RotateCw} onClick={() => window.life?.restartVideo()}>
						Restart video
					</Button>
				</div>
			)
		if (!videoFeed.senders.includes(name)) {
			return (
				<Centered>
					<Say icon={MonitorPlay} head={`“${shortSender(name)}” is not being sent`} body={`It is not among this computer's ${word} senders now. It shows here when it is sent again; the feed button above picks another.`}>
						{restart}
					</Say>
				</Centered>
			)
		}
		if (videoFeed.showing !== name) {
			// Asked for by this tab alone: it is on its way (the effect above).
			if (spoutWanted.length <= 1) {
				return (
					<Centered>
						<Say icon={MonitorPlay} head={`Opening “${shortSender(name)}”`} body="A moment." />
					</Centered>
				)
			}
			return (
				<Centered>
					<Say
						icon={MonitorPlay}
						head={`One ${word} picture at a time`}
						body={`“${shortSender(videoFeed.showing ?? '')}” is showing in another tab. This tab shows “${shortSender(name)}”.`}
					>
						<div className="mt-6 flex justify-center">
							<Button icon={MonitorPlay} onClick={() => window.life?.chooseVideo(name)}>
								Show “{shortSender(name)}” here
							</Button>
						</div>
					</Say>
				</Centered>
			)
		}
		return picture
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
		<OperatorContext.Provider value={mode === 'operator'}>
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
					onEnter={() => void askAdmin()}
					asking={sheet === 'passcode'}
					onLeave={leave}
					connectionsOpen={connectionsOpen}
					testing={testing}
					onMark={() =>
						window.life?.mark(
							`${mode === 'operator' ? 'admin' : 'volunteer'}${show ? ', show mode' : ''}; layout ${layoutName === null ? 'unsaved' : `"${layoutName}"`}; showing ${viewsShown(layout, visible).map(label).join(', ') || 'nothing'}`,
						) ?? Promise.resolve(null)
					}
					layoutName={layoutName}
					layoutsOpen={layoutsOpen}
					onLayouts={() => {
						setSheet(null)
						setEditing(false)
						if (layoutsOpen) setLayoutsOpen(false)
						else openLayouts()
					}}
					onConnections={() => toggleSheet('connections')}
					settingsOpen={settingsOpen}
					onSettings={() => (settingsOpen ? setSheet(null) : openSettings(null))}
					onShowfile={openShowfile}
					rows={connections}
					showfile={showfile}
					timers={timers}
					hidden={barHidden}
					collapsed={barCollapsed}
					onCollapse={collapseBar}
					updates={updates}
					onUpdates={() => (mode === 'operator' ? openSettings('computer') : void askAdmin())}
					show={show}
					onShow={enterShow}
					onLeaveShow={() => void leaveShow()}
					showLocked={showLocked}
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
					<div className="relative flex h-16 shrink-0 animate-rise items-center gap-4 bg-accent px-5 text-accent-ink">
						<span className="text-lg font-extrabold tracking-tight whitespace-nowrap">Editing the layout</span>
						<span className={`min-w-0 truncate text-sm ${noRoom ? 'font-bold text-warn' : 'text-accent-ink/80'}`}>
							{noRoom
								? 'No room for another window. Make one smaller first.'
								: 'Drag a window to move it, an edge or corner to resize, a tab to reorder it or move it to another window. + adds a tab, × takes one away, ✎ names one.'}
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
					{connectionsOpen ? (
						<ConnectionsPanel
							rows={connections}
							operator={mode === 'operator' && !show}
							showfile={consoleOn ? showfile : null}
							showfileFailure={failureOf(sources.showfile)}
							onShowfile={openShowfile}
							onOpen={(id) => openSettings(id)}
							onClose={() => setSheet(null)}
						/>
					) : settingsOpen && mode === 'operator' && !show ? (
						<SettingsPanel
							rows={connections}
							start={settingsStart}
							paneSummary={paneSummary(pane, mode)}
							desk={desk}
							now={now}
							onChanged={readOff}
							onClose={() => setSheet(null)}
							barHidden={barHidden}
							onBarHidden={setBarHidden}
							testing={testing}
							onTesting={setTesting}
							updates={updates}
							arena={arenaStatus?.lastOk?.value ?? null}
						/>
					) : sheet === 'passcode' && (mode === 'volunteer' || leavingShow) ? (
						<PasscodeSheet
							now={now}
							leaving={leavingShow}
							onUnlocked={leavingShow ? outOfShow : enter}
							onClose={() => {
								setSheet(null)
								setLeavingShow(false)
							}}
						/>
					) : showfileOpen ? (
						<ShowfileSheet
							showfile={showfile}
							linkLive={sources.link.state === 'live'}
							operator={mode === 'operator' && !show}
							campus={campus}
							now={now}
							onClose={() => setSheet(null)}
						/>
					) : (
						<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
							<Grid
								layout={layout}
								editing={editing}
								bare={show}
								visible={visible}
								labelOf={label}
								nameOf={nameOf}
								offer={offer}
								body={bodyOf}
								boxRef={(_win, tab) =>
									isNative(tab.view) && !editing && homeOf(layout, tab.view, visible) === tab.id ? boxRefOf(tab.view) : undefined
								}
								actions={actionsOf}
								onSelect={(w, t) => update((l) => selectTab(l, w, t))}
								onEdit={startEditing}
								onAddTab={(w, v) => update((l) => addTab(l, w, v, freshId(l, 't')))}
								onRemoveTab={(w, t) => update((l) => removeTab(l, w, t))}
								onRenameTab={(w, t, name) => update((l) => renameTab(l, w, t, name))}
								onMoveTab={(from, t, to, before) => update((l) => moveTab(l, from, t, to, before))}
								onRemoveWindow={(w) => update((l) => removeWindow(l, w))}
								onPlace={(w, box) => update((l) => placeWindow(l, w, box))}
								fresh={fresh}
								onResize={(l) => update(() => l)}
								onSeamStart={startSeam}
								onSeamEnd={endSeam}
							/>
							{layoutsOpen && (
								<>
									{/* A tap outside the dropdown closes it. */}
									<button
										type="button"
										aria-label="Close Layouts"
										onClick={() => setLayoutsOpen(false)}
										className="absolute inset-0 z-20 cursor-default bg-black/30"
									/>
									<LayoutsPanel
										layout={layout}
										saved={saved}
										onSwitch={(l) => update(() => l)}
										onSaved={setSaved}
										nameOf={nameOf}
										onClose={() => setLayoutsOpen(false)}
									/>
								</>
							)}
						</div>
					)}
				</main>
			</div>
		</OperatorContext.Provider>
	)
}
