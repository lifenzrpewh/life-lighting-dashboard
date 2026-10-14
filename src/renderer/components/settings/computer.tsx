// This computer: full screen or a window, updates, and which build this is
// and where it logs. In Settings, so Admin only.

import { useEffect, useState } from 'react'

import { Download, RefreshCw } from 'lucide-react'

import type { About } from '../../../shared/about.js'
import { COMPUTER_LOCAL } from '../../../shared/computer-file.js'
import { updateWords, type UpdateState } from '../../../shared/updates.js'

import { Button, Card, SectionTitle, Segmented } from '../ui.js'
import type { Save } from './parts.js'

/** Full screen or a window: for testers on a laptop; the booth stays full
 *  screen. Changes at once, no restart. */
export function ThisScreen({ windowed, save }: { windowed: boolean; save: Save }) {
	return (
		<Card>
			<SectionTitle>This screen</SectionTitle>
			<div className="flex flex-wrap items-center gap-4">
				<Segmented
					label="This screen"
					value={windowed}
					onChange={(v) => void save({ windowed: v })}
					options={[
						{ value: false, label: 'Full screen' },
						{ value: true, label: 'Window' },
					]}
				/>
				<span className="text-sm text-booth-dim">A window is for testing on a laptop; the booth stays full screen.</span>
			</div>
		</Card>
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
		<Card>
			<SectionTitle>Start at login</SectionTitle>
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
				<p className="text-sm text-booth-dim">For the installed app. A checkout starts at login with scripts/windows/install-startup.cmd.</p>
			)}
		</Card>
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
		<Card>
			<SectionTitle>Setup file</SectionTitle>
			<p className="max-w-prose text-sm text-booth-dim">
				Everything this computer is set to (addresses, folders, web pages, video sources, layouts, the top bar, the Holding map), in
				one file to set another booth up from. Never the MA passwords, the passcode or any sign-in: those are set on each
				computer.
			</p>
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
		</Card>
	)
}

/** Which build this is and where it logs: what a field tester's report needs.
 *  At the foot of Settings' list, whichever page is open. */
export function AboutFoot() {
	const [about, setAbout] = useState<About | null>(null)
	useEffect(() => void window.life?.about().then((a) => setAbout(a ?? null)), [])
	if (about === null) return null
	return (
		<div className="mt-auto flex flex-col gap-2 border-t border-booth-edge px-4 pt-4 pb-1 text-xs text-booth-dim select-text">
			<span>
				<span className="font-medium text-booth-ink">Pāua {about.version}</span> · the log is at
			</span>
			<span className="font-mono break-all text-booth-ink">{about.logPath}</span>
			<Button size="sm" onClick={() => window.life?.showLog()} className="self-start">
				Show the log
			</Button>
		</div>
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
		<Card>
			<SectionTitle>Updates</SectionTitle>
			<p className={`text-sm ${updates.state === 'failed' ? 'text-state-unreachable' : updates.state === 'available' ? 'font-bold text-booth-ink' : 'text-booth-dim'}`}>
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
		</Card>
	)
}
