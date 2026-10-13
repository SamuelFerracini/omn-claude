// Posts each Claude Code turn's billed tokens to omn.sh and draws that pet.
// The signature is ssh-keygen -Y sign -n omn over the same bytes as proto.Canonical.

const SERVER = 'https://omn.sh'
const PANE = 'omn'
const families = ['haiku', 'sonnet', 'opus', 'other']

let keyPath = ''
let petId = ''
let warned = false
let tick = 0
let lastSurface = 'terminal'
let portrait = null
let wakeFrom = null
let wakeLeft = 0
let note = ''
let noteLeft = 0
const pending = new Map()
const wakeStill = 14
const wakeStir = 8
let sessionLive = false

export function register(on) {
  on('session.start', async ($, e, next) => {
    sessionLive = true
    const savedKey = await $.store.get('sshKey')
    if (typeof savedKey === 'string' && savedKey !== '') keyPath = savedKey
    const savedPet = await $.store.get('petId')
    if (typeof savedPet === 'string' && savedPet !== '') petId = savedPet
    $.clock.every(100, () => stepFrame($))
    $.clock.every(30000, () => {
      if (!sessionLive) return
      postSession($, 'ping')
      refresh($)
    })
    try {
      await $.ui.close({ id: PANE })
    } catch (err) {}
    if (!petId) {
      const id = await petIdFromKey($)
      if (id) await rememberPet($, id)
    } else {
      await refresh($)
    }
    const held = await $.store.get('claudeAwake')
    if (portrait && portrait.status === 'sleeping' && held !== '1') beginWake()
    await postSession($, 'open')
    await $.store.set('claudeAwake', '1')
    if (wakeLeft === 0) await refresh($)
    await $.command.register({
      name: 'omn',
      description: 'Show your omn pet, or set its id or SSH key',
      argumentHint: '[pet id | key <path>]',
    })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    sessionLive = false
    wakeLeft = 0
    wakeFrom = null
    note = ''
    noteLeft = 0
    try {
      await postSession($, 'close')
      await $.store.set('claudeAwake', '')
    } catch (err) {}
    return next(e)
  })

  on('command.run', { command: 'omn' }, async ($, e) => {
    const arg = (e.args || '').trim()
    if (arg === '' || arg === 'show') {
      await refresh($)
      $.ui.invalidate('ui.render')
      return { text: petId ? 'omn ' + petId : 'usage: /omn <pet id>' }
    }
    if (arg.startsWith('key ') || arg.startsWith('/') || arg.startsWith('~') || arg.startsWith('.')) {
      keyPath = arg.startsWith('key ') ? arg.slice(4).trim() : arg
      await $.store.set('sshKey', keyPath)
      warned = false
      const id = await petIdFromKey($)
      if (id) await rememberPet($, id)
      return { text: id ? 'omn ' + id : 'omn key ' + keyPath }
    }
    if (/^[A-Za-z0-9_-]{8}$/.test(arg)) {
      await rememberPet($, arg)
      return { text: 'omn ' + arg }
    }
    return { text: 'usage: /omn <pet id> | /omn key <private-key>' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!portrait || !portrait.frames || !portrait.frames.length) return next(e)
    lastSurface = e.surface || 'terminal'
    const { Box, Text, Raster, Svg } = $.ui.resolve(e)
    const theirs = await next(e)
    const src = wakeFrom || portrait
    const frame = src.frames[tick % src.frames.length]
    const picture =
      lastSurface === 'terminal'
        ? Raster({ key: 'pet', columns: 16, rows: 9, cells: rasterOf(frame) })
        : Svg({ children: svgOf(frame) })
    const lines = [picture, meterText(Box, Text, (wakeFrom || portrait).growth)]
    if (theirs) lines.push(theirs)
    return Box({ flexDirection: 'column', children: lines })
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    note(e, result)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const id = e.turnId || ''
    const bag = pending.get(id) || pending.get('')
    pending.delete(id)
    pending.delete('')
    // Crumbs during the turn come from each request. The save uses the turn
    // total when Claude sends one, so the meal in the database is the tokens
    // the pet was fed, not a second copy of the same steps.
    const turnUsage = e.usage || (result && result.usage)
    const turnModel = e.model || (result && result.model)
    const turnDeltas = deltasOf(null, turnUsage, turnModel)
    const deltas = clampDeltas(xpOf(turnDeltas) > 0 ? turnDeltas : deltasOf(bag))
    if (fedMark === 0 && xpOf(deltas) > 0) {
      const n = Math.min(4, xpOf(deltas))
      for (let i = 0; i < n; i++) queueCrumb()
    }
    fedTurn = ''
    fedMark = 0
    if (xpOf(deltas) <= 0) return result
    try {
      const parsed = await post($, id, deltas)
      if (!parsed) return result
      // The signature is the SSH key's pet. A different id must not replace the one on screen.
      if (parsed.id && petId && parsed.id !== petId) {
        $.ui.log('omn kept ' + petId + '. token xp went to ' + parsed.id)
        return result
      }
      if (typeof parsed.growth === 'number' && portrait) {
        portrait.growth = parsed.growth
        $.ui.invalidate('ui.render')
      }
      if (parsed.xp > 0) $.ui.toast('omn +' + parsed.xp + ' xp')
      if (parsed.id && !petId) await rememberPet($, parsed.id)
    } catch (err) {
      $.ui.log('omn xp skipped: ' + (err && err.message ? err.message : 'sign'))
    }
    return result
  })
}

function beginWake() {
  wakeFrom = portrait
  wakeLeft = wakeStill + wakeStir
}

function stirring() {
  return wakeFrom && wakeLeft > 0 && wakeLeft <= wakeStir
}

function stepFrame($) {
  const src = wakeFrom || portrait
  if (!src || !src.frames || !src.frames.length) return
  tick++
  stepFeed()
  if (wakeLeft > 0) {
    wakeLeft--
    if (wakeLeft === 0) finishWake($)
  } else if (noteLeft > 0) {
    noteLeft--
    if (noteLeft === 0) note = ''
  }
  $.ui.invalidate('ui.render')
}

async function finishWake($) {
  try {
    await refresh($)
  } catch (err) {}
  wakeFrom = null
  note = 'awake!'
  noteLeft = 24
  $.ui.invalidate('ui.render')
}

async function rememberPet($, id) {
  petId = id
  await $.store.set('petId', id)
  await refresh($)
}

async function refresh($) {
  if (wakeLeft > 0 || !petId) return
  const res = await $.http.fetch(SERVER + '/p/' + petId + '.json?t=' + Date.now())
  if (!res.ok) return
  const data = JSON.parse(res.text)
  if (!data.frames || !data.frames.length) return
  if (typeof data.growth !== 'number' && portrait && typeof portrait.growth === 'number') data.growth = portrait.growth
  portrait = data
  $.ui.invalidate('ui.render')
}

const stageAt = [0, 500, 20000, 120000, 500000]
const pipChars = ['▂', '▄', '▆', '█']
const cDim = '#8a86a0'
const cExp = '#9d8cff'
const cOff = '#2a2640'
const cText = '#e8e6f0'
const cFed = '#f2b84b'

function meterText(Box, Text, growth) {
  const g = typeof growth === 'number' && isFinite(growth) ? Math.max(0, Math.round(growth)) : 0
  const lit = signalLevel(expPct(g))
  const on = pipChars.slice(0, lit).join('')
  const off = pipChars.slice(lit).join('')
  const row = [Text({ color: cDim, children: ['exp'] })]
  if (on) row.push(Text({ color: cExp, children: [on] }))
  if (off) row.push(Text({ color: cOff, children: [off] }))
  row.push(Text({ color: cText, children: [compact(g)] }))
  const lines = [Box({ flexDirection: 'row', columnGap: 1, children: row })]
  if (note) lines.push(Text({ color: cFed, children: [note] }))
  lines.push(Text({ color: cFed, children: ['ssh omn.sh'] }))
  return Box({ flexDirection: 'column', children: lines })
}

function expPct(g) {
  let stage = 0
  for (let i = stageAt.length - 1; i >= 0; i--) {
    if (g >= stageAt[i]) {
      stage = i
      break
    }
  }
  if (stage >= 4) return 100
  const lo = stageAt[stage]
  const hi = stageAt[stage + 1]
  if (hi <= lo) return 100
  const v = ((g - lo) / (hi - lo)) * 100
  if (v < 0) return 0
  if (v > 100) return 100
  return v
}

function signalLevel(v) {
  if (v <= 0) return 0
  const n = Math.ceil(v / 25)
  return n > 4 ? 4 : n
}

function compact(n) {
  if (n >= 1000000000) return unit(n, 1000000000, 'B')
  if (n >= 1000000) return unit(n, 1000000, 'M')
  if (n >= 1000) return unit(n, 1000, 'K')
  return String(n)
}

function unit(n, div, suffix) {
  const whole = Math.floor(n / div)
  const frac = Math.floor(((n % div) * 10) / div)
  return frac === 0 ? whole + suffix : whole + '.' + frac + suffix
}

function rasterOf(b64) {
  const raw = feedFrame(decodeB64(b64))
  if (stirring() && tick % 2 === 0) hop(raw)
  const cols = 16
  const nums = []
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < cols; x++) {
      const top = ((2 * y) * cols + x) * 3
      const bot = ((2 * y + 1) * cols + x) * 3
      nums.push(0x2580, rgb(raw, top), rgb(raw, bot))
    }
  }
  return bytesB64(new Uint8Array(Uint32Array.from(nums).buffer))
}

function svgOf(b64) {
  const raw = feedFrame(decodeB64(b64))
  if (stirring() && tick % 2 === 0) hop(raw)
  const px = 8
  let rects = ''
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 3
      const fill = '#' + hex(raw[i]) + hex(raw[i + 1]) + hex(raw[i + 2])
      rects += '<rect x="' + x * px + '" y="' + y * px + '" width="' + px + '" height="' + px + '" fill="' + fill + '"/>'
    }
  }
  const w = 16 * px
  const h = 18 * px
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + rects + '</svg>'
}

function rgb(raw, i) {
  return ((raw[i] || 0) << 16) | ((raw[i + 1] || 0) << 8) | (raw[i + 2] || 0)
}

function hex(n) {
  return (n || 0).toString(16).padStart(2, '0')
}

function decodeB64(s) {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesB64(u8) {
  if (typeof u8.toBase64 === 'function') return u8.toBase64()
  let s = ''
  for (const b of u8) s += String.fromCharCode(b)
  return btoa(s)
}

let crumbs = []
let chomp = 0
let spawned = 0
let fedMark = 0
let fedTurn = ''
const spawnX = [7, 8, 6, 9, 7, 8]
const mouthY = 12

function feedFrom(id, bag) {
  if (!bag) return
  if (id !== fedTurn) {
    fedTurn = id
    fedMark = 0
  }
  const xp = xpOf(deltasOf(bag))
  if (xp <= fedMark) return
  let n = xp - fedMark
  if (n > 4) n = 4
  for (let i = 0; i < n; i++) queueCrumb()
  fedMark = xp
}

function queueCrumb() {
  chomp = 4
  if (crumbs.length >= 6) return
  crumbs.push({ x: spawnX[spawned % spawnX.length], y: -crumbs.length * 2 })
  spawned++
}

function stepFeed() {
  if (chomp > 0) chomp--
  if (!crumbs.length) return
  const live = []
  for (const c of crumbs) {
    c.y += 0.5
    if (c.y < mouthY) live.push(c)
    else chomp = 4
  }
  crumbs = live
}

function feedFrame(raw) {
  if (!crumbs.length && chomp === 0) return raw
  const buf = new Uint8Array(raw)
  if (chomp > 0 && chomp % 2 === 0) hop(buf)
  for (const c of crumbs) {
    const x = c.x
    const y = Math.floor(c.y)
    if (y < 0 || y >= 18 || x < 0 || x >= 16) continue
    const i = (y * 16 + x) * 3
    buf[i] = 0xf2
    buf[i + 1] = 0xb8
    buf[i + 2] = 0x4b
  }
  return buf
}

function hop(buf) {
  const row = 16 * 3
  const copy = buf.slice()
  for (let y = 0; y < 17; y++) buf.set(copy.subarray((y + 1) * row, (y + 2) * row), y * row)
}

function note(e, result) {
  const u = result && result.usage
  if (!u) return
  const id = e.turnId || ''
  const model = (result && result.model) || u.model || e.model || ''
  const fam = family(model)
  let bag = pending.get(id)
  if (!bag) {
    bag = {}
    pending.set(id, bag)
  }
  const cur = bag[fam] || { in: 0, out: 0, cache_r: 0, cache_w: 0 }
  cur.in += num(u.input_tokens)
  cur.out += num(u.output_tokens)
  cur.cache_r += num(u.cache_read_input_tokens)
  cur.cache_w += num(u.cache_creation_input_tokens)
  bag[fam] = cur
  feedFrom(id, bag)
}

function deltasOf(bag, usage, model) {
  if (!bag && usage) {
    bag = {}
    bag[family(model || '')] = {
      in: num(usage.input_tokens),
      out: num(usage.output_tokens),
      cache_r: num(usage.cache_read_input_tokens),
      cache_w: num(usage.cache_creation_input_tokens),
    }
  }
  const out = []
  for (const fam of families) {
    const c = bag && bag[fam]
    if (!c) continue
    if (c.in + c.out + c.cache_r + c.cache_w <= 0) continue
    out.push({ family: fam, in: c.in, out: c.out, cache_r: c.cache_r, cache_w: c.cache_w })
  }
  return out
}

function family(model) {
  const m = String(model || '').toLowerCase()
  if (m.includes('opus')) return 'opus'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('haiku')) return 'haiku'
  return 'other'
}

function num(n) {
  return typeof n === 'number' && n > 0 ? Math.floor(n) : 0
}

const maxToken = 100000000

function clampDeltas(deltas) {
  const out = []
  for (const d of deltas) {
    const row = {
      family: d.family,
      in: capToken(d.in),
      out: capToken(d.out),
      cache_r: capToken(d.cache_r),
      cache_w: capToken(d.cache_w),
    }
    if (row.in + row.out + row.cache_r + row.cache_w <= 0) continue
    out.push(row)
  }
  return out
}

function capToken(n) {
  n = num(n)
  return n > maxToken ? maxToken : n
}

function xpOf(deltas) {
  let n = 0
  for (const d of deltas) {
    const m = d.family === 'opus' ? 4 : d.family === 'sonnet' ? 2 : 1
    n += m * (d.out + d.in + d.cache_w + Math.floor(d.cache_r / 25))
  }
  return Math.floor(n / 100)
}

function canonical(pubkey, ts, nonce, deltas) {
  let s = '{"pubkey":' + JSON.stringify(pubkey) + ',"ts":' + ts + ',"nonce":' + JSON.stringify(nonce) + ',"deltas":['
  deltas.forEach((d, i) => {
    if (i) s += ','
    s +=
      '{"family":' +
      JSON.stringify(d.family) +
      ',"in":' +
      d.in +
      ',"out":' +
      d.out +
      ',"cache_r":' +
      d.cache_r +
      ',"cache_w":' +
      d.cache_w +
      '}'
  })
  return s + ']}'
}

async function postSession($, op) {
  const nonce = sessionNonce()
  try {
    const signed = await signPayload($, nonce, (pubkey, ts) => sessionCanonical(pubkey, ts, nonce, op))
    if (!signed) return
    const res = await $.http.fetch(SERVER + '/v1/claude/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pubkey: signed.pubkey,
        ts: signed.ts,
        nonce,
        op,
        sig: signed.sig,
      }),
    })
    if (res.status === 401 || res.status === 404) return
    if (!res.ok) throw new Error('omn ' + res.status)
  } catch (err) {
    if (op === 'open') $.ui.log('omn stay-awake skipped: ' + (err && err.message ? err.message : 'sign'))
  }
}

function sessionNonce() {
  return ('s' + Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 64)
}

function sessionCanonical(pubkey, ts, nonce, op) {
  return (
    '{"pubkey":' +
    JSON.stringify(pubkey) +
    ',"ts":' +
    ts +
    ',"nonce":' +
    JSON.stringify(nonce) +
    ',"op":' +
    JSON.stringify(op) +
    '}'
  )
}

async function signPayload($, nonce, bodyOf) {
  const key = await resolveKey($)
  if (!key) {
    if (!warned) {
      warned = true
      $.ui.toast('omn: /omn key <ssh private key>')
    }
    return null
  }
  const pubRun = await $.process.run(['ssh-keygen', '-y', '-f', key])
  if (pubRun.exitCode !== 0) throw new Error('ssh-keygen -y')
  const pubkey = String(pubRun.stdout || '').trim()
  const ts = Math.floor(Date.now() / 1000)
  const body = bodyOf(pubkey, ts)
  const home = await $.env.get('HOME')
  const dir = String(home || '') + '/.config/omn'
  await $.process.run(['mkdir', '-p', dir])
  const path = dir + '/turn-' + nonce
  await $.fs.write(path, body)
  const signed = await $.process.run(['ssh-keygen', '-Y', 'sign', '-f', key, '-n', 'omn', path])
  if (signed.exitCode !== 0) throw new Error('ssh-keygen -Y sign')
  const armor = textOf(await $.fs.read(path + '.sig'))
  await $.process.run(['rm', '-f', path, path + '.sig'])
  return { pubkey, ts, sig: String(armor) }
}

async function post($, turnId, deltas) {
  const nonce = nonceOf(turnId)
  if (!nonce) throw new Error('turn id')
  const signed = await signPayload($, nonce, (pubkey, ts) => canonical(pubkey, ts, nonce, deltas))
  if (!signed) return null
  const res = await $.http.fetch(SERVER + '/v1/claude', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pubkey: signed.pubkey,
      ts: signed.ts,
      nonce,
      deltas,
      sig: signed.sig,
    }),
  })
  if (res.status === 401) return null
  if (!res.ok) throw new Error('omn ' + res.status)
  return JSON.parse(res.text)
}

function textOf(v) {
  if (typeof v === 'string') return v
  if (v && typeof v.text === 'string') return v.text
  if (v && typeof v.content === 'string') return v.content
  return ''
}

function nonceOf(id) {
  const raw = String(id || '')
  const s = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120)
  if (s.length > 0) return s
  return 't' + Date.now().toString(36)
}

async function petIdFromKey($) {
  const key = await resolveKey($)
  if (!key) return ''
  const run = await $.process.run(['ssh-keygen', '-lf', key])
  if (!run || run.exitCode !== 0) return ''
  const found = String(run.stdout || '').match(/SHA256:([A-Za-z0-9+/]+)/)
  if (!found) return ''
  return found[1].slice(0, 8).replaceAll('+', '-').replaceAll('/', '_')
}

async function resolveKey($) {
  if (keyPath) return keyPath
  const home = await $.env.get('HOME')
  if (!home) return ''
  for (const name of ['id_ed25519', 'id_rsa']) {
    const path = home + '/.ssh/' + name
    const exists = await $.fs.exists(path)
    if (exists === true || (exists && exists.value === true)) return path
  }
  return ''
}
