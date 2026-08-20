"""The front page: what this does for vision, and the way in.

Anyone arriving here is either a parent deciding whether this is worth an hour
a day of their child's time, or someone who already has an account. The page
answers the first question before asking anything of the second, because a bare
password box tells a newcomer nothing about what they would be signing up to.

Server-rendered rather than part of the React bundle: it has to work before
anyone is authenticated, and the bundle sits behind the gate.
"""

from __future__ import annotations

PALETTE = """
  :root {
    color-scheme: dark;
    --navy-900: #050826;
    --navy-800: #0a1046;
    --navy-700: #101a5c;
    --purple: #6c4fe0;
    --purple-dim: #4c37a5;
    --orange: #ef5b2b;
    --text: #ffffff;
    --text-dim: #b9c0e8;
    --line: rgba(120, 140, 220, 0.28);
  }
"""

STYLE = (
    PALETTE
    + """
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--navy-900);
    color: var(--text);
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    line-height: 1.5;
  }
  .wrap {
    max-width: 1120px;
    margin: 0 auto;
    padding: 48px 28px 72px;
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 56px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .wrap { grid-template-columns: 1fr; gap: 40px; padding: 32px 20px 56px; }
  }

  .name { font-size: 40px; font-weight: 700; letter-spacing: 1px; }
  .name em { font-style: normal; color: var(--purple); }
  .tagline {
    font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--text-dim); margin-bottom: 34px;
  }

  h2 {
    font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--text-dim); margin: 36px 0 14px; font-weight: 700;
  }
  .lead { font-size: 19px; line-height: 1.55; max-width: 60ch; }
  p { max-width: 66ch; }

  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
  .card {
    padding: 16px 16px 18px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.03);
  }
  .card h3 { margin: 0 0 6px; font-size: 15px; }
  .card p { margin: 0; font-size: 13px; color: var(--text-dim); }

  ol.how { padding-left: 20px; max-width: 62ch; }
  ol.how li { margin-bottom: 10px; }

  .note {
    margin-top: 34px; padding: 14px 16px;
    border-left: 3px solid var(--orange);
    background: rgba(255, 255, 255, 0.03);
    font-size: 13px; color: var(--text-dim);
  }

  /* --- the panel ------------------------------------------------------- */
  .panel {
    position: sticky; top: 32px;
    padding: 22px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--navy-800);
  }
  @media (max-width: 900px) { .panel { position: static; } }

  .tabs { display: flex; gap: 6px; margin-bottom: 18px; }
  .tabs button {
    flex: 1; padding: 9px; font: inherit; font-size: 12px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--text); background: none; cursor: pointer;
    border: 1px solid var(--line); border-radius: 9px; opacity: 0.55;
  }
  .tabs button[aria-selected="true"] { opacity: 1; background: rgba(255, 255, 255, 0.08); }

  label {
    display: block; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--text-dim); margin: 14px 0 7px;
  }
  input {
    width: 100%; padding: 12px 13px; font-size: 15px; color: var(--text);
    background: var(--navy-900); border: 1px solid var(--line);
    border-radius: 10px; outline: none;
  }
  input:focus { border-color: var(--purple); }
  button.go {
    width: 100%; margin-top: 18px; padding: 13px; font: inherit;
    font-size: 14px; font-weight: 700; letter-spacing: 0.06em;
    color: var(--text); background: var(--purple);
    border: 0; border-radius: 10px; cursor: pointer;
  }
  button.go:hover { background: var(--purple-dim); }
  button.go:disabled { opacity: 0.5; cursor: default; }
  .msg { margin-top: 12px; font-size: 13px; min-height: 18px; color: var(--orange); }
  .msg.ok { color: var(--text-dim); }
  .hint { margin-top: 14px; font-size: 11px; color: var(--text-dim); opacity: 0.7; }
  select {
    width: 100%; padding: 11px 12px; font-size: 13px; color: var(--text);
    background: var(--navy-900); border: 1px solid var(--line);
    border-radius: 10px; outline: none;
  }
  select:focus { border-color: var(--purple); }
  .q { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
  .q label { margin-top: 0; }
  .q input { margin-top: 7px; }
  .linkish {
    display: block; width: 100%; margin-top: 14px; padding: 0;
    background: none; border: 0; color: var(--text-dim);
    font: inherit; font-size: 12px; text-decoration: underline;
    cursor: pointer; text-align: center;
  }
  .linkish:hover { color: var(--text); }
  [hidden] { display: none !important; }
  footer {
    border-top: 1px solid var(--line);
    padding: 22px 28px 40px; text-align: center;
    font-size: 11px; color: var(--text-dim); opacity: 0.65;
  }
"""
)

EXPLAINER = """
  <div class="name"><em>Open</em>Sight</div>
  <div class="tagline">Vision therapy for home use</div>

  <p class="lead">
    Some eyes see perfectly well on their own but do not work together. The
    brain quietly favours one and turns the other down. Glasses correct focus;
    they do not correct that. What changes it is practice - the weaker eye
    given work it cannot avoid, a little every day.
  </p>

  <h2>What it trains</h2>
  <div class="cards">
    <div class="card">
      <h3>Acuity</h3>
      <p>Detail resolution, measured on a Snellen chart and pushed a line at a
      time as it improves.</p>
    </div>
    <div class="card">
      <h3>Smooth pursuit</h3>
      <p>Following something that moves without losing it - a balloon drifting,
      an object falling.</p>
    </div>
    <div class="card">
      <h3>Saccades</h3>
      <p>Jumping accurately from one target to the next, which is what reading
      along a line actually requires.</p>
    </div>
    <div class="card">
      <h3>Crowding</h3>
      <p>Picking one shape out of a cluster. Crowded letters are much harder
      than isolated ones for an amblyopic eye.</p>
    </div>
    <div class="card">
      <h3>Binocular fusion</h3>
      <p>Both eyes open behind red/blue glasses, with the target drawn so only
      the treated eye can see it and the background so both can. The weaker eye
      has to do the work while fusion holds.</p>
    </div>
    <div class="card">
      <h3>Contrast</h3>
      <p>Telling faint shapes apart, which often lags behind acuity and is
      missed by a letter chart alone.</p>
    </div>
  </div>

  <h2>How a programme runs</h2>
  <ol class="how">
    <li><strong>Measure first.</strong> A tumbling-E acuity test on each eye,
    scored letter by letter, single and crowded. Without a baseline there is
    nothing to judge improvement against.</li>
    <li><strong>Calibrate the screen.</strong> You size a shape against a real
    ruler. Optotypes are specified as a physical angle at a viewing distance,
    so a letter drawn without knowing your display's pixel pitch is the wrong
    size and the measurement means nothing.</li>
    <li><strong>Calibrate the glasses.</strong> One colour at a time, one eye
    at a time, until each channel is genuinely invisible to the other eye.</li>
    <li><strong>Then the activities</strong> - twenty of them, difficulty set
    from your own measurement rather than a guess.</li>
    <li><strong>Re-test.</strong> Two lines of logMAR is the accepted threshold
    for a real change; anything smaller is within test-retest noise.</li>
  </ol>

  <h2>Why an account</h2>
  <p>
    Calibration describes a person at a screen - that display's pixel pitch,
    those glasses, how much each colour leaks for those eyes. Shared, one
    person recalibrating would silently change everyone else's letter sizes and
    make their recorded acuity meaningless. Your account keeps your own
    calibration, your own colours and your own results.
  </p>

  <div class="note">
    <strong>Not a medical device.</strong> It measures and trains; it does not
    diagnose. It is not a substitute for an eye examination, and anything it
    flags should be taken to a clinician. Amblyopia treatment in particular has
    an age window - if you have not seen an optometrist or ophthalmologist
    about this, do that first.
  </div>
"""


SCRIPT = """
  const $ = (s) => document.querySelector(s);
  const PANES = ['signin', 'signup', 'recover'];

  function show(which) {
    for (const p of PANES) $('#pane-' + p).hidden = p !== which;
    $('#tab-signin').setAttribute('aria-selected', String(which === 'signin'));
    $('#tab-signup').setAttribute('aria-selected', String(which === 'signup'));
  }
  $('#tab-signin').onclick = () => show('signin');
  $('#tab-signup').onclick = () => show('signup');
  $('#forgot').onclick = (e) => { e.preventDefault(); show('recover'); };
  $('#recover-back').onclick = (e) => { e.preventDefault(); show('signin'); };

  async function post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await r.json(); } catch (_) { /* an HTML error page */ }
    return { ok: r.ok, data };
  }

  // Populate the three pickers, and keep them from colliding: a question
  // already chosen above is removed from the ones below, because three
  // copies of the same question is one answer wearing a disguise.
  let BANK = [];
  const pickers = () => [0, 1, 2].map((i) => $('#question_' + i));

  function refreshOptions() {
    const chosen = pickers().map((p) => p.value);
    pickers().forEach((sel, i) => {
      const mine = sel.value;
      sel.innerHTML = '';
      for (const q of BANK) {
        if (chosen.includes(q.id) && q.id !== mine) continue;
        const opt = document.createElement('option');
        opt.value = q.id;
        opt.textContent = q.text;
        if (q.id === mine) opt.selected = true;
        sel.appendChild(opt);
      }
    });
  }

  fetch('/api/questions').then((r) => r.json()).then((d) => {
    BANK = d.questions;
    pickers().forEach((sel, i) => {
      sel.innerHTML = '';
      BANK.forEach((q, n) => {
        const opt = document.createElement('option');
        opt.value = q.id;
        opt.textContent = q.text;
        if (n === i) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.onchange = refreshOptions;
    });
    refreshOptions();
  });

  $('#pane-signup').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#signup-go'), msg = $('#msg-signup');
    btn.disabled = true; msg.textContent = '';
    const body = {
      email: $('#signup-email').value.trim(),
      name: $('#signup-name').value.trim(),
      username: $('#signup-username').value.trim(),
      password: $('#signup-password').value,
    };
    [0, 1, 2].forEach((i) => {
      body['question_' + i] = $('#question_' + i).value;
      body['answer_' + i] = $('#answer_' + i).value;
    });
    const { ok, data } = await post('/api/signup', body);
    if (!ok) { btn.disabled = false; msg.textContent = data.detail || 'That did not work.'; return; }
    window.location = '/';
  };

  // --- recovery ---------------------------------------------------------
  $('#recover-lookup').onclick = async () => {
    const btn = $('#recover-lookup'), msg = $('#msg-recover');
    btn.disabled = true; msg.textContent = '';
    const { ok, data } = await post('/api/recover', {
      identifier: $('#recover-id').value.trim(),
    });
    btn.disabled = false;
    if (!ok) { msg.textContent = data.detail || 'That did not work.'; return; }
    const box = $('#recover-questions');
    box.innerHTML = '';
    data.questions.forEach((q) => {
      const wrap = document.createElement('div');
      wrap.className = 'q';
      const label = document.createElement('label');
      label.textContent = q.text;
      label.htmlFor = 'recover_answer_' + q.idx;
      const input = document.createElement('input');
      input.id = 'recover_answer_' + q.idx;
      input.dataset.idx = q.idx;
      wrap.appendChild(label);
      wrap.appendChild(input);
      box.appendChild(wrap);
    });
    $('#recover-step2').hidden = false;
    $('#recover-lookup').hidden = true;
    $('#recover-id').readOnly = true;
  };

  $('#pane-recover').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#recover-go'), msg = $('#msg-recover');
    btn.disabled = true; msg.textContent = '';
    const body = {
      identifier: $('#recover-id').value.trim(),
      password: $('#recover-password').value,
    };
    document.querySelectorAll('#recover-questions input').forEach((i) => {
      body['answer_' + i.dataset.idx] = i.value;
    });
    const { ok, data } = await post('/api/recover/reset', body);
    if (!ok) { btn.disabled = false; msg.textContent = data.detail || 'That did not work.'; return; }
    window.location = '/';
  };
"""


def page(message: str = "") -> str:
    banner = f'<div class="msg">{message}</div>' if message else '<div class="msg"></div>'
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenSight - vision therapy for home use</title>
<style>{STYLE}</style>
</head>
<body>
<div class="wrap">
  <main>{EXPLAINER}</main>

  <aside class="panel">
    <div class="tabs" role="tablist">
      <button id="tab-signin" role="tab" aria-selected="true">Sign in</button>
      <button id="tab-signup" role="tab" aria-selected="false">Create account</button>
    </div>

    <form id="pane-signin" method="post" action="/api/login">
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password">
      <button class="go" type="submit">Sign in</button>
      {banner}
      <button class="linkish" id="forgot" type="button">Forgotten your password?</button>
    </form>

    <form id="pane-signup" hidden>
      <label for="signup-email">Your email</label>
      <input id="signup-email" type="email" autocomplete="email" required>
      <label for="signup-name">Your name</label>
      <input id="signup-name" autocomplete="name" required>
      <label for="signup-username">Choose a username</label>
      <input id="signup-username" autocomplete="username" required>
      <label for="signup-password">Choose a password</label>
      <input id="signup-password" type="password" autocomplete="new-password" required>

      <p class="hint">
        Three security questions. Your email is not verified, so these are the
        only way back in if you forget your password. Pick answers you will
        still give the same way in a year.
      </p>

      <div class="q">
        <label for="question_0">Question 1</label>
        <select id="question_0"></select>
        <input id="answer_0" autocomplete="off" required>
      </div>
      <div class="q">
        <label for="question_1">Question 2</label>
        <select id="question_1"></select>
        <input id="answer_1" autocomplete="off" required>
      </div>
      <div class="q">
        <label for="question_2">Question 3</label>
        <select id="question_2"></select>
        <input id="answer_2" autocomplete="off" required>
      </div>

      <button class="go" id="signup-go" type="submit">Create account</button>
      <div class="msg" id="msg-signup"></div>
      <p class="hint">
        Capitals and extra spaces do not matter when you answer. There is no
        way to recover an account without these.
      </p>
    </form>

    <form id="pane-recover" hidden>
      <label for="recover-id">Username or email</label>
      <input id="recover-id" autocomplete="username" required>
      <button class="go" id="recover-lookup" type="button">Continue</button>

      <div id="recover-step2" hidden>
        <div id="recover-questions"></div>
        <div class="q">
          <label for="recover-password">Choose a new password</label>
          <input id="recover-password" type="password" autocomplete="new-password" required>
        </div>
        <button class="go" id="recover-go" type="submit">Reset password</button>
      </div>

      <div class="msg" id="msg-recover"></div>
      <button class="linkish" id="recover-back" type="button">Back to sign in</button>
      <p class="hint">
        All three answers must match. Resetting signs out anything already
        signed in to the account.
      </p>
    </form>

  </aside>
</div>

<footer>
  Developed by Avtansh Sharma - built for the community, free to use.
  Not a medical device.
</footer>

<script>{SCRIPT}</script>
</body>
</html>
"""
