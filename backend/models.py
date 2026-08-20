"""Request/response schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Outcome = Literal["hit", "miss", "false_alarm", "timeout"]


class CalibrationIn(BaseModel):
    viewing_distance_cm: float = Field(40.0, gt=5, le=300)
    # "Monitor Size - inches"
    screen_diagonal_in: float = Field(15.0, gt=3, le=120)
    screen_width_px: int = Field(1920, gt=0)
    screen_height_px: int = Field(1080, gt=0)
    device_pixel_ratio: float = Field(1.0, gt=0, le=8)
    # "Adjust Content Size" - width in CSS px of the reference E once the
    # patient has sized it to 7.2 cm (<=32in) or 10 cm (>32in) with a ruler.
    content_size_px: float | None = Field(None, gt=10, le=4000)


class ChannelCalibration(BaseModel):
    """One anaglyph channel as tuned on the Adjust Colors screen.

    ``alpha`` is the leakage calibration: the patient lowers it until the patch
    is invisible through the *opposite* filter. ``intensity`` is the 0-256
    colour level shown next to it.
    """

    hex: str = "#ff0000"
    intensity: int = Field(256, ge=0, le=256)
    alpha: float = Field(1.0, ge=0.0, le=1.0)


class BackgroundProfile(BaseModel):
    """Anaglyph pair for one background. Black uses red/blue, white red/cyan."""

    background: str = "#000000"
    channels: dict[str, ChannelCalibration] = {}


def _black_profile() -> BackgroundProfile:
    return BackgroundProfile(
        background="#000000",
        channels={
            "red": ChannelCalibration(hex="#ff0000", intensity=256, alpha=0.57),
            "blue": ChannelCalibration(hex="#0000ff", intensity=256, alpha=1.0),
        },
    )


def _white_profile() -> BackgroundProfile:
    return BackgroundProfile(
        background="#ffffff",
        channels={
            "red": ChannelCalibration(hex="#ff0000", intensity=256, alpha=1.0),
            "cyan": ChannelCalibration(hex="#00ffff", intensity=256, alpha=1.0),
        },
    )


class AnaglyphSettings(BaseModel):
    """Which filter sits over which eye, plus the two calibrated profiles."""

    left_filter: Literal["red", "blue"] = "red"
    active_background: Literal["black", "white"] = "black"
    black: BackgroundProfile = Field(default_factory=_black_profile)
    white: BackgroundProfile = Field(default_factory=_white_profile)
    # Surround colour that both eyes see, which is what holds fusion.
    fusion_dark: str = "#e8e8e8"
    fusion_light: str = "#101010"


class ControllerSettings(BaseModel):
    device: Literal["pointer", "keyboard", "gamepad"] = "pointer"
    invert_x: bool = False
    invert_y: bool = False
    dwell_ms: int = Field(0, ge=0, le=3000)


class SettingsIn(BaseModel):
    """The Global Settings screen, minus the AI Face Analyser."""

    calibration: CalibrationIn = Field(default_factory=CalibrationIn)
    anaglyph: AnaglyphSettings = Field(default_factory=AnaglyphSettings)
    controller: ControllerSettings = Field(default_factory=ControllerSettings)
    # Opacity of the fellow-eye channel during vergence work. Distinct from the
    # per-channel leakage alpha above: this one is titrated by the clinician to
    # push or relieve suppression, not to null out crosstalk.
    vergence_alpha: int = Field(70, ge=0, le=100)
    visual_error_feedback: bool = True
    sound: bool = True
    # An hour a day of blips is a lot for whoever else is in the room.
    sound_volume: int = Field(70, ge=0, le=100)
    show_frame_rate: bool = False
    # "For Patient" on the colour screen writes a per-patient override.
    scope: Literal["all", "patient"] = "all"


class SessionStart(BaseModel):
    activity_id: str
    mode_id: str
    difficulty: Literal["easy", "medium", "hard"] = "easy"
    acuity: int = 200
    duration_min: float = Field(1.0, gt=0, le=60)
    patient_id: int | None = None
    seed: int | None = None
    device_pixel_ratio: float | None = Field(None, gt=0, le=8)


class TrialIn(BaseModel):
    idx: int
    t_ms: float
    outcome: Outcome
    rt_ms: float | None = None
    target: str | None = None
    response: str | None = None
    x: float | None = None
    y: float | None = None


class SessionFinish(BaseModel):
    elapsed_s: float = 0.0
    status: Literal["completed", "aborted"] = "completed"
    trials: list[TrialIn] = []


class PatientIn(BaseModel):
    name: str
    dob: str | None = None
    treated_eye: Literal["left", "right", "both"] | None = None
    notes: str | None = None


class SessionPlan(BaseModel):
    session_id: str
    activity: dict[str, Any]
    mode: dict[str, Any]
    params: dict[str, Any]
    acuity: dict[str, Any]
    palette: dict[str, Any]
    seed: int
    duration_s: float
    stimuli: dict[str, Any]


class AssessmentStart(BaseModel):
    patient_id: int | None = None
    kind: Literal["baseline", "followup"] = "baseline"
    seed: int | None = None
    device_pixel_ratio: float | None = Field(None, gt=0, le=8)


class AssessmentResponse(BaseModel):
    """One 4AFC answer: which way the patient says the E opens."""

    direction: Literal["right", "down", "left", "up"]
    rt_ms: float | None = None
    device_pixel_ratio: float | None = Field(None, gt=0, le=8)
    # Which presentation this answers. Without it the server cannot tell an
    # answer to the letter on screen from a second answer that arrived while
    # the first was still in flight - and the second would be recorded against
    # an optotype the patient was never shown.
    seq: int | None = Field(None, ge=0)
