// Run: node scripts/check-head-seat.js <all-pets.json> [--items hat,nightcap,partyhat] [--pets Cat:2,Robot:3] [--max 40]
//
// Checks that the worn head items sit on the head, on every awake entry of
// all-pets.json (see scripts/all-pets.js) and every idle frame. For each frame
// it draws the pet as the image mode does, once plain and once with the item
// (the hard hat gag, the nightcap at 2:00, the party hat on Friday evening).
// The pixels that differ are the item; its lowest row is the brim. The body is
// the largest 8-connected part of the plain frame, found here without the
// plugin's own head code. A frame fails when:
//   gap:  no body pixel in the row right under the brim, inside the brim
//   wide: the brim reaches more than 1 pixel past the head run under it
// A frame where the item draws nothing (an egg wears nothing, a head on row 0
// puts the brim off the frame) is counted as skipped, not failed.
// Prints each failure (species, stage, gleam, frame, item, reason) and a
// summary; exits 1 when anything failed.
import { readFileSync } from 'node:fs'
import { __state, resetPortraitState, startGag, rgbaOf, setRenderEnv, bodyMask, measure } from '../plugin/claude/hooks/register.js'

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf('--' + name)
  return i >= 0 ? args[i + 1] : def
}
const src = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
if (!src) {
  console.log('usage: node scripts/check-head-seat.js <all-pets.json> [--items hat,nightcap,partyhat] [--pets Cat:2] [--max 40]')
  process.exit(1)
}
const items = opt('items', 'hat,nightcap,partyhat').split(',')
const want = opt('pets', '').split(',').filter(Boolean)
const maxShown = Number(opt('max', '40'))

// How each item is put on: a forced clock for the worn ones, the gag for the hat.
const wear = {
  hat: () => startGag({ kind: 'prop', prop: 'hat', held: 1 }),
  nightcap: () => __state({ hour: 2 }),
  partyhat: () => __state({ hour: 18, day: 5 }),
}

const never = () => 0.99

// portrait is one object per entry, so the plugin's per-pet caches (resting
// head, eyes) are built once and not once per frame.
function setup(portrait) {
  resetPortraitState()
  __state({ hour: null, day: null, rand: null })
  // 11:00 on a Wednesday wears nothing, and no idle gag rolls by chance.
  __state({ portrait, hour: 11, day: 3, rand: never, failRun: 0, gagsOn: true })
}

// The frame as the image mode draws it, as 16x18 RGB.
function drawn(frame) {
  const rgba = Buffer.from(rgbaOf(frame), 'base64')
  const rgb = Buffer.alloc(16 * 18 * 3)
  for (let i = 0; i < 16 * 18; i++) rgba.copy(rgb, i * 3, i * 4, i * 4 + 3)
  return rgb
}

// The largest 8-connected part of the pet's pixels in a drawn frame.
function body(rgb) {
  const m = measure(rgb)
  const mask = bodyMask(rgb, m.floor, m.bg)
  const seen = new Uint8Array(16 * 18)
  let best = []
  for (let s = 0; s < 16 * 18; s++) {
    if (!mask[s] || seen[s]) continue
    const part = []
    const q = [s]
    seen[s] = 1
    while (q.length) {
      const id = q.pop()
      part.push(id)
      const y = id >> 4
      const x = id & 15
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy
          const nx = x + dx
          if (ny < 0 || ny >= 18 || nx < 0 || nx >= 16) continue
          const n = ny * 16 + nx
          if (mask[n] && !seen[n]) {
            seen[n] = 1
            q.push(n)
          }
        }
      }
    }
    if (part.length > best.length) best = part
  }
  const out = new Uint8Array(16 * 18)
  for (const id of best) out[id] = 1
  return out
}

// null when the item sits right, else the reason.
function check(plain, worn) {
  let brimY = -1
  for (let i = 0; i < 16 * 18; i++) {
    if (plain[i * 3] !== worn[i * 3] || plain[i * 3 + 1] !== worn[i * 3 + 1] || plain[i * 3 + 2] !== worn[i * 3 + 2]) brimY = Math.max(brimY, Math.floor(i / 16))
  }
  if (brimY < 0) return 'off'
  const diffAt = (x, y) => {
    const i = (y * 16 + x) * 3
    return plain[i] !== worn[i] || plain[i + 1] !== worn[i + 1] || plain[i + 2] !== worn[i + 2]
  }
  let l = 16
  let r = -1
  for (let x = 0; x < 16; x++) {
    if (!diffAt(x, brimY)) continue
    l = Math.min(l, x)
    r = Math.max(r, x)
  }
  if (brimY >= 17) return `gap: brim on row ${brimY}, the last row`
  const b = body(plain)
  const y = brimY + 1
  const at = (x) => x >= 0 && x < 16 && b[y * 16 + x] === 1
  let under = false
  for (let x = l; x <= r; x++) if (at(x)) under = true
  if (!under) return `gap: brim row ${brimY} x ${l}-${r}, no body on row ${y} under it`
  // The head: the body runs on the row under the brim that it touches.
  let hl = 16
  let hr = -1
  for (let x = l; x <= r; x++) {
    if (!at(x)) continue
    let a = x
    let c = x
    while (at(a - 1)) a--
    while (at(c + 1)) c++
    hl = Math.min(hl, a)
    hr = Math.max(hr, c)
  }
  if (l < hl - 1 || r > hr + 1) return `wide: brim row ${brimY} x ${l}-${r}, head row ${y} x ${hl}-${hr}`
  return null
}

const data = JSON.parse(readFileSync(src, 'utf8'))
const entries = (Array.isArray(data) ? data : [{ species: data.species, stage: data.stage, gleam: data.gleam, status: 'awake', payload: data }])
  .filter((e) => (e.status || 'awake') === 'awake')
  .filter((e) => !want.length || want.includes(e.species + ':' + e.stage))

setRenderEnv({ override: 'image' })
const fails = []
let checked = 0
let skipped = 0
const byItem = Object.fromEntries(items.map((k) => [k, 0]))
const pets = new Set()
for (const e of entries) {
  const frames = [...new Set(e.payload.frames)]
  const portrait = { ...e.payload, status: 'awake' }
  for (const item of items) {
    for (const frame of frames) {
      setup(portrait)
      const plain = drawn(frame)
      setup(portrait)
      wear[item]()
      const worn = drawn(frame)
      checked++
      const why = check(plain, worn)
      if (why === 'off') skipped++
      if (!why || why === 'off') continue
      byItem[item]++
      pets.add(`${e.species}:${e.stage}${e.gleam ? ' gleam' : ''}`)
      fails.push(`${e.species} stage ${e.stage} gleam=${!!e.gleam} frame ${e.payload.frames.indexOf(frame)} ${item}: ${why}`)
    }
  }
}
setRenderEnv({})

for (const f of fails.slice(0, maxShown)) console.log(f)
if (fails.length > maxShown) console.log(`... ${fails.length - maxShown} more`)
console.log(`checked ${checked} frame/item pairs on ${entries.length} awake entries, ${skipped} skipped (item not drawn): ${fails.length} failures (${items.map((k) => `${k} ${byItem[k]}`).join(', ')}) on ${pets.size} pets`)
if (pets.size) console.log('pets: ' + [...pets].join(', '))
process.exit(fails.length ? 1 : 0)
