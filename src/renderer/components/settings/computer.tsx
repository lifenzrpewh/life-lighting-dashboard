// This computer: full screen or a window, and which build this is and where
// it logs. In Settings, so Admin only.

import { useEffect, useState } from 'react'

import type { About } from '../../../shared/about.js'

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
