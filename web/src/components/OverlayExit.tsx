import { sound } from '../audio'
import { useApp } from '../store'

/** Way out of a full-screen calibration step.
 *
 *  These screens cover the header deliberately - the background has to be
 *  controlled for the measurement to mean anything - which also removed every
 *  visible exit. This puts one back without disturbing the field: it inherits
 *  `currentColor` from the step, so it reads on black and on white without
 *  introducing a colour of its own. */
export function OverlayExit({
  label = 'Leave calibration',
  confirm,
}: {
  label?: string
  /** Asked before leaving when abandoning would discard part-done work. */
  confirm?: string
}) {
  const closeScreen = useApp((s) => s.closeScreen)

  return (
    <button
      className="overlay-exit"
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return
        sound.play('tap')
        closeScreen()
      }}
      title={`${label} — or press Esc`}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M15 5l-7 7 7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{label}</span>
    </button>
  )
}
