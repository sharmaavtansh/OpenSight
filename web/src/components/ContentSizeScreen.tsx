import { useState } from 'react'
import { OverlayExit } from './OverlayExit'
import { Icon } from './Icons'
import { useApp } from '../store'
import { sound } from '../audio'

/** Ruler calibration.
 *  The patient measures the E horizontally and steps the size until it is
 *  7.2 cm (screens up to 32in) or 10 cm above that. The resulting pixel count
 *  gives the true pixel pitch, which every optotype size then derives from. */
export function ContentSizeScreen() {
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  const closeScreen = useApp((s) => s.closeScreen)

  // Starting point: what this screen's own geometry predicts, so the very
  // first drag is close. Never a number carried over from another machine -
  // a wrong calibration silently mis-sizes every optotype in the app.
  const diagonal = settings?.calibration.screen_diagonal_in ?? 15
  const targetCm = diagonal > 32 ? 10 : 7.2
  const predicted = Math.round(
    (targetCm / 2.54) * (settings?.derived?.nominal_ppi ?? 96) / (window.devicePixelRatio || 1),
  )
  const stored = settings?.calibration.content_size_px ?? predicted
  const [size, setSize] = useState<number>(stored)
  const [touched, setTouched] = useState(false)

  if (!settings) return null

  const impliedPpi = (size / targetCm) * 2.54 * (window.devicePixelRatio || 1)

  const commit = (next: number) => {
    setTouched(true)
    setSize(Math.max(20, Math.min(4000, next)))
  }

  const save = () => {
    // Only persist a calibration the patient actually performed. Closing
    // without measuring must leave the previous state alone.
    if (touched) {
      const { derived: _derived, ...current } = settings
      void saveSettings({
        ...current,
        calibration: { ...current.calibration, content_size_px: size },
      })
    }
    sound.play('best')
    sound.play('best')
    closeScreen()
  }

  return (
    <div className="calib content-size">
      <OverlayExit label="Back" />
      <div className="calib__close">
        <button className="round-btn" title="Help" aria-label="Help">
          <Icon name="help" />
        </button>
        <button
          className="round-btn round-btn--danger"
          onClick={save}
          title="Save and close"
          aria-label="Save and close"
        >
          <Icon name="close" />
        </button>
      </div>

      <p className="content-size__instructions">
        Using the scale/ruler, Measure the size of E horizontally.
        <br />
        Click +/− button to adjust the size, repeat it untill it the value is
        <br />
        7.2 cm for Screen sizes &lt;= 32 inch,
        <br />
        10 cm for Screen sizes &gt; 32 inch,
      </p>

      <div className="content-size__stage">
        <div className="content-size__card">
          <div className="stepper">
            <button onClick={() => commit(predicted)} title="Reset to this screen's estimate">
              ↻
            </button>
            <button onClick={() => commit(size - 1)} title="Smaller">
              −
            </button>
            <span className="stepper__value">{Math.round(size)}</span>
            <button onClick={() => commit(size + 1)} title="Larger">
              +
            </button>
          </div>

          <svg
            className="ruler-e"
            width={size}
            height={size}
            viewBox="0 0 5 5"
            style={{ display: 'block' }}
            aria-label="Reference optotype E"
          >
            <path
              d="M0 0h5v1H1v1h3.4v1H1v1h4v1H0z"
              fill="currentColor"
              transform="translate(0,0)"
            />
          </svg>

          <svg className="measure-arrow" width={size} height={16} aria-hidden="true">
            <line x1="1" y1="8" x2={size - 1} y2="8" stroke="currentColor" strokeWidth="1.4" />
            <path d={`M1 8l7-4v8z`} fill="currentColor" />
            <path d={`M${size - 1} 8l-7-4v8z`} fill="currentColor" />
          </svg>

          <div className="content-size__readout">
            Target width: <strong>{targetCm} cm</strong> for this {diagonal}″ screen
            <br />
            Implies <strong>{impliedPpi.toFixed(1)} PPI</strong> —{' '}
            {touched ? 'press ✕ to save' : 'unchanged, nothing will be saved'}
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 18, left: 46, fontSize: 14, color: '#555' }}>
        Bar height is one fifth of the width, matching the 5×5 optotype grid.
      </div>
    </div>
  )
}
