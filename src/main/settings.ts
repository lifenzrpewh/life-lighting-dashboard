// Settings on disk: one JSON file in the app's own data folder, passwords
// encrypted with the OS keystore (DPAPI on Windows, Keychain on macOS).
//
// THE RULES THIS FILE ENFORCES:
// - A password is never written in the clear. With no keystore, passwords
//   cannot be saved, and the panel says so. Plaintext is not the fallback.
// - A password never leaves main. The renderer learns only whether one is set.
// - A save is all or nothing, and lands by rename, so a crash mid-write leaves
//   the old file rather than half a new one.

import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import type { Mode } from '../shared/ma-pane.js'
import {
	applyPatch,
	fromDisk,
	type Checked,
	type Settings,
	type SettingsPatch,
	type SettingsView,
} from '../shared/settings.js'

type Secrets = Record<Mode, string | null>

export type SettingsStore = {
	current(): Settings
	/** For main alone: the pane's login. Never sent over IPC. */
	password(mode: Mode): string | null
	view(): SettingsView
	save(patch: SettingsPatch): Checked
	onChange(listener: () => void): void
}

export function openSettings(): SettingsStore {
	const file = path.join(app.getPath('userData'), 'settings.json')
	const canEncrypt = safeStorage.isEncryptionAvailable()
	const listeners: Array<() => void> = []

	let settings: Settings = fromDisk(null)
	let secrets: Secrets = { volunteer: null, operator: null }

	try {
		const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
		settings = fromDisk(raw)
		secrets = readSecrets(raw)
	} catch (e) {
		// No file yet is the normal first boot. Anything else is worth a line in
		// the log, and still boots: on defaults, the pane says no address is set.
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`[settings] unreadable, using defaults: ${String(e)}`)
	}

	return {
		current: () => settings,
		password: (mode) => secrets[mode],
		view: () => ({
			...settings,
			volunteerHasPassword: secrets.volunteer !== null,
			operatorHasPassword: secrets.operator !== null,
			canStorePasswords: canEncrypt,
		}),

		save(patch) {
			const checked = applyPatch(settings, patch)
			if (!checked.ok) return checked

			const next: Secrets = { ...secrets }
			for (const [mode, key] of [['volunteer', 'volunteerPassword'], ['operator', 'operatorPassword']] as const) {
				const pw = patch[key]
				if (pw === undefined) continue
				if (pw !== null && !canEncrypt) {
					return { ok: false, errors: { [key]: 'This computer has no keystore to protect a password, so none can be saved.' } }
				}
				next[mode] = pw
			}

			try {
				const tmp = `${file}.tmp`
				fs.mkdirSync(path.dirname(file), { recursive: true })
				fs.writeFileSync(tmp, JSON.stringify({ ...checked.settings, secrets: writeSecrets(next) }, null, '\t'))
				fs.renameSync(tmp, file)
			} catch (e) {
				return { ok: false, errors: { form: `Could not save settings: ${String(e)}` } }
			}

			settings = checked.settings
			secrets = next
			for (const l of listeners) l()
			return checked
		},

		onChange: (listener) => void listeners.push(listener),
	}
}

function writeSecrets(s: Secrets): Record<string, string> {
	const out: Record<string, string> = {}
	for (const mode of ['volunteer', 'operator'] as const) {
		const pw = s[mode]
		if (pw !== null) out[mode] = safeStorage.encryptString(pw).toString('base64')
	}
	return out
}

/** A secret that will not decrypt (the file came from another machine or
 *  Windows account) is dropped, not guessed at: the pane then logs in without
 *  it and MA refuses, which is visible, rather than silently wrong. */
function readSecrets(raw: unknown): Secrets {
	const out: Secrets = { volunteer: null, operator: null }
	const stored = (raw as { secrets?: Record<string, unknown> } | null)?.secrets
	if (typeof stored !== 'object' || stored === null || !safeStorage.isEncryptionAvailable()) return out
	for (const mode of ['volunteer', 'operator'] as const) {
		const b64 = stored[mode]
		if (typeof b64 !== 'string') continue
		try {
			out[mode] = safeStorage.decryptString(Buffer.from(b64, 'base64'))
		} catch {
			console.error(`[settings] the ${mode} password would not decrypt on this machine; dropped`)
		}
	}
	return out
}
