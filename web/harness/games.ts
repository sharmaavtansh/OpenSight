/* Every activity, driven headlessly.
 *
 * Two questions are asked of all twenty:
 *
 *  1. Does it survive being played? Init, several hundred frames, and clicks
 *     and keys all over the viewport, without throwing and without emitting a
 *     NaN coordinate - a NaN reaches the canvas as a silently missing shape,
 *     which is the worst kind of bug here because the child just sees nothing.
 *
 *  2. Does it obey the palette? Every activity is rendered twice with two
 *     completely different palettes, and the colours it emits are compared. A
 *     colour that survives the swap unchanged is hardcoded, which means it
 *     reaches BOTH eyes - and an activity whose target is visible to the
 *     fellow eye is not doing MFBF at all, it is just a game.
 */
const noopNode = () => undefined
;(globalThis as Record<string, unknown>).window = {
  AudioContext: class {
    state = 'running'
    destination = {}
    currentTime = 0
    resume = async () => undefined
    createOscillator = () => ({
      type: '',
      frequency: { setValueAtTime: noopNode, exponentialRampToValueAtTime: noopNode },
      connect: noopNode,
      start: noopNode,
      stop: noopNode,
    })
    createGain = () => ({
      gain: {
        value: 0,
        setValueAtTime: noopNode,
        linearRampToValueAtTime: noopNode,
        exponentialRampToValueAtTime: noopNode,
      },
      connect: noopNode,
    })
  },
}

import { GAMES } from '../src/game/games'
import type { Ctx, Pointer } from '../src/game/engine'

const API = 'http://127.0.0.1:8455'

let pass = 0
let fail = 0
const failures: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) pass++
  else {
    fail++
    failures.push(`${name}${detail ? ' -> ' + detail : ''}`)
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -> ' + detail : ''}`)
}

type Rec = { colours: string[]; nan: number; calls: number }

function makeGradient() {
  const stops: string[] = []
  return {
    addColorStop: (_offset: number, colour: string) => {
      stops.push(colour)
    },
    toString: () => `gradient(${stops.join('|')})`,
  }
}

function recorder(): { g: CanvasRenderingContext2D; rec: Rec } {
  const rec: Rec = { colours: [], nan: 0, calls: 0 }
  const num = (v: unknown) => {
    if (typeof v === 'number' && !Number.isFinite(v)) rec.nan++
  }
  const store = { fillStyle: '', strokeStyle: '' }
  const track = (...args: unknown[]) => {
    rec.calls++
    args.forEach(num)
  }
  const paint = (...args: unknown[]) => {
    track(...args)
    rec.colours.push(String(store.fillStyle), String(store.strokeStyle))
  }
  const g: Record<string, unknown> = {
    get fillStyle() {
      return store.fillStyle
    },
    set fillStyle(v: string) {
      store.fillStyle = v
    },
    get strokeStyle() {
      return store.strokeStyle
    },
    set strokeStyle(v: string) {
      store.strokeStyle = v
    },
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    save: noopNode,
    restore: noopNode,
    beginPath: noopNode,
    closePath: noopNode,
    moveTo: track,
    lineTo: track,
    arc: track,
    ellipse: track,
    rect: track,
    roundRect: track,
    quadraticCurveTo: track,
    bezierCurveTo: track,
    translate: track,
    rotate: track,
    scale: track,
    clearRect: track,
    setTransform: noopNode,
    // A gradient must carry its stops into the comparison. Stringifying every
    // gradient to "[object Object]" would hide a hardcoded colour inside one,
    // which is exactly where a leak to the fellow eye could hide.
    createLinearGradient: () => makeGradient(),
    createRadialGradient: () => makeGradient(),
    createPattern: () => null,
    setLineDash: noopNode,
    getLineDash: () => [],
    clip: noopNode,
    isPointInPath: () => false,
    arcTo: track,
    rotate3d: noopNode,
    measureText: () => ({ width: 10 }),
    fill: paint,
    stroke: paint,
    fillRect: paint,
    strokeRect: paint,
    fillText: paint,
    strokeText: paint,
    drawImage: track,
  }
  return { g: g as unknown as CanvasRenderingContext2D, rec }
}

const PALETTE_A = {
  target: 'rgba(255, 0, 0, 0.57)',
  suppressed: 'rgba(0, 0, 255, 1)',
  fusion: '#e8e8e8',
  background: '#000000',
}
const PALETTE_B = {
  target: 'rgba(0, 255, 0, 0.31)',
  suppressed: 'rgba(255, 0, 255, 0.77)',
  fusion: '#3a3a3a',
  background: '#111111',
}

function makeCtx(plan: Record<string, unknown>, palette: typeof PALETTE_A) {
  const log: Array<{ outcome: string }> = []
  let seed = 4242
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const ctx = {
    w: 1000,
    h: 640,
    t: 0,
    dt: 1 / 60,
    params: plan.params,
    palette: plan.palette,
    stimuli: plan.stimuli,
    rnd,
    size: 28,
    pointer: { x: 0, y: 0, type: 'move', down: false },
    ...palette,
    record: (outcome: string) => log.push({ outcome }),
    prompt: () => undefined,
    flashError: () => undefined,
    setPending: () => undefined,
  } as unknown as Ctx
  return { ctx, log }
}

/** Play one activity for a while.
 *
 *  Random clicking is not enough: a match-3 board needs a coherent drag, a
 *  tracing path needs a stroke that follows it, and a recall game needs
 *  clicks that land on letters rather than on empty space. So the driver
 *  sweeps the viewport densely AND performs real drags, which between them
 *  reach the input every activity actually listens for.
 */
function play(id: string, plan: Record<string, unknown>, palette: typeof PALETTE_A) {
  const game = GAMES[id]()
  const { ctx, log } = makeCtx(plan, palette)
  const { g, rec } = recorder()
  game.init?.(ctx)

  const at = (x: number, y: number, type: Pointer['type'], isDown: boolean): Pointer => {
    const p: Pointer = { x, y, type, down: isDown }
    ;(ctx as { pointer: Pointer }).pointer = p
    return p
  }
  const frame = (f: number) => {
    ;(ctx as { t: number }).t = f * 16.7
    game.update(ctx)
    game.draw(g, ctx)
  }

  let f = 0
  // Phase 1: let it settle, so anything spawned on a timer exists.
  for (; f < 60; f++) frame(f)

  // Phase 2: a dense sweep of taps across the whole viewport. Every activity
  // that scores on a click gets many chances to be hit.
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 18; col++) {
      const x = 30 + col * 54
      const y = 40 + row * 50
      game.pointer?.(at(x, y, 'down', true), ctx)
      game.pointer?.(at(x, y, 'up', false), ctx)
      frame(f++)
    }
  }

  // Phase 3: real drags - short swaps for a match-3 board, long strokes for
  // tracing. Both are pointer sequences, not single clicks.
  const drag = (x0: number, y0: number, x1: number, y1: number, steps: number) => {
    game.pointer?.(at(x0, y0, 'down', true), ctx)
    for (let i = 1; i <= steps; i++) {
      game.pointer?.(at(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, 'move', true), ctx)
      if (i % 4 === 0) frame(f++)
    }
    game.pointer?.(at(x1, y1, 'up', false), ctx)
    frame(f++)
  }
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = 120 + col * 70
      const y = 100 + row * 55
      drag(x, y, x + 70, y, 6)
      drag(x, y, x, y + 55, 6)
    }
  }
  // A long sweeping stroke, for anything that wants a traced line.
  drag(80, 500, 900, 120, 120)
  drag(500, 80, 500, 600, 90)

  // Phase 4: keys, for the activities driven by the keyboard.
  const keys = [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
  for (let i = 0; i < 200; i++) {
    game.key?.({ key: keys[i % keys.length], preventDefault: noopNode } as KeyboardEvent, ctx)
    frame(f++)
  }

  // Phase 5: let the clock run, so anything scored on a timeout is reached.
  for (let i = 0; i < 900; i++) frame(f++)

  return { rec, log }
}

/** Prove the colour check can actually fail.
 *
 *  Twice now a test here has passed for the wrong reason, so the detector is
 *  itself tested: a deliberately hardcoded colour must be caught. If this
 *  reports "not detected", every clean result above is worthless.
 */
function selfTest(): void {
  const leaky = {
    brief: '',
    update: () => undefined,
    draw: (g: CanvasRenderingContext2D) => {
      g.fillStyle = '#ff00ff' // hardcoded: reaches both eyes
      g.fillRect(0, 0, 10, 10)
    },
  }
  const seen = [PALETTE_A, PALETTE_B].map((palette) => {
    const { ctx } = makeCtx({ params: {}, stimuli: {}, palette: {} }, palette)
    const { g, rec } = recorder()
    leaky.draw(g, ctx)
    return new Set(rec.colours.filter(Boolean))
  })
  const survivors = [...seen[0]].filter((c) => seen[1].has(c))
  check('the colour detector catches a hardcoded colour', survivors.includes('#ff00ff'),
    survivors.join(' ') || 'NOT DETECTED')
}

async function main() {
  selfTest()

  const res = await fetch(`${API}/api/catalog`)
  const cat = (await res.json()) as { activities: Array<{ id: string; title: string[] }> }
  const ids = cat.activities.map((a) => a.id)
  console.log(`=== ${ids.length} activities ===\n`)

  const registered = ids.filter((id) => typeof GAMES[id] === 'function')
  check('every catalogued activity has a game module', registered.length === ids.length,
    `${registered.length}/${ids.length}`)
  const orphans = Object.keys(GAMES).filter((k) => !ids.includes(k))
  check('no game module is orphaned', orphans.length === 0, orphans.join(',') || 'none')

  for (const id of ids) {
    const mode = id.startsWith('match_symbol') ? 'monocular_left' : 'mfbf_left'
    const planRes = await fetch(`${API}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activity_id: id, mode_id: mode, difficulty: 'easy', acuity: 200, duration_min: 1,
      }),
    })
    if (!planRes.ok) {
      check(`${id}: the server plans a session`, false, String(planRes.status))
      continue
    }
    const plan = (await planRes.json()) as Record<string, unknown>

    let a: ReturnType<typeof play>
    let b: ReturnType<typeof play>
    try {
      a = play(id, plan, PALETTE_A)
      b = play(id, plan, PALETTE_B)
    } catch (err) {
      check(`${id}: survives 600 frames`, false, String(err).slice(0, 120))
      continue
    }

    check(`${id}: survives 600 frames of play`, true, `${a.rec.calls} draw calls`)
    check(`${id}: emits no NaN coordinates`, a.rec.nan === 0, `${a.rec.nan} NaN`)
    check(`${id}: actually draws something`, a.rec.calls > 50, `${a.rec.calls}`)

    // Colour obedience. Ignore empty strings (never set) and the two
    // backgrounds, which are legitimately allowed to be equal only if the
    // palette says so - they differ here, so any survivor is hardcoded.
    const setA = new Set(a.rec.colours.filter((c) => c && c !== 'undefined'))
    const setB = new Set(b.rec.colours.filter((c) => c && c !== 'undefined'))
    const survivors = [...setA].filter((c) => setB.has(c))
    check(
      `${id}: every colour comes from the palette`,
      survivors.length === 0,
      survivors.length ? survivors.slice(0, 3).join(' ') : 'none hardcoded',
    )

    // Scoring must be reachable: an activity that can never record an outcome
    // produces an empty report and a session worth nothing.
    check(`${id}: scoring is reachable`, a.log.length > 0, `${a.log.length} outcomes`)
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (failures.length) {
    console.log('\n  Failures:')
    failures.forEach((f) => console.log(`   - ${f}`))
  }
  process.exit(fail ? 1 : 0)
}

void main()
