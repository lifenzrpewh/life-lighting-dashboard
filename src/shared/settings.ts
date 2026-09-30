// Settings: the facts about a booth that nothing can derive.
//
// WHY THIS EXISTS: the rule is "resist configuration": anything the show can
// describe about itself is read from the show, and a setting for it would be a
// bug in the derivation. This file holds only what no show knows: where the
// console is on this network, which ports its OSC entry uses, and which MA
// users the pane logs in as. Keep it that way. A proposed setting that the
// console could tell us belongs in a read, not here.
//
// The OSC ports pass that test only because of the order things happen in: the
// show does know them, in its OSC entry, but nothing can be read from the show
// until they are already right.
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
	/** The Port of the console's OSC entry, where commands (channel A) go. */
	oscPort: number
	/** Where this computer listens for the console (channels B and C). Null
	 *  means the same as `oscPort`, which is MA's own model: an entry has one
	 *  Port, used both ways (docs/MA3_READ_MODEL.md § One Port, both directions).
	 *
	 *  It differs only when grandMA3 onPC runs on this computer, whose address is
	 *  then 127.0.0.1. onPC holds every row's port itself (✅ 2026-09-30), so
	 *  replies need a row and a port of their own. */
	replyPort: number | null
}

/** The working config's port (✅ 2026-09-21, OSC row 3). */
export const DEFAULT_OSC_PORT = 8003

/** The port this computer actually listens on. */
export function replyPortOf(s: Settings): number {
	return s.replyPort ?? s.oscPort
}

/** True when the console address is this computer: onPC running beside the
 *  dashboard. Loopback only, so it is decided from the address alone. */
export function isLoopback(host: string): boolean {
	return host === 'localhost' || /^127(?:\.\d{1,3}){3}$/.test(host)
}

export const DEFAULT_SETTINGS: Settings = {
	consoleHost: null,
	webRemotePort: DEFAULT_WEB_REMOTE_PORT,
	volunteerUser: DEFAULT_REMOTE_USER,
	operatorUser: null,
	oscPort: DEFAULT_OSC_PORT,
	replyPort: null,
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
	if (patch.oscPort !== undefined) {
		if (isPort(patch.oscPort)) next.oscPort = patch.oscPort
		else errors.oscPort = `A whole number from 1 to 65535: the Port of the console's OSC entry, ${DEFAULT_OSC_PORT} as set up.`
	}
	if (patch.replyPort !== undefined) {
		if (patch.replyPort === null || isPort(patch.replyPort)) next.replyPort = patch.replyPort
		else errors.replyPort = 'A whole number from 1 to 65535, or blank for the same port as the console.'
	}
	// Stored as "same" rather than as a copy, so a later change to the console's
	// port carries the replies with it.
	if (next.replyPort === next.oscPort) next.replyPort = null
	// The one layout known to fail. onPC on this computer holds its rows'
	// ports, and the reply socket sits beside it on 127.0.0.1 exactly, so a
	// shared port would carry the dashboard's own commands straight back to it.
	if (next.consoleHost !== null && isLoopback(next.consoleHost) && replyPortOf(next) === next.oscPort && errors.replyPort === undefined) {
		errors.replyPort = `The console is this computer, so onPC holds ${next.oscPort} itself. Replies need their own port, such as ${next.oscPort + 1}.`
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
	if (typeof r['oscPort'] === 'number' && isPort(r['oscPort'])) out.oscPort = r['oscPort']
	if (typeof r['replyPort'] === 'number' && isPort(r['replyPort']) && r['replyPort'] !== out.oscPort) out.replyPort = r['replyPort']
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
	const num = (v: unknown) => typeof v === 'number'
	const checks: Array<[keyof SettingsPatch, (v: unknown) => boolean]> = [
		['consoleHost', strOrNull],
		['webRemotePort', num],
		['oscPort', num],
		['replyPort', (v) => v === null || num(v)],
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
