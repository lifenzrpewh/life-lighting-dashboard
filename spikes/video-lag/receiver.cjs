// How late, and how evenly, the Video view's frames arrive, through the
// shipped feed (dist/src/main/video-feed.js), without the kiosk.
//
//   npx electron spikes/video-lag/receiver.cjs [sender] [seconds]
//
// Run after `npm run build:app`. With spikes/video-lag/sender.cjs as the
// sender, each frame's lateness is read from the clock it carries; with any
// other (Arena's), only the rate and the gaps between frames. Prints a line a
// second and a summary. Receives only: nothing is sent to the sender.

const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const [want = 'LIFE fade', secs = '20'] = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.cjs'))

app.whenReady().then(async () => {
	const { startVideoFeed } = await import(path.join(__dirname, '../../dist/src/main/video-feed.js').replace(/\\/g, '/').replace(/^/, 'file:///'))
	const feed = startVideoFeed()
	const win = new BrowserWindow({
		width: 960,
		height: 560,
		webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: false, contextIsolation: false },
	})
	await win.loadURL('data:text/html,' + encodeURIComponent('<body style="margin:0;background:#222"><canvas id=c style="width:100%;height:100%"></canvas>'))
	feed.choose(want)
	feed.watch(win.webContents, true)
	const all = []
	win.webContents.on('console-message', (e) => {
		const m = e.message
		if (m.startsWith('read failed')) console.log(m)
		if (m.startsWith('{')) {
			const s = JSON.parse(m)
			all.push(s)
			const st = feed.state()
			console.log(
				`${st.showing ?? '-'}  main ${st.fps} fps · page ${s.frames} frames · gap max ${s.gapMax} ms` +
					(s.lateMed === null ? '' : ` · late med ${s.lateMed} max ${s.lateMax} ms`) +
					(st.failure ? ` · ${st.failure}` : ''),
			)
		}
	})
	setTimeout(() => {
		const frames = all.reduce((a, s) => a + s.frames, 0)
		const gapMax = Math.max(...all.map((s) => s.gapMax))
		const late = all.filter((s) => s.lateMed !== null)
		console.log(
			`SUMMARY ${all.length} s: ${(frames / all.length).toFixed(1)} fps at the page, worst gap ${gapMax} ms` +
				(late.length ? `, lateness median of medians ${late.map((s) => s.lateMed).sort((a, b) => a - b)[late.length >> 1]} ms, worst ${Math.max(...late.map((s) => s.lateMax))} ms` : ''),
		)
		feed.stop()
		app.quit()
	}, Number(secs) * 1000)
})
