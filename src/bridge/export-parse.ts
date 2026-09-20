// Parser for grandMA3 `Export Sequence` XML — channel D of the bridge.
//
// WHY THIS EXISTS: OSC gives us no way to read cue contents back. Firing
// `Export Sequence N "dash_N"` over the one-way command channel makes the console
// write a full structural dump to gma3_library/datapools/sequences/, which we then
// read. The export carries exactly our read model: cue numbers, names, trigger
// types, CueInFade, and recipe lines with their group and preset.
//
// THE RULE THIS FILE ENFORCES: a truncated export must NEVER be returned as a
// valid-but-short sequence. `Export Sequence` hard-crashes the console when a cue
// Part carries stored SelectionData (MA3_SYNTAX_REFERENCE.md:568, ❌ verified on a
// desk 2026-08-27), and it leaves behind a MALFORMED file truncated at a
// byte-identical point: inside `<SelectionData Size="9">`, at the first `<Item`,
// with no closing tags.
//
// Two such artifacts are still on disk in the operator's library right now
// (INV_seqs_operator.xml, INV_seqs_operator2.xml). If this parser were lenient it
// would report them as sequences whose cue list simply stops early — a silently
// wrong show. Hence the discriminated union below: there is no code path that
// turns a bad file into a plausible-looking result.

import { XMLParser, XMLValidator } from 'fast-xml-parser'

export type RecipeExport = {
	/** 1-based position within the Part. NOTE: deleting a line renumbers the
	 *  survivors (✅ desk-verified 2026-08-28) — never cache this across a delete. */
	line: number
	/** Object path of the selection source, e.g. "Default.Groups.Blinders". */
	selection: string | null
	/** Object path of the value source, e.g. "…PresetPools.Dimmer.At Full". */
	preset: string | null
	/** Pool number of the selection group, recovered from DependencyExport. */
	groupNumber: number | null
	enabled: boolean
}

export type PartExport = {
	/** null means the attribute was absent, i.e. the console default —
	 *  which is NOT the same as 0. Callers must not coalesce it. */
	cueInFade: number | null
	/** True when this Part stores a fixture selection. Such a Part is what
	 *  crashes `Export Sequence`; see the file header. */
	hasSelectionData: boolean
	recipes: RecipeExport[]
}

export type CueExport = {
	/** null for OffCue, which carries a Name but no No attribute. */
	no: number | null
	name: string | null
	trigType: string | null
	trigTime: number | null
	parts: PartExport[]
}

export type SequenceExport = {
	name: string | null
	cues: CueExport[]
}

export type ParseResult =
	| { ok: true; sequences: SequenceExport[] }
	| { ok: false; reason: 'truncated'; detail: string }
	| { ok: false; reason: 'malformed'; detail: string }
	| { ok: false; reason: 'empty'; detail: string }

const ARRAY_TAGS = new Set(['Sequence', 'Cue', 'Part', 'Recipe', 'Dependency', 'DependencyExport'])

/** Refuse anything implausible before parsing.
 *
 *  I first set this to 32 MB on the assumption that exports are "tens of KB".
 *  The operator's real library disproved that immediately: `all groups
 *  colors.xml` is 47 MB, `group 8 color.xml` 46 MB, and the sequences folder
 *  totals 433 MB. The bulk is inlined <DependencyExport> blocks — MA3 serialises
 *  every referenced group, preset and appearance in full, for every recipe line.
 *
 *  Consequence for the bridge: a full structure sync over channel D is expensive
 *  in console write time, disk and parse time, and cannot be treated as cheap or
 *  routine. See the /NoDependencies note in export-sync. */
const MAX_BYTES = 128 * 1024 * 1024

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@',
	// Keep every attribute a string. `No="  1"` is space-padded and CueInFade is
	// "2.000"; we want to decide what a missing vs zero value means, not the parser.
	parseAttributeValue: false,
	trimValues: true,
	isArray: (name) => ARRAY_TAGS.has(name),
	// fast-xml-parser defaults to 1,000 total entity expansions as a billion-laughs
	// guard. That default is wrong for this input and the real corpus proved it: MA3
	// quotes every object path segment with &apos;, so a ranged export holding 34
	// sequences legitimately expands ~1,002 entities and the parse threw. The guard
	// exists for untrusted network input; these files come off the console's own
	// disk, and MAX_BYTES above is the bound that actually matters here.
	processEntities: {
		enabled: true,
		maxTotalExpansions: 500_000,
		maxEntityCount: 500_000,
		maxExpandedLength: 64 * 1024 * 1024,
	},
})

/** Space-padded integers: `No="  1"`. Returns null for absent or unparseable. */
function num(v: unknown): number | null {
	if (typeof v !== 'string') return null
	const t = v.trim()
	if (t === '') return null
	const n = Number(t)
	return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
	if (typeof v !== 'string') return null
	const t = v.trim()
	return t === '' ? null : t
}

function asArray<T>(v: T | T[] | undefined): T[] {
	if (v === undefined) return []
	return Array.isArray(v) ? v : [v]
}

/**
 * Recover the group's pool number from the Recipe's dependency block.
 * The export gives object paths by NAME, but each DependencyExport carries an
 * AddressNum like "14.14.1.5.101" whose last segment is the pool slot.
 * BOUNDARIES.md warns that exports carry no pool numbers; this is the exception
 * that makes recipe editing possible without a live read.
 */
function groupNumberOf(recipe: Record<string, unknown>): number | null {
	for (const dx of asArray(recipe['DependencyExport'] as Record<string, unknown>[])) {
		for (const dep of asArray(dx?.['Dependency'] as Record<string, unknown>[])) {
			const addr = str(dep?.['@Address']) ?? str(dep?.['@RelAddr'])
			if (addr === null || !addr.includes('.Groups.')) continue
			const addrNum = str(dep?.['@AddressNum']) ?? str(dep?.['@RelAddrNum'])
			if (addrNum === null) continue
			const last = addrNum.split('.').pop()
			const n = num(last)
			if (n !== null) return n
		}
	}
	return null
}

/**
 * Detect the crash artifact specifically, so the caller can distinguish "the
 * console died writing this" from "this file is garbage for some other reason".
 * The signature is an unclosed SelectionData — see the file header.
 */
function looksTruncated(xml: string): boolean {
	const opens = (xml.match(/<SelectionData\b/g) ?? []).length
	const closes = (xml.match(/<\/SelectionData>/g) ?? []).length
	if (opens > closes) return true
	// A healthy export closes its root. Anything that stops mid-element is suspect.
	return !/<\/GMA3>\s*$/.test(xml)
}

export function parseSequenceExport(xml: string): ParseResult {
	if (xml.trim() === '') return { ok: false, reason: 'empty', detail: 'file is empty' }
	if (xml.length > MAX_BYTES) {
		return { ok: false, reason: 'malformed', detail: `file exceeds ${MAX_BYTES} bytes` }
	}

	// Strip the UTF-8 BOM the console writes; the validator chokes on it.
	const text = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml

	const valid = XMLValidator.validate(text)
	if (valid !== true) {
		const detail = `${valid.err.code}: ${valid.err.msg} (line ${valid.err.line})`
		return looksTruncated(text)
			? { ok: false, reason: 'truncated', detail }
			: { ok: false, reason: 'malformed', detail }
	}
	// Well-formed XML can still be a truncated export if the console happened to
	// stop on an element boundary, so check the shape too rather than trusting
	// well-formedness alone.
	if (looksTruncated(text)) {
		return { ok: false, reason: 'truncated', detail: 'unclosed SelectionData or missing </GMA3>' }
	}

	const doc = parser.parse(text) as Record<string, any>
	const root = doc['GMA3']
	if (root === undefined) return { ok: false, reason: 'malformed', detail: 'no <GMA3> root' }

	const sequences: SequenceExport[] = []
	// A file usually holds one sequence, but a ranged export holds many
	// (the operator's INV_seqs_* bundles hold 9 and 34).
	for (const seq of asArray(root['Sequence'] as Record<string, any>[])) {
		const cues: CueExport[] = []
		for (const cue of asArray(seq?.['Cue'] as Record<string, any>[])) {
			const parts: PartExport[] = []
			for (const part of asArray(cue?.['Part'] as Record<string, any>[])) {
				const recipes: RecipeExport[] = []
				let line = 0
				for (const rec of asArray(part?.['Recipe'] as Record<string, any>[])) {
					line += 1
					// Selection and Preset are INDEPENDENTLY optional. Across the
					// operator's 3,862 real recipe lines: 3,128 have both, 386 have
					// only a selection, 346 only a preset, 2 neither. Assuming a
					// group/preset pair would drop or corrupt ~19% of them.
					recipes.push({
						line,
						selection: str(rec?.['@Selection']),
						preset: str(rec?.['@Preset']),
						groupNumber: groupNumberOf(rec ?? {}),
						enabled: str(rec?.['@Enabled']) !== 'No',
					})
				}
				parts.push({
					cueInFade: num(part?.['@CueInFade']),
					hasSelectionData: part?.['SelectionData'] !== undefined,
					recipes,
				})
			}
			cues.push({
				no: num(cue?.['@No']),
				name: str(cue?.['@Name']),
				trigType: str(cue?.['@TrigType']),
				trigTime: num(cue?.['@TrigTime']),
				parts,
			})
		}
		sequences.push({ name: str(seq?.['@Name']), cues })
	}

	if (sequences.length === 0) {
		return { ok: false, reason: 'malformed', detail: 'no <Sequence> elements' }
	}
	return { ok: true, sequences }
}

/**
 * Pre-flight check for the export-sync. A sequence whose Parts carry
 * SelectionData is the documented console-killer, so the sync blacklists it
 * rather than re-attempting the export that produced it.
 */
export function isExportCrashRisk(result: ParseResult): boolean {
	if (!result.ok) return result.reason === 'truncated'
	return result.sequences.some((s) => s.cues.some((c) => c.parts.some((p) => p.hasSelectionData)))
}
