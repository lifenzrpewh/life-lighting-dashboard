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
