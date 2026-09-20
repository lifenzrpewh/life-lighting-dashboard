#!/usr/bin/env node
// Run the Lua harness, and say plainly when Lua is missing.
//
// WHY THIS EXISTS: `npm test` shells out to `lua`. On a machine without it —
// a fresh Windows laptop, say — the failure arrives as a shell error in the
// middle of a passing suite, and reads like the harness is broken rather than
// absent. This turns that into one sentence naming the prerequisite.

import { spawnSync } from 'node:child_process'
import process from 'node:process'

const CANDIDATES = ['lua', 'lua5.4', 'lua5.3', 'lua5.1', 'luajit']
const HARNESS = 'console-plugin/_test_lifebridge.lua'

const found = CANDIDATES.find(
	(bin) => spawnSync(bin, ['-v'], { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0,
)

if (found === undefined) {
	console.error(`
MISSING PREREQUISITE: no Lua interpreter on PATH.

  ${HARNESS} is 106 checks covering the console plugin — including the
  assertion that SendOSC stays the only command it can ever issue. Skipping it
  is not an option: that check is what makes the plugin safe on a live showfile.

  Tried: ${CANDIDATES.join(', ')}

  macOS    brew install lua
  Windows  winget install DEVCOM.Lua    (or scoop install lua)
  Debian   sudo apt install lua5.4
`)
	process.exit(1)
}

const r = spawnSync(found, [HARNESS], { stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
