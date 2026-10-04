// When the installed app dies, whether it comes back. The rule kiosk.cmd
// keeps for a checkout, kept here for the installer's copy, which had none:
// a crash left the booth screen simply gone.
//
// A clean quit (Alt+F4, Cmd+Q, exit 0) stays quit, so the screen can always be
// got out of the way. Anything else comes back after `delayMs`.
//
// UNLIKE kiosk.cmd, IT GIVES UP: `limit` crashes inside `windowMs` and it
// stops, logged. A build that dies on start would otherwise flash a window
// every few seconds forever, which is worse at a booth than a closed app,
// and hides the console's own screens behind it.

export type Exit = { code: number | null; signal: string | null }

export type Step = { kind: 'stop'; why: string } | { kind: 'restart'; afterMs: number } | { kind: 'give-up'; why: string }

export const RESTART_DELAY_MS = 5_000
export const CRASH_LIMIT = 5
export const CRASH_WINDOW_MS = 2 * 60_000

/** What to do after `exit`. `crashes` are the times of earlier crashes, and
 *  this one is added to them by the caller only when the answer is not stop. */
export function nextStep(
	exit: Exit,
	crashes: readonly number[],
	now: number,
	opts: { delayMs?: number; limit?: number; windowMs?: number } = {},
): Step {
	if (exit.code === 0 && exit.signal === null) return { kind: 'stop', why: 'quit normally' }
	const windowMs = opts.windowMs ?? CRASH_WINDOW_MS
	const recent = crashes.filter((t) => now - t < windowMs).length + 1
	if (recent >= (opts.limit ?? CRASH_LIMIT)) {
		return { kind: 'give-up', why: `${recent} crashes in ${Math.round(windowMs / 1000)} s` }
	}
	return { kind: 'restart', afterMs: opts.delayMs ?? RESTART_DELAY_MS }
}

/** An exit, in words for the log. */
export function exitWords(exit: Exit): string {
	return exit.signal !== null ? `killed by ${exit.signal}` : `exit code ${exit.code}`
}
