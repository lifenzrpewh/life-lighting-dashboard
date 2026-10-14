// Channel A: command lines out to the console, one OSC string each.
//
// WHY THIS EXISTS: `/life/cmd ,s "<command>"` is how anything reaches the desk
// (✅ executed on the console, 2026-09-21). Its own socket rather than the
// listener's, so a failed bind on the reply port costs feedback and nothing
// else: the pings still go out, and their silence is what the link reports.
//
// THE RULE THIS FILE ENFORCES: a send is not a delivery. UDP says nothing about
// arrival and `Cmd()` on the console discards its result, so nothing here returns
// success. A write is confirmed only by a read-back; for the link that read-back
// is the ping's echo, matched in src/bridge/ping.ts.

import dgram from 'node:dgram'

import { encodeOscString } from '../../bridge/osc.js'

export type CommandSender = {
	/** Fire and forget. A command that cannot be encoded is refused through
	 *  `onError` rather than sent in part. */
	send(command: string): void
	close(): void
}

export function createCommandSender(options: {
	host: string
	port: number
	prefix: string
	/** Local faults only: encoding, DNS, no route. A console that is simply not
	 *  there raises nothing, which is why the link is judged by echoes. */
	onError?: (detail: string) => void
}): CommandSender {
	const address = `/${options.prefix}/cmd`
	const socket = dgram.createSocket({ type: 'udp4' })
	socket.on('error', (e) => options.onError?.(e.message))
	// A send after close throws synchronously (ERR_SOCKET_DGRAM_NOT_RUNNING),
	// which in a late timer is an uncaught exception and a restart.
	let closed = false

	return {
		send(command) {
			if (closed) return
			const encoded = encodeOscString(address, command)
			if (!encoded.ok) {
				options.onError?.(`refused to send ${JSON.stringify(command)}: ${encoded.detail}`)
				return
			}
			socket.send(encoded.bytes, options.port, options.host, (e) => {
				if (e) options.onError?.(e.message)
			})
		},
		close() {
			closed = true
			try {
				socket.close()
			} catch {
				/* already closed */
			}
		},
	}
}
