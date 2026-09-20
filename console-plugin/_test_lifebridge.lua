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

local cmds, prints, files

--- Intercept io.open so the harness never touches real disk. The plugin's
--- fallback path list includes /Users/Shared/MA3/, which exists and is
--- world-writable on the dev Mac — an unmocked run would write there for real.
local realOpen = io.open
local function mockIO(writablePattern)
  io.open = function(path, mode)
    if writablePattern == nil or not path:match(writablePattern) then return nil end
    local buf = {}
    return {
      write = function(_, s) buf[#buf + 1] = s end,
      close = function() files[path] = table.concat(buf) end,
    }
  end
end

--- Build a mock object tree: sequence -> cues -> parts -> recipe lines.
--- MA3 properties are read with obj:Get(name) and enumerated with
--- PropertyCount/PropertyName (0-based), NOT as Lua fields. Modelling that is
--- the whole reason v0's false PASSes were invisible to the old mock.
local function mockObject(fields, children)
  local o = {}
  local f = fields or {}
  local names = {}
  for k in pairs(f) do names[#names + 1] = k end
  table.sort(names)
  local kids = children or {}
  function o:Count() return #kids end
  function o:Ptr(i) return kids[i] end
  function o:Get(n) return f[n] end
  function o:PropertyCount() return #names end
  function o:PropertyName(i) return names[i + 1] end
  return o
end

--- The shape the real desk showed: the recipe line's group is NOT at .Object,
--- and position 1 of a sequence is OffCue, which has no cue number.
local function mockSequence()
  local line = mockObject({ Selection = 'Group 3', Preset = 'Preset 21.1' })
  local part = mockObject({ CueInFade = 2.0 }, { line })
  local cue = mockObject({ No = 1, Name = 'Wash' }, { part })
  local offCue = mockObject({ Name = 'OffCue' })
  return mockObject({ Name = 'Dimmer G1' }, { offCue, cue })
end

local function installCommon(seq)
  _G.Cmd = function(s) cmds[#cmds + 1] = s end
  _G.Printf = function(s) prints[#prints + 1] = s end
  _G.ObjectList = function(addr)
    if addr:match('Sequence 100[12]') or addr:match('Sequence 100$') then return { seq } end
    return {}   -- including the negative control
  end
  _G.GetObject = function() return nil end
  _G.DataPool = function() return { Sequences = { Ptr = function() return nil end } } end
  _G.Root = function() return { manetsocket = { showfile = 'Sunday 21 Sep' }, Version = '2.3.2.0' } end
  _G.UserVars = function() return { Get = function() return nil end } end
  _G.GetVar = function(_, k) return k == 'SGV2_BaseShow' and 'LIFE Basefile Master' or nil end
  _G.Version = function() return '2.3.2.0' end
  _G.MyHandle = function() return 'plugin-handle' end
  _G.HookObjectChange = function() return 7 end
  _G.UnhookMultiple = function() end
end

local function richEnvironment()
  installCommon(mockSequence())
end

--- A console that resolves objects and reports children, but whose Get() always
--- returns nil. This is v0's exact failure: it scored 10/10 against a desk that
--- was telling it nothing. v1 must FAIL here.
local function lyingEnvironment()
  local line = mockObject({})
  local part = mockObject({}, { line })
  local cue = mockObject({}, { part })
  installCommon(mockObject({}, { cue }))
end

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

local function run(setup, writablePattern)
  cmds, prints, files = {}, {}, {}
  mockIO(writablePattern)
  setup()
  local main = assert(loadfile('console-plugin/LifeBridge.lua'))()
  local ok, err = pcall(main)
  io.open = realOpen
  return ok, err, cmds, prints
end

-- -------------------------------- scenarios ---------------------------------

print('LifeBridge harness')

-- 1. Rich console.
do
  local ok, err, c, p = run(richEnvironment, '^/Users/Shared/LIFE/')
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
  check('rich: reads the recipe line', joined:find('Group 3', 1, true) ~= nil, joined)
  -- The desk showed the group is not at .Object; the probe must say where it is.
  check('rich: names the property the group came from',
    joined:find('via Selection', 1, true) ~= nil, joined)
  -- Ptr(1) is positional and is OffCue; the probe must not call that cue 1.
  check('rich: distinguishes position from cue number',
    joined:find('[1]nil/OffCue', 1, true) ~= nil, joined)
  check('rich: proves the resolver can say no',
    joined:find('control 9987 correctly absent', 1, true) ~= nil, joined)
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

  -- The durable capture. MA3 keeps no log of command-line feedback, so without
  -- this a probe run survives only as long as the scrollback.
  local reportPath, report = next(files)
  check('rich: writes a report file', reportPath ~= nil)
  check('rich: writes to the first candidate path',
    reportPath == '/Users/Shared/LIFE/LifeBridge-probe.txt', tostring(reportPath))
  if report then
    check('rich: report names the MA3 version', report:find('2.3.2.0', 1, true) ~= nil)
    check('rich: report carries the summary', report:find('10/10 passed', 1, true) ~= nil, report)
    check('rich: report carries the property dumps',
      report:find('## Property dumps', 1, true) ~= nil and report:find('Selection', 1, true) ~= nil)
    for _, name in ipairs({ 'osc.string', 'cue.read', 'recipe.read', 'timing.slice' }) do
      check('rich: report includes -- ' .. name, report:find(name, 1, true) ~= nil)
    end
  end
  check('rich: prints where it wrote', table.concat(p, '\n'):find('report written to', 1, true) ~= nil)

  -- A quote in a payload truncates the command line, and backslash-escaping it
  -- still returns OK — so it must be stripped, never escaped.
  for _, cmd in ipairs(c) do
    local _, body = cmd:match('^SendOSC (%d+) "(.*)"$')
    check('rich: payload carries no bare quote', body == nil or body:find('"') == nil, cmd)
  end
end

-- 1b. Only a later candidate path is writable: must fall through, not give up.
do
  local _, _, _, p = run(richEnvironment, '^/Users/Shared/MA3/')
  local path = next(files)
  check('fallback: uses a later candidate path',
    path == '/Users/Shared/MA3/LifeBridge-probe.txt', tostring(path))
  check('fallback: still prints where it wrote',
    table.concat(p, '\n'):find('report written to', 1, true) ~= nil)
end

-- 1c. Nothing is writable: must say so rather than pretend it saved.
do
  local ok, err, _, p = run(richEnvironment, nil)
  check('no-disk: does not throw', ok, tostring(err))
  check('no-disk: writes nothing', next(files) == nil)
  check('no-disk: says the report could not be written',
    table.concat(p, '\n'):find('could not write a report file', 1, true) ~= nil)
end

-- 1d. A console that answers every read with nil. v0 scored 10/10 against
--     exactly this; v1 must refuse to.
do
  local ok, err, _, p = run(lyingEnvironment, '^/Users/Shared/LIFE/')
  check('lying: does not throw', ok, tostring(err))
  local joined = table.concat(p, '\n')
  check('lying: cue.read fails rather than inventing a value',
    joined:match('cue%.read%s+FAIL') ~= nil, joined)
  check('lying: recipe.read fails when the group is nil',
    joined:match('recipe%.read%s+FAIL') ~= nil, joined)
  check('lying: does not claim a clean sweep',
    joined:find('10/10 passed', 1, true) == nil, joined)
end

-- 2. Bare console: every API missing.
do
  local ok, err, c, p = run(bareEnvironment, nil)
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
  local ok, err, c, p = run(hostileEnvironment, nil)
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
