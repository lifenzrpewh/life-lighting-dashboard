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
// screen down with it. A move aside that fails is not that: the log goes on
// in the same file and the move is tried again later.

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

/** After a move aside that failed, how long before it is tried again. */
export const ROTATE_RETRY_MS = 60_000

export function openLogFile(dir: string, opts: { limit?: number; now?: () => Date; clock?: () => number } = {}): LogFile {
	const limit = opts.limit ?? LOG_LIMIT
	const now = opts.now ?? (() => new Date())
	const clock = opts.clock ?? Date.now
	const file = path.join(dir, LOG_NAME)
	let fd: number | null = null
	let size = 0
	let broken = false
	/** No move aside is tried before this, after one failed. */
	let rotateAfter = 0
	let saidRotate = false

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

	/** Move the log aside and start a fresh one. A move that fails (the old
	 *  file held open by something on Windows, say) is not the end of the log:
	 *  it goes on in the same file, over the limit, and the move is tried
	 *  again after ROTATE_RETRY_MS. Only a log that cannot be opened again
	 *  stops it. */
	const rotate = () => {
		if (fd !== null) fs.closeSync(fd)
		fd = null
		try {
			fs.renameSync(file, path.join(dir, OLD_LOG_NAME))
			saidRotate = false
		} catch (e) {
			rotateAfter = clock() + ROTATE_RETRY_MS
			if (!saidRotate) process.stderr.write(`[log] cannot move ${file} aside: ${(e as Error).message}. Writing on in it; trying again later.\n`)
			saidRotate = true
		}
		open()
	}
	const due = (adding: number) => size > 0 && size + adding > limit && clock() >= rotateAfter

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
				if (due(line.length)) rotate()
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
