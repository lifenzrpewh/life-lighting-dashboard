# Lookbook check — parked idea (2026-10-02)

**Status: parked, not started.** Lower priority than the Visuals Dashboard; the owner
is keen. It needs a lot of back and forth before any code, so this page holds the idea
and the open questions, not a design.

**Folded into the media check (2026-10-04).** The owner's answers on announcements gave
the link this page was missing: LIFE's media codes (`CF455` and the like) in PCO's
`Media No.` column and in the file names. One check now covers every coded item,
foregrounds included: `docs/VISUALS_DASHBOARD.md` § Answered (owner, 2026-10-04): the
media check. Copying and loading files stays this page's idea, after the check.

## The idea

The lookbook (the planned foregrounds for each service) lives in two places: a web
page and Planning Center. Arena's deck holds the files actually loaded. A **Check
Foregrounds** button compares the two and says which clips are missing, out of date
or extra. Better still, it copies the right files down from the network drive and
loads them into Arena **from the local drive**, never from the share, so a service
never plays off the network.

## What Resolume already makes possible

🔬 From Resolume's published OpenAPI spec (`resolume.com/docs/restapi/swagger.yaml`,
read 2026-10-02). Not yet tried against a real Arena.

- **Reading what's loaded.** A clip's video track carries `fileinfo` with `path` and
  `exists`, so the deck can be compared by file name and checked for files that have
  gone missing on disk. `GET /composition`, decks under `/composition/decks/…`.
- **Loading files.** `POST /composition/clips/open` takes `[{ target, source }]`, with
  `target` a clip such as `/composition/layers/1/clips/1` and `source` a file URL
  (`file:///…`, **spaces as `%20`**, which the spec itself calls a common source of errors).
- **The web server** is Preferences › Web Server, port 8080, all interfaces, base
  `http://<host>:8080/api/v1`. No authentication is mentioned in the spec.

## Questions to answer first

- Which is the source of truth when the web page and PCO disagree?
- How does a lookbook entry name its file: an exact file name, a title, a PCO attachment?
- Which deck and layer, and which clip slots, belong to foregrounds?
- Where on the network drive do the files live, and is the share's layout fixed?
- Replace in place, or load into empty slots and let a person swap them?
- When is it safe to run: never during a service (like channel D), or only on a deck
  that isn't playing?
- Which computer: the Arena machine itself (local paths are its paths), or another one?
- Rules carried over: a failed read never looks like "all up to date", and every load
  is unconfirmed until a read-back of the clip's `fileinfo` shows it.
