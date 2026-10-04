import test from 'node:test'
import assert from 'node:assert/strict'

import { embedIdOf, embedUrlOf, embedView, embedsFrom, newEmbedId, zoomStep } from '../dist/src/shared/embeds.js'
import { applyPatch, DEFAULT_SETTINGS, fromDisk } from '../dist/src/shared/settings.js'
import { embedStatus, viewIsOn } from '../dist/src/shared/connections.js'
import { isNative, isViewId, layoutFrom, viewLabel } from '../dist/src/shared/layout.js'

const sheet = { id: 'abc123', name: 'Run sheet', url: 'https://docs.google.com/spreadsheets/d/x', on: true }

test('an address is a web page, with https:// added as a browser does', () => {
	assert.equal(embedUrlOf('docs.google.com/spreadsheets/d/x'), 'https://docs.google.com/spreadsheets/d/x')
	assert.equal(embedUrlOf('  http://10.0.0.5:8080/ '), 'http://10.0.0.5:8080/')
	for (const bad of ['', 'file:///C:/x', 'javascript:alert(1)', 'two words', 'https://']) assert.equal(embedUrlOf(bad), null, bad)
})

test('a stored list of embeds is all good or nothing', () => {
	assert.deepEqual(embedsFrom([sheet]), [sheet])
	assert.deepEqual(embedsFrom([{ ...sheet, name: '  Run sheet ' }]), [sheet])
	for (const bad of [
		null,
		'x',
		[{ ...sheet, id: 'A B' }],
		[{ ...sheet, name: '' }],
		[{ ...sheet, url: 'docs.google.com' }], // stored addresses are whole
		[{ ...sheet, on: 'yes' }],
		[sheet, sheet], // one id twice
	]) {
		assert.equal(embedsFrom(bad), null, JSON.stringify(bad))
	}
})

test('settings keep embeds, and a bad one on disk costs only the embeds', () => {
	const r = applyPatch(DEFAULT_SETTINGS, { embeds: [sheet] })
	assert.ok(r.ok)
	assert.deepEqual(r.settings.embeds, [sheet])
	assert.equal(applyPatch(DEFAULT_SETTINGS, { embeds: [{ ...sheet, url: 'ftp://x' }] }).ok, false)
	const disk = fromDisk({ consoleHost: '10.11.60.40', embeds: [{ id: '!' }] })
	assert.deepEqual(disk.embeds, [])
	assert.equal(disk.consoleHost, '10.11.60.40')
})

test('zoom moves by steps, and 0 is 100 %', () => {
	assert.equal(zoomStep(1, 1), 1.1)
	assert.equal(zoomStep(1, -1), 0.9)
	assert.equal(zoomStep(2, 1), 2)
	assert.equal(zoomStep(0.5, -1), 0.5)
	assert.equal(zoomStep(1.05, 1), 1.1)
	assert.equal(zoomStep(1.05, -1), 1)
	assert.equal(zoomStep(1.5, 0), 1)
})

test('an embed is a view: native, named by itself, kept in a stored layout', () => {
	const view = embedView('abc123')
	assert.equal(embedIdOf(view), 'abc123')
	assert.ok(isViewId(view))
	assert.ok(isNative(view) && isNative('ma') && isNative('cue') && !isNative('arena'))
	assert.equal(viewLabel(view, [sheet]), 'Run sheet')
	assert.equal(viewLabel(view, []), 'Embed')
	assert.equal(layoutFrom(JSON.stringify({ left: view, right: 'ma' })).windows[0].tabs[0].view, view)
	assert.equal(isViewId('embed:'), false)
})

test('an embed view is on only while its embed exists and is on', () => {
	const view = embedView('abc123')
	assert.equal(viewIsOn(view, [], [sheet]), true)
	assert.equal(viewIsOn(view, [], [{ ...sheet, on: false }]), false)
	assert.equal(viewIsOn(view, [], []), false)
	assert.equal(viewIsOn('ma', ['console'], [sheet]), false)
})

test('its row: loaded, loading, not loading; not on screen is not down', () => {
	assert.equal(embedStatus(sheet, null).tone, 'off')
	assert.equal(embedStatus(sheet, { state: 'idle', url: sheet.url }).status, 'not on screen')
	assert.equal(embedStatus(sheet, { state: 'showing', url: sheet.url, since: 0 }).status, 'loaded')
	assert.equal(embedStatus(sheet, { state: 'connecting', url: sheet.url, since: 0 }).status, 'loading')
	const failed = embedStatus(sheet, { state: 'failed', url: sheet.url, at: 0, cause: 'error', detail: 'ERR_NAME_NOT_RESOLVED', retryAt: 0 })
	assert.deepEqual([failed.tone, failed.status], ['down', 'not loading'])
	assert.equal(embedStatus({ ...sheet, on: false }, null).status, 'turned off')
	assert.equal(embedStatus(sheet, null).id, 'embed:abc123')
})

test('new ids are valid ids', () => {
	for (const r of [0, 0.5, 0.999999]) assert.ok(embedsFrom([{ ...sheet, id: newEmbedId(Date.now(), r) }]))
})
