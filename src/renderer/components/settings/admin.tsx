// Settings › Screen and Admin: the passcode Admin asks for, how long Admin
// lasts with nobody touching anything (../../../shared/admin.ts has the rules),
// Show mode's way out, the top bar's items and Testing (../../barItems.ts),
// full screen or a window, and start at login. All of it takes effect when
// tapped; nothing waits for a Save. Only Admin reaches Settings, so changing
// the passcode needs Admin already; the old passcode is not asked again.
// (Admin, Top bar and This computer's screen were three pages until
// 2026-10-15.)

import { useEffect, useState } from 'react'
import { KeyRound, Trash2 } from 'lucide-react'

import { ADMIN_TIMEOUTS_MIN, passcodeError } from '../../../shared/admin.js'
import type { SettingsView } from '../../../shared/settings.js'

import { BAR_ITEMS, BAR_ITEM_LABEL, type BarItem } from '../../barItems.js'
import { PasscodeEntry } from '../PasscodeSheet.js'
import { Button, Segmented } from '../ui.js'
import { Help, Page, Row, Rows, Switch, type Save } from './parts.js'
import { StartAtLogin } from './computer.js'

export function AdminSettings({
	view,
	save,
	barHidden,
	onBarHidden,
	testing,
	onTesting,
}: {
	view: SettingsView
	save: Save
	barHidden: ReadonlySet<BarItem>
	onBarHidden: (item: BarItem, hidden: boolean) => void
	testing: boolean
	onTesting: (on: boolean) => void
}) {
	const [error, setError] = useState<string | null>(null)
	const saved = (field: 'adminTimeoutMin' | 'showModeLocked' | 'windowed') => (e: Awaited<ReturnType<Save>>) =>
		setError(e === null ? null : (e[field] ?? e.form ?? 'Not saved.'))
	return (
		<Page title="Screen and Admin" help>
			<Help>
				On this computer only. Each takes effect when tapped. Forgotten the passcode? Close Pāua, open settings.json in its data
				folder (beside the log), delete the “adminPasscode” entry, and start it again: Admin then opens with a tap. Five wrong
				tries make the screen wait 30 seconds.
			</Help>
			{error !== null && <p className="text-sm text-state-unreachable">{error}</p>}
			<Rows title="Admin">
				<Passcode has={view.hasAdminPasscode} save={save} />
				<Row label="Back to volunteer" help="With no touch or key anywhere, the MA and the run order included, Admin goes back to volunteer by itself.">
					<span>
						<Segmented
							label="Back to volunteer after"
							value={String(view.adminTimeoutMin)}
							onChange={(v) => void save({ adminTimeoutMin: Number(v) }).then(saved('adminTimeoutMin'))}
							options={ADMIN_TIMEOUTS_MIN.map((m) => ({ value: String(m), label: `${m} min` }))}
						/>
					</span>
				</Row>
				<Row
					label="Leaving Show mode"
					help={
						view.showModeLocked
							? 'Show mode is a lock: leaving it asks for the passcode (a tap if none is set) and lands in Admin.'
							: 'Show mode only gives the windows the space: anyone leaves it with a tap, back to volunteer.'
					}
				>
					<span>
						<Segmented
							label="Leaving Show mode"
							value={view.showModeLocked ? 'locked' : 'open'}
							onChange={(v) => void save({ showModeLocked: v === 'locked' }).then(saved('showModeLocked'))}
							options={[
								{ value: 'locked', label: 'Admin’s passcode' },
								{ value: 'open', label: 'Anyone, with a tap' },
							]}
						/>
					</span>
				</Row>
			</Rows>
			<Rows title="Top bar">
				<Help>The lock, Connections, the fold handle and, in Admin, Settings are always there.</Help>
				{BAR_ITEMS.map((item) => (
					<Row key={item} label={BAR_ITEM_LABEL[item].name} help={BAR_ITEM_LABEL[item].what}>
						<Switch label={BAR_ITEM_LABEL[item].name} on={!barHidden.has(item)} onSet={(shown) => onBarHidden(item, !shown)} />
					</Row>
				))}
				<Row label="Testing" help="While a field test is on, Mark sits on the bar: one tap writes a numbered line to the log at that moment.">
					<Switch label="Testing" on={testing} onSet={onTesting} />
				</Row>
			</Rows>
			<Rows title="This screen">
				<Row label="Screen" help="A window is for testing on a laptop; the booth stays full screen.">
					<span>
						<Segmented
							label="This screen"
							value={view.windowed}
							onChange={(v) => void save({ windowed: v }).then(saved('windowed'))}
							options={[
								{ value: false, label: 'Full screen' },
								{ value: true, label: 'Window' },
							]}
						/>
					</span>
				</Row>
				<StartAtLogin />
			</Rows>
		</Page>
	)
}

/** Set, change or remove. A new one is typed twice, on the keypad or the
 *  keyboard, so a slip is caught here and not at the next unlock. */
function Passcode({ has, save }: { has: boolean; save: Save }) {
	// null: not setting one. 'new': typing it. A string: typed once, to repeat.
	const [step, setStep] = useState<null | 'new' | { first: string }>(null)
	const [said, setSaid] = useState<{ words: string; bad: boolean } | null>(null)
	const [removing, setRemoving] = useState(false)
	const [keypad, setKeypad] = useState(true)
	useEffect(() => {
		if (!removing) return
		const id = setTimeout(() => setRemoving(false), 4_000)
		return () => clearTimeout(id)
	}, [removing])

	const typed = async (code: string) => {
		if (step === 'new') {
			const e = passcodeError(code)
			if (e !== null) return setSaid({ words: e, bad: true })
			setKeypad(/^\d+$/.test(code))
			setSaid(null)
			return setStep({ first: code })
		}
		if (step === null) return
		if (code !== step.first) {
			setStep('new')
			return setSaid({ words: 'The two did not match. Type the new passcode again.', bad: true })
		}
		const errors = await save({ adminPasscode: code })
		if (errors !== null) return setSaid({ words: errors.adminPasscode ?? errors.form ?? 'Not saved.', bad: true })
		setStep(null)
		setSaid({ words: 'Saved. Admin asks for it from now on.', bad: false })
	}

	return (
		<Row label="Passcode" help={has ? 'Tapping Volunteer asks for it before Admin opens.' : undefined}>
			{!has && <span className="flex min-h-12 items-center text-base text-booth-ink">None: anyone can tap into Admin.</span>}
			{step === null ? (
				<div className="flex flex-wrap items-center gap-3">
					<Button icon={KeyRound} onClick={() => (setSaid(null), setStep('new'))}>
						{has ? 'Change the passcode' : 'Set a passcode'}
					</Button>
					{has && (
						<Button
							variant={removing ? 'danger' : 'quiet'}
							icon={Trash2}
							onClick={() => {
								if (!removing) return setRemoving(true)
								setRemoving(false)
								void save({ adminPasscode: null }).then((e) =>
									setSaid(e === null ? { words: 'Removed. Anyone can tap into Admin.', bad: false } : { words: e.form ?? 'Not removed.', bad: true }),
								)
							}}
						>
							{removing ? 'Tap again to remove' : 'Remove the passcode'}
						</Button>
					)}
				</div>
			) : (
				<div className="flex flex-col items-start gap-4">
					<p className="text-base">{step === 'new' ? 'Type the new passcode: digits for the keypad, or letters on the keyboard.' : 'Once more, to be sure.'}</p>
					{/* Remounted per step, so the second asks the way the first was typed. */}
					<PasscodeEntry key={step === 'new' ? 'new' : 'again'} keypadFirst={step === 'new' ? true : keypad} submitLabel={step === 'new' ? 'Next' : 'Save'} onSubmit={typed} />
					<Button variant="ghost" onClick={() => (setStep(null), setSaid(null))}>
						Cancel
					</Button>
				</div>
			)}
			{said !== null && <p className={`text-sm ${said.bad ? 'text-state-unreachable' : 'text-state-live'}`}>{said.words}</p>}
		</Row>
	)
}
