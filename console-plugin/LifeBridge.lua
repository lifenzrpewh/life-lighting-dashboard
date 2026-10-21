-- ============================================================================
-- LifeBridge  --  the booth build  --  Pāua's console-side bridge
-- ----------------------------------------------------------------------------
-- WHAT THIS IS
--   The smallest plugin Pāua needs on a booth console: three verbs, each a
--   read and a `SendOSC`, nothing else.
--
--     show      the loaded showfile, and SaveGuard's verdict on it
--     watch     answer as `show`, then push the name again when it changes,
--               for WATCH_LIFETIME_WAKES seconds at most
--     unwatch   end a running watcher at its next wake
--     shows     the console's show files, for the Load list
--
-- WHY IT IS THIS SMALL (2026-10-21): Central's MA3 Light crashed twice,
--   19 and 20 Oct, `Program Error Memory`, running a month-old LifeBridge that
--   ran its whole desk probe, `HookObjectChange` included, on every call Pāua
--   made (docs/MA3_READ_MODEL.md § Suspected in a console crash). The probe now
--   lives in LifeBridgeProbe.lua, for onPC and test shows only. What runs at a
--   booth reads two values and a folder listing, and sends packets.
--
-- SAFETY: READ-ONLY ON THE SHOW. The only command this plugin ever issues is
--   `SendOSC`; it writes no file, prints nothing, and never calls
--   `HookObjectChange`. The harness (`_test_lifebridge.lua`) fails if any of
--   that changes. A call with no verb (a tap in the pool) does nothing at all.
--
-- THE BUILD STAMP. Every reply starts with BUILD, a hash of this file that
--   `npm run build:plugin` writes, and Pāua works only with the build it was
--   built with (src/shared/lifebridge-build.ts). A console keeps running the
--   plugin it loaded last, through a re-import over it and inside every show
--   saved with it, which is how Central came to run September's. So a stale
--   plugin is refused by name, and Pāua says to delete it and import this one.
--   Do not edit BUILD by hand: a test fails if it is not this file's hash.
--
-- DEPLOYING: `npm run build:plugin`, then on the console DELETE the plugin
--   and import console-plugin/LifeBridge.xml. Importing over it keeps the old
--   code running (❌ 2026-09-21). Then save every show the booth loads with it.
-- ============================================================================

-- ------------------------------ configuration ------------------------------

local BUILD = 'lb-148dad65'

-- Which OSC entry (row) in Menu -> In & Out -> OSC to send through: the
-- dashboard's own row, never Companion's (docs/PLAN.md spike 3). A test holds
-- src/bridge/ping.ts to the same row.
local OSC_ENTRY = 3

-- How often a watcher reads the show, and how many wakes it lives. Bounded so
-- no loop runs on a console for days: Pāua asks again when it hears `expired`,
-- which starts a fresh one. Thirty minutes at one wake a second.
local WATCH_EVERY_S = 1
local WATCH_LIFETIME_WAKES = 1800

-- The Load list is packed to SHOWS_CHUNK characters a message, SHOWS_MAX names.
local SHOWS_MAX = 40
local SHOWS_CHUNK = 180

-- SaveGuard's fallback base name, mirrored so that the verdict below is the one
-- SaveGuard reaches. It applies only to a show with no SGV2_BaseShow, one the
-- Showfile Generator never ran on. Keep it in step with BASE_SHOW_NAME in the
-- Show Creator's plugin/SaveGuard.lua.
local SAVEGUARD_DEFAULT_BASE = 'LIFE Basefile Master'

-- ---------------------------------------------------------------------------

local Cmd = Cmd
local pcall, type, tostring, select = pcall, type, tostring, select
local sformat, tconcat = string.format, table.concat

-- ----------------------------- OSC transmission -----------------------------

--- SendOSC takes the WHOLE message as one quoted string: "<address>,<type>,<value>"
---
--- ⚠️ ADDRESSES HERE ARE BARE -- `/show`, not `/life/show`. SendOSC prepends the
--- OSC entry's own Prefix (✅ 2026-09-21). Do not "fix" this by adding it back.
local function sendOsc(address, typeTag, value)
  Cmd(sformat('SendOSC %d "%s,%s,%s"', OSC_ENTRY, address, typeTag, tostring(value)))
end

--- A string payload must not contain a quote, or the command line truncates it.
--- Escaping with a backslash does NOT work and still returns OK, so strip.
local function oscSafe(s)
  -- ASCII only: ✅ 2026-09-21, SendOSC does not carry UTF-8 intact.
  -- No commas: ✅ 2026-09-30, SendOSC splits its string on every comma and
  -- drops the rest with OK. A semicolon stands in.
  return (tostring(s)
    :gsub('"', "'")
    :gsub(',', ';')
    :gsub('%c', ' ')
    :gsub('[\128-\255]+', '-'))
end

--- One field of a `|`-separated reply.
local function fieldSafe(s)
  return (oscSafe(s):gsub('|', '/'))
end

--- Every reply: the build first, then the fields. Pāua reads nothing from a
--- reply whose first field is not its own build.
local function reply(address, fields)
  sendOsc(address, 's', BUILD .. '|' .. tconcat(fields, '|'))
end

-- ------------------------------- the reads ----------------------------------

local function consoleVersion()
  local v
  pcall(function() v = Version and Version() or nil end)
  if v == nil then pcall(function() v = Root().Version end) end
  return v == nil and 'unknown' or tostring(v)
end

--- SaveGuard.lua's baseShowName(), line for line, plus where the answer came
--- from, so the dashboard can say when it is SaveGuard's default and not the
--- show's own.
local function baseShowName()
  local ok, v = pcall(function() return GetVar(UserVars(), 'SGV2_BaseShow') end)
  if ok and v ~= nil and tostring(v) ~= '' then return tostring(v), 'uservar' end
  return SAVEGUARD_DEFAULT_BASE, 'default'
end

--- SaveGuard.lua's normalise(), line for line: any path and the .show
--- extension off the live showfile string.
local function normaliseShowName(raw)
  if type(raw) ~= 'string' or raw == '' then return nil end
  return raw:match('([^/\\]+)%.show$')
    or raw:match('([^/\\]+)$')
    or raw
end

-- --------------------------------- show -------------------------------------

--- `show` — the loaded showfile, and whether it is the base show.
---
--- WHY THE VERDICT IS MADE HERE: SaveGuard refuses an in-place save on the base
--- show, and the dashboard's ON BASE SHOW must agree with it exactly. The names
--- cannot be compared at the far end, because the trip mangles them, so both
--- are read and compared here and travel only to be displayed.
---
--- One message:
---   /show ,s "<build>|<version>|base|<from>|<name>|<base>"    on the base show
---   /show ,s "<build>|<version>|other|<from>|<name>|<base>"   on any other
---   /show ,s "<build>|<version>|unreadable"                   no showfile name
--- where <from> is `uservar` (SGV2_BaseShow) or `default` (SaveGuard's own).
local function showFields()
  local version = fieldSafe(consoleVersion())
  local raw
  pcall(function() raw = Root().manetsocket.showfile end)
  local name = normaliseShowName(raw)
  if name == nil then return { version, 'unreadable' } end
  local base, from = baseShowName()
  return { version, name == base and 'base' or 'other', from, fieldSafe(name), fieldSafe(base) }
end

local function showVerb()
  reply('/show', showFields())
end

-- --------------------------------- watch ------------------------------------

--- `watch` — answer as `show` does, then keep watching, and say it again only
--- when it changes.
---
--- WHY: an ask is two lines on the LD's command line, so Pāua asks rarely; the
--- watcher reads the same values in-process once a second (an object read is
--- ~0.01 ms) and puts nothing on the command line until the answer changes.
---
--- One watcher at a time: a second `watch` answers and returns. The token is a
--- fresh table per loop, so `unwatch` then `watch` cannot leave an old loop
--- running beside the new one.
---
--- BOUNDED (2026-10-21): it ends itself after WATCH_LIFETIME_WAKES and says
--- `expired`, and Pāua's answer is a fresh `watch`. A LoadShow ends it too (the
--- new show runs its own plugin; ✅ onPC 2.3.2.0, 2026-10-02).
---   /watch ,s "<build>|started"   "<build>|already"
---   /watch ,s "<build>|expired"   "<build>|stopped" (after `unwatch`)
local watcher = nil

local function watchVerb()
  local said = showFields()
  reply('/show', said)
  if watcher ~= nil then
    reply('/watch', { 'already' })
    return
  end
  local me = {}
  watcher = me
  reply('/watch', { 'started' })
  local said_s = tconcat(said, '|')
  for _ = 1, WATCH_LIFETIME_WAKES do
    coroutine.yield(WATCH_EVERY_S)
    if watcher ~= me then
      reply('/watch', { 'stopped' })
      return
    end
    local now = showFields()
    local now_s = tconcat(now, '|')
    if now_s ~= said_s then
      reply('/show', now)
      said_s = now_s
    end
  end
  watcher = nil
  reply('/watch', { 'expired' })
end

--- `unwatch` — the watcher ends at its next wake and says `stopped`.
local function unwatchVerb()
  watcher = nil
end

-- --------------------------------- shows ------------------------------------

--- `shows` — the show files on this console, newest first, for the Load list
--- (docs/PLAN.md Phase 3). A directory listing; the Load itself is Pāua's own
--- `LoadShow` over channel A, behind its guards.
---
--- WHERE THE FILES ARE is asked several ways, and the reply names the way that
--- worked. Nothing found is `unreadable` with every way tried, never an empty
--- list, which would read as a console with no shows.
---   /shows ,s "<build>|<version>|<way>|<part>/<parts>|<name>|<name>…"
---   /shows ,s "<build>|<version>|unreadable|<ways tried>"
--- A name the trip would change comes with a leading `!`: Pāua shows it but
--- cannot send it back in a `LoadShow`.
local function showFolderCandidates()
  local out = {}
  local function try(way, f)
    local ok, v = pcall(f)
    if ok and type(v) == 'string' and v ~= '' then out[#out + 1] = { way, v } end
  end
  try('GetPath(Enums.PathType.Showfiles)', function() return GetPath(Enums.PathType.Showfiles) end)
  try('GetPath(shows)', function() return GetPath('shows') end)
  try('GetPathOverrideFor(shows)', function() return GetPathOverrideFor('shows', GetPath('shows')) end)
  return out
end

local function listShows()
  local tried = {}
  for _, c in ipairs(showFolderCandidates()) do
    local way, folder = c[1], c[2]
    local ok, list = pcall(function() return DirList(folder, '*.show') end)
    if ok and type(list) == 'table' then
      local shows = {}
      for _, f in ipairs(list) do
        local name = type(f) == 'table' and f.name or f
        if type(name) == 'string' then
          local bare = name:match('^(.*)%.show$') or name
          shows[#shows + 1] = { name = bare, time = type(f) == 'table' and tonumber(f.time) or 0 }
        end
      end
      table.sort(shows, function(a, b)
        if a.time ~= b.time then return a.time > b.time end
        return a.name < b.name
      end)
      return way, shows
    end
    tried[#tried + 1] = way
  end
  if #tried == 0 then tried[1] = 'no show folder found' end
  return nil, tried
end

local function showsVerb()
  local version = fieldSafe(consoleVersion())
  local way, shows = listShows()
  if way == nil then
    reply('/shows', { version, 'unreadable', fieldSafe(tconcat(shows, '; ')) })
    return
  end
  local names = {}
  for i = 1, math.min(#shows, SHOWS_MAX) do
    local raw = shows[i].name
    local sent = fieldSafe(raw)
    names[#names + 1] = (sent == raw and '' or '!') .. sent
  end
  local chunks, current = {}, {}
  local size = 0
  for _, n in ipairs(names) do
    if #current > 0 and size + #n + 1 > SHOWS_CHUNK then
      chunks[#chunks + 1] = current
      current, size = {}, 0
    end
    current[#current + 1] = n
    size = size + #n + 1
  end
  chunks[#chunks + 1] = current
  for i, chunk in ipairs(chunks) do
    reply('/shows', { version, fieldSafe(way), sformat('%d/%d', i, #chunks), tconcat(chunk, '|') })
  end
end

-- ---------------------------------- main ------------------------------------

local function main(...)
  -- The verb is the first non-empty STRING among the arguments, wherever MA3
  -- puts it (✅ onPC 2.3.2.0: `Call Plugin "LifeBridge" "watch"` arrives).
  local verb = ''
  for i = 1, select('#', ...) do
    local a = select(i, ...)
    if verb == '' and type(a) == 'string' and a:match('%S') then
      verb = a:match('^%s*(%S*)')
    end
  end

  -- No verb does nothing at all: no read, no line, no packet. A tap in the
  -- pool is not a request.
  if verb == '' then return end

  if verb == 'show' then return showVerb() end
  if verb == 'watch' then return watchVerb() end
  if verb == 'unwatch' then return unwatchVerb() end
  if verb == 'shows' then return showsVerb() end

  -- An unrecognised verb says so, once, and does nothing else. `probe`, `pool`
  -- and `ping` are LifeBridgeProbe's now.
  pcall(reply, '/error', { fieldSafe('unknown verb ' .. verb) })
end

return main
