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

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MonitorPlay, RotateCw } from 'lucide-react'

import { currentFrame, videoFit, videoPicture, type VideoFeedState } from '../../shared/video-feed.js'
import { Centered, Say } from './MaPane.js'
import { Button, IconButton } from './ui.js'
import { barButton } from './vocabulary.js'

export function VideoView({
	feed,
	now,
	onSpace,
}: {
	feed: VideoFeedState | null | undefined
	now: number
	/** Told the space the picture has, whenever it changes. */
	onSpace?: (space: VideoSpace | null) => void
}) {
	const canvas = useRef<HTMLCanvasElement>(null)

	// The space is the canvas's box: the picture is drawn whole inside it.
	const report = useRef(onSpace)
	report.current = onSpace
	useEffect(() => {
		const c = canvas.current
		if (c === null) return
		const measure = () => {
			const r = c.getBoundingClientRect()
			report.current?.({ width: Math.round(r.width), height: Math.round(r.height), dpr: window.devicePixelRatio })
		}
		measure()
		const ro = new ResizeObserver(measure)
		ro.observe(c)
		return () => {
			ro.disconnect()
			report.current?.(null)
		}
	}, [feed === undefined || feed === null])

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
				// On black, every frame: Arena's picture carries alpha, and a layer
				// fading out goes transparent, not black. Drawn over the last frame,
				// a transparent pixel draws nothing, so the old picture stayed: the
				// fade started and then froze (the owner, 2026-10-05; reproduced by
				// spikes/video-lag/sender.cjs --alpha: frame alpha 251 to 4, canvas
				// held at 220; on black it followed, 215 to 1). Arena's own
				// multiview shows it on black too.
				if (ctx !== null) {
					ctx.fillStyle = '#000'
					ctx.fillRect(0, 0, c.width, c.height)
					ctx.drawImage(frame, 0, 0)
				}
			}
			// This side's copy of the frame; the preload closes its own.
			frame.close()
		})
	}, [])

	// Another sender picked, or the shown one gone and the next in its place:
	// the old picture goes with it, rather than standing in for the new one.
	const showing = feed?.showing ?? null
	useEffect(() => {
		const c = canvas.current
		if (c === null) return
		c.width = 0
		c.height = 0
	}, [showing])

	if (feed === undefined || feed === null) {
		return (
			<Centered>
				<Say icon={MonitorPlay} head="Video" body={window.life === undefined ? 'The video feed is shown only inside the kiosk.' : 'Not heard yet.'} />
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
				// After NO_PICTURE_AFTER_MS without a frame, main gives the reason
				// as the failure: then it is no picture, not waiting.
				return picture.failure === null
					? { head: `Waiting for “${picture.sender}”`, body: 'No picture yet.' }
					: { head: `No picture from “${picture.sender}”`, body: picture.failure }
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
					<Say icon={MonitorPlay} head={said.head} body={said.body}>
						{/* Anyone may: it only opens the feed again (src/main/video-feed.ts). */}
						{window.life !== undefined && (
							<div className="mt-6 flex justify-center">
								<Button size="sm" icon={RotateCw} onClick={() => window.life?.restartVideo()}>
									Restart video
								</Button>
							</div>
						)}
					</Say>
				</div>
			)}
		</div>
	)
}

/** The space the picture is drawn in, in CSS pixels, and the screen's
 *  device pixels per CSS pixel: what Arena's screen would need to match it. */
export type VideoSpace = { width: number; height: number; dpr: number }

/** The video view's own controls, in its strip: which sender, how big the
 *  picture is against the space it has, and Fit.
 *
 *  The sender list is drawn here, not by a native <select>: the system's own
 *  dropdown would not take a pick on the booth's touchscreen (the owner,
 *  2026-10-03), and every other control here is big rows a finger can hit. */
export function VideoStrip({
	feed,
	space,
	onFit,
}: {
	feed: VideoFeedState | null | undefined
	space: VideoSpace | null
	/** Give the space the picture's shape; absent where nothing can be resized. */
	onFit?: (() => void) | undefined
}) {
	const [open, setOpen] = useState(false)
	if (feed === undefined || feed === null) return null
	const picture = currentFrame(feed)
	const device = space === null ? null : { width: space.width * space.dpr, height: space.height * space.dpr }
	const fit = picture === null || device === null ? null : videoFit(picture, device)
	const short = (name: string) => name.replace(/^Arena - /, '')
	return (
		<>
			{window.life !== undefined && (
				<IconButton icon={RotateCw} size="sm" label="Restart video: let the feed go and open it again" onClick={() => window.life?.restartVideo()} />
			)}
			{fit !== null && picture !== null && (
				<span
					className="hidden min-w-0 truncate text-xs text-booth-dim tabular-nums lg:inline"
					title="The sender's picture, and the space it is drawn in, in screen pixels"
				>
					{picture.width}×{picture.height} → {fit.best.width}×{fit.best.height} · {Math.round(fit.scale * 100)}%
				</span>
			)}
			{onFit !== undefined && fit !== null && (
				<button type="button" onClick={onFit} className={barButton} aria-label="Fit the space to the picture's shape">
					Fit
				</button>
			)}
			{feed.senders.length > 1 && (
				<div className="relative shrink-0">
					<button
						type="button"
						onClick={() => setOpen(!open)}
						aria-expanded={open}
						className={`${barButton} max-w-56 gap-2`}
					>
						<span className="truncate">{short(feed.showing ?? 'Source')}</span>
						<ChevronDown size={16} className="shrink-0 text-booth-dim" aria-hidden />
					</button>
					{open && (
						<ul className="absolute top-12 right-0 z-20 min-w-64 animate-rise overflow-hidden rounded-xl bg-booth-raise p-1.5 shadow-2xl ring-1 ring-booth-edge">
							{feed.senders.map((name) => (
								<li key={name}>
									<button
										type="button"
										onClick={() => {
											window.life?.chooseVideo(name)
											setOpen(false)
										}}
										className={`flex h-12 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-booth-hover ${
											name === feed.showing ? 'text-booth-ink' : 'text-booth-dim'
										}`}
									>
										{name === feed.showing ? '● ' : ''}
										{name}
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</>
	)
}
