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
import { VIEW_LABEL, type ViewId } from '../shared/layout.js'
import { ArenaView } from './components/ArenaView.js'
import { VideoStrip, VideoView, type VideoSpace } from './components/VideoView.js'
import type { VideoFeedState } from '../shared/video-feed.js'
import { CueMessage } from './components/CuePane.js'
import { MaMessage } from './components/MaPane.js'
import { Centered } from './components/Slot.js'
import { barButton } from './components/vocabulary.js'
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
	const arena = usePolled<Channel<ArenaStatus> | null>(view === 'arena' ? (api) => api.arenaStatus() : null, 250)
	const video = usePolled<VideoFeedState | null>(view === 'video' ? (api) => api.videoFeed() : null, 500)
	/** The MA and the run order are native pages main moves in here. */
	const native = view === 'ma' || view === 'cue'

	const [videoSpace, setVideoSpace] = useState<VideoSpace | null>(null)
	/** Fit: size this window to the picture's shape, and keep that shape while
	 *  it is dragged bigger or smaller (src/main/popout.ts). */
	const fitVideo = () => {
		const picture = video?.lastFrame
		if (picture == null || videoSpace === null) return
		window.life?.fitPopout(view, { width: picture.width, height: picture.height }, { width: videoSpace.width, height: videoSpace.height })
	}

	const [box, setBox] = useState<HTMLElement | null>(null)
	usePanePlacement(box, !native, (rect) =>
		view === 'ma' ? window.life?.placeMaPane(rect) : window.life?.placeCuePane(rect),
	)

	useEffect(() => {
		document.title = `LIFE — ${VIEW_LABEL[view]}`
	}, [view])

	const showing = view === 'ma' ? ma?.pane.state === 'showing' || ma?.pane.state === 'connecting' : cue?.pane.state === 'showing'
	const reload =
		!native || !showing ? null : (
			<button
				type="button"
				onClick={() => (view === 'ma' ? window.life?.retryMaPane() : window.life?.retryCuePane())}
				className={`${barButton} h-9`}
				aria-label={view === 'ma' ? 'Reload the MA' : 'Reload the run order'}
			>
				↻
			</button>
		)

	return (
		<div className="flex h-full flex-col overflow-hidden bg-booth-panel">
			<div className="flex h-14 shrink-0 items-center gap-2 border-b border-booth-edge px-2">
				<h1 className="px-2 text-[10px] font-semibold tracking-widest text-booth-dim uppercase">{VIEW_LABEL[view]}</h1>
				<span className="ml-auto" />
				{view === 'video' && <VideoStrip feed={video} space={videoSpace} onFit={fitVideo} />}
				{reload}
				{/* Big enough for a finger: the system's own close is not. */}
				<button
					type="button"
					onClick={() => window.life?.bringBack(view)}
					className="h-11 rounded-md border border-booth-edge px-5 text-sm active:scale-[0.98] active:bg-booth-edge"
				>
					Back to the dashboard
				</button>
			</div>
			<div ref={native ? setBox : undefined} className="flex min-h-0 min-w-0 flex-1 bg-booth-bg">
				{view === 'arena' ? (
					<ArenaView status={arena} now={now} />
				) : view === 'video' ? (
					<VideoView feed={video} now={now} onSpace={setVideoSpace} />
				) : (
					<Centered>
						{view === 'ma' ? <MaMessage pane={ma?.pane ?? null} now={now} /> : <CueMessage pane={cue?.pane ?? null} now={now} />}
					</Centered>
				)}
			</div>
		</div>
	)
}
