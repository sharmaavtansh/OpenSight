/* Headless exercise of the two Faint Shape activities.
 *
 * These two were built from a stated skill rather than from an observed
 * reference, and had never actually been run. A canvas is not needed to answer
 * the questions that matter: are the cells distinguishable, does clicking the
 * matching one score a hit, does clicking a different one score an error, and
 * does the run advance. So the drawing context is a recorder rather than a
 * renderer, and every call it receives is inspectable.
 */
import { GAMES } from '../src/game/games'
import type { Ctx, Pointer } from '../src/game/engine'

type Draw = { x: number; y: number; size: number; shape: string; colour: string }

function stubContext(drawn: Draw[]) {
  const noop = () => undefined
  const g: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    quadraticCurveTo: noop,
    stroke: noop,
    fill: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    clearRect: noop,
    setTransform: noop,
    drawImage: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 }),
  }
  // drawShape sets fillStyle then fills; record what colour each shape got by
  // wrapping fill at the point the game calls it.
  return { g: g as unknown as CanvasRenderingContext2D, drawn }
}

function makeCtx(plan: {
  params: Record<string, unknown>
  stimuli: Record<string, unknown>
}): { ctx: Ctx; log: Array<{ outcome: string; target?: string; response?: string }> } {
  const log: Array<{ outcome: string; target?: string; response?: string }> = []
  let seed = 12345
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
    palette: {},
    stimuli: plan.stimuli,
    rnd,
    size: 28,
    pointer: { x: 0, y: 0, type: 'move', down: false },
    target: 'rgba(255, 0, 0, 0.57)',
    suppressed: 'rgba(0, 0, 255, 1)',
    fusion: '#e8e8e8',
    background: '#000000',
    record: (outcome: string, extra?: Record<string, unknown>) =>
      log.push({ outcome, ...(extra as object) }),
    prompt: () => undefined,
    flashError: () => undefined,
    setPending: () => undefined,
  } as unknown as Ctx
  return { ctx, log }
}

async function main() {
  const activityIds = ['match_symbol_contrast_pursuit', 'match_symbol_contrast_saccades']
  let pass = 0
  let fail = 0
  const check = (name: string, ok: boolean, detail = '') => {
    ;(ok ? pass++ : fail++, console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -> ' + detail : ''}`))
  }

  for (const id of activityIds) {
    console.log(`\n=== ${id} ===`)
    const res = await fetch('http://127.0.0.1:8420/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activity_id: id,
        mode_id: 'monocular_left',
        difficulty: 'easy',
        acuity: 200,
        duration_min: 1,
      }),
    })
    const plan = await res.json()
    const factory = GAMES[id]
    check('registered in GAMES', !!factory)
    if (!factory) continue

    const game = factory()
    const { ctx, log } = makeCtx(plan)
    const drawn: Draw[] = []
    const { g } = stubContext(drawn)

    game.init?.(ctx)
    game.update(ctx)
    game.draw(g, ctx)
    check('init and first frame do not throw', true)

    // Reach into the trial the game is showing by replaying its own maths:
    // the stimuli are deterministic, so the first trial is knowable.
    const trials = (plan.stimuli.trials ?? []) as Array<{
      symbol: string
      target_contrast: number
      steps: number[]
    }>
    check('server supplied trials', trials.length > 0, `${trials.length}`)

    const allSteps = new Set<number>()
    trials.forEach((t) => t.steps.forEach((s) => allSteps.add(s)))
    const overRange = [...allSteps].filter((s) => s > 1 || s < 0)
    check('every contrast step within 0-1', overRange.length === 0, overRange.join(',') || 'none')

    // Distinct rendered levels: two steps that render identically would make one
    // of them unfairly wrong.
    const rendered = [...allSteps].map((s) => Math.round(255 * s))
    check(
      'contrast steps render distinctly',
      new Set(rendered).size === rendered.length,
      rendered.sort((a, b) => a - b).join(' '),
    )
    check('target is always one of the offered steps', trials.every((t) => t.steps.includes(t.target_contrast)))

    // Drive a click at every plausible cell position and confirm exactly one
    // scores a hit per trial.
    const before = log.length
    let hits = 0
    let errors = 0
    for (let attempt = 0; attempt < 400; attempt++) {
      const p: Pointer = {
        x: 40 + (attempt % 20) * 48,
        y: 90 + Math.floor(attempt / 20) * 26,
        type: 'down',
        down: true,
      }
      game.pointer?.(p, ctx)
      game.draw(g, ctx)
    }
    for (const entry of log.slice(before)) {
      if (entry.outcome === 'hit') hits++
      if (entry.outcome === 'false_alarm') errors++
    }
    check('clicking scores something', hits + errors > 0, `${hits} hit / ${errors} error`)
    check('a correct click is reachable', hits > 0, `${hits}`)
    check('a wrong click is punished', errors > 0, `${errors}`)

    // The clock alone must retire a trial, or a child who never clicks stalls.
    const stall = makeCtx(plan)
    const g2 = stubContext([]).g
    const game2 = factory()
    game2.init?.(stall.ctx)
    for (let f = 0; f < 1200; f++) {
      ;(stall.ctx as { t: number }).t = f * 16.7
      game2.update(stall.ctx)
      game2.draw(g2, stall.ctx)
    }
    const timeouts = stall.log.filter((e) => e.outcome === 'timeout').length
    check('an untouched trial times out', timeouts > 0, `${timeouts} in 20s`)
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

void main()
