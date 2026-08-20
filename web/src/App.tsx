import { useEffect } from 'react'
import { Header } from './components/Header'
import { TherapyScreen } from './components/TherapyScreen'
import { SettingsScreen } from './components/SettingsScreen'
import { ContentSizeScreen } from './components/ContentSizeScreen'
import { ColorsScreen } from './components/ColorsScreen'
import { ReportsScreen } from './components/ReportsScreen'
import { AssessmentScreen } from './components/AssessmentScreen'
import { GlassesScreen } from './components/GlassesScreen'
import { GameHost } from './game/GameHost'
import { useApp } from './store'

export default function App() {
  const { catalog, loading, error, screen, therapyId, plan, load } = useApp()

  useEffect(() => {
    void load()
  }, [load])

  // Escape is the universal "get me out of here". It steps one level back, and
  // never while an activity is running - there Escape belongs to the game.
  const closeScreen = useApp((s) => s.closeScreen)
  useEffect(() => {
    if (screen === 'therapy' || plan) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      closeScreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, plan, closeScreen])


  // Card and selection colour follow the active therapy: blue for monocular,
  // orange for MFBF.
  const therapy = catalog?.therapies.find((t) => t.id === therapyId)
  const accent = therapy?.accent ?? '#ef5b2b'

  return (
    <div
      className="app"
      style={
        {
          '--orange': accent,
          '--orange-dark': shade(accent, -0.16),
        } as React.CSSProperties
      }
    >
      <Header />

      {loading && <div className="status">Loading therapy catalogue…</div>}
      {!loading && error && !catalog && (
        <div className="status status--error">
          Could not reach the OpenSight service. Is the Python backend running?
          <br />
          <code>{error}</code>
        </div>
      )}

      {!loading && catalog && (
        <>
          {screen === 'therapy' && <TherapyScreen catalog={catalog} />}
          {screen === 'settings' && <SettingsScreen />}
          {screen === 'content-size' && <ContentSizeScreen />}
          {screen === 'colors' && <ColorsScreen />}
          {screen === 'controller' && <SettingsScreen focus="controller" />}
          {screen === 'reports' && <ReportsScreen />}
          {screen === 'assessment' && <AssessmentScreen />}
          {screen === 'glasses' && <GlassesScreen />}
        </>
      )}

      {/* Keyed by session: a Replay issues a new plan and must restart the host
          from its briefing rather than inherit the finished session's phase. */}
      {plan && <GameHost key={plan.session_id} plan={plan} />}
    </div>
  )
}

/** Darken/lighten a hex colour for the card hover state. */
function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  const adjusted = channels.map((c) =>
    Math.max(0, Math.min(255, Math.round(c + 255 * amount))),
  )
  return `#${adjusted.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
