// One request to the backend, with a deadline, answered as a union.
//
// THE RULE THIS FILE ENFORCES: nothing here throws, and nothing turns a failure
// into a body. A timeout, a refused connection, a 5xx and a page of HTML where
// JSON belonged are each their own answer, so the caller cannot render any of
// them as an empty run order.

export type Reply =
	| { ok: true; status: number; body: unknown }
	| { ok: false; reason: 'timeout'; detail: string }
	/** `status` is null when no HTTP answer came at all (DNS, refused, reset). */
	| { ok: false; reason: 'error'; status: number | null; detail: string }

export async function call(
	url: string,
	init: { method?: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown; timeoutMs: number },
): Promise<Reply> {
	try {
		const response = await fetch(url, {
			method: init.method ?? 'GET',
			headers: init.body === undefined ? init.headers : { ...init.headers, 'content-type': 'application/json' },
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
			signal: AbortSignal.timeout(init.timeoutMs),
		})
		const text = await response.text()
		let body: unknown = null
		if (text !== '') {
			try {
				body = JSON.parse(text)
			} catch {
				return { ok: false, reason: 'error', status: response.status, detail: `${response.status}: not JSON (${text.slice(0, 60)})` }
			}
		}
		if (!response.ok) {
			const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
			const message = b['message'] ?? b['msg'] ?? b['error_description'] ?? b['error']
			return { ok: false, reason: 'error', status: response.status, detail: `${response.status}${typeof message === 'string' ? `: ${message}` : ''}` }
		}
		return { ok: true, status: response.status, body }
	} catch (e) {
		const err = e as Error & { cause?: { code?: string } }
		if (err.name === 'TimeoutError' || err.name === 'AbortError') {
			return { ok: false, reason: 'timeout', detail: `no answer within ${Math.round(init.timeoutMs / 1000)} s` }
		}
		return { ok: false, reason: 'error', status: null, detail: err.cause?.code ?? err.message }
	}
}
