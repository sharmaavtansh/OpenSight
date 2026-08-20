import { sound } from '../audio'
import type { GameParams, Outcome, Palette, SessionPlan, Stimuli, Trial } from '../types'

/** Deterministic RNG so a session seeded by the server replays identically. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Pointer {
  x: number
  y: number
  type: 'down' | 'move' | 'up'
  down: boolean
}

/** Everything a game module is handed on each frame. */
export interface Ctx {
  w: number
  h: number
  /** Elapsed session time, ms. */
  t: number
  /** Frame delta, seconds. */
  dt: number
  params: GameParams
  palette: Palette
  stimuli: Stimuli
  rnd: () => number
  /** Optotype height in CSS px, straight from the acuity calculation. */
  size: number
  pointer: Pointer
  /** Colour only the treated eye can see. */
  target: string
  /** Colour only the fellow eye can see - anti-suppression cues. */
  suppressed: string
  /** Colour both eyes see - holds fusion. */
  fusion: string
  background: string
  record: (outcome: Outcome, extra?: Partial<Trial>) => void
  prompt: (text: string) => void
  flashError: () => void
  /** Targets still to be found on the current board, shown in the HUD. */
  setPending: (count: number) => void
}

export interface Game {
  /** Short instruction shown before the clock starts. */
  brief: string
  init?: (ctx: Ctx) => void
  update: (ctx: Ctx) => void
  draw: (g: CanvasRenderingContext2D, ctx: Ctx) => void
  pointer?: (p: Pointer, ctx: Ctx) => void
  key?: (event: KeyboardEvent, ctx: Ctx) => void
}

export type GameFactory = () => Game

// --------------------------------------------------------------- drawing --

/** Tumbling E on the standard 5x5 optotype grid.
 *  `dir` is the direction the open side faces. */
export function drawE(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  dir: string,
  colour: string,
) {
  const unit = size / 5
  const rotation = { right: 0, down: 90, left: 180, up: 270 }[dir] ?? 0
  g.save()
  g.translate(x, y)
  g.rotate((rotation * Math.PI) / 180)
  g.translate(-size / 2, -size / 2)
  g.fillStyle = colour
  // Spine plus three arms; the open side faces +x before rotation.
  g.fillRect(0, 0, unit, size)
  g.fillRect(0, 0, size, unit)
  g.fillRect(0, 2 * unit, size, unit)
  g.fillRect(0, 4 * unit, size, unit)
  g.restore()
}

export function drawLetter(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  text: string,
  colour: string,
) {
  g.save()
  g.fillStyle = colour
  // Sloan first: it is the actual chart optotype, drawn on the 5x5 grid the
  // acuity maths assumes. Non-Sloan glyphs fall back automatically.
  g.font = `${size}px Sloan, "Bahnschrift", "Arial Black", system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, x, y)
  g.restore()
}

/** Prose and multi-letter words. Deliberately NOT Sloan: the chart face has
 *  only ten uppercase optotypes, so words render half in Sloan and half in a
 *  fallback, which looks broken and implies chart geometry where there is none.
 *  Optotypes use drawLetter; everything else uses this. */
export function drawText(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  text: string,
  colour: string,
) {
  g.save()
  g.fillStyle = colour
  g.font = `600 ${size}px "Bahnschrift", "Segoe UI", system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, x, y)
  g.restore()
}

export function drawShape(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  shape: string,
  colour: string,
) {
  const r = size / 2
  g.save()
  g.fillStyle = colour
  g.strokeStyle = colour
  g.lineWidth = Math.max(2, size / 8)
  g.beginPath()
  switch (shape) {
    case 'square':
      g.rect(x - r, y - r, size, size)
      break
    case 'triangle':
      g.moveTo(x, y - r)
      g.lineTo(x + r, y + r)
      g.lineTo(x - r, y + r)
      g.closePath()
      break
    case 'diamond':
      g.moveTo(x, y - r)
      g.lineTo(x + r, y)
      g.lineTo(x, y + r)
      g.lineTo(x - r, y)
      g.closePath()
      break
    case 'cross':
      g.rect(x - r / 3, y - r, (2 * r) / 3, size)
      g.rect(x - r, y - r / 3, size, (2 * r) / 3)
      break
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? r : r / 2.3
        const angle = (Math.PI / 5) * i - Math.PI / 2
        const px = x + Math.cos(angle) * radius
        const py = y + Math.sin(angle) * radius
        i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)
      }
      g.closePath()
      break
    }
    default:
      g.arc(x, y, r, 0, Math.PI * 2)
  }
  g.fill()
  g.restore()
}

export function drawBalloon(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colour: string,
  label?: string,
  /** Defaults to the balloon's own colour rather than white: a hardcoded
   *  white label would ignore the calibrated channel and be visible to both
   *  eyes. */
  labelColour?: string,
) {
  const r = size / 2
  g.save()
  g.fillStyle = colour
  g.beginPath()
  g.ellipse(x, y, r * 0.82, r, 0, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(x, y + r)
  g.lineTo(x - r * 0.16, y + r * 1.22)
  g.lineTo(x + r * 0.16, y + r * 1.22)
  g.closePath()
  g.fill()
  g.strokeStyle = colour
  g.lineWidth = Math.max(1, size / 22)
  g.beginPath()
  g.moveTo(x, y + r * 1.22)
  g.quadraticCurveTo(x + r * 0.4, y + r * 1.7, x, y + r * 2.1)
  g.stroke()
  g.restore()
  if (label) drawLetter(g, x, y, size * 0.55, label, labelColour ?? colour)
}

export function drawSmiley(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  mood: string,
  colour: string,
) {
  const r = size / 2
  g.save()
  g.strokeStyle = colour
  g.fillStyle = colour
  g.lineWidth = Math.max(1.5, size / 12)
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.stroke()
  const eye = Math.max(1.4, size / 14)
  g.beginPath()
  g.arc(x - r * 0.34, y - r * 0.26, eye, 0, Math.PI * 2)
  g.arc(x + r * 0.34, y - r * 0.26, eye, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  switch (mood) {
    case 'sad':
      g.arc(x, y + r * 0.62, r * 0.46, Math.PI * 1.15, Math.PI * 1.85)
      break
    case 'neutral':
      g.moveTo(x - r * 0.4, y + r * 0.36)
      g.lineTo(x + r * 0.4, y + r * 0.36)
      break
    case 'surprised':
      g.arc(x, y + r * 0.36, r * 0.22, 0, Math.PI * 2)
      break
    case 'grin':
      g.arc(x, y + r * 0.06, r * 0.52, Math.PI * 0.08, Math.PI * 0.92)
      break
    default:
      g.arc(x, y + r * 0.14, r * 0.46, Math.PI * 0.15, Math.PI * 0.85)
  }
  g.stroke()
  g.restore()
}

/** Moods the Smiley activity draws from. Several are mixed and picked at
 *  random, so the target is not predictable from the set. */
export const SMILEY_MOODS = ['happy', 'sad', 'neutral', 'surprised', 'grin']

export function drawSlant(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  degrees: number,
  colour: string,
) {
  const rad = (degrees * Math.PI) / 180
  const half = size / 2
  g.save()
  g.strokeStyle = colour
  g.lineWidth = Math.max(2, size / 7)
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(x - Math.cos(rad) * half, y - Math.sin(rad) * half)
  g.lineTo(x + Math.cos(rad) * half, y + Math.sin(rad) * half)
  g.stroke()
  g.restore()
}

/** Apply a Michelson-style contrast level to a colour against the background.
 *
 *  The source colour's alpha is preserved. That alpha is the calibrated
 *  leakage null, so dropping it here would make the stimulus visible to the
 *  eye that must not see it - the exact failure the colour calibration exists
 *  to prevent. */
export function atContrast(colour: string, background: string, contrast: number): string {
  const parse = (value: string): [number, number, number, number] => {
    if (value.startsWith('rgba') || value.startsWith('rgb')) {
      const parts = value.match(/[\d.]+/g) ?? []
      return [
        Number(parts[0]) || 0,
        Number(parts[1]) || 0,
        Number(parts[2]) || 0,
        parts[3] === undefined ? 1 : Number(parts[3]),
      ]
    }
    const hex = value.replace('#', '')
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
    return [r, g, b, 1]
  }
  const fg = parse(colour)
  const bg = parse(background)
  // Clamped: a contrast above 1 produced a channel over 255, which the
  // browser pins silently - two different contrasts could then render as
  // the same colour, and one of them would score as wrong.
  const mixed = [0, 1, 2].map((i) =>
    Math.max(0, Math.min(255, Math.round(bg[i] + (fg[i] - bg[i]) * contrast))),
  )
  return `rgba(${mixed[0]}, ${mixed[1]}, ${mixed[2]}, ${fg[3]})`
}

/** Bar patterns for Pattern Matching: three rows, each row a run of blocks.
 *  A pattern is a 3x3 binary grid; contiguous runs in a row render as one bar,
 *  which is what produces the mix of long, split and triple bars. */
export const BAR_PATTERNS: number[][][] = [
  [[1,1,1],[0,1,1],[1,1,1]],
  [[1,1,0],[1,1,0],[1,1,0]],
  [[1,0,1],[1,0,1],[1,0,1]],
  [[1,1,1],[0,1,0],[1,1,1]],
  [[1,0,0],[1,1,1],[1,0,0]],
  [[1,1,1],[1,1,0],[1,1,1]],
  [[0,1,1],[1,1,1],[0,1,1]],
  [[1,1,0],[0,1,1],[1,1,0]],
  [[1,0,1],[1,1,1],[1,0,1]],
  [[1,1,1],[1,0,1],[1,1,1]],
]

export function drawBarPattern(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  pattern: number[][],
  colour: string,
) {
  const cell = size / 3
  const barH = cell * 0.42
  const gapY = cell * 0.98
  g.save()
  g.fillStyle = colour
  pattern.forEach((row, r) => {
    const top = y - gapY + r * gapY - barH / 2
    let c = 0
    while (c < row.length) {
      if (!row[c]) {
        c += 1
        continue
      }
      let run = 0
      while (c + run < row.length && row[c + run]) run += 1
      g.fillRect(x - size / 2 + c * cell, top, run * cell - cell * 0.16, barH)
      c += run
    }
  })
  g.restore()
}

/** Scale a colour's brightness while preserving its alpha.
 *  Used where a game wants tonal variety without inventing hues of its own -
 *  the calibrated channel still governs, so nothing leaks to the fellow eye. */
export function tint(colour: string, factor: number): string {
  const value = colour.trim()
  let r = 0
  let g = 0
  let b = 0
  let a = 1
  if (value.startsWith('rgb')) {
    const parts = value.match(/[\d.]+/g) ?? []
    r = Number(parts[0]) || 0
    g = Number(parts[1]) || 0
    b = Number(parts[2]) || 0
    a = parts[3] === undefined ? 1 : Number(parts[3])
  } else {
    const hex = value.replace('#', '')
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
    ;[r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  }
  const k = Math.max(0, factor)
  return `rgba(${Math.min(255, Math.round(r * k))}, ${Math.min(255, Math.round(g * k))}, ${Math.min(
    255,
    Math.round(b * k),
  )}, ${a})`
}

/** Top-down car.
 *
 *  Drawn in a single colour with the windows, mirrors and wheel arches cut
 *  back out in the background colour. A second hue would land in the other
 *  anaglyph channel and be visible to the wrong eye, so every detail here is
 *  negative space rather than paint. */
export function drawCar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colour: string,
  background: string,
) {
  const w = size * 1.25
  const h = size * 2.3
  const left = x - w / 2
  const top = y - h / 2

  g.save()
  g.fillStyle = colour

  // Body: a rounded shell, narrower at the nose than the tail.
  g.beginPath()
  g.moveTo(x, top)
  g.bezierCurveTo(left + w * 0.94, top, left + w, top + h * 0.22, left + w * 0.97, top + h * 0.42)
  g.lineTo(left + w * 0.97, top + h * 0.82)
  g.bezierCurveTo(left + w, top + h * 0.97, left + w * 0.86, top + h, x, top + h)
  g.bezierCurveTo(left + w * 0.14, top + h, left, top + h * 0.97, left + w * 0.03, top + h * 0.82)
  g.lineTo(left + w * 0.03, top + h * 0.42)
  g.bezierCurveTo(left, top + h * 0.22, left + w * 0.06, top, x, top)
  g.closePath()
  g.fill()

  // Wing mirrors, just behind the nose.
  const mirror = size * 0.2
  g.fillRect(left - mirror * 0.55, top + h * 0.28, mirror, mirror * 0.62)
  g.fillRect(left + w - mirror * 0.45, top + h * 0.28, mirror, mirror * 0.62)

  // Glass and wheel arches, cut back to the background.
  g.fillStyle = background
  const inset = w * 0.16
  // Windscreen.
  g.beginPath()
  g.moveTo(left + inset * 1.5, top + h * 0.3)
  g.lineTo(left + w - inset * 1.5, top + h * 0.3)
  g.lineTo(left + w - inset, top + h * 0.45)
  g.lineTo(left + inset, top + h * 0.45)
  g.closePath()
  g.fill()
  // Roof / rear window.
  g.beginPath()
  g.moveTo(left + inset, top + h * 0.56)
  g.lineTo(left + w - inset, top + h * 0.56)
  g.lineTo(left + w - inset * 1.4, top + h * 0.72)
  g.lineTo(left + inset * 1.4, top + h * 0.72)
  g.closePath()
  g.fill()
  // Wheel arches, so the silhouette reads as wheels rather than a slab.
  const wheelW = w * 0.1
  const wheelH = h * 0.13
  g.fillRect(left - wheelW * 0.2, top + h * 0.16, wheelW, wheelH)
  g.fillRect(left + w - wheelW * 0.8, top + h * 0.16, wheelW, wheelH)
  g.fillRect(left - wheelW * 0.2, top + h * 0.74, wheelW, wheelH)
  g.fillRect(left + w - wheelW * 0.8, top + h * 0.74, wheelW, wheelH)
  g.restore()
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

// ---------------------------------------------------------------- runner --

export interface HudState {
  remaining: number
  score: number
  pending: number
  invalid: number
}

export interface RunnerCallbacks {
  onTick: (hud: HudState) => void
  onPrompt: (text: string) => void
  onFinish: (trials: Trial[], elapsedS: number) => void
}

/** Owns the canvas, the clock and the trial log. Game modules stay pure
 *  update/draw functions and never touch the DOM or the network. */
export class Runner {
  private raf = 0
  private last = 0
  private startedAt = 0
  private trials: Trial[] = []
  private pointer: Pointer = { x: -1, y: -1, type: 'move', down: false }
  private errorFlashUntil = 0
  private pending = 0
  /** Consecutive hits, so a run of them can be rewarded distinctly. */
  private streak = 0
  private ctx: Ctx
  private running = false

  private canvas: HTMLCanvasElement
  private game: Game
  private plan: SessionPlan
  private callbacks: RunnerCallbacks
  private visualErrorFeedback: boolean

  constructor(
    canvas: HTMLCanvasElement,
    game: Game,
    plan: SessionPlan,
    callbacks: RunnerCallbacks,
    visualErrorFeedback: boolean,
  ) {
    this.canvas = canvas
    this.game = game
    this.plan = plan
    this.callbacks = callbacks
    this.visualErrorFeedback = visualErrorFeedback
    const rect = canvas.getBoundingClientRect()
    this.ctx = {
      w: rect.width,
      h: rect.height,
      t: 0,
      dt: 0,
      params: plan.params as GameParams,
      palette: plan.palette,
      stimuli: plan.stimuli as Stimuli,
      rnd: mulberry32(plan.seed),
      size: plan.params.optotype_px,
      pointer: this.pointer,
      target: plan.palette.target,
      suppressed: plan.palette.suppressed,
      fusion: plan.palette.fusion,
      background: plan.palette.background,
      record: (outcome, extra) => this.record(outcome, extra),
      prompt: (text) => this.callbacks.onPrompt(text),
      flashError: () => {
        if (this.visualErrorFeedback) this.errorFlashUntil = this.ctx.t + 220
      },
      setPending: (count) => {
        this.pending = count
      },
    }
  }

  start() {
    this.resize()
    this.game.init?.(this.ctx)
    this.running = true
    this.startedAt = performance.now()
    this.last = this.startedAt
    this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  finish() {
    this.stop()
    this.callbacks.onFinish(this.trials, (performance.now() - this.startedAt) / 1000)
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    // A hidden or not-yet-laid-out container measures 0, which would leave the
    // canvas with no backing store and nothing would ever draw. Fall back to
    // the viewport so the game stays renderable until real layout arrives.
    const width = rect.width || this.canvas.clientWidth || window.innerWidth || 1280
    const height = rect.height || this.canvas.clientHeight || window.innerHeight || 720
    this.canvas.width = Math.max(1, Math.round(width * dpr))
    this.canvas.height = Math.max(1, Math.round(height * dpr))
    const g = this.canvas.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.ctx.w = width
    this.ctx.h = height
  }

  handlePointer(event: PointerEvent, type: Pointer['type']) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = event.clientX - rect.left
    this.pointer.y = event.clientY - rect.top
    this.pointer.type = type
    if (type === 'down') this.pointer.down = true
    if (type === 'up') this.pointer.down = false
    this.game.pointer?.(this.pointer, this.ctx)
  }

  handleKey(event: KeyboardEvent) {
    this.game.key?.(event, this.ctx)
  }

  private record(outcome: Outcome, extra?: Partial<Trial>) {
    this.trials.push({
      idx: this.trials.length,
      t_ms: this.ctx.t,
      outcome,
      ...extra,
    })

    // One hook here covers every activity, since they all score through record().
    if (outcome === 'hit') {
      this.streak += 1
      sound.play(this.streak > 0 && this.streak % 3 === 0 ? 'streak' : 'hit')
    } else {
      this.streak = 0
      sound.play(outcome)
    }
    // Only a wrong action is worth flashing. A target that simply timed out
    // while the patient was looking elsewhere is not an error they made, and
    // flashing on it leaves the border lit almost permanently.
    if (outcome === 'false_alarm') this.ctx.flashError()
  }

  private get score(): number {
    const hits = this.trials.filter((t) => t.outcome === 'hit').length
    const falseAlarms = this.trials.filter((t) => t.outcome === 'false_alarm').length
    return Math.max(0, hits * 10 - falseAlarms * 3)
  }

  private frame = (now: number) => {
    if (!this.running) return
    this.ctx.dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now
    this.ctx.t = now - this.startedAt

    const remaining = this.plan.duration_s - this.ctx.t / 1000
    if (remaining <= 0) {
      this.finish()
      return
    }

    this.game.update(this.ctx)

    const g = this.canvas.getContext('2d')!
    g.fillStyle = this.ctx.background
    g.fillRect(0, 0, this.ctx.w, this.ctx.h)
    this.game.draw(g, this.ctx)

    if (this.ctx.t < this.errorFlashUntil) {
      const strength = (this.errorFlashUntil - this.ctx.t) / 220
      g.strokeStyle = `rgba(255, 60, 60, ${0.55 * strength})`
      g.lineWidth = 8
      g.strokeRect(5, 5, this.ctx.w - 10, this.ctx.h - 10)
    }

    this.callbacks.onTick({
      remaining,
      score: this.score,
      pending: this.pending,
      invalid: this.trials.filter((t) => t.outcome === 'false_alarm').length,
    })
    this.raf = requestAnimationFrame(this.frame)
  }
}
