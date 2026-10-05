// The receiving page's side of spikes/video-lag/receiver.cjs: draws each frame
// as the Video view does (a 2D canvas, drawImage of the VideoFrame), and reads
// the sender's clock strip from it.

const { sharedTexture } = require('electron')

let ctx = null
let strip = null
let last = 0
let sec = { frames: 0, gapMax: 0, late: [] }

sharedTexture.setSharedTextureReceiver(async ({ importedSharedTexture }) => {
	const frame = importedSharedTexture.getVideoFrame()
	try {
		const now = performance.now()
		if (last) sec.gapMax = Math.max(sec.gapMax, Math.round(now - last))
		last = now
		sec.frames++
		const c = document.getElementById('c')
		if (c) {
			if (c.width !== frame.displayWidth) {
				c.width = frame.displayWidth
				c.height = frame.displayHeight
				ctx = null
			}
			ctx ??= c.getContext('2d', { alpha: false })
			ctx.drawImage(frame, 0, 0)
			// The clock strip: 24 blocks of 16 px, one bit each.
			// The sender draws at its screen's scale; 1920 wide is its 1.
			const k = frame.displayWidth / 1920
			strip ??= new OffscreenCanvas(384, 16).getContext('2d', { willReadFrequently: true })
			strip.drawImage(frame, 0, 0, 384 * k, 16 * k, 0, 0, 384, 16)
			const px = strip.getImageData(0, 0, 384, 16).data
			let t = 0
			let clean = true
			for (let i = 0; i < 24; i++) {
				const v = px[(8 * 384 + i * 16 + 8) * 4]
				if (v > 64 && v < 192) clean = false
				if (v >= 128) t |= 1 << i
			}
			if (clean) {
				const late = ((Date.now() & 0xffffff) - t + 0x1000000) % 0x1000000
				if (late < 10_000) sec.late.push(late)
			}
		}
	} catch (e) {
		console.log('read failed: ' + e)
	} finally {
		frame.close()
		setTimeout(() => importedSharedTexture.release(), 0)
	}
})

setInterval(() => {
	const l = sec.late.sort((a, b) => a - b)
	console.log(JSON.stringify({ frames: sec.frames, gapMax: sec.gapMax, lateMed: l.length ? l[l.length >> 1] : null, lateMax: l.length ? l[l.length - 1] : null }))
	sec = { frames: 0, gapMax: 0, late: [] }
}, 1000)
