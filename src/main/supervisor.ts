// The installed app's watchdog: runs the app, and brings it back if it dies
// (the rule is ../bridge/supervise.ts). What kiosk.cmd does for a checkout.
//
// Run by ./entry.ts as Electron in Node mode (ELECTRON_RUN_AS_NODE), so it is
// the same Paua.exe with no window, no Dock icon and no `electron` module.
// argv: the log folder, then the arguments the app was started with.
//
// The app it starts is told it is supervised (PAUA_SUPERVISED=1), which makes
// an exception in main end the process for this to restart, rather than
// leave Electron's error box on the booth screen (./log.ts).

import { spawn } from 'node:child_process'

import { openLogFile } from '../bridge/log-file.js'
import { exitWords, nextStep } from '../bridge/supervise.js'

const [logDir = '.', ...appArgs] = process.argv.slice(2)
const log = openLogFile(logDir)
const say = (text: string) => log.write('info', `[watchdog] ${text}`)
const crashes: number[] = []

function run(): void {
	const env: NodeJS.ProcessEnv = { ...process.env, PAUA_SUPERVISED: '1' }
	delete env['ELECTRON_RUN_AS_NODE']
	const child = spawn(process.execPath, appArgs, { env, stdio: 'ignore', windowsHide: false })
	child.on('error', (e) => {
		say(`could not start the app: ${e.message}`)
		log.close()
		process.exit(1)
	})
	child.on('exit', (code, signal) => {
		const exit = { code, signal }
		const now = Date.now()
		const step = nextStep(exit, crashes, now)
		if (step.kind === 'stop') {
			log.close()
			process.exit(0)
		}
		crashes.push(now)
		if (step.kind === 'give-up') {
			say(`the app stopped (${exitWords(exit)}); giving up after ${step.why}. Start it again by hand.`)
			log.close()
			process.exit(1)
		}
		say(`the app stopped (${exitWords(exit)}); starting it again in ${step.afterMs / 1000} s`)
		setTimeout(run, step.afterMs)
	})
}

run()
