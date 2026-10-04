// The file half of fetching media (../shared/media-fetch.ts has the rules):
// find the lookbook's file under the graphics folder, copy it into the local
// folder, and name it the way Arena's API wants.

import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { pathToFileURL } from 'node:url'

/** What Arena plays from a file: video and stills. */
export const MEDIA_EXTENSIONS: readonly string[] = [
	'.mov',
	'.mp4',
	'.m4v',
	'.avi',
	'.wmv',
	'.mkv',
	'.webm',
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.bmp',
	'.tif',
	'.tiff',
	'.tga',
]

/** Folders never looked in: hidden ones, the recycle bins, and Synology's
 *  thumbnail folders (`@eaDir`), which hold a copy-looking file for every
 *  picture on the NAS. */
const SKIP = /^(?:\.|@|#recycle$|\$RECYCLE\.BIN$|System Volume Information$)/i

export type Found = { path: string; size: number; mtimeMs: number }

export type FindResult = { ok: true; found: Found[]; looked: number } | { ok: false; detail: string }

/** Every media file under `root` named `stem` (any case, any media
 *  extension), newest first. `limit` caps how many entries are looked at, so a
 *  mistyped folder at a drive's root ends rather than walking the drive. */
export async function findMedia(root: string, stem: string, opts: { maxDepth?: number; limit?: number } = {}): Promise<FindResult> {
	const maxDepth = opts.maxDepth ?? 6
	const limit = opts.limit ?? 100_000
	const want = stem.toLowerCase()
	const found: Found[] = []
	let looked = 0
	try {
		await fs.promises.access(root)
	} catch {
		return { ok: false, detail: `the graphics folder ${root} cannot be reached` }
	}
	const walk = async (dir: string, depth: number): Promise<void> => {
		let entries: fs.Dirent[]
		try {
			entries = await fs.promises.readdir(dir, { withFileTypes: true })
		} catch {
			return // A folder that will not open is passed over, not fatal.
		}
		for (const e of entries) {
			if (++looked > limit) return
			if (e.isDirectory()) {
				if (depth < maxDepth && !SKIP.test(e.name)) await walk(path.join(dir, e.name), depth + 1)
				continue
			}
			if (!e.isFile()) continue
			const ext = path.extname(e.name).toLowerCase()
			if (!MEDIA_EXTENSIONS.includes(ext) || path.basename(e.name, path.extname(e.name)).toLowerCase() !== want) continue
			try {
				const st = await fs.promises.stat(path.join(dir, e.name))
				found.push({ path: path.join(dir, e.name), size: st.size, mtimeMs: st.mtimeMs })
			} catch {
				// Gone between listing and looking: not found.
			}
		}
	}
	await walk(root, 0)
	if (looked > limit) return { ok: false, detail: `the graphics folder holds more than ${limit.toLocaleString('en-NZ')} entries; pick the folder the media is in` }
	found.sort((a, b) => b.mtimeMs - a.mtimeMs)
	return { ok: true, found, looked }
}

export type CopyResult = { ok: true; path: string; copied: boolean } | { ok: false; detail: string }

/** Copy `src` into `destDir` under its own name, reporting bytes as they go.
 *  Written to `<name>.partial` and renamed when whole, so Arena never sees half
 *  a file. A file of that name already there is used when it is the same size
 *  and left alone otherwise: nothing is overwritten. */
export async function copyInto(src: string, destDir: string, onProgress: (done: number, total: number) => void): Promise<CopyResult> {
	let total: number
	try {
		total = (await fs.promises.stat(src)).size
	} catch (e) {
		return { ok: false, detail: `cannot read ${src}: ${(e as Error).message}` }
	}
	try {
		if (!(await fs.promises.stat(destDir)).isDirectory()) return { ok: false, detail: `the local folder ${destDir} is not a folder` }
	} catch {
		return { ok: false, detail: `the local folder ${destDir} is not there` }
	}
	const dest = path.join(destDir, path.basename(src))
	try {
		const there = await fs.promises.stat(dest)
		if (there.size === total) return { ok: true, path: dest, copied: false }
		return { ok: false, detail: `a different ${path.basename(src)} is already in the local folder; nothing was overwritten` }
	} catch {
		// Not there: copy it.
	}
	const partial = `${dest}.partial`
	// One left by a copy that was cut off is ours, and only half a file.
	await fs.promises.rm(partial, { force: true }).catch(() => {})
	let done = 0
	onProgress(0, total)
	try {
		await pipeline(
			fs.createReadStream(src),
			new Transform({
				transform(chunk: Buffer, _enc, next) {
					done += chunk.length
					onProgress(done, total)
					next(null, chunk)
				},
			}),
			fs.createWriteStream(partial, { flags: 'wx' }),
		)
		await fs.promises.rename(partial, dest)
	} catch (e) {
		await fs.promises.rm(partial, { force: true }).catch(() => {})
		return { ok: false, detail: `copying ${path.basename(src)} failed: ${(e as Error).message}` }
	}
	return { ok: true, path: dest, copied: true }
}

/** The address Arena's `open` wants: `file:///C:/Media/CF588%20Walk%20In.mov`. */
export function fileUrlOf(file: string): string {
	return pathToFileURL(file).href
}
