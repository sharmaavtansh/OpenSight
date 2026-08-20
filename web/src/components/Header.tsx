import { Icon } from './Icons'
import { useApp } from '../store'
import { sound } from '../audio'

/** Header destinations. Each carries a word as well as a glyph: four unlabelled
 *  icons in a row is a memory test, and this app is used by children and by
 *  parents who open it once a day. */
const DESTINATIONS = [
  { screen: 'assessment', icon: 'chart', label: 'Vision test' },
  { screen: 'reports', icon: 'list', label: 'Reports' },
  { screen: 'controller', icon: 'gamepad', label: 'Controls' },
  { screen: 'settings', icon: 'gear', label: 'Settings' },
] as const

export function Header() {
  const screen = useApp((s) => s.screen)
  const setScreen = useApp((s) => s.setScreen)
  const settings = useApp((s) => s.settings)

  const onTherapyScreen = screen === 'therapy'

  // Every header button is a navigation, so one wrapper covers them all.
  const go = (next: Parameters<typeof setScreen>[0]) => {
    sound.play('tap')
    setScreen(next)
  }

  return (
    <header className="header">
      <button
        className="brand"
        onClick={() => !onTherapyScreen && go('therapy')}
        // The brand is the way home on every other screen, which is the one
        // convention people already carry in from the web.
        title={onTherapyScreen ? 'OpenSight' : 'Back to activities'}
        aria-label={onTherapyScreen ? 'OpenSight' : 'Back to activities'}
      >
        <div className="brand__name">
          <em>Open</em>Sight
        </div>
        <div className="brand__edition">
          Home Edition · by Avtansh Sharma · built for the community
        </div>
      </button>

      <nav className="header__actions" aria-label="Main">
        {DESTINATIONS.map((d) => {
          const active = screen === d.screen
          return (
            <button
              key={d.screen}
              className={`icon-btn ${active ? 'icon-btn--active' : ''}`}
              onClick={() => go(active ? 'therapy' : d.screen)}
              title={
                d.screen === 'controller'
                  ? `Controls — ${settings?.controller.device ?? 'pointer'}`
                  : d.label
              }
              aria-label={d.label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={d.icon} />
              <span className="icon-btn__label">{d.label}</span>
            </button>
          )
        })}

        <button
          className={`icon-btn icon-btn--close ${onTherapyScreen ? '' : 'icon-btn--back'}`}
          onClick={() => {
            if (!onTherapyScreen) {
              sound.play('tap')
              setScreen('therapy')
              return
            }
            // Exiting throws away the session, so confirm rather than closing
            // the window from under the patient.
            if (window.confirm('Exit OpenSight?')) window.close()
          }}
          title={onTherapyScreen ? 'Exit OpenSight' : 'Back to activities — or press Esc'}
          aria-label={onTherapyScreen ? 'Exit OpenSight' : 'Back to activities'}
        >
          <Icon name={onTherapyScreen ? 'close' : 'back'} />
          <span className="icon-btn__label">{onTherapyScreen ? 'Exit' : 'Back'}</span>
        </button>
      </nav>
    </header>
  )
}
