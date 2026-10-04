// The app's front door. The installed app hands itself to a watchdog
// (./supervisor.ts) that runs the real app and restarts it after a crash;
// everything else (a checkout, `npm run dev`, the watchdog's own child) is the
// kiosk straight away (./kiosk.ts).
//
// A checkout is left alone because kiosk.cmd already watches it, and a
// developer's crash should stay crashed, where it can be looked at.

import { app } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DATA_DIR_NAME } from '../bridge/data-dir.js'

if (app.isPackaged && process.env['PAUA_SUPERVISED'] !== '1') {
	const supervisor = path.join(path.dirname(fileURLToPath(import.meta.url)), 'supervisor.js')
	const logDir = path.join(app.getPath('appData'), DATA_DIR_NAME)
	spawn(process.execPath, [supervisor, logDir, ...process.argv.slice(1)], {
		env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		detached: true,
		stdio: 'ignore',
		windowsHide: true,
	}).unref()
	app.exit(0)
} else {
	void import('./kiosk.js')
}
