// The page in a pop-out window (../shared/popout.ts): one view, with a strip
// above it that the view cannot cover, holding its name, Reload and Back.
//
// The MA and the run order are native views main has moved into this window;
// this page only says where they go, exactly as the kiosk does
// (./panePlacement.ts), and what to say while they are not showing. Arena and
// the video feed are drawn here again, from main, as they are in a slot.
//
// Back closes the window, and closing it any way puts the view back in its
// slot (src/main/popout.ts). Nothing here changes the mode: the MA follows the
// kiosk's mode chip, wherever it is drawn.

import { useEffect, useState } from 'react'

import type { Channel } from '../shared/reading.js'
import type { ArenaStatus } from '../shared/arena.js'
import type { CuePaneReport } from '../shared/cue-pane.js'
import type { MaPaneReport } from '../shared/ma-pane.js'
import { VIEW_LABEL, type BuiltInView, type ViewId } from '../shared/layout.js'
import { embedIdOf, type EmbedReport } from '../shared/embeds.js'
import { EmbedMessage, ZoomControl } from './components/EmbedPane.js'
import { ArenaView } from './components/ArenaView.js'
import { ClipsView } from './components/ClipsView.js'
import { HoldingView } from './components/HoldingView.js'
import { VideoStrip, VideoView, type VideoSpace } from './components/VideoView.js'
import { currentFrame, type VideoFeedState } from '../shared/video-feed.js'
import { CueMessage } from './components/CuePane.js'
import { Centered, MaMessage } from './components/MaPane.js'
import { Button, IconButton, viewIcon } from './components/ui.js'
import { RotateCw, SendToBack, Undo2 } from 'lucide-react'
import { usePanePlacement } from './panePlacement.js'

/** What main last said, asked every `ms`. Undefined until it has answered. */
function usePolled<T>(ask: ((api: NonNullable<Window['life']>) => Promise<T>) | null, ms: number): T | undefined {
	const [value, setValue] = useState<T | undefined>(undefined)
	useEffect(() => {
		const api = window.life
		if (api === undefined || ask === null) return
		let alive = true
		const poll = () => void ask(api).then((v) => alive && setValue(v))
		poll()
		const id = setInterval(poll, ms)
		return () => {
			alive = false
			clearInterval(id)
		}
		// `ask` is chosen once per window, by its view, so it is not a dependency.
	}, [ms])
	return value
}

export function PopOut({ view }: { view: ViewId }) {
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(id)
	}, [])

	const ma = usePolled<MaPaneReport>(view === 'ma' ? (api) => api.maPane() : null, 1000)
	const cue = usePolled<CuePaneReport>(view === 'cue' ? (api) => api.cuePane() : null, 1000)
	const arena = usePolled<Channel<ArenaStatus> | null>(view === 'arena' || view === 'clips' || view === 'holding' ? (api) => api.arenaStatus() : null, 250)
	const video = usePolled<VideoFeedState | null>(view === 'video' ? (api) => api.videoFeed() : null, 500)
	const embedId = embedIdOf(view)
	const embed = usePolled<EmbedReport | undefined>(
		embedId === null ? null : (api) => api.embeds().then((all) => all.find((r) => r.id === embedId)),
		1000,
	)
	const label = embedId === null ? VIEW_LABEL[view as BuiltInView] : (embed?.name ?? 'Embed')
	const ViewIcon = viewIcon(view)
	/** The MA, the run order and embeds are native pages main moves in here. */
	const native = view === 'ma' || view === 'cue' || embedId !== null

	const [videoSpace, setVideoSpace] = useState<VideoSpace | null>(null)
	/** Fit: size this window to the picture's shape, and keep that shape while
	 *  it is dragged bigger or smaller (src/main/popout.ts). */
	const fitVideo = () => {
		const picture = video == null ? null : currentFrame(video)
		if (picture === null || videoSpace === null) return
		window.life?.fitPopout(view, { width: picture.width, height: picture.height }, { width: videoSpace.width, height: videoSpace.height })
	}

	const [box, setBox] = useState<HTMLElement | null>(null)
	usePanePlacement(box, !native, (rect) =>
		embedId !== null
			? window.life?.placeEmbed(embedId, rect)
			: view === 'ma'
				? window.life?.placeMaPane(rect)
				: window.life?.placeCuePane(rect),
	)

	useEffect(() => {
		document.title = `Pāua — ${label}`
	}, [label])

	const showing =
		embedId !== null
			? embed?.pane.state === 'showing'
			: view === 'ma'
				? ma?.pane.state === 'showing' || ma?.pane.state === 'connecting'
				: cue?.pane.state === 'showing'
	const retry = () =>
		embedId !== null ? window.life?.retryEmbed(embedId) : view === 'ma' ? window.life?.retryMaPane() : window.life?.retryCuePane()
	const reload =
		!native || !showing ? null : (
			<IconButton icon={RotateCw} size="sm" label={`Reload ${label}`} onClick={retry} />
		)

	return (
		<div className="flex h-full flex-col overflow-hidden bg-booth-panel">
			<div className="flex h-14 shrink-0 items-stretch gap-2 border-b border-booth-edge bg-booth-strip pr-2 pl-1">
				<h1 className="relative flex items-center gap-2 px-4 text-sm font-medium">
					<ViewIcon size={17} strokeWidth={1.8} aria-hidden />
					{label}
					<span aria-hidden className="nacre-line absolute inset-x-3 -bottom-px h-[3px] rounded-t-full" />
				</h1>
				<span className="ml-auto flex items-center gap-2">
				{view === 'video' && <VideoStrip feed={video} space={videoSpace} onFit={fitVideo} />}
				{embedId !== null && embed !== undefined && (
					<ZoomControl name={label} zoom={embed.zoom} onZoom={(by) => window.life?.zoomEmbed(embedId, by)} />
				)}
				{reload}
				{/* Behind the kiosk until its tab's Show (src/main/popout.ts). */}
				<Button size="sm" variant="ghost" icon={SendToBack} onClick={() => window.life?.sendPopoutBehind(view)}>
					Send behind
				</Button>
				{/* Big enough for a finger: the system's own close is not. */}
				<Button size="sm" icon={Undo2} onClick={() => window.life?.bringBack(view)}>
					Back to the dashboard
				</Button>
				</span>
			</div>
			<div ref={native ? setBox : undefined} className="flex min-h-0 min-w-0 flex-1 bg-booth-bg">
				{view === 'arena' ? (
					<ArenaView status={arena} now={now} />
				) : view === 'clips' ? (
					<ClipsView status={arena} now={now} />
				) : view === 'holding' ? (
					<HoldingView status={arena} now={now} />
				) : view === 'video' ? (
					<VideoView feed={video} now={now} onSpace={setVideoSpace} />
				) : (
					<Centered>
						{embedId !== null ? (
							<EmbedMessage name={label} pane={embed?.pane ?? null} now={now} onRetry={retry} />
						) : view === 'ma' ? (
							<MaMessage pane={ma?.pane ?? null} now={now} />
						) : (
							<CueMessage pane={cue?.pane ?? null} now={now} />
						)}
					</Centered>
				)}
			</div>
		</div>
	)
}
