(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  const STORAGE_KEY = 'cesar.prototype.v1';
  const LOG_LIMIT = 25;
  const CAMERA_TIMEOUT_MS = 8000;

  // Face tracking: MediaPipe Face Landmarker, loaded on demand and run on-device.
  const MEDIAPIPE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
  const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const TRACKER_TIMEOUT_MS = 20000; // give up and run the scripted check
  const SKIP_AFTER_MS = 12000;      // offer "skip" to anyone stuck
  const MIN_FACE_WIDTH = 0.18;      // cheek-to-cheek, as a fraction of the frame
  const CENTER_HOLD_MS = 700;
  const BLINK_MIN = 0.45;           // eyeBlink blendshape score that can count as closed
  const BLINK_RISE = 0.2;           // ...and how far above this person's resting level
  const TURN_THRESHOLD = 0.16;      // nose offset from the cheek midpoint, as a fraction of face width
  const STILL_MS = 1500;
  const STILL_TOLERANCE = 0.035;    // how far the nose may drift while holding still

  const LOCATIONS = [
    { id: 'home', name: 'Home', kind: 'Residence', icon: 'home', risky: false, blurb: 'Couch. Sweatpants. Safe.' },
    { id: 'office', name: 'The Office', kind: 'Workplace', icon: 'briefcase', risky: false, blurb: 'Stone-cold sober (allegedly).' },
    { id: 'bar', name: 'The Rusty Anchor', kind: 'Bar', icon: 'beer', risky: true, blurb: 'Two-for-one wells till midnight.' },
    { id: 'restaurant', name: 'Casa Margarita', kind: 'Restaurant & Bar', icon: 'martini', risky: true, blurb: 'Bottomless margs. Bottomless regret.' },
    { id: 'club', name: 'Club Neon', kind: 'Nightclub', icon: 'party', risky: true, blurb: 'Your judgment checked its coat.' },
  ];

  // Panel replies. {contact}, {place} and {score} are filled in per trial.
  const KILL_QUOTES = [
    'Absolutely not.',
    'Put the phone down and drink a water.',
    'We have talked about this. Many times.',
    "I'm screenshotting this for your own good.",
    'Go home. Eat a taco. Sleep.',
    'Denied. Future you says thanks.',
    'The Colosseum says no.',
    '{contact}? From {place}? Bold. Also no.',
    'Hand the phone to the bartender.',
    "I've seen this movie. It ends badly.",
    "This is {place}, not a confessional.",
    'Nope. Order fries instead.',
    'The group chat would never let you live this down.',
    "You'll thank me at brunch.",
    'Thumbs down. Both thumbs, if I could.',
    'Delete it. Then delete the draft of the draft.',
    '{contact} is a closed chapter. Stop re-reading it.',
    "Is this the tequila talking? It's the tequila talking.",
    'Sleep on it. Literally. Go to sleep.',
    'Blocked by the council. The council is me.',
  ];

  const APPROVE_QUOTES = [
    'Fine. But you owe me brunch.',
    "Honestly? It's kind of sweet.",
    'Let chaos reign.',
    "Send it. I'm getting popcorn.",
    'Surprisingly typo-free. Approved.',
    'Life is short. Godspeed.',
    'Ugh. Fine. Go be free.',
    "I'm approving this purely for the story tomorrow.",
    '{contact} kind of had this coming.',
    'Against my better judgment: yes.',
    'The people want drama. Granted.',
    "You're an adult. Allegedly. Approved.",
    'Screenshot me the reply. Immediately.',
    "Tell {contact} I said hi. Actually, don't.",
  ];

  // Judges whose relation mentions mom get their own material half the time.
  const MOM_QUOTES = {
    kill: [
      "I didn't raise you to text {contact} from {place}.",
      'Call me instead, sweetie.',
      "Honey, no. Drink some water and text me when you're home.",
      'Did you eat dinner? Then no.',
      "I'm not mad. I'm disappointed. Also no.",
    ],
    approve: [
      'Okay honey, but be nice.',
      'I just want you to be happy. Also, wear a jacket.',
      'Fine, but text me when you get home.',
    ],
  };

  // Extra roasts when the regret meter is in the red.
  const CATASTROPHE_QUOTES = [
    "The regret meter says {score}%. I don't need to read the rest.",
    '{score}% regret. Even the algorithm is begging you.',
    'That meter is redlining. Put. It. Down.',
  ];

  const REGRET_TRIGGERS = [
    ['u up', 40], ['you up', 40], ['miss', 30], ['closure', 30], ['we need to talk', 30],
    ['thinking about you', 25], ['remember when', 25], ['love', 25], ['sorry', 20], ['hey', 8], ['lol', 5],
  ];

  const SCAN_STEPS = [
    'Center your face in the oval',
    'Blink twice',
    'Turn your head to the side',
    'Hold perfectly still. Sober people can do this.',
  ];

  const RESULTS = {
    killed: { label: 'Killed', tone: 'down' },
    sent: { label: 'Approved', tone: 'up' },
    withdrawn: { label: 'Withdrawn', tone: 'gold' },
    restraint: { label: 'Self-control', tone: 'gold' },
    free: { label: 'Free pass', tone: 'muted' },
  };

  const TABS = [
    ['home', 'home', 'Home'],
    ['nogo', 'ban', 'No-Go'],
    ['panel', 'scale', 'Panel'],
    ['log', 'log', 'Log'],
  ];

  // Lucide icons (ISC license) — https://lucide.dev
  const ICONS = {
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>',
    scale: '<path d="M12 3v18"/><path d="m19 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1"/><path d="m5 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M7 21h10"/>',
    log: '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
    briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    beer: '<path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z"/><path d="M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/>',
    martini: '<path d="M12 12 4.207 4.207A.707.707 0 0 1 4.707 3h14.586a.707.707 0 0 1 .5 1.207z"/><path d="M12 12v10"/><path d="M7 22h10"/>',
    party: '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>',
    pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    pen: '<path d="M13 21h8"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
    send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  };
  const THUMB_UP = '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>';
  const THUMB_DOWN = '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');

  let data = load();
  let ui = freshUi();
  let lastScreen = null;
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

  function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
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

  function tally(trial) {
    return {
      kills: trial.votes.filter((v) => v.vote === 'kill').length,
      ups: trial.votes.filter((v) => v.vote === 'approve').length,
    };
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

  function icon(name, size = 20) {
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }

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
    return `<nav class="tabbar" aria-label="Main">${TABS.map(([id, ic, label]) => `
      <button class="tab ${id === active ? 'is-active' : ''}" data-action="go" data-screen="${id}" aria-label="${label}">
        ${icon(ic, 20)}<span>${label}</span>
      </button>`).join('')}
    </nav>`;
  }

  function topbar(title, back) {
    return `<div class="topbar">
      <button class="icon-btn" data-action="go" data-screen="${back}" aria-label="Back">${icon('back', 18)}</button>
      <h2>${esc(title)}</h2>
    </div>`;
  }

  function pageHead(title, subtitle) {
    return `<header class="page-head">
      <h1 class="title">${esc(title)}</h1>
      <p class="muted">${esc(subtitle)}</p>
    </header>`;
  }

  function regretMeter(score) {
    const [label, tone] =
      score < 25 ? ['Harmless', 'up'] :
      score < 50 ? ['Questionable', 'gold'] :
      score < 75 ? ['Risky', 'orange'] :
      ['Catastrophic', 'down'];
    // Stretch the gradient across the whole track so the fill's color reflects the score.
    const size = score ? `${(10000 / score).toFixed(1)}% 100%` : '100% 100%';
    return `<div class="regret" id="regret">
      <div class="regret-head">
        <span class="label">Regret meter</span>
        <span class="regret-value c-${tone}">${score ? `${score}% · ${label}` : '—'}</span>
      </div>
      <div class="regret-track"><div class="regret-fill" style="width:${score}%;background-size:${size}"></div></div>
    </div>`;
  }

  function evidenceCard(t) {
    return `<div class="card evidence">
      <div class="evidence-photo">
        ${t.selfie ? `<img src="${t.selfie}" alt="Verified selfie">` : '<span>🥴</span>'}
        <span class="verified-badge">${icon('check', 10)} Verified</span>
      </div>
      <div class="evidence-body">
        <span class="eyebrow">To ${esc(t.contactName)}</span>
        <div class="bubble">${esc(t.text)}</div>
        <span class="evidence-meta">${icon('pin', 12)} ${esc(t.locationName)} · ${esc(t.time)}</span>
      </div>
    </div>`;
  }

  function judgeCard(v, i, fresh) {
    const cast = v.vote === 'kill' || v.vote === 'approve';
    let status = '';
    let sub = esc(v.relation);
    if (cast) {
      status = `<span class="vote-chip vote-chip--${v.vote} ${fresh ? 'is-fresh' : ''}">${thumb(v.vote === 'kill' ? 'down' : 'up', 20)}</span>`;
    } else if (v.vote === 'recused') {
      sub = 'Vote not needed';
    } else {
      sub = `${esc(v.relation)} · deliberating<span class="typing"><i></i><i></i><i></i></span>`;
      status = `<span class="vote-btns">
        <button class="vote-btn" data-action="vote" data-index="${i}" data-vote="approve" aria-label="Vote thumbs up as ${esc(v.name)}">${thumb('up', 18)}</button>
        <button class="vote-btn" data-action="vote" data-index="${i}" data-vote="kill" aria-label="Vote thumbs down as ${esc(v.name)}">${thumb('down', 18)}</button>
      </span>`;
    }
    return `<div class="judge ${v.vote ? `judge--${v.vote}` : ''}">
      <div class="judge-row">
        <div class="avatar">${esc(initial(v.name))}</div>
        <div class="judge-id"><strong>${esc(v.name)}</strong><span class="muted">${sub}</span></div>
        ${status}
      </div>
      ${cast ? `<p class="judge-quote ${fresh ? 'is-fresh' : ''}">“${esc(v.quote)}”</p>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  function viewHome() {
    const loc = currentLocation();
    const killed = data.log.filter((e) => e.result === 'killed').length;
    const hint = !data.log.length && loc.risky
      ? `<p class="hint">${icon('sparkles', 16)}<span>Demo tip: you're "at a bar" right now. Try texting The Ex.</span></p>`
      : '';
    return `<main class="screen with-tabs">
      <header class="appbar">
        <div class="brand">${logo(24)}<span class="wordmark">Cesar</span></div>
        <span class="pill ${loc.risky ? 'pill-armed' : ''}"><span class="dot"></span>${loc.risky ? 'Armed' : 'Standby'}</span>
      </header>

      <section class="hero">
        <h1 class="title title-xl">${loc.risky ? "You're out.<br>Cesar's watching." : "All quiet.<br>Cesar's resting."}</h1>
        <p class="muted">${loc.risky
          ? 'Texts to your No-Go list go to your panel first.'
          : 'No drinking spot detected. Text freely.'}</p>
      </section>

      <button class="card place ${loc.risky ? 'is-risky' : ''}" data-action="go" data-screen="location">
        <span class="place-icon">${icon(loc.icon, 24)}</span>
        <span class="place-body">
          <span class="eyebrow">${icon('pin', 12)} Simulated location</span>
          <strong>${esc(loc.name)}</strong>
          <span class="muted">${esc(loc.kind)} · ${esc(loc.blurb)}</span>
        </span>
        <span class="chev">${icon('chevron', 18)}</span>
      </button>

      ${hint}

      <button class="btn btn-primary btn-lg" data-action="go" data-screen="compose">${icon('pen', 20)} Text someone</button>

      <div class="bento">
        <button class="tile" data-action="go" data-screen="nogo">${icon('ban', 18)}<strong>${data.noGo.length}</strong><span>No-Go list</span></button>
        <button class="tile" data-action="go" data-screen="panel">${icon('scale', 18)}<strong>${data.panel.length}</strong><span>Judges</span></button>
        <button class="tile" data-action="go" data-screen="log">${thumb('down', 18)}<strong>${killed}</strong><span>Texts killed</span></button>
      </div>
    </main>
    ${tabbar('home')}`;
  }

  function viewLocation() {
    return `<main class="screen">
      ${topbar('Where are you?', 'home')}
      <p class="muted">Simulated GPS. The real app will spot bars and restaurants on its own.</p>
      <div class="list">${LOCATIONS.map((l) => `
        <button class="card place option ${l.id === data.locationId ? 'is-selected' : ''} ${l.risky ? 'is-risky-option' : ''}" data-action="set-location" data-id="${l.id}">
          <span class="place-icon">${icon(l.icon, 22)}</span>
          <span class="place-body"><strong>${esc(l.name)}</strong><span class="muted">${esc(l.kind)}</span></span>
          ${l.risky ? '<span class="badge badge-down">Drinking zone</span>' : '<span class="badge badge-muted">Safe</span>'}
        </button>`).join('')}
      </div>
    </main>`;
  }

  function viewCompose() {
    const { contactId, text } = ui.draft;
    return `<main class="screen">
      ${topbar('New message', 'home')}
      <section class="field">
        <p class="label">To</p>
        <div class="chips">${allContacts().map((c) => `
          <button class="chip ${c.id === contactId ? 'is-selected' : ''} ${c.noGo ? 'is-nogo' : ''}" data-action="pick-contact" data-id="${c.id}">
            <span class="chip-avatar">${esc(initial(c.name))}</span>${esc(c.name)}${c.noGo ? `<span class="nogo-mark">${icon('ban', 14)}</span>` : ''}
          </button>`).join('')}
        </div>
      </section>
      <section class="field">
        <label class="label" for="draft-text">Message</label>
        <textarea id="draft-text" class="input textarea" rows="5" maxlength="500" placeholder="hey… u up?">${esc(text)}</textarea>
      </section>
      ${regretMeter(regretScore(text))}
      <button class="btn btn-primary btn-lg" data-action="send">${icon('send', 18)} Send</button>
      <p class="fine"><span class="c-down">${icon('ban', 12)}</span> means No-Go list. Nothing actually sends in this prototype.</p>
    </main>`;
  }

  function viewIntercept() {
    const contact = contactById(ui.draft.contactId);
    const loc = currentLocation();
    return `<main class="screen center-screen">
      <div class="orb orb-down">${icon('hand', 40)}</div>
      <h1 class="title title-xl">Hold up.</h1>
      <p class="lead">You're at <strong>${esc(loc.name)}</strong> and trying to text <strong>${esc(contact.name)}</strong>.</p>
      <div class="card quote-card">
        <span class="eyebrow">Why they're on your No-Go list</span>
        <p class="quote">“${esc(contact.reason || 'Sober you said so.')}”</p>
        <span class="muted">— Sober you</span>
      </div>
      <p class="muted">To send it, prove it's really you. Then your panel decides.</p>
      <div class="stack">
        <button class="btn btn-primary btn-lg" data-action="go" data-screen="scan">${icon('scan', 20)} Verify &amp; summon the panel</button>
        <button class="btn btn-quiet" data-action="restraint">Never mind. I'll put the phone down.</button>
      </div>
    </main>`;
  }

  function viewScan() {
    return `<main class="screen center-screen">
      <h1 class="title">Verify it's you</h1>
      <p class="muted">Like the dating apps. Except the stakes are higher.</p>
      <div class="scan-wrap">
        <div class="scan-frame">
          <video autoplay playsinline muted></video>
          <canvas class="scan-mesh"></canvas>
          <div class="scan-fallback">🥴</div>
          <div class="scan-line"></div>
        </div>
      </div>
      <p id="scan-step" class="scan-step">Starting camera…</p>
      <ol class="steps">
        <li><span class="bar"></span>Face</li>
        <li><span class="bar"></span>Blink</li>
        <li><span class="bar"></span>Turn</li>
        <li><span class="bar"></span>Still</li>
      </ol>
      <div class="stack">
        <button id="scan-skip" class="btn btn-quiet" data-action="skip-scan" hidden>Having trouble? Skip the check</button>
        <button class="btn btn-quiet" data-action="cancel-scan">Cancel</button>
      </div>
    </main>`;
  }

  function viewTrial() {
    const t = ui.trial;
    const { kills, ups } = tally(t);
    return `<main class="screen">
      <div class="trial-head">
        <span class="pill pill-gold">${icon('scale', 14)} Case #${t.caseNo}</span>
        <h1 class="title">The panel is in session</h1>
        <p class="muted">Majority rules. Two thumbs decide.</p>
      </div>
      ${evidenceCard(t)}
      <div class="tally" aria-label="${ups} up, ${kills} down">
        <span class="tally-count c-up">${thumb('up', 16)} ${ups}</span>
        <div class="tally-track">
          <span class="tally-up" style="width:${(ups / 3) * 100}%"></span>
          <span class="tally-down" style="width:${(kills / 3) * 100}%"></span>
        </div>
        <span class="tally-count c-down">${kills} ${thumb('down', 16)}</span>
      </div>
      <div class="list">${t.votes.map((v, i) => judgeCard(v, i, i === t.lastVoted)).join('')}</div>
      ${t.decided
        ? '<p class="deciding">Verdict reached…</p>'
        : '<p class="fine">Tap a thumb to vote as a judge, or wait for them.</p><button class="btn btn-quiet" data-action="withdraw">Withdraw the text</button>'}
    </main>`;
  }

  function viewVerdict() {
    const t = ui.trial;
    const killed = t.result === 'killed';
    const { kills, ups } = tally(t);
    const score = killed ? `${kills}–${ups}` : `${ups}–${kills}`;
    const stage = killed
      ? `<div class="verdict-stage" aria-hidden="true">
          <div class="vs-card"><div class="bubble vs-bubble">${esc(t.text)}</div></div>
          <div class="vs-thumb">${thumb('down', 88)}</div>
          <div class="vs-tomb">
            <span class="rip">R.I.P.</span>
            <span class="epitaph">“${esc(truncate(t.text, 44))}”</span>
            <span class="dates">Born ${esc(t.time)} · Died ${esc(clock(new Date()))}</span>
            <span class="roses">🥀</span>
          </div>
        </div>`
      : `<div class="verdict-stage" aria-hidden="true">
          <div class="vs-thumb vs-thumb--up">${thumb('up', 64)}</div>
          <div class="vs-card vs-card--sent">
            <div class="bubble vs-bubble">${esc(t.text)}</div>
            <span class="vs-stamp">Approved</span>
          </div>
          <span class="vs-delivered">${icon('check', 16)} Delivered to ${esc(t.contactName)}</span>
        </div>`;
    return `<main class="screen center-screen verdict" data-action="reveal-verdict">
      ${stage}
      <div class="verdict-body">
        <span class="pill ${killed ? 'pill-armed' : 'pill-up'}">The panel has spoken · ${score}</span>
        <h1 class="title title-xl ${killed ? 'c-down' : 'c-up'}">${killed ? 'The text dies.' : 'Sent. Godspeed.'}</h1>
        <p class="lead muted">${killed
          ? `${esc(t.contactName)} will never know. Your dignity survives another night.`
          : `Your message to ${esc(t.contactName)} is on its way. The panel has been notified of your choices.`}</p>
        <ul class="list quotes">${t.votes.filter((v) => v.quote).map((v) => `
          <li class="card">${thumb(v.vote === 'kill' ? 'down' : 'up', 16)}<span><strong>${esc(v.name)}</strong> “${esc(v.quote)}”</span></li>`).join('')}
        </ul>
        <div class="stack">
          <button class="btn btn-primary btn-lg" data-action="finish">${killed ? 'Accept my fate' : 'Back home'}</button>
          ${killed ? '<button class="btn btn-quiet" disabled>Appeal to the Senate · coming in v2</button>' : ''}
        </div>
      </div>
    </main>`;
  }

  function viewNoGo() {
    const items = data.noGo.map((c) => `
      <li class="card row">
        <span class="row-icon row-icon--down">${icon('ban', 18)}</span>
        <span class="row-body">
          <strong>${esc(c.name)}</strong>
          <span class="muted">${esc(c.reason || 'No reason given. Sober you knew.')}</span>
        </span>
        <button class="icon-btn icon-btn--sm" data-action="remove-nogo" data-id="${c.id}" aria-label="Remove ${esc(c.name)}">${icon('x', 16)}</button>
      </li>`).join('');
    return `<main class="screen with-tabs">
      ${pageHead('No-Go Zone', "People you shouldn't text after two drinks. Sober you picked them. Trust sober you.")}
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
    return `<main class="screen with-tabs">
      ${pageHead('Your Panel', 'Three judges. They see your face and your text, then they vote. Pick people who love you enough to say no.')}
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
        <span class="row-icon">${icon('shield', 18)}</span>
        <div>
          <strong>How judges vote</strong>
          <p class="muted">In the real app, your panel gets a text with a link and votes from their browser. No app install needed. Majority rules. If nobody answers in 15 minutes, the text dies.</p>
        </div>
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
    return `<main class="screen with-tabs">
      ${pageHead('Shame Log', 'Every trial, every verdict. For the record.')}
      <div class="bento">
        <div class="tile">${thumb('down', 18)}<strong>${count('killed')}</strong><span>Killed</span></div>
        <div class="tile">${thumb('up', 18)}<strong>${count('sent')}</strong><span>Approved</span></div>
        <div class="tile c-gold">${icon('shield', 18)}<strong>${count('restraint', 'withdrawn')}</strong><span>Self-control</span></div>
      </div>
      <ul class="list">${items || '<li class="empty">No trials yet. The night is young.</li>'}</ul>
      <button class="btn btn-quiet btn-sm" data-action="reset">${icon('reset', 14)} Reset demo data</button>
    </main>
    ${tabbar('log')}`;
  }

  const VIEWS = {
    home: { html: viewHome },
    location: { html: viewLocation },
    compose: { html: viewCompose },
    // Start downloading the face tracker while they read the warning.
    intercept: { html: viewIntercept, mount: () => { if (navigator.mediaDevices?.getUserMedia) loadLandmarker().catch(() => {}); } },
    scan: { html: viewScan, mount: runScan },
    trial: { html: viewTrial },
    verdict: { html: viewVerdict, mount: playVerdict },
    nogo: { html: viewNoGo },
    panel: { html: viewPanel },
    log: { html: viewLog },
  };

  // The ambient glow behind the app follows the mood of the moment.
  function mood() {
    if (ui.screen === 'verdict' && ui.trial) return ui.trial.result;
    if (ui.screen === 'trial' || ui.screen === 'scan') return 'trial';
    return currentLocation().risky ? 'armed' : 'calm';
  }

  function render() {
    const view = VIEWS[ui.screen] || VIEWS.home;
    const entering = ui.screen !== lastScreen;
    const scrollTop = entering ? 0 : ($app.querySelector('.screen')?.scrollTop || 0);

    $app.innerHTML = view.html();
    $app.dataset.mood = mood();

    const screen = $app.querySelector('.screen');
    if (entering) screen.classList.add('is-entering');
    else screen.scrollTop = scrollTop;
    lastScreen = ui.screen;

    if (view.mount) view.mount();
  }

  function show(screen) {
    ui.screen = screen;
    render();
  }

  // ---------------------------------------------------------------------------
  // Flow: send → intercept → face scan → trial → verdict
  // ---------------------------------------------------------------------------

  // --- Verdict animations ----------------------------------------------------

  let verdictReveal = null;

  function reducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  // Screen shake + color flash + a buzz on phones that support it.
  function impact(tone) {
    const hard = tone === 'down';
    $app.animate([
      { transform: 'none' },
      { transform: `translate(${hard ? -8 : -4}px, 3px)` },
      { transform: `translate(${hard ? 7 : 3}px, -4px)` },
      { transform: 'translate(-4px, 2px)' },
      { transform: 'translate(2px, -1px)' },
      { transform: 'none' },
    ], { duration: hard ? 450 : 260, easing: 'ease-out' });
    const flash = document.createElement('div');
    flash.className = `flash flash--${tone}`;
    $app.appendChild(flash);
    flash.animate([{ opacity: hard ? 0.4 : 0.22 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' }).onfinish = () => flash.remove();
    try { navigator.vibrate?.(hard ? [70, 40, 140] : [25, 30, 25]); } catch { /* unsupported */ }
  }

  // Breaks the bubble into jagged, tiling shards that tumble off screen.
  function shatter(bubble, stage) {
    const cols = 5;
    const rows = 3;
    const b = bubble.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const jitter = (i, n) => (i === 0 || i === n ? 0 : (Math.random() - 0.5) * 0.6 / n);
    const pts = [];
    for (let r = 0; r <= rows; r++) {
      pts.push([]);
      for (let c = 0; c <= cols; c++) pts[r].push([(c / cols + jitter(c, cols)) * 100, (r / rows + jitter(r, rows)) * 100]);
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const poly = [pts[r][c], pts[r][c + 1], pts[r + 1][c + 1], pts[r + 1][c]]
          .map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(',');
        const shard = bubble.cloneNode(true);
        shard.classList.add('shard');
        shard.style.cssText = `left:${b.left - s.left}px;top:${b.top - s.top}px;width:${b.width}px;height:${b.height}px;clip-path:polygon(${poly})`;
        stage.appendChild(shard);
        const dx = ((c + 0.5) / cols - 0.5) * 240 + (Math.random() - 0.5) * 80;
        const dy = 280 + Math.random() * 220;
        const rot = (Math.random() - 0.5) * 540;
        shard.animate([
          { transform: 'none', opacity: 1 },
          { transform: `translate(${dx * 0.3}px, ${-30 - Math.random() * 40}px) rotate(${rot * 0.25}deg)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: 0 },
        ], { duration: 1000 + Math.random() * 500, easing: 'cubic-bezier(.3, 0, .8, .6)', fill: 'forwards' });
      }
    }
    bubble.style.visibility = 'hidden';
  }

  function confetti() {
    const canvas = document.createElement('canvas');
    canvas.className = 'vs-confetti';
    $app.appendChild(canvas);
    const w = $app.clientWidth;
    const h = $app.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const colors = ['#e8b54a', '#f5cb6b', '#3dd68c', '#ff5a5f', '#2b7bff', '#f5f2f9'];
    const bits = Array.from({ length: 150 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 40,
      y: h * 0.3,
      vx: (Math.random() - 0.5) * 16,
      vy: -6 - Math.random() * 12,
      size: 6 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.35,
      color: pick(colors),
      emoji: Math.random() < 0.12,
    }));
    const life = 3400;
    const start = performance.now();
    let last = start;
    const frame = (now) => {
      if (!canvas.isConnected) return;
      const k = Math.min((now - last) / 16.7, 3); // keep physics steady on 120Hz screens
      last = now;
      const age = now - start;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, Math.min(1, (life - age) / 600));
      for (const bit of bits) {
        bit.vy += 0.32 * k;
        bit.vx *= 0.985 ** k;
        bit.x += bit.vx * k;
        bit.y += bit.vy * k;
        bit.rot += bit.spin * k;
        ctx.save();
        ctx.translate(bit.x, bit.y);
        ctx.rotate(bit.rot);
        if (bit.emoji) {
          ctx.font = `${bit.size * 2}px system-ui`;
          ctx.fillText('👍', -bit.size, bit.size);
        } else {
          ctx.scale(1, Math.cos(bit.rot * 2)); // flutter
          ctx.fillStyle = bit.color;
          ctx.fillRect(-bit.size / 2, -bit.size / 4, bit.size, bit.size / 2);
        }
        ctx.restore();
      }
      if (age < life) requestAnimationFrame(frame);
      else canvas.remove();
    };
    requestAnimationFrame(frame);
  }

  function playVerdict() {
    const t = ui.trial;
    const killed = t.result === 'killed';
    const stage = $app.querySelector('.verdict-stage');
    const body = $app.querySelector('.verdict-body');
    const part = (sel) => stage.querySelector(sel);
    const alive = () => ui.screen === 'verdict' && ui.trial === t && stage.isConnected;
    const at = (ms, fn) => setTimeout(() => { if (alive()) fn(); }, ms);
    const reveal = () => body.classList.add('is-revealed');
    verdictReveal = reveal;

    if (reducedMotion()) {
      stage.classList.add('is-final');
      reveal();
      return;
    }

    const bubble = part('.vs-bubble');
    const thumbEl = part('.vs-thumb');
    bubble.animate([
      { opacity: 0, transform: 'scale(.6)' },
      { opacity: 1, transform: 'scale(1.05)', offset: 0.7 },
      { opacity: 1, transform: 'none' },
    ], { duration: 380, easing: 'ease-out', fill: 'both' });

    if (killed) {
      // The thumb drops, the text shatters, a tombstone rises.
      at(550, () => thumbEl.animate([
        { opacity: 0, transform: 'translateY(-240px) scale(2.6) rotate(-25deg)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 320, easing: 'cubic-bezier(.55, 0, 1, .45)', fill: 'forwards' }));
      at(870, () => {
        shatter(bubble, stage);
        impact('down');
        thumbEl.animate([
          { opacity: 1, transform: 'none' },
          { opacity: 1, transform: 'translateY(-14px) scale(1.08)', offset: 0.3 },
          { opacity: 0, transform: 'translateY(40px) scale(.9)' },
        ], { duration: 700, delay: 250, easing: 'ease-in', fill: 'forwards' });
      });
      at(1500, () => part('.vs-tomb').animate([
        { opacity: 0, transform: 'translateY(160px)' },
        { opacity: 1, transform: 'translateY(-10px)', offset: 0.75 },
        { opacity: 1, transform: 'none' },
      ], { duration: 650, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' }));
      at(2300, reveal);
      return;
    }

    // Stamped, launched, celebrated.
    at(400, () => thumbEl.animate([
      { opacity: 0, transform: 'scale(0) rotate(-30deg)' },
      { opacity: 1, transform: 'scale(1.25) rotate(10deg)', offset: 0.6 },
      { opacity: 1, transform: 'none' },
    ], { duration: 420, easing: 'ease-out', fill: 'forwards' }));
    at(700, () => part('.vs-stamp').animate([
      { opacity: 0, transform: 'rotate(-12deg) scale(3)' },
      { opacity: 1, transform: 'rotate(-12deg) scale(1)' },
    ], { duration: 200, easing: 'cubic-bezier(.55, 0, 1, .45)', fill: 'forwards' }));
    at(900, () => impact('up'));
    at(1400, () => {
      part('.vs-card').animate([
        { transform: 'none', opacity: 1 },
        { transform: 'translateY(14px) scale(.96)', opacity: 1, offset: 0.2 },
        { transform: 'translate(130px, -380px) scale(.3) rotate(10deg)', opacity: 0 },
      ], { duration: 600, easing: 'cubic-bezier(.5, 0, .9, .4)', fill: 'forwards' });
      thumbEl.animate([
        { opacity: 1, transform: 'none' },
        { opacity: 1, transform: 'translateY(70px) scale(1.5) rotate(-12deg)', offset: 0.5 },
        { opacity: 1, transform: 'translateY(70px) scale(1.5) rotate(12deg)', offset: 0.75 },
        { opacity: 1, transform: 'translateY(70px) scale(1.5)' },
      ], { duration: 900, delay: 300, easing: 'ease-in-out', fill: 'forwards' });
    });
    at(1750, () => {
      confetti();
      part('.vs-delivered').animate([
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 400, easing: 'ease-out', fill: 'forwards' });
    });
    at(2200, reveal);
  }

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

  // --- Face tracking (MediaPipe Face Landmarker, entirely on-device) ---------

  let landmarkerPromise = null;
  let activeScan = null;

  function loadLandmarker() {
    if (!landmarkerPromise) {
      landmarkerPromise = (async () => {
        const { FaceLandmarker, FilesetResolver } = await import(`${MEDIAPIPE_URL}/vision_bundle.mjs`);
        const fileset = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_URL}/wasm`);
        const create = (delegate) => FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        });
        try { return await create('GPU'); } catch { return await create('CPU'); }
      })();
      landmarkerPromise.catch(() => { landmarkerPromise = null; }); // allow a retry next scan
    }
    return landmarkerPromise;
  }

  // Nose tip (1) relative to the cheeks (234, 454) gives position, size and head turn.
  function facePose(face) {
    const nose = face[1];
    const left = Math.min(face[234].x, face[454].x);
    const right = Math.max(face[234].x, face[454].x);
    const width = right - left;
    return { x: nose.x, y: nose.y, width, turn: width ? Math.abs((nose.x - left) / width - 0.5) : 0 };
  }

  function blendshape(shapes, name) {
    return shapes?.find((c) => c.categoryName === name)?.score ?? 0;
  }

  // Draws a sparse dot mesh over the mirrored, object-fit: cover preview.
  function drawMesh(canvas, video, face) {
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!face || !video.videoWidth) return;
    const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    const ox = (w - dw) / 2;
    const oy = (h - dh) / 2;
    ctx.fillStyle = 'rgba(245, 203, 107, .85)';
    for (let i = 0; i < face.length; i += 3) {
      const p = face[i];
      ctx.fillRect(w - (ox + p.x * dw) - 0.75, oy + p.y * dh - 0.75, 1.5, 1.5);
    }
  }

  // Runs the four checks against live face data. Resolves true when they all
  // pass (or the viewer skips), false if cancelled, null if tracking breaks.
  function trackedChecks(landmarker, scan) {
    const { video, canvas } = scan;
    let step = 0;
    let since = null;   // start of the current hold (centering / stillness)
    let anchor = null;  // nose position the stillness check measures from
    let swayUntil = 0;
    let blinks = 0;
    let eyesClosed = false;
    let eyeBaseline = null; // this person's resting eyeBlink score, learned as we go
    let lastTime = -1;

    const advance = () => {
      scan.done(step);
      step += 1;
      since = null;
      anchor = null;
      if (step >= SCAN_STEPS.length) return true;
      scan.setStep(step);
      return false;
    };

    const evaluate = (face, shapes, now) => {
      if (!face) {
        since = null;
        anchor = null;
        if (step !== 1) scan.setProgress(step, 0);
        scan.hint('No face found. Get in the oval.');
        return false;
      }
      const pose = facePose(face);
      const centered = Math.abs(pose.x - 0.5) < 0.16 && Math.abs(pose.y - 0.5) < 0.22;

      if (step === 0) {
        if (pose.width < MIN_FACE_WIDTH || !centered) {
          since = null;
          scan.setProgress(0, 0);
          scan.hint(pose.width < MIN_FACE_WIDTH ? 'Come a little closer' : SCAN_STEPS[0]);
          return false;
        }
        since ??= now;
        scan.setProgress(0, (now - since) / CENTER_HOLD_MS);
        scan.hint('Hold it right there…');
        return now - since >= CENTER_HOLD_MS && advance();
      }

      if (step === 1) {
        const blink = (blendshape(shapes, 'eyeBlinkLeft') + blendshape(shapes, 'eyeBlinkRight')) / 2;
        eyeBaseline ??= blink;
        if (!eyesClosed && blink > Math.max(BLINK_MIN, eyeBaseline + BLINK_RISE)) eyesClosed = true;
        else if (eyesClosed && blink < eyeBaseline + BLINK_RISE / 2) { eyesClosed = false; blinks += 1; }
        if (!eyesClosed) eyeBaseline = eyeBaseline * 0.9 + blink * 0.1;
        scan.setProgress(1, blinks / 2);
        scan.hint(blinks ? 'One more blink' : SCAN_STEPS[1]);
        return blinks >= 2 && advance();
      }

      if (step === 2) {
        scan.setProgress(2, pose.turn / TURN_THRESHOLD);
        scan.hint(SCAN_STEPS[2]);
        return pose.turn >= TURN_THRESHOLD && advance();
      }

      // Step 3: face forward and hold still. Any sway restarts the clock.
      if (pose.turn > TURN_THRESHOLD / 2 || !centered) {
        since = null;
        anchor = null;
        scan.setProgress(3, 0);
        scan.hint('Face forward, in the oval');
        return false;
      }
      if (anchor && Math.hypot(pose.x - anchor.x, pose.y - anchor.y) > STILL_TOLERANCE) {
        anchor = null;
        swayUntil = now + 1200;
      }
      if (!anchor) {
        anchor = { x: pose.x, y: pose.y };
        since = now;
      }
      scan.setProgress(3, (now - since) / STILL_MS);
      scan.hint(now < swayUntil ? 'Swaying detected. Start over.' : SCAN_STEPS[3]);
      return now - since >= STILL_MS && advance();
    };

    scan.setStep(0);
    return new Promise((resolve) => {
      const tick = () => {
        if (!scan.alive()) return resolve(false);
        if (scan.skipped) return resolve(true);
        if (video.readyState >= 2 && video.currentTime !== lastTime) {
          lastTime = video.currentTime;
          const now = performance.now();
          let result;
          try { result = landmarker.detectForVideo(video, now); } catch { return resolve(null); }
          const face = result.faceLandmarks?.[0];
          drawMesh(canvas, video, face);
          if (evaluate(face, result.faceBlendshapes?.[0]?.categories, now)) return resolve(true);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // Timed stand-in for when there's no camera or no face tracking.
  async function scriptedChecks(scan) {
    for (let i = 0; i < SCAN_STEPS.length; i++) {
      if (!scan.alive()) return false;
      if (scan.skipped) return true;
      scan.setStep(i);
      const start = performance.now();
      while (performance.now() - start < 1300) {
        if (!scan.alive()) return false;
        scan.setProgress(i, (performance.now() - start) / 1300);
        await wait(50);
      }
      scan.done(i);
    }
    return true;
  }

  async function startCamera(scan) {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
      // Don't hang forever if the permission prompt is ignored: fall back to the
      // stunt double, and release the camera if access is granted too late.
      let timedOut = false;
      const request = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
      request.then((s) => { if (timedOut) s.getTracks().forEach((track) => track.stop()); }, () => {});
      const hint = setTimeout(() => { if (scan.alive()) scan.hint('Allow camera access, or wait for your stunt double…'); }, 2500);
      const s = await Promise.race([
        request,
        wait(CAMERA_TIMEOUT_MS).then(() => { timedOut = true; throw new Error('Camera permission timed out'); }),
      ]).finally(() => clearTimeout(hint));
      if (!scan.alive()) { s.getTracks().forEach((track) => track.stop()); return false; }
      stream = s;
      scan.video.srcObject = stream;
      await scan.video.play();
      return true;
    } catch {
      if (!scan.alive()) return false;
      scan.wrap.classList.add('no-camera');
      scan.hint('No camera, so your stunt double will stand in.');
      await wait(1400);
      return false;
    }
  }

  async function runScan() {
    const run = ++scanRun;
    const wrap = $app.querySelector('.scan-wrap');
    const stepEl = $app.querySelector('#scan-step');
    const skipBtn = $app.querySelector('#scan-skip');
    const stepEls = [...$app.querySelectorAll('.steps li')];
    const clamp = (p) => Math.max(0, Math.min(1, p));
    const scan = {
      wrap,
      video: wrap.querySelector('video'),
      canvas: wrap.querySelector('.scan-mesh'),
      skipped: false,
      onSkip: null,
      alive: () => run === scanRun && ui.screen === 'scan',
      hint: (text) => { if (stepEl.textContent !== text) stepEl.textContent = text; },
      setStep: (i) => { stepEls[i].classList.add('is-active'); scan.hint(SCAN_STEPS[i]); },
      setProgress: (i, p) => stepEls[i].style.setProperty('--p', clamp(p).toFixed(3)),
      done: (i) => stepEls[i].classList.replace('is-active', 'is-done'),
    };
    const skipped = new Promise((resolve) => { scan.onSkip = resolve; });
    activeScan = scan;
    const skipTimer = setTimeout(() => { if (scan.alive()) skipBtn.hidden = false; }, SKIP_AFTER_MS);

    const tracker = navigator.mediaDevices?.getUserMedia ? loadLandmarker().catch(() => null) : null;
    const hasCamera = await startCamera(scan);

    let passed = null;
    if (hasCamera && tracker && scan.alive()) {
      scan.hint('Loading face tracking…');
      const landmarker = await Promise.race([tracker, wait(TRACKER_TIMEOUT_MS).then(() => null), skipped.then(() => null)]);
      if (landmarker && scan.alive() && !scan.skipped) {
        wrap.classList.add('tracking');
        passed = await trackedChecks(landmarker, scan);
        wrap.classList.remove('tracking');
      }
      if (passed === null && scan.alive() && !scan.skipped) {
        scan.hint('Face tracking unavailable. Running the demo check.');
        await wait(1200);
      }
    }
    if (scan.skipped) passed = true;
    if (passed === null) passed = await scriptedChecks(scan);

    clearTimeout(skipTimer);
    if (activeScan === scan) activeScan = null;
    if (!passed || !scan.alive()) return stopCamera();

    skipBtn.hidden = true;
    drawMesh(scan.canvas, scan.video, null);
    const selfie = captureFrame(scan.video);
    stopCamera();
    if (selfie) wrap.querySelector('.scan-frame').insertAdjacentHTML('beforeend', `<img class="scan-still" src="${selfie}" alt="">`);
    stepEls.forEach((li) => { li.classList.remove('is-active'); li.classList.add('is-done'); });
    wrap.classList.add('verified');
    scan.hint(scan.skipped
      ? 'Check skipped. The panel will judge you anyway.'
      : 'Identity verified. Unfortunately, it is you.');

    await wait(1100);
    if (scan.alive()) startTrial(selfie);
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
      usedQuotes: [],
      score: regretScore(ui.draft.text),
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

  // Picks a reply no other judge has used this trial, tailored to who's voting.
  function panelQuote(vote, judge, trial) {
    let pool = vote === 'kill' ? KILL_QUOTES : APPROVE_QUOTES;
    if (/\b(mom|mother|mum|mama)\b/i.test(judge.relation || '') && Math.random() < 0.5) pool = MOM_QUOTES[vote];
    else if (vote === 'kill' && trial.score >= 75 && Math.random() < 0.4) pool = CATASTROPHE_QUOTES;
    const unused = pool.filter((q) => !trial.usedQuotes.includes(q));
    const quote = pick(unused.length ? unused : pool);
    trial.usedQuotes.push(quote);
    return quote
      .replace(/\{contact\}/g, trial.contactName)
      .replace(/\{place\}/g, trial.locationName)
      .replace(/\{score\}/g, trial.score);
  }

  function castVote(index, vote) {
    const trial = ui.trial;
    if (!trial || trial.decided) return;
    const judge = trial.votes[index];
    if (!judge || judge.vote) return;

    judge.vote = vote;
    trial.lastVoted = index;
    judge.quote = panelQuote(vote, judge, trial);

    const { kills, ups } = tally(trial);
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
    'skip-scan': () => {
      if (!activeScan) return;
      activeScan.skipped = true;
      activeScan.onSkip();
    },
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
    'reveal-verdict': () => verdictReveal?.(),
    finish: () => { ui.trial = null; clearDraft(); show('home'); },
    'set-location': (d) => {
      data.locationId = d.id;
      save();
      const loc = currentLocation();
      toast(loc.risky ? `${loc.name}. Cesar is armed.` : `${loc.name}. Cesar is on standby.`);
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
