import test from 'node:test'
import assert from 'node:assert/strict'
import { register, handleStatus, petIdOf, sessionPetId, identityFilesOf, firstKeyOf, __state, tickRevive, tickGleam, tickArrive, beginWake, gleamSpots, resetPortraitState, postSession, refresh, releaseConfirm, nameCommand } from './register.js'

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

test('AbovePromptList: wide with other rows puts the pet left, others right', async () => {
  const seen = []
  const next = async (ev) => (seen.push(ev.props.rows), 'stacked others')
  const out = await listHook()($ui, listEvent([mineRow, theirRow]), next)
  assert.deepEqual(seen, [[theirRow]])
  assert.deepEqual(out, box({ flexDirection: 'row', columnGap: 2, children: ['pet', box({ flexGrow: 1, flexShrink: 1, children: ['stacked others'] })] }))
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
