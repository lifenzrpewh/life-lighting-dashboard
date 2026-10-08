// A capture input as a view (../../shared/capture.ts): a Blackmagic card, an
// ATEM, OBS's Virtual Camera, a webcam. The browser decodes and draws it on
// the GPU in a <video>; nothing here touches its pixels.
//
// A picture, not a reading: each frame drawn is noted, and a picture that
// stops coming is dimmed and said, as the Video and NDI views do.

import { useEffect, useRef, useState } from 'react'
import { Webcam } from 'lucide-react'

import { CAPTURE_STALLED_AFTER_MS, type CaptureInput } from '../../shared/capture.js'
import { captureStateOf, sawFrame, useCapture } from '../capture.js'
import { Centered, Say } from './MaPane.js'

/** How often a frame drawn is noted for the row and the strip. */
const NOTE_MS = 250

export function CaptureView({ input, cameras, now }: { input: CaptureInput | undefined; cameras: readonly string[] | null; now: number }) {
	const device = input?.on === true ? input.device : null
	const { stream, failure } = useCapture(device)
	const video = useRef<HTMLVideoElement>(null)
	const [lastFrame, setLastFrame] = useState<number | null>(null)

	useEffect(() => {
		const v = video.current
		if (v === null) return
		v.srcObject = stream
		setLastFrame(null)
		if (stream === null || device === null) return
		void v.play().catch(() => undefined)
		let handle = 0
		let noted = 0
		const fps = stream.getVideoTracks()[0]?.getSettings().frameRate ?? null
		const onFrame = () => {
			const t = performance.now()
			if (t - noted >= NOTE_MS) {
				noted = t
				sawFrame(device, v.videoWidth, v.videoHeight, fps)
				setLastFrame(Date.now())
			}
			handle = v.requestVideoFrameCallback(onFrame)
		}
		handle = v.requestVideoFrameCallback(onFrame)
		return () => v.cancelVideoFrameCallback(handle)
	}, [stream, device])

	if (input === undefined || !input.on) {
		return (
			<Centered>
				<Say icon={Webcam} head="Turned off" body="This capture input is off in Settings." />
			</Centered>
		)
	}

	const missing = cameras !== null && !cameras.includes(input.device)
	const said = (() => {
		if (missing) return { head: `“${input.name}” is not on this computer`, body: `Looking for ${input.device}. It shows here when it comes back.` }
		if (stream === null) return { head: `Opening “${input.name}”`, body: failure ?? 'No picture yet.' }
		if (lastFrame === null) return { head: `Waiting for “${input.name}”`, body: 'No picture yet. A card input shows nothing until its signal matches the format set in Desktop Video Setup.' }
		if (now - lastFrame > CAPTURE_STALLED_AFTER_MS) {
			return {
				head: `No new picture for ${Math.round((now - lastFrame) / 1000)} s`,
				body: `“${input.name}” has stopped sending. This is the last picture it sent.`,
			}
		}
		return null
	})()

	return (
		<div className="relative flex min-h-0 min-w-0 flex-1 bg-black">
			{/* Muted, and asked for video only: a card's audio is not this view's. */}
			<video ref={video} muted playsInline className={`size-full object-contain ${said === null ? '' : 'opacity-30'}`} />
			{said !== null && (
				<div className="absolute inset-0 flex items-center justify-center">
					<Say icon={Webcam} head={said.head} body={said.body} />
				</div>
			)}
		</div>
	)
}

/** The input's size and rate as the device gives them, in its window's strip. */
export function CaptureStrip({ input, now }: { input: CaptureInput | undefined; now: number }) {
	const live = input === undefined ? null : captureStateOf(input.device, null).live
	if (live === null || now - live.at > CAPTURE_STALLED_AFTER_MS) return null
	return (
		<span className="hidden min-w-0 truncate text-xs text-booth-dim tabular-nums lg:inline" title="The device's picture, and its frames a second">
			{live.width}×{live.height}
			{live.fps === null ? '' : ` · ${Math.round(live.fps)} fps`}
		</span>
	)
}
