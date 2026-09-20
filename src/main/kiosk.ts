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
// ⚠️ NOT YET WIRED TO A DESK. Channels A/B/C need an OSC packet to have been
// observed arriving, and as of 2026-09-20 none has (docs/PLAN.md Phase 0 spike
// 1 — the console returned `OK:` for `SendOSC`, which proves the syntax and not
// the delivery). Until then `linkState()` below reports UNREACHABLE, which is
// not a placeholder: it is the truth, and the UI renders it correctly today.

import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { LinkState } from '../shared/reading.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Set by scripts/dev.mjs. Absent in a packaged build, which then loads the
 *  built renderer off disk. */
const DEV_SERVER = process.env['VITE_DEV_SERVER_URL']

let window: BrowserWindow | null = null

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

	createWindow()

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})
