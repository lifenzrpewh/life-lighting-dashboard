// Admin: the mode that changes things (called operator mode until 2026-10-08;
// the code still says `operator`). What it is for is in ./ma-pane.ts and
// src/renderer/mode.ts; this file is how a person gets into it, and for how
// long it stays.
//
// LOCKED BY A PASSCODE (the owner, 2026-10-08), not by a 3-second hold: a hold
// kept a palm off it, never a volunteer who had seen it done. The passcode is
// set, changed and removed in Settings › Admin, which only Admin reaches, and
// is checked by main (src/main/kiosk.ts) against a salted hash
// (src/bridge/passcode.ts). The screen learns only whether one is set and
// whether it is all digits, which picks the keypad over the keyboard; the
// hash never leaves main. With none set, a tap goes straight in, and Settings
// says so.
//
// FIVE WRONG TRIES, THEN A 30 s WAIT, said in words. Main holds the count, so
// a reload of the page does not reset it. A restart of the app does: the wait
// is to slow a guesser at the screen, not a lock against someone who can quit
// the kiosk, who could as well open the settings file.
//
// FORGOTTEN? Close Pāua, open `settings.json` in its data folder
// (`%APPDATA%\paua` on Windows, `~/Library/Application Support/paua` on a
// Mac), delete the `"adminPasscode": { … }` entry, save, and start Pāua again.
// Admin then opens with a tap; set a new passcode in Settings › Admin. Delete
// only that entry: the rest of the file is the booth's addresses and sealed MA
// passwords. Also in docs/FIELD_TEST.md § Admin.
//
// THE TIMEOUT is per computer, in Settings › Admin (the owner, 2026-10-08):
// Admin drops back to volunteer after that long with no input anywhere,
// including inside the MA pane, the run order and embeds. 15 minutes, as it
// always was, unless a booth chooses otherwise.

/** The choices Settings offers, in minutes. */
export const ADMIN_TIMEOUTS_MIN = [2, 5, 10, 15, 30, 60] as const

export const DEFAULT_ADMIN_TIMEOUT_MIN = 15

export function isAdminTimeout(v: unknown): v is (typeof ADMIN_TIMEOUTS_MIN)[number] {
	return typeof v === 'number' && (ADMIN_TIMEOUTS_MIN as readonly number[]).includes(v)
}

/** Short enough to type on a keypad; long enough that a glance over a shoulder
 *  is not the whole of it. */
export const PASSCODE_MIN = 4
export const PASSCODE_MAX = 64

/** Why a new passcode will not do, or null. Not trimmed: what is typed is the
 *  passcode, and a space at its end would be invisible on the next try. */
export function passcodeError(code: string): string | null {
	if (code.length < PASSCODE_MIN) return `At least ${PASSCODE_MIN} characters or digits.`
	if (code.length > PASSCODE_MAX) return `At most ${PASSCODE_MAX}.`
	if (/[\u0000-\u001f\u007f]/.test(code)) return 'Letters, numbers and punctuation only.'
	if (code !== code.trim()) return 'No spaces at the start or end.'
	return null
}

/** All digits: the unlock sheet opens on its keypad. */
export function isNumericPasscode(code: string): boolean {
	return /^\d+$/.test(code)
}

export const TRIES_BEFORE_WAIT = 5
export const WRONG_WAIT_MS = 30_000

/** Wrong tries since the last right one or the last wait, and when a wait
 *  ends (0: none). */
export type Lockout = { fails: number; until: number }

export const NO_LOCKOUT: Lockout = { fails: 0, until: 0 }

/** How long until the passcode may be tried again; 0 when it may now. */
export function lockoutWait(l: Lockout, now: number): number {
	return Math.max(0, l.until - now)
}

/** After a wrong try: the fifth starts the wait, and the count begins again
 *  after it, so the next five are allowed before the next wait. */
export function afterWrong(l: Lockout, now: number): Lockout {
	const fails = l.fails + 1
	return fails >= TRIES_BEFORE_WAIT ? { fails: 0, until: now + WRONG_WAIT_MS } : { fails, until: l.until }
}

/** What the unlock sheet needs to know before anyone types. */
export type AdminState = {
	hasPasscode: boolean
	/** All digits: open on the keypad. */
	numeric: boolean
	/** A wait still running from earlier wrong tries, in ms. */
	waitMs: number
}

export type UnlockResult =
	| { ok: true }
	| { ok: false; why: 'wrong'; triesLeft: number }
	| { ok: false; why: 'wait'; waitMs: number }

/** One try, decided. `check` is main's hash comparison, asked only when a
 *  passcode is set and no wait is running. */
export function tryUnlock(
	l: Lockout,
	now: number,
	hasPasscode: boolean,
	check: () => boolean,
): { result: UnlockResult; lockout: Lockout } {
	const wait = lockoutWait(l, now)
	if (wait > 0) return { result: { ok: false, why: 'wait', waitMs: wait }, lockout: l }
	if (!hasPasscode || check()) return { result: { ok: true }, lockout: NO_LOCKOUT }
	const next = afterWrong(l, now)
	const waitMs = lockoutWait(next, now)
	return {
		result: waitMs > 0 ? { ok: false, why: 'wait', waitMs } : { ok: false, why: 'wrong', triesLeft: TRIES_BEFORE_WAIT - next.fails },
		lockout: next,
	}
}

/** A wait in words, by the whole second, rounded up so it never says 0. */
export function waitWords(ms: number): string {
	const s = Math.max(1, Math.ceil(ms / 1000))
	return `Too many wrong tries. Try again in ${s} ${s === 1 ? 'second' : 'seconds'}.`
}

/** A wrong try in words. */
export function wrongWords(triesLeft: number): string {
	return `Not the passcode. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} before a ${WRONG_WAIT_MS / 1000}-second wait.`
}
