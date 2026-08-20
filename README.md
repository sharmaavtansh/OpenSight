# OpenSight — Home Edition

Vision-therapy platform: monocular and MFBF activity delivery for home use,
with a built-in acuity assessment that sets the starting difficulty.

**Developed by Avtansh Sharma. Built for the community — free to use.**

Not a medical device, and not a substitute for an eye examination. It measures
and trains, but it does not diagnose; anything it flags should be taken to a
clinician.

**Python (FastAPI + SQLite)** owns the clinical logic — optotype sizing, display
calibration, anaglyph channel resolution, difficulty, seeded session plans and
results. **React 19 + TypeScript (Vite)** renders the shell and runs the
activities on a canvas engine.

---

## Running it

**Double-click `opensight.bat`.** It checks the interpreter and dependencies, starts
the server and opens a browser at <http://127.0.0.1:8420/>.

Leave that console window open — closing it stops the app. Ctrl+C in the window
also stops it.

Equivalent from a terminal:

```bash
py -3.11 run.py
```

First-time setup, if dependencies are missing:

```bash
py -3.11 -m pip install -r requirements.txt
```

Build the UI once before the first run (Node 20+):

```bash
cd web && npm install && npm run build
```

The Python service serves the built files from `web/dist`.

For UI development, run the API and Vite separately — Vite proxies `/api`
through to the Python service:

```bash
py -3.11 -m uvicorn backend.main:app --port 8420
```

```bash
cd web && npm run dev
```

API docs are at `/docs`.

---

## Deploying

The app ships as a container: Node builds the UI, Python serves it. There is no
Node in the runtime image.

```bash
fly auth login
fly launch --no-deploy
fly volumes create opensight_data --size 1
fly secrets set OPENSIGHT_PASSWORD='choose-something-long'
fly deploy
```

Two constraints are not negotiable.

**One machine.** SQLite has no coordination between hosts, so a second machine
writing the same volume corrupts the database. `fly scale count 2` breaks this
app; scaling it means moving to Postgres first.

**The volume is the database.** A container filesystem is discarded on every
deploy. Without `opensight_data` mounted at `/data`, every deploy silently
starts from an empty database and the patient history is gone.

### The password

There are no user accounts. Every endpoint trusts whoever can reach it, which
is correct for one family on one machine and wrong on a public URL, where the
patient table holds names, dates of birth and notes.

`OPENSIGHT_PASSWORD` puts one shared password in front of everything. Unset, the
gate does nothing, so the desktop launcher needs no password. Set, every route
except `/api/health` needs a session cookie signed with a key derived from the
password - so sessions survive a restart, and changing the password ends all of
them. Five failures from one address triggers a five-minute backoff.

It is a lock on the front door, not a user system: everyone who gets in shares
one identity and sees everything.

One consequence worth stating plainly, because it is not a privacy problem but
a correctness one: **display calibration is global**. Screen size, pixel pitch
and anaglyph colours are stored once for the whole instance. If two people use
one deployment from different screens, the second recalibration silently
changes the first person's optotype sizes, and their acuity numbers stop
meaning what they say. One instance per display.

---

## Why the Python side is not just a static file server

Four things are deliberately server-side, because getting them wrong is a
clinical error rather than a cosmetic one.

### 1. Optotype sizing (`backend/acuity.py`)

A Snellen optotype sits on a 5×5 grid. At the 20/D line the minimum angle of
resolution is `MAR = D/20` arcminutes and the letter subtends `5 × MAR`. The
physical height subtending angle `t` at distance `d` is `h = 2d·tan(t/2)`,
scaled by pixel pitch.

At 40 cm, 20/20 works out to a **0.58 mm** letter — which on a 141 PPI panel is
3.2 CSS pixels, too small to render honestly. The API returns a `renderable`
flag rather than silently drawing a wrong-sized letter.

### 2. Ruler calibration ("Adjust Content Size")

The patient measures the reference E against a real ruler and steps it to
**7.2 cm (screens ≤ 32″) or 10 cm (above)**. The stored value is the E's width
in pixels; PPI is derived from it. A measured pitch always beats one guessed
from a nominal diagonal, so it wins whenever present.

### 3. Anaglyph channel resolution (`backend/planner.py`)

MFBF = Monocular Fixation in a Binocular Field: both eyes open behind red/blue
glasses, with the *target* drawn in the colour only the treated eye can see and
the *surround* in a colour both eyes see, so fusion holds while the treated eye
does the fixation work.

Two subtleties the implementation respects:

- **Polarity flips with background.** On black, a colour matching a filter
  passes it and is blocked by the other. On white the same colour washes out for
  the matching eye and reads as a dark silhouette to the other — visibility
  inverts. Black is calibrated as red/blue, white as **red/cyan**, as separate
  profiles.
- **Per-channel leakage alpha.** Each channel carries an intensity (0–256) and
  an alpha tuned until the patch is invisible through the opposite filter. That
  alpha flows straight through to the canvas colour.

Monocular therapy patches the fellow eye, so there is no channel to separate and
all three render colours collapse to one, with a "patch your *X* eye"
instruction.

### 4. Seeded session plans (`backend/planner.py`)

A session is built from one integer seed: same seed, identical session. The
stimulus set is never chosen by the client, so difficulty cannot drift between
builds, and a stored result can be replayed for audit.

---

## Layout

```
backend/
  acuity.py      Snellen/logMAR -> mm -> pixels; ruler calibration
  difficulty.py  (activity, difficulty, acuity) -> runtime parameters
  catalog.py     therapy tree, per-therapy activity sets, briefing copy
  planner.py     palette resolution + seeded stimulus generation
  db.py          SQLite schema (sessions, trials, patients, settings)
  routers/       catalog, sessions, progress, settings, patients
web/src/
  components/    shell, control bar, activity grid, settings, calibration
  game/
    engine.ts    canvas runner, clock, trial log, drawing primitives
    games.ts     shared mechanics + activity registry
    bespoke.ts   activities with their own mechanics
    GameHost.tsx briefing -> play -> result, plus the in-game settings modal
```

## Therapy sets

The activity list differs per therapy:

| Therapy | Total | Others | Pursuits | Saccades | Crowding |
|---|---|---|---|---|---|
| Monocular | 20 | 8 | 5 | 4 | 3 |
| MFBF | 18 | 8 | 4 | 3 | 3 |

Monocular adds the two *Faint Shape* activities — contrast work
needs the full luminance range an anaglyph channel does not have — and renames
the catch game to *Catch the Fruits*, since fruit colours cannot survive inside
a single channel. Cards are blue in Monocular and orange in MFBF, and the
Red/Blue swatches only appear for anaglyph therapies.

## Activity mechanics

Eighteen of the twenty activities have their own bespoke mechanic:

| Activity | Mechanic |
|---|---|
| Rocket Letters | rocket flown by mouse or arrows, constant-speed ray, tumbling letters, glow on a correct hit and a cross over the letter on a wrong one |
| Hop the E | gravity bounce through the open side of a tumbling-E gate, spike hazards |
| Letter Tiles | match-3 on a 6x6 letter board, drag to swap, cascades |
| Letter Links | connect identical letters along a clear vertical, horizontal or diagonal line |
| Alphabet Racer | lane runner; steer into the lane holding the target letter |
| Ball Drop | release from a hopper onto the box marked with the target letter; ends when the tube empties |
| Ice Jump | time a jump so the cube lands in the matching-letter glass |
| Trace Magic | trace a shape, staying inside the path corridor |
| Balloon Float | balloons carry a wrongly oriented E that rights itself after 5-6s; pop only while correct |
| Balloon Jump | as above, with balloons appearing away from centre |
| Basket Catch | basket follows the mouse; catch whatever falls |
| Flash and Float | a three-letter nursery word flashes, then its letters drift among lures - click to spell it back |
| Flash and Jump | same recall, but the letters teleport, forcing a saccade each time |
| Word Builder | same recall with the word shown rather than flashed |
| Number Names | digits are shown, then their written names float - click them in order |
| Find the Face | find every face matching the reference among crowded flankers |
| Matching Lines | find every line matching the reference slant |
| Pattern Matching | find every three-row bar pattern matching the reference |

The two **Faint Shape** activities (monocular only) run a
contrast-matching mechanic built from the skill they train. They are the two
that have had the least testing with a patient.

## Scoring

Per trial: `hit`, `miss`, `timeout`, `false_alarm`. Sessions aggregate to score
(10/hit, −3/false alarm), accuracy, mean reaction time and targets-per-minute;
`/api/progress` rolls these up by activity and by day. The in-session HUD
shows **Valid** (hits/attempts) and **Invalid** (errors).


---

## Credits

Developed by **Avtansh Sharma**, and released for the community to use freely.

The clinical protocols are drawn from published work rather than invented:
ETDRS letter-by-letter acuity scoring, the Amblyopia Treatment Study's
bracket-then-measure staircase, the two-line threshold for clinically
meaningful improvement, and the dosing schedules of approved digital amblyopia
therapies. Sources are cited inline in the modules that implement them.
