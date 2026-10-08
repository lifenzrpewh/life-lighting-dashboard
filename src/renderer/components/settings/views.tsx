// The views a booth adds itself: web pages (../../../shared/embeds.ts), NDI
// sources (../../../shared/ndi.ts) and capture inputs (../../../shared/capture.ts).
// Each is added from a list in Settings and named, turned off or removed
// there. Admin only, as all of Settings is.

import { useEffect, useState } from 'react'
import { Cast, Plus, Trash2, Webcam } from 'lucide-react'

import { EMBEDS_MAX, embedNameError, embedUrlOf, newEmbedId, type Embed } from '../../../shared/embeds.js'
import { NDI_SOURCES_MAX, ndiNameError, ndiShortName, type NdiSource, type NdiState } from '../../../shared/ndi.js'
import { CAPTURE_INPUTS_MAX, captureNameError, captureShortName, type CaptureInput } from '../../../shared/capture.js'
import { useCameras } from '../../capture.js'

import { Field, Input } from '../form.js'
import { Button } from '../ui.js'
import { DetailHead, Editor, type Errors, type Save } from './parts.js'

/** An embed's name and address, and Remove. Removing forgets its sign-in, so
 *  it takes a second tap. */
export function EmbedEditor({ embed, all, save, onRemoved }: { embed: Embed; all: readonly Embed[]; save: Save; onRemoved: () => void }) {
	const [name, setName] = useState(embed.name)
	const [url, setUrl] = useState(embed.url)
	const [local, setLocal] = useState<Errors>({})
	const [removing, setRemoving] = useState(false)
	useEffect(() => {
		if (!removing) return
		const id = setTimeout(() => setRemoving(false), 4_000)
		return () => clearTimeout(id)
	}, [removing])
	return (
		<>
			<Editor
				save={async (patch) => {
					const errors = embedErrors(name, url)
					setLocal(errors)
					if (Object.keys(errors).length > 0) return {}
					return save(patch)
				}}
				patch={() => ({
					embeds: all.map((e) => (e.id === embed.id ? { ...e, name: name.trim(), url: embedUrlOf(url) ?? url } : e)),
				})}
				note="Its page loads the new address."
			>
				{(err) => (
					<EmbedFields name={name} url={url} onName={setName} onUrl={setUrl} errors={{ ...local, form: err('embeds') }} />
				)}
			</Editor>
			<div className="flex items-center gap-4 border-t border-booth-edge pt-5">
				<Button
					variant={removing ? 'danger' : 'quiet'}
					icon={Trash2}
					onClick={() => {
						if (!removing) return setRemoving(true)
						void save({ embeds: all.filter((e) => e.id !== embed.id) }).then((e) => e === null && onRemoved())
					}}
				>
					{removing ? 'Tap again to remove' : 'Remove this page'}
				</Button>
				<span className="text-sm text-booth-dim">Removing it also signs it out and forgets what it kept on this computer.</span>
			</div>
		</>
	)
}

export type EmbedErrors = { name?: string; url?: string; form?: string | undefined }

export function embedErrors(name: string, url: string): EmbedErrors {
	const out: EmbedErrors = {}
	const n = embedNameError(name.trim())
	if (n !== null) out.name = n
	if (embedUrlOf(url) === null) out.url = 'A web address, such as docs.google.com/spreadsheets/…'
	return out
}

export function EmbedFields(p: { name: string; url: string; onName: (v: string) => void; onUrl: (v: string) => void; errors: EmbedErrors }) {
	return (
		<>
			<div className="grid grid-cols-[1fr_2fr] gap-4">
				<Field label="Name" error={p.errors.name} hint="What its tab says.">
					<Input value={p.name} onChange={p.onName} placeholder="Run sheet" />
				</Field>
				<Field label="Web address" error={p.errors.url} hint="Copied from the browser's address bar.">
					<Input value={p.url} onChange={p.onUrl} placeholder="https://docs.google.com/spreadsheets/…" />
				</Field>
			</div>
			{p.errors.form !== undefined && <p className="text-sm text-state-unreachable">{p.errors.form}</p>}
		</>
	)
}

/** Add a web page as a view of its own (../../shared/embeds.ts). */
export function AddEmbed({ all, save }: { all: readonly Embed[]; save: Save }) {
	const [name, setName] = useState('')
	const [url, setUrl] = useState('')
	const [errors, setErrors] = useState<EmbedErrors>({})
	const [added, setAdded] = useState<string | null>(null)
	const full = all.length >= EMBEDS_MAX
	const add = async () => {
		const e = embedErrors(name, url)
		setErrors(e)
		setAdded(null)
		if (Object.keys(e).length > 0) return
		const embed: Embed = { id: newEmbedId(Date.now(), Math.random()), name: name.trim(), url: embedUrlOf(url)!, on: true }
		const result = await save({ embeds: [...all, embed] })
		if (result !== null) return setErrors({ form: result.embeds ?? result.form ?? 'Not added.' })
		setAdded(embed.name)
		setName('')
		setUrl('')
	}
	return (
		<section className="flex flex-col gap-5">
			<DetailHead title="Add a web page" />
			<p className="max-w-prose text-sm text-booth-dim">
				Any page, such as a Google Sheet, becomes a view of its own, with its own sign-in. Links that open a new window
				open in this computer's browser.
			</p>
			{full ? (
				<p className="text-sm text-booth-dim">That is {EMBEDS_MAX}, the most there can be. Remove one to add another.</p>
			) : (
				<>
					<EmbedFields name={name} url={url} onName={setName} onUrl={setUrl} errors={errors} />
					<div className="flex items-center gap-4">
						<Button variant="primary" icon={Plus} onClick={() => void add()}>
							Add
						</Button>
						{added !== null && (
							<span className="text-sm text-state-live">Added {added}. A window's pencil, then its +, puts it on screen.</span>
						)}
					</div>
				</>
			)}
		</section>
	)
}

/** What NDI finds on the network, asked while this is open. Asking starts NDI
 *  (src/main/ndi.ts), which is why nothing asks before a source is added. */
export function useNdi(): NdiState | null {
	const [ndi, setNdi] = useState<NdiState | null>(null)
	useEffect(() => {
		let alive = true
		const poll = () => void window.life?.ndi().then((v) => alive && setNdi(v))
		poll()
		const id = setInterval(poll, 1_000)
		return () => {
			alive = false
			clearInterval(id)
		}
	}, [])
	return ndi
}

/** NDI's trademark notice, which its licence asks for wherever NDI is used. */
export function NdiNotice() {
	return <p className="text-xs text-booth-dim">NDI® is a registered trademark of Vizrt NDI AB. ndi.video</p>
}

/** Add an NDI source as a view of its own (../../shared/ndi.ts): picked from
 *  what NDI finds on the network, never typed. */
export function AddNdi({ all, save }: { all: readonly NdiSource[]; save: Save }) {
	const ndi = useNdi()
	const [added, setAdded] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const full = all.length >= NDI_SOURCES_MAX
	const add = async (source: string) => {
		setAdded(null)
		setError(null)
		const name = ndiShortName(source)
		const entry: NdiSource = { id: newEmbedId(Date.now(), Math.random()), name, source, on: true }
		const result = await save({ ndiSources: [...all, entry] })
		if (result !== null) return setError(result.ndiSources ?? result.form ?? 'Not added.')
		setAdded(name)
	}
	const body = (() => {
		if (ndi === null || ndi.runtime === null) return <p className="text-sm text-booth-dim">Looking for NDI sources…</p>
		if (!ndi.runtime.ok) return <p className="text-sm text-state-unreachable">{ndi.runtime.detail}</p>
		if (ndi.found.length === 0) {
			return (
				<p className="text-sm text-booth-dim">
					No NDI sources on the network yet. Turn on NDI output in the program that sends it (in Arena, Output › Advanced
					Output, a screen sent to NDI); it appears here within a few seconds.
				</p>
			)
		}
		return (
			<ul className="flex flex-col gap-1.5">
				{ndi.found.map((source) => {
					const have = all.some((s) => s.source === source)
					return (
						<li key={source} className="flex min-h-14 items-center gap-4 rounded-xl bg-booth-raise px-4 py-2">
							<Cast size={18} className="shrink-0 text-booth-dim" aria-hidden />
							<span className="flex min-w-0 flex-1 flex-col leading-tight">
								<span className="truncate text-base">{ndiShortName(source)}</span>
								<span className="truncate font-mono text-xs text-booth-dim">{source}</span>
							</span>
							{have ? (
								<span className="text-sm text-booth-dim">Added</span>
							) : (
								<Button icon={Plus} disabled={full} onClick={() => void add(source)}>
									Add
								</Button>
							)}
						</li>
					)
				})}
			</ul>
		)
	})()
	return (
		<section className="flex flex-col gap-5">
			<h3 className="text-lg font-medium">Add an NDI source</h3>
			<p className="max-w-prose text-sm text-booth-dim">
				A camera, ProPresenter’s output, Arena’s or another computer’s screen: any NDI source on this network, for
				the Video view.
			</p>
			{full && <p className="text-sm text-booth-dim">That is {NDI_SOURCES_MAX}, the most there can be. Remove one to add another.</p>}
			{body}
			{added !== null && <span className="text-sm text-state-live">Added {added}. Any Video tab’s feed button offers it (a window’s pencil, then +, adds a Video tab).</span>}
			{error !== null && <p className="text-sm text-state-unreachable">{error}</p>}
			<NdiNotice />
		</section>
	)
}

/** An NDI source's name, and Remove. */
export function NdiEditor({ source, all, save, onRemoved }: { source: NdiSource; all: readonly NdiSource[]; save: Save; onRemoved: () => void }) {
	const [name, setName] = useState(source.name)
	const [local, setLocal] = useState<string | undefined>(undefined)
	const [removing, setRemoving] = useState(false)
	useEffect(() => {
		if (!removing) return
		const id = setTimeout(() => setRemoving(false), 4_000)
		return () => clearTimeout(id)
	}, [removing])
	return (
		<>
			<p className="text-sm text-booth-dim">
				<span className="font-mono text-booth-ink">{source.source}</span>, as NDI names it.
			</p>
			<Editor
				save={async (patch) => {
					const e = ndiNameError(name.trim())
					setLocal(e ?? undefined)
					if (e !== null) return {}
					return save(patch)
				}}
				patch={() => ({ ndiSources: all.map((s) => (s.id === source.id ? { ...s, name: name.trim() } : s)) })}
			>
				{(err) => (
					<Field label="Name" error={local ?? err('ndiSources')} hint="What its tab says.">
						<Input value={name} onChange={setName} placeholder={ndiShortName(source.source)} />
					</Field>
				)}
			</Editor>
			<div className="flex items-center gap-4 border-t border-booth-edge pt-5">
				<Button
					variant={removing ? 'danger' : 'quiet'}
					icon={Trash2}
					onClick={() => {
						if (!removing) return setRemoving(true)
						void save({ ndiSources: all.filter((s) => s.id !== source.id) }).then((e) => e === null && onRemoved())
					}}
				>
					{removing ? 'Tap again to remove' : 'Remove this source'}
				</Button>
				<span className="text-sm text-booth-dim">Its tabs leave the screen. It can be added again from the list.</span>
			</div>
			<NdiNotice />
		</>
	)
}

/** Add a capture input as a view of its own (../../shared/capture.ts):
 *  picked from the cameras this computer lists, never typed. */
export function AddCapture({ all, save }: { all: readonly CaptureInput[]; save: Save }) {
	const cameras = useCameras(true)
	const [added, setAdded] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const full = all.length >= CAPTURE_INPUTS_MAX
	const add = async (device: string) => {
		setAdded(null)
		setError(null)
		const name = captureShortName(device)
		const entry: CaptureInput = { id: newEmbedId(Date.now(), Math.random()), name, device, on: true }
		const result = await save({ captureInputs: [...all, entry] })
		if (result !== null) return setError(result.captureInputs ?? result.form ?? 'Not added.')
		setAdded(name)
	}
	return (
		<section className="flex flex-col gap-5">
			<h3 className="text-lg font-medium">Add a capture input</h3>
			<p className="max-w-prose text-sm text-booth-dim">
				Anything this computer sees as a camera, for the Video view: a Blackmagic card’s input (with Desktop Video
				installed), an ATEM Mini’s USB output, OBS’s Virtual Camera (Start Virtual Camera in OBS), or a webcam.
			</p>
			{full && <p className="text-sm text-booth-dim">That is {CAPTURE_INPUTS_MAX}, the most there can be. Remove one to add another.</p>}
			{cameras === null ? (
				<p className="text-sm text-booth-dim">Looking for cameras…</p>
			) : cameras.length === 0 ? (
				<p className="text-sm text-booth-dim">This computer lists no cameras.</p>
			) : (
				<ul className="flex flex-col gap-1.5">
					{cameras.map((device) => (
						<li key={device} className="flex min-h-14 items-center gap-4 rounded-xl bg-booth-raise px-4 py-2">
							<Webcam size={18} className="shrink-0 text-booth-dim" aria-hidden />
							<span className="flex min-w-0 flex-1 flex-col leading-tight">
								<span className="truncate text-base">{captureShortName(device)}</span>
								<span className="truncate font-mono text-xs text-booth-dim">{device}</span>
							</span>
							{all.some((c) => c.device === device) ? (
								<span className="text-sm text-booth-dim">Added</span>
							) : (
								<Button icon={Plus} disabled={full} onClick={() => void add(device)}>
									Add
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
			{added !== null && <span className="text-sm text-state-live">Added {added}. Any Video tab’s feed button offers it (a window’s pencil, then +, adds a Video tab).</span>}
			{error !== null && <p className="text-sm text-state-unreachable">{error}</p>}
		</section>
	)
}

/** A capture input's name, and Remove. */
export function CaptureEditor({ input, all, save, onRemoved }: { input: CaptureInput; all: readonly CaptureInput[]; save: Save; onRemoved: () => void }) {
	const [name, setName] = useState(input.name)
	const [local, setLocal] = useState<string | undefined>(undefined)
	const [removing, setRemoving] = useState(false)
	useEffect(() => {
		if (!removing) return
		const id = setTimeout(() => setRemoving(false), 4_000)
		return () => clearTimeout(id)
	}, [removing])
	return (
		<>
			<p className="text-sm text-booth-dim">
				<span className="font-mono text-booth-ink">{input.device}</span>, as this computer names it. A card input shows a
				picture once its signal matches the format set in Desktop Video Setup.
			</p>
			<Editor
				save={async (patch) => {
					const e = captureNameError(name.trim())
					setLocal(e ?? undefined)
					if (e !== null) return {}
					return save(patch)
				}}
				patch={() => ({ captureInputs: all.map((c) => (c.id === input.id ? { ...c, name: name.trim() } : c)) })}
			>
				{(err) => (
					<Field label="Name" error={local ?? err('captureInputs')} hint="What its tab says.">
						<Input value={name} onChange={setName} placeholder={captureShortName(input.device)} />
					</Field>
				)}
			</Editor>
			<div className="flex items-center gap-4 border-t border-booth-edge pt-5">
				<Button
					variant={removing ? 'danger' : 'quiet'}
					icon={Trash2}
					onClick={() => {
						if (!removing) return setRemoving(true)
						void save({ captureInputs: all.filter((c) => c.id !== input.id) }).then((e) => e === null && onRemoved())
					}}
				>
					{removing ? 'Tap again to remove' : 'Remove this input'}
				</Button>
				<span className="text-sm text-booth-dim">Its tabs leave the screen. It can be added again from the list.</span>
			</div>
		</>
	)
}
