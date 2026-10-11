// Fetching media, main's half (../shared/media-fetch.ts has the rules): find
// the code's file, copy it into the local folder, load it into Arena's clips.
// One at a time, in the order asked, each step in the log.
//
// Where the file comes from (the owner, 2026-10-05): the graphics drive, found
// by its code and matched to the lookbook's file by size (the lookbook's files
// are the drive's, byte for byte). When the drive has none of that size (not
// there, or an older version), the lookbook's own file is downloaded, but only
// when the operator said yes to that at the confirmation (`allowLookbook`);
// `sources` is what the confirmation asks before it says anything.

import path from 'node:path'

import { copyInto, downloadInto, findByCode, pickBySize, type Found } from '../bridge/media-files.js'
import type { ArenaCommandResult } from '../shared/arena.js'
import { megabytes, type FetchRequest, type FetchState, type FetchStates, type MediaSource } from '../shared/media-fetch.js'

export type MediaFetch = {
	/** Queue a fetch. Refused, with why, when one for that code is under way. */
	ask(request: FetchRequest): { ok: true } | { ok: false; detail: string }
	states(): FetchStates
	/** Where each request's file would come from, before anything is sent. */
	sources(requests: FetchRequest[]): Promise<Record<string, MediaSource>>
}

type Resolved = { from: 'drive'; found: Found } | { from: 'lookbook'; why: string; size: number; url: string; name: string } | { from: 'none'; detail: string }

export function createMediaFetch(opts: {
	folders: () => { graphics: string | null; local: string | null }
	open: (clipId: number, file: string, live: boolean) => Promise<ArenaCommandResult>
	lookbookSize: (libraryPath: string) => Promise<number | null>
	lookbookUrl: (libraryPath: string) => string | null
}): MediaFetch {
	const states: FetchStates = {}
	const queue: FetchRequest[] = []
	let running = false

	const set = (code: string, state: FetchState) => {
		states[code] = { ...state, at: Date.now() }
	}
	const busy = (code: string) => {
		const s = states[code]?.state
		return s === 'finding' || s === 'copying' || s === 'loading' || queue.some((q) => q.code === code)
	}

	/** The drive's file of the lookbook's size, else the lookbook's own. */
	const resolve = async (req: FetchRequest): Promise<Resolved> => {
		const { graphics } = opts.folders()
		const size = req.lookbookPath === null ? null : await opts.lookbookSize(req.lookbookPath)
		const lookbook = (why: string): Resolved => {
			const url = req.lookbookPath === null ? null : opts.lookbookUrl(req.lookbookPath)
			if (url === null || size === null || req.lookbookPath === null) return { from: 'none', detail: `${why}, and the lookbook did not give its file` }
			const ext = path.extname(req.lookbookPath)
			return { from: 'lookbook', why, size, url, name: `${req.want}${ext}` }
		}
		if (graphics === null) return lookbook('no graphics folder is set')
		const find = await findByCode(graphics, req.code)
		if (!find.ok) return lookbook(find.detail)
		if (size === null && req.want.toUpperCase() === req.code) {
			// A fixed code the run sheet does not name (../shared/holding.ts
			// `fixedPlacements`): no lookbook file to match, so the drive's newest
			// for that code, named at the confirmation.
			const newest = [...find.found].sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
			return newest !== undefined ? { from: 'drive', found: newest } : { from: 'none', detail: `${req.code} is not on the drive` }
		}
		if (size === null) {
			// Nothing to match by size: only a file of the lookbook's own name.
			const named = find.found.find((f) => path.basename(f.path, path.extname(f.path)).toLowerCase() === req.want.toLowerCase())
			return named !== undefined ? { from: 'drive', found: named } : { from: 'none', detail: `the lookbook did not say its file's size, and the drive has no ${req.want}` }
		}
		const picked = pickBySize(find.found, size)
		if (picked.pick !== null) return { from: 'drive', found: picked.pick }
		return lookbook(picked.why === 'not-there' ? `${req.code} is not on the drive` : `the drive's ${req.code} is another version`)
	}

	const run = async (req: FetchRequest) => {
		const { local } = opts.folders()
		if (local === null) return set(req.code, { state: 'failed', detail: 'set the local folder on the Arena page in Settings' })
		set(req.code, { state: 'finding' })
		const r = await resolve(req)
		if (r.from === 'none') {
			console.log(`[media] ${req.code}: ${r.detail}`)
			return set(req.code, { state: 'failed', detail: r.detail })
		}
		if (r.from === 'lookbook' && !req.allowLookbook) {
			console.log(`[media] ${req.code}: ${r.why}; not downloaded from the lookbook (not asked to)`)
			return set(req.code, { state: 'failed', detail: `${r.why}; not downloaded from the lookbook` })
		}
		let lastShown = 0
		const progress = (done: number, total: number) => {
			// Every 1 % or so is plenty for a bar, and keeps this cheap.
			if (done - lastShown < total / 100 && done !== total) return
			lastShown = done
			set(req.code, { state: 'copying', done, total })
		}
		let copy
		if (r.from === 'drive') {
			console.log(`[media] ${req.code}: found ${r.found.path} on the drive (${megabytes(r.found.size)} MB); into ${local}`)
			copy = await copyInto(r.found.path, local, progress)
		} else {
			console.log(`[media] ${req.code}: ${r.why}; downloading ${r.url} from the lookbook (${megabytes(r.size)} MB) into ${local} as ${r.name}`)
			copy = await downloadInto(r.url, local, r.name, r.size, progress)
		}
		if (!copy.ok) {
			console.log(`[media] ${req.code}: ${copy.detail}`)
			return set(req.code, { state: 'failed', detail: copy.detail })
		}
		console.log(`[media] ${req.code}: ${copy.copied ? (r.from === 'drive' ? 'copied' : 'downloaded') : 'already in the local folder'}: ${copy.path}`)
		const file = path.basename(copy.path)
		if (req.clipIds.length === 0) return set(req.code, { state: 'copied', file, from: r.from })

		// One clip at a time, each checked as it is sent (never a playing one
		// the operator did not agree to replace on screen).
		const failed: string[] = []
		for (const [i, clipId] of req.clipIds.entries()) {
			set(req.code, { state: 'loading', file, done: i, of: req.clipIds.length })
			const opened = await opts.open(clipId, copy.path, req.allowLive.includes(clipId))
			if (!opened.ok) {
				console.log(`[media] ${req.code}: not loaded into clip ${clipId}: ${opened.detail}`)
				failed.push(opened.detail)
			}
		}
		const loaded = req.clipIds.length - failed.length
		console.log(`[media] ${req.code}: ${file} sent to ${loaded} of ${req.clipIds.length} clips`)
		if (failed.length > 0) {
			const of = req.clipIds.length === 1 ? '' : ` (${loaded} of ${req.clipIds.length} clips)`
			return set(req.code, { state: 'failed', detail: `copied, but not loaded into Arena${of}: ${failed[0]}` })
		}
		set(req.code, { state: 'sent', file, clips: loaded, from: r.from })
	}

	const next = async () => {
		if (running) return
		running = true
		try {
			for (let req = queue.shift(); req !== undefined; req = queue.shift()) {
				try {
					await run(req)
				} catch (e) {
					set(req.code, { state: 'failed', detail: (e as Error).message })
				}
			}
		} finally {
			running = false
		}
	}

	return {
		ask(req) {
			if (busy(req.code)) return { ok: false, detail: `${req.code} is already being fetched` }
			queue.push(req)
			set(req.code, { state: 'finding' })
			void next()
			return { ok: true }
		},
		states: () => ({ ...states }),
		async sources(requests) {
			const out: Record<string, MediaSource> = {}
			for (const req of requests.slice(0, 50)) {
				const r = await resolve(req)
				out[req.code] = r.from === 'drive' ? { from: 'drive', file: r.found.path } : r.from === 'lookbook' ? { from: 'lookbook', why: r.why } : r
			}
			return out
		},
	}
}
