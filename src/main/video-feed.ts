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
// - Nothing is received while no page is watching. The poll stops and the
//   receiver is let go, so a dashboard not showing the feed costs nothing.
// - Which senders exist is read from the machine, never set: a view is offered
//   when something answers (../shared/layout.ts). With several, the first by
//   name is shown until the page picks another.
//
// 🔬 The addon is 0.15.0, one maintainer, MIT, prebuilt (no install script).
// `sharedTexture` is experimental in Electron 44. Both are why this is a
// spike-grade module until it has run a service.

import { sharedTexture, type WebContents } from 'electron'
import { createRequire } from 'node:module'

import type { VideoFeedState } from '../shared/video-feed.js'

type Addon = typeof import('@napolab/texture-bridge')
type Receiver = InstanceType<Addon['TextureReceiver']>

/** How often the sender is asked for a new frame. Above any output rate a
 *  sender is likely to run at (Arena's composition here is 50 fps), so the
 *  picture is at most this late, and cheap: a check is a flag read. */
const POLL_MS = 5
/** At most this often a frame is sent to the page: 30 fps, enough to watch a
 *  multiview by. ✅ 2026-10-03, on the Windows box:
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
const MIN_FRAME_MS = 1000 / 30
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
	stop(): void
}

/** The addon, or why it would not load: a missing or broken native binary is
 *  said in the view, never a crash of the kiosk. */
function loadAddon(): Addon | string {
	try {
		return createRequire(import.meta.url)('@napolab/texture-bridge') as Addon
	} catch (e) {
		return (e as Error).message
	}
}

export function startVideoFeed(): VideoFeed {
	const addon = loadAddon()
	const watchers = new Set<WebContents>()
	let senders: string[] = []
	let chosen: string | null = null
	let receiver: { name: string; native: Receiver } | null = null
	let poll: ReturnType<typeof setInterval> | null = null
	let inFlight = false
	let lastSentAt = 0
	let lastFrame: { at: number; width: number; height: number } | null = null
	let failure: string | null = typeof addon === 'string' ? `the video addon did not load: ${addon}` : null
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
			failure = `listing senders failed: ${(e as Error).message}`
		}
		connect()
	}

	const release = () => {
		if (poll !== null) clearInterval(poll)
		poll = null
		receiver?.native.stop()
		receiver = null
	}

	/** Hold a receiver for the sender being shown, while someone watches. */
	const connect = () => {
		const name = showing()
		if (typeof addon === 'string' || watchers.size === 0 || name === null) return release()
		if (receiver?.name === name) return
		release()
		try {
			receiver = { name, native: new addon.TextureReceiver(name) }
			failure = null
			console.log(`[video] receiving "${name}"`)
		} catch (e) {
			failure = `could not open "${name}": ${(e as Error).message}`
			return
		}
		poll = setInterval(tick, POLL_MS)
	}

	const tick = () => {
		if (typeof addon === 'string' || receiver === null || inFlight) return
		if (performance.now() - lastSentAt < MIN_FRAME_MS) return
		let frame: ReturnType<Receiver['receiveSharedTexture']>
		try {
			// ✅ 2026-10-03: without this check the addon hands back the same frame
			// on every call (554 in 3 s from a 30 fps sender).
			if (!receiver.native.hasNewFrame()) return
			frame = receiver.native.receiveSharedTexture()
		} catch (e) {
			// ✅ 2026-10-03: it throws, rather than returning null, while the
			// sender is gone. The list notices the sender leaving.
			failure = (e as Error).message
			return
		}
		if (frame === null) return
		const { handle, width, height, pixelFormat } = frame
		const pages = [...watchers].filter((p) => !p.isDestroyed())
		if (!isPixelFormat(pixelFormat) || pages.length === 0) {
			if (!isPixelFormat(pixelFormat)) failure = `the sender's pixel format "${pixelFormat}" is not one Electron takes`
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
			failure = `importing a frame failed: ${(e as Error).message}`
			return
		}
		inFlight = true
		lastSentAt = performance.now()
		void Promise.allSettled(pages.map((p) => sharedTexture.sendSharedTexture({ frame: p.mainFrame, importedSharedTexture: imported })))
			.then((results) => {
				const sent = results.some((r) => r.status === 'fulfilled')
				if (!sent) {
					const why = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason
					failure = `sending a frame to the page failed: ${why instanceof Error ? why.message : String(why)}`
					return
				}
				failure = null
				const now = Date.now()
				lastFrame = { at: now, width, height }
				const second = Math.floor(now / 1000)
				counted = second === counted.second ? { ...counted, frames: counted.frames + 1 } : { second, frames: 1, fps: counted.frames }
			})
			.finally(() => {
				imported.release()
				inFlight = false
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
		}),
		watch(page, on) {
			if (on) {
				if (!watchers.has(page)) page.once('destroyed', () => this.watch(page, false))
				watchers.add(page)
			} else watchers.delete(page)
			connect()
		},
		choose(name) {
			chosen = name
			connect()
		},
		stop() {
			clearInterval(lister)
			release()
		},
	}
}
