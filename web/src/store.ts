import { create } from 'zustand'
import { api } from './api'
import { sound } from './audio'
import type {
  Account,
  Activity,
  Catalog,
  Difficulty,
  SessionPlan,
  Settings,
  User,
} from './types'

// Which user was last in front of this screen. Kept in localStorage rather
// than on the server: it is a property of this browser, not of the install,
// so two devices can sit on different users at the same time.
const STORED_USER = 'opensight.patientId'

function readStoredUser(): number | null {
  const raw = localStorage.getItem(STORED_USER)
  if (!raw) return null
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

function writeStoredUser(id: number | null): void {
  if (id === null) localStorage.removeItem(STORED_USER)
  else localStorage.setItem(STORED_USER, String(id))
}

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

  /** Whose visual configuration is in force. null = the shared install row. */
  patientId: number | null
  users: User[]
  /** Who is signed in, or null on an install with no accounts. */
  account: Account | null
  /** True once accounts exist: the shell then shows an account, not a picker. */
  authRequired: boolean
  load: () => Promise<void>
  signOut: () => Promise<void>
  loadUsers: () => Promise<void>
  selectUser: (patientId: number | null) => Promise<void>
  createUser: (name: string) => Promise<void>
  deleteUser: (patientId: number) => Promise<void>
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

  // Restored across reloads: on a shared machine the person mid-programme
  // should not silently land on someone else's calibration.
  patientId: readStoredUser(),
  users: [],
  account: null,
  authRequired: false,

  load: async () => {
    set({ loading: true, error: null })
    try {
      // Signed in? Then the account decides the scope and the stored id is
      // irrelevant - the server ignores it anyway.
      const auth = await api
        .authState()
        .catch(() => ({ accounts_exist: false, required: false, account: null }))
      const id = auth.account ? auth.account.id : get().patientId
      const [catalog, settings, users] = await Promise.all([
        api.catalog(id),
        api.settings(id),
        api.users().then((r) => r.patients).catch(() => [] as User[]),
      ])
      sound.configure({ enabled: settings.sound, volume: settings.sound_volume / 100 })
      // A stored id for a user since deleted would silently fall back to the
      // install row without saying so; drop it instead.
      const stillExists = id === null || users.some((u) => u.id === id)
      set({
        catalog,
        settings,
        users,
        account: auth.account,
        authRequired: auth.required,
        patientId: auth.account ? auth.account.id : stillExists ? id : null,
        loading: false,
      })
      if (!stillExists) writeStoredUser(null)
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
        patient_id: get().patientId,
      })
      set({ plan, starting: null })
    } catch (err) {
      set({ error: (err as Error).message, starting: null })
    }
  },

  closeGame: () => set({ plan: null }),

  saveSettings: async (settings) => {
    const id = get().patientId
    const saved = await api.saveSettings(settings, id)
    sound.configure({ enabled: saved.sound, volume: saved.sound_volume / 100 })
    set({ settings: saved })
    // Optotype sizes depend on calibration, so refresh the catalogue too.
    try {
      set({ catalog: await api.catalog(id) })
    } catch {
      /* keep the previous catalogue if the refresh fails */
    }
  },

  signOut: async () => {
    try {
      await api.logout()
    } finally {
      writeStoredUser(null)
      window.location.href = '/login'
    }
  },

  loadUsers: async () => {
    try {
      set({ users: (await api.users()).patients })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  /** Switching user reloads settings and catalogue together: the acuity table
   *  is computed from calibration, so leaving the old one on screen would show
   *  optotype sizes that belong to someone else. */
  selectUser: async (patientId) => {
    writeStoredUser(patientId)
    set({ patientId, loading: true, error: null })
    try {
      const [catalog, settings] = await Promise.all([
        api.catalog(patientId),
        api.settings(patientId),
      ])
      sound.configure({ enabled: settings.sound, volume: settings.sound_volume / 100 })
      set({ catalog, settings, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  createUser: async (name) => {
    try {
      const user = await api.createUser({ name })
      set({ users: [...get().users, user] })
      await get().selectUser(user.id)
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  deleteUser: async (patientId) => {
    try {
      await api.deleteUser(patientId)
      set({ users: get().users.filter((u) => u.id !== patientId) })
      if (get().patientId === patientId) await get().selectUser(null)
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },
}))
