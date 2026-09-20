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
