import type {
  Catalog,
  Difficulty,
  Progress,
  SessionPlan,
  SessionResult,
  Settings,
  Trial,
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

export const api = {
  catalog: () => request<Catalog>('/api/catalog'),

  settings: () => request<Settings>('/api/settings'),

  saveSettings: (settings: Omit<Settings, 'derived'>) =>
    request<Settings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  startSession: (payload: {
    activity_id: string
    mode_id: string
    difficulty: Difficulty
    acuity: number
    duration_min: number
    device_pixel_ratio?: number
    seed?: number
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
