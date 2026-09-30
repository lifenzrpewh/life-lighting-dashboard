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
// ⚠️ THE LINK IS A PING ROUND TRIP (./bridge/link.ts), unverified on a desk.
// Liveness needs a request we sent and did not get an answer to; channel B is
// the console talking unprompted, so it can prove the desk IS there and can
// never prove it is not. So main asks LifeBridge for an echo every second, and
// the link is LIVE only while echoes come back. Hearing channel B stays its own
// fact in `DeskState.lastHeardAt`, beside the link rather than inside it.

import { app, BrowserWindow, Menu, ipcMain, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { LinkState } from '../shared/reading.js'
import type { Mode, PaneRect } from '../shared/ma-pane.js'
import { patchFrom, replyPortOf } from '../shared/settings.js'
import { createMaPane, type MaPane } from './ma-pane.js'
import { openSettings, type SettingsStore } from './settings.js'
import type { DeskState } from '../shared/desk.js'
import { startChannelB, OSC_PREFIX, type ChannelBHandle } from './bridge/osc-in.js'
import { startLink, type LinkHandle } from './bridge/link.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Set by scripts/dev.mjs. Absent in a packaged build, which then loads the
 *  built renderer off disk. */
const DEV_SERVER = process.env['VITE_DEV_SERVER_URL']

let window: BrowserWindow | null = null
let maPane: MaPane | null = null
let settings: SettingsStore | null = null
/** The screen's mode, as the renderer last reported it. Main learns it only to
 *  pick the pane's MA user and to keep settings operator-only. It is not a
 *  security boundary: the MA users' own rights are. */
let mode: Mode = 'volunteer'
let channelB: ChannelBHandle | null = null
let consoleLink: LinkHandle | null = null
const BOOTED_AT = Date.now()

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
			preload: path.join(HERE, '../preload/index.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	})

	window.once('ready-to-show', () => window?.show())

	if (settings !== null) maPane = createMaPane(window, settings)
	// A reloaded renderer boots into volunteer mode. Without this, a crash-and-
	// reload would leave the pane logged in as the operator under a fresh
	// volunteer screen, until the renderer got round to saying otherwise.
	window.webContents.on('did-start-loading', () => {
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

	// Nothing in this app should ever open a second window or navigate away.
	window.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url)
		return { action: 'deny' }
	})

	if (DEV_SERVER) void window.loadURL(DEV_SERVER)
	else void window.loadFile(path.join(HERE, '../../renderer/index.html'))
}

/** The console link, as main currently knows it: the ping round trip, or
 *  unreachable since boot before the link has even started. */
function linkState(): LinkState {
	return consoleLink?.link() ?? { state: 'unreachable', since: BOOTED_AT }
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
	})
	channelB = startChannelB({
		port: replyPort,
		onOtherChannel: (message) => consoleLink?.offer(message),
		onBindError: (error) => {
			console.error(`[kiosk] could not listen on ${replyPort}: ${error.message}`)
			if (error.code === 'EADDRINUSE') {
				console.error('[kiosk]   Something on this computer holds that port, usually grandMA3 onPC.')
				console.error('[kiosk]   Commands still go out; nothing can come back, so the link stays unreachable.')
				console.error('[kiosk]   Give replies their own port in Settings, and the console an OSC entry sending to it.')
			}
		},
	})
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

app.whenReady().then(() => {
	// Boots into volunteer mode, always (docs/PLAN.md, Mode switching). There is
	// no menu bar to elevate from and no remembered mode across a restart.
	Menu.setApplicationMenu(null)

	settings = openSettings()
	const store = settings

	ipcMain.handle('link:state', () => linkState())
	ipcMain.handle('desk:state', () => channelB?.deskState() ?? noDesk(replyPortOf(store.current())))

	// Started before the window exists, so the first thing the renderer asks for
	// already has whatever the desk has said in the meantime.
	startOsc(store)
	store.onChange(() => startOsc(store))

	// Only the kiosk's own renderer may move the pane. The pane's page has no
	// preload and so no way to send, but the check costs nothing.
	const fromKiosk = (e: IpcMainEvent | IpcMainInvokeEvent) => e.sender === window?.webContents
	ipcMain.handle('ma-pane:report', (e) => (fromKiosk(e) ? maPane?.report() : undefined))
	ipcMain.on('ma-pane:place', (e, rect: unknown) => {
		if (fromKiosk(e)) maPane?.place(rect === null ? null : asRect(rect))
	})
	ipcMain.on('ma-pane:release', (e) => fromKiosk(e) && maPane?.release())
	ipcMain.on('ma-pane:retry', (e) => fromKiosk(e) && maPane?.retry())
	ipcMain.on('ma-pane:mode', (e, next: unknown) => {
		if (!fromKiosk(e) || (next !== 'volunteer' && next !== 'operator')) return
		mode = next
		maPane?.setMode(next)
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
app.on('will-quit', () => stopOsc())
