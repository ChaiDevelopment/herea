const $ = (s) => document.querySelector(s);
const TOKEN_KEY = 'herea_token';
let token = localStorage.getItem(TOKEN_KEY);
let authMode = 'register';
let reference = null; // { moods, symptoms } — data referensi dari server

const ACTIVITY_TYPES = { WALKING: 'Jalan kaki', RUNNING: 'Lari', WORKOUT: 'Workout', STRETCHING: 'Peregangan', YOGA: 'Yoga', CYCLING: 'Bersepeda', OTHER: 'Lainnya' };
const INTENSITIES = { LOW: 'Ringan', MODERATE: 'Sedang', HIGH: 'Berat' };

/** Tanggal lokal perangkat (bukan UTC) dalam format YYYY-MM-DD, untuk nilai default input tanggal. */
function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const fmtDate = (v) => new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
function esc(v) {
  const n = document.createElement('span');
  n.textContent = v ?? '';
  return n.innerHTML;
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const r = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  if (!r.ok) throw new ApiError((await r.json().catch(() => ({}))).error || 'Silakan coba lagi.', r.status);
  return r.status === 204 ? null : r.json();
}
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) });

// ---------------------------------------------------------------- auth
function setToken(t) {
  token = t;
  localStorage.setItem(TOKEN_KEY, t);
}
async function register() {
  try {
    const x = await post('/api/auth/register', {
      name: $('#name').value,
      email: $('#email').value,
      password: $('#password').value,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setToken(x.token);
    dashboard();
  } catch (e) {
    $('#message').textContent = e.message;
  }
}
async function login() {
  try {
    const x = await post('/api/auth/login', { email: $('#email').value, password: $('#password').value });
    setToken(x.token);
    dashboard();
  } catch (e) {
    $('#message').textContent = e.message;
  }
}
const submitAuth = () => (authMode === 'login' ? login() : register());
function toggleAuth() {
  authMode = authMode === 'login' ? 'register' : 'login';
  const m = authMode === 'login';
  $('#name').hidden = m;
  $('#auth-title').textContent = m ? 'Welcome back' : 'Create your private space';
  $('#auth-submit').textContent = m ? 'Sign in securely' : 'Begin your journey';
  $('#auth-toggle').textContent = m ? 'I need to create an account' : 'I already have an account';
}
function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  token = undefined;
  location.reload();
}

// ------------------------------------------------------------- dashboard
const signal = (name, value, detail) => `<div class="signal"><span>${name}</span><strong>${esc(value) || '—'}</strong><small>${esc(detail)}</small></div>`;

function cycleRows(cycles) {
  if (!cycles.length) return '<p class="muted">Belum ada tanggal haid. Tambahkan haid pertama untuk mulai mengenali pola.</p>';
  return cycles
    .map(
      (c) => `<article class="cycle-row"><div><strong>${fmtDate(c.start_date)}</strong><small>${c.end_date ? `Selesai ${fmtDate(c.end_date)}` : 'Belum diisi / masih berlangsung'}${c.cycle_length ? ` · siklus ${c.cycle_length} hari` : ''}</small></div><div class="row-actions"><button class="text" onclick="editCycle('${c.id}','${c.start_date}','${c.end_date || ''}')">Ubah</button><button class="text danger" onclick="deleteCycle('${c.id}')">Hapus</button></div></article>`,
    )
    .join('');
}

async function dashboard() {
  try {
    const [profile, d, today, insights, cycles, analysis, moods, symptoms] = await Promise.all(
      ['/api/profile', '/api/dashboard', '/api/today', '/api/insights', '/api/cycles', '/api/cycle-analysis', '/api/moods', '/api/symptoms'].map((p) => request(p)),
    );
    reference = { moods, symptoms };
    const { cycle, score } = d;
    const c = today.checkin;
    const activityNames = [...new Set(today.activities.map((a) => ACTIVITY_TYPES[a.activity_type]))].join(', ');
    const top = insights[0];

    $('#app').innerHTML = `<nav><span class="wordmark">HERÉA</span><div class="nav-links"><button class="text" onclick="showPanel('cycle-history')">Siklus</button><button class="text" onclick="showPanel('journal')">Journal</button><button class="text" onclick="signOut()">Sign out</button></div></nav><main class="dashboard"><header class="dashboard-header"><div><p class="eyebrow">PRIVATE WELLNESS · TODAY</p><h1>Good to see you${profile.name ? `, <i>${esc(profile.name)}</i>` : ''}.</h1><p>Notice your rhythm with care, never pressure.</p></div><button onclick="openCheckin()">${c ? 'Update today’s check-in' : 'Complete daily check-in'}</button></header>
<section class="overview"><article class="score"><p>YOUR WELLNESS</p><strong>${score.overall_score ?? '—'}</strong><small>${score.signals ? `Based on ${score.signals} of ${score.total_signals} signals today` : 'Not enough data yet.'}</small></article>
<article><p>YOUR CYCLE</p><h2>${cycle.day ? `Day ${cycle.day}` : 'Begin when ready'}</h2><p>${cycle.phase === 'Unknown' ? 'Log a period to learn your rhythm.' : `${esc(cycle.phase)}.`}</p><button class="link" onclick="openPeriod()">Catat haid</button></article>
<article><p>ESTIMATED NEXT PERIOD</p><h2>${analysis.next_period ? fmtDate(analysis.next_period) : '—'}</h2><p>${analysis.average_length ? `Berdasarkan pola ${analysis.average_length} hari.` : 'Tambahkan dua tanggal mulai untuk perkiraan.'}</p></article></section>
<section class="cycle-panel" id="cycle-history"><div><p class="eyebrow">RIWAYAT & ANALISIS SIKLUS</p><h2>${analysis.status === 'LATE' ? 'Periode mungkin terlambat' : analysis.irregular ? 'Pola siklus bervariasi' : 'Kenali pola siklusmu'}</h2><p>${esc(analysis.message)}</p><p class="cycle-guidance">${esc(analysis.guidance)}</p></div><button onclick="openPeriod()">+ Tambah haid bulan berikutnya</button><div class="cycle-list">${cycleRows(cycles)}</div></section>
<section class="section-heading"><div><p class="eyebrow">YOUR SIGNALS</p><h2>A whole-picture check-in.</h2></div><span>Logged today</span></section>
<section class="signals">${signal('Mood', c?.mood?.name || 'Not logged', c ? 'Today’s check-in' : 'Add today’s mood')}${signal('Energy', c ? `${c.energy_score}/5` : null, 'Today’s level')}${signal('Sleep', today.sleep ? `${(today.sleep.duration_minutes / 60).toFixed(1)}h` : null, today.sleep ? 'Logged today' : 'Log rest')}${signal('Hydration', today.hydration_ml ? `${today.hydration_ml} ml` : null, today.hydration_ml ? `${today.hydration_entries} entries today` : 'Log water')}${signal('Activity', today.activity_minutes ? `${today.activity_minutes} min` : null, activityNames || 'Log movement')}</section>
<section class="quick-actions"><div><p class="eyebrow">SMALL MOMENTS, MEANINGFUL PATTERNS</p><h2>What would you like to log?</h2></div><div class="action-buttons"><button onclick="openCheckin()">Mood & check-in</button><button onclick="openLog('sleep')">Sleep</button><button onclick="openLog('hydration')">Hydration</button><button onclick="openLog('activity')">Activity</button></div></section>
<section class="insight" id="insights"><p class="eyebrow">LATEST INSIGHT</p><h2>${esc(top?.title) || 'Your insights will appear here.'}</h2><p>${esc(top?.description) || 'When you log a few signals, HERÉA will turn your real entries into gentle, non-diagnostic observations.'}</p>${top?.recommendation ? `<p class="insight-note">${esc(top.recommendation)}</p>` : ''}</section>
<section class="panel" id="journal"><p class="eyebrow">PRIVATE JOURNAL</p><h2>A space just for you.</h2><form onsubmit="saveJournal(event)"><input id="journal-title" maxlength="180" placeholder="Title (optional)"><textarea id="journal-body" placeholder="Write what’s on your mind…" required></textarea><button>Save private entry</button></form><div id="journal-list"></div></section></main>`;
    loadJournal();
  } catch (e) {
    if (e.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      token = undefined;
      return location.reload();
    }
    $('#app').innerHTML = `<section class="hero"><h1>We couldn’t open your wellness space.</h1><p>${esc(e.message)}</p><button onclick="location.reload()">Try again</button></section>`;
  }
}

// ---------------------------------------------------------------- modal
function modal(title, body) {
  return `<div class="modal-backdrop" id="modal"><form class="modal" onsubmit="return false"><button type="button" class="close" onclick="closeModal()">×</button><p class="eyebrow">QUICK LOG</p><h2>${title}</h2>${body}<p class="form-message" id="form-message"></p></form></div>`;
}
const closeModal = () => $('#modal')?.remove();
const showModal = (title, body) => document.body.insertAdjacentHTML('beforeend', modal(title, body));
const fail = (e) => ($('#form-message').textContent = e.message);

// ---- siklus
function openPeriod() {
  showModal('Catat haid', `<p class="modal-help">Setiap haid baru, termasuk bulan berikutnya, tambahkan tanggal mulai baru. Tanggal selesai dapat diisi sekarang atau nanti.</p><label>Haid dimulai<input id="period-date" type="date" value="${localToday()}" max="${localToday()}" required></label><label>Haid selesai <small>Opsional</small><input id="period-end" type="date" max="${localToday()}"></label><button type="button" onclick="savePeriod()">Simpan haid</button>`);
}
async function savePeriod() {
  try {
    const start_date = $('#period-date').value;
    const end_date = $('#period-end').value || null;
    if (end_date && end_date < start_date) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    await post('/api/cycles', { start_date, end_date });
    closeModal();
    dashboard();
  } catch (e) {
    fail(e);
  }
}
function editCycle(id, start, end) {
  showModal('Ubah catatan haid', `<label>Haid dimulai<input id="period-date" type="date" value="${start}" max="${localToday()}" required></label><label>Haid selesai<input id="period-end" type="date" value="${end}" max="${localToday()}"></label><button type="button" onclick="updateCycle('${id}')">Simpan perubahan</button>`);
}
async function updateCycle(id) {
  try {
    const start_date = $('#period-date').value;
    const end_date = $('#period-end').value || null;
    if (end_date && end_date < start_date) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    await patch(`/api/cycles/${id}`, { start_date, end_date });
    closeModal();
    dashboard();
  } catch (e) {
    fail(e);
  }
}
async function deleteCycle(id) {
  if (!confirm('Hapus catatan haid ini?')) return;
  try {
    await request(`/api/cycles/${id}`, { method: 'DELETE' });
    dashboard();
  } catch (e) {
    alert(e.message);
  }
}

// ---- check-in
async function openCheckin() {
  let existing = null;
  try {
    existing = (await request('/api/today')).checkin;
  } catch {
    /* form tetap bisa dipakai */
  }
  const picked = new Map((existing?.symptoms || []).map((s) => [s.symptom_id, s.severity]));
  const moodOptions = reference.moods.map((m) => `<option value="${m.id}" ${existing?.mood_id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const symptomItems = reference.symptoms
    .map((s) => {
      const on = picked.has(s.id);
      return `<label class="symptom-item"><input type="checkbox" data-symptom="${s.id}" ${on ? 'checked' : ''}>${esc(s.name)}<select data-severity="${s.id}" title="Severity (1–5)">${[1, 2, 3, 4, 5].map((n) => `<option ${picked.get(s.id) === n || (!on && n === 2) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
    })
    .join('');
  showModal(
    'How are you feeling?',
    `<label>Mood<select id="mood"><option value="">Choose gently</option>${moodOptions}</select></label><label>Energy <input id="energy" type="range" min="1" max="5" value="${existing?.energy_score ?? 3}"></label><label>Stress <input id="stress" type="range" min="1" max="5" value="${existing?.stress_score ?? 3}"></label><label>Symptoms <small>Optional — pick what you notice, with severity 1–5</small></label><div class="symptom-grid">${symptomItems}</div><label>Notes<textarea id="notes" placeholder="Optional, private to you">${esc(existing?.notes)}</textarea></label><button type="button" onclick="saveCheckin()">Save check-in</button>`,
  );
}
async function saveCheckin() {
  try {
    const symptoms = [...document.querySelectorAll('[data-symptom]:checked')].map((box) => ({
      symptom_id: box.dataset.symptom,
      severity: Number(document.querySelector(`[data-severity="${box.dataset.symptom}"]`).value),
    }));
    await post('/api/checkins', {
      mood_id: $('#mood').value || null,
      energy_score: Number($('#energy').value),
      stress_score: Number($('#stress').value),
      notes: $('#notes').value || null,
      symptoms,
    });
    closeModal();
    dashboard();
  } catch (e) {
    fail(e);
  }
}

// ---- tidur / air / aktivitas
function openLog(type) {
  const opts = (o) => Object.entries(o).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  const fields = {
    sleep: '<label>Hours slept<input id="amount" type="number" min="0.5" max="24" step="0.5" required></label>',
    hydration: '<label>Water in ml<input id="amount" type="number" min="1" max="10000" required></label>',
    activity: `<label>Activity<select id="activity-type">${opts(ACTIVITY_TYPES)}</select></label><label>Intensity <small>Optional</small><select id="intensity"><option value="">—</option>${opts(INTENSITIES)}</select></label><label>Minutes<input id="amount" type="number" min="1" max="1440" required></label>`,
  };
  showModal(type[0].toUpperCase() + type.slice(1), `${fields[type]}<button type="button" onclick="saveLog('${type}')">Save log</button>`);
}
async function saveLog(type) {
  try {
    const amount = Number($('#amount').value);
    if (!amount) throw new Error('Please enter a value.');
    const body =
      type === 'sleep'
        ? { duration_minutes: Math.round(amount * 60) }
        : type === 'hydration'
          ? { amount_ml: Math.round(amount) }
          : { activity_type: $('#activity-type').value, duration_minutes: Math.round(amount), intensity: $('#intensity').value || null };
    await post(`/api/${type}`, body);
    closeModal();
    dashboard();
  } catch (e) {
    fail(e);
  }
}

// --------------------------------------------------------------- journal
async function loadJournal() {
  try {
    const entries = await request('/api/journal');
    $('#journal-list').innerHTML = entries.length
      ? entries
          .map((e) => `<article class="journal-entry"><header><strong>${esc(e.title || 'Untitled')}</strong><span><small>${fmtDate(e.entry_date)}</small> <button class="text danger" onclick="deleteJournal('${e.id}')">Delete</button></span></header><p>${esc(e.content)}</p></article>`)
          .join('')
      : '<p class="muted">No entries yet. This space is private to your account.</p>';
  } catch {
    /* panel journal boleh kosong bila gagal */
  }
}
async function saveJournal(e) {
  e.preventDefault();
  const form = e.target;
  try {
    await post('/api/journal', { title: $('#journal-title').value || null, content: $('#journal-body').value });
    form.reset();
    loadJournal();
  } catch (err) {
    alert(err.message);
  }
}
async function deleteJournal(id) {
  if (!confirm('Delete this private entry?')) return;
  try {
    await request(`/api/journal/${id}`, { method: 'DELETE' });
    loadJournal();
  } catch (e) {
    alert(e.message);
  }
}
const showPanel = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

Object.assign(window, {
  register, login, submitAuth, toggleAuth, openCheckin, openLog, openPeriod, saveCheckin, saveLog, savePeriod,
  editCycle, updateCycle, deleteCycle, closeModal, saveJournal, deleteJournal, showPanel, signOut,
});

if (token) request('/api/auth/me').then(dashboard).catch((e) => {
  if (e.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    token = undefined;
  }
});
