import { useCallback, useEffect, useRef, useState } from 'react'
import { PageBar } from './PageBar'
import { useApp } from '../store'
import { sound } from '../audio'

type Direction = 'right' | 'down' | 'left' | 'up'

interface Trial {
  seq: number
  eye: 'left' | 'right'
  condition: 'isolated' | 'crowded'
  denominator: number
  snellen: string
  phase: 'screen' | 'threshold'
  direction: Direction
  optotype_px: number
  stroke_px: number
  renderable: boolean
  flanker_gap_px: number
}

interface Report {
  left: EyeSummary
  right: EyeSummary
  amblyopic_eye: string | null
  interocular_difference: number
  iod_flagged: boolean
  baseline_logmar: number
  baseline_snellen: string
  at_ceiling: boolean
  targets: {
    meaningful_logmar: number | null
    meaningful_snellen: string | null
    success_logmar: number | null
    success_snellen: string | null
    iod_goal_logmar: number
  }
  measurement_noise_logmar: number
  notes: string[]
}

interface EyeSummary {
  eye: string
  isolated_logmar: number
  isolated_snellen: string
  crowded_logmar: number
  crowded_snellen: string
  crowding_ratio: number
}

const ROTATION: Record<Direction, number> = { right: 0, down: 90, left: 180, up: 270 }
const KEYS: Record<string, Direction> = {
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowUp: 'up',
}

/** A tumbling E drawn to the same 5x5 optotype grid the acuity maths assumes. */
function TumblingE({ size, direction }: { size: number; direction: Direction }) {
  return (
    <svg width={size} height={size} viewBox="0 0 5 5" aria-label={`E opening ${direction}`}>
      <g transform={`rotate(${ROTATION[direction]} 2.5 2.5)`}>
        <path d="M0 0h5v1H1v1h3.4v1H1v1h4v1H0z" fill="currentColor" />
      </g>
    </svg>
  )
}

interface Plan {
  indicated: boolean
  headline: string
  treated_eye: string | null
  therapy: string | null
  mode_id: string | null
  acuity?: { start_denominator: number; start_snellen: string; threshold_snellen: string }
  difficulty?: 'easy' | 'medium' | 'hard'
  duration_min?: number
  dose?: {
    daily_minutes: number
    sessions_per_day: number
    days_per_week: number
    programme_weeks: number
    total_hours: number
  }
  emphasis?: string[]
  rationale: string[]
  review: string
}

export function AssessmentScreen() {
  const setScreen = useApp((s) => s.setScreen)
  const applyPlan = useApp((s) => s.applyPlan)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [phase, setPhase] = useState<'intro' | 'running' | 'done'>('intro')
  const [trial, setTrial] = useState<Trial | null>(null)
  const [assessmentId, setAssessmentId] = useState<string | null>(null)
  const [progress, setProgress] = useState({ runs_complete: 0, runs_total: 4 })
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [measuredAt, setMeasuredAt] = useState<string | null>(null)
  const shownAt = useRef(0)

  /** Leaving mid-run throws away a part-finished measurement, so it asks first.
   *  Registered in the capture phase to beat the app-wide Escape handler, which
   *  would otherwise walk out of a running test without a word. */
  const abandon = () => {
    if (!window.confirm('Stop the vision test? The part-finished measurement is discarded.')) return
    sound.play('tap')
    setScreen('therapy')
  }
  useEffect(() => {
    if (phase !== 'running') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      abandon()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [phase])

  // Opening the test when a baseline already exists should show that result,
  // not a blank intro as though nothing had ever been measured.
  useEffect(() => {
    let cancelled = false
    fetch('/api/assessments/latest/plan')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        setReport(d.report)
        setPlan(d.plan)
        setMeasuredAt(d.measured_at)
        setPhase('done')
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const start = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'baseline', device_pixel_ratio: window.devicePixelRatio || 1 }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setAssessmentId(data.assessment_id)
      sound.play('start')
      setTrial(data.trial)
      setProgress(data.progress)
      shownAt.current = performance.now()
      setPhase('running')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const answer = useCallback(
    async (direction: Direction) => {
      if (!assessmentId || busy) return
      setBusy(true)
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            direction,
            rt_ms: performance.now() - shownAt.current,
            device_pixel_ratio: window.devicePixelRatio || 1,
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        setProgress(data.progress)
        // Registering the answer, then the eye-swap prompt if the run changed.
        sound.play('select')
        if (data.trial && trial && data.trial.eye !== trial.eye) sound.play('reveal')
        if (data.complete) {
          setReport(data.report)
          setTrial(null)
          setPhase('done')
          sound.play('end')
          // The plan is derived server-side from the report we just produced.
          try {
            const planRes = await fetch('/api/assessments/latest/plan')
            if (planRes.ok) setPlan((await planRes.json()).plan)
          } catch {
            /* the report still stands without a plan */
          }
        } else {
          setTrial(data.trial)
          shownAt.current = performance.now()
        }
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [assessmentId, busy],
  )

  useEffect(() => {
    if (phase !== 'running') return
    const onKey = (e: KeyboardEvent) => {
      const direction = KEYS[e.key]
      if (!direction) return
      e.preventDefault()
      void answer(direction)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, answer])

  // ------------------------------------------------------------------ intro
  if (phase === 'intro') {
    return (
      <div className="assess">
        <PageBar title="Vision test" />
        <h1 className="assess__title">Baseline vision test</h1>
        <p className="assess__lead">
          This measures where vision starts, so improvement from therapy can be judged against
          something real rather than a feeling.
        </p>

        <div className="assess__grid">
          <div className="assess__card">
            <h3>What happens</h3>
            <p>
              A letter <strong>E</strong> appears, pointing one of four ways. Press the arrow key
              that matches the direction it opens. If you cannot tell, guess — the test expects it.
            </p>
            <p>
              It gets smaller as you go. Four short runs: <strong>right eye</strong> then{' '}
              <strong>left eye</strong>, each with a clear letter and then a crowded one. About
              three minutes.
            </p>
          </div>
          <div className="assess__card">
            <h3>How it is scored</h3>
            <p>
              Five optotypes per size, 0.02 logMAR credit each — the ETDRS letter-by-letter
              convention, which has lower test-retest variability than scoring whole lines.
            </p>
            <p>
              It brackets your level first with single letters, then measures around it, so you are
              not made to work through sizes you can read easily.
            </p>
          </div>
          <div className="assess__card">
            <h3>Before you start</h3>
            <ul>
              <li>Wear your usual glasses or contacts.</li>
              <li>Sit at your normal viewing distance.</li>
              <li>Cover the eye the screen names — do not squint or peek.</li>
            </ul>
          </div>
        </div>

        {error && <div className="banner">{error}</div>}

        <div className="assess__actions">
          <button className="brief__play" onClick={() => void start()} disabled={busy}>
            {busy ? 'Starting…' : 'Start test'}
          </button>
          <button className="brief__secondary" onClick={() => setScreen('therapy')}>
            Back
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- running
  if (phase === 'running' && trial) {
    const pct = Math.round((progress.runs_complete / progress.runs_total) * 100)
    const cover = trial.eye === 'right' ? 'LEFT' : 'RIGHT'
    const gap = trial.flanker_gap_px
    const bar = Math.max(2, trial.stroke_px)

    return (
      <div className="assess assess--test">
        <div className="assess__status">
          <span>
            Cover your <strong>{cover}</strong> eye
          </span>
          <span>{trial.condition === 'crowded' ? 'Crowded' : 'Single letter'}</span>
          <span>{trial.snellen}</span>
          <span className="assess__phase">{trial.phase === 'screen' ? 'finding level' : 'measuring'}</span>
        </div>

        <div className="assess__bar">
          <div className="assess__bar-fill" style={{ width: `${pct}%` }} />
        </div>

        <button className="assess__quit" onClick={abandon}>
          Stop the test
        </button>

        {!trial.renderable && (
          <div className="banner">
            This size is below what the screen can show accurately at the current calibration.
          </div>
        )}

        <div className="assess__stage">
          <div className="assess__optotype" style={{ gap: `${gap}px` }}>
            {trial.condition === 'crowded' && (
              <span className="assess__flank" style={{ width: bar, height: trial.optotype_px }} />
            )}
            <TumblingE size={trial.optotype_px} direction={trial.direction} />
            {trial.condition === 'crowded' && (
              <span className="assess__flank" style={{ width: bar, height: trial.optotype_px }} />
            )}
          </div>
        </div>

        <div className="assess__pad">
          {(['left', 'up', 'down', 'right'] as Direction[]).map((d) => (
            <button
              key={d}
              className={`assess__key assess__key--${d}`}
              onClick={() => void answer(d)}
              disabled={busy}
              aria-label={`E opens ${d}`}
            >
              {{ left: '←', up: '↑', down: '↓', right: '→' }[d]}
            </button>
          ))}
        </div>
        <p className="assess__hint">Use the arrow keys, or tap. Guess if unsure.</p>
        {error && <div className="banner">{error}</div>}
      </div>
    )
  }

  // ------------------------------------------------------------------- done
  if (phase === 'done' && report) {
    const t = report.targets
    return (
      <div className="assess">
        <PageBar title="Vision test" />
        <h1 className="assess__title">
          {measuredAt ? 'Last vision test' : 'Baseline recorded'}
        </h1>
        {measuredAt && (
          <p className="assess__lead">
            Measured {new Date(measuredAt + 'Z').toLocaleString()}.
          </p>
        )}

        <div className="assess__headline">
          <div>
            <div className="assess__big">{report.baseline_snellen}</div>
            <div className="assess__small">
              starting acuity · logMAR {report.baseline_logmar.toFixed(2)}
            </div>
          </div>
          {t.meaningful_snellen ? (
            <>
              <div className="assess__arrow">→</div>
              <div>
                <div className="assess__big assess__big--target">{t.meaningful_snellen}</div>
                <div className="assess__small">
                  target · 2 lines better (logMAR {t.meaningful_logmar!.toFixed(2)})
                </div>
              </div>
            </>
          ) : (
            <div className="assess__ceiling">
              Already at the finest line this chart has, so there is no acuity target to set.
            </div>
          )}
        </div>

        <div className="assess__grid">
          {(['right', 'left'] as const).map((eye) => {
            const e = report[eye]
            const isAmblyopic = report.amblyopic_eye === eye
            return (
              <div className={`assess__card ${isAmblyopic ? 'assess__card--flag' : ''}`} key={eye}>
                <h3>
                  {eye === 'right' ? 'Right eye' : 'Left eye'}
                  {isAmblyopic && <span className="assess__tag">weaker eye</span>}
                </h3>
                <dl className="assess__stats">
                  <dt>Single letter</dt>
                  <dd>
                    {e.isolated_snellen} <em>({e.isolated_logmar.toFixed(2)})</em>
                  </dd>
                  <dt>Crowded</dt>
                  <dd>
                    {e.crowded_snellen} <em>({e.crowded_logmar.toFixed(2)})</em>
                  </dd>
                  <dt>Crowding cost</dt>
                  <dd>{e.crowding_ratio.toFixed(2)} logMAR</dd>
                </dl>
              </div>
            )
          })}

          <div className="assess__card">
            <h3>Between the eyes</h3>
            <dl className="assess__stats">
              <dt>Difference</dt>
              <dd>
                {report.interocular_difference.toFixed(2)} logMAR
                {report.iod_flagged ? ' — 2+ lines apart' : ' — within normal'}
              </dd>
              <dt>Goal</dt>
              <dd>≤ {t.iod_goal_logmar.toFixed(2)} logMAR</dd>
            </dl>
          </div>

          <div className="assess__card">
            <h3>Targets</h3>
            <dl className="assess__stats">
              <dt>Meaningful gain</dt>
              <dd>
                {t.meaningful_snellen ? (
                  <>
                    {t.meaningful_snellen} <em>(2 lines)</em>
                  </>
                ) : (
                  <em>none available — already 20/20</em>
                )}
              </dd>
              <dt>Treatment success</dt>
              <dd>
                {t.success_snellen ? (
                  <>
                    {t.success_snellen} <em>(3 lines, or 20/25)</em>
                  </>
                ) : (
                  <em>not applicable</em>
                )}
              </dd>
            </dl>
          </div>
        </div>

        <ul className="assess__notes">
          {report.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>

        {plan && !plan.indicated && (
          <div className="plan plan--none">
            <h2 className="plan__title">{plan.headline}</h2>
            <ul className="plan__why">
              {plan.rationale.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="plan__review">{plan.review}</p>
          </div>
        )}

        {plan && plan.indicated && plan.acuity && plan.dose && (
          <div className="plan">
            <h2 className="plan__title">Recommended programme</h2>
            <div className="plan__row">
              <div className="plan__item">
                <span>Therapy</span>
                <strong>
                  {plan.therapy === 'mfbf' ? 'MFBF' : 'Monocular'} · {plan.treated_eye} eye
                </strong>
              </div>
              <div className="plan__item">
                <span>Start size</span>
                <strong>{plan.acuity.start_snellen}</strong>
              </div>
              <div className="plan__item">
                <span>Difficulty</span>
                <strong>{plan.difficulty}</strong>
              </div>
              <div className="plan__item">
                <span>Session</span>
                <strong>{plan.duration_min} min</strong>
              </div>
              <div className="plan__item">
                <span>Dose</span>
                <strong>
                  {plan.dose.daily_minutes} min/day · {plan.dose.days_per_week} days/wk
                </strong>
              </div>
              <div className="plan__item">
                <span>Programme</span>
                <strong>
                  {plan.dose.programme_weeks} weeks · {plan.dose.total_hours} h
                </strong>
              </div>
            </div>
            <ul className="plan__why">
              {plan.rationale.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="plan__review">{plan.review}</p>
          </div>
        )}

        <div className="assess__actions">
          <button
            className="brief__play"
            onClick={() =>
              plan?.indicated && plan.acuity && plan.mode_id && plan.therapy
                ? applyPlan({
                    mode_id: plan.mode_id,
                    therapy: plan.therapy,
                    difficulty: plan.difficulty ?? 'easy',
                    duration_min: plan.duration_min ?? 1,
                    acuity: plan.acuity,
                  })
                : setScreen('therapy')
            }
          >
            {plan?.indicated ? 'Start with these settings' : 'Go to activities'}
          </button>
          <button
            className="brief__secondary"
            onClick={() => {
              setReport(null)
              setPlan(null)
              setMeasuredAt(null)
              setPhase('intro')
            }}
          >
            Re-test
          </button>
          <button className="brief__secondary" onClick={() => setScreen('reports')}>
            Reports
          </button>
        </div>
      </div>
    )
  }

  return <div className="status">Preparing…</div>
}
