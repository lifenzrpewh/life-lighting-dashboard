# The MA3 read model — what the dashboard reads, and how

**✅ VERIFIED on a desk: grandMA3 onPC 2.3.2.0, show "Mount Eden Base", 2026-09-20.**
Captured by `console-plugin/LifeBridge.lua` v1; raw report in `/Users/Shared/LIFE/LifeBridge-probe.txt`.

Every fact here is version-specific. Re-run the probe on 2.5 and produce a second
report rather than editing this one.

## How properties are read

Not as Lua fields. `line.Object` silently returns `nil`, which is how probe v0
reported a recipe line with no group as a PASS.

```lua
obj:Get("SELECTION")        -- read one property
obj:PropertyCount()         -- how many
obj:PropertyName(i)         -- 0-BASED
```

`ObjectList("Sequence 100")` resolves and returns a **list**; an empty list means
no such object. Reads cost **~0.01 ms** per sequence resolve.

## ⚠️ Cue numbers are stored ×1000

A cue's `NO` is the display number multiplied by 1000. Sequence 100 reads:

| pos | `NO` | `NAME` | displayed |
|---|---|---|---|
| 1 | `nil` | OffCue | — |
| 2 | `0` | CueZero | 0 |
| 3 | `1000` | [Holding] | **1** |
| 4 | `2000` | SNAP | **2** |
| 5 | `3000` | Q + S FADE UP | **3** |
| 6 | `4000` | Buffer | **4** |

Cross-checked against `LEVEL_STATES.md`, which documents SNAP as cue 2 — and SNAP
reads `NO=2000`. So decimal cue numbers are representable: cue 1.5 is `1500`.

**Two separate traps.** `seq:Ptr(i)` is **positional** — position 1 is OffCue, not
cue 1 — so index is never cue number. And `NO` is never the displayed number
either. Convert explicitly at the boundary; never let a raw `NO` reach the UI or a
command string.

Confusingly, the **sequence** reports its current cue as a *display* number:
`CUENO = 4` while that cue's own `NO = 4000`.

## Live cue tracking is free

The sequence object carries it directly, so a poll is enough:

| Property | Example |
|---|---|
| `CURRENTCUE` | handle:Buffer |
| `CUENO` | 4 |
| `CUENAME` | Buffer |

This matters because **`HookObjectChange` does not work** (below). Losing push costs
almost nothing: at 0.01 ms a read, polling forty sequences is well inside one 8 ms
slice.

## Recipe line — `Sequence S Cue C Part P`, child index N

147 properties; these are the ones the cue editor needs.

| Property | Read | Meaning |
|---|---|---|
| `SELECTION` | handle:Auras | **the group.** Not `Object` |
| `PRESET` | handle:Holding | the value source |
| `VALUES` | handle:Holding | mirrors `PRESET` |
| `SELECTIONMODE` | Strict | matches `CFG.RECIPE_SELECTION_MODE` |
| `MATRICKS` | nil | optional third element of a recipe line |
| `ENABLED` | true | per-line enable |
| `NAME` | Recipe 1 | |
| `FAILEDCOOKEDPART` | None | **cook-failure signal** |
| `EMPTYLASTCOOKING` | false | **second cook-failure signal** |

`SELECTION` and `PRESET` come back as **handles**, not strings — take `.name`.
Seq 100 Cue[3] Part[1] returned 5 lines, the first `Auras` → `Holding`, which is
exactly what `LEVEL_STATES.md` documents for HOLDING. The read model is correct.

**Both cook-failure signals are real properties, not something we have to infer.**
The plan's "this line cooked to nothing" warning can be driven off them directly.

## Cue part — timing lives here, not on the cue

193 properties; the relevant ones:

| Property | Read |
|---|---|
| `CUEINFADE` | 7.5 |
| `CUEINDELAY` | 0.0 |
| `CUEOUTFADE` | **`CueTiming`** |
| `CUEOUTDELAY` | **`CueTiming`** |
| `SNAPDELAY` | 0.0 |
| `TRANSITION` | Linear |
| `DURATION` | 7.5 |
| `COMMAND` | (empty) |
| `OWNDATAPRESENT` | false |

✅ **Confirms the split-timing warning.** `CUEOUTFADE` defaults to the literal
string `"CueTiming"` — it *follows*. Writing it explicitly is what turns a single
fade box into a split `0/0`. Set `CUEINFADE` only.

`OWNDATAPRESENT = false` also confirms `LEVEL_STATES.md`: these cues carry no light
data of their own; the recipes and macros do the work.

## Cue

| Property | Read |
|---|---|
| `NO` | 0 (×1000 — see above) |
| `NAME` | CueZero |
| `TRIGTYPE` / `TRIGTIME` | nil when default |
| `BREAK`, `RELEASE`, `ASSERT`, `ALLOWDUPLICATES` | nil when default |

A `nil` here means "default", not zero. Do not coalesce.

## ❌ `HookObjectChange` does not install

It exists in the environment, but neither `(cb, obj)` nor `(cb, obj, pluginHandle)`
returned a hook id. **Treat push as unavailable and poll.** Re-test on 2.5; the
symbol table suggests a 4-arg form with a target that we have not found.

## ⚠️ `SELECTIONDATA` is always present

It appears as a Lua table on **every** cue part, including ones that export fine.
So its mere presence is *not* the `Export Sequence` crash marker — only a
**non-empty** one is. Any Lua-side crash check must inspect the contents, not the
property. The XML-side check in `src/bridge/export-parse.ts` is unaffected: the
console only writes a `<SelectionData>` element when there is data.

## OSC transport — ✅ VERIFIED 2026-09-21, onPC/console 2.3.2.0

**A console executes a command that arrived over OSC/UDP.** Channel A is real. The
working shape, observed on desk `10.11.60.40`:

| | |
|---|---|
| Address | `/life/cmd` — i.e. `/<prefix>/cmd` |
| Type tag | `,s`, one string argument |
| Payload | the command line, e.g. `Help` |
| Entry | In & Out -> OSC, row 3 `OSCData 3` |
| Port | `8003` |
| Prefix | `life` (no slashes) |
| Destination IP | `10.11.60.182` |
| Toggles | `Receive`, `Send`, `Receive Command`, `Send Command` = Yes; global `Enable Input`/`Enable Output` on |

### ⚠️ Editing an entry's Port does NOT move the live socket

**This is the expensive one.** MA3 binds an entry's socket when the entry is
activated and keeps it. Editing the `Port` field changes *the table* and nothing
else — the entry goes on listening on its old port, and the UI gives no hint that
the two have diverged.

Observed directly: row 3 displayed `8000`, then `8003`, while its live socket
stayed on `8010` throughout. Commands sent to the displayed port did nothing;
commands sent to `8010` — a port that appears **nowhere** in the configuration —
executed normally.

**Fix: toggle `Enable Input` off and on.** The stale socket is released and the
configured port is bound. Confirmed by scan: before, `8010` BOUND / `8003`
refused; after, `8010` refused / `8003` BOUND.

**Diagnosing it from outside the desk**: a connected UDP socket surfaces ICMP
port-unreachable as `ECONNREFUSED`, so an unbound port errors and a bound one
stays silent. Probe the candidate ports *and two controls* — the controls prove
ICMP is not simply being filtered. This is the only way found to see the real
socket, because the console will not show it.

### Two entries may claim one port; first bound wins

Rows 1 and 3 both displayed `8000`. Row 1 (`RemoteApp`, prefix `test`) held the
socket, so `/life/cmd` arrived there, failed the prefix check, and was dropped
**silently** — no error, no log, no System Monitor line. Give every entry its own
port; do not rely on the prefix to separate entries that share one.

**Port selects the entry; prefix then validates within it.** Both, in that order.

### `Destination IP` is output-only — input is not source-filtered

The console accepts OSC on a bound port from **any** sender. `Destination IP` only
says where feedback is sent. So an entry pointing at a completely different
machine will still receive, and silently drop, packets from this one — which is
what made "which row is ours" so hard to pin down: the row that answered us and
the row that pointed at us were different rows.

Consequence, now measured rather than assumed: anything on the network can command
this desk. That is the threat model `docs/PLAN.md` already accepts — accident and
bug, not adversary — but it is literally true.

### `Echo Input` defaults to `No`

System Monitor shows nothing about arriving OSC until `Echo Input` is `Yes` on that
row. An empty System Monitor is therefore **not** evidence that packets are not
arriving, and reading it that way costs an afternoon.

### Channel B — the console pushes on change ✅

Moving one executor fader produced **269 messages** in a single ~30 s window:

```
/life/14.14.1.6.1005   ,sif   "FaderMaster", 3, <float>
```

Prefix, then pool `14.14.1.6`, object `1005` — the pool-address shape
`companion-module-grandma3/docs/OSC_PROTOCOL.md` predicts. `,sif` is name, int,
value. This is what the vendored `parse.ts`/`state.ts` decoder consumes.

**It is chatty.** 269 packets for one fader sweep is ~9/second sustained, per
control. The dashboard must coalesce these per object before they reach React —
one state update per frame, not per packet — or a busy desk will drive the
renderer flat out for no visible gain.

✅ **Second capture, 2026-09-21, dashboard on 10.11.60.215:** 1221 packets in
90 s, all of them channel B, decoded 1221/1221 by `src/bridge/osc.ts`. Coalesced
at 10 Hz that is **267 frames**, a 4.6x reduction. The rate holds: ~13/s here
against ~26/s before, the difference being how hard the faders were worked.

⚠️ **The executor set is open.** Four were live this time — `1002`, `1003`,
`1004`, `1005` — where the first capture saw two. Nothing may assume a known
pair, or a fixed count.

⚠️ **The level range is still only partly observed.** Values reached **76.8**,
past the 54.5 maximum of the first capture. It reads as a percent, but neither
end has been seen: no capture has run a fader to its stop and read the number.
So `value` is carried unscaled and unclamped in `src/bridge/channel-b.ts`, and
nothing normalises it to 0..1 on an assumption.

**Silence is still not death.** Channel B speaks only on change; a quiet desk
mid-sermon emits nothing for minutes and is perfectly healthy. Link health must
come from unanswered *requests*, never from an empty inbox — which is what
`src/shared/reading.ts` `linkFromRequests` already enforces.

### Channel C — the plugin's `SendOSC` push ✅

`Call Plugin "LifeBridge"` sent over channel A produced **14 messages** back over
channel C, carrying the whole probe report. All three channels now work, and the
console-direct architecture holds end to end: command in over A, structure out
over C, no shared filesystem.

**⚠️ `SendOSC` prepends the entry's Prefix. Addresses in the plugin must be BARE.**
The plugin sent `/life/probe/int` and it arrived as **`/life/life/probe/int`**.
Use `/probe/int`; the entry supplies `life`.

**⚠️ `SendOSC` does not carry UTF-8.** An em-dash in a probe string arrived as the
bytes `b \0 \20`. Payloads must be ASCII — `oscSafe` now strips high bytes, for the
same reason it strips quotes rather than escaping them: the corruption is silent
and the command still returns `OK`.

**Both fixes ✅ re-verified on the desk the same day**: addresses arrive as
`/life/probe/int` with one prefix, and text as `listener - a send`, clean ASCII.
`Call Plugin 7` and `Call Plugin "LifeBridge"` both work over channel A.

⚠️ **The probe accumulates results across calls.** A second `Call Plugin` in the
same session reported `18/20 passed` — two runs of 9/10, not a changed verdict.
The `results` table is not reset in `main()`. Harmless for a probe; the real
bridge must not inherit it.

### The plugin XML must be the EMBEDDED form, with a BOM

Two hard importer requirements, both of which fail quietly:

1. **UTF-8 BOM required.** A BOM-less XML will not import. Every working plugin in
   the operator's library starts `EF BB BF`. Guarded by a test.
2. **External-file form does not travel.** `<ComponentLua FileName="...">` stores an
   absolute path from the machine that built it; on any other console the plugin
   pool shows the row red with `File Exists: No` and `Call Plugin` does nothing at
   all — no error, no log. Use `<FileContent><Block Base64=.../></FileContent>`,
   1024-byte stride, `Size` = block count. `npm run build:plugin` emits it and
   round-trip verifies before the file lands.

### ❌ Re-importing does NOT reload a plugin already in memory

❌ 2026-09-21. A rebuilt `LifeBridge.xml` was imported over plugin 7 and
called again. It ran the OLD code.

The proof is the probe's own accumulation bug, used as an instrument: the
tally came back `36/40`, then `45/50`. Five runs of ten probes, every one
appending to a single `results` table — a table that can only exist inside a
chunk that was never re-read. The new build has eleven probes and resets that
table per call, so it can only ever report `N/11`. `Call Plugin 7` and
`Call Plugin "LifeBridge"` both hit the stale one.

⚠️ **Nothing says so.** `Call Plugin` succeeds, the plugin pool shows the
newly imported file, and the output is the old program. This is the same shape
as the external-file trap above: the failure is silent and the thing you are
looking at says you succeeded.

To actually load new code, the loaded chunk has to go: delete the plugin object
and re-import, or restart the console. Import alone is not enough — which
means "the XML is self-contained" solves DISTRIBUTION, not DEPLOYMENT.

And import reads the **library's** copy, not the repo's:
`gma3_library/datapools/plugins/LifeBridge.xml`. On 2026-09-30 that was still the
21 September build, so even a clean delete-and-import would have loaded code
without `ping`. Copy `console-plugin/LifeBridge.xml` there first.

⚠️ It also means module state survives between calls, which is why the
probe accumulated in the first place. Anything shipped must assume the chunk
outlives the call and reset what it owns.

### One `Port`, both directions

There is no separate input/destination port — one field, used each way. Matches the
2.3 manual's column list.

### The link ping — ✅ onPC 2.3.2.0 on macOS, 2026-09-30

When the console has been quiet for 15 s, the dashboard sends
`SendOSC 3 "/ping,s,<token>"` over channel A; the console answers by sending
`/life/ping ,s "<token>"` back through row 3. Anything else the console says
counts as proof it is there, so a console someone is working is never asked.
Three unanswered asks in a row make the link UNREACHABLE, about 21 s after the
console last spoke (`src/bridge/ping.ts`). onPC on the dashboard's own computer:

1. ✅ **`Call Plugin` passes an argument.** `Call Plugin "LifeBridge" "ping <t>"`
   came back as `2.3.2.0|<t>`, exact. No longer how the link pings, but every
   future plugin verb stands on it.
2. ❌ **A ping a second was far too loud.** Each one wrote **two** lines on the
   command line, `OK:call Plugin "LifeBridge" "ping …"` and then
   `OK:SendOSC 3 "/ping,s,…"`, burying the history (operator's screenshot). Hence
   the design above. ✅ **`SendOSC` sent directly over channel A answers the
   same way**, one line per ask, 40.7 ms, no plugin involved. Measured in the
   kiosk: **5 asks in 62 s** on a quiet console, LIVE throughout, 50–60 ms.
3. ✅ **onPC holds every row's Port, on every address (`*:port`), the rows that
   only send included.** So a reply row sending to `127.0.0.1:8004` leaves 8004
   taken, and the dashboard cannot listen there the ordinary way. It can listen on
   `127.0.0.1:8004` **exactly**, beside onPC, with the reuse option (and only
   with it), and then receives everything sent there. The kiosk does this
   whenever the console address is loopback (`src/main/bridge/osc-in.ts`).
   ✅ Windows too, on loopback (2026-10-05).
4. ⚠️ **In a session, the reply goes to the network card, not loopback**
   (2026-10-11). onPC in a session runs on the station's network interface, and
   the OSC rows are the session's show, so row 3 sends wherever the console's
   show says: this computer's network address. A listener on 127.0.0.1 alone
   never hears it (onPC's own `*:8004` takes it), and the link reads "not
   answering" with the OSC set right (the owner, onPC in session). So the kiosk
   listens beside onPC on **every** IPv4 address of this computer, and, with a
   console elsewhere, falls back to the same when the port turns out taken
   (onPC in its session on this computer). Measured on this Mac against a
   stand-in holding `*:port`: loopback and the Wi-Fi address both heard, the
   stand-in nothing. ⚠️ Not yet against onPC in a session, or on Windows.

5. ⚠️ **A row sending where the console itself hears it: likely a feedback loop**
   (2026-10-11, the desk at 10.11.60.40). While it lagged "like crazy" (from the
   moment Pāua linked up, stopping when Pāua closed), the desk had ONE row on
   8003 sending to the subnet's broadcast, `10.11.60.255`, which the console's
   own 8003 listener also receives. Later the same day, after rows sending to
   `127.0.0.1` (the console itself) were set up and Pāua went to 1.1.0, the
   owner found it fine. What fixed it is not pinned down. The likely cause:
   anything the console sends to an address it answers on itself (its broadcast,
   127.0.0.1, its own IP) comes back in on the port it listens to and loops. Row
   3's destination should be the address of the computer Pāua runs on, never a
   broadcast, and 127.0.0.1 only for onPC and Pāua on one computer.

The working layout: a row receiving commands on **8003** (Receive, Receive
Command; Send off, or onPC feeds its own output back in), and **row 3**, the row
the plugin sends through, to `127.0.0.1` on **8004**. Settings: console
`127.0.0.1`, OSC port 8003, replies on 8004.

**❌ onPC opens no OSC socket at all while its station interface is missing.**
Observed the same day: `manet_socket.xml` had `Interface 3.1`, the booth adapter
(`en5`, 10.11.60.182), which was not plugged in. No row bound, the booth's rows
included, and nothing said so; the web server kept answering because it binds
every address. Menu › Network › interface `127.0.0.1` fixed it at once.
`lsof -nP -iUDP` shows onPC's sockets directly on the same machine; no port scan
needed. The same file carries the session (`Mount Eden Main Auditorium`), so this
Mac rejoins the live show whenever it is on the booth network.

### What survives `SendOSC`'s string — ✅ onPC 2.3.2.0, 2026-09-30

Each of these returned `OK` whether or not the payload arrived intact, so none
of them can be seen from the console side.

- **A comma ends the value.** `SendOSC 3 "/probe/sep,s,a|b, c;d"` arrived as
  `a|b`. SendOSC splits its string on every comma and drops whatever lies past
  the declared types. `oscSafe` in LifeBridge now turns `,` into `;`. Until
  then the probe's own `via GetVar(UserVars(), n)` detail was being cut short.
- **`; | / . ( ) ' & +` all arrive intact** (one message, byte for byte).
- **`$` variables do not expand inside the quotes.** `"/probe/base,s,$SGV2_BaseShow"`
  arrived as the literal text `$SGV2_BaseShow`.
- **Outside the quotes they expand as text, then split on spaces.**
  `SendOSC 3 "/probe/a,s,"$SGV2_BaseShow` arrived as `Mount`: the variable holds
  `Mount Eden Base`, and only the first word stayed attached to the string.
  `"/probe/b,s,"$VERSION` produced nothing at all. So the command line cannot
  carry a name with spaces in it, and the showfile name needs the plugin.

### The showfile — LifeBridge `show`

`Call Plugin "LifeBridge" "show"` over channel A; LifeBridge reads
`Root().manetsocket.showfile` and `GetVar(UserVars(), "SGV2_BaseShow")`, runs
SaveGuard's `normalise` and `baseShowName` on them line for line, compares them
**on the console**, and answers with one message:

```
/life/show ,s "2.3.2.0|base|uservar|Mount Eden Base|Mount Eden Base"
/life/show ,s "<version>|other|<uservar|default>|<name>|<base>"
/life/show ,s "<version>|unreadable"
```

The verdict is made there because the trip mangles the names (ASCII only, no
commas), and the chip must agree with SaveGuard, which sees them unmangled.
`default` means the show has no `SGV2_BaseShow` and SaveGuard's own
`LIFE Basefile Master` applies. Decoded by `readShow` in
`src/bridge/channel-c.ts`; asked on link-up and then at most once a minute
(every 5 min until 2026-10-02), only
in a quiet gap (`src/bridge/showfile.ts`). Two command lines per ask: about 0.4
a minute at the old cadence, under two a minute now.

✅ **The answer, onPC 2.3.2.0 on "Mount Eden Base", 2026-09-30**, after deleting
and re-importing LifeBridge: `2.3.2.0|base|uservar|Mount Eden Base|Mount Eden Base`,
byte for byte what the harness asserts. The kiosk asked it on link-up and drew
the amber `ON BASE SHOW Mount Eden Base`, then asked again **5:04 later**, in the
first quiet gap past the 5-minute mark: two asks in five minutes, four lines.

✅ **An out-of-date plugin says so.** Asked of the 30 September build, which has
no `show`, onPC answered `/life/error ,s "unknown verb show"`. The dashboard
reads that exact string as "delete LifeBridge and import it again", so the
stale-import trap above shows up on the chip rather than as a silent `?`.

### The showfile, watched — LifeBridge `watch`, ✅ onPC 2.3.2.0, 2026-10-02

`Call Plugin "LifeBridge" "watch"` answers exactly as `show` does, then stays:
a loop on the console reads the same two values once a second
(`coroutine.yield(1)`) and sends `/show` again only when the answer changes.
`/watch ,s "started"`, `"already"` (one is running; this call answered and
returned) and `"stopped"` (after `unwatch`) say what the loop did. The dashboard
asks `watch` wherever it asked `show`, so a stopped watcher is restarted by the
next ask, at no extra cost in lines.

Observed on "test", with the plugin deleted and imported first:

- ✅ **MA3 keeps resuming a yielded plugin.** `unwatch` at 14:02:08.9 UTC,
  `stopped` at 14:02:09.9: the loop woke within its second and saw it.
- ✅ **The console stays responsive beside it.** While it ran, `show`, a bare
  `SendOSC` ping and a second `watch` were each answered at once, with another
  plugin's `MessageBox` open on screen as well.
- ✅ **A change arrives in about a second, unasked.** `SetUserVariable
  "SGV2_BaseShow" "Watch Test"` → `/show` with the new base 3 s after the
  watcher started, i.e. at its next wake; setting it back, 2 s later, likewise.
  In the kiosk, the chip went to ON BASE SHOW within 1.8 s and back.
- ✅ **A `LoadShow` ends the watcher.** After `LoadShow "Mount Eden Base"
  /NoConfirmation /NoSave` and loading "test" back, a base change produced
  nothing, and LifeBridge answered `unknown verb watch`: the plugin running was
  the saved show's own, older one. Nothing in memory crosses a load. So a Load
  reaches the chip at the next link-up or the next ask, not in a second.
- ❌ **A system variable does not expand inside `SendOSC`'s string.**
  `SendOSC 3 "/ping,s,x=$VERSION"` arrived as the literal `x=$VERSION`, as did
  `$SHOWFILE`, `$SHOWNAME` and `$SHOW`. So the bare ping cannot carry the show
  name, which would have caught a Load within one quiet gap.
- ⚠️ **Not yet seen: whether each push is a line on the LD's command line.** It
  is a `Cmd('SendOSC …')`, as every reply is, so presumably yes, one per change.

✅ **OSC settings are show data, and a Load replaces them.** "Mount Eden Base" as
saved on disk opens UDP 8000 only, so loading it took 8003 and 8004 away and the
dashboard had no link, and no way to send, until "test" was loaded again. Every
show a booth loads must carry the dashboard's OSC row, as well as LifeBridge, or
the link drops with the load. The 2026-09-30 link on "Mount Eden Base" was
against that show as it stood in memory, not as saved.

## UserVars

`GetVar(UserVars(), "SGV2_BaseShow")` ✅ — the form `BaseFileSaver.lua` uses.
`UserVars():Get(name)` ❌ returns empty. `$SGV2_BaseShow` on the command line
expands, but only outside quotes and only to its first word (above).

On "Mount Eden Base", `SGV2_BaseShow` = `Mount Eden Base` — the campus show names
*itself* as its base, so SaveGuard would refuse an in-place save there. Worth
knowing before building the showfile panel.

Showfile name: `Root().manetsocket.showfile` ✅.

## Web remote — the MA pane

What the MA pane stands on. Mostly 🔬 from the manual, which agrees on every point
below across **2.2, 2.3, 2.4 and 2.5** (checked 2026-09-27), so the 2.5 move should
not disturb it.

| | |
|---|---|
| ✅ What it is | A real **Display** of the station: identical to the MA, interactive (operator-observed 2026-09-27) |
| ✅ Losing the console | The page shows its own **"disconnected"** (operator-observed 2026-09-27) |
| 🔬 Address | `http://<station-ip>:8080`, any modern browser |
| ✅ Web Remote off | onPC still answers on `:8080`, **HTTP 200**, with a white page reading "Remotes are disabled!" (onPC 2.3.2.0, 2026-09-30). A loaded page is not proof the remote is on; the pane reports it as `showing`, and the picture says what is wrong. **Turning Web Remote on does not reach that page**: it stays until reloaded. The pane logs in afresh after 10 s of it (see Stuck pages below) |
| ✅ Slots full | A client past the limit is **accepted and never answered**: the TCP connection opens, no HTTP response comes, no error (onPC 2.3.2.0, 2026-09-30, one other remote open). Not a refusal, so the pane cannot tell it from a slow console. Freeing the slot made the next request answer in 1 ms. **The other form, 2026-10-01**: the page loads (HTTP 200) and sits on "Connecting to console", its WebSocket (`ws://<host>/?ma=1`) open at TCP and never answered. The pane's 15 s load timeout catches the first form, its stuck-page check the second |
| ✅ A stuck client stays stuck | A browser that lost the slot went "Disconnected", then sat on "Connecting to console" through its own reload for **5+ minutes**, with nothing else connected (`lsof`: its socket only). A kiosk with its storage cleared then connected **beside it in 10 s** (onPC 2.3.2.0, 2026-10-01). So the slot was free and the client was the stuck thing: a reload is not a way out, a clean login is |
| 🔬 The page's own recovery | From onPC 2.3.2.0's `web/js`, not watched on a desk. On a dropped socket it retries **once**: `setInterval(OpenConnection(), 2000)` calls the function rather than passing it, so a console that takes longer than an instant to come back leaves it "Disconnected" for good. The overlay text, `#startOverlayText`, says which state it is in: `Connected!`, `Connecting to console`, `Waiting for video signal.`, `Disconnected`, `Remotes are disabled!`, `Maximum connections count reached!…`, `You are black listed!`. Re-enabling a disabled remote reaches only "Waiting for video signal", because video is asked for once, on connecting |
| ✅ In the pane | The real web remote, as `Remote`, inside the kiosk on onPC 2.3.2.0, 2026-09-30 |
| 🔬 Switch | Menu › Network (or Station Control) › Web Remote On |
| 🔬 Login | Logs in as the user **`Remote`** by itself; `?user=<name>&password=<pw>` in the URL logs in as anyone else |
| 🔬 Independent user | "Can log in as a different user than the one currently logged in on the connected station" |
| 🔬 Refused users | **Admin, Guest and 3D** cannot log in to a web remote |
| 🔬 `Remote` | Every new show file has it: the default user profile with its own screen configuration |
| 🔬 Slots | **2 on a console or replay unit**; 1–5 on onPC (the Connection Limit setting). The overview says "five per station"; the menu page is the one that matters |
| 🔬 Resolution | Capped at 480p / 720p / 1080p / unlimited; 2.4+ adds 1440p and 4K, and a console tops out at 1440p |
| 🔬 Linked command line | Opt-in, by a button beside the command line. When linked, typing shows on every linked station **logged in with the same user profile**. Leave it off |
| 🔬 2.5 | Adds QR codes per network interface. Nothing the pane depends on changed |

### Stuck pages: what the pane does about them

`src/main/ma-pane.ts`, built 2026-10-01 on the rows above. Every load gives up after
**15 s** (`PANE_LOAD_TIMEOUT_MS`) and says the console "took the connection but sent
nothing back", which points at the slots rather than at Web Remote. While the pane is
on screen it reads the overlay text every 2 s, from an isolated world so none of the
page's code runs, and after **10 s** (`PANE_STUCK_MS`) of anything but `Connected!`
it clears the pane's storage and logs in again. Text it does not recognise is left
alone, so another version's wording degrades to the old behaviour, not to a reload
loop. **Reload MA** (↻ in the MA slot's strip since 2026-10-03) does the same on demand. ✅ The read works
inside the sandboxed view on onPC 2.3.2.0 (`starting` → `connected` in the log); the
fresh login after 10 s is unit-tested and argued from the rows above, not yet watched
firing.

### Still to observe on a desk

Each of these is a claim the pane's design leans on. Run them at the desk before a
service trusts the pane:

1. **Rights.** Log the pane in as a Playback-only user: can it fire, and is Store refused?
2. **Login by URL.** `?user=<name>` with no `password` parameter: accepted for a
   passwordless user? And what does the page show when a login is refused?
3. **Slots.** The kiosk holds one of two. After a kiosk crash-reload, is the old slot
   freed promptly, or can a reload loop eat both? On onPC a quit kiosk's slot was free
   by the time a fresh kiosk asked, under a minute later (2026-10-01); what stayed stuck
   was a client, not the slot. A console may differ.
4. **Silent drop.** Pull the cable rather than switching Web Remote off: how long
   until the page admits "disconnected"? Until then, our link bar is the only warning.
5. **Touch** through Electron's embedded view on the booth screen.
6. **Cost.** Does rendering an extra Display slow the console during a busy cue?
