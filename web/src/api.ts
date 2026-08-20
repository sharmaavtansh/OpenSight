import type {
  Catalog,
  Difficulty,
  Progress,
  SessionPlan,
  SessionResult,
  Settings,
  Trial,
  User,
} from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText)
    throw new Error(`${response.status} ${path}: ${detail}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

/** Every call that reads or writes a visual configuration is scoped to a user.
 *
 *  Calibration describes a person at a screen - their pixel pitch, their
 *  glasses, how much each channel leaks for their eyes - so a single stored
 *  copy meant one person recalibrating silently changed everyone else's
 *  optotype sizes. `null` means no user selected, which reads and writes the
 *  shared install row, and is what a single-person desktop install does. */
const scoped = (path: string, patientId: number | null) =>
  patientId === null ? path : `${path}${path.includes('?') ? '&' : '?'}patient_id=${patientId}`

export const api = {
  catalog: (patientId: number | null = null) =>
    request<Catalog>(scoped('/api/catalog', patientId)),

  settings: (patientId: number | null = null) =>
    request<Settings>(scoped('/api/settings', patientId)),

  saveSettings: (settings: Omit<Settings, 'derived'>, patientId: number | null = null) =>
    request<Settings>(scoped('/api/settings', patientId), {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  users: () => request<{ patients: User[] }>('/api/patients'),

  createUser: (payload: { name: string; treated_eye?: string | null }) =>
    request<User>('/api/patients', { method: 'POST', body: JSON.stringify(payload) }),

  updateUser: (id: number, payload: { name: string; treated_eye?: string | null }) =>
    request<User>(`/api/patients/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  deleteUser: (id: number) => request<void>(`/api/patients/${id}`, { method: 'DELETE' }),

  startSession: (payload: {
    activity_id: string
    mode_id: string
    difficulty: Difficulty
    acuity: number
    duration_min: number
    device_pixel_ratio?: number
    seed?: number
    patient_id?: number | null
  }) =>
    request<SessionPlan>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  finishSession: (
    sessionId: string,
    payload: { elapsed_s: number; status: 'completed' | 'aborted'; trials: Trial[] },
  ) =>
    request<SessionResult>(`/api/sessions/${sessionId}/finish`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  sessions: (limit = 50) =>
    request<{ sessions: SessionResult[] }>(`/api/sessions?limit=${limit}`),

  progress: () => request<Progress>('/api/progress'),
}
