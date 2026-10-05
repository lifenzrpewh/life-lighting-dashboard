// NDI's half of the NDI views (../shared/ndi.ts), in a process of its own
// (Electron's utilityProcess, started by ./ndi.ts).
//
// WHY THIS SHAPE: NDI's runtime (Processing.NDI.Lib.x64.dll, installed on this
// box with ProPresenter's NDI 5 Runtime) is called through koffi, a prebuilt
// FFI, so there is no addon to compile and no build tools needed on a booth
// box. NDI hands frames over on the CPU, so each one is copied to a page; that
// happens here, never in the kiosk's main process, whose stalls are the video
// feed's lesson. Frames go to each page over a MessagePort of its own, without
// passing through main.
//
// THE RULES THIS FILE ENFORCES:
// - Every frame taken from NDI is given back (`NDIlib_recv_free_video_v2`),
//   including the ones dropped.
// - Every frame is taken as NDI has it (waited for on koffi's thread), and
//   one not due is given straight back, so a slow page sees a late picture,
//   never a backlog.
// - At most two frames in flight per page: another goes when the page says it
//   drew one (or a second later, so a page that missed one recovers).
// - Nothing is received for a source no page shows. The finder alone runs.
// - A frame is thinned to the space it is drawn in (`ndiStep`) before it is
//   copied: Arena's composition is 5800×2036, 47 MB a frame.
//
// ✅ Spiked on the Windows box, 2026-10-05, against Arena 7.28's NDI output of
// its composition (`2413-RUAP (Arena - Composition)`, 5800×2036 BGRA, 50/1):
// 48 fps received at about 5% of one core, the proxy stream 640×224 at 50.

import type { MessagePortMain } from 'electron'
import koffi from 'koffi'
import fs from 'node:fs'
import path from 'node:path'

import { ndiStep, type NdiState } from '../shared/ndi.js'
import type { Size } from '../shared/video-feed.js'

/** At most this often a frame is sent to a page: a screen's rate, as the
 *  video feed's ring build (the owner wanted fades smooth). A page slower
 *  than its source gets fewer, by IN_FLIGHT below. ✅ 2026-10-05: at 30, a
 *  source at 43 fps had every other frame skipped as not yet due (frames 23 ms
 *  apart against 33), so 21 fps reached the page while it sat 28% busy. */
const MAX_FPS = 60
/** How long a capture waits for a frame before asking again, and how often
 *  the finder's list is read. */
const CAPTURE_WAIT_MS = 200
const FIND_MS = 1_000
/** A page that has not said it drew a frame in this long is sent another. */
const ACK_TIMEOUT_MS = 1_000
/** Frames a page may have on their way at once: two, so the next is copied
 *  and sent while the page draws the last, and never a queue. */
const IN_FLIGHT = 2
/** How often a source being shown says what it costs, in the log. */
const COST_LOG_MS = 30_000

type ParentPort = { on(event: 'message', fn: (e: { data: unknown; ports: MessagePortMain[] }) => void): void; postMessage(m: unknown): void }
const parent = (process as unknown as { parentPort: ParentPort }).parentPort

const log = (line: string) => parent.postMessage({ type: 'log', line })

/** Where NDI's runtime may be. The installers set NDI_RUNTIME_DIR_V<n>; the
 *  folders are the installers' own defaults, for a process started without
 *  that variable. ⚠️ The macOS paths are the SDK's and NDI Tools' documented
 *  ones, not yet tried. */
function runtimeCandidates(): string[] {
	if (process.platform === 'win32') {
		const lib = 'Processing.NDI.Lib.x64.dll'
		const env = ['NDI_RUNTIME_DIR_V6', 'NDI_RUNTIME_DIR_V5'].map((k) => process.env[k]).filter((d): d is string => typeof d === 'string' && d !== '')
		const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files'
		return [...env, path.join(pf, 'NDI', 'NDI 6 Runtime', 'v6'), path.join(pf, 'NDI', 'NDI 5 Runtime', 'v5')].map((d) => path.join(d, lib))
	}
	if (process.platform === 'darwin') {
		return ['/usr/local/lib/libndi.dylib', '/Library/NDI SDK for Apple/lib/macOS/libndi.dylib', '/Library/NDI/lib/libndi.dylib']
	}
	return ['/usr/lib/libndi.so', '/usr/local/lib/libndi.so']
}

const FOURCC_BGRA = 0x41524742
const FOURCC_BGRX = 0x58524742
const FRAME_VIDEO = 1
const FRAME_ERROR = 4
const COLOR_BGRX_BGRA = 0
const BANDWIDTH_HIGHEST = 100

function bind(file: string) {
	const lib = koffi.load(file)
	const Source = koffi.struct('NDIlib_source_t', { p_ndi_name: 'const char *', p_url_address: 'const char *' })
	koffi.struct('NDIlib_find_create_t', { show_local_sources: 'bool', p_groups: 'const char *', p_extra_ips: 'const char *' })
	koffi.struct('NDIlib_recv_create_v3_t', {
		source_to_connect_to: Source,
		color_format: 'int',
		bandwidth: 'int',
		allow_video_fields: 'bool',
		p_ndi_recv_name: 'const char *',
	})
	koffi.struct('NDIlib_video_frame_v2_t', {
		xres: 'int',
		yres: 'int',
		FourCC: 'uint32_t',
		frame_rate_N: 'int',
		frame_rate_D: 'int',
		picture_aspect_ratio: 'float',
		frame_format_type: 'int',
		timecode: 'int64_t',
		p_data: 'void *',
		line_stride_in_bytes: 'int',
		p_metadata: 'const char *',
		timestamp: 'int64_t',
	})
	return {
		Source,
		initialize: lib.func('bool NDIlib_initialize()'),
		version: lib.func('const char *NDIlib_version()'),
		findCreate: lib.func('void *NDIlib_find_create_v2(const NDIlib_find_create_t *)'),
		findWait: lib.func('bool NDIlib_find_wait_for_sources(void *, uint32_t)'),
		findGet: lib.func('const NDIlib_source_t *NDIlib_find_get_current_sources(void *, _Out_ uint32_t *)'),
		recvCreate: lib.func('void *NDIlib_recv_create_v3(const NDIlib_recv_create_v3_t *)'),
		recvCapture: lib.func('int NDIlib_recv_capture_v2(void *, _Out_ NDIlib_video_frame_v2_t *, void *, void *, uint32_t)'),
		recvFree: lib.func('void NDIlib_recv_free_video_v2(void *, const NDIlib_video_frame_v2_t *)'),
		recvDestroy: lib.func('void NDIlib_recv_destroy(void *)'),
	}
}

type Ndi = ReturnType<typeof bind>
type VideoFrame = {
	xres: number
	yres: number
	FourCC: number
	p_data: unknown
	line_stride_in_bytes: number
}

/** A page showing a source, over its own port: frames sent and not yet
 *  drawn, and when the last went. */
type Watcher = { id: string; port: MessagePortMain; space: Size | null; inFlight: number; sentAt: number }

type Receiver = {
	source: string
	native: unknown
	lastFrame: NdiState['feeds'][number]['lastFrame']
	lastSentAt: number
	counted: { second: number; frames: number; fps: number }
	failure: string | null
	/** Said once in the log, not on every frame. */
	saidSize: string
	/** Since the last line in the log: frames sent and the time copying them. */
	copies: { frames: number; ms: number; since: number; came: number; early: number; busy: number }
	/** A capture is waiting on NDI's thread: the receiver cannot be destroyed
	 *  under it, so a receiver let go then is destroyed when it returns. */
	capturing: boolean
	stopping: boolean
}

let ndi: Ndi | null = null
let runtime: NdiState['runtime'] = null
let finder: unknown = null
let found: string[] = []
/** The added sources that are on, by id. */
let sources = new Map<string, string>()
const watchers = new Map<string, Watcher>()
const receivers = new Map<string, Receiver>()

function start(): void {
	const tried = runtimeCandidates()
	const file = tried.find((f) => fs.existsSync(f))
	if (file === undefined) {
		runtime = { ok: false, detail: 'NDI is not installed on this computer (NDI Tools or the NDI Runtime, from ndi.video).' }
		log(`no NDI runtime; looked for ${tried.join(', ')}`)
		return
	}
	try {
		ndi = bind(file)
		if (!ndi.initialize()) {
			runtime = { ok: false, detail: 'NDI would not start on this computer (its processor is not supported).' }
			ndi = null
			return
		}
		runtime = { ok: true, version: String(ndi.version()) }
		finder = ndi.findCreate({ show_local_sources: true, p_groups: null, p_extra_ips: null })
		log(`NDI runtime ${runtime.version} from ${file}`)
	} catch (e) {
		runtime = { ok: false, detail: `NDI's runtime did not load: ${(e as Error).message}` }
		ndi = null
		log(runtime.detail)
	}
}

function find(): void {
	if (ndi === null || finder === null) return
	try {
		ndi.findWait(finder, 0)
		const n = [0]
		const ptr = ndi.findGet(finder, n)
		const count = n[0] ?? 0
		const list = count === 0 || ptr === null ? [] : (koffi.decode(ptr, ndi.Source, count) as Array<{ p_ndi_name: string }> | { p_ndi_name: string })
		const names = (Array.isArray(list) ? list : [list]).map((s) => s.p_ndi_name).sort((a, b) => a.localeCompare(b))
		if (names.join('\n') !== found.join('\n')) log(`found ${names.length === 0 ? 'no sources' : names.map((s) => `"${s}"`).join(', ')}`)
		found = names
	} catch (e) {
		log(`listing sources failed: ${(e as Error).message}`)
	}
}

/** Hold a receiver for each source a page shows, and only those. */
function sync(): void {
	const wanted = new Set([...watchers.values()].map((w) => w.id).filter((id) => sources.has(id)))
	for (const [id, r] of receivers) {
		if (wanted.has(id) && sources.get(id) === r.source) continue
		receivers.delete(id)
		r.stopping = true
		if (!r.capturing) ndi?.recvDestroy(r.native)
		log(`stopped receiving "${r.source}"`)
	}
	if (ndi === null) return
	for (const id of wanted) {
		if (receivers.has(id)) continue
		const source = sources.get(id)!
		try {
			// By name: NDI finds it, and connects whenever it is on the network.
			const native = ndi.recvCreate({
				source_to_connect_to: { p_ndi_name: source, p_url_address: null },
				color_format: COLOR_BGRX_BGRA,
				bandwidth: BANDWIDTH_HIGHEST,
				allow_video_fields: false,
				p_ndi_recv_name: 'Paua',
			})
			if (native === null) throw new Error('NDI gave no receiver')
			const r: Receiver = {
				source,
				native,
				lastFrame: null,
				lastSentAt: 0,
				counted: { second: 0, frames: 0, fps: 0 },
				failure: null,
				saidSize: '',
				copies: { frames: 0, ms: 0, since: performance.now(), came: 0, early: 0, busy: 0 },
				capturing: false,
				stopping: false,
			}
			receivers.set(id, r)
			log(`receiving "${source}"`)
			capture(id, r)
		} catch (e) {
			log(`could not receive "${source}": ${(e as Error).message}`)
		}
	}
}

/** Wait for `r`'s next frame on koffi's own thread, so this process's event
 *  loop stays free, then handle it and wait again. ✅ 2026-10-05: polling
 *  every 5 ms with no wait held the view near 20 fps, because Windows runs a
 *  timer about every 15.6 ms and a frame landing between two waited for the
 *  next; waiting on NDI took 47 fps from Arena's 50 in plain Node. Every frame
 *  is taken as it comes, so none queue; those not due are given straight back. */
function capture(id: string, r: Receiver): void {
	if (ndi === null) return
	const lib = ndi
	const v = {} as VideoFrame
	r.capturing = true
	lib.recvCapture.async(r.native, v, null, null, CAPTURE_WAIT_MS, (err: unknown, type: number) => {
		r.capturing = false
		if (r.stopping) {
			if (err == null && type === FRAME_VIDEO) lib.recvFree(r.native, v)
			lib.recvDestroy(r.native)
			return
		}
		if (err != null) {
			r.failure = `NDI: ${(err as Error).message ?? String(err)}`
			setTimeout(() => capture(id, r), CAPTURE_WAIT_MS)
			return
		}
		if (type === FRAME_ERROR) r.failure = 'The source has gone.'
		if (type === FRAME_VIDEO) {
			try {
				handle(id, r, v)
			} catch (e) {
				r.failure = `a frame failed: ${(e as Error).message}`
			} finally {
				lib.recvFree(r.native, v)
			}
		}
		setImmediate(() => capture(id, r))
	})
}

/** `memcpy` from the C runtime: the copy out of NDI's memory into memory JS
 *  owns. ❌ 2026-10-05: `koffi.view`, which the spike used in plain Node,
 *  kills the process inside Electron ("FATAL ERROR: Error::New
 *  napi_get_last_error_info"), because Electron's V8 refuses an ArrayBuffer
 *  over memory it did not allocate. A typed array passed to koffi is passed
 *  as the pointer to its own bytes, so this copies straight into it. */
const memcpy = (() => {
	const crt = process.platform === 'win32' ? 'ucrtbase.dll' : process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6'
	return koffi.load(crt).func('void *memcpy(uint8_t *dst, uintptr_t src, size_t n)')
})()

/** `frame` thinned by `step`, copied out of NDI's memory: only the rows kept
 *  are copied, then every `step`th pixel of each. */
function thin(frame: VideoFrame, step: number): { data: Uint8Array; width: number; height: number } {
	const { xres, yres, line_stride_in_bytes: stride } = frame
	const base = BigInt(koffi.address(frame.p_data))
	if (step === 1) {
		const out = new Uint8Array(xres * 4 * yres)
		if (stride === xres * 4) memcpy(out, base, out.length)
		else for (let y = 0; y < yres; y++) memcpy(out.subarray(y * xres * 4), base + BigInt(y * stride), xres * 4)
		return { data: out, width: xres, height: yres }
	}
	const width = Math.floor(xres / step)
	const height = Math.floor(yres / step)
	const row = new Uint8Array(xres * 4)
	const row32 = new Uint32Array(row.buffer)
	const out = new Uint32Array(width * height)
	for (let y = 0; y < height; y++) {
		memcpy(row, base + BigInt(y * step * stride), xres * 4)
		const to = y * width
		for (let x = 0; x < width; x++) out[to + x] = row32[x * step]!
	}
	return { data: new Uint8Array(out.buffer), width, height }
}

/** A frame from `r`: thinned, copied and sent to each page ready for one, if
 *  one is due. The caller gives it back to NDI. */
function handle(id: string, r: Receiver, frame: VideoFrame): void {
	const now = performance.now()
	const ready = [...watchers.values()].filter(
		(w) => w.id === id && (w.inFlight < IN_FLIGHT || now - w.sentAt > ACK_TIMEOUT_MS),
	)
	// A little early still counts: frames come at the source's rate, and
	// a 50 fps source's every other frame is 40 ms apart, not 33.
	r.copies.came += 1
	if (ready.length === 0) {
		r.copies.busy += 1
		return
	}
	if (now - r.lastSentAt < 1000 / MAX_FPS - 5) {
		r.copies.early += 1
		return
	}
	if (frame.FourCC !== FOURCC_BGRA && frame.FourCC !== FOURCC_BGRX) {
		r.failure = 'The source sends a picture format this view cannot show yet.'
		return
	}
	if (frame.line_stride_in_bytes % 4 !== 0 || frame.xres <= 0 || frame.yres <= 0) return
	const full = { width: frame.xres, height: frame.yres }
	// The largest space any page gives it: one frame serves them all.
	const spaces = ready.map((w) => w.space).filter((s): s is Size => s !== null)
	const space = spaces.length === 0 ? null : spaces.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b))
	const step = ndiStep(full, space)
	const copyStart = performance.now()
	const { data, width, height } = thin(frame, step)
	r.copies.frames += 1
	r.copies.ms += performance.now() - copyStart
	// Every 30 s it is shown, what it costs: where a slow picture is slow.
	if (now - r.copies.since >= COST_LOG_MS) {
		const c = r.copies
		log(`"${r.source}": ${(c.frames / ((now - c.since) / 1000)).toFixed(1)} fps sent at ${width}×${height}, copying ${(c.ms / c.frames).toFixed(1)} ms a frame; of ${c.came} from NDI, ${c.early} not due, ${c.busy} while the page drew`)
		r.copies = { frames: 0, ms: 0, since: now, came: 0, early: 0, busy: 0 }
	}
	const size = `${full.width}×${full.height}, sent ${width}×${height}`
	if (size !== r.saidSize) {
		r.saidSize = size
		log(`"${r.source}" ${size}`)
	}
	const message = { width, height, full, format: frame.FourCC === FOURCC_BGRA ? 'BGRA' : 'BGRX', data }
	for (const w of ready) {
		if (now - w.sentAt > ACK_TIMEOUT_MS) w.inFlight = 0
		w.inFlight += 1
		w.sentAt = now
		w.port.postMessage(message)
	}
	r.lastSentAt = now
	r.failure = null
	const at = Date.now()
	r.lastFrame = { at, width, height, full }
	const second = Math.floor(at / 1000)
	r.counted = second === r.counted.second ? { ...r.counted, frames: r.counted.frames + 1 } : { second, frames: 1, fps: r.counted.frames }
}

function state(): NdiState {
	const second = Math.floor(Date.now() / 1000)
	return {
		runtime,
		found,
		feeds: [...sources].map(([id, source]) => {
			const r = receivers.get(id)
			return {
				id,
				name: '',
				source,
				watched: r !== undefined,
				lastFrame: r?.lastFrame ?? null,
				fps: r === undefined || second - r.counted.second > 1 ? 0 : r.counted.fps,
				failure: r?.failure ?? null,
			}
		}),
	}
}

const isSize = (v: unknown): v is Size => {
	const s = v as Size | null
	return typeof s === 'object' && s !== null && Number.isFinite(s.width) && Number.isFinite(s.height) && s.width > 0 && s.height > 0
}

parent.on('message', (e) => {
	const m = e.data as Record<string, unknown>
	if (typeof m !== 'object' || m === null) return
	switch (m['type']) {
		case 'sources': {
			const list = Array.isArray(m['sources']) ? (m['sources'] as Array<{ id: string; source: string }>) : []
			sources = new Map(list.map((s) => [s.id, s.source]))
			sync()
			return
		}
		case 'watch': {
			const port = e.ports[0]
			if (port === undefined || typeof m['key'] !== 'string' || typeof m['id'] !== 'string') return
			const key = m['key']
			const w: Watcher = { id: m['id'], port, space: isSize(m['space']) ? m['space'] : null, inFlight: 0, sentAt: 0 }
			watchers.get(key)?.port.close()
			watchers.set(key, w)
			port.on('message', (ev) => {
				const d = ev.data as Record<string, unknown> | null
				if (d === null || typeof d !== 'object') return
				if (d['type'] === 'drawn') w.inFlight = Math.max(0, w.inFlight - 1)
				if (d['type'] === 'space') w.space = isSize(d['space']) ? d['space'] : null
			})
			port.on('close', () => {
				if (watchers.get(key) === w) watchers.delete(key)
				sync()
			})
			port.start()
			sync()
			return
		}
		case 'unwatch': {
			const key = m['key']
			if (typeof key !== 'string') return
			watchers.get(key)?.port.close()
			watchers.delete(key)
			sync()
			return
		}
	}
})

start()
find()
setInterval(find, FIND_MS)
setInterval(() => parent.postMessage({ type: 'state', state: state() }), 500)
