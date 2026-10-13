// Posts each Claude Code turn's billed tokens to omn.sh and draws that pet.
// The signature is ssh-keygen -Y sign -n omn over the same bytes as proto.Canonical.

const SERVER = 'https://omn.sh'
const PANE = 'omn'
const families = ['haiku', 'sonnet', 'opus', 'other']

let keyPath = ''
let petId = ''
let warned = false
let paneOpen = false
let tick = 0
let lastSurface = 'terminal'
let portrait = null
const pending = new Map()

export function register(on) {
  on('session.start', async ($, e, next) => {
    const savedKey = await $.store.get('sshKey')
    if (typeof savedKey === 'string' && savedKey !== '') keyPath = savedKey
    const savedPet = await $.store.get('petId')
    if (typeof savedPet === 'string' && savedPet !== '') petId = savedPet
    $.clock.every(100, () => stepFrame($))
    $.clock.every(30000, () => refresh($))
    if (petId) await refresh($)
    await $.command.register({
      name: 'omn',
      description: 'Show your omn pet, or set its id or SSH key',
      argumentHint: '[pet id | key <path>]',
    })
    return next(e)
  })

  on('command.run', { command: 'omn' }, async ($, e) => {
    const arg = (e.args || '').trim()
    if (arg === '' || arg === 'show') {
      await openPane($, true)
      return {}
    }
    if (arg.startsWith('key ')) {
      keyPath = arg.slice(4).trim()
      await $.store.set('sshKey', keyPath)
      warned = false
      return { text: 'omn key ' + keyPath }
    }
    if (arg.startsWith('/') || arg.startsWith('~') || arg.startsWith('.')) {
      keyPath = arg
      await $.store.set('sshKey', keyPath)
      warned = false
      return { text: 'omn key ' + keyPath }
    }
    if (/^[A-Za-z0-9_-]{8}$/.test(arg)) {
      await rememberPet($, arg)
      await openPane($, true)
      return {}
    }
    return { text: 'usage: /omn <pet id> | /omn key <private-key>' }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    lastSurface = e.surface || 'terminal'
    const { Box, Text, Raster, Svg } = $.ui.resolve(e)
    if (!portrait || !portrait.frames || !portrait.frames.length) {
      return Text({ children: ['/omn <pet id>'] })
    }
    const frame = portrait.frames[tick % portrait.frames.length]
    const picture =
      lastSurface === 'terminal'
        ? Raster({ key: 'pet', columns: 16, rows: 9, cells: rasterOf(frame) })
        : Svg({ children: svgOf(frame) })
    return Box({
      flexDirection: 'column',
      children: [
        Text({ children: [portrait.name + ' · ' + portrait.status] }),
        picture,
        Text({
          children: ['hunger ' + Math.round(portrait.hunger) + '  mood ' + Math.round(portrait.mood)],
        }),
      ],
    })
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
    const deltas = deltasOf(bag, e.usage, e.model)
    if (xpOf(deltas) <= 0) return result
    try {
      const parsed = await post($, id, deltas)
      if (parsed && parsed.xp > 0) $.ui.toast('omn +' + parsed.xp + ' xp')
      if (parsed && parsed.id) {
        await rememberPet($, parsed.id)
        await openPane($, false)
      }
    } catch (err) {
      $.ui.log('omn xp skipped: ' + (err && err.message ? err.message : 'sign'))
    }
    return result
  })
}

function stepFrame($) {
  if (!paneOpen || !portrait || !portrait.frames || !portrait.frames.length) return
  tick++
  const frame = portrait.frames[tick % portrait.frames.length]
  if (lastSurface === 'terminal') {
    $.ui.blit({ requestId: PANE, key: 'pet', columns: 16, rows: 9, cells: rasterOf(frame) })
    return
  }
  $.ui.invalidate('ui.render')
}

async function rememberPet($, id) {
  petId = id
  await $.store.set('petId', id)
  await refresh($)
}

async function openPane($, focus) {
  const pane = { id: PANE, title: portrait && portrait.name ? portrait.name : 'omn' }
  if (focus) pane.focus = true
  const opened = await $.ui.open(pane)
  paneOpen = !opened || opened.isPlaced !== false
}

async function refresh($) {
  if (!petId) return
  const res = await $.http.fetch(SERVER + '/p/' + petId + '.json')
  if (!res.ok) return
  const data = JSON.parse(res.text)
  if (!data.frames || !data.frames.length) return
  portrait = data
  if (paneOpen) $.ui.invalidate('ui.render')
}

function rasterOf(b64) {
  const raw = decodeB64(b64)
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
  const raw = decodeB64(b64)
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

async function post($, turnId, deltas) {
  const nonce = nonceOf(turnId)
  if (!nonce) throw new Error('turn id')
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
  const body = canonical(pubkey, ts, nonce, deltas)
  const home = await $.env.get('HOME')
  const dir = String(home || '') + '/.config/omn'
  await $.process.run(['mkdir', '-p', dir])
  const path = dir + '/turn-' + nonce
  await $.fs.write(path, body)
  const signed = await $.process.run(['ssh-keygen', '-Y', 'sign', '-f', key, '-n', 'omn', path])
  if (signed.exitCode !== 0) throw new Error('ssh-keygen -Y sign')
  const armor = textOf(await $.fs.read(path + '.sig'))
  await $.process.run(['rm', '-f', path, path + '.sig'])
  const res = await $.http.fetch(SERVER + '/v1/claude', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pubkey,
      ts,
      nonce,
      deltas,
      sig: String(armor),
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
  const s = String(id || '')
  return /^[A-Za-z0-9_-]{1,128}$/.test(s) ? s : ''
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
