---
name: handoff
description: End a working session on Pāua cleanly - commit and push everything, bring CLAUDE.md and the docs up to date so a fresh session can start from them, then clear the conversation. Use when the owner says hand off, wrap up, end the session, get ready for a clear, or "commit, push and update the docs".
---

# Hand off

The next session starts with nothing but the repo. Whatever this session learned
that is not committed, pushed and written where CLAUDE.md points is lost at the
clear. Work through these in order; do not clear until every step has passed.

## 1. See what this session did

- `git status --short` and `git log --oneline origin/main..HEAD`: anything
  uncommitted or unpushed.
- `git log --oneline -15`: what was committed this session.
- Go back over the conversation for what was **observed** but not yet written
  down: things seen on onPC, Arena, the lookbook or the booth, the owner's
  answers and decisions, and what was tried and failed. These matter most and
  are easiest to lose.

## 2. Check the code, if it changed

If anything under `src/`, `test/` or `console-plugin/` changed this session:

- `npm run typecheck`
- `npm test` (about a minute; the 3 MA3-corpus skips are normal on a box with no
  exports)

A failure is fixed or written down as a TODO with its output before going on.
Never hand off a red build as if it were green.

## 3. Bring the docs up to date

**A fact lives in one place; link, don't copy.** Write each fact where it
belongs, then point to it.

- **CLAUDE.md status table:** each piece's badge and one-line state. ⚠️ becomes ✅
  only with a dated observation on a console, onPC or the real program. Passing
  tests alone stay ⚠️. Fix any row that has gone stale.
- **CLAUDE.md § Next session starts here:**
  - *Where things stand (date):* today's date, and a short paragraph of what
    works now and what is left.
  - *This Windows box:* the state of this machine that a new session would
    trip over (ports, what onPC has loaded, the OSC rows, settings).
  - *TODO, in order:* remove what is done, add what was found, and keep each
    item to the next action plus a link to its doc section.
- **docs/PLAN.md:** phase status (the showfile is Phase 3).
- **docs/VISUALS_DASHBOARD.md:** Arena, video, media check, slots, the owner's
  answers. Move questions the owner has answered out of § Open questions.
- **docs/MA3_READ_MODEL.md:** wire and console facts (✅ with date and version).
- **Memory** (the memory folder named in the system prompt): only what the repo
  cannot hold, such as how the owner likes to work. Never copy code facts there.

Keep the docs' voice: plain sentences, dated badges, the why next to the what.

**Line endings:** the docs are LF. Edit them with the Edit tool. A PowerShell
`WriteAllLines` or `Set-Content` rewrite turns the whole file CRLF, and the diff
shows every line changed. If that happens, `sed -i 's/\r$//' <file>` in bash and
check `git diff --stat` again.

## 4. Commit and push

- Commit from **bash with a heredoc** (`git commit -F - <<'EOF'`). PowerShell 5.1
  splits a message containing quotes into stray pathspecs.
- Style, as in `git log`: a plain subject saying what changed, then a body saying
  what was seen and why. End with the attribution trailer the system reminder
  gives.
- Group sensibly: code with its tests and docs; a docs-only hand-off commit is
  fine.
- `git push`, then confirm: `git status --short` is empty and
  `git log origin/main..HEAD` is empty.

## 5. Tell the owner, then clear

Before clearing, say in a few lines:
- what was committed (short hashes),
- what the next session starts with (the top of the TODO),
- anything still running (a kiosk started with a debugging port, background
  tasks) and anything left on onPC or Arena that a new session should know.
  Write those into CLAUDE.md too, not only in chat.

Then clear: call `mcp__ccd_session_mgmt__clear_session` with `session_id: "self"`
(load it with ToolSearch first if it is deferred). The app asks the owner to
approve, and the clear happens when this turn ends, so make the summary above
the last thing said. If the tool is not available (a plain terminal session),
tell the owner to type `/clear`.
