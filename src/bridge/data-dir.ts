// Where the app keeps what it knows: settings, the Cue Manager's sign-in and
// offline queue, pop-out places, the kiosk log. `%APPDATA%\paua` on Windows.
//
// WHY THIS EXISTS: the app was LIFE Lighting Dashboard until 2026-10-04, and
// kept all of that in `%APPDATA%\life-lighting-dashboard`. The rename to Pāua
// moves it rather than starting fresh, because a booth must not lose its Cue
// Manager sign-in (a QR at the booth to get back) or its MA passwords.
//
// THE FOLDER MOVES WHOLE, never file by file into a fresh profile: Electron's
// safeStorage on Windows seals passwords with a key kept in the folder's own
// `Local State`, so settings.json copied without it would hold passwords
// nothing can open again.
//
// The name is set here, ASCII, not left to Electron: it would take the product
// name, `Pāua`, and a macron in a path is a hazard for every script and log
// that names it (scripts/windows/kiosk.cmd does).

import fs from 'node:fs'
import path from 'node:path'

export const DATA_DIR_NAME = 'paua'
export const OLD_DATA_DIR_NAME = 'life-lighting-dashboard'

/** What the app itself writes first; a folder without it has never been the
 *  app's profile, only somewhere kiosk.cmd put its log. */
const PROFILE_MARK = 'Local State'

export type DataDirMove =
	| { kind: 'none' }
	| { kind: 'moved'; entries: number }
	/** The move failed part way or not at all: the old folder stays in use,
	 *  so nothing is lost. A running copy of the old app holds its files. */
	| { kind: 'kept-old'; detail: string }

/** The folder to use under `appData`, moving the old one's contents in first
 *  when this is the first run since the rename. Pure filesystem: the caller
 *  hands the result to `app.setPath('userData', …)` before anything reads it. */
export function settleDataDir(appData: string): { dir: string; move: DataDirMove } {
	const dir = path.join(appData, DATA_DIR_NAME)
	const old = path.join(appData, OLD_DATA_DIR_NAME)
	if (!fs.existsSync(old) || fs.existsSync(path.join(dir, PROFILE_MARK))) return { dir, move: { kind: 'none' } }
	// The new folder may exist already, holding only kiosk.cmd's log from this
	// very start: entries already there are the new run's and stay.
	const moved: string[] = []
	try {
		fs.mkdirSync(dir, { recursive: true })
		for (const name of fs.readdirSync(old)) {
			if (fs.existsSync(path.join(dir, name))) continue
			fs.renameSync(path.join(old, name), path.join(dir, name))
			moved.push(name)
		}
		// Emptied, it goes, so nobody later reads it as the live profile.
		try {
			fs.rmdirSync(old)
		} catch {
			// Not empty (something was already in the new folder): left as it is.
		}
		return { dir, move: { kind: 'moved', entries: moved.length } }
	} catch (e) {
		// Part moved, part not, is the one state to avoid: put back what went.
		for (const name of moved) {
			try {
				fs.renameSync(path.join(dir, name), path.join(old, name))
			} catch {
				// Left where it is; the old folder is still the one used.
			}
		}
		return { dir: old, move: { kind: 'kept-old', detail: (e as Error).message } }
	}
}
