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
// EMBEDS (./embeds.ts): web pages added in Connections, each a view with its
// own sign-in, placed like the MA and the run order.
//
// POP-OUTS (./popout.ts): any view can leave its slot for a window of its own,
// on top of the kiosk, and comes back when that window closes. A pane takes
// its place only from the window it is in, so the kiosk and a pop-out never
// fight over where the MA goes.

import { app, BrowserWindow, Menu, dialog, ipcMain, powerSaveBlocker, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Channel, LinkState } from '../shared/reading.js'
import { unread } from '../shared/reading.js'
import type { Showfile } from '../shared/showfile.js'
import type { Mode, PaneRect } from '../shared/ma-pane.js'
import { applyPatch, changedFields, fromDisk, isLoopback, patchFrom, replyPortOf, type SettingsPatch } from '../shared/settings.js'
import { COMPUTER_FILE_MAX, COMPUTER_LOCAL, computerFile, computerFileFrom, computerLocalFrom } from '../shared/computer-file.js'
import { createMaPane, type MaPane } from './ma-pane.js'
import { createCuePane, type CuePane } from './cue-pane.js'
import { openSettings, type SettingsStore } from './settings.js'
import type { DeskState } from '../shared/desk.js'
import type { TimerSources } from '../shared/timer.js'
import { localAddresses, startChannelB, OSC_PREFIX, type ChannelBHandle } from './bridge/osc-in.js'
import { startLink, type LinkHandle } from './bridge/link.js'
import { startTimers, type TimersHandle } from './timers.js'
import { startArena, type ArenaHandle } from './arena.js'
import { getJson } from './http-poll.js'
import { decodeArenaProduct } from '../bridge/arena.js'
import type { ArenaCommandResult, ArenaSource, ArenaStatus } from '../shared/arena.js'
import { arenaVersion } from '../shared/arena.js'
import type { ShowList, ShowWriteResult } from '../shared/showfile-write.js'
import { registerThumbnailScheme, serveLookbookThumbnails, serveThumbnails } from './arena-thumbnails.js'
import { lookbookFileSize, lookbookFileUrl, lookbookItems, lookbookServiceForPlan, lookbookServices } from './lookbook.js'
import type { FileSizes, LookbookItem, LookbookRead, LookbookService } from '../shared/media-check.js'
import { createPopouts, type Popouts } from './popout.js'
import { lockPage, openInBrowser, reloadOnCrash } from './page-lock.js'
import { createMediaFetch } from './media-fetch.js'
import { createMediaSame } from './media-same.js'
import { sameMarkFrom } from '../shared/media-check.js'
import { presetFromFile } from '../shared/holding-map.js'
import { LIBRARY_FILE, fetchRequestFrom, isFolderPath, libraryCodeIs, runRequestFrom, type DriveMatches, type FetchRequest, type FetchRun, type FetchStates, type MediaSource } from '../shared/media-fetch.js'
import { startVideoFeed, type VideoFeed } from './video-feed.js'
import type { VideoFeedState } from '../shared/video-feed.js'
import { isViewId, viewLabel, type ViewId } from '../shared/layout.js'
import { createEmbeds, type EmbedPane, type Embeds } from './embeds.js'
import { embedIdOf, isEmbedId, type EmbedReport } from '../shared/embeds.js'
import { GUIDE } from '../shared/guide.js'
import { createNdi, type Ndi } from './ndi.js'
import { isNdiId, ndiIdOf, type NdiState } from '../shared/ndi.js'
import { captureIdOf, isCaptureId, type CaptureInput } from '../shared/capture.js'
import { settleDataDir } from '../bridge/data-dir.js'
import { logPage, startLog } from './log.js'
import type { About } from '../shared/about.js'
import type { UpdateState } from '../shared/updates.js'
import { startUpdates, type Updates } from './updates.js'
import { copyAnnouncements, readAnnouncements, writeAnnouncements } from './announcements.js'
import { SESSIONS, isTCode, type AnnouncementsRead, type CopyOutcome, type Section, type Session, type WriteResult } from '../shared/announcements.js'
import { NO_LOCKOUT, lockoutWait, tryUnlock, type AdminState, type Lockout, type UnlockResult } from '../shared/admin.js'

// Pāua's data folder, %APPDATA%paua, moved in whole from the name before the
// rename on the first run after it (../bridge/data-dir.ts). Before anything
// else: the single-instance lock, settings, every session and the log live in it.
let logPath = ''
{
	const { dir, move } = settleDataDir(app.getPath('appData'))
	app.setPath('userData', dir)
	// The app's own log (./log.ts), before anything has something to say.
	logPath = startLog(dir).path
	if (move.kind === 'moved') console.log(`[kiosk] moved ${move.entries} entries of the old profile into ${dir}`)
	if (move.kind === 'kept-old') console.log(`[kiosk] could not move the old profile (${move.detail}); still using ${dir}`)
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PRELOAD = path.join(HERE, '../preload/index.cjs')

/** Set by scripts/dev.mjs. Absent in a packaged build, which then loads the
 *  built renderer off disk. */
const DEV_SERVER = process.env['VITE_DEV_SERVER_URL']

/** The pāua shell (build/icon.svg), for the window and the taskbar in a
 *  checkout; an installed app's own icon comes from the installer. */
export const ICON = path.join(HERE, '../../../assets/icon.png')

/** Full screen, unless this is dev or settings ask for a window (testers on a
 *  laptop; the booth stays full screen). */
const fullScreenFor = (windowed: boolean) => !DEV_SERVER && !windowed

/** Tester's marks, counted this run, so the log's marks can be told apart. */
let marks = 0

let window: BrowserWindow | null = null
let maPane: MaPane | null = null
let cuePane: CuePane | null = null
let popouts: Popouts | null = null
let embeds: Embeds | null = null
let settings: SettingsStore | null = null
/** The screen's mode: 'operator' is Admin. Main decides the way in, by the
 *  passcode (`admin:unlock`), and the renderer reports the way out (a tap, or
 *  the idle drop). Main uses it to pick the pane's MA user and to keep
 *  settings and the writes Admin's. The MA users' own rights remain the real
 *  boundary on the console. */
let mode: Mode = 'volunteer'
/** Wrong passcode tries, and the wait they have earned (../shared/admin.ts). */
let lockout: Lockout = NO_LOCKOUT
let channelB: ChannelBHandle | null = null
let consoleLink: LinkHandle | null = null
let timers: TimersHandle | null = null
let arena: ArenaHandle | null = null
let videoFeed: VideoFeed | null = null
let ndi: Ndi | null = null
let updates: Updates | null = null
const BOOTED_AT = Date.now()
type LoginItem = { available: boolean; on: boolean }
/** Where Arena's web server usually is: its default, and 8090, where it moves
 *  when the MA web remote has 8080 on the same computer. */
const ARENA_PORTS = [8080, 8090]

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
		fullscreen: fullScreenFor(settings?.current().windowed ?? false),
		icon: ICON,
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
	logPage(window.webContents, 'page')

	if (settings !== null) maPane = createMaPane(window, settings)
	cuePane = createCuePane(window)
	embeds = createEmbeds(window, app.getPath('userData'))
	if (settings !== null) embeds.sync(settings.current().embeds)
	popouts = createPopouts({
		kiosk: window,
		paneOf,
		labelOf: (view) => viewLabel(view, settings?.current().embeds ?? [], settings?.current().ndiSources ?? [], settings?.current().captureInputs ?? []),
		load: loadPage,
		preload: PRELOAD,
		icon: ICON,
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
		if (window !== null) ndi?.forget(window.webContents)
		mode = 'volunteer'
		maPane?.release()
	})

	// A renderer crash mid-service must not leave a dead rectangle in the booth.
	// Reload rather than quit: the operator's fallback is the console 30 cm away,
	// but only if this screen gets out of the way by coming back.
	reloadOnCrash(window.webContents, 'the kiosk', () => window?.reload())

	// The page never opens a window or navigates away. The only other windows
	// are pop-outs, and main opens those (./popout.ts).
	window.webContents.setWindowOpenHandler(({ url }) => {
		openInBrowser(url)
		return { action: 'deny' }
	})
	lockPage(window.webContents, 'the kiosk')

	loadPage(window, null)
}

/** The page main draws for `view`, if it is one. */
function paneOf(view: ViewId): MaPane | CuePane | EmbedPane | undefined {
	if (view === 'ma') return maPane ?? undefined
	if (view === 'cue') return cuePane ?? undefined
	if (view === 'guide') return embeds?.pane(GUIDE.id)
	const id = embedIdOf(view)
	return id === null ? undefined : embeds?.pane(id)
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
	// No console (not set up, or turned off in Connections): nothing to ask
	// and nobody to listen for. Binding anyway fought onPC for its port and
	// logged a fault about a console nobody uses (seen 2026-10-04).
	if (s.consoleHost === null) {
		console.log('[kiosk] no console in use: not listening for one')
		return
	}
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
	// each of this computer's addresses exactly, beside it: loopback for onPC on
	// loopback, the network card's for onPC in a session (./bridge/osc-in.ts, at
	// the bind). Beside a console elsewhere, the same once the port is found taken.
	const here = localAddresses()
	channelB = startChannelB({
		port: replyPort,
		beside: isLoopback(s.consoleHost) ? here : undefined,
		besideIfTaken: here,
		onBeside: (addresses) =>
			console.log(`[kiosk] port ${replyPort} is taken here (onPC?): listening on ${addresses.join(', ')} beside it`),
		onMessage: (message) => consoleLink?.offer(message),
		onBindError: (error) => {
			console.error(`[kiosk] could not listen on ${replyPort}: ${error.message}`)
			if (error.code === 'EADDRINUSE') {
				console.error('[kiosk]   Something on this computer holds that port, usually grandMA3 onPC.')
				console.error('[kiosk]   Commands still go out; nothing can come back, so the link stays unreachable.')
				console.error('[kiosk]   Something holds it on this computer\'s own addresses too; close it, or change the reply port.')
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

	if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(ICON)
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
		!fromKiosk(e) ? 'Not from the kiosk.' : mode !== 'operator' ? 'Admin only.' : null
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
	ipcMain.handle('lookbook:for-plan', (e, plan: unknown): Promise<LookbookRead<LookbookService | null>> | LookbookRead<LookbookService | null> =>
		fromOurs(e) ? lookbookServiceForPlan(plan) : { ok: false, detail: 'not from this app', at: Date.now() },
	)
	ipcMain.handle('lookbook:items', (e, id: unknown): Promise<LookbookRead<LookbookItem[]>> | LookbookRead<LookbookItem[]> =>
		fromOurs(e) ? lookbookItems(id) : { ok: false, detail: 'not from this app', at: Date.now() },
	)
	// Fetching media the check found wrong (./media-fetch.ts): operator mode
	// only, from the kiosk or a pop-out. The page names a code, a file name
	// and a clip; main finds the file and builds every path.
	const mediaFetch = createMediaFetch({
		folders: () => ({ graphics: store.current().graphicsFolder, local: store.current().localMediaFolder }),
		open: (clipId, file, live) => arena?.open(clipId, file, live) ?? Promise.resolve({ ok: false, detail: 'no Arena is set up' }),
		clipHas: (clipId, file) => {
			const latest = arena?.status()?.latest
			if (latest === null || latest === undefined || !latest.ok) return false
			const slot = latest.value.layers.flatMap((l) => l.slots).find((s) => s.id === clipId)
			const base = (p: string) => p.split(/[\\/]/).at(-1)?.toLowerCase() ?? ''
			return slot !== undefined && slot.file !== null && slot.missingFile === null && base(slot.file) === base(file)
		},
		lookbookSize: lookbookFileSize,
		lookbookUrl: lookbookFileUrl,
	})
	// Where each file would come from, for the confirmation: the drive, or the
	// lookbook (which the operator is then asked about).
	ipcMain.handle('media:sources', async (e, raw: unknown): Promise<Record<string, MediaSource>> => {
		if (!fromOurs(e) || !Array.isArray(raw)) return {}
		const reqs = raw.map(fetchRequestFrom).filter((r): r is FetchRequest => r !== null)
		return mediaFetch.sources(reqs)
	})
	// File sizes for the media check (../shared/media-check.ts, `sameFile`):
	// only files the open composition names, and the lookbook's library files.
	ipcMain.handle('media:sizes', async (e, raw: unknown): Promise<FileSizes> => {
		const out: FileSizes = { arena: {}, lookbook: {} }
		if (!fromOurs(e) || typeof raw !== 'object' || raw === null) return out
		const { arena: wantArena, lookbook: wantLookbook } = raw as Record<string, unknown>
		const known = new Set((arena?.status()?.lastOk?.value.layers ?? []).flatMap((l) => l.slots.map((s) => s.file).filter((f): f is string => f !== null)))
		for (const file of Array.isArray(wantArena) ? wantArena.slice(0, 300) : []) {
			if (typeof file !== 'string' || !known.has(file)) continue
			try {
				const st = await fs.promises.stat(file)
				out.arena[file] = st.size
				;(out.arenaTimes ??= {})[file] = st.mtimeMs
			} catch {
				// Not on this computer: no size, and the check says the file is missing.
			}
		}
		const lookbook = (Array.isArray(wantLookbook) ? wantLookbook.slice(0, 300) : []).filter((p): p is string => typeof p === 'string')
		const sizes = await Promise.all(lookbook.map((p) => lookbookFileSize(p)))
		lookbook.forEach((p, i) => {
			const size = sizes[i]
			if (size !== null && size !== undefined) out.lookbook[p] = size
		})
		return out
	})
	ipcMain.handle('media:fetch', (e, raw: unknown): { ok: true } | { ok: false; detail: string } => {
		if (!fromOurs(e)) return { ok: false, detail: 'not from this app' }
		if (mode !== 'operator') return { ok: false, detail: 'Admin only.' }
		const req = fetchRequestFrom(raw)
		if (req === null) return { ok: false, detail: 'not a fetch' }
		return mediaFetch.ask(req)
	})
	// Clear old FGs (../bridge/arena-control.ts, `emptyWire`): operator mode
	// only. The page names a clip and the code it showed the operator; main
	// checks both against the composition it holds and builds the path.
	ipcMain.handle('media:empty', async (e, clipId: unknown, code: unknown): Promise<ArenaCommandResult> => {
		if (!fromOurs(e)) return { ok: false, detail: 'not from this app' }
		if (mode !== 'operator') return { ok: false, detail: 'Admin only.' }
		if (typeof clipId !== 'number' || typeof code !== 'string' || !/^[A-Z]{2}\d{3}$/.test(code)) return { ok: false, detail: 'not a clip to clear' }
		return arena?.empty(clipId, code) ?? { ok: false, detail: 'no Arena is set up' }
	})
	ipcMain.handle('media:fetch-state', (e): FetchStates => (fromOurs(e) ? mediaFetch.states() : {}))
	// A confirmation's fetches as one run (./media-fetch.ts): its plan and its
	// result in the log, the latest kept for the Holding view's result line.
	ipcMain.handle('media:run', (e, raw: unknown): FetchRun | { ok: false; detail: string } => {
		if (!fromOurs(e)) return { ok: false, detail: 'not from this app' }
		if (mode !== 'operator') return { ok: false, detail: 'Admin only.' }
		const run = runRequestFrom(raw)
		if (run === null) return { ok: false, detail: 'not a run' }
		return mediaFetch.run(run)
	})
	ipcMain.handle('media:last-run', (e): FetchRun | null => (fromOurs(e) ? mediaFetch.lastRun() : null))
	// The graphics drive's files for a code (the owner, 2026-10-13: "show drive
	// matches"): anyone may look; picking one to load is a fetch, Admin's.
	ipcMain.handle('media:drive', async (e, code: unknown, lookbookPath: unknown): Promise<DriveMatches> => {
		if (!fromOurs(e)) return { ok: false, detail: 'not from this app' }
		if (typeof code !== 'string' || !/^[A-Z]{2}\d{3}$/.test(code)) return { ok: false, detail: 'not a code' }
		const lp = typeof lookbookPath === 'string' && LIBRARY_FILE.test(lookbookPath) && libraryCodeIs(lookbookPath, code) ? lookbookPath : null
		return mediaFetch.drive(code, lp)
	})
	// "It's there" (the owner, 2026-10-13): a failed code set aside as in Arena.
	ipcMain.handle('media:there', (e, code: unknown): { ok: true } | { ok: false; detail: string } => {
		if (!fromOurs(e)) return { ok: false, detail: 'not from this app' }
		if (mode !== 'operator') return { ok: false, detail: 'Admin only.' }
		if (typeof code !== 'string' || !/^[A-Z]{2}\d{3}$/.test(code)) return { ok: false, detail: 'not a code' }
		return mediaFetch.there(code)
	})
	// Browse for a folder (the Arena row's two folders): Windows' own picker,
	// over the window that asked. Only the path comes back; Save keeps it.
	// This computer's own addresses, for Settings › Console to say where the
	// console's OSC row must send (the destination is per machine, and a wrong
	// one is the setup fault that cost the most here; CLAUDE.md § Status).
	ipcMain.handle('net:here', (e): string[] => (fromOurs(e) ? localAddresses().filter((a) => a !== '127.0.0.1') : []))
	// Arena on this computer, found rather than typed: its product reply on the
	// ports it is usually moved to. Anything else answering (the MA web remote
	// on 8080) fails the decode and is not offered.
	ipcMain.handle('arena:find', async (e): Promise<{ host: string; port: number; version: string } | null> => {
		if (operatorOnly(e) !== null) return null
		for (const port of ARENA_PORTS) {
			const r = await getJson(`http://127.0.0.1:${port}/api/v1/product`, 1_000)
			if (!r.ok) continue
			const d = decodeArenaProduct(r.body)
			if (d.ok) return { host: '127.0.0.1', port, version: arenaVersion(d.value) }
		}
		return null
	})
	// Start at login (the owner, 2026-10-13): the installed app only, which
	// registers Paua.exe itself, so a login starts the watchdog with it
	// (./entry.ts). A checkout keeps scripts/windows/install-startup.cmd. What
	// the screen shows is read back from the system after each set, not taken
	// on trust: a managed machine may refuse it.
	const loginItem = (): LoginItem => ({ available: app.isPackaged, on: app.isPackaged && app.getLoginItemSettings().openAtLogin })
	ipcMain.handle('login:get', (e): LoginItem | null => (fromKiosk(e) ? loginItem() : null))
	ipcMain.handle('login:set', (e, on: unknown): LoginItem | null => {
		if (operatorOnly(e) !== null || typeof on !== 'boolean' || !app.isPackaged) return null
		app.setLoginItemSettings({ openAtLogin: on })
		const now = loginItem()
		console.log(`[kiosk] start at login ${on ? 'on' : 'off'} asked; the system says ${now.on ? 'on' : 'off'}`)
		return now
	})
	ipcMain.handle('folder:choose', async (e, start: unknown): Promise<string | null> => {
		if (operatorOnly(e) !== null) return null
		const owner = BrowserWindow.fromWebContents(e.sender)
		const opts = {
			title: 'Choose a folder',
			properties: ['openDirectory' as const, 'dontAddToRecent' as const],
			...(typeof start === 'string' && isFolderPath(start) ? { defaultPath: start } : {}),
		}
		const r = owner === null ? await dialog.showOpenDialog(opts) : await dialog.showOpenDialog(owner, opts)
		return r.canceled ? null : (r.filePaths[0] ?? null)
	})
	// This computer's setup to or from one file (../shared/computer-file.ts):
	// Admin only. Reading a file says what it would change and holds it; only
	// Apply changes anything. The page's stored items go back to the page,
	// which writes them and starts again.
	let pendingSetup: { patch: SettingsPatch; local: Record<string, string> } | null = null
	ipcMain.handle('computer:export', async (e, rawLocal: unknown): Promise<{ ok: true; path: string } | { ok: false; detail: string } | null> => {
		if (operatorOnly(e) !== null || settings === null) return null
		const local = computerLocalFrom(rawLocal)
		if (local === null) return { ok: false, detail: 'This page’s stored setup could not be read.' }
		const file = computerFile(app.getVersion(), { ...fromDisk(settings.view()) }, local, new Date())
		const owner = BrowserWindow.fromWebContents(e.sender)
		const name = (settings.view().campus ?? 'Booth').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim() || 'Booth'
		const opts = { title: 'Save this computer’s setup', defaultPath: `${name}.paua-setup.json`, filters: [{ name: 'Pāua setup', extensions: ['json'] }] }
		const r = owner === null ? await dialog.showSaveDialog(opts) : await dialog.showSaveDialog(owner, opts)
		if (r.canceled || r.filePath === undefined) return null
		try {
			await fs.promises.writeFile(r.filePath, JSON.stringify(file, null, '\t'), 'utf8')
		} catch (err) {
			return { ok: false, detail: `Could not write the file: ${String(err)}` }
		}
		console.log(`[settings] this computer's setup saved to ${r.filePath}`)
		return { ok: true, path: r.filePath }
	})
	ipcMain.handle(
		'computer:read',
		async (e): Promise<{ ok: true; from: string; settings: string[]; local: string[] } | { ok: false; detail: string } | null> => {
			if (operatorOnly(e) !== null || settings === null) return null
			pendingSetup = null
			const owner = BrowserWindow.fromWebContents(e.sender)
			const opts = { title: 'Open a Pāua setup', properties: ['openFile' as const], filters: [{ name: 'Pāua setup', extensions: ['json'] }] }
			const r = owner === null ? await dialog.showOpenDialog(opts) : await dialog.showOpenDialog(owner, opts)
			const path_ = r.canceled ? undefined : r.filePaths[0]
			if (path_ === undefined) return null
			const stat = await fs.promises.stat(path_)
			if (stat.size > COMPUTER_FILE_MAX) return { ok: false, detail: 'That file is far too big to be a Pāua setup file.' }
			const read = computerFileFrom(await fs.promises.readFile(path_, 'utf8'))
			if (!read.ok) return read
			const patch = patchFrom(read.file.settings)
			if (patch === null) return { ok: false, detail: 'That setup file’s settings could not be read.' }
			const before = settings.view()
			const checked = applyPatch(fromDisk(before), patch)
			if (!checked.ok) return { ok: false, detail: `That setup does not check out here: ${Object.values(checked.errors).join(' ')}` }
			pendingSetup = { patch, local: read.file.local }
			return {
				ok: true,
				from: `Pāua ${read.file.app}, ${read.file.exportedAt.slice(0, 16).replace('T', ' ')} UTC`,
				settings: changedFields(fromDisk(before), checked.settings, {}),
				local: Object.keys(read.file.local).map((k) => COMPUTER_LOCAL[k] ?? k),
			}
		},
	)
	ipcMain.handle('computer:apply', (e): { ok: true; local: Record<string, string> } | { ok: false; detail: string } | null => {
		if (operatorOnly(e) !== null || settings === null || pendingSetup === null) return null
		const { patch, local } = pendingSetup
		pendingSetup = null
		const before = settings.view()
		const checked = settings.save(patch)
		if (!checked.ok) return { ok: false, detail: Object.values(checked.errors).join(' ') }
		const changed = changedFields(before, checked.settings, patch)
		console.log(`[settings] set up from a file: ${changed.join('; ') || 'no settings changed'}; stored: ${Object.keys(local).join(', ') || 'none'}`)
		return { ok: true, local }
	})
	// A Holding preset to or from a file (../shared/holding-map.ts), to carry
	// one campus's map to another computer. Admin only. Main only checks it is
	// a preset; the page checks the map inside it whole before taking it.
	ipcMain.handle('holding:export', async (e, name: unknown, text: unknown): Promise<boolean> => {
		if (operatorOnly(e) !== null || typeof name !== 'string' || typeof text !== 'string' || text.length > 256_000) return false
		const parsed = presetFromFile(text)
		if (!parsed.ok) return false
		const owner = BrowserWindow.fromWebContents(e.sender)
		const safe = parsed.preset.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim() || 'Holding'
		const opts = { title: 'Save the Holding preset', defaultPath: `${safe}.paua-holding.json`, filters: [{ name: 'Pāua Holding preset', extensions: ['json'] }] }
		const r = owner === null ? await dialog.showSaveDialog(opts) : await dialog.showSaveDialog(owner, opts)
		if (r.canceled || r.filePath === undefined) return false
		await fs.promises.writeFile(r.filePath, text, 'utf8')
		console.log(`[holding] preset "${parsed.preset.name}" saved to ${r.filePath}`)
		return true
	})
	ipcMain.handle('holding:import', async (e): Promise<string | null> => {
		if (operatorOnly(e) !== null) return null
		const owner = BrowserWindow.fromWebContents(e.sender)
		const opts = { title: 'Open a Holding preset', properties: ['openFile' as const], filters: [{ name: 'Pāua Holding preset', extensions: ['json'] }] }
		const r = owner === null ? await dialog.showOpenDialog(opts) : await dialog.showOpenDialog(owner, opts)
		const file = r.canceled ? undefined : r.filePaths[0]
		if (file === undefined) return null
		const stat = await fs.promises.stat(file)
		if (stat.size > 256_000) return ''
		return fs.promises.readFile(file, 'utf8')
	})
	// "It is the same file", for a name that may differ (./media-same.ts):
	// everyone sees the marks, operator mode makes and undoes them.
	const mediaSame = createMediaSame(app.getPath('userData'))
	ipcMain.handle('media:same', (e): string[] => (fromOurs(e) ? mediaSame.marks() : []))
	ipcMain.handle('media:mark-same', (e, raw: unknown): { ok: true } | { ok: false; detail: string } => {
		if (!fromOurs(e)) return { ok: false, detail: 'not from this app' }
		if (mode !== 'operator') return { ok: false, detail: 'Admin only.' }
		const m = sameMarkFrom(raw)
		return m === null ? { ok: false, detail: 'not a mark' } : mediaSame.mark(m)
	})
	serveLookbookThumbnails()
	serveThumbnails(() => {
		const s = store.current()
		return s.arenaHost === null ? null : { host: s.arenaHost, port: s.arenaPort }
	})
	ipcMain.handle('timers:state', (): TimerSources => ({
		...(timers?.sources() ?? { ontime: null, propresenter: null }),
		proPresenterTimer: store.current().proPresenterTimer,
	}))
	// ProPresenter's announcements (./announcements.ts): the reads are anyone's;
	// the copy into the folder and the playlist write are Admin's.
	const isSession = (v: unknown): v is Session => (SESSIONS as readonly unknown[]).includes(v)
	ipcMain.handle('announcements:read', async (e, session: unknown): Promise<AnnouncementsRead | undefined> =>
		fromOurs(e) && isSession(session) ? readAnnouncements(store.current(), session) : undefined,
	)
	ipcMain.handle(
		'announcements:copy',
		async (e, codes: unknown): Promise<{ ok: true; outcomes: CopyOutcome[]; setAside: string[] } | { ok: false; detail: string }> => {
			if (!fromOurs(e)) return { ok: false, detail: 'not from this app' }
			if (mode !== 'operator') return { ok: false, detail: 'Admin only.' }
			if (!Array.isArray(codes) || codes.length === 0 || codes.length > 40 || !codes.every(isTCode) || new Set(codes).size !== codes.length)
				return { ok: false, detail: 'not a list of lower thirds' }
			return copyAnnouncements(store.current(), codes)
		},
	)
	ipcMain.handle('announcements:write', async (e, session: unknown, want: unknown): Promise<WriteResult> => {
		if (!fromOurs(e)) return { ok: false, detail: 'not from this app' }
		if (mode !== 'operator') return { ok: false, detail: 'Admin only.' }
		if (!isSession(session)) return { ok: false, detail: 'not a session' }
		const list = Array.isArray(want) ? want : []
		const ok = list.length > 0 && list.length <= 40 && list.every((w) => typeof w === 'object' && w !== null && isTCode(w.code) && (w.section === 'notices' || w.section === 'promos'))
		if (!ok) return { ok: false, detail: 'not a list of lower thirds' }
		return writeAnnouncements(store.current(), session, (list as { code: string; section: Section }[]).map(({ code, section }) => ({ code, section })))
	})

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
	const fromHost = (e: IpcMainEvent | IpcMainInvokeEvent, pane: MaPane | CuePane | EmbedPane | null | undefined) =>
		pane != null && !pane.host().isDestroyed() && e.sender === pane.host().webContents
	ipcMain.handle('ma-pane:report', (e) => (fromOurs(e) ? maPane?.report() : undefined))
	ipcMain.on('ma-pane:place', (e, rect: unknown) => {
		if (fromHost(e, maPane)) maPane?.place(rect === null ? null : asRect(rect))
	})
	ipcMain.on('ma-pane:release', (e) => fromKiosk(e) && maPane?.release())
	ipcMain.on('ma-pane:retry', (e) => fromHost(e, maPane) && maPane?.retry())
	// The renderer may only step down. Into Admin is `admin:unlock`'s alone,
	// which checks the passcode (../shared/admin.ts); an 'operator' here is the
	// renderer agreeing with what main already decided.
	ipcMain.on('ma-pane:mode', (e, next: unknown) => {
		if (!fromKiosk(e) || next !== 'volunteer' || mode === 'volunteer') return
		mode = 'volunteer'
		console.log('[admin] back to volunteer')
		maPane?.setMode('volunteer')
	})
	// Admin, by passcode (../shared/admin.ts). The count of wrong tries is
	// main's, so reloading the page does not reset it. The passcode itself is
	// never logged, right or wrong.
	ipcMain.handle('admin:state', (e): AdminState | undefined => {
		if (!fromKiosk(e) || settings === null) return undefined
		const p = settings.passcode()
		return { hasPasscode: p !== null, numeric: p?.numeric ?? true, waitMs: lockoutWait(lockout, Date.now()) }
	})
	ipcMain.handle('admin:unlock', (e, code: unknown): UnlockResult | undefined => {
		if (!fromKiosk(e) || settings === null) return undefined
		const store = settings
		const has = store.passcode() !== null
		const { result, lockout: next } = tryUnlock(lockout, Date.now(), has, () => typeof code === 'string' && store.checkPasscode(code))
		lockout = next
		if (result.ok) {
			mode = 'operator'
			console.log(`[admin] into Admin${has ? ', by passcode' : ' (no passcode set)'}`)
			maPane?.setMode('operator')
		} else if (result.why === 'wrong') {
			console.log(`[admin] a wrong passcode; ${result.triesLeft} before a wait`)
		} else {
			console.log(`[admin] passcode refused: waiting ${Math.ceil(result.waitMs / 1000)} s after wrong tries`)
		}
		return result
	})
	// Read by a pop-out, to hide the buttons operator mode alone may use.
	ipcMain.handle('mode:get', (e): Mode => (fromOurs(e) ? mode : 'volunteer'))

	// The Cue Manager is the same for every mode: the booth device's rights,
	// held by the app's own backend, are what it may do. Clearing its sign-in
	// is operator business.
	ipcMain.handle('cue-pane:report', (e) => (fromOurs(e) ? cuePane?.report() : undefined))
	ipcMain.on('cue-pane:place', (e, rect: unknown) => {
		if (fromHost(e, cuePane)) cuePane?.place(rect === null ? null : asRect(rect))
	})
	ipcMain.on('cue-pane:retry', (e) => fromHost(e, cuePane) && cuePane?.retry())
	// Embeds (./embeds.ts): placed, reloaded and zoomed like the panes above.
	// Zoom is everyone's, from wherever the embed is drawn.
	const embedPane = (id: unknown) => (isEmbedId(id) ? embeds?.pane(id) : undefined)
	ipcMain.handle('embeds:report', (e): EmbedReport[] => (fromOurs(e) ? (embeds?.reports() ?? []) : []))
	ipcMain.on('embed:place', (e, id: unknown, rect: unknown) => {
		const pane = embedPane(id)
		if (fromHost(e, pane)) pane?.place(rect === null ? null : asRect(rect))
	})
	ipcMain.on('embed:retry', (e, id: unknown) => {
		const pane = embedPane(id)
		if (fromHost(e, pane)) pane?.retry()
	})
	ipcMain.on('embed:zoom', (e, id: unknown, by: unknown) => {
		const pane = embedPane(id)
		if (fromHost(e, pane) && (by === -1 || by === 0 || by === 1)) pane?.zoom(by)
	})
	store.onChange(() => {
		embeds?.sync(store.current().embeds)
		// A pop-out of an embed or NDI source removed or turned off has nothing
		// left to show.
		const ndiOn = new Set(store.current().ndiSources.filter((s) => s.on).map((s) => s.id))
		for (const view of popouts?.popped() ?? []) {
			const id = embedIdOf(view)
			if (id !== null && embeds?.pane(id) === undefined) popouts?.close(view)
			const ndiId = ndiIdOf(view)
			if (ndiId !== null && !ndiOn.has(ndiId)) popouts?.close(view)
			const captureId = captureIdOf(view)
			if (captureId !== null && !store.current().captureInputs.some((c) => c.id === captureId && c.on)) popouts?.close(view)
		}
	})

	// NDI sources (./ndi.ts): the worker holds NDI, and each page that shows a
	// source is handed a port to it. Anyone may watch; adding is Connections'.
	ndi = createNdi()
	ndi.setSources(store.current().ndiSources)
	store.onChange(() => ndi?.setSources(store.current().ndiSources))
	const isToken = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{1,32}$/.test(v)
	// Capture inputs (../shared/capture.ts) are the page's own, through the
	// browser's camera route; a pop-out reads its one input here.
	ipcMain.handle('capture:input', (e, id: unknown): CaptureInput | null =>
		fromOurs(e) && isCaptureId(id) ? (store.current().captureInputs.find((c) => c.id === id) ?? null) : null,
	)
	ipcMain.handle('ndi:state', (e): NdiState | null => (fromOurs(e) ? (ndi?.state() ?? null) : null))
	ipcMain.on('ndi:watch', (e, id: unknown, token: unknown) => {
		if (fromOurs(e) && isNdiId(id) && isToken(token)) ndi?.watch(e.sender, id, token)
	})
	ipcMain.on('ndi:unwatch', (e, token: unknown) => {
		if (fromOurs(e) && isToken(token)) ndi?.unwatch(e.sender, token)
	})

	// Pictures of the pages in the kiosk, to stand in for them while the
	// divider is dragged. A popped-out page is not under the divider.
	ipcMain.handle('panes:snapshot', async (e): Promise<Record<string, string | null>> => {
		if (!fromKiosk(e)) return {}
		const inKiosk = (p: MaPane | CuePane | EmbedPane | null) => (p !== null && p.host() === window ? p.snapshot() : null)
		const entries: Array<[string, MaPane | CuePane | EmbedPane | null]> = [
			['ma', maPane],
			['cue', cuePane],
			...(embeds?.panes() ?? []).map((p): [string, EmbedPane] => [`embed:${p.report().id}`, p]),
		]
		const pictures = await Promise.all(entries.map(([, p]) => inKiosk(p)))
		return Object.fromEntries(entries.map(([k], i) => [k, pictures[i] ?? null]))
	})

	// The video feed. A page says when it shows the feed, and gets frames
	// while it does; which sender it shows is a pick from what the machine has.
	// Only while its connection is on: off, nothing lists senders.
	const syncVideo = () => {
		const on = !store.current().off.includes('video')
		if (on && videoFeed === null) videoFeed = startVideoFeed()
		if (!on && videoFeed !== null) {
			videoFeed.stop()
			videoFeed = null
			console.log('[video] turned off')
		}
	}
	syncVideo()
	store.onChange(syncVideo)
	ipcMain.handle('video:state', (e): VideoFeedState | null => (fromOurs(e) ? (videoFeed?.state() ?? null) : null))
	ipcMain.on('video:watch', (e, on: unknown) => {
		if (fromOurs(e) && typeof on === 'boolean') videoFeed?.watch(e.sender, on)
	})
	ipcMain.on('video:choose', (e, name: unknown) => {
		if (fromOurs(e) && typeof name === 'string') videoFeed?.choose(name)
	})
	// Restart video: anyone, any mode, from the view or its Connections row. It
	// fires nothing anywhere else; it only lets the receivers go and opens them
	// again, which is what an app restart did for the feed.
	ipcMain.on('video:restart', (e) => {
		if (!fromOurs(e)) return
		if (videoFeed === null) console.log('[video] restart asked while the video feed is turned off')
		else videoFeed.restart()
	})
	// The page's half of where a stall comes from (src/main/video-feed.ts): only
	// numbers are taken, so a page cannot write words of its own into the log.
	ipcMain.on('video:page-health', (e, h: unknown) => {
		if (!fromOurs(e) || typeof h !== 'object' || h === null) return
		const { frameGap, drewNothing, draw } = h as Record<string, unknown>
		const ms = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 3_600_000 ? Math.round(v) : null)
		const [gap, still, slow] = [ms(frameGap), ms(drewNothing), ms(draw)]
		if (gap === null || still === null || slow === null) return
		console.log(`[video] the page, in the last 5 s: longest wait between frames ${gap} ms, longest without drawing ${still} ms, slowest draw ${slow} ms`)
	})

	// Pop-outs. The kiosk opens them; the kiosk or the pop-out itself closes one.
	const asView = (v: unknown): ViewId | null => (isViewId(v) ? v : null)
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
	ipcMain.on('popout:show', (e, v: unknown) => {
		const view = asView(v)
		if (view !== null && (fromKiosk(e) || popouts?.isPopout(e.sender, view) === true)) popouts?.show(view)
	})
	ipcMain.on('popout:behind', (e, v: unknown) => {
		const view = asView(v)
		if (view !== null && (fromKiosk(e) || popouts?.isPopout(e.sender, view) === true)) popouts?.sendBehind(view)
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

	// Which build this is and where its log is, for a tester's report.
	ipcMain.handle('app:about', (e): About | undefined =>
		fromOurs(e) ? { version: app.getVersion(), platform: process.platform, logPath } : undefined,
	)
	// Operator mode only: it opens a file window over the kiosk.
	ipcMain.on('app:show-log', (e) => {
		if (fromKiosk(e) && mode === 'operator' && logPath !== '') shell.showItemInFolder(logPath)
	})

	// Updates (../shared/updates.ts): anyone may see that one is out and ask
	// again; only Admin installs, since installing closes Pāua for a minute.
	updates = startUpdates({
		onChange: (u) => {
			if (u.state === 'available') console.log(`[updates] Pāua ${u.version} is out (this is ${app.getVersion()})`)
			if (u.state === 'failed') console.error(`[updates] could not check: ${u.detail}`)
		},
	})
	ipcMain.handle('updates:state', (e): UpdateState | undefined => (fromOurs(e) ? updates?.state() : undefined))
	ipcMain.on('updates:check', (e) => {
		if (fromKiosk(e)) updates?.check()
	})
	ipcMain.on('updates:install', (e) => {
		if (fromKiosk(e) && mode === 'operator') updates?.install()
	})

	// Windowed mode, as it changes: no restart needed.
	store.onChange(() => {
		const full = fullScreenFor(store.current().windowed)
		if (window !== null && !window.isDestroyed() && window.isFullScreen() !== full) window.setFullScreen(full)
	})

	// "Mark this moment" (the owner, 2026-10-04): anyone may, and it only
	// writes a line in the log, with what was on screen, for a tester's report.
	ipcMain.handle('app:mark', (e, context: unknown): number | null => {
		if (!fromOurs(e)) return null
		marks += 1
		const said = typeof context === 'string' ? context.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300) : ''
		console.log(`[mark] ===== tester's mark ${marks} =====${said === '' ? '' : ` ${said}`}`)
		return marks
	})

	ipcMain.handle('settings:get', (e) => (fromKiosk(e) ? settings?.view() : undefined))
	ipcMain.handle('settings:save', (e, raw: unknown) => {
		if (!fromKiosk(e) || settings === null) return undefined
		if (mode !== 'operator') return { ok: false, errors: { form: 'Settings can be changed in Admin only.' } }
		const patch = patchFrom(raw)
		if (patch === null) return { ok: false, errors: { form: 'Those settings could not be read.' } }
		const before = settings.view()
		const checked = settings.save(patch)
		if (checked.ok) {
			const changed = changedFields(before, checked.settings, patch)
			if (changed.length > 0) console.log(`[settings] saved in Admin: ${changed.join('; ')}`)
		}
		// The renderer is told whether it worked, never handed the settings back:
		// it asks for the view again, which carries no passwords.
		return checked.ok ? { ok: true } : checked
	})

	// The camera rule for Pāua's own pages (the kiosk and its pop-outs, in the
	// default session; the MA, the run order and embeds have sessions of their
	// own that refuse everything): video only, for capture inputs
	// (../shared/capture.ts). Never the microphone. The pages use no other
	// permission, so every other is refused.
	session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
		if (permission !== 'media') return callback(false)
		const types = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
		callback(types.length > 0 && types.every((t) => t === 'video'))
	})

	createWindow()

	// The screen never sleeps, dims or goes to its screensaver while the app
	// runs: a booth screen that locks itself mid-service is a screen nobody can
	// use. ⚠️ A managed machine's own idle lock (machine policy, not the
	// screensaver) may still win; not yet watched on the booth box.
	powerSaveBlocker.start('prevent-display-sleep')
	console.log('[kiosk] keeping the display awake')

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
	ndi?.stop()
	updates?.stop()
})
