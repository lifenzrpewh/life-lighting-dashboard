// The receiving page's side of spikes/video-lag/receiver.cjs: draws each frame
// as the Video view does (a 2D canvas, drawImage of the VideoFrame), and reads
// the sender's clock strip from it. It also counts the frames whose picture
// differs from the one before (five full-width lines compared), since a frame can
// arrive on time holding an old picture.

const { sharedTexture } = require('electron')

let ctx = null
let strip = null
let tiny = null
let prev = null
let last = 0
let sec = { frames: 0, changed: 0, gapMax: 0, late: [] }

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
			// Five full-width lines across the height, at full resolution: a small
			// move is not averaged away, and a fade anywhere crosses one.
			const W = frame.displayWidth
			if (tiny === null || tiny.canvas.width !== W) tiny = new OffscreenCanvas(W, 5).getContext('2d', { willReadFrequently: true })
			for (let i = 0; i < 5; i++) tiny.drawImage(frame, 0, Math.floor((frame.displayHeight * (i + 0.5)) / 5), W, 1, 0, i, W, 1)
			const now36 = tiny.getImageData(0, 0, W, 5).data
			if (prev === null || now36.some((v, i) => Math.abs(v - prev[i]) > 1)) sec.changed++
			prev = now36
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
	console.log(JSON.stringify({ frames: sec.frames, changed: sec.changed, gapMax: sec.gapMax, lateMed: l.length ? l[l.length >> 1] : null, lateMax: l.length ? l[l.length - 1] : null }))
	sec = { frames: 0, changed: 0, gapMax: 0, late: [] }
}, 1000)
