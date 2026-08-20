import { create } from 'zustand'
import { api } from './api'
import { sound } from './audio'
import type { Activity, Catalog, Difficulty, SessionPlan, Settings } from './types'

export type Screen =
  | 'therapy'
  | 'settings'
  | 'content-size'
  | 'colors'
  | 'controller'
  | 'reports'
  | 'assessment'
  | 'glasses'

interface AppState {
  catalog: Catalog | null
  settings: Settings | null
  loading: boolean
  error: string | null

  screen: Screen
  /** Screen to return to when a sub-screen closes. */
  returnTo: Screen
  therapyId: string
  modeId: string

  duration: number
  acuity: number
  difficulty: Difficulty

  plan: SessionPlan | null
  starting: string | null

  load: () => Promise<void>
  setScreen: (screen: Screen) => void
  closeScreen: () => void
  selectTherapy: (therapyId: string) => void
  selectMode: (modeId: string) => void
  setDuration: (minutes: number) => void
  setAcuity: (denominator: number) => void
  setDifficulty: (difficulty: Difficulty) => void
  /** Apply a prescribed plan to the control bar and jump to its therapy. */
  applyPlan: (plan: {
    mode_id: string
    therapy: string
    difficulty: Difficulty
    duration_min: number
    acuity: { start_denominator: number }
  }) => void
  launch: (activity: Activity) => Promise<void>
  closeGame: () => void
  saveSettings: (settings: Omit<Settings, 'derived'>) => Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  catalog: null,
  settings: null,
  loading: true,
  error: null,

  screen: 'therapy',
  returnTo: 'therapy',
  // Opens on MFBF > MFBF Left.
  therapyId: 'mfbf',
  modeId: 'mfbf_left',

  duration: 1,
  acuity: 200,
  difficulty: 'easy',

  plan: null,
  starting: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const [catalog, settings] = await Promise.all([api.catalog(), api.settings()])
      sound.configure({ enabled: settings.sound, volume: settings.sound_volume / 100 })
      set({ catalog, settings, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  // Opening a screen records the one it was opened from, so Colors reached
  // from the control bar returns to the grid rather than to Settings.
  setScreen: (screen) =>
    set((state) => (screen === state.screen ? {} : { screen, returnTo: state.screen })),

  closeScreen: () => set((state) => ({ screen: state.returnTo, returnTo: 'therapy' })),

  selectTherapy: (therapyId) => {
    const catalog = get().catalog
    const therapy = catalog?.therapies.find((t) => t.id === therapyId)
    set({
      therapyId,
      // Selecting a therapy drops to its first mode so the grid always has a
      // valid target.
      modeId: therapy?.children[0]?.id ?? get().modeId,
    })
  },

  selectMode: (modeId) => set({ modeId }),
  setDuration: (duration) => set({ duration }),
  setAcuity: (acuity) => set({ acuity }),
  setDifficulty: (difficulty) => set({ difficulty }),

  applyPlan: (plan) =>
    set({
      therapyId: plan.therapy,
      modeId: plan.mode_id,
      difficulty: plan.difficulty,
      duration: plan.duration_min,
      acuity: plan.acuity.start_denominator,
      screen: 'therapy',
      returnTo: 'therapy',
    }),

  launch: async (activity) => {
    const { modeId, difficulty, acuity, duration } = get()
    set({ starting: activity.id, error: null })
    try {
      const plan = await api.startSession({
        activity_id: activity.id,
        mode_id: modeId,
        difficulty,
        acuity,
        duration_min: duration,
        device_pixel_ratio: window.devicePixelRatio || 1,
      })
      set({ plan, starting: null })
    } catch (err) {
      set({ error: (err as Error).message, starting: null })
    }
  },

  closeGame: () => set({ plan: null }),

  saveSettings: async (settings) => {
    const saved = await api.saveSettings(settings)
    sound.configure({ enabled: saved.sound, volume: saved.sound_volume / 100 })
    set({ settings: saved })
    // Optotype sizes depend on calibration, so refresh the catalogue too.
    try {
      set({ catalog: await api.catalog() })
    } catch {
      /* keep the previous catalogue if the refresh fails */
    }
  },
}))
