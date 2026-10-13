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
// - Never into a clip that is playing, unless the operator said yes to
//   replacing that very clip on screen at the confirmation (`allowLive`, the
//   owner, 2026-10-05: "happy to have it override the live clip, with an extra
//   warning"): checked against the composition at the moment of sending
//   (../bridge/arena-control.ts). A clip that went live after the yes is
//   still refused.
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
	/** The clips, of `clipIds`, the operator agreed to replace while they are
	 *  on screen. Any other playing clip is refused at sending. */
	allowLive: number[]
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
	/** Arena took the load; the media check confirms the clip has it.
	 *  `doubted`: Arena said no to a load, but the clip read back holding the
	 *  file all the same (the owner, 2026-10-13: a 404 for a clip that was
	 *  there); what Arena said, to be shown in orange, not as a failure. */
	| { state: 'sent'; file: string; clips: number; from: 'drive' | 'lookbook'; doubted?: string }
	/** Copied, not loaded: nothing in Arena to load it into. */
	| { state: 'copied'; file: string; from: 'drive' | 'lookbook' }
	| { state: 'failed'; detail: string }
	/** Failed, but an operator said it is in Arena all the same ("It's there",
	 *  the owner, 2026-10-13): counted as loaded, shown in orange. */
	| { state: 'by-hand'; detail: string }

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
	const { code, want, clipIds, lookbookPath, allowLookbook, allowLive } = raw as Record<string, unknown>
	if (typeof code !== 'string' || !/^[A-Z]{2}\d{3}$/.test(code)) return null
	if (typeof want !== 'string' || !isPlainName(want)) return null
	if (!Array.isArray(clipIds) || clipIds.length > 100) return null
	if (!clipIds.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) return null
	if (lookbookPath !== null && !(typeof lookbookPath === 'string' && LIBRARY_FILE.test(lookbookPath) && libraryCodeIs(lookbookPath, code))) return null
	if (typeof allowLookbook !== 'boolean') return null
	if (!Array.isArray(allowLive) || !allowLive.every((id) => (clipIds as unknown[]).includes(id))) return null
	return { code, want, clipIds: [...new Set(clipIds as number[])], lookbookPath, allowLookbook, allowLive: [...new Set(allowLive as number[])] }
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

/** One confirmation's worth of fetches, as one run (the owner, 2026-10-13: a
 *  result that stays): what it was, the plan it was sent with, and, once every
 *  code has ended, what came of it. Main keeps the latest, so the result line
 *  outlives a tab switch, and logs the plan and the result. */
export type FetchRun = {
	id: number
	/** The confirmation's title: `Update all: 8 steps`, `Place`. */
	label: string
	at: number
	codes: string[]
	/** Codes the run sheet uses that needed nothing, for "2 already there". */
	already: number
	/** Codes main would not queue, with why. */
	refused: Record<string, string>
	/** Set when every code has ended. */
	ended: number | null
}

export type RunRequest = { label: string; requests: FetchRequest[]; plan: string[]; already: number }

/** A run as the page sent it, or null: every request checked as one alone. */
export function runRequestFrom(raw: unknown): RunRequest | null {
	if (typeof raw !== 'object' || raw === null) return null
	const { label, requests, plan, already } = raw as Record<string, unknown>
	if (typeof label !== 'string' || label.length > 120 || !Array.isArray(requests) || requests.length > 100) return null
	if (!Array.isArray(plan) || plan.length > 300 || !plan.every((l) => typeof l === 'string' && l.length <= 500)) return null
	if (typeof already !== 'number' || !Number.isSafeInteger(already) || already < 0) return null
	const reqs = requests.map(fetchRequestFrom)
	if (reqs.some((r) => r === null)) return null
	return { label, requests: reqs as FetchRequest[], plan: plan as string[], already }
}

/** A run's result in a few words: `7 loaded · 1 failed · 2 already there`. */
export function runCounts(run: FetchRun, states: FetchStates): { loaded: number; failed: number; copied: number; going: number; doubted: number; byHand: number } {
	const out = { loaded: 0, failed: Object.keys(run.refused).length, copied: 0, going: 0, doubted: 0, byHand: 0 }
	for (const code of run.codes) {
		const s = states[code]
		if (s === undefined || s.at < run.at) out.going += 1
		else if (s.state === 'sent') {
			out.loaded += 1
			if (s.doubted !== undefined) out.doubted += 1
		} else if (s.state === 'by-hand') {
			out.loaded += 1
			out.byHand += 1
		} else if (s.state === 'failed') out.failed += 1
		else if (s.state === 'copied') out.copied += 1
		else out.going += 1
	}
	return out
}
