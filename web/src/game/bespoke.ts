import {
  drawCar,
  drawE,
  drawLetter,
  drawText,
  dist,
  tint,
  type Ctx,
  type GameFactory,
} from './engine'
import { sound } from '../audio'

/* Activities whose mechanics are specific enough that the generic
 * present-target/click-target loop would misrepresent them. */

const SLOAN = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z']
const DIRS = ['right', 'down', 'left', 'up'] as const

// ------------------------------------------------- Jump the Hoop (hop_the_e)

/** Gravity-driven bounce game. The ball falls; space or click drives it up.
 *  Each gate carries a tumbling E, and the E's open side is the side the ball
 *  must pass on - so resolving the optotype *is* the therapeutic task.
 *  Spikes line the top and bottom of the lane. */
export const jumpTheHoop: GameFactory = () => {
  let ball = { x: 0, y: 0, vy: 0 }
  let gates: Array<{ x: number; gapY: number; dir: string; scored: boolean }> = []
  let gravity = 0
  let impulse = 0
  let speed = 0
  let spawnX = 0

  const gateGap = (ctx: Ctx) => ctx.size * 3.4

  const addGate = (ctx: Ctx, x: number) => {
    gates.push({
      x,
      gapY: ctx.h * 0.25 + ctx.rnd() * ctx.h * 0.5,
      dir: DIRS[Math.floor(ctx.rnd() * DIRS.length)],
      scored: false,
    })
  }

  return {
    brief:
      'Bounce the ball through the open side of the E. Press space or click to bounce upward. The ball falls under gravity, so time each bounce.',

    init: (ctx) => {
      ball = { x: ctx.w * 0.28, y: ctx.h / 2, vy: 0 }
      gravity = ctx.size * 26
      impulse = -ctx.size * 10
      speed = Math.max(90, ctx.params.speed_pps ?? 120)
      gates = []
      spawnX = ctx.w
      for (let i = 0; i < 3; i++) addGate(ctx, ctx.w + i * ctx.w * 0.55)
    },

    update: (ctx) => {
      ball.vy += gravity * ctx.dt
      ball.y += ball.vy * ctx.dt

      const spikeH = ctx.size * 0.6
      // Touching the spike bands is a miss and resets the ball to mid-lane.
      if (ball.y < spikeH || ball.y > ctx.h - spikeH) {
        ctx.record('miss', { target: 'spike' })
        ball.y = ctx.h / 2
        ball.vy = 0
      }

      for (const gate of gates) {
        gate.x -= speed * ctx.dt
        if (!gate.scored && gate.x < ball.x) {
          gate.scored = true
          const gap = gateGap(ctx)
          const through = Math.abs(ball.y - gate.gapY) < gap / 2
          if (through) {
            // Passing on the E's open side is the precise response.
            const openSide =
              gate.dir === 'up' ? ball.y < gate.gapY : gate.dir === 'down' ? ball.y > gate.gapY : true
            ctx.record('hit', { target: gate.dir, response: openSide ? 'open-side' : 'through' })
          } else {
            ctx.record('false_alarm', { target: gate.dir, response: 'collision' })
          }
        }
      }

      gates = gates.filter((g) => g.x > -ctx.size * 3)
      spawnX = gates.length ? Math.max(...gates.map((g) => g.x)) : 0
      if (spawnX < ctx.w) addGate(ctx, ctx.w + ctx.w * 0.25)
    },

    draw: (g, ctx) => {
      const spikeH = ctx.size * 0.6
      // Spike bands, drawn in the shared field so both eyes keep the frame.
      g.fillStyle = ctx.fusion
      const tooth = Math.max(12, ctx.size * 0.5)
      for (const top of [true, false]) {
        g.beginPath()
        for (let x = 0; x < ctx.w; x += tooth) {
          if (top) {
            g.moveTo(x, 0)
            g.lineTo(x + tooth / 2, spikeH)
            g.lineTo(x + tooth, 0)
          } else {
            g.moveTo(x, ctx.h)
            g.lineTo(x + tooth / 2, ctx.h - spikeH)
            g.lineTo(x + tooth, ctx.h)
          }
        }
        g.fill()
      }

      const gap = gateGap(ctx)
      for (const gate of gates) {
        // Pillar above and below the opening.
        g.fillStyle = ctx.fusion
        g.fillRect(gate.x, spikeH, ctx.size * 0.5, gate.gapY - gap / 2 - spikeH)
        g.fillRect(
          gate.x,
          gate.gapY + gap / 2,
          ctx.size * 0.5,
          ctx.h - spikeH - (gate.gapY + gap / 2),
        )
        // The optotype that tells the patient which side to take.
        drawE(g, gate.x + ctx.size * 0.25, gate.gapY, ctx.size, gate.dir, ctx.target)
      }

      // The ball is the patient's avatar: fellow eye's channel, so the gates
      // (treated eye) and the ball cannot both be seen with one eye alone.
      g.fillStyle = ctx.suppressed
      g.beginPath()
      g.arc(ball.x, ball.y, ctx.size * 0.35, 0, Math.PI * 2)
      g.fill()
    },

    pointer: (p) => {
      if (p.type === 'down') {
        ball.vy = impulse
        sound.play('bounce')
      }
    },

    key: (event) => {
      if (event.key === ' ' || event.key === 'ArrowUp') {
        ball.vy = impulse
        sound.play('bounce')
      }
    },
  }
}

// ------------------------------------- Aim and Shoot E Asteroids (asteroids)

/** Rocket shooter. Arrow keys fly the rocket, space or click fires. Only
 *  asteroids carrying an E are valid targets. */
export const shootTheAsteroids: GameFactory = () => {
  let rocket = { x: 0, y: 0 }
  let bullets: Array<{ x: number; y: number }> = []
  let rocks: Array<{
    x: number
    y: number
    vx: number
    vy: number
    letter: string
    spin: number
    born: number
    /** Set when shot: marks the asteroid for its feedback animation. */
    struck?: { correct: boolean; at: number }
  }> = []
  /** Short-lived hit feedback: a glow for a correct shot, a cross for a wrong
   *  one. The cross is what tells the patient the shot was an error, so it is
   *  drawn over the letter rather than replacing it. */
  let effects: Array<{ x: number; y: number; correct: boolean; born: number }> = []
  const held = new Set<string>()
  let sinceSpawn = 0
  const FEEDBACK_MS = 620
  // Constant, deliberately independent of acuity: the shot must travel at a
  // speed the child can learn to time against the drifting letters, and that
  // timing should not change when the optotype size does.
  const BULLET_SPEED_PPS = 900

  const spawn = (ctx: Ctx) => {
    const isTarget = ctx.rnd() < 0.45
    rocks.push({
      x: ctx.w * 0.1 + ctx.rnd() * ctx.w * 0.8,
      y: -ctx.size,
      vx: (ctx.rnd() - 0.5) * (ctx.params.speed_pps ?? 90) * 0.5,
      vy: (ctx.params.speed_pps ?? 90) * (0.4 + ctx.rnd() * 0.4),
      letter: isTarget ? 'E' : SLOAN[Math.floor(ctx.rnd() * SLOAN.length)],
      spin: ctx.rnd() * Math.PI * 2,
      born: ctx.t,
    })
  }

  const fire = (ctx: Ctx) => {
    bullets.push({ x: rocket.x, y: rocket.y - ctx.size * 0.6 })
    sound.play('fire')
  }

  return {
    brief:
      'Steer the rocket with the mouse or arrow keys. Press space or click to send a beam at the letter you are looking for.',

    init: (ctx) => {
      rocket = { x: ctx.w / 2, y: ctx.h * 0.82 }
      rocks = []
      bullets = []
      effects = []
      for (let i = 0; i < 3; i++) spawn(ctx)
    },

    update: (ctx) => {
      const nudge = Math.max(180, (ctx.params.speed_pps ?? 120) * 2.4) * ctx.dt
      if (held.has('ArrowLeft')) rocket.x -= nudge
      if (held.has('ArrowRight')) rocket.x += nudge
      if (held.has('ArrowUp')) rocket.y -= nudge
      if (held.has('ArrowDown')) rocket.y += nudge
      rocket.x = Math.max(ctx.size, Math.min(ctx.w - ctx.size, rocket.x))
      rocket.y = Math.max(ctx.h * 0.3, Math.min(ctx.h - ctx.size, rocket.y))

      for (const b of bullets) b.y -= BULLET_SPEED_PPS * ctx.dt
      bullets = bullets.filter((b) => b.y > -20)

      sinceSpawn += ctx.dt * 1000
      if (sinceSpawn > (ctx.params.spawn_ms ?? 1400)) {
        sinceSpawn = 0
        spawn(ctx)
      }

      for (const rock of rocks) {
        rock.x += rock.vx * ctx.dt
        rock.y += rock.vy * ctx.dt
        rock.spin += ctx.dt * 0.7
        if (rock.x < ctx.size || rock.x > ctx.w - ctx.size) rock.vx *= -1
      }

      // Bullet / asteroid resolution.
      for (const bullet of bullets) {
        for (const rock of rocks) {
          if (rock.struck) continue
          if (dist(bullet.x, bullet.y, rock.x, rock.y) < ctx.size * 1.7) {
            const correct = rock.letter === 'E'
            if (correct) {
              ctx.record('hit', { rt_ms: ctx.t - rock.born, target: 'E', response: 'E' })
            } else {
              ctx.record('false_alarm', { target: 'E', response: rock.letter })
            }
            rock.struck = { correct, at: ctx.t }
            effects.push({ x: rock.x, y: rock.y, correct, born: ctx.t })
            bullet.y = -999
          }
        }
      }
      bullets = bullets.filter((b) => b.y > -20)

      // A struck asteroid lingers just long enough to show its feedback.
      for (const rock of rocks) {
        if (rock.struck && ctx.t - rock.struck.at > FEEDBACK_MS) rock.y = ctx.h + 999
      }
      effects = effects.filter((e) => ctx.t - e.born < FEEDBACK_MS)

      // An E that escapes off the bottom is a miss.
      const escaped = rocks.filter((r) => r.y > ctx.h + ctx.size && r.y < ctx.h + 900)
      for (const rock of escaped) if (rock.letter === 'E' && !rock.struck) ctx.record('miss', { target: 'E' })
      rocks = rocks.filter((r) => r.y < ctx.h + ctx.size)
    },

    draw: (g, ctx) => {
      for (const rock of rocks) {
        g.save()
        g.translate(rock.x, rock.y)
        g.rotate(rock.spin)
        g.strokeStyle = ctx.target
        g.lineWidth = Math.max(2, ctx.size / 10)
        g.beginPath()
        const points = 7
        for (let i = 0; i < points; i++) {
          const angle = (i / points) * Math.PI * 2
          // Hull is 1.9x the optotype: big enough to aim at, while the letter
          // inside keeps its acuity-accurate size.
          const radius = ctx.size * (1.9 + ((i % 3) - 1) * 0.3)
          const px = Math.cos(angle) * radius
          const py = Math.sin(angle) * radius
          i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)
        }
        g.closePath()
        g.stroke()
        // The letter tumbles with its asteroid, so orientation is part of the
        // recognition task rather than a fixed upright cue.
        drawLetter(g, 0, 0, ctx.size, rock.letter, ctx.target)
        g.restore()

        // A wrong shot is marked with a cross straight over the letter, so the
        // error is attached to the thing that was hit.
        if (rock.struck && !rock.struck.correct) {
          const arm = ctx.size * 0.8
          g.save()
          g.strokeStyle = ctx.target
          g.lineWidth = Math.max(4, ctx.size / 5)
          g.lineCap = 'round'
          g.beginPath()
          g.moveTo(rock.x - arm, rock.y - arm)
          g.lineTo(rock.x + arm, rock.y + arm)
          g.moveTo(rock.x + arm, rock.y - arm)
          g.lineTo(rock.x - arm, rock.y + arm)
          g.stroke()
          g.restore()
        }
      }

      // Correct shot: a glow that blooms and fades. Wrong shot: no glow at all,
      // so the two outcomes never look alike.
      for (const effect of effects) {
        const life = (ctx.t - effect.born) / FEEDBACK_MS
        if (!effect.correct) continue
        const radius = ctx.size * (0.9 + life * 1.5)
        const halo = g.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius)
        halo.addColorStop(0, ctx.target)
        halo.addColorStop(1, 'transparent')
        g.save()
        g.globalAlpha = Math.max(0, 1 - life)
        g.fillStyle = halo
        g.beginPath()
        g.arc(effect.x, effect.y, radius, 0, Math.PI * 2)
        g.fill()
        g.restore()
      }

      // The shot reads as a ray with a bright head and a fading tail, so it is
      // easy to track and time against a moving target.
      for (const bullet of bullets) {
        const tail = ctx.size * 1.6
        const beam = g.createLinearGradient(bullet.x, bullet.y, bullet.x, bullet.y + tail)
        beam.addColorStop(0, ctx.suppressed)
        beam.addColorStop(1, 'transparent')
        g.save()
        g.strokeStyle = beam
        g.lineWidth = Math.max(3, ctx.size / 7)
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(bullet.x, bullet.y)
        g.lineTo(bullet.x, bullet.y + tail)
        g.stroke()
        g.fillStyle = ctx.suppressed
        g.beginPath()
        g.arc(bullet.x, bullet.y, Math.max(2.5, ctx.size / 12), 0, Math.PI * 2)
        g.fill()
        g.restore()
      }

      // The patient's own avatar goes in the FELLOW eye's channel, not the
      // shared one. Target in one eye, cursor in the other, means the game
      // cannot be played with a single eye - which is the anti-suppression
      // point of MFBF. In monocular the channels collapse, so this is a no-op.
      g.save()
      g.translate(rocket.x, rocket.y)
      g.fillStyle = ctx.suppressed
      g.beginPath()
      g.moveTo(0, -ctx.size * 1.1)
      g.quadraticCurveTo(ctx.size * 0.55, 0, ctx.size * 0.4, ctx.size * 0.85)
      g.lineTo(-ctx.size * 0.4, ctx.size * 0.85)
      g.quadraticCurveTo(-ctx.size * 0.55, 0, 0, -ctx.size * 1.1)
      g.fill()
      g.restore()
    },

    pointer: (p, ctx) => {
      // The mouse steers the rocket as well as firing it, so the patient can
      // use whichever control they find easier.
      if (p.type === 'move' || p.type === 'down') {
        rocket.x = Math.max(ctx.size, Math.min(ctx.w - ctx.size, p.x))
        rocket.y = Math.max(ctx.h * 0.3, Math.min(ctx.h - ctx.size, p.y))
      }
      if (p.type === 'down') fire(ctx)
    },

    key: (event, ctx) => {
      if (event.key === ' ') {
        fire(ctx)
        return
      }
      if (!event.key.startsWith('Arrow')) return
      held.add(event.key)
      // The host forwards keydown only, so a held arrow is released on a short
      // timer; repeat events keep it alive while the key is actually down.
      setTimeout(() => held.delete(event.key), 140)
    },
  }
}

// ------------------------------------------- Candy Crush Letter (crush_the_)

const GRID = 6

/** Match-3 on a letter board. Drag a letter onto a neighbour to swap; three
 *  or more alike in a row or column clear and refill. */
export const candyCrushLetter: GameFactory = () => {
  // Sloan optotypes rather than arbitrary letters: these render in the real
  // chart face, so the glyph the child discriminates is a true optotype.
  const pool = ['C', 'D', 'H', 'K', 'N', 'O']
  // Tonal variety derived from the calibrated channel rather than invented
  // hues: matching is by letter, so colour is decorative, and a fixed palette
  // here would ignore the colour settings and could leak to the fellow eye.
  const shade = (letter: string) => 1 - 0.14 * pool.indexOf(letter)
  let board: string[][] = []
  let selected: { r: number; c: number } | null = null
  let cell = 0
  let originX = 0
  let originY = 0

  const layout = (ctx: Ctx) => {
    cell = Math.min((ctx.w * 0.6) / GRID, (ctx.h * 0.85) / GRID)
    originX = ctx.w / 2 - (cell * GRID) / 2
    originY = ctx.h / 2 - (cell * GRID) / 2
  }

  const fill = (ctx: Ctx) => {
    board = Array.from({ length: GRID }, () =>
      Array.from({ length: GRID }, () => pool[Math.floor(ctx.rnd() * pool.length)]),
    )
  }

  const findMatches = (): Array<[number, number]> => {
    const marked: Array<[number, number]> = []
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID - 2; c++) {
        if (board[r][c] && board[r][c] === board[r][c + 1] && board[r][c] === board[r][c + 2]) {
          marked.push([r, c], [r, c + 1], [r, c + 2])
        }
      }
    }
    for (let c = 0; c < GRID; c++) {
      for (let r = 0; r < GRID - 2; r++) {
        if (board[r][c] && board[r][c] === board[r + 1][c] && board[r][c] === board[r + 2][c]) {
          marked.push([r, c], [r + 1, c], [r + 2, c])
        }
      }
    }
    return marked
  }

  const clearMatches = (ctx: Ctx): number => {
    const marked = findMatches()
    if (marked.length === 0) return 0
    const unique = new Set(marked.map(([r, c]) => `${r},${c}`))
    for (const key of unique) {
      const [r, c] = key.split(',').map(Number)
      board[r][c] = pool[Math.floor(ctx.rnd() * pool.length)]
    }
    return unique.size
  }

  const at = (_ctx: Ctx, x: number, y: number) => {
    const c = Math.floor((x - originX) / cell)
    const r = Math.floor((y - originY) / cell)
    if (r < 0 || c < 0 || r >= GRID || c >= GRID) return null
    return { r, c }
  }

  return {
    brief:
      'Match 3 or more of the same letters in a row or column to make them disappear and score points. Click and drag letters to swap with nearby ones.',

    init: (ctx) => {
      layout(ctx)
      fill(ctx)
      // Clear any matches dealt at random so the board starts settled.
      let guard = 0
      while (clearMatches(ctx) > 0 && guard++ < 40) {
        /* settle */
      }
    },

    update: (ctx) => {
      layout(ctx)
    },

    draw: (g, ctx) => {
      const size = cell * 0.72
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const x = originX + c * cell + cell / 2
          const y = originY + r * cell + cell / 2
          const isSelected = selected && selected.r === r && selected.c === c
          if (isSelected) {
            g.strokeStyle = ctx.target
            g.lineWidth = 3
            g.strokeRect(originX + c * cell + 3, originY + r * cell + 3, cell - 6, cell - 6)
          }
          // On an anaglyph background the tile colours have to collapse to the
          // treated-eye channel, otherwise the fellow eye sees the target too.
          const colour = tint(ctx.target, shade(board[r][c]))
          drawLetter(g, x, y, size, board[r][c], colour)
        }
      }
    },

    pointer: (p, ctx) => {
      if (p.type !== 'down') return
      const spot = at(ctx, p.x, p.y)
      if (!spot) return
      if (!selected) {
        selected = spot
        sound.play('select')
        return
      }
      const adjacent =
        Math.abs(selected.r - spot.r) + Math.abs(selected.c - spot.c) === 1
      if (!adjacent) {
        selected = spot
        return
      }
      const a = board[selected.r][selected.c]
      const b = board[spot.r][spot.c]
      board[selected.r][selected.c] = b
      board[spot.r][spot.c] = a
      const cleared = clearMatches(ctx)
      if (cleared > 0) {
        sound.play('clear')
        ctx.record('hit', { target: a, response: `${cleared} cleared` })
        let guard = 0
        while (clearMatches(ctx) > 0 && guard++ < 20) {
          /* cascade */
        }
      } else {
        // No match: swap back and count it as an error.
        board[selected.r][selected.c] = a
        board[spot.r][spot.c] = b
        ctx.record('false_alarm', { target: a, response: b })
      }
      selected = null
    },
  }
}

// ------------------------------------ Connecting the Letters (connect_the_)

/** Click two identical letters that sit on a clear vertical, horizontal or
 *  diagonal line from each other. */
export const connectingLetters: GameFactory = () => {
  // Sloan optotypes rather than arbitrary letters: these render in the real
  // chart face, so the glyph the child discriminates is a true optotype.
  const pool = ['C', 'D', 'H', 'K', 'N', 'O']
  let board: (string | null)[][] = []
  let selected: { r: number; c: number } | null = null
  let links: Array<{ a: { r: number; c: number }; b: { r: number; c: number } }> = []
  let cell = 0
  let originX = 0
  let originY = 0

  const layout = (ctx: Ctx) => {
    cell = Math.min((ctx.w * 0.6) / GRID, (ctx.h * 0.85) / GRID)
    originX = ctx.w / 2 - (cell * GRID) / 2
    originY = ctx.h / 2 - (cell * GRID) / 2
  }

  const fill = (ctx: Ctx) => {
    board = Array.from({ length: GRID }, () =>
      Array.from({ length: GRID }, () => pool[Math.floor(ctx.rnd() * pool.length)] as string | null),
    )
    links = []
  }

  /** True when a and b are the same letter and the line between them is clear. */
  const connectable = (a: { r: number; c: number }, b: { r: number; c: number }): boolean => {
    if (a.r === b.r && a.c === b.c) return false
    const dr = Math.sign(b.r - a.r)
    const dc = Math.sign(b.c - a.c)
    const rowSpan = Math.abs(b.r - a.r)
    const colSpan = Math.abs(b.c - a.c)
    const straight = rowSpan === 0 || colSpan === 0 || rowSpan === colSpan
    if (!straight) return false
    if (board[a.r][a.c] === null || board[a.r][a.c] !== board[b.r][b.c]) return false
    const steps = Math.max(rowSpan, colSpan)
    for (let i = 1; i < steps; i++) {
      if (board[a.r + dr * i][a.c + dc * i] !== null) return false
    }
    return true
  }

  const at = (_ctx: Ctx, x: number, y: number) => {
    const c = Math.floor((x - originX) / cell)
    const r = Math.floor((y - originY) / cell)
    if (r < 0 || c < 0 || r >= GRID || c >= GRID) return null
    return { r, c }
  }

  const centre = (r: number, c: number) => ({
    x: originX + c * cell + cell / 2,
    y: originY + r * cell + cell / 2,
  })

  return {
    brief: 'Connect the same letters vertically, horizontally, and diagonally.',

    init: (ctx) => {
      layout(ctx)
      fill(ctx)
    },

    update: (ctx) => {
      layout(ctx)
      const remaining = board.flat().filter(Boolean).length
      if (remaining < 2) fill(ctx)
    },

    draw: (g, ctx) => {
      g.strokeStyle = ctx.fusion
      g.lineWidth = Math.max(2, cell / 16)
      for (const link of links) {
        const a = centre(link.a.r, link.a.c)
        const b = centre(link.b.r, link.b.c)
        g.beginPath()
        g.moveTo(a.x, a.y)
        g.lineTo(b.x, b.y)
        g.stroke()
      }

      const size = cell * 0.72
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const letter = board[r][c]
          if (!letter) continue
          const spot = centre(r, c)
          if (selected && selected.r === r && selected.c === c) {
            g.strokeStyle = ctx.target
            g.lineWidth = 3
            g.strokeRect(originX + c * cell + 3, originY + r * cell + 3, cell - 6, cell - 6)
          }
          drawLetter(g, spot.x, spot.y, size, letter, ctx.target)
        }
      }
    },

    pointer: (p, ctx) => {
      if (p.type !== 'down') return
      const spot = at(ctx, p.x, p.y)
      if (!spot || board[spot.r][spot.c] === null) return
      if (!selected) {
        selected = spot
        return
      }
      if (connectable(selected, spot)) {
        sound.play('connect')
        ctx.record('hit', { target: board[spot.r][spot.c] ?? '', response: 'connected' })
        links.push({ a: selected, b: spot })
        board[selected.r][selected.c] = null
        board[spot.r][spot.c] = null
        selected = null
      } else {
        ctx.record('false_alarm', {
          target: board[selected.r][selected.c] ?? '',
          response: board[spot.r][spot.c] ?? '',
        })
        selected = spot
      }
    },
  }
}

// ------------------------------------------ Alphabet Racer (alphabet_racer)

const LANES = 4

/** Lane runner. Letters sweep down the lanes; steer the car into the lane
 *  holding the current target letter. Up/Down change road speed. */
export const alphabetRacer: GameFactory = () => {
  let lane = 1
  let rows: Array<{ y: number; letters: string[]; targetLane: number; scored: boolean }> = []
  // One target letter, drawn once at the start and held for the whole run. The
  // task is to hunt the same letter repeatedly, so changing it row to row would
  // turn a search task into a reading task.
  let target = 'C'
  let rowsTotal = 8
  let cleared = 0
  let speed = 0
  let laneW = 0
  let stripe = 0
  /** Short-lived feedback so a correct pass is visibly rewarded, not silent. */
  let effects: Array<{ x: number; y: number; born: number; correct: boolean; letter: string }> = []
  const FEEDBACK_MS = 700

  const spawnRow = (ctx: Ctx, y: number) => {
    const targetLane = Math.floor(ctx.rnd() * LANES)
    const others = SLOAN.filter((l) => l !== target)
    const letters: string[] = []
    for (let i = 0; i < LANES; i++) {
      letters.push(i === targetLane ? target : others[Math.floor(ctx.rnd() * others.length)])
    }
    rows.push({ y, letters, targetLane, scored: false })
  }

  return {
    brief:
      'Find and drive over the target letter. Arrow keys move left or right to switch lanes; up goes faster, down slows down.',

    init: (ctx) => {
      const pool = ctx.stimuli.sequence?.length ? ctx.stimuli.sequence : SLOAN
      // Chosen once, then fixed for the session.
      target = pool[Math.floor(ctx.rnd() * pool.length)]
      rowsTotal = Math.max(4, pool.length)
      cleared = 0
      effects = []
      lane = 1
      speed = Math.max(80, ctx.params.speed_pps ?? 150)
      laneW = ctx.w / LANES
      rows = []
      spawnRow(ctx, -ctx.size * 2)
    },

    update: (ctx) => {
      laneW = ctx.w / LANES
      stripe = (stripe + speed * ctx.dt) % (ctx.size * 2)
      const carY = ctx.h * 0.78

      for (const row of rows) {
        row.y += speed * ctx.dt
        if (!row.scored && row.y > carY) {
          row.scored = true
          const correct = lane === row.targetLane
          ctx.record(correct ? 'hit' : 'false_alarm', {
            target,
            response: row.letters[lane],
          })
          effects.push({
            x: (correct ? row.targetLane : lane) * laneW + laneW / 2,
            y: carY,
            born: ctx.t,
            correct,
            letter: correct ? target : row.letters[lane],
          })
          cleared += 1
        }
      }

      effects = effects.filter((e) => ctx.t - e.born < FEEDBACK_MS)
      rows = rows.filter((r) => r.y < ctx.h + ctx.size * 2)
      const lowest = rows.length ? Math.min(...rows.map((r) => r.y)) : ctx.h
      if (lowest > ctx.h * 0.34) spawnRow(ctx, -ctx.size * 2)
    },

    draw: (g, ctx) => {
      // Lane markers, in the shared field.
      g.strokeStyle = ctx.fusion
      g.lineWidth = Math.max(1.5, ctx.size / 18)
      g.setLineDash([ctx.size * 0.7, ctx.size * 0.7])
      g.lineDashOffset = -stripe
      for (let i = 1; i < LANES; i++) {
        g.beginPath()
        g.moveTo(i * laneW, 0)
        g.lineTo(i * laneW, ctx.h)
        g.stroke()
      }
      g.setLineDash([])

      for (const row of rows) {
        row.letters.forEach((letter, i) => {
          drawLetter(g, i * laneW + laneW / 2, row.y, ctx.size, letter, ctx.target)
        })
      }

      // The one letter to hunt, unchanged for the whole run.
      drawLetter(g, ctx.w / 2, ctx.size * 1.2, ctx.size, target, ctx.target)
      ctx.setPending(rows.filter((r) => !r.scored).length)

      // Progress through the trail, as "n - total".
      // Kept left: the HUD chips and close button own the top-right corner.
      drawText(
        g,
        ctx.size * 2.2,
        ctx.size * 1.2,
        ctx.size * 0.6,
        `${Math.min(cleared + 1, rowsTotal)} - ${rowsTotal}`,
        ctx.fusion,
      )

      // Correct pass: an expanding glow with the letter riding it upward.
      // Wrong lane: a cross over the letter that was actually driven into.
      for (const fx of effects) {
        const life = (ctx.t - fx.born) / FEEDBACK_MS
        g.save()
        g.globalAlpha = Math.max(0, 1 - life)
        if (fx.correct) {
          const r = ctx.size * (0.8 + life * 2.4)
          const halo = g.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r)
          halo.addColorStop(0, ctx.target)
          halo.addColorStop(1, 'transparent')
          g.fillStyle = halo
          g.beginPath()
          g.arc(fx.x, fx.y, r, 0, Math.PI * 2)
          g.fill()
          g.globalAlpha = Math.max(0, 1 - life) * 0.95
          drawLetter(g, fx.x, fx.y - life * ctx.size * 2.6, ctx.size, fx.letter, ctx.target)
        } else {
          const arm = ctx.size * 0.85
          g.strokeStyle = ctx.target
          g.lineWidth = Math.max(4, ctx.size / 5)
          g.lineCap = 'round'
          g.beginPath()
          g.moveTo(fx.x - arm, fx.y - arm)
          g.lineTo(fx.x + arm, fx.y + arm)
          g.moveTo(fx.x + arm, fx.y - arm)
          g.lineTo(fx.x - arm, fx.y + arm)
          g.stroke()
        }
        g.restore()
      }

      // Car.
      const carY = ctx.h * 0.78
      const cx = lane * laneW + laneW / 2
      // The patient's own avatar goes in the FELLOW eye's channel, not the
      // shared one. Target in one eye, cursor in the other, means the game
      // cannot be played with a single eye - which is the anti-suppression
      // point of MFBF. In monocular the channels collapse, so this is a no-op.
      drawCar(g, cx, carY, ctx.size, ctx.suppressed, ctx.background)
    },

    key: (event, ctx) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') sound.play('swap')
      if (event.key === 'ArrowLeft') lane = Math.max(0, lane - 1)
      if (event.key === 'ArrowRight') lane = Math.min(LANES - 1, lane + 1)
      if (event.key === 'ArrowUp') speed = Math.min(speed * 1.15, (ctx.params.speed_pps ?? 150) * 2.4)
      if (event.key === 'ArrowDown') speed = Math.max(speed * 0.85, 60)
    },

    pointer: (p, ctx) => {
      if (p.type === 'down') lane = Math.max(0, Math.min(LANES - 1, Math.floor(p.x / (ctx.w / LANES))))
    },
  }
}
