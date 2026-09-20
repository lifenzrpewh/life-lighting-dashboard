#!/usr/bin/env node
// One command to get the kiosk on screen: build main+preload, start Vite, wait
// for the port, launch Electron pointed at it.
//
// Deliberately a visible script rather than `concurrently` + `wait-on`. Two
// dependencies to run two processes is two dependencies, and when this fails on
// a booth PC at 8:50 on a Sunday the person debugging it should be able to read
// the whole thing in one screen.
//
// NOTE: main and preload are compiled ONCE here. Editing src/main or src/preload
// needs a restart; the renderer hot-reloads on its own.

import { spawn } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'

const PORT = 5173
const URL = `http://localhost:${PORT}`

const run = (cmd, args, extraEnv = {}) =>
	spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...extraEnv } })

const once = (cmd, args) =>
	new Promise((resolve, reject) => {
		run(cmd, args).on('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
		)
	})

/** Poll the port rather than scraping Vite's stdout — the banner is cosmetic and
 *  has changed between majors; a socket that accepts is the actual signal. */
function waitForPort(port, timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs
	return new Promise((resolve, reject) => {
		const attempt = () => {
			const sock = net.connect(port, '127.0.0.1')
			sock.once('connect', () => {
				sock.destroy()
				resolve()
			})
			sock.once('error', () => {
				sock.destroy()
				if (Date.now() > deadline) reject(new Error(`vite did not open ${port} within ${timeoutMs}ms`))
				else setTimeout(attempt, 150)
			})
		}
		attempt()
	})
}

const children = []
const shutdown = () => {
	for (const c of children) c.kill()
	process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log('[dev] building main + preload')
await once('npx', ['tsc', '-p', 'tsconfig.main.json'])

console.log('[dev] starting vite')
children.push(run('npx', ['vite']))

await waitForPort(PORT)
console.log(`[dev] vite up on ${URL} — launching electron`)

const electron = run('npx', ['electron', '.'], { VITE_DEV_SERVER_URL: URL })
children.push(electron)
// Closing the kiosk window ends the session; leaving Vite running in a dead
// terminal is just a port you have to hunt down later.
electron.on('exit', shutdown)
