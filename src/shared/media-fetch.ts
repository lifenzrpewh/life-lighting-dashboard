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
// - another version, or the file missing on this computer: found, copied,
//   and loaded into the clip that has the old one;
// - not in Arena at all: found and copied only. Which clip it belongs in is
//   not known (the slot names are an open question), so placing it is the
//   operator's, by hand.
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
	/** The clip to load it into, or null to copy only. */
	clipId: number | null
}

export type FetchState =
	| { state: 'finding' }
	| { state: 'copying'; done: number; total: number }
	| { state: 'loading'; file: string }
	/** Arena took the load; the media check confirms the clip has it. */
	| { state: 'sent'; file: string }
	/** Copied, not loaded: nothing in Arena to load it into. */
	| { state: 'copied'; file: string }
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
	const { code, want, clipId } = raw as Record<string, unknown>
	if (typeof code !== 'string' || !/^[A-Z]{2}\d{3}$/.test(code)) return null
	if (typeof want !== 'string' || !isPlainName(want)) return null
	if (clipId !== null && !(typeof clipId === 'number' && Number.isSafeInteger(clipId) && clipId > 0)) return null
	return { code, want, clipId }
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
