// Settings › Updates and setup file: updates, this computer's setup to or
// from a file, and which build this is and where it logs. Start at login is
// here too, drawn on Screen and Admin's page. In Settings, so Admin only.

import { useEffect, useState } from 'react'

import { Download, RefreshCw } from 'lucide-react'

import type { About } from '../../../shared/about.js'
import { COMPUTER_LOCAL } from '../../../shared/computer-file.js'
import { updateWords, type UpdateState } from '../../../shared/updates.js'

import { Button, Segmented } from '../ui.js'
import { Page, Row, Rows } from './parts.js'

/** The page: updates, the setup file, the version and the log. */
export function ComputerSettings({ updates }: { updates: UpdateState | null }) {
	return (
		<Page title="Updates and setup file" help>
			<Rows title="Updates">
				<UpdatesCard updates={updates} />
			</Rows>
			<Rows title="Setup file">
				<SetupFile />
			</Rows>
			<Rows title="This build">
				<AboutRows />
			</Rows>
		</Page>
	)
}

/** Start at login: the installed app on this computer opens itself when the
 *  booth's user logs in. Says what the system holds, read back after a tap. */
export function StartAtLogin() {
	const [item, setItem] = useState<{ available: boolean; on: boolean } | null>(null)
	const [refused, setRefused] = useState(false)
	useEffect(() => void window.life?.loginItem().then(setItem), [])
	if (item === null) return null
	const set = (on: boolean) =>
		void window.life?.setLoginItem(on).then((now) => {
			if (now === null) return
			setItem(now)
			setRefused(now.on !== on)
		})
	return (
		<Row
			label="Start at login"
			help={item.available ? undefined : 'For the installed app. A checkout starts at login with scripts/windows/install-startup.cmd.'}
		>
			{item.available ? (
				<div className="flex flex-wrap items-center gap-4">
					<Segmented
						label="Start at login"
						value={item.on}
						onChange={set}
						options={[
							{ value: true, label: 'On' },
							{ value: false, label: 'Off' },
						]}
					/>
					<span className={`text-sm ${refused ? 'text-warn' : 'text-booth-dim'}`}>
						{refused
							? 'This computer did not keep that: its policy may not allow apps to start at login.'
							: item.on
								? 'Pāua opens when this computer’s user logs in.'
								: 'Pāua is opened by hand.'}
					</span>
				</div>
			) : (
				<span className="flex min-h-12 items-center text-sm text-booth-dim">Installed app only</span>
			)}
		</Row>
	)
}

/** This computer's setup to a file, or another's from one
 *  (../../../shared/computer-file.ts): what it would change is said first. */
export function SetupFile() {
	const [said, setSaid] = useState<string | null>(null)
	const [reading, setReading] = useState<{ from: string; settings: string[]; local: string[] } | null>(null)
	if (window.life === undefined) return null
	const exportIt = () => {
		const local: Record<string, string> = {}
		try {
			for (const key of Object.keys(COMPUTER_LOCAL)) {
				const v = localStorage.getItem(key)
				if (v !== null) local[key] = v
			}
		} catch {
			// Nothing stored to carry: the settings still go.
		}
		void window.life?.exportComputer(local).then((r) => r !== null && setSaid(r.ok ? `Saved to ${r.path}.` : r.detail))
	}
	const readIt = () => {
		setSaid(null)
		void window.life?.readComputer().then((r) => {
			if (r === null) return
			if (!r.ok) return setSaid(r.detail)
			setReading(r)
		})
	}
	const applyIt = () =>
		void window.life?.applyComputer().then((r) => {
			setReading(null)
			if (r === null) return
			if (!r.ok) return setSaid(r.detail)
			try {
				for (const key of Object.keys(COMPUTER_LOCAL)) {
					// What the file does not carry stays as this computer had it.
					const v = r.local[key]
					if (v !== undefined) localStorage.setItem(key, v)
				}
			} catch {
				return setSaid('The settings were set, but this computer would not keep the layouts and Holding map.')
			}
			// Every store reads its item again as the page starts.
			window.location.reload()
		})
	return (
		<Row
			label="This computer"
			help="Everything this computer is set to (addresses, folders, web pages, video sources, layouts, the top bar, the Holding map), in one file to set another booth up from. Never the MA passwords, the passcode or any sign-in: those are set on each computer."
		>
			{reading === null ? (
				<div className="flex flex-wrap gap-2">
					<Button onClick={exportIt}>To a file</Button>
					<Button onClick={readIt}>From a file</Button>
				</div>
			) : (
				<div className="flex flex-col gap-2 rounded-ctl bg-booth-raise p-3 text-sm ring-1 ring-warn/60 ring-inset">
					<span className="font-bold">From {reading.from}</span>
					{reading.settings.length === 0 ? (
						<span className="text-booth-dim">No setting changes.</span>
					) : (
						<ul className="flex flex-col gap-0.5 text-xs">
							{reading.settings.map((line) => (
								<li key={line} className="break-words">
									{line}
								</li>
							))}
						</ul>
					)}
					{reading.local.length > 0 && <span className="text-booth-dim">Replaces {reading.local.join(', ')}.</span>}
					<span className="text-booth-dim">The screen starts again to take it.</span>
					<div className="flex gap-2">
						<Button variant="primary" onClick={applyIt}>
							Apply
						</Button>
						<Button onClick={() => setReading(null)}>Cancel</Button>
					</div>
				</div>
			)}
			{said !== null && <p className="text-sm text-booth-dim">{said}</p>}
		</Row>
	)
}

/** Which build this is and where it logs: what a field tester's report needs. */
function AboutRows() {
	const [about, setAbout] = useState<About | null>(null)
	useEffect(() => void window.life?.about().then((a) => setAbout(a ?? null)), [])
	if (about === null) return null
	return (
		<>
			<Row label="Version">
				<span className="flex min-h-12 items-center text-base">Pāua {about.version}</span>
			</Row>
			<Row label="Log">
				<span className="flex min-w-0 flex-wrap items-center gap-3">
					<span className="min-w-0 font-mono text-sm break-all text-booth-dim select-text">{about.logPath}</span>
					<Button onClick={() => window.life?.showLog()}>Show the log</Button>
				</span>
			</Row>
		</>
	)
}

/** Updates (../../../shared/updates.ts): the version here, Check for updates,
 *  and Update when one is out. Update asks once more, because it closes Pāua
 *  for a minute: never during a service. */
export function UpdatesCard({ updates }: { updates: UpdateState | null }) {
	const [asking, setAsking] = useState(false)
	const [version, setVersion] = useState<string | null>(null)
	useEffect(() => void window.life?.about().then((a) => setVersion(a?.version ?? null)), [])
	if (updates === null) return null
	const busy = updates.state === 'checking' || updates.state === 'downloading' || updates.state === 'installing'
	return (
		<Row label="Pāua">
			<p className={`flex min-h-12 items-center text-base ${updates.state === 'failed' ? 'text-state-unreachable' : updates.state === 'available' ? 'font-bold text-booth-ink' : 'text-booth-dim'}`}>
				{updateWords(updates, version ?? '?')}
			</p>
			{updates.state === 'downloading' && (
				<div className="h-2 overflow-hidden rounded-full bg-booth-raise">
					<div className="h-full bg-accent transition-[width]" style={{ width: `${Math.max(2, updates.percent)}%` }} />
				</div>
			)}
			{updates.state === 'unsupported' ? null : asking && updates.state === 'available' ? (
				<div className="flex flex-wrap items-center gap-3">
					<span className="text-sm text-booth-ink">Pāua closes, installs {updates.version} and opens again, in about a minute. Not during a service.</span>
					<Button
						variant="primary"
						icon={Download}
						onClick={() => {
							setAsking(false)
							window.life?.installUpdate()
						}}
					>
						Install now
					</Button>
					<Button variant="ghost" onClick={() => setAsking(false)}>
						Not now
					</Button>
				</div>
			) : (
				<div className="flex flex-wrap items-center gap-3">
					{updates.state === 'available' && (
						<Button variant="primary" icon={Download} onClick={() => setAsking(true)}>
							Update to {updates.version}
						</Button>
					)}
					<Button icon={RefreshCw} disabled={busy} onClick={() => window.life?.checkUpdates()}>
						Check for updates
					</Button>
				</div>
			)}
		</Row>
	)
}
