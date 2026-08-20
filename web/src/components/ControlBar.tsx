import { useApp } from '../store'
import type { Catalog, Therapy } from '../types'

/** Duration / Acuity / Difficulty, plus the anaglyph channel swatches.
 *  The Red and Blue swatches only exist for anaglyph therapies - in monocular
 *  work there is no channel to assign, so only Background remains. */
export function ControlBar({ catalog, therapy }: { catalog: Catalog; therapy: Therapy }) {
  const { duration, acuity, difficulty, setDuration, setAcuity, setDifficulty, settings, setScreen } =
    useApp()

  const range = catalog.duration_range
  const level = catalog.acuity_table.find((l) => l.denominator === acuity)
  const anaglyph = settings?.anaglyph
  const backgroundKey = anaglyph?.active_background ?? 'black'
  const profile = anaglyph ? anaglyph[backgroundKey] : undefined
  const channelNames = profile ? Object.keys(profile.channels) : []

  return (
    <div className="controls">
      <div className="control">
        <label htmlFor="duration">Duration</label>
        <input
          id="duration"
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        />
        <span className="control__value">{duration}</span>
        <span className="control__unit">{range.unit}</span>
      </div>

      <div className="control">
        <label htmlFor="acuity">Acuity</label>
        <select id="acuity" value={acuity} onChange={(e) => setAcuity(Number(e.target.value))}>
          {catalog.acuity_levels.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {level && !level.renderable && (
          <span title="Optotype is too small to render reliably at this calibration">⚠</span>
        )}
      </div>

      <div className="control">
        <label htmlFor="difficulty">Difficulty</label>
        <select
          id="difficulty"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
        >
          {catalog.difficulties.map((d) => (
            <option key={d} value={d}>
              {d[0].toUpperCase() + d.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="swatches">
        {therapy.anaglyph &&
          channelNames.map((name) => {
            const channel = profile!.channels[name]
            const isLeft = anaglyph!.left_filter === name
            return (
              <button
                key={name}
                className={`swatch ${isLeft ? 'swatch--active' : ''}`}
                onClick={() => setScreen('colors')}
                title={`${name} channel — intensity ${channel.intensity}, alpha ${channel.alpha}`}
              >
                <span
                  className="swatch__dot"
                  style={{ background: channel.hex, opacity: Math.max(channel.alpha, 0.25) }}
                />
                <span>{name[0].toUpperCase() + name.slice(1)}</span>
              </button>
            )
          })}

        <button className="swatch" onClick={() => setScreen('colors')} title="Adjust colours">
          <span className="bg-toggle">Background</span>
        </button>

        <button className="swatch" onClick={() => setScreen('colors')}>
          <span
            className="swatch__dot"
            style={{
              background: profile?.background ?? '#000',
              border: '2px solid #fff',
            }}
          />
          <span>modify</span>
        </button>
      </div>
    </div>
  )
}
