// Run: node plugin/claude/hooks/preview-pet-hop.js [--old <git-ref>] [--all] [<petId | frames.json> ...]
//
// Shows each pose the plugin moves the pet through (hop, bite catch, chew,
// drop-in) for the old register.js (default ref: main) next to this checkout.
// With no ids it uses a built-in pet whose feet sit on the ground band.
// --all renders every idle frame of a pet, not only the first.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as next from './register.js'

const here = dirname(fileURLToPath(import.meta.url))
const helpers = ['liftPet', 'measure', 'shadeFoot']

const args = process.argv.slice(2)
let oldRef = 'main'
let all = false
const inputs = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--old') oldRef = args[++i]
  else if (args[i] === '--all') all = true
  else inputs.push(args[i])
}

// Load register.js from a git ref, exporting the motion helpers if that
// version kept them private.
async function loadOld(ref) {
  let src = execFileSync('git', ['show', `${ref}:./register.js`], { cwd: here, encoding: 'utf8' })
  const missing = helpers.filter(
    (n) => new RegExp(`^function ${n}\\b`, 'm').test(src) && !new RegExp(`export\\s*\\{[^}]*\\b${n}\\b|export function ${n}\\b`).test(src),
  )
  if (missing.length) src += `\nexport { ${missing.join(', ')} }\n`
  const dir = mkdtempSync(join(tmpdir(), 'omn-preview-'))
  const file = join(dir, 'register.mjs')
  writeFileSync(file, src)
  try {
    return await import(pathToFileURL(file).href)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// A 16x18 pet: body above the ground line, feet drawn on the ground band.
function sample() {
  const sky = [0x20, 0x24, 0x40]
  const dirt = [0x5a, 0x40, 0x2a]
  const fur = [0xd0, 0x90, 0x50]
  const paw = [0x30, 0x20, 0x18]
  const eye = [0xf0, 0xf0, 0xf0]
  const buf = new Uint8Array(16 * 18 * 3)
  const put = (x, y, c) => buf.set(c, (y * 16 + x) * 3)
  for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) put(x, y, y >= 15 ? dirt : sky)
  for (let y = 8; y <= 14; y++) for (let x = 5; x <= 10; x++) put(x, y, fur)
  put(6, 10, eye)
  put(9, 10, eye)
  for (const x of [5, 6, 9, 10]) {
    put(x, 15, paw)
    put(x, 16, paw)
  }
  return { label: 'sample (feet on ground band)', frames: [Buffer.from(buf).toString('base64')] }
}

async function source(input) {
  if (existsSync(input)) return { label: input, ...JSON.parse(readFileSync(input, 'utf8')) }
  const res = await fetch(`https://omn.sh/p/${encodeURIComponent(input)}.json?t=${Date.now()}`)
  if (!res.ok) throw new Error(`${input}: HTTP ${res.status}`)
  return { label: input, ...(await res.json()) }
}

const decode = (b64) => new Uint8Array(Buffer.from(b64, 'base64'))

// The same steps present() runs for a lift. Only a bite catch shades the
// spot the feet left, and only in versions that still have shadeFoot.
const poses = [
  ['idle', 0, false],
  ['hop +2', 2, false],
  ['catch +4', 4, true],
  ['chew -2', -2, false],
  ['drop +8', 8, false],
]

function pose(mod, idle, lift, bite) {
  const buf = idle.slice()
  if (!lift) return buf
  const m = mod.measure(idle)
  mod.liftPet(buf, lift)
  if (bite && mod.shadeFoot) mod.shadeFoot(buf, idle, m)
  return buf
}

// 16x18 pixels as 9 rows of half blocks: top pixel is fg, bottom is bg.
function rows(buf) {
  const out = []
  for (let y = 0; y < 18; y += 2) {
    let line = ''
    for (let x = 0; x < 16; x++) {
      const t = (y * 16 + x) * 3
      const b = ((y + 1) * 16 + x) * 3
      line += `\x1b[38;2;${buf[t]};${buf[t + 1]};${buf[t + 2]}m\x1b[48;2;${buf[b]};${buf[b + 1]};${buf[b + 2]}m▀`
    }
    out.push(line + '\x1b[0m')
  }
  return out
}

function show(label, idle, prev) {
  const gap = '  '
  const head = poses.map(([n]) => n.padEnd(16)).join(gap)
  console.log(`\n${label}`)
  for (const [name, mod] of [
    [`old (${oldRef})`, prev],
    ['new (this checkout)', next],
  ]) {
    console.log(`  ${name}`)
    console.log(`  ${head}`)
    const cols = poses.map(([, lift, bite]) => rows(pose(mod, idle, lift, bite)))
    for (let r = 0; r < 9; r++) console.log('  ' + cols.map((c) => c[r]).join(gap))
  }
}

const prev = await loadOld(oldRef)
const sources = inputs.length ? await Promise.all(inputs.map(source)) : [sample()]
for (const s of sources) {
  const frames = s.frames || []
  if (!frames.length) {
    console.log(`\n${s.label}: no frames`)
    continue
  }
  const pick = all ? frames : frames.slice(0, 1)
  pick.forEach((f, i) => show(pick.length > 1 ? `${s.label} frame ${i}` : s.label, decode(f), prev))
}
