// Capture inputs, the page's half (../shared/capture.ts): which cameras this
// computer has, and one stream per device however many views show it.
//
// THE RULES THIS FILE ENFORCES:
// - A device is opened once per page and closed when the last view showing
//   it goes: a Blackmagic input is usually one program's at a time, so two
//   tabs of it must not be two opens.
// - Found by its name each time it is opened, never by an id kept from
//   before (the browser's ids are the page's, and not promised to last).
// - A stream that ends (unplugged, taken by another program) is said, and
//   opened again every few seconds while a view still wants it.
// - Video only. Main allows nothing else (src/main/kiosk.ts, the media rule).

import { useEffect, useState, useSyncExternalStore } from 'react'

import { plainCaptureFailure, type CaptureState } from '../shared/capture.js'

const REOPEN_MS = 3_000
const LIST_MS = 2_000

type Entry = {
	refs: number
	stream: MediaStream | null
	opening: boolean
	failure: string | null
	live: CaptureState['live']
	retry: ReturnType<typeof setTimeout> | null
}

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0
const changed = () => {
	version += 1
	for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
	listeners.add(l)
	return () => listeners.delete(l)
}

/** Every camera this computer lists, by name. */
async function cameraNames(): Promise<string[]> {
	const all = await navigator.mediaDevices.enumerateDevices()
	return all.filter((d) => d.kind === 'videoinput' && d.label !== '').map((d) => d.label)
}

/** The cameras this computer has, kept current while `active`; null until
 *  first read, or outside a browser that has any. */
export function useCameras(active: boolean): string[] | null {
	const [names, setNames] = useState<string[] | null>(null)
	useEffect(() => {
		if (!active || navigator.mediaDevices === undefined) return
		let alive = true
		const read = () =>
			void cameraNames().then(
				(n) => alive && setNames((old) => (old !== null && old.join('\n') === n.join('\n') ? old : n)),
				() => alive && setNames([]),
			)
		read()
		const id = setInterval(read, LIST_MS)
		navigator.mediaDevices.addEventListener('devicechange', read)
		return () => {
			alive = false
			clearInterval(id)
			navigator.mediaDevices.removeEventListener('devicechange', read)
		}
	}, [active])
	return names
}

async function open(device: string, e: Entry): Promise<void> {
	if (e.opening || e.stream !== null || e.refs === 0) return
	e.opening = true
	try {
		const all = await navigator.mediaDevices.enumerateDevices()
		const found = all.find((d) => d.kind === 'videoinput' && d.label === device)
		if (found === undefined) throw Object.assign(new Error(''), { name: 'NotFoundError' })
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: false,
			video: { deviceId: { exact: found.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
		})
		if (e.refs === 0) {
			for (const t of stream.getTracks()) t.stop()
			return
		}
		e.stream = stream
		e.failure = null
		const track = stream.getVideoTracks()[0]
		track?.addEventListener('ended', () => {
			if (e.stream !== stream) return
			e.stream = null
			e.failure = 'It stopped: unplugged, or taken by another program.'
			changed()
			later(device, e)
		})
	} catch (err) {
		const x = err as { name?: string; message?: string }
		e.failure = plainCaptureFailure(x.name ?? 'Error', x.message ?? '')
		later(device, e)
	} finally {
		e.opening = false
		changed()
	}
}

/** Try again in a moment, while a view still wants it. */
function later(device: string, e: Entry): void {
	if (e.retry !== null || e.refs === 0) return
	e.retry = setTimeout(() => {
		e.retry = null
		void open(device, e)
	}, REOPEN_MS)
}

/** Show `device`: its stream (null while opening or failed) and why not. The
 *  device is let go when the last view showing it does. */
export function useCapture(device: string | null): { stream: MediaStream | null; failure: string | null } {
	useSyncExternalStore(subscribe, () => version)
	useEffect(() => {
		if (device === null || navigator.mediaDevices === undefined) return
		let e = entries.get(device)
		if (e === undefined) {
			e = { refs: 0, stream: null, opening: false, failure: null, live: null, retry: null }
			entries.set(device, e)
		}
		const entry = e
		entry.refs += 1
		void open(device, entry)
		return () => {
			entry.refs -= 1
			if (entry.refs > 0) return
			if (entry.retry !== null) clearTimeout(entry.retry)
			for (const t of entry.stream?.getTracks() ?? []) t.stop()
			entries.delete(device)
			changed()
		}
	}, [device])
	const e = device === null ? undefined : entries.get(device)
	return { stream: e?.stream ?? null, failure: e?.failure ?? null }
}

/** A view drew a frame of `device`: kept for its row's LIVE and the strip. */
export function sawFrame(device: string, width: number, height: number, fps: number | null): void {
	const e = entries.get(device)
	if (e === undefined) return
	e.live = { width, height, fps, at: Date.now() }
}

/** What this page knows of `device`, for its Connections row. */
export function captureStateOf(device: string, cameras: readonly string[] | null): CaptureState {
	const e = entries.get(device)
	return {
		present: cameras === null ? null : cameras.includes(device),
		live: e?.live ?? null,
		failure: e?.failure ?? null,
	}
}
