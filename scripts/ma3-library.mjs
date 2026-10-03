// Where grandMA3 keeps its library, per platform.
//
// WHY THIS EXISTS: the tests read the operator's real exported sequences. On
// macOS that lives under the home directory; on Windows MA3 commonly puts it in
// ProgramData instead. Hard-coding the macOS shape meant the export-parse tests
// SKIPPED SILENTLY on Windows — the suite still said green while the coverage
// that matters most (856 real files, the corpus that caught two wrong
// assumptions) quietly did nothing. A skip nobody notices is worse than a
// failure, which is the same principle the rest of this codebase is built on.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SUFFIX = 'MALightingTechnology/gma3_library/datapools'

/** Every place the library is known to live, most likely first. */
export function libraryCandidates(pool) {
	const rel = `${SUFFIX}/${pool}`
	const out = [path.join(os.homedir(), rel)]
	if (process.platform === 'win32') {
		const pd = process.env['ProgramData'] ?? 'C:\\ProgramData'
		out.push(path.join(pd, rel))
	}
	return out
}

/** The first candidate that exists, or null. Null means "not on this machine",
 *  which callers must report — never treat as "the library is empty". */
export function findLibrary(pool) {
	return libraryCandidates(pool).find((p) => fs.existsSync(p)) ?? null
}

/** The library's exports, for the tests that read them: the directory when it
 *  holds any, or why not, in words the test run prints as its skip reason.
 *  Present but empty is the normal state of a fresh Windows box (MA3
 *  installed, the exports never copied across) and is said as that, not
 *  failed as "expected a large corpus, got 0", which reads like a broken
 *  parser. A directory with exports that parse to nothing still fails. */
export function findCorpus(pool) {
	const dir = findLibrary(pool)
	if (dir === null) return { dir: null, why: `no MA3 library on this machine (looked in ${libraryCandidates(pool).join(', ')})` }
	const exports = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xml')).length
	if (exports === 0) return { dir: null, why: `the MA3 library at ${dir} holds no exports; copy the sequences across to run these` }
	return { dir, why: null }
}
