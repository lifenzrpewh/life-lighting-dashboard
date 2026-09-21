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
// ✅ CHANNEL B IS WIRED (2026-09-21). Main binds the OSC port and holds live
// executor levels from the desk — see `./bridge/osc-in.ts`.
//
// ⚠️ `linkState()` still reports UNREACHABLE, and that is not an oversight.
// Liveness needs a request we sent and did not get an answer to; channel B is
// the console talking unprompted, so it can prove the desk IS there and can
// never prove it is not. `LinkState.live` also demands a `roundTripMs`, and
// there is no honest number to put in it until something round-trips. Hearing
// packets is therefore reported as its own fact in `DeskState.lastHeardAt`,
// beside the link rather than inside it, until the plugin gains a ping verb.

import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { LinkState } from '../shared/reading.js'
import type { DeskState } from '../shared/desk.js'
import { startChannelB, OSC_PORT, type ChannelBHandle } from './bridge/osc-in.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Set by scripts/dev.mjs. Absent in a packaged build, which then loads the
 *  built renderer off disk. */
const DEV_SERVER = process.env['VITE_DEV_SERVER_URL']

let window: BrowserWindow | null = null
let channelB: ChannelBHandle | null = null

/** What main knows from channel B before the socket has even bound.
 *
 *  `listening: false` with nothing heard is a different fact from a desk that has
 *  gone quiet, and the two must never render the same. */
const NO_DESK: DeskState = {
	executors: [],
	lastHeardAt: null,
	packets: 0,
	rejected: 0,
	listening: false,
}

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

/** The console link, as main currently knows it.
 *
 *  Returns UNREACHABLE because it IS unreachable: no OSC transport is wired yet.
 *  This deliberately does not pretend, and it is not a stub to be replaced with
 *  something optimistic — when the transport lands, this returns what the
 *  transport actually reports, and the failure path stays exactly as it is. */
function linkState(): LinkState {
	return { state: 'unreachable', since: Date.now() }
}

app.whenReady().then(() => {
	// Boots into volunteer mode, always (docs/PLAN.md, Mode switching). There is
	// no menu bar to elevate from and no remembered mode across a restart.
	Menu.setApplicationMenu(null)

	ipcMain.handle('link:state', () => linkState())
	ipcMain.handle('desk:state', () => channelB?.deskState() ?? NO_DESK)

	// Bound before the window exists, so the first thing the renderer asks for
	// already has whatever the desk has said in the meantime.
	channelB = startChannelB({
		onBindError: (error) => {
			console.error(`[kiosk] channel B could not bind ${OSC_PORT}: ${error.message}`)
			if (error.code === 'EADDRINUSE') {
				console.error('[kiosk]   grandMA3 onPC on this machine owns the OSC port exclusively.')
				console.error('[kiosk]   Actions will still work; feedback will not. Give the dashboard its own entry.')
			}
		},
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
	channelB?.stop()
	channelB = null
})
