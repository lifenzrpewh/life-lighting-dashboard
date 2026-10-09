#!/usr/bin/env node
// Copies a tagged version of life-look's look.css into an app, as a committed file.
//
// Why a copy and not a dependency: life-look is private, and the apps build where no
// GitHub token is held (Pāua's release runners, the booth computers' update script).
// A committed copy builds anywhere; only this script needs access, on a dev machine,
// through the GitHub CLI (`gh auth login`).
//
// Each app keeps its own copy of this script at scripts/sync-look.mjs, with an npm script:
//   "look:sync":  "node scripts/sync-look.mjs <dest>"          latest tag
//   "look:check": "node scripts/sync-look.mjs <dest> --check"  exit 1 if edited or behind
// and `node scripts/sync-look.mjs <dest> v1.2.0` for a given tag.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const REPO = 'lifenzrpewh/life-look'
const FILE = 'look.css'

const args = process.argv.slice(2)
const check = args.includes('--check')
const [dest, wanted] = args.filter((a) => !a.startsWith('--'))
if (!dest) {
	console.error('usage: node scripts/sync-look.mjs <dest.css> [vX.Y.Z] [--check]')
	process.exit(2)
}

const gh = (path) => {
	try {
		return execFileSync('gh', ['api', path, '-H', 'Accept: application/vnd.github.raw'], { encoding: 'utf8' })
	} catch (e) {
		console.error(`gh api ${path} failed. Is the GitHub CLI installed and signed in (gh auth login)?`)
		process.exit(2)
	}
}

const semver = (t) => t.replace(/^v/, '').split('.').map(Number)
const newer = (a, b) => {
	const [x, y] = [semver(a), semver(b)]
	for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
	return false
}
const latestTag = () => {
	const tags = JSON.parse(gh(`repos/${REPO}/tags?per_page=100`)).map((t) => t.name).filter((n) => /^v\d+\.\d+\.\d+$/.test(n))
	if (tags.length === 0) {
		console.error(`${REPO} has no vX.Y.Z tags yet.`)
		process.exit(2)
	}
	return tags.reduce((best, t) => (newer(t, best) ? t : best))
}
const fetchAt = (tag) => gh(`repos/${REPO}/contents/${FILE}?ref=${tag}`).replace(/\r\n/g, '\n')
const header = (tag) =>
	`/* life-look ${tag}, copied by scripts/sync-look.mjs. Don't edit it here: change ${FILE} in\n` +
	`   github.com/${REPO}, tag a new version, then run \`npm run look:sync\` in each app. */\n`

if (check) {
	if (!existsSync(dest)) {
		console.error(`${dest} is missing. Run npm run look:sync.`)
		process.exit(1)
	}
	const local = readFileSync(dest, 'utf8').replace(/\r\n/g, '\n')
	const tag = local.match(/^\/\* life-look (v\d+\.\d+\.\d+),/)?.[1]
	if (!tag) {
		console.error(`${dest} has no life-look header. Run npm run look:sync.`)
		process.exit(1)
	}
	let ok = true
	if (local !== header(tag) + fetchAt(tag)) {
		console.error(`${dest} differs from life-look ${tag}: it was edited here. Move the change to life-look.`)
		ok = false
	}
	const latest = latestTag()
	if (newer(latest, tag)) {
		console.error(`life-look ${latest} is out (this app has ${tag}). Run npm run look:sync.`)
		ok = false
	}
	if (ok) console.log(`${dest} is life-look ${tag}, the latest.`)
	process.exit(ok ? 0 : 1)
}

const tag = wanted ?? latestTag()
writeFileSync(dest, header(tag) + fetchAt(tag))
console.log(`${dest} is now life-look ${tag}.`)
