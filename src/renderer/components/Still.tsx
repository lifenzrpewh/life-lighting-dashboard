// A picture of a native pane, standing in for it while the divider is dragged
// (../../main/pane-snapshot.ts has why).
//
// The picture is only as wide as the page was, so a slot that grows has more
// room than picture. Two things keep that from reading as a hole (the owner
// saw one, 2026-10-03):
// - The picture is pinned to the slot's OUTER edge, the window side, so the
//   page stays still under the eye and the new room opens by the divider,
//   where the finger is.
// - That room is filled with the page's own colour at that edge, sampled from
//   the picture, so it reads as the page's background carrying on.

import { useEffect, useState } from 'react'

import type { Slot } from '../../shared/layout.js'

/** The average colour of the picture's column nearest the divider. */
function edgeColour(src: string, side: Slot): Promise<string | null> {
	return new Promise((resolve) => {
		const img = new Image()
		img.onload = () => {
			try {
				const h = img.naturalHeight
				const canvas = document.createElement('canvas')
				canvas.width = 1
				canvas.height = h
				const ctx = canvas.getContext('2d')
				if (ctx === null || h === 0) return resolve(null)
				// The left slot's divider is on its right, and the other way round.
				const x = side === 'left' ? img.naturalWidth - 1 : 0
				ctx.drawImage(img, x, 0, 1, h, 0, 0, 1, h)
				const data = ctx.getImageData(0, 0, 1, h).data
				let r = 0
				let g = 0
				let b = 0
				for (let i = 0; i < data.length; i += 4) {
					r += data[i] ?? 0
					g += data[i + 1] ?? 0
					b += data[i + 2] ?? 0
				}
				resolve(`rgb(${Math.round(r / h)} ${Math.round(g / h)} ${Math.round(b / h)})`)
			} catch {
				resolve(null)
			}
		}
		img.onerror = () => resolve(null)
		img.src = src
	})
}

export function Still({ src, side }: { src: string; side: Slot }) {
	const [fill, setFill] = useState<string | null>(null)
	useEffect(() => {
		let alive = true
		void edgeColour(src, side).then((c) => alive && setFill(c))
		return () => {
			alive = false
		}
	}, [src, side])
	return (
		<div className="relative min-w-0 flex-1 overflow-hidden" style={fill === null ? undefined : { background: fill }}>
			<img
				src={src}
				alt=""
				draggable={false}
				className={`absolute top-0 h-full w-auto max-w-none ${side === 'left' ? 'left-0' : 'right-0'}`}
			/>
		</div>
	)
}
