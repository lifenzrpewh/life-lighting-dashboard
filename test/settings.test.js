import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_SETTINGS, applyPatch, fromDisk, inUse, isLoopback, patchFrom, replyPortOf } from '../dist/src/shared/settings.js'

test('first boot has no console address, rather than a guessed one', () => {
	assert.equal(DEFAULT_SETTINGS.consoleHost, null)
	assert.equal(DEFAULT_SETTINGS.webRemotePort, 8080)
	assert.equal(DEFAULT_SETTINGS.volunteerUser, 'Remote')
	assert.equal(DEFAULT_SETTINGS.operatorUser, null)
	assert.equal(DEFAULT_SETTINGS.oscPort, 8003, 'the working config, OSC row 3')
	assert.equal(DEFAULT_SETTINGS.replyPort, null, 'replies on the same port unless told otherwise')
	assert.equal(replyPortOf(DEFAULT_SETTINGS), 8003)
})

test('a good patch applies, trimmed', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { consoleHost: ' 10.11.60.40 ', webRemotePort: 8080, operatorUser: 'LD' })
	assert.ok(r.ok)
	assert.equal(r.settings.consoleHost, '10.11.60.40')
	assert.equal(r.settings.operatorUser, 'LD')
})

test('one bad field rejects the whole patch, and says which', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { consoleHost: '10.11.60.40', webRemotePort: 0, volunteerUser: '' })
	assert.ok(!r.ok)
	assert.deepEqual(Object.keys(r.errors).sort(), ['volunteerUser', 'webRemotePort'])
})

test('an address with a scheme or port is refused, not half-used', () => {
	for (const host of ['http://10.11.60.40', '10.11.60.40:8080', '10.11.60.40/']) {
		const r = applyPatch(DEFAULT_SETTINGS, { consoleHost: host })
		assert.ok(!r.ok, host)
		assert.ok(r.errors.consoleHost)
	}
})

test('clearing the address or the operator user means unset, not empty', () => {
	const set = { ...DEFAULT_SETTINGS, consoleHost: '10.11.60.40', operatorUser: 'LD' }
	const r = applyPatch(set, { consoleHost: '', operatorUser: '  ' })
	assert.ok(r.ok)
	assert.equal(r.settings.consoleHost, null)
	assert.equal(r.settings.operatorUser, null)
})

test('an empty password is an error, so blank can only ever mean "unchanged"', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { operatorPassword: '' })
	assert.ok(!r.ok)
	assert.ok(r.errors.operatorPassword)
	assert.ok(applyPatch(DEFAULT_SETTINGS, { operatorPassword: null }).ok, 'null removes')
})

test('a corrupt file costs only the bad values', () => {
	const s = fromDisk({ consoleHost: 'http://nope', webRemotePort: 8081, volunteerUser: 42, operatorUser: 'LD', oscPort: 0, replyPort: 8004 })
	assert.deepEqual(s, {
		consoleHost: null,
		webRemotePort: 8081,
		volunteerUser: 'Remote',
		operatorUser: 'LD',
		oscPort: 8003,
		replyPort: 8004,
		onTimeHost: null,
		onTimePort: 4001,
		proPresenterHost: null,
		proPresenterPort: null,
		proPresenterTimer: null,
		arenaHost: null,
		arenaPort: 8080,
		campus: null,
		off: [],
		embeds: [],
		windowed: false,
		graphicsFolder: null,
		localMediaFolder: null,
	})
	assert.deepEqual(fromDisk('garbage'), DEFAULT_SETTINGS)
})

test('a patch of the wrong shape off IPC is rejected whole, never dropped quietly', () => {
	assert.equal(patchFrom({ webRemotePort: '8080' }), null)
	assert.equal(patchFrom({ replyPort: '8004' }), null)
	assert.deepEqual(patchFrom({ replyPort: null }), { replyPort: null })
	assert.equal(patchFrom(null), null)
	assert.deepEqual(patchFrom({ consoleHost: '10.11.60.40', junk: 1 }), { consoleHost: '10.11.60.40' })
})

test('the reply port follows the console port unless it is set apart', () => {
	const moved = applyPatch(DEFAULT_SETTINGS, { oscPort: 8010 })
	assert.ok(moved.ok)
	assert.equal(replyPortOf(moved.settings), 8010, 'one entry, one port, both ways: MA\'s own model')

	const apart = applyPatch(DEFAULT_SETTINGS, { replyPort: 8004 })
	assert.ok(apart.ok)
	assert.equal(apart.settings.oscPort, 8003)
	assert.equal(replyPortOf(apart.settings), 8004, 'onPC on this computer holds 8003')
})

test('a reply port set equal to the console port is stored as "same", not a copy', () => {
	// A copy would stay behind at the old number when the console port moves,
	// and replies would silently stop arriving.
	const r = applyPatch(DEFAULT_SETTINGS, { replyPort: 8003 })
	assert.ok(r.ok)
	assert.equal(r.settings.replyPort, null)
	assert.equal(fromDisk({ oscPort: 8003, replyPort: 8003 }).replyPort, null)
})

test('a bad OSC port rejects the patch and says which', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { oscPort: 70000, replyPort: Number.NaN })
	assert.ok(!r.ok)
	assert.deepEqual(Object.keys(r.errors).sort(), ['oscPort', 'replyPort'])
})

test('onPC on this computer with replies on its own port is refused, and says why', () => {
	// ✅ 2026-09-30: onPC holds every row's port, and the reply socket sits beside
	// it on 127.0.0.1, so one shared port would hand the dashboard its own commands.
	for (const host of ['127.0.0.1', 'localhost', '127.0.0.2']) {
		const r = applyPatch(DEFAULT_SETTINGS, { consoleHost: host })
		assert.ok(!r.ok, host)
		assert.match(r.errors.replyPort, /this computer/)
	}
	assert.ok(applyPatch(DEFAULT_SETTINGS, { consoleHost: '127.0.0.1', replyPort: 8004 }).ok)
	assert.ok(applyPatch(DEFAULT_SETTINGS, { consoleHost: '10.11.60.40' }).ok, 'a console elsewhere shares one port, as MA intends')
	assert.equal(isLoopback('127.0.0.1.example'), false)
	assert.equal(isLoopback('10.11.60.40'), false)
})

test('a connection turned off keeps its address, but main works as if it had none', () => {
	const on = { ...DEFAULT_SETTINGS, consoleHost: '10.11.60.40', arenaHost: '127.0.0.1', onTimeHost: '10.0.0.5' }
	const r = applyPatch(on, { off: ['arena', 'console'] })
	assert.ok(r.ok)
	assert.equal(r.settings.arenaHost, '127.0.0.1', 'the address stays, for turning it back on')
	assert.deepEqual(r.settings.off, ['console', 'arena'], 'in the tab’s order')
	const used = inUse(r.settings)
	assert.equal(used.consoleHost, null)
	assert.equal(used.arenaHost, null)
	assert.equal(used.onTimeHost, '10.0.0.5')
})

test('the off list: unknown ids are refused in a patch, and dropped whole off disk', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { off: ['arena', 'teleporter'] })
	assert.equal(r.ok, false)
	assert.ok('off' in r.errors)
	assert.equal(patchFrom({ off: 'arena' }), null, 'not a list is the wrong shape')
	assert.deepEqual(patchFrom({ off: ['video'] }), { off: ['video'] })
	assert.deepEqual(fromDisk({ off: ['video', 'video', 'ontime'] }).off, ['ontime', 'video'])
	assert.deepEqual(fromDisk({ off: ['nope'] }).off, [])
	assert.deepEqual(fromDisk({}).off, [], 'a settings file from before the switch has everything on')
})
