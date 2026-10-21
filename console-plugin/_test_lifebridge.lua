-- Offline harness for LifeBridge and LifeBridgeProbe. Mocks the entire MA3 API
-- and runs each plugin end to end, the way the Show Creator's harnesses do.
-- Never shipped to a desk. The booth plugin (show, watch, shows) and the desk
-- probe (probe, ping, pool) were one file until 2026-10-21; each scenario says
-- which it runs by setting PLUGIN.
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

local BOOTH = 'console-plugin/LifeBridge.lua'
local PROBE = 'console-plugin/LifeBridgeProbe.lua'
local PLUGIN = PROBE

--- The booth build's stamp, the first field of every reply it sends.
local B
for line in io.lines(BOOTH) do B = B or line:match("^local BUILD = '([^']*)'$") end

--- Every call to HookObjectChange, across every scenario. Must stay zero: the
--- probe's calls to it are suspected in Central's crash of 2026-10-19/20.
local hookCalls = 0

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
  _G.HookObjectChange = function() hookCalls = hookCalls + 1; return 7 end
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

local function run(setup, writablePattern, ...)
  cmds, prints, files = {}, {}, {}
  mockIO(writablePattern)
  setup()
  local main = assert(loadfile(PLUGIN))()
  local ok, err = pcall(main, ...)
  io.open = realOpen
  return ok, err, cmds, prints
end

--- Load the plugin ONCE and call it twice, the way a console does. Every other
--- scenario reloads the chunk and so cannot see state that survives a call —
--- which is exactly how the results accumulated across desk runs unnoticed.
local function runTwice(setup, writablePattern, argsA, argsB)
  cmds, prints, files = {}, {}, {}
  mockIO(writablePattern)
  setup()
  local main = assert(loadfile(PLUGIN))()
  -- CLAUDE.md promises any Lua 5.x runs this harness; unpack moved in 5.2.
  local unpack_ = table.unpack or unpack
  local okA = pcall(main, unpack_(argsA or {}))
  local firstCmds = #cmds
  local okB = pcall(main, unpack_(argsB or {}))
  io.open = realOpen
  return okA and okB, firstCmds, cmds, prints
end

-- -------------------------------- scenarios ---------------------------------

print('LifeBridge harness')

-- 1. Rich console.
do
  local ok, err, c, p = run(richEnvironment, '^/Users/Shared/LIFE/', 'probe')
  check('rich: does not throw', ok, tostring(err))
  check('rich: emits commands', #c > 0)
  check('rich: prints results', #p > 5)

  local joined = table.concat(p, '\n')
  for _, name in ipairs({ 'args.received', 'console.version', 'osc.int', 'osc.float',
                          'osc.string', 'sequence.access', 'cue.read', 'recipe.read',
                          'timing.slice', 'showfile.identity' }) do
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
    if cmd:find('/probe/result', 1, true) then
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
    -- SendOSC splits on every comma and drops what follows the last type
    -- (✅ 2026-09-30). `address,type,value` has two; a third cuts the value.
    check('rich: payload has no comma past the type tag',
      body == nil or select(2, body:gsub(',', '')) == 2, cmd)
  end
end

-- 1b. Only a later candidate path is writable: must fall through, not give up.
do
  local _, _, _, p = run(richEnvironment, '^/Users/Shared/MA3/', 'probe')
  local path = next(files)
  check('fallback: uses a later candidate path',
    path == '/Users/Shared/MA3/LifeBridge-probe.txt', tostring(path))
  check('fallback: still prints where it wrote',
    table.concat(p, '\n'):find('report written to', 1, true) ~= nil)
end

-- 1c. Nothing is writable: must say so rather than pretend it saved.
do
  local ok, err, _, p = run(richEnvironment, nil, 'probe')
  check('no-disk: does not throw', ok, tostring(err))
  check('no-disk: writes nothing', next(files) == nil)
  check('no-disk: says the report could not be written',
    table.concat(p, '\n'):find('could not write a report file', 1, true) ~= nil)
end

-- 1d. A console that answers every read with nil. v0 scored 10/10 against
--     exactly this; v1 must refuse to.
do
  local ok, err, _, p = run(lyingEnvironment, '^/Users/Shared/LIFE/', 'probe')
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
  local ok, err, c, p = run(bareEnvironment, nil, 'probe')
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
  local ok, err, c, p = run(hostileEnvironment, nil, 'probe')
  check('hostile: does not throw', ok, tostring(err))
  local joined = table.concat(p, '\n')
  check('hostile: reports failures', joined:find('FAIL', 1, true) ~= nil)
  check('hostile: never claims a pass it did not get',
    joined:find('10/10 passed', 1, true) == nil, joined)
  for _, cmd in ipairs(c) do
    check('hostile: command is SendOSC only', cmd:match('^SendOSC %d+ ".*"$') ~= nil, cmd)
  end
end

-- 4. `ping` — the link-state round trip. Must be cheap and must stay cheap:
--    the dashboard may call this every second, so anything it does per call is
--    something it does 3600 times an hour on a live console.
do
  -- Mimics the quoted MA3 signature (displayHandle, argument, ...). The verb is
  -- deliberately NOT first, because the dispatch must find it by scanning.
  local ok, err, c, p = run(richEnvironment, '^/Users/Shared/LIFE/', {}, 'ping 42')
  check('ping: does not throw', ok, tostring(err))
  check('ping: emits exactly one message', #c == 1, tostring(#c))
  if c[1] then
    check('ping: command is SendOSC only', c[1]:match('^SendOSC %d+ ".*"$') ~= nil, c[1])
    check('ping: addresses /ping', c[1]:find('/ping', 1, true) ~= nil, c[1])
    check('ping: carries the console version', c[1]:find('2.3.2.0', 1, true) ~= nil, c[1])
    -- Without the echo a reply can only be matched to whichever request is
    -- outstanding, which is wrong the moment two are.
    check('ping: echoes the token back', c[1]:find('42', 1, true) ~= nil, c[1])
  end
  -- A ping that wrote a report file would put a disk write on the dashboard's
  -- once-a-second path, on a machine beside a live desk.
  check('ping: writes no file', next(files) == nil)
  check('ping: runs no probes', table.concat(p, '\n'):find('PASS', 1, true) == nil,
    table.concat(p, '\n'))
end

PLUGIN = BOOTH

-- 4b. `show` — the loaded showfile, and SaveGuard's verdict on it.
--     The verdict must be SaveGuard's exactly, so these mirror its rules: path
--     and `.show` stripped, the UserVar or else SaveGuard's own default, and an
--     exact, case-sensitive comparison.
local function showEnvironment(showfile, baseVar)
  return function()
    installCommon(mockSequence())
    _G.Root = function() return { manetsocket = { showfile = showfile }, Version = '2.3.2.0' } end
    _G.GetVar = function(_, k)
      if k == 'SGV2_BaseShow' then return baseVar end
      return nil
    end
  end
end

--- The one reply, split into its fields after the build stamp. Nil unless
--- exactly one `/show` carrying this build.
local function showFields(c)
  if #c ~= 1 then return nil end
  local body = c[1]:match('^SendOSC %d+ "/show,s,(.*)"$')
  if body == nil then return nil end
  local fields = {}
  for part in (body .. '|'):gmatch('([^|]*)|') do fields[#fields + 1] = part end
  if table.remove(fields, 1) ~= B then return nil end
  return fields
end

local function checkShow(label, setup, want)
  local ok, err, c, p = run(setup, '^/Users/Shared/LIFE/', {}, 'show')
  check('show ' .. label .. ': does not throw', ok, tostring(err))
  local f = showFields(c)
  check('show ' .. label .. ': one /show message, SendOSC only', f ~= nil, table.concat(c, '\n'))
  check('show ' .. label .. ': writes no file', next(files) == nil)
  -- A Printf is a line on the LD's command line, on every link-up.
  check('show ' .. label .. ': prints nothing', #p == 0, table.concat(p, '\n'))
  if f then
    local got = table.concat(f, '|')
    check('show ' .. label .. ': reads ' .. want, got == want, got)
  end
end

checkShow('on base', showEnvironment('Mount Eden Base', 'Mount Eden Base'),
  '2.3.2.0|base|uservar|Mount Eden Base|Mount Eden Base')
checkShow('elsewhere', richEnvironment,
  '2.3.2.0|other|uservar|Sunday 21 Sep|LIFE Basefile Master')
checkShow('path stripped', showEnvironment('/Users/lx/MALightingTechnology/shows/Mount Eden Base.show', 'Mount Eden Base'),
  '2.3.2.0|base|uservar|Mount Eden Base|Mount Eden Base')
checkShow('windows path stripped', showEnvironment('C:\\ProgramData\\shows\\Mount Eden Base.show', 'Mount Eden Base'),
  '2.3.2.0|base|uservar|Mount Eden Base|Mount Eden Base')
-- No SGV2_BaseShow: the generator never ran. SaveGuard falls back to its own
-- name, so the verdict must too, and say that it did.
checkShow('saveguard default', showEnvironment('LIFE Basefile Master', nil),
  '2.3.2.0|base|default|LIFE Basefile Master|LIFE Basefile Master')
checkShow('empty uservar is absent', showEnvironment('Sunday 21 Sep', ''),
  '2.3.2.0|other|default|Sunday 21 Sep|LIFE Basefile Master')
checkShow('case counts', showEnvironment('mount eden base', 'Mount Eden Base'),
  '2.3.2.0|other|uservar|mount eden base|Mount Eden Base')
checkShow('no name', showEnvironment(nil, 'Mount Eden Base'), '2.3.2.0|unreadable')
checkShow('empty name', showEnvironment('', 'Mount Eden Base'), '2.3.2.0|unreadable')
-- Every accessor raising: an honest `unreadable`, not a throw and not a guess.
checkShow('hostile', hostileEnvironment, 'unknown|unreadable')

-- A name the trip would mangle. The verdict is made on the raw strings, so it
-- survives; the names arrive ASCII, with no comma to cut them and no `|` to
-- shift a field.
do
  local odd = 'T\196\129maki, 28 Sep | "late"'
  local ok, err, c = run(showEnvironment(odd, odd), '^/Users/Shared/LIFE/', {}, 'show')
  check('show mangled: does not throw', ok, tostring(err))
  local f = showFields(c)
  check('show mangled: still five fields', f ~= nil and #f == 5, table.concat(c, '\n'))
  if f then
    check('show mangled: verdict made before mangling', f[2] == 'base', f[2])
    check('show mangled: name is ASCII, comma-free, pipe-free',
      f[4]:find('[\128-\255,|"]') == nil, f[4])
  end
end

-- Called twice on one loaded chunk, as a console does: the same one message.
do
  local ok, firstCmds, c = runTwice(showEnvironment('Mount Eden Base', 'Mount Eden Base'),
    '^/Users/Shared/LIFE/', { 'show' }, { 'show' })
  check('show twice: neither call throws', ok)
  check('show twice: one message each', firstCmds == 1 and #c == 2,
    string.format('first %d, total %d', firstCmds, #c))
  check('show twice: the same message', c[1] == c[2], table.concat(c, '\n'))
end

PLUGIN = PROBE

-- 5. `pool` — resolving what a channel B address points at.
do
  local ok, err, c, p = run(richEnvironment, '^/Users/Shared/LIFE/', {}, 'pool')
  check('pool: does not throw', ok, tostring(err))
  check('pool: emits messages', #c > 2, tostring(#c))
  local joined = table.concat(c, '\n')
  check('pool: brackets the run', joined:find('/pool/begin', 1, true) ~= nil
    and joined:find('/pool/end', 1, true) ~= nil, joined)
  check('pool: reports per-sequence addresses', joined:find('/pool/seq', 1, true) ~= nil, joined)
  check('pool: casts the wider net too', joined:find('/pool/obj', 1, true) ~= nil, joined)
  -- An accessor the mock does not implement must report NONE, not vanish: a
  -- missing address is an answer, and a silent omission would read as "no such
  -- object" when it means "we could not ask".
  check('pool: names the accessor or says NONE',
    joined:find('via=', 1, true) ~= nil, joined)
  for _, cmd in ipairs(c) do
    check('pool: command is SendOSC only', cmd:match('^SendOSC %d+ ".*"$') ~= nil, cmd)
  end
  check('pool: writes no file', next(files) == nil)
  check('pool: runs no probes', table.concat(p, '\n'):find('PASS', 1, true) == nil)
end

-- 6. An unrecognised verb. A typo must not silently run the whole probe and
--    hand back thirty lines someone would read as the answer they asked for.
do
  local ok, err, c, p = run(richEnvironment, '^/Users/Shared/LIFE/', {}, 'pnig')
  check('unknown verb: does not throw', ok, tostring(err))
  check('unknown verb: emits exactly one message', #c == 1, tostring(#c))
  if c[1] then
    check('unknown verb: says so over OSC', c[1]:find('/error', 1, true) ~= nil, c[1])
    check('unknown verb: command is SendOSC only', c[1]:match('^SendOSC %d+ ".*"$') ~= nil, c[1])
  end
  check('unknown verb: does not run the probe',
    table.concat(p, '\n'):find('PASS', 1, true) == nil, table.concat(p, '\n'))
  check('unknown verb: writes no file', next(files) == nil)
end

PLUGIN = BOOTH

-- 6b. No verb at all: a tap on the plugin in the pool, or a call that lost its
--     argument. It used to run the whole probe; it must now do nothing, on
--     every kind of console, and on the MA3 signature with no string in it.
for _, case in ipairs({
  { 'rich', richEnvironment, {} },
  { 'signature', richEnvironment, { {}, false, {}, {} } },
  { 'blank', richEnvironment, { '   ' } },
  { 'hostile', hostileEnvironment, {} },
}) do
  local unpack_ = table.unpack or unpack
  local ok, err, c, p = run(case[2], '^/Users/Shared/LIFE/', unpack_(case[3]))
  local label = 'no verb (' .. case[1] .. '): '
  check(label .. 'does not throw', ok, tostring(err))
  check(label .. 'sends nothing', #c == 0, table.concat(c, '\n'))
  check(label .. 'prints nothing', #p == 0, table.concat(p, '\n'))
  check(label .. 'writes no file', next(files) == nil)
end

-- 6c. The booth build has no probe, pool or ping: each is an unknown verb there,
--     said once with the build, and nothing else.
for _, verb in ipairs({ 'probe', 'pool', 'ping 42', 'pnig' }) do
  local ok, err, c, p = run(richEnvironment, '^/Users/Shared/LIFE/', {}, verb)
  local label = 'booth ' .. verb .. ': '
  check(label .. 'does not throw', ok, tostring(err))
  check(label .. 'one /error with the build',
    #c == 1 and c[1]:find('^SendOSC 3 "/error,s,' .. B:gsub('%-', '%%-') .. '|unknown verb ') ~= nil, table.concat(c, '\n'))
  check(label .. 'prints nothing', #p == 0, table.concat(p, '\n'))
  check(label .. 'writes no file', next(files) == nil)
end

PLUGIN = PROBE

-- 7. Calling twice on ONE loaded chunk. Every scenario above reloads the file,
--    which is exactly why the desk run reported 27/30 — three runs of 9/10
--    accumulating in module state — and nothing here noticed.
do
  local ok, firstCmds, c, p = runTwice(richEnvironment, '^/Users/Shared/LIFE/', { 'probe' }, { 'probe' })
  check('twice: neither call throws', ok)
  local joined = table.concat(p, '\n')
  check('twice: the second run does not double the tally',
    joined:find('20/20 passed', 1, true) == nil, joined)
  check('twice: the second run reports its own result',
    select(2, joined:gsub('10/10 passed', '')) == 2, joined)
  -- Same work, twice: a second run that emitted more lines than the first is
  -- accumulating something.
  check('twice: the second run emits the same number of messages',
    #c - firstCmds == firstCmds, string.format('first %d, second %d', firstCmds, #c - firstCmds))
end

PLUGIN = BOOTH

-- 8. `watch` — answers as `show` does, then stays, pushing only on a change.
--    Run as the console runs it: inside a coroutine, resumed after each yield.
--    One chunk throughout, because the watcher is module state on purpose.
do
  cmds, prints, files = {}, {}, {}
  mockIO('^/Users/Shared/LIFE/')
  local showfile = '/shows/test.show'
  showEnvironment(showfile, 'Mount Eden Base')()
  _G.Root = function() return { manetsocket = { showfile = showfile }, Version = '2.3.2.0' } end
  local main = assert(loadfile(PLUGIN))()
  local co = coroutine.create(function() return main('watch') end)
  local oscOf = function(i) return cmds[i] and cmds[i]:match('^SendOSC %d+ "(.-)"$') end

  local ok, slept = coroutine.resume(co)
  check('watch: starts without throwing', ok, tostring(slept))
  check('watch: answers with the show first', oscOf(1) == '/show,s,' .. B .. '|2.3.2.0|other|uservar|test|Mount Eden Base', tostring(cmds[1]))
  check('watch: then says it started', oscOf(2) == '/watch,s,' .. B .. '|started', tostring(cmds[2]))
  check('watch: then yields, one second', coroutine.status(co) == 'suspended' and slept == 1, tostring(slept))

  coroutine.resume(co)
  check('watch: a quiet second says nothing', #cmds == 2, table.concat(cmds, '\n'))

  showfile = '/shows/Mount Eden Base.show'
  coroutine.resume(co)
  check('watch: a change is pushed once', #cmds == 3 and oscOf(3) == '/show,s,' .. B .. '|2.3.2.0|base|uservar|Mount Eden Base|Mount Eden Base',
    table.concat(cmds, '\n'))
  coroutine.resume(co)
  check('watch: and not again while it holds', #cmds == 3, table.concat(cmds, '\n'))

  -- A second watch, as the dashboard's next ask: answers, does not stack.
  local okB = pcall(main, 'watch')
  check('watch again: answers and returns', okB and oscOf(4) ~= nil and oscOf(4):match('^/show,s,') ~= nil, tostring(cmds[4]))
  check('watch again: says one is already running', oscOf(5) == '/watch,s,' .. B .. '|already', tostring(cmds[5]))

  pcall(main, 'unwatch')
  check('unwatch: sends nothing itself', #cmds == 5, table.concat(cmds, '\n'))
  coroutine.resume(co)
  check('unwatch: the loop ends at its next wake', coroutine.status(co) == 'dead')
  check('unwatch: and says it stopped', oscOf(6) == '/watch,s,' .. B .. '|stopped', tostring(cmds[6]))

  local onlyOsc = true
  for _, c in ipairs(cmds) do if not c:match('^SendOSC %d+ ".*"$') then onlyOsc = false end end
  check('watch: SendOSC is the only command it ever sent', onlyOsc, table.concat(cmds, '\n'))
  check('watch: prints nothing', #prints == 0, table.concat(prints, '\n'))
  check('watch: writes no file', next(files) == nil)

  -- Bounded: a watcher left alone ends itself after its lifetime, says
  -- `expired`, and the next `watch` starts a fresh one.
  cmds = {}
  local lifetime
  for line in io.lines(BOOTH) do lifetime = lifetime or tonumber(line:match('^local WATCH_LIFETIME_WAKES = (%d+)')) end
  check('watch lifetime: about thirty minutes', lifetime ~= nil and lifetime >= 600 and lifetime <= 3600, tostring(lifetime))
  local long = coroutine.create(function() return main('watch') end)
  coroutine.resume(long)
  local wakes = 0
  while coroutine.status(long) == 'suspended' and wakes <= (lifetime or 0) + 5 do
    coroutine.resume(long)
    wakes = wakes + 1
  end
  check('watch lifetime: ends by itself after its wakes', coroutine.status(long) == 'dead' and wakes == lifetime,
    string.format('%d wakes, %s', wakes, coroutine.status(long)))
  check('watch lifetime: says expired', oscOf(#cmds) == '/watch,s,' .. B .. '|expired', tostring(cmds[#cmds]))
  check('watch lifetime: nothing between start and expiry on a quiet show', #cmds == 3, table.concat(cmds, '\n'))
  pcall(main, 'watch')
  check('watch lifetime: the next watch starts a fresh one', oscOf(#cmds) == '/watch,s,' .. B .. '|started', tostring(cmds[#cmds]))
  io.open = realOpen
end

-- 9. `shows` — the console's show files, newest first, for the Load list.
--    Read-only; packed into a few messages; a name the trip would change is
--    marked; a console where no way finds the folder says so, never "none".
local function showsEnvironment(files)
  return function()
    showEnvironment('/shows/test.show', 'Mount Eden Base')()
    _G.Enums = { PathType = { Showfiles = 7 } }
    _G.GetPath = function(p) if p == 7 then return 'C:/ProgramData/MALightingTechnology/gma3_library/shows' end end
    _G.DirList = function(folder, filter)
      if filter ~= '*.show' then return {} end
      return files
    end
  end
end
local function showsReplies(c)
  local out = {}
  for _, line in ipairs(c) do
    local body = line:match('^SendOSC %d+ "/shows,s,(.*)"$')
    if body == nil or body:sub(1, #B + 1) ~= B .. '|' then return nil end
    out[#out + 1] = body:sub(#B + 2)
  end
  return out
end

do
  local listing = {
    { name = 'Old Show.show', time = 100 },
    { name = 'Central 2026-10-04 0915.show', time = 300 },
    { name = 'Mount Eden Base.show', time = 200 },
    { name = 'P\195\162ua, test.show', time = 50 },
  }
  local ok, err, c, p = run(showsEnvironment(listing), nil, 'shows')
  check('shows: does not throw', ok, tostring(err))
  local r = showsReplies(c)
  check('shows: only /shows messages, SendOSC only', r ~= nil and #r == 1, table.concat(c, '\n'))
  if r ~= nil and r[1] ~= nil then
    check('shows: newest first, the way named, a name the trip changes marked',
      r[1] == '2.3.2.0|GetPath(Enums.PathType.Showfiles)|1/1|Central 2026-10-04 0915|Mount Eden Base|Old Show|!P-ua; test', r[1])
  end
  check('shows: prints nothing', #p == 0, table.concat(p, '\n'))
  check('shows: writes no file', next(files) == nil)
end

do
  local many = {}
  for i = 1, 60 do many[#many + 1] = { name = string.format('Sunday service number %02d.show', i), time = i } end
  local ok, err, c = run(showsEnvironment(many), nil, 'shows')
  check('shows many: does not throw', ok, tostring(err))
  local r = showsReplies(c) or {}
  local names, parts = 0, {}
  for _, body in ipairs(r) do
    local part, rest = body:match('^2%.3%.2%.0|[^|]+|(%d+/%d+)|(.*)$')
    parts[#parts + 1] = part
    for _ in (rest or ''):gmatch('[^|]+') do names = names + 1 end
    check('shows many: each message within the chunk', #(rest or '') <= 180, tostring(#(rest or '')))
  end
  check('shows many: capped at 40, newest first', names == 40 and r[1] ~= nil and r[1]:find('number 60', 1, true) ~= nil,
    tostring(names))
  check('shows many: parts counted 1/n to n/n', #r > 1 and parts[1] == '1/' .. #r and parts[#r] == #r .. '/' .. #r,
    table.concat(parts, ' '))
end

do
  local ok, err, c = run(function()
    showEnvironment('/shows/test.show', 'Mount Eden Base')()
    _G.Enums = nil
    _G.GetPath = function() error('no such path type') end
    _G.DirList = nil
  end, nil, 'shows')
  check('shows unreadable: does not throw', ok, tostring(err))
  local r = showsReplies(c)
  check('shows unreadable: says so, never an empty list',
    r ~= nil and #r == 1 and r[1] == '2.3.2.0|unreadable|no show folder found', table.concat(c, '\n'))
end

-- 10. HookObjectChange, never. Its calls in the 2026-09-21 probe are suspected
--     in Central's console crash of 2026-10-19/20 (docs/MA3_READ_MODEL.md
--     § Suspected in a console crash): no scenario may call it, and the source
--     may not name it outside a comment.
check('no scenario called HookObjectChange', hookCalls == 0, tostring(hookCalls))
for _, file in ipairs({ BOOTH, PROBE }) do
  local named = false
  for line in io.lines(file) do
    local code = line:gsub('%-%-.*$', '')
    if code:find('HookObjectChange', 1, true) or code:find('Unhook', 1, true) then named = true end
  end
  check(file .. ' never names HookObjectChange outside a comment', not named)
end

-- The booth build issues SendOSC and nothing else, by its source: no Printf, no
-- io, no os, and Cmd only inside sendOsc.
do
  local bad = {}
  for line in io.lines(BOOTH) do
    local code = line:gsub('%-%-.*$', '')
    if code:find('Printf', 1, true) or code:find('io%.') or code:find('os%.') then bad[#bad + 1] = line end
    if code:find('Cmd(', 1, true) and not code:find("Cmd(sformat('SendOSC", 1, true) then bad[#bad + 1] = line end
  end
  check('booth: SendOSC is the only command, and no print, file or os call', #bad == 0, table.concat(bad, '\n'))
end

print(string.format('%d checks, %d failed', checks, failures))
if failures > 0 then os.exit(1) end
print('LIFEBRIDGE HARNESS: OK')
