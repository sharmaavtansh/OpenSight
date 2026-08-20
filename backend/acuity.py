"""Optotype sizing.

Converts a Snellen acuity target (20/200, 20/40, ...) into a concrete pixel
height for the current display and viewing distance.

Geometry
--------
A Snellen optotype is built on a 5x5 grid. At the "20/D" line the minimum
angle of resolution is::

    MAR = D / 20   (arcminutes)

and the whole letter subtends ``5 * MAR`` arcminutes, with a stroke width of
one MAR. The physical height subtending an angle ``t`` at distance ``d`` is::

    h = 2 * d * tan(t / 2)

which is then scaled by the display's pixel pitch.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# Snellen denominators offered in the Acuity dropdown, coarsest first.
# These follow the standard logMAR 0.1-step progression.
ACUITY_LEVELS: list[int] = [200, 160, 125, 100, 80, 63, 50, 40, 32, 25, 20]

MM_PER_INCH = 25.4
ARCMIN_PER_DEGREE = 60.0

# "Adjust Content Size" targets, from the calibration screen: the reference E
# is sized against a ruler to a fixed physical width that depends on how large
# the screen is.
REFERENCE_E_CM_SMALL = 7.2   # screens up to 32 inch
REFERENCE_E_CM_LARGE = 10.0  # screens above 32 inch
LARGE_SCREEN_IN = 32.0


@dataclass(frozen=True)
class DisplayCalibration:
    """Physical description of the screen the patient is looking at."""

    viewing_distance_cm: float = 40.0
    screen_diagonal_in: float = 15.6
    screen_width_px: int = 1920
    screen_height_px: int = 1080
    device_pixel_ratio: float = 1.0
    # Width in CSS pixels of the reference E on the "Adjust Content Size"
    # screen, after the patient has sized it against a real ruler. This
    # measures pixel pitch directly and beats anything derived from a nominal
    # diagonal, so it wins whenever it is present.
    content_size_px: float | None = None

    @property
    def reference_e_cm(self) -> float:
        """Physical width the reference E must be measured at."""
        return REFERENCE_E_CM_LARGE if self.screen_diagonal_in > LARGE_SCREEN_IN else REFERENCE_E_CM_SMALL

    @property
    def measured_ppi(self) -> float | None:
        """Device PPI implied by the ruler calibration, if it has been done."""
        if not self.content_size_px or self.content_size_px <= 0:
            return None
        css_px_per_inch = (self.content_size_px / self.reference_e_cm) * MM_PER_INCH / 10.0
        return css_px_per_inch * self.device_pixel_ratio

    @property
    def calibrated(self) -> bool:
        return self.measured_ppi is not None

    @property
    def nominal_ppi(self) -> float:
        """Pixels per inch derived from the stated screen diagonal."""
        diagonal_px = math.hypot(self.screen_width_px, self.screen_height_px)
        if self.screen_diagonal_in <= 0:
            raise ValueError("screen_diagonal_in must be positive")
        return diagonal_px / self.screen_diagonal_in

    @property
    def ppi(self) -> float:
        """Physical device pixels per inch, measured if available."""
        return self.measured_ppi if self.calibrated else self.nominal_ppi

    @property
    def pixels_per_mm(self) -> float:
        return self.ppi / MM_PER_INCH

    @property
    def viewing_distance_mm(self) -> float:
        return self.viewing_distance_cm * 10.0


def mar_arcmin(denominator: int) -> float:
    """Minimum angle of resolution, in arcminutes, for a 20/``denominator`` line."""
    if denominator <= 0:
        raise ValueError("Snellen denominator must be positive")
    return denominator / 20.0


def logmar(denominator: int) -> float:
    """logMAR score for a 20/``denominator`` line (20/20 -> 0.0, 20/200 -> 1.0)."""
    return math.log10(mar_arcmin(denominator))


def angular_height_arcmin(denominator: int) -> float:
    """Total angular height of the optotype (5 grid units)."""
    return 5.0 * mar_arcmin(denominator)


def _angle_to_mm(arcmin: float, distance_mm: float) -> float:
    radians = math.radians(arcmin / ARCMIN_PER_DEGREE)
    return 2.0 * distance_mm * math.tan(radians / 2.0)


def optotype_height_mm(denominator: int, cal: DisplayCalibration) -> float:
    return _angle_to_mm(angular_height_arcmin(denominator), cal.viewing_distance_mm)


def optotype_height_px(denominator: int, cal: DisplayCalibration) -> float:
    """Optotype height in *device* pixels."""
    return optotype_height_mm(denominator, cal) * cal.pixels_per_mm


def optotype_height_css_px(denominator: int, cal: DisplayCalibration) -> float:
    """Optotype height in CSS pixels, which is what the canvas layout uses."""
    dpr = cal.device_pixel_ratio if cal.device_pixel_ratio > 0 else 1.0
    return optotype_height_px(denominator, cal) / dpr


def stroke_width_css_px(denominator: int, cal: DisplayCalibration) -> float:
    """Stroke/gap width — one MAR, i.e. one fifth of the optotype height."""
    return optotype_height_css_px(denominator, cal) / 5.0


def describe(denominator: int, cal: DisplayCalibration) -> dict:
    """Full sizing packet handed to the client for one acuity level."""
    css_px = optotype_height_css_px(denominator, cal)
    return {
        "snellen": f"20/{denominator}",
        "denominator": denominator,
        "logmar": round(logmar(denominator), 3),
        "mar_arcmin": round(mar_arcmin(denominator), 3),
        "angular_height_arcmin": round(angular_height_arcmin(denominator), 2),
        "height_mm": round(optotype_height_mm(denominator, cal), 3),
        "height_css_px": round(css_px, 2),
        "stroke_css_px": round(stroke_width_css_px(denominator, cal), 2),
        "calibrated": cal.calibrated,
        # Below roughly 6 css px the optotype stops being reliably renderable.
        "renderable": css_px >= 6.0,
    }


def acuity_table(cal: DisplayCalibration) -> list[dict]:
    return [describe(d, cal) for d in ACUITY_LEVELS]
