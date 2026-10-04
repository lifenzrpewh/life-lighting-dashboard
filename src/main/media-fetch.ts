// Fetching media, main's half (../shared/media-fetch.ts has the rules): find
// the file in the graphics folder, copy it into the local folder, load it into
// Arena's clip. One at a time, in the order asked, each step in the log.

import path from 'node:path'

import { copyInto, findMedia } from '../bridge/media-files.js'
import type { ArenaCommandResult } from '../shared/arena.js'
import { megabytes, type FetchRequest, type FetchState, type FetchStates } from '../shared/media-fetch.js'

export type MediaFetch = {
	/** Queue a fetch. Refused, with why, when one for that code is under way. */
	ask(request: FetchRequest): { ok: true } | { ok: false; detail: string }
	states(): FetchStates
}

export function createMediaFetch(opts: {
	folders: () => { graphics: string | null; local: string | null }
	open: (clipId: number, file: string) => Promise<ArenaCommandResult>
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

	const run = async (req: FetchRequest) => {
		const { graphics, local } = opts.folders()
		if (graphics === null || local === null) {
			return set(req.code, { state: 'failed', detail: 'set the graphics folder and the local folder on the Arena row in Connections' })
		}
		set(req.code, { state: 'finding' })
		const find = await findMedia(graphics, req.want)
		if (!find.ok) return set(req.code, { state: 'failed', detail: find.detail })
		const [newest] = find.found
		if (newest === undefined) {
			console.log(`[media] ${req.code}: "${req.want}" is not in ${graphics} (${find.looked} entries looked at)`)
			return set(req.code, { state: 'failed', detail: `no file named ${req.want} in the graphics folder` })
		}
		if (find.found.length > 1) console.log(`[media] ${req.code}: ${find.found.length} files named "${req.want}"; taking the newest, ${newest.path}`)

		console.log(`[media] ${req.code}: found ${newest.path} (${megabytes(newest.size)} MB); into ${local}`)
		let lastShown = 0
		const copy = await copyInto(newest.path, local, (done, total) => {
			// Every 1 % or so is plenty for a bar, and keeps this cheap.
			if (done - lastShown < total / 100 && done !== total) return
			lastShown = done
			set(req.code, { state: 'copying', done, total })
		})
		if (!copy.ok) {
			console.log(`[media] ${req.code}: ${copy.detail}`)
			return set(req.code, { state: 'failed', detail: copy.detail })
		}
		console.log(`[media] ${req.code}: ${copy.copied ? 'copied' : 'already in the local folder'}: ${copy.path}`)
		const file = path.basename(copy.path)
		if (req.clipIds.length === 0) return set(req.code, { state: 'copied', file })

		// One clip at a time, each checked as it is sent (never a playing one).
		const failed: string[] = []
		for (const [i, clipId] of req.clipIds.entries()) {
			set(req.code, { state: 'loading', file, done: i, of: req.clipIds.length })
			const opened = await opts.open(clipId, copy.path)
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
		set(req.code, { state: 'sent', file, clips: loaded })
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
	}
}
