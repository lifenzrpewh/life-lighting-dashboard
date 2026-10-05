// How late, and how evenly, the Video view's frames arrive, through the
// shipped feed (dist/src/main/video-feed.js), without the kiosk.
//
//   npx electron spikes/video-lag/receiver.cjs [sender] [seconds]
//
// Run after `npm run build:app`. With spikes/video-lag/sender.cjs as the
// sender, each frame's lateness is read from the clock it carries; with any
// other (Arena's), only the rate and the gaps between frames. Prints a line a
// second and a summary. Receives only: nothing is sent to the sender.
//
// "changed" counts frames whose picture differs from the one before. With
// --cpu, a second receiver reads the same sender twice a second through
// the addon's CPU copy (`receiveFrame`), which skips the GPU path the kiosk
// uses (the LIFE build's staging ring, Electron's shared texture, the canvas):
// if the CPU copy changes while the page does not, the stall is that path's;
// if both hold, it is in what the sender publishes.

const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const [want = 'LIFE fade', secs = '20'] = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.cjs'))

app.whenReady().then(async () => {
	const { startVideoFeed } = await import(path.join(__dirname, '../../dist/src/main/video-feed.js').replace(/\\/g, '/').replace(/^/, 'file:///'))
	const feed = startVideoFeed()
	// Hidden with --hidden, unthrottled, so it can watch while someone works.
	const win = new BrowserWindow({
		width: 960,
		height: 560,
		show: !process.argv.includes('--hidden'),
		webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: false, contextIsolation: false, backgroundThrottling: false },
	})
	await win.loadURL('data:text/html,' + encodeURIComponent('<body style="margin:0;background:#222"><canvas id=c style="width:100%;height:100%"></canvas>'))
	feed.choose(want)
	feed.watch(win.webContents, true)
	const all = []
	// The CPU copy, when asked: pictures read, and how many differed.
	let cpu = { reads: 0, changed: 0, failed: null }
	let cpuPrev = null
	let cpuStop = () => {}
	if (process.argv.includes('--cpu')) {
		const fs = require('node:fs')
		const vendor = path.join(__dirname, '../../vendor/texture-bridge/index.win32-x64-msvc.node')
		const addon = fs.existsSync(vendor) ? require(vendor) : require('@napolab/texture-bridge')
		const r = new addon.TextureReceiver(want)
		const timer = setInterval(() => {
			try {
				const f = r.receiveFrame()
				if (f === null) return
				cpu.reads++
				// Every 7th pixel of every 7th row: a fade changes them all.
				const d = f.data
				const sample = []
				for (let y = 0; y < f.height; y += 7) for (let x = 0; x < f.width; x += 7) sample.push(d[(y * f.width + x) * 4], d[(y * f.width + x) * 4 + 1])
				if (cpuPrev === null || sample.some((v, i) => Math.abs(v - cpuPrev[i]) > 1)) cpu.changed++
				cpuPrev = sample
			} catch (e) {
				cpu.failed = e.message
			}
		}, 500)
		cpuStop = () => {
			clearInterval(timer)
			r.stop()
		}
	}
	win.webContents.on('console-message', (e) => {
		const m = e.message
		if (m.startsWith('read failed')) console.log(m)
		if (m.startsWith('{')) {
			const s = JSON.parse(m)
			all.push(s)
			const st = feed.state()
			console.log(
				`${new Date().toTimeString().slice(0, 8)}  ${st.showing ?? '-'}  main ${st.fps} fps · page ${s.frames} frames, ${s.changed} changed, alpha ${s.alpha}, canvas red ${s.shown} · gap max ${s.gapMax} ms` +
					(s.lateMed === null ? '' : ` · late med ${s.lateMed} max ${s.lateMax} ms`) +
					(st.failure ? ` · ${st.failure}` : '') +
					(process.argv.includes('--cpu') ? ` · cpu ${cpu.reads} reads, ${cpu.changed} changed${cpu.failed ? ` (${cpu.failed})` : ''}` : ''),
			)
			cpu = { reads: 0, changed: 0, failed: null }
		}
	})
	setTimeout(() => {
		const frames = all.reduce((a, s) => a + s.frames, 0)
		const gapMax = Math.max(...all.map((s) => s.gapMax))
		const late = all.filter((s) => s.lateMed !== null)
		console.log(
			`SUMMARY ${all.length} s: ${(frames / all.length).toFixed(1)} fps at the page, ${(all.reduce((a, s) => a + s.changed, 0) / all.length).toFixed(1)} changed, worst gap ${gapMax} ms` +
				(late.length ? `, lateness median of medians ${late.map((s) => s.lateMed).sort((a, b) => a - b)[late.length >> 1]} ms, worst ${Math.max(...late.map((s) => s.lateMax))} ms` : ''),
		)
		cpuStop()
		feed.stop()
		app.exit(0)
	}, Number(secs) * 1000)
})
