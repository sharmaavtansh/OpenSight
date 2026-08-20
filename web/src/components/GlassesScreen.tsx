import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { sound } from '../audio'
import { OverlayExit } from './OverlayExit'

/** Guided anaglyph calibration.
 *
 *  Three ideas carry the whole thing:
 *  - one colour on screen at a time, never two to compare;
 *  - the shades are shown as a palette, so a child points at "the last one I
 *    can see" instead of sitting through a yes/no staircase;
 *  - the instruction names the eye to cover outright, because by this point
 *    the app already knows which lens is where. */

type StepKind = 'orientation' | 'isolate' | 'choose'

interface Step {
  kind: StepKind
  eye?: 'left' | 'right'
  background?: 'black' | 'white'
  channel?: string
}

interface Plan {
  steps: Step[]
  alpha_ladder: number[]
  profiles: Record<string, string[]>
}

interface ChannelAnswers {
  background: 'black' | 'white'
  channel: string
  faintest_seen: number | null
  chosen: number | null
}

interface Result {
  usable: boolean
  saved: boolean
  reason?: string
  orientation: { left_filter: string | null; right_filter: string | null; note: string }
  channels: Record<string, Record<string, { alpha: number; isolated_below: number | null }>>
  warnings: string[]
}

const SWATCH: Record<string, string> = { red: '#ff0000', blue: '#0000ff', cyan: '#00ffff' }

/** Glasses seen face-on, with the eye to cover crossed out. */
function EyeCue({ cover, leftLens }: { cover: 'left' | 'right'; leftLens: string }) {
  const rightLens = leftLens === 'red' ? 'blue' : 'red'
  // Drawn as the patient faces the screen, so their left eye appears on the right.
  const lenses: Array<{ side: 'left' | 'right'; x: number; colour: string }> = [
    { side: 'right', x: 8, colour: SWATCH[rightLens] },
    { side: 'left', x: 112, colour: SWATCH[leftLens] },
  ]
  return (
    <svg width="220" height="80" viewBox="0 0 220 80" className="glasses__cue" aria-hidden="true">
      {lenses.map((l) => (
        <g key={l.side}>
          <rect x={l.x} y={14} width={100} height={52} rx={14} fill="#111" />
          <rect x={l.x + 9} y={22} width={82} height={36} rx={10} fill={l.colour} />
          {l.side === cover && (
            <>
              <rect x={l.x} y={14} width={100} height={52} rx={14} fill="rgba(0,0,0,0.75)" />
              <path
                d={`M${l.x + 24} 28 L${l.x + 76} 52 M${l.x + 76} 28 L${l.x + 24} 52`}
                stroke="#fff"
                strokeWidth="7"
                strokeLinecap="round"
              />
            </>
          )}
        </g>
      ))}
      <path d="M108 38h6" stroke="#111" strokeWidth="9" />
    </svg>
  )
}

export function GlassesScreen() {
  const closeScreen = useApp((s) => s.closeScreen)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [index, setIndex] = useState(0)
  const [seen, setSeen] = useState<{ right: string; left: string }>({ right: '', left: '' })
  const [channels, setChannels] = useState<ChannelAnswers[]>([])
  const [side, setSide] = useState<'left' | 'right'>(() => (Math.random() < 0.5 ? 'left' : 'right'))
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/glasses/plan')
      .then((r) => r.json())
      .then(setPlan)
      .catch((e) => setError(String(e)))
  }, [])

  if (error) return <div className="status status--error">{error}</div>
  if (!plan) return <div className="status">Loading calibration…</div>

  const step = plan.steps[index]
  // Determined in phase 1, then used to name eyes outright.
  const leftLens = seen.left === 'red' ? 'red' : seen.left ? 'blue' : 'red'

  /** Which eye sits behind this channel's lens. */
  const eyeWithLens = (channel: string): 'left' | 'right' => {
    const leftHasIt = channel === 'red' ? leftLens === 'red' : leftLens === 'blue'
    return leftHasIt ? 'left' : 'right'
  }

  const entryFor = (background: string, channel: string) =>
    channels.find((c) => c.background === background && c.channel === channel)

  const upsert = (
    background: 'black' | 'white',
    channel: string,
    patch: Partial<ChannelAnswers>,
  ) => {
    const prior = entryFor(background, channel)
    const merged: ChannelAnswers = {
      background,
      channel,
      faintest_seen: prior?.faintest_seen ?? null,
      chosen: prior?.chosen ?? null,
      ...patch,
    }
    const next = channels.filter((c) => !(c.background === background && c.channel === channel))
    next.push(merged)
    setChannels(next)
    return next
  }

  const submit = async (finished: ChannelAnswers[]) => {
    try {
      const res = await fetch('/api/glasses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          right_eye_sees: seen.right,
          left_eye_sees: seen.left,
          channels: finished,
          save: true,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const verdict = await res.json()
      sound.play(verdict.saved ? 'best' : 'error')
      setResult(verdict)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const advance = (next: ChannelAnswers[] = channels) => {
    sound.play('select')
    if (index + 1 >= plan.steps.length) void submit(next)
    else setIndex(index + 1)
  }

  const pct = Math.round((index / plan.steps.length) * 100)

  // ------------------------------------------------------------------ result
  if (result) {
    return (
      <div className="assess">
        <h1 className="assess__title">
          {result.saved ? 'Glasses calibrated' : 'Calibration not saved'}
        </h1>
        <p className="assess__lead">{result.orientation.note}</p>
        <div className="assess__grid">
          <div className={`assess__card ${result.usable ? '' : 'assess__card--flag'}`}>
            <h3>Lenses</h3>
            <dl className="assess__stats">
              <dt>Left eye</dt>
              <dd>{result.orientation.left_filter ?? 'not determined'}</dd>
              <dt>Right eye</dt>
              <dd>{result.orientation.right_filter ?? 'not determined'}</dd>
            </dl>
          </div>
          {Object.entries(result.channels).map(([background, chans]) => (
            <div className="assess__card" key={background}>
              <h3>{background} background</h3>
              <dl className="assess__stats">
                {Object.entries(chans).map(([name, m]) => (
                  <div key={name} style={{ display: 'contents' }}>
                    <dt>{name}</dt>
                    <dd>
                      using {m.alpha.toFixed(2)}
                      {m.isolated_below != null && (
                        <em> · hidden below {m.isolated_below.toFixed(2)}</em>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        {result.warnings.length > 0 && (
          <ul className="assess__notes">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {result.reason && <div className="banner">{result.reason}</div>}
        <div className="assess__actions">
          <button className="brief__play" onClick={closeScreen}>
            Done
          </button>
          <button
            className="brief__secondary"
            onClick={() => {
              setResult(null)
              setChannels([])
              setSeen({ right: '', left: '' })
              setIndex(0)
            }}
          >
            Run again
          </button>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------- orientation
  if (step.kind === 'orientation') {
    const eye = step.eye!
    const coverEye = eye === 'right' ? 'left' : 'right'
    const choose = (answer: string) => {
      setSeen((s) => ({ ...s, [eye]: answer }))
      setSide(Math.random() < 0.5 ? 'left' : 'right')
      advance()
    }
    return (
      <div className="glasses" style={{ background: '#000', color: '#fff' }}>
        <OverlayExit confirm={"Leave the glasses check? Nothing is saved until it finishes."} />
        <div className="glasses__bar">
          <div className="glasses__bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <h2 className="glasses__step">Cover your {coverEye.toUpperCase()} eye</h2>
        <p className="glasses__say">
          Wear the glasses and look with your <strong>{eye}</strong> eye only. Where is the red
          patch?
        </p>
        <div className="glasses__field">
          <div
            className={`glasses__blob glasses__blob--${side}`}
            style={{ background: `radial-gradient(circle, ${SWATCH.red} 0%, transparent 70%)` }}
          />
          <div className="glasses__fixation" style={{ background: 'currentColor' }} />
        </div>
        <div className="glasses__choices">
          <button onClick={() => choose(side === 'left' ? 'red' : 'wrong-side')}>← Left</button>
          <button onClick={() => choose(side === 'right' ? 'red' : 'wrong-side')}>Right →</button>
          <button onClick={() => choose('none')}>I cannot see it at all</button>
        </div>
        <p className="glasses__hint">
          Through the red lens it stays visible. Through the other lens it should vanish completely.
        </p>
      </div>
    )
  }

  // ---------------------------------------------------------------- palettes
  const background = step.background!
  const channel = step.channel!
  const bg = background === 'black' ? '#000' : '#fff'
  const ink = background === 'black' ? '#fff' : '#111'
  const lensEye = eyeWithLens(channel)

  const chip = (a: number, onPick: (a: number) => void) => (
    <button key={a} className="glasses__chip" onClick={() => onPick(a)} aria-label={`shade ${a}`}>
      <span
        style={{
          background: `radial-gradient(circle, ${SWATCH[channel] ?? '#888'} 0%, transparent 72%)`,
          opacity: a,
        }}
      />
    </button>
  )

  if (step.kind === 'isolate') {
    // Look with the eye that must NOT see this colour, so cover the other one.
    const coverEye = lensEye
    const lookEye = coverEye === 'left' ? 'right' : 'left'
    const answer = (faintest: number | null) =>
      advance(upsert(background, channel, { faintest_seen: faintest }))

    return (
      <div className="glasses" style={{ background: bg, color: ink }}>
        <OverlayExit confirm={"Leave the glasses check? Nothing is saved until it finishes."} />
        <div className="glasses__bar">
          <div className="glasses__bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <h2 className="glasses__step">Cover your {coverEye.toUpperCase()} eye</h2>
        <p className="glasses__say">
          Look with your <strong>{lookEye}</strong> eye — the one that should <em>not</em> see{' '}
          {channel}. Tap the faintest square you can still see.
        </p>
        <EyeCue cover={coverEye} leftLens={leftLens} />

        <div className="glasses__palette">{plan.alpha_ladder.map((a) => chip(a, answer))}</div>

        <div className="glasses__choices">
          <button onClick={() => answer(null)}>I cannot see any of them</button>
        </div>
        <p className="glasses__hint">
          {channel} on {background} · brightest on the left, faintest on the right
        </p>
      </div>
    )
  }

  // choose: pick the best-looking shade among those already proven invisible.
  const entry = entryFor(background, channel)
  const faintest = entry?.faintest_seen ?? null
  const options = plan.alpha_ladder.filter((a) => faintest === null || a < faintest)
  const coverEye = lensEye === 'left' ? 'right' : 'left'
  const pick = (a: number | null) => advance(upsert(background, channel, { chosen: a }))

  return (
    <div className="glasses" style={{ background: bg, color: ink }}>
      <OverlayExit confirm={"Leave the glasses check? Nothing is saved until it finishes."} />
      <div className="glasses__bar">
        <div className="glasses__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <h2 className="glasses__step">Cover your {coverEye.toUpperCase()} eye</h2>
      <p className="glasses__say">
        Now look with your <strong>{lensEye}</strong> eye. Pick the best, clearest {channel}.
      </p>
      <EyeCue cover={coverEye} leftLens={leftLens} />

      {options.length === 0 ? (
        <>
          <p className="glasses__say">
            None of the shades vanished for the other eye, so there is nothing safe to choose here.
          </p>
          <div className="glasses__choices">
            <button onClick={() => pick(null)}>Continue</button>
          </div>
        </>
      ) : (
        <>
          <div className="glasses__palette">{options.map((a) => chip(a, pick))}</div>
          <p className="glasses__hint">
            Every square here is already invisible to your other eye — just pick the one that looks
            best.
          </p>
        </>
      )}
    </div>
  )
}
