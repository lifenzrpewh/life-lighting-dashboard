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
-- DESK RUN 1 — onPC 2.3.2.0, show "Mount Eden Base", 2026-09-20
--   ✅ SendOSC works from a plugin, INCLUDING the string form. The console
--      returned OK: for /life/probe/string,s,<text>. Channel C is viable, and
--      this is the result the architecture was waiting on.
--   ✅ Object-model reads are effectively free: 0.02 ms per sequence resolve.
--   ✅ ObjectList("Sequence n") resolves; Root().manetsocket.showfile reads.
--   ✅ Recipe lines are reachable and carry the right data — Seq 100 Cue 3
--      Part 1 returned 5 lines with Preset 21.1, exactly what LEVEL_STATES.md
--      documents for HOLDING.
--   ❌ `line.Object` is nil. MA3 properties are NOT plain Lua fields; they are
--      read with obj:Get("Name"). Field access silently yields nil, which is
--      how v0 reported a recipe line with no group as a PASS.
--   ❌ HookObjectChange returned nil. It exists but did not install with the
--      2-arg call. v0 called that a PASS because pcall did not throw.
--   ❌ UserVars():Get("SGV2_BaseShow") returned empty. BaseFileSaver.lua uses
--      GetVar(UserVars(), name); that is the form to use.
--   ⚠️ seq:Ptr(1) is POSITIONAL and returned OffCue, not cue number 1. Index is
--      not cue number anywhere in this API. Do not conflate them.
--   ⚠️ v0 scored itself 10/10 by treating "did not throw" as PASS. That is the
--      exact failure this project exists to design out, and it was in the probe
--      itself. v1 requires a usable VALUE, and has a negative control.
--
-- STATUS: ⚠️ v1 is UNVERIFIED — it fixes what run 1 found, and must be re-run.
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

-- A sequence that must NOT exist. If the probe reports this one present, the
-- resolver is lying and every other "present" result is worthless.
local NEGATIVE_CONTROL = 9987

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

--- v0 treated "did not throw" as success and so reported a nil group and a nil
--- hook id as PASSes. A probe that needs a value must say so.
local function requireValue(v, what)
  if v == nil or v == '' then return false, 'no value for ' .. what end
  return true, nil
end

--- MA3 properties are read with obj:Get(name), NOT as Lua fields, and the name
--- list is discovered via PropertyCount/PropertyName (0-based).
local function getProp(obj, name)
  local ok, v = pcall(function() return obj:Get(name) end)
  if ok then return v end
  return nil
end

local function describeValue(v)
  if v == nil then return 'nil' end
  local t = type(v)
  if t == 'userdata' then
    local ok, n = pcall(function() return v.name end)
    return ok and n ~= nil and ('handle:' .. tostring(n)) or 'handle'
  end
  return tostring(v)
end

--- Dump every property of an object. This is how we stop guessing names.
local function dumpProps(obj)
  local out = {}
  local ok, count = pcall(function() return obj:PropertyCount() end)
  if not ok or count == nil then return out end
  for i = 0, count - 1 do
    local okn, name = pcall(function() return obj:PropertyName(i) end)
    if okn and name ~= nil then
      out[#out + 1] = { name = tostring(name), value = describeValue(getProp(obj, name)) }
    end
  end
  return out
end

-- Property dumps are too long for the command line; they go in the report.
local dumps = {}
local function keepDump(label, obj)
  local list = dumpProps(obj)
  dumps[#dumps + 1] = { label = label, props = list }
  return list
end

local function propNames(list, limit)
  local names = {}
  for i = 1, math.min(#list, limit or 12) do names[#names + 1] = list[i].name end
  return tconcat(names, ' ')
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
  -- Without this control, "everything is present" and "the resolver always says
  -- yes" look identical -- and they DID, on run 1, on a show where all eight
  -- bands genuinely exist.
  local ghost = resolveSequence(NEGATIVE_CONTROL)
  if ghost ~= nil then
    return false, sformat('RESOLVER LIES: Sequence %d must not exist but resolved. '
      .. 'Every "present" result is void.', NEGATIVE_CONTROL)
  end
  return true, sformat('via %s; present: %s; control %d correctly absent',
    via or '?', tconcat(found, ' '), NEGATIVE_CONTROL)
end

--- Read one sequence's cues, timing and recipe lines. This IS the read model.
local function probeCueRead()
  for _, no in ipairs(PROBE_SEQUENCES) do
    local seq = resolveSequence(no)
    if seq ~= nil then
      local okCount, count = pcall(function() return seq:Count() end)
      if okCount and count and count > 0 then
        keepDump(sformat('Sequence %d', no), seq)

        -- Ptr(i) is POSITIONAL. On run 1, Ptr(1) was OffCue, not cue number 1.
        -- Walk positions and read each cue's real number with Get("No").
        local rows, firstReal = {}, nil
        for i = 1, count do
          local cue = seq:Ptr(i)
          if cue ~= nil then
            local cueNo = getProp(cue, 'No')
            local cueName = getProp(cue, 'Name')
            rows[#rows + 1] = sformat('[%d]%s/%s', i, describeValue(cueNo), describeValue(cueName))
            if firstReal == nil and cueNo ~= nil then firstReal = cue end
          end
        end
        if #rows > 0 then
          local target = firstReal or seq:Ptr(1)
          keepDump(sformat('Sequence %d cue', no), target)
          local part = target and target:Ptr(1) or nil
          local fade
          if part ~= nil then
            keepDump(sformat('Sequence %d cue part', no), part)
            fade = getProp(part, 'CueInFade')
          end
          local okv, why = requireValue(fade, 'CueInFade')
          return okv, sformat('Seq %d: %d cues; pos/no/name = %s; CueInFade=%s%s',
            no, count, tconcat(rows, ' '), describeValue(fade), okv and '' or ('  [' .. why .. ']'))
        end
      end
    end
  end
  return false, 'no sequence yielded a readable cue'
end

--- A recipe line is a Group + a Preset on a cue Part. Run 1 proved the lines are
--- reachable but `line.Object` was nil, because MA3 properties are not Lua
--- fields. This version DUMPS the property names so we stop guessing.
local function probeRecipeRead()
  for _, no in ipairs(PROBE_SEQUENCES) do
    local seq = resolveSequence(no)
    if seq ~= nil then
      local cueCount = select(2, pcall(function() return seq:Count() end)) or 0
      for ci = 1, cueCount do
        local cue = seq:Ptr(ci)
        if cue ~= nil then
          local partCount = select(2, pcall(function() return cue:Count() end)) or 0
          for pi = 1, partCount do
            local part = cue:Ptr(pi)
            local lineCount = part and (select(2, pcall(function() return part:Count() end)) or 0) or 0
            if lineCount > 0 then
              local line = part:Ptr(1)
              if line ~= nil then
                local list = keepDump(sformat('Seq %d Cue[%d] Part[%d] recipe line', no, ci, pi), line)

                -- Try the names the exported XML uses, plus the one v0 guessed.
                local group, groupVia
                for _, candidate in ipairs({ 'Object', 'Selection', 'Group', 'SelectionSource', 'Values' }) do
                  local v = getProp(line, candidate)
                  if v ~= nil and describeValue(v) ~= 'nil' then
                    group, groupVia = v, candidate
                    break
                  end
                end
                local preset = getProp(line, 'Preset')

                local okv, why = requireValue(group, 'the recipe line group')
                return okv, sformat(
                  'Seq %d Cue[%d] Part[%d]: %d line(s); group=%s via %s; Preset=%s; %d props: %s%s',
                  no, ci, pi, lineCount, describeValue(group), tostring(groupVia),
                  describeValue(preset), #list, propNames(list, 10),
                  okv and '' or ('  [' .. why .. ' -- see the dump in the report]'))
              end
            end
          end
        end
      end
    end
  end
  return false, 'no recipe line found on any probe sequence'
end

--- Run 1: exists, but the 2-arg call returned nil -- it did not install, and v0
--- called that a PASS. The symbol table suggests
--- HookObjectChange(callback, handle, plugin_handle[, target]).
local function probeHook()
  if HookObjectChange == nil then
    return false, 'HookObjectChange is not defined in this Lua environment'
  end
  local seq
  for _, no in ipairs(PROBE_SEQUENCES) do
    seq = seq or resolveSequence(no)
  end
  if seq == nil then return false, 'no sequence to hook' end

  local cb = function() end
  local plugin
  pcall(function() plugin = MyHandle and MyHandle() or nil end)

  local attempts = {
    { '3-arg (cb, obj, plugin)', function() return HookObjectChange(cb, seq, plugin) end },
    { '2-arg (cb, obj)', function() return HookObjectChange(cb, seq) end },
  }
  for _, a in ipairs(attempts) do
    local ok, id = pcall(a[2])
    if ok and id ~= nil then
      if UnhookMultiple then pcall(function() UnhookMultiple(seq) end) end
      return true, sformat('installed via %s, id=%s -- now change a cue and watch for a callback',
        a[1], tostring(id))
    end
  end
  return false, 'exists but no call form returned a hook id -- treat push as unavailable, keep polling'
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

  -- Run 1: UserVars():Get(...) returned empty. BaseFileSaver.lua reads it as
  -- GetVar(UserVars(), "SGV2_BaseShow"), so try that form first.
  local base, via
  for _, a in ipairs({
    { 'GetVar(UserVars(), n)', function() return GetVar(UserVars(), 'SGV2_BaseShow') end },
    { 'UserVars():Get(n)', function() return UserVars():Get('SGV2_BaseShow') end },
  }) do
    local ok, v = pcall(a[2])
    if ok and v ~= nil and tostring(v) ~= '' then
      base, via = v, a[1]
      break
    end
  end

  if not requireValue(name, 'showfile name') then return false, 'showfile name unreadable' end
  if base == nil then
    -- Genuinely absent on a show the generator never touched, so this is really
    -- a WARN -- but it must not read as a pass either.
    return false, sformat('showfile=%s but SGV2_BaseShow is empty by BOTH accessors '
      .. '(either this show was never generated, or neither form works)', tostring(name))
  end
  return true, sformat('showfile=%s  SGV2_BaseShow=%s via %s', tostring(name), tostring(base), via)
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
  -- The property dumps are the point of v1: they end the guessing about which
  -- name holds a recipe line's group. Too long for the command line, so they
  -- live here.
  lines[#lines + 1] = ''
  lines[#lines + 1] = '## Property dumps'
  if #dumps == 0 then lines[#lines + 1] = '(none captured)' end
  for _, d in ipairs(dumps) do
    lines[#lines + 1] = ''
    lines[#lines + 1] = sformat('### %s  (%d properties)', d.label, #d.props)
    for _, pr in ipairs(d.props) do
      lines[#lines + 1] = sformat('  %-28s %s', pr.name, pr.value)
    end
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
