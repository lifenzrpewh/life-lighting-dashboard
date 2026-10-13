import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { copyInto, downloadInto, fileUrlOf, findByCode, findMedia, pickBySize } from '../dist/src/bridge/media-files.js'
import http from 'node:http'
import { fetchRequestFrom, isFolderPath, isPlainName, runCounts, runRequestFrom } from '../dist/src/shared/media-fetch.js'
import { openWire } from '../dist/src/bridge/arena-control.js'
import { applyPatch, DEFAULT_SETTINGS } from '../dist/src/shared/settings.js'

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paua-fetch-'))

test('the lookbook file is found by name, any case, any media extension, newest first', async () => {
	const root = temp()
	fs.mkdirSync(path.join(root, '1. Central', 'Foregrounds'), { recursive: true })
	fs.mkdirSync(path.join(root, '@eaDir'))
	fs.writeFileSync(path.join(root, '1. Central', 'Foregrounds', 'CF588-Walk In V2.png'), 'old')
	fs.writeFileSync(path.join(root, '1. Central', 'cf588-walk in v2.MOV'), 'newer')
	fs.utimesSync(path.join(root, '1. Central', 'Foregrounds', 'CF588-Walk In V2.png'), new Date(2026, 0, 1), new Date(2026, 0, 1))
	// Synology's thumbnail folder and a non-media file of the same name: never.
	fs.writeFileSync(path.join(root, '@eaDir', 'CF588-Walk In V2.png'), 'thumb')
	fs.writeFileSync(path.join(root, 'CF588-Walk In V2.txt'), 'notes')
	const r = await findMedia(root, 'CF588-Walk In V2')
	assert.ok(r.ok)
	assert.deepEqual(
		r.found.map((f) => path.relative(root, f.path)),
		[path.join('1. Central', 'cf588-walk in v2.MOV'), path.join('1. Central', 'Foregrounds', 'CF588-Walk In V2.png')],
	)
	assert.deepEqual((await findMedia(root, 'CF999')).found, [])
	assert.equal((await findMedia(path.join(root, 'nope'), 'x')).ok, false)
	assert.match((await findMedia(root, 'x', { limit: 2 })).detail, /more than 2/)
})

test('a copy lands whole, is reused when the same, and never overwrites a different file', async () => {
	const from = temp()
	const to = temp()
	const src = path.join(from, 'CB095 Loop.mov')
	fs.writeFileSync(src, Buffer.alloc(300_000, 7))
	const seen = []
	const first = await copyInto(src, to, (done, total) => seen.push([done, total]))
	assert.deepEqual(first, { ok: true, path: path.join(to, 'CB095 Loop.mov'), copied: true })
	assert.equal(fs.readFileSync(first.path).length, 300_000)
	assert.deepEqual(seen.at(-1), [300_000, 300_000])
	assert.deepEqual(fs.readdirSync(to), ['CB095 Loop.mov']) // no .partial left
	assert.deepEqual(await copyInto(src, to, () => {}), { ok: true, path: first.path, copied: false })
	fs.writeFileSync(first.path, 'someone else’s file')
	const clash = await copyInto(src, to, () => {})
	assert.equal(clash.ok, false)
	assert.match(clash.detail, /nothing was overwritten/)
	assert.equal(fs.readFileSync(first.path, 'utf8'), 'someone else’s file')
	assert.match((await copyInto(src, path.join(to, 'missing'), () => {})).detail, /not there/)
})

test('a copy cut off before leaves no half file behind for the next', async () => {
	const from = temp()
	const to = temp()
	const src = path.join(from, 'CA001.png')
	fs.writeFileSync(src, 'whole')
	fs.writeFileSync(path.join(to, 'CA001.png.partial'), 'half')
	assert.equal((await copyInto(src, to, () => {})).ok, true)
	assert.deepEqual(fs.readdirSync(to), ['CA001.png'])
})

test('Arena is given a file:/// address, spaces encoded', () => {
	const url = fileUrlOf(path.resolve('Media dir', 'CF588 Walk In.mov'))
	assert.match(url, /^file:\/\/\//)
	assert.match(url, /Media%20dir\/CF588%20Walk%20In\.mov$/)
})

test('a request from the page is a code, a plain name and clips, and nothing else', () => {
	const lib = '/storage/library/C/CF588-Sunday-ReloSeries-WalkInV2_1789857226772.png'
	assert.deepEqual(fetchRequestFrom({ code: 'CF588', want: 'CF588-Walk In V2', clipIds: [12, 13, 12], lookbookPath: lib, allowLookbook: true, allowLive: [13] }), {
		code: 'CF588',
		want: 'CF588-Walk In V2',
		clipIds: [12, 13],
		lookbookPath: lib,
		allowLookbook: true,
		allowLive: [13],
	})
	assert.deepEqual(fetchRequestFrom({ code: 'CF588', want: 'x', clipIds: [], lookbookPath: null, allowLookbook: false, allowLive: [] }).clipIds, [])
	// A live yes only for a clip the request names.
	assert.equal(fetchRequestFrom({ code: 'CF588', want: 'x', clipIds: [12], lookbookPath: null, allowLookbook: false, allowLive: [14] }), null)
	assert.equal(fetchRequestFrom({ code: 'CF588', want: 'x', clipIds: [12], lookbookPath: null, allowLookbook: false }), null)
	for (const bad of [
		null,
		{ code: 'cf588', want: 'x', clipIds: [1] },
		{ code: 'CF588', want: '..\\..\\Windows\\x', clipIds: [1] },
		{ code: 'CF588', want: 'C:x', clipIds: [1] },
		{ code: 'CF588', want: 'x', clipIds: [-1] },
		{ code: 'CF588', want: 'x', clipIds: 12 },
		{ code: 'CF588', want: 'x', clipIds: Array.from({ length: 101 }, (_, i) => i + 1) },
		{ code: 'CF588', want: 'x' },
		// The lookbook file must be a library file, and the code's.
		{ code: 'CF588', want: 'x', clipIds: [], lookbookPath: '/storage/library/C/CF589-x_1.png', allowLookbook: false },
		{ code: 'CF588', want: 'x', clipIds: [], lookbookPath: 'https://elsewhere/CF588.png', allowLookbook: false },
		{ code: 'CF588', want: 'x', clipIds: [], lookbookPath: '/storage/library/C/../CF588.png', allowLookbook: false },
		{ code: 'CF588', want: 'x', clipIds: [], lookbookPath: null },
	]) {
		assert.equal(fetchRequestFrom(bad), null, JSON.stringify(bad))
	}
	assert.equal(isPlainName('..'), false)
})

test('folder settings are whole paths, and the copies have a folder of their own', () => {
	for (const ok of ['D:\\VFX Media', 'D:/Media', '\\\\LC-NAS-01\\Graphics\\Sunday Media', '/Volumes/Graphics']) assert.ok(isFolderPath(ok), ok)
	for (const bad of ['Media', 'D:', '\\\\NAS', 'C:\\a\u0000b']) assert.equal(isFolderPath(bad), false, bad)
	const r = applyPatch(DEFAULT_SETTINGS, { graphicsFolder: ' \\\\NAS\\Graphics ', localMediaFolder: 'D:\\VFX' })
	assert.ok(r.ok)
	assert.deepEqual([r.settings.graphicsFolder, r.settings.localMediaFolder], ['\\\\NAS\\Graphics', 'D:\\VFX'])
	assert.equal(applyPatch(DEFAULT_SETTINGS, { graphicsFolder: 'D:\\VFX\\', localMediaFolder: 'd:\\vfx' }).ok, false)
	assert.equal(applyPatch(DEFAULT_SETTINGS, { localMediaFolder: 'VFX' }).ok, false)
	assert.equal(applyPatch(r.settings, { graphicsFolder: null }).settings.graphicsFolder, null)
})

test('a file goes only into a clip still there and not playing, by open, never clear', () => {
	const slot = (id, state) => ({ id, name: 'x', state, thumbnail: null, file: null, missingFile: null })
	const tree = { layers: [{ id: 1, name: 'VFX 1', slots: [slot(10, 'loaded'), slot(11, 'playing'), slot(12, 'empty')] }], columns: [] }
	const url = 'file:///D:/VFX/CF588%20Walk%20In.mov'
	const ok = openWire(tree, 10, url)
	assert.deepEqual(ok.value, { kind: 'rest', calls: [{ path: '/composition/clips/by-id/10/open', body: { text: url } }] })
	assert.equal(openWire(tree, 12, url).ok, true) // an empty slot takes a file too
	assert.match(openWire(tree, 11, url).detail, /playing/)
	// Only with the operator's yes to that clip on screen.
	assert.equal(openWire(tree, 11, url, true).ok, true)
	assert.match(openWire(tree, 99, url).detail, /no longer/)
	assert.equal(openWire(tree, 10, 'http://evil/x').ok, false)
	assert.doesNotMatch(ok.value.calls[0].path, /clear/)
})

test('on the drive, a code is found anywhere in a name; the one of the lookbook\'s size wins, a copy last', async () => {
	const root = temp()
	fs.mkdirSync(path.join(root, '1. Central'), { recursive: true })
	const put = (name, bytes) => fs.writeFileSync(path.join(root, '1. Central', name), 'x'.repeat(bytes))
	put('CF449-Sunday-Bibles.png', 10)
	put('CF449-Sunday-Bibles - Copy.png', 10)
	put('Bibles CF449 old.png', 7)
	put('CF4491-other.png', 10)
	put('CB095-Sunday-RelationshipSeries-v4.jpg', 20)
	const found = await findByCode(root, 'CF449')
	assert.ok(found.ok)
	assert.equal(found.found.length, 3)
	const pick = pickBySize(found.found, 10)
	assert.equal(path.basename(pick.pick.path), 'CF449-Sunday-Bibles.png')
	// The drive has the code, but not the lookbook's version.
	assert.deepEqual(pickBySize((await findByCode(root, 'CB095')).found, 19), { pick: null, why: 'other-version' })
	assert.deepEqual(pickBySize((await findByCode(root, 'CF464')).found, 10), { pick: null, why: 'not-there' })
	assert.equal((await findByCode(root, 'C.*')).ok, false)
})

test('a lookbook download is whole or not at all, and never overwrites', async () => {
	const body = Buffer.from('lookbook bytes')
	const server = http.createServer((req, res) => {
		if (req.url === '/short') {
			res.writeHead(200, { 'content-length': String(body.length) })
			res.end(body.subarray(0, 4))
			return
		}
		res.writeHead(req.url === '/ok' ? 200 : 404)
		res.end(req.url === '/ok' ? body : '')
	})
	await new Promise((r) => server.listen(0, '127.0.0.1', r))
	const base = `http://127.0.0.1:${server.address().port}`
	try {
		const to = temp()
		const seen = []
		const first = await downloadInto(`${base}/ok`, to, 'CF464-Sunday-EXP-NextStepsLounge.png', body.length, (d, t) => seen.push([d, t]))
		assert.equal(first.ok, true)
		assert.equal(first.copied, true)
		assert.equal(fs.readFileSync(first.path, 'utf8'), 'lookbook bytes')
		assert.deepEqual(seen.at(-1), [body.length, body.length])
		// Again: the same file is there, so it is used.
		assert.deepEqual(await downloadInto(`${base}/ok`, to, 'CF464-Sunday-EXP-NextStepsLounge.png', body.length, () => {}), { ok: true, path: first.path, copied: false })
		// Another size under that name is left alone.
		assert.match((await downloadInto(`${base}/ok`, to, 'CF464-Sunday-EXP-NextStepsLounge.png', 99, () => {})).detail, /nothing was overwritten/)
		// A 404 or a short answer leaves nothing behind.
		assert.match((await downloadInto(`${base}/gone`, to, 'a.png', 5, () => {})).detail, /answered 404/)
		assert.equal((await downloadInto(`${base}/short`, to, 'b.png', body.length, () => {})).ok, false)
		assert.deepEqual(fs.readdirSync(to).sort(), ['CF464-Sunday-EXP-NextStepsLounge.png'])
	} finally {
		server.close()
	}
})

test('a run is a label, checked requests, its plan and a count; its result counted from the fetches', () => {
	const req = { code: 'CF465', want: 'CF465-Sunday-EXP-NextStepsUpstairs', clipIds: [7], lookbookPath: null, allowLookbook: false, allowLive: [] }
	assert.deepEqual(runRequestFrom({ label: 'Update all: 1 step', requests: [req], plan: ['CF465 into HOLD FG · NSL'], already: 3 }).requests, [req])
	assert.equal(runRequestFrom({ label: 'x', requests: [{ ...req, code: '../x' }], plan: [], already: 0 }), null)
	assert.equal(runRequestFrom({ label: 'x', requests: [req], plan: 'no', already: 0 }), null)
	assert.equal(runRequestFrom({ label: 'x', requests: [req], plan: [], already: -1 }), null)
	const run = { id: 1, label: 'Update all: 4 steps', at: 1000, codes: ['CF001', 'CF002', 'CF003', 'CF004'], already: 2, refused: { CF005: 'busy' }, ended: null }
	const states = {
		CF001: { state: 'sent', file: 'a', clips: 1, from: 'drive', at: 2000 },
		CF002: { state: 'sent', file: 'b', clips: 1, from: 'drive', doubted: 'Arena answered 404', at: 2000 },
		CF003: { state: 'failed', detail: 'nope', at: 2000 },
		// An older run's result is not this run's.
		CF004: { state: 'sent', file: 'd', clips: 1, from: 'drive', at: 500 },
	}
	assert.deepEqual(runCounts(run, states), { loaded: 2, failed: 2, copied: 0, going: 1, doubted: 1 })
})
