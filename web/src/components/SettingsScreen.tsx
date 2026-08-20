import { useApp } from '../store'
import { PageBar } from './PageBar'
import { sound } from '../audio'
import type { Settings } from '../types'

/** The Global Settings screen.
 *  Webcam-based distance and head-pose tracking is deliberately out of scope:
 *  it would put a camera on a child for the whole session to replace a number
 *  the ruler calibration already establishes more reliably. */
export function SettingsScreen({ focus }: { focus?: 'controller' } = {}) {
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  const setScreen = useApp((s) => s.setScreen)

  if (!settings) return <div className="status">Loading settings…</div>

  const patch = (changes: Partial<Omit<Settings, 'derived'>>) => {
    sound.play('toggle')
    const { derived: _derived, ...current } = settings
    void saveSettings({ ...current, ...changes })
  }

  const cal = settings.calibration
  const derived = settings.derived
  const calibrated = derived?.calibrated ?? false

  return (
    <div className="settings">
      <PageBar
        title={focus === 'controller' ? 'Controls' : 'Global Settings'}
        trail={focus === 'controller' ? ['Settings'] : []}
      />

      <div className="settings__grid">
        <div className="settings__label">Monitor Size – inches</div>
        <div className="settings__value">{cal.screen_diagonal_in}</div>
        <div className="settings__control">
          <input
            type="range"
            min={10}
            max={85}
            step={1}
            value={cal.screen_diagonal_in}
            onChange={(e) =>
              patch({
                calibration: { ...cal, screen_diagonal_in: Number(e.target.value) },
              })
            }
          />
        </div>

        <div className="settings__label">Adjust Content Size</div>
        <div className="settings__value">{cal.content_size_px ?? '—'}</div>
        <div className="settings__control" style={{ gap: 18 }}>
          <span
            className={`status-dot ${calibrated ? 'status-dot--ok' : 'status-dot--pending'}`}
            title={calibrated ? 'Calibrated' : 'Not yet calibrated'}
          />
          <button
            className="pill-btn pill-btn--go"
            onClick={() => setScreen('content-size')}
            aria-label="Open the content size calibration"
            title="Opens a full-screen step - you will need a ruler"
          >
            Measure
          </button>
        </div>

        <div className="settings__label">Glasses &amp; Colour Check</div>
        <div className="settings__value settings__value--word">
          {settings.anaglyph.left_filter} / {settings.anaglyph.left_filter === 'red' ? 'blue' : 'red'}
        </div>
        <div className="settings__control">
          <button
            className="pill-btn pill-btn--go"
            onClick={() => setScreen('glasses')}
            aria-label="Open the glasses and colour check"
            title="Opens a full-screen step - wear the red/blue glasses"
          >
            Check
          </button>
        </div>

        <div className="settings__label">Adjust Colors</div>
        <div />
        <div className="settings__control">
          <button
            className="pill-btn pill-btn--go"
            onClick={() => setScreen('colors')}
            aria-label="Open the colour adjustment"
            title="Opens a full-screen step"
          >
            Adjust
          </button>
        </div>

        <div className="settings__label">Vergence Alpha</div>
        <div className="settings__value">{settings.vergence_alpha}</div>
        <div className="settings__control">
          <input
            type="range"
            min={0}
            max={100}
            value={settings.vergence_alpha}
            onChange={(e) => patch({ vergence_alpha: Number(e.target.value) })}
          />
        </div>

        <div className="settings__label">Controller Config</div>
        <div className="settings__value settings__value--word">
          {focus === 'controller' ? settings.controller.device : ''}
        </div>
        <div className="settings__control">
          <select
            value={settings.controller.device}
            onChange={(e) =>
              patch({
                controller: {
                  ...settings.controller,
                  device: e.target.value as Settings['controller']['device'],
                },
              })
            }
            style={{ width: '100%', fontSize: 20, padding: '10px' }}
          >
            <option value="pointer">Pointer / touch</option>
            <option value="keyboard">Keyboard</option>
            <option value="gamepad">Gamepad</option>
          </select>
        </div>

        <div className="settings__label">Visual Feed Back for Errors</div>
        <div className="settings__value settings__value--word">
          {settings.visual_error_feedback ? 'on' : 'off'}
        </div>
        <div className="settings__control">
          <button
            className={`toggle ${settings.visual_error_feedback ? 'toggle--on' : ''}`}
            onClick={() => patch({ visual_error_feedback: !settings.visual_error_feedback })}
            aria-label="Visual feedback for errors"
          />
        </div>

        <div className="settings__label">Sound Effects</div>
        <div className="settings__value settings__value--word">
          {settings.sound ? 'Yes' : 'No'}
        </div>
        <div className="settings__control">
          <button
            className={`toggle ${settings.sound ? 'toggle--on' : ''}`}
            onClick={() => patch({ sound: !settings.sound })}
            aria-label="Sound effects"
          />
        </div>

        <div className="settings__label">Sound Volume</div>
        <div className="settings__value">{settings.sound_volume}</div>
        <div className="settings__control">
          <input
            type="range"
            min={0}
            max={100}
            value={settings.sound_volume}
            disabled={!settings.sound}
            onChange={(e) => patch({ sound_volume: Number(e.target.value) })}
          />
        </div>

        <div className="settings__label">Frame Rate</div>
        <div className="settings__value settings__value--word">
          {settings.show_frame_rate ? 'Yes' : 'No'}
        </div>
        <div className="settings__control">
          <button
            className={`toggle ${settings.show_frame_rate ? 'toggle--on' : ''}`}
            onClick={() => patch({ show_frame_rate: !settings.show_frame_rate })}
            aria-label="Frame rate overlay"
          />
        </div>

        <div className="settings__note">
          {calibrated ? (
            <>
              Calibrated at <strong>{derived?.ppi.toFixed(1)} PPI</strong> from a reference E of{' '}
              {derived?.reference_e_cm} cm — optotype sizes are physically accurate. Nominal PPI from
              the stated diagonal would be {derived?.nominal_ppi.toFixed(1)}.
            </>
          ) : (
            <>
              Not calibrated. Optotype sizes are being estimated from the stated screen diagonal
              ({derived?.nominal_ppi.toFixed(1)} PPI). Run <em>Adjust Content Size</em> for
              clinically accurate acuity.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
