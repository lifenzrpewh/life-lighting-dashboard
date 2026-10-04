// Renders build/icon.svg to build/icon.png (1024 px) with Electron, which
// electron-builder makes the Windows .ico and the Mac .icns from, and copies
// it to assets/icon.png for the window and the Dock in a checkout.
//   npx electron scripts/render-icon.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.whenReady().then(async () => {
	const root = path.join(__dirname, '..')
	const svg = fs.readFileSync(path.join(root, 'build/icon.svg'), 'utf8')
	const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
	win.webContents.setZoomFactor(1)
	const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`
	await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
	await new Promise((r) => setTimeout(r, 500))
	const image = (await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })).resize({ width: 1024, height: 1024 })
	fs.writeFileSync(path.join(root, 'build/icon.png'), image.toPNG())
	fs.mkdirSync(path.join(root, 'assets'), { recursive: true })
	fs.writeFileSync(path.join(root, 'assets/icon.png'), image.resize({ width: 256, height: 256 }).toPNG())
	console.log('build/icon.png and assets/icon.png written', image.getSize())
	app.quit()
})
