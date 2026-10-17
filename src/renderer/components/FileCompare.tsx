// Same code, different file (the owner, 2026-10-13: "give me some good ways to
// navigate same code but different filename, I think that's causing some
// problems"), for the Lookbook view's Compare (./LookbookView.tsx):
// - Side by side: Arena's picture and file beside the lookbook's, each with its
//   name, size and date, and the side a version says is newer marked.
// - Versions read from the names (`-v4`, `WalkInV2`): "Arena has v4; the
//   lookbook has v5, newer" (../../shared/media-check.ts `fileVerdict`).
// - The drive's files for the code: every one carrying it, which is the
//   lookbook's (by size), which is a copy, and which Fetch would take; Admin may
//   load another.
//
// Every load asks first, as everywhere (./MediaCheck.tsx Confirm). Files to
// check, every such code on one screen, left with the Holding view
// (2026-10-14): a Lookbook card that needs a look says so, and "need you" shows
// only those.

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Hand, Replace } from 'lucide-react'

import { thumbnailUrl, type ArenaSlot, type ArenaStatus } from '../../shared/arena.js'
import { clipsToUpdate, codesOn, slotCode, slotMark, type SlotMark } from '../../shared/holding.js'
import { fileVerdict, lookbookStem, lookbookThumbUrl, uploadedAt } from '../../shared/media-check.js'
import type { DriveMatches, FetchRequest } from '../../shared/media-fetch.js'
import type { MediaCheckState } from '../useMediaCheck.js'
import { FetchWords, SmallButton, fileName, under, updateStep } from './MediaCheck.js'

export const needsLook = (mark: SlotMark | null) => mark === 'may-differ' || mark === 'different' || mark === 'missing'

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`
const when = (ms: number) =>
	new Date(ms).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** One clip of a code against the lookbook's file, and what an operator may
 *  do about it. */
export function FileCompare({
	m,
	status,
	slot,
	operator,
}: {
	m: MediaCheckState
	status: ArenaStatus
	slot: ArenaSlot
	operator: boolean
}) {
	const items = m.runSheet ?? []
	const mark = slotMark(slot, items, codesOn(items), m.same, m.sizes)
	const code = slotCode(slot)
	const file = code === null ? null : (items.map((i) => i.files[code]).find((f) => f !== undefined) ?? null)
	const want = file === null ? null : lookbookStem(file)
	const fetch = code === null ? undefined : m.fetches[code]
	const arenaFile = slot.file ?? slot.missingFile
	const verdict = arenaFile === null || file === null || mark === 'today' ? null : fileVerdict(arenaFile, file, m.sizes)
	const arenaSize = slot.file === null ? undefined : m.sizes?.arena[slot.file]
	const arenaTime = slot.file === null ? undefined : m.sizes?.arenaTimes?.[slot.file]
	const lookbookSize = file === null ? undefined : m.sizes?.lookbook[file]
	const uploaded = file === null ? null : uploadedAt(file)
	const answers = operator && code !== null && want !== null && file !== null && arenaFile !== null && (needsLook(mark) || mark === 'confirmed')
	const request = (extra: Partial<FetchRequest> = {}): FetchRequest | null =>
		code === null || want === null || file === null
			? null
			: { code, want, clipIds: clipsToUpdate(code, want, file, status, m.same, m.sizes, m.map), lookbookPath: file, allowLookbook: false, allowLive: [], ...extra }
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap gap-4">
				<Side
					title="Arena"
					url={slot.thumbnail === null ? null : thumbnailUrl(slot.thumbnail)}
					name={arenaFile === null ? slot.name : fileName(arenaFile)}
					facts={[
						slot.missingFile !== null ? 'missing on this computer' : arenaSize === undefined ? null : megabytes(arenaSize),
						arenaTime === undefined ? null : `saved ${when(arenaTime)}`,
					]}
					newer={verdict?.newer === 'arena'}
				/>
				{file !== null && want !== null && mark !== 'today' && (
					<Side
						title="Lookbook"
						url={lookbookThumbUrl(file)}
						name={want}
						facts={[lookbookSize === undefined ? null : megabytes(lookbookSize), uploaded === null ? null : `uploaded ${when(uploaded)}`]}
						newer={verdict?.newer === 'lookbook'}
					/>
				)}
			</div>
			{verdict !== null && (
				<p className={`text-sm ${needsLook(mark) ? 'text-warn' : 'text-booth-dim'}`}>
					{slot.missingFile !== null && 'Arena cannot find its file on this computer; '}
					{verdict.words}
				</p>
			)}
			{answers && (
				<div className="flex flex-wrap items-center gap-2">
					{!under(fetch) && mark !== 'confirmed' && (
						<SmallButton
							onClick={() => {
								const req = request()
								if (req !== null) m.ask('Use the lookbook’s', [updateStep(req, status)])
							}}
						>
							Use the lookbook&rsquo;s
						</SmallButton>
					)}
					{!under(fetch) && mark === 'confirmed' && (
						<SmallButton
							onClick={() => {
								// Either kind of mark: both are undone.
								m.markSame({ code, file: arenaFile, want, same: false })
								m.markSame({ code, file: arenaFile, want, same: false, there: true })
							}}
						>
							Undo
						</SmallButton>
					)}
					{!under(fetch) && mark !== 'confirmed' && mark !== 'missing' && (
						<SmallButton onClick={() => m.markSame({ code, file: arenaFile, want, same: true })}>Arena&rsquo;s is right</SmallButton>
					)}
					{!under(fetch) && mark === 'missing' && <ThereButton onClick={() => m.itsThere(code)} />}
					{fetch?.state === 'failed' && fetch.clash === true && <ReplaceButton onClick={() => m.replaceLocal(code)} />}
					<FetchWords fetch={fetch} refused={m.refused[code]} />
				</div>
			)}
			{code !== null && (
				<DriveFiles
					code={code}
					lookbookPath={file}
					arenaFile={arenaFile}
					onLoad={
						operator && !under(fetch)
							? (path) => {
									const req = request({ drivePick: path })
									if (req !== null) m.ask(`Load ${fileName(path)} from the drive`, [updateStep(req, status)])
								}
							: null
					}
				/>
			)}
		</div>
	)
}

function Side({ title, url, name, facts, newer }: { title: string; url: string | null; name: string; facts: (string | null)[]; newer: boolean }) {
	const shown = facts.filter((f): f is string => f !== null)
	return (
		<figure className="flex flex-col gap-1">
			<Picture url={url} large />
			<figcaption className="flex max-w-64 flex-col text-xs">
				<span className="flex items-center gap-1.5">
					<span className="font-medium">{title}</span>
					{newer && <span className="rounded bg-accent/30 px-1 text-[11px]">newer</span>}
				</span>
				<span className="truncate text-booth-dim" title={name}>
					{name}
				</span>
				{shown.length > 0 && <span className="text-booth-dim">{shown.join(' · ')}</span>}
			</figcaption>
		</figure>
	)
}

/** The graphics drive's files for a code, read when opened: which is the
 *  lookbook's (by size), which a copy, which Fetch would take. */
function DriveFiles({
	code,
	lookbookPath,
	arenaFile,
	onLoad,
}: {
	code: string
	lookbookPath: string | null
	arenaFile: string | null
	onLoad: ((path: string) => void) | null
}) {
	const [open, setOpen] = useState(false)
	const [read, setRead] = useState<DriveMatches | null>(null)
	useEffect(() => {
		if (!open) return
		let alive = true
		setRead(null)
		void window.life?.mediaDrive(code, lookbookPath).then((r) => alive && setRead(r))
		return () => {
			alive = false
		}
	}, [open, code, lookbookPath])
	const inArena = arenaFile === null ? null : fileName(arenaFile).toLowerCase()
	return (
		<div className="text-xs">
			<button type="button" onClick={() => setOpen(!open)} className="flex h-8 items-center gap-1 rounded-ctl px-1 text-booth-dim hover:text-booth-ink">
				{open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
				{code} on the graphics drive
			</button>
			{open &&
				(read === null ? (
					<p className="px-1 text-booth-dim">Looking on the drive…</p>
				) : !read.ok ? (
					<p className="px-1 text-warn">{read.detail}</p>
				) : read.files.length === 0 ? (
					<p className="px-1 text-booth-dim">No file on the drive carries {code}.</p>
				) : (
					<ul className="flex flex-col gap-1 px-1">
						{read.files.map((f) => {
							const name = fileName(f.path)
							return (
								<li key={f.path} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-ctl bg-booth-raise px-2 py-1.5">
									<span className="min-w-0 flex-1 truncate" title={f.path}>
										{name}
									</span>
									<span className="text-booth-dim tabular-nums">
										{megabytes(f.size)} · {when(f.mtimeMs)}
									</span>
									{f.matches && <Tag tone="good">the lookbook&rsquo;s file</Tag>}
									{!f.matches && f.named && <Tag tone="plain">the lookbook&rsquo;s name</Tag>}
									{f.copy && <Tag tone="plain">a copy</Tag>}
									{f.chosen && <Tag tone="plain">Fetch uses this</Tag>}
									{inArena === name.toLowerCase() && <Tag tone="plain">the name Arena has</Tag>}
									{onLoad !== null && (
										<button type="button" onClick={() => onLoad(f.path)} className="h-7 rounded-ctl px-2 font-medium hover:bg-booth-hover">
											Load this one
										</button>
									)}
								</li>
							)
						})}
						{read.lookbookSize === null && <li className="text-booth-dim">The lookbook did not say its file&rsquo;s size, so its name is matched instead.</li>}
						{read.lookbookSize !== null && !read.files.some((f) => f.matches) && (
							<li className="text-warn">
								{read.files.some((f) => f.chosen)
									? 'None is the lookbook’s size: Fetch uses the one of the lookbook’s name.'
									: 'None is the lookbook’s file (by size or name): Fetch would download the lookbook’s own, if you say yes.'}
							</li>
						)}
					</ul>
				))}
		</div>
	)
}

function Tag({ tone, children }: { tone: 'good' | 'plain'; children: React.ReactNode }) {
	return <span className={`rounded px-1.5 text-[11px] ${tone === 'good' ? 'bg-state-live/20 text-state-live' : 'bg-booth-edge/60 text-booth-dim'}`}>{children}</span>
}

export function Picture({ url, large = false, fill = false }: { url: string | null; large?: boolean; fill?: boolean }) {
	const [failed, setFailed] = useState<string | null>(null)
	const size = fill ? 'absolute inset-0 size-full' : large ? 'h-36 w-64' : 'h-12 w-20'
	if (url === null || failed === url) return <span className={`${size} shrink-0 rounded-ctl bg-booth-raise`} />
	return <img src={url} alt="" draggable={false} onError={() => setFailed(url)} className={`${size} shrink-0 rounded-ctl bg-booth-raise ${fill ? 'object-cover' : 'object-contain'}`} />
}

/** Replace the local file (the owner, 2026-10-18: an override when "a
 *  different file is already in the local folder"): a second tap to be sure,
 *  since every clip with that file plays the new one. The old one is kept in
 *  the local folder's Replaced folder. */
export function ReplaceButton({ onClick }: { onClick: () => void }) {
	const [sure, setSure] = useState(false)
	useEffect(() => {
		if (!sure) return
		const t = setTimeout(() => setSure(false), 4000)
		return () => clearTimeout(t)
	}, [sure])
	return (
		<button
			type="button"
			onClick={() => (sure ? onClick() : setSure(true))}
			title="The local one is moved to Replaced in the local folder, and the right one copied in its place"
			className={`flex h-8 shrink-0 items-center gap-1.5 rounded-ctl px-2.5 text-xs font-medium ${sure ? 'bg-overtime/20 text-overtime ring-1 ring-overtime/60 ring-inset' : 'bg-warn/15 text-warn hover:bg-warn/25'}`}
		>
			<Replace size={13} aria-hidden />
			{sure ? 'Tap again to replace' : 'Replace the local file'}
		</button>
	)
}

/** "It's there" (the owner, 2026-10-13): Pāua's reading set aside on an
 *  operator's word, kept until a new file turns up, and shown in orange. */
export function ThereButton({ onClick }: { onClick: () => void }) {
	return (
		<button type="button" onClick={onClick} className="flex h-8 shrink-0 items-center gap-1.5 rounded-ctl bg-warn/15 px-2.5 text-xs font-medium text-warn hover:bg-warn/25">
			<Hand size={13} aria-hidden />
			It&rsquo;s there
		</button>
	)
}
