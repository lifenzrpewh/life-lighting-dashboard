import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { findCorpus } from '../scripts/ma3-library.mjs'

import { parseSequenceExport, isExportCrashRisk } from '../dist/src/bridge/export-parse.js'

// The operator's real exported library. These tests are the only thing standing
// between the parser and 856 files of genuine console output, so they run against
// the real corpus rather than fixtures. Skipped, saying why, on a machine
// without it or with the library's folder but none of its exports.
const corpus = findCorpus('sequences')
const LIB = corpus.dir
const skipLib = corpus.why ?? false
const read = (n) => fs.readFileSync(path.join(LIB, n), 'utf8')

test('synthetic: an absent CueInFade is null, not zero', () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?><GMA3 DataVersion="2.3.2.0">
		<Sequence Name="S"><Cue No="  1"><Part Guid="x"/></Cue></Sequence></GMA3>`
	const r = parseSequenceExport(xml)
	assert.equal(r.ok, true)
	// Coalescing this to 0 would tell an operator a cue snaps when it fades.
	assert.equal(r.sequences[0].cues[0].parts[0].cueInFade, null)
})

test('synthetic: a space-padded cue number is trimmed; OffCue has no number', () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?><GMA3 DataVersion="2.3.2.0">
		<Sequence Name="S">
			<Cue Name="OffCue" Release="Yes"><Part Guid="x" CueInFade="2.000"/></Cue>
			<Cue No="  12" Name="Go"><Part Guid="y" CueInFade="4.000"/></Cue>
		</Sequence></GMA3>`
	const r = parseSequenceExport(xml)
	assert.equal(r.ok, true)
	assert.equal(r.sequences[0].cues[0].no, null)
	assert.equal(r.sequences[0].cues[0].name, 'OffCue')
	assert.equal(r.sequences[0].cues[1].no, 12)
	assert.equal(r.sequences[0].cues[1].parts[0].cueInFade, 4)
})

test('synthetic: a truncated export is rejected, never returned as a short sequence', () => {
	// This is the exact shape the console leaves behind when Export Sequence
	// crashes: it stops inside SelectionData with no closing tags.
	const xml = `<?xml version="1.0" encoding="UTF-8"?><GMA3 DataVersion="2.3.2.0">
		<Sequence Name="HOUSE WHITE">
			<Cue No="  1"><Part Guid="x" CueInFade="2.000"/></Cue>
			<Cue No="  2"><Part Guid="y" Sync="Yes">
				<SelectionData Size="9">
					<Item`
	const r = parseSequenceExport(xml)
	assert.equal(r.ok, false)
	assert.equal(r.reason, 'truncated')
	assert.equal(isExportCrashRisk(r), true)
})

test('real library: the corpus parses, and only the known artifacts fail', { skip: skipLib }, () => {
	const files = fs.readdirSync(LIB).filter((f) => f.endsWith('.xml'))
	assert.ok(files.length > 800, `expected a large corpus, got ${files.length}`)

	const failed = []
	let cues = 0
	let recipes = 0
	for (const f of files) {
		const r = parseSequenceExport(read(f))
		if (!r.ok) {
			failed.push([f, r.reason])
			continue
		}
		for (const s of r.sequences)
			for (const c of s.cues) {
				cues += 1
				for (const p of c.parts) recipes += p.recipes.length
			}
	}

	// Counts are asserted as floors, not literals. The operator's library grows;
	// a hardcoded total would drift and get "fixed" by lowering it.
	assert.ok(cues > 3500, `expected >3500 cues, got ${cues}`)
	assert.ok(recipes > 3000, `expected >3000 recipe lines, got ${recipes}`)

	// The only files that may fail are the two surviving crash artifacts, and they
	// must fail as 'truncated' — not as 'malformed', and emphatically not as ok.
	assert.deepEqual(
		failed.map(([f]) => f).sort(),
		['INV_seqs_operator.xml', 'INV_seqs_operator2.xml'],
		`unexpected parse failures: ${JSON.stringify(failed)}`,
	)
	assert.ok(failed.every(([, reason]) => reason === 'truncated'))
})

test('real library: HOUSE WHITE parses but is flagged as an export crash risk', { skip: skipLib }, () => {
	// The sequence named in MA3_SYNTAX_REFERENCE.md:568 as the reproducible
	// console-killer. Its own export survived; exporting it again is what dies.
	const r = parseSequenceExport(read('house white.xml'))
	assert.equal(r.ok, true)
	assert.equal(r.sequences[0].name, 'HOUSE WHITE')
	assert.equal(isExportCrashRisk(r), true, 'must be blacklisted before any re-export')
})

test('real library: recipes keep selection and preset independently', { skip: skipLib }, () => {
	const files = fs.readdirSync(LIB).filter((f) => f.endsWith('.xml'))
	let both = 0
	let selOnly = 0
	let presetOnly = 0
	let withGroupNo = 0
	for (const f of files) {
		const r = parseSequenceExport(read(f))
		if (!r.ok) continue
		for (const s of r.sequences)
			for (const c of s.cues)
				for (const p of c.parts)
					for (const rec of p.recipes) {
						if (rec.selection && rec.preset) both += 1
						else if (rec.selection) selOnly += 1
						else if (rec.preset) presetOnly += 1
						if (rec.groupNumber !== null) withGroupNo += 1
					}
	}
	// ~19% of real recipe lines are half-populated. Modelling them as a required
	// group+preset pair would drop or corrupt them.
	assert.ok(both > 2500, `both: ${both}`)
	assert.ok(selOnly > 100, `selection-only lines must survive, got ${selOnly}`)
	assert.ok(presetOnly > 100, `preset-only lines must survive, got ${presetOnly}`)
	// Pool numbers are what make recipe editing addressable without a live read.
	assert.ok(withGroupNo > 1000, `expected group numbers recovered, got ${withGroupNo}`)
})
