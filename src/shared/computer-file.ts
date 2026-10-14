// A computer's setup in one file, to set another booth up from (the owner's
// pick, 2026-10-14): Settings › This computer › To a file, From a file.
//
// What it carries: the settings (addresses, folders, embeds, video sources,
// Admin's timeout and Show mode's lock), and what this computer keeps in its
// page's storage that is setup rather than the moment: the layout on screen,
// the saved layouts, the top bar's hidden items, the Holding map and presets.
//
// What it never carries: the MA passwords (sealed to this computer's keystore,
// and not to be written in the clear), Admin's passcode, the Cue Manager's and
// embeds' sign-ins (their sessions are the computer's), per-service state
// (pins, the service picked) and the moment's (Show mode, the folded bar).
//
// THE RULE THIS FILE ENFORCES: a file is read whole or not at all, and what it
// would change is said before anything changes. Its settings go through the
// same checks as a save in Settings (`applyPatch`); each stored item is read
// back by its own store on the next start, which falls back on its own if it
// does not check out.

export const COMPUTER_FILE_KIND = 'paua-computer'
export const COMPUTER_FILE_VERSION = 1
/** A setup file is small; anything this size is not one. */
export const COMPUTER_FILE_MAX = 2_000_000

/** The page's stored items a setup file carries, with what each is in words. */
export const COMPUTER_LOCAL: Readonly<Record<string, string>> = {
	'life.layout': 'the layout on screen',
	'paua.layouts': 'the saved layouts',
	'paua.barHidden': 'the top bar’s hidden items',
	'paua.holdingMap': 'the Holding map',
	'paua.holdingPresets': 'the Holding presets',
}
const LOCAL_ITEM_MAX = 256_000

export type ComputerFile = {
	kind: typeof COMPUTER_FILE_KIND
	version: typeof COMPUTER_FILE_VERSION
	/** The Pāua version that wrote it. */
	app: string
	exportedAt: string
	/** Settings as on disk, with no secret in them. */
	settings: Record<string, unknown>
	local: Record<string, string>
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The page's stored items, only those a file carries, each a string. Null if
 *  anything else is in it. */
export function computerLocalFrom(v: unknown): Record<string, string> | null {
	if (!isObject(v)) return null
	const out: Record<string, string> = {}
	for (const [k, s] of Object.entries(v)) {
		if (!Object.prototype.hasOwnProperty.call(COMPUTER_LOCAL, k) || typeof s !== 'string' || s.length > LOCAL_ITEM_MAX) return null
		out[k] = s
	}
	return out
}

/** Keys a settings record must never carry into a file. */
const SECRET_KEYS = ['secrets', 'adminPasscode', 'volunteerPassword', 'operatorPassword']

export function computerFile(app: string, settings: Record<string, unknown>, local: Record<string, string>, at: Date): ComputerFile {
	const clean = Object.fromEntries(Object.entries(settings).filter(([k]) => !SECRET_KEYS.includes(k)))
	return { kind: COMPUTER_FILE_KIND, version: COMPUTER_FILE_VERSION, app, exportedAt: at.toISOString(), settings: clean, local }
}

export function computerFileFrom(text: string): { ok: true; file: ComputerFile } | { ok: false; detail: string } {
	let raw: unknown
	try {
		raw = JSON.parse(text)
	} catch {
		return { ok: false, detail: 'That file is not a Pāua setup file (it does not read as one).' }
	}
	if (!isObject(raw) || raw['kind'] !== COMPUTER_FILE_KIND) return { ok: false, detail: 'That file is not a Pāua setup file.' }
	if (raw['version'] !== COMPUTER_FILE_VERSION) return { ok: false, detail: 'That setup file is from a newer Pāua: update this one first.' }
	const { app, exportedAt, settings, local } = raw
	if (typeof app !== 'string' || typeof exportedAt !== 'string' || !isObject(settings)) return { ok: false, detail: 'That setup file is damaged.' }
	if (SECRET_KEYS.some((k) => k in settings)) return { ok: false, detail: 'That setup file carries a password, which a setup file never should.' }
	const items = computerLocalFrom(local)
	if (items === null) return { ok: false, detail: 'That setup file is damaged (its stored items).' }
	return { ok: true, file: { kind: COMPUTER_FILE_KIND, version: COMPUTER_FILE_VERSION, app, exportedAt, settings, local: items } }
}
