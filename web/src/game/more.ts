import { drawShape, drawText, dist, type Ctx, type GameFactory } from './engine'
import { sound } from '../audio'

/* Tachistoscope (sequence recall) and Catch the Falling Items. */

// ------------------------------------------------------------ tachistoscope

/** A short letter string is flashed, then those letters appear among lures.
 *  The patient clicks them back in the order they were shown, so the task is
 *  brief-exposure recognition plus ordered recall - under pursuit when the
 *  letters drift, or saccades when they simply appear. */
function makeTachistoscope(opts: { brief: string; motion: 'drift' | 'jump' }): GameFactory {
  return () => {
    let sequence: string[] = []
    let word = ''
    let items: Array<{ x: number; y: number; vx: number; vy: number; letter: string; taken: boolean }> = []
    let index = 0
    let phase: 'flash' | 'respond' = 'flash'
    let phaseStart = 0
    let lastJump = 0

    const newRound = (ctx: Ctx) => {
      // A three-letter nursery word, so the child spells something familiar
      // rather than recalling an arbitrary letter string.
      const words = ctx.stimuli.words?.length ? ctx.stimuli.words : ['CAT', 'DOG', 'SUN']
      word = words[Math.floor(ctx.rnd() * words.length)]
      sequence = word.split('')

      // Lures are letters absent from the word, so a wrong click is a genuine
      // discrimination error rather than an ordering slip.
      const alphabet = 'ABCDEFGHIJKLMNOPRSTUVWXYZ'.split('')
      const spare = alphabet.filter((l) => !sequence.includes(l))
      const lures = Array.from(
        { length: Math.max(0, ctx.params.distractors ?? 2) },
        () => spare[Math.floor(ctx.rnd() * spare.length)],
      )

      const speed = opts.motion === 'drift' ? Math.max(30, ctx.params.speed_pps ?? 60) : 0
      items = [...sequence, ...lures].map((letter) => {
        const heading = ctx.rnd() * Math.PI * 2
        return {
          x: ctx.w * 0.12 + ctx.rnd() * ctx.w * 0.76,
          y: ctx.h * 0.2 + ctx.rnd() * ctx.h * 0.65,
          vx: Math.cos(heading) * speed,
          vy: Math.sin(heading) * speed,
          letter,
          taken: false,
        }
      })
      index = 0
      phase = 'flash'
      phaseStart = ctx.t
      lastJump = ctx.t
      ctx.setPending(sequence.length)
    }

    return {
      brief: opts.brief,
      init: newRound,

      update: (ctx) => {
        // Exposure scales with the whole string, not a single glyph.
        const exposure = (ctx.params.exposure_ms ?? 300) * sequence.length
        if (phase === 'flash') {
          if (ctx.t - phaseStart > exposure) {
            phase = 'respond'
            phaseStart = ctx.t
          }
          return
        }

        if (opts.motion === 'jump') {
          // Letters teleport, so each relocation forces a fresh saccade rather
          // than a smooth pursuit.
          if (ctx.t - lastJump > (ctx.params.spawn_ms ?? 1200)) {
            lastJump = ctx.t
            for (const item of items) {
              if (item.taken) continue
              item.x = ctx.w * 0.1 + ctx.rnd() * ctx.w * 0.8
              item.y = ctx.h * 0.2 + ctx.rnd() * ctx.h * 0.65
            }
          }
        } else {
          for (const item of items) {
            if (item.taken) continue
            item.x += item.vx * ctx.dt
            item.y += item.vy * ctx.dt
            const m = ctx.size
            if (item.x < m || item.x > ctx.w - m) item.vx *= -1
            if (item.y < m || item.y > ctx.h - m) item.vy *= -1
          }
        }

        ctx.setPending(sequence.length - index)
        const window = (ctx.params.window_ms ?? 3500) * sequence.length
        if (index >= sequence.length || ctx.t - phaseStart > window) {
          if (index < sequence.length) ctx.record('timeout', { target: sequence[index] })
          newRound(ctx)
        }
      },

      draw: (g, ctx) => {
        if (phase === 'flash') {
          drawText(g, ctx.w / 2, ctx.h * 0.28, ctx.size * 0.6, 'Remember the word', ctx.fusion)
          // The string is the stimulus: shown once, then withdrawn.
          const spacing = ctx.size * 1.1
          sequence.forEach((letter, i) => {
            const x = ctx.w / 2 + (i - (sequence.length - 1) / 2) * spacing
            drawText(g, x, ctx.h * 0.5, ctx.size, letter, ctx.target)
          })
          return
        }

        // Progress so far, so the patient can see how far through they are.
        const spacing = ctx.size * 0.8
        sequence.forEach((letter, i) => {
          const x = ctx.w / 2 + (i - (sequence.length - 1) / 2) * spacing
          drawText(g, x, ctx.size * 0.9, ctx.size * 0.7, i < index ? letter : '_', ctx.fusion)
        })

        for (const item of items) {
          if (item.taken) continue
          drawText(g, item.x, item.y, ctx.size, item.letter, ctx.target)
        }
      },

      pointer: (p, ctx) => {
        if (p.type !== 'down' || phase !== 'respond') return
        const radius = ctx.params.hit_radius_px ?? ctx.size * 1.6
        for (const item of items) {
          if (item.taken) continue
          if (dist(p.x, p.y, item.x, item.y) > radius) continue
          const expected = sequence[index]
          if (item.letter === expected) {
            item.taken = true
            index += 1
            ctx.record('hit', { rt_ms: ctx.t - phaseStart, target: expected, response: item.letter })
          } else {
            ctx.record('false_alarm', { target: expected, response: item.letter })
          }
          return
        }
      },
    }
  }
}

export const floatingLettersTachistoscope = makeTachistoscope({
  brief: 'Remember the letters shown, then click the floating letters in the same sequence.',
  motion: 'drift',
})

export const jumpLettersTachistoscope = makeTachistoscope({
  brief: 'Remember the letters shown, then click the jumping letters in the same sequence.',
  motion: 'jump',
})

/** Same recall mechanic, but the word is shown rather than flashed, so the
 *  load is on tracking and ordering instead of brief-exposure recognition. */
export const commonWordSequence = makeTachistoscope({
  brief: 'Remember the word sequence shown, then click the floating letters in the same sequence.',
  motion: 'drift',
})

// -------------------------------------------------- Catch the Falling Items

/** A basket tracks the mouse along the floor; objects fall from above and must
 *  be caught. The falling object is drawn from a mixed set - its identity does
 *  not matter, only that it is caught, so the task stays pure vertical pursuit
 *  and interception. */
export const catchTheFallingItems: GameFactory = () => {
  const SHAPES = ['circle', 'star', 'diamond', 'triangle', 'square', 'cross']
  let basketX = 0
  let items: Array<{ x: number; y: number; vy: number; shape: string; born: number }> = []
  let sinceSpawn = 0
  let sparkles: Array<{ x: number; y: number; born: number }> = []

  const spawn = (ctx: Ctx) => {
    items.push({
      x: ctx.w * 0.08 + ctx.rnd() * ctx.w * 0.84,
      y: -ctx.size,
      vy: Math.max(60, ctx.params.speed_pps ?? 110),
      shape: SHAPES[Math.floor(ctx.rnd() * SHAPES.length)],
      born: ctx.t,
    })
  }

  return {
    brief:
      'Collect the falling items in the basket by moving the mouse to the correct position to catch them.',

    init: (ctx) => {
      basketX = ctx.w / 2
      items = []
      sparkles = []
      sinceSpawn = 0
      spawn(ctx)
    },

    update: (ctx) => {
      const floorY = ctx.h - ctx.size * 1.6
      sinceSpawn += ctx.dt * 1000
      if (sinceSpawn > (ctx.params.spawn_ms ?? 1000)) {
        sinceSpawn = 0
        spawn(ctx)
      }

      for (const item of items) item.y += item.vy * ctx.dt

      const reach = ctx.size * 1.1
      const caught: typeof items = []
      const dropped: typeof items = []
      for (const item of items) {
        if (item.y < floorY) continue
        if (Math.abs(item.x - basketX) < reach) caught.push(item)
        else if (item.y > ctx.h + ctx.size) dropped.push(item)
      }
      for (const item of caught) {
        sound.play('catch')
        ctx.record('hit', { rt_ms: ctx.t - item.born, target: 'item', response: item.shape })
        sparkles.push({ x: item.x, y: item.y, born: ctx.t })
      }
      for (const _ of dropped) ctx.record('miss', { target: 'item', response: 'dropped' })

      items = items.filter((i) => !caught.includes(i) && !dropped.includes(i))
      sparkles = sparkles.filter((s) => ctx.t - s.born < 420)
      ctx.setPending(items.length)
    },

    draw: (g, ctx) => {
      const floorY = ctx.h - ctx.size * 1.6

      for (const item of items) {
        drawShape(g, item.x, item.y, ctx.size, item.shape, ctx.target)
      }

      // Catch feedback.
      for (const sparkle of sparkles) {
        const life = (ctx.t - sparkle.born) / 420
        g.save()
        g.globalAlpha = Math.max(0, 1 - life)
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2
          const r = ctx.size * (0.5 + life * 1.4)
          drawShape(
            g,
            sparkle.x + Math.cos(angle) * r,
            sparkle.y + Math.sin(angle) * r,
            ctx.size * 0.32,
            'star',
            ctx.target,
          )
        }
        g.restore()
      }

      // Basket: the patient's own hand, so it goes in the fellow eye's channel.
      // Target in one eye, hand in the other, forces both eyes to stay in play.
      g.strokeStyle = ctx.suppressed
      g.lineWidth = Math.max(3, ctx.size / 7)
      g.beginPath()
      g.moveTo(basketX - ctx.size * 1.1, floorY)
      g.lineTo(basketX - ctx.size * 0.85, floorY + ctx.size * 1.2)
      g.lineTo(basketX + ctx.size * 0.85, floorY + ctx.size * 1.2)
      g.lineTo(basketX + ctx.size * 1.1, floorY)
      g.closePath()
      g.stroke()
      for (let i = -1; i <= 1; i++) {
        g.beginPath()
        g.moveTo(basketX + i * ctx.size * 0.5, floorY + ctx.size * 0.15)
        g.lineTo(basketX + i * ctx.size * 0.42, floorY + ctx.size * 1.1)
        g.stroke()
      }
    },

    pointer: (p, ctx) => {
      // The basket follows the mouse, as specified - no click required.
      basketX = Math.max(ctx.size, Math.min(ctx.w - ctx.size, p.x))
    },
  }
}

// ------------------------------------------------------------ Number Names

// Digits and number words are not Sloan glyphs, so these fall back to the UI
// face by design - only optotypes should claim chart geometry.
const NUMBER_NAMES = [
  'zero', 'one', 'two', 'three', 'four',
  'five', 'six', 'seven', 'eight', 'nine',
]

/** Digits are shown, then their written names float around. The child clicks
 *  the names in the order the digits appeared, so the task pairs numeral-to-word
 *  mapping with ordered recall. */
export const numberNames: GameFactory = () => {
  let digits: number[] = []
  let items: Array<{ x: number; y: number; vx: number; vy: number; name: string; taken: boolean }> = []
  let index = 0
  let phase: 'show' | 'respond' = 'show'
  let phaseStart = 0

  const newRound = (ctx: Ctx) => {
    const span = Math.max(2, Math.min(4, ctx.params.span ?? 3))
    digits = Array.from({ length: span }, () => Math.floor(ctx.rnd() * 10))

    const spare = NUMBER_NAMES.filter((n) => !digits.map((d) => NUMBER_NAMES[d]).includes(n))
    const lures = Array.from(
      { length: Math.max(0, Math.min(3, ctx.params.distractors ?? 2)) },
      () => spare[Math.floor(ctx.rnd() * spare.length)],
    )

    const speed = Math.max(25, (ctx.params.speed_pps ?? 55) * 0.6)
    items = [...digits.map((d) => NUMBER_NAMES[d]), ...lures].map((name) => {
      const heading = ctx.rnd() * Math.PI * 2
      return {
        x: ctx.w * 0.15 + ctx.rnd() * ctx.w * 0.7,
        y: ctx.h * 0.25 + ctx.rnd() * ctx.h * 0.6,
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        name,
        taken: false,
      }
    })
    index = 0
    phase = 'show'
    phaseStart = ctx.t
    ctx.setPending(digits.length)
  }

  return {
    brief: 'Remember the number shown, then click the number names in the same sequence.',

    init: newRound,

    update: (ctx) => {
      if (phase === 'show') {
        if (ctx.t - phaseStart > (ctx.params.window_ms ?? 2600)) {
          phase = 'respond'
          phaseStart = ctx.t
        }
        return
      }
      for (const item of items) {
        if (item.taken) continue
        item.x += item.vx * ctx.dt
        item.y += item.vy * ctx.dt
        const m = ctx.size * 2
        if (item.x < m || item.x > ctx.w - m) item.vx *= -1
        if (item.y < ctx.size || item.y > ctx.h - ctx.size) item.vy *= -1
      }
      ctx.setPending(digits.length - index)
      if (index >= digits.length || ctx.t - phaseStart > (ctx.params.window_ms ?? 4000) * digits.length) {
        if (index < digits.length) ctx.record('timeout', { target: NUMBER_NAMES[digits[index]] })
        newRound(ctx)
      }
    },

    draw: (g, ctx) => {
      if (phase === 'show') {
        drawText(g, ctx.w / 2, ctx.h * 0.3, ctx.size * 0.6, 'Remember the number', ctx.fusion)
        const spacing = ctx.size * 1.3
        digits.forEach((d, i) => {
          const x = ctx.w / 2 + (i - (digits.length - 1) / 2) * spacing
          drawText(g, x, ctx.h * 0.52, ctx.size * 1.2, String(d), ctx.target)
        })
        return
      }

      const spacing = ctx.size * 1.1
      digits.forEach((d, i) => {
        const x = ctx.w / 2 + (i - (digits.length - 1) / 2) * spacing
        drawText(g, x, ctx.size, ctx.size * 0.8, i < index ? String(d) : '_', ctx.fusion)
      })

      for (const item of items) {
        if (item.taken) continue
        drawText(g, item.x, item.y, ctx.size * 0.75, item.name, ctx.target)
      }
    },

    pointer: (p, ctx) => {
      if (p.type !== 'down' || phase !== 'respond') return
      const radius = Math.max(ctx.size * 1.8, ctx.params.hit_radius_px ?? ctx.size * 2)
      for (const item of items) {
        if (item.taken) continue
        if (dist(p.x, p.y, item.x, item.y) > radius) continue
        const expected = NUMBER_NAMES[digits[index]]
        if (item.name === expected) {
          item.taken = true
          index += 1
          ctx.record('hit', { rt_ms: ctx.t - phaseStart, target: expected, response: item.name })
        } else {
          ctx.record('false_alarm', { target: expected, response: item.name })
        }
        return
      }
    },
  }
}
