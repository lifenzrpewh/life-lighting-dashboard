-- Offline harness for LifeBridge. Mocks the entire MA3 API and runs the plugin
-- end to end, the way the Show Creator's harnesses do. Never shipped to a desk.
--
--   lua console-plugin/_test_lifebridge.lua
--
-- The point of this file is NOT to prove the probes are right — only a console
-- can do that. It proves the plugin cannot THROW, cannot WRITE, and degrades to
-- honest FAILs on a console whose API differs from our guesses. Those three
-- properties are what make it safe to run on a live show.

local checks, failures = 0, 0

local function check(label, cond, detail)
  checks = checks + 1
  if not cond then
    failures = failures + 1
    print(string.format('  FAIL  %s%s', label, detail and ('  -- ' .. detail) or ''))
  end
end

-- ----------------------------- the MA3 mock --------------------------------

local cmds, prints

--- Build a mock object tree: sequence -> cues -> parts -> recipe lines.
local function mockObject(fields, children)
  local o = {}
  for k, v in pairs(fields or {}) do o[k] = v end
  local kids = children or {}
  function o:Count() return #kids end
  function o:Ptr(i) return kids[i] end
  return o
end

local function richEnvironment()
  local line = mockObject({ Object = 'Group 3', Preset = 'Dimmer.At Full' })
  local part = mockObject({ CueInFade = 2.0 }, { line })
  local cue = mockObject({ No = 1, Name = 'Wash' }, { part })
  local seq = mockObject({ Name = 'Dimmer G1' }, { cue })

  _G.Cmd = function(s) cmds[#cmds + 1] = s end
  _G.Printf = function(s) prints[#prints + 1] = s end
  _G.ObjectList = function(addr)
    -- Only the documented bands exist, so the probe must report which resolved.
    if addr:match('Sequence 100[12]') or addr:match('Sequence 100$') then return { seq } end
    return {}
  end
  _G.GetObject = function() return nil end
  _G.DataPool = function() return { Sequences = { Ptr = function() return nil end } } end
  _G.Root = function() return { manetsocket = { showfile = 'Sunday 21 Sep' }, Version = '2.3.2.0' } end
  _G.UserVars = function() return { Get = function(_, k)
    return k == 'SGV2_BaseShow' and 'LIFE Basefile Master' or nil
  end } end
  _G.Version = function() return '2.3.2.0' end
  _G.HookObjectChange = function() return 7 end
  _G.UnhookMultiple = function() end
end

--- A console where none of our guesses hold. Everything must FAIL, not throw.
local function bareEnvironment()
  _G.Cmd = function(s) cmds[#cmds + 1] = s end
  _G.Printf = function(s) prints[#prints + 1] = s end
  for _, k in ipairs({ 'ObjectList', 'GetObject', 'DataPool', 'Root', 'UserVars',
                       'Version', 'HookObjectChange', 'UnhookMultiple' }) do
    _G[k] = nil
  end
end

--- A console that raises on every accessor — the nastiest realistic case.
local function hostileEnvironment()
  _G.Cmd = function(s) cmds[#cmds + 1] = s end
  _G.Printf = function(s) prints[#prints + 1] = s end
  local boom = function() error('object model unavailable', 0) end
  for _, k in ipairs({ 'ObjectList', 'GetObject', 'DataPool', 'Root', 'UserVars',
                       'Version', 'HookObjectChange' }) do
    _G[k] = boom
  end
  _G.UnhookMultiple = boom
end

local function run(setup)
  cmds, prints = {}, {}
  setup()
  local main = assert(loadfile('console-plugin/LifeBridge.lua'))()
  local ok, err = pcall(main)
  return ok, err, cmds, prints
end

-- -------------------------------- scenarios ---------------------------------

print('LifeBridge harness')

-- 1. Rich console.
do
  local ok, err, c, p = run(richEnvironment)
  check('rich: does not throw', ok, tostring(err))
  check('rich: emits commands', #c > 0)
  check('rich: prints results', #p > 5)

  local joined = table.concat(p, '\n')
  for _, name in ipairs({ 'console.version', 'osc.int', 'osc.float', 'osc.string',
                          'sequence.access', 'cue.read', 'recipe.read',
                          'hook.objectchange', 'timing.slice', 'showfile.identity' }) do
    check('rich: probe reported -- ' .. name, joined:find(name, 1, true) ~= nil)
  end

  check('rich: reads the cue', joined:find('CueInFade=2.0', 1, true) ~= nil, joined)
  check('rich: reads the recipe line', joined:find('Group 3', 1, true) ~= nil)
  check('rich: reads the showfile', joined:find('Sunday 21 Sep', 1, true) ~= nil)
  check('rich: reports the base show', joined:find('LIFE Basefile Master', 1, true) ~= nil)
  check('rich: only the present sequences resolve',
    joined:find('present: 100 1001 1002', 1, true) ~= nil, joined)

  -- The regression this harness caught: ObjectList returns {} for a missing
  -- object, and {} is not nil. Absent bands must NOT be reported present.
  check('rich: absent sequences are not reported present',
    joined:find('2100', 1, true) == nil, joined)

  -- THE safety invariant. If this ever fails, someone gave the probe a write.
  for _, cmd in ipairs(c) do
    check('rich: command is SendOSC only', cmd:match('^SendOSC %d+ ".*"$') ~= nil, cmd)
  end

  -- Every emitted result must carry the version, or captured output from a
  -- 2.3.2 run is indistinguishable from a 2.5 one.
  local resultLines, stamped = 0, 0
  for _, cmd in ipairs(c) do
    if cmd:find('/life/probe/result', 1, true) then
      resultLines = resultLines + 1
      if cmd:find('[2.3.2.0]', 1, true) then stamped = stamped + 1 end
    end
  end
  check('rich: emits a line per probe', resultLines >= 10, tostring(resultLines))
  check('rich: every emitted line is version-stamped', resultLines == stamped,
    string.format('%d of %d', stamped, resultLines))

  -- A quote in a payload truncates the command line, and backslash-escaping it
  -- still returns OK — so it must be stripped, never escaped.
  for _, cmd in ipairs(c) do
    local _, body = cmd:match('^SendOSC (%d+) "(.*)"$')
    check('rich: payload carries no bare quote', body == nil or body:find('"') == nil, cmd)
  end
end

-- 2. Bare console: every API missing.
do
  local ok, err, c, p = run(bareEnvironment)
  check('bare: does not throw', ok, tostring(err))
  local joined = table.concat(p, '\n')
  check('bare: reports FAIL, not a fake pass', joined:find('FAIL', 1, true) ~= nil)
  check('bare: says the version is unknown',
    joined:find('no version accessor', 1, true) ~= nil, joined)
  check('bare: still emits over OSC', #c > 0)
  for _, cmd in ipairs(c) do
    check('bare: command is SendOSC only', cmd:match('^SendOSC %d+ ".*"$') ~= nil, cmd)
  end
end

-- 3. Hostile console: every accessor raises.
do
  local ok, err, c, p = run(hostileEnvironment)
  check('hostile: does not throw', ok, tostring(err))
  local joined = table.concat(p, '\n')
  check('hostile: reports failures', joined:find('FAIL', 1, true) ~= nil)
  check('hostile: never claims a pass it did not get',
    joined:find('10/10 passed', 1, true) == nil, joined)
  for _, cmd in ipairs(c) do
    check('hostile: command is SendOSC only', cmd:match('^SendOSC %d+ ".*"$') ~= nil, cmd)
  end
end

print(string.format('%d checks, %d failed', checks, failures))
if failures > 0 then os.exit(1) end
print('LIFEBRIDGE HARNESS: OK')
