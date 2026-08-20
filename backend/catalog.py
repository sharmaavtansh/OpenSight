"""Therapy tree and activity catalogue - the single source of truth.

The navigation rail, the sub-nav and the activity grid are all rendered from
this structure, so adding an activity is a one-line change here plus a game
module on the client.
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Therapy modes
# ---------------------------------------------------------------------------
# MFBF = Monocular Fixation in a Binocular Field. Both eyes stay open behind
# red/blue anaglyph glasses; the target is drawn in the colour only the
# treated eye can see, while the surround is drawn in a colour both eyes see.
# That forces the treated eye to do the fixation work without breaking fusion.
#
# Monocular therapy patches the fellow eye instead, so no anaglyph channel is
# used and everything renders in full contrast.

THERAPIES: list[dict[str, Any]] = [
    {
        "id": "monocular",
        "name": "Monocular",
        "anaglyph": False,
        "accent": "#1a6dff",
        "description": "Fellow eye patched. Full-contrast targets for the treated eye.",
        "children": [
            {"id": "monocular_left", "name": "Monocular Left", "eye": "left"},
            {"id": "monocular_right", "name": "Monocular Right", "eye": "right"},
        ],
    },
    {
        "id": "mfbf",
        "name": "MFBF",
        "anaglyph": True,
        "accent": "#ef5b2b",
        "description": "Monocular Fixation in a Binocular Field. Red/blue glasses, both eyes open.",
        "children": [
            {"id": "mfbf_left", "name": "MFBF Left", "eye": "left"},
            {"id": "mfbf_right", "name": "MFBF Right", "eye": "right"},
        ],
    },
]

CATEGORIES: list[dict[str, str]] = [
    {"id": "others", "name": "Others"},
    {"id": "pursuits", "name": "Pursuits"},
    {"id": "saccades", "name": "Saccades"},
    {"id": "crowding", "name": "Crowding"},
]

# `title` carries the on-card line break shown in the UI.
ACTIVITIES: list[dict[str, Any]] = [
    # --- Others -------------------------------------------------------------
    {
        "id": "shoot_the_asteroids", "category": "others", "icon": "rocket",
        "title": ["Rocket Letters"], "name": "Rocket Letters",
        "skill": "Visual-motor targeting under time pressure.",
        "input": "pointer",
    },
    {
        "id": "crush_the_letters", "category": "others", "icon": "tiles",
        "title": ["Letter Tiles"], "name": "Letter Tiles",
        "skill": "Letter discrimination and visual search.",
        "input": "pointer",
    },
    {
        "id": "connect_the_letters", "category": "others", "icon": "graph",
        "title": ["Letter Links"], "name": "Letter Links",
        "skill": "Sequencing and directed scanning.",
        "input": "pointer",
    },
    {
        "id": "hop_the_e", "category": "others", "icon": "hoop",
        "title": ["Hop the E"], "name": "Hop the E",
        "skill": "Directional discrimination with a tumbling E.",
        "input": "keys",
    },
    {
        "id": "alphabet_racer", "category": "others", "icon": "car",
        "title": ["Alphabet Racer"], "name": "Alphabet Racer",
        "skill": "Sustained pursuit with sequential targeting.",
        "input": "pointer",
    },
    {
        "id": "drop_the_balls", "category": "others", "icon": "funnel",
        "title": ["Ball Drop"], "name": "Ball Drop",
        "skill": "Interception timing and anticipation.",
        "input": "pointer",
    },
    {
        "id": "ice_jump", "category": "others", "icon": "cube",
        "title": ["Ice Jump"], "name": "Ice Jump",
        "skill": "Step-wise fixation across a moving field.",
        "input": "pointer",
    },
    {
        "id": "trace_magic", "category": "others", "icon": "trace",
        "title": ["Trace Magic"], "name": "Trace Magic",
        "skill": "Smooth visual-motor tracing along a path.",
        "input": "drag",
    },
    # --- Pursuits -----------------------------------------------------------
    {
        "id": "balloon_pop_pursuit", "category": "pursuits", "icon": "balloon",
        "title": ["Balloon Float"], "name": "Balloon Float",
        "skill": "Smooth pursuit of a continuously moving target.",
        "input": "pointer",
    },
    {
        # Monocular can use naturally coloured fruit; inside an anaglyph channel
        # the stimulus has to be colour-neutral, so MFBF calls them "items".
        "id": "catch_the_falling_items", "category": "pursuits", "icon": "basket",
        "title": ["Basket Catch"], "name": "Basket Catch",
        "title_by_therapy": {"monocular": ["Catch the Fruits"]},
        "name_by_therapy": {"monocular": "Catch the Fruits"},
        "skill": "Vertical pursuit and interception.",
        "input": "pointer",
    },
    {
        # Contrast work needs the full luminance range, which an anaglyph
        # channel does not have - monocular only.
        "id": "match_symbol_contrast_pursuit", "category": "pursuits", "icon": "contrast",
        "title": ["Follow the", "Faint Shape"],
        "name": "Follow the Faint Shape",
        "therapies": ["monocular"],
        "skill": "Contrast-sensitivity matching during smooth pursuit.",
        "input": "pointer",
    },
    {
        "id": "floating_letters_tachistoscope", "category": "pursuits", "icon": "flash",
        "title": ["Flash and Float"], "name": "Flash and Float",
        "skill": "Brief-exposure recognition on a moving target.",
        "input": "choice",
    },
    {
        "id": "common_word_sequence", "category": "pursuits", "icon": "words",
        "title": ["Word Builder"], "name": "Word Builder",
        "skill": "Word-level tracking and ordered recall.",
        "input": "pointer",
    },
    # --- Saccades -----------------------------------------------------------
    {
        "id": "balloon_pop_saccades", "category": "saccades", "icon": "balloonJump",
        "title": ["Balloon Jump"], "name": "Balloon Jump",
        "skill": "Large-amplitude saccades to abrupt onsets.",
        "input": "pointer",
    },
    {
        "id": "jump_letters_tachistoscope", "category": "saccades", "icon": "letterJump",
        "title": ["Flash and Jump"], "name": "Flash and Jump",
        "skill": "Saccade plus brief-exposure identification.",
        "input": "choice",
    },
    {
        "id": "number_text", "category": "saccades", "icon": "numbers",
        "title": ["Number Names"], "name": "Number Names",
        "skill": "Left-to-right scanning across a number array.",
        "input": "pointer",
    },
    {
        "id": "match_symbol_contrast_saccades", "category": "saccades", "icon": "contrastJump",
        "title": ["Find the", "Faint Shape"],
        "name": "Find the Faint Shape",
        "therapies": ["monocular"],
        "skill": "Contrast-sensitivity matching across saccadic shifts.",
        "input": "pointer",
    },
    # --- Crowding -----------------------------------------------------------
    {
        "id": "smiley", "category": "crowding", "icon": "smiley",
        "title": ["Find the Face"], "name": "Find the Face",
        "skill": "Target detection among tightly spaced flankers.",
        "input": "pointer",
    },
    {
        "id": "match_the_slant_lines", "category": "crowding", "icon": "slant",
        "title": ["Matching Lines"], "name": "Matching Lines",
        "skill": "Orientation matching under crowding.",
        "input": "pointer",
    },
    {
        "id": "pattern_matching", "category": "crowding", "icon": "barPattern",
        "title": ["Pattern Matching"], "name": "Pattern Matching",
        "skill": "Form discrimination under crowding.",
        "input": "pointer",
    },
]

# Briefing screen copy. The discipline label does not always match the grid
# grouping - the rocket game sits under "Others" in the grid but trains
# saccades, and the briefing says so.
BRIEFINGS: dict[str, dict[str, Any]] = {
    "shoot_the_asteroids": {
        "display_title": "Rocket Letters",
        "discipline": "Saccades",
        "instructions": "Steer the rocket with the mouse or arrow keys. Press space or click to send a beam at the letter you are looking for.",
    },
    "crush_the_letters": {
        "display_title": "Letter Tiles",
        "discipline": "Saccades",
        "instructions": "Match 3 or more of the same letters in a row or column to make them disappear and score points.\nClick and drag letters to swap with nearby ones.",
    },
    "connect_the_letters": {
        "display_title": "Letter Links",
        "discipline": "Saccades",
        "instructions": "Connect the same letters vertically, horizontally, and diagonally.",
    },
    "hop_the_e": {
        "display_title": "Hop the E",
        "discipline": "Saccades",
        "instructions": "Bounce the ball through the open side of the E.\nPress space or click to bounce upward.\nThe ball falls under gravity, so time each bounce.",
    },
    "alphabet_racer": {
        "display_title": "Alphabet Racer",
        "discipline": "Pursuits",
        "instructions": "Your letter is shown at the top. Steer the car into the lane where that letter appears.",
    },
    "drop_the_balls": {
        "display_title": "Ball Drop",
        "discipline": "Pursuits",
        "instructions": "Release a ball when the box below shows your letter.\nThe run ends when the tube is empty.",
    },
    "ice_jump": {
        "display_title": "Ice Jump",
        "discipline": "Saccades",
        "instructions": "The base slides left and right. Click or press space to launch the ice cube up into the glass marked with your letter.",
    },
    "trace_magic": {
        "display_title": "Trace Magic",
        "discipline": "Pursuits",
        "instructions": "Hold the pointer down and trace along the path through every node.",
    },
    "balloon_pop_pursuit": {
        "display_title": "Balloon Float",
        "discipline": "Pursuits",
        "instructions": "Follow a balloon as it drifts. Click or press space only while its letter is the right way up.",
    },
    "catch_the_falling_items": {
        "display_title": "Basket Catch",
        "discipline": "Pursuits",
        "instructions": "Move the basket with the mouse and catch what falls.",
    },
    "floating_letters_tachistoscope": {
        "display_title": "Flash and Float",
        "discipline": "Pursuits",
        "instructions": "A short word flashes. Then click its letters, in order, as they drift among the others.",
    },
    "common_word_sequence": {
        "display_title": "Word Builder",
        "discipline": "Pursuits",
        "instructions": "Read the word, then click its letters in order as they float past.",
    },
    "match_symbol_contrast_pursuit": {
        "display_title": "Follow the Faint Shape",
        "discipline": "Pursuits",
        "instructions": "Track the moving symbols and click the one whose contrast matches the reference.",
    },
    "balloon_pop_saccades": {
        "display_title": "Balloon Jump",
        "discipline": "Saccades",
        "instructions": "Balloons appear away from centre. Pop one using mouse or space bar only when it matches the given target.",
    },
    "jump_letters_tachistoscope": {
        "display_title": "Flash and Jump",
        "discipline": "Saccades",
        "instructions": "A short word flashes. Then click its letters in order - they jump to a new place each time.",
    },
    "number_text": {
        "display_title": "Number Names",
        "discipline": "Pursuits",
        "instructions": "Read the numbers, then click their written names in the same order.",
    },
    "match_symbol_contrast_saccades": {
        "display_title": "Find the Faint Shape",
        "discipline": "Saccades",
        "instructions": "Jump to the symbol whose contrast matches the reference.",
    },
    "smiley": {
        "display_title": "Find the Face",
        "discipline": "Crowding",
        "instructions": "Find every face that matches the one shown, and click each one.",
    },
    "match_the_slant_lines": {
        "display_title": "Matching Lines",
        "discipline": "Crowding",
        "instructions": "Find all the lines matching the slant shown and click on them.",
    },
    "pattern_matching": {
        "display_title": "Pattern Matching",
        "discipline": "Crowding",
        "instructions": "Click the matching pattern.",
    },
}

ACTIVITY_BY_ID: dict[str, dict[str, Any]] = {a["id"]: a for a in ACTIVITIES}

_MODE_BY_ID: dict[str, dict[str, Any]] = {}
for _therapy in THERAPIES:
    for _child in _therapy["children"]:
        _MODE_BY_ID[_child["id"]] = {
            **_child,
            "therapy": _therapy["id"],
            "anaglyph": _therapy["anaglyph"],
        }


def get_mode(mode_id: str) -> dict[str, Any]:
    if mode_id not in _MODE_BY_ID:
        raise KeyError(f"unknown therapy mode: {mode_id}")
    return _MODE_BY_ID[mode_id]


def get_activity(activity_id: str) -> dict[str, Any]:
    if activity_id not in ACTIVITY_BY_ID:
        raise KeyError(f"unknown activity: {activity_id}")
    return ACTIVITY_BY_ID[activity_id]


def activities_for(category: str | None = None) -> list[dict[str, Any]]:
    if category is None:
        return list(ACTIVITIES)
    return [a for a in ACTIVITIES if a["category"] == category]


def supports(activity: dict[str, Any], therapy_id: str) -> bool:
    """An activity is offered in every therapy unless it names a subset."""
    return therapy_id in activity.get("therapies", ("monocular", "mfbf"))


def resolve_activity(activity: dict[str, Any], therapy_id: str) -> dict[str, Any]:
    """Apply the therapy-specific label overrides for display."""
    resolved = {
        key: value
        for key, value in activity.items()
        if key not in ("title_by_therapy", "name_by_therapy")
    }
    # Briefing copy travels with the activity so the launch screen needs no
    # second request.
    resolved.update(BRIEFINGS.get(activity["id"], {}))
    title = activity.get("title_by_therapy", {}).get(therapy_id)
    name = activity.get("name_by_therapy", {}).get(therapy_id)
    if title:
        resolved["title"] = title
    if name:
        resolved["name"] = name
    return resolved


def activities_for_therapy(therapy_id: str) -> list[dict[str, Any]]:
    return [resolve_activity(a, therapy_id) for a in ACTIVITIES if supports(a, therapy_id)]


def tree() -> dict[str, Any]:
    return {
        "therapies": THERAPIES,
        "categories": CATEGORIES,
        # Every therapy gets its own resolved list, since the sets and the
        # labels genuinely differ between monocular and MFBF.
        "activities_by_therapy": {
            t["id"]: activities_for_therapy(t["id"]) for t in THERAPIES
        },
        "activities": ACTIVITIES,
    }
