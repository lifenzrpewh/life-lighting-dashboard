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
	const want = stem.toLowerCase()
	return findWhere(root, (name) => name.toLowerCase() === want, opts)
}

/** Every media file under `root` whose name carries `code` (`CF449` in
 *  `CF449-Sunday-Bibles - Copy.png`), newest first: the owner, 2026-10-05,
 *  the rest of a name is for the comms team. */
export async function findByCode(root: string, code: string, opts: { maxDepth?: number; limit?: number } = {}): Promise<FindResult> {
	if (!/^[A-Za-z]{2}\d{3}$/.test(code)) return { ok: false, detail: `${code} is not a media code` }
	const carries = new RegExp(`(?<![A-Za-z0-9])${code}(?![0-9])`, 'i')
	return findWhere(root, (name) => carries.test(name), opts)
}

/** Each media code a file's name carries: as `findByCode` matches one, but
 *  every one at once. Two never overlap (a code is two letters then three
 *  digits, and one may not follow a letter or digit), so a global match
 *  finds them all. */
const CODES_IN = /(?<![A-Za-z0-9])[A-Za-z]{2}\d{3}(?![0-9])/g

/** Every code `findByCode` would match `stem` for, upper case. */
export function codesIn(stem: string): string[] {
	return [...new Set((stem.match(CODES_IN) ?? []).map((c) => c.toUpperCase()))]
}

/** A name as two of the same file are told apart by eye (the owner,
 *  2026-10-18: the drive's files checked by name as well, for when the
 *  lookbook's sizes cannot be trusted): no case, no lookbook upload time, no
 *  copy marks, and runs of spaces, dots, dashes and underscores alike.
 *  `CF588-Walk_In - Copy` and `cf588 walk in` are one name. */
export function nameKey(stem: string): string {
	return stem
		.replace(/_\d{10,}$/, '')
		.replace(COPY_MARKS, '')
		.toLowerCase()
		.replace(/[\s._-]+/g, ' ')
		.trim()
}

const COPY_MARKS = /(?:[\s_-]+copy(?:\s*\(\d+\))?|\s*\(\d+\))$/i

const stemOf = (file: string) => path.basename(file, path.extname(file))

/** A walk of the graphics folder, once: each code to the files carrying it,
 *  each name (`nameKey`) to the files of that name, in the walk's order, and
 *  how many entries were looked at. */
type CodeWalk =
	| { ok: true; byCode: Map<string, string[]>; byName: Map<string, string[]>; looked: number; finds: Map<string, Promise<FindResult>> }
	| { ok: false; detail: string }

/** Walks kept a short while, by folder and options: a batch (a Place all, the
 *  sources for a confirmation, a week's announcements) asks up to 50 codes,
 *  and each used to walk the whole folder, up to 100,000 entries on a NAS. */
const walks = new Map<string, { at: number; walk: Promise<CodeWalk> }>()
/** How long a walk serves: long enough for one batch and the confirmation
 *  before it, short enough that a file the comms team just put on the drive
 *  is seen on the next press. */
export const CODE_INDEX_MS = 30_000

/** As `findByCode`, from one walk of `root` shared by every code asked within
 *  `maxAgeMs` (CODE_INDEX_MS). A folder that cannot be walked is not kept, so
 *  one that comes back is walked again at once. Files are looked at (their
 *  size and time) only for the codes asked, once per walk. With `name` (the
 *  lookbook's file name), a file of that name is found too, code or not. */
export async function findByCodeIndexed(
	root: string,
	code: string,
	opts: { maxDepth?: number; limit?: number; maxAgeMs?: number; name?: string } = {},
): Promise<FindResult> {
	if (!/^[A-Za-z]{2}\d{3}$/.test(code)) return { ok: false, detail: `${code} is not a media code` }
	const maxAge = opts.maxAgeMs ?? CODE_INDEX_MS
	const key = JSON.stringify([root, opts.maxDepth ?? null, opts.limit ?? null])
	const now = Date.now()
	for (const [k, w] of walks) if (now - w.at >= CODE_INDEX_MS && k !== key) walks.delete(k)
	let held = walks.get(key)
	if (held === undefined || now - held.at >= maxAge) {
		held = { at: now, walk: walkCodes(root, opts) }
		walks.set(key, held)
		const mine = held
		const drop = () => {
			if (walks.get(key) === mine) walks.delete(key)
		}
		void mine.walk.then((w) => (w.ok ? undefined : drop()), drop)
	}
	const walk = await held.walk
	if (!walk.ok) return walk
	const want = code.toUpperCase()
	const name = opts.name === undefined ? '' : nameKey(opts.name)
	const key2 = `${want}|${name}`
	let find = walk.finds.get(key2)
	if (find === undefined) {
		const files = [...new Set([...(walk.byCode.get(want) ?? []), ...(name === '' ? [] : (walk.byName.get(name) ?? []))])]
		find = statAll(files).then((found) => ({ ok: true, found, looked: walk.looked }) as const)
		walk.finds.set(key2, find)
	}
	return find
}

async function walkCodes(root: string, opts: { maxDepth?: number; limit?: number }): Promise<CodeWalk> {
	const byCode = new Map<string, string[]>()
	const byName = new Map<string, string[]>()
	const add = (map: Map<string, string[]>, key: string, file: string) => {
		const list = map.get(key)
		if (list === undefined) map.set(key, [file])
		else list.push(file)
	}
	const walked = await walkMedia(root, opts, (file, stem) => {
		for (const c of codesIn(stem)) add(byCode, c, file)
		add(byName, nameKey(stem), file)
	})
	return walked.ok ? { ok: true, byCode, byName, looked: walked.looked, finds: new Map() } : walked
}

/** Each file's size and time, newest first; one gone since the walk is left out. */
async function statAll(files: readonly string[]): Promise<Found[]> {
	const found: Found[] = []
	for (const file of files) {
		try {
			const st = await fs.promises.stat(file)
			found.push({ path: file, size: st.size, mtimeMs: st.mtimeMs })
		} catch {
			// Gone between listing and looking: not found.
		}
	}
	found.sort((a, b) => b.mtimeMs - a.mtimeMs)
	return found
}

async function findWhere(root: string, match: (stem: string) => boolean, opts: { maxDepth?: number; limit?: number }): Promise<FindResult> {
	const files: string[] = []
	const walked = await walkMedia(root, opts, (file, stem) => {
		if (match(stem)) files.push(file)
	})
	if (!walked.ok) return walked
	return { ok: true, found: await statAll(files), looked: walked.looked }
}

/** Every media file under `root`, to `each` with its name's stem. */
async function walkMedia(
	root: string,
	opts: { maxDepth?: number; limit?: number },
	each: (file: string, stem: string) => void,
): Promise<{ ok: true; looked: number } | { ok: false; detail: string }> {
	const maxDepth = opts.maxDepth ?? 6
	const limit = opts.limit ?? 100_000
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
			if (!MEDIA_EXTENSIONS.includes(ext)) continue
			each(path.join(dir, e.name), path.basename(e.name, path.extname(e.name)))
		}
	}
	await walk(root, 0)
	if (looked > limit) return { ok: false, detail: `the graphics folder holds more than ${limit.toLocaleString('en-NZ')} entries; pick the folder the media is in` }
	return { ok: true, looked }
}

/** Which of the drive's files for a code is the lookbook's: the one of the
 *  same size (the lookbook's files are the drive's, byte for byte), a plain
 *  name before a `- Copy` or `(2)`, newest first. None of that size is said:
 *  the drive has none for the code, or only other versions. */
export function pickBySize(found: Found[], size: number): { pick: Found } | { pick: null; why: 'not-there' | 'other-version' } {
	const same = found.filter((f) => f.size === size)
	if (same.length === 0) return { pick: null, why: found.length === 0 ? 'not-there' : 'other-version' }
	same.sort(plainFirst)
	return { pick: same[0] as Found }
}

/** A plain name before a `- Copy` or `(2)`, then newest first. */
const plainFirst = (a: Found, b: Found) => copyRank(a) - copyRank(b) || b.mtimeMs - a.mtimeMs
const copyRank = (f: Found) => (COPY_MARKS.test(stemOf(f.path)) ? 1 : 0)

/** Which drive file Fetch takes for the lookbook's `want` (its file name):
 *  the one of the lookbook's size (`pickBySize`), else one of the lookbook's
 *  name (`nameKey`), plain before a copy, newest first. The name is the
 *  fallback the owner asked for (2026-10-18): a lookbook that says the wrong
 *  size, or none, made the drive's own file look absent. `size` null: by name
 *  only. */
export function pickDriveFile(
	found: Found[],
	size: number | null,
	want: string,
): { pick: Found; by: 'size' | 'name' } | { pick: null; why: 'not-there' | 'other-version' } {
	if (size !== null) {
		const bySize = pickBySize(found, size)
		if (bySize.pick !== null) return { pick: bySize.pick, by: 'size' }
	}
	const key = nameKey(want)
	const named = key === '' ? [] : found.filter((f) => nameKey(stemOf(f.path)) === key).sort(plainFirst)
	if (named[0] !== undefined) return { pick: named[0], by: 'name' }
	return { pick: null, why: found.length === 0 ? 'not-there' : 'other-version' }
}

/** `clash`: a different file of that name is already in the local folder. */
export type CopyResult = { ok: true; path: string; copied: boolean } | { ok: false; detail: string; clash?: true }

/** Where a local file goes when an operator says to replace it (the owner,
 *  2026-10-18: an override for "a different file is already in the local
 *  folder"): a `Replaced` folder beside it, named with when, so nothing is
 *  lost. Refused, and said, when it cannot be moved (Arena may have it open). */
async function moveAside(dest: string): Promise<{ ok: true } | { ok: false; detail: string }> {
	const d = new Date()
	const two = (n: number) => String(n).padStart(2, '0')
	const when = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`
	const ext = path.extname(dest)
	const aside = path.join(path.dirname(dest), 'Replaced', `${path.basename(dest, ext)} (replaced ${when})${ext}`)
	try {
		await fs.promises.mkdir(path.dirname(aside), { recursive: true })
		await fs.promises.rename(dest, aside)
		console.log(`[media] moved the old ${path.basename(dest)} aside to ${aside}`)
		return { ok: true }
	} catch (e) {
		return { ok: false, detail: `the local ${path.basename(dest)} could not be moved aside (Arena may have it open): ${(e as Error).message}` }
	}
}

/** A file of `dest`'s name already there: used when it is `size` long, moved
 *  aside when `replace`, and otherwise left alone and said. Null: copy. */
async function already(dest: string, size: number, replace: boolean): Promise<CopyResult | null> {
	let there: fs.Stats
	try {
		there = await fs.promises.stat(dest)
	} catch {
		return null // Not there: copy it.
	}
	if (there.size === size) return { ok: true, path: dest, copied: false }
	if (!replace) return { ok: false, detail: `a different ${path.basename(dest)} is already in the local folder; nothing was overwritten`, clash: true }
	const moved = await moveAside(dest)
	return moved.ok ? null : moved
}

/** Copy `src` into `destDir` under its own name, reporting bytes as they go.
 *  Written to `<name>.partial` and renamed when whole, so Arena never sees half
 *  a file. A file of that name already there is used when it is the same size
 *  and left alone otherwise: nothing is overwritten. With `replace` (an
 *  operator's say-so), a different one is moved aside to `Replaced` first. */
export async function copyInto(src: string, destDir: string, onProgress: (done: number, total: number) => void, replace = false): Promise<CopyResult> {
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
	const there = await already(dest, total, replace)
	if (there !== null) return there
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

/** Download `url` into `destDir` as `name`, as `copyInto` copies: to
 *  `<name>.partial`, renamed only when whole and `size` bytes long; a file of
 *  that name already there is used when it is that size and otherwise left
 *  alone (or moved aside, with `replace`). Used only for the lookbook's own files (src/main/media-fetch.ts). */
export async function downloadInto(
	url: string,
	destDir: string,
	name: string,
	size: number,
	onProgress: (done: number, total: number) => void,
	timeoutMs = 10 * 60_000,
	replace = false,
): Promise<CopyResult> {
	try {
		if (!(await fs.promises.stat(destDir)).isDirectory()) return { ok: false, detail: `the local folder ${destDir} is not a folder` }
	} catch {
		return { ok: false, detail: `the local folder ${destDir} is not there` }
	}
	const dest = path.join(destDir, name)
	const there = await already(dest, size, replace)
	if (there !== null) return there
	const partial = `${dest}.partial`
	await fs.promises.rm(partial, { force: true }).catch(() => {})
	let done = 0
	onProgress(0, size)
	try {
		const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
		if (!r.ok || r.body === null) return { ok: false, detail: `the lookbook answered ${r.status}` }
		const { Readable } = await import('node:stream')
		await pipeline(
			Readable.fromWeb(r.body as import('node:stream/web').ReadableStream<Uint8Array>),
			new Transform({
				transform(chunk: Buffer, _enc, next) {
					done += chunk.length
					if (done > size) return next(new Error('the lookbook sent more than it said'))
					onProgress(done, size)
					next(null, chunk)
				},
			}),
			fs.createWriteStream(partial, { flags: 'wx' }),
		)
		if (done !== size) throw new Error(`got ${done} of ${size} bytes`)
		await fs.promises.rename(partial, dest)
	} catch (e) {
		await fs.promises.rm(partial, { force: true }).catch(() => {})
		return { ok: false, detail: `downloading ${name} failed: ${(e as Error).message}` }
	}
	return { ok: true, path: dest, copied: true }
}
