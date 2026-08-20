/** Synthesised sound cues.
 *
 *  Everything is generated with WebAudio rather than loaded from files: the app
 *  has to work offline, and a handful of oscillator recipes is a few hundred
 *  bytes against a folder of samples.
 *
 *  The mix is deliberately lopsided. A child may be doing this an hour a day
 *  for twelve weeks, on a task they find hard. Success is made salient; errors
 *  are quiet and low, and a `miss` - a target that expired while they were
 *  looking elsewhere - is quieter still, because that is not a mistake they
 *  made. A punishing buzz on every failure teaches avoidance, which is the
 *  opposite of what a daily therapy programme needs.
 */

export type Cue =
  // universal scoring, fired by the game engine
  | 'hit'
  | 'false_alarm'
  | 'miss'
  | 'timeout'
  | 'streak'
  // session flow
  | 'start'
  | 'warn'
  | 'end'
  | 'best'
  // per-game actions
  | 'fire'
  | 'bounce'
  | 'launch'
  | 'land'
  | 'release'
  | 'catch'
  | 'drop'
  | 'select'
  | 'swap'
  | 'clear'
  | 'connect'
  | 'pop'
  | 'flash'
  | 'reveal'
  // interface
  | 'tap'
  | 'toggle'
  | 'error'

interface Note {
  /** Hz, or [from, to] to glide. */
  freq: number | [number, number]
  /** Seconds. */
  dur: number
  /** 0-1, before the master volume. */
  gain: number
  wave?: OscillatorType
  /** Seconds to wait before this note starts. */
  at?: number
}

/** Each cue is a tiny score. Kept declarative so they are easy to retune. */
const CUES: Record<Cue, Note[]> = {
  // --- scoring -------------------------------------------------------------
  hit: [{ freq: [660, 990], dur: 0.09, gain: 0.5, wave: 'triangle' }],
  streak: [
    { freq: 660, dur: 0.07, gain: 0.45, wave: 'triangle' },
    { freq: 880, dur: 0.07, gain: 0.45, wave: 'triangle', at: 0.07 },
    { freq: 1320, dur: 0.12, gain: 0.5, wave: 'triangle', at: 0.14 },
  ],
  // Low, soft and short: enough to notice, not enough to sting.
  false_alarm: [{ freq: [220, 165], dur: 0.14, gain: 0.22, wave: 'sine' }],
  // Quieter again - the target expired, the child did not do anything wrong.
  miss: [{ freq: [150, 120], dur: 0.12, gain: 0.12, wave: 'sine' }],
  timeout: [{ freq: 300, dur: 0.05, gain: 0.12, wave: 'sine' }],

  // --- session flow --------------------------------------------------------
  start: [
    { freq: 523, dur: 0.1, gain: 0.35, wave: 'triangle' },
    { freq: 659, dur: 0.1, gain: 0.35, wave: 'triangle', at: 0.1 },
    { freq: 784, dur: 0.16, gain: 0.4, wave: 'triangle', at: 0.2 },
  ],
  warn: [
    { freq: 880, dur: 0.06, gain: 0.25, wave: 'sine' },
    { freq: 880, dur: 0.06, gain: 0.25, wave: 'sine', at: 0.16 },
  ],
  end: [
    { freq: 784, dur: 0.12, gain: 0.35, wave: 'triangle' },
    { freq: 659, dur: 0.12, gain: 0.35, wave: 'triangle', at: 0.12 },
    { freq: 523, dur: 0.24, gain: 0.4, wave: 'triangle', at: 0.24 },
  ],
  best: [
    { freq: 659, dur: 0.08, gain: 0.4, wave: 'triangle' },
    { freq: 880, dur: 0.08, gain: 0.4, wave: 'triangle', at: 0.08 },
    { freq: 1047, dur: 0.08, gain: 0.4, wave: 'triangle', at: 0.16 },
    { freq: 1319, dur: 0.2, gain: 0.45, wave: 'triangle', at: 0.24 },
  ],

  // --- per-game actions ----------------------------------------------------
  fire: [{ freq: [900, 300], dur: 0.07, gain: 0.22, wave: 'square' }],
  bounce: [{ freq: [400, 700], dur: 0.07, gain: 0.3, wave: 'sine' }],
  launch: [{ freq: [300, 800], dur: 0.12, gain: 0.3, wave: 'sine' }],
  land: [{ freq: [520, 400], dur: 0.09, gain: 0.3, wave: 'triangle' }],
  release: [{ freq: [700, 500], dur: 0.06, gain: 0.22, wave: 'sine' }],
  catch: [{ freq: [700, 1050], dur: 0.08, gain: 0.4, wave: 'triangle' }],
  drop: [{ freq: [260, 180], dur: 0.1, gain: 0.14, wave: 'sine' }],
  select: [{ freq: 620, dur: 0.04, gain: 0.2, wave: 'sine' }],
  swap: [{ freq: [500, 640], dur: 0.06, gain: 0.22, wave: 'sine' }],
  clear: [
    { freq: 784, dur: 0.06, gain: 0.4, wave: 'triangle' },
    { freq: 1047, dur: 0.1, gain: 0.4, wave: 'triangle', at: 0.06 },
  ],
  connect: [{ freq: [590, 880], dur: 0.1, gain: 0.35, wave: 'triangle' }],
  pop: [{ freq: [1200, 500], dur: 0.07, gain: 0.4, wave: 'square' }],
  flash: [{ freq: 1200, dur: 0.04, gain: 0.18, wave: 'sine' }],
  reveal: [{ freq: [520, 780], dur: 0.14, gain: 0.3, wave: 'triangle' }],

  // --- interface -----------------------------------------------------------
  tap: [{ freq: 520, dur: 0.03, gain: 0.16, wave: 'sine' }],
  toggle: [{ freq: 700, dur: 0.04, gain: 0.16, wave: 'sine' }],
  error: [{ freq: [240, 180], dur: 0.16, gain: 0.24, wave: 'sine' }],
}

class SoundBoard {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private enabled = true
  private volume = 0.7

  /** Browsers refuse to start audio before a gesture, so the context is
   *  created on first use and resumed if the tab suspended it. */
  private ready(): AudioContext | null {
    if (!this.enabled) return null
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.context = new Ctor()
      this.master = this.context.createGain()
      this.master.connect(this.context.destination)
    }
    if (this.context.state === 'suspended') void this.context.resume()
    if (this.master) this.master.gain.value = this.volume
    return this.context
  }

  configure(options: { enabled?: boolean; volume?: number }) {
    if (options.enabled !== undefined) this.enabled = options.enabled
    if (options.volume !== undefined) this.volume = Math.max(0, Math.min(1, options.volume))
    if (this.master) this.master.gain.value = this.volume
  }

  play(cue: Cue) {
    const context = this.ready()
    if (!context || !this.master) return
    const now = context.currentTime
    for (const note of CUES[cue] ?? []) {
      const osc = context.createOscillator()
      const gain = context.createGain()
      osc.type = note.wave ?? 'sine'
      const startAt = now + (note.at ?? 0)
      if (Array.isArray(note.freq)) {
        osc.frequency.setValueAtTime(note.freq[0], startAt)
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(1, note.freq[1]),
          startAt + note.dur,
        )
      } else {
        osc.frequency.setValueAtTime(note.freq, startAt)
      }
      // Short attack then exponential decay: a click-free blip.
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(note.gain, startAt + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.dur)
      osc.connect(gain)
      gain.connect(this.master)
      osc.start(startAt)
      osc.stop(startAt + note.dur + 0.02)
    }
  }
}

export const sound = new SoundBoard()
