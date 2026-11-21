// Posts each Claude Code turn's billed tokens to omn.sh and draws that pet.
// The signature is ssh-keygen -Y sign -n omn over the same bytes as proto.Canonical.

const SERVER = 'https://omn.sh'
const VERSION = '0.4.40'
const VERSION_URL = 'https://raw.githubusercontent.com/SamuelFerracini/omn-claude/main/plugin/claude/.claude-plugin/plugin.json'
const PANE = 'omn'
const wideBandColumns = 60
// Blocks mode draws the pet 16 columns wider, so the band needs 16 more before it splits.
const blocksExtraColumns = 16
const families = ['haiku', 'sonnet', 'opus', 'other']

let keyPath = ''
let releaseArmedAt = 0
const releaseWindow = 60000
const nickRule = /^[A-Za-z0-9_-]{1,12}$/
const usageText = 'usage: /omn | /omn key <private-key> | /omn ssh | /omn gags on|off'
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
// Ticks left of the main-loop turn in progress (working while > 0). A turn
// start sets it, its end or abort clears it, and every turn step or tool call
// refills it. It also runs down on its own, so a missed end event cannot hold
// the idle hop back for more than workCap ticks of silence.
let workLeft = 0
const workCap = 6000
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
    gagsOn = (await $.store.get('gags')) !== 'off'
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
    await loadRenderEnv($)
    await refresh($)
    const others = Object.keys(await otherSessions($)).length
    if (portrait && portrait.status === 'sleeping' && others === 0) beginWake()
    await postSession($, 'open')
    await holdSession($, true)
    if (wakeLeft === 0) await refresh($)
    await $.command.register({
      name: 'omn',
      description: 'Show your omn pet, set its SSH key, or show the ssh command that reaches it',
      argumentHint: '[key <path> | ssh | gags on|off]',
    })
    await $.command.register({
      name: 'omn-adopt',
      description: 'Hatch your omn pet, with an omn-only key when you have no SSH key',
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
    workLeft = 0
    sparkLeft = 0
    quiet = 0
    clearGags()
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
    if (arg === 'ssh') return sshCommand($)
    if (arg === 'gags' || arg.startsWith('gags ')) return gagsCommand($, arg.slice(4).trim())
    if (arg.startsWith('key ') || arg.startsWith('/') || arg.startsWith('~') || arg.startsWith('.')) {
      await useKey($, await preferPrivate($, arg.startsWith('key ') ? arg.slice(4).trim() : arg))
      await postSession($, 'open')
      return { text: 'omn key ' + keyPath + (petId ? ' (' + petId + ')' : '') }
    }
    return { text: usageText }
  })

  on('command.run', { command: 'omn-adopt' }, async ($, e) => {
    releaseArmedAt = 0
    if ((e.args || '').trim() !== '') return { text: 'usage: /omn-adopt (no nick: rename it after with /omn-name <nick>)' }
    return adoptCommand($)
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
    const tree = petTree($, e)
    return tree || next(e)
  })

  // The engine asks AbovePrompt once per plugin, so only the list sees every row.
  // next runs once (a second call fails validate): it gets the other rows, and
  // its answer sits beside omn's own row.
  on('ui.render', { component: 'AbovePromptList' }, async ($, e, next) => {
    const p = e.props || {}
    const rows = p.rows || []
    const mine = rows.filter((r) => r.plugin === ownPlugin)
    const others = rows.filter((r) => r.plugin !== ownPlugin)
    const wide = (p.bodyColumns || 0) >= wideBandColumns + (lastSurface === 'terminal' && renderMode() === 'blocks' ? blocksExtraColumns : 0)
    if (!wide || p.isCollapsed || p.hasSurvey || !mine.length || !others.length) return next(e)
    // The engine refuses rows copied by value, so omn's row is left out of next
    // and drawn again here.
    const pet = petTree($, e)
    if (!pet) return next(e)
    const { Box } = $.ui.resolve(e)
    const right = await next({ ...e, props: { ...p, rows: others } })
    return Box({
      flexDirection: 'row',
      columnGap: 2,
      children: [pet, Box({ flexGrow: 1, flexShrink: 1, children: [right] })],
    })
  })

  on('turn.start', async ($, e, next) => {
    // Only the main loop thinks out loud. A subagent's turn has its own agentId.
    if (e.agentId === undefined) {
      workLeft = workCap
      failRun = 0
      endThink()
      thinking = startGag({ kind: 'think', held: 1 })
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const main = e.agentId === undefined
    stillWorking()
    // The first streamed chunk of the main loop ends the thinking dots.
    const result = yield* (main ? onFirst(next(e), endThink) : next(e))
    tally(e, result)
    return result
  })

  // The call itself is never changed: whatever next(e) answers (or throws) goes back as is.
  on('tool.call', async ($, e, next) => {
    stillWorking()
    const gags = toolGags(e)
    let res
    try {
      res = await next(e)
    } catch (err) {
      releaseGag(gags.prop)
      toolFailed()
      throw err
    }
    releaseGag(gags.prop)
    if (res && res.isError === true) toolFailed()
    else if (res && !res.deny) {
      failRun = 0
      if (gags.commit) startGag({ kind: 'confetti' })
    }
    return res
  })

  on('turn.abort', async ($, e, next) => {
    const result = await next(e)
    workLeft = 0
    abortGag()
    return result
  })

  on('session.compact', async ($, e, next) => {
    const main = e.agentId === undefined && e.trigger !== 'precompute'
    // Marked even when the squish is dropped (cooldown, a scene): the
    // compaction is this hook's, so the fallback below leaves it alone.
    if (main) compactHookAt = tick
    const g = main ? startGag({ kind: 'squish', held: 1 }) : null
    let res
    try {
      res = await next(e)
    } catch (err) {
      if (main) compactHookAt = -Infinity
      throw err
    } finally {
      releaseGag(g)
    }
    // Skipped: nothing is compacted, so no compaction rows follow.
    if (main && res && res.skip) compactHookAt = -Infinity
    return res
  })

  // Fallback for setups where session.compact never reaches this plugin (an
  // organization's policy plugin answers it first). Every compaction that
  // stands appends its boundary and summary rows through session.append's
  // compaction door, which no plugin can refuse and which reaches the
  // person's plugins past a policy plugin. A precompute installs nothing, so
  // it appends no rows. The row passes through unchanged.
  on('session.append', { door: 'compaction' }, async ($, e, next) => {
    const res = await next(e)
    if (e.agentId === undefined) compactRow()
    return res
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      workLeft = 0
      endThink()
    }
    if (e.reason === 'aborted') abortGag()
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
    if (bigMeal(xpOf(deltas))) startGag({ kind: 'burp' })
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
  // The idle frames advance at half speed while a big meal settles.
  frameTick += slowLeft > 0 ? 0.5 : 1
  stepFeed()
  stepBits()
  stepGag()
  if (sparkLeft > 0 && !bite) sparkLeft--
  if (idleHop > 0) idleHop--
  if (workLeft > 0) workLeft--
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

// A turn in progress keeps the pet busy, so quiet never reaches quietAt and
// the idle hop waits until the turn is over.
function busy() {
  return workLeft > 0 || wakeLeft > 0 || reviveLeft > 0 || arriveLeft > 0 || evolveLeft > 0 || gleamLeft > 0 || sparkLeft > 0 || bite || bites.length > 0 || bits.length > 0 || idleHop > 0 || !!gag || !!gagNext
}

// A turn step or tool call while a turn runs pushes the safety timeout back.
function stillWorking() {
  if (workLeft > 0) workLeft = workCap
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
    if ('bite' in patch) bite = patch.bite
    if ('wakeLeft' in patch) wakeLeft = patch.wakeLeft
    if ('gag' in patch) gag = patch.gag
    if ('gagNext' in patch) gagNext = patch.gagNext
    if ('gagsOn' in patch) gagsOn = patch.gagsOn
    if ('hour' in patch) gagHour = patch.hour
    if ('failRun' in patch) failRun = patch.failRun
    if ('meals' in patch) [mealAvg, mealN] = patch.meals
    if ('idleHop' in patch) idleHop = patch.idleHop
    if ('quiet' in patch) quiet = patch.quiet
    if ('tick' in patch) tick = patch.tick
    if ('compactAt' in patch) [compactHookAt, compactRowAt] = patch.compactAt
  }
  return {
    reviveLeft, gleamLeft, gleamEvolve, evolveLeft, portrait, petId, arriveLeft, arriveFrom, arriveTo, arrivePhase: arriveLeft > 0 ? arrivePhase() : '', note, namePrompt,
    gag, gagNext: gagNext && gagNext.g, gagsOn, failRun, slowLeft, mealAvg, mealN, busy: !!busy(), working: workLeft > 0, idleHop, quiet,
  }
}
export { setRenderEnv, tickRevive, tickGleam, tickArrive, beginWake, gleamSpots, resetPortraitState, postSession, refresh, releaseConfirm, nameCommand, stepFrame, startGag, releaseGag, eyesOf }

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
// Block heights in eighths, and the full height of each pip in the staircase.
const pipLevels = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
const pipHeights = [2, 4, 6, 8]
const stairs = pipHeights.map((h) => pipLevels[h - 1])
const cDim = '#8a86a0'
const cExp = '#9d8cff'
const cPulse = '#efeaff'
const cTrack = '#6b6880'
// Halfway between cExp and cTrack: the pip exp is in right now.
const cMid = '#847abf'
const cText = '#e8e6f0'
const cFed = '#f2b84b'
const cWarn = '#ff5a36'

function meterText(Box, Text, growth) {
  const g = typeof growth === 'number' && isFinite(growth) ? Math.max(0, Math.round(growth)) : 0
  const pct = expPct(g)
  const pulse = pct > 85 && pct < 100 && tick % 8 < 4
  const row = [Text({ color: cDim, children: ['exp'] })]
  // One parent Text so columnGap never lands between the four pips.
  row.push(Text({ children: pipRow(pct, pulse).map((p) => Text({ color: p.color, children: [p.glyph] })) }))
  row.push(Text({ color: cText, children: [compact(g)] }))
  const lines = []
  const name = cleanLabel(portrait && portrait.name, 32)
  const head = []
  if (name) head.push(Text({ color: cText, children: [name] }))
  if (portrait && portrait.gleam === true) head.push(Text({ color: cFed, children: ['✦'] }))
  // On the name row, so the label never changes the pane's height.
  if (gagShown() && gag.kind === 'burp') head.push(Text({ color: cFed, children: ['burp!'] }))
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

// Each pip covers a quarter of the stage and always shows its full staircase
// height. Only the state differs: 'done' (quarter finished), 'current' (exp is
// inside the quarter) or 'off' (not reached).
export function pipStates(v) {
  const size = 100 / stairs.length
  // Small epsilon so exact quarter boundaries (25, 50, 75, 100) never lose to float error.
  const done = (i) => v >= (i + 1) * size - 1e-9
  // Current pip is the first unfinished one, while exp is strictly between 0 and 100.
  const cur = v > 0 && v < 100 ? stairs.findIndex((_, i) => !done(i)) : -1
  return stairs.map((_, i) => (done(i) ? 'done' : i === cur ? 'current' : 'off'))
}

export function pipRow(v, pulse) {
  return pipStates(v).map((state, i) => ({
    glyph: stairs[i],
    state,
    color: state === 'done' ? cExp : state === 'current' ? (pulse ? cPulse : cMid) : cTrack,
  }))
}

export { expPct }
export { groundOf, floorAt, bodyMask, measure, liftPet, hop, petTop, seamScore }

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

// OMN_PET_RENDER=image|compact|blocks|halfblock|solid forces the mode (SSH from a Mac forwards no TERM_PROGRAM).
// Else Terminal.app gets solid. tmux hides TERM_PROGRAM, so the bundle id counts too.
export function renderModeOf(env) {
  const e = env || {}
  const forced = String(e.override || '').trim().toLowerCase()
  if (forced === 'blocks' || forced === 'compact' || forced === 'halfblock' || forced === 'solid' || forced === 'image') return forced
  if (e.termProgram === 'Apple_Terminal' || e.bundleId === 'com.apple.Terminal') return 'solid'
  return 'halfblock'
}

let renderEnv = {}

function renderMode() {
  return renderModeOf(renderEnv)
}

async function loadRenderEnv($) {
  try {
    renderEnv = {
      override: await $.env.get('OMN_PET_RENDER'),
      termProgram: await $.env.get('TERM_PROGRAM'),
      bundleId: await $.env.get('__CFBundleIdentifier'),
      colorterm: await $.env.get('COLORTERM'),
    }
  } catch (err) {
    renderEnv = {}
  }
}

function setRenderEnv(env) {
  renderEnv = env || {}
}

const cubeLevels = [0, 95, 135, 175, 215, 255]
const xtermPalette = (() => {
  const out = []
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) out.push((cubeLevels[r] << 16) | (cubeLevels[g] << 8) | cubeLevels[b])
    }
  }
  for (let i = 0; i < 24; i++) {
    const v = 8 + 10 * i
    out.push((v << 16) | (v << 8) | v)
  }
  return out
})()

// Nearest of xterm-256 entries 16..255 by the "redmean" weighted RGB distance.
export function nearest256(c) {
  const r = (c >> 16) & 255
  const g = (c >> 8) & 255
  const b = c & 255
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < xtermPalette.length; i++) {
    const p = xtermPalette[i]
    const dr = r - ((p >> 16) & 255)
    const dg = g - ((p >> 8) & 255)
    const db = b - (p & 255)
    const mr = (r + ((p >> 16) & 255)) / 2
    const d = (2 + mr / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mr) / 256) * db * db
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return xtermPalette[best]
}

function mix(a, b) {
  const ch = (sh) => (((a >> sh) & 255) + ((b >> sh) & 255) + 1) >> 1
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// RGBA bytes of the 16x18 sprite, for the host's Image element.
export function rgbaOf(b64) {
  const raw = present(b64)
  const out = new Uint8Array(16 * 18 * 4)
  for (let i = 0; i < 16 * 18; i++) {
    out[i * 4] = raw[i * 3] || 0
    out[i * 4 + 1] = raw[i * 3 + 1] || 0
    out[i * 4 + 2] = raw[i * 3 + 2] || 0
    out[i * 4 + 3] = 255
  }
  return bytesB64(out)
}

function truecolorOn() {
  const t = String(renderEnv.colorterm || '').toLowerCase()
  return t === 'truecolor' || t === '24bit'
}

function petTree($, e) {
  if (!portrait || !portrait.frames || !portrait.frames.length) return null
  lastSurface = e.surface || 'terminal'
  const { Box, Text, Raster, Svg, Image } = $.ui.resolve(e)
  if (e.plugin) ownPlugin = e.plugin
  const src = shownPortrait()
  const frame = src.frames[Math.floor(frameTick) % src.frames.length]
  const mode = renderMode()
  const picture =
    lastSurface === 'terminal' && mode === 'image' && Image
      ? Image({ key: 'pet', source: { rgba: rgbaOf(frame), width: 16, height: 18 }, columns: 16, rows: 9, alt: ' ' })
      : lastSurface === 'terminal'
      ? Raster({ key: 'pet', columns: mode === 'blocks' ? 32 : 16, rows: mode === 'blocks' ? 18 : 9, cells: rasterOf(frame, mode === 'image' ? 'halfblock' : mode) })
      : Svg({ children: svgOf(frame) })
  return Box({ flexDirection: 'row', columnGap: 2, children: [picture, meterText(Box, Text, (wakeFrom || portrait).growth)] })
}

export function rasterOf(b64, mode) {
  const raw = present(b64)
  const cols = 16
  const nums = []
  const m = mode || renderMode()
  if (m === 'compact') {
    // Same 16x9 footprint as halfblock. Each pair of pixel rows keeps one cell:
    // the one pixel that is not background, or the average when both are sprite.
    const bg = rgb(raw, 0)
    const snap = truecolorOn() ? (c) => c : nearest256
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < cols; x++) {
        const top = rgb(raw, ((2 * y) * cols + x) * 3)
        const bot = rgb(raw, ((2 * y + 1) * cols + x) * 3)
        nums.push(0x20, 0x01000000, snap(top === bg ? bot : bot === bg ? top : mix(top, bot)))
      }
    }
    return bytesB64(new Uint8Array(Uint32Array.from(nums).buffer))
  }
  if (m === 'solid') {
    // Uniform cell: a space with the color as background, so no glyph and no line.
    // Two-color cell: ▀ (fg top, bg bottom) or ▄ (fg bottom, bg top). Pick the glyph whose
    // background equals the nearest vertical neighbor's edge pixel, so the line blends in:
    // ▀ when bottom matches the cell below, else ▄ when top matches the cell above, else ▀.
    const snap = truecolorOn() ? (c) => c : nearest256
    const at = (py, x) => (py < 0 || py > 17 ? -1 : rgb(raw, (py * cols + x) * 3))
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < cols; x++) {
        const top = at(2 * y, x)
        const bot = at(2 * y + 1, x)
        if (top === bot) { nums.push(0x20, 0x01000000, snap(top)); continue }
        const lowerBg = bot === at(2 * y + 2, x) || top !== at(2 * y - 1, x)
        nums.push(lowerBg ? 0x2580 : 0x2584, snap(lowerBg ? top : bot), snap(lowerBg ? bot : top))
      }
    }
    return bytesB64(new Uint8Array(Uint32Array.from(nums).buffer))
  }
  if (m === 'blocks') {
    // No glyph: a space with the pixel as background fills its cell, line gap included.
    const snap = truecolorOn() ? (c) => c : nearest256
    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < cols; x++) {
        const c = snap(rgb(raw, (y * cols + x) * 3))
        nums.push(0x20, 0x01000000, c, 0x20, 0x01000000, c)
      }
    }
    return bytesB64(new Uint8Array(Uint32Array.from(nums).buffer))
  }
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
  if (pose && pose.open && !hasChomp) dropMouth(buf, m, pose.lift)
  let lift = pose && pose.lift ? pose.lift : 0
  // Whatever lifts the body after the bite pose moves the food's spot with it.
  let tokenLift = 0
  if (liftNow()) {
    hop(buf)
    lift += 2
    tokenLift += 2
  }
  // A one-pixel rise puts the crown on the seam between two cells, and most
  // idle animations bob the pet by one pixel. Every frame of a pet is set to
  // one height, chosen so the hard color change sits inside one cell.
  const key = hasChomp ? portrait.chomp : b64
  const steady = steadyLift(key, buf)
  if (steady) {
    liftPet(buf, steady)
    tokenLift += steady
  }
  paintGags(buf, m, lift, key)
  // Layers, bottom to top: pet, cosmetics, food. Food in the mouth rides with
  // the body; food still falling or on the ground stays where the bite put it.
  if (pose && pose.token != null) paintToken(buf, m.tx, pose.token - (pose.open || pose.lift ? tokenLift : 0), crumbRgb[bite.kind] || crumbRgb.other)
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
  return stirring() || (idleHop > 0 && !gagShown()) || reviveHop()
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

// The backdrop: of the colors on the frame's top two rows, the one seen most
// on the frame's border above the ground (top two rows, side columns down to
// row 14). Pixel (0,0) alone is not enough: some stage-4 sprites fill the
// frame and put a crown, leaves or a sparkle there. A color only the sides
// have (wings, arms) is never picked. On a tie the corner wins, so a frame
// with no repeated border color keeps (0,0).
function bgOf(raw) {
  const color = (x, y) => {
    const i = (y * 16 + x) * 3
    return (raw[i] << 16) | (raw[i + 1] << 8) | raw[i + 2]
  }
  const count = new Map()
  for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) count.set(color(x, y), (count.get(color(x, y)) || 0) + 1)
  for (let y = 2; y < 15; y++) {
    for (const x of [0, 15]) if (count.has(color(x, y))) count.set(color(x, y), count.get(color(x, y)) + 1)
  }
  const corner = color(0, 0)
  let best = corner
  let most = count.get(corner)
  for (const [c, n] of count) {
    if (n > most) {
      most = n
      best = c
    }
  }
  return [best >> 16, (best >> 8) & 255, best & 255]
}

function samePx(raw, i, c) {
  return raw[i] === c[0] && raw[i + 1] === c[1] && raw[i + 2] === c[2]
}

// The ground band: the bottom rows where most pixels share one color.
// Whole rows are read, so a scene patch or a foot at the left edge does
// not move the line. A pet pixel that happens to match the ground color
// cannot make a row count as ground either, or the body splits.
function groundOf(raw) {
  const bg = bgOf(raw)
  const count = new Map()
  for (let x = 0; x < 16; x++) {
    const c = rgb(raw, (17 * 16 + x) * 3)
    count.set(c, (count.get(c) || 0) + 1)
  }
  let c = -1
  let best = 0
  for (const [k, n] of count) {
    if (n > best) {
      c = k
      best = n
    }
  }
  const none = { floor: 18, c: null }
  if (best * 2 <= 16 || c === rgb(bg, 0)) return none
  const groundRow = (y) => {
    let n = 0
    for (let x = 0; x < 16; x++) if (rgb(raw, (y * 16 + x) * 3) === c) n++
    return n * 2 > 16
  }
  let floor = 17
  while (floor > 0 && groundRow(floor - 1)) floor--
  return { floor: floor, c: [c >> 16, (c >> 8) & 255, c & 255] }
}

function floorAt(raw) {
  return groundOf(raw).floor
}

// True when the sharp color changes sit on the boundary between two cells.
function seamSplit(buf) {
  const s = seamScore(buf)
  return s.split > s.joined
}

// How much sharp color change sits on a cell seam (split) and inside a cell (joined).
function seamScore(buf) {
  const bg = bgOf(buf)
  const floor = floorAt(buf)
  const mask = bodyMask(buf, floor, bg)
  let split = 0
  let joined = 0
  for (let y = 0; y < 17; y++) {
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
  return { split, joined }
}

// How far each frame of a pet is lifted so all its frames stand at one
// height. Most idle animations bob the pet by one pixel, and a one-pixel bob
// always puts one of its heights on the cell seam. The frames are grouped by
// the height they stand at, and every frame is moved to the height whose own
// frames keep their hard color changes inside a cell (the most frames, then
// the lowest). When no height does, the pet is nudged one pixel from its most
// common height, up unless the top is already row 0. Found once per pet, like
// its eyes, so the height never flips from frame to frame. A frame of no known
// pet gets the nudge for this frame alone (buf as drawn so far).
const steadyCache = new WeakMap()
function steadyLift(b64, buf) {
  for (const p of [portrait, wakeFrom, evolveFrom, reviveFrom, reviveTo, arriveFrom, arriveTo]) {
    const lifts = steadyOf(p)
    if (lifts && lifts.has(b64)) return lifts.get(b64)
  }
  return seamSplit(buf) ? (petTop(buf) > 0 ? 1 : -1) : 0
}

function steadyOf(p) {
  if (!p || !p.frames || !p.frames.length) return null
  if (steadyCache.has(p)) return steadyCache.get(p)
  const out = new Map()
  steadyCache.set(p, out)
  const raws = []
  for (const f of p.frames) {
    try {
      const raw = decodeB64(f)
      if (raw.length >= 16 * 18 * 3) raws.push([f, raw])
    } catch (err) {}
  }
  if (!raws.length) return out
  const ref = raws[0][1]
  // Each height, in rows below the first frame: its frames, seam scores and top.
  const heights = new Map()
  const downs = raws.map(([, raw]) => {
    const d = bobOf(ref, raw)
    const h = heights.get(d) || { d, n: 0, split: 0, joined: 0, top: 18 }
    const s = seamScore(raw)
    h.n++
    h.split += s.split
    h.joined += s.joined
    const t = petTop(raw)
    if (t >= 0) h.top = Math.min(h.top, t)
    heights.set(d, h)
    return d
  })
  const better = (a, b) => (a.n !== b.n ? a.n > b.n : a.d > b.d)
  let clean = null
  let common = null
  for (const h of heights.values()) {
    if (h.split <= h.joined && (!clean || better(h, clean))) clean = h
    if (!common || better(h, common)) common = h
  }
  const target = clean ? clean.d : common.top > 0 ? common.d - 1 : common.d + 1
  raws.forEach(([f], i) => out.set(f, downs[i] - target))
  if (typeof p.chomp === 'string' && !out.has(p.chomp)) {
    try {
      const raw = decodeB64(p.chomp)
      if (raw.length >= 16 * 18 * 3) out.set(p.chomp, bobOf(ref, raw) - target)
    } catch (err) {}
  }
  return out
}

// How many rows lower raw stands than ref (negative: higher), up to 2, by
// the closest match above the ground line. Ties go to the smaller move.
function bobOf(ref, raw) {
  const floor = floorAt(ref)
  let best = 0
  let cost = Infinity
  for (const dy of [0, 1, -1, 2, -2]) {
    let c = 0
    for (let y = 0; y < floor; y++) {
      const sy = y - dy
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 3
        if (sy < 0 || sy >= floor) {
          c += 64
          continue
        }
        const j = (sy * 16 + x) * 3
        c += Math.abs(ref[j] - raw[i]) + Math.abs(ref[j + 1] - raw[i + 1]) + Math.abs(ref[j + 2] - raw[i + 2])
      }
    }
    if (c < cost) {
      cost = c
      best = dy
    }
  }
  return best
}

// Stars, rain, mist, embers, and smoke are scene effects. Every other
// pixel above the floor is the pet, including a crown or spark that
// does not touch the body.
const stayPut = new Set([
  0x4a4580, 0x7a6870, 0x885050, 0x4a6aa0, 0x343e56, 0xe07024, 0x843a22, 0x9a96a8,
])

// Pet pixels over the whole 16x18 frame. Above the floor, every pixel that is
// not bg or a scene effect. In the ground band, only pixels that are not
// ground, bg, or a scene effect and that touch the pet (8 neighbours), so feet
// drawn on the ground move with the body and ground texture stays put.
function bodyMask(raw, floor, bg) {
  const mask = new Uint8Array(18 * 16)
  const pet = (i) => !samePx(raw, i, bg) && !stayPut.has(rgb(raw, i))
  const queue = []
  for (let y = 0; y < floor; y++) {
    for (let x = 0; x < 16; x++) {
      if (!pet((y * 16 + x) * 3)) continue
      mask[y * 16 + x] = 1
      if (y >= floor - 1) queue.push(y * 16 + x)
    }
  }
  if (floor >= 18) return mask
  const ground = groundOf(raw).c
  while (queue.length) {
    const id = queue.pop()
    const y = Math.floor(id / 16)
    const x = id % 16
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ny = y + dy
        const nx = x + dx
        if (ny < floor || ny >= 18 || nx < 0 || nx >= 16) continue
        const nid = ny * 16 + nx
        const i = nid * 3
        if (mask[nid] || !pet(i) || (ground && samePx(raw, i, ground))) continue
        mask[nid] = 1
        queue.push(nid)
      }
    }
  }
  return mask
}

function measure(raw) {
  const bg = bgOf(raw)
  const floor = floorAt(raw)
  const mask = bodyMask(raw, floor, bg)
  let top = 18
  let foot = 0
  let minX = 16
  let maxX = 0
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 16; x++) {
      if (!mask[y * 16 + x]) continue
      if (y < top) top = y
      if (y > foot) foot = y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
    }
  }
  if (top >= 18) {
    top = 4
    foot = Math.max(4, floor - 2)
    minX = 4
    maxX = 11
  }
  const mouth = mouthAt(raw, portrait && portrait.chomp ? decodeB64(portrait.chomp) : null, top, foot, floor)
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

// The mouth row: just above the lowest row where the chomp frame (alt)
// differs, or 62% down the body without one.
function mouthAt(raw, alt, top, foot, floor) {
  let mouth = top + Math.round((foot - top) * 0.62)
  if (alt) {
    let diff = -1
    for (let y = top; y < floor && y < 18; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 3
        if (rgb(raw, i) !== rgb(alt, i)) diff = y
      }
    }
    if (diff > top) mouth = diff - 1
  }
  return mouth
}

function liftPet(buf, lift) {
  const copy = buf.slice()
  const bg = bgOf(copy)
  const { floor, c: ground } = groundOf(copy)
  const mask = bodyMask(copy, floor, bg)
  // Clear the pet: ground color where it stood in the ground band, bg above.
  for (let y = 0; y < 18; y++) {
    const fill = y >= floor && ground ? ground : bg
    for (let x = 0; x < 16; x++) {
      const id = y * 16 + x
      if (!mask[id]) continue
      const i = id * 3
      buf[i] = fill[0]
      buf[i + 1] = fill[1]
      buf[i + 2] = fill[2]
    }
  }
  // A pet with feet on the band stands in front of the ground, so a lowered
  // body stays joined to its feet. Otherwise the ground stays in front and
  // body rows lowered into the band are hidden.
  const onBand = mask.subarray(floor * 16).some((v) => v)
  for (let y = 0; y < 18; y++) {
    const src = y + lift
    if (src < 0 || src >= 18) continue
    if (y >= floor && src < floor && !onBand) continue
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
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 16; x++) if (mask[y * 16 + x]) return y
  }
  return -1
}

// ---- Gags ----
// Short reactions to what Claude does, drawn over the idle frames like hop and
// sparkle. One transient gag runs at a time (gag) and one more may wait
// (gagNext); a higher priority gag replaces the running one, a lower one waits
// up to gagWait ticks or is dropped. The nightcap is persistent and draws
// under it. A scene (wake, revive, arrive, evolve, gleam)
// drops every gag. During a bite the bite owns the body: a gag draws its
// overlays on the moved sprite but none of its own body motion.
let gagsOn = true
let gag = null
let gagNext = null
let thinking = null
let failRun = 0
let gagHour = null
let mealAvg = 0
let mealN = 0
let slowLeft = 0
let frameTick = 0
const gagPrio = { think: 1, prop: 2, confetti: 3, burp: 4, horror: 4, flinch: 5, facepalm: 6, squish: 6, dizzy: 7 }
// Ticks (100ms) a gag plays once nothing holds it.
const gagLen = { think: 0, prop: 30, confetti: 14, burp: 15, horror: 15, flinch: 8, facepalm: 15, squish: 10, dizzy: 20 }
// Ticks (100ms) before a reaction gag of the same kind may start again, so a
// run of failures or commits does not replay it back to back. The window
// counts from when startGag took the gag (it played, merged or queued), not
// from when it ended, so a long-held gag (a squish through a slow compaction)
// does not stretch it. prop and think have none.
const gagCooldown = { confetti: 100, burp: 100, horror: 100, flinch: 100, facepalm: 100, squish: 100, dizzy: 100 }
// Kind -> the tick its cooldown started.
const gagCool = new Map()
// The gags that cover the head, so the nightcap steps aside.
const headGags = new Set(['think', 'dizzy', 'horror', 'hat'])
// Gags that are not worn, so an egg plays them too.
const eggGags = new Set(['think', 'flinch', 'dizzy', 'squish', 'confetti', 'burp', 'horror'])
const thinkCap = 600
const holdCap = 3000
const gagWait = 20
const slowTicks = 30
const failsToFacepalm = 3
const springRows = [-2, -2, 2, 0]
const toolProps = {
  Bash: 'hat',
  Read: 'lens',
  Grep: 'lens',
  Glob: 'lens',
  Edit: 'pencil',
  Write: 'pencil',
  MultiEdit: 'pencil',
  NotebookEdit: 'pencil',
  WebSearch: 'binoculars',
  WebFetch: 'binoculars',
  Agent: 'clone',
  Task: 'clone',
}
const pxGold = [0xf5, 0xd4, 0x4a]
const pxWhite = [0xff, 0xff, 0xff]
const pxText = [0xe8, 0xe6, 0xf0]
const pxFed = [0xf2, 0xb8, 0x4b]
const pxWarn = [0xff, 0x5a, 0x36]
const pxSky = [0x7e, 0xc8, 0xe3]
const pxGray = [0xc8, 0xc4, 0xd4]
const pxExp = [0x9d, 0x8c, 0xff]
const pxInk = [0x2a, 0x26, 0x40]

function sceneOn() {
  return wakeLeft > 0 || !!wakeFrom || reviveLeft > 0 || arriveLeft > 0 || evolveLeft > 0 || gleamLeft > 0
}

function petAwake() {
  return !!portrait && portrait.status !== 'dead' && portrait.status !== 'sleeping'
}

// Stage 0 is the egg (the "Shadow" sprite every species starts as).
function petEgg() {
  if (!portrait) return false
  if (typeof portrait.growth === 'number') return portrait.growth < stageAt[1]
  return portrait.species === 'Shadow'
}

function gagShown() {
  return !!gag && gagsOn && !sceneOn() && petAwake()
}

function lateNight() {
  const h = gagHour !== null ? gagHour : new Date().getHours()
  return h >= 0 && h < 5
}

// startGag returns the gag a caller holds and later releases, or null when it
// was dropped. A held gag plays while held, then its length.
function startGag(spec) {
  if (!gagsOn || !portrait || sceneOn() || !petAwake()) return null
  let kind = spec.kind
  if (petEgg() && !eggGags.has(kind)) {
    if (kind !== 'facepalm') return null
    kind = 'flinch'
  }
  if (gagCooldown[kind] && gagCool.has(kind) && tick - gagCool.get(kind) < gagCooldown[kind]) return null
  if (gagCooldown[kind]) gagCool.set(kind, tick)
  // A gag draws on a body that is not hopping.
  idleHop = 0
  const g = { kind, prop: spec.prop || '', held: spec.held || 0, t: 0, left: gagLen[kind], prio: gagPrio[kind] }
  if (kind === 'confetti') spawnConfetti(g)
  // A prop that only lingers (its tool is done) yields to any new gag that is
  // not the same prop: the next tool's prop, thinking dots, a reaction.
  const lingering = !!gag && gag.kind === 'prop' && gag.held === 0
  if (!gag || g.prio > gag.prio || (lingering && !(g.kind === gag.kind && g.prop === gag.prop))) {
    gag = g
    return g
  }
  if (g.kind === gag.kind && g.prop === gag.prop) {
    gag.held += g.held
    gag.left = Math.max(gag.left, g.left)
    return gag
  }
  if (!gagNext || g.prio >= gagNext.g.prio) gagNext = { g, at: tick }
  return g
}

function releaseGag(g) {
  if (g && g.held > 0) g.held--
}

// The compaction rows of one compaction (boundary, summary) arrive back to
// back: the first main row within compactRowGap of none squishes once, unless
// session.compact already did for this compaction (within compactMatch).
let compactHookAt = -Infinity
let compactRowAt = -Infinity
const compactRowGap = 50
const compactMatch = 6000

function compactRow() {
  const fresh = tick - compactRowAt > compactRowGap
  compactRowAt = tick
  if (!fresh) return
  if (tick - compactHookAt <= compactMatch) {
    compactHookAt = -Infinity
    return
  }
  startGag({ kind: 'squish' })
}

function clearGags() {
  gag = null
  gagNext = null
  gagCool.clear()
  thinking = null
  failRun = 0
  slowLeft = 0
}

function stepGag() {
  if (slowLeft > 0) slowLeft--
  if (!gag && !gagNext) return
  if (!gagsOn || sceneOn() || !petAwake()) {
    gag = null
    gagNext = null
    return
  }
  if (gagNext && tick - gagNext.at > gagWait) gagNext = null
  if (!gag) promoteGag()
  if (!gag) return
  gag.t++
  if (gag.bits) stepConfetti(gag)
  if (gag.held > 0 && gag.t < (gag.kind === 'think' ? thinkCap : holdCap)) return
  gag.held = 0
  // A lingering prop gives way at once to a queued gag, which would otherwise
  // wait past gagWait and be dropped.
  if (gag.kind === 'prop' && gagNext) {
    gag = null
    promoteGag()
    return
  }
  gag.left--
  if (gag.left > 0) return
  if (gag.kind === 'burp') slowLeft = slowTicks
  gag = null
  promoteGag()
}

function promoteGag() {
  if (!gagNext) return
  gag = gagNext.g
  gagNext = null
  gag.t = 0
}

function endThink() {
  releaseGag(thinking)
  thinking = null
}

function abortGag() {
  endThink()
  failRun = 0
  startGag({ kind: 'dizzy' })
}

function toolFailed() {
  failRun++
  startGag({ kind: failRun >= failsToFacepalm ? 'facepalm' : 'flinch' })
}

// Starts the gags a tool call shows while it runs. prop is the held prop gag.
function toolGags(e) {
  const out = { prop: null, commit: false }
  const tool = e && e.tool
  if (tool === 'Bash') {
    const cmd = typeof e.command === 'string' ? e.command : ''
    if (forcePush(cmd)) startGag({ kind: 'horror' })
    out.commit = gitCommit(cmd)
  }
  if (toolProps[tool]) out.prop = startGag({ kind: 'prop', prop: toolProps[tool], held: 1 })
  return out
}

// Each git call in a shell line as [subcommand, ...its args]. Options before
// the subcommand are skipped (-C <path> and -c <k=v> take a value).
function gitCalls(cmd) {
  const out = []
  for (const part of String(cmd || '').split(/[;&|\n]+/)) {
    const w = part.trim().split(/\s+/)
    let i = w.indexOf('git')
    if (i < 0) continue
    i++
    while (i < w.length && w[i].startsWith('-')) i += w[i] === '-C' || w[i] === '-c' ? 2 : 1
    if (i < w.length) out.push(w.slice(i))
  }
  return out
}

export function forcePush(cmd) {
  return gitCalls(cmd).some((w) => w[0] === 'push' && w.slice(1).some((a) => /^(--force(-with-lease)?(=.*)?|-[A-Za-z]*f[A-Za-z]*)$/.test(a)))
}

export function gitCommit(cmd) {
  return gitCalls(cmd).some((w) => w[0] === 'commit')
}

// A turn far above the usual: 3x the running average, after 3 meals.
function bigMeal(xp) {
  if (!(xp > 0)) return false
  const big = mealN >= 3 && xp >= 3 * mealAvg && xp >= 20
  mealAvg = mealN ? mealAvg * 0.8 + xp * 0.2 : xp
  mealN++
  return big
}

async function gagsCommand($, arg) {
  if (arg === 'on' || arg === 'off') {
    gagsOn = arg === 'on'
    await $.store.set('gags', arg)
    if (!gagsOn) clearGags()
    $.ui.invalidate('ui.render')
  } else if (arg !== '') return { text: 'usage: /omn gags on|off' }
  return { text: 'omn gags ' + (gagsOn ? 'on' : 'off') }
}

function spawnConfetti(g) {
  let m
  try {
    m = measure(decodeB64(portrait.frames[Math.floor(frameTick) % portrait.frames.length]))
  } catch (err) {
    m = { top: 4, minX: 4, maxX: 11 }
  }
  const cx = (m.minX + m.maxX) / 2
  // From just over the head, but never above row 3: a pet that fills the frame
  // still sees its confetti rise and rain down over it. Less headroom, less lift.
  const y = Math.max(3, m.top - 1)
  const lift = Math.min(1, 0.45 + y * 0.06)
  g.bits = []
  for (let i = 0; i < 10; i++) {
    const s = i - 4.5
    g.bits.push({ x: cx + s * 0.3, y, vx: s * 0.16, vy: -lift - (i % 3) * 0.15, c: bitColors[i % bitColors.length] })
  }
}

function stepConfetti(g) {
  for (const b of g.bits) {
    b.x += b.vx
    b.y += b.vy
    b.vy += 0.12
  }
}

// paintGags draws the persistent nightcap, then the running gag.
// m is the idle frame's measure (before any lift).
// lift is how far a bite or hop raised the body this frame, and key the frame
// drawn: head overlays sit on the pet's resting head (found once per pet)
// raised by lift, so they move with the body as one piece and never with the
// shape of one frame.
function paintGags(buf, m0, lift = 0, key = null) {
  if (!gagsOn || !portrait || sceneOn() || !petAwake()) return
  const egg = petEgg()
  const g = gagShown() ? gag : null
  if (!g && (egg || !lateNight())) return
  // A bite, hop or seam nudge may have moved the sprite: measure it as it is now.
  // The mouth comes from the idle frame (its chomp diff), shifted along.
  const rest = restOf(portrait, key)
  let dx = 0
  if (g && !bite) {
    const before = measure(buf)
    dx = gagBody(buf, { ...before, mouth: rest ? rest.mouth - lift : m0.mouth + (before.top - m0.top) }, g)
  }
  const mask = petMask(buf)
  const m = boundsOf(mask, measure(buf))
  // A squish moves the crown on purpose, so its frames are measured as drawn.
  const still = rest && !(g && !bite && g.kind === 'squish')
  const top = still ? rest.top - lift : m.top
  const head = still ? [rest.head[0] + dx, rest.head[1] + dx, rest.head[2] - lift] : headSpan(m, mask)
  // The eyes are found once per pet, so a blink frame never moves the props.
  const fixed = petEyes(portrait)
  const eyes = fixed ? { y: top + fixed.ry, lx: fixed.lx + dx, rx: fixed.rx + dx, w: fixed.w, found: true } : eyesOf(buf, m, mask)
  const k = { buf, m, mask, top, mouth: still ? rest.mouth - lift : m0.mouth + (m.top - m0.top), eyes, head }
  if (!egg && lateNight() && !(g && (headGags.has(g.kind) || headGags.has(g.prop)))) nightcap(k)
  if (g) gagOverlay(k, g)
}

// The pet's mask for placing overlays. A pet that stands over the ground's top
// row hides that row from groundOf, so the row's ground pixels are left out
// too: they would widen the body on some frames and move the hat to another row.
function petMask(buf) {
  return restMask(buf)
}

function restMask(buf) {
  const { floor, c: ground } = groundOf(buf)
  const mask = bodyMask(buf, floor, bgOf(buf))
  if (ground && floor > 0 && floor < 18) {
    for (let x = 0; x < 16; x++) if (samePx(buf, ((floor - 1) * 16 + x) * 3, ground)) mask[(floor - 1) * 16 + x] = 0
  }
  return mask
}

// The pet's resting crown row, head span ([left, right, row]) and mouth row,
// the most common answers across its frames as they are drawn (each at its
// steady height, the chomp frame too). A flame that flickers wide, a blink
// or a wave frame is outvoted.
// null when key is not one of the pet's frames.
const restCache = new WeakMap()
function restOf(p, key) {
  const lifts = steadyOf(p)
  if (!lifts || !lifts.has(key)) return null
  if (restCache.has(p)) return restCache.get(p)
  const steadied = (f) => {
    const buf = decodeB64(f)
    if (lifts.get(f)) liftPet(buf, lifts.get(f))
    return buf
  }
  const alt = typeof p.chomp === 'string' && lifts.has(p.chomp) ? steadied(p.chomp) : null
  const heads = new Map()
  const mouths = new Map()
  const vote = (tally, v) => tally.set(v, (tally.get(v) || 0) + 1)
  for (const f of p.frames) {
    if (!lifts.has(f)) continue
    const buf = steadied(f)
    const mask = restMask(buf)
    const m = boundsOf(mask, measure(buf))
    vote(heads, [m.top, ...headSpan(m, mask)].join())
    vote(mouths, mouthAt(buf, alt, m.top, m.foot, floorAt(buf)))
  }
  const best = (tally) => {
    let out = null
    let n = 0
    for (const [v, c] of tally) {
      if (c > n) {
        n = c
        out = v
      }
    }
    return out
  }
  const head = best(heads)
  if (head === null) {
    restCache.set(p, null)
    return null
  }
  const [top, a, b, y] = head.split(',').map(Number)
  const out = { top, head: [a, b, y], mouth: best(mouths) }
  restCache.set(p, out)
  return out
}

function boundsOf(mask, base) {
  let top = 18
  let foot = -1
  let minX = 16
  let maxX = -1
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 16; x++) {
      if (!maskAt(mask, x, y)) continue
      if (y < top) top = y
      foot = Math.max(foot, y)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
    }
  }
  return foot < 0 ? base : { ...base, top, foot, minX, maxX }
}

// Applies the gag's body motion. Returns how far it slid the pet sideways.
function gagBody(buf, m, g) {
  let dx = 0
  if (g.kind === 'flinch' || g.kind === 'facepalm') dx = g.t === 0 ? 1 : 0
  else if (g.kind === 'dizzy') dx = g.t < 4 ? [2, 1, 1, 0][g.t] : 0
  else if (g.kind === 'horror') dx = g.t < 8 && g.t % 2 === 1 ? 1 : 0
  else if (g.kind === 'squish') squishPet(buf, m, squishRows(g, m))
  else if (g.kind === 'burp') bulge(buf, m)
  slidePet(buf, dx)
  return dx
}

// Where a pet's eyes sit, found once across all its frames: the most common
// answer, as rows below the sprite top and absolute columns. A blink or a
// frame where the cheeks look like eyes is outvoted. When no frame has eyes,
// the most common guess, so face props still hold still. null without frames.
const eyeCache = new WeakMap()
function petEyes(p) {
  if (!p) return null
  if (eyeCache.has(p)) return eyeCache.get(p)
  const votes = new Map()
  const guesses = new Map()
  for (const f of p.frames || []) {
    let raw
    try {
      raw = decodeB64(f)
    } catch (err) {
      continue
    }
    if (raw.length < 16 * 18 * 3) continue
    const m = measure(raw)
    const e = eyesOf(raw, m)
    const key = [e.y - m.top, e.lx, e.rx, e.w].join()
    const tally = e.found ? votes : guesses
    tally.set(key, (tally.get(key) || 0) + 1)
  }
  let best = ''
  let n = 0
  for (const [key, v] of votes.size ? votes : guesses) {
    if (v > n) {
      n = v
      best = key
    }
  }
  const [ry, lx, rx, w] = best.split(',').map(Number)
  const out = best ? { ry, lx, rx, w } : null
  eyeCache.set(p, out)
  return out
}

function gagOverlay(k, g) {
  if (g.kind === 'think') thinkDots(k, g)
  else if (g.kind === 'prop') {
    if (g.prop === 'hat') hardHat(k)
    else if (g.prop === 'lens') lens(k)
    else if (g.prop === 'pencil') pencil(k, g)
    else if (g.prop === 'binoculars') binoculars(k)
    else if (g.prop === 'clone') clone(k, g)
  } else if (g.kind === 'flinch') sweat(k, g)
  else if (g.kind === 'facepalm') {
    palm(k)
    sweat(k, g)
  } else if (g.kind === 'dizzy') stars(k, g)
  else if (g.kind === 'horror') horror(k)
  else if (g.kind === 'confetti') for (const b of g.bits) paint(k.buf, b.x, b.y, b.c)
}

// Moves the pet sideways, feet on the ground band included (as liftPet moves
// them). Where it stood, the band gets the ground color back, sky gets bg.
// Scene pixels stay put.
function slidePet(buf, dx) {
  if (!dx) return
  const copy = buf.slice()
  const bg = bgOf(copy)
  const { floor, c: ground } = groundOf(copy)
  const mask = bodyMask(copy, floor, bg)
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 16; x++) if (mask[y * 16 + x]) setPx(buf, x, y, y >= floor && ground ? ground : bg)
  }
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 16; x++) {
      const sx = x - dx
      if (sx < 0 || sx >= 16 || !mask[y * 16 + sx]) continue
      copyPx(buf, x, y, copy, sx, y)
    }
  }
}

// Rows the squish takes off the body: down to about 60%, held, then a spring
// with an overshoot. Always even, so the crown moves one whole terminal cell.
function squishRows(g, m) {
  const h = m.foot - m.top + 1
  const d = Math.max(2, even(Math.round(h * 0.4)))
  if (g.held > 0 || g.left > springRows.length) return g.t === 0 ? Math.max(2, even(d / 2)) : d
  return springRows[springRows.length - g.left] || 0
}

function even(n) {
  const v = Math.floor(n)
  return v - (v % 2)
}

// Squashes (d > 0) or stretches (d < 0) the body by d rows above the feet.
// The feet stay planted. A squash drops the rows that look most like a
// neighbour; a stretch doubles them. Rows with eyes, a mouth or an outline
// change look least like their neighbours, so they stay, and striped parts
// (tentacles, legs) lose whole stripes instead of being resampled into noise.
function squishPet(buf, m, d) {
  const h = m.foot - m.top + 1
  const lo = m.top
  const hi = m.foot - (h >= 8 ? 2 : 1)
  const span = hi - lo + 1
  if (!d || span < 3) return
  if (d > 0) d = Math.min(d, even(span - 2))
  if (d < 0) d = -Math.min(-d, even(lo))
  if (!d) return
  const copy = buf.slice()
  const bg = bgOf(copy)
  const { floor, c: ground } = groundOf(copy)
  const mask = bodyMask(copy, floor, bg)
  const cell = (y, x) => (mask[y * 16 + x] ? rgb(copy, (y * 16 + x) * 3) : -1)
  const diff = (a, b) => {
    let n = 0
    for (let x = 0; x < 16; x++) {
      const p = cell(a, x)
      const q = cell(b, x)
      if (p === q) continue
      if (p < 0 || q < 0) n += 400
      else n += Math.abs((p >> 16) - (q >> 16)) + Math.abs(((p >> 8) & 255) - ((q >> 8) & 255)) + Math.abs((p & 255) - (q & 255))
    }
    return n
  }
  const rows = []
  for (let y = lo; y <= hi; y++) rows.push(y)
  const mid = (rows.length - 1) / 2
  // The face stays: the eye row (and the one under it, for tall eyes) and the mouth.
  const eyes = eyesOf(copy, m, mask)
  const keep = new Set([m.mouth])
  if (eyes.found) {
    keep.add(eyes.y)
    keep.add(eyes.y + 1)
  }
  // The first and last rows (crown and the row on the feet) are never picked.
  // A stretch only doubles rows in the top third, above the face.
  const pick = () => {
    let best = -1
    let cost = Infinity
    const last = d > 0 ? rows.length - 2 : Math.max(1, Math.floor(rows.length / 3))
    for (let i = 1; i <= last; i++) {
      if (keep.has(rows[i])) continue
      const c = Math.min(diff(rows[i], rows[i - 1]), diff(rows[i], rows[i + 1])) * 16 + Math.abs(i - mid)
      if (c < cost) {
        cost = c
        best = i
      }
    }
    return best
  }
  for (let k = 0; k < Math.abs(d); k++) {
    const i = pick()
    if (i < 0) break
    if (d > 0) rows.splice(i, 1)
    else rows.splice(i, 0, rows[i])
  }
  for (let y = lo; y <= hi; y++) {
    for (let x = 0; x < 16; x++) if (mask[y * 16 + x]) setPx(buf, x, y, y >= floor && ground ? ground : bg)
  }
  const top = hi - rows.length + 1
  rows.forEach((src, j) => {
    for (let x = 0; x < 16; x++) if (mask[src * 16 + x]) copyPx(buf, x, top + j, copy, x, src)
  })
}

// Belly rows (below the mouth) grow one pixel out on each side.
function bulge(buf, m) {
  const copy = buf.slice()
  const bg = bgOf(copy)
  const floor = floorAt(copy)
  const mask = bodyMask(copy, floor, bg)
  for (let y = m.mouth + 1; y < m.foot && y < floor; y++) {
    let a = 16
    let b = -1
    for (let x = 0; x < 16; x++) {
      if (!mask[y * 16 + x]) continue
      if (x < a) a = x
      b = x
    }
    if (b < 0) continue
    if (a > 0 && !mask[y * 16 + a - 1]) copyPx(buf, a - 1, y, copy, a, y)
    if (b < 15 && !mask[y * 16 + b + 1]) copyPx(buf, b + 1, y, copy, b, y)
  }
}

function setPx(buf, x, y, c) {
  const i = (y * 16 + x) * 3
  buf[i] = c[0]
  buf[i + 1] = c[1]
  buf[i + 2] = c[2]
}

function copyPx(buf, x, y, src, sx, sy) {
  const i = (y * 16 + x) * 3
  const s = (sy * 16 + sx) * 3
  buf[i] = src[s]
  buf[i + 1] = src[s + 1]
  buf[i + 2] = src[s + 2]
}

function maskAt(mask, x, y) {
  return x >= 0 && x < 16 && y >= 0 && y < 18 && mask[y * 16 + x] === 1
}

function rowSpan(mask, y) {
  let a = 16
  let b = -1
  for (let x = 0; x < 16; x++) {
    if (!maskAt(mask, x, y)) continue
    if (x < a) a = x
    b = x
  }
  return [a, b]
}

// Where a hat or cap sits: [left, right, row] of the first row from the top
// that is at least half as wide as the body. An antenna, sprout, flame tip or
// crown above it is narrower, so the hat goes on the head and they poke out.
function headSpan(m, mask) {
  const need = Math.max(3, Math.ceil((m.maxX - m.minX + 1) / 2))
  for (let y = m.top; y <= m.foot; y++) {
    const [a, b] = rowSpan(mask, y)
    if (b - a + 1 >= need) return [a, b, y]
  }
  return [m.minX, m.maxX, m.top]
}

// The eyes: a pair of matching, rare (at most 4 pixels), non-body-fill pixels
// inside the outline, mirrored across the row or the sprite. Without one,
// a guess 40% down the body. lx is the left eye's left pixel, rx the right
// eye's right pixel, w the eye width.
function eyesOf(buf, m, mask) {
  const mk = mask || bodyMask(buf, floorAt(buf), bgOf(buf))
  const at = (x, y) => maskAt(mk, x, y)
  const col = (x, y) => rgb(buf, (y * 16 + x) * 3)
  const count = new Map()
  for (let id = 0; id < 16 * 18; id++) {
    if (mk[id] !== 1) continue
    const c = rgb(buf, id * 3)
    count.set(c, (count.get(c) || 0) + 1)
  }
  let fill = -1
  let most = 0
  for (const [c, n] of count) {
    if (n > most) {
      most = n
      fill = c
    }
  }
  const inside = (x, y) => at(x, y) && at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1)
  const contrast = (c) => Math.abs((c >> 16) - (fill >> 16)) + Math.abs(((c >> 8) & 255) - ((fill >> 8) & 255)) + Math.abs((c & 255) - (fill & 255))
  // Of every pair, the one that stands out most from the body fill: pupils,
  // not a shine or blush. Ties go to the higher row.
  let best = null
  const hi = m.top + Math.ceil((m.foot - m.top) * 0.75)
  for (let y = m.top + 1; y <= hi; y++) {
    const [r0, r1] = rowSpan(mk, y)
    for (let x = r0 + 1; x < (r0 + r1) / 2; x++) {
      const c = col(x, y)
      if (!inside(x, y) || c === fill || count.get(c) > 4) continue
      let w = 1
      while (w < 2 && at(x + w, y) && col(x + w, y) === c) w++
      pair: for (const mid of [r0 + r1, m.minX + m.maxX]) {
        for (const rx of [mid - x, mid - x - 1, mid - x + 1]) {
          if (rx - w + 1 <= x + w || rx > 15 || col(rx, y) !== c || !inside(rx, y)) continue
          if (!best || contrast(c) > best.score) best = { y, lx: x, rx, w, found: true, score: contrast(c) }
          break pair
        }
      }
    }
  }
  if (best) return { y: best.y, lx: best.lx, rx: best.rx, w: best.w, found: true }
  const cx = Math.round((m.minX + m.maxX) / 2)
  return { y: m.top + Math.round((m.foot - m.top) * 0.4), lx: cx - 2, rx: cx + 2, w: 1, found: false }
}

function thinkDots(k, g) {
  const n = 1 + (Math.floor(g.t / 3) % 3)
  const y = k.top - 2
  const x0 = Math.max(0, Math.min(11, k.head[1] - 1))
  for (let i = 0; i < n; i++) paint(k.buf, x0 + i * 2, y, pxText)
}

function hardHat(k) {
  const [a, b] = k.head
  const brim = k.head[2] - 1
  for (let x = a - 1; x <= b + 1; x++) paint(k.buf, x, brim, pxFed)
  for (let x = a + 1; x <= b - 1; x++) paint(k.buf, x, brim - 1, pxGold)
  for (let x = a + 3; x <= b - 3; x++) paint(k.buf, x, brim - 2, pxGold)
  paint(k.buf, a + 2, brim - 1, pxWhite)
}

// A white-trimmed cap whose tip flops over to the right, pompom hanging down.
function nightcap(k) {
  const [a, b] = k.head
  const y = k.head[2] - 1
  const mid = (a + b) >> 1
  for (let x = a; x <= b; x++) paint(k.buf, x, y, pxText)
  for (let x = a + 1; x <= b - 1; x++) paint(k.buf, x, y - 1, pxExp)
  for (let x = mid - 1; x <= b - 1; x++) paint(k.buf, x, y - 2, pxExp)
  for (let x = mid + 1; x <= b + 1; x++) paint(k.buf, x, y - 3, pxExp)
  paint(k.buf, b + 2, y - 2, pxExp)
  paint(k.buf, b + 2, y - 1, pxText)
}

// A magnifier ring around the right eye, handle down to the side.
function lens(k) {
  const { y, rx } = k.eyes
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if (dx || dy) paint(k.buf, rx + dx, y + dy, pxGray)
  }
  paint(k.buf, rx + 2, y + 2, pxFed)
  paint(k.buf, rx + 3, y + 3, pxFed)
}

// A pencil beside the body, tip by the mouth, scribbling up and down.
function pencil(k, g) {
  const { m } = k
  const right = m.maxX <= 12 || m.minX < 3
  const ax = right ? Math.min(12, m.maxX + 1) : m.minX - 1
  const dir = right ? 1 : -1
  const ty = k.mouth + ((g.t >> 1) % 2)
  paint(k.buf, ax, ty, pxInk)
  paint(k.buf, ax + dir, ty - 1, pxFed)
  paint(k.buf, ax + dir * 2, ty - 2, pxFed)
  paint(k.buf, ax + dir * 3, ty - 3, pxWarn)
}

function binoculars(k) {
  const { y, lx, rx, w } = k.eyes
  for (let x = lx - 1; x <= rx + 1; x++) paint(k.buf, x, y - 1, pxInk)
  for (const x0 of [lx, rx - w + 1]) {
    paint(k.buf, x0 - 1, y, pxInk)
    paint(k.buf, x0 + w, y, pxInk)
    for (let x = x0; x < x0 + w; x++) paint(k.buf, x, y, pxSky)
  }
}

// A small copy of the pet pops out beside it, then poofs. Beside the pet it
// is as big as the room there allows (half size at most). With less than a
// third of the pet's width free, it stands in front at the right edge, a third
// of the pet's size, rimmed in the backdrop color so it reads as its own figure.
function clone(k, g) {
  const { buf, m, mask } = k
  const w = m.maxX - m.minX + 1
  const h = m.foot - m.top + 1
  const right = 15 - m.maxX
  const room = Math.max(right, m.minX)
  const small = Math.max(4, Math.round(w / 3))
  const beside = room >= small
  const cw = beside ? Math.min(Math.ceil(w / 2), room) : small
  const ch = Math.max(3, Math.round((h * cw) / w))
  const x0 = beside ? (right >= cw ? m.maxX + 1 : m.minX - cw) : 16 - cw
  const y0 = m.foot - ch + 1
  if (g.t < 2 || (g.held === 0 && g.left <= 3)) {
    puff(k, x0 + (cw >> 1), y0 + (ch >> 1), g.t)
    return
  }
  const copy = buf.slice()
  const on = new Uint8Array(16 * 18)
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      // Edge to edge, so the clone keeps the pet's outline.
      const sx = m.minX + Math.round((cx * (w - 1)) / Math.max(1, cw - 1))
      const sy = m.top + Math.round((cy * (h - 1)) / Math.max(1, ch - 1))
      const dx = x0 + cx
      const dy = y0 + cy
      if (maskAt(mask, sx, sy) && dx >= 0 && dx <= 15 && dy <= 17) on[dy * 16 + dx] = (sy * 16 + sx) + 1
    }
  }
  if (!beside) {
    const bg = bgOf(copy)
    for (let id = 0; id < on.length; id++) {
      if (!on[id]) continue
      const x = id % 16
      const y = Math.floor(id / 16)
      for (const [ax, ay] of [[x - 1, y], [x, y - 1]]) {
        if (ax >= 0 && ay >= 0 && !on[ay * 16 + ax] && maskAt(mask, ax, ay)) setPx(buf, ax, ay, bg)
      }
    }
  }
  for (let id = 0; id < on.length; id++) {
    if (!on[id]) continue
    const src = on[id] - 1
    copyPx(buf, id % 16, Math.floor(id / 16), copy, src % 16, Math.floor(src / 16))
  }
}

function puff(k, x, y, t) {
  const d = t % 2 ? 1 : 2
  for (const [dx, dy] of [[0, 0], [-d, -1], [d, -1], [-d, 1], [d, 1]]) {
    if (!maskAt(k.mask, x + dx, y + dy)) paint(k.buf, x + dx, y + dy, pxGray)
  }
}

function sweat(k, g) {
  const [, b] = k.head
  const x = b < 15 ? b + 1 : k.head[0] - 1
  const y = k.head[2] + 1 + Math.min(4, g.t >> 1)
  paint(k.buf, x, y - 1, pxText)
  paint(k.buf, x, y, pxSky)
}

// The left eye shut to a line, a paw over the right eye with its arm coming up
// from the side. The paw is the body's own fill, lightened so it shows on the
// face, rimmed in the body's outline color.
function palm(k) {
  const { buf, eyes, mask } = k
  const { y, lx, rx, w } = eyes
  const [a] = rowSpan(mask, y)
  const px = (x, yy) => [buf[(yy * 16 + x) * 3], buf[(yy * 16 + x) * 3 + 1], buf[(yy * 16 + x) * 3 + 2]]
  const edge = a < 16 ? px(a, y) : pxInk
  const fill = px(Math.min(15, Math.max(0, (lx + rx) >> 1)), y)
  const light = fill.map((v) => (v + 255) >> 1)
  for (let x = lx; x < lx + w; x++) {
    paint(buf, x, y - 1, fill)
    paint(buf, x, y, edge)
  }
  paint(buf, lx + w, y, edge)
  const x0 = rx - w - 1
  for (let x = x0; x <= rx + 1; x++) {
    paint(buf, x, y - 1, light)
    paint(buf, x, y, x === x0 || x === rx + 1 ? edge : light)
    paint(buf, x, y + 1, edge)
  }
  for (let x = x0 + 1; x <= rx + 1; x += 2) paint(buf, x, y - 2, edge)
  paint(buf, rx + 2, y + 1, edge)
  paint(buf, rx + 2, y + 2, edge)
}

// Three stars 120 degrees apart circling just over the head, so two never
// stack: two gold plus shapes and one white point.
function stars(k, g) {
  const cx = (k.head[0] + k.head[1]) / 2
  const cy = k.head[2] - 2
  const r = Math.min(5, Math.max(3, (k.head[1] - k.head[0]) / 2))
  for (let i = 0; i < 3; i++) {
    const a = g.t * 0.6 + (i * Math.PI * 2) / 3
    const x = Math.round(cx + r * Math.cos(a))
    const y = Math.round(cy + 1.4 * Math.sin(a))
    if (i === 2) {
      paint(k.buf, x, y, pxWhite)
      continue
    }
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) paint(k.buf, x + dx, y + dy, i ? pxText : pxGold)
  }
}

// Eyes open wide (white above and below each pupil) and a "!" over the head.
function horror(k) {
  const { y, lx, rx, w } = k.eyes
  for (const x0 of [lx, rx - w + 1]) {
    for (let x = x0; x < x0 + w; x++) {
      paint(k.buf, x, y - 1, pxWhite)
      paint(k.buf, x, y + 1, pxWhite)
    }
  }
  const x = Math.min(15, k.head[1] + 1)
  const top = k.top - 1
  paint(k.buf, x, top - 3, pxWarn)
  paint(k.buf, x, top - 2, pxWarn)
  paint(k.buf, x, top, pxWarn)
}

// Wraps a step's chunk stream so fn runs once, on the first chunk.
function onFirst(src, fn) {
  const it = typeof src.next === 'function' ? src : src[Symbol.asyncIterator]()
  let fired = false
  return {
    [Symbol.asyncIterator]() {
      return this
    },
    async next(v) {
      const r = await it.next(v)
      if (!fired && !r.done) {
        fired = true
        fn()
      }
      return r
    },
    return(v) {
      return typeof it.return === 'function' ? it.return(v) : Promise.resolve({ done: true, value: v })
    },
    throw(err) {
      return typeof it.throw === 'function' ? it.throw(err) : Promise.reject(err)
    },
  }
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

// Returns { reply } (the parsed reply, {} for close) on 200, else { error }. Never throws.
async function postSession($, op) {
  const nonce = sessionNonce()
  try {
    const signed = await signPayload($, nonce, (pubkey, ts) => sessionCanonical(pubkey, ts, nonce, op))
    if (!signed) return { error: 'no SSH key: run /omn-adopt or /omn key <path>' }
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
    if (res.status === 401) return { error: 'signature rejected' }
    if (await handleStatus($, res)) return { error: 'omn ' + res.status }
    if (!res.ok) throw new Error('omn ' + res.status)
    if (op === 'close') return { reply: {} }
    // The signed key decides the pet. A reply id that differs is the key's real pet.
    const id = sessionPetId(res.text, petId)
    if (id) await rememberPet($, id)
    if (op === 'open') await openReply($, res.text)
    return { reply: replyOf(res.text) }
  } catch (err) {
    const why = err && err.message ? err.message : 'sign'
    if (op === 'open') $.ui.log('omn stay-awake skipped: ' + why)
    return { error: why }
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
  workLeft = 0
  clearGags()
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
  const found = await firstKeyOf(await sshIdentityFiles($, home), has)
  if (found) return found
  return firstKeyOf(fallbackKeys.map((name) => home + '/.ssh/' + name), has)
}

// The IdentityFile paths `ssh omn.sh` would try, from `ssh -G omn.sh`. [] when ssh fails.
async function sshIdentityFiles($, home) {
  try {
    const run = await $.process.run(['ssh', '-G', 'omn.sh'])
    if (run && run.exitCode === 0) return identityFilesOf(run.stdout, home)
  } catch (err) {}
  return []
}

function replyOf(text) {
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? v : {}
  } catch (err) {
    return {}
  }
}

// Makes path the plugin's key, the same as /omn key. The old key's pet must not
// stay on screen: the reply of the next open brings this key's pet.
async function useKey($, path) {
  keyPath = path
  await $.store.set('sshKey', path)
  warned = false
  petId = ''
  portrait = null
  await $.store.set('petId', '')
}

const ownKeyName = 'omn_ed25519'

// The key omn makes for a user with no SSH key. The host gives plugins no data
// folder ($.plugin.root is replaced on update), so it lives in ~/.config/omn,
// where signing already writes. Nothing is ever written under ~/.ssh.
// An omn key already there is used again, never overwritten.
async function ownKey($) {
  const home = await $.env.get('HOME')
  if (!home) throw new Error('no HOME for ~/.config/omn')
  const dir = home + '/.config/omn'
  const path = dir + '/' + ownKeyName
  let made = false
  if (!(await exists($, path))) {
    await $.process.run(['mkdir', '-p', dir])
    const run = await $.process.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'omn', '-f', path])
    if (run.exitCode !== 0) throw new Error('ssh-keygen -t ed25519 failed: ' + String(run.stderr || '').trim())
    made = true
  }
  await $.process.run(['chmod', '600', path])
  return { path, made }
}

// /omn-adopt: the signed open session start sends, so the server adopts a pet
// for a key with none and answers the pet a key already has. With no SSH key it
// first makes omn's own. The hatch scene comes from openReply, as on start.
async function adoptCommand($) {
  let own = null
  if (!(await resolveKey($))) {
    try {
      own = await ownKey($)
    } catch (err) {
      return { text: 'omn: ' + (err && err.message ? err.message : 'ssh-keygen failed') }
    }
    await useKey($, own.path)
  }
  const done = await postSession($, 'open')
  if (!done.reply) return { text: 'omn: ' + done.error }
  $.ui.invalidate('ui.render')
  const id = petIdOf(done.reply.id) || petId
  const name = cleanLabel(done.reply.name, 32) || id
  const tag = name === id ? id : name + ' (' + id + ')'
  const key = own ? '. key ' + own.path + (own.made ? ' (new)' : '') + ': /omn ssh shows how to reach it over SSH' : ''
  if (done.reply.hatched === true) return { text: 'omn hatched ' + tag + key }
  return { text: 'omn ' + tag + ' is already yours' + key }
}

// /omn ssh: the command that reaches the pet this plugin signs for.
async function sshCommand($) {
  const key = await resolveKey($)
  if (!key) return { text: 'omn: no key yet. run /omn-adopt' }
  const home = await $.env.get('HOME')
  return { text: sshHelpOf(keyPair(key).priv, await sshIdentityFiles($, home)) }
}

// `ssh omn.sh` when ssh already tries key for omn.sh, else `ssh -i`. The server
// takes the first key ssh offers, and ssh offers agent keys before an -i key,
// so -i needs IdentitiesOnly. The config snippet is for the user to add: the
// plugin never edits ~/.ssh/config.
export function sshHelpOf(key, used) {
  if ((used || []).some((p) => keyPair(p).priv === key)) return 'ssh omn.sh'
  const conf = /\s/.test(key) ? '"' + key + '"' : key
  return [
    'ssh -i ' + shellWord(key) + ' -o IdentitiesOnly=yes omn.sh',
    '',
    'optional, so plain `ssh omn.sh` reaches this pet: add to ~/.ssh/config yourself',
    'Host omn.sh',
    '  IdentityFile ' + conf,
    '  IdentitiesOnly yes',
  ].join('\n')
}

function shellWord(s) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'"
}
