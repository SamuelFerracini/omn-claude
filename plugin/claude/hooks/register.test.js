import test from 'node:test'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { register, handleStatus, petIdOf, sessionPetId, identityFilesOf, firstKeyOf, sshHelpOf, __state, tickRevive, tickGleam, tickArrive, beginWake, gleamSpots, resetPortraitState, postSession, refresh, releaseConfirm, nameCommand, pipStates, pipRow, expPct, groundOf, floorAt, bodyMask, measure, liftPet, hop } from './register.js'

function fake() {
  const data = new Map()
  const calls = { toast: [], log: [] }
  const $ = {
    store: {
      get: async (k) => data.get(k),
      set: async (k, v) => void data.set(k, v),
    },
    ui: { toast: (m) => calls.toast.push(m), log: (m) => calls.log.push(m) },
  }
  return { $, calls, data }
}

const HINT = 'No pet yet. Start a new session or run `ssh omn.sh` to adopt one.'

test('404 with no_pet JSON body shows the hint once', async () => {
  const { $, calls } = fake()
  const res = { status: 404, ok: false, text: '{"error":"no_pet","hint":"ssh omn.sh to hatch your pet"}' }
  assert.equal(await handleStatus($, res), true)
  assert.equal(await handleStatus($, res), true)
  assert.deepEqual(calls.toast, [HINT])
  assert.deepEqual(calls.log, [])
})

test('404 without a body still shows the hint once', async () => {
  const { $, calls } = fake()
  assert.equal(await handleStatus($, { status: 404, ok: false }), true)
  assert.equal(await handleStatus($, { status: 404, ok: false, text: 'not json' }), true)
  assert.deepEqual(calls.toast, [HINT])
  assert.deepEqual(calls.log, [])
})

test('429 is dropped silently', async () => {
  const { $, calls, data } = fake()
  assert.equal(await handleStatus($, { status: 429, ok: false }), true)
  assert.deepEqual(calls.toast, [])
  assert.deepEqual(calls.log, [])
  assert.equal(data.size, 0)
})

test('200 clears the flag so the hint can return', async () => {
  const { $, calls } = fake()
  await handleStatus($, { status: 404, ok: false })
  assert.equal(await handleStatus($, { status: 200, ok: true }), false)
  await handleStatus($, { status: 404, ok: false })
  assert.deepEqual(calls.toast, [HINT, HINT])
})

test('other statuses are left to the caller', async () => {
  const { $, calls } = fake()
  assert.equal(await handleStatus($, { status: 500, ok: false }), false)
  assert.deepEqual(calls.toast, [])
})

test('petIdOf keeps only a server pet id (8 chars a-z2-7)', () => {
  assert.equal(petIdOf('ab3xy7qz'), 'ab3xy7qz')
  assert.equal(petIdOf('lP_kt9b-'), '')
  assert.equal(petIdOf('Ab3xy7qz'), '')
  assert.equal(petIdOf('../x?y=1'), '')
  assert.equal(petIdOf('short'), '')
  assert.equal(petIdOf('Ab3_-x9Z9'), '')
  assert.equal(petIdOf(12345678), '')
  assert.equal(petIdOf(undefined), '')
})

test('identityFilesOf keeps identityfile lines in order and expands ~', () => {
  const out = 'host omn.sh\nidentityfile ~/.ssh/work\nIdentityFile /abs/key\nidentityfile ~/.ssh/id_rsa\nuser me\n'
  assert.deepEqual(identityFilesOf(out, '/home/u'), ['/home/u/.ssh/work', '/abs/key', '/home/u/.ssh/id_rsa'])
})

test('identityFilesOf ignores other lines and empty output', () => {
  assert.deepEqual(identityFilesOf('', '/h'), [])
  assert.deepEqual(identityFilesOf(undefined, '/h'), [])
  assert.deepEqual(identityFilesOf('identitiesonly yes\nidentityagent none', '/h'), [])
})

test('firstKeyOf picks the first existing key, .pub counts', async () => {
  const present = new Set(['/h/b.pub', '/h/c'])
  const has = async (p) => present.has(p)
  assert.equal(await firstKeyOf(['/h/a', '/h/b', '/h/c'], has), '/h/b')
  assert.equal(await firstKeyOf(['/h/a'], has), '')
})

function endRevive(live, growth) {
  resetPortraitState()
  __state({ portrait: { growth: 0 }, reviveTo: live, reviveGrowth: growth, reviveLeft: 1 })
  tickRevive({})
}

test('revive ending on a gleam pet plays the gleam, then clears', () => {
  endRevive({ gleam: true, growth: 0, frames: [1] }, 0)
  let st = __state()
  assert.equal(st.reviveLeft, 0)
  assert.equal(st.gleamLeft, 14)
  assert.equal(st.evolveLeft, 0)
  for (let i = 0; i < 14; i++) tickGleam()
  st = __state()
  assert.equal(st.gleamLeft, 0)
  assert.equal(st.evolveLeft, 0)
})

test('revive on a pet without gleam skips the gleam', () => {
  endRevive({ gleam: false, growth: 0, frames: [1] }, 0)
  assert.equal(__state().gleamLeft, 0)
})

test('gleam runs before a queued evolve', () => {
  endRevive({ gleam: true, growth: 600, frames: [1] }, 0)
  let st = __state()
  assert.equal(st.gleamLeft, 14)
  assert.equal(st.evolveLeft, 0)
  for (let i = 0; i < 14; i++) tickGleam()
  st = __state()
  assert.equal(st.gleamLeft, 0)
  assert.equal(st.evolveLeft, 50)
})

test('a non-gleam revive still evolves right away', () => {
  endRevive({ gleam: false, growth: 600, frames: [1] }, 0)
  assert.equal(__state().evolveLeft, 50)
})

test('wake cancels the gleam and its queued evolve', () => {
  endRevive({ gleam: true, growth: 600, frames: [1] }, 0)
  beginWake()
  const st = __state()
  assert.equal(st.gleamLeft, 0)
  assert.equal(st.gleamEvolve, false)
})

test('gleamSpots stay inside the 16x18 grid and thin out', () => {
  for (let left = 14; left > 0; left--) {
    for (const s of gleamSpots(left)) assert.ok(s[0] >= 0 && s[0] < 16 && s[1] >= 0 && s[1] < 18)
  }
  assert.ok(gleamSpots(14).length > gleamSpots(1).length)
})

test('sessionPetId returns a new valid id from the reply', () => {
  assert.equal(sessionPetId('{"ok":true,"status":"awake","id":"ab3xy7qz"}', 'zzzzzzzz'), 'ab3xy7qz')
  assert.equal(sessionPetId('{"id":"ab3xy7qz"}', ''), 'ab3xy7qz')
})

test('sessionPetId changes nothing when id is same, missing, invalid or reply is not JSON', () => {
  assert.equal(sessionPetId('{"id":"ab3xy7qz"}', 'ab3xy7qz'), '')
  assert.equal(sessionPetId('{"ok":true,"status":"awake"}', 'ab3xy7qz'), '')
  assert.equal(sessionPetId('{"id":"../x?y=1"}', 'ab3xy7qz'), '')
  assert.equal(sessionPetId('{"id":12345678}', ''), '')
  assert.equal(sessionPetId('not json', 'ab3xy7qz'), '')
  assert.equal(sessionPetId(undefined, ''), '')
  assert.equal(sessionPetId('null', ''), '')
})

function listHook() {
  let hook
  register((event, matcher, fn) => {
    if (event === 'ui.render' && matcher && matcher.component === 'AbovePromptList') hook = fn
  })
  return hook
}

const box = (props) => ({ box: props })
const $ui = { ui: { resolve: () => ({ Box: box }) } }
const mineRow = { plugin: 'omn', tree: 'pet' }
const theirRow = { plugin: 'status', tree: 'status row' }

function listEvent(rows, over = {}) {
  return { props: { rows, bodyColumns: 100, isCollapsed: false, hasSurvey: false, ...over } }
}

test('AbovePromptList: wide with other rows draws the pet left, others right', async () => {
  const sprite = Buffer.from(new Uint8Array(16 * 18 * 3)).toString('base64')
  resetPortraitState()
  __state({ portrait: { frames: [sprite], growth: 5, name: 'Pip' } })
  const el = (type) => (props) => ({ type, props })
  const $r = { ui: { resolve: () => ({ Box: el('box'), Text: el('text'), Raster: el('raster'), Svg: el('svg') }) } }
  const seen = []
  const next = async (ev) => (seen.push(ev.props.rows), 'stacked others')
  const out = await listHook()($r, { ...listEvent([mineRow, theirRow]), surface: 'terminal' }, next)
  assert.deepEqual(seen, [[theirRow]])
  assert.equal(out.type, 'box')
  assert.equal(out.props.flexDirection, 'row')
  const [pet, right] = out.props.children
  // the pet is drawn here, not copied from the row
  assert.equal(pet.props.children[0].type, 'raster')
  assert.equal(pet.props.children[0].props.key, 'pet')
  assert.deepEqual(right, { type: 'box', props: { flexGrow: 1, flexShrink: 1, children: ['stacked others'] } })
  resetPortraitState()
})

test('AbovePromptList: narrow band passes through', async () => {
  const e = listEvent([mineRow, theirRow], { bodyColumns: 59 })
  assert.equal(await listHook()($ui, e, async (ev) => (assert.equal(ev, e), 'default')), 'default')
})

test('AbovePromptList: collapsed band and survey pass through', async () => {
  for (const over of [{ isCollapsed: true }, { hasSurvey: true }]) {
    const e = listEvent([mineRow, theirRow], over)
    assert.equal(await listHook()($ui, e, async () => 'default'), 'default')
  }
})

test('AbovePromptList: only omn row or only other rows pass through', async () => {
  for (const rows of [[mineRow], [theirRow], []]) {
    const e = listEvent(rows)
    assert.equal(await listHook()($ui, e, async () => 'default'), 'default')
  }
})

// A fake host that signs with a stub ssh-keygen and answers fetches from routes.
// routes maps a URL prefix to { status, body } (body is JSON-encoded).
function server(routes) {
  const { $, calls, data } = fake()
  const fetched = []
  $.process = { run: async (args) => (args[1] === '-y' ? { exitCode: 0, stdout: 'ssh-ed25519 AAAA me' } : { exitCode: 0, stdout: '' }) }
  $.env = { get: async () => '/h' }
  $.fs = { exists: async () => true, write: async () => {}, read: async () => 'SIG' }
  $.http = {
    fetch: async (url) => {
      fetched.push(url)
      const path = url.replace('https://omn.sh', '').replace(/\?.*$/, '')
      const hit = routes[path]
      if (!hit) return { status: 500, ok: false, text: '' }
      return { status: hit.status || 200, ok: (hit.status || 200) === 200, text: JSON.stringify(hit.body) }
    },
  }
  $.ui.invalidate = () => {}
  return { $, calls, data, fetched }
}

function freshPet(over = {}) {
  resetPortraitState()
  __state({ portrait: null, petId: '', keyPath: '/h/.ssh/id_ed25519', ...over })
}

function playScene($) {
  for (let i = 0; i < 100 && __state().arriveLeft > 0; i++) tickArrive($)
  assert.equal(__state().arriveLeft, 0)
}

const egg = { frames: [[0]], growth: 0, name: 'Pip' }

test('open with hatched:true plays the egg-only hatch scene', async () => {
  freshPet()
  const { $, calls, data } = server({
    '/v1/claude/session': { body: { id: 'ab3xy7qz', hatched: true, name: 'Pip', species: 'Blob', named: true } },
    '/p/ab3xy7qz.json': { body: egg },
  })
  await postSession($, 'open')
  let st = __state()
  assert.equal(st.petId, 'ab3xy7qz')
  assert.equal(data.get('petId'), 'ab3xy7qz')
  assert.equal(st.arriveFrom, null)
  assert.equal(st.arrivePhase, 'drop')
  assert.deepEqual(st.portrait, egg)
  playScene($)
  st = __state()
  assert.equal(st.note, 'hatched! meet Pip')
  assert.deepEqual(calls.toast, ['omn hatched! meet Pip'])
  assert.equal(st.namePrompt, '')
})

test('open with hatched:false plays no scene and asks no name', async () => {
  freshPet()
  const { $, calls } = server({
    '/v1/claude/session': { body: { id: 'ab3xy7qz', hatched: false, name: 'Pip', species: 'Blob', named: false } },
    '/p/ab3xy7qz.json': { body: egg },
  })
  await postSession($, 'open')
  const st = __state()
  assert.equal(st.arriveLeft, 0)
  assert.equal(st.namePrompt, '')
  assert.deepEqual(calls.toast, [])
})

test('named:false asks for a nick after the hatch, and /omn-name clears it', async () => {
  freshPet()
  const { $, calls } = server({
    '/v1/claude/session': { body: { id: 'ab3xy7qz', hatched: true, name: 'Pip', species: 'Blob', named: false } },
    '/p/ab3xy7qz.json': { body: egg },
    '/v1/claude/pet': { body: { id: 'ab3xy7qz', name: 'Bo', species: 'Blob' } },
  })
  await postSession($, 'open')
  assert.equal(__state().namePrompt, '')
  playScene($)
  assert.equal(__state().namePrompt, 'name your pet: /omn-name <nick>')
  assert.deepEqual(calls.toast, ['omn hatched! meet Pip', 'omn name your pet: /omn-name <nick>'])
  assert.deepEqual(await nameCommand($, 'Bo'), { text: 'omn named Bo' })
  assert.equal(__state().namePrompt, '')
})

test('a 404 on /p/<id>.json clears the stored petId and portrait', async () => {
  freshPet({ petId: 'zzzzzzzz', portrait: { frames: [[0]], growth: 9, name: 'Stale' } })
  const { $, data } = server({ '/p/zzzzzzzz.json': { status: 404, body: { error: 'not_found' } } })
  data.set('petId', 'zzzzzzzz')
  await refresh($)
  const st = __state()
  assert.equal(st.petId, '')
  assert.equal(st.portrait, null)
  assert.equal(data.get('petId'), '')
})

test('the id in the open reply replaces a stale stored id', async () => {
  freshPet({ petId: 'zzzzzzzz', portrait: { frames: [[9]], growth: 9, name: 'Stale' } })
  const fresh = { frames: [[1]], growth: 3, name: 'Real' }
  const { $, data, fetched } = server({
    '/v1/claude/session': { body: { id: 'ab3xy7qz', hatched: false, name: 'Real', species: 'Blob', named: true } },
    '/p/ab3xy7qz.json': { body: fresh },
  })
  data.set('petId', 'zzzzzzzz')
  await postSession($, 'open')
  const st = __state()
  assert.equal(st.petId, 'ab3xy7qz')
  assert.equal(data.get('petId'), 'ab3xy7qz')
  assert.deepEqual(st.portrait, fresh)
  assert.ok(!fetched.some((u) => u.includes('zzzzzzzz')))
})

test('letgo with the same id still runs the arrive scene, then asks a nick', async () => {
  const old = { frames: [[5]], growth: 600, name: 'Old' }
  freshPet({ petId: 'ab3xy7qz', portrait: old })
  const newEgg = { frames: [[0]], growth: 0, name: 'Bean' }
  const { $, calls, data } = server({
    '/v1/claude/pet': { body: { id: 'ab3xy7qz', name: 'Bean', species: 'Blob' } },
    '/p/ab3xy7qz.json': { body: newEgg },
  })
  const out = await releaseConfirm($, Date.now())
  assert.deepEqual(out, { text: 'omn released. meet Bean (ab3xy7qz)' })
  let st = __state()
  assert.equal(st.petId, 'ab3xy7qz')
  assert.equal(data.get('petId'), undefined)
  assert.equal(st.arrivePhase, 'leave')
  assert.equal(st.arriveFrom, old)
  assert.deepEqual(st.arriveTo, newEgg)
  assert.equal(st.portrait, old)
  assert.equal(st.note, 'goodbye!')
  for (let i = 0; i < 10; i++) tickArrive($)
  st = __state()
  assert.equal(st.arrivePhase, 'drop')
  assert.deepEqual(st.portrait, newEgg)
  assert.equal(st.note, '')
  playScene($)
  st = __state()
  assert.equal(st.note, 'hatched! meet Bean')
  assert.equal(st.namePrompt, 'name your pet: /omn-name <nick>')
  assert.deepEqual(calls.toast, ['omn hatched! meet Bean', 'omn name your pet: /omn-name <nick>'])
})

// ---- Terminal.app render mode ----
import { renderModeOf, nearest256, rasterOf, rgbaOf, setRenderEnv } from './register.js'

const spriteB64 = (() => {
  const px = []
  for (let i = 0; i < 16 * 18; i++) px.push((i * 37) & 255, (i * 91) & 255, (i * 53) & 255)
  return Buffer.from(Uint8Array.from(px)).toString('base64')
})()
const cellsOf = (b64) => Array.from(new Uint32Array(Uint8Array.from(Buffer.from(b64, 'base64')).buffer))

test('render mode: halfblock unless Terminal.app or forced', () => {
  assert.equal(renderModeOf({}), 'halfblock')
  assert.equal(renderModeOf(undefined), 'halfblock')
  assert.equal(renderModeOf({ termProgram: 'iTerm.app' }), 'halfblock')
  assert.equal(renderModeOf({ termProgram: 'Apple_Terminal' }), 'solid')
  assert.equal(renderModeOf({ termProgram: 'tmux', bundleId: 'com.apple.Terminal' }), 'solid')
  assert.equal(renderModeOf({ termProgram: 'tmux', bundleId: 'com.googlecode.iterm2' }), 'halfblock')
})

test('render mode: OMN_PET_RENDER wins both ways', () => {
  assert.equal(renderModeOf({ override: 'blocks' }), 'blocks')
  assert.equal(renderModeOf({ override: 'halfblock', termProgram: 'Apple_Terminal' }), 'halfblock')
  assert.equal(renderModeOf({ override: 'junk', termProgram: 'Apple_Terminal' }), 'solid')
  assert.equal(renderModeOf({ override: 'compact' }), 'compact')
  assert.equal(renderModeOf({ override: 'image', termProgram: 'Apple_Terminal' }), 'image')
})

test('halfblock output is byte-identical to the pre-change output', () => {
  const golden = '5ff56681bd8a6b7ba51e8ec40c363b7046396b20'
  for (const env of [{}, { termProgram: 'iTerm.app' }, { override: 'halfblock', termProgram: 'Apple_Terminal' }]) {
    setRenderEnv(env)
    assert.equal(createHash('sha1').update(rasterOf(spriteB64)).digest('hex'), golden)
  }
  setRenderEnv({})
})

test('blocks output is a 32x18 grid of spaces with bg only', () => {
  setRenderEnv({ override: 'blocks', colorterm: 'truecolor' })
  const cells = cellsOf(rasterOf(spriteB64))
  setRenderEnv({})
  assert.equal(cells.length, 32 * 18 * 3)
  for (let i = 0; i < cells.length; i += 3) {
    assert.equal(cells[i], 0x20)
    assert.equal(cells[i + 1], 0x01000000)
  }
  // pixel (x=1,y=0) fills cells 2 and 3 of row 0 with its own colour
  assert.equal(cells[2 * 3 + 2], cells[3 * 3 + 2])
  assert.equal(cells[2 * 3 + 2], (((1 * 37) & 255) << 16) | (((1 * 91) & 255) << 8) | ((1 * 53) & 255))
})

test('blocks without truecolor snaps every colour to xterm-256', () => {
  setRenderEnv({ override: 'blocks' })
  const cells = cellsOf(rasterOf(spriteB64))
  setRenderEnv({})
  for (let i = 2; i < cells.length; i += 3) assert.equal(nearest256(cells[i]), cells[i])
})

test('nearest256 maps known colours', () => {
  assert.equal(nearest256(0x000000), 0x000000)
  assert.equal(nearest256(0xffffff), 0xffffff)
  assert.equal(nearest256(0xff0000), 0xff0000)
  assert.equal(nearest256(0x5f87d7), 0x5f87d7)
  assert.equal(nearest256(0x808080), 0x808080)
  assert.equal(nearest256(0xfe0101), 0xff0000)
  assert.equal(nearest256(0x0a0a0a), 0x080808)
  assert.equal(nearest256(0x101010), 0x121212)
})

test('compact output is a 16x9 bg-only grid keeping the non-background pixel', () => {
  const bg = [10, 20, 30]
  const px = []
  for (let i = 0; i < 16 * 18; i++) px.push(...bg)
  const at = (x, y, c) => px.splice((y * 16 + x) * 3, 3, ...c)
  at(3, 4, [200, 100, 50]) // top of pair 2
  at(5, 7, [0, 255, 0]) // bottom of pair 3, top is bg
  const b64 = Buffer.from(Uint8Array.from(px)).toString('base64')
  setRenderEnv({ override: 'compact', colorterm: '24bit' })
  const cells = cellsOf(rasterOf(b64))
  setRenderEnv({})
  assert.equal(cells.length, 16 * 9 * 3)
  for (let i = 0; i < cells.length; i += 3) assert.deepEqual([cells[i], cells[i + 1]], [0x20, 0x01000000])
  assert.equal(cells[(2 * 16 + 3) * 3 + 2], (200 << 16) | (100 << 8) | 50)
  assert.equal(cells[(3 * 16 + 5) * 3 + 2], 0x00ff00)
  at(7, 10, [100, 0, 0])
  at(7, 11, [200, 0, 0])
  const mixed = cellsOf((setRenderEnv({ override: 'compact', colorterm: '24bit' }), rasterOf(Buffer.from(Uint8Array.from(px)).toString('base64'))))
  setRenderEnv({})
  assert.equal(mixed[(5 * 16 + 7) * 3 + 2], 150 << 16)
  assert.equal(cells[0 * 3 + 2], (10 << 16) | (20 << 8) | 30)
})

test('image mode draws an Image of the 16x18 RGBA sprite in the 16x9 box', async () => {
  const sprite = Buffer.from(Uint8Array.from({ length: 16 * 18 * 3 }, (_, i) => i & 255)).toString('base64')
  resetPortraitState()
  __state({ portrait: { frames: [sprite], growth: 5, name: 'Pip' } })
  setRenderEnv({ override: 'image' })
  const el = (type) => (props) => ({ type, props })
  const $r = { ui: { resolve: () => ({ Box: el('box'), Text: el('text'), Raster: el('raster'), Svg: el('svg'), Image: el('image') }) } }
  let hook
  register((event, matcher, fn) => {
    if (event === 'ui.render' && matcher && matcher.component === 'AbovePrompt') hook = fn
  })
  const out = await hook($r, { surface: 'terminal' }, async () => 'next')
  setRenderEnv({})
  resetPortraitState()
  const img = out.props.children[0]
  assert.equal(img.type, 'image')
  assert.equal(img.props.key, 'pet')
  assert.deepEqual([img.props.columns, img.props.rows], [16, 9])
  assert.deepEqual([img.props.source.width, img.props.source.height], [16, 18])
  const rgba = Uint8Array.from(Buffer.from(img.props.source.rgba, 'base64'))
  assert.equal(rgba.length, 16 * 18 * 4)
  assert.deepEqual(Array.from(rgba.slice(0, 4)), [0, 1, 2, 255])
})

test('rgbaOf is opaque RGBA', () => {
  const b = Uint8Array.from(Buffer.from(rgbaOf(spriteB64), 'base64'))
  assert.equal(b.length, 16 * 18 * 4)
  for (let i = 3; i < b.length; i += 4) assert.equal(b[i], 255)
})

test('exp pips: fixed staircase, state per pip', () => {
  const S = (v) => pipStates(v).map((s) => s[0]).join('')
  assert.equal(S(0), 'oooo')
  assert.equal(S(0.5), 'cooo')
  assert.equal(S(24.9), 'cooo')
  assert.equal(S(25), 'dcoo')
  assert.equal(S(25.1), 'dcoo')
  assert.equal(S(49.9), 'dcoo')
  assert.equal(S(50), 'ddco')
  assert.equal(S(74.9), 'ddco')
  assert.equal(S(75), 'dddc')
  assert.equal(S(99.9), 'dddc')
  assert.equal(S(100), 'dddd')
})

test('exp quarter boundaries hold on real exp values', () => {
  const S = (g) => pipStates(expPct(g)).map((s) => s[0]).join('')
  assert.equal(S(25000 + 20000), 'dcoo')
  assert.equal(S(70000), 'ddco')
  assert.equal(S(95000), 'dddc')
  assert.equal(S(500 + 4875), 'dcoo')
})

test('exp pip row: glyphs always full stairs, colors by state', () => {
  const row = pipRow(27.6, false)
  assert.equal(row.map((p) => p.glyph).join(''), '▂▄▆█')
  assert.equal(row[0].color, '#9d8cff')
  assert.equal(row[1].color, '#847abf')
  assert.equal(row[2].color, '#6b6880')
  assert.equal(pipRow(86, true)[3].color, '#efeaff')
  assert.equal(pipRow(100, true)[3].color, '#9d8cff')
  assert.ok(pipRow(0, false).every((p) => p.color === '#6b6880'))
})

function commandHook(name) {
  let hook
  register((event, matcher, fn) => {
    if (event === 'command.run' && matcher && matcher.command === name) hook = fn
  })
  return hook
}

// A host with a fake file system: ssh-keygen -t writes the key pair into it,
// ssh -G lists the given IdentityFiles, and every write and argv is recorded.
function keyHost(routes, { files = [], identities = [] } = {}) {
  const host = server(routes)
  const fsFiles = new Set(files)
  const runs = []
  const writes = []
  host.$.fs = {
    exists: async (p) => fsFiles.has(p),
    write: async (p) => void (writes.push(p), fsFiles.add(p), fsFiles.add(p + '.sig')),
    read: async () => 'SIG',
  }
  host.$.process = {
    run: async (args) => {
      runs.push(args)
      if (args[0] === 'ssh' && args[1] === '-G') return { exitCode: 0, stdout: identities.map((p) => 'identityfile ' + p).join('\n') + '\n' }
      if (args[0] === 'ssh-keygen' && args.includes('-t')) {
        const out = args[args.indexOf('-f') + 1]
        fsFiles.add(out)
        fsFiles.add(out + '.pub')
        return { exitCode: 0, stdout: '' }
      }
      if (args[1] === '-y') return { exitCode: 0, stdout: 'ssh-ed25519 AAAA omn' }
      return { exitCode: 0, stdout: '' }
    },
  }
  return { ...host, runs, writes, fsFiles }
}

const hatchedReply = { id: 'ab3xy7qz', hatched: true, name: 'Pip', species: 'Blob', named: false }
const ownKeyPath = '/h/.config/omn/omn_ed25519'

test('/omn-adopt with an SSH key hatches that key\'s pet and makes no key', async () => {
  freshPet({ keyPath: '' })
  const { $, calls, runs, data } = keyHost(
    { '/v1/claude/session': { body: hatchedReply }, '/p/ab3xy7qz.json': { body: egg } },
    { files: ['/h/.ssh/id_ed25519'], identities: ['~/.ssh/id_ed25519'] },
  )
  const out = await commandHook('omn-adopt')($, { args: '' })
  assert.deepEqual(out, { text: 'omn hatched Pip (ab3xy7qz)' })
  assert.equal(__state().petId, 'ab3xy7qz')
  assert.equal(__state().arrivePhase, 'drop')
  playScene($)
  assert.equal(calls.toast[0], 'omn hatched! meet Pip')
  assert.ok(!runs.some((a) => a[0] === 'ssh-keygen' && a.includes('-t')))
  assert.ok(runs.some((a) => a[0] === 'ssh-keygen' && a[1] === '-Y' && a[4] === '/h/.ssh/id_ed25519'))
  assert.equal(data.get('sshKey'), undefined)
})

test('/omn-adopt with a pet already shows it and its id, no second hatch', async () => {
  freshPet({ keyPath: '/h/.ssh/id_ed25519', petId: 'ab3xy7qz', portrait: egg })
  const { $, calls, runs } = keyHost(
    { '/v1/claude/session': { body: { ...hatchedReply, hatched: false, name: 'Bo', named: true } }, '/p/ab3xy7qz.json': { body: egg } },
    { files: ['/h/.ssh/id_ed25519'] },
  )
  const out = await commandHook('omn-adopt')($, { args: '' })
  assert.deepEqual(out, { text: 'omn Bo (ab3xy7qz) is already yours' })
  assert.equal(__state().arriveLeft, 0)
  assert.deepEqual(calls.toast, [])
  assert.ok(!runs.some((a) => a[0] === 'ssh-keygen' && a.includes('-t')))
})

test('/omn-adopt with no SSH key makes omn_ed25519 in ~/.config/omn and never writes ~/.ssh', async () => {
  freshPet({ keyPath: '' })
  const { $, runs, writes, data, fsFiles } = keyHost(
    { '/v1/claude/session': { body: hatchedReply }, '/p/ab3xy7qz.json': { body: egg } },
    { identities: ['~/.ssh/id_rsa', '~/.ssh/id_ed25519'] },
  )
  const out = await commandHook('omn-adopt')($, { args: '' })
  assert.deepEqual(out, { text: 'omn hatched Pip (ab3xy7qz). key ' + ownKeyPath + ' (new): /omn ssh shows how to reach it over SSH' })
  assert.ok(runs.some((a) => a.join(' ') === 'ssh-keygen -q -t ed25519 -N  -C omn -f ' + ownKeyPath))
  assert.ok(runs.some((a) => a.join(' ') === 'chmod 600 ' + ownKeyPath))
  assert.ok(runs.some((a) => a[0] === 'ssh-keygen' && a[1] === '-Y' && a[4] === ownKeyPath))
  assert.equal(data.get('sshKey'), ownKeyPath)
  assert.equal(data.get('petId'), 'ab3xy7qz')
  assert.ok(fsFiles.has(ownKeyPath))
  const underSsh = (p) => typeof p === 'string' && p.startsWith('/h/.ssh')
  assert.deepEqual(writes.filter(underSsh), [])
  assert.deepEqual(runs.filter((a) => a.some(underSsh)), [])
  assert.deepEqual([...fsFiles].filter(underSsh), [])
})

test('/omn-adopt reuses an omn key already in ~/.config/omn', async () => {
  freshPet({ keyPath: '' })
  const { $, runs, data } = keyHost(
    { '/v1/claude/session': { body: { ...hatchedReply, hatched: false } }, '/p/ab3xy7qz.json': { body: egg } },
    { files: [ownKeyPath] },
  )
  const out = await commandHook('omn-adopt')($, { args: '' })
  assert.equal(out.text, 'omn Pip (ab3xy7qz) is already yours. key ' + ownKeyPath + ': /omn ssh shows how to reach it over SSH')
  assert.ok(!runs.some((a) => a[0] === 'ssh-keygen' && a.includes('-t')))
  assert.equal(data.get('sshKey'), ownKeyPath)
})

test('/omn-adopt takes no nick', async () => {
  freshPet()
  const { $, fetched } = keyHost({})
  const out = await commandHook('omn-adopt')($, { args: 'Bo' })
  assert.match(out.text, /^usage: \/omn-adopt/)
  assert.deepEqual(fetched, [])
})

test('/omn ssh prints plain ssh omn.sh for a key ssh already tries', async () => {
  freshPet({ keyPath: '/h/.ssh/id_ed25519' })
  const { $ } = keyHost({}, { identities: ['~/.ssh/id_rsa', '~/.ssh/id_ed25519'] })
  assert.deepEqual(await commandHook('omn')($, { args: 'ssh' }), { text: 'ssh omn.sh' })
})

test('/omn ssh prints ssh -i and a config snippet for the omn key', async () => {
  freshPet({ keyPath: ownKeyPath })
  const { $, runs, writes } = keyHost({}, { identities: ['~/.ssh/id_ed25519'] })
  const out = await commandHook('omn')($, { args: 'ssh' })
  assert.equal(
    out.text,
    [
      'ssh -i ' + ownKeyPath + ' -o IdentitiesOnly=yes omn.sh',
      '',
      'optional, so plain `ssh omn.sh` reaches this pet: add to ~/.ssh/config yourself',
      'Host omn.sh',
      '  IdentityFile ' + ownKeyPath,
      '  IdentitiesOnly yes',
    ].join('\n'),
  )
  assert.deepEqual(writes, [])
  assert.deepEqual(runs, [['ssh', '-G', 'omn.sh']])
})

test('/omn ssh with no key points at /omn-adopt', async () => {
  freshPet({ keyPath: '' })
  const { $ } = keyHost({})
  assert.deepEqual(await commandHook('omn')($, { args: 'ssh' }), { text: 'omn: no key yet. run /omn-adopt' })
})

test('sshHelpOf quotes a key path with spaces, matches a .pub IdentityFile', () => {
  assert.equal(sshHelpOf('/h/my keys/k', []).split('\n')[0], "ssh -i '/h/my keys/k' -o IdentitiesOnly=yes omn.sh")
  assert.equal(sshHelpOf('/h/my keys/k', []).split('\n')[4], '  IdentityFile "/h/my keys/k"')
  assert.equal(sshHelpOf('/h/k', ['/h/k.pub']), 'ssh omn.sh')
})

test('VERSION in register.js matches plugin.json', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('./register.js', import.meta.url), 'utf8')
  const manifest = JSON.parse(await readFile(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'))
  const m = src.match(/^const VERSION = '([^']+)'/m)
  assert.ok(m, 'VERSION constant not found in register.js')
  assert.equal(manifest.version, m[1])
})

// 16x18 RGB frame helpers for the motion tests.
const SKY = [0x20, 0x24, 0x40]
const DIRT = [0x5a, 0x40, 0x2a]
const FUR = [0xd0, 0x90, 0x50]
const PAW = [0x30, 0x20, 0x18]
const TEAL = [0x2a, 0x8a, 0x80]

function frame() {
  const buf = new Uint8Array(16 * 18 * 3)
  for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) put(buf, x, y, y >= 15 ? DIRT : SKY)
  return buf
}

function put(buf, x, y, c) {
  const i = (y * 16 + x) * 3
  buf[i] = c[0]
  buf[i + 1] = c[1]
  buf[i + 2] = c[2]
}

function at(buf, x, y) {
  const i = (y * 16 + x) * 3
  return [buf[i], buf[i + 1], buf[i + 2]]
}

// Body on rows 9..14, feet drawn on the ground band (rows 15..16).
function petOnGround() {
  const buf = frame()
  for (let y = 9; y <= 14; y++) for (let x = 5; x <= 10; x++) put(buf, x, y, FUR)
  for (const x of [5, 6, 9, 10]) {
    put(buf, x, 15, PAW)
    put(buf, x, 16, PAW)
  }
  return buf
}

test('ground band is found from whole rows', () => {
  assert.equal(floorAt(petOnGround()), 15)
  assert.deepEqual(groundOf(petOnGround()).c, DIRT)
})

test('a non-ground patch in column 0 does not move the ground line', () => {
  // Patch only on the bottom rows: column 0 alone would put the line at 16.
  const low = petOnGround()
  for (let y = 16; y < 18; y++) {
    put(low, 0, y, TEAL)
    put(low, 1, y, TEAL)
  }
  assert.equal(floorAt(low), 15)
  assert.deepEqual(groundOf(low).c, DIRT)
  // The patch is scene, not pet: it touches neither the body nor the feet.
  const mask = bodyMask(low, 15, SKY)
  for (let y = 15; y < 18; y++) for (let x = 0; x < 2; x++) assert.equal(mask[y * 16 + x], 0)
  // Patch rising above the ground: column 0 alone would put the line at 13.
  const tall = petOnGround()
  for (let y = 13; y < 18; y++) put(tall, 0, y, TEAL)
  assert.equal(floorAt(tall), 15)
})

test('feet on the ground band are part of the pet, ground texture is not', () => {
  const buf = petOnGround()
  put(buf, 13, 16, PAW) // a pebble that does not touch the pet
  const mask = bodyMask(buf, floorAt(buf), SKY)
  for (const x of [5, 6, 9, 10]) {
    assert.equal(mask[15 * 16 + x], 1)
    assert.equal(mask[16 * 16 + x], 1)
  }
  assert.equal(mask[16 * 16 + 13], 0)
  assert.equal(mask[15 * 16 + 7], 0)
  assert.equal(measure(buf).foot, 16)
})

for (const [name, move] of [
  ['liftPet(buf, 2)', (b) => liftPet(b, 2)],
  ['hop()', (b) => hop(b)],
]) {
  test(`${name} moves body and ground-band feet together`, () => {
    const before = petOnGround()
    put(before, 13, 16, PAW)
    const buf = before.slice()
    move(buf)
    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < 16; x++) {
        const src = y + 2
        const wasPet = src < 18 && ((src >= 9 && src <= 14 && x >= 5 && x <= 10) || ((src === 15 || src === 16) && [5, 6, 9, 10].includes(x)))
        let want
        if (wasPet) want = at(before, x, src)
        else if (x === 13 && y === 16) want = PAW
        else want = y >= 15 ? DIRT : SKY
        assert.deepEqual(at(buf, x, y), want, `pixel ${x},${y}`)
      }
    }
    // No paw left behind on the ground under the pet.
    for (const x of [5, 6, 9, 10]) assert.deepEqual(at(buf, x, 16), DIRT)
  })
}

test('lowering a pet with band feet keeps body and feet joined', () => {
  const buf = petOnGround()
  liftPet(buf, -2)
  // Body rows 9..14 move to 11..16, in front of the ground; no ground row
  // opens between body and feet.
  for (let y = 11; y <= 16; y++) for (let x = 5; x <= 10; x++) assert.deepEqual(at(buf, x, y), FUR, `pixel ${x},${y}`)
  // Feet move down to row 17; the rest of the frame drops off the bottom.
  for (const x of [5, 6, 9, 10]) assert.deepEqual(at(buf, x, 17), PAW)
  for (const x of [7, 8]) assert.deepEqual(at(buf, x, 17), DIRT)
  assert.deepEqual(at(buf, 5, 10), SKY)
})

test('lowering a pet without band feet hides the rows behind the ground', () => {
  const buf = frame()
  for (let y = 9; y <= 14; y++) for (let x = 5; x <= 10; x++) put(buf, x, y, FUR)
  liftPet(buf, -2)
  for (let x = 5; x <= 10; x++) {
    assert.deepEqual(at(buf, x, 14), FUR)
    assert.deepEqual(at(buf, x, 15), DIRT)
    assert.deepEqual(at(buf, x, 10), SKY)
  }
})

test('a bite catch leaves no shadow where the feet stood', () => {
  const b64 = Buffer.from(petOnGround()).toString('base64')
  for (const tick of [1, 2, 3, 4]) {
    __state({ bite: { mode: 'catch', tick: tick, xp: 1, kind: 'other' } })
    const rgba = Buffer.from(rgbaOf(b64), 'base64')
    for (let y = 15; y < 18; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4
        const px = [rgba[i], rgba[i + 1], rgba[i + 2]]
        assert.ok(String(px) === String(DIRT) || String(px) === String(PAW), `tick ${tick} pixel ${x},${y} is ${px}`)
      }
    }
  }
  __state({ bite: null })
})

test('a frame with no ground band lifts everything that is not sky', () => {
  const buf = frame()
  for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) put(buf, x, y, SKY)
  for (let y = 12; y < 18; y++) put(buf, 7, y, FUR)
  assert.equal(floorAt(buf), 18)
  liftPet(buf, 2)
  assert.deepEqual(at(buf, 7, 17), SKY)
  assert.deepEqual(at(buf, 7, 10), FUR)
  assert.deepEqual(at(buf, 7, 15), FUR)
})

// ---- Pet gags ----
import { stepFrame, startGag, releaseGag, eyesOf, forcePush, gitCommit } from './register.js'

// A 16x18 test pet: ground rows 15-17, an outlined body in rows 6-14, x 3-12,
// with two white eyes at (5,9) and (10,9).
const G = {
  bg: [20, 16, 42],
  ground: [29, 24, 56],
  line: [17, 23, 45],
  fill: [55, 68, 111],
  eye: [234, 234, 234],
  text: [0xe8, 0xe6, 0xf0],
  fed: [0xf2, 0xb8, 0x4b],
  gold: [0xf5, 0xd4, 0x4a],
  white: [0xff, 0xff, 0xff],
  sky: [0x7e, 0xc8, 0xe3],
  exp: [0x9d, 0x8c, 0xff],
  ink: [0x2a, 0x26, 0x40],
  warn: [0xff, 0x5a, 0x36],
}
const gagPet = (() => {
  const px = []
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 16; x++) {
      let c = y >= 15 ? G.ground : G.bg
      if (y >= 6 && y <= 14 && x >= 3 && x <= 12) c = y === 6 || y === 14 || x === 3 || x === 12 ? G.line : G.fill
      if (y === 9 && (x === 5 || x === 10)) c = G.eye
      px.push(...c)
    }
  }
  return Buffer.from(Uint8Array.from(px)).toString('base64')
})()
const tickHost = { ui: { invalidate() {} } }
const ticks = (n) => {
  for (let i = 0; i < n; i++) stepFrame(tickHost)
}
// The pixel at (x, y) as the image mode draws it (every mode shares present()).
const pxAt = (x, y) => {
  const b = Buffer.from(rgbaOf(gagPet), 'base64')
  const i = (y * 16 + x) * 4
  return [b[i], b[i + 1], b[i + 2]]
}
const frameRgb = () => {
  const b = Buffer.from(rgbaOf(gagPet), 'base64')
  const out = []
  for (let i = 0; i < 16 * 18; i++) out.push([b[i * 4], b[i * 4 + 1], b[i * 4 + 2]])
  return out
}
const topOf = () => {
  const f = frameRgb()
  for (let y = 0; y < 15; y++) for (let x = 0; x < 16; x++) if (f[y * 16 + x].join() === G.line.join()) return y
  return -1
}
function gagSetup(over = {}) {
  resetPortraitState()
  __state({ portrait: { frames: [gagPet], growth: 25000, name: 'Gag', status: 'awake', ...over }, hour: 12, gagsOn: true, failRun: 0, bite: null })
}
function allHooks() {
  const out = {}
  register((event, matcher, fn) => {
    const key = event + (typeof matcher === 'object' && matcher ? ':' + (matcher.command || matcher.component || matcher.door) : '')
    out[key] = typeof matcher === 'function' ? matcher : fn
  })
  return out
}
const deferred = () => {
  let resolve, reject
  const p = new Promise((a, b) => ((resolve = a), (reject = b)))
  return { p, resolve, reject }
}

__state({ hour: 12 })

test('gag pet: the eye finder finds the test pet eyes', () => {
  const raw = Buffer.from(gagPet, 'base64')
  const e = eyesOf(raw, measure(raw))
  assert.deepEqual([e.found, e.y, e.lx, e.rx, e.w], [true, 9, 5, 10, 1])
})

test('gag 1, thinking: dots blink above the head from turn.start until the first streamed chunk', async () => {
  gagSetup()
  const h = allHooks()
  await h['turn.start']({}, { turnId: 't1', text: 'hi' }, async (e) => ({ turnId: e.turnId }))
  let st = __state()
  assert.equal(st.gag.kind, 'think')
  assert.equal(st.gag.held, 1)
  // one dot first, then two, then three: (11,4), (13,4), (15,4)
  assert.deepEqual(pxAt(11, 4), G.text)
  ticks(3)
  assert.deepEqual(pxAt(13, 4), G.text)
  ticks(3)
  assert.deepEqual(pxAt(15, 4), G.text)
  // A subagent's turn does not think out loud.
  await h['turn.start']({}, { turnId: 't2', text: '', agentId: 'a1' }, async (e) => ({ turnId: e.turnId }))
  assert.equal(__state().gag.held, 1)
  async function* stream() {
    yield { kind: 'text', text: 'hel' }
    yield { kind: 'text', text: 'lo' }
    return { turnId: 't1', index: 0, text: 'hello' }
  }
  const gen = h['turn.step']({}, { turnId: 't1', index: 0, model: 'claude-x', messageCount: 1 }, () => stream())
  assert.deepEqual((await gen.next()).value, { kind: 'text', text: 'hel' })
  assert.equal(__state().gag.held, 0)
  assert.deepEqual((await gen.next()).value, { kind: 'text', text: 'lo' })
  const end = await gen.next()
  assert.equal(end.done, true)
  assert.deepEqual(end.value, { turnId: 't1', index: 0, text: 'hello' })
  ticks(1)
  st = __state()
  assert.equal(st.gag, null)
  assert.deepEqual(pxAt(11, 4), G.bg)
})

test('gag 2, tool props: each tool shows its prop while it runs and ~3s after', async () => {
  const h = allHooks()
  const cases = [
    ['Bash', 'hat', () => assert.deepEqual(pxAt(2, 5), G.fed)],
    ['Read', 'lens', () => assert.deepEqual(pxAt(11, 9), [0xc8, 0xc4, 0xd4])],
    ['Grep', 'lens', null],
    ['Glob', 'lens', null],
    ['Edit', 'pencil', () => assert.deepEqual(pxAt(12, measure(Buffer.from(gagPet, 'base64')).mouth), G.ink)],
    ['Write', 'pencil', null],
    ['WebSearch', 'binoculars', () => assert.deepEqual([pxAt(5, 9), pxAt(10, 9), pxAt(7, 8)], [G.sky, G.sky, G.ink])],
    ['WebFetch', 'binoculars', null],
    ['Agent', 'clone', null],
    ['Task', 'clone', null],
  ]
  for (const [tool, prop, check] of cases) {
    gagSetup()
    const d = deferred()
    const answer = { ref: 1, result: {}, text: 'ok' }
    const run = h['tool.call']({}, { tool, tool_use_id: 'u1', command: 'ls' }, () => d.p)
    let st = __state()
    assert.equal(st.gag.kind, 'prop', tool)
    assert.equal(st.gag.prop, prop, tool)
    assert.equal(st.gag.held, 1)
    if (check) check()
    ticks(30)
    assert.equal(__state().gag.prop, prop, 'held while the tool runs')
    d.resolve(answer)
    assert.equal(await run, answer, 'the tool answer passes through untouched')
    assert.equal(__state().gag.held, 0)
    ticks(29)
    assert.equal(__state().gag.prop, prop, 'lingers ~3s')
    ticks(1)
    assert.equal(__state().gag, null, tool)
  }
})

test('gag 2, clone: pops out (puff), stands small in front when there is no room beside, then poofs', async () => {
  gagSetup()
  const g = startGag({ kind: 'prop', prop: 'clone', held: 1 })
  // The pet spans x 3-12: 3 free columns, less than a third of its width, so a
  // 4x4 clone stands in front at x 12-15, rows 11-14, rimmed in the backdrop.
  assert.deepEqual(pxAt(14, 13), [0xc8, 0xc4, 0xd4], 'puff first')
  ticks(2)
  assert.deepEqual([pxAt(12, 11), pxAt(15, 14), pxAt(13, 12)], [G.line, G.line, G.fill])
  assert.deepEqual([pxAt(11, 12), pxAt(13, 10)], [G.bg, G.bg], 'rim')
  assert.deepEqual(pxAt(5, 9), G.eye, 'the rest of the pet is untouched')
  releaseGag(g)
  ticks(27)
  assert.deepEqual(pxAt(14, 13), [0xc8, 0xc4, 0xd4], 'poof at the end')
})

test('gag 2, clone: a narrow pet gets a clone beside it, the pet untouched', () => {
  const raw = Uint8Array.from(Buffer.from(gagPet, 'base64'))
  // Clear x 9-12 so the pet spans x 3-8 (6 wide), leaving 7 columns free.
  for (let y = 6; y <= 14; y++) for (let x = 9; x <= 12; x++) raw.set(G.bg, (y * 16 + x) * 3)
  for (let y = 6; y <= 14; y++) raw.set(G.line, (y * 16 + 8) * 3)
  const pet = Buffer.from(raw).toString('base64')
  gagSetup({ frames: [pet] })
  startGag({ kind: 'prop', prop: 'clone', held: 1 })
  ticks(2)
  const b = Buffer.from(rgbaOf(pet), 'base64')
  const px = (x, y) => [b[(y * 16 + x) * 4], b[(y * 16 + x) * 4 + 1], b[(y * 16 + x) * 4 + 2]]
  // half size: 3 wide, 5 tall, standing on the same row as the pet's feet, x 9-11
  assert.deepEqual([px(9, 10), px(11, 14), px(10, 12)], [G.line, G.line, G.fill])
  assert.deepEqual(px(8, 10), G.line, 'the pet keeps its edge')
  resetPortraitState()
})

test('gag 2: no props on an egg, a dead pet or a sleeping pet', async () => {
  const h = allHooks()
  for (const over of [{ growth: 10 }, { status: 'dead' }, { status: 'sleeping' }]) {
    gagSetup(over)
    await h['tool.call']({}, { tool: 'Bash', command: 'ls' }, async () => ({ result: {}, text: '' }))
    assert.equal(__state().gag, null, JSON.stringify(over))
  }
})

test('gag 3, fail flinch: an error gives a sweat drop and a 1-frame flinch; 3 in a row facepalm; a success resets', async () => {
  gagSetup()
  const h = allHooks()
  const fail = { ref: 1, result: 'boom', text: 'boom', isError: true }
  assert.equal(await h['tool.call']({}, { tool: 'Read', file_path: '/x' }, async () => fail), fail)
  let st = __state()
  assert.equal(st.failRun, 1)
  assert.equal(st.gag.kind, 'flinch')
  // flinch frame: the body slides 1px right, the sweat drop sits right of the head
  assert.deepEqual(pxAt(3, 10), G.bg)
  assert.deepEqual(pxAt(13, 10), G.line)
  assert.deepEqual([pxAt(14, 6), pxAt(14, 7)], [G.text, G.sky])
  ticks(1)
  assert.deepEqual(pxAt(3, 10), G.line, 'one frame only')
  await h['tool.call']({}, { tool: 'Read' }, async () => fail)
  await assert.rejects(h['tool.call']({}, { tool: 'Bash', command: 'x' }, async () => { throw new Error('gone') }), /gone/)
  st = __state()
  assert.equal(st.failRun, 3)
  assert.equal(st.gag.kind, 'facepalm')
  // the paw covers both eyes
  assert.notDeepEqual(pxAt(5, 9), G.eye)
  assert.notDeepEqual(pxAt(10, 9), G.eye)
  await h['tool.call']({}, { tool: 'Read' }, async () => ({ result: {}, text: 'fine' }))
  assert.equal(__state().failRun, 0)
  // a new turn resets the count too
  __state({ failRun: 2 })
  await h['turn.start']({}, { turnId: 't9', text: '' }, async () => ({ turnId: 't9' }))
  assert.equal(__state().failRun, 0)
})

test('gag 3: an egg flinches instead of facepalming', () => {
  gagSetup({ growth: 0 })
  __state({ failRun: 2 })
  assert.equal(startGag({ kind: 'facepalm' }).kind, 'flinch')
})

test('gag 4, abort dizzy: turn.abort or an aborted turn skids, then stars orbit the head for 2s', async () => {
  for (const fire of ['abort', 'complete']) {
    gagSetup()
    const h = allHooks()
    if (fire === 'abort') await h['turn.abort']({}, { turnId: 't1' }, async () => undefined)
    else await h['turn.complete'](server({}).$, { turnId: 't1', reason: 'aborted' }, async () => ({ text: '' }))
    let st = __state()
    assert.equal(st.gag.kind, 'dizzy', fire)
    // skid: 2px, then 1, then 1, then still
    assert.deepEqual([pxAt(4, 10), pxAt(14, 10)], [G.bg, G.line])
    const stars = frameRgb().filter((c, i) => i < 7 * 16 && (c.join() === G.gold.join() || c.join() === G.white.join()))
    assert.ok(stars.length >= 2, 'stars around the head top')
    ticks(4)
    assert.deepEqual(pxAt(3, 10), G.line)
    ticks(15)
    assert.equal(__state().gag.kind, 'dizzy')
    ticks(1)
    assert.equal(__state().gag, null)
  }
})

test('gag 5, big meal: a turn 3x the usual bulges the belly, says burp!, then slows the bob', async () => {
  freshPet({ portrait: { frames: [gagPet], growth: 25000, name: 'Gag', status: 'awake' } })
  __state({ hour: 12, gagsOn: true, meals: [100, 3] })
  const h = allHooks()
  const host = server({})
  // 30000 opus output tokens = 1200 xp, 12x the 100 xp average
  await h['turn.complete'](host.$, { turnId: 'big1', reason: 'answer', model: 'claude-opus-4', usage: { output_tokens: 30000 } }, async () => ({ text: '' }))
  let st = __state()
  assert.equal(st.gag.kind, 'burp')
  assert.equal(st.mealN, 4)
  __state({ bite: null })
  // belly rows (below the mouth) are 1px wider each side
  const m = measure(Buffer.from(gagPet, 'base64'))
  assert.deepEqual([pxAt(2, m.mouth + 1), pxAt(13, m.mouth + 1)], [G.line, G.line])
  assert.deepEqual(pxAt(2, 7), G.bg, 'not above the mouth')
  const el = (type) => (props) => ({ type, props })
  const $r = { ui: { resolve: () => ({ Box: el('box'), Text: el('text'), Raster: el('raster'), Svg: el('svg') }) } }
  const tree = await h['ui.render:AbovePrompt']($r, { surface: 'terminal' }, async () => null)
  assert.ok(JSON.stringify(tree).includes('"burp!"'))
  // a normal meal is not big
  __state({ gag: null, meals: [100, 3] })
  await h['turn.complete'](host.$, { turnId: 'n1', reason: 'answer', model: 'claude-opus-4', usage: { output_tokens: 5000 } }, async () => ({ text: '' }))
  assert.equal(__state().gag, null)
  // the bob slows for 3s once the burp ends
  gagSetup()
  startGag({ kind: 'burp' })
  ticks(15)
  st = __state()
  assert.equal(st.gag, null)
  assert.equal(st.slowLeft, 30)
})

test('gag 6, compact squish: squashes to ~60% while compacting, then springs back with an overshoot', async () => {
  gagSetup()
  const h = allHooks()
  assert.equal(topOf(), 6)
  const d = deferred()
  const run = h['session.compact']({}, { trigger: 'manual', messages: [] }, () => d.p)
  assert.equal(__state().gag.kind, 'squish')
  assert.equal(topOf(), 8, 'first tick: half the squash')
  ticks(1)
  // 4 rows asked; this small pet has only 2 droppable rows once its eyes and mouth stay
  assert.equal(topOf(), 8)
  assert.deepEqual([pxAt(5, 9), pxAt(10, 9), pxAt(5, 8)], [G.eye, G.eye, G.line], 'the rows above the eyes go, the eyes stay')
  ticks(40)
  assert.equal(topOf(), 8, 'holds while the compaction runs')
  const done = { messages: [], tokensBefore: 10, tokensAfter: 5 }
  d.resolve(done)
  assert.equal(await run, done)
  const tops = []
  for (let i = 0; i < 10; i++) {
    tops.push(topOf())
    ticks(1)
  }
  assert.deepEqual(tops, [8, 8, 8, 8, 8, 8, 4, 4, 8, 6])
  assert.ok(tops.every((t) => t % 2 === 0), 'whole cells only')
  assert.equal(__state().gag, null)
  // a precompute or a subagent's compaction does not squish
  await h['session.compact']({}, { trigger: 'precompute', messages: [] }, async () => ({ messages: [] }))
  await h['session.compact']({}, { trigger: 'auto', agentId: 'a1', messages: [] }, async () => ({ messages: [] }))
  assert.equal(__state().gag, null)
})

const compactRow = (type, agentId) => ({ message: { type, name: type === 'system' ? 'compact_boundary' : undefined, content: [] }, door: 'compaction', origin: { kind: 'engine' }, uuid: 'r' + Math.random(), agentId })

test('gag 6, compact squish fallback: the compaction rows squish once where session.compact is blocked', async () => {
  gagSetup()
  __state({ compactAt: [-Infinity, -Infinity] })
  const h = allHooks()
  const append = h['session.append:compaction']
  const stored = { message: {}, uuid: 'x' }
  // no session.compact hook ran (a policy plugin answered it): boundary then summary
  assert.equal(await append({}, compactRow('system'), async () => stored), stored, 'the row passes through untouched')
  const sq = __state().gag
  assert.equal(sq.kind, 'squish')
  assert.equal(sq.held, 0)
  ticks(1)
  await append({}, compactRow('user'), async () => stored)
  assert.equal(__state().gag, sq, 'the summary row is the same compaction')
  ticks(10)
  assert.equal(__state().gag, null)
  // a subagent's compaction rows do not squish
  gagSetup()
  ticks(60)
  await append({}, compactRow('system', 'a1'), async () => stored)
  await append({}, compactRow('user', 'a1'), async () => stored)
  assert.equal(__state().gag, null)
  // a later compaction, past the cooldown, squishes again
  ticks(110)
  await append({}, compactRow('system'), async () => stored)
  assert.equal(__state().gag.kind, 'squish')
})

test('gag 6, compact squish: session.compact and the compaction rows together squish once', async () => {
  gagSetup()
  __state({ compactAt: [-Infinity, -Infinity] })
  const h = allHooks()
  const append = h['session.append:compaction']
  const stored = { message: {}, uuid: 'x' }
  ticks(200)
  // a slow compaction: the rows land well past the 10s cooldown
  const d = deferred()
  const run = h['session.compact']({}, { trigger: 'auto', messages: [] }, () => d.p)
  assert.equal(__state().gag.kind, 'squish')
  ticks(300)
  d.resolve({ messages: [] })
  await run
  await append({}, compactRow('system'), async () => stored)
  await append({}, compactRow('user'), async () => stored)
  ticks(10)
  assert.equal(__state().gag, null, 'no second squish')
  // rows that land before session.compact resolves are matched too
  ticks(200)
  const d2 = deferred()
  const run2 = h['session.compact']({}, { trigger: 'manual', messages: [] }, () => d2.p)
  ticks(150)
  await append({}, compactRow('system'), async () => stored)
  d2.resolve({ messages: [] })
  await run2
  ticks(10)
  assert.equal(__state().gag, null, 'no second squish')
  // a precompute marks nothing, so a later compaction's rows (its hook blocked) still squish
  ticks(200)
  await h['session.compact']({}, { trigger: 'precompute', messages: [] }, async () => ({ messages: [] }))
  await h['session.compact']({}, { trigger: 'auto', agentId: 'a1', messages: [] }, async () => ({ messages: [] }))
  assert.equal(__state().gag, null)
  await append({}, compactRow('system'), async () => stored)
  assert.equal(__state().gag.kind, 'squish')
  ticks(20)
  // a skipped or failed compaction leaves no mark behind
  ticks(200)
  await h['session.compact']({}, { trigger: 'manual', messages: [] }, async () => ({ skip: 'no' }))
  await assert.rejects(h['session.compact']({}, { trigger: 'manual', messages: [] }, async () => { throw new Error('boom') }), /boom/)
  ticks(200)
  await append({}, compactRow('system'), async () => stored)
  assert.equal(__state().gag.kind, 'squish')
})

test('gag 7, git moments: a commit throws confetti after it lands; a force push horrifies', async () => {
  assert.equal(gitCommit('git add -A && git commit -m "x"'), true)
  assert.equal(gitCommit('git -C repo commit --amend'), true)
  assert.equal(gitCommit('git log --grep commit'), false)
  assert.equal(gitCommit('echo commit'), false)
  assert.equal(forcePush('git push --force origin main'), true)
  assert.equal(forcePush('git push -f'), true)
  assert.equal(forcePush('git push -uf origin x'), true)
  assert.equal(forcePush('git push --force-with-lease'), true)
  assert.equal(forcePush('git push origin feature-f'), false)
  assert.equal(forcePush('git push && rm -f x'), false)
  gagSetup()
  const h = allHooks()
  await h['tool.call']({}, { tool: 'Bash', command: 'git commit -m wip' }, async () => ({ result: {}, text: '' }))
  let st = __state()
  assert.equal(st.gag.kind, 'confetti')
  const colors = [[0xf2, 0xb8, 0x4b], [0x9d, 0x8c, 0xff], [0xff, 0x5a, 0x36], [0xe8, 0xe6, 0xf0]].map((c) => c.join())
  ticks(3)
  assert.ok(frameRgb().filter((c, i) => i < 6 * 16 && colors.includes(c.join())).length >= 3, 'confetti above the head')
  ticks(11)
  assert.equal(__state().gag, null)
  // a failed commit flinches instead
  await h['tool.call']({}, { tool: 'Bash', command: 'git commit' }, async () => ({ result: 'x', isError: true }))
  assert.equal(__state().gag.kind, 'flinch')
  gagSetup()
  const run = h['tool.call']({}, { tool: 'Bash', command: 'git push --force' }, async () => ({ result: {}, text: '' }))
  st = __state()
  assert.equal(st.gag.kind, 'horror')
  assert.equal(st.gagNext.prop, 'hat', 'the hat waits its turn')
  // wide eyes: white above and below each pupil, and a ! over the head
  assert.deepEqual([pxAt(5, 8), pxAt(5, 10), pxAt(10, 8), pxAt(10, 10)], [G.white, G.white, G.white, G.white])
  assert.deepEqual(pxAt(13, 2), G.warn)
  await run
  ticks(15)
  assert.equal(__state().gag.kind, 'prop', 'the queued hat plays after')
})

test('gag 8, late night: a nightcap from 00:00 to 05:00', () => {
  gagSetup()
  assert.deepEqual(pxAt(5, 5), G.bg)
  for (const hour of [0, 2, 4]) {
    __state({ hour })
    assert.deepEqual(pxAt(5, 5), G.text, 'trim at ' + hour)
    assert.deepEqual(pxAt(6, 4), G.exp)
  }
  assert.equal(__state().busy, false, 'the nightcap alone keeps the pet idle')
  __state({ hour: 5 })
  assert.deepEqual(pxAt(5, 5), G.bg)
  // a gag on the head takes the slot
  __state({ hour: 2 })
  startGag({ kind: 'prop', prop: 'hat', held: 1 })
  assert.deepEqual(pxAt(5, 5), G.fed)
  __state({ hour: 12 })
})

test('gags: one at a time, higher priority replaces, lower waits then drops', () => {
  gagSetup()
  const hat = startGag({ kind: 'prop', prop: 'hat', held: 1 })
  const fl = startGag({ kind: 'flinch' })
  assert.equal(__state().gag, fl)
  startGag({ kind: 'prop', prop: 'pencil', held: 0 })
  assert.equal(__state().gag, fl)
  assert.equal(__state().gagNext.prop, 'pencil')
  ticks(8)
  assert.equal(__state().gag.prop, 'pencil')
  releaseGag(hat)
  // a queued gag that waits past 2s is dropped
  gagSetup()
  const squish = startGag({ kind: 'squish', held: 1 })
  startGag({ kind: 'confetti' })
  ticks(25)
  assert.equal(__state().gagNext, null)
  releaseGag(squish)
  ticks(10)
  assert.equal(__state().gag, null)
  // the same gag again holds the running one, it does not stack
  const a = startGag({ kind: 'prop', prop: 'hat', held: 1 })
  const b = startGag({ kind: 'prop', prop: 'hat', held: 1 })
  assert.equal(a, b)
  assert.equal(a.held, 2)
  assert.equal(__state().gagNext, null)
})

test('gags: a lingering prop gives way to the next tool, a waiting gag and thinking', async () => {
  gagSetup()
  const h = allHooks()
  await h['tool.call']({}, { tool: 'Bash', command: 'ls' }, async () => ({ result: {}, text: '' }))
  assert.equal(__state().gag.prop, 'hat')
  ticks(5)
  // the next tool's prop takes over at once
  const d = deferred()
  const run = h['tool.call']({}, { tool: 'Read', file_path: '/x' }, () => d.p)
  assert.equal(__state().gag.prop, 'lens')
  assert.equal(__state().gag.held, 1)
  d.resolve({ result: {}, text: '' })
  await run
  // the same prop again holds the lingering one, it does not restart it
  const lens = __state().gag
  ticks(5)
  const again = startGag({ kind: 'prop', prop: 'lens', held: 1 })
  assert.equal(again, lens)
  assert.equal(again.held, 1)
  releaseGag(again)
  // thinking dots replace a lingering prop
  startGag({ kind: 'think', held: 1 })
  assert.equal(__state().gag.kind, 'think')
  // a gag queued behind a held prop plays as soon as the prop is released,
  // not dropped while the prop lingers
  gagSetup()
  const hat = startGag({ kind: 'prop', prop: 'hat', held: 1 })
  startGag({ kind: 'prop', prop: 'pencil', held: 0 })
  assert.equal(__state().gagNext.prop, 'pencil')
  releaseGag(hat)
  ticks(1)
  assert.equal(__state().gag.prop, 'pencil')
  // a higher priority gag still replaces a held prop
  gagSetup()
  startGag({ kind: 'prop', prop: 'hat', held: 1 })
  assert.equal(startGag({ kind: 'flinch' }).kind, 'flinch')
  assert.equal(__state().gag.kind, 'flinch')
})

test('gags: a reaction kind cools down ~10s after it starts; other kinds still fire', () => {
  for (const kind of ['confetti', 'burp', 'horror', 'flinch', 'facepalm', 'squish', 'dizzy']) {
    gagSetup()
    assert.ok(startGag({ kind }), kind)
    ticks(30)
    __state({ gag: null, gagNext: null })
    assert.equal(startGag({ kind }), null, kind + ' cooling down')
    ticks(69)
    assert.equal(startGag({ kind }), null, kind + ' still cooling at 9.9s')
    ticks(1)
    assert.ok(startGag({ kind }), kind + ' again after 10s')
  }
  // another kind is not held back by one cooling down
  gagSetup()
  startGag({ kind: 'flinch' })
  ticks(10)
  assert.equal(startGag({ kind: 'flinch' }), null)
  assert.equal(startGag({ kind: 'dizzy' }).kind, 'dizzy')
  assert.equal(startGag({ kind: 'confetti' }).kind, 'confetti')
  // props and thinking have no cooldown
  gagSetup()
  for (let i = 0; i < 3; i++) {
    const p = startGag({ kind: 'prop', prop: 'hat', held: 1 })
    assert.ok(p)
    releaseGag(p)
    ticks(40)
    const th = startGag({ kind: 'think', held: 1 })
    assert.ok(th)
    releaseGag(th)
    ticks(1)
  }
  // clearGags (a reset) ends every cooldown
  gagSetup()
  startGag({ kind: 'dizzy' })
  assert.equal(startGag({ kind: 'dizzy' }), null)
  gagSetup()
  assert.ok(startGag({ kind: 'dizzy' }))
})

test('gags: a fail run flinches once, then facepalms, without replaying the flinch', async () => {
  gagSetup()
  const h = allHooks()
  const fail = async () => ({ result: 'x', text: 'x', isError: true })
  await h['tool.call']({}, { tool: 'Read' }, fail)
  assert.equal(__state().gag.kind, 'flinch')
  ticks(8)
  assert.equal(__state().gag, null)
  await h['tool.call']({}, { tool: 'Read' }, fail)
  assert.equal(__state().gag.kind, 'prop', 'no second flinch within 10s, only the lingering lens')
  await h['tool.call']({}, { tool: 'Read' }, fail)
  assert.equal(__state().gag.kind, 'facepalm')
})

test('gags: wake, revive, arrive, evolve and gleam win; a bite keeps its pose', () => {
  for (const scene of [{ wakeLeft: 5 }, { reviveLeft: 5 }, { gleamLeft: 5 }, { evolveLeft: 5 }]) {
    gagSetup()
    __state(scene)
    assert.equal(startGag({ kind: 'dizzy' }), null, JSON.stringify(scene))
  }
  gagSetup()
  startGag({ kind: 'dizzy' })
  __state({ evolveLeft: 5 })
  ticks(1)
  assert.equal(__state().gag, null, 'a scene drops the running gag')
  // during a bite the flinch draws its sweat drop but not its slide
  gagSetup()
  __state({ bite: { mode: 'wait', tick: 0, xp: 1, kind: 'opus' } })
  startGag({ kind: 'flinch' })
  assert.deepEqual(pxAt(3, 10), G.line)
  assert.deepEqual(pxAt(13, 7), G.sky)
  __state({ bite: null })
})

test('gags: busy while a gag runs, idle once it ends', () => {
  gagSetup()
  assert.equal(__state().busy, false)
  startGag({ kind: 'flinch' })
  assert.equal(__state().busy, true)
  ticks(8)
  assert.equal(__state().busy, false)
})

test('/omn gags off turns every gag and the nightcap off, on brings them back', async () => {
  gagSetup()
  const host = server({})
  const omn = allHooks()['command.run:omn']
  assert.deepEqual(await omn(host.$, { args: 'gags' }), { text: 'omn gags on' })
  __state({ hour: 2 })
  startGag({ kind: 'dizzy' })
  assert.deepEqual(await omn(host.$, { args: 'gags off' }), { text: 'omn gags off' })
  assert.equal(host.data.get('gags'), 'off')
  let st = __state()
  assert.equal(st.gag, null)
  assert.equal(startGag({ kind: 'dizzy' }), null)
  assert.deepEqual(pxAt(5, 5), G.bg, 'no nightcap')
  assert.deepEqual(await omn(host.$, { args: 'gags on' }), { text: 'omn gags on' })
  assert.equal(host.data.get('gags'), 'on')
  assert.deepEqual(pxAt(5, 5), G.text)
  assert.deepEqual(await omn(host.$, { args: 'gags maybe' }), { text: 'usage: /omn gags on|off' })
  __state({ hour: 12 })
})

test('gags: the three render modes draw the same gag pixels', () => {
  gagSetup()
  startGag({ kind: 'dizzy' })
  const img = frameRgb().map((c) => (c[0] << 16) | (c[1] << 8) | c[2])
  setRenderEnv({ override: 'halfblock' })
  const hb = cellsOf(rasterOf(gagPet))
  setRenderEnv({ override: 'blocks', colorterm: 'truecolor' })
  const bl = cellsOf(rasterOf(gagPet))
  setRenderEnv({})
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 16; x++) {
      assert.equal(hb[((y >> 1) * 16 + x) * 3 + (y % 2 ? 2 : 1)], img[y * 16 + x])
      assert.equal(bl[(y * 32 + x * 2) * 3 + 2], img[y * 16 + x])
    }
  }
  resetPortraitState()
})

test('gags: feet drawn on the ground band move with a slide and stay planted in a squish', () => {
  const foot = [0x30, 0x20, 0x18]
  const raw = Uint8Array.from(Buffer.from(gagPet, 'base64'))
  for (const x of [4, 11]) raw.set(foot, (15 * 16 + x) * 3)
  const pet = Buffer.from(raw).toString('base64')
  const px = (x, y) => {
    const b = Buffer.from(rgbaOf(pet), 'base64')
    const i = (y * 16 + x) * 4
    return [b[i], b[i + 1], b[i + 2]]
  }
  gagSetup({ frames: [pet] })
  startGag({ kind: 'flinch' })
  assert.deepEqual([px(4, 15), px(5, 15), px(12, 15)], [G.ground, foot, foot], 'feet slide with the body, ground fills behind')
  gagSetup({ frames: [pet] })
  startGag({ kind: 'squish', held: 1 })
  ticks(1)
  assert.deepEqual([px(4, 15), px(11, 15)], [foot, foot])
  assert.deepEqual(px(4, 14), G.line, 'the bottom body row stays on the feet')
  resetPortraitState()
})

test('gags: face props stay put on a blink frame (eyes found once per pet)', () => {
  const raw = Uint8Array.from(Buffer.from(gagPet, 'base64'))
  for (const x of [5, 10]) raw.set(G.fill, (9 * 16 + x) * 3)
  const blink = Buffer.from(raw).toString('base64')
  const px = (frame, x, y) => {
    const b = Buffer.from(rgbaOf(frame), 'base64')
    const i = (y * 16 + x) * 4
    return [b[i], b[i + 1], b[i + 2]]
  }
  gagSetup({ frames: [gagPet, gagPet, blink] })
  startGag({ kind: 'prop', prop: 'binoculars', held: 1 })
  for (const f of [gagPet, blink]) assert.deepEqual([px(f, 5, 9), px(f, 10, 9), px(f, 7, 8)], [G.sky, G.sky, G.ink])
  resetPortraitState()
})

// ---- Steady pet while working ----
import { petTop, seamScore } from './register.js'

// Plays a main-loop turn's first streamed chunk, which ends the thinking dots.
async function firstChunk(h) {
  async function* stream() {
    yield { kind: 'text', text: 'hi' }
    return { turnId: 't1', index: 0, text: 'hi' }
  }
  const gen = h['turn.step']({}, { turnId: 't1', index: 0, model: 'claude-x', messageCount: 1 }, () => stream())
  while (!(await gen.next()).done);
}
// Ticks n frames and returns the highest idleHop seen.
const hopsIn = (n) => {
  let most = 0
  for (let i = 0; i < n; i++) {
    stepFrame(tickHost)
    most = Math.max(most, __state().idleHop)
  }
  return most
}

test('working: no idle hop after 8s+ of quiet while a turn is active', async () => {
  gagSetup()
  const h = allHooks()
  await h['turn.start']({}, { turnId: 't1', text: 'hi' }, async (e) => ({ turnId: e.turnId }))
  await firstChunk(h)
  ticks(20)
  assert.equal(__state().gag, null, 'the thinking dots are gone, nothing else holds the pet')
  assert.equal(__state().working, true)
  assert.equal(hopsIn(300), 0, '30s of streaming and no hop')
  assert.equal(__state().quiet, 0)
  resetPortraitState()
})

test('working: the idle hop returns after the turn ends', async () => {
  gagSetup()
  const h = allHooks()
  await h['turn.start']({}, { turnId: 't1', text: 'hi' }, async (e) => ({ turnId: e.turnId }))
  await firstChunk(h)
  ticks(100)
  // A subagent's turn ending does not end the main turn.
  await h['turn.complete'](server({}).$, { turnId: 't2', agentId: 'a1', reason: 'completed' }, async () => ({ text: '' }))
  assert.equal(__state().working, true)
  await h['turn.complete'](server({}).$, { turnId: 't1', reason: 'completed' }, async () => ({ text: '' }))
  assert.equal(__state().working, false)
  assert.equal(hopsIn(79), 0, 'quiet for 8s first')
  assert.ok(hopsIn(1) > 0, 'then the idle hop')
  resetPortraitState()
})

test('working: turn.abort clears the working state', async () => {
  gagSetup()
  const h = allHooks()
  await h['turn.start']({}, { turnId: 't1', text: 'hi' }, async (e) => ({ turnId: e.turnId }))
  assert.equal(__state().working, true)
  await h['turn.abort']({}, { turnId: 't1' }, async () => undefined)
  assert.equal(__state().working, false)
  resetPortraitState()
})

test('working: a missed turn end cannot hold the idle hop back forever', async () => {
  gagSetup()
  const h = allHooks()
  await h['turn.start']({}, { turnId: 't1', text: 'hi' }, async (e) => ({ turnId: e.turnId }))
  await firstChunk(h)
  ticks(3000)
  // A tool call while the turn runs pushes the timeout back.
  await h['tool.call']({}, { tool: 'Bash', tool_use_id: 'u1', command: 'ls' }, async () => ({ text: 'ok' }))
  ticks(5990)
  assert.equal(__state().working, true)
  ticks(20)
  assert.equal(__state().working, false, '10 min with no turn event clears it')
  assert.ok(hopsIn(100) > 0)
  // A subagent turn's steps do not start the working state on their own.
  resetPortraitState()
  gagSetup()
  await h['turn.start']({}, { turnId: 't3', text: '', agentId: 'a1' }, async (e) => ({ turnId: e.turnId }))
  assert.equal(__state().working, false)
  resetPortraitState()
})

test('working: a gag starting mid-hop cancels the hop, and no hop draws under a gag', () => {
  gagSetup()
  const rest = topOf()
  __state({ idleHop: 4, tick: 0 })
  assert.equal(topOf(), rest - 2, 'the idle hop lifts the pet on an even tick')
  startGag({ kind: 'prop', prop: 'hat', held: 1 })
  assert.equal(__state().idleHop, 0)
  assert.equal(topOf(), rest)
  // Even if a hop is left running, a shown gag keeps the body down.
  __state({ idleHop: 4, tick: 0 })
  assert.equal(topOf(), rest)
  resetPortraitState()
})

// An animated pet: the test pet, the same pet one pixel higher (a breathing
// bob), and a blink at the lower height.
const bobPet = (() => {
  const raw = Uint8Array.from(Buffer.from(gagPet, 'base64'))
  const up = new Uint8Array(raw)
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 16; x++) up.set(y + 1 < 15 ? raw.subarray(((y + 1) * 16 + x) * 3, ((y + 1) * 16 + x) * 3 + 3) : G.bg, (y * 16 + x) * 3)
  }
  const blink = new Uint8Array(raw)
  for (const x of [5, 10]) blink.set(G.fill, (9 * 16 + x) * 3)
  const b64 = (u) => Buffer.from(u).toString('base64')
  return [gagPet, gagPet, b64(up), b64(up), b64(blink)]
})()
const shownRgb = (frame) => {
  const b = Buffer.from(rgbaOf(frame), 'base64')
  const out = new Uint8Array(16 * 18 * 3)
  for (let i = 0; i < 16 * 18; i++) out.set([b[i * 4], b[i * 4 + 1], b[i * 4 + 2]], i * 3)
  return out
}

test('steady: the seam nudge is the same on every frame of an animated pet', () => {
  const raws = bobPet.map((f) => Uint8Array.from(Buffer.from(f, 'base64')))
  assert.deepEqual(raws.map(petTop), [6, 6, 5, 5, 6], 'the frames bob by one pixel')
  gagSetup({ frames: bobPet })
  const tops = bobPet.map((f) => petTop(shownRgb(f)))
  assert.equal(new Set(tops).size, 1, 'one height on every frame: ' + tops)
  const s = seamScore(shownRgb(bobPet[0]))
  assert.ok(s.split <= s.joined, 'the hard color changes sit inside a cell')
  // The same answer every time a frame comes round, and on a reload of the pet.
  for (let i = 0; i < 3; i++) assert.deepEqual(bobPet.map((f) => petTop(shownRgb(f))), tops)
  gagSetup({ frames: [...bobPet] })
  assert.deepEqual(bobPet.map((f) => petTop(shownRgb(f))), tops)
  resetPortraitState()
})

test('steady: gag overlay rows stay constant across frames of an animated pet', () => {
  const overlay = (frame, g) => {
    __state({ gag: null })
    const plain = shownRgb(frame)
    __state({ gag: g })
    const dressed = shownRgb(frame)
    const px = []
    for (let i = 0; i < 16 * 18; i++) if (plain.subarray(i * 3, i * 3 + 3).join() !== dressed.subarray(i * 3, i * 3 + 3).join()) px.push(i % 16 + ',' + Math.floor(i / 16))
    return px.join(' ')
  }
  for (const spec of [{ kind: 'prop', prop: 'hat' }, { kind: 'prop', prop: 'lens' }, { kind: 'prop', prop: 'binoculars' }, { kind: 'prop', prop: 'pencil' }]) {
    gagSetup({ frames: bobPet })
    const g = startGag({ ...spec, held: 1 })
    const all = bobPet.map((f) => overlay(f, g))
    assert.ok(all[0].length > 0, spec.prop)
    assert.equal(new Set(all).size, 1, spec.prop + ': ' + all.join(' | '))
  }
  // The nightcap too.
  gagSetup({ frames: bobPet })
  const caps = bobPet.map((f) => {
    __state({ hour: 12 })
    const plain = shownRgb(f).join()
    __state({ hour: 2 })
    const capped = shownRgb(f)
    return capped.join() === plain ? '' : petTop(capped)
  })
  __state({ hour: 12 })
  assert.equal(new Set(caps).size, 1, 'nightcap: ' + caps)
  assert.notEqual(caps[0], '')
  resetPortraitState()
})

// ---- Head props follow the head; food draws on top ----
// There are no species files in the repo, so these pets stand in for the range
// of the real ones: a box body (x 3..12) whose top row is anywhere from row 0
// to row 8 (tall pets touch the top of the frame), with or without a one-pixel
// antenna over the head, and a narrow and a wide body.
function shapePet(top, { antenna = false, left = 3, right = 12 } = {}) {
  const px = []
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 16; x++) {
      let c = y >= 15 ? G.ground : G.bg
      const t = top + (antenna ? 1 : 0)
      if (y >= t && y <= 14 && x >= left && x <= right) c = y === t || y === 14 || x === left || x === right ? G.line : G.fill
      if (antenna && y === top && x === (left + right) >> 1) c = G.line
      if (y === 14 && x > left && x < right) c = G.eye
      px.push(...c)
    }
  }
  return Buffer.from(Uint8Array.from(px)).toString('base64')
}
const rgbaPx = (frame, x, y) => {
  const b = Buffer.from(rgbaOf(frame), 'base64')
  const i = (y * 16 + x) * 4
  return [b[i], b[i + 1], b[i + 2]]
}
const sameRgb = (a, b) => a.join() === b.join()
// How far the body was lifted this frame (negative: lowered by the seam nudge).
// The bottom row's inner pixels are a marker color that sits on row 14 at rest.
// Lowered into the ground band they are hidden, and then the head row (the first
// outline pixel on the left wall) gives the shift.
function liftOf(frame, p) {
  for (let y = 14; y >= 0; y--) for (let x = 0; x < 16; x++) if (sameRgb(rgbaPx(frame, x, y), G.eye)) return 14 - y
  for (let y = 0; y < 15; y++) if (sameRgb(rgbaPx(frame, p.left, y), G.line)) return p.top - y
  return null
}
const pets = []
for (let top = 0; top <= 8; top++) {
  for (const antenna of [false, true]) {
    for (const [left, right] of [[3, 12], [5, 10]]) pets.push({ top: top + (antenna ? 1 : 0), frame: shapePet(top, { antenna, left, right }), left, right })
  }
}

// What lifts the body: nothing, an idle hop (no gag shown, so the nightcap only),
// and a bite catch (2 and 4 rows up), which a gag draws on.
const liftModes = [
  { name: 'rest', setup: () => {} },
  { name: 'hop', setup: () => __state({ idleHop: 5 }), noGag: true },
  { name: 'bite2', setup: () => __state({ bite: { mode: 'catch', tick: 1, xp: 1, kind: 'other' } }) },
  { name: 'bite4', setup: () => __state({ bite: { mode: 'catch', tick: 3, xp: 1, kind: 'other' } }) },
]

test('head props: hard hat and nightcap keep their gap to the head on every frame, off screen too', () => {
  for (const kind of ['hat', 'nightcap']) {
    for (const p of pets) {
      for (const mode of liftModes) {
        if (kind === 'hat' && mode.noGag) continue
        gagSetup({ frames: [p.frame] })
        __state({ tick: 0, idleHop: 0, hour: kind === 'nightcap' ? 2 : 12 })
        if (kind === 'hat') startGag({ kind: 'prop', prop: 'hat', held: 1 })
        mode.setup()
        const lift = liftOf(p.frame, p)
        const head = p.top - lift
        const who = `${kind} top ${p.top} x ${p.left}-${p.right} ${mode.name} lift ${lift}`
        assert.ok(lift !== null, who)
        if (mode.name !== 'rest') assert.ok(lift > 0, who)
        const mid = (p.left + p.right) >> 1
        // the first hat row above the head: brim for the hard hat, band for the nightcap
        const row = head - 1
        if (row >= 0) assert.deepEqual(rgbaPx(p.frame, p.left + (kind === 'hat' ? 0 : 1), row), kind === 'hat' ? G.fed : G.text, who + ' band')
        if (kind === 'hat') {
          if (row - 1 >= 0) assert.deepEqual(rgbaPx(p.frame, p.left + 1, row - 1), G.gold, who + ' dome')
          if (row - 2 >= 0 && p.right - p.left >= 6) assert.deepEqual(rgbaPx(p.frame, mid, row - 2), G.gold, who + ' crown')
        } else if (row - 1 >= 0) {
          assert.deepEqual(rgbaPx(p.frame, p.left + 1, row - 1), G.exp, who + ' cap')
        }
        // the head row itself is the pet's, not the prop's (a lift off the top clips the body before a seam nudge lowers it, so only at rest)
        if (head >= 0 && mode.name === 'rest') assert.deepEqual(rgbaPx(p.frame, p.left, head), G.line, who + ' head')
      }
    }
  }
  __state({ hour: 12, idleHop: 0, bite: null })
})

test('food: the bite token draws over the hard hat on every bite frame', () => {
  const p = pets.find((q) => q.top === 6 && q.left === 3 && q.right === 12)
  const tokenAt = (tick) => {
    const m = measure(Buffer.from(p.frame, 'base64'))
    const sky = Math.max(0, m.top - 3)
    return tick < 12 ? sky + Math.round(((m.mouth - 1 - sky) * tick) / 11) : m.mouth - 1
  }
  let overlaps = 0
  for (let tick = 0; tick < 20; tick++) {
    gagSetup({ frames: [p.frame] })
    __state({ tick: 0, idleHop: 0 })
    startGag({ kind: 'prop', prop: 'hat', held: 1 })
    // a seam nudge lifts the body, and the food in its mouth with it
    const nudge = liftOf(p.frame, p)
    __state({ bite: { mode: 'wait', tick, xp: 1, kind: 'opus' } })
    const m = measure(Buffer.from(p.frame, 'base64'))
    const y = tokenAt(tick) - (tick >= 12 ? nudge : 0)
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      assert.deepEqual(rgbaPx(p.frame, m.tx + dx, y + dy), G.warn, `tick ${tick} token pixel ${dx},${dy}`)
    }
    // the hat is up there while the food is in front of it
    if (y <= 5 && y + 1 >= 3 && m.tx + 1 >= p.left - 1) overlaps++
  }
  assert.ok(overlaps > 0, 'the token passes through the hat rows')
  __state({ bite: null })
})

test('solid mode: uniform cell is a space with background, two-color cell is ▀ or ▄', () => {
  const px = Array.from({ length: 16 * 18 }, () => [10, 20, 30]).flat()
  const at = (x, y, c) => px.splice((y * 16 + x) * 3, 3, ...c)
  at(3, 4, [200, 100, 50]) // cell (2,3): top differs from bottom
  setRenderEnv({ override: 'solid', colorterm: '24bit' })
  const cells = cellsOf(rasterOf(Buffer.from(Uint8Array.from(px)).toString('base64')))
  setRenderEnv({})
  assert.equal(cells.length, 16 * 9 * 3)
  assert.deepEqual([cells[0], cells[1], cells[2]], [0x20, 0x01000000, (10 << 16) | (20 << 8) | 30])
  const i = (2 * 16 + 3) * 3
  assert.ok(cells[i] === 0x2580 || cells[i] === 0x2584)
})

test('solid mode: two-color cells use the glyph whose background matches the vertical neighbor', () => {
  const palette = [[10, 20, 30], [200, 100, 50], [0, 255, 0]]
  const px = []
  for (let i = 0; i < 16 * 18; i++) px.push(...palette[(i * 7 + Math.floor(i / 16) * 3) % 3 === 0 ? 1 : i % 5 === 0 ? 2 : 0])
  setRenderEnv({ override: 'solid', colorterm: '24bit' })
  const cells = cellsOf(rasterOf(Buffer.from(Uint8Array.from(px)).toString('base64')))
  setRenderEnv({})
  // Rebuild the 16x18 pixel grid from the cells, then check each cell against the rule.
  const grid = []
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 16; x++) {
      const [g, fg, bg] = cells.slice((y * 16 + x) * 3, (y * 16 + x) * 3 + 3)
      grid[2 * y * 16 + x] = g === 0x2580 ? fg : g === 0x2584 ? bg : bg
      grid[(2 * y + 1) * 16 + x] = g === 0x2580 ? bg : g === 0x2584 ? fg : bg
    }
  }
  let mixed = 0
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 16; x++) {
      const [g, fg, bg] = cells.slice((y * 16 + x) * 3, (y * 16 + x) * 3 + 3)
      if (g === 0x20) continue
      mixed++
      const top = grid[2 * y * 16 + x], bot = grid[(2 * y + 1) * 16 + x]
      const above = y > 0 ? grid[(2 * y - 1) * 16 + x] : -1
      const below = y < 8 ? grid[(2 * y + 2) * 16 + x] : -1
      assert.notEqual(top, bot)
      const upper = bot === below || top !== above
      assert.deepEqual([g, fg, bg], upper ? [0x2580, top, bot] : [0x2584, bot, top])
    }
  }
  assert.ok(mixed > 0)
})
