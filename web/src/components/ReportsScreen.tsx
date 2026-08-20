import { useEffect, useState } from 'react'
import { PageBar } from './PageBar'
import { api } from '../api'
import type { Progress, SessionResult } from '../types'

const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`

export function ReportsScreen() {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [sessions, setSessions] = useState<SessionResult[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.progress(), api.sessions(25)])
      .then(([p, s]) => {
        setProgress(p)
        setSessions(s.sessions)
      })
      .catch((err) => setError((err as Error).message))
  }, [])

  if (error) return <div className="status status--error">{error}</div>
  if (!progress) return <div className="status">Loading reports…</div>

  const totals = progress.totals

  return (
    <div className="reports">
      <PageBar title="Reports" />
      <h2>Progress</h2>

      <div className="stat-row">
        <div className="stat">
          <div className="stat__value">{totals.sessions ?? 0}</div>
          <div className="stat__label">Sessions completed</div>
        </div>
        <div className="stat">
          <div className="stat__value">{totals.minutes ?? 0}</div>
          <div className="stat__label">Minutes of therapy</div>
        </div>
        <div className="stat">
          <div className="stat__value">{percent(totals.accuracy as number | null)}</div>
          <div className="stat__label">Overall accuracy</div>
        </div>
        <div className="stat">
          <div className="stat__value">
            {totals.mean_rt_ms ? `${Math.round(totals.mean_rt_ms)}ms` : '—'}
          </div>
          <div className="stat__label">Mean reaction time</div>
        </div>
      </div>

      <h2>By activity</h2>
      {progress.by_activity.length === 0 ? (
        <p className="status">No completed sessions yet.</p>
      ) : (
        <table className="report">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Category</th>
              <th className="num">Sessions</th>
              <th className="num">Minutes</th>
              <th className="num">Accuracy</th>
              <th className="num">Mean RT</th>
              <th className="num">Best score</th>
            </tr>
          </thead>
          <tbody>
            {progress.by_activity.map((row) => (
              <tr key={row.activity_id}>
                <td>{row.name}</td>
                <td>{row.category}</td>
                <td className="num">{row.sessions}</td>
                <td className="num">{row.minutes}</td>
                <td className="num">{percent(row.accuracy)}</td>
                <td className="num">{row.mean_rt_ms ? `${Math.round(row.mean_rt_ms)}ms` : '—'}</td>
                <td className="num">{row.best_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 32 }}>Recent sessions</h2>
      {sessions.length === 0 ? (
        <p className="status">Nothing recorded yet.</p>
      ) : (
        <table className="report">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Mode</th>
              <th>Difficulty</th>
              <th className="num">Acuity</th>
              <th className="num">Score</th>
              <th className="num">Hits</th>
              <th className="num">Misses</th>
              <th className="num">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.activity_id.replace(/_/g, ' ')}</td>
                <td>{s.mode_id.replace(/_/g, ' ')}</td>
                <td>{s.difficulty}</td>
                <td className="num">20/{s.acuity}</td>
                <td className="num">{s.score}</td>
                <td className="num">{s.hits}</td>
                <td className="num">{s.misses}</td>
                <td className="num">{percent(s.accuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
