// OSC 1.0 decoder — the wire format underneath channels B and C.
//
// WHY THIS EXISTS: the console speaks OSC at us constantly. Channel B pushed 771
// messages in a single 30 s window on 2026-09-21 (docs/MA3_READ_MODEL.md § Channel
// B), and every one of them has to be turned into a number before it can mean
// anything. `spikes/osc-probe.mjs` proved the format on the desk; this is that
// decoder with types and bounds checks, in the tested layer.
//
// THE RULE THIS FILE ENFORCES: a packet we could not fully decode never arrives
// as a message. The probe prints `<t?>` for a type tag it does not know and
// carries on, which is right for a diagnostic that a human is reading — but here
// it would be a catastrophe. OSC arguments are positional and untagged in the
// payload: the ONLY thing that says how wide an argument is, is its type tag. Skip
// one unknown tag and every argument after it is read at the wrong offset, so a
// fader level becomes whatever four bytes happen to sit there. That value would
// be perfectly plausible, perfectly wrong, and indistinguishable from a real read.
// Hence: one tag we cannot size fails the whole message.
//
// Deliberately NOT decoded from `Buffer`. This file is in the tested layer
// (tsconfig.json), which is built without Node types, and a decoder has no
// business depending on a runtime anyway.

/** One decoded argument. MA3 sends `,sif` on channel B and `,i` / `,f` / `,s` on
 *  channel C; nothing in the read model needs blobs, so `b` is deliberately
 *  unsupported rather than half-supported. */
export type OscArg =
	| { type: 's'; value: string }
	| { type: 'i'; value: number }
	| { type: 'f'; value: number }

export type OscMessage = {
	address: string
	args: OscArg[]
}

/** Why a packet did not decode. No success-shaped failure: there is no partial
 *  message, because a partial message is the bug this file exists to prevent. */
export type OscDecodeResult =
	| { ok: true; message: OscMessage }
	| { ok: false; reason: 'empty'; detail: string }
	| { ok: false; reason: 'malformed'; detail: string }
	| { ok: false; reason: 'unsupported-type'; detail: string }

/** Read a null-terminated, 4-byte-padded OSC string.
 *
 *  Decoded byte-for-byte as latin1 rather than UTF-8, on purpose. `SendOSC` does
 *  not carry UTF-8 at all (an em-dash arrived as `b \0 \20`, ❌ 2026-09-21), so a
 *  high byte here is corruption, not a character. Decoding it as latin1 keeps the
 *  corrupt bytes visible; running it through a UTF-8 decoder would replace them
 *  with U+FFFD and quietly destroy the evidence that anything went wrong. */
function readString(bytes: Uint8Array, offset: number): { value: string; next: number } | null {
	let end = offset
	while (end < bytes.length && bytes[end] !== 0) end += 1
	// No terminator before the end of the packet. OSC strings are always
	// terminated, so this is a truncated or non-OSC payload.
	if (end >= bytes.length) return null

	let value = ''
	for (let i = offset; i < end; i += 1) {
		const byte = bytes[i]
		if (byte === undefined) return null
		value += String.fromCharCode(byte)
	}

	// Length INCLUDING the terminator, rounded up to the next multiple of 4.
	const consumed = Math.ceil((end - offset + 1) / 4) * 4
	return { value, next: offset + consumed }
}

/** Decode one OSC message. Bundles (`#bundle`) are not decoded: MA3 has never
 *  been observed sending one, and guessing at a format we have not seen on a desk
 *  is exactly the kind of unverified assumption this project badges ⚠️. */
export function decodeOsc(bytes: Uint8Array): OscDecodeResult {
	if (bytes.length === 0) return { ok: false, reason: 'empty', detail: 'zero-length packet' }

	const address = readString(bytes, 0)
	if (address === null) return { ok: false, reason: 'malformed', detail: 'unterminated address' }
	if (!address.value.startsWith('/')) {
		return {
			ok: false,
			reason: 'malformed',
			detail: `address does not start with '/': ${JSON.stringify(address.value.slice(0, 32))}`,
		}
	}

	// An address with no type-tag string is legal OSC 1.0 and means no arguments.
	if (address.next >= bytes.length) return { ok: true, message: { address: address.value, args: [] } }

	const tags = readString(bytes, address.next)
	if (tags === null) return { ok: false, reason: 'malformed', detail: 'unterminated type tags' }
	if (!tags.value.startsWith(',')) {
		return {
			ok: false,
			reason: 'malformed',
			detail: `type tags do not start with ',': ${JSON.stringify(tags.value.slice(0, 32))}`,
		}
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const args: OscArg[] = []
	let offset = tags.next

	for (const tag of tags.value.slice(1)) {
		if (tag === 's') {
			const read = readString(bytes, offset)
			if (read === null) {
				return { ok: false, reason: 'malformed', detail: `unterminated string arg ${args.length}` }
			}
			args.push({ type: 's', value: read.value })
			offset = read.next
			continue
		}

		if (tag === 'i' || tag === 'f') {
			if (offset + 4 > bytes.length) {
				return {
					ok: false,
					reason: 'malformed',
					detail: `truncated ${tag} arg ${args.length}: need 4 bytes at ${offset}, have ${bytes.length - offset}`,
				}
			}
			// Big-endian: OSC is network byte order. Getting this wrong is not a
			// crash, it is a wrong number — the probe's first version read the
			// fader float as mojibake for exactly this reason.
			args.push(
				tag === 'i'
					? { type: 'i', value: view.getInt32(offset, false) }
					: { type: 'f', value: view.getFloat32(offset, false) },
			)
			offset += 4
			continue
		}

		// See the file header: we cannot size this argument, so we cannot trust
		// any argument after it either.
		return {
			ok: false,
			reason: 'unsupported-type',
			detail: `type tag '${tag}' at arg ${args.length} in ${JSON.stringify(tags.value)}`,
		}
	}

	return { ok: true, message: { address: address.value, args } }
}
