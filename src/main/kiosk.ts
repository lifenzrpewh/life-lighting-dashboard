// The kiosk window. Electron main — Node 22, ESM.
//
// WHY THIS EXISTS: this runs unattended, full-screen, on a touchscreen beside a
// live console on a Sunday morning. Nobody is going to alt-tab to a dev console
// and nobody should have to. So: no menu, no chrome, no resize handles, and a
// renderer crash puts the screen back rather than leaving a white rectangle in
// the booth.
//
// THE RULE THIS FILE ENFORCES: the renderer gets no Node. `contextIsolation` on,
// `nodeIntegration` off, `sandbox` on, and a preload that exposes a named,
// typed surface and nothing else. A volunteer touchscreen that can reach the
// filesystem is a category of accident we simply decline to have.
//
// ✅ CHANNEL B IS WIRED (2026-09-21). Main binds the reply port and holds live
// executor levels from the desk — see `./bridge/osc-in.ts`.
//
// THE LINK (./bridge/link.ts, ../bridge/ping.ts). Liveness needs a request that
// can go unanswered; channel B is the console talking unprompted, so it can
// prove the console IS there and never that it is not. So when the console has
// been quiet for 15 s, main asks it to echo a token, and three unanswered asks
// in a row make it UNREACHABLE. Anything the console says counts as proof it is
// there, so a console someone is working is never asked at all: every ask is a
// line on its command line. ✅ LIVE against onPC 2.3.2.0, 2026-09-30.
//
// THE SHOWFILE (../bridge/showfile.ts) is read over the same link: LifeBridge's
// `show` verb, on link-up and in quiet gaps once a minute. Main holds what
// the console said; the renderer ages it and renders it in the four states.
//
// THE RUN ORDER is the visuals app itself, embedded (./cue-pane.ts), with its
// own sign-in, cache and offline queue. The dashboard's own read-only run order
// (./backend/) is retired from the screen as of 2026-10-02 and not started;
// it stays in the tree until the embed has run a service.
//
// THE COUNTDOWN (./timers.ts) is OnTime and ProPresenter, asked over HTTP on the
// booth network. Nothing to do with the console: it is never sent there.
//
// ARENA (./arena.ts) is its link, what it plays over its websocket, and its clip
// thumbnails on a scheme of their own (./arena-thumbnails.ts).
//
// THE VIDEO FEED (./video-feed.ts) is Arena's multiview over Spout or Syphon,
// handed to the page as a GPU texture, received only while a page shows it.
//
// POP-OUTS (./popout.ts): any view can leave its slot for a window of its own,
// on top of the kiosk, and comes back when that window closes. A pane takes
// its place only from the window it is in, so the kiosk and a pop-out never
// fight over where the MA goes.

import { app, BrowserWindow, Menu, ipcMain, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Channel, LinkState } from '../shared/reading.js'
import { unread } from '../shared/reading.js'
import type { Showfile } from '../shared/showfile.js'
import type { Mode, PaneRect } from '../shared/ma-pane.js'
import { isLoopback, patchFrom, replyPortOf } from '../shared/settings.js'
import { createMaPane, type MaPane } from './ma-pane.js'
import { createCuePane, type CuePane } from './cue-pane.js'
import { openSettings, type SettingsStore } from './settings.js'
import type { DeskState } from '../shared/desk.js'
import type { TimerSources } from '../shared/timer.js'
import { startChannelB, OSC_PREFIX, type ChannelBHandle } from './bridge/osc-in.js'
import { startLink, type LinkHandle } from './bridge/link.js'
import { startTimers, type TimersHandle } from './timers.js'
import { startArena, type ArenaHandle } from './arena.js'
import type { ArenaCommandResult, ArenaSource, ArenaStatus } from '../shared/arena.js'
import type { ShowList, ShowWriteResult } from '../shared/showfile-write.js'
import { registerThumbnailScheme, serveThumbnails } from './arena-thumbnails.js'
import { lookbookItems, lookbookServices } from './lookbook.js'
import type { LookbookItem, LookbookRead, LookbookService } from '../shared/media-check.js'
import { createPopouts, type Popouts } from './popout.js'
import { startVideoFeed, type VideoFeed } from './video-feed.js'
import type { VideoFeedState } from '../shared/video-feed.js'
import { VIEWS, type ViewId } from '../shared/layout.js'
import { settleDataDir } from '../bridge/data-dir.js'

// Pāua's data folder, %APPDATA%paua, moved in whole from the name before the
// rename on the first run after it (../bridge/data-dir.ts). Before anything
// else: the single-instance lock, settings and every session live in it.
{
	const { dir, move } = settleDataDir(app.getPath('appData'))
	app.setPath('userData', dir)
	if (move.kind === 'moved') console.log(`[kiosk] moved ${move.entries} entries of the old profile into ${dir}`)
	if (move.kind === 'kept-old') console.log(`[kiosk] could not move the old profile (${move.detail}); still using ${dir}`)
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PRELOAD = path.join(HERE, '../preload/index.cjs')

/** Set by scripts/dev.mjs. Absent in a packaged build, which then loads the
 *  built renderer off disk. */
const DEV_SERVER = process.env['VITE_DEV_SERVER_URL']

let window: BrowserWindow | null = null
let maPane: MaPane | null = null
let cuePane: CuePane | null = null
let popouts: Popouts | null = null
let settings: SettingsStore | null = null
/** The screen's mode, as the renderer last reported it. Main learns it only to
 *  pick the pane's MA user and to keep settings operator-only. It is not a
 *  security boundary: the MA users' own rights are. */
let mode: Mode = 'volunteer'
let channelB: ChannelBHandle | null = null
let consoleLink: LinkHandle | null = null
let timers: TimersHandle | null = null
let arena: ArenaHandle | null = null
let videoFeed: VideoFeed | null = null
const BOOTED_AT = Date.now()

// Must precede ready: Electron fixes scheme privileges at startup.
registerThumbnailScheme()

/** What main knows from channel B before the socket has even bound.
 *
 *  `listening: false` with nothing heard is a different fact from a desk that has
 *  gone quiet, and the two must never render the same. */
const noDesk = (port: number): DeskState => ({
	executors: [],
	lastHeardAt: null,
	packets: 0,
	rejected: 0,
	listening: false,
	port,
})

function createWindow(): void {
	window = new BrowserWindow({
		fullscreen: !DEV_SERVER,
		width: 1920,
		height: 1080,
		backgroundColor: '#0a0a0b',
		// The screen is dark and lives in a dark booth; a white flash between
		// window-create and first paint is genuinely blinding at 9am in a dim room.
		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			preload: PRELOAD,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	})

	window.once('ready-to-show', () => window?.show())

	if (settings !== null) maPane = createMaPane(window, settings)
	cuePane = createCuePane(window)
	popouts = createPopouts({
		kiosk: window,
		panes: { ...(maPane === null ? {} : { ma: maPane }), cue: cuePane },
		load: loadPage,
		preload: PRELOAD,
		placesFile: path.join(app.getPath('userData'), 'popouts.json'),
	})
	// A reloaded renderer boots into volunteer mode, with every view in its
	// slot. Without this, a crash-and-reload would leave the pane logged in as
	// the operator under a fresh volunteer screen, until the renderer got round
	// to saying otherwise.
	window.webContents.on('did-start-loading', () => {
		popouts?.closeAll()
		// The page's own cleanup does not run on a reload, so it would stay
		// listed as watching and the feed would keep sending to nobody.
		if (window !== null) videoFeed?.watch(window.webContents, false)
		mode = 'volunteer'
		maPane?.release()
	})

	// A renderer crash mid-service must not leave a dead rectangle in the booth.
	// Reload rather than quit: the operator's fallback is the console 30 cm away,
	// but only if this screen gets out of the way by coming back.
	window.webContents.on('render-process-gone', (_event, details) => {
		console.error(`[kiosk] renderer gone: ${details.reason}. Reloading.`)
		window?.reload()
	})

	// The page never opens a window or navigates away. The only other windows
	// are pop-outs, and main opens those (./popout.ts).
	window.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url)
		return { action: 'deny' }
	})

	loadPage(window, null)
}

/** The renderer's page: the kiosk's, or a pop-out's for `view`. */
function loadPage(win: BrowserWindow, view: ViewId | null): void {
	const query: Record<string, string> = view === null ? {} : { popout: view }
	if (DEV_SERVER) void win.loadURL(view === null ? DEV_SERVER : `${DEV_SERVER}?${new URLSearchParams(query)}`)
	else void win.loadFile(path.join(HERE, '../../renderer/index.html'), { query })
}

/** The console link, as main currently knows it: the ping round trip, or
 *  unreachable since boot before the link has even started. */
function linkState(): LinkState {
	return consoleLink?.link() ?? { state: 'unreachable', since: BOOTED_AT }
}

/** What the console has said about its showfile: nothing, before the link has
 *  even started. */
function showfileState(): Channel<Showfile> {
	return consoleLink?.showfile() ?? unread<Showfile>()
}

/** The OSC settings the sockets were last started with, to tell whether a
 *  settings change needs them restarted. */
let oscKey = ''

/** Start (or restart) both OSC halves from settings as they are now: the reply
 *  socket for channels B and C, and the pinger on channel A. */
function startOsc(store: SettingsStore): void {
	const s = store.current()
	const replyPort = replyPortOf(s)
	const key = JSON.stringify([s.consoleHost, s.oscPort, replyPort])
	if (key === oscKey) return
	oscKey = key

	stopOsc()
	// Logged once per distinct fault. A console with no route answers every
	// ping with the same error, and a line a second would bury everything else.
	let lastSendError = ''
	consoleLink = startLink({
		host: s.consoleHost,
		port: s.oscPort,
		prefix: OSC_PREFIX,
		session: randomBytes(4).toString('hex'),
		onSendError: (detail) => {
			if (detail !== lastSendError) console.error(`[kiosk] channel A: ${detail}`)
			lastSendError = detail
		},
		onChange: (link) =>
			console.log(link.state === 'live' ? `[kiosk] console link live, ${link.roundTripMs.toFixed(0)} ms` : '[kiosk] console link unreachable'),
		onShowfile: (r) => {
			if (r.ok) {
				const { name, base, baseFrom, onBase, version } = r.value
				const against = baseFrom === 'default' ? `SaveGuard's default "${base}"` : `"${base}"`
				console.log(`[kiosk] showfile "${name}"${onBase ? ' ON BASE SHOW' : ''} (base ${against}, MA ${version})`)
			} else if (r.reason === 'timeout') {
				console.error('[kiosk] showfile: LifeBridge did not answer `show`. Is it imported on the console?')
			} else {
				console.error(`[kiosk] showfile: ${r.detail}`)
			}
		},
	})
	// onPC on this computer holds the reply port on every address, so listen on
	// loopback exactly, beside it (./bridge/osc-in.ts, at the bind).
	const beside = s.consoleHost !== null && isLoopback(s.consoleHost) ? '127.0.0.1' : undefined
	channelB = startChannelB({
		port: replyPort,
		beside,
		onMessage: (message) => consoleLink?.offer(message),
		onBindError: (error) => {
			console.error(`[kiosk] could not listen on ${replyPort}: ${error.message}`)
			if (error.code === 'EADDRINUSE') {
				console.error('[kiosk]   Something on this computer holds that port, usually grandMA3 onPC.')
				console.error('[kiosk]   Commands still go out; nothing can come back, so the link stays unreachable.')
				console.error('[kiosk]   If onPC is on this computer, set the console address to 127.0.0.1.')
			}
		},
	})
}

/** The timer settings the pollers were last started with. */
let timersKey = ''

function startTimerPolls(store: SettingsStore): void {
	const s = store.current()
	const key = JSON.stringify([s.onTimeHost, s.onTimePort, s.proPresenterHost, s.proPresenterPort])
	if (key === timersKey) return
	timersKey = key
	timers?.stop()
	timers = startTimers(s)
}

/** The Arena settings its poller was last started with. */
let arenaKey = ''

function startArenaPoll(store: SettingsStore): void {
	const s = store.current()
	const key = JSON.stringify([s.arenaHost, s.arenaPort])
	if (key === arenaKey) return
	arenaKey = key
	arena?.stop()
	arena = startArena(s)
}

function stopOsc(): void {
	consoleLink?.stop()
	consoleLink = null
	channelB?.stop()
	channelB = null
}

/** A rect off the IPC boundary, or null (hidden) if it is not one. */
function asRect(v: unknown): PaneRect | null {
	if (typeof v !== 'object' || v === null) return null
	const { x, y, width, height } = v as Record<string, unknown>
	const nums = [x, y, width, height]
	if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
	return { x: x as number, y: y as number, width: width as number, height: height as number }
}

// One kiosk per computer. A second would fight the first for the reply port and
// for one of the console's two web remote slots, and lose both quietly: a
// startup shortcut that fires twice must not cost the booth its MA pane.
const primary = app.requestSingleInstanceLock()
if (!primary) app.quit()
app.on('second-instance', () => {
	if (window === null) return
	if (window.isMinimized()) window.restore()
	window.focus()
})

app.whenReady().then(() => {
	// Quitting is not immediate, and binding ports on the way out is the fight
	// the lock exists to prevent.
	if (!primary) return
	// Boots into volunteer mode, always (docs/PLAN.md, Mode switching). There is
	// no menu bar to elevate from and no remembered mode across a restart.
	// macOS keeps Quit alone: with no menu at all, Cmd+Q does nothing and a
	// full-screen kiosk has no way out. Windows closes on Alt+F4 without one.
	Menu.setApplicationMenu(
		process.platform === 'darwin' ? Menu.buildFromTemplate([{ label: app.name, submenu: [{ role: 'quit' }] }]) : null,
	)

	settings = openSettings()
	const store = settings

	ipcMain.handle('link:state', () => linkState())
	ipcMain.handle('desk:state', () => channelB?.deskState() ?? noDesk(replyPortOf(store.current())))
	ipcMain.handle('showfile:state', () => showfileState())
	ipcMain.handle('arena:state', (): ArenaSource => arena?.source() ?? null)
	ipcMain.handle('arena:status', (): Channel<ArenaStatus> | null => arena?.status() ?? null)
	// The showfile's write half (docs/PLAN.md Phase 3): operator mode only, from
	// the kiosk only, and the link checks it is live before anything is sent.
	// Each is logged, so the booth log says who saved or loaded what, and when.
	const operatorOnly = (e: IpcMainInvokeEvent): string | null =>
		!fromKiosk(e) ? 'Not from the kiosk.' : mode !== 'operator' ? 'Operator mode only.' : null
	ipcMain.handle('showfile:shows', (e): Promise<ShowList> | ShowList => {
		const why = operatorOnly(e)
		if (why !== null) return { ok: false, detail: why }
		return consoleLink?.listShows() ?? { ok: false, detail: 'No console is set up.' }
	})
	ipcMain.handle('showfile:save-as', (e, name: unknown): ShowWriteResult => {
		const why = operatorOnly(e) ?? (typeof name === 'string' ? null : 'No name.')
		if (why !== null || typeof name !== 'string') return { ok: false, detail: why ?? 'No name.' }
		const r = consoleLink?.saveAs(name) ?? { ok: false, detail: 'No console is set up.' }
		console.log(`[showfile] Save As "${name}": ${r.ok ? 'sent' : r.detail}`)
		return r
	})
	ipcMain.handle('showfile:load', (e, name: unknown, saveFirst: unknown): ShowWriteResult => {
		const why = operatorOnly(e) ?? (typeof name === 'string' && typeof saveFirst === 'boolean' ? null : 'Not a load.')
		if (why !== null || typeof name !== 'string' || typeof saveFirst !== 'boolean') return { ok: false, detail: why ?? 'Not a load.' }
		const r = consoleLink?.load(name, saveFirst) ?? { ok: false, detail: 'No console is set up.' }
		console.log(`[showfile] Load "${name}" ${saveFirst ? 'saving the current show first' : 'without saving'}: ${r.ok ? 'sent' : r.detail}`)
		return r
	})
	// The Clips view firing. Everyone may (the owner, 2026-10-03); what is sent
	// is checked in main against the composition, never taken from the page.
	ipcMain.handle('arena:command', (e, raw: unknown): Promise<ArenaCommandResult> | ArenaCommandResult =>
		fromOurs(e) ? (arena?.command(raw) ?? { ok: false, detail: 'no Arena is set up' }) : { ok: false, detail: 'not from this app' },
	)
	// The media check's reads (./lookbook.ts): asked on demand, never polled.
	ipcMain.handle('lookbook:services', (e): Promise<LookbookRead<LookbookService[]>> | LookbookRead<LookbookService[]> =>
		fromOurs(e) ? lookbookServices() : { ok: false, detail: 'not from this app', at: Date.now() },
	)
	ipcMain.handle('lookbook:items', (e, id: unknown): Promise<LookbookRead<LookbookItem[]>> | LookbookRead<LookbookItem[]> =>
		fromOurs(e) ? lookbookItems(id) : { ok: false, detail: 'not from this app', at: Date.now() },
	)
	serveThumbnails(() => {
		const s = store.current()
		return s.arenaHost === null ? null : { host: s.arenaHost, port: s.arenaPort }
	})
	ipcMain.handle('timers:state', (): TimerSources => ({
		...(timers?.sources() ?? { ontime: null, propresenter: null }),
		proPresenterTimer: store.current().proPresenterTimer,
	}))

	// Started before the window exists, so the first thing the renderer asks for
	// already has whatever the desk has said in the meantime.
	startOsc(store)
	store.onChange(() => startOsc(store))
	startTimerPolls(store)
	store.onChange(() => startTimerPolls(store))
	startArenaPoll(store)
	store.onChange(() => startArenaPoll(store))

	// Only the kiosk's own renderer may change the mode, settings or the layout.
	// The panes' pages have no preload and so no way to send, but the check
	// costs nothing.
	const fromKiosk = (e: IpcMainEvent | IpcMainInvokeEvent) => e.sender === window?.webContents
	// The kiosk or a pop-out: our own pages, which may read the panes.
	const fromOurs = (e: IpcMainEvent | IpcMainInvokeEvent) => fromKiosk(e) || popouts?.isPopout(e.sender) === true
	// Only the window a pane is in may place it or reload it. While the MA is
	// popped out, whatever the kiosk says about where it goes is not about it.
	const fromHost = (e: IpcMainEvent | IpcMainInvokeEvent, pane: MaPane | CuePane | null) =>
		pane !== null && !pane.host().isDestroyed() && e.sender === pane.host().webContents
	ipcMain.handle('ma-pane:report', (e) => (fromOurs(e) ? maPane?.report() : undefined))
	ipcMain.on('ma-pane:place', (e, rect: unknown) => {
		if (fromHost(e, maPane)) maPane?.place(rect === null ? null : asRect(rect))
	})
	ipcMain.on('ma-pane:release', (e) => fromKiosk(e) && maPane?.release())
	ipcMain.on('ma-pane:retry', (e) => fromHost(e, maPane) && maPane?.retry())
	ipcMain.on('ma-pane:mode', (e, next: unknown) => {
		if (!fromKiosk(e) || (next !== 'volunteer' && next !== 'operator')) return
		mode = next
		maPane?.setMode(next)
	})

	// The Cue Manager is the same for every mode: the booth device's rights,
	// held by the app's own backend, are what it may do. Clearing its sign-in
	// is operator business.
	ipcMain.handle('cue-pane:report', (e) => (fromOurs(e) ? cuePane?.report() : undefined))
	ipcMain.on('cue-pane:place', (e, rect: unknown) => {
		if (fromHost(e, cuePane)) cuePane?.place(rect === null ? null : asRect(rect))
	})
	ipcMain.on('cue-pane:retry', (e) => fromHost(e, cuePane) && cuePane?.retry())
	// Pictures of the panes in the kiosk, to stand in for them while the
	// divider is dragged. A popped-out pane is not under the divider.
	ipcMain.handle('panes:snapshot', async (e) => {
		if (!fromKiosk(e)) return { ma: null, cue: null }
		const inKiosk = (p: MaPane | CuePane | null) => (p !== null && p.host() === window ? p.snapshot() : null)
		const [ma, cue] = await Promise.all([inKiosk(maPane), inKiosk(cuePane)])
		return { ma, cue }
	})

	// The video feed. A page says when it shows the feed, and gets frames
	// while it does; which sender it shows is a pick from what the machine has.
	videoFeed = startVideoFeed()
	ipcMain.handle('video:state', (e): VideoFeedState | null => (fromOurs(e) ? (videoFeed?.state() ?? null) : null))
	ipcMain.on('video:watch', (e, on: unknown) => {
		if (fromOurs(e) && typeof on === 'boolean') videoFeed?.watch(e.sender, on)
	})
	ipcMain.on('video:choose', (e, name: unknown) => {
		if (fromOurs(e) && typeof name === 'string') videoFeed?.choose(name)
	})

	// Pop-outs. The kiosk opens them; the kiosk or the pop-out itself closes one.
	const asView = (v: unknown): ViewId | null => ((VIEWS as readonly unknown[]).includes(v) ? (v as ViewId) : null)
	ipcMain.handle('popout:state', (e) => (fromOurs(e) ? (popouts?.popped() ?? []) : []))
	ipcMain.on('popout:open', (e, v: unknown) => {
		const view = asView(v)
		if (fromKiosk(e) && view !== null) popouts?.open(view)
	})
	ipcMain.on('popout:fit', (e, v: unknown, picture: unknown, space: unknown) => {
		const view = asView(v)
		const size = (s: unknown) => {
			const r = s as { width?: unknown; height?: unknown } | null
			return r !== null && typeof r === 'object' && typeof r.width === 'number' && typeof r.height === 'number' && r.width > 0 && r.height > 0
				? { width: r.width, height: r.height }
				: null
		}
		const p = size(picture)
		const s = size(space)
		if (view !== null && p !== null && s !== null && popouts?.isPopout(e.sender, view) === true) popouts.fit(view, p, s)
	})
	ipcMain.on('popout:close', (e, v: unknown) => {
		const view = asView(v)
		if (view !== null && (fromKiosk(e) || popouts?.isPopout(e.sender, view) === true)) popouts?.close(view)
	})
	ipcMain.handle('cue-pane:reset', async (e) => {
		if (!fromKiosk(e) || mode !== 'operator') return false
		await cuePane?.reset()
		return true
	})

	ipcMain.handle('settings:get', (e) => (fromKiosk(e) ? settings?.view() : undefined))
	ipcMain.handle('settings:save', (e, raw: unknown) => {
		if (!fromKiosk(e) || settings === null) return undefined
		if (mode !== 'operator') return { ok: false, errors: { form: 'Settings can be changed in operator mode only.' } }
		const patch = patchFrom(raw)
		if (patch === null) return { ok: false, errors: { form: 'Those settings could not be read.' } }
		const checked = settings.save(patch)
		// The renderer is told whether it worked, never handed the settings back:
		// it asks for the view again, which carries no passwords.
		return checked.ok ? { ok: true } : checked
	})

	createWindow()

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})

// Release the OSC port explicitly. A socket left bound by a half-exited process
// is the kind of thing that makes the NEXT launch look like a dead desk, and
// nobody debugging that at 8:50 on a Sunday would suspect the previous run.
app.on('will-quit', () => {
	stopOsc()
	timers?.stop()
	arena?.stop()
	videoFeed?.stop()
})
