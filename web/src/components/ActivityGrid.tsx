import { Icon } from './Icons'
import { useApp } from '../store'
import { sound } from '../audio'
import type { Activity, Category } from '../types'

function ActivityCard({ activity, accent }: { activity: Activity; accent: string }) {
  const launch = useApp((s) => s.launch)
  const starting = useApp((s) => s.starting)

  return (
    <button
      className="card"
      // Set on the element rather than inherited: the card colour is therapy
      // state, not theme, and must change the instant the therapy does.
      style={{ background: accent }}
      onClick={() => {
        sound.play('tap')
        void launch(activity)
      }}
      disabled={starting !== null}
      title={activity.skill}
    >
      <span className="card__icon">
        <Icon name={activity.icon} />
      </span>
      <span className="card__title">{activity.title.join(' ')}</span>
      {/* The skill was hidden in a tooltip, which is unreachable on a touch
          screen and invisible to anyone deciding what to play next. */}
      <span className="card__skill">{activity.skill}</span>
    </button>
  )
}

export function ActivityGrid({
  categories,
  activities,
  accent,
}: {
  categories: Category[]
  activities: Activity[]
  accent: string
}) {
  return (
    <div className="grid-scroll">
      {categories.map((category) => {
        const items = activities.filter((a) => a.category === category.id)
        if (items.length === 0) return null
        return (
          <section className="group" key={category.id}>
            <header className="group__header">
              <span className="group__name">{category.name}</span>
              <span className="group__rule" />
              <span className="group__count">{items.length}</span>
            </header>
            <div className="group__cards">
              {items.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} accent={accent} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
