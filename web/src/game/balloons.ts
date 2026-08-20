import { drawBalloon, drawE, dist, type Ctx, type GameFactory } from './engine'
import { sound } from '../audio'

/* Balloon Pop, pursuit and saccade variants.
 *
 * Each balloon carries a tumbling E that starts in a wrong orientation and
 * rights itself after a few seconds. The patient pops a balloon only while its
 * E is upright, so the task is orientation discrimination held under either
 * smooth pursuit (drifting balloons) or saccades (balloons appearing away from
 * centre). */

const DIRS = ['right', 'down', 'left', 'up'] as const
const CORRECT: (typeof DIRS)[number] = 'right'

interface Balloon {
  x: number
  y: number
  vx: number
  vy: number
  dir: string
  /** When this balloon's orientation snaps back to correct. */
  correctsAt: number
  born: number
  popped: boolean
}

function makeBalloonGame(opts: { brief: string; moving: boolean }): GameFactory {
  return () => {
    let balloons: Balloon[] = []
    let sinceSpawn = 0

    /** 5-6 seconds, as specified: long enough to track, short enough to hold
     *  attention. */
    const correctionDelay = (ctx: Ctx) => 5000 + ctx.rnd() * 1000

    const spawn = (ctx: Ctx) => {
      const speed = opts.moving ? Math.max(40, ctx.params.speed_pps ?? 95) : 0
      const heading = ctx.rnd() * Math.PI * 2
      // Saccade variant places balloons away from centre so each onset forces a
      // large eye movement.
      const edge = opts.moving ? 0.12 : 0.06
      const x = ctx.w * edge + ctx.rnd() * ctx.w * (1 - 2 * edge)
      const y = ctx.h * edge + ctx.rnd() * ctx.h * (1 - 2 * edge)
      const wrong = DIRS.filter((d) => d !== CORRECT)
      balloons.push({
        x,
        y,
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        dir: wrong[Math.floor(ctx.rnd() * wrong.length)],
        correctsAt: ctx.t + correctionDelay(ctx),
        born: ctx.t,
        popped: false,
      })
    }

    /** The balloon the patient is most likely aiming at, for spacebar popping. */
    const nearestCorrect = (): Balloon | undefined =>
      balloons.find((b) => !b.popped && b.dir === CORRECT) ?? balloons.find((b) => !b.popped)

    const attempt = (ctx: Ctx, balloon: Balloon | undefined) => {
      if (!balloon || balloon.popped) return
      const correct = balloon.dir === CORRECT
      balloon.popped = true
      sound.play('pop')
      ctx.record(correct ? 'hit' : 'false_alarm', {
        rt_ms: ctx.t - (correct ? balloon.correctsAt : balloon.born),
        target: CORRECT,
        response: balloon.dir,
        x: balloon.x,
        y: balloon.y,
      })
    }

    return {
      brief: opts.brief,

      init: (ctx) => {
        balloons = []
        sinceSpawn = 0
        const count = Math.max(2, (ctx.params.distractors ?? 3) + 1)
        for (let i = 0; i < count; i++) spawn(ctx)
      },

      update: (ctx) => {
        sinceSpawn += ctx.dt * 1000
        const cap = Math.max(2, (ctx.params.distractors ?? 3) + 1)
        const alive = balloons.filter((b) => !b.popped)
        if (sinceSpawn > (ctx.params.spawn_ms ?? 1400) && alive.length < cap) {
          sinceSpawn = 0
          spawn(ctx)
        }

        for (const balloon of balloons) {
          if (balloon.popped) continue
          balloon.x += balloon.vx * ctx.dt
          balloon.y += balloon.vy * ctx.dt
          const m = ctx.size * 1.2
          if (balloon.x < m || balloon.x > ctx.w - m) balloon.vx *= -1
          if (balloon.y < m || balloon.y > ctx.h - m) balloon.vy *= -1

          // The orientation rights itself; from here the balloon is poppable.
          if (balloon.dir !== CORRECT && ctx.t >= balloon.correctsAt) {
            balloon.dir = CORRECT
          }
        }

        // A corrected balloon left unpopped for too long is a miss.
        for (const balloon of balloons) {
          if (balloon.popped || balloon.dir !== CORRECT) continue
          if (ctx.t - balloon.correctsAt > (ctx.params.window_ms ?? 4000)) {
            balloon.popped = true
            ctx.record('miss', { target: CORRECT, response: 'none' })
          }
        }

        balloons = balloons.filter((b) => !b.popped)
        ctx.setPending(balloons.filter((b) => b.dir === CORRECT).length)
      },

      draw: (g, ctx) => {
        // Reference: the orientation the patient is waiting for.
        drawE(g, ctx.w / 2, ctx.size * 1.3, ctx.size * 0.9, CORRECT, ctx.target)

        for (const balloon of balloons) {
          if (balloon.popped) continue
          drawBalloon(g, balloon.x, balloon.y, ctx.size * 2.2, ctx.target)
          drawE(g, balloon.x, balloon.y, ctx.size, balloon.dir, ctx.target)
        }
      },

      pointer: (p, ctx) => {
        if (p.type !== 'down') return
        const radius = ctx.params.hit_radius_px ?? ctx.size * 1.6
        let best: Balloon | undefined
        let bestDistance = Infinity
        for (const balloon of balloons) {
          if (balloon.popped) continue
          const d = dist(p.x, p.y, balloon.x, balloon.y)
          if (d < radius && d < bestDistance) {
            bestDistance = d
            best = balloon
          }
        }
        attempt(ctx, best)
      },

      key: (event, ctx) => {
        if (event.key === ' ') attempt(ctx, nearestCorrect())
      },
    }
  }
}

export const balloonPopPursuit = makeBalloonGame({
  brief:
    'Track the floating balloons and click them, or press the spacebar, when the symbol matches the target orientation.',
  moving: true,
})

export const balloonPopSaccades = makeBalloonGame({
  brief:
    'Balloons appear away from centre. Pop one only when its symbol matches the target orientation.',
  moving: false,
})
