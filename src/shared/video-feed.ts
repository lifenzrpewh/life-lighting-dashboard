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
	/** When the last frame reached the page, and its size. */
	lastFrame: { at: number; width: number; height: number } | null
	/** Frames delivered in the last whole second. */
	fps: number
	/** The newest thing that went wrong, until a frame gets through again. */
	failure: string | null
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

export function videoPicture(feed: VideoFeedState, now: number): VideoPicture {
	if (feed.showing === null) return { state: 'no-sender' }
	const sender = feed.showing
	if (feed.lastFrame === null) return { state: 'waiting', sender, failure: feed.failure }
	const sinceMs = now - feed.lastFrame.at
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

export type Size = { width: number; height: number }

/** How the picture sits in its space: the scale it is drawn at (contain, so
 *  the whole picture always shows) and the size Arena's screen would need to
 *  fill the space exactly, both in device pixels. `best` keeps the picture's
 *  shape when the space's own shape is not what Arena is sending. */
export function videoFit(picture: Size, spaceDevicePx: Size): { scale: number; best: Size } {
	const scale = Math.min(spaceDevicePx.width / picture.width, spaceDevicePx.height / picture.height)
	return { scale, best: { width: Math.round(spaceDevicePx.width), height: Math.round(spaceDevicePx.height) } }
}

/** The left slot's width that gives the video's slot the picture's shape, its
 *  height unchanged: Fit, rather than a new resolution in Arena. Not clamped;
 *  the slot's own limits apply after (../renderer/leftWidth.ts). */
export function fitLeftWidth(o: { side: 'left' | 'right'; picture: Size; space: Size; leftWidth: number }): number {
	const grow = (o.space.height * o.picture.width) / o.picture.height - o.space.width
	return Math.round(o.side === 'left' ? o.leftWidth + grow : o.leftWidth - grow)
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
