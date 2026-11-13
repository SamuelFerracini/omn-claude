import test from 'node:test'
import assert from 'node:assert/strict'
import { handleStatus, petIdOf, identityFilesOf, firstKeyOf } from './register.js'

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

test('petIdOf keeps only an 8-character pet id', () => {
  assert.equal(petIdOf('Ab3_-x9Z'), 'Ab3_-x9Z')
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
