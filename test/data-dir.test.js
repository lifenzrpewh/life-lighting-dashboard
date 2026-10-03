import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { DATA_DIR_NAME, OLD_DATA_DIR_NAME, settleDataDir } from '../dist/src/bridge/data-dir.js'

// A fresh %APPDATA% stand-in per test.
const appData = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paua-data-'))
const put = (dir, name, body = 'x') => {
	fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
	fs.writeFileSync(path.join(dir, name), body)
}

test('the first run since the rename moves the whole old profile in, Local State with it', () => {
	const root = appData()
	const old = path.join(root, OLD_DATA_DIR_NAME)
	put(old, 'Local State', 'the key that opens the passwords')
	put(old, 'settings.json', '{"consoleHost":"10.11.60.40"}')
	put(old, 'Partitions/cue-manager/Cookies', 'signed in')
	const r = settleDataDir(root)
	assert.equal(r.dir, path.join(root, DATA_DIR_NAME))
	assert.deepEqual(r.move, { kind: 'moved', entries: 3 })
	assert.equal(fs.readFileSync(path.join(r.dir, 'Local State'), 'utf8'), 'the key that opens the passwords')
	assert.equal(fs.readFileSync(path.join(r.dir, 'Partitions/cue-manager/Cookies'), 'utf8'), 'signed in')
	assert.equal(fs.existsSync(old), false)
})

test("kiosk.cmd's log already in the new folder does not stop the move, and stays", () => {
	const root = appData()
	put(path.join(root, OLD_DATA_DIR_NAME), 'Local State')
	put(path.join(root, OLD_DATA_DIR_NAME), 'kiosk.log', 'the old run')
	put(path.join(root, DATA_DIR_NAME), 'kiosk.log', 'this run')
	const r = settleDataDir(root)
	assert.deepEqual(r.move, { kind: 'moved', entries: 1 })
	assert.equal(fs.readFileSync(path.join(r.dir, 'kiosk.log'), 'utf8'), 'this run')
	assert.ok(fs.existsSync(path.join(r.dir, 'Local State')))
})

test('once the new profile exists, the old folder is never read again', () => {
	const root = appData()
	put(path.join(root, DATA_DIR_NAME), 'Local State', 'new')
	put(path.join(root, OLD_DATA_DIR_NAME), 'settings.json', 'an old copy started since')
	const r = settleDataDir(root)
	assert.deepEqual(r.move, { kind: 'none' })
	assert.equal(r.dir, path.join(root, DATA_DIR_NAME))
	assert.ok(fs.existsSync(path.join(root, OLD_DATA_DIR_NAME, 'settings.json')))
})

test('a fresh machine just uses the new folder', () => {
	const root = appData()
	assert.deepEqual(settleDataDir(root), { dir: path.join(root, DATA_DIR_NAME), move: { kind: 'none' } })
})
