// What the backend half keeps on disk: the session, encrypted, and the last run
// order that read, so a booth that boots with no network still has one.
//
// THE RULES THIS FILE ENFORCES:
// - The session is never written in the clear. With no OS keystore it cannot be
//   kept at all, and pairing says so, as settings.ts does for MA passwords.
// - Every write lands by rename, so a crash mid-write leaves the old file.
// - The cached run order is read back with the moment it was read. It is only
//   ever shown as that, with its age (readingOf's lastOk), never as fresh.

import { safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import { sessionFromDisk, type Session } from '../../backend/session.js'
import type { Schedule } from '../../shared/service.js'

function writeAtomic(file: string, text: string): void {
	const tmp = `${file}.tmp`
	fs.writeFileSync(tmp, text)
	fs.renameSync(tmp, file)
}

function readJson(file: string): unknown {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'))
	} catch {
		return null
	}
}

export type BackendStore = {
	canKeepSession: boolean
	loadSession(): Session | null
	saveSession(session: Session): void
	clearSession(): void
	loadSchedule(): { value: Schedule; at: number } | null
	saveSchedule(value: Schedule, at: number): void
	clearSchedule(): void
}

export function openBackendStore(dataDir: string): BackendStore {
	const sessionFile = path.join(dataDir, 'backend-session.json')
	const scheduleFile = path.join(dataDir, 'run-order.json')
	const canKeepSession = safeStorage.isEncryptionAvailable()
	const remove = (file: string) => fs.rmSync(file, { force: true })

	return {
		canKeepSession,
		loadSession() {
			const raw = readJson(sessionFile) as { sealed?: unknown } | null
			if (!canKeepSession || typeof raw?.sealed !== 'string') return null
			try {
				return sessionFromDisk(JSON.parse(safeStorage.decryptString(Buffer.from(raw.sealed, 'base64'))))
			} catch {
				return null
			}
		},
		saveSession(session) {
			if (!canKeepSession) throw new Error('no OS keystore: the session cannot be kept')
			writeAtomic(sessionFile, JSON.stringify({ sealed: safeStorage.encryptString(JSON.stringify(session)).toString('base64') }))
		},
		clearSession: () => remove(sessionFile),
		loadSchedule() {
			const raw = readJson(scheduleFile) as { at?: unknown; value?: unknown } | null
			const value = raw?.value as Schedule | undefined
			if (typeof raw?.at !== 'number' || typeof value?.campus !== 'string' || value.service === undefined) return null
			return { value, at: raw.at }
		},
		saveSchedule: (value, at) => writeAtomic(scheduleFile, JSON.stringify({ at, value })),
		clearSchedule: () => remove(scheduleFile),
	}
}
