// Settings: the facts about a booth that nothing can derive.
//
// WHY THIS EXISTS: the rule is "resist configuration": anything the show can
// describe about itself is read from the show, and a setting for it would be a
// bug in the derivation. This file holds only what no show knows: where the
// console is on this network, and which MA users the pane logs in as. Keep it
// that way. A proposed setting that the console could tell us belongs in a read,
// not here.
//
// Passwords are write-only from the renderer's side. `SettingsView` says
// whether one is set and never what it is; main keeps them encrypted at rest.

import { DEFAULT_REMOTE_USER, DEFAULT_WEB_REMOTE_PORT, isConsoleHost, isPort } from './ma-pane.js'

export type Settings = {
	/** The console's IP or hostname. Null until someone sets it: there is no
	 *  sensible default, and guessing one would point the pane at a stranger. */
	consoleHost: string | null
	webRemotePort: number
	volunteerUser: string
	/** Null until set. Operator mode then keeps the pane on the volunteer user
	 *  and says so, rather than inventing a login. */
	operatorUser: string | null
}

export const DEFAULT_SETTINGS: Settings = {
	consoleHost: null,
	webRemotePort: DEFAULT_WEB_REMOTE_PORT,
	volunteerUser: DEFAULT_REMOTE_USER,
	operatorUser: null,
}

/** What the renderer is shown. Passwords appear only as whether they exist. */
export type SettingsView = Settings & {
	volunteerHasPassword: boolean
	operatorHasPassword: boolean
	/** False when the OS offers no keystore, in which case passwords cannot be
	 *  saved at all. Plaintext on disk is not the fallback. */
	canStorePasswords: boolean
}

/** A change from the settings panel. For passwords, a missing key leaves the
 *  password as it is, a string sets it, and null removes it. */
export type SettingsPatch = Partial<Settings> & {
	volunteerPassword?: string | null
	operatorPassword?: string | null
}

/** A field, or `form` for a failure that belongs to no one field (the disk). */
export type SettingsField = keyof SettingsPatch | 'form'

export type Checked =
	| { ok: true; settings: Settings }
	| { ok: false; errors: Partial<Record<SettingsField, string>> }

const USER_MAX = 64

function userError(name: string): string | null {
	if (name.trim() === '') return 'A user name is needed.'
	if (name !== name.trim()) return 'No spaces at the start or end.'
	if (name.length > USER_MAX) return `At most ${USER_MAX} characters.`
	if (/[\u0000-\u001f\u007f]/.test(name)) return 'Letters, numbers and punctuation only.'
	return null
}

/** Apply a patch to the current settings, or say, per field, why not. Nothing is
 *  half-applied: one bad field rejects the whole patch. */
export function applyPatch(current: Settings, patch: SettingsPatch): Checked {
	const next: Settings = { ...current }
	const errors: Partial<Record<SettingsField, string>> = {}

	if (patch.consoleHost !== undefined) {
		const host = patch.consoleHost === null ? '' : patch.consoleHost.trim()
		if (host === '') next.consoleHost = null
		else if (isConsoleHost(host)) next.consoleHost = host
		else errors.consoleHost = 'An IP address like 10.11.60.40, or a hostname. No port or http://.'
	}
	if (patch.webRemotePort !== undefined) {
		if (isPort(patch.webRemotePort)) next.webRemotePort = patch.webRemotePort
		else errors.webRemotePort = 'A whole number from 1 to 65535. The web remote uses 8080.'
	}
	if (patch.volunteerUser !== undefined) {
		const e = userError(patch.volunteerUser)
		if (e === null) next.volunteerUser = patch.volunteerUser
		else errors.volunteerUser = e
	}
	if (patch.operatorUser !== undefined) {
		if (patch.operatorUser === null || patch.operatorUser.trim() === '') next.operatorUser = null
		else {
			const e = userError(patch.operatorUser)
			if (e === null) next.operatorUser = patch.operatorUser
			else errors.operatorUser = e
		}
	}
	for (const key of ['volunteerPassword', 'operatorPassword'] as const) {
		const pw = patch[key]
		if (typeof pw === 'string' && pw === '') errors[key] = 'Leave blank to keep the password; use Remove to clear it.'
	}

	return Object.keys(errors).length === 0 ? { ok: true, settings: next } : { ok: false, errors }
}

/** Settings read back off disk, which may be old, hand-edited or corrupt. Each
 *  field that does not check out falls back to its default on its own, so one
 *  bad value costs that value and not the rest. */
export function fromDisk(raw: unknown): Settings {
	const out: Settings = { ...DEFAULT_SETTINGS }
	if (typeof raw !== 'object' || raw === null) return out
	const r = raw as Record<string, unknown>
	if (typeof r['consoleHost'] === 'string' && isConsoleHost(r['consoleHost'])) out.consoleHost = r['consoleHost']
	if (typeof r['webRemotePort'] === 'number' && isPort(r['webRemotePort'])) out.webRemotePort = r['webRemotePort']
	if (typeof r['volunteerUser'] === 'string' && userError(r['volunteerUser']) === null) out.volunteerUser = r['volunteerUser']
	if (typeof r['operatorUser'] === 'string' && userError(r['operatorUser']) === null) out.operatorUser = r['operatorUser']
	return out
}

/** A patch off the IPC boundary. Unknown keys are ignored; a known key of the
 *  wrong type rejects the whole patch (null), because dropping it quietly would
 *  report "saved" for a change that was never made. */
export function patchFrom(raw: unknown): SettingsPatch | null {
	if (typeof raw !== 'object' || raw === null) return null
	const r = raw as Record<string, unknown>
	const out: SettingsPatch = {}
	const str = (v: unknown) => typeof v === 'string'
	const strOrNull = (v: unknown) => v === null || typeof v === 'string'
	const checks: Array<[keyof SettingsPatch, (v: unknown) => boolean]> = [
		['consoleHost', strOrNull],
		['webRemotePort', (v) => typeof v === 'number'],
		['volunteerUser', str],
		['operatorUser', strOrNull],
		['volunteerPassword', strOrNull],
		['operatorPassword', strOrNull],
	]
	for (const [key, ok] of checks) {
		if (!(key in r)) continue
		if (!ok(r[key])) return null
		Object.assign(out, { [key]: r[key] })
	}
	return out
}
