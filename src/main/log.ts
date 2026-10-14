// Main's console, copied into the app's own log (../bridge/log-file.ts).
//
// Every `console.log` main already makes is a line the booth log should have,
// so the console is wrapped rather than every call site changed: what kiosk.cmd
// still captures as kiosk.log stays exactly as it was, and paua.log has the
// same lines with times on them.
//
// Also logged, because a tester's report most needs them: the kiosk page's own
// warnings and errors, a child process (the GPU's, a page's) going, and an
// exception in main. Exceptions only through the monitor hook, which watches
// without changing what Electron does with them.

import { app, type WebContents } from 'electron'
import { format } from 'node:util'

import { openLogFile, type LogFile, type LogLevel } from '../bridge/log-file.js'

let log: LogFile | null = null

/** Start the log in `dir`, and copy the console into it from here on. */
export function startLog(dir: string): LogFile {
	log = openLogFile(dir)
	const wrap = (method: 'log' | 'info' | 'warn' | 'error', level: LogLevel) => {
		const original = console[method].bind(console)
		console[method] = (...args: unknown[]) => {
			original(...args)
			log?.write(level, format(...args))
		}
	}
	wrap('log', 'info')
	wrap('info', 'info')
	wrap('warn', 'warn')
	wrap('error', 'error')

	console.log(
		`--- ${app.getName()} ${app.getVersion()} started (${process.platform} ${process.arch}, Electron ${process.versions.electron}${app.isPackaged ? '' : ', from a checkout'})`,
	)

	process.on('uncaughtExceptionMonitor', (e, origin) => log?.write('error', `[main] ${origin}: ${e.stack ?? e.message}`))
	// Under the installed app's watchdog (./supervisor.ts), an exception in
	// main ends the process and the watchdog brings it back. Left alone,
	// Electron puts an error box on the booth screen and waits for a click.
	if (process.env['PAUA_SUPERVISED'] === '1') {
		process.on('uncaughtException', () => {
			log?.close()
			app.exit(1)
		})
	}
	process.on('unhandledRejection', (reason) =>
		console.error('[main] unhandled rejection:', reason instanceof Error ? (reason.stack ?? reason.message) : reason),
	)
	app.on('child-process-gone', (_e, d) => {
		if (d.reason !== 'clean-exit') console.error(`[kiosk] ${d.type} process gone: ${d.reason} (exit ${d.exitCode})${d.name ? `, ${d.name}` : ''}`)
	})
	app.on('will-quit', () => {
		console.log('--- quitting')
		log?.close()
	})
	return log
}

/** A line the page says again within this long is counted, not written. */
const REPEAT_MS = 10_000
const REPEATS_HELD = 50

/** Copy a page's warnings and errors into the log, named `who`. Its info and
 *  debug lines stay out: the page is chatty and the log is for faults. A line
 *  repeated (a frame that fails to draw, sixty a second) is written once each
 *  10 s with how many times it came, so it cannot rotate away the hours
 *  before it that a tester's report needs. */
export function logPage(contents: WebContents, who: string): void {
	const seen = new Map<string, { at: number; count: number }>()
	contents.on('console-message', (e) => {
		if (e.level !== 'warning' && e.level !== 'error') return
		const line = e.level === 'warning' ? `[${who}] ${e.message}` : `[${who}] ${e.message} (${e.sourceId}:${e.lineNumber})`
		const now = Date.now()
		const last = seen.get(line)
		if (last !== undefined && now - last.at < REPEAT_MS) {
			last.count++
			return
		}
		const again = last !== undefined && last.count > 0 ? ` (and ${last.count} more like it in the ${Math.round((now - last.at) / 1000)} s before)` : ''
		if (seen.size >= REPEATS_HELD && last === undefined) seen.delete(seen.keys().next().value!)
		seen.set(line, { at: now, count: 0 })
		if (e.level === 'warning') console.warn(line + again)
		else console.error(line + again)
	})
}
