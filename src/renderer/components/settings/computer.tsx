// This computer: full screen or a window, updates, and which build this is
// and where it logs. In Settings, so Admin only.

import { useEffect, useState } from 'react'

import { Download, RefreshCw } from 'lucide-react'

import type { About } from '../../../shared/about.js'
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
