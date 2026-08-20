/* Headless exercise of the tracing toolbar.
 *
 * The toolbar is drawn on the canvas, so its hit boxes are computed rather than
 * declared in the DOM. That makes "is what I can tap the same as what I can
 * see" a real question, and one worth answering without eyes.
 */
// The toolbar plays a cue on tap, and the sound board reaches for window /
// AudioContext. Neither exists in Node; stub them before the module graph is
// touched so the harness exercises the game rather than the browser.
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

type Seg = { style: string; pts: Array<{ x: number; y: number }> }

function stubContext() {
  const noop = () => undefined
  const segs: Seg[] = []
  let current: Array<{ x: number; y: number }> = []
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
    closePath: noop,
    arc: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    quadraticCurveTo: noop,
    fill: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    translate: noop,
    rotate: noop,
    clearRect: noop,
    measureText: () => ({ width: 10 }),
  }
  g.beginPath = () => {
    current = []
  }
  g.moveTo = (x: number, y: number) => current.push({ x, y })
  g.lineTo = (x: number, y: number) => current.push({ x, y })
  g.stroke = () => {
    segs.push({ style: String(g.strokeStyle), pts: current.slice() })
  }
  return { g: g as unknown as CanvasRenderingContext2D, segs }
}

/** Marks the child made: drawn in the target colour, and not the guide, the
 *  completed trace or the toolbar (which lives in the left-hand column). */
const childMarks = (segs: Seg[], targetColour: string, toolbarX: number) =>
  segs.filter(
    (s) => s.style === targetColour && s.pts.length > 1 && s.pts.every((p) => p.x > toolbarX * 2.2),
  )

/** All geometry in the drawing area, whatever its colour - used to tell one
 *  traced shape from another. */
const artwork = (segs: Seg[], toolbarX: number) =>
  segs.filter((s) => s.pts.length > 2 && s.pts.every((p) => p.x > toolbarX * 2.2))

function makeCtx() {
  const log: Array<{ outcome: string }> = []
  let seed = 999
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const ctx = {
    w: 1000,
    h: 640,
    t: 0,
    dt: 1 / 60,
    params: { hit_radius_px: 40 },
    palette: {},
    stimuli: {},
    rnd,
    size: 28,
    pointer: { x: 0, y: 0, type: 'move', down: false },
    target: 'rgba(255, 0, 0, 0.57)',
    suppressed: 'rgba(0, 0, 255, 1)',
    fusion: '#e8e8e8',
    background: '#000000',
    record: (outcome: string) => log.push({ outcome }),
    prompt: () => undefined,
    flashError: () => undefined,
    setPending: () => undefined,
  } as unknown as Ctx
  return { ctx, log }
}

const down = (x: number, y: number): Pointer => ({ x, y, type: 'down', down: true })
const move = (x: number, y: number): Pointer => ({ x, y, type: 'move', down: true })
const up = (x: number, y: number): Pointer => ({ x, y, type: 'up', down: false })

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail = '') => {
  ;(ok ? pass++ : fail++,
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -> ' + detail : ''}`))
}

console.log('=== trace_magic: picker, pen, eraser ===')
const game = GAMES.trace_magic()
const { ctx } = makeCtx()
const { g, segs } = stubContext()

game.init?.(ctx)
const TARGET = 'rgba(255, 0, 0, 0.57)'
const frame = () => {
  segs.length = 0
  game.draw(g, ctx)
}
frame()
check('init and first frame do not throw', true)

// The toolbar column: buttons sit at x = r*2 with r from the smaller viewport
// dimension, so recompute the same geometry the game uses.
const r = Math.max(16, Math.min(ctx.w, ctx.h) * 0.032)
const bx = r * 2
const gap = r * 2.5
const shapeCount = 7
const shapeYs = Array.from({ length: shapeCount }, (_, i) => r * 2 + i * gap)
const toolPenY = r * 2 + shapeCount * gap + gap * 0.4
const toolEraserY = toolPenY + gap
const clearY = toolEraserY + gap

const drawStroke = (x0: number, y0: number, dx: number, dy: number, n: number) => {
  game.pointer?.(down(x0, y0), ctx)
  for (let i = 1; i <= n; i++) game.pointer?.(move(x0 + dx * i, y0 + dy * i), ctx)
  game.pointer?.(up(x0 + dx * n, y0 + dy * n), ctx)
}

// --- the pen --------------------------------------------------------------
frame()
const marksAtStart = childMarks(segs, TARGET, bx).length
drawStroke(600, 260, 4, 3, 30)
frame()
const afterOne = childMarks(segs, TARGET, bx).length
check('pen leaves a mark that survives pointer-up', afterOne > marksAtStart, `${marksAtStart} -> ${afterOne}`)

drawStroke(520, 460, 5, 0, 25)
frame()
const afterTwo = childMarks(segs, TARGET, bx).length
check('a second stroke does not replace the first', afterTwo > afterOne, `${afterOne} -> ${afterTwo}`)

// --- the eraser -----------------------------------------------------------
game.pointer?.(down(bx, toolEraserY), ctx)
for (let i = 0; i <= 25; i++) game.pointer?.(move(520 + 5 * i, 460), ctx)
frame()
const afterErase = childMarks(segs, TARGET, bx).length
check('eraser removes the mark it is rubbed over', afterErase < afterTwo, `${afterTwo} -> ${afterErase}`)
check('it does not remove the other mark', afterErase >= afterOne, `${afterErase} still present`)

// The guide outline is drawn in the fusion colour and must be untouched.
check(
  'guide outline survives the eraser',
  segs.some((s) => s.style === '#e8e8e8' && s.pts.length > 2),
)

// --- clear ----------------------------------------------------------------
game.pointer?.(down(bx, toolPenY), ctx)
drawStroke(700, 200, 3, 0, 20)
frame()
const beforeClear = childMarks(segs, TARGET, bx).length
game.pointer?.(down(bx, clearY), ctx)
frame()
const afterClear = childMarks(segs, TARGET, bx).length
check('clear removes every child mark', afterClear === 0 && beforeClear > 0, `${beforeClear} -> ${afterClear}`)

// --- the shape picker -----------------------------------------------------
// Fingerprint the traced outline itself: a different shape must produce a
// different path, not merely a different button position.
const fingerprints = new Map<number, string>()
for (let i = 0; i < shapeCount; i++) {
  game.pointer?.(down(bx, shapeYs[i]), ctx)
  frame()
  const outline = artwork(segs, bx).sort((a, b) => b.pts.length - a.pts.length)[0]
  const box = outline
    ? `${outline.pts.length}:${Math.round(Math.min(...outline.pts.map((p) => p.y)))}:${Math.round(
        Math.max(...outline.pts.map((p) => p.x)),
      )}`
    : 'none'
  fingerprints.set(i, box)
}
const distinct = new Set(fingerprints.values())
check(
  'each shape button traces a different shape',
  distinct.size === shapeCount,
  `${distinct.size}/${shapeCount} distinct outlines`,
)
check('no shape button leaves an empty canvas', ![...fingerprints.values()].includes('none'))

// --- a toolbar tap must never leave a mark --------------------------------
game.pointer?.(down(bx, clearY), ctx)
frame()
const cleanBase = childMarks(segs, TARGET, bx).length
game.pointer?.(down(bx, toolPenY), ctx)
game.pointer?.(up(bx, toolPenY), ctx)
game.pointer?.(down(bx, toolEraserY), ctx)
game.pointer?.(up(bx, toolEraserY), ctx)
frame()
check(
  'tapping a tool never draws',
  childMarks(segs, TARGET, bx).length === cleanBase,
  `${cleanBase} -> ${childMarks(segs, TARGET, bx).length}`,
)

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
