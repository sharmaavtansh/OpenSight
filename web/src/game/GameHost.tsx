import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'
import { sound } from '../audio'
import type { Difficulty } from '../types'
import { Runner } from './engine'
import { getGame } from './games'
import type { SessionPlan, SessionResult, Trial } from '../types'

type Phase = 'brief' | 'playing' | 'settings' | 'result'

/** Hosts one activity: briefing -> canvas run -> result.
 *  The briefing states the discipline, the therapy mode, which eye to patch,
 *  the task instruction and the viewing distance hint. */
export function GameHost({ plan }: { plan: SessionPlan }) {
  const closeGame = useApp((s) => s.closeGame)
  const relaunch = useApp((s) => s.launch)
  const settings = useApp((s) => s.settings)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runnerRef = useRef<Runner | null>(null)

  const [phase, setPhase] = useState<Phase>('brief')
  const [hud, setHud] = useState({ remaining: plan.duration_s, score: 0, pending: 0, invalid: 0 })
  // Fired once, near the end, so the child can push for a last few.
  const warned = useRef(false)
  const [result, setResult] = useState<SessionResult | null>(null)
  const [durationS, setDurationS] = useState(Math.round(plan.duration_s))
  const [acuity, setAcuity] = useState(plan.acuity.denominator)
  const [useCommon, setUseCommon] = useState(true)
  const [difficulty, setDifficulty] = useState<Difficulty>(plan.params.difficulty)

  const factory = getGame(plan.activity.id)
  const patchEye = plan.mode.eye === 'left' ? 'Right' : 'Left'
  const anaglyph = plan.palette.anaglyph

  // Lens colours as worn: the left lens is whichever filter the calibration
  // assigns to the left eye.
  const channels = plan.palette.channels ?? {}
  const leftFilter = settings?.anaglyph.left_filter ?? 'red'
  const rightFilter = leftFilter === 'red' ? (channels.cyan ? 'cyan' : 'blue') : 'red'
  const leftLens = channels[leftFilter] ?? '#e02020'
  const rightLens = channels[rightFilter] ?? '#2020e0'

  const finishing = useRef(false)

  const finish = async (trials: Trial[], elapsedS: number, status: 'completed' | 'aborted') => {
    // The clock expiring and the patient pressing stop can both land here, and
    // a second call would post another set of trials against a session that is
    // already closed. A ref, because this has to hold within one tick.
    if (finishing.current) return
    finishing.current = true
    try {
      const summary = await api.finishSession(plan.session_id, {
        elapsed_s: elapsedS,
        status,
        trials,
      })
      setResult(summary)
      sound.play(summary && summary.accuracy != null && summary.accuracy >= 0.9 ? 'best' : 'end')
    } catch {
      setResult(null)
      sound.play('end')
    }
    setPhase('result')
  }

  useEffect(() => {
    if (phase !== 'playing' || !canvasRef.current || !factory) return

    const runner = new Runner(
      canvasRef.current,
      factory(),
      { ...plan, duration_s: durationS },
      {
        onTick: (next) => {
          if (!warned.current && next.remaining <= 10) {
            warned.current = true
            sound.play('warn')
          }
          setHud(next)
        },
        onPrompt: () => {},
        onFinish: (trials, elapsed) => void finish(trials, elapsed, 'completed'),
      },
      settings?.visual_error_feedback ?? true,
    )
    runnerRef.current = runner
    warned.current = false
    sound.play('start')
    runner.start()

    const canvas = canvasRef.current
    const down = (e: PointerEvent) => runner.handlePointer(e, 'down')
    const move = (e: PointerEvent) => runner.handlePointer(e, 'move')
    const up = (e: PointerEvent) => runner.handlePointer(e, 'up')
    const key = (e: KeyboardEvent) => {
      // Escape and F1 both open the in-game settings, matching the reference
      // build's "Press F1 for Settings" hint.
      if (e.key === 'Escape' || e.key === 'F1') {
        e.preventDefault()
        runner.stop()
        setPhase('settings')
        return
      }
      // Arrow keys and space drive several activities; stop the page scrolling.
      if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
      runner.handleKey(e)
    }
    const resize = () => runner.resize()
    // A tab restored from the background may only get real layout now, so
    // re-measure rather than keeping the fallback size.
    const visibility = () => {
      if (!document.hidden) runner.resize()
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    window.addEventListener('keydown', key)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', visibility)

    return () => {
      runner.stop()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', key)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', visibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, durationS])

  const abort = () => {
    const runner = runnerRef.current
    if (runner) runner.finish()
    else closeGame()
  }

  // ------------------------------------------------------------- briefing --
  if (phase === 'brief') {
    return (
      <div className="brief">
        <div className="brief__chrome">
          <span className="brief__patient" title="Patient">
            ◍
          </span>
          <button className="brief__shortcuts">Shortcuts</button>
          <button className="brief__round" title="Help">
            ?
          </button>
          <button className="brief__round" onClick={closeGame} title="Back to activities">
            X
          </button>
        </div>

        <div className="brief__head">
          <div className="brief__title">{plan.activity.display_title ?? plan.activity.name}</div>
          <div className="brief__sub">{plan.activity.discipline ?? plan.activity.category}</div>
          <div className="brief__sub">{plan.mode.name}</div>
        </div>

        <div className="brief__bar">
          <span className="brief__play-dot">▶</span> Starting
        </div>

        <div className="brief__body">
          <div className="brief__patch">
            {anaglyph ? (
              // MFBF: both eyes open behind the anaglyph glasses. Lens order
              // follows the calibrated filter assignment.
              <svg viewBox="0 0 260 110" width="230" height="100" aria-hidden="true">
                <rect x="18" y="24" width="98" height="62" rx="18" fill="#111" />
                <rect x="144" y="24" width="98" height="62" rx="18" fill="#111" />
                <rect
                  x="28"
                  y="33"
                  width="78"
                  height="44"
                  rx="12"
                  fill={leftLens}
                />
                <rect
                  x="154"
                  y="33"
                  width="78"
                  height="44"
                  rx="12"
                  fill={rightLens}
                />
                <path d="M116 46h28" stroke="#111" strokeWidth="10" />
                <path d="M18 40 4 34M242 40l14-6" stroke="#111" strokeWidth="9" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 100 100" width="140" height="140" aria-hidden="true">
                <circle cx="50" cy="50" r="46" fill="#f5b800" />
                {plan.mode.eye === 'left' ? (
                  <>
                    <path d="M58 30 78 38 74 52 56 46z" fill="#111" />
                    <path d="M74 22 56 34" stroke="#111" strokeWidth="4" />
                    <circle cx="34" cy="42" r="5" fill="#fff" />
                  </>
                ) : (
                  <>
                    <path d="M42 30 22 38 26 52 44 46z" fill="#111" />
                    <path d="M26 22 44 34" stroke="#111" strokeWidth="4" />
                    <circle cx="66" cy="42" r="5" fill="#fff" />
                  </>
                )}
                <path d="M28 64q22 16 44 0" stroke="#111" strokeWidth="4" fill="none" />
              </svg>
            )}
            <div className="brief__patch-caption">
              {anaglyph ? plan.palette.note : `Patch your ${patchEye} Eye`}
            </div>
          </div>

          <dl className="brief__facts">
            <dt>Target:</dt>
            <dd>{plan.activity.instructions ?? factory?.().brief ?? plan.activity.skill}</dd>
            <dt>Hint:</dt>
            <dd>
              Viewing Distance : {settings?.calibration.viewing_distance_cm ?? 40} cm
              {' · '}
              {plan.acuity.snellen} optotype = {plan.acuity.height_mm} mm
              {!plan.acuity.renderable && ' · too small to render reliably at this calibration'}
            </dd>
          </dl>
        </div>

        {factory ? (
          <button className="brief__play" onClick={() => setPhase('playing')}>
            Play
          </button>
        ) : (
          <div className="brief__missing">This activity has no game module yet.</div>
        )}
      </div>
    )
  }

  // --------------------------------------------------------------- result --
  if (phase === 'result') {
    const attempts = (result?.hits ?? 0) + (result?.misses ?? 0) + (result?.false_alarms ?? 0)
    // Five bands over accuracy, so the rating tracks the same number the
    // clinician reads in the progress report.
    const accuracy = result?.accuracy ?? 0
    const stars = attempts === 0 ? 0 : accuracy >= 0.9 ? 5 : accuracy >= 0.75 ? 4 : accuracy >= 0.6 ? 3 : accuracy >= 0.4 ? 2 : 1
    return (
      <div className="brief">
        <div className="brief__head">
          <div className="brief__title">Session complete</div>
          <div className="brief__sub">{plan.activity.name}</div>
        </div>
        <div className="brief__bar brief__bar--done">
          <span className="brief__info">i</span> Completed
        </div>

        <div className="stars" aria-label={`${stars} of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={n <= stars ? 'star star--on' : 'star'}>
              ★
            </span>
          ))}
        </div>

        <div className="brief__stats">
          <div>
            <b>Duration</b>
            {Math.round(result?.elapsed_s ?? 0)} sec
          </div>
          <div>
            <b>Valid</b>
            {result?.hits ?? 0} / {attempts}
          </div>
          <div>
            <b>Invalid</b>
            {result?.false_alarms ?? 0}
          </div>
        </div>

        <div className="result-detail">
          Accuracy {result?.accuracy != null ? `${Math.round(result.accuracy * 100)}%` : '—'}
          {' · '}
          Mean reaction {result?.mean_rt_ms ? `${Math.round(result.mean_rt_ms)} ms` : '—'}
          {' · '}
          Score {result?.score ?? 0}
        </div>

        <div className="result-actions">
          <button className="brief__play" onClick={() => void relaunch(plan.activity)}>
            Replay
          </button>
          <button className="brief__secondary" onClick={closeGame}>
            Done
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------- play / modal --
  return (
    <div className="stage" style={{ background: plan.palette.background }}>
      <canvas ref={canvasRef} className="stage__canvas" />

      <div className="stage__hud">
        <span className="chip">
          Pending <b>{hud.pending}</b>
        </span>
        <span className="chip">
          Score <b>{hud.score}</b>
        </span>
        <span className="chip">
          Invalid <b>{hud.invalid}</b>
        </span>
        <span className="chip">
          <b>{Math.max(0, Math.ceil(hud.remaining))}</b> s
        </span>
      </div>

      <div className="stage__chrome">
        <button
          onClick={() => {
            runnerRef.current?.stop()
            setPhase('settings')
          }}
          title="Settings"
        >
          ⚙
        </button>
        <button onClick={abort} title="End session">
          ✕
        </button>
      </div>

      {phase === 'settings' && (
        <div className="modal">
          <div className="modal__box">
            <div className="modal__head">
              <span className="modal__gear">⚙</span>
              <span className="modal__title">Settings</span>
              <button className="modal__x" onClick={() => setPhase('playing')}>
                ✕
              </button>
            </div>

            <div className="modal__body">
              <div className="modal__row">
                <span>Settings</span>
                <label className="modal__check">
                  <input
                    type="checkbox"
                    checked={useCommon}
                    onChange={(e) => setUseCommon(e.target.checked)}
                  />
                  Use Common Settings
                </label>
              </div>
              <div className="modal__row">
                <span>Duration</span>
                <div className="modal__control">
                  <input
                    type="range"
                    min={15}
                    max={900}
                    step={15}
                    value={durationS}
                    disabled={useCommon}
                    onChange={(e) => setDurationS(Number(e.target.value))}
                  />
                  <b>{durationS}</b> sec
                </div>
              </div>
              <div className="modal__row">
                <span>Acuity</span>
                <div className="modal__control">
                  <select
                    value={acuity}
                    disabled={useCommon}
                    onChange={(e) => setAcuity(Number(e.target.value))}
                  >
                    {[200, 160, 125, 100, 80, 63, 50, 40, 32, 25, 20].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal__row">
                <span>Difficulty</span>
                <div className="modal__radios">
                  {(['easy', 'medium', 'hard'] as const).map((level) => (
                    <label key={level}>
                      <input
                        type="radio"
                        name="difficulty"
                        checked={difficulty === level}
                        disabled={useCommon}
                        onChange={() => setDifficulty(level)}
                      />
                      {level[0].toUpperCase() + level.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <p className="modal__note">
                Acuity and difficulty take effect on the next run: optotype geometry and the
                parameter set are resolved server-side when a session starts. Duration applies
                immediately.
              </p>
            </div>

            <div className="modal__foot">
              <button className="modal__exit" onClick={abort}>
                Exit
              </button>
              <button className="modal__run" onClick={() => setPhase('playing')}>
                Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
