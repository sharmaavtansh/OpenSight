import { dist, drawLetter, drawText, type Ctx, type GameFactory } from './engine'
import { sound } from '../audio'

/* The three activities whose mechanics are specified by their briefing screens:
 * Drop The Balls, Ice Jump and Tracing. */

const SLOAN = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z']

// ------------------------------------------- Drop The Balls (drop_the_balls)

/** A hopper of balls empties one release at a time. Boxes slide along a beam
 *  below, each marked with a letter; the ball must land in the box carrying
 *  the target letter. The run ends when the tube is empty. */
export const dropTheBalls: GameFactory = () => {
  const BOXES = 4
  const STOCK = 24
  let remaining = 0
  let target = 'B'
  let balls: Array<{ x: number; y: number; vy: number; born: number }> = []
  let boxes: Array<{ x: number; letter: string }> = []
  let beamY = 0
  let spoutY = 0
  let drift = 0
  let pool: string[] = []

  const layout = (ctx: Ctx) => {
    beamY = ctx.h * 0.8
    spoutY = ctx.h * 0.34
  }

  const rebuildBoxes = (ctx: Ctx) => {
    const spacing = ctx.w / BOXES
    const targetSlot = Math.floor(ctx.rnd() * BOXES)
    const others = pool.filter((l) => l !== target)
    boxes = Array.from({ length: BOXES }, (_, i) => ({
      x: i * spacing + spacing / 2,
      letter: i === targetSlot ? target : others[Math.floor(ctx.rnd() * others.length)] ?? 'C',
    }))
  }

  const release = (ctx: Ctx) => {
    if (remaining <= 0) return
    remaining -= 1
    sound.play('release')
    balls.push({ x: ctx.w / 2, y: spoutY, vy: 0, born: ctx.t })
    ctx.setPending(remaining)
  }

  return {
    brief:
      'Press the spacebar or click the mouse to release the balls. Try to drop them on the box marked with the target letter. The game ends when the tube is empty.',

    init: (ctx) => {
      layout(ctx)
      pool = ctx.stimuli.letters?.length ? Array.from(new Set(ctx.stimuli.letters)) : SLOAN
      target = pool[Math.floor(ctx.rnd() * pool.length)]
      remaining = STOCK
      balls = []
      drift = 0
      rebuildBoxes(ctx)
      ctx.setPending(remaining)
    },

    update: (ctx) => {
      layout(ctx)
      // The beam slides, so the drop is a timing decision rather than an aim.
      drift += (ctx.params.speed_pps ?? 120) * ctx.dt
      const gravity = ctx.size * 22

      for (const ball of balls) {
        ball.vy += gravity * ctx.dt
        ball.y += ball.vy * ctx.dt
      }

      const spacing = ctx.w / BOXES
      const landed = balls.filter((b) => b.y >= beamY - ctx.size * 0.4)
      for (const ball of landed) {
        let best = boxes[0]
        let bestDistance = Infinity
        for (const box of boxes) {
          const screenX = (((box.x + drift) % ctx.w) + ctx.w) % ctx.w
          const d = Math.abs(screenX - ball.x)
          if (d < bestDistance) {
            bestDistance = d
            best = box
          }
        }
        const inBox = bestDistance < spacing * 0.3
        if (inBox && best.letter === target) {
          ctx.record('hit', { rt_ms: ctx.t - ball.born, target, response: best.letter })
        } else {
          ctx.record('false_alarm', { target, response: inBox ? best.letter : 'floor' })
        }
      }
      balls = balls.filter((b) => b.y < beamY - ctx.size * 0.4)
    },

    draw: (g, ctx) => {
      const hopperW = ctx.size * 6
      const hopperTop = ctx.h * 0.08

      // Hopper walls, funnelling down to the spout.
      g.strokeStyle = ctx.fusion
      g.lineWidth = Math.max(3, ctx.size / 8)
      g.beginPath()
      g.moveTo(ctx.w / 2 - hopperW / 2, hopperTop)
      g.lineTo(ctx.w / 2 - hopperW / 2, hopperTop + ctx.size * 1.8)
      g.lineTo(ctx.w / 2 - ctx.size * 0.5, spoutY)
      g.moveTo(ctx.w / 2 + hopperW / 2, hopperTop)
      g.lineTo(ctx.w / 2 + hopperW / 2, hopperTop + ctx.size * 1.8)
      g.lineTo(ctx.w / 2 + ctx.size * 0.5, spoutY)
      g.stroke()

      // Remaining stock, shown inside the hopper.
      drawText(g, ctx.w / 2, hopperTop + ctx.size, ctx.size, String(remaining), ctx.fusion)
      drawLetter(g, ctx.w / 2, hopperTop - ctx.size * 0.5, ctx.size, target, ctx.target)

      // Beam and the sliding boxes.
      g.fillStyle = ctx.fusion
      g.fillRect(0, beamY, ctx.w, Math.max(4, ctx.size / 6))
      const spacing = ctx.w / BOXES
      for (const box of boxes) {
        const screenX = (((box.x + drift) % ctx.w) + ctx.w) % ctx.w
        g.strokeStyle = ctx.fusion
        g.lineWidth = Math.max(2, ctx.size / 10)
        g.strokeRect(screenX - spacing * 0.2, beamY - ctx.size * 1.5, spacing * 0.4, ctx.size * 1.5)
        // The letter is the monocular decision point.
        drawLetter(g, screenX, beamY + ctx.size * 0.9, ctx.size, box.letter, ctx.target)
      }

      g.fillStyle = ctx.target
      for (const ball of balls) {
        g.beginPath()
        g.arc(ball.x, ball.y, ctx.size * 0.32, 0, Math.PI * 2)
        g.fill()
      }
    },

    pointer: (p, ctx) => {
      if (p.type === 'down') release(ctx)
    },

    key: (event, ctx) => {
      if (event.key === ' ') release(ctx)
    },
  }
}

// ------------------------------------------------------ Ice Jump (ice_jump)

/** Three buckets: the one the ice sits in, which slides left and right along
 *  the floor, and two above it carrying letters. A press launches the ice
 *  straight up, so the only thing the patient controls is *when* - the launch
 *  has to happen while the moving bucket is under the bucket whose letter
 *  matches the target.
 */
export const iceJump: GameFactory = () => {
  const TARGET_BUCKETS = 2  // plus the source bucket the ice launches from = 3

  let sourceX = 0
  let dir = 1
  let speed = 0
  let gravity = 0
  let ice = { x: 0, y: 0, vy: 0, flying: false, landed: false }
  let launchedAt = 0
  let target = 'C'
  let pool: string[] = []
  let buckets: Array<{ x: number; letter: string }> = []

  const floorY = (ctx: Ctx) => ctx.h * 0.86
  const shelfY = (ctx: Ctx) => ctx.h * 0.34
  const mouth = (ctx: Ctx) => ctx.size * 1.1

  const rebuild = (ctx: Ctx) => {
    // Every round moves on to a new target letter.
    target = pool[Math.floor(ctx.rnd() * pool.length)]
    const others = pool.filter((l) => l !== target)
    const targetSlot = Math.floor(ctx.rnd() * TARGET_BUCKETS)
    buckets = Array.from({ length: TARGET_BUCKETS }, (_, i) => ({
      x: ctx.w * (0.3 + 0.4 * (i / Math.max(1, TARGET_BUCKETS - 1))),
      letter: i === targetSlot ? target : others[Math.floor(ctx.rnd() * others.length)] ?? 'D',
    }))
  }

  const launch = (ctx: Ctx) => {
    if (ice.flying) return
    ice.flying = true
    ice.landed = false
    ice.x = sourceX
    ice.y = floorY(ctx) - ctx.size
    // Fixed upward kick, sized to just clear the upper shelf.
    ice.vy = -Math.sqrt(2 * gravity * (floorY(ctx) - shelfY(ctx) + ctx.size * 2))
    sound.play('launch')
    launchedAt = ctx.t
  }

  return {
    brief:
      'The bucket holding the ice slides left and right. Press the spacebar or click to launch it upward, timing the press so it lands in the bucket with the matching letter.',

    init: (ctx) => {
      pool = ctx.stimuli.letters?.length ? Array.from(new Set(ctx.stimuli.letters)) : SLOAN
      speed = Math.max(70, ctx.params.speed_pps ?? 120)
      gravity = ctx.size * 22
      sourceX = ctx.w / 2
      dir = 1
      ice = { x: sourceX, y: floorY(ctx) - ctx.size, vy: 0, flying: false, landed: false }
      rebuild(ctx)
      ctx.setPending(1)
    },

    update: (ctx) => {
      // The source bucket sweeps; the ice rides in it until launched.
      const margin = ctx.size * 1.4
      sourceX += dir * speed * ctx.dt
      if (sourceX > ctx.w - margin) { sourceX = ctx.w - margin; dir = -1 }
      if (sourceX < margin) { sourceX = margin; dir = 1 }
      if (!ice.flying) {
        ice.x = sourceX
        ice.y = floorY(ctx) - ctx.size
        return
      }

      ice.vy += gravity * ctx.dt
      ice.y += ice.vy * ctx.dt

      // Catch it on the way up as it crosses the shelf.
      if (ice.vy < 0 && ice.y <= shelfY(ctx)) {
        const hit = buckets.find((b) => Math.abs(b.x - ice.x) < mouth(ctx))
        if (hit) {
          ice.flying = false
          ice.landed = true
          ice.y = shelfY(ctx)
          ctx.record(hit.letter === target ? 'hit' : 'false_alarm', {
            rt_ms: ctx.t - launchedAt,
            target,
            response: hit.letter,
          })
          rebuild(ctx)
          return
        }
      }

      // Fell back to the floor without reaching a bucket.
      if (ice.y >= floorY(ctx) - ctx.size) {
        ice.flying = false
        ice.y = floorY(ctx) - ctx.size
        ice.vy = 0
        ctx.record('miss', { target, response: 'fell-back' })
      }
    },

    draw: (g, ctx) => {
      drawLetter(g, ctx.w / 2, ctx.size * 1.1, ctx.size, target, ctx.target)

      const shelf = shelfY(ctx)
      const floor = floorY(ctx)

      // Shelf the two target buckets stand on, plus the floor.
      g.fillStyle = ctx.fusion
      g.fillRect(0, shelf, ctx.w, Math.max(3, ctx.size / 9))
      g.fillRect(0, floor, ctx.w, Math.max(3, ctx.size / 9))

      const bucket = (x: number, rim: number, letter: string | null) => {
        g.strokeStyle = ctx.fusion
        g.lineWidth = Math.max(2, ctx.size / 10)
        g.beginPath()
        g.moveTo(x - ctx.size * 0.75, rim - ctx.size * 1.25)
        g.lineTo(x - ctx.size * 0.5, rim)
        g.lineTo(x + ctx.size * 0.5, rim)
        g.lineTo(x + ctx.size * 0.75, rim - ctx.size * 1.25)
        g.stroke()
        if (letter) {
          // The letter is the monocular decision point.
          drawLetter(g, x, rim + ctx.size * 0.85, ctx.size, letter, ctx.target)
        }
      }

      for (const b of buckets) bucket(b.x, shelf, b.letter)
      bucket(sourceX, floor, null)

      // The ice is the patient's avatar, so it rides the fellow eye's channel
      // while the lettered buckets stay in the treated eye's.
      g.save()
      g.fillStyle = ctx.suppressed
      g.translate(ice.x, ice.y)
      g.fillRect(-ctx.size * 0.3, -ctx.size * 0.3, ctx.size * 0.6, ctx.size * 0.6)
      g.restore()
    },

    pointer: (p, ctx) => {
      if (p.type === 'down') launch(ctx)
    },

    key: (event, ctx) => {
      if (event.key === ' ') launch(ctx)
    },
  }
}

// -------------------------------------------------- Tracing (trace_magic)

/** Trace a line-art shape. The outline is sampled into evenly spaced
 *  checkpoints; dragging within tolerance of the next one advances the trace,
 *  and straying well clear of the whole path scores as an error. */
export const tracing: GameFactory = () => {
  type Pt = { x: number; y: number }

  const SHAPES: Record<string, Pt[]> = {
    star: Array.from({ length: 11 }, (_, i) => {
      const r = i % 2 === 0 ? 0.5 : 0.22
      const a = (Math.PI / 5) * i - Math.PI / 2
      return { x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r }
    }),
    house: [
      { x: 0.2, y: 0.95 },
      { x: 0.2, y: 0.45 },
      { x: 0.5, y: 0.12 },
      { x: 0.8, y: 0.45 },
      { x: 0.8, y: 0.95 },
      { x: 0.2, y: 0.95 },
    ],
    circle: Array.from({ length: 33 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2
      return { x: 0.5 + Math.cos(a) * 0.42, y: 0.5 + Math.sin(a) * 0.42 }
    }),
    triangle: [
      { x: 0.5, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
      { x: 0.5, y: 0.1 },
    ],
    heart: Array.from({ length: 41 }, (_, i) => {
      const t = (i / 40) * Math.PI * 2
      return {
        x: 0.5 + (16 * Math.sin(t) ** 3) / 40,
        y:
          0.46 -
          (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 40,
      }
    }),
  }
  const NAMES = Object.keys(SHAPES)

  let path: Pt[] = []
  let reached = 0
  let ink: Pt[] = []
  let started = 0
  let shapeIndex = 0

  /** Resample so checkpoints are evenly spaced whatever the shape. */
  const densify = (pts: Pt[], step: number): Pt[] => {
    const out: Pt[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const span = Math.hypot(b.x - a.x, b.y - a.y)
      const n = Math.max(1, Math.round(span / step))
      for (let k = 0; k < n; k++) {
        out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
      }
    }
    out.push(pts[pts.length - 1])
    return out
  }

  const build = (ctx: Ctx) => {
    const name = NAMES[shapeIndex % NAMES.length]
    shapeIndex += 1
    const size = Math.min(ctx.w, ctx.h) * 0.62
    const ox = ctx.w / 2 - size / 2
    const oy = ctx.h / 2 - size / 2
    path = densify(
      SHAPES[name].map((p) => ({ x: ox + p.x * size, y: oy + p.y * size })),
      Math.max(6, ctx.size * 0.8),
    )
    reached = 0
    ink = []
    started = ctx.t
    ctx.setPending(path.length)
  }

  return {
    brief:
      'Use your finger or the mouse to trace the shape on the screen. Try to stay on the path to complete the tracing.',

    init: build,

    update: (ctx) => {
      ctx.setPending(path.length - reached)
      if (reached >= path.length) build(ctx)
    },

    draw: (g, ctx) => {
      // Guide outline, in the shared field so the shape stays binocular.
      g.strokeStyle = ctx.fusion
      g.lineWidth = Math.max(8, ctx.size * 0.9)
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.beginPath()
      path.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)))
      g.stroke()

      // Completed portion, in the treated eye's colour.
      if (reached > 1) {
        g.strokeStyle = ctx.target
        g.lineWidth = Math.max(5, ctx.size * 0.55)
        g.beginPath()
        path.slice(0, reached).forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)))
        g.stroke()
      }

      if (ink.length > 1) {
        g.strokeStyle = ctx.target
        g.lineWidth = Math.max(3, ctx.size * 0.28)
        g.beginPath()
        ink.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)))
        g.stroke()
      }

      // Where to go next.
      if (reached < path.length) {
        const next = path[reached]
        g.strokeStyle = ctx.target
        g.lineWidth = Math.max(2, ctx.size / 9)
        g.beginPath()
        g.arc(next.x, next.y, ctx.size * 0.55, 0, Math.PI * 2)
        g.stroke()
      }
    },

    pointer: (p, ctx) => {
      if (p.type === 'up') {
        ink = []
        return
      }
      if (!p.down || reached >= path.length) return
      ink.push({ x: p.x, y: p.y })
      if (ink.length > 240) ink.shift()

      const tolerance = ctx.params.hit_radius_px ?? ctx.size * 1.8
      if (dist(p.x, p.y, path[reached].x, path[reached].y) < tolerance) {
        reached += 1
        // Checkpoints are dense, so only a fraction are logged - otherwise the
        // trial table fills with one row per pixel of movement.
        if (reached % 6 === 0) {
          ctx.record('hit', { rt_ms: ctx.t - started, target: 'path', response: 'on-path' })
        }
        return
      }
      const strayed = path.every((q) => dist(p.x, p.y, q.x, q.y) > tolerance * 2.2)
      if (strayed && ink.length % 12 === 0) {
        ctx.record('false_alarm', { target: 'path', response: 'off-path' })
      }
    },
  }
}
