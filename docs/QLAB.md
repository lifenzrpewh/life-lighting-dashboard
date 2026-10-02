# QLab — a video countdown, parked

**Status: researched, nothing built, parked 2026-10-02.** The owner wants a timer
that stays invisible until a video plays, then counts down what is left of it.
LIFE runs its videos from QLab. QLab is macOS only and the Windows dev box has no
Mac within reach, so this waits until there is one to test against. It is the
countdown chip's shape again: a third source, polled by main, hidden when idle.

## Researched, not tried

🔬 2026-10-02, from the QLab 5 and 4 OSC dictionaries
(qlab.app/docs/v5/scripting/osc-dictionary-v5/, …/v4/…). Nothing here has run.

- **macOS only** (11+). **OSC needs no licence**: the free tier answers it.
- **Port 53000**, UDP and TCP. **UDP replies go to the sender's IP on port 53001**,
  not its source port. `/udpReplyPort` moves that, but only on 5.3+. TCP needs
  SLIP framing and avoids both the UDP size limit (which the running-cue lists can
  exceed) and the 61 s UDP session timeout.
- **Replies** arrive as `/reply/<address>` with one JSON string:
  `{ workspace_id?, address, status, data }`. `status` is `ok` · `error` ·
  `denied` (5), or `ok` · `error` (4).
- **Access, the one booth setting:** a QLab 5 workspace refuses a client with no
  passcode by default. Tick **View** on the No Passcode row (Workspace Settings ›
  Network › OSC Access). View reads and nothing else: it cannot fire or edit.
  `/version` and `/workspaces` always answer.
- **Workspaces:** `/workspaces` → `[{ uniqueID, displayName, … }]`. Address by
  `/workspace/{uniqueID}/…`. Unprefixed, QLab 5 sends to every open workspace.
- **Running cues:** `/workspace/{id}/runningOrPausedCues/shallow` →
  `[{ uniqueID, number, name, listName, type, … }]`. Keep `type` `"Video"`.
- **Per cue, one call:** `/cue_id/{id}/valuesForKeys` with a JSON array of keys:
  `actionElapsed`, `duration`, `currentDuration`, `isPaused`, `isRunning`,
  `infiniteLoop`, `displayName`. Seconds.
- **No push for time.** `/updates 1` and 5.3's `/listen/cue/start|stop` say that
  something changed, never how far in it is. Elapsed time has to be polled.

## The recipe, when there is a Mac

TCP to `:53000` → `/workspaces` → pick one (two open is a choice to make, never a
default) → connect → poll `runningOrPausedCues/shallow` at ~4 Hz → `valuesForKeys`
for each Video cue → remaining = (`currentDuration` ‖ `duration`) − `actionElapsed`.
Freeze on `isPaused`, say "looping" on `infiniteLoop`.

Hidden only on `status: ok` with no video running. A timeout, an `error` or a
`denied` is a fault and is shown as one: "no video" when QLab could not be asked
is the shape this project exists to refuse.

## Unverified, to check on the first Mac

- The reply shape of `valuesForKeys` (a `{ key: value }` object is expected).
- `duration` against `currentDuration`, and what a looping cue reports for both
  and for `actionElapsed`.
- Whether `actionElapsed` holds still while paused.
- `percentActionElapsed`'s units (0–1 or 0–100), if it is ever used.
