#!/usr/bin/env node
// Builds the export-sync blacklist from the local gma3_library, with no desk.
//
// `Export Sequence` hard-crashes the console on a cue Part carrying stored
// SelectionData (MA3_SYNTAX_REFERENCE.md:568, ❌ verified 2026-08-27). Any
// sequence already known to contain SelectionData must never be re-exported.
// This finds them from exports that already exist, plus any surviving crash
// artifacts, and writes a blacklist the bridge loads at startup.
//
// Run: node spikes/scan-exports.mjs [--lib <path>] [--out blacklist.json]

import fs from 'node:fs'
import path from 'node:path'

import { findLibrary } from '../scripts/ma3-library.mjs'
import os from 'node:os'
import process from 'node:process'
import { parseSequenceExport } from '../dist/src/bridge/export-parse.js'

const arg = (n, d) => {
	const i = process.argv.indexOf(`--${n}`)
	return i === -1 ? d : process.argv[i + 1]
}
const LIB = arg('lib', findLibrary('sequences') ?? '')
const OUT = arg('out', 'export-blacklist.json')

if (!fs.existsSync(LIB)) {
	console.error(`No sequence library at ${LIB}`)
	process.exit(1)
}

const files = fs.readdirSync(LIB).filter((f) => f.endsWith('.xml')).sort()
const risky = []
const artifacts = []
const other = []
let ok = 0
let bytes = 0

for (const f of files) {
	const full = path.join(LIB, f)
	bytes += fs.statSync(full).size
	const r = parseSequenceExport(fs.readFileSync(full, 'utf8'))
	if (!r.ok) {
		;(r.reason === 'truncated' ? artifacts : other).push({ file: f, reason: r.reason, detail: r.detail })
		continue
	}
	ok += 1
	for (const s of r.sequences) {
		const parts = s.cues.flatMap((c) => c.parts)
		if (parts.some((p) => p.hasSelectionData)) {
			risky.push({ file: f, sequence: s.name, cues: s.cues.length })
		}
	}
}

console.log(`scanned ${files.length} files (${(bytes / 1048576).toFixed(0)} MB), ${ok} parsed\n`)

console.log(`CRASH RISK — these hold SelectionData; re-exporting one can kill the console:`)
for (const r of risky) console.log(`   ${r.sequence ?? '?'}  (${r.file}, ${r.cues} cues)`)

console.log(`\nCRASH ARTIFACTS — truncated files left behind by a previous crash:`)
if (artifacts.length === 0) console.log('   none')
for (const a of artifacts) console.log(`   ${a.file}  ${a.detail}`)

if (other.length > 0) {
	console.log(`\nOTHER PARSE FAILURES:`)
	for (const o of other) console.log(`   ${o.file}  ${o.reason}: ${o.detail}`)
}

const blacklist = {
	generatedAt: new Date().toISOString(),
	library: LIB,
	note: 'Sequences that must never be re-exported. See MA3_SYNTAX_REFERENCE.md:568.',
	bySequenceName: [...new Set(risky.map((r) => r.sequence).filter(Boolean))].sort(),
	artifactFiles: artifacts.map((a) => a.file).sort(),
}
fs.writeFileSync(OUT, JSON.stringify(blacklist, null, 2) + '\n')
console.log(`\nwrote ${OUT} — ${blacklist.bySequenceName.length} sequence(s) blacklisted`)
