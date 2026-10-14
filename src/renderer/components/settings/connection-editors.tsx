// Each connection's own fields in Settings, with its own Save: the console
// (and the two MA users), OnTime, ProPresenter and Arena with its folders.
// Only what no show knows (../../../shared/settings.ts). Passwords are
// write-only: a row is told whether one is set, never what it is, so a blank
// password box means "leave it as it is", and Remove is its own button.

import { useEffect, useState } from 'react'
import { RotateCw, Search } from 'lucide-react'

import type { DeskState } from '../../../shared/desk.js'
import { DEFAULT_SETTINGS, replyPortOf, sameReplyPortOf, type SettingsPatch, type SettingsView } from '../../../shared/settings.js'

import { CueManagerSettings } from '../CueManagerSettings.js'
import { Field, Input, Select, User, portOf, useProPresenterNames } from '../form.js'
import { Button, Segmented } from '../ui.js'
import { formatAge } from '../vocabulary.js'
import { Advanced, Editor, FolderInput, HostPort, type Save } from './parts.js'

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
						defaultPort={DEFAULT_SETTINGS.onTimePort}
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
	const [annOn, setAnnOn] = useState(view.announcementsOn)
	const [annFolder, setAnnFolder] = useState(view.announcementsFolder ?? '')
	const [annMedia, setAnnMedia] = useState(view.announcementsMediaPlaylist)
	const [annOutput, setAnnOutput] = useState(view.announcementsPlaylist)
	const names = useProPresenterNames()
	return (
		<Editor
			save={save}
			patch={() => ({
				proPresenterHost: host,
				proPresenterPort: portOf(port),
				proPresenterTimer: timer === '' ? null : timer,
				announcementsOn: annOn,
				announcementsFolder: annFolder.trim() === '' ? null : annFolder,
				announcementsMediaPlaylist: annMedia,
				announcementsPlaylist: annOutput,
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
						defaultPort={DEFAULT_SETTINGS.proPresenterPort}
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
					<p className="pt-2 text-sm font-bold text-booth-ink">Announcements</p>
					<div className="flex items-center gap-4">
						<Segmented
							label="Announcements"
							value={annOn}
							onChange={setAnnOn}
							options={[
								{ value: true, label: 'On' },
								{ value: false, label: 'Off' },
							]}
						/>
						<span className="text-sm text-booth-dim">
							{annOn ? 'The Announcements view checks and loads the lower thirds.' : 'Not used at this campus: the Announcements view is hidden.'}
						</span>
					</div>
					{annOn && (
						<>
							<p className="text-sm text-booth-dim">
								Copy to the folder puts the week's lower thirds (from Arena's graphics folder) into the folder below; someone
								drags them from it, in Finder or Explorer, into the media playlist; then Write sets the output playlist, AM, PM
								or EVENT by the service's name.
							</p>
							<Field label="Folder" error={err('announcementsFolder')} hint="As this computer reaches it, and ProPresenter's computer too.">
								<FolderInput value={annFolder} onChange={setAnnFolder} placeholder="\\10.0.0.71\graphics\Other Media\Paua Smart Folder" />
							</Field>
							<Advanced
								summary={`playlists “${annMedia}” and “${annOutput} AM/PM/EVENT”`}
								changed={annMedia !== DEFAULT_SETTINGS.announcementsMediaPlaylist || annOutput !== DEFAULT_SETTINGS.announcementsPlaylist}
								errors={[err('announcementsMediaPlaylist'), err('announcementsPlaylist')]}
							>
								<div className="grid grid-cols-2 gap-4">
									<Field label="Media playlist" error={err('announcementsMediaPlaylist')} hint="In the Media Bin; they are dragged into it.">
										<Input value={annMedia} onChange={setAnnMedia} />
									</Field>
									<Field label="Output playlist" error={err('announcementsPlaylist')} hint="Without AM, PM or EVENT.">
										<Input value={annOutput} onChange={setAnnOutput} />
									</Field>
								</div>
							</Advanced>
						</>
					)}
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
	// Find: Arena on this computer, on the ports it is usually on. Fills the
	// fields; Save keeps them.
	const [finding, setFinding] = useState<'idle' | 'looking' | string>('idle')
	const find = () => {
		setFinding('looking')
		void window.life?.findArena().then((found) => {
			if (found === null) return setFinding('Arena is not answering on this computer (8080 or 8090). Is its web server on?')
			setHost(found.host)
			setPort(String(found.port))
			setFinding(`Found ${found.version} on port ${found.port}. Save to keep it.`)
		})
	}
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
						defaultPort={DEFAULT_SETTINGS.arenaPort}
						aside={
							window.life !== undefined && (
								<Button icon={Search} onClick={find} disabled={finding === 'looking'}>
									Find
								</Button>
							)
						}
					/>
					{finding !== 'idle' && <p className="text-sm text-booth-dim">{finding === 'looking' ? 'Looking on this computer…' : finding}</p>}
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
	// This computer's addresses: where the console's OSC row must send.
	const [here, setHere] = useState<string[] | null>(null)
	useEffect(() => void window.life?.hereAddresses().then(setHere), [])
	const oscNow = portOf(oscPort) ?? view.oscPort
	const worked = sameReplyPortOf({ consoleHost: host.trim() === '' ? null : host.trim(), oscPort: oscNow })

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
						<Field label="Campus" error={err('campus')} hint="Save As names begin with it, then the date and time.">
							<Input value={campus} onChange={setCampus} placeholder="Central" />
						</Field>
					</div>
					<OscRowCard here={here} oscPort={oscNow} replyPort={replyPort.trim() === '' ? worked : (portOf(replyPort) ?? worked)} loopback={worked !== oscNow} />
					<Advanced
						summary={`web remote ${webPort.trim() || view.webRemotePort} · OSC ${oscPort.trim() || view.oscPort}${replyPort.trim() === '' ? '' : ` · replies ${replyPort.trim()}`}`}
						changed={
							webPort.trim() !== String(DEFAULT_SETTINGS.webRemotePort) || oscPort.trim() !== String(DEFAULT_SETTINGS.oscPort) || replyPort.trim() !== ''
						}
						errors={[err('webRemotePort'), err('oscPort'), err('replyPort')]}
					>
						<div className="grid grid-cols-2 gap-4">
							<Field label="Web remote port" error={err('webRemotePort')} hint="8080 unless the console says otherwise.">
								<Input value={webPort} onChange={setWebPort} inputMode="numeric" />
							</Field>
							<Field label="OSC port on the console" error={err('oscPort')} hint="The Port of the console's OSC entry, prefix life.">
								<Input value={oscPort} onChange={setOscPort} inputMode="numeric" />
							</Field>
							<Field
								label="Replies come back on"
								error={err('replyPort')}
								hint="Blank works it out: the same port, or the next one up for grandMA3 onPC on this computer."
							>
								<Input value={replyPort} onChange={setReplyPort} inputMode="numeric" placeholder={`worked out (${worked})`} />
							</Field>
						</div>
						<p className="text-sm text-booth-dim">
							Listening on {replyPortOf(view)} now. The link is checked by asking the console to echo a message after 15 s of
							quiet, which puts one SendOSC line on its command line.
						</p>
					</Advanced>
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

/** What to set in the console's OSC row for this computer: the destination
 *  is per machine, and one copied from another booth (or the broadcast
 *  address, which lagged the desk) is the fault that has cost the most here. */
function OscRowCard({ here, oscPort, replyPort, loopback }: { here: string[] | null; oscPort: number; replyPort: number; loopback: boolean }) {
	const to = loopback ? ['127.0.0.1'] : (here ?? [])
	return (
		<div className="flex flex-col gap-1 rounded-ctl bg-booth-raise p-3 text-sm">
			<span className="font-bold">On the console: Menu › In &amp; Out › OSC, one row</span>
			<span className="text-booth-dim">
				Prefix <span className="font-mono text-booth-ink">life</span> · Port <span className="font-mono text-booth-ink">{oscPort}</span> ·
				Receive, Receive Command, Send and Send Command all Yes
			</span>
			<span className="text-booth-dim">
				Destination{' '}
				{to.length === 0 ? (
					here === null ? (
						'this computer’s address'
					) : (
						<span className="text-warn">this computer has no network address now</span>
					)
				) : (
					<>
						<span className="font-mono text-booth-ink">{to.join(' or ')}</span>
						{to.length > 1 ? ' (whichever the console reaches)' : ''}
					</>
				)}
				{replyPort !== oscPort && (
					<>
						{' '}
						on port <span className="font-mono text-booth-ink">{replyPort}</span>
					</>
				)}
				. Never the broadcast address.
			</span>
		</div>
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
