// The video feed as a view a slot can hold (src/main/video-feed.ts): Arena's
// multiview, or whatever the machine's Spout/Syphon sender publishes, scaled
// to fit.
//
// Each frame arrives as a VideoFrame on the GPU and is drawn straight onto the
// canvas; nothing here copies pixels. The canvas is the frame's own size and
// the browser scales it to the slot, so a resize costs nothing per frame.
//
// A picture, not a reading (../../shared/video-feed.ts): while frames arrive
// nothing is drawn over it. When they stop, the last one stays, dimmed, under
// words saying for how long, because a frozen multiview looks like a quiet one.

import { useEffect, useRef } from 'react'

import { videoPicture, type VideoFeedState } from '../../shared/video-feed.js'
import { Say } from './MaPane.js'
import { Centered } from './Slot.js'

export function VideoView({ feed, now }: { feed: VideoFeedState | null | undefined; now: number }) {
	const canvas = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		const api = window.life
		if (api === undefined) return
		let ctx: CanvasRenderingContext2D | null = null
		return api.watchVideo((frame) => {
			const c = canvas.current
			if (c !== null) {
				if (c.width !== frame.displayWidth || c.height !== frame.displayHeight) {
					c.width = frame.displayWidth
					c.height = frame.displayHeight
					ctx = null
				}
				ctx ??= c.getContext('2d', { alpha: false })
				ctx?.drawImage(frame, 0, 0)
			}
			// This side's copy of the frame; the preload closes its own.
			frame.close()
		})
	}, [])

	if (feed === undefined || feed === null) {
		return (
			<Centered>
				<Say head="Video" body={window.life === undefined ? 'The video feed is shown only inside the kiosk.' : 'Not heard yet.'} />
			</Centered>
		)
	}

	const picture = videoPicture(feed, now)
	const said = (() => {
		switch (picture.state) {
			case 'no-sender':
				return {
					head: 'No video sender on this computer',
					body: 'Turn on a Spout output in Arena (Output › Advanced Output, a screen sent to Spout), and it appears here.',
				}
			case 'waiting':
				return { head: `Waiting for “${picture.sender}”`, body: picture.failure ?? 'No picture yet.' }
			case 'stalled':
				return {
					head: `No new picture for ${Math.round(picture.sinceMs / 1000)} s`,
					body: picture.failure ?? `“${picture.sender}” has stopped sending. This is the last picture it sent.`,
				}
			case 'showing':
				return null
		}
	})()

	return (
		<div className="relative flex min-h-0 min-w-0 flex-1 bg-black">
			<canvas
				ref={canvas}
				className={`size-full object-contain ${picture.state === 'showing' ? '' : 'opacity-30'}`}
				width={0}
				height={0}
			/>
			{said !== null && (
				<div className="absolute inset-0 flex items-center justify-center">
					<Say head={said.head} body={said.body} />
				</div>
			)}
		</div>
	)
}

/** Which sender to show, in the slot's strip, only when there is a choice.
 *  Picking says so to main, which keeps it while that sender exists. */
export function SenderPicker({ feed }: { feed: VideoFeedState | null | undefined }) {
	if (feed === undefined || feed === null || feed.senders.length < 2) return null
	return (
		<select
			value={feed.showing ?? ''}
			onChange={(e) => window.life?.chooseVideo(e.target.value)}
			aria-label="Which video sender to show"
			className="h-9 max-w-64 shrink-0 truncate rounded-md border border-booth-edge bg-booth-panel px-2 text-xs text-booth-dim"
		>
			{feed.senders.map((s) => (
				<option key={s} value={s}>
					{s}
				</option>
			))}
		</select>
	)
}
