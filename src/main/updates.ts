// The updater: asks this repo's releases whether a newer Pāua is out, and installs
// it when an Admin says so. The rules are ../shared/updates.ts.
//
// electron-updater does the work: it reads `latest.yml` from the newest
// published GitHub release, downloads the installer, checks its SHA-512 and
// runs it silently. The installer is unsigned, which electron-updater accepts
// as long as no publisher is named for it to check.
//
// THE WATCHDOG (./supervisor.ts): the app quits cleanly to install, so the
// watchdog sees a clean exit and stops, rather than restarting the old copy
// over the installer. The installer closes anything of Pāua's still running
// and opens the new one when it is done (`forceRunAfter`), which starts its
// own watchdog. ⚠️ Not yet watched on the booth box.

import { app } from 'electron'
import electronUpdater from 'electron-updater'

import { CHECK_EVERY_MS, FIRST_CHECK_MS, type UpdateState } from '../shared/updates.js'

const { autoUpdater } = electronUpdater

export type Updates = {
	state(): UpdateState
	/** Ask now. A check already out is not asked twice. */
	check(): void
	/** Download the version found and install it: Pāua closes and reopens. */
	install(): void
	stop(): void
}

export function startUpdates(options: { onChange: (state: UpdateState) => void }): Updates {
	let state: UpdateState =
		!app.isPackaged
			? { state: 'unsupported', why: 'This is a checkout: update it with git (scripts/windows/update.cmd).' }
			: process.platform !== 'win32'
				? { state: 'unsupported', why: 'The Mac build installs updates by hand: download the newest from the releases page.' }
				: { state: 'idle' }
	const set = (next: UpdateState) => {
		state = next
		options.onChange(next)
	}
	const fake = process.env['PAUA_FAKE_UPDATE']
	if (!app.isPackaged && fake !== undefined && fake !== '') return fakeUpdates(fake, set)
	if (state.state === 'unsupported') return { state: () => state, check() {}, install() {}, stop() {} }

	autoUpdater.autoDownload = false
	autoUpdater.autoInstallOnAppQuit = false
	autoUpdater.logger = {
		info: (m: unknown) => console.log(`[updates] ${String(m)}`),
		warn: (m: unknown) => console.log(`[updates] ${String(m)}`),
		error: (m: unknown) => console.error(`[updates] ${String(m)}`),
		debug: () => {},
	}

	let found: string | null = null
	autoUpdater.on('checking-for-update', () => {
		if (state.state !== 'downloading' && state.state !== 'installing') set({ state: 'checking' })
	})
	autoUpdater.on('update-available', (info) => {
		found = info.version
		if (state.state !== 'downloading' && state.state !== 'installing') set({ state: 'available', version: info.version, at: Date.now() })
	})
	autoUpdater.on('update-not-available', () => {
		found = null
		set({ state: 'current', at: Date.now() })
	})
	autoUpdater.on('download-progress', (p) => {
		if (found !== null) set({ state: 'downloading', version: found, percent: p.percent })
	})
	autoUpdater.on('update-downloaded', (info) => {
		set({ state: 'installing', version: info.version })
		console.log(`[updates] installing ${info.version}: Pāua closes and opens again`)
		// Silent, and open again when done. A beat first, so the screen has
		// said so before the window goes.
		setTimeout(() => autoUpdater.quitAndInstall(true, true), 1_500)
	})
	autoUpdater.on('error', (e: Error) => {
		const detail = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|net::/.test(e.message) ? 'no internet, or GitHub did not answer.' : e.message.split('\n')[0] ?? 'unknown error'
		set({ state: 'failed', detail, at: Date.now() })
	})

	const check = () => {
		if (state.state === 'checking' || state.state === 'downloading' || state.state === 'installing') return
		// Errors arrive through 'error' above, which says them.
		autoUpdater.checkForUpdates().catch(() => {})
	}
	const first = setTimeout(check, FIRST_CHECK_MS)
	const every = setInterval(check, CHECK_EVERY_MS)
	first.unref?.()
	every.unref?.()

	return {
		state: () => state,
		check,
		install() {
			if (state.state !== 'available') return
			console.log(`[updates] downloading ${state.version}, as an Admin asked`)
			set({ state: 'downloading', version: state.version, percent: 0 })
			autoUpdater.downloadUpdate().catch(() => {})
		},
		stop() {
			clearTimeout(first)
			clearInterval(every)
		},
	}
}

/** A checkout started with PAUA_FAKE_UPDATE=<version>: the screens of an
 *  update without one, for checking them on a laptop. The check finds the
 *  version, Update counts a download up, and installing stops there: nothing
 *  is downloaded, and Pāua does not close. */
function fakeUpdates(version: string, set: (state: UpdateState) => void): Updates {
	let state: UpdateState = { state: 'idle' }
	const go = (next: UpdateState) => {
		state = next
		set(next)
	}
	let timer: ReturnType<typeof setInterval> | null = null
	const check = () => {
		if (state.state === 'downloading' || state.state === 'installing') return
		go({ state: 'checking' })
		setTimeout(() => go({ state: 'available', version, at: Date.now() }), 1_000)
	}
	setTimeout(check, 3_000)
	console.log(`[updates] PAUA_FAKE_UPDATE: pretending ${version} is out`)
	return {
		state: () => state,
		check,
		install() {
			if (state.state !== 'available') return
			let percent = 0
			go({ state: 'downloading', version, percent })
			timer = setInterval(() => {
				percent += 10
				if (percent < 100) return go({ state: 'downloading', version, percent })
				if (timer !== null) clearInterval(timer)
				go({ state: 'installing', version })
			}, 400)
		},
		stop() {
			if (timer !== null) clearInterval(timer)
		},
	}
}
