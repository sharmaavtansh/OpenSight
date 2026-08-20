import {
  atContrast,
  dist,
  drawText,
  drawShape,
  drawSlant,
  drawBarPattern,
  BAR_PATTERNS,
  drawSmiley,
  SMILEY_MOODS,
  type Ctx,
  type GameFactory,
} from './engine'
import { balloonPopPursuit, balloonPopSaccades } from './balloons'
import {
  catchTheFallingItems,
  commonWordSequence,
  floatingLettersTachistoscope,
  jumpLettersTachistoscope,
  numberNames,
} from './more'
import { dropTheBalls, iceJump, tracing } from './bespoke2'
import {
  alphabetRacer,
  candyCrushLetter,
  connectingLetters,
  jumpTheHoop,
  shootTheAsteroids,
} from './bespoke'

/* Rendering convention, and the reason the whole app exists:
 *   ctx.target     - only the treated eye sees it, so every response target
 *                    must be drawn in this colour
 *   ctx.fusion     - both eyes see it; distractors and scenery live here so
 *                    the binocular field stays intact
 *   ctx.suppressed - only the fellow eye sees it; used sparingly as an
 *                    anti-suppression cue
 * In monocular therapy all three collapse to the same value, so the games do
 * not need to branch. */

const EDGE = 0.10

function place(ctx: Ctx): { x: number; y: number } {
  return {
    x: ctx.w * EDGE + ctx.rnd() * ctx.w * (1 - 2 * EDGE),
    y: ctx.h * EDGE + ctx.rnd() * ctx.h * (1 - 2 * EDGE),
  }
}

function hitRadius(ctx: Ctx): number {
  return ctx.params.hit_radius_px ?? ctx.size * 1.6
}

/** Crowding: a dense array in which every item matching the reference must be
 *  found. The reference is shown first, then the board; the HUD counts down
 *  the targets still pending. Spacing comes from the acuity-linked crowding
 *  gap, which is what makes it a crowding task rather than a search task. */
function crowdingGame(opts: {
  brief: string
  prompt: string
  render: (
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    value: string | number,
    colour: string,
    ctx: Ctx,
  ) => void
  /** Reference value plus the pool the board is filled from. */
  pick: (ctx: Ctx) => { target: string | number; pool: Array<string | number> }
}): GameFactory {
  return () => {
    let cells: Array<{ x: number; y: number; value: string | number; found: boolean }> = []
    let target: string | number = ''
    let phase: 'reference' | 'board' = 'reference'
    let phaseStart = 0
    let born = 0

    const REFERENCE_MS = 1800

    const build = (ctx: Ctx) => {
      const picked = opts.pick(ctx)
      target = picked.target
      const gap = ctx.params.crowd_gap_px ?? ctx.size
      const step = ctx.size + gap
      const cols = Math.max(3, Math.floor((ctx.w * 0.94) / step))
      const rows = Math.max(3, Math.floor((ctx.h * 0.78) / step))
      const originX = ctx.w / 2 - ((cols - 1) * step) / 2
      const originY = ctx.h * 0.16 + ctx.size

      cells = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Roughly a third of the array are targets, so the task stays a
          // discrimination problem rather than a needle-in-a-haystack hunt.
          const isTarget = ctx.rnd() < 0.34
          const others = picked.pool.filter((v) => v !== target)
          cells.push({
            x: originX + c * step,
            y: originY + r * step,
            value: isTarget ? target : others[Math.floor(ctx.rnd() * others.length)] ?? target,
            found: false,
          })
        }
      }
      born = ctx.t
      phase = 'reference'
      phaseStart = ctx.t
      ctx.setPending(cells.filter((cell) => cell.value === target).length)
    }

    return {
      brief: opts.brief,
      init: build,

      update: (ctx) => {
        if (phase === 'reference' && ctx.t - phaseStart > REFERENCE_MS) {
          phase = 'board'
          born = ctx.t
          return
        }
        if (phase !== 'board') return
        const pending = cells.filter((cell) => cell.value === target && !cell.found).length
        ctx.setPending(pending)
        if (pending === 0) build(ctx)
      },

      draw: (g, ctx) => {
        if (phase === 'reference') {
          drawText(g, ctx.w / 2, ctx.h * 0.42, ctx.size * 0.8, opts.prompt, ctx.target)
          opts.render(g, ctx.w / 2, ctx.h * 0.56, target, ctx.target, ctx)
          return
        }

        // The reference symbol stays visible above a divider.
        opts.render(g, ctx.size * 1.6, ctx.size * 1.2, target, ctx.target, ctx)
        g.strokeStyle = ctx.target
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(0, ctx.size * 2.4)
        g.lineTo(ctx.w, ctx.size * 2.4)
        g.stroke()

        for (const cell of cells) {
          if (cell.found) continue
          opts.render(g, cell.x, cell.y, cell.value, ctx.target, ctx)
        }
      },

      pointer: (p, ctx) => {
        if (p.type !== 'down' || phase !== 'board') return
        const radius = Math.max(ctx.size * 0.6, (ctx.params.crowd_gap_px ?? ctx.size) * 0.55)
        for (const cell of cells) {
          if (cell.found) continue
          if (dist(p.x, p.y, cell.x, cell.y) < radius) {
            const correct = cell.value === target
            ctx.record(correct ? 'hit' : 'false_alarm', {
              rt_ms: ctx.t - born,
              target: String(target),
              response: String(cell.value),
              x: p.x,
              y: p.y,
            })
            if (correct) cell.found = true
            return
          }
        }
      },
    }
  }
}

// ------------------------------------------------------------- bespoke --

/** Contrast matching: pick the symbol rendered at the reference contrast. */
function contrastGame(opts: { brief: string; moving: boolean }): GameFactory {
  return () => {
    let trials: Array<{ symbol: string; target_contrast: number; steps: number[] }> = []
    let index = 0
    let born = 0
    let cells: Array<{ x: number; y: number; contrast: number; vx: number; vy: number }> = []

    const build = (ctx: Ctx) => {
      index = (index + 1) % Math.max(trials.length, 1)
      const trial = trials[index]
      const speed = opts.moving ? (ctx.params.speed_pps ?? 0) : 0
      const count = Math.max(2, (ctx.params.distractors ?? 3) + 1)
      const others = trial.steps.filter((s) => s !== trial.target_contrast)
      cells = []
      for (let i = 0; i < count; i++) {
        const heading = ctx.rnd() * Math.PI * 2
        cells.push({
          ...place(ctx),
          contrast: i === 0 ? trial.target_contrast : others[i % others.length] ?? 1,
          vx: Math.cos(heading) * speed,
          vy: Math.sin(heading) * speed,
        })
      }
      born = ctx.t
    }

    return {
      brief: opts.brief,
      init: (ctx) => {
        trials = (ctx.stimuli.trials ?? []) as typeof trials
        if (trials.length === 0) {
          trials = [{ symbol: 'circle', target_contrast: 0.35, steps: [0.2, 0.35, 0.6, 0.9] }]
        }
        index = -1
        build(ctx)
      },
      update: (ctx) => {
        for (const cell of cells) {
          cell.x += cell.vx * ctx.dt
          cell.y += cell.vy * ctx.dt
          const m = ctx.size
          if (cell.x < m || cell.x > ctx.w - m) cell.vx *= -1
          if (cell.y < m || cell.y > ctx.h - m) cell.vy *= -1
        }
        if (ctx.t - born > (ctx.params.window_ms ?? 6000)) {
          ctx.record('timeout')
          build(ctx)
        }
      },
      draw: (g, ctx) => {
        const trial = trials[index]
        // Reference swatch, top-centre, at the contrast to be matched.
        drawShape(
          g,
          ctx.w / 2,
          ctx.size * 1.4,
          ctx.size,
          trial.symbol,
          atContrast(ctx.target, ctx.background, trial.target_contrast),
        )
        g.strokeStyle = ctx.fusion
        g.lineWidth = 1
        g.strokeRect(ctx.w / 2 - ctx.size, ctx.size * 0.4, ctx.size * 2, ctx.size * 2)

        cells.forEach((cell) => {
          drawShape(
            g,
            cell.x,
            cell.y,
            ctx.size,
            trial.symbol,
            atContrast(ctx.target, ctx.background, cell.contrast),
          )
        })
      },
      pointer: (p, ctx) => {
        if (p.type !== 'down') return
        const trial = trials[index]
        for (const cell of cells) {
          if (dist(p.x, p.y, cell.x, cell.y) < hitRadius(ctx)) {
            const correct = Math.abs(cell.contrast - trial.target_contrast) < 1e-6
            ctx.record(correct ? 'hit' : 'false_alarm', {
              rt_ms: ctx.t - born,
              target: String(trial.target_contrast),
              response: String(cell.contrast),
            })
            build(ctx)
            return
          }
        }
      },
    }
  }
}

// -------------------------------------------------------------- registry --

export const GAMES: Record<string, GameFactory> = {
  // --- Others ---
  shoot_the_asteroids: shootTheAsteroids,

  crush_the_letters: candyCrushLetter,

  connect_the_letters: connectingLetters,

  hop_the_e: jumpTheHoop,

  alphabet_racer: alphabetRacer,

  drop_the_balls: dropTheBalls,

  ice_jump: iceJump,

  trace_magic: tracing,

  // --- Pursuits ---
  balloon_pop_pursuit: balloonPopPursuit,

  catch_the_falling_items: catchTheFallingItems,

  floating_letters_tachistoscope: floatingLettersTachistoscope,

  common_word_sequence: commonWordSequence,

  match_symbol_contrast_pursuit: contrastGame({
    brief: 'Match the moving symbol whose contrast equals the reference.',
    moving: true,
  }),

  // --- Saccades ---
  balloon_pop_saccades: balloonPopSaccades,

  jump_letters_tachistoscope: jumpLettersTachistoscope,

  number_text: numberNames,

  match_symbol_contrast_saccades: contrastGame({
    brief: 'Jump to the symbol whose contrast equals the reference.',
    moving: false,
  }),

  // --- Crowding ---
  smiley: crowdingGame({
    brief: 'Find every face that matches the one shown.',
    prompt: 'Find the matching Face',
    pick: (ctx) => {
      const moods = SMILEY_MOODS
      return { target: moods[Math.floor(ctx.rnd() * moods.length)], pool: moods }
    },
    render: (g, x, y, value, colour, ctx) => drawSmiley(g, x, y, ctx.size, String(value), colour),
  }),

  match_the_slant_lines: crowdingGame({
    brief: 'Find every line tilted the same way as the one shown.',
    prompt: 'Find the matching Slant',
    pick: (ctx) => {
      const angles = ctx.stimuli.angles?.length ? [...new Set(ctx.stimuli.angles)] : [-60, -30, 0, 30, 60, 90]
      return { target: angles[Math.floor(ctx.rnd() * angles.length)], pool: angles }
    },
    render: (g, x, y, value, colour, ctx) => drawSlant(g, x, y, ctx.size, Number(value), colour),
  }),

  pattern_matching: crowdingGame({
    brief: 'Find every bar pattern that matches the one shown.',
    prompt: 'Find the matching Pattern',
    pick: (ctx) => {
      // Patterns are referenced by index so equality stays a simple compare.
      const pool = BAR_PATTERNS.map((_, i) => i)
      return { target: pool[Math.floor(ctx.rnd() * pool.length)], pool }
    },
    render: (g, x, y, value, colour, ctx) =>
      drawBarPattern(g, x, y, ctx.size * 1.5, BAR_PATTERNS[Number(value)], colour),
  }),
}

export function getGame(activityId: string): GameFactory | null {
  return GAMES[activityId] ?? null
}
