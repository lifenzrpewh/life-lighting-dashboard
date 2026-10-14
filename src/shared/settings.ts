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
// until they are already right. OnTime, ProPresenter and Arena pass it plainly:
// they are other computers, and no show knows where they are.
//
// Passwords are write-only from the renderer's side. `SettingsView` says
// whether one is set and never what it is; main keeps them encrypted at rest.

import { DEFAULT_ADMIN_TIMEOUT_MIN, isAdminTimeout, passcodeError } from './admin.js'
import { DEFAULT_ARENA_PORT } from './arena.js'
import { CONNECTIONS, type ConnectionId } from './connections.js'
import { embedsFrom, type Embed } from './embeds.js'
import { isFolderPath } from './media-fetch.js'
import { ndiSourcesFrom, type NdiSource } from './ndi.js'
import { captureInputsFrom, type CaptureInput } from './capture.js'
import { DEFAULT_REMOTE_USER, DEFAULT_WEB_REMOTE_PORT, isConsoleHost, isPort } from './ma-pane.js'
import { CAMPUS_MAX } from './showfile-write.js'

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
	 *  means worked out (`sameReplyPortOf`): the same as `oscPort`, which is
	 *  MA's own model, an entry has one Port used both ways
	 *  (docs/MA3_READ_MODEL.md § One Port, both directions), or the next one up
	 *  for onPC on this computer.
	 *
	 *  It differs only when grandMA3 onPC runs on this computer, whose address is
	 *  then 127.0.0.1. onPC holds every row's port itself (✅ 2026-09-30), so
	 *  replies need a row and a port of their own. */
	replyPort: number | null
	/** OnTime, for the countdown chip. Null host: OnTime is not used. */
	onTimeHost: string | null
	onTimePort: number
	/** ProPresenter, likewise. Its port is whatever its Network settings show;
	 *  1025 is the one LIFE's booths use (the owner, 2026-10-08), so it is
	 *  offered, and a booth on another changes it. */
	proPresenterHost: string | null
	proPresenterPort: number
	/** Which ProPresenter timer the chip follows, by its name there. Null: the
	 *  first one counting. A booth can run several timers at once, and which
	 *  one counts to the next thing is a habit of the people, not a fact any
	 *  program holds, so it passes the test above. */
	proPresenterTimer: string | null
	/** ProPresenter's announcements (./announcements.ts § LOADING): whether this
	 *  booth uses them at all (off hides the view, for a campus without them),
	 *  the folder Pāua copies the week's lower thirds into (as this computer
	 *  reaches it), the ordinary media playlist they are dragged into from it, and the output playlist's name without
	 *  its AM, PM or EVENT. Which names a booth gave its playlists is a habit of
	 *  the booth, not a fact the show holds. */
	announcementsOn: boolean
	announcementsFolder: string | null
	announcementsMediaPlaylist: string
	announcementsPlaylist: string
	/** Resolume Arena's web server. Null host: no Arena. Often this very
	 *  computer, 127.0.0.1, because the visuals station runs on Arena's machine. */
	arenaHost: string | null
	arenaPort: number
	/** The campus this booth is, as Save As names begin with it
	 *  (`Central 2026-10-04 0915`, src/shared/showfile-write.ts). No show
	 *  carries it, and the Cue Manager's campus is behind its own page. Null:
	 *  names begin `Show`. */
	campus: string | null
	/** Connections turned off in Connections: kept, address and all, but not
	 *  asked, not in the dot, and their views and chips gone from the screen
	 *  (the owner, 2026-10-04). Which programs a booth uses is a fact about the
	 *  booth, not the show, so it passes the test above. */
	off: ConnectionId[]
	/** Web pages added in Connections, each a view of its own
	 *  (./embeds.ts). Which pages a booth keeps beside the MA is a habit of
	 *  the booth, not a fact any show holds. */
	embeds: Embed[]
	/** NDI sources added in Connections, each a view of its own (./ndi.ts).
	 *  Which of the network's sources a booth watches is a habit of the booth. */
	ndiSources: NdiSource[]
	/** Capture inputs added in Connections, each a view of its own
	 *  (./capture.ts): which of this computer's cameras a booth watches. */
	captureInputs: CaptureInput[]
	/** A window rather than the whole screen: for testers on a laptop (the
	 *  owner, 2026-10-04). The booth stays full screen. */
	windowed: boolean
	/** Where the comms team's media is, the NAS or its drive: only ever read,
	 *  for the media fetch (./media-fetch.ts). Null: no fetching. */
	graphicsFolder: string | null
	/** Where fetched media is copied on this computer, for Arena to play from.
	 *  Null: no fetching. Where a booth keeps files is a fact about the booth. */
	localMediaFolder: string | null
	/** Minutes with no input before Admin drops back to volunteer, one of
	 *  ADMIN_TIMEOUTS_MIN (./admin.ts). How long an LD walks away for is a
	 *  habit of the booth (the owner, 2026-10-08). */
	adminTimeoutMin: number
	/** Whether leaving Show mode asks Admin's way in (true, the default) or is
	 *  a tap for anyone, the mode as it was (the owner's to choose, 2026-10-14;
	 *  ../renderer/showMode.ts). */
	showModeLocked: boolean
}

/** OnTime's own default (docs.getontime.no, HTTP API). */
export const DEFAULT_ONTIME_PORT = 4001

/** ProPresenter's port at LIFE's booths (the owner, 2026-10-08). Before, there
 *  was no default and the field began blank, because ProPresenter picks its
 *  own; every booth had set it to this. */
export const DEFAULT_PROPRESENTER_PORT = 1025

/** The working config's port (✅ 2026-09-21, OSC row 3). */
export const DEFAULT_OSC_PORT = 8003

/** The port this computer actually listens on. */
export function replyPortOf(s: Settings): number {
	return s.replyPort ?? sameReplyPortOf(s)
}

/** The reply port when none is set: the console's own, as MA intends, except
 *  for onPC on this computer, which holds that port itself, so the next one up
 *  (the setup every onPC test here has used). Worked out, not asked for. */
export function sameReplyPortOf(s: Pick<Settings, 'consoleHost' | 'oscPort'>): number {
	if (s.consoleHost !== null && isLoopback(s.consoleHost)) return s.oscPort < 65535 ? s.oscPort + 1 : s.oscPort - 1
	return s.oscPort
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
	onTimeHost: null,
	onTimePort: DEFAULT_ONTIME_PORT,
	proPresenterHost: null,
	proPresenterPort: DEFAULT_PROPRESENTER_PORT,
	proPresenterTimer: null,
	announcementsOn: true,
	announcementsFolder: null,
	announcementsMediaPlaylist: 'Paua',
	announcementsPlaylist: 'Announcements',
	arenaHost: null,
	arenaPort: DEFAULT_ARENA_PORT,
	campus: null,
	off: [],
	embeds: [],
	ndiSources: [],
	captureInputs: [],
	windowed: false,
	graphicsFolder: null,
	localMediaFolder: null,
	adminTimeoutMin: DEFAULT_ADMIN_TIMEOUT_MIN,
	showModeLocked: true,
}

/** The settings main works from: a connection turned off is treated as one
 *  with no address, so nothing asks it. The stored settings keep the address. */
export function inUse(s: Settings): Settings {
	const off = new Set(s.off)
	return {
		...s,
		consoleHost: off.has('console') ? null : s.consoleHost,
		onTimeHost: off.has('ontime') ? null : s.onTimeHost,
		proPresenterHost: off.has('propresenter') ? null : s.proPresenterHost,
		arenaHost: off.has('arena') ? null : s.arenaHost,
	}
}

/** A list of connections off disk or IPC, or null if it is not one. Known ids
 *  only, each once, in the tab's order. */
function offFrom(v: unknown): ConnectionId[] | null {
	if (!Array.isArray(v) || !v.every((id) => (CONNECTIONS as readonly unknown[]).includes(id))) return null
	return CONNECTIONS.filter((id) => v.includes(id))
}

/** What the renderer is shown. Passwords appear only as whether they exist. */
export type SettingsView = Settings & {
	volunteerHasPassword: boolean
	operatorHasPassword: boolean
	/** False when the OS offers no keystore, in which case passwords cannot be
	 *  saved at all. Plaintext on disk is not the fallback. */
	canStorePasswords: boolean
	/** Whether Admin asks for a passcode (./admin.ts). Never the passcode,
	 *  nor its hash. */
	hasAdminPasscode: boolean
}

/** A change from the settings panel. For passwords, a missing key leaves the
 *  password as it is, a string sets it, and null removes it. */
export type SettingsPatch = Partial<Settings> & {
	volunteerPassword?: string | null
	operatorPassword?: string | null
	/** Admin's passcode: a string sets it, null removes it (./admin.ts). Main
	 *  keeps only a salted hash of it. */
	adminPasscode?: string | null
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

const TIMER_NAME_MAX = 128

function timerNameError(name: string): string | null {
	if (name.trim() === '') return 'A timer name is needed.'
	if (name.length > TIMER_NAME_MAX) return `At most ${TIMER_NAME_MAX} characters.`
	if (/[\u0000-\u001f\u007f]/.test(name)) return 'Letters, numbers and punctuation only.'
	return null
}

function playlistNameError(name: string): string | null {
	if (name.trim() === '') return 'A playlist name is needed.'
	if (name.length > TIMER_NAME_MAX) return `At most ${TIMER_NAME_MAX} characters.`
	if (/[\u0000-\u001f\u007f]/.test(name)) return 'Letters, numbers and punctuation only.'
	return null
}

function campusError(name: string): string | null {
	if (name.trim() === '') return 'A campus name is needed.'
	if (name.length > CAMPUS_MAX) return `At most ${CAMPUS_MAX} characters.`
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
	// Stored as "as worked out" rather than as a copy, so a later change to the
	// console's port (or address) carries the replies with it.
	if (next.replyPort === sameReplyPortOf(next)) next.replyPort = null
	// The one layout known to fail. onPC on this computer holds its rows'
	// ports, and the reply socket sits beside it on 127.0.0.1 exactly, so a
	// shared port would carry the dashboard's own commands straight back to it.
	if (next.consoleHost !== null && isLoopback(next.consoleHost) && replyPortOf(next) === next.oscPort && errors.replyPort === undefined) {
		errors.replyPort = `The console is this computer, so onPC holds ${next.oscPort} itself. Replies need their own port, such as ${next.oscPort + 1}.`
	}
	const hostError = 'An IP address like 10.11.60.50, or a hostname. No port or http://.'
	if (patch.onTimeHost !== undefined) {
		const host = patch.onTimeHost === null ? '' : patch.onTimeHost.trim()
		if (host === '') next.onTimeHost = null
		else if (isConsoleHost(host)) next.onTimeHost = host
		else errors.onTimeHost = hostError
	}
	if (patch.onTimePort !== undefined) {
		if (isPort(patch.onTimePort)) next.onTimePort = patch.onTimePort
		else errors.onTimePort = `A whole number from 1 to 65535. OnTime uses ${DEFAULT_ONTIME_PORT}.`
	}
	if (patch.proPresenterHost !== undefined) {
		const host = patch.proPresenterHost === null ? '' : patch.proPresenterHost.trim()
		if (host === '') next.proPresenterHost = null
		else if (isConsoleHost(host)) next.proPresenterHost = host
		else errors.proPresenterHost = hostError
	}
	if (patch.proPresenterPort !== undefined) {
		if (isPort(patch.proPresenterPort)) next.proPresenterPort = patch.proPresenterPort
		else errors.proPresenterPort = `A whole number from 1 to 65535: the port in ProPresenter’s Network settings, ${DEFAULT_PROPRESENTER_PORT} at LIFE.`
	}
	if (patch.campus !== undefined) {
		const name = patch.campus === null ? '' : patch.campus.trim()
		if (name === '') next.campus = null
		else {
			const e = campusError(name)
			if (e === null) next.campus = name
			else errors.campus = e
		}
	}
	if (patch.proPresenterTimer !== undefined) {
		// Kept as typed, not trimmed: it is compared exactly against the names
		// ProPresenter sends, and the panel offers those names to pick from.
		const name = patch.proPresenterTimer
		if (name === null || name.trim() === '') next.proPresenterTimer = null
		else {
			const e = timerNameError(name)
			if (e === null) next.proPresenterTimer = name
			else errors.proPresenterTimer = e
		}
	}
	if (patch.arenaHost !== undefined) {
		const host = patch.arenaHost === null ? '' : patch.arenaHost.trim()
		if (host === '') next.arenaHost = null
		else if (isConsoleHost(host)) next.arenaHost = host
		else errors.arenaHost = hostError
	}
	if (patch.arenaPort !== undefined) {
		if (isPort(patch.arenaPort)) next.arenaPort = patch.arenaPort
		else errors.arenaPort = `A whole number from 1 to 65535. Arena uses ${DEFAULT_ARENA_PORT}.`
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
	if (patch.off !== undefined) {
		const off = offFrom(patch.off)
		if (off === null) errors.off = 'Not a list of connections.'
		else next.off = off
	}
	if (patch.windowed !== undefined) next.windowed = patch.windowed
	if (patch.showModeLocked !== undefined) next.showModeLocked = patch.showModeLocked
	if (patch.announcementsOn !== undefined) next.announcementsOn = patch.announcementsOn
	for (const key of ['announcementsMediaPlaylist', 'announcementsPlaylist'] as const) {
		const v = patch[key]
		if (v === undefined) continue
		const e = playlistNameError(v)
		if (e === null) next[key] = v.trim()
		else errors[key] = e
	}
	const folderError = 'A whole folder path: D:\\Media, \\\\NAS\\Graphics, or /Volumes/Graphics.'
	for (const key of ['graphicsFolder', 'localMediaFolder', 'announcementsFolder'] as const) {
		const v = patch[key]
		if (v === undefined) continue
		const text = v === null ? '' : v.trim()
		if (text === '') next[key] = null
		else if (isFolderPath(text)) next[key] = text
		else errors[key] = folderError
	}
	if (
		next.graphicsFolder !== null &&
		next.localMediaFolder !== null &&
		next.graphicsFolder.toLowerCase().replace(/[\\/]+$/, '') === next.localMediaFolder.toLowerCase().replace(/[\\/]+$/, '') &&
		errors.localMediaFolder === undefined
	) {
		errors.localMediaFolder = 'Copies go to a folder of their own, not back into the graphics folder.'
	}
	if (patch.embeds !== undefined) {
		const embeds = embedsFrom(patch.embeds)
		if (embeds === null) errors.embeds = 'Each embed needs a name and a web address (https://…).'
		else next.embeds = embeds
	}
	if (patch.ndiSources !== undefined) {
		const sources = ndiSourcesFrom(patch.ndiSources)
		if (sources === null) errors.ndiSources = 'Each NDI source needs a name, and each source can be added once.'
		else next.ndiSources = sources
	}
	if (patch.captureInputs !== undefined) {
		const inputs = captureInputsFrom(patch.captureInputs)
		if (inputs === null) errors.captureInputs = 'Each capture input needs a name, and each camera can be added once.'
		else next.captureInputs = inputs
	}
	for (const key of ['volunteerPassword', 'operatorPassword'] as const) {
		const pw = patch[key]
		if (typeof pw === 'string' && pw === '') errors[key] = 'Leave blank to keep the password; use Remove to clear it.'
	}
	if (typeof patch.adminPasscode === 'string') {
		const e = passcodeError(patch.adminPasscode)
		if (e !== null) errors.adminPasscode = e
	}
	if (patch.adminTimeoutMin !== undefined) {
		if (isAdminTimeout(patch.adminTimeoutMin)) next.adminTimeoutMin = patch.adminTimeoutMin
		else errors.adminTimeoutMin = 'One of 2, 5, 10, 15, 30 or 60 minutes.'
	}

	return Object.keys(errors).length === 0 ? { ok: true, settings: next } : { ok: false, errors }
}

/** A list on disk, one entry at a time: the whole list when it reads, else
 *  every entry that reads alongside those before it (so the list's own
 *  limits, its count and no two alike, still hold). One entry edited by hand
 *  into something unreadable costs that entry, not the list: an embed list
 *  read as empty would also have its sign-ins swept away (../main/embeds.ts).
 *  Patches from the panel stay all or nothing (`applyPatch`). */
function eachOf<T>(v: unknown, from: (v: unknown) => T[] | null): T[] {
	const whole = from(v)
	if (whole !== null) return whole
	if (!Array.isArray(v)) return []
	let out: T[] = []
	for (const e of v) out = from([...out, e]) ?? out
	return out
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
	if (typeof r['onTimeHost'] === 'string' && isConsoleHost(r['onTimeHost'])) out.onTimeHost = r['onTimeHost']
	if (typeof r['onTimePort'] === 'number' && isPort(r['onTimePort'])) out.onTimePort = r['onTimePort']
	if (typeof r['proPresenterHost'] === 'string' && isConsoleHost(r['proPresenterHost'])) out.proPresenterHost = r['proPresenterHost']
	if (typeof r['proPresenterPort'] === 'number' && isPort(r['proPresenterPort'])) out.proPresenterPort = r['proPresenterPort']
	if (typeof r['proPresenterTimer'] === 'string' && timerNameError(r['proPresenterTimer']) === null) out.proPresenterTimer = r['proPresenterTimer']
	if (typeof r['arenaHost'] === 'string' && isConsoleHost(r['arenaHost'])) out.arenaHost = r['arenaHost']
	if (typeof r['arenaPort'] === 'number' && isPort(r['arenaPort'])) out.arenaPort = r['arenaPort']
	if (typeof r['campus'] === 'string' && campusError(r['campus']) === null) out.campus = r['campus']
	out.off = offFrom(r['off']) ?? []
	out.embeds = eachOf(r['embeds'], embedsFrom)
	out.ndiSources = eachOf(r['ndiSources'], ndiSourcesFrom)
	out.captureInputs = eachOf(r['captureInputs'], captureInputsFrom)
	out.windowed = r['windowed'] === true
	if (typeof r['announcementsOn'] === 'boolean') out.announcementsOn = r['announcementsOn']
	for (const key of ['announcementsMediaPlaylist', 'announcementsPlaylist'] as const) {
		const v = r[key]
		if (typeof v === 'string' && playlistNameError(v) === null) out[key] = v.trim()
	}
	for (const key of ['graphicsFolder', 'localMediaFolder', 'announcementsFolder'] as const) {
		const v = r[key]
		if (typeof v === 'string' && isFolderPath(v)) out[key] = v
	}
	if (isAdminTimeout(r['adminTimeoutMin'])) out.adminTimeoutMin = r['adminTimeoutMin']
	if (typeof r['showModeLocked'] === 'boolean') out.showModeLocked = r['showModeLocked']
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
		['onTimeHost', strOrNull],
		['onTimePort', num],
		['proPresenterHost', strOrNull],
		['proPresenterPort', num],
		['proPresenterTimer', strOrNull],
		['arenaHost', strOrNull],
		['arenaPort', num],
		['campus', strOrNull],
		['off', Array.isArray],
		['embeds', Array.isArray],
		['ndiSources', Array.isArray],
		['captureInputs', Array.isArray],
		['windowed', (v) => typeof v === 'boolean'],
		['announcementsOn', (v) => typeof v === 'boolean'],
		['announcementsFolder', strOrNull],
		['announcementsMediaPlaylist', str],
		['announcementsPlaylist', str],
		['graphicsFolder', strOrNull],
		['localMediaFolder', strOrNull],
		['volunteerUser', str],
		['operatorUser', strOrNull],
		['volunteerPassword', strOrNull],
		['operatorPassword', strOrNull],
		['adminPasscode', strOrNull],
		['adminTimeoutMin', num],
		['showModeLocked', (v) => typeof v === 'boolean'],
	]
	for (const [key, ok] of checks) {
		if (!(key in r)) continue
		if (!ok(r[key])) return null
		Object.assign(out, { [key]: r[key] })
	}
	return out
}

/** What a save changed, in words for the log (the field reports' "who changed
 *  the address"): each field with its old and new value, a list by its count,
 *  and passwords and the passcode only as set or removed, never a value. */
export function changedFields(before: Settings, after: Settings, patch: SettingsPatch): string[] {
	const out: string[] = []
	const word = (v: unknown) => (v === null ? 'blank' : typeof v === 'string' ? `"${v}"` : String(v))
	for (const key of Object.keys(after) as (keyof Settings)[]) {
		const a = before[key]
		const b = after[key]
		if (Array.isArray(a) || Array.isArray(b)) {
			if (JSON.stringify(a) === JSON.stringify(b)) continue
			const n = (v: unknown) => (Array.isArray(v) ? v.length : 0)
			out.push(key === 'off' ? `off: ${(b as string[]).join(', ') || 'none'}` : `${key}: ${n(a)} → ${n(b)}${n(a) === n(b) ? ' (edited)' : ''}`)
		} else if (a !== b) out.push(`${key}: ${word(a)} → ${word(b)}`)
	}
	for (const [key, name] of [
		['volunteerPassword', 'volunteer password'],
		['operatorPassword', 'admin MA password'],
		['adminPasscode', 'Admin passcode'],
	] as const) {
		const v = patch[key]
		if (v !== undefined) out.push(`${name} ${v === null ? 'removed' : 'set'}`)
	}
	return out
}
