// The showfile's write half: Save As and Load (docs/PLAN.md Phase 3), the
// rules both sides of the IPC boundary use. Main sends; the sheet shows the
// exact string that will be sent.
//
// THE RULES THIS FILE ENFORCES:
// - Names are OFFERED, not typed: the campus, then the New Zealand date and
//   time to the minute (the owner's choice, 2026-10-04). Nothing to misspell
//   at the booth, and two saves a minute apart never share a name.
// - The budget is 31 characters, because MA truncates a show name there
//   silently (✅ `SaveShow "LIFE Basefile Master 260827_013143"` landed as
//   `…260827_013`, and two saves in ten minutes overwrote each other). The
//   timestamp carries the uniqueness, so it is budgeted first and the campus
//   is what gets trimmed.
// - Only characters every leg carries unchanged go in a name: ASCII letters,
//   digits, space, `-`, `_` and `.`. A quote would end the command early
//   with the console still saying OK (MA3_SYNTAX_REFERENCE), and LifeBridge
//   sends non-ASCII and commas back changed, so the read-back could never
//   confirm the save.
// - The base show is never a Save As target. Overwriting it is not in this
//   app at all (docs/PLAN.md); Base File Saver stays a console plugin.
// - A Load always sends /NoConfirmation, so the console asks nothing the
//   screen cannot see, and /Save or /NoSave, so what happens to the show
//   being replaced is decided here, out loud, never by a default.

/** MA's limit on a show name: longer is cut there without a word. */
export const SHOW_NAME_MAX = 31

/** The longest campus setting. It is cut further to fit the budget. */
export const CAMPUS_MAX = 24

const SAFE = /^[A-Za-z0-9 _.-]+$/

/** `2026-10-04 0915`, the New Zealand date and time to the minute, whatever
 *  the computer's own zone: a booth PC set to UTC must not name Sunday's
 *  show after Saturday. */
export function nzStamp(at: Date): string {
	const parts = new Intl.DateTimeFormat('en-NZ', {
		timeZone: 'Pacific/Auckland',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(at)
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
	return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}${get('minute')}`
}

/** The campus as it can go into a name: macrons folded (Pāua is Paua),
 *  then safe characters only, single spaces. */
export function campusPart(campus: string | null): string {
	const cleaned = (campus ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^A-Za-z0-9 _.-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	return cleaned === '' ? 'Show' : cleaned
}

/** The name Save As offers: `Central 2026-10-04 0915`. The stamp is whole;
 *  the campus is cut to whatever room is left. */
export function offeredName(campus: string | null, at: Date): string {
	const stamp = nzStamp(at)
	const room = SHOW_NAME_MAX - stamp.length - 1
	const lead = campusPart(campus).slice(0, room).trim()
	return `${lead === '' ? 'Show' : lead} ${stamp}`
}

/** Why a name cannot be saved as, or null when it can. `base` is the base
 *  show's name as the console sent it. */
export function saveAsProblem(name: string, base: string | null): string | null {
	if (name === '') return 'No name.'
	if (name.length > SHOW_NAME_MAX) return `MA keeps only ${SHOW_NAME_MAX} characters of a show name.`
	if (!SAFE.test(name)) return 'Only letters, numbers, spaces, - _ and . can be carried to the console unchanged.'
	if (name !== name.trim()) return 'No spaces at the start or end.'
	if (base !== null && name.toLowerCase() === base.trim().toLowerCase()) return 'That is the base show. It is never overwritten from here.'
	return null
}

/** Why a show cannot be loaded by name from here, or null when it can. */
export function loadProblem(name: string): string | null {
	if (name === '') return 'No name.'
	if (/["\u0000-\u001f\u007f]/.test(name) || /[^ -~]/.test(name)) return 'Its name has characters the link cannot carry. Load it at the console.'
	return null
}

export function saveAsCommand(name: string): string {
	return `SaveShow "${name}"`
}

export function loadCommand(name: string, saveFirst: boolean): string {
	return `LoadShow "${name}" /NoConfirmation ${saveFirst ? '/Save' : '/NoSave'}`
}

/** The console's show files, newest first, as LifeBridge's `shows` listed
 *  them, or why there is no list. Never an empty list standing in for a
 *  failure: a console with no shows says so with `shows: []` and `ok`. */
export type ShowList =
	| { ok: true; way: string; shows: { name: string; loadable: boolean }[] }
	| { ok: false; detail: string }

/** What came of a Save As or a Load: sent, or why not. Sent is not done: the
 *  sheet waits for the console to read the new name back. */
export type ShowWriteResult = { ok: true } | { ok: false; detail: string }

/** How long the sheet waits for the read-back before saying it has not
 *  come. A Save As is pushed by LifeBridge's watcher within about a second
 *  (✅ 2026-10-02); a Load ends the watcher and waits for the link to come
 *  back and ask, so it gets longer. */
export const SAVE_CONFIRM_MS = 10_000
export const LOAD_CONFIRM_MS = 60_000
