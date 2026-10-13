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
import { isCopyName } from '../shared/media-check.js'
import type { ArenaCommandResult } from '../shared/arena.js'
import { megabytes, runCounts, type DriveMatches, type FetchRequest, type FetchRun, type FetchState, type FetchStates, type MediaSource, type RunRequest } from '../shared/media-fetch.js'

export type MediaFetch = {
	/** Queue a fetch. Refused, with why, when one for that code is under way. */
	ask(request: FetchRequest): { ok: true } | { ok: false; detail: string }
	states(): FetchStates
	/** Queue a confirmation's requests as one run, its plan in the log; what
	 *  main would not queue is in the run's `refused`. */
	run(request: RunRequest): FetchRun
	/** The latest run, ended or not, or null before the first. */
	lastRun(): FetchRun | null
	/** Every file on the graphics drive carrying `code`, and which Fetch takes. */
	drive(code: string, lookbookPath: string | null): Promise<DriveMatches>
	/** "It's there": a failed code an operator says is in Arena all the same. */
	there(code: string): { ok: true } | { ok: false; detail: string }
	/** Where each request's file would come from, before anything is sent. */
	sources(requests: FetchRequest[]): Promise<Record<string, MediaSource>>
}

/** How long after Arena refuses a load to look at the clip again. */
const READ_BACK_MS = 1500

type Resolved = { from: 'drive'; found: Found } | { from: 'lookbook'; why: string; size: number; url: string; name: string } | { from: 'none'; detail: string }

export function createMediaFetch(opts: {
	folders: () => { graphics: string | null; local: string | null }
	open: (clipId: number, file: string, live: boolean) => Promise<ArenaCommandResult>
	/** Whether Arena's latest reading has `file` (by name) in the clip, found. */
	clipHas: (clipId: number, file: string) => boolean
	lookbookSize: (libraryPath: string) => Promise<number | null>
	lookbookUrl: (libraryPath: string) => string | null
}): MediaFetch {
	const states: FetchStates = {}
	const queue: FetchRequest[] = []
	let running = false
	let last: FetchRun | null = null
	let runs = 0

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
		if (req.drivePick !== undefined) {
			// The operator's pick, only if it is one this search found.
			const picked = find.found.find((f) => f.path === req.drivePick)
			return picked !== undefined ? { from: 'drive', found: picked } : { from: 'none', detail: `the picked file is no longer on the drive: ${req.drivePick}` }
		}
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
		const doubted: string[] = []
		for (const [i, clipId] of req.clipIds.entries()) {
			set(req.code, { state: 'loading', file, done: i, of: req.clipIds.length })
			const opened = await opts.open(clipId, copy.path, req.allowLive.includes(clipId))
			if (!opened.ok) {
				// Arena said no; look again before believing it (the owner,
				// 2026-10-13: a 404 for a clip that held the file). Arena pushes
				// a changed composition on its own, so a moment is enough.
				await new Promise((r) => setTimeout(r, READ_BACK_MS))
				if (opts.clipHas(clipId, copy.path)) {
					console.log(`[media] ${req.code}: Arena said "${opened.detail}" for clip ${clipId}, but the clip reads back with ${file}`)
					doubted.push(opened.detail)
					continue
				}
				console.log(`[media] ${req.code}: not loaded into clip ${clipId}: ${opened.detail}`)
				failed.push(opened.detail)
			}
		}
		const loaded = req.clipIds.length - failed.length
		console.log(`[media] ${req.code}: ${file} sent to ${loaded} of ${req.clipIds.length} clips${doubted.length > 0 ? ` (${doubted.length} after Arena said no)` : ''}`)
		if (failed.length > 0) {
			const of = req.clipIds.length === 1 ? '' : ` (${loaded} of ${req.clipIds.length} clips)`
			return set(req.code, { state: 'failed', detail: `copied, but not loaded into Arena${of}: ${failed[0]}` })
		}
		set(req.code, { state: 'sent', file, clips: loaded, from: r.from, ...(doubted[0] === undefined ? {} : { doubted: doubted[0] }) })
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
			endRun()
		}
	}

	/** The latest run's result, once every code of it has ended: in the log,
	 *  each failure with why, so a booth's paua.log says what happened. */
	const endRun = () => {
		if (last === null || last.ended !== null || last.codes.some(busy)) return
		last.ended = Date.now()
		const n = runCounts(last, states)
		const parts = [`${n.loaded} loaded`, ...(n.doubted > 0 ? [`${n.doubted} of them after Arena said no`] : []), ...(n.byHand > 0 ? [`${n.byHand} said to be there by hand`] : []), ...(n.failed > 0 ? [`${n.failed} failed`] : []), ...(n.copied > 0 ? [`${n.copied} copied only`] : []), ...(last.already > 0 ? [`${last.already} already there`] : [])]
		console.log(`[holding] ${last.label} done: ${parts.join(', ')}`)
		for (const code of last.codes) {
			const st = states[code]
			if (st?.state === 'failed') console.log(`[holding]   ${code} failed: ${st.detail}`)
			if (st?.state === 'sent' && st.doubted !== undefined) console.log(`[holding]   ${code}: Arena said "${st.doubted}", but the clip has ${st.file}`)
		}
		for (const [code, why] of Object.entries(last.refused)) console.log(`[holding]   ${code} not queued: ${why}`)
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
		run({ label, requests, plan, already }) {
			const refused: Record<string, string> = {}
			const codes: string[] = []
			console.log(`[holding] ${label}`)
			for (const line of plan) console.log(`[holding]   ${line}`)
			const run: FetchRun = { id: ++runs, label, at: Date.now(), codes, already, refused, ended: null }
			last = run
			for (const req of requests) {
				if (busy(req.code)) {
					refused[req.code] = `${req.code} is already being fetched`
					continue
				}
				codes.push(req.code)
				queue.push(req)
				set(req.code, { state: 'finding' })
			}
			if (codes.length === 0) endRun()
			else void next()
			return { ...run, codes: [...codes], refused: { ...refused } }
		},
		async drive(code, lookbookPath) {
			const { graphics } = opts.folders()
			if (graphics === null) return { ok: false, detail: 'no graphics folder is set' }
			const find = await findByCode(graphics, code)
			if (!find.ok) return { ok: false, detail: find.detail }
			const size = lookbookPath === null ? null : await opts.lookbookSize(lookbookPath)
			const pick = size === null ? null : pickBySize(find.found, size).pick
			return {
				ok: true,
				lookbookSize: size,
				files: find.found.slice(0, 40).map((f) => ({ path: f.path, size: f.size, mtimeMs: f.mtimeMs, matches: size !== null && f.size === size, copy: isCopyName(f.path), chosen: pick?.path === f.path })),
			}
		},
		there(code) {
			const s = states[code]
			if (s?.state !== 'failed') return { ok: false, detail: `${code} has no failure to set aside` }
			console.log(`[media] ${code}: said to be in Arena by hand, after: ${s.detail}`)
			set(code, { state: 'by-hand', detail: s.detail })
			return { ok: true }
		},
		lastRun: () => (last === null ? null : { ...last, codes: [...last.codes], refused: { ...last.refused } }),
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
