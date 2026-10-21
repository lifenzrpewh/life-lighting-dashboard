// The booth LifeBridge's build stamp: a hash of the Lua with its own BUILD line
// blanked, so the stamp names the code and cannot be bumped by hand or forgotten.
// Used by build-plugin-xml.mjs to write it, and by test/plugin-xml.test.js to
// prove the Lua, the XML and src/shared/lifebridge-build.ts all carry the same one.

import crypto from 'node:crypto'

export const BUILD_LINE = /^local BUILD = '([^']*)'$/m
const BLANK = "local BUILD = 'lb-00000000'"

/** The stamp this Lua source should carry. */
export function stampOf(lua) {
	if (!BUILD_LINE.test(lua)) throw new Error("LifeBridge.lua has no `local BUILD = '…'` line")
	const blanked = lua.replace(BUILD_LINE, BLANK)
	return 'lb-' + crypto.createHash('sha256').update(blanked, 'utf8').digest('hex').slice(0, 8)
}

/** The stamp the Lua source carries now. */
export function stampIn(lua) {
	return BUILD_LINE.exec(lua)?.[1] ?? null
}

/** The Lua with its BUILD line set to its own stamp. */
export function stamped(lua) {
	return lua.replace(BUILD_LINE, `local BUILD = '${stampOf(lua)}'`)
}
