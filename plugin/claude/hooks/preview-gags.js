// Run: node plugin/claude/hooks/preview-gags.js <pet-id | pet.json> [--gags a,b] [--modes halfblock,blocks,image] [--png out.png] [--every]
// --every shows every tick instead of the picked ones.
// Draws each pet gag through the plugin's own render paths: the halfblock and
// blocks rasters and the image mode's RGBA. pet.json is a /p/<id>.json reply or
// a list of { species, stage, payload } (pick with --pets Cat:2,Robot:3).
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'
import { __state, resetPortraitState, startGag, releaseGag, stepFrame, rasterOf, rgbaOf, setRenderEnv } from './register.js'

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf('--' + name)
  return i >= 0 ? args[i + 1] : def
}
const source = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
if (!source) {
  console.log('usage: node plugin/claude/hooks/preview-gags.js <pet-id | pet.json> [--gags think,hat] [--modes halfblock,blocks,image] [--png out.png]')
  process.exit(1)
}

// Each gag: how to start it, and the ticks to show. release: tick to let go of a held gag.
const gags = {
  think: { start: () => startGag({ kind: 'think', held: 1 }), at: [0, 3, 6] },
  hat: { start: () => startGag({ kind: 'prop', prop: 'hat', held: 1 }), at: [0, 4] },
  lens: { start: () => startGag({ kind: 'prop', prop: 'lens', held: 1 }), at: [0, 4] },
  pencil: { start: () => startGag({ kind: 'prop', prop: 'pencil', held: 1 }), at: [0, 2] },
  binoculars: { start: () => startGag({ kind: 'prop', prop: 'binoculars', held: 1 }), at: [0, 4] },
  clone: { start: () => startGag({ kind: 'prop', prop: 'clone', held: 1 }), at: [0, 3, 12], release: 5 },
  flinch: { start: () => startGag({ kind: 'flinch' }), at: [0, 1, 5] },
  facepalm: { start: () => (__state({ failRun: 2 }), startGag({ kind: 'facepalm' })), at: [0, 3, 9] },
  dizzy: { start: () => startGag({ kind: 'dizzy' }), at: [0, 2, 6, 12] },
  burp: { start: () => startGag({ kind: 'burp' }), at: [0, 8] },
  squish: { start: () => startGag({ kind: 'squish', held: 1 }), at: [0, 1, 5, 10, 11, 12, 13, 14], release: 5 },
  confetti: { start: () => startGag({ kind: 'confetti' }), at: [0, 3, 7, 11] },
  horror: { start: () => startGag({ kind: 'horror' }), at: [0, 1, 4] },
  nightcap: { start: () => __state({ hour: 2 }), at: [0] },
  idle: { start: () => null, at: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
}

async function load(src) {
  if (/^[a-z2-7]{8}$/.test(src)) {
    const res = await fetch('https://omn.sh/p/' + src + '.json')
    if (!res.ok) throw new Error('omn.sh ' + res.status)
    return [{ label: src, payload: await res.json() }]
  }
  const data = JSON.parse(readFileSync(src, 'utf8'))
  if (!Array.isArray(data)) return [{ label: data.species || src, payload: data }]
  const want = (opt('pets', '') || '').split(',').filter(Boolean)
  return data
    .filter((e) => !want.length || want.includes(e.species + ':' + e.stage))
    .map((e) => ({ label: e.species + ':' + e.stage, payload: e.payload }))
}

const $ = { ui: { invalidate() {} } }

// Plays one gag on one pet and returns the frames (b64 of the idle frame) and the ticks.
function play(payload, name) {
  const spec = gags[name]
  resetPortraitState()
  __state({ portrait: { ...payload, status: 'awake' }, hour: 12, failRun: 0, gagsOn: true })
  const g = spec.start()
  const shots = []
  // The idle frames advance one per tick, as in the pane.
  const at = every ? Array.from({ length: Math.max(...spec.at) + 1 }, (_, i) => i) : spec.at
  for (let t = 0; t <= Math.max(...at); t++) {
    if (spec.release === t) releaseGag(g)
    const frame = payload.frames[t % payload.frames.length]
    if (at.includes(t)) shots.push({ t, frame, cells: snap(frame) })
    stepFrame($)
  }
  return shots
}

// Every mode's own output, read back into 16x18 RGB.
function snap(frame) {
  const out = {}
  setRenderEnv({ override: 'halfblock', colorterm: 'truecolor' })
  const hb = cells(rasterOf(frame))
  out.halfblock = grid((x, y) => hb[((y >> 1) * 16 + x) * 3 + (y % 2 ? 2 : 1)])
  setRenderEnv({ override: 'blocks', colorterm: 'truecolor' })
  const bl = cells(rasterOf(frame))
  out.blocks = grid((x, y) => bl[(y * 32 + x * 2) * 3 + 2])
  setRenderEnv({ override: 'image' })
  const rgba = Buffer.from(rgbaOf(frame), 'base64')
  out.image = grid((x, y) => (rgba[(y * 16 + x) * 4] << 16) | (rgba[(y * 16 + x) * 4 + 1] << 8) | rgba[(y * 16 + x) * 4 + 2])
  setRenderEnv({})
  return out
}

function cells(b64) {
  return Array.from(new Uint32Array(Uint8Array.from(Buffer.from(b64, 'base64')).buffer))
}

function grid(at) {
  const g = []
  for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) g.push(at(x, y) & 0xffffff)
  return g
}

// Terminal: two pixel rows per line with ▀, the same way the halfblock raster draws.
function ansi(rows) {
  const lines = []
  for (let y = 0; y < 18; y += 2) {
    let s = ''
    for (const g of rows) {
      for (let x = 0; x < 16; x++) {
        const a = g[y * 16 + x]
        const b = g[(y + 1) * 16 + x]
        s += `\x1b[38;2;${a >> 16};${(a >> 8) & 255};${a & 255}m\x1b[48;2;${b >> 16};${(b >> 8) & 255};${b & 255}m▀`
      }
      s += '\x1b[0m  '
    }
    lines.push(s)
  }
  return lines.join('\n')
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
          const v = g[Math.floor(y / scale) * 16 + Math.floor(x / scale)]
          const i = ((r * (18 + pad) * scale + y) * w + c * (16 + pad) * scale + x) * 3
          px[i] = v >> 16
          px[i + 1] = (v >> 8) & 255
          px[i + 2] = v & 255
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

const every = args.includes('--every')
const pets = await load(source)
const names = (opt('gags', '') || Object.keys(gags).join(',')).split(',')
const modes = (opt('modes', '') || 'halfblock,blocks,image').split(',')
const sheet = []
for (const pet of pets) {
  for (const name of names) {
    const shots = play(pet.payload, name)
    for (const mode of modes) {
      console.log(`${pet.label} ${name} ${mode} ticks ${shots.map((s) => s.t).join(',')}`)
      console.log(ansi(shots.map((s) => s.cells[mode])))
      sheet.push(shots.map((s) => s.cells[mode]))
    }
    // The three modes must agree pixel for pixel.
    for (const s of shots) {
      for (const mode of modes) if (s.cells[mode].join() !== s.cells[modes[0]].join()) console.log(`  ! ${mode} differs from ${modes[0]} at tick ${s.t}`)
    }
  }
}
const out = opt('png', '')
if (out) {
  png(out, sheet)
  console.log('wrote ' + out)
}
resetPortraitState()
