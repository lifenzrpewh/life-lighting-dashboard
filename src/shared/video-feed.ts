// The video feed (src/main/video-feed.ts) as the page sees it, and what the
// view says about it.
//
// The feed is a picture, like the MA pane: its best state is `showing`, frames
// arriving. A picture that stops is said to have stopped and how long ago,
// never left up as if it were current, because a frozen frame of a multiview
// looks exactly like a quiet one.

export type VideoFeedState = {
	/** Every Spout/Syphon sender on this machine, by name. */
	senders: string[]
	/** The one shown: the page's pick while it exists, otherwise the first. */
	showing: string | null
	/** When the last frame reached the page, its size, and which sender sent
	 *  it. Read it through `currentFrame`, never directly. */
	lastFrame: { at: number; width: number; height: number; sender: string } | null
	/** Frames delivered in the last whole second. */
	fps: number
	/** The newest thing that went wrong, until a frame gets through again. */
	failure: string | null
	/** Whether a page is showing the feed. Nobody watching, nothing is
	 *  received, so no picture is not a fault. */
	watched: boolean
}

/** A picture this long without a new frame is said to have stopped. Long
 *  enough for a sender that only publishes on change (a still) to be caught
 *  by it, short enough that a frozen multiview is not mistaken for live. */
export const VIDEO_STALLED_AFTER_MS = 2_000

export type VideoPicture =
	| { state: 'no-sender' }
	| { state: 'waiting'; sender: string; failure: string | null }
	| { state: 'showing'; sender: string }
	| { state: 'stalled'; sender: string; sinceMs: number; failure: string | null }

/** The last frame, if it came from the sender now shown. Another sender's
 *  frame is no picture at all: after a pick, or when the shown sender goes
 *  and the next takes its place, the old picture under the new name would
 *  be a read that failed coming back looking like an answer, and its size
 *  would send Fit to the wrong shape. */
export function currentFrame(feed: VideoFeedState): VideoFeedState['lastFrame'] {
	return feed.lastFrame !== null && feed.lastFrame.sender === feed.showing ? feed.lastFrame : null
}

export function videoPicture(feed: VideoFeedState, now: number): VideoPicture {
	if (feed.showing === null) return { state: 'no-sender' }
	const sender = feed.showing
	const frame = currentFrame(feed)
	if (frame === null) return { state: 'waiting', sender, failure: feed.failure }
	const sinceMs = now - frame.at
	return sinceMs > VIDEO_STALLED_AFTER_MS ? { state: 'stalled', sender, sinceMs, failure: feed.failure } : { state: 'showing', sender }
}

/** What the addon's refusal of a texture format means, in words someone at
 *  the booth can act on. ✅ 2026-10-03: Arena with High Detail on (16 bits a
 *  channel) sends DXGI format 11, and the addon refuses it with
 *  "Unsupported DXGI_FORMAT for shared texture: 11". Anything else is passed
 *  on as it came. */
export function plainVideoFailure(message: string): string {
	const m = /Unsupported DXGI_FORMAT for shared texture: (\d+)/.exec(message)
	if (m === null) return message
	const format = Number(m[1])
	if (format === 11) {
		return 'The sender is sending 16-bit colour, which this view cannot show yet. In Arena that is High Detail (Composition settings); with it off, the picture shows here.'
	}
	return `The sender's picture is in a format this view cannot show yet (DXGI format ${format}).`
}

/** A sender tried this long with no frame reaching the page is said to have
 *  given none, with the likeliest reason, rather than left "waiting". Long
 *  enough for a sender starting up, short enough that nobody waits on it. */
export const NO_PICTURE_AFTER_MS = 10_000

/** What happened since the shown sender was first tried, counted by main
 *  (src/main/video-feed.ts). */
export type VideoAttempt = {
	sender: string
	/** The addon said its receiver is not connected: it could not open the
	 *  sender's picture (or the sender is gone; `listed` tells which). */
	notConnected: number
	/** The newest other error from a receive, in the addon's words. */
	otherError: string | null
	/** Frames taken from the sender and handed to Electron. */
	imported: number
	/** Frames the page took. */
	delivered: number
	/** A frame handed to the page that it has not taken for seconds. */
	stuckSend: boolean
}

/** Graphics cards as Chromium reports them (`app.getGPUInfo('basic')`). */
export type Gpus = { count: number; words: string; software: boolean }

const VENDORS: Record<number, string> = { 0x10de: 'NVIDIA', 0x8086: 'Intel', 0x1002: 'AMD', 0x1022: 'AMD', 0x1414: 'Microsoft (no graphics card)', 0x106b: 'Apple' }

/** The cards Chromium sees, in a line for the log, and how many. Anything not
 *  in the expected shape is said to be unknown, never guessed. */
export function describeGpus(info: unknown): Gpus | null {
	const devices = (info as { gpuDevice?: unknown } | null)?.gpuDevice
	if (!Array.isArray(devices) || devices.length === 0) return null
	let software = false
	const each = devices.map((d: Record<string, unknown>) => {
		const vendor = typeof d.vendorId === 'number' ? d.vendorId : null
		const device = typeof d.deviceId === 'number' ? d.deviceId : null
		const named = typeof d.deviceString === 'string' && d.deviceString !== '' ? d.deviceString : null
		const maker = vendor === null ? 'unknown' : (VENDORS[vendor] ?? `vendor 0x${vendor.toString(16)}`)
		const active = d.active === true
		if (active && vendor === 0x1414) software = true
		const hex = device === null ? '' : ` 0x${device.toString(16)}`
		const driver = typeof d.driverVersion === 'string' && d.driverVersion !== '' ? `, driver ${d.driverVersion}` : ''
		return `${named ?? `${maker}${hex}`}${driver}${active ? ' (Pāua draws with this one)' : ''}`
	})
	return { count: devices.length, words: each.join('; '), software }
}

/** Why a sender is listed but no picture has come, in words someone at the
 *  booth can act on. Null while there is no reason to give (a frame came). */
export function explainNoPicture(a: VideoAttempt, o: { listed: boolean; gpus: Gpus | null }): string | null {
	if (a.delivered > 0) return null
	const name = `“${a.sender}”`
	if (a.stuckSend || a.imported > 0) {
		return `Pictures from ${name} are taken but none reaches the screen. Pāua may be drawing on a different graphics card from the one the picture is on${
			o.gpus !== null && o.gpus.count > 1 ? ` (this computer has ${o.gpus.count})` : ''
		}. Try Restart video; if it stays, see the advice for two graphics cards in Connections › Video feed.`
	}
	if (a.notConnected > 0 && o.listed) {
		if (o.gpus?.software === true) {
			return `${name} is listed, but Pāua is drawing without a graphics card (Windows' basic display driver), so it cannot open the picture. Check the graphics driver, then restart Pāua.`
		}
		const cards = o.gpus !== null && o.gpus.count > 1 ? `This computer has ${o.gpus.count} graphics cards, ` : 'If this computer has two graphics cards, '
		return `${name} is listed, but its picture cannot be opened here. ${cards}and the sender is probably drawing on the other one. In Windows Settings › System › Display › Graphics, set both Pāua and Arena to High performance, then restart both.`
	}
	if (a.otherError !== null) return plainVideoFailure(a.otherError)
	if (!o.listed) return `${name} has gone from this computer's senders.`
	return `${name} is listed and open, but has sent no picture in ${Math.round(NO_PICTURE_AFTER_MS / 1000)} s. Is its output running (in Arena, the screen sent to Spout)?`
}

export type Size = { width: number; height: number }

/** How the picture sits in its space: the scale it is drawn at (contain, so
 *  the whole picture always shows) and the size Arena's screen would need to
 *  fill the space exactly, both in device pixels. `best` keeps the picture's
 *  shape when the space's own shape is not what Arena is sending. */
export function videoFit(picture: Size, spaceDevicePx: Size): { scale: number; best: Size } {
	const scale = Math.min(spaceDevicePx.width / picture.width, spaceDevicePx.height / picture.height)
	return { scale, best: { width: Math.round(spaceDevicePx.width), height: Math.round(spaceDevicePx.height) } }
}

/** A pop-out window's content size that gives its picture space the picture's
 *  shape, as tall as it is now unless that would not fit the room it has.
 *  `content` is the whole window's inside, `space` the picture's part of it;
 *  the difference (the strip) is kept. */
export function fitWindow(o: { picture: Size; space: Size; content: Size; room: Size }): Size {
	const extraW = o.content.width - o.space.width
	const extraH = o.content.height - o.space.height
	const aspect = o.picture.width / o.picture.height
	let h = o.space.height
	let w = h * aspect
	const maxW = o.room.width - extraW
	const maxH = o.room.height - extraH
	if (w > maxW) {
		w = maxW
		h = w / aspect
	}
	if (h > maxH) {
		h = maxH
		w = h * aspect
	}
	return { width: Math.round(w + extraW), height: Math.round(h + extraH) }
}
