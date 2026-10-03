// A Spout (or Syphon) sender standing in for Arena, to build and measure the
// multiview's receiving side without Arena (docs/VISUALS_DASHBOARD.md, piece 5).
//
//   npx electron spikes/spout-test-sender.cjs [name] [width] [height] [fps]
//
// A hidden page draws a moving test pattern offscreen on the GPU, and each
// painted texture is published under `name`. The addon cannot publish raw
// pixels on Windows ("send_rgba is not yet implemented for Windows/Spout",
// 0.15.0), so this is how a stand-in has to be made: as Arena does, from a
// texture. CommonJS, so Electron runs it as a main script with no build step.

const { app, BrowserWindow } = require('electron')
const { TextureSender, getPlatform } = require('@napolab/texture-bridge')

const [name = 'LIFE test pattern', w = '1280', h = '720', fps = '30'] = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
const width = Number(w)
const height = Number(h)

// A bar sweeping across and a clock, so a stalled or late picture is obvious.
const page = `<!doctype html><body style="margin:0;overflow:hidden;background:#000"><canvas style="display:block" id=c width=${width} height=${height}></canvas><script>
const c = document.getElementById('c'), g = c.getContext('2d'); let n = 0
function draw() {
	n++
	const hue = (n * 2) % 360
	g.fillStyle = 'hsl(' + hue + ',60%,25%)'; g.fillRect(0, 0, ${width}, ${height})
	g.fillStyle = '#fff'; g.fillRect((n * 8) % ${width}, 0, 40, ${height})
	g.font = 'bold ${Math.round(height / 6)}px sans-serif'; g.fillText(String(n).padStart(6, '0'), 40, ${Math.round(height / 2)})
	g.font = '${Math.round(height / 16)}px sans-serif'; g.fillText(new Date().toISOString().slice(11, 23), 40, ${Math.round(height * 0.75)})
	requestAnimationFrame(draw)
}
draw()
</script>`

app.whenReady().then(() => {
	const sender = new TextureSender(name, width, height)
	const win = new BrowserWindow({
		show: false,
		width,
		height,
		webPreferences: { offscreen: { useSharedTexture: true } },
	})
	win.webContents.setFrameRate(Number(fps))
	let sent = 0
	const started = Date.now()
	win.webContents.on('paint', (event) => {
		const texture = event.texture
		if (!texture) return
		try {
			const info = texture.textureInfo
			const handle = info.handle.ntHandle ?? info.handle.ioSurface
			if (process.platform === 'win32') sender.send(Number(handle.readBigInt64LE(0)), info.codedSize.width, info.codedSize.height)
			else sender.sendSurface(handle, info.codedSize.width, info.codedSize.height)
			sent++
		} finally {
			texture.release()
		}
		if (sent % (Number(fps) * 5) === 0) console.log(`${sent} frames, ${(sent / ((Date.now() - started) / 1000)).toFixed(1)} fps`)
	})
	void win.loadURL(`data:text/html,${encodeURIComponent(page)}`)
	console.log(`${getPlatform()} sender "${name}", ${width}x${height} at ${fps} fps. Ctrl+C to stop.`)
})
