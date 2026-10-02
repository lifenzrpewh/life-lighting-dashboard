import test from 'node:test'
import assert from 'node:assert/strict'

import { decodeArenaProduct } from '../dist/src/bridge/arena.js'
import { arenaVersion } from '../dist/src/shared/arena.js'
import { DEFAULT_SETTINGS, applyPatch, fromDisk, patchFrom } from '../dist/src/shared/settings.js'

test('Arena 7.28 as seen 2026-10-02 decodes', () => {
	const r = decodeArenaProduct({ name: 'Arena', major: 7, minor: 28, micro: 0, revision: 24303 })
	assert.deepEqual(r, { ok: true, value: { name: 'Arena', major: 7, minor: 28, micro: 0 } })
	assert.equal(arenaVersion(r.value), '7.28')
	assert.equal(arenaVersion({ name: 'Arena', major: 7, minor: 28, micro: 1 }), '7.28.1')
})

test('something else on 8080 is an error, never an Arena of no version', () => {
	assert.equal(decodeArenaProduct('<html>').ok, false)
	assert.equal(decodeArenaProduct({ name: 'grandMA3' }).ok, false)
	assert.equal(decodeArenaProduct({ name: '', major: 7, minor: 28, micro: 0 }).ok, false)
	assert.equal(decodeArenaProduct({ name: 'Arena', major: '7', minor: 28, micro: 0 }).ok, false)
	assert.equal(decodeArenaProduct([]).ok, false)
})

test('settings: no Arena until an address is set, then on 8080', () => {
	assert.equal(DEFAULT_SETTINGS.arenaHost, null)
	assert.equal(DEFAULT_SETTINGS.arenaPort, 8080)
	const set = applyPatch(DEFAULT_SETTINGS, { arenaHost: ' 127.0.0.1 ', arenaPort: 8081 })
	assert.ok(set.ok)
	assert.equal(set.settings.arenaHost, '127.0.0.1')
	assert.equal(set.settings.arenaPort, 8081)
	assert.equal(applyPatch(DEFAULT_SETTINGS, { arenaHost: 'http://arena' }).ok, false)
	assert.equal(applyPatch(DEFAULT_SETTINGS, { arenaPort: 0 }).ok, false)
	const cleared = applyPatch(set.settings, { arenaHost: '' })
	assert.ok(cleared.ok)
	assert.equal(cleared.settings.arenaHost, null)
})

test('settings: Arena survives the disk and the IPC boundary', () => {
	assert.equal(fromDisk({ arenaHost: '10.11.60.70', arenaPort: 8090 }).arenaHost, '10.11.60.70')
	assert.equal(fromDisk({ arenaHost: 'http://x' }).arenaHost, null)
	assert.equal(patchFrom({ arenaPort: '8080' }), null)
	assert.deepEqual(patchFrom({ arenaHost: null }), { arenaHost: null })
})
