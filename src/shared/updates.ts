// Updates (the owner, 2026-10-11: "a nudge when there's a new version and have
// it prompt to auto update, or a check updates button in the settings"): what
// main's updater (../main/updates.ts) last knew, for the bar and Settings.
//
// WHERE THEY COME FROM: the public lifenzrpewh/paua-releases repo (the owner's
// choice, 2026-10-11), because this repo is private and a token built into the
// app would be one anybody could take out of it. The release build drafts a
// release there; publishing that draft is what rolls an update out, so nothing
// reaches a booth until the owner says.
//
// THE RULES THIS FILE CARRIES:
// - Checking is automatic; installing never is. A booth mid-service restarting
//   itself is the one thing an update must not do, so Pāua says a version is
//   there (the bar's alert lane, Settings › This computer) and an Admin taps
//   Update. The download starts only then, not behind a live stream.
// - Windows only. The Mac build is ad-hoc signed, and macOS installs an update
//   only into a properly signed app, so the Mac is told where the download is.
// - A failed check says so in words; it never reads as "up to date".

export type UpdateState =
	/** No updates here: a checkout (`npm start`, the dev kiosk) or the Mac. */
	| { state: 'unsupported'; why: string }
	/** Not yet asked: the first check waits a minute after the start. */
	| { state: 'idle' }
	| { state: 'checking' }
	/** Asked at `at`, and this is the newest. */
	| { state: 'current'; at: number }
	/** A newer version is published. */
	| { state: 'available'; version: string; at: number }
	/** Update tapped: the installer coming down. */
	| { state: 'downloading'; version: string; percent: number }
	/** Downloaded: Pāua closes, installs it and opens again. */
	| { state: 'installing'; version: string }
	| { state: 'failed'; detail: string; at: number }

/** How often main asks, after the first: four times a day is plenty for a
 *  release a week, and the bar says it at once when one is found. */
export const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

/** How long after the start the first check waits, so it never competes with
 *  the panes logging in. */
export const FIRST_CHECK_MS = 60 * 1000

/** Where a person downloads a build by hand: the Mac, or when the updater
 *  cannot. */
export const RELEASES_PAGE = 'https://github.com/lifenzrpewh/paua-releases/releases/latest'

/** The state in a few words, for Settings. */
export function updateWords(u: UpdateState, version: string): string {
	switch (u.state) {
		case 'unsupported':
			return u.why
		case 'idle':
			return `Pāua ${version}. Not checked yet.`
		case 'checking':
			return 'Checking for a new version…'
		case 'current':
			return `Pāua ${version} is the newest.`
		case 'available':
			return `Pāua ${u.version} is out (this is ${version}).`
		case 'downloading':
			return `Downloading Pāua ${u.version}: ${Math.round(u.percent)}%`
		case 'installing':
			return `Installing Pāua ${u.version}. It opens again by itself.`
		case 'failed':
			return `Could not check: ${u.detail}`
	}
}
