import test from 'node:test'
import assert from 'node:assert/strict'
import { register, handleStatus, petIdOf, sessionPetId, identityFilesOf, firstKeyOf, __state, tickRevive, tickGleam, beginWake, gleamSpots, resetPortraitState } from './register.js'

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

const HINT = 'No pet yet. Run `ssh omn.sh` to hatch it.'

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
