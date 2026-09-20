#!/usr/bin/env node
// Build the SELF-CONTAINED plugin XML: the Lua embedded as base64, no external file.
//
// WHY THIS EXISTS: the external-file form (`<ComponentLua FileName="...">`) stores an
// ABSOLUTE path taken from the machine that imported it. Import it anywhere else and
// the plugin pool shows the row in red with `File Exists: No`, pointing at a directory
// that belongs to another computer. Observed on the desk 2026-09-21: a path under
// `/Users/joekon/...` on a console that has no such user. `Call Plugin` then does
// nothing at all — no error, no log line, just silence.
//
// The embedded form has no path to be wrong. The code travels inside the XML and
// inside the showfile, which is how every other plugin in the operator's library
// works. It also removes the whole "get a .lua onto the console's filesystem"
// problem: import the XML and you are done.
//
// FORMAT RULES, taken from Show Creator's `plugin/build_plugin_xml.py`:
//   * <Block> stride is EXACTLY 1024 raw bytes. Not a guideline — the MA3 importer
//     requires it. Only the final block may be short.
//   * <FileContent Size="N"> is the BLOCK COUNT, not a byte count.
//   * Fixed GUIDs, so re-importing UPDATES the plugin already on the desk instead of
//     adding a duplicate next to it.
//
// The body is NOT minified. Show Creator strips comment lines to keep its much larger
// generator small; here the whole point is that what runs on the desk is byte-identical
// to what is in the repo, so round-trip verification is a true identity check.

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SRC = path.join(ROOT, 'console-plugin/LifeBridge.lua')
const DEST = path.join(ROOT, 'console-plugin/LifeBridge.xml')

const BLOCK = 1024

// Distinct GUID family. Show Creator uses 5A (retired V1), 5B (published) and 5D (dev);
// 7E cannot collide with any of them, so importing this can never land on top of a
// generator plugin on a desk that carries both.
const PLUGIN_GUID = '7E 1F B3 42 10 21 32 43 54 65 76 87 98 A9 BA CB'
const COMPONENT_GUID = '7E 1F B3 42 A1 B2 C3 D4 E5 F6 07 18 29 3A 4B 5C'

const lua = fs.readFileSync(SRC)

const chunks = []
for (let i = 0; i < lua.length; i += BLOCK) chunks.push(lua.subarray(i, i + BLOCK))

// ⚠️ THE UTF-8 BOM IS REQUIRED. MA3's importer rejects the file without it, and
// the failure is silent-ish: the plugin does not appear, or appears broken, with
// nothing pointing at the cause. Every working plugin in the operator's library
// starts `EF BB BF`. Show Creator's build_plugin_xml.py carries the same literal
// U+FEFF at the head of its template — invisible in an editor, load-bearing.
// Verified the hard way on the desk, 2026-09-21: a BOM-less build would not import.
const BOM = '\uFEFF'

const xml =
	[
		BOM + '<?xml version="1.0" encoding="UTF-8"?>',
		'<GMA3 DataVersion="2.3.2.0">',
		`    <UserPlugin Name="LifeBridge" Guid="${PLUGIN_GUID}" Version="0.0.0.0">`,
		`        <ComponentLua Guid="${COMPONENT_GUID}">`,
		`            <FileContent Size="${chunks.length}">`,
		...chunks.map((c) => `                <Block Base64="${c.toString('base64')}"/>`),
		'            </FileContent>',
		'        </ComponentLua>',
		'    </UserPlugin>',
		'</GMA3>',
	].join('\n') + '\n'

// VERIFY BEFORE PUBLISHING, and land atomically. A corrupt body that reaches the desk
// is the failure class that costs a day: the plugin imports, runs, and misbehaves, and
// nothing on the console tells you the bytes are wrong. Render to a sibling .tmp, check
// THAT, then rename — so the destination only ever holds a verified file and a failure
// leaves the previous good one untouched.
const tmp = DEST + '.tmp'
fs.writeFileSync(tmp, xml, 'utf8')

const back = fs.readFileSync(tmp, 'utf8')
const decoded = [...back.matchAll(/<Block Base64="([^"]*)"\/>/g)].map((m) => Buffer.from(m[1], 'base64'))

for (let i = 0; i < decoded.length - 1; i += 1) {
	if (decoded[i].length !== BLOCK) {
		fs.unlinkSync(tmp)
		console.error(`ERROR: block ${i} is ${decoded[i].length} bytes, must be exactly ${BLOCK}`)
		process.exit(1)
	}
}
if (!Buffer.concat(decoded).equals(lua)) {
	fs.unlinkSync(tmp)
	console.error('ERROR: round-trip mismatch — the embedded body is not the source file')
	process.exit(1)
}

fs.renameSync(tmp, DEST)
console.log(`LifeBridge.xml  ${lua.length} bytes -> ${chunks.length} blocks, round-trip verified`)
