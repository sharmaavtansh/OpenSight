import { useEffect, useState } from 'react'
import { ActivityGrid } from './ActivityGrid'
import { ControlBar } from './ControlBar'
import { useApp } from '../store'
import { sound } from '../audio'
import type { Catalog } from '../types'

export function TherapyScreen({ catalog }: { catalog: Catalog }) {
  const { therapyId, modeId, selectTherapy, selectMode, error, setScreen } = useApp()
  const [needsBaseline, setNeedsBaseline] = useState(false)

  // Therapy without a baseline has nothing to measure progress against, so
  // surface it rather than letting someone quietly skip it.
  useEffect(() => {
    fetch('/api/assessments')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNeedsBaseline(!!d && !d.baseline))
      .catch(() => setNeedsBaseline(false))
  }, [])

  const therapy = catalog.therapies.find((t) => t.id === therapyId) ?? catalog.therapies[0]
  const mode = therapy.children.find((c) => c.id === modeId) ?? therapy.children[0]
  const activities = catalog.activities_by_therapy[therapy.id] ?? []

  return (
    <div className="body">
      {/* One sidebar instead of two rails. The therapy list and its modes were
          separate columns saying the same thing twice; nesting the modes under
          the therapy that owns them returns ~200px to the activity grid and
          removes a column the eye had to cross. Only the open therapy expands. */}
      <nav className="sidebar">
        <div className="sidebar__title">Therapies</div>
        {catalog.therapies.map((t) => {
          const open = t.id === therapy.id
          const count = (catalog.activities_by_therapy[t.id] ?? []).length
          return (
            <div className={`sidebar__group ${open ? 'sidebar__group--open' : ''}`} key={t.id}>
              <button
                className={`sidebar__therapy ${open ? 'sidebar__therapy--active' : ''}`}
                onClick={() => {
                  sound.play('tap')
                  selectTherapy(t.id)
                }}
                title={t.description}
                aria-expanded={open}
              >
                <span className="sidebar__name">{t.name}</span>
                <span className="sidebar__count">{count}</span>
              </button>

              {open && (
                <div className="sidebar__modes">
                  {t.children.map((child) => (
                    <button
                      key={child.id}
                      className={`sidebar__mode ${child.id === mode.id ? 'sidebar__mode--active' : ''}`}
                      onClick={() => {
                        sound.play('tap')
                        selectMode(child.id)
                      }}
                      aria-current={child.id === mode.id ? 'true' : undefined}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Session settings belong with the navigation, not above the grid:
            they configure what a card will launch, they are set once and then
            left alone, and stacking them here gives the activities the whole
            main column instead of a 227px strip of controls. */}
        <div className="sidebar__title sidebar__title--rule">This session</div>
        <ControlBar catalog={catalog} therapy={therapy} />
      </nav>

      <main className="main">
        <div className="crumb">
          {therapy.name} &gt; {mode.name}
        </div>
        {error && <div className="banner">{error}</div>}
        {needsBaseline && (
          <div className="banner banner--action">
            <span>
              No baseline recorded. Measure vision first, so improvement can be judged against
              something real.
            </span>
            <button onClick={() => setScreen('assessment')}>Run the vision test</button>
          </div>
        )}
        <ActivityGrid
          categories={catalog.categories}
          activities={activities}
          accent={therapy.accent}
        />
      </main>
    </div>
  )
}
