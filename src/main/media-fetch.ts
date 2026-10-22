// Fetching media, main's half (../shared/media-fetch.ts has the rules): find
// the code's file, copy it into the local folder, load it into Arena's clips.
// One at a time, in the order asked, each step in the log.
//
// Where the file comes from (the owner, 2026-10-05): the graphics drive, found
// by its code and matched to the lookbook's file by size (the lookbook's files
// are the drive's, byte for byte). When the drive has none of that size (not
// there, or an older version), the lookbook's own file is downloaded, but only
// when the operator said yes to that at the confirmation (`allowLookbook`);
// `sources` is what the confirmation asks before it says anything. When no
// file is the lookbook's size, one of the lookbook's name is taken (the owner,
// 2026-10-18: a lookbook not working properly made the drive's files look
// absent), and the confirmation says it was by name.

import fs from 'node:fs'
import path from 'node:path'

import { copyInto, downloadInto, findByCodeIndexed, nameKey, pickDriveFile, type Found } from '../bridge/media-files.js'
import { isCopyName, lookbookStem } from '../shared/media-check.js'
import type { ArenaCommandResult } from '../shared/arena.js'
import { megabytes, runCounts, undoSteps, type DriveMatches, type LoadedClip, type FetchRequest, type FetchRun, type FetchState, type FetchStates, type MediaSource, type RunRequest } from '../shared/media-fetch.js'

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
	/** Replace: a code that failed on a different local file of its name, run
	 *  again with that file moved aside. */
	replace(code: string): { ok: true } | { ok: false; detail: string }
	/** Where each request's file would come from, before anything is sent. */
	sources(requests: FetchRequest[]): Promise<Record<string, MediaSource>>
	/** Undo the latest run's loads (`undoSteps`): each clip its old file back. */
	undo(runId: number): Promise<{ ok: true; restored: number; left: string[] } | { ok: false; detail: string }>
}

/** How long after Arena refuses a load to look at the clip again. */
const READ_BACK_MS = 1500

type Resolved = { from: 'drive'; found: Found; by: 'size' | 'name' } | { from: 'lookbook'; why: string; size: number; url: string; name: string } | { from: 'none'; detail: string }

export function createMediaFetch(opts: {
	folders: () => { graphics: string | null; local: string | null }
	open: (clipId: number, file: string, live: boolean) => Promise<ArenaCommandResult>
	/** Whether Arena's latest reading has `file` (by name) in the clip, found. */
	clipHas: (clipId: number, file: string) => boolean
	/** The clip's file in Arena's latest reading, and whether it is on screen;
	 *  null when there is no such clip. */
	clipNow: (clipId: number) => { file: string | null; playing: boolean } | null
	lookbookSize: (libraryPath: string) => Promise<number | null>
	lookbookUrl: (libraryPath: string) => string | null
}): MediaFetch {
	const states: FetchStates = {}
	/** Each code's latest request, for Replace to run again. */
	const asked = new Map<string, FetchRequest>()
	const queue: FetchRequest[] = []
	let running = false
	let last: FetchRun | null = null
	let runs = 0
	/** The latest run's loads, for Undo. */
	let loadedClips: LoadedClip[] = []

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
		const find = await findByCodeIndexed(graphics, req.code, { name: req.want })
		if (!find.ok) return lookbook(find.detail)
		if (req.drivePick !== undefined) {
			// The operator's pick, only if it is one this search found.
			const picked = find.found.find((f) => f.path === req.drivePick)
			const by = size !== null && picked?.size === size ? 'size' : 'name'
			return picked !== undefined ? { from: 'drive', found: picked, by } : { from: 'none', detail: `the picked file is no longer on the drive: ${req.drivePick}` }
		}
		if (size === null && req.want.toUpperCase() === req.code) {
			// A fixed code the run sheet does not name (../shared/holding.ts
			// `fixedPlacements`): no lookbook file to match, so the drive's newest
			// for that code, named at the confirmation.
			const newest = [...find.found].sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
			return newest !== undefined ? { from: 'drive', found: newest, by: 'name' } : { from: 'none', detail: `${req.code} is not on the drive` }
		}
		// The lookbook's size first, else its name.
		const picked = pickDriveFile(find.found, size, req.want)
		if (picked.pick !== null) return { from: 'drive', found: picked.pick, by: picked.by }
		if (size === null) return { from: 'none', detail: `the lookbook did not say its file's size, and the drive has no ${req.want}` }
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
			const by = r.by === 'name' ? ', by its name: not the lookbook\'s size' : ''
			console.log(`[media] ${req.code}: found ${r.found.path} on the drive (${megabytes(r.found.size)} MB${by}); into ${local}${req.replaceLocal === true ? ', replacing the local one' : ''}`)
			copy = await copyInto(r.found.path, local, progress, req.replaceLocal === true)
		} else {
			console.log(`[media] ${req.code}: ${r.why}; downloading ${r.url} from the lookbook (${megabytes(r.size)} MB) into ${local} as ${r.name}`)
			copy = await downloadInto(r.url, local, r.name, r.size, progress, undefined, req.replaceLocal === true)
		}
		if (!copy.ok) {
			console.log(`[media] ${req.code}: ${copy.detail}`)
			return set(req.code, { state: 'failed', detail: copy.detail, ...(copy.clash === true ? { clash: true as const } : {}) })
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
			// What it held, for Undo: a file found on this computer, or nothing.
			const was = opts.clipNow(clipId)?.file ?? null
			const before = was !== null && fs.existsSync(was) ? was : null
			const opened = await opts.open(clipId, copy.path, req.allowLive.includes(clipId))
			if (opened.ok || opts.clipHas(clipId, copy.path)) loadedClips.push({ clipId, code: req.code, before, after: copy.path })
			if (!opened.ok) {
				// Arena said no; look again before believing it (the owner,
				// 2026-10-13: a 404 for a clip that held the file). Arena pushes
				// a changed composition on its own, so a moment is enough.
				await new Promise((r) => setTimeout(r, READ_BACK_MS))
				if (opts.clipHas(clipId, copy.path)) {
					if (!loadedClips.some((l) => l.clipId === clipId && l.after === copy.path)) loadedClips.push({ clipId, code: req.code, before, after: copy.path })
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
		last.undoable = loadedClips.filter((l) => l.before !== null).length
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
			asked.set(req.code, req)
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
			const run: FetchRun = { id: ++runs, label, at: Date.now(), codes, already, refused, ended: null, undoable: 0, undone: false }
			last = run
			loadedClips = []
			for (const req of requests) {
				if (busy(req.code)) {
					refused[req.code] = `${req.code} is already being fetched`
					continue
				}
				codes.push(req.code)
				asked.set(req.code, req)
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
			const want = lookbookPath === null ? null : lookbookStem(lookbookPath)
			const find = await findByCodeIndexed(graphics, code, want === null ? {} : { name: want })
			if (!find.ok) return { ok: false, detail: find.detail }
			const size = lookbookPath === null ? null : await opts.lookbookSize(lookbookPath)
			const pick = want === null ? null : pickDriveFile(find.found, size, want).pick
			const key = want === null ? null : nameKey(want)
			return {
				ok: true,
				lookbookSize: size,
				files: find.found.slice(0, 40).map((f) => ({
					path: f.path,
					size: f.size,
					mtimeMs: f.mtimeMs,
					matches: size !== null && f.size === size,
					named: key !== null && nameKey(path.basename(f.path, path.extname(f.path))) === key,
					copy: isCopyName(f.path),
					chosen: pick?.path === f.path,
				})),
			}
		},
		there(code) {
			const s = states[code]
			if (s?.state !== 'failed') return { ok: false, detail: `${code} has no failure to set aside` }
			console.log(`[media] ${code}: said to be in Arena by hand, after: ${s.detail}`)
			set(code, { state: 'by-hand', detail: s.detail })
			return { ok: true }
		},
		replace(code) {
			const s = states[code]
			const req = asked.get(code)
			if (s?.state !== 'failed' || s.clash !== true || req === undefined) return { ok: false, detail: `${code} has no local file to replace` }
			if (busy(code)) return { ok: false, detail: `${code} is already being fetched` }
			console.log(`[media] ${code}: replace the local file, said by an operator`)
			const again = { ...req, replaceLocal: true }
			asked.set(code, again)
			queue.push(again)
			set(code, { state: 'finding' })
			void next()
			return { ok: true }
		},
		lastRun: () => (last === null ? null : { ...last, codes: [...last.codes], refused: { ...last.refused } }),
		async undo(runId) {
			const run = last
			if (run === null || run.id !== runId) return { ok: false, detail: 'only the latest load can be undone' }
			if (run.ended === null) return { ok: false, detail: 'it is still loading' }
			if (run.undone) return { ok: false, detail: 'it was undone already' }
			run.undone = true
			console.log(`[holding] Undo ${run.label}`)
			let restored = 0
			const left: string[] = []
			for (const step of undoSteps(loadedClips, opts.clipNow)) {
				if (step.file === null) {
					console.log(`[holding]   ${step.code}: clip ${step.clipId} left: ${step.why}`)
					left.push(`${step.code}: ${step.why}`)
					continue
				}
				const opened = await opts.open(step.clipId, step.file, false)
				if (opened.ok || opts.clipHas(step.clipId, step.file)) {
					restored += 1
					console.log(`[holding]   ${step.code}: clip ${step.clipId} back to ${path.basename(step.file)}`)
				} else {
					console.log(`[holding]   ${step.code}: clip ${step.clipId} not put back: ${opened.ok ? 'it did not read back' : opened.detail}`)
					left.push(`${step.code}: ${opened.ok ? 'it did not read back' : opened.detail}`)
				}
			}
			return { ok: true, restored, left }
		},
		async sources(requests) {
			const out: Record<string, MediaSource> = {}
			for (const req of requests.slice(0, 50)) {
				const r = await resolve(req)
				out[req.code] = r.from === 'drive' ? { from: 'drive', file: r.found.path, by: r.by } : r.from === 'lookbook' ? { from: 'lookbook', why: r.why } : r
			}
			return out
		},
	}
}
