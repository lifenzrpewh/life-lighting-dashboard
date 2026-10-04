import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { LOG_NAME, OLD_LOG_NAME, formatLine, openLogFile, stamp } from '../dist/src/bridge/log-file.js'

const dir = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'paua-log-')), 'paua')
const at = new Date(2026, 9, 4, 9, 5, 7, 42)

test('a line carries local time, a level and the text', () => {
	assert.equal(stamp(at), '2026-10-04 09:05:07.042')
	assert.equal(formatLine(at, 'error', '[kiosk] link down'), '2026-10-04 09:05:07.042 ERROR [kiosk] link down\n')
})

test('later lines of one entry are indented, so only an entry starts at the margin', () => {
	assert.equal(formatLine(at, 'info', 'one\r\ntwo\nthree'), '2026-10-04 09:05:07.042 INFO  one\n    two\n    three\n')
})

test('writes are on disk at once, appended across runs, folder made if missing', () => {
	const d = dir()
	const a = openLogFile(d, { now: () => at })
	a.write('info', 'first run')
	assert.match(fs.readFileSync(path.join(d, LOG_NAME), 'utf8'), /first run/)
	a.close()
	const b = openLogFile(d, { now: () => at })
	b.write('warn', 'second run')
	b.close()
	const text = fs.readFileSync(path.join(d, LOG_NAME), 'utf8')
	assert.match(text, /first run[\s\S]*second run/)
})

test('past the limit the log moves aside, replacing the one before, and a fresh one starts', () => {
	const d = dir()
	const log = openLogFile(d, { limit: 200, now: () => at })
	for (let i = 0; i < 12; i++) log.write('info', `line ${i} ${'x'.repeat(20)}`)
	log.close()
	const current = fs.readFileSync(path.join(d, LOG_NAME), 'utf8')
	const old = fs.readFileSync(path.join(d, OLD_LOG_NAME), 'utf8')
	assert.ok(fs.statSync(path.join(d, LOG_NAME)).size <= 200)
	assert.ok(fs.statSync(path.join(d, OLD_LOG_NAME)).size <= 200)
	assert.match(current, /line 11/)
	// Nothing from the newest lines is lost to the move.
	assert.doesNotMatch(old, /line 11/)
	assert.ok(fs.readdirSync(d).length === 2)
})

test('a log already over the limit at start moves aside first', () => {
	const d = dir()
	fs.mkdirSync(d, { recursive: true })
	fs.writeFileSync(path.join(d, LOG_NAME), 'y'.repeat(300))
	const log = openLogFile(d, { limit: 200, now: () => at })
	log.write('info', 'after')
	log.close()
	assert.equal(fs.readFileSync(path.join(d, OLD_LOG_NAME), 'utf8'), 'y'.repeat(300))
	assert.match(fs.readFileSync(path.join(d, LOG_NAME), 'utf8'), /^2026.*after\n$/)
})

test('a log that cannot be written never throws into the app', () => {
	const d = dir()
	fs.mkdirSync(path.dirname(d), { recursive: true })
	// A file where the folder should be.
	fs.writeFileSync(d, 'not a folder')
	const stderr = process.stderr.write
	let said = ''
	process.stderr.write = (s) => ((said += s), true)
	try {
		const log = openLogFile(d)
		log.write('error', 'nowhere to go')
		log.write('error', 'still nowhere')
		log.close()
	} finally {
		process.stderr.write = stderr
	}
	assert.equal(said.split('\n').filter(Boolean).length, 1)
})
