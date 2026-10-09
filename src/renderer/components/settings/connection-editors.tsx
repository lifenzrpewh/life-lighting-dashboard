// Each connection's own fields in Settings, with its own Save: the console
// (and the two MA users), OnTime, ProPresenter and Arena with its folders.
// Only what no show knows (../../../shared/settings.ts). Passwords are
// write-only: a row is told whether one is set, never what it is, so a blank
// password box means "leave it as it is", and Remove is its own button.

import { useState } from 'react'
import { RotateCw } from 'lucide-react'

import type { DeskState } from '../../../shared/desk.js'
import { replyPortOf, type SettingsPatch, type SettingsView } from '../../../shared/settings.js'

import { CueManagerSettings } from '../CueManagerSettings.js'
import { Field, Input, Select, User, portOf, useProPresenterNames } from '../form.js'
import { Button } from '../ui.js'
import { formatAge } from '../vocabulary.js'
import { Editor, FolderInput, HostPort, type Save } from './parts.js'

export function OnTimeEditor({ view, save }: { view: SettingsView; save: Save }) {
	const [host, setHost] = useState(view.onTimeHost ?? '')
	const [port, setPort] = useState(String(view.onTimePort))
	return (
		<Editor save={save} patch={() => ({ onTimeHost: host, onTimePort: portOf(port) })}>
			{(err) => (
				<>
					<p className="text-sm text-booth-dim">Shown beside the clock whenever an event is running in OnTime.</p>
					<HostPort
						err={err}
						host={host}
						port={port}
						onHost={setHost}
						onPort={setPort}
						hostField="onTimeHost"
						portField="onTimePort"
						hostLabel="OnTime address"
						portHint="4001 unless OnTime says otherwise."
					/>
				</>
			)}
		</Editor>
	)
}

export function ProPresenterEditor({ view, save }: { view: SettingsView; save: Save }) {
	const [host, setHost] = useState(view.proPresenterHost ?? '')
	const [port, setPort] = useState(String(view.proPresenterPort))
	const [timer, setTimer] = useState(view.proPresenterTimer ?? '')
	const names = useProPresenterNames()
	return (
		<Editor
			save={save}
			patch={() => ({
				proPresenterHost: host,
				proPresenterPort: portOf(port),
				proPresenterTimer: timer === '' ? null : timer,
			})}
		>
			{(err) => (
				<>
					<p className="text-sm text-booth-dim">
						Shown beside the clock when OnTime has no event running: the timer, labelled by the stage message.
					</p>
					<HostPort
						err={err}
						host={host}
						port={port}
						onHost={setHost}
						onPort={setPort}
						hostField="proPresenterHost"
						portField="proPresenterPort"
						hostLabel="ProPresenter address"
						portHint="1025 unless ProPresenter › Settings › Network says otherwise (Enable Network on)."
					/>
					<Field
						label="Timer"
						error={err('proPresenterTimer')}
						hint={
							names === null
								? 'ProPresenter’s timers are listed here once it is answering.'
								: 'When more than one runs at once, the countdown follows this one.'
						}
					>
						<Select
							value={timer}
							onChange={setTimer}
							options={[
								{ value: '', label: 'Whichever is running' },
								...(names ?? []).map((name) => ({ value: name, label: name })),
								// The saved choice stays offered when ProPresenter does not list
								// it, so opening this row never changes it quietly.
								...(timer !== '' && !(names ?? []).includes(timer)
									? [{ value: timer, label: `${timer} (not in ProPresenter now)` }]
									: []),
							]}
						/>
					</Field>
				</>
			)}
		</Editor>
	)
}

export function ArenaEditor({ view, save }: { view: SettingsView; save: Save }) {
	const [host, setHost] = useState(view.arenaHost ?? '')
	const [port, setPort] = useState(String(view.arenaPort))
	const [graphics, setGraphics] = useState(view.graphicsFolder ?? '')
	const [local, setLocal] = useState(view.localMediaFolder ?? '')
	return (
		<Editor
			save={save}
			patch={() => ({
				arenaHost: host,
				arenaPort: portOf(port),
				graphicsFolder: graphics.trim() === '' ? null : graphics,
				localMediaFolder: local.trim() === '' ? null : local,
			})}
		>
			{(err) => (
				<>
					<p className="text-sm text-booth-dim">
						Arena › Preferences › Web Server, with Enable Webserver &amp; REST API on. 127.0.0.1 when Arena runs on this
						computer.
					</p>
					<HostPort
						err={err}
						host={host}
						port={port}
						onHost={setHost}
						onPort={setPort}
						hostField="arenaHost"
						portField="arenaPort"
						hostLabel="Arena address"
						portHint="8080 unless Arena says otherwise."
					/>
					<p className="text-sm text-booth-dim">
						For the media check's Fetch: the lookbook's file is found by name in the graphics folder (only ever read),
						copied into the local folder, and loaded into Arena's clip. Never into a clip that is playing, and nothing is
						overwritten.
					</p>
					<div className="grid grid-cols-2 gap-4">
						<Field label="Graphics folder" error={err('graphicsFolder')} hint="The NAS or drive the media comes from.">
							<FolderInput value={graphics} onChange={setGraphics} placeholder="\\LC-NAS-01\Graphics\Sunday Media" />
						</Field>
						<Field label="Local folder" error={err('localMediaFolder')} hint="On this computer, for Arena to play from.">
							<FolderInput value={local} onChange={setLocal} placeholder="D:\VFX Media" />
						</Field>
					</div>
				</>
			)}
		</Editor>
	)
}

export function ConsoleEditor({ view, save }: { view: SettingsView; save: Save }) {
	const [host, setHost] = useState(view.consoleHost ?? '')
	const [webPort, setWebPort] = useState(String(view.webRemotePort))
	const [oscPort, setOscPort] = useState(String(view.oscPort))
	const [replyPort, setReplyPort] = useState(view.replyPort === null ? '' : String(view.replyPort))
	const [volunteerUser, setVolunteerUser] = useState(view.volunteerUser)
	const [operatorUser, setOperatorUser] = useState(view.operatorUser ?? '')
	const [volunteerPassword, setVolunteerPassword] = useState('')
	const [operatorPassword, setOperatorPassword] = useState('')
	const [removeVolunteer, setRemoveVolunteer] = useState(false)
	const [removeOperator, setRemoveOperator] = useState(false)
	const [campus, setCampus] = useState(view.campus ?? '')

	const patch = (): SettingsPatch => {
		const p: SettingsPatch = {
			consoleHost: host,
			campus: campus.trim() === '' ? null : campus,
			webRemotePort: portOf(webPort),
			oscPort: portOf(oscPort),
			replyPort: replyPort.trim() === '' ? null : portOf(replyPort),
			volunteerUser,
			operatorUser: operatorUser === '' ? null : operatorUser,
		}
		if (removeVolunteer) p.volunteerPassword = null
		else if (volunteerPassword !== '') p.volunteerPassword = volunteerPassword
		if (removeOperator) p.operatorPassword = null
		else if (operatorPassword !== '') p.operatorPassword = operatorPassword
		return p
	}

	return (
		<Editor save={save} patch={patch} note="The MA pane reconnects with these.">
			{(err) => (
				<>
					<div className="grid grid-cols-2 gap-4">
						<Field label="Console address" error={err('consoleHost')}>
							<Input value={host} onChange={setHost} placeholder="10.11.60.40" mono />
						</Field>
						<Field label="Web remote port" error={err('webRemotePort')} hint="8080 unless the console says otherwise.">
							<Input value={webPort} onChange={setWebPort} inputMode="numeric" />
						</Field>
						<Field label="OSC port on the console" error={err('oscPort')} hint="The Port of the console's OSC entry, prefix life.">
							<Input value={oscPort} onChange={setOscPort} inputMode="numeric" />
						</Field>
						<Field
							label="Replies come back on"
							error={err('replyPort')}
							hint="Blank for the same port. Only grandMA3 onPC on this computer needs another."
						>
							<Input
								value={replyPort}
								onChange={setReplyPort}
								inputMode="numeric"
								placeholder={`same (${oscPort.trim() || view.oscPort})`}
							/>
						</Field>
						<Field label="Campus" error={err('campus')} hint="Save As names begin with it, then the date and time.">
							<Input value={campus} onChange={setCampus} placeholder="Central" />
						</Field>
					</div>
					<p className="text-sm text-booth-dim">
						Listening on {replyPortOf(view)} now. The link is checked by asking the console to echo a message after 15 s of
						quiet, which puts one SendOSC line on its command line.
					</p>
					<p className="text-sm text-booth-dim">
						What each mode may do is set on the console, in these users’ rights. Admin, Guest and 3D users cannot log in
						to a web remote.
					</p>
					<User
						label="Volunteer"
						hint="Remote, with no password, is the web remote's own default."
						user={volunteerUser}
						onUser={setVolunteerUser}
						password={volunteerPassword}
						onPassword={(v) => {
							setVolunteerPassword(v)
							setRemoveVolunteer(false)
						}}
						hasPassword={view.volunteerHasPassword}
						removing={removeVolunteer}
						onRemove={() => {
							setRemoveVolunteer(!removeVolunteer)
							setVolunteerPassword('')
						}}
						canStore={view.canStorePasswords}
						errors={[err('volunteerUser'), err('volunteerPassword')]}
					/>
					<User
						label="Admin"
						hint="The LD’s MA user. Leave blank and Admin keeps the volunteer user."
						user={operatorUser}
						onUser={setOperatorUser}
						password={operatorPassword}
						onPassword={(v) => {
							setOperatorPassword(v)
							setRemoveOperator(false)
						}}
						hasPassword={view.operatorHasPassword}
						removing={removeOperator}
						onRemove={() => {
							setRemoveOperator(!removeOperator)
							setOperatorPassword('')
						}}
						canStore={view.canStorePasswords}
						errors={[err('operatorUser'), err('operatorPassword')]}
					/>
				</>
			)}
		</Editor>
	)
}

/** Where the MA pane is pointed, and what the wire has heard. Channel B is an
 *  OBSERVATION beside the link's verdict, never folded into it: the link can be
 *  down while fader levels arrive, and one green dot for both is how "we heard
 *  something" becomes "everything is fine". */
export function ConsoleInfo({ paneSummary, desk, now }: { paneSummary: string; desk: DeskState | null; now: number }) {
	return (
		<div className="flex flex-col gap-1 text-sm">
			<span>
				<span className="text-booth-dim">MA pane · </span>
				{paneSummary}
			</span>
			{desk !== null && (
				<span>
					<span className="text-booth-dim">Desk · </span>
					{!desk.listening ? (
						// A port that would not bind is a fault to act on. Amber is reserved for this.
						<span className="text-warn">OSC port {desk.port} not bound</span>
					) : desk.lastHeardAt === null ? (
						'not heard yet'
					) : (
						<>
							heard {formatAge(now - desk.lastHeardAt)} · {desk.executors.length}{' '}
							{desk.executors.length === 1 ? 'control' : 'controls'}
							{/* Should sit at zero forever: a number here means the desk says
							    something we read wrong. */}
							{desk.rejected > 0 && <span className="text-warn"> · {desk.rejected} rejected</span>}
						</>
					)}
				</span>
			)}
		</div>
	)
}

export function CueInfo() {
	return (
		<>
			<p className="text-sm text-booth-dim">
				The run order is the Cue Manager itself. Here it signs in only as a device: its column shows a QR, and an
				admin scans it and picks this booth’s device, or makes a new one. Clear it below to pair again.
			</p>
			<CueManagerSettings />
		</>
	)
}


/** The video feed's Restart, for anyone (Settings is Admin's, but the same
 *  button is in the Video view and on the feed's row in Connections), and what
 *  to do on a computer with two graphics cards (src/main/video-feed.ts has why). */
export function VideoInfo() {
	return (
		<>
			{window.life !== undefined && (
				<div>
					<Button size="sm" icon={RotateCw} onClick={() => window.life?.restartVideo()}>
						Restart video
					</Button>
				</div>
			)}
			<p className="max-w-prose text-sm text-booth-dim">
				A sender listed but no picture, on a computer with two graphics cards: the sender (Arena) and Pāua must draw on the
				same one. In Windows Settings › System › Display › Graphics, set both Pāua and Arena to High performance, then
				restart both. The log’s <span className="font-mono">[video] graphics</span> line says which cards Pāua sees.
			</p>
		</>
	)
}
