// The app's own log: `paua.log` in the data folder (./data-dir.ts), written
// by the app whichever way it was started.
//
// WHY THIS EXISTS: until 0.1.0 the only log was kiosk.cmd redirecting the
// app's output to kiosk.log. Started from the installer's shortcut, or on a
// Mac, everything the app said went nowhere, and a field tester's "it went
// red at about ten past" had nothing behind it.
//
// WRITTEN SYNCHRONOUSLY, line by line: the line that matters most is the last
// one before a crash, and a buffered stream loses exactly that one. The app
// logs events, not traffic, so a write per line costs nothing.
//
// BOUNDED: past `limit` the file becomes `paua.1.log` (replacing the one
// before) and a fresh one starts, so a booth PC left running for months holds
// at most two files' worth. Appended across runs, not started fresh on each,
// because kiosk.cmd restarts a crashed app: a fresh file per run would keep
// only the run after the crash.
//
// NEVER THROWS: a log that cannot be written (a full disk, a folder gone)
// stops writing and says so once on stderr. Logging must not take the booth
// screen down with it.

import fs from 'node:fs'
import path from 'node:path'

export const LOG_NAME = 'paua.log'
export const OLD_LOG_NAME = 'paua.1.log'
export const LOG_LIMIT = 5 * 1024 * 1024

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogFile {
	readonly path: string
	write(level: LogLevel, text: string): void
	close(): void
}

const two = (n: number) => String(n).padStart(2, '0')

/** `2026-10-04 14:03:22.123`, the computer's own time: a tester says "about
 *  ten past", in local time, and the log should read the same way. */
export function stamp(d: Date): string {
	const ms = String(d.getMilliseconds()).padStart(3, '0')
	return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${ms}`
}

/** One entry, possibly several lines: later lines indented, so every line
 *  that starts at the margin starts an entry. */
export function formatLine(d: Date, level: LogLevel, text: string): string {
	const tag = level === 'info' ? 'INFO ' : level === 'warn' ? 'WARN ' : 'ERROR'
	return `${stamp(d)} ${tag} ${text.replace(/\r?\n/g, '\n    ')}\n`
}

export function openLogFile(dir: string, opts: { limit?: number; now?: () => Date } = {}): LogFile {
	const limit = opts.limit ?? LOG_LIMIT
	const now = opts.now ?? (() => new Date())
	const file = path.join(dir, LOG_NAME)
	let fd: number | null = null
	let size = 0
	let broken = false

	const fail = (e: unknown) => {
		broken = true
		if (fd !== null) {
			try {
				fs.closeSync(fd)
			} catch {
				// Already unusable.
			}
		}
		fd = null
		process.stderr.write(`[log] cannot write ${file}: ${(e as Error).message}. Not logging to a file from here on.\n`)
	}

	const open = () => {
		fs.mkdirSync(dir, { recursive: true })
		fd = fs.openSync(file, 'a')
		size = fs.fstatSync(fd).size
	}

	const rotate = () => {
		if (fd !== null) fs.closeSync(fd)
		fd = null
		fs.renameSync(file, path.join(dir, OLD_LOG_NAME))
		open()
	}

	try {
		open()
		if (size >= limit) rotate()
	} catch (e) {
		fail(e)
	}

	return {
		path: file,
		write(level, text) {
			if (broken || fd === null) return
			const line = Buffer.from(formatLine(now(), level, text), 'utf8')
			try {
				if (size > 0 && size + line.length > limit) rotate()
				fs.writeSync(fd as number, line)
				size += line.length
			} catch (e) {
				fail(e)
			}
		},
		close() {
			if (fd === null) return
			try {
				fs.closeSync(fd)
			} catch {
				// Closing on the way out; nothing to do about it.
			}
			fd = null
		},
	}
}
