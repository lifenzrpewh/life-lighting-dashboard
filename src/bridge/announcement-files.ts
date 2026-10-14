// The announcements folder (../shared/announcements.ts § LOADING): the week's
// lower thirds copied in, numbered in the playlist's order, so a ProPresenter
// Smart Playlist on the folder has them.
//
// ✅ Seen on Central's ProPresenter, 2026-10-14: a Smart Playlist on a network
// folder does NOT notice a file appearing, but does notice one modified after
// it lands (within 10 s). So each file is written under a `.part` name,
// renamed into place, and touched a moment later (`touchLater`).
//
// Last week's files are moved into `Old` inside the folder, never deleted: the
// drive is the comms team's, and a moved file can be moved back.

import fs from 'node:fs'
import path from 'node:path'

import { MEDIA_EXTENSIONS } from './media-files.js'

/** The folder last week's files are moved into. */
export const OLD_FOLDER = 'Old'

/** `03 CT109-Sunday-WaystoGive.png`: the place in the playlist, then the
 *  drive's own name. */
export const numbered = (place: number, file: string) => `${String(place).padStart(2, '0')} ${path.basename(file)}`

export type Placed = { ok: true; path: string; copied: boolean } | { ok: false; detail: string }

/** Copy `src` into `dir` as `name`. The same name of the same size already
 *  there is left as it is; a different size is replaced (a file the comms team
 *  replaced under its old name). Written as `<name>.part` and renamed whole. */
export async function placeFile(src: string, dir: string, name: string): Promise<Placed> {
	let size: number
	try {
		size = (await fs.promises.stat(src)).size
	} catch (e) {
		return { ok: false, detail: `cannot read ${src}: ${(e as Error).message}` }
	}
	const dest = path.join(dir, name)
	try {
		if ((await fs.promises.stat(dest)).size === size) return { ok: true, path: dest, copied: false }
	} catch {
		// Not there yet.
	}
	const part = `${dest}.part`
	try {
		await fs.promises.rm(part, { force: true })
		await fs.promises.copyFile(src, part)
		await fs.promises.rename(part, dest)
		return { ok: true, path: dest, copied: true }
	} catch (e) {
		await fs.promises.rm(part, { force: true }).catch(() => {})
		return { ok: false, detail: `copying ${path.basename(src)} failed: ${(e as Error).message}` }
	}
}

/** Move every media file in `dir` that is not one of `keep` into `dir/Old`.
 *  A name already in Old gets ` (2)`, ` (3)`… rather than replacing it.
 *  Answers the names moved. */
export async function setAside(dir: string, keep: ReadonlySet<string>): Promise<string[]> {
	const moved: string[] = []
	const entries = await fs.promises.readdir(dir, { withFileTypes: true })
	for (const e of entries) {
		if (!e.isFile() || keep.has(e.name) || !MEDIA_EXTENSIONS.includes(path.extname(e.name).toLowerCase())) continue
		const old = path.join(dir, OLD_FOLDER)
		await fs.promises.mkdir(old, { recursive: true })
		const ext = path.extname(e.name)
		const stem = path.basename(e.name, ext)
		let to = path.join(old, e.name)
		for (let n = 2; fs.existsSync(to); n++) to = path.join(old, `${stem} (${n})${ext}`)
		await fs.promises.rename(path.join(dir, e.name), to)
		moved.push(e.name)
	}
	return moved
}

/** Set each file's modified time to now, after `ms`, so a Smart Playlist on a
 *  network folder notices them (the header). */
export function touchLater(files: readonly string[], ms: number): Promise<void> {
	return new Promise((resolve) =>
		setTimeout(() => {
			const now = new Date()
			void Promise.all(files.map((f) => fs.promises.utimes(f, now, now).catch(() => {}))).then(() => resolve())
		}, ms),
	)
}
