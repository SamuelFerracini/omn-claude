// Run: node scripts/preview-pet-working.js [--old <git-ref>] [--pets Cat:2,Robot:3] [--png out.png] <petId | pet.json> ...
//
// Plays one Claude Code turn through the plugin's own hooks, then idle time,
// and records the pet as drawn on every tick (100ms):
//   think dots, first streamed chunk, a Read (lens) and a Bash (hard hat)
//   tool call, 30s more of streaming, turn.complete, then 12s idle.
// For each pet it prints the body's top row per tick (one digit each, letters past
// 9), the hops seen while working and while idle, and a strip of frames with
// the gags on. --old <ref> runs the same turn on register.js from that ref
// (default: none) for comparison. pet.json is a /p/<id>.json reply or a list
// of { species, stage, payload } (pick with --pets).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as next from '../plugin/claude/hooks/register.js'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
let oldRef = ''
let want = []
let pngOut = ''
const inputs = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--old') oldRef = args[++i]
  else if (args[i] === '--pets') want = args[++i].split(',')
  else if (args[i] === '--png') pngOut = args[++i]
  else inputs.push(args[i])
}
if (!inputs.length) {
  console.log('usage: node scripts/preview-pet-working.js [--old <ref>] [--pets Cat:2] [--png out.png] <petId | pet.json> ...')
  process.exit(1)
}

async function loadOld(ref) {
  const src = execFileSync('git', ['show', `${ref}:plugin/claude/hooks/register.js`], { cwd: here, encoding: 'utf8' })
  const dir = mkdtempSync(join(tmpdir(), 'omn-preview-'))
  const file = join(dir, 'register.mjs')
  writeFileSync(file, src)
  try {
    return await import(pathToFileURL(file).href)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function load(src) {
  if (/^[a-z2-7]{8}$/.test(src) && !existsSync(src)) {
    const res = await fetch('https://omn.sh/p/' + src + '.json')
    if (!res.ok) throw new Error(src + ': omn.sh ' + res.status)
    return [{ label: src, payload: await res.json() }]
  }
  const data = JSON.parse(readFileSync(src, 'utf8'))
  if (!Array.isArray(data)) return [{ label: data.species || src, payload: data }]
  return data.filter((e) => !want.length || want.includes(e.species + ':' + e.stage)).map((e) => ({ label: e.species + ':' + e.stage, payload: e.payload }))
}

function hooksOf(mod) {
  const out = {}
  mod.register((event, matcher, fn) => {
    const key = event + (typeof matcher === 'object' && matcher ? ':' + (matcher.command || matcher.component) : '')
    out[key] = typeof matcher === 'function' ? matcher : fn
  })
  return out
}

const deferred = () => {
  let resolve
  const p = new Promise((a) => (resolve = a))
  return { p, resolve }
}
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

function rgbOf(mod, frame) {
  const b = Buffer.from(mod.rgbaOf(frame), 'base64')
  const out = new Uint8Array(16 * 18 * 3)
  for (let i = 0; i < 16 * 18; i++) out.set([b[i * 4], b[i * 4 + 1], b[i * 4 + 2]], i * 3)
  return out
}

// The body's top row on this tick, drawn with the gag hidden so a hat or the
// thinking dots do not count as the pet moving: the first row with two pet
// pixels side by side, so a lone twinkling star is not the pet.
function bodyTop(mod, frame) {
  const g = mod.__state().gag
  mod.__state({ gag: null })
  const buf = rgbOf(mod, frame)
  mod.__state({ gag: g })
  const mask = mod.bodyMask(buf, mod.floorAt(buf), [buf[0], buf[1], buf[2]])
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 15; x++) if (mask[y * 16 + x] && mask[y * 16 + x + 1]) return y
  }
  return -1
}

// Plays the turn on one pet. Returns per-tick crown rows, phases and snapshots.
async function play(mod, payload) {
  const h = hooksOf(mod)
  const $ = { ui: { invalidate() {} } }
  mod.resetPortraitState()
  mod.__state({ portrait: { ...payload, status: 'awake' }, hour: 12, gagsOn: true, failRun: 0 })
  const n = payload.frames.length
  const rows = []
  const shots = []
  let t = 0
  const step = (k, phase, snapAt = []) => {
    for (let i = 0; i < k; i++, t++) {
      const frame = payload.frames[t % n]
      rows.push({ phase, top: bodyTop(mod, frame) })
      if (snapAt.includes(i)) shots.push({ phase, t, buf: rgbOf(mod, frame) })
      mod.stepFrame($)
    }
  }
  await h['turn.start']({}, { turnId: 't1', text: 'hi' }, async (e) => ({ turnId: e.turnId }))
  step(6, 'think', [0, 3])
  // The first streamed chunk ends the thinking dots; the stream goes on.
  const chunks = deferred()
  async function* stream() {
    yield { kind: 'text', text: 'hi' }
    await chunks.p
    return { turnId: 't1', index: 0, text: 'hi' }
  }
  const gen = h['turn.step']({}, { turnId: 't1', index: 0, model: 'claude-x', messageCount: 1 }, () => stream())
  await gen.next()
  step(100, 'stream')
  for (const [tool, phase] of [
    ['Read', 'lens'],
    ['Bash', 'hat'],
  ]) {
    const d = deferred()
    const run = h['tool.call']({}, { tool, tool_use_id: tool, command: 'ls' }, () => d.p)
    step(n > 12 ? 12 : n, phase, [0, 6, 7, 11].filter((i) => i < n))
    d.resolve({ text: 'ok' })
    await run
    await flush()
    step(12, 'stream')
  }
  step(300, 'stream')
  chunks.resolve()
  while (!(await gen.next()).done);
  await h['turn.complete']({}, { turnId: 't1', reason: 'completed' }, async () => ({ text: '' }))
  step(120, 'idle')
  mod.resetPortraitState()
  return { rows, shots }
}

const digit = (v) => (v < 0 ? '.' : v < 10 ? String(v) : String.fromCharCode(87 + v))

// Rises: ticks where the body's top goes above the row it held the tick before.
function report(label, rows) {
  const working = rows.filter((r) => r.phase !== 'idle')
  const idle = rows.filter((r) => r.phase === 'idle')
  const rises = (rs) => rs.filter((r, i) => i && r.top >= 0 && rs[i - 1].top >= 0 && r.top < rs[i - 1].top).length
  const heights = (rs) => [...new Set(rs.map((r) => r.top))].sort((a, b) => a - b).join(',')
  console.log(`  ${label.padEnd(22)} working: top rows {${heights(working)}} rises ${rises(working)}   idle: rises ${rises(idle)}`)
  const line = rows.map((r) => digit(r.top)).join('')
  for (let i = 0; i < line.length; i += 120) console.log('    ' + line.slice(i, i + 120))
}

function ansi(bufs) {
  const out = []
  for (let y = 0; y < 18; y += 2) {
    let s = ''
    for (const b of bufs) {
      for (let x = 0; x < 16; x++) {
        const a = (y * 16 + x) * 3
        const c = ((y + 1) * 16 + x) * 3
        s += `\x1b[38;2;${b[a]};${b[a + 1]};${b[a + 2]}m\x1b[48;2;${b[c]};${b[c + 1]};${b[c + 2]}m▀`
      }
      s += '\x1b[0m  '
    }
    out.push('    ' + s)
  }
  return out.join('\n')
}

function png(path, sheet) {
  const scale = 6
  const pad = 2
  const cols = Math.max(...sheet.map((r) => r.length))
  const w = cols * (16 + pad) * scale
  const h = sheet.length * (18 + pad) * scale
  const px = Buffer.alloc(w * h * 3, 0x30)
  sheet.forEach((row, r) =>
    row.forEach((g, c) => {
      for (let y = 0; y < 18 * scale; y++) {
        for (let x = 0; x < 16 * scale; x++) {
          const s = (Math.floor(y / scale) * 16 + Math.floor(x / scale)) * 3
          const i = ((r * (18 + pad) * scale + y) * w + c * (16 + pad) * scale + x) * 3
          px[i] = g[s]
          px[i + 1] = g[s + 1]
          px[i + 2] = g[s + 2]
        }
      }
    }),
  )
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3)
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}

const mods = [['new (this checkout)', next]]
if (oldRef) mods.unshift([`old (${oldRef})`, await loadOld(oldRef)])
const pets = (await Promise.all(inputs.map(load))).flat()
const sheet = []
for (const pet of pets) {
  if (!pet.payload.frames || !pet.payload.frames.length) {
    console.log(`\n${pet.label}: no frames`)
    continue
  }
  console.log(`\n${pet.label}`)
  for (const [name, mod] of mods) {
    const { rows, shots } = await play(mod, pet.payload)
    report(name, rows)
    console.log(`    ${shots.map((s) => `${s.phase} t${s.t}`.padEnd(16)).join('  ')}`)
    console.log(ansi(shots.map((s) => s.buf)))
    sheet.push(shots.map((s) => s.buf))
  }
}
if (pngOut) {
  png(pngOut, sheet)
  console.log('wrote ' + pngOut)
}
