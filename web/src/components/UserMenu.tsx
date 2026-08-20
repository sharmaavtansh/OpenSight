import { useEffect, useRef, useState } from 'react'
import { sound } from '../audio'
import { useApp } from '../store'

/** Picks whose visual configuration is in force.
 *
 *  Calibration is a fact about a person at a screen - their display's pixel
 *  pitch, their glasses, how much each channel leaks for their eyes. One
 *  stored copy meant a second person recalibrating silently changed the
 *  first person's optotype sizes, and their recorded acuity stopped meaning
 *  what it said. Switching here reloads settings and the acuity table
 *  together, so the two can never disagree. */
export function UserMenu() {
  const users = useApp((s) => s.users)
  const patientId = useApp((s) => s.patientId)
  const selectUser = useApp((s) => s.selectUser)
  const createUser = useApp((s) => s.createUser)
  const deleteUser = useApp((s) => s.deleteUser)

  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const box = useRef<HTMLDivElement>(null)

  const active = users.find((u) => u.id === patientId) ?? null
  const label = active ? active.name : 'Shared'

  // Click-away and Escape, so the menu never strands the pointer.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const choose = (id: number | null) => {
    sound.play('tap')
    setOpen(false)
    void selectUser(id)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    sound.play('best')
    setName('')
    setAdding(false)
    setOpen(false)
    void createUser(trimmed)
  }

  return (
    <div className="usermenu" ref={box}>
      <button
        className={`usermenu__button ${open ? 'usermenu__button--open' : ''}`}
        onClick={() => {
          sound.play('tap')
          setOpen(!open)
        }}
        title="Whose settings are in use"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="usermenu__avatar" aria-hidden="true">
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="usermenu__name">{label}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="usermenu__panel" role="menu">
          <div className="usermenu__heading">Using settings for</div>

          <button
            className={`usermenu__item ${patientId === null ? 'usermenu__item--active' : ''}`}
            onClick={() => choose(null)}
            role="menuitem"
          >
            <span className="usermenu__avatar" aria-hidden="true">
              S
            </span>
            <span className="usermenu__label">
              Shared
              <em>The install default</em>
            </span>
          </button>

          {users.map((u) => (
            <div key={u.id} className="usermenu__row">
              <button
                className={`usermenu__item ${u.id === patientId ? 'usermenu__item--active' : ''}`}
                onClick={() => choose(u.id)}
                role="menuitem"
              >
                <span className="usermenu__avatar" aria-hidden="true">
                  {u.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="usermenu__label">
                  {u.name}
                  <em>{u.treated_eye ? `${u.treated_eye} eye` : 'own calibration'}</em>
                </span>
              </button>
              <button
                className="usermenu__remove"
                title={`Remove ${u.name}`}
                aria-label={`Remove ${u.name}`}
                onClick={() => {
                  // Their calibration and colour settings go with them, so this
                  // is worth a question rather than a quiet click.
                  if (!window.confirm(`Remove ${u.name}? Their calibration and colour settings are deleted. Sessions already recorded are kept.`))
                    return
                  sound.play('tap')
                  void deleteUser(u.id)
                }}
              >
                ×
              </button>
            </div>
          ))}

          {adding ? (
            <form className="usermenu__add" onSubmit={submit}>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                maxLength={40}
                aria-label="New user name"
              />
              <button type="submit" disabled={!name.trim()}>
                Add
              </button>
            </form>
          ) : (
            <button
              className="usermenu__new"
              onClick={() => {
                sound.play('tap')
                setAdding(true)
              }}
            >
              + Add a user
            </button>
          )}

          <p className="usermenu__note">
            Each user keeps their own screen calibration, glasses colours and controls.
          </p>
        </div>
      )}
    </div>
  )
}
