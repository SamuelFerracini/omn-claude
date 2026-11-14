// Posts each Claude Code turn's billed tokens to omn.sh and draws that pet.
// The signature is ssh-keygen -Y sign -n omn over the same bytes as proto.Canonical.

const SERVER = 'https://omn.sh'
const VERSION = '0.4.27'
const VERSION_URL = 'https://raw.githubusercontent.com/SamuelFerracini/omn-claude/main/plugin/claude/.claude-plugin/plugin.json'
const PANE = 'omn'
const wideBandColumns = 60
const families = ['haiku', 'sonnet', 'opus', 'other']

let keyPath = ''
let releaseArmedAt = 0
const releaseWindow = 60000
const nickRule = /^[A-Za-z0-9_-]{1,12}$/
const usageText = 'usage: /omn | /omn key <private-key>'
let petId = ''
let warned = false
let tick = 0
let lastSurface = 'terminal'
let ownPlugin = 'omn'
let portrait = null
let wakeFrom = null
let wakeLeft = 0
let note = ''
let noteLeft = 0
let evolveFrom = null
let evolveLeft = 0
const evolveTicks = 50
let reviveFrom = null
let reviveTo = null
let reviveLeft = 0
let reviveGrowth = null
const reviveStill = 8
const reviveGlow = 10
const reviveFlash = 3
const reviveRise = 16
let gleamLeft = 0
let gleamEvolve = false
const gleamTicks = 14
let arriveFrom = null
let arriveTo = null
let arriveLeft = 0
let arriveName = ''
let arrivePrompt = false
// The pane line that asks for a nick. Set once when a hatch or release scene
// ends on a pet with the default nick. A successful /omn-name clears it.
let namePrompt = ''
const namePromptText = 'name your pet: /omn-name <nick>'
const arriveSpans = [
  ['leave', 10],
  ['drop', 10],
  ['wobble', 16],
  ['hatch', 4],
]
const arriveTotal = arriveSpans.reduce((n, s) => n + s[1], 0)
const pending = new Map()
const wakeStill = 14
const wakeStir = 8
let sessionLive = false
const sessionId = sessionNonce()
const leaseMs = 90000
let quiet = 0
let idleHop = 0
let sparkLeft = 0
let lastMealAt = 0
let combo = 0
const comboWindow = 180000
const quietAt = 80
let bits = []
let updateLine = ''
let updateChecked = 0
const updateEvery = 1800000

export function register(on) {
  on('session.start', async ($, e, next) => {
    sessionLive = true
    const savedKey = await $.store.get('sshKey')
    if (typeof savedKey === 'string' && savedKey !== '') keyPath = await preferPrivate($, savedKey)
    const savedPet = await $.store.get('petId')
    petId = petIdOf(savedPet)
    $.clock.every(100, () => stepFrame($))
    $.clock.every(30000, () => {
      if (!sessionLive) return
      postSession($, 'ping')
      holdSession($, true).catch(() => {})
      refresh($)
      if (Date.now() - updateChecked >= updateEvery) checkUpdate($).catch(() => {})
    })
    checkUpdate($).catch(() => {})
    try {
      await $.ui.close({ id: PANE })
    } catch (err) {}
    // The server picks a random id unrelated to the key. A signed reply carries it.
    await refresh($)
    const others = Object.keys(await otherSessions($)).length
    if (portrait && portrait.status === 'sleeping' && others === 0) beginWake()
    await postSession($, 'open')
    await holdSession($, true)
    if (wakeLeft === 0) await refresh($)
    await $.command.register({
      name: 'omn',
      description: 'Show your omn pet, or set its SSH key',
      argumentHint: '[key <path>]',
    })
    await $.command.register({
      name: 'omn-name',
      description: 'Rename your omn pet',
      argumentHint: '<nick>',
    })
    await $.command.register({
      name: 'omn-release',
      description: 'Release your omn pet to the graveyard and hatch a new egg',
      argumentHint: '[confirm]',
    })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    sessionLive = false
    wakeLeft = 0
    wakeFrom = null
    evolveLeft = 0
    evolveFrom = null
    reviveLeft = 0
    reviveFrom = null
    reviveTo = null
    reviveGrowth = null
    clearGleam()
    clearArrive()
    note = ''
    noteLeft = 0
    namePrompt = ''
    bits = []
    bites = []
    bite = null
    idleHop = 0
    sparkLeft = 0
    quiet = 0
    try {
      // Other Claude sessions still open keep the pet awake. Only the last one puts it to sleep.
      if ((await holdSession($, false)) === 0) await postSession($, 'close')
    } catch (err) {}
    return next(e)
  })

  on('command.run', { command: 'omn' }, async ($, e) => {
    const arg = (e.args || '').trim()
    releaseArmedAt = 0
    if (arg === '' || arg === 'show') {
      await refresh($)
      $.ui.invalidate('ui.render')
      return { text: petId ? 'omn ' + petId : usageText }
    }
    if (arg.startsWith('key ') || arg.startsWith('/') || arg.startsWith('~') || arg.startsWith('.')) {
      keyPath = await preferPrivate($, arg.startsWith('key ') ? arg.slice(4).trim() : arg)
      await $.store.set('sshKey', keyPath)
      warned = false
      // The old key's pet must not stay on screen. The reply of open brings the new key's pet.
      petId = ''
      portrait = null
      await $.store.set('petId', '')
      await postSession($, 'open')
      return { text: 'omn key ' + keyPath + (petId ? ' (' + petId + ')' : '') }
    }
    return { text: usageText }
  })

  on('command.run', { command: 'omn-name' }, async ($, e) => {
    releaseArmedAt = 0
    return nameCommand($, (e.args || '').trim())
  })

  on('command.run', { command: 'omn-release' }, async ($, e) => {
    const arg = (e.args || '').trim()
    const armedAt = releaseArmedAt
    if (arg === '') return releaseArm()
    releaseArmedAt = 0
    if (arg === 'confirm') return releaseConfirm($, armedAt)
    return { text: 'usage: /omn-release [confirm]' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!portrait || !portrait.frames || !portrait.frames.length) return next(e)
    lastSurface = e.surface || 'terminal'
    const { Box, Text, Raster, Svg } = $.ui.resolve(e)
    if (e.plugin) ownPlugin = e.plugin
    const src = shownPortrait()
    const frame = src.frames[tick % src.frames.length]
    const picture =
      lastSurface === 'terminal'
        ? Raster({ key: 'pet', columns: 16, rows: 9, cells: rasterOf(frame) })
        : Svg({ children: svgOf(frame) })
    return Box({ flexDirection: 'row', columnGap: 2, children: [picture, meterText(Box, Text, (wakeFrom || portrait).growth)] })
  })

  // The engine asks AbovePrompt once per plugin, so only the list sees every row.
  // next runs once (a second call fails validate): it gets the other rows, and
  // its answer sits beside omn's own row.
  on('ui.render', { component: 'AbovePromptList' }, async ($, e, next) => {
    const p = e.props || {}
    const rows = p.rows || []
    const mine = rows.filter((r) => r.plugin === ownPlugin)
    const others = rows.filter((r) => r.plugin !== ownPlugin)
    const wide = (p.bodyColumns || 0) >= wideBandColumns
    if (!wide || p.isCollapsed || p.hasSurvey || !mine.length || !others.length) return next(e)
    const { Box } = $.ui.resolve(e)
    const right = await next({ ...e, props: { ...p, rows: others } })
    return Box({
      flexDirection: 'row',
      columnGap: 2,
      children: [...mine.map((r) => r.tree), Box({ flexGrow: 1, flexShrink: 1, children: [right] })],
    })
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    tally(e, result)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const id = e.turnId || ''
    const bag = pending.get(id) || pending.get('')
    pending.delete(id)
    pending.delete('')
    // Bites during the turn come from each request. The save uses the turn
    // total when Claude sends one, so the meal in the database is the tokens
    // the pet was fed, not a second copy of the same steps.
    const turnUsage = e.usage || (result && result.usage)
    const turnModel = e.model || (result && result.model)
    const turnDeltas = deltasOf(null, turnUsage, turnModel)
    const deltas = clampDeltas(xpOf(turnDeltas) > 0 ? turnDeltas : deltasOf(bag))
    const fam = mealFamily(deltas)
    if (fedMark === 0 && xpOf(deltas) > 0) queueBite(xpOf(deltas), fam)
    fedTurn = ''
    fedMark = 0
    if (xpOf(deltas) <= 0) return result
    const wasSleeping = !!(portrait && portrait.status === 'sleeping' && wakeLeft === 0)
    try {
      const parsed = await post($, id, deltas)
      if (!parsed) return result
      // The signature is the SSH key's pet, so the server's id is the one that got the xp.
      const serverId = petIdOf(parsed.id)
      if (serverId && serverId !== petId) await rememberPet($, serverId)
      // A revive owns the portrait until it ends. It plays any evolve afterwards.
      if (parsed.revived) await beginRevive($, parsed.growth)
      else if (typeof parsed.growth === 'number' && portrait) {
        // A new stage needs the new frames. refresh fetches them and plays the evolve.
        // A sleeper keeps the old frames until the wake animation refetches.
        const stageUp = stageOf(parsed.growth) > stageOf(portrait.growth)
        if (stageUp && !wasSleeping) await refresh($, parsed.growth)
        else if (!stageUp) portrait.growth = parsed.growth
        $.ui.invalidate('ui.render')
      }
      if (wasSleeping) beginWake()
      applyCare(portrait, parsed)
      if (parsed.xp > 0) {
        $.ui.toast('omn +' + parsed.xp + ' xp')
        noteMeal(fam, parsed.xp)
      }
      await checkUpdate($, true)
    } catch (err) {
      $.ui.log('omn xp skipped: ' + (err && err.message ? err.message : 'sign'))
    }
    return result
  })
}

// Each open session keeps a lease in the store, renewed by the 30s ping. A crashed session's lease expires.
// shortcut: read-modify-write across processes can drop a lease if two sessions write at once; the next ping restores it.
async function otherSessions($) {
  let all = {}
  try {
    all = JSON.parse((await $.store.get('claudeSessions')) || '{}') || {}
  } catch (err) {}
  const live = {}
  for (const id in all) if (id !== sessionId && Date.now() - all[id] < leaseMs) live[id] = all[id]
  return live
}

async function holdSession($, open) {
  const live = await otherSessions($)
  if (open) live[sessionId] = Date.now()
  await $.store.set('claudeSessions', JSON.stringify(live))
  return Object.keys(live).length
}

function beginWake() {
  if (arriveLeft > 0) return
  clearGleam()
  wakeFrom = portrait
  wakeLeft = wakeStill + wakeStir
}

function stirring() {
  return wakeFrom && wakeLeft > 0 && wakeLeft <= wakeStir
}

function shownPortrait() {
  if (reviveLeft > reviveRise) return reviveFrom || portrait
  if (evolveFrom && evolveLeft > 0) {
    // Flip between the old and new form, faster as it nears the end.
    const period = Math.max(1, Math.ceil(evolveLeft / 10))
    return Math.floor(evolveLeft / period) % 2 ? evolveFrom : portrait
  }
  return wakeFrom || portrait
}

function stepFrame($) {
  const src = wakeFrom || portrait
  if (!src || !src.frames || !src.frames.length) return
  tick++
  stepFeed()
  stepBits()
  if (sparkLeft > 0 && !bite) sparkLeft--
  if (idleHop > 0) idleHop--
  if (wakeLeft > 0) {
    wakeLeft--
    if (wakeLeft === 0) finishWake($)
  } else if (reviveLeft > 0) {
    tickRevive($)
  } else if (gleamLeft > 0) {
    tickGleam()
  } else if (arriveLeft > 0) {
    tickArrive($)
  } else if (evolveLeft > 0) {
    evolveLeft--
    if (evolveLeft === 0) {
      evolveFrom = null
      bits = []
      note = 'evolved!'
      noteLeft = 30
    }
  } else if (noteLeft > 0) {
    noteLeft--
    if (noteLeft === 0) note = ''
  }
  if (busy()) quiet = 0
  else {
    quiet++
    if (quiet === quietAt) idleHop = 6
  }
  $.ui.invalidate('ui.render')
}

function busy() {
  return wakeLeft > 0 || reviveLeft > 0 || arriveLeft > 0 || evolveLeft > 0 || gleamLeft > 0 || sparkLeft > 0 || bite || bites.length > 0 || bits.length > 0 || idleHop > 0
}

function petDead() {
  return !!(portrait && portrait.status === 'dead')
}

function revivePhase() {
  const spent = reviveStill + reviveGlow + reviveFlash + reviveRise - reviveLeft
  if (spent < reviveStill) return 'still'
  if (spent < reviveStill + reviveGlow) return 'glow'
  if (spent < reviveStill + reviveGlow + reviveFlash) return 'flash'
  return 'rise'
}

// beginRevive holds the dead portrait, brightens it with a small hop, flashes,
// then swaps in the live portrait with a "revived!" note. It cancels a wake or
// evolve in progress. tickRevive plays the evolve afterwards if the stage went up.
async function beginRevive($, growth) {
  if (reviveLeft > 0) return
  clearGleam()
  cancelArrive()
  wakeLeft = 0
  wakeFrom = null
  evolveLeft = 0
  evolveFrom = null
  bits = []
  idleHop = 0
  bite = null
  reviveFrom = portrait
  reviveTo = null
  reviveGrowth = portrait && typeof portrait.growth === 'number' ? portrait.growth : null
  reviveLeft = reviveStill + reviveGlow + reviveFlash + reviveRise
  note = ''
  noteLeft = 0
  $.ui.toast('omn revived!')
  $.ui.invalidate('ui.render')
  try {
    if (!petId) return
    const res = await $.http.fetch(SERVER + '/p/' + petId + '.json?t=' + Date.now())
    if (!res.ok) return
    const data = JSON.parse(res.text)
    if (!data.frames || !data.frames.length) return
    if (typeof data.growth !== 'number' && typeof growth === 'number') data.growth = growth
    if (typeof data.growth !== 'number' && typeof reviveGrowth === 'number') data.growth = reviveGrowth
    if (reviveLeft <= 0) return
    reviveTo = data
    if (reviveLeft <= reviveRise) portrait = data
  } catch (err) {}
  $.ui.invalidate('ui.render')
}

function tickRevive($) {
  reviveLeft--
  if (reviveLeft === reviveRise) {
    if (reviveTo) portrait = reviveTo
    note = 'revived!'
    noteLeft = 24
  }
  if (reviveLeft > 0) return
  const missed = !reviveTo
  if (reviveTo) portrait = reviveTo
  const grew = !missed && typeof reviveGrowth === 'number' && stageOf(portrait.growth) > stageOf(reviveGrowth)
  reviveFrom = null
  reviveTo = null
  reviveGrowth = null
  if (!missed && portrait && portrait.gleam === true) {
    // Revive, then gleam, then the queued evolve.
    gleamLeft = gleamTicks
    gleamEvolve = grew
    return
  }
  if (grew) startRevivedEvolve()
  else if (missed) refresh($).catch(() => {})
}

// The old live form is not on hand, so the evolve plays its burst and note without the flip.
function startRevivedEvolve() {
  evolveLeft = evolveTicks
  burst()
}

function clearGleam() {
  gleamLeft = 0
  gleamEvolve = false
}

function tickGleam() {
  gleamLeft--
  if (gleamLeft > 0) return
  const evolve = gleamEvolve
  clearGleam()
  if (evolve) startRevivedEvolve()
}

// Test hook: read or patch the animation counters.
export function __state(patch) {
  if (patch) {
    if ('portrait' in patch) portrait = patch.portrait
    if ('reviveLeft' in patch) reviveLeft = patch.reviveLeft
    if ('reviveTo' in patch) reviveTo = patch.reviveTo
    if ('reviveGrowth' in patch) reviveGrowth = patch.reviveGrowth
    if ('gleamLeft' in patch) gleamLeft = patch.gleamLeft
    if ('evolveLeft' in patch) evolveLeft = patch.evolveLeft
    if ('petId' in patch) petId = patch.petId
    if ('keyPath' in patch) keyPath = patch.keyPath
  }
  return { reviveLeft, gleamLeft, gleamEvolve, evolveLeft, portrait, petId, arriveLeft, arriveFrom, arriveTo, arrivePhase: arriveLeft > 0 ? arrivePhase() : '', note, namePrompt }
}
export { tickRevive, tickGleam, tickArrive, beginWake, gleamSpots, resetPortraitState, postSession, refresh, releaseConfirm, nameCommand }

function arrivePhase() {
  return arriveStep()[0]
}

// Returns [phase, ticks spent inside that phase].
function arriveStep() {
  let spent = arriveTotal - arriveLeft
  for (const s of arriveSpans) {
    if (spent < s[1]) return [s[0], spent]
    spent -= s[1]
  }
  return ['hatch', arriveSpans[3][1] - 1]
}

function clearArrive() {
  arriveLeft = 0
  arriveFrom = null
  arriveTo = null
  arriveName = ''
  arrivePrompt = false
}

// cancelArrive stops the scene early and shows the new pet, so a revive or a
// second release never starts on the old pet's frames.
function cancelArrive() {
  if (arriveLeft <= 0) return
  if (arriveTo) portrait = arriveTo
  clearArrive()
}

// beginArrive runs after a release once the new egg's frames are loaded. The old
// pet says "goodbye!", floats up and fades, the egg drops in with a bounce,
// wobbles faster and cracks, then a flash ends on the stage-0 portrait with a
// "hatched!" note. It cancels a wake or evolve in progress. portrait holds the
// old pet until the leave phase ends, so the meter and name match what is on
// screen. prompt asks for a nick when the scene ends. Returns false when the
// scene cannot start.
function beginArrive(old, name, prompt) {
  if (reviveLeft > 0 || !old || !old.frames || !old.frames.length || !portrait || portrait === old) return false
  startScene(name, prompt)
  arriveFrom = old
  portrait = old
  arriveLeft = arriveTotal
  note = 'goodbye!'
  return true
}

// beginHatch is the first hatch: there is no old pet, so the scene skips the
// leave phase and starts with the egg dropping in. portrait must already hold
// the new egg's frames. Returns false when the scene cannot start.
function beginHatch(name, prompt) {
  if (reviveLeft > 0 || !portrait || !portrait.frames || !portrait.frames.length) return false
  startScene(name, prompt)
  arriveLeft = arriveTotal - arriveSpans[0][1]
  return true
}

function startScene(name, prompt) {
  clearGleam()
  wakeLeft = 0
  wakeFrom = null
  evolveLeft = 0
  evolveFrom = null
  bits = []
  idleHop = 0
  bite = null
  arriveFrom = null
  arriveTo = portrait
  arriveName = name
  arrivePrompt = !!prompt
  note = ''
  noteLeft = 0
  namePrompt = ''
}

function tickArrive($) {
  arriveLeft--
  if (arriveLeft === arriveTotal - arriveSpans[0][1]) {
    if (arriveTo) portrait = arriveTo
    note = ''
  }
  if (arriveLeft > 0) return
  if (arriveTo) portrait = arriveTo
  const name = arriveName
  const prompt = arrivePrompt
  clearArrive()
  note = 'hatched! meet ' + name
  noteLeft = 30
  $.ui.toast('omn hatched! meet ' + name)
  if (prompt) promptName($)
}

// Asks once for a nick: one toast, and a pane line that stays until /omn-name works.
function promptName($) {
  namePrompt = namePromptText
  $.ui.toast('omn ' + namePromptText)
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

// A pet id from the server is stored and put in a URL path, so only the
// server's shape (8 lowercase base32 chars, a-z2-7) is kept. Anything else becomes ''.
export function petIdOf(v) {
  return typeof v === 'string' && /^[a-z2-7]{8}$/.test(v) ? v : ''
}

async function rememberPet($, id) {
  // Another id is another pet. The old one's portrait and scenes must not stay on screen.
  if (id !== petId) {
    resetPortraitState()
    portrait = null
  }
  petId = id
  await $.store.set('petId', id)
  await refresh($)
}

// A stored id the server does not know (wiped DB, an old key-derived id) is
// dropped with its portrait. The next signed open brings the key's real id.
async function forgetPet($) {
  petId = ''
  portrait = null
  await $.store.set('petId', '')
  $.ui.invalidate('ui.render')
}

async function refresh($, growth) {
  if (wakeLeft > 0 || reviveLeft > 0 || arriveLeft > 0 || !petId) return
  const asked = petId
  const res = await $.http.fetch(SERVER + '/p/' + asked + '.json?t=' + Date.now())
  if (res.status === 404) {
    if (petId === asked) await forgetPet($)
    return
  }
  if (!res.ok) return
  const data = JSON.parse(res.text)
  if (!data.frames || !data.frames.length) return
  // A revive may have started while this fetch was out. It owns the portrait.
  if (reviveLeft > 0 || arriveLeft > 0) return
  if (typeof data.growth !== 'number' && typeof growth === 'number') data.growth = growth
  if (typeof data.growth !== 'number' && portrait && typeof portrait.growth === 'number') data.growth = portrait.growth
  if (portrait && typeof portrait.growth === 'number' && !evolveFrom && stageOf(data.growth) > stageOf(portrait.growth)) {
    evolveFrom = portrait
    evolveLeft = evolveTicks
    burst()
  }
  portrait = data
  $.ui.invalidate('ui.render')
}

const stageAt = [0, 500, 20000, 120000, 500000]
const pipChars = ['▂', '▄', '▆', '█']
const cDim = '#8a86a0'
const cExp = '#9d8cff'
const cPulse = '#efeaff'
const cOff = '#2a2640'
const cText = '#e8e6f0'
const cFed = '#f2b84b'
const cWarn = '#ff5a36'

function meterText(Box, Text, growth) {
  const g = typeof growth === 'number' && isFinite(growth) ? Math.max(0, Math.round(growth)) : 0
  const pct = expPct(g)
  const lit = signalLevel(pct)
  const pulse = pct > 85 && pct < 100 && tick % 8 < 4
  const on = pipChars.slice(0, lit)
  const off = pipChars.slice(lit).join('')
  const row = [Text({ color: cDim, children: ['exp'] })]
  if (pulse && on.length) {
    const head = on.slice(0, -1).join('')
    if (head) row.push(Text({ color: cExp, children: [head] }))
    row.push(Text({ color: cPulse, children: [on[on.length - 1]] }))
  } else if (on.length) {
    row.push(Text({ color: cExp, children: [on.join('')] }))
  }
  if (off) row.push(Text({ color: cOff, children: [off] }))
  row.push(Text({ color: cText, children: [compact(g)] }))
  const lines = []
  const name = cleanLabel(portrait && portrait.name, 32)
  const head = []
  if (name) head.push(Text({ color: cText, children: [name] }))
  if (portrait && portrait.gleam === true) head.push(Text({ color: cFed, children: ['✦'] }))
  if (portrait && portrait.status === 'sleeping') head.push(Text({ color: cDim, children: ['sleeping'] }))
  else if (portrait && portrait.status === 'dead') head.push(Text({ color: cWarn, children: ['dead'] }))
  if (head.length === 1 && name) lines.push(head[0])
  else if (head.length) lines.push(Box({ flexDirection: 'row', columnGap: 1, children: head }))
  const info = []
  const species = cleanLabel(portrait && portrait.species, 24)
  if (species && species !== 'Shadow') info.push(species)
  const stageName = cleanLabel(portrait && portrait.stage_name, 24)
  if (stageName && stageName !== name) info.push(stageName)
  info.push('stage ' + stageOf(g))
  lines.push(Text({ color: cDim, children: [info.join(' · ')] }))
  lines.push(Box({ flexDirection: 'row', columnGap: 1, children: row }))
  const care = careLine(Box, Text)
  if (care) lines.push(care)
  if (note) lines.push(Text({ color: cFed, children: [note] }))
  if (namePrompt) lines.push(Text({ color: cFed, children: [namePrompt] }))
  lines.push(Text({ color: cFed, children: ['ssh omn.sh'] }))
  if (updateLine) lines.push(Text({ color: cWarn, children: [updateLine] }))
  if (updateLine) lines.push(Text({ color: cDim, children: ['/plugin → omn → update now'] }))
  return Box({ flexDirection: 'column', children: lines })
}

// This marketplace does not auto-update. VERSION is the copy that is running.
// The file on disk can already be newer, so reading it hid the notice.
async function checkUpdate($, force) {
  if (!force && Date.now() - updateChecked < updateEvery) return
  updateChecked = Date.now()
  try {
    const res = await $.http.fetch(VERSION_URL)
    if (!res.ok) return
    const remote = versionOf(textOf(res))
    const next = remote && versionNewer(remote, VERSION) ? 'update to ' + remote : ''
    if (next === updateLine) return
    updateLine = next
    $.ui.invalidate('ui.render')
  } catch (err) {}
}

function versionOf(raw) {
  let data
  try {
    data = JSON.parse(typeof raw === 'string' ? raw : '')
  } catch (err) {
    return ''
  }
  const v = data && data.version
  return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : ''
}

function versionNewer(remote, local) {
  const a = remote.split('.')
  const b = local.split('.')
  for (let i = 0; i < 3; i++) {
    const x = parseInt(a[i], 10)
    const y = parseInt(b[i], 10)
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

function careLine(Box, Text) {
  const p = portrait
  if (!p) return null
  const kids = []
  const mood = cleanLabel(p.mood, 24)
  if (mood) kids.push(Text({ color: cDim, children: [mood] }))
  if (typeof p.streak === 'number' && isFinite(p.streak) && p.streak > 0) {
    kids.push(Text({ color: cDim, children: ['streak ' + Math.round(p.streak)] }))
  }
  if (!kids.length) return null
  return Box({ flexDirection: 'row', columnGap: 1, children: kids })
}

function cleanLabel(s, max) {
  if (typeof s !== 'string') return ''
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t || t.length > max) return ''
  return t
}

function noteMeal(fam, xp) {
  const now = Date.now()
  combo = now - lastMealAt < comboWindow && combo > 0 ? combo + 1 : 1
  lastMealAt = now
  const label = fam === 'opus' || fam === 'sonnet' || fam === 'haiku' ? fam : 'meal'
  note = label + ' +' + xp + (combo > 1 ? ' x' + combo : '')
  noteLeft = 36
  quiet = 0
}

function applyCare(dst, src) {
  if (!dst || !src) return
  for (const k of ['name', 'hunger', 'mood', 'streak', 'gleam', 'status', 'species', 'stage_name']) {
    if (src[k] !== undefined && src[k] !== null) dst[k] = src[k]
  }
}

function stageOf(g) {
  if (typeof g !== 'number') return 0
  for (let i = stageAt.length - 1; i >= 0; i--) if (g >= stageAt[i]) return i
  return 0
}

function expPct(g) {
  const stage = stageOf(g)
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
  const raw = present(b64)
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
  const raw = present(b64)
  const px = 5
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

let bites = []
let bite = null
let fedMark = 0
let fedTurn = ''
const biteModes = ['catch', 'wait', 'floor']

const crumbRgb = {
  haiku: [0x7e, 0xc8, 0xe3],
  sonnet: [0xf2, 0xb8, 0x4b],
  opus: [0xff, 0x5a, 0x36],
  other: [0xc8, 0xc4, 0xd4],
}
const bitColors = [
  [0xf2, 0xb8, 0x4b],
  [0x9d, 0x8c, 0xff],
  [0xff, 0x5a, 0x36],
  [0xe8, 0xe6, 0xf0],
]
const sparkPx = [
  [14, 2],
  [1, 3],
  [14, 5],
]

function feedFrom(id, bag) {
  if (!bag) return
  if (id !== fedTurn) {
    fedTurn = id
    fedMark = 0
  }
  const deltas = deltasOf(bag)
  const xp = xpOf(deltas)
  if (xp <= fedMark) return
  queueBite(xp - fedMark, mealFamily(deltas))
  fedMark = xp
}

function mealFamily(deltas) {
  let best = ''
  let bestN = -1
  const rank = { opus: 4, sonnet: 3, haiku: 2, other: 1 }
  for (const d of deltas || []) {
    const m = d.family === 'opus' ? 4 : d.family === 'sonnet' ? 2 : 1
    const n = m * (num(d.out) + num(d.in) + num(d.cache_w) + Math.floor(num(d.cache_r) / 25))
    const r = rank[d.family] || 0
    if (n > bestN || (n === bestN && r > (rank[best] || 0))) {
      bestN = n
      best = d.family
    }
  }
  return best
}

function queueBite(xp, kind) {
  if (xp <= 0 || bites.length >= 3) return
  const k = kind === 'opus' || kind === 'haiku' || kind === 'sonnet' ? kind : 'other'
  bites.push({ mode: biteModes[(Math.random() * biteModes.length) | 0], tick: 0, xp: xp, kind: k })
  quiet = 0
}

function stepFeed() {
  // No bites on a dead or reviving pet. Queued bites wait until it is alive.
  if (reviveLeft > 0 || arriveLeft > 0 || petDead()) {
    bite = null
    return
  }
  if (!bite) {
    bite = bites.shift() || null
    if (!bite) return
  } else {
    bite.tick++
    if (bite.tick >= biteSpan(bite.mode)) {
      bite = null
      return
    }
  }
  quiet = 0
}

function biteSpan(mode) {
  if (mode === 'wait') return 12 + 8 + 20
  if (mode === 'catch') return 5 + 6 + 2 + 20
  return 14 + 6 + 8 + 18
}

function burst() {
  bits = []
  for (let i = 0; i < 8; i++) {
    bits.push({
      x: 4 + (i % 8),
      y: 6,
      vx: i < 4 ? -0.35 - (i % 3) * 0.15 : 0.35 + (i % 3) * 0.15,
      vy: -0.8 - (i % 4) * 0.15,
      c: bitColors[i % bitColors.length],
      life: 28,
    })
  }
}

function stepBits() {
  if (!bits.length) return
  const live = []
  for (const b of bits) {
    b.life--
    b.x += b.vx
    b.y += b.vy
    b.vy += 0.08
    if (b.life > 0 && b.y < 18 && b.x > -1 && b.x < 16) live.push(b)
  }
  bits = live
}

function present(b64) {
  const idle = decodeB64(b64)
  const m = measure(idle)
  const shown = portrait && portrait.chomp && bite && bitePose(bite, m).open ? decodeB64(portrait.chomp) : idle
  const pose = bite ? bitePose(bite, m) : null
  const hasChomp = !!(pose && pose.open && portrait && portrait.chomp)
  const buf = new Uint8Array(shown)
  if (pose && pose.lift) liftPet(buf, pose.lift)
  if (pose && pose.lift > 0) shadeFoot(buf, idle, m)
  if (pose && pose.open && !hasChomp) dropMouth(buf, m, pose.lift)
  if (pose && pose.token != null) paintToken(buf, m.tx, pose.token, crumbRgb[bite.kind] || crumbRgb.other)
  if (liftNow()) hop(buf)
  // A one-pixel rise puts the crown on the seam between two cells.
  // Nudge so the hard color change sits inside one cell. Both rows stay.
  if (seamSplit(buf)) liftPet(buf, petTop(buf) > 0 ? 1 : -1)
  paintBits(buf)
  paintSpark(buf)
  paintSleep(buf)
  if (reviveLeft > 0) reviveFx(buf)
  if (gleamLeft > 0) gleamFx(buf)
  if (arriveLeft > 0) arriveFx(buf)
  return buf
}

function liftNow() {
  if (tick % 2 !== 0) return false
  return stirring() || idleHop > 0 || reviveHop()
}

// The second half of the glow and the start of the rise hop.
function reviveHop() {
  if (reviveLeft <= 0) return false
  const phase = revivePhase()
  if (phase === 'glow') return reviveStill + reviveGlow + reviveFlash + reviveRise - reviveLeft - reviveStill >= reviveGlow >> 1
  return phase === 'rise' && reviveLeft > reviveRise - 6
}

function reviveFx(buf) {
  const phase = revivePhase()
  if (phase === 'still') return
  if (phase === 'flash') {
    buf.fill(255)
    return
  }
  if (phase === 'rise') {
    sparkle(buf)
    return
  }
  const bg = rgb(buf, 0)
  // First half flickers. Second half stays lit and brighter while it hops.
  if (!reviveHop()) {
    if (tick % 2 === 0) wash(buf, bg)
    else jitter(buf, tick % 4 < 2 ? 1 : -1)
    return
  }
  wash(buf, bg)
  wash(buf, bg)
}

const dropLift = [16, 12, 8, 4, 0, 2, 0, 2, 0, 0]
const wobbleDx = [0, 1, 0, -1]
const crackSpots = [
  [0, -2],
  [1, -1],
  [0, 0],
  [-1, 1],
  [0, 2],
  [1, 3],
]

function arriveFx(buf) {
  const [phase, t] = arriveStep()
  const bg = rgb(buf, 0)
  if (phase === 'leave') {
    liftPet(buf, t * 2)
    fade(buf, bg, Math.min(4, Math.ceil(t / 2)))
    return
  }
  if (phase === 'drop') {
    liftPet(buf, dropLift[t])
    return
  }
  if (phase === 'wobble') {
    cracks(buf, 1 + Math.floor(t / 3))
    const period = t < 5 ? 3 : t < 10 ? 2 : 1
    const dx = wobbleDx[Math.floor(t / period) % wobbleDx.length]
    if (dx) jitter(buf, dx)
    return
  }
  if (t < 2) buf.fill(255)
  else wash(buf, bg)
}

// Dark cracks down the middle of the egg's body, more of them as the wobble goes on.
function cracks(buf, count) {
  const bg = bgOf(buf)
  const mask = bodyMask(buf, floorAt(buf), bg)
  let lo = 18
  let hi = -1
  let sum = 0
  let n = 0
  for (let id = 0; id < mask.length; id++) {
    if (!mask[id]) continue
    const y = Math.floor(id / 16)
    if (y < lo) lo = y
    if (y > hi) hi = y
    sum += id % 16
    n++
  }
  if (!n) return
  const cx = Math.round(sum / n)
  const cy = Math.round((lo + hi) / 2)
  for (let i = 0; i < Math.min(count, crackSpots.length); i++) {
    paint(buf, cx + crackSpots[i][0], cy + crackSpots[i][1], [0x2a, 0x26, 0x40])
  }
}

// Blend the pet toward the background, k quarters of the way.
function fade(buf, bg, k) {
  const c = [bg >> 16, (bg >> 8) & 255, bg & 255]
  for (let i = 0; i < buf.length; i += 3) {
    if (near(rgb(buf, i), bg)) continue
    for (let j = 0; j < 3; j++) buf[i + j] = (buf[i + j] * (4 - k) + c[j] * k) >> 2
  }
}

function wash(buf, bg) {
  for (let i = 0; i < buf.length; i += 3) {
    if (near(rgb(buf, i), bg)) continue
    buf[i] = (buf[i] + 255 * 3) >> 2
    buf[i + 1] = (buf[i + 1] + 255 * 3) >> 2
    buf[i + 2] = (buf[i + 2] + 255 * 3) >> 2
  }
}

function near(a, b) {
  return Math.abs((a >> 16) - (b >> 16)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255)) < 24
}

function jitter(buf, dx) {
  const copy = buf.slice()
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 16; x++) {
      let sx = x - dx
      if (sx < 0 || sx >= 16) sx = x
      const di = (y * 16 + x) * 3
      const si = (y * 16 + sx) * 3
      buf[di] = copy[si]
      buf[di + 1] = copy[si + 1]
      buf[di + 2] = copy[si + 2]
    }
  }
}

const reviveSpots = [
  [2, 2],
  [13, 3],
  [4, 8],
  [11, 6],
  [7, 1],
  [14, 10],
  [1, 12],
  [9, 4],
]

function sparkle(buf) {
  for (let i = 0; i < 4; i++) {
    const s = reviveSpots[(tick + i * 3) % reviveSpots.length]
    paint(buf, s[0], s[1], i % 2 === 0 ? [0xf5, 0xd4, 0x4a] : [0xff, 0xff, 0xff])
  }
}

// Star spots for one gleam frame: [x, y, rgb]. They sweep left to right
// across the portrait, gold and white alternating, then thin out.
function gleamSpots(left) {
  const t = gleamTicks - left
  const n = left <= 3 ? 1 : left <= 6 ? 2 : 4
  const out = []
  for (let i = 0; i < n; i++) {
    const s = reviveSpots[(t + i * 3) % reviveSpots.length]
    out.push([s[0], s[1], (t + i) % 2 === 0 ? [0xf5, 0xd4, 0x4a] : [0xff, 0xff, 0xff]])
  }
  return out
}

function gleamFx(buf) {
  // One soft shine pulse mid-way, then the stars.
  if (gleamLeft === gleamTicks >> 1) wash(buf, rgb(buf, 0))
  for (const s of gleamSpots(gleamLeft)) paint(buf, s[0], s[1], s[2])
}

function bitePose(b, m) {
  const mouth = m.mouth
  const sky = m.sky
  const ground = m.ground
  const t = b.tick
  if (b.mode === 'wait') {
    const fall = 12
    const chew = 8
    if (t < fall) return { lift: 0, open: false, token: sky + Math.round(((mouth - 1 - sky) * t) / Math.max(1, fall - 1)) }
    if (t < fall + chew) return { lift: 0, open: true, token: mouth - 1 }
    return { lift: 0, open: false, token: null }
  }
  if (b.mode === 'catch') {
    const rise = [0, 2, 2, 4, 4]
    const hang = 6
    const land = [2, 0]
    if (t < rise.length) {
      const lift = rise[t]
      return { lift: lift, open: lift >= 4, token: mouth - 1 - lift }
    }
    if (t < rise.length + hang) return { lift: 4, open: true, token: null }
    const landAt = rise.length + hang
    if (t < landAt + land.length) return { lift: land[t - landAt], open: false, token: null }
    return { lift: 0, open: false, token: null }
  }
  const fall = 14
  const sit = 6
  const chew = 8
  if (t < fall) return { lift: 0, open: false, token: sky + Math.round(((ground - sky) * t) / Math.max(1, fall - 1)) }
  if (t < fall + sit) return { lift: 0, open: false, token: ground }
  if (t < fall + sit + chew) {
    const u = (t - fall - sit) / chew
    const lift = -2
    return { lift: lift, open: true, token: Math.round(ground + (mouth - lift - ground) * u) }
  }
  return { lift: 0, open: false, token: null }
}

function bgOf(raw) {
  return [raw[0], raw[1], raw[2]]
}

function samePx(raw, i, c) {
  return raw[i] === c[0] && raw[i + 1] === c[1] && raw[i + 2] === c[2]
}

function floorAt(raw) {
  const row = 16 * 3
  const last = 17 * row
  const floorC = [raw[last], raw[last + 1], raw[last + 2]]
  const bg = bgOf(raw)
  if (floorC[0] === bg[0] && floorC[1] === bg[1] && floorC[2] === bg[2]) return 18
  // Walk up from the ground. A pet pixel that happens to match the ground
  // color must not be treated as the floor, or the body splits.
  let floor = 17
  while (floor > 0 && raw[floor * row] === floorC[0] && raw[floor * row + 1] === floorC[1] && raw[floor * row + 2] === floorC[2]) floor--
  return floor + 1
}

// True when the sharp color changes sit on the boundary between two cells.
function seamSplit(buf) {
  const bg = bgOf(buf)
  const floor = floorAt(buf)
  const mask = bodyMask(buf, floor, bg)
  let split = 0
  let joined = 0
  for (let y = 0; y < floor - 1; y++) {
    for (let x = 0; x < 16; x++) {
      if (!mask[y * 16 + x]) continue
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        if (nx < 0 || nx >= 16 || !mask[(y + 1) * 16 + nx]) continue
        const a = (y * 16 + x) * 3
        const b = ((y + 1) * 16 + nx) * 3
        const d = Math.abs(buf[a] - buf[b]) + Math.abs(buf[a + 1] - buf[b + 1]) + Math.abs(buf[a + 2] - buf[b + 2])
        if (d < 140) continue
        if (y % 2 === 1) split += d
        else joined += d
      }
    }
  }
  return split > joined
}

// Stars, rain, mist, embers, and smoke are scene effects. Every other
// pixel above the floor is the pet, including a crown or spark that
// does not touch the body.
const stayPut = new Set([
  0x4a4580, 0x7a6870, 0x885050, 0x4a6aa0, 0x343e56, 0xe07024, 0x843a22, 0x9a96a8,
])

function bodyMask(raw, floor, bg) {
  const mask = new Uint8Array(floor * 16)
  for (let y = 0; y < floor; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 3
      if (samePx(raw, i, bg) || stayPut.has(rgb(raw, i))) continue
      mask[y * 16 + x] = 1
    }
  }
  return mask
}

function measure(raw) {
  const bg = bgOf(raw)
  const floor = floorAt(raw)
  const mask = bodyMask(raw, floor, bg)
  let top = floor
  let foot = 0
  let minX = 16
  let maxX = 0
  for (let y = 0; y < floor; y++) {
    for (let x = 0; x < 16; x++) {
      if (!mask[y * 16 + x]) continue
      if (y < top) top = y
      if (y > foot) foot = y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
    }
  }
  if (top >= floor) {
    top = 4
    foot = Math.max(4, floor - 2)
    minX = 4
    maxX = 11
  }
  let mouth = top + Math.round((foot - top) * 0.62)
  if (portrait && portrait.chomp) {
    const alt = decodeB64(portrait.chomp)
    let diff = -1
    for (let y = top; y < floor && y < 18; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 3
        if (rgb(raw, i) !== rgb(alt, i)) diff = y
      }
    }
    if (diff > top) mouth = diff - 1
  }
  return {
    bg: bg,
    floor: floor,
    top: top,
    foot: foot,
    mouth: mouth,
    minX: minX,
    maxX: maxX,
    tx: Math.max(0, Math.min(14, (minX + maxX) >> 1)),
    sky: Math.max(0, top - 3),
    ground: Math.min(17, foot + 1 < floor ? foot + 1 : floor),
  }
}

function liftPet(buf, lift) {
  const copy = buf.slice()
  const bg = bgOf(copy)
  const floor = floorAt(copy)
  const mask = bodyMask(copy, floor, bg)
  for (let y = 0; y < floor; y++) {
    for (let x = 0; x < 16; x++) {
      const id = y * 16 + x
      if (!mask[id]) continue
      const i = id * 3
      buf[i] = bg[0]
      buf[i + 1] = bg[1]
      buf[i + 2] = bg[2]
    }
  }
  for (let y = 0; y < floor; y++) {
    const src = y + lift
    if (src < 0 || src >= floor) continue
    for (let x = 0; x < 16; x++) {
      const sid = src * 16 + x
      if (!mask[sid]) continue
      const si = sid * 3
      const di = (y * 16 + x) * 3
      buf[di] = copy[si]
      buf[di + 1] = copy[si + 1]
      buf[di + 2] = copy[si + 2]
    }
  }
}

function shadeFoot(buf, idle, m) {
  for (let x = m.minX; x <= m.maxX; x++) {
    const i = (m.foot * 16 + x) * 3
    if (samePx(idle, i, m.bg)) continue
    buf[i] = Math.max(0, m.bg[0] - 12)
    buf[i + 1] = Math.max(0, m.bg[1] - 12)
    buf[i + 2] = Math.max(0, m.bg[2] - 8)
  }
}

function dropMouth(buf, m, lift) {
  const y = m.mouth + 1 - lift
  const src = m.mouth - lift
  if (y < 0 || src < 0 || y >= 18 || src >= 18) return
  for (let x = m.tx; x <= m.tx + 1; x++) {
    const di = (y * 16 + x) * 3
    const si = (src * 16 + x) * 3
    buf[di] = buf[si]
    buf[di + 1] = buf[si + 1]
    buf[di + 2] = buf[si + 2]
  }
}

function paintToken(buf, x, y, rgb) {
  paint(buf, x, y, rgb)
  paint(buf, x + 1, y, rgb)
  paint(buf, x, y + 1, rgb)
  paint(buf, x + 1, y + 1, rgb)
}

function paintBits(buf) {
  for (const b of bits) paint(buf, Math.round(b.x), Math.round(b.y), b.c)
}

function paintSpark(buf) {
  if (tick % 2 === 0) return
  const p = sparkPx[Math.floor(tick / 2) % sparkPx.length]
  paint(buf, p[0], p[1], [0xe8, 0xe6, 0xf0])
}

function paintSleep(buf) {
  if (!showZ()) return
  const c = [0xc8, 0xc4, 0xdc]
  zed(buf, 12, 1, c)
  zed(buf, 9, 3, c)
}

function showZ() {
  if (arriveLeft > 0 || note.startsWith('hatched!')) return false
  if (note === 'awake!' || note === 'evolved!' || note === 'revived!') return false
  if (wakeLeft > 0 || wakeFrom) return true
  return !!(portrait && portrait.status === 'sleeping')
}

function zed(buf, x, y, c) {
  paint(buf, x, y, c)
  paint(buf, x + 1, y, c)
  paint(buf, x + 2, y, c)
  paint(buf, x + 1, y + 1, c)
  paint(buf, x, y + 2, c)
  paint(buf, x + 1, y + 2, c)
  paint(buf, x + 2, y + 2, c)
}

function paint(buf, x, y, rgb) {
  const px = Math.round(x)
  const py = Math.round(y)
  if (py < 0 || py >= 18 || px < 0 || px >= 16) return
  const i = (py * 16 + px) * 3
  buf[i] = rgb[0]
  buf[i + 1] = rgb[1]
  buf[i + 2] = rgb[2]
}

function hop(buf) {
  // Two rows, one terminal cell. A one-row hop splits the half-blocks.
  liftPet(buf, 2)
}

function petTop(buf) {
  const bg = bgOf(buf)
  const floor = floorAt(buf)
  const mask = bodyMask(buf, floor, bg)
  for (let y = 0; y < floor; y++) {
    for (let x = 0; x < 16; x++) if (mask[y * 16 + x]) return y
  }
  return -1
}

function tally(e, result) {
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
  if (sparkLeft < 12) sparkLeft = 12
  quiet = 0
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

// Returns the pet id in a session reply when it is valid and differs from current, else ''. Never throws.
export function sessionPetId(text, current) {
  try {
    const id = petIdOf(JSON.parse(text).id)
    return id && id !== current ? id : ''
  } catch (err) {
    return ''
  }
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
    if (res.status === 401) return
    if (await handleStatus($, res)) return
    if (!res.ok) throw new Error('omn ' + res.status)
    if (op !== 'close') {
      // The signed key decides the pet. A reply id that differs is the key's real pet.
      const id = sessionPetId(res.text, petId)
      if (id) await rememberPet($, id)
      if (op === 'open') await openReply($, res.text)
    }
  } catch (err) {
    if (op === 'open') $.ui.log('omn stay-awake skipped: ' + (err && err.message ? err.message : 'sign'))
  }
}

// The open that adopted the key's pet says hatched:true. It plays the first
// hatch, then asks for a nick while the server says the nick is the default.
async function openReply($, text) {
  let reply = null
  try {
    reply = JSON.parse(text)
  } catch (err) {}
  if (!reply || reply.hatched !== true || !petId) return
  resetPortraitState()
  try {
    await refresh($)
  } catch (err) {}
  const name = cleanLabel(reply.name, 32) || petId
  const prompt = reply.named === false
  if (beginHatch(name, prompt)) {
    $.ui.invalidate('ui.render')
    return
  }
  // No frames to animate: still greet the pet and ask for a nick.
  $.ui.toast('omn hatched! meet ' + name)
  if (prompt) promptName($)
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

function petCanonical(pubkey, ts, nonce, op, nick) {
  return sessionCanonical(pubkey, ts, nonce, op).slice(0, -1) + ',"nick":' + JSON.stringify(nick) + '}'
}

// Posts a signed name or release (wire op: letgo). Returns { text } on failure, { pet } on 200. Never throws.
async function postPet($, op, nick) {
  try {
    const nonce = sessionNonce()
    const signed = await signPayload($, nonce, (pubkey, ts) => petCanonical(pubkey, ts, nonce, op, nick))
    if (!signed) return { text: 'omn: /omn key <ssh private key>' }
    const res = await $.http.fetch(SERVER + '/v1/claude/pet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pubkey: signed.pubkey, ts: signed.ts, nonce, op, nick, sig: signed.sig }),
    })
    if (res.status === 400) return { text: 'bad nick' }
    if (res.status === 401) return { text: 'signature rejected' }
    if (res.status === 404) return { text: 'no pet for this key' }
    if (!res.ok) return { text: 'omn ' + res.status }
    return { pet: JSON.parse(res.text) }
  } catch (err) {
    return { text: 'omn: ' + (err && err.message ? err.message : 'failed') }
  }
}

async function nameCommand($, nick) {
  if (!nickRule.test(nick)) return { text: 'usage: /omn-name <nick> (a-z A-Z 0-9 _ -, max 12)' }
  const done = await postPet($, 'name', nick)
  if (!done.pet) return { text: done.text }
  namePrompt = ''
  try {
    await refresh($)
  } catch (err) {}
  $.ui.invalidate('ui.render')
  return { text: 'omn named ' + nick }
}

function releaseArm() {
  releaseArmedAt = Date.now()
  const name = cleanLabel(portrait && portrait.name, 32) || petId || 'your pet'
  return {
    text: 'release ' + name + '? it goes to the graveyard and a new egg hatches. cannot be undone. run /omn-release confirm within 60s',
  }
}

async function releaseConfirm($, armedAt) {
  releaseArmedAt = 0
  if (!armedAt || Date.now() - armedAt >= releaseWindow) return { text: 'run /omn-release first' }
  // server op name is still 'letgo'
  const done = await postPet($, 'letgo', '')
  if (!done.pet) return { text: done.text }
  const old = portrait
  resetPortraitState()
  const id = petIdOf(done.pet.id)
  try {
    if (id && id !== petId) {
      petId = id
      await $.store.set('petId', id)
    }
    // letgo keeps the account id, so the new egg is a fresh fetch of the same id.
    await refresh($)
  } catch (err) {}
  const name = cleanLabel(done.pet.name, 32) || id || petId
  // A new pet has the default nick unless the server says otherwise.
  const prompt = done.pet.named !== true
  // Only a refresh that swapped in the new egg's frames starts the scene.
  if (!beginArrive(old, name, prompt) && prompt) promptName($)
  $.ui.invalidate('ui.render')
  return { text: 'omn released. meet ' + name + ' (' + (id || petId) + ')' }
}

function resetPortraitState() {
  wakeLeft = 0
  wakeFrom = null
  evolveLeft = 0
  evolveFrom = null
  reviveLeft = 0
  reviveFrom = null
  reviveTo = null
  reviveGrowth = null
  clearGleam()
  clearArrive()
  note = ''
  noteLeft = 0
  namePrompt = ''
  bits = []
  bites = []
  bite = null
  idleHop = 0
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
  // A passphrase key cannot be opened without a tty. Its .pub plus ssh-agent signs instead.
  // A path that already ends in .pub must not grow a second .pub.
  const pair = keyPair(key)
  const hasPub = await exists($, pair.pub)
  const opened = await $.process.run(['ssh-keygen', '-y', '-f', pair.priv])
  let pubkey = ''
  let signKey = pair.priv
  if (opened.exitCode === 0) {
    pubkey = String(opened.stdout || '').trim().split(/\s+/).slice(0, 2).join(' ')
  } else if (hasPub) {
    pubkey = textOf(await $.fs.read(pair.pub)).trim().split(/\s+/).slice(0, 2).join(' ')
    signKey = pair.pub
  } else {
    throw new Error('ssh-keygen -y (passphrase key? add ' + pair.pub + ')')
  }
  const ts = Math.floor(Date.now() / 1000)
  const body = bodyOf(pubkey, ts)
  const home = await $.env.get('HOME')
  const dir = String(home || '') + '/.config/omn'
  await $.process.run(['mkdir', '-p', dir])
  const path = dir + '/turn-' + nonce
  await $.fs.write(path, body)
  const signed = await $.process.run(['ssh-keygen', '-Y', 'sign', '-f', signKey, '-n', 'omn', path])
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
  if (await handleStatus($, res)) return null
  if (!res.ok) throw new Error('omn ' + res.status)
  return JSON.parse(res.text)
}

// Only an older server answers open with 404. A current one adopts a pet on open.
const NO_PET_HINT = 'No pet yet. Start a new session or run `ssh omn.sh` to adopt one.'
const NO_PET_FLAG = 'noPetHintShown'

// Shared status handling for /v1/claude and /v1/claude/session.
// 404 (no pet): show the hint once, persisted in $.store. 429: drop silently.
// 200: clear the hint flag so it can return later. Returns true when the
// response is fully handled and the caller must stop without logging or throwing.
export async function handleStatus($, res) {
  if (res.status === 429) return true
  if (res.status === 404) {
    try {
      if (!(await $.store.get(NO_PET_FLAG))) {
        await $.store.set(NO_PET_FLAG, '1')
        $.ui.toast(NO_PET_HINT)
      }
    } catch (_) {}
    return true
  }
  if (res.status === 200) {
    try {
      if (await $.store.get(NO_PET_FLAG)) await $.store.set(NO_PET_FLAG, '')
    } catch (_) {}
  }
  return false
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

function keyPair(key) {
  if (key.endsWith('.pub')) return { priv: key.slice(0, -4), pub: key }
  return { priv: key, pub: key + '.pub' }
}

async function exists($, path) {
  const found = await $.fs.exists(path)
  return found === true || (found && found.value === true)
}

async function preferPrivate($, key) {
  if (!key.endsWith('.pub')) return key
  const priv = key.slice(0, -4)
  if (await exists($, priv)) return priv
  return key
}

// The identityfile lines of `ssh -G` output, in order, with a leading ~ expanded.
export function identityFilesOf(output, home) {
  const files = []
  for (const line of String(output || '').split('\n')) {
    const found = line.match(/^identityfile\s+(.+?)\s*$/i)
    if (!found) continue
    let path = found[1]
    if (home && (path === '~' || path.startsWith('~/'))) path = home + path.slice(1)
    files.push(path)
  }
  return files
}

// The first path whose private key or .pub exists. Returns that path.
export async function firstKeyOf(paths, has) {
  for (const path of paths) {
    if (await has(path) || await has(path + '.pub')) return path
  }
  return ''
}

const fallbackKeys = ['id_ed25519', 'id_ecdsa', 'id_rsa']

async function resolveKey($) {
  if (keyPath) return keyPath
  const home = await $.env.get('HOME')
  if (!home) return ''
  const has = (path) => exists($, path)
  try {
    const run = await $.process.run(['ssh', '-G', 'omn.sh'])
    if (run && run.exitCode === 0) {
      const found = await firstKeyOf(identityFilesOf(run.stdout, home), has)
      if (found) return found
    }
  } catch (err) {}
  return firstKeyOf(fallbackKeys.map((name) => home + '/.ssh/' + name), has)
}
