// Where the backend is, and the key that lets anyone ask it anything at all.
//
// WHY THESE ARE BUILT IN: they are the same for every booth. One backend serves
// every campus (`visuals-song-comms`), and the anon key is public by design:
// the PWA ships it to every browser (✅ 2026-10-01, the same key is in the
// deployed bundle and the server's ANON_KEY). RLS decides what a caller may
// read, and an anon caller may read nothing until a booth is paired
// (`permission denied for table campuses`). So a new booth needs no key put on
// it, only a pairing. Built in with the owner's go-ahead, 2026-10-02.
//
// THE RULE: only an `anon` key belongs here. The service-role key looks the
// same and bypasses RLS entirely; test/backend.test.js fails if this changes.

/** The PWA and the Supabase API, same-origin behind Caddy (visuals-song-comms
 *  CLAUDE.md). ✅ 2026-09-30: answers directly, no Cloudflare Access in front;
 *  Kong wants only the `apikey` header. */
export const BACKEND_URL = 'https://visuals.prodapps.life'

export const BACKEND_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxMjQzNTIxLCJleHAiOjIwOTY2MDM1MjF9.6S2lV8DR5OyNJFIGL6GX6Ysn9dGi6j5kPuyY2pbBDGI'
