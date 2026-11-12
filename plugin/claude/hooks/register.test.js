import test from 'node:test'
import assert from 'node:assert/strict'
import { handleStatus } from './register.js'

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
