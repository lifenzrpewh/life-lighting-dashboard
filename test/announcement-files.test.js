import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { OLD_FOLDER, listPictures, numbered, placeFile, setAside } from '../dist/src/bridge/announcement-files.js'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paua-ann-'))

test('announcement files: copied whole under a number, the same left alone, a replaced one replaced', async () => {
	const src = tmp()
	const dir = tmp()
	const a = path.join(src, 'CT108-Sunday-ConnectWithUs.png')
	fs.writeFileSync(a, 'one')
	assert.equal(numbered(1, a), '01 CT108-Sunday-ConnectWithUs.png')
	const first = await placeFile(a, dir, numbered(1, a))
	assert.deepEqual(first, { ok: true, path: path.join(dir, '01 CT108-Sunday-ConnectWithUs.png'), copied: true })
	assert.equal((await placeFile(a, dir, numbered(1, a))).copied, false)
	fs.writeFileSync(a, 'one, replaced')
	assert.equal((await placeFile(a, dir, numbered(1, a))).copied, true)
	assert.equal(fs.readFileSync(first.path, 'utf8'), 'one, replaced')
	assert.deepEqual(fs.readdirSync(dir), ['01 CT108-Sunday-ConnectWithUs.png']) // no .part left
	assert.equal((await placeFile(path.join(src, 'gone.png'), dir, 'x.png')).ok, false)
})

test('announcement files: last week\'s set aside into Old, never deleted, nothing replaced there', async () => {
	const dir = tmp()
	for (const n of ['01 CT108 a.png', '05 CT290 old.png', 'notes.txt']) fs.writeFileSync(path.join(dir, n), n)
	fs.mkdirSync(path.join(dir, OLD_FOLDER))
	fs.writeFileSync(path.join(dir, OLD_FOLDER, '05 CT290 old.png'), 'older')
	assert.deepEqual(await setAside(dir, new Set(['01 CT108 a.png'])), ['05 CT290 old.png'])
	assert.deepEqual(fs.readdirSync(dir).sort(), ['01 CT108 a.png', OLD_FOLDER, 'notes.txt'])
	assert.deepEqual(fs.readdirSync(path.join(dir, OLD_FOLDER)).sort(), ['05 CT290 old (2).png', '05 CT290 old.png'])
	// The folder's pictures, as ProPresenter names them: no extension, not Old's, no notes.
	fs.writeFileSync(path.join(dir, '02 CT003 b.JPG'), 'b')
	assert.deepEqual(await listPictures(dir), ['01 CT108 a', '02 CT003 b'])
})
