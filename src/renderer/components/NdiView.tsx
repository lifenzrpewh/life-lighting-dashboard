// An NDI source as a view (../../shared/ndi.ts): a camera, ProPresenter's
// output, Arena's composition, anything NDI finds on the network.
//
// Frames come from the NDI worker over a port of this view's own (the
// preload's `watchNdi`), already thinned to the space they are drawn in, which
// this view tells it as the window changes. Each is drawn on black, as the
// Video view's: a source with alpha (Arena's does) would otherwise leave the
// last picture showing through a fade.
//
// A picture, not a reading: while frames arrive nothing is drawn over it.
// When they stop, the last one stays, dimmed, under words saying for how long.

import { useEffect, useRef } from 'react'
import { Cast } from 'lucide-react'

import { ndiPicture, type NdiState } from '../../shared/ndi.js'
import { Centered, Say } from './MaPane.js'

export function NdiView({ id, ndi, now }: { id: string; ndi: NdiState | null | undefined; now: number }) {
	const canvas = useRef<HTMLCanvasElement>(null)
	const live = ndi !== undefined && ndi !== null

	useEffect(() => {
		const api = window.life
		const c = canvas.current
		if (api === undefined || c === null) return
		let ctx: CanvasRenderingContext2D | null = null
		const watch = api.watchNdi(id, (frame) => {
			if (c.width !== frame.displayWidth || c.height !== frame.displayHeight) {
				c.width = frame.displayWidth
				c.height = frame.displayHeight
				ctx = null
			}
			ctx ??= c.getContext('2d', { alpha: false })
			if (ctx === null) return
			ctx.fillStyle = '#000'
			ctx.fillRect(0, 0, c.width, c.height)
			ctx.drawImage(frame, 0, 0)
		})
		// The space, in device pixels: the worker sends no bigger than this.
		const measure = () => {
			const r = c.getBoundingClientRect()
			if (r.width > 0 && r.height > 0) watch.space({ width: r.width * window.devicePixelRatio, height: r.height * window.devicePixelRatio })
		}
		measure()
		const ro = new ResizeObserver(measure)
		ro.observe(c)
		return () => {
			ro.disconnect()
			watch.stop()
			c.width = 0
			c.height = 0
		}
	}, [id, live])

	if (!live) {
		return (
			<Centered>
				<Say icon={Cast} head="NDI" body={window.life === undefined ? 'NDI sources are shown only inside the kiosk.' : 'Not heard yet.'} />
			</Centered>
		)
	}

	const feed = ndi.feeds.find((f) => f.id === id)
	const picture = feed === undefined ? null : ndiPicture(ndi, feed, now)
	const said = (() => {
		if (feed === undefined || picture === null) return { head: 'Turned off', body: 'This NDI source is off in Connections.' }
		switch (picture.state) {
			case 'no-runtime':
				return { head: 'NDI is not on this computer', body: picture.detail }
			case 'not-found':
				return { head: `“${feed.name}” is not on the network`, body: `Looking for ${picture.source}. It shows here when it comes back.` }
			case 'waiting':
				return { head: `Waiting for “${feed.name}”`, body: picture.failure ?? 'No picture yet.' }
			case 'stalled':
				return {
					head: `No new picture for ${Math.round(picture.sinceMs / 1000)} s`,
					body: picture.failure ?? `“${feed.name}” has stopped sending. This is the last picture it sent.`,
				}
			case 'showing':
				return null
		}
	})()

	return (
		<div className="relative flex min-h-0 min-w-0 flex-1 bg-black">
			<canvas ref={canvas} className={`size-full object-contain ${said === null ? '' : 'opacity-30'}`} width={0} height={0} />
			{said !== null && (
				<div className="absolute inset-0 flex items-center justify-center">
					<Say icon={Cast} head={said.head} body={said.body} />
				</div>
			)}
		</div>
	)
}

/** The source's own size and rate, in its window's strip. */
export function NdiStrip({ id, ndi, now }: { id: string; ndi: NdiState | null | undefined; now: number }) {
	const feed = ndi?.feeds.find((f) => f.id === id)
	const frame = feed?.lastFrame ?? null
	if (feed === undefined || frame === null || now - frame.at > 2_000) return null
	return (
		<span className="hidden min-w-0 truncate text-xs text-booth-dim tabular-nums lg:inline" title="The source's picture, and its frames a second here">
			{frame.full.width}×{frame.full.height} · {feed.fps} fps
		</span>
	)
}
