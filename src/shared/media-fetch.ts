// Fetching media the check found wrong (docs/VISUALS_DASHBOARD.md § Fetching
// media): copy the lookbook's file from the graphics folder down to this
// computer, then load it into Arena's clip.
//
// The owner, 2026-10-05: two settings, a graphics folder and a local folder,
// and the question was whether Pāua could put a file INTO Arena at all. It
// can: ✅ Arena 7.28, 2026-10-05, `POST /composition/clips/by-id/<id>/open`
// with the body `file:///C:/…/ZZ999%20Paua%20test.png` answered 204, and the
// clip read back with that file, named after it, not playing. Arena's own API
// says it "will retain settings as much as possible", so a new version goes
// into the old one's clip keeping its fades and effects (⚠️ not yet watched).
//
// What each check result gets:
// - may differ, or the file missing on this computer: found, copied, and
//   loaded into every clip that has the old one (./holding.ts, clipsToUpdate);
// - not in Arena at all: placed in the slot the operator confirmed (a home
//   ./holding.ts suggests), or copied only.
//
// THE RULES THIS FILE ENFORCES, with ../bridge/media-files.ts and
// ../main/media-fetch.ts:
// - The graphics folder is only ever read. Nothing is written or deleted
//   there.
// - Nothing is overwritten: a file of the same name already in the local
//   folder is used if it is the same size, and otherwise left alone and said.
// - Never into a clip that is playing: checked against the composition at the
//   moment of sending (../bridge/arena-control.ts).
// - The page names a code, the file name the lookbook gave and a clip id, and
//   nothing else. Main finds the file and builds every path itself.
// - Sent is not done: the media check's own reading of Arena says when the
//   clip has the new file.

export type FetchRequest = {
	code: string
	/** The lookbook's file name, without folder or extension (`lookbookStem`). */
	want: string
	/** The clips to load it into: every clip with the old file, or the one
	 *  slot a new code is placed in. None copies only. */
	clipIds: number[]
	/** The lookbook's file for it (`/storage/library/C/…`): what the drive's
	 *  file must match in size, and what is downloaded when the drive has none. */
	lookbookPath: string | null
	/** Download from the lookbook when the drive has no matching file. Only
	 *  when the operator said so at the confirmation (the owner, 2026-10-05). */
	allowLookbook: boolean
}

/** Where a code's file will come from, said at the confirmation before
 *  anything is sent. */
export type MediaSource =
	| { from: 'drive'; file: string }
	/** Not on the drive, or the drive's is another version: only with the
	 *  operator's yes. */
	| { from: 'lookbook'; why: string }
	| { from: 'none'; detail: string }

/** A lookbook library file, any media type: `/storage/library/C/CF588-…_1789857226772.png`. */
export const LIBRARY_FILE = /^\/storage\/library\/[A-Za-z]\/[^/\\]{1,200}\.[A-Za-z0-9]{2,5}$/

export type FetchState =
	| { state: 'finding' }
	| { state: 'copying'; done: number; total: number }
	| { state: 'loading'; file: string; done: number; of: number }
	/** Arena took the load; the media check confirms the clip has it. */
	| { state: 'sent'; file: string; clips: number; from: 'drive' | 'lookbook' }
	/** Copied, not loaded: nothing in Arena to load it into. */
	| { state: 'copied'; file: string; from: 'drive' | 'lookbook' }
	| { state: 'failed'; detail: string }

/** Each code's latest fetch, by code, stamped. */
export type FetchStates = Record<string, FetchState & { at: number }>

/** A file name with nothing that could make it a path: no separators, no
 *  `..`, none of Windows' reserved characters. */
export function isPlainName(name: string): boolean {
	return name.length > 0 && name.length <= 200 && !/[\\/:*?"<>|\u0000-\u001f]/.test(name) && name !== '.' && name !== '..'
}

/** A request off the IPC boundary, or null. */
export function fetchRequestFrom(raw: unknown): FetchRequest | null {
	if (typeof raw !== 'object' || raw === null) return null
	const { code, want, clipIds, lookbookPath, allowLookbook } = raw as Record<string, unknown>
	if (typeof code !== 'string' || !/^[A-Z]{2}\d{3}$/.test(code)) return null
	if (typeof want !== 'string' || !isPlainName(want)) return null
	if (!Array.isArray(clipIds) || clipIds.length > 100) return null
	if (!clipIds.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) return null
	if (lookbookPath !== null && !(typeof lookbookPath === 'string' && LIBRARY_FILE.test(lookbookPath) && libraryCodeIs(lookbookPath, code))) return null
	if (typeof allowLookbook !== 'boolean') return null
	return { code, want, clipIds: [...new Set(clipIds as number[])], lookbookPath, allowLookbook }
}

/** A folder setting: a whole path on this computer or the network, `D:\Media`,
 *  `\\LC-NAS-01\Graphics\Sunday Media` or `/Volumes/Graphics`. */
export function isFolderPath(text: string): boolean {
	if (text.length > 400 || /[\u0000-\u001f]/.test(text)) return false
	return /^[A-Za-z]:[\\/]/.test(text) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(text) || text.startsWith('/')
}

/** Megabytes, for the progress: `312 of 1,204 MB`. */
export function megabytes(bytes: number): string {
	return Math.round(bytes / 1_000_000).toLocaleString('en-NZ')
}

/** Whether a library file is the one for `code`: its name carries the code. */
export function libraryCodeIs(libraryPath: string, code: string): boolean {
	const name = libraryPath.split('/').at(-1) ?? ''
	if (!/^[A-Z]{2}\d{3}$/.test(code)) return false
	return new RegExp(`(?<![A-Za-z0-9])${code}(?![0-9])`, 'i').test(name)
}
