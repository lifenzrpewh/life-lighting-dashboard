// Each connection's own fields in Settings, as label-and-field rows with the
// page's one Save bar (./parts.tsx): the console (and the two MA users),
// OnTime, ProPresenter, Arena, and the folders the media and announcements
// come from. Only what no show knows (../../../shared/settings.ts). Passwords
// are write-only: a row is told whether one is set, never what it is, so a
// blank password box means "leave it as it is", and Remove is its own button.

import { useEffect, useState } from 'react'
import { RotateCw, Search } from 'lucide-react'

import type { DeskState } from '../../../shared/desk.js'
import { replyPortOf, sameReplyPortOf, type SettingsPatch, type SettingsView } from '../../../shared/settings.js'

import { CueManagerSettings } from '../CueManagerSettings.js'
import { Input, Select, portOf, useProPresenterNames } from '../form.js'
import { Button } from '../ui.js'
import { formatAge } from '../vocabulary.js'
import { AddressPort, Editor, FolderInput, Help, Row, Rows, Switch, useDraft, type Save } from './parts.js'

/** The labels of the drafts that changed, for the Save bar. */
const named = <K extends string>(changed: readonly K[], labels: Record<K, string>) => [...new Set(changed.map((k) => labels[k]))]

export function OnTimeEditor({ view, save }: { view: SettingsView; save: Save }) {
	const d = useDraft({ host: view.onTimeHost ?? '', port: String(view.onTimePort) })
	return (
		<Editor
			save={save}
			patch={() => ({ onTimeHost: d.draft.host, onTimePort: portOf(d.draft.port) })}
			changes={named(d.changed, { host: 'address', port: 'port' })}
			onRevert={d.revert}
			onSaved={d.settle}
		>
			{(err) => (
				<>
					<Help>Shown beside the clock whenever an event is running in OnTime. Its port is 4001 unless OnTime says otherwise.</Help>
					<Row label="Address" error={err('onTimeHost') ?? err('onTimePort')}>
						<AddressPort host={d.draft.host} port={d.draft.port} onHost={(v) => d.set('host', v)} onPort={(v) => d.set('port', v)} />
					</Row>
				</>
			)}
		</Editor>
	)
}

export function ProPresenterEditor({ view, save }: { view: SettingsView; save: Save }) {
	const d = useDraft({ host: view.proPresenterHost ?? '', port: String(view.proPresenterPort), timer: view.proPresenterTimer ?? '' })
	const names = useProPresenterNames()
	const timer = d.draft.timer
	return (
		<Editor
			save={save}
			patch={() => ({ proPresenterHost: d.draft.host, proPresenterPort: portOf(d.draft.port), proPresenterTimer: timer === '' ? null : timer })}
			changes={named(d.changed, { host: 'address', port: 'port', timer: 'timer' })}
			onRevert={d.revert}
			onSaved={d.settle}
		>
			{(err) => (
				<>
					<Help>
						Shown beside the clock when OnTime has no event running: the timer, labelled by the stage message. The port is
						1025 unless ProPresenter › Settings › Network says otherwise (Enable Network on). The announcements’ folder and
						playlists are under Media and folders.
					</Help>
					<Row label="Address" error={err('proPresenterHost') ?? err('proPresenterPort')}>
						<AddressPort host={d.draft.host} port={d.draft.port} onHost={(v) => d.set('host', v)} onPort={(v) => d.set('port', v)} />
					</Row>
					<Row
						label="Timer"
						error={err('proPresenterTimer')}
						help={names === null ? 'ProPresenter’s timers are listed here once it is answering.' : 'When more than one runs at once, the countdown follows this one.'}
					>
						<Select
							value={timer}
							onChange={(v) => d.set('timer', v)}
							options={[
								{ value: '', label: 'Whichever is running' },
								...(names ?? []).map((name) => ({ value: name, label: name })),
								// The saved choice stays offered when ProPresenter does not list
								// it, so opening this page never changes it quietly.
								...(timer !== '' && !(names ?? []).includes(timer) ? [{ value: timer, label: `${timer} (not in ProPresenter now)` }] : []),
							]}
						/>
					</Row>
				</>
			)}
		</Editor>
	)
}

export function ArenaEditor({ view, save }: { view: SettingsView; save: Save }) {
	const d = useDraft({ host: view.arenaHost ?? '', port: String(view.arenaPort) })
	// Find: Arena on this computer, on the ports it is usually on. Fills the
	// fields; Save keeps them.
	const [finding, setFinding] = useState<'idle' | 'looking' | string>('idle')
	const find = () => {
		setFinding('looking')
		void window.life?.findArena().then((found) => {
			if (found === null) return setFinding('Arena is not answering on this computer (8080 or 8090). Is its web server on?')
			d.set('host', found.host)
			d.set('port', String(found.port))
			setFinding(`Found ${found.version} on port ${found.port}.`)
		})
	}
	return (
		<Editor
			save={save}
			patch={() => ({ arenaHost: d.draft.host, arenaPort: portOf(d.draft.port) })}
			changes={named(d.changed, { host: 'address', port: 'port' })}
			onRevert={d.revert}
			onSaved={d.settle}
		>
			{(err) => (
				<>
					<Help>
						Arena › Preferences › Web Server, with Enable Webserver &amp; REST API on: 127.0.0.1 when Arena runs on this computer,
						port 8080 unless Arena says otherwise. The graphics and local folders are under Media and folders.
					</Help>
					<Row label="Address" error={err('arenaHost') ?? err('arenaPort')}>
						<AddressPort
							host={d.draft.host}
							port={d.draft.port}
							onHost={(v) => d.set('host', v)}
							onPort={(v) => d.set('port', v)}
							aside={
								window.life !== undefined && (
									<Button icon={Search} onClick={find} disabled={finding === 'looking'}>
										Find
									</Button>
								)
							}
						/>
						{finding !== 'idle' && <span className="text-sm text-booth-dim">{finding === 'looking' ? 'Looking on this computer…' : finding}</span>}
					</Row>
				</>
			)}
		</Editor>
	)
}

/** Where the media comes from and goes, and the announcements: the folders
 *  and playlist names that were on the Arena and ProPresenter pages, on one. */
export function MediaEditor({ view, save }: { view: SettingsView; save: Save }) {
	const d = useDraft({
		graphics: view.graphicsFolder ?? '',
		local: view.localMediaFolder ?? '',
		annFolder: view.announcementsFolder ?? '',
		annMedia: view.announcementsMediaPlaylist,
		annOutput: view.announcementsPlaylist,
	})
	const [annError, setAnnError] = useState<string | null>(null)
	const folder = (v: string) => (v.trim() === '' ? null : v)
	return (
		<Editor
			save={save}
			patch={(): SettingsPatch => ({
				graphicsFolder: folder(d.draft.graphics),
				localMediaFolder: folder(d.draft.local),
				announcementsFolder: folder(d.draft.annFolder),
				announcementsMediaPlaylist: d.draft.annMedia,
				announcementsPlaylist: d.draft.annOutput,
			})}
			changes={named(d.changed, {
				graphics: 'graphics folder',
				local: 'local folder',
				annFolder: 'announcements folder',
				annMedia: 'media playlist',
				annOutput: 'output playlist',
			})}
			onRevert={d.revert}
			onSaved={d.settle}
		>
			{(err) => (
				<>
					<Rows title="Media for Arena">
						<Help>
							For the Lookbook’s loads: a file is found by its code in the graphics folder (only ever read), copied into the local
							folder, and loaded into Arena’s clip. Never into a clip that is playing without asking, and nothing is overwritten.
						</Help>
						<Row label="Graphics folder" error={err('graphicsFolder')} help="The NAS or drive the media comes from.">
							<FolderInput value={d.draft.graphics} onChange={(v) => d.set('graphics', v)} placeholder="\\LC-NAS-01\Graphics\Sunday Media" />
						</Row>
						<Row label="Local folder" error={err('localMediaFolder')} help="On this computer, for Arena to play from.">
							<FolderInput value={d.draft.local} onChange={(v) => d.set('local', v)} placeholder="D:\VFX Media" />
						</Row>
					</Rows>
					<Rows title="ProPresenter announcements">
						<Row label="Announcements" error={annError ?? undefined} help="Off for a campus without them: the Announcements view is hidden.">
							<Switch
								label="Announcements"
								on={view.announcementsOn}
								onSet={(on) => void save({ announcementsOn: on }).then((e) => setAnnError(e === null ? null : (e.announcementsOn ?? e.form ?? 'Not saved.')))}
							/>
						</Row>
						{view.announcementsOn && (
							<>
								<Help>
									Copy to the folder puts the week’s lower thirds (from the graphics folder) into the folder below; someone drags
									them from it, in Finder or Explorer, into the media playlist; then Write sets the output playlist, AM, PM or EVENT
									by the service’s name.
								</Help>
								<Row label="Folder" error={err('announcementsFolder')} help="As this computer reaches it, and ProPresenter’s computer too.">
									<FolderInput value={d.draft.annFolder} onChange={(v) => d.set('annFolder', v)} placeholder="\\10.0.0.71\graphics\Other Media\Paua Smart Folder" />
								</Row>
								<Row label="Media playlist" error={err('announcementsMediaPlaylist')} help="In the Media Bin; the pictures are dragged into it.">
									<Input value={d.draft.annMedia} onChange={(v) => d.set('annMedia', v)} />
								</Row>
								<Row label="Output playlist" error={err('announcementsPlaylist')} help="Without AM, PM or EVENT.">
									<Input value={d.draft.annOutput} onChange={(v) => d.set('annOutput', v)} />
								</Row>
							</>
						)}
					</Rows>
				</>
			)}
		</Editor>
	)
}

export function ConsoleEditor({ view, save }: { view: SettingsView; save: Save }) {
	const d = useDraft({
		host: view.consoleHost ?? '',
		webPort: String(view.webRemotePort),
		oscPort: String(view.oscPort),
		replyPort: view.replyPort === null ? '' : String(view.replyPort),
		campus: view.campus ?? '',
		volunteerUser: view.volunteerUser,
		operatorUser: view.operatorUser ?? '',
		volunteerPassword: '',
		operatorPassword: '',
		removeVolunteer: false as boolean,
		removeOperator: false as boolean,
	})
	const v = d.draft
	// This computer's addresses: where the console's OSC row must send.
	const [here, setHere] = useState<string[] | null>(null)
	useEffect(() => void window.life?.hereAddresses().then(setHere), [])
	const oscNow = Number.isFinite(portOf(v.oscPort)) ? portOf(v.oscPort) : view.oscPort
	const worked = sameReplyPortOf({ consoleHost: v.host.trim() === '' ? null : v.host.trim(), oscPort: oscNow })
	const replyNow = v.replyPort.trim() === '' || !Number.isFinite(portOf(v.replyPort)) ? worked : portOf(v.replyPort)

	const patch = (): SettingsPatch => {
		const p: SettingsPatch = {
			consoleHost: v.host,
			campus: v.campus.trim() === '' ? null : v.campus,
			webRemotePort: portOf(v.webPort),
			oscPort: portOf(v.oscPort),
			replyPort: v.replyPort.trim() === '' ? null : portOf(v.replyPort),
			volunteerUser: v.volunteerUser,
			operatorUser: v.operatorUser === '' ? null : v.operatorUser,
		}
		if (v.removeVolunteer) p.volunteerPassword = null
		else if (v.volunteerPassword !== '') p.volunteerPassword = v.volunteerPassword
		if (v.removeOperator) p.operatorPassword = null
		else if (v.operatorPassword !== '') p.operatorPassword = v.operatorPassword
		return p
	}
	const clearPasswords = () => {
		d.set('volunteerPassword', '')
		d.set('operatorPassword', '')
		d.set('removeVolunteer', false)
		d.set('removeOperator', false)
	}

	return (
		<Editor
			save={save}
			patch={patch}
			changes={named(d.changed, {
				host: 'address',
				webPort: 'web remote port',
				oscPort: 'OSC port',
				replyPort: 'reply port',
				campus: 'campus',
				volunteerUser: 'volunteer user',
				operatorUser: 'Admin user',
				volunteerPassword: 'volunteer password',
				operatorPassword: 'Admin password',
				removeVolunteer: 'volunteer password',
				removeOperator: 'Admin password',
			})}
			onRevert={d.revert}
			onSaved={() => {
				// A password is never shown again: its box empties once saved.
				clearPasswords()
				d.settle()
			}}
			note="The MA pane reconnects with these."
		>
			{(err) => (
				<>
					<Help>
						The link is checked by asking the console to echo a message after 15 s of quiet, which puts one SendOSC line on its
						command line. Listening on {replyPortOf(view)} now.
					</Help>
					<Row label="Address" error={err('consoleHost') ?? err('webRemotePort')} help="The web remote’s port is 8080 unless the console says otherwise.">
						<span className="flex min-w-0 items-center gap-2">
							<span className="min-w-0 flex-1">
								<Input value={v.host} onChange={(x) => d.set('host', x)} placeholder="10.11.60.40" mono />
							</span>
							<span className="text-booth-faint">web remote</span>
							<span className="w-28 shrink-0">
								<Input value={v.webPort} onChange={(x) => d.set('webPort', x)} inputMode="numeric" />
							</span>
						</span>
					</Row>
					<Row
						label="OSC"
						error={err('oscPort') ?? err('replyPort')}
						help="The Port of the console’s OSC entry. Replies come back on the same port, or the next one up for grandMA3 onPC on this computer; a reply port typed here wins."
					>
						<span className="flex min-w-0 items-center gap-2">
							<span className="w-28 shrink-0">
								<Input value={v.oscPort} onChange={(x) => d.set('oscPort', x)} inputMode="numeric" />
							</span>
							<span className="text-booth-faint">replies on</span>
							<span className="w-28 shrink-0">
								<Input value={v.replyPort} onChange={(x) => d.set('replyPort', x)} inputMode="numeric" placeholder={String(worked)} />
							</span>
							{v.replyPort.trim() === '' && <span className="text-sm text-booth-faint">worked out</span>}
						</span>
					</Row>
					<Row label="Campus" error={err('campus')} help="Save As names begin with it, then the date and time.">
						<Input value={v.campus} onChange={(x) => d.set('campus', x)} placeholder="Central" />
					</Row>
					<User
						label="Volunteer"
						user={v.volunteerUser}
						onUser={(x) => d.set('volunteerUser', x)}
						password={v.volunteerPassword}
						onPassword={(x) => (d.set('volunteerPassword', x), d.set('removeVolunteer', false))}
						hasPassword={view.volunteerHasPassword}
						removing={v.removeVolunteer}
						onRemove={() => (d.set('removeVolunteer', !v.removeVolunteer), d.set('volunteerPassword', ''))}
						canStore={view.canStorePasswords}
						error={err('volunteerUser') ?? err('volunteerPassword')}
						help="The MA user the pane logs in as. Remote, with no password, is the web remote’s own default."
					/>
					<User
						label="Admin"
						user={v.operatorUser}
						onUser={(x) => d.set('operatorUser', x)}
						password={v.operatorPassword}
						onPassword={(x) => (d.set('operatorPassword', x), d.set('removeOperator', false))}
						hasPassword={view.operatorHasPassword}
						removing={v.removeOperator}
						onRemove={() => (d.set('removeOperator', !v.removeOperator), d.set('operatorPassword', ''))}
						canStore={view.canStorePasswords}
						error={err('operatorUser') ?? err('operatorPassword')}
						help="The LD’s MA user, for Admin. Blank: Admin keeps the volunteer user. What each may do is set on the console, in these users’ rights; Admin, Guest and 3D users cannot log in to a web remote."
					/>
					<OscRowCard here={here} oscPort={oscNow} replyPort={replyNow} loopback={worked !== oscNow} />
				</>
			)}
		</Editor>
	)
}

/** An MA user on one row: the name, its password (write-only), Remove. */
function User(p: {
	label: string
	user: string
	onUser: (v: string) => void
	password: string
	onPassword: (v: string) => void
	hasPassword: boolean
	removing: boolean
	onRemove: () => void
	canStore: boolean
	error: string | undefined
	help: string
}) {
	const placeholder = p.removing ? 'removed on Save' : p.hasPassword ? 'password set' : p.canStore ? 'no password' : 'cannot be stored here'
	return (
		<Row label={p.label} error={p.error} help={`${p.help} A blank password keeps the one set.`}>
			<span className="flex min-w-0 items-center gap-2">
				<span className="min-w-0 flex-1">
					<Input value={p.user} onChange={p.onUser} placeholder={p.label === 'Admin' ? 'the volunteer user' : 'Remote'} />
				</span>
				<span className="min-w-0 flex-1">
					<Input type="password" value={p.password} onChange={p.onPassword} disabled={!p.canStore || p.removing} placeholder={placeholder} />
				</span>
				{p.hasPassword && (
					<Button variant={p.removing ? 'danger' : 'quiet'} onClick={p.onRemove}>
						{p.removing ? 'Keep' : 'Remove'}
					</Button>
				)}
			</span>
		</Row>
	)
}

/** What to set in the console's OSC row for this computer: the destination
 *  is per machine, and one copied from another booth (or the broadcast
 *  address, which lagged the desk) is the fault that has cost the most here. */
function OscRowCard({ here, oscPort, replyPort, loopback }: { here: string[] | null; oscPort: number; replyPort: number; loopback: boolean }) {
	const to = loopback ? ['127.0.0.1'] : (here ?? [])
	const mono = (s: string | number) => <span className="font-mono text-booth-ink">{s}</span>
	return (
		<div className="flex flex-col gap-1 rounded-ctl bg-booth-panel px-4 py-3 text-sm text-booth-dim ring-1 ring-booth-edge ring-inset">
			<span className="font-bold text-booth-ink">On the console: Menu › In &amp; Out › OSC, one row</span>
			<span>
				Prefix {mono('life')} · Port {mono(oscPort)} · Receive, Receive Command, Send, Send Command all Yes
			</span>
			<span>
				Destination{' '}
				{to.length === 0 ? (
					here === null ? (
						'this computer’s address'
					) : (
						<span className="text-warn">this computer has no network address now</span>
					)
				) : (
					<>
						{mono(to.join(' or '))}
						{to.length > 1 ? ' (whichever the console reaches)' : ''}
					</>
				)}
				{replyPort !== oscPort && <> on port {mono(replyPort)}</>}. Never the broadcast address.
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
		<div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
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
							heard {formatAge(now - desk.lastHeardAt)} · {desk.executors.length} {desk.executors.length === 1 ? 'control' : 'controls'}
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
			<Help>
				The run order is the Cue Manager itself. Here it signs in only as a device: its column shows a QR, and an admin scans it
				and picks this booth’s device, or makes a new one. Clear it to pair again.
			</Help>
			<Row label="Sign-in">
				<CueManagerSettings />
			</Row>
		</>
	)
}

/** The video feed's Restart, for anyone (Settings is Admin's, but the same
 *  button is in the Video view and on the feed's row in Connections), and what
 *  to do on a computer with two graphics cards (src/main/video-feed.ts has why). */
export function VideoInfo() {
	return (
		<>
			<Help>
				A picture another program on this computer sends over Spout (Windows) or Syphon (Mac), such as Arena’s multiview;
				it works with Arena’s web server off. A sender listed but no picture, on a computer with two graphics cards: the
				sender (Arena) and Pāua must draw on the same one. In Windows Settings › System › Display › Graphics, set both to High
				performance, then restart both. The log’s <span className="font-mono">[video] graphics</span> line says which cards Pāua
				sees.
			</Help>
			{window.life !== undefined && (
				<Row label="Picture">
					<span>
						<Button icon={RotateCw} onClick={() => window.life?.restartVideo()}>
							Restart video
						</Button>
					</span>
				</Row>
			)}
		</>
	)
}
