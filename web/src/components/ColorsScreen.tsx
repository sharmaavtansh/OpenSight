import { useState } from 'react'
import { OverlayExit } from './OverlayExit'
import { useApp } from '../store'
import type { BackgroundProfile, ChannelCalibration } from '../types'

/** Anaglyph channel calibration.
 *  Each channel gets an intensity (0-256) and an alpha. The alpha is the
 *  leakage null: the patient lowers it until the patch is invisible through
 *  the opposite filter, which is what guarantees the treated eye is the only
 *  one seeing the target. Black and white backgrounds are calibrated
 *  separately, because the pairing changes (red/blue vs red/cyan) and so does
 *  the polarity. */
export function ColorsScreen() {
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  const setScreen = useApp((s) => s.setScreen)

  const [activeBg, setActiveBg] = useState<'black' | 'white'>(
    settings?.anaglyph.active_background ?? 'black',
  )
  const [activeChannel, setActiveChannel] = useState<string>('red')

  if (!settings) return null

  const anaglyph = settings.anaglyph
  const profile: BackgroundProfile = anaglyph[activeBg]
  const channel: ChannelCalibration =
    profile.channels[activeChannel] ?? Object.values(profile.channels)[0]

  const patchChannel = (changes: Partial<ChannelCalibration>) => {
    const { derived: _derived, ...current } = settings
    void saveSettings({
      ...current,
      anaglyph: {
        ...anaglyph,
        active_background: activeBg,
        [activeBg]: {
          ...profile,
          channels: {
            ...profile.channels,
            [activeChannel]: { ...channel, ...changes },
          },
        },
      },
    })
  }

  const rgba = (c: ChannelCalibration) => {
    const hex = c.hex.replace('#', '')
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const k = c.intensity / 256
    return `rgba(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)}, ${c.alpha})`
  }

  const chartColour = rgba(channel)
  const complement = activeBg === 'black' ? 'blue' : 'cyan'
  const oppositeName = activeChannel === 'red' ? complement : 'red'

  return (
    <div className="calib colors" style={{ background: profile.background }}>
      {/* Same labelled exit, same corner, as the other two calibration steps.
          The round red X this replaces read as "discard", which is the wrong
          signal for a screen that saves as you go. */}
      <OverlayExit label="Back" />
      <div className="calib__close">
        <button className="help-btn">Help</button>
      </div>

      <div className="colors__title">Colors</div>

      <button className="colors__guided" onClick={() => setScreen('glasses')}>
        Use guided calibration instead
      </button>

      <div className="colors__panel">
        <div className="colors__slider-row">
          <span>Colors</span>
          <input
            type="range"
            min={0}
            max={256}
            value={channel.intensity}
            onChange={(e) => patchChannel({ intensity: Number(e.target.value) })}
          />
        </div>

        <div className="colors__readout">
          <span>{channel.intensity}</span>
          <span>{channel.alpha.toFixed(2)}</span>
        </div>

        <div className="colors__slider-row">
          <span>Alpha</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(channel.alpha * 100)}
            onChange={(e) => patchChannel({ alpha: Number(e.target.value) / 100 })}
          />
        </div>

        <p className="colors__hint">
          Adjust the {activeChannel[0].toUpperCase() + activeChannel.slice(1)} Alpha slider untill
          you dont see the {activeChannel[0].toUpperCase() + activeChannel.slice(1)} color Box at the
          center when viewed in {oppositeName[0].toUpperCase() + oppositeName.slice(1)} glass, keep
          the other eye closed
        </p>

        <p className="colors__instruction">
          Instruction :<br />1) Set all the colors mention below
        </p>
      </div>

      {/* Acuity chart rendered in the channel being tuned. */}
      <div className="colors__chart" style={{ color: chartColour }}>
        <svg width="620" height="460" aria-hidden="true">
          <text x="60" y="180" fontSize="200" fontWeight="700" fill="currentColor">
            E
          </text>
          <text x="290" y="130" fontSize="140" fontWeight="700" fill="currentColor">
            F
          </text>
          <text x="110" y="360" fontSize="110" fontWeight="700" fill="currentColor">
            C
          </text>
          <text x="320" y="345" fontSize="90" fontWeight="700" fill="currentColor">
            P
          </text>
          <text x="300" y="415" fontSize="30" fontWeight="700" fill="currentColor" letterSpacing="6">
            A B E H T
          </text>
        </svg>
      </div>

      <div className="colors__scope">
        <label>
          <input
            type="checkbox"
            checked={settings.scope === 'patient'}
            onChange={(e) => {
              const { derived: _derived, ...current } = settings
              void saveSettings({ ...current, scope: e.target.checked ? 'patient' : 'all' })
            }}
          />
          For Patient
        </label>
        <span className={settings.scope === 'all' ? 'is-active' : ''}>For All</span>
      </div>

      <div className="colors__profiles">
        {(['black', 'white'] as const).map((bg) => {
          const p = anaglyph[bg]
          const names = Object.keys(p.channels)
          return (
            <div key={bg} className={`profile ${bg === activeBg ? 'profile--active' : ''}`}>
              <button className="profile__name" onClick={() => setActiveBg(bg)}>
                {bg === 'black' ? 'Black Background' : 'White Background'}
              </button>
              {names.map((name) => (
                <div className="profile__row" key={name}>
                  <button
                    className="profile__set"
                    onClick={() => {
                      setActiveBg(bg)
                      setActiveChannel(name)
                    }}
                  >
                    Click to set {name[0].toUpperCase() + name.slice(1)}
                  </button>
                  {bg === activeBg && name === activeChannel && (
                    <button className="profile__confirm" onClick={() => patchChannel({})}>
                      Click to Confirm
                    </button>
                  )}
                  <span
                    className="profile__swatch"
                    style={{ background: rgba(p.channels[name]) }}
                  />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
