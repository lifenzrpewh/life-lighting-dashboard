import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { codesIn, copyInto, downloadInto, fileUrlOf, findByCode, findByCodeIndexed, findMedia, nameKey, pickBySize, pickDriveFile } from '../dist/src/bridge/media-files.js'
import http from 'node:http'
import { fetchRequestFrom, isFolderPath, isPlainName, runCounts, runRequestFrom, undoSteps } from '../dist/src/shared/media-fetch.js'
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
	assert.equal(clash.clash, true)
	assert.equal(fs.readFileSync(first.path, 'utf8'), 'someone else’s file')
	assert.match((await copyInto(src, path.join(to, 'missing'), () => {})).detail, /not there/)

	// Replace, on an operator's say-so: the different one is moved to
	// Replaced, never deleted, and the right one copied in its place.
	const replaced = await copyInto(src, to, () => {}, true)
	assert.deepEqual(replaced, { ok: true, path: first.path, copied: true })
	assert.equal(fs.readFileSync(first.path).length, 300_000)
	const aside = fs.readdirSync(path.join(to, 'Replaced'))
	assert.equal(aside.length, 1)
	assert.match(aside[0], /^CB095 Loop \(replaced \d{4}-\d\d-\d\d \d{6}\)\.mov$/)
	assert.equal(fs.readFileSync(path.join(to, 'Replaced', aside[0]), 'utf8'), 'someone else’s file')
	// The same file already there is used, replace or not: nothing moved.
	assert.deepEqual(await copyInto(src, to, () => {}, true), { ok: true, path: first.path, copied: false })
	assert.equal(fs.readdirSync(path.join(to, 'Replaced')).length, 1)
})

test('a drive file of the lookbook\'s name is taken when none is its size', async () => {
	assert.equal(nameKey('CF588-Walk_In - Copy'), 'cf588 walk in')
	assert.equal(nameKey('cf588 walk in'), 'cf588 walk in')
	assert.equal(nameKey('CF588-Walk-In_1789857226772'), 'cf588 walk in')
	assert.notEqual(nameKey('CF588-Walk-In-v4'), nameKey('CF588-Walk-In-v5'))
	const f = (p, size, mtimeMs = 1) => ({ path: p, size, mtimeMs })
	const found = [f('/g/CF588-Walk In - Copy.mov', 40, 9), f('/g/CF588-Walk In.mov', 41, 2), f('/g/CF588-old.mov', 50, 5)]
	// The lookbook's size wins.
	assert.deepEqual(pickDriveFile(found, 50, 'CF588-Walk-In'), { pick: found[2], by: 'size' })
	// None of its size (a lookbook that says the wrong one): its name, plain before a copy.
	assert.deepEqual(pickDriveFile(found, 99, 'CF588-Walk-In'), { pick: found[1], by: 'name' })
	// No size at all: its name.
	assert.deepEqual(pickDriveFile(found, null, 'cf588_walk_in'), { pick: found[1], by: 'name' })
	// Neither: another version, or not there.
	assert.deepEqual(pickDriveFile(found, 99, 'CF588-Walk-In-v5'), { pick: null, why: 'other-version' })
	assert.deepEqual(pickDriveFile([], 99, 'CF588-Walk-In'), { pick: null, why: 'not-there' })

	// On the drive, a file of the lookbook's name is found even without the code.
	const root = temp()
	fs.writeFileSync(path.join(root, 'Walk In Loop.mov'), 'x'.repeat(7))
	fs.writeFileSync(path.join(root, 'CF588 other.mov'), 'x'.repeat(8))
	const plain = await findByCodeIndexed(root, 'CF588', { maxAgeMs: 0 })
	assert.deepEqual(plain.found.map((x) => path.basename(x.path)), ['CF588 other.mov'])
	const named = await findByCodeIndexed(root, 'CF588', { name: 'Walk-In-Loop' })
	assert.deepEqual(named.found.map((x) => path.basename(x.path)).sort(), ['CF588 other.mov', 'Walk In Loop.mov'])
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

test('one walk of the drive serves a batch of codes, finding what the single walk finds', async () => {
	const root = temp()
	fs.mkdirSync(path.join(root, '1. Central', 'deep'), { recursive: true })
	fs.mkdirSync(path.join(root, '@eaDir'))
	const put = (name, bytes) => fs.writeFileSync(path.join(root, '1. Central', name), 'x'.repeat(bytes))
	put('CF449-Sunday-Bibles.png', 10)
	put('CF449-Sunday-Bibles - Copy.png', 10)
	put('Bibles cf449 old.png', 7)
	put('CF4491-other.png', 10)
	put('XCF449-not.png', 10)
	put('CB095 and CF449 together.jpg', 20)
	put('deep/CB095-v4.mov', 5)
	put('CB095-notes.txt', 5)
	fs.writeFileSync(path.join(root, '@eaDir', 'CF449-thumb.png'), 'x')
	const sorted = (r) => r.found.map((f) => f.path).sort()
	for (const code of ['CF449', 'cb095', 'CF464']) {
		const single = await findByCode(root, code)
		const indexed = await findByCodeIndexed(root, code)
		assert.ok(single.ok && indexed.ok)
		assert.deepEqual(sorted(indexed), sorted(single), code)
		assert.equal(indexed.looked, single.looked)
	}
	assert.equal((await findByCodeIndexed(root, 'CF449')).found.length, 4)
	assert.deepEqual(codesIn('CB095 and cf449, CF4491, XCF450'), ['CB095', 'CF449'])
	assert.equal((await findByCodeIndexed(root, 'C.*')).ok, false)

	// Kept a while: a file added since is not seen by a batch's walk, and is
	// by one asked to be fresh.
	put('CF464-new.png', 3)
	assert.equal((await findByCodeIndexed(root, 'CF464')).found.length, 0)
	assert.equal((await findByCodeIndexed(root, 'CF464', { maxAgeMs: 0 })).found.length, 1)

	// A folder that cannot be reached says so, and is not kept.
	const gone = path.join(root, 'not here')
	assert.equal((await findByCodeIndexed(gone, 'CF449')).ok, false)
	fs.mkdirSync(gone)
	fs.writeFileSync(path.join(gone, 'CF449.png'), 'x')
	assert.equal((await findByCodeIndexed(gone, 'CF449')).found.length, 1)
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
	assert.deepEqual(runCounts(run, states), { loaded: 2, failed: 2, copied: 0, going: 1, doubted: 1, byHand: 0 })
	// "It's there": a failure set aside counts as loaded, by hand.
	states.CF003 = { state: 'by-hand', detail: 'Arena answered 404', at: 3000 }
	assert.deepEqual(runCounts(run, states), { loaded: 3, failed: 1, copied: 0, going: 1, doubted: 1, byHand: 1 })
})

test('a drive pick is a path string or nothing; main uses it only if its own search finds it', () => {
	const req = { code: 'CB100', want: 'CB100-Sunday-Fresh-Oil-V5', clipIds: [7], lookbookPath: null, allowLookbook: false, allowLive: [] }
	assert.equal(fetchRequestFrom({ ...req, drivePick: 'G:\\Sunday Media\\CB100-Sunday-Fresh-Oil-V5.png' }).drivePick, 'G:\\Sunday Media\\CB100-Sunday-Fresh-Oil-V5.png')
	assert.equal('drivePick' in fetchRequestFrom(req), false)
	assert.equal(fetchRequestFrom({ ...req, drivePick: 42 }), null)
	assert.equal(fetchRequestFrom({ ...req, drivePick: 'a\nb' }), null)
})

test('Undo puts each clip\'s old file back, only while it still holds the load and is not on screen', () => {
	const loaded = [
		{ clipId: 1, code: 'CF601', before: 'C:\\Media\\CF455-Old.png', after: 'D:\\Holding\\CF601-Alpha.png' },
		{ clipId: 2, code: 'CF601', before: null, after: 'D:\\Holding\\CF601-Alpha.png' },
		{ clipId: 3, code: 'CF612', before: 'C:\\Media\\CF470.png', after: 'D:\\Holding\\CF612-Story.png' },
		{ clipId: 4, code: 'CF612', before: 'C:\\Media\\CF470.png', after: 'D:\\Holding\\CF612-Story.png' },
		{ clipId: 5, code: 'CF612', before: 'C:\\Media\\CF470.png', after: 'D:\\Holding\\CF612-Story.png' },
	]
	const now = {
		1: { file: 'D:\\Holding\\cf601-alpha.png', playing: false },
		2: { file: 'D:\\Holding\\CF601-Alpha.png', playing: false },
		3: { file: 'D:\\Holding\\CF612-Story.png', playing: true },
		4: { file: 'C:\\Media\\Something-else.png', playing: false },
	}
	assert.deepEqual(
		undoSteps(loaded, (id) => now[id] ?? null).map((s) => [s.clipId, s.file, s.why]),
		[
			[1, 'C:\\Media\\CF455-Old.png', null],
			[2, null, 'it was empty before'],
			[3, null, 'it is on screen'],
			[4, null, 'it holds something else now'],
			[5, null, 'the clip is no longer in Arena'],
		],
	)
})
