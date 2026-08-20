export type Eye = 'left' | 'right'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type Outcome = 'hit' | 'miss' | 'false_alarm' | 'timeout'

export interface TherapyMode {
  id: string
  name: string
  eye: Eye
  therapy?: string
  anaglyph?: boolean
}

export interface Therapy {
  id: string
  name: string
  anaglyph: boolean
  /** Card / selection colour: blue for monocular, orange for MFBF. */
  accent: string
  description: string
  children: TherapyMode[]
}

export interface Category {
  id: string
  name: string
}

export interface Activity {
  id: string
  category: string
  icon: string
  title: string[]
  name: string
  skill: string
  input: 'pointer' | 'keys' | 'choice' | 'drag'
  /** Briefing-screen copy; the launch title differs from the card title. */
  display_title?: string
  discipline?: string
  instructions?: string
}

export interface AcuityLevel {
  snellen: string
  denominator: number
  logmar: number
  mar_arcmin: number
  angular_height_arcmin: number
  height_mm: number
  height_css_px: number
  stroke_css_px: number
  calibrated: boolean
  renderable: boolean
}

export interface Catalog {
  therapies: Therapy[]
  categories: Category[]
  activities: Activity[]
  /** Activity sets differ per therapy, so the grid reads from here. */
  activities_by_therapy: Record<string, Activity[]>
  difficulties: Difficulty[]
  acuity_levels: number[]
  acuity_table: AcuityLevel[]
  duration_range: { min: number; max: number; step: number; unit: string }
}

export interface Palette {
  anaglyph: boolean
  treated_eye: Eye
  treated_filter?: string
  background: string
  background_key: string
  target: string
  suppressed: string
  fusion: string
  polarity: 'dark' | 'light'
  channels?: Record<string, string>
  note: string
}

export interface GameParams {
  difficulty: Difficulty
  optotype_px: number
  stroke_px: number
  speed_pps?: number
  spawn_ms?: number
  distractors?: number
  span?: number
  exposure_ms?: number
  window_ms?: number
  tolerance_mult?: number
  hit_radius_px?: number
  crowding_ratio?: number
  crowd_gap_px?: number
}

export interface Stimuli {
  sequence?: string[]
  lures?: string[]
  letters?: string[]
  targets?: string[]
  orientations?: string[]
  angles?: number[]
  moods?: string[]
  words?: string[]
  shapes?: string[]
  trials?: any[]
}

export interface SessionPlan {
  session_id: string
  activity: Activity
  mode: TherapyMode
  params: GameParams
  acuity: AcuityLevel
  palette: Palette
  seed: number
  duration_s: number
  stimuli: Stimuli
}

export interface Trial {
  idx: number
  t_ms: number
  outcome: Outcome
  rt_ms?: number | null
  target?: string | null
  response?: string | null
  x?: number | null
  y?: number | null
}

export interface SessionResult {
  id: string
  activity_id: string
  mode_id: string
  eye: Eye
  difficulty: Difficulty
  acuity: number
  score: number
  hits: number
  misses: number
  false_alarms: number
  mean_rt_ms: number | null
  elapsed_s: number
  accuracy: number | null
  targets_per_min: number | null
  status: string
}

export interface ChannelCalibration {
  hex: string
  intensity: number
  alpha: number
}

export interface BackgroundProfile {
  background: string
  channels: Record<string, ChannelCalibration>
}

export interface Settings {
  calibration: {
    viewing_distance_cm: number
    screen_diagonal_in: number
    screen_width_px: number
    screen_height_px: number
    device_pixel_ratio: number
    content_size_px: number | null
  }
  anaglyph: {
    left_filter: 'red' | 'blue'
    active_background: 'black' | 'white'
    black: BackgroundProfile
    white: BackgroundProfile
    fusion_dark: string
    fusion_light: string
  }
  controller: {
    device: 'pointer' | 'keyboard' | 'gamepad'
    invert_x: boolean
    invert_y: boolean
    dwell_ms: number
  }
  vergence_alpha: number
  visual_error_feedback: boolean
  sound: boolean
  sound_volume: number
  show_frame_rate: boolean
  scope: 'all' | 'patient'
  derived?: {
    ppi: number
    nominal_ppi: number
    pixels_per_mm: number
    calibrated: boolean
    reference_e_cm: number
    acuity_table: AcuityLevel[]
  }
}

export interface Progress {
  totals: Record<string, number | null>
  by_activity: Array<Record<string, any>>
  by_day: Array<Record<string, any>>
}
