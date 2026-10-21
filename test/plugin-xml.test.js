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
const BLOCK = 1024

// Two plugins since 2026-10-21: the booth's LifeBridge and the desk's probe.
const PLUGINS = [
	{ name: 'LifeBridge', lua: 'console-plugin/LifeBridge.lua', xml: 'console-plugin/LifeBridge.xml' },
	{ name: 'LifeBridgeProbe', lua: 'console-plugin/LifeBridgeProbe.lua', xml: 'console-plugin/LifeBridgeProbe.xml' },
]
const blocksOf = (xml) => [...xml.matchAll(/<Block Base64="([^"]*)"\/>/g)].map((m) => Buffer.from(m[1], 'base64'))

for (const plugin of PLUGINS) {
	const LUA = path.join(ROOT, plugin.lua)
	const XML = path.join(ROOT, plugin.xml)

	test(`${plugin.name}: the embedded XML is the current Lua, byte for byte`, () => {
		const blocks = blocksOf(fs.readFileSync(XML, 'utf8'))
		assert.ok(blocks.length > 0, 'no <Block> elements — is this still the external-file form?')
		assert.deepEqual(Buffer.concat(blocks), fs.readFileSync(LUA), `${plugin.xml} is stale. Run \`npm run build:plugin\`.`)
	})

	test(`${plugin.name}: every block but the last is exactly 1024 bytes`, () => {
		// Not a style preference — the MA3 importer requires this stride.
		const blocks = blocksOf(fs.readFileSync(XML, 'utf8'))
		for (const [i, b] of blocks.slice(0, -1).entries()) {
			assert.equal(b.length, BLOCK, `block ${i} is ${b.length} bytes`)
		}
		assert.ok(blocks.at(-1).length <= BLOCK)
	})

	test(`${plugin.name}: the file starts with a UTF-8 BOM — MA3 will not import it otherwise`, () => {
		// EF BB BF. Invisible in every editor, and required by the importer. A build
		// that loses it produces a file that looks perfect and will not load.
		const head = fs.readFileSync(XML).subarray(0, 3)
		assert.deepEqual([...head], [0xef, 0xbb, 0xbf], 'missing UTF-8 BOM')
	})

	test(`${plugin.name}: named, Size is the block count, and no external file path survives`, () => {
		const xml = fs.readFileSync(XML, 'utf8')
		assert.match(xml, new RegExp(`<UserPlugin Name="${plugin.name}" `))
		assert.match(xml, new RegExp(`<FileContent Size="${blocksOf(xml).length}">`))
		// An absolute path in here is the bug we just spent an afternoon on: it points
		// at the machine that built it, and every other console shows File Exists: No.
		assert.doesNotMatch(xml, /FileName=/, 'external-file form has come back')
		assert.doesNotMatch(xml, /\/Users\/|C:\\|Path="/, 'a machine-specific path leaked in')
	})
}

test('the two plugins never share a GUID, so importing one cannot replace the other', () => {
	const guids = PLUGINS.flatMap((p) => [...fs.readFileSync(path.join(ROOT, p.xml), 'utf8').matchAll(/Guid="([^"]*)"/g)].map((m) => m[1]))
	assert.equal(new Set(guids).size, guids.length, guids.join(', '))
})

// THE BUILD STAMP: LifeBridge's BUILD is the hash of its own code, and Pāua
// expects exactly that. Edit the Lua without `npm run build:plugin` and this
// fails, rather than a booth refusing a plugin that only differs in a comment.
test('LifeBridge carries its own stamp, and Pāua expects the same one', async () => {
	const { stampOf, stampIn } = await import('../scripts/lifebridge-stamp.mjs')
	const { LIFEBRIDGE_BUILD } = await import('../dist/src/shared/lifebridge-build.js')
	const lua = fs.readFileSync(path.join(ROOT, 'console-plugin/LifeBridge.lua'), 'utf8')
	assert.equal(stampIn(lua), stampOf(lua), 'LifeBridge.lua changed since it was stamped. Run `npm run build:plugin`.')
	assert.equal(LIFEBRIDGE_BUILD, stampIn(lua), 'src/shared/lifebridge-build.ts is stale. Run `npm run build:plugin`.')
})

test('the stamp names the code: any change to it changes the stamp', async () => {
	const { stampOf } = await import('../scripts/lifebridge-stamp.mjs')
	const lua = fs.readFileSync(path.join(ROOT, 'console-plugin/LifeBridge.lua'), 'utf8')
	assert.notEqual(stampOf(lua.replace('WATCH_EVERY_S = 1', 'WATCH_EVERY_S = 2')), stampOf(lua))
	// The stamp line itself does not feed the hash, or it could never settle.
	assert.equal(stampOf(lua.replace(/^local BUILD = '[^']*'$/m, "local BUILD = 'lb-12345678'")), stampOf(lua))
})
