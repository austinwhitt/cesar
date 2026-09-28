(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  const STORAGE_KEY = 'cesar.prototype.v1';
  const LOG_LIMIT = 25;
  const CAMERA_TIMEOUT_MS = 8000;

  const LOCATIONS = [
    { id: 'home', name: 'Home', kind: 'Residence', icon: '🏠', risky: false, blurb: 'Couch. Sweatpants. Safe.' },
    { id: 'office', name: 'The Office', kind: 'Workplace', icon: '💼', risky: false, blurb: 'Stone-cold sober (allegedly).' },
    { id: 'bar', name: 'The Rusty Anchor', kind: 'Bar', icon: '🍺', risky: true, blurb: 'Two-for-one wells till midnight.' },
    { id: 'restaurant', name: 'Casa Margarita', kind: 'Restaurant & Bar', icon: '🍹', risky: true, blurb: 'Bottomless margs. Bottomless regret.' },
    { id: 'club', name: 'Club Neon', kind: 'Nightclub', icon: '🪩', risky: true, blurb: 'Your judgment checked its coat.' },
  ];

  const KILL_QUOTES = [
    'Absolutely not.',
    'Put the phone down and drink a water.',
    'We have talked about this. Many times.',
    "I'm screenshotting this for your own good.",
    'Go home. Eat a taco. Sleep.',
    'Denied. Future you says thanks.',
    'The Colosseum says no.',
  ];

  const APPROVE_QUOTES = [
    'Fine. But you owe me brunch.',
    "Honestly? It's kind of sweet.",
    'Let chaos reign.',
    "Send it. I'm getting popcorn.",
    'Surprisingly typo-free. Approved.',
    'Life is short. Godspeed.',
  ];

  const REGRET_TRIGGERS = [
    ['u up', 40], ['you up', 40], ['miss', 30], ['closure', 30], ['we need to talk', 30],
    ['thinking about you', 25], ['remember when', 25], ['love', 25], ['sorry', 20], ['hey', 8], ['lol', 5],
  ];

  const SCAN_STEPS = [
    'Center your face in the oval',
    'Blink twice',
    'Turn your head slightly left',
    'Now try to look sober',
  ];

  const RESULTS = {
    killed: { label: 'Killed', tone: 'down' },
    sent: { label: 'Approved', tone: 'up' },
    withdrawn: { label: 'Withdrawn', tone: 'gold' },
    restraint: { label: 'Self-control', tone: 'gold' },
    free: { label: 'Free pass', tone: 'muted' },
  };

  const TABS = [
    ['home', '🏛️', 'Home'],
    ['nogo', '🚫', 'No-Go'],
    ['panel', '⚖️', 'Panel'],
    ['log', '📜', 'Log'],
  ];

  // Lucide icons (ISC license) — https://lucide.dev
  const THUMB_UP = '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>';
  const THUMB_DOWN = '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');

  let data = load();
  let ui = freshUi();
  let scanRun = 0;
  let stream = null;
  let toastTimer = null;

  function freshUi() {
    return { screen: 'home', draft: { contactId: null, text: '' }, trial: null };
  }

  function defaultData() {
    return {
      locationId: 'bar',
      noGo: [
        { id: uid(), name: 'The Ex', reason: 'We agreed it was final. Twice.' },
        { id: uid(), name: 'Greg (Boss)', reason: 'Performance review is Monday.' },
        { id: uid(), name: 'Taylor from Hinge', reason: 'Ghosted you in March. Let it go.' },
      ],
      safe: [
        { id: uid(), name: 'Alex (Designated Driver)' },
        { id: uid(), name: 'Your Sister' },
      ],
      panel: [
        { id: uid(), name: 'Sam', relation: 'Best friend' },
        { id: uid(), name: 'Jordan', relation: 'Roommate' },
        { id: uid(), name: 'Mom', relation: 'Mom' },
      ],
      log: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...defaultData(), ...JSON.parse(raw) };
    } catch { /* storage unavailable or corrupt — start fresh */ }
    return defaultData();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* non-fatal */ }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function uid() { return Math.random().toString(36).slice(2, 10); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function currentLocation() {
    return LOCATIONS.find((l) => l.id === data.locationId) || LOCATIONS[0];
  }

  function allContacts() {
    return [
      ...data.noGo.map((c) => ({ ...c, noGo: true })),
      ...data.safe.map((c) => ({ ...c, noGo: false })),
    ];
  }

  function contactById(id) {
    return allContacts().find((c) => c.id === id) || null;
  }

  function initial(name) {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function clock(date) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function regretScore(text) {
    if (!text.trim()) return 0;
    const lower = text.toLowerCase();
    let score = 10 + Math.min(text.length, 200) / 4;
    for (const [phrase, points] of REGRET_TRIGGERS) {
      if (lower.includes(phrase)) score += points;
    }
    score += (text.match(/!/g) || []).length * 4;
    if (text.length > 8 && /[A-Z]/.test(text) && text === text.toUpperCase()) score += 25;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function draftSummary() {
    const contact = contactById(ui.draft.contactId);
    return {
      contactName: contact ? contact.name : 'Unknown',
      locationName: currentLocation().name,
      text: ui.draft.text.trim(),
    };
  }

  function clearDraft() {
    ui.draft = { contactId: null, text: '' };
  }

  function logEntry(entry) {
    data.log.unshift({ id: uid(), at: Date.now(), ...entry });
    data.log = data.log.slice(0, LOG_LIMIT);
    save();
  }

  function toast(message) {
    $toast.textContent = message;
    $toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('is-visible'), 2600);
  }

  // ---------------------------------------------------------------------------
  // Shared UI pieces
  // ---------------------------------------------------------------------------

  function thumb(dir, size = 24) {
    const color = dir === 'up' ? 'var(--up)' : 'var(--down)';
    return `<svg class="thumb" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${dir === 'up' ? THUMB_UP : THUMB_DOWN}</svg>`;
  }

  function logo(height = 32) {
    return `<svg class="logo" width="${Math.round(height * 1.75)}" height="${height}" viewBox="0 0 56 32" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <g transform="translate(2 1)" color="#3dd68c" stroke="currentColor">${THUMB_UP}</g>
      <g transform="translate(30 7)" color="#ff5a5f" stroke="currentColor">${THUMB_DOWN}</g>
    </svg>`;
  }

  function tabbar(active) {
    return `<nav class="tabbar">${TABS.map(([id, icon, label]) => `
      <button class="tab ${id === active ? 'is-active' : ''}" data-action="go" data-screen="${id}">
        <span class="tab-icon">${icon}</span><span>${label}</span>
      </button>`).join('')}
    </nav>`;
  }

  function topbar(title, back) {
    return `<div class="topbar">
      <button class="icon-btn" data-action="go" data-screen="${back}" aria-label="Back">←</button>
      <h2>${esc(title)}</h2>
    </div>`;
  }

  function regretMeter(score) {
    const [label, tone] =
      score < 25 ? ['Harmless', 'up'] :
      score < 50 ? ['Questionable', 'gold'] :
      score < 75 ? ['Risky', 'orange'] :
      ['Catastrophic', 'down'];
    return `<div class="regret" id="regret">
      <div class="regret-head">
        <span class="label">Regret meter</span>
        <span class="regret-label c-${tone}">${score ? `${score}% · ${label}` : '—'}</span>
      </div>
      <div class="regret-track"><div class="regret-fill bg-${tone}" style="width:${score}%"></div></div>
    </div>`;
  }

  function evidenceCard(t) {
    return `<div class="card evidence">
      <div class="evidence-photo">
        ${t.selfie ? `<img src="${t.selfie}" alt="Verified selfie">` : '<span>🥴</span>'}
        <span class="verified-badge">✓ Verified</span>
      </div>
      <div class="evidence-body">
        <span class="eyebrow">To ${esc(t.contactName)} · ${esc(t.locationName)} · ${esc(t.time)}</span>
        <div class="bubble">${esc(t.text)}</div>
      </div>
    </div>`;
  }

  function judgeCard(v, i, fresh) {
    let status;
    if (v.vote === 'kill' || v.vote === 'approve') {
      status = `<div class="vote ${fresh ? 'vote-cast' : ''}">${thumb(v.vote === 'kill' ? 'down' : 'up', 26)}<p>“${esc(v.quote)}”</p></div>`;
    } else if (v.vote === 'recused') {
      status = '<div class="vote vote-recused">Vote no longer needed.</div>';
    } else {
      status = `<div class="vote vote-pending">
        <span class="dots">Deliberating<i>.</i><i>.</i><i>.</i></span>
        <span class="mini-vote">
          <button data-action="vote" data-index="${i}" data-vote="approve" aria-label="Vote thumbs up as ${esc(v.name)}">${thumb('up', 18)}</button>
          <button data-action="vote" data-index="${i}" data-vote="kill" aria-label="Vote thumbs down as ${esc(v.name)}">${thumb('down', 18)}</button>
        </span>
      </div>`;
    }
    return `<div class="judge ${v.vote ? `judge--${v.vote}` : ''}">
      <div class="avatar">${esc(initial(v.name))}</div>
      <div class="judge-body">
        <strong>${esc(v.name)}</strong>
        <span class="muted">${esc(v.relation)}</span>
        ${status}
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  function viewHome() {
    const loc = currentLocation();
    const killed = data.log.filter((e) => e.result === 'killed').length;
    const hint = !data.log.length && loc.risky
      ? '<p class="hint">Demo tip: you\'re "at a bar" right now. Try texting The Ex.</p>'
      : '';
    return `<main class="screen">
      <header class="brand">
        ${logo(34)}
        <div><h1 class="wordmark">Cesar</h1><p class="tagline">Thumbs up or thumbs down.</p></div>
      </header>

      <button class="card location-card ${loc.risky ? 'is-risky' : ''}" data-action="go" data-screen="location">
        <span class="loc-icon">${loc.icon}</span>
        <span class="loc-body">
          <span class="eyebrow">📍 You're at · simulated GPS</span>
          <strong>${esc(loc.name)}</strong>
          <span class="muted">${esc(loc.kind)} · ${esc(loc.blurb)}</span>
        </span>
        <span class="loc-change">Change</span>
      </button>

      <div class="status ${loc.risky ? 'armed' : ''}">
        <span class="status-dot"></span>
        <span>${loc.risky
          ? '<strong>Cesar is armed.</strong> Texts to your No-Go list go to the panel.'
          : '<strong>Cesar is standing by.</strong> No drinking spot detected.'}</span>
      </div>

      ${hint}

      <button class="btn btn-primary btn-lg" data-action="go" data-screen="compose">✍️ Text someone</button>

      <div class="stats">
        <button class="stat" data-action="go" data-screen="nogo"><strong>${data.noGo.length}</strong><span>On No-Go list</span></button>
        <button class="stat" data-action="go" data-screen="panel"><strong>${data.panel.length}/3</strong><span>Panel judges</span></button>
        <button class="stat" data-action="go" data-screen="log"><strong>${killed}</strong><span>Texts killed</span></button>
      </div>
    </main>
    ${tabbar('home')}`;
  }

  function viewLocation() {
    return `<main class="screen">
      ${topbar('Where are you?', 'home')}
      <p class="muted">Simulated GPS. The real app will spot bars and restaurants on its own.</p>
      <div class="list">${LOCATIONS.map((l) => `
        <button class="card loc-option ${l.id === data.locationId ? 'is-selected' : ''}" data-action="set-location" data-id="${l.id}">
          <span class="loc-icon">${l.icon}</span>
          <span class="loc-body"><strong>${esc(l.name)}</strong><span class="muted">${esc(l.kind)}</span></span>
          ${l.risky ? '<span class="badge badge-down">Drinking zone</span>' : '<span class="badge badge-muted">Safe</span>'}
        </button>`).join('')}
      </div>
    </main>`;
  }

  function viewCompose() {
    const { contactId, text } = ui.draft;
    return `<main class="screen">
      ${topbar('New message', 'home')}
      <p class="label">To</p>
      <div class="chips">${allContacts().map((c) => `
        <button class="chip ${c.id === contactId ? 'is-selected' : ''} ${c.noGo ? 'is-nogo' : ''}" data-action="pick-contact" data-id="${c.id}">
          ${c.noGo ? '🚫 ' : ''}${esc(c.name)}
        </button>`).join('')}
      </div>
      <label class="label" for="draft-text">Message</label>
      <textarea id="draft-text" class="input textarea" rows="5" maxlength="500" placeholder="hey… u up?">${esc(text)}</textarea>
      ${regretMeter(regretScore(text))}
      <button class="btn btn-primary btn-lg" data-action="send">Send</button>
      <p class="fine">🚫 means they're on your No-Go list. Nothing actually sends in this prototype.</p>
    </main>`;
  }

  function viewIntercept() {
    const contact = contactById(ui.draft.contactId);
    const loc = currentLocation();
    return `<main class="screen center-screen">
      <div class="big-emoji">✋</div>
      <h2 class="display">Hold up.</h2>
      <p class="lead">You're at <strong>${esc(loc.name)}</strong> and trying to text <strong>${esc(contact.name)}</strong>.</p>
      <div class="card reason">
        <span class="eyebrow">Why they're on your No-Go list</span>
        <p>“${esc(contact.reason || 'Sober you said so.')}”</p>
      </div>
      <p class="muted">To send it, prove it's really you. Then your panel decides.</p>
      <button class="btn btn-primary btn-lg" data-action="go" data-screen="scan">Verify &amp; summon the panel</button>
      <button class="btn btn-ghost" data-action="restraint">Never mind. I'll put the phone down.</button>
    </main>`;
  }

  function viewScan() {
    return `<main class="screen center-screen">
      <h2 class="display">Verify it's you</h2>
      <p class="muted">Like the dating apps. Except the stakes are higher.</p>
      <div class="scan-frame">
        <video autoplay playsinline muted></video>
        <div class="scan-fallback">🥴</div>
        <div class="scan-ring"></div>
        <div class="scan-line"></div>
      </div>
      <p id="scan-step" class="scan-step">Starting camera…</p>
      <ol class="scan-checks">
        <li>Face found</li><li>Blink</li><li>Head turn</li><li>Sobriety (lol)</li>
      </ol>
      <button class="btn btn-ghost" data-action="cancel-scan">Cancel</button>
    </main>`;
  }

  function viewTrial() {
    const t = ui.trial;
    return `<main class="screen">
      <div class="trial-head">
        <span class="eyebrow">Case #${t.caseNo}</span>
        <h2 class="display">The panel is in session</h2>
        <p class="muted">Majority rules. Two thumbs decide.</p>
      </div>
      ${evidenceCard(t)}
      <div class="judges">${t.votes.map((v, i) => judgeCard(v, i, i === t.lastVoted)).join('')}</div>
      ${t.decided
        ? '<p class="deciding">Verdict reached…</p>'
        : '<p class="fine">Tap a thumb to vote as a judge, or wait for them.</p><button class="btn btn-ghost" data-action="withdraw">Withdraw the text</button>'}
    </main>`;
  }

  function viewVerdict() {
    const t = ui.trial;
    const killed = t.result === 'killed';
    const kills = t.votes.filter((v) => v.vote === 'kill').length;
    const ups = t.votes.filter((v) => v.vote === 'approve').length;
    const score = killed ? `${kills}–${ups}` : `${ups}–${kills}`;
    return `<main class="screen center-screen verdict verdict-${t.result}">
      <div class="verdict-thumb">${thumb(killed ? 'down' : 'up', 110)}</div>
      <span class="eyebrow">The panel has spoken · ${score}</span>
      <h2 class="display">${killed ? 'The text dies.' : 'Sent. Godspeed.'}</h2>
      <p class="lead">${killed
        ? `${esc(t.contactName)} will never know. Your dignity survives another night.`
        : `Your message to ${esc(t.contactName)} is on its way. The panel has been notified of your choices.`}</p>
      <ul class="quotes">${t.votes.filter((v) => v.quote).map((v) => `
        <li>${thumb(v.vote === 'kill' ? 'down' : 'up', 16)}<span><strong>${esc(v.name)}:</strong> “${esc(v.quote)}”</span></li>`).join('')}
      </ul>
      <button class="btn btn-primary btn-lg" data-action="finish">${killed ? 'Accept my fate' : 'Back home'}</button>
      ${killed ? '<button class="btn btn-ghost" disabled>Appeal to the Senate (coming in v2)</button>' : ''}
    </main>`;
  }

  function viewNoGo() {
    const items = data.noGo.map((c) => `
      <li class="card list-item">
        <span class="nogo-icon">🚫</span>
        <span class="list-body">
          <strong>${esc(c.name)}</strong>
          <span class="muted">${esc(c.reason || 'No reason given. Sober you knew.')}</span>
        </span>
        <button class="icon-btn" data-action="remove-nogo" data-id="${c.id}" aria-label="Remove ${esc(c.name)}">✕</button>
      </li>`).join('');
    return `<main class="screen">
      <h2 class="display page-title">No-Go Zone</h2>
      <p class="muted">People you shouldn't text after two drinks. Sober you picked them. Trust sober you.</p>
      <form class="card form" data-form="add-nogo">
        <input class="input" name="name" placeholder="Name (e.g. The Ex)" required maxlength="40" autocomplete="off">
        <input class="input" name="reason" placeholder="Why? Future you will need a reminder." maxlength="80" autocomplete="off">
        <button class="btn btn-primary" type="submit">Add to No-Go list</button>
      </form>
      <ul class="list">${items || '<li class="empty">Nobody on the list. Bold.</li>'}</ul>
    </main>
    ${tabbar('nogo')}`;
  }

  function viewPanel() {
    return `<main class="screen">
      <h2 class="display page-title">Your Panel</h2>
      <p class="muted">Three judges. They see your face and your text, then they vote. Pick people who love you enough to say no.</p>
      <div class="list">${data.panel.map((j, i) => `
        <div class="card judge-edit">
          <div class="avatar">${esc(initial(j.name))}</div>
          <div class="judge-fields">
            <input class="input" data-panel="${i}" data-field="name" value="${esc(j.name)}" placeholder="Judge ${i + 1}" maxlength="30" autocomplete="off" aria-label="Judge ${i + 1} name">
            <input class="input input-sm" data-panel="${i}" data-field="relation" value="${esc(j.relation)}" placeholder="How you know them" maxlength="30" autocomplete="off" aria-label="Judge ${i + 1} relation">
          </div>
        </div>`).join('')}
      </div>
      <div class="card note">
        <strong>How judges vote</strong>
        <p class="muted">In the real app, your panel gets a text with a link and votes from their browser. No app install needed. Majority rules. If nobody answers in 15 minutes, the text dies.</p>
      </div>
    </main>
    ${tabbar('panel')}`;
  }

  function viewLog() {
    const count = (...results) => data.log.filter((e) => results.includes(e.result)).length;
    const items = data.log.map((e) => {
      const meta = RESULTS[e.result] || RESULTS.free;
      const when = new Date(e.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      const votes = e.votes
        ? `<div class="log-votes">${e.votes.map((v) => (v.vote === 'kill' || v.vote === 'approve')
          ? `<span title="${esc(v.name)}">${thumb(v.vote === 'kill' ? 'down' : 'up', 16)}</span>` : '').join('')}</div>`
        : '';
      return `<li class="card log-item">
        <div class="log-top"><span class="badge badge-${meta.tone}">${meta.label}</span><span class="muted">${esc(when)}</span></div>
        <p class="log-to">To <strong>${esc(e.contactName)}</strong> · ${esc(e.locationName)}</p>
        <div class="bubble bubble-sm">${esc(e.text)}</div>
        ${votes}
      </li>`;
    }).join('');
    return `<main class="screen">
      <h2 class="display page-title">Shame Log</h2>
      <p class="muted">Every trial, every verdict. For the record.</p>
      <div class="stats">
        <div class="stat"><strong class="c-down">${count('killed')}</strong><span>Killed</span></div>
        <div class="stat"><strong class="c-up">${count('sent')}</strong><span>Approved</span></div>
        <div class="stat"><strong class="c-gold">${count('restraint', 'withdrawn')}</strong><span>Self-control</span></div>
      </div>
      <ul class="list">${items || '<li class="empty">No trials yet. The night is young.</li>'}</ul>
      <button class="btn btn-ghost btn-sm" data-action="reset">Reset demo data</button>
    </main>
    ${tabbar('log')}`;
  }

  const VIEWS = {
    home: { html: viewHome },
    location: { html: viewLocation },
    compose: { html: viewCompose },
    intercept: { html: viewIntercept },
    scan: { html: viewScan, mount: runScan },
    trial: { html: viewTrial },
    verdict: { html: viewVerdict },
    nogo: { html: viewNoGo },
    panel: { html: viewPanel },
    log: { html: viewLog },
  };

  function render() {
    const view = VIEWS[ui.screen] || VIEWS.home;
    $app.innerHTML = view.html();
    if (view.mount) view.mount();
  }

  function show(screen) {
    ui.screen = screen;
    render();
  }

  // ---------------------------------------------------------------------------
  // Flow: send → intercept → face scan → trial → verdict
  // ---------------------------------------------------------------------------

  function sendDraft() {
    const contact = contactById(ui.draft.contactId);
    if (!contact) return toast('Pick who you are texting.');
    if (!ui.draft.text.trim()) return toast("Type something first. Or don't. Honestly, better.");

    const loc = currentLocation();
    if (contact.noGo && loc.risky) return show('intercept');

    logEntry({ result: 'free', ...draftSummary() });
    toast(contact.noGo
      ? "Sent. You're not out drinking, so Cesar let it slide."
      : `Sent to ${contact.name} ✓`);
    clearDraft();
    show('home');
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function captureFrame(video) {
    if (!stream || !video.videoWidth) return null;
    const w = 240;
    const h = 300;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    ctx.translate(w, 0);
    ctx.scale(-1, 1); // mirror, to match the preview
    ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  async function runScan() {
    const run = ++scanRun;
    const alive = () => run === scanRun && ui.screen === 'scan';
    const frame = $app.querySelector('.scan-frame');
    const video = frame.querySelector('video');
    const stepEl = $app.querySelector('#scan-step');
    const checks = [...$app.querySelectorAll('.scan-checks li')];

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
      // Don't hang forever if the permission prompt is ignored: fall back to the
      // stunt double, and release the camera if access is granted too late.
      let timedOut = false;
      const request = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
      request.then((s) => { if (timedOut) s.getTracks().forEach((track) => track.stop()); }, () => {});
      const hint = setTimeout(() => { if (alive()) stepEl.textContent = 'Allow camera access, or wait for your stunt double…'; }, 2500);
      const s = await Promise.race([
        request,
        wait(CAMERA_TIMEOUT_MS).then(() => { timedOut = true; throw new Error('Camera permission timed out'); }),
      ]).finally(() => clearTimeout(hint));
      if (!alive()) { s.getTracks().forEach((track) => track.stop()); return; }
      stream = s;
      video.srcObject = stream;
      await video.play();
    } catch {
      if (!alive()) return;
      frame.classList.add('no-camera');
      stepEl.textContent = 'No camera, so your stunt double will stand in.';
      await wait(1400);
    }

    for (let i = 0; i < SCAN_STEPS.length; i++) {
      if (!alive()) return stopCamera();
      checks[i].classList.add('is-active');
      stepEl.textContent = SCAN_STEPS[i];
      await wait(1300);
      checks[i].classList.replace('is-active', 'is-done');
    }
    if (!alive()) return stopCamera();

    const selfie = captureFrame(video);
    stopCamera();
    if (selfie) frame.insertAdjacentHTML('beforeend', `<img class="scan-still" src="${selfie}" alt="">`);
    frame.classList.add('verified');
    stepEl.textContent = 'Identity verified. Unfortunately, it is you.';

    await wait(1100);
    if (alive()) startTrial(selfie);
  }

  function startTrial(selfie) {
    const killChance = 0.45 + regretScore(ui.draft.text) / 200;
    const trial = {
      ...draftSummary(),
      selfie,
      caseNo: 1000 + Math.floor(Math.random() * 9000),
      time: clock(new Date()),
      votes: data.panel.map((j, i) => ({ name: j.name || `Judge ${i + 1}`, relation: j.relation, vote: null, quote: null })),
      timers: [],
      lastVoted: null,
      decided: false,
      result: null,
    };
    ui.trial = trial;
    show('trial');

    trial.votes.forEach((_, i) => {
      const delay = 2200 + i * 1500 + Math.random() * 1500;
      trial.timers.push(setTimeout(() => castVote(i, Math.random() < killChance ? 'kill' : 'approve'), delay));
    });
  }

  function castVote(index, vote) {
    const trial = ui.trial;
    if (!trial || trial.decided) return;
    const judge = trial.votes[index];
    if (!judge || judge.vote) return;

    judge.vote = vote;
    trial.lastVoted = index;
    judge.quote = pick(vote === 'kill' ? KILL_QUOTES : APPROVE_QUOTES);

    const kills = trial.votes.filter((v) => v.vote === 'kill').length;
    const ups = trial.votes.filter((v) => v.vote === 'approve').length;
    if (kills >= 2 || ups >= 2) {
      trial.decided = true;
      trial.result = kills >= 2 ? 'killed' : 'sent';
      trial.timers.forEach(clearTimeout);
      trial.votes.forEach((v) => { if (!v.vote) v.vote = 'recused'; });
      logEntry({
        result: trial.result,
        contactName: trial.contactName,
        locationName: trial.locationName,
        text: trial.text,
        votes: trial.votes.map((v) => ({ name: v.name, vote: v.vote })),
      });
      setTimeout(() => { if (ui.trial === trial) show('verdict'); }, 1500);
    }
    if (ui.screen === 'trial') render();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  const ACTIONS = {
    go: (d) => show(d.screen),
    'pick-contact': (d) => { ui.draft.contactId = d.id; render(); },
    send: sendDraft,
    'cancel-scan': () => { scanRun++; stopCamera(); show('intercept'); },
    restraint: () => {
      logEntry({ result: 'restraint', ...draftSummary() });
      clearDraft();
      toast('Phone down. Proud of you. 🏅');
      show('home');
    },
    vote: (d) => castVote(Number(d.index), d.vote),
    withdraw: () => {
      const trial = ui.trial;
      trial.decided = true;
      trial.timers.forEach(clearTimeout);
      logEntry({ result: 'withdrawn', contactName: trial.contactName, locationName: trial.locationName, text: trial.text });
      ui.trial = null;
      clearDraft();
      toast('Text withdrawn. Wise.');
      show('home');
    },
    finish: () => { ui.trial = null; clearDraft(); show('home'); },
    'set-location': (d) => {
      data.locationId = d.id;
      save();
      const loc = currentLocation();
      toast(loc.risky ? `📍 ${loc.name}. Cesar is armed.` : `📍 ${loc.name}. Cesar is standing by.`);
      show('home');
    },
    'remove-nogo': (d) => {
      data.noGo = data.noGo.filter((c) => c.id !== d.id);
      if (ui.draft.contactId === d.id) ui.draft.contactId = null;
      save();
      render();
    },
    reset: (d, el) => {
      if (!el.dataset.armed) {
        el.dataset.armed = '1';
        el.textContent = 'Tap again to wipe everything';
        return;
      }
      data = defaultData();
      save();
      ui = freshUi();
      toast('Demo reset. Fresh start.');
      render();
    },
  };

  $app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = ACTIONS[el.dataset.action];
    if (action) action(el.dataset, el);
  });

  $app.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.dataset.form !== 'add-nogo') return;
    const form = new FormData(e.target);
    const name = String(form.get('name') || '').trim();
    if (!name) return;
    data.noGo.unshift({ id: uid(), name, reason: String(form.get('reason') || '').trim() });
    save();
    render();
    toast(`${name} is now off-limits.`);
  });

  $app.addEventListener('input', (e) => {
    if (e.target.id !== 'draft-text') return;
    ui.draft.text = e.target.value;
    const meter = $app.querySelector('#regret');
    if (meter) meter.outerHTML = regretMeter(regretScore(ui.draft.text));
  });

  $app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.panel === undefined) return;
    const judge = data.panel[Number(el.dataset.panel)];
    judge[el.dataset.field] = el.value.trim();
    save();
    el.closest('.judge-edit').querySelector('.avatar').textContent = initial(judge.name);
  });

  render();
})();
