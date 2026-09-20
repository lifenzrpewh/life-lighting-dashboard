import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

// THE TRAP THIS GUARDS: the XML carries a COPY of the Lua. Edit LifeBridge.lua,
// forget to rebuild, and the desk imports yesterday's code while the repo shows
// today's. Nothing on the console reveals this — the plugin runs, it just runs
// the wrong body, and you debug the source you are reading instead of the source
// that is executing. That is a day gone.
const ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)))
const LUA = path.join(ROOT, 'console-plugin/LifeBridge.lua')
const XML = path.join(ROOT, 'console-plugin/LifeBridge.xml')
const BLOCK = 1024

test('the embedded XML is the current LifeBridge.lua, byte for byte', () => {
	const lua = fs.readFileSync(LUA)
	const xml = fs.readFileSync(XML, 'utf8')
	const blocks = [...xml.matchAll(/<Block Base64="([^"]*)"\/>/g)].map((m) => Buffer.from(m[1], 'base64'))

	assert.ok(blocks.length > 0, 'no <Block> elements — is this still the external-file form?')
	assert.deepEqual(
		Buffer.concat(blocks),
		lua,
		'LifeBridge.xml is stale. Run `npm run build:plugin`.',
	)
})

test('every block but the last is exactly 1024 bytes', () => {
	// Not a style preference — the MA3 importer requires this stride.
	const xml = fs.readFileSync(XML, 'utf8')
	const blocks = [...xml.matchAll(/<Block Base64="([^"]*)"\/>/g)].map((m) => Buffer.from(m[1], 'base64'))
	for (const [i, b] of blocks.slice(0, -1).entries()) {
		assert.equal(b.length, BLOCK, `block ${i} is ${b.length} bytes`)
	}
	assert.ok(blocks.at(-1).length <= BLOCK)
})

test('the file starts with a UTF-8 BOM — MA3 will not import it otherwise', () => {
	// EF BB BF. Invisible in every editor, and required by the importer. A build
	// that loses it produces a file that looks perfect and will not load.
	const head = fs.readFileSync(XML).subarray(0, 3)
	assert.deepEqual([...head], [0xef, 0xbb, 0xbf], 'missing UTF-8 BOM')
})

test('Size is the block count, and no external file path survives', () => {
	const xml = fs.readFileSync(XML, 'utf8')
	const blocks = [...xml.matchAll(/<Block Base64="([^"]*)"\/>/g)]
	assert.match(xml, new RegExp(`<FileContent Size="${blocks.length}">`))

	// An absolute path in here is the bug we just spent an afternoon on: it points
	// at the machine that built it, and every other console shows File Exists: No.
	assert.doesNotMatch(xml, /FileName=/, 'external-file form has come back')
	assert.doesNotMatch(xml, /\/Users\/|C:\\|Path="/, 'a machine-specific path leaked in')
})
