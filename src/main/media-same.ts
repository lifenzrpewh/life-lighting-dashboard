// The media check's "same" marks (../shared/media-check.ts): an operator saying a
// clip whose name differs from the lookbook's is the same file. Kept on this
// computer, in the data folder, so a restart keeps them; each holds for one
// pair of names only, so a new file on either side asks again.

import fs from 'node:fs'
import path from 'node:path'

import { SAME_MARKS_MAX, sameKey, sameMarksFrom, thereKey, type SameMark } from '../shared/media-check.js'

export function createMediaSame(dataDir: string) {
	const file = path.join(dataDir, 'media-same.json')
	const read = (): string[] => {
		try {
			return sameMarksFrom(JSON.parse(fs.readFileSync(file, 'utf8')))
		} catch {
			return []
		}
	}
	let marks = read()
	return {
		marks: (): string[] => marks,
		mark(m: SameMark): { ok: true } | { ok: false; detail: string } {
			const key = m.there === true ? thereKey(m.code, m.file, m.want) : sameKey(m.code, m.file, m.want)
			const next = marks.filter((k) => k !== key)
			if (m.same) next.push(key)
			try {
				fs.mkdirSync(dataDir, { recursive: true })
				fs.writeFileSync(file, JSON.stringify(next.slice(-SAME_MARKS_MAX)))
			} catch (e) {
				return { ok: false, detail: `could not keep the mark: ${(e as Error).message}` }
			}
			marks = next.slice(-SAME_MARKS_MAX)
			const what = m.there === true ? 'said to be in Arena by hand' : 'marked the same by hand'
			console.log(`[media] ${m.code} ${m.same ? what : 'mark undone'}: ${m.file} against ${m.want}`)
			return { ok: true }
		},
	}
}
