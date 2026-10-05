// Capture inputs as views (the owner, 2026-10-05): a Blackmagic card
// (DeckLink, UltraStudio, Intensity), an ATEM Mini's USB output, OBS's
// Virtual Camera or a webcam. Anything Windows or macOS sees as a camera.
//
// WHY THIS SHAPE: Blackmagic's Desktop Video driver presents each input as a
// camera, and OBS's Virtual Camera is one, so the page takes the picture with
// `getUserMedia`, the browser's own camera route: no native code, decoded and
// drawn by the browser on the GPU. Added like an NDI source (./ndi.ts): picked
// in Connections from the cameras this computer has, never typed; a view and
// a row each; one missing is said, never swapped for another.
//
// A device is kept by its name (its label), not by the browser's id for it:
// that id belongs to the page's origin and is not promised to last, while a
// card's name is what Desktop Video calls it on every machine.
//
// THE RULE THIS FILE ENFORCES: a picture, not a reading. A capture that
// stops is said to have stopped, and a card with no signal is not a picture.

export type CaptureInput = {
	/** Fixed when added: never reused. */
	id: string
	/** What its tab and its Connections row say. */
	name: string
	/** The camera's name as the system gives it, exactly. */
	device: string
	/** False when turned off in Connections: its tabs leave the screen. */
	on: boolean
}

export const CAPTURE_INPUTS_MAX = 12
export const CAPTURE_NAME_MAX = 32
const DEVICE_MAX = 256

const ID = /^[a-z0-9]{1,24}$/
export const isCaptureId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)

export function captureNameError(name: string): string | null {
	if (name.trim() === '') return 'A name is needed.'
	if (name.length > CAPTURE_NAME_MAX) return `At most ${CAPTURE_NAME_MAX} characters.`
	if (/[\u0000-\u001f\u007f]/.test(name)) return 'Letters, numbers and punctuation only.'
	return null
}

const isDeviceName = (v: unknown): v is string =>
	typeof v === 'string' && v.trim() !== '' && v.length <= DEVICE_MAX && !/[\u0000-\u001f\u007f]/.test(v)

/** A camera's name as a person reads it: Windows adds the USB ids,
 *  `FHD Webcam (13d3:56dd)`, which mean nothing at a booth. Cut to fit a tab. */
export function captureShortName(device: string): string {
	const short = device.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').trim() || device.trim()
	return short.length > CAPTURE_NAME_MAX ? short.slice(0, CAPTURE_NAME_MAX).trimEnd() : short
}

/** A list of capture inputs off disk or IPC, or null if any one is not one
 *  or two share an id or a device. Names are trimmed. */
export function captureInputsFrom(v: unknown): CaptureInput[] | null {
	if (!Array.isArray(v) || v.length > CAPTURE_INPUTS_MAX) return null
	const out: CaptureInput[] = []
	for (const e of v) {
		if (typeof e !== 'object' || e === null) return null
		const { id, name, device, on } = e as Record<string, unknown>
		if (!isCaptureId(id) || typeof name !== 'string' || !isDeviceName(device) || typeof on !== 'boolean') return null
		if (captureNameError(name.trim()) !== null) return null
		if (out.some((o) => o.id === id || o.device === device)) return null
		out.push({ id, name: name.trim(), device, on })
	}
	return out
}

/** The view a capture input is, in a window's tabs. */
export type CaptureView = `capture:${string}`

export const captureView = (id: string): CaptureView => `capture:${id}`

export function captureIdOf(view: string): string | null {
	if (!view.startsWith('capture:')) return null
	const id = view.slice('capture:'.length)
	return isCaptureId(id) ? id : null
}

/** A picture this long without a new frame is said to have stopped (as the
 *  video feed's and NDI's). */
export const CAPTURE_STALLED_AFTER_MS = 2_000

/** What the browser's refusal means, in words someone at the booth can act on.
 *  The names are the browser's own (DOMException names for getUserMedia). */
export function plainCaptureFailure(name: string, message: string): string {
	switch (name) {
		case 'NotReadableError':
		case 'TrackStartError':
			// ✅ 2026-10-05: OBS's Virtual Camera with OBS not running refuses
			// this way too, so both causes are named.
			return 'It would not start: another program may be using it (a card input usually works in one program at a time), or it is not sending yet (in OBS, Start Virtual Camera).'
		case 'NotFoundError':
		case 'DevicesNotFoundError':
			return 'It is not on this computer now.'
		case 'NotAllowedError':
		case 'PermissionDeniedError':
			return 'Pāua was not allowed to use it.'
		case 'OverconstrainedError':
			return 'It would not give a picture in any size Pāua asked for.'
		default:
			return message === '' ? name : message
	}
}

/** What the page knows of one capture input: whether the computer has it,
 *  and while a view shows it, its picture. */
export type CaptureState = {
	/** The computer lists a camera by this name. Null before the page has asked. */
	present: boolean | null
	/** While shown: its size and rate as the device gives them, or why not. */
	live: { width: number; height: number; fps: number | null; at: number } | null
	failure: string | null
}
