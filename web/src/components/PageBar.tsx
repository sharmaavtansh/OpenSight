import { sound } from '../audio'
import { useApp } from '../store'

/** A consistent "where am I / how do I get out" bar for every sub-screen.
 *
 *  Before this, leaving a sub-screen meant finding the header X - which also
 *  meant "exit the app" on the activity grid, so the same control did two
 *  different things depending on where you were. Here the way back is always
 *  in the same place and always says where it goes. */
export function PageBar({
  title,
  trail = [],
  backTo,
  actions,
}: {
  title: string
  /** Ancestors, outermost first. Rendered as a path before the title. */
  trail?: string[]
  /** Overrides the label on the back button when the destination differs. */
  backTo?: string
  actions?: React.ReactNode
}) {
  const closeScreen = useApp((s) => s.closeScreen)
  const returnTo = useApp((s) => s.returnTo)

  const destination =
    backTo ?? (returnTo === 'settings' ? 'Settings' : returnTo === 'reports' ? 'Reports' : 'Activities')

  return (
    <div className="pagebar">
      <button
        className="pagebar__back"
        onClick={() => {
          sound.play('tap')
          closeScreen()
        }}
        title={`Back to ${destination} — or press Esc`}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M15 5l-7 7 7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{destination}</span>
      </button>

      <nav className="pagebar__trail" aria-label="Breadcrumb">
        {trail.map((step) => (
          <span key={step}>
            {step}
            <i aria-hidden="true">›</i>
          </span>
        ))}
        <strong>{title}</strong>
      </nav>

      <div className="pagebar__actions">
        {actions}
        <kbd className="pagebar__kbd">Esc</kbd>
      </div>
    </div>
  )
}
