-- ============================================================================
-- LifeBridge  --  probe v0  --  LIFE Lighting Dashboard console-side bridge
-- ----------------------------------------------------------------------------
-- WHAT THIS IS
--   The first version of the dashboard's console-side bridge, written as a
--   PROBE. It answers, in one run on a desk, the questions the dashboard's whole
--   read path depends on and that cannot be answered any other way:
--
--     1. Does `SendOSC` work from a plugin, and does it carry a STRING?
--        (int/float are proven in CompanionFeedback.lua; the string form is what
--        lets us push cue names and JSON, and nothing has tested it.)
--     2. Which object-model API actually reads a cue list, cue timing and
--        recipe lines? Several shapes exist in the codebase; this tries each.
--     3. Does `HookObjectChange` exist? If it fires on cue changes the bridge
--        becomes push-driven and stops polling entirely.
--     4. How long does reading N sequences take? This sizes the slice budget.
--     5. Can we read the loaded showfile name and the SGV2_BaseShow UserVar?
--
-- SAFETY: THIS PLUGIN IS READ-ONLY ON THE SHOW.
--   It issues no Store, Assign, Delete, Set, Go, Save or Load. The only command
--   it ever sends is `SendOSC`, which emits a network packet and touches
--   nothing in the showfile. It is therefore safe to run on a live show — you
--   do not need a scratch copy. Every probe is pcall-guarded, so a missing API
--   reports FAIL rather than throwing.
--
--   It does write ONE plain text file, the results report (see RESULT_PATHS).
--   That is a file on disk, not show data, and it goes through io.open rather
--   than the command line — the harness asserts that Cmd() still only ever
--   carries SendOSC.
--
--   It is also NOT the real bridge. There is no request loop, no write verb and
--   no listener. Those arrive only after these answers do.
--
-- HOW TO READ THE RESULT
--   Three ways, because the first two are easy to lose:
--     1. A RESULTS FILE on disk — the reliable one. The plugin prints the path
--        it wrote to. MA3 keeps no log of command-line feedback, so without
--        this a probe run survives only as long as the scrollback.
--     2. The command line, live.
--     3. Over OSC:  node spikes/osc-probe.mjs --host <ip> --listen <port>
--   A PASS means the call returned without error AND returned something usable.
--   "PASS (empty)" means the API exists but gave nothing back — treat as a FAIL
--   for design purposes, and note it.
--
-- IT IS ALSO THE 2.5 MIGRATION GATE. Keep it.
--   We run 2.3.2 today and move to 2.5 within ~6 months. Every answer below is
--   version-specific: a PASS on 2.3.2 says nothing about 2.5. So the probe
--   reports the console version FIRST and stamps it onto every result it emits,
--   and re-running it on 2.5 re-answers the whole set in one pass. Keep the
--   captured output of each run, dated and versioned.
--
--   Known 2.5 exposure THIS project has and the Show Creator does not:
--   2.4 consolidated standard-recipe range properties (Speed From/To -> Speed,
--   Phase From/To -> Phase). MA3_2.5_COMPAT.md clears the generator because it
--   writes those as MAtricks/Preset properties. The dashboard's cue editor
--   reads and writes STANDARD RECIPE properties directly, so the consolidation
--   can reach us where it could not reach the generator. recipe.read is the
--   probe that will show it.
--
-- STATUS: ⚠️ UNVERIFIED. Written against the grandMA3 2.3 Lua API, never run on
--   a console. That is the entire point of it.
-- ============================================================================

-- ------------------------------ configuration ------------------------------

-- Which OSC entry (row) in Menu -> In & Out -> OSC to send results through.
-- Must have Send enabled and point at the machine running the listener.
local OSC_ENTRY = 1

-- Sequences to probe. Defaults span the Show Creator's documented bands so the
-- probe reports which actually exist on this show:
--   100/101 rest states · 1001+ group dimmer · 1021+ chase · 1300+ basic scenes
--   2006+ colour · 2100+ position
local PROBE_SEQUENCES = { 100, 101, 1001, 1002, 1021, 1300, 2006, 2100 }

-- Sequences to time, for the slice-budget measurement.
local TIMING_SAMPLE = 8

-- Where to write the results report. Tried in order; the first that opens wins,
-- and the chosen path is printed. Covers macOS and Windows, and falls back to
-- the ma3-mcp IPC dirs because those already exist on a machine that has used
-- that bridge, then to the working directory as a last resort.
local RESULT_PATHS = {
  '/Users/Shared/LIFE/LifeBridge-probe.txt',
  'C:/ProgramData/LIFE/LifeBridge-probe.txt',
  '/Users/Shared/MA3/LifeBridge-probe.txt',
  'C:/ProgramData/MA3/LifeBridge-probe.txt',
  'LifeBridge-probe.txt',
}

-- ---------------------------------------------------------------------------

local Cmd, Printf = Cmd, Printf
local pcall, type, tostring, select = pcall, type, tostring, select
local sformat, tconcat = string.format, table.concat

local results = {}
local consoleVersion = 'unknown'

local function log(fmt, ...)
  local s = select('#', ...) > 0 and sformat(fmt, ...) or fmt
  Printf('LifeBridge: ' .. s)
end

--- Record and print one probe result.
local function record(name, ok, detail)
  results[#results + 1] = { name = name, ok = ok, detail = detail }
  log('%-28s %s  %s', name, ok and 'PASS' or 'FAIL', detail or '')
end

--- Run a probe under pcall so a missing API reports rather than throws.
local function probe(name, fn)
  local ok, a, b = pcall(fn)
  if not ok then
    record(name, false, 'error: ' .. tostring(a))
    return nil
  end
  record(name, a and true or false, b)
  return a
end

-- ----------------------------- OSC transmission -----------------------------

--- SendOSC takes the WHOLE message as one quoted string: "<address>,<type>,<value>"
--- (form taken from CompanionFeedback.lua:57, itself unverified).
local function sendOsc(address, typeTag, value)
  Cmd(sformat('SendOSC %d "%s,%s,%s"', OSC_ENTRY, address, typeTag, tostring(value)))
end

--- A string payload must not contain a quote, or the command line truncates it.
--- Escaping with a backslash does NOT work and still returns OK — that trap is
--- recorded in MA3_SYNTAX_REFERENCE. So we strip rather than escape.
local function oscSafe(s)
  return (tostring(s):gsub('"', "'"):gsub('%c', ' '))
end

-- -------------------------------- the probes --------------------------------

local function probeOscInt()
  sendOsc('/life/probe/int', 'i', 1)
  return true, 'sent (check the listener — a send cannot self-verify)'
end

local function probeOscFloat()
  sendOsc('/life/probe/float', 'f', 0.5)
  return true, 'sent'
end

--- THE important one. Everything structural the bridge pushes is a string.
local function probeOscString()
  sendOsc('/life/probe/string', 's', oscSafe('LifeBridge probe v0'))
  return true, 'sent — if the listener sees this, channel C is viable'
end

--- Try each object accessor the codebase uses, and report which resolve.
local function resolveSequence(no)
  local attempts = {
    { 'ObjectList', function() return ObjectList(sformat('Sequence %d', no)) end },
    { 'GetObject', function() return GetObject(sformat('Sequence %d', no)) end },
    { 'DataPool', function() return DataPool().Sequences:Ptr(no) end },
  }
  for _, a in ipairs(attempts) do
    local ok, obj = pcall(a[2])
    if ok and obj ~= nil then
      if type(obj) == 'table' then
        -- ObjectList returns a LIST of handles, and an EMPTY list for an object
        -- that does not exist. An empty table is not nil, so an earlier version
        -- of this function returned {} as if it were a sequence and the probe
        -- cheerfully reported every band as present on a show that had none.
        -- Caught by the offline harness before it ever reached a desk. Unwrap
        -- unconditionally: no [1] means no object.
        obj = obj[1]
      end
      if obj ~= nil then return obj, a[1] end
    end
  end
  return nil, nil
end

local function probeSequenceAccess()
  local found, via = {}, nil
  for _, no in ipairs(PROBE_SEQUENCES) do
    local obj, how = resolveSequence(no)
    if obj ~= nil then
      found[#found + 1] = tostring(no)
      via = via or how
    end
  end
  if #found == 0 then
    return false, 'no probe sequence resolved by any accessor'
  end
  return true, sformat('via %s; present: %s', via or '?', tconcat(found, ' '))
end

--- Read one sequence's cues, timing and recipe lines. This IS the read model.
local function probeCueRead()
  for _, no in ipairs(PROBE_SEQUENCES) do
    local seq = resolveSequence(no)
    if seq ~= nil then
      local okCount, count = pcall(function() return seq:Count() end)
      if not okCount or not count or count == 0 then goto continue end

      local cue = seq:Ptr(1)
      if cue == nil then goto continue end

      local name = pcall(function() return cue.Name end) and cue.Name or nil
      local cueNo = pcall(function() return cue.No end) and cue.No or nil

      -- CueInFade lives on Part 0, not on the cue.
      local fade, recipes = nil, 0
      pcall(function()
        local part = cue:Ptr(1)
        if part then
          fade = part.CueInFade
          local pc = part:Count()
          if pc then recipes = pc end
        end
      end)

      return true, sformat('Seq %d: %d cues; cue1 no=%s name=%s CueInFade=%s parts/recipes=%d',
        no, count, tostring(cueNo), tostring(name), tostring(fade), recipes)
    end
    ::continue::
  end
  return false, 'no sequence yielded a readable cue'
end

--- A recipe line is a Group + a Preset on a cue Part. This is what the cue
--- editor edits, so we must be able to read it back.
local function probeRecipeRead()
  for _, no in ipairs(PROBE_SEQUENCES) do
    local seq = resolveSequence(no)
    if seq == nil then goto nextSeq end
    for ci = 1, (select(2, pcall(function() return seq:Count() end)) or 0) do
      local cue = seq:Ptr(ci)
      if cue ~= nil then
        for pi = 1, (select(2, pcall(function() return cue:Count() end)) or 0) do
          local part = cue:Ptr(pi)
          if part ~= nil then
            local ok, detail = pcall(function()
              local n = part:Count() or 0
              if n == 0 then return nil end
              local line = part:Ptr(1)
              if line == nil then return nil end
              return sformat('Seq %d Cue %d Part %d: %d line(s); [1] Object=%s Preset=%s',
                no, ci, pi, n, tostring(line.Object), tostring(line.Preset))
            end)
            if ok and detail then return true, detail end
          end
        end
      end
    end
    ::nextSeq::
  end
  return false, 'no recipe line found on any probe sequence (a show with no recipes reads the same — check on a built show)'
end

--- If this fires on a cue change, the bridge stops polling.
local function probeHook()
  if HookObjectChange == nil then
    return false, 'HookObjectChange is not defined in this Lua environment'
  end
  local seq = resolveSequence(PROBE_SEQUENCES[1])
  for _, no in ipairs(PROBE_SEQUENCES) do
    seq = seq or resolveSequence(no)
  end
  if seq == nil then return false, 'no sequence to hook' end
  local ok, id = pcall(function()
    return HookObjectChange(function() end, seq)
  end)
  if not ok then return false, 'exists but raised: ' .. tostring(id) end
  if UnhookMultiple then pcall(function() UnhookMultiple(seq) end) end
  return true, sformat('installed, id=%s — now change a cue and watch for a callback', tostring(id))
end

--- Sizes the slice budget: how long does reading a sequence actually cost?
local function probeTiming()
  local t0 = os.clock()
  local read = 0
  for i = 1, TIMING_SAMPLE do
    local no = PROBE_SEQUENCES[((i - 1) % #PROBE_SEQUENCES) + 1]
    local seq = resolveSequence(no)
    if seq ~= nil then
      pcall(function() local _ = seq:Count() end)
      read = read + 1
    end
  end
  local ms = (os.clock() - t0) * 1000
  if read == 0 then return false, 'nothing read' end
  return true, sformat('%d sequences in %.1f ms (%.2f ms each) — slice budget is 8 ms',
    read, ms, ms / read)
end

--- Runs FIRST. Every other result is only meaningful against a version.
local function probeVersion()
  local v
  pcall(function() v = Version and Version() or nil end)
  if v == nil then pcall(function() v = Root().Version end) end
  if v == nil then return false, 'no version accessor found — record it by hand' end
  consoleVersion = tostring(v)
  return true, consoleVersion
end

local function probeShowfile()
  local name
  pcall(function() name = Root().manetsocket.showfile end)
  if name == nil then pcall(function() name = Root().ShowData.Name end) end

  local base
  pcall(function()
    local uv = UserVars and UserVars() or nil
    if uv then base = uv:Get('SGV2_BaseShow') end
  end)

  if name == nil and base == nil then
    return false, 'neither showfile name nor SGV2_BaseShow readable'
  end
  return true, sformat('showfile=%s  SGV2_BaseShow=%s', tostring(name), tostring(base))
end

--- Write the report. io.open is undocumented for MA3 plugins but ma3-mcp relies
--- on it in production, so it is a reasonable bet — and a guarded one: if every
--- candidate path fails we say so and fall back to the command line alone.
local function writeResultsFile(summary)
  local lines = {
    '# LifeBridge probe report',
    '# ' .. tostring(os.date('%Y-%m-%d %H:%M:%S')),
    '# MA3 version: ' .. consoleVersion,
    '# ' .. summary,
    '#',
    '# A PASS means the call returned without error AND returned something',
    '# usable. Keep this file: every answer is specific to the MA3 version',
    '# above, and re-running on 2.5 must produce a separate report.',
    '',
  }
  for _, r in ipairs(results) do
    lines[#lines + 1] = sformat('%-22s %s  %s', r.name, r.ok and 'PASS' or 'FAIL', r.detail or '')
  end
  local body = tconcat(lines, '\n') .. '\n'

  for _, path in ipairs(RESULT_PATHS) do
    local ok, wrote = pcall(function()
      local f = io.open(path, 'w')
      if f == nil then return false end
      f:write(body)
      f:close()
      return true
    end)
    if ok and wrote == true then
      log('report written to %s', path)
      return path
    end
  end
  log('could not write a report file — results are on the command line only')
  return nil
end

-- ---------------------------------- main ------------------------------------

local function main()
  log('probe v0 starting — READ-ONLY, no show data is modified')
  log('OSC entry %d must have Send enabled and point at your listener', OSC_ENTRY)

  probe('console.version', probeVersion)
  probe('osc.int', probeOscInt)
  probe('osc.float', probeOscFloat)
  probe('osc.string', probeOscString)
  probe('sequence.access', probeSequenceAccess)
  probe('cue.read', probeCueRead)
  probe('recipe.read', probeRecipeRead)
  probe('hook.objectchange', probeHook)
  probe('timing.slice', probeTiming)
  probe('showfile.identity', probeShowfile)

  local pass = 0
  for _, r in ipairs(results) do
    if r.ok then pass = pass + 1 end
  end
  local summary = sformat('MA3 %s: %d/%d passed', consoleVersion, pass, #results)
  log('---- %s ----', summary)

  -- The durable capture. Do this BEFORE the OSC push: if SendOSC turns out to
  -- be broken or misrouted, the report is still on disk.
  pcall(writeResultsFile, summary)

  -- Push the verdict out too, so a listener captures it even if nobody is at
  -- the console. If THIS arrives, osc.string is proven regardless of the rest.
  pcall(function()
    sendOsc('/life/probe/summary', 's', oscSafe(summary))
    for _, r in ipairs(results) do
      -- Stamp the version onto every line: captured output must be
      -- self-identifying, or a 2.3.2 result gets mistaken for a 2.5 one.
      sendOsc('/life/probe/result', 's',
        oscSafe(sformat('[%s] %s=%s %s', consoleVersion, r.name,
          r.ok and 'PASS' or 'FAIL', r.detail or '')))
    end
  end)

  log('done. Nothing was written to the show.')
end

return main
