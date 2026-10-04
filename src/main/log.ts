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

/** Copy a page's warnings and errors into the log, named `who`. Its info and
 *  debug lines stay out: the page is chatty and the log is for faults. */
export function logPage(contents: WebContents, who: string): void {
	contents.on('console-message', (e) => {
		if (e.level === 'warning') console.warn(`[${who}] ${e.message}`)
		else if (e.level === 'error') console.error(`[${who}] ${e.message} (${e.sourceId}:${e.lineNumber})`)
	})
}
