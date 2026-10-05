// A stand-in sender that fades the whole picture, for spikes/video-lag/receiver.cjs.
//
//   npx electron spikes/video-lag/sender.cjs [name] [width] [height] [fps]
//
// Every pixel changes each frame (a full-screen fade, white to black and
// back every 2 s), which is the case the Video view was seen to stall on
// (the owner, 2026-10-05). The top-left strip carries the time the frame was
// drawn, 24 black or white blocks of the clock's low bits, so the receiver
// can say how late each frame arrives.
//
// With --alpha the picture fades through transparency instead, as Arena's
// composition does when a layer fades out: the colour stays, its alpha goes
// to 0 (the owner's freeze, 2026-10-05, was this).

const { app, BrowserWindow } = require('electron')
const { TextureSender } = require('@napolab/texture-bridge')

const [name = 'LIFE fade', w = '1920', h = '1080', fps = '50'] = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
const width = Number(w)
const height = Number(h)

const alpha = process.argv.includes('--alpha')
const page = `<!doctype html><body style="margin:0;overflow:hidden;background:${alpha ? 'transparent' : '#000'}"><canvas style="display:block" id=c width=${width} height=${height}></canvas><script>
const c = document.getElementById('c'), g = c.getContext('2d')
function draw() {
	const now = Date.now()
	const phase = (now % 2000) / 2000
	const v = Math.round(255 * Math.abs(1 - 2 * phase))
	g.clearRect(0, 0, ${width}, ${height})
	g.fillStyle = ${alpha} ? 'rgba(220,60,140,' + (v / 255) + ')' : 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, ${width}, ${height})
	const t = now & 0xffffff
	for (let i = 0; i < 24; i++) { g.fillStyle = (t >> i) & 1 ? '#fff' : '#000'; g.fillRect(i * 16, 0, 16, 16) }
	requestAnimationFrame(draw)
}
draw()
</script>`

app.whenReady().then(() => {
	const sender = new TextureSender(name, width, height)
	const win = new BrowserWindow({ show: false, width, height, transparent: alpha, webPreferences: { offscreen: { useSharedTexture: true } } })
	if (alpha) win.setBackgroundColor('#00000000')
	win.webContents.setFrameRate(Number(fps))
	let sent = 0
	const started = Date.now()
	win.webContents.on('paint', (event) => {
		const texture = event.texture
		if (!texture) return
		try {
			const info = texture.textureInfo
			sender.send(Number(info.handle.ntHandle.readBigInt64LE(0)), info.codedSize.width, info.codedSize.height)
			sent++
		} finally {
			texture.release()
		}
		if (sent % (Number(fps) * 5) === 0) console.log(`sender: ${sent} frames, ${(sent / ((Date.now() - started) / 1000)).toFixed(1)} fps`)
	})
	void win.loadURL(`data:text/html,${encodeURIComponent(page)}`)
	console.log(`sender "${name}", ${width}x${height} at ${fps} fps`)
})
