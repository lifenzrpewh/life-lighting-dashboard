// The video feed: a picture Arena publishes over Spout (Windows) or Syphon
// (macOS), shown in a slot (docs/VISUALS_DASHBOARD.md, piece 5: the multiview).
//
// WHY THIS SHAPE: Arena builds the multiview on its own GPU (an Advanced Output
// screen whose slices are layers, groups and the composition) and publishes it
// as one texture. This receives that texture and hands it to the page as a
// VideoFrame without the pixels ever leaving the GPU: the native addon
// (@napolab/texture-bridge) opens the sender's texture and mints a handle,
// Electron's `sharedTexture` imports it here and sends it to the page, and
// the page draws it. The dashboard shares a GPU with the show's output, so a
// CPU copy per frame (8 MB at 1080p) is the thing to avoid.
//
// THE RULES THIS FILE ENFORCES:
// - Every native handle is either given to Electron or closed. A handle is
//   minted per frame; one dropped on the floor is a leaked NT HANDLE a frame.
// - At most one frame in flight. A slow page skips frames, it never queues
//   them, so the picture is late by at most one frame, never by a backlog.
// - Nothing is received while no page is watching. The poll stops at once,
//   so a dashboard not showing the feed costs nothing; the receiver itself is
//   held for HOLD_MS before it is let go, so a tab switched away and back
//   picks up the same receiver rather than opening Spout again.
//   (2026-10-11, the owner, on the booth that never showed a picture: 1.0.0
//   "worked, until i changed tab then it died". A tab switch unmounts the
//   view, and until then that closed the receiver and opened a new one, with
//   a new D3D11 device, on the way back: the first open worked and a reopen
//   did not. Why the reopen fails is ⚠️ not seen; not reopening is the fix
//   that needs no answer to it.)
// - Which senders exist is read from the machine, never set: a view is offered
//   when something answers (../shared/layout.ts). With several, the first by
//   name is shown until the page picks another.
//
// - Never "waiting" for ever (2026-10-08: a booth's view listed Arena and
//   waited through restarts and reinstalls, with nothing in the log). A
//   sender tried for NO_PICTURE_AFTER_MS with no frame reaching the page is
//   said to have given none, with the likeliest reason
//   (../shared/video-feed.ts, explainNoPicture), in the view and the log; and
//   every new failure is a `[video]` line. Restart lets everything go and
//   starts again, for anyone.
//
// WHY A BOOTH CAN WAIT FOR EVER (read from the addon's source, upstream
// 7f7d589, packages/native/cpp/win/spout_bridge.cpp; ⚠️ not seen on that
// machine): each TextureReceiver makes its own D3D11 device on the DEFAULT
// adapter (`D3D11CreateDevice(nullptr, …)`), and opens the sender's texture
// on it. Spout's handle is a legacy shared handle, which opens only on the
// card that made it. On a computer with two graphics cards, Arena on the
// discrete one and Pāua on the other (Windows' default for an app it does not
// know), every open fails, and the addon says only "not connected (sender
// disconnected or never appeared)", while the sender is still listed. Until
// 2026-10-08 that went into `failure` and nowhere else.
// Windows' own per-app setting is the fix (Settings › System › Display ›
// Graphics › Pāua: High performance): it moves the addon's default adapter
// and Chromium's together. Chromium's `force_high_performance_gpu` switch was
// not added: it moves Chromium only, so it would put the page on one card and
// the addon's textures on the other, breaking a machine that works.
//
// 🔬 The addon is 0.15.0, one maintainer, MIT, prebuilt (no install script).
// `sharedTexture` is experimental in Electron 44. Both are why this is a
// spike-grade module until it has run a service.

import { app, sharedTexture, type WebContents } from 'electron'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	NO_PICTURE_AFTER_MS,
	describeGpus,
	explainNoPicture,
	plainVideoFailure,
	type Gpus,
	type VideoAttempt,
	type VideoFeedState,
} from '../shared/video-feed.js'

type Addon = typeof import('@napolab/texture-bridge')
type Receiver = InstanceType<Addon['TextureReceiver']>

/** How often the sender is asked for a new frame. Above any output rate a
 *  sender is likely to run at (Arena's composition here is 50 fps), so the
 *  picture is at most this late, and cheap: between frames (MIN_FRAME_MS)
 *  a poll asks nothing, and a receive with nothing new is a shared-memory
 *  read that returns null. */
const POLL_MS = 5
/** At most this often a frame is sent to the page. 60 fps with LIFE's ring
 *  build of the addon (native/texture-bridge/life-ring.patch, the owner,
 *  2026-10-05: "freaks out when fading down full screen things … higher
 *  framerate"); 30 with any other, whose one staging texture is overwritten
 *  while the page may still be drawing it, so a faster rate only tears more.
 *  ✅ 2026-10-03, on the Windows box, for the cost:
 *  - The addon's new-frame check said yes 162 times a second for a 30 fps
 *    stand-in sender, so without a cap the page redraws repeats as fast as
 *    the loop turns, on the GPU that is playing the show.
 *  - What a frame costs is the window redrawing, not the feed. That laptop's
 *    screen hangs off its Intel chip while everything renders on the NVIDIA,
 *    so each redraw of the 2560×1600 kiosk is copied across: the feed at 26-49
 *    fps cost 9-21% of the NVIDIA's copy engine, an 8 px square moving at 60
 *    fps cost 39%, and nothing moving cost 0. So the rate is the cost, and it
 *    is halved from a screen's 60. A desktop with its screens on the graphics
 *    card should not pay it at all (not yet measured). */
const RING_BUILD = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../vendor/texture-bridge/BUILD.txt')
const hasRing = (): boolean => {
	try {
		return process.platform === 'win32' && fs.existsSync(PATCHED) && /^ring\s/m.test(fs.readFileSync(RING_BUILD, 'utf8'))
	} catch {
		return false
	}
}
/** How long a receiver nobody watches is kept before it is let go: longer
 *  than a look at another tab, short enough that a feed left for good is not
 *  held all service. */
const HOLD_MS = 120_000
/** How often the machine's senders are listed. */
const LIST_MS = 2_000

const PIXEL_FORMATS = ['bgra', 'rgba', 'rgbaf16'] as const
type PixelFormat = (typeof PIXEL_FORMATS)[number]
const isPixelFormat = (v: string): v is PixelFormat => (PIXEL_FORMATS as readonly string[]).includes(v)

export type VideoFeed = {
	state(): VideoFeedState
	/** This page wants frames, or no longer does. */
	watch(page: WebContents, on: boolean): void
	/** Show this sender rather than the first. */
	choose(name: string): void
	/** Let every receiver go and start again, keeping who watches and the
	 *  pick: the app need not restart for the addon to be fresh. */
	restart(): void
	stop(): void
}

/** A frame handed to the page and not taken in this long is said, once. */
const STUCK_SEND_MS = 5_000

/** LIFE's own Windows build of the addon, with the 16-bit patch
 *  (native/texture-bridge/): Arena with High Detail on is converted to BGRA8
 *  on the GPU rather than refused. Built by GitHub Actions
 *  (.github/workflows/texture-bridge.yml), since a booth box has no build
 *  tools. Same API as the npm package's binary, which is the fallback. */
const PATCHED = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../vendor/texture-bridge/index.win32-x64-msvc.node')

/** The addon, or why it would not load: a missing or broken native binary is
 *  said in the view, never a crash of the kiosk. */
function loadAddon(): Addon | string {
	const require = createRequire(import.meta.url)
	try {
		if (process.platform === 'win32' && fs.existsSync(PATCHED)) {
			console.log('[video] using the LIFE build of texture-bridge (16-bit senders converted)')
			return require(PATCHED) as Addon
		}
		return require('@napolab/texture-bridge') as Addon
	} catch (e) {
		return (e as Error).message
	}
}


/** The graphics cards Chromium sees, and whether it composites on one. */
async function readGpus(): Promise<{ gpus: Gpus | null; compositing: string }> {
	let gpus: Gpus | null = null
	try {
		gpus = describeGpus(await app.getGPUInfo('basic'))
	} catch {
		gpus = null
	}
	let compositing = 'unknown'
	try {
		compositing = app.getGPUFeatureStatus().gpu_compositing
	} catch {
		// Said as unknown.
	}
	return { gpus, compositing }
}

export function startVideoFeed(): VideoFeed {
	let addon = loadAddon()
	const ring = typeof addon !== 'string' && hasRing()
	const MIN_FRAME_MS = 1000 / (ring ? 60 : 30)
	if (typeof addon !== 'string') console.log(`[video] up to ${ring ? 60 : 30} fps${ring ? ' (ring build: no tearing on fades)' : ''}`)
	const watchers = new Set<WebContents>()
	/** Pages already told to stop watching when they are destroyed. */
	const listening = new WeakSet<WebContents>()
	let senders: string[] = []
	let chosen: string | null = null
	let receiver: { name: string; native: Receiver } | null = null
	let poll: ReturnType<typeof setInterval> | null = null
	/** Lets an unwatched receiver go, HOLD_MS after the last page stopped. */
	let hold: ReturnType<typeof setTimeout> | null = null
	let inFlight = false
	let lastSentAt = 0
	let lastFrame: VideoFeedState['lastFrame'] = null
	let failure: string | null = null
	/** The last failure written to the log, so a failure repeated every
	 *  tick is one line, and a new one is a line of its own. */
	let failureLogged: string | null = null
	/** Bumped by a restart: a frame sent before it settles without touching
	 *  what came after. */
	let generation = 0
	/** What happened since the shown sender was first tried, and when that
	 *  was; null while nothing is being received. */
	let attempt: (VideoAttempt & { since: number; explained: boolean }) | null = null
	let graphics: { gpus: Gpus | null; compositing: string } = { gpus: null, compositing: 'unknown' }
	/** When a slow frame was last logged: at most one line every 10 s. */
	let slowLoggedAt = 0

	/** Set what went wrong, and say it in the log the first time. */
	const fail = (why: string | null) => {
		failure = why
		if (why !== null && why !== failureLogged) console.log(`[video] ${why}`)
		failureLogged = why
	}
	if (typeof addon === 'string') fail(`the video addon did not load: ${addon}`)

	const lookAtGraphics = () => {
		void readGpus().then((g) => {
			graphics = g
			console.log(
				`[video] graphics: ${g.gpus === null ? 'cards not known' : `${g.gpus.count} card${g.gpus.count === 1 ? '' : 's'}: ${g.gpus.words}`}; compositing ${g.compositing}`,
			)
		})
	}
	// Not at once: at start the GPU process may not be up, and compositing read
	// "disabled_software" there and "enabled" seconds later (this Mac,
	// 2026-10-08). Before NO_PICTURE_AFTER_MS, so a reason has the cards.
	const firstLook = setTimeout(lookAtGraphics, 5_000)

	// Where a stall comes from (the owner, 2026-10-05: frozen and slow to catch
	// up while Arena fades to black, which a stand-in fading the whole picture
	// at 50 fps did not reproduce: 47 fps, ~65 ms late, no gap over 30 ms).
	// Each 5 s with something wrong says which, in one line: this process too
	// busy to ask for frames, the sender sending none, or a receive slow.
	let health = { since: performance.now(), lastTick: performance.now(), busy: 0, quiet: 0, receive: 0, lastNew: performance.now() }
	const HEALTH_MS = 5_000
	const BAD_MS = 250
	const reportHealth = (now: number) => {
		if (now - health.since < HEALTH_MS) return
		const h = health
		health = { ...h, since: now, busy: 0, quiet: 0, receive: 0 }
		if (h.busy < BAD_MS && h.quiet < BAD_MS && h.receive < 40) return
		const parts = [
			h.busy >= BAD_MS ? `the kiosk's main process was busy for ${Math.round(h.busy)} ms` : null,
			h.quiet >= BAD_MS ? `the sender sent nothing for ${Math.round(h.quiet)} ms` : null,
			h.receive >= 40 ? `taking a frame took ${Math.round(h.receive)} ms` : null,
		].filter((p) => p !== null)
		console.log(`[video] in the last ${Math.round(HEALTH_MS / 1000)} s: ${parts.join('; ')} (${receiver?.name ?? 'no sender'}, ${counted.fps} fps)`)
	}
	/** Frames delivered in the current second, and the last whole second's count. */
	let counted = { second: 0, frames: 0, fps: 0 }

	const showing = (): string | null => (chosen !== null && senders.includes(chosen) ? chosen : (senders[0] ?? null))

	const list = () => {
		if (typeof addon === 'string') return
		try {
			senders = addon
				.listSenders()
				.map((s) => s.name)
				.sort((a, b) => a.localeCompare(b))
		} catch (e) {
			senders = []
			fail(`listing senders failed: ${(e as Error).message}`)
		}
		connect()
	}

	const pause = () => {
		if (poll !== null) clearInterval(poll)
		poll = null
	}

	const release = () => {
		pause()
		if (hold !== null) clearTimeout(hold)
		hold = null
		try {
			receiver?.native.stop()
		} catch (e) {
			console.log(`[video] letting "${receiver?.name}" go failed: ${(e as Error).message}`)
		}
		receiver = null
		attempt = null
	}

	/** Hold a receiver for the sender being shown, while someone watches,
	 *  and for HOLD_MS after. */
	const connect = () => {
		const name = showing()
		if (typeof addon === 'string' || name === null) return release()
		if (watchers.size === 0) {
			// Kept, not polled: the same receiver if a page comes back in time.
			if (receiver === null || receiver.name !== name) return release()
			if (poll !== null) console.log(`[video] nobody watching: "${receiver.name}" kept for ${HOLD_MS / 1000} s`)
			pause()
			hold ??= setTimeout(() => {
				hold = null
				if (watchers.size === 0) {
					console.log(`[video] nobody watched for ${HOLD_MS / 1000} s: letting "${receiver?.name}" go`)
					release()
				}
			}, HOLD_MS)
			return
		}
		if (hold !== null) clearTimeout(hold)
		hold = null
		if (receiver?.name === name) {
			if (poll === null) {
				// Watched again: the receiver that worked, not a new one.
				const now = performance.now()
				health = { since: now, lastTick: now, busy: 0, quiet: 0, receive: 0, lastNew: now }
				if (attempt !== null && attempt.delivered === 0) attempt = { ...attempt, since: now, explained: false }
				console.log(`[video] watching "${name}" again (same receiver)`)
				poll = setInterval(tick, POLL_MS)
			}
			return
		}
		release()
		try {
			receiver = { name, native: new addon.TextureReceiver(name) }
			fail(null)
			failureLogged = null
			// This sender's own count; the last one's is not its frame rate.
			counted = { second: 0, frames: 0, fps: 0 }
			const now = performance.now()
			health = { since: now, lastTick: now, busy: 0, quiet: 0, receive: 0, lastNew: now }
			attempt = { sender: name, notConnected: 0, otherError: null, imported: 0, delivered: 0, stuckSend: false, since: now, explained: false }
			console.log(`[video] receiving "${name}"`)
		} catch (e) {
			// Tried again at the next listing, every 2 s; said once.
			fail(`could not open "${name}": ${(e as Error).message}`)
			return
		}
		poll = setInterval(tick, POLL_MS)
	}

	/** No frame from the shown sender in NO_PICTURE_AFTER_MS: say why, once
	 *  per sender tried, and keep saying it in the view until one comes. */
	const checkNoPicture = (now: number) => {
		if (attempt === null || attempt.delivered > 0) return
		if (inFlight && now - lastSentAt > STUCK_SEND_MS) attempt.stuckSend = true
		if (now - attempt.since < NO_PICTURE_AFTER_MS) return
		const why = explainNoPicture(attempt, { listed: senders.includes(attempt.sender), gpus: graphics.gpus })
		if (why === null) return
		if (!attempt.explained) {
			attempt.explained = true
			let connected = 'unknown'
			try {
				connected = String(receiver?.native.isConnected() ?? false)
			} catch {
				// Said as unknown.
			}
			console.log(
				`[video] no picture from "${attempt.sender}" in ${Math.round((now - attempt.since) / 1000)} s` +
					` (addon connected: ${connected}; "not connected" ${attempt.notConnected} times; frames taken ${attempt.imported}, reached the page ${attempt.delivered}` +
					`${attempt.stuckSend ? '; a frame sent to the page was never taken' : ''}${attempt.otherError === null ? '' : `; last error: ${attempt.otherError}`})`,
			)
		}
		fail(why)
	}

	const tick = () => {
		const started = performance.now()
		health.busy = Math.max(health.busy, started - health.lastTick - POLL_MS)
		health.lastTick = started
		reportHealth(started)
		checkNoPicture(started)
		// Not asking the sender is not the sender being quiet.
		if (typeof addon === 'string' || receiver === null || inFlight || started - lastSentAt < MIN_FRAME_MS) {
			health.lastNew = started
			return
		}
		let frame: ReturnType<Receiver['receiveSharedTexture']>
		try {
			// On Windows, no `hasNewFrame()` first (it was, until 2026-10-08). It
			// reads a flag that only a receive updates (Spout's
			// spoutFrameCount::IsFrameNew), so where Spout's frame counting is on
			// (SpoutSettings › Frame count, a registry key) one poll that found no
			// new frame left it false, and nothing ever asked again: the picture
			// froze for good (⚠️ read from the source, not seen). Where counting is
			// off it was always true (✅ 2026-10-03: 162 yeses a second from a 30
			// fps sender), so it never saved anything. A receive with nothing new
			// returns null itself; the frame cap above keeps the rate. Syphon's
			// check is its own client's state and stays, so a Mac is unchanged.
			if (process.platform !== 'win32' && !receiver.native.hasNewFrame()) return
			frame = receiver.native.receiveSharedTexture()
			health.receive = Math.max(health.receive, performance.now() - started)
		} catch (e) {
			// ✅ 2026-10-03: it throws, rather than returning null, while the
			// sender is gone. The list notices the sender leaving. It also refuses
			// a 16-bit picture here, which is said in plain words.
			// "Not connected" while the sender is still listed is the texture not
			// opening on this card: said after NO_PICTURE_AFTER_MS, with why,
			// since a sender starting up says it too for a moment.
			const message = (e as Error).message
			if (attempt !== null) {
				if (/not connected/i.test(message)) attempt.notConnected++
				else attempt.otherError = message
			}
			if (!/not connected/i.test(message)) fail(plainVideoFailure(message))
			return
		}
		if (frame === null) return
		// Measured when the next frame comes, so a sender that has gone for
		// good is the view's to say (stalled), not a line every 5 s.
		health.quiet = Math.max(health.quiet, started - health.lastNew)
		health.lastNew = started
		const { handle, width, height, pixelFormat } = frame
		const sender = receiver.name
		const pages = [...watchers].filter((p) => !p.isDestroyed())
		if (!isPixelFormat(pixelFormat) || pages.length === 0) {
			if (!isPixelFormat(pixelFormat)) fail(`the sender's pixel format "${pixelFormat}" is not one Electron takes`)
			addon.closeNativeHandle(handle)
			return
		}
		let imported: Electron.SharedTextureImported
		try {
			imported = sharedTexture.importSharedTexture({
				textureInfo: {
					codedSize: { width, height },
					pixelFormat,
					handle: process.platform === 'win32' ? { ntHandle: handle } : { ioSurface: handle },
				},
			})
		} catch (e) {
			addon.closeNativeHandle(handle)
			fail(`importing a frame failed: ${(e as Error).message}`)
			return
		}
		if (attempt !== null) attempt.imported++
		inFlight = true
		lastSentAt = performance.now()
		const gen = generation
		const tried = attempt
		// async, so a send that throws rather than rejects is still settled:
		// otherwise inFlight would stay set and the picture freeze for good.
		void Promise.allSettled(pages.map(async (p) => sharedTexture.sendSharedTexture({ frame: p.mainFrame, importedSharedTexture: imported })))
			.then((results) => {
				// Sent before a restart: its texture is let go below, nothing else.
				if (gen !== generation) return
				const sent = results.some((r) => r.status === 'fulfilled')
				if (!sent) {
					const why = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason
					fail(`sending a frame to the page failed: ${why instanceof Error ? why.message : String(why)}`)
					return
				}
				fail(null)
				if (tried !== null) tried.delivered++
				const now = Date.now()
				lastFrame = { at: now, width, height, sender }
				const second = Math.floor(now / 1000)
				counted = second === counted.second ? { ...counted, frames: counted.frames + 1 } : { second, frames: 1, fps: counted.frames }
			})
			.finally(() => {
				imported.release()
				if (gen !== generation) return
				inFlight = false
				// A frame slow to reach the page is the picture "taking a second to
				// update" (the owner, 2026-10-05): said in the log, to find which.
				const took = performance.now() - lastSentAt
				if (took > 250 && performance.now() - slowLoggedAt > 10_000) {
					slowLoggedAt = performance.now()
					console.log(`[video] a frame took ${Math.round(took)} ms to reach the page (${sender})`)
				}
			})
	}

	list()
	const lister = setInterval(list, LIST_MS)

	return {
		state: () => ({
			senders,
			showing: showing(),
			lastFrame,
			fps: Math.floor(Date.now() / 1000) - counted.second > 1 ? 0 : counted.fps,
			failure,
			watched: watchers.size > 0,
		}),
		watch(page, on) {
			if (on) {
				// Once per page for its life, not once per watch: a slot swapped to
				// and from Video, or a pop-out and back, watches again each time.
				if (!listening.has(page)) {
					listening.add(page)
					page.once('destroyed', () => {
						listening.delete(page)
						watchers.delete(page)
						connect()
					})
				}
				watchers.add(page)
			} else watchers.delete(page)
			connect()
		},
		choose(name) {
			chosen = name
			connect()
		},
		restart() {
			console.log(`[video] restart: letting ${receiver === null ? 'nothing' : `"${receiver.name}"`} go and starting again (${watchers.size} watching)`)
			generation++
			release()
			// A frame still with the page settles on its own; a new one may go now.
			inFlight = false
			lastSentAt = 0
			lastFrame = null
			counted = { second: 0, frames: 0, fps: 0 }
			fail(null)
			failureLogged = null
			// Node keeps a binary that loaded; one that failed is tried again.
			if (typeof addon === 'string') {
				addon = loadAddon()
				if (typeof addon === 'string') fail(`the video addon did not load: ${addon}`)
			}
			senders = []
			lookAtGraphics()
			list()
		},
		stop() {
			clearInterval(lister)
			clearTimeout(firstLook)
			generation++
			release()
		},
	}
}
