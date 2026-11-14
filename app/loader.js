// W2 Looms · app/loader.js — The web app loader: data from the database after an email sign-in, date view, start-up.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- Web app loader
// Data, targets and head-group answers: the database (Supabase, app/db.js), after an email sign-in. The DB sync Action keeps
// targets and answers in step with the Config Sheet's App targets / App assignments tabs, which the daily run reads.
let lastLoad = 0, loading = false;
// Date view: LATEST is app_data loom; VIEW is the date shown ('' = latest).
// Older dates load that day's loom_days row: the app exactly as it stood on that day, benchmarks included.
let LATEST = null, VIEW = '';
const SNAP = new Map();

// Days between a date and today in IST. The latest complete loom day is normally yesterday (1).
const ageDays = (d) => Math.round((Date.parse(new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)) - Date.parse(d)) / 864e5);
function applyState(st) {
  if (st.targets) {
    TG = {}; SINGLE = new Set(); POWER_PCT = (D && D.power && ok(D.power.rule_pct)) ? D.power.rule_pct : 7;
    for (const v of st.targets) {
      if (!v || !v.width || !v.hg) continue;
      if (String(v.id || '').startsWith('power__')) { const n = Number(v.main); if (n >= 1 && n <= 30) POWER_PCT = n; }   // compressor energy saved per 1 kgf/cm²
      else if (String(v.id || '').startsWith('panna__')) SINGLE.add(v.hg);   // a 280 cm head group switched to single panna
      else TG[key(String(v.width), v.hg)] = v;
    }
    targetsLoaded = true; pannaLoaded = true;
    TG_RAW = Object.assign({}, TG); SINGLE_RAW = new Set(SINGLE);   // as saved; hgAliasSaved shows them by name, from these
    hgAliasSaved();
  }
  if (st.assignments) {
    assigned = {};
    for (const v of st.assignments) if (v && v.status === 'pending') assigned[v.style] = v;
  }
}
// Head groups named after their linked fabric (12 Nov 2026, pipeline/hg_names.py). D.hg_names lists, per width, a head group's
// Style-map name (root), its name now, and for head groups merged under one name (Divyam: merge, never hold) the primary and
// rank; D.hg_merged lists unlinked groups that joined one. Targets, the single-panna switch, the target mix and new style
// assignments are always saved under the primary's root (hgRootOf), so they follow the head group through later renames and
// undone links; they are shown under the name, taken from the primary, else the next member in rank, else a stray row saved
// under the shown name. STRAY keeps the ids of the other members' rows, so the next save or clear removes them.
let STRAY = {}, TG_RAW = null, SINGLE_RAW = null;
function hgGroups() {   // 'width|name' -> roots, primary first
  const g = {};
  const ns = ((D && D.hg_names) || []).filter((n) => n && n.root && n.name).slice().sort((a, b) => (a.rank || 0) - (b.rank || 0));
  for (const n of ns) { const k = String(n.width) + '|' + n.name; (g[k] = g[k] || []).push(n.root); }
  for (const n of ns) { const k = String(n.width) + '|' + n.name; if (n.primary && g[k].includes(n.primary)) g[k] = [n.primary, ...g[k].filter((r) => r !== n.primary)]; }
  for (const m of ((D && D.hg_merged) || [])) { const k = String(m.width) + '|' + (m.name || m.root); if (g[k] && !g[k].includes(m.root)) g[k].push(m.root); }
  return g;
}
const hgRenames = () => ((D && D.hg_names) || []).filter((n) => n && n.root && n.name && n.name !== n.root);
// the name a Style-map head group carries now on a width (an unlinked group that joined a linked one carries its name)
const hgNameOf = (w, root) => { const n = ((D && D.hg_names) || []).find((x) => String(x.width) === String(w) && x.root === root); if (n) return n.name; const m = ((D && D.hg_merged) || []).find((x) => String(x.width) === String(w) && x.root === root); return m ? (m.name || m.root) : root; };
const hgRootOf = (w, hg) => { const g = hgGroups()[String(w) + '|' + hg]; return g ? g[0] : hg; };
// A name picked for a style whose loom widths are known (or not): its primary root where that is the same on every such width.
const hgRootAny = (hg, widths) => { const G = hgGroups(); const ws = widths && widths.length ? widths : ['190', '280']; const r = new Set(ws.map((w) => (G[w + '|' + hg] || [hg])[0])); return r.size === 1 ? [...r][0] : hg; };
// A map saved by Style-map name on one width, as shown: each name takes its primary's value, else the next member's, else a
// stray value saved under the name itself. Returns [shown map, the saved keys that are no longer the primary's].
// Keys a shown name may be saved under on a width: its members' roots, primary first, then the name itself only when the name
// is no head group's own Style-map name there (so one group's row can never stand in for, or be deleted for, another's).
function hgKeys(w, name, G) {
  G = G || hgGroups(); w = String(w);
  const roots = G[w + '|' + name] || [name];
  const own = new Set(); for (const [k, rs] of Object.entries(G)) if (k.split('|')[0] === w) for (const r of rs) own.add(r);
  for (const n of ((D && D.hg_names) || [])) if (String(n.width) === w) own.add(n.root);
  return roots.includes(name) || own.has(name) ? roots.slice() : roots.concat([name]);
}
function hgCollapse(w, obj) {
  obj = obj || {};
  const G = hgGroups(), out = Object.assign({}, obj), stray = {}, has = (x) => Object.prototype.hasOwnProperty.call(obj, x), set = {};
  for (const k of Object.keys(G)) {   // first take every group's keys out, then put each value under its shown name
    const [gw, ...nm] = k.split('|'); const name = nm.join('|');
    if (gw !== String(w)) continue;
    const keys = hgKeys(w, name, G), hit = keys.find(has);
    for (const x of keys) delete out[x];
    if (hit !== undefined) set[name] = obj[hit];
    stray[name] = keys.filter((x) => x !== G[k][0] && has(x));
  }
  return [Object.assign(out, set), stray];
}
// Always from the saved rows (TG_RAW / SINGLE_RAW), never from an already shown copy, so it can run any number of times (a shown
// name may be another head group's Style-map name). Before the saved rows load, SINGLE is the published set, already by name.
function hgAliasSaved() {
  if (TG_RAW) {
    TG = {}; STRAY = {};
    for (const [k, v] of Object.entries(TG_RAW)) if (!['190|', '280|'].some((p) => k.startsWith(p))) TG[k] = v;
    for (const w of ['190', '280']) {
      const pre = w + '|', mine = {};
      for (const [k, v] of Object.entries(TG_RAW)) if (k.startsWith(pre)) mine[k.slice(pre.length)] = v;
      const [shown, stray] = hgCollapse(w, mine);
      for (const [h, v] of Object.entries(shown)) TG[key(w, h)] = Object.assign({}, v, {hg: h});
      for (const [h, ks] of Object.entries(stray)) STRAY[key(w, h)] = new Set(ks.map((x) => mine[x].id || tgtId(w, x)));
    }
  }
  if (SINGLE_RAW) {
    const sg = {}; for (const h of SINGLE_RAW) sg[h] = true;
    SINGLE = new Set(Object.keys(hgCollapse('280', sg)[0]));
  }
}
// every saved id a switch on a shown name may sit under (the primary's first)
const hgPannaIds = (w, hg) => hgKeys(w, hg).map((r) => pannaId(w, r));
async function loadState() {
  try {
    await loadStateDb();
  } catch (e) {
    targetsLoaded = true;
  }
  if (D) applyPanna(D);
  if (D && !busyEditing('.tg') && !busyEditing('.assign') && !busyEditing('#gsearch') && !busyEditing('.trsearch')) { render(); if (dlg && dlg.open) drawPanel(true); }
}

function fillDays() {
  const sel = $('#day');
  const days = ((LATEST && LATEST.snapshots) || []).slice().reverse();
  sel.replaceChildren(...days.map((d, i) => el('option', {value: i === 0 ? '' : d, text: i === 0 ? `Latest · ${dfmt(d)}` : dfmt(d), selected: (i === 0 ? '' : d) === VIEW ? true : null})));
  sel.hidden = days.length < 2;
}

function show(data) {
  D = data;
  $('.filters').hidden = false;
  if (!targetsLoaded && D.power && ok(D.power.rule_pct)) POWER_PCT = D.power.rule_pct;
  if (!pannaLoaded) SINGLE = new Set((D.panna && D.panna.single) || []);   // until the saved switches load
  hgAliasSaved();
  applyPanna(D);
  addErpm(D);
  BM.clear();
  for (const b of D.benchmarks || []) BM.set(key(b.width, b.hg), b);
  closePanel();
  const done = (D.days || []).filter((d) => d.status === 'complete').length;
  if (VIEW) {
    $('#asof').replaceChildren(el('span', {class: 'past', text: `Viewing ${dfmt(D.latest)}`}),
      ` as it stood that day · ${done} day${done === 1 ? '' : 's'} of history then`,
      el('button', {type: 'button', class: 'ghost', text: 'Back to latest', onclick: () => setView('')}));
  } else {
    $('#asof').replaceChildren('Latest complete day ', el('b', {text: dfmt(D.latest)}), ` · ${done} day${done === 1 ? '' : 's'} of history · updated ${D.generated_at} IST`);
    const age = D.latest ? ageDays(D.latest) : 0;
    if (age > 2) $('#asof').append(el('span', {class: 'err', text: ` · Latest loom day is ${age} days old: the plant's files may be missing or the daily run may have stopped.`}));
  }
  $('#sync1').textContent = VIEW ? `Viewing ${dfmt(D.latest)}` : `Latest ${dfmt(D.latest)}`;
  $('#sync2').textContent = LATEST && LATEST.generated_at ? `Updated ${String(LATEST.generated_at).slice(5)} IST` : '';
  fillDays();
  render();
}

async function setView(d) {
  VIEW = d || '';
  if (!VIEW) { if (LATEST) show(LATEST); return; }
  if (SNAP.has(VIEW)) { show(SNAP.get(VIEW)); return; }
  $('#main').replaceChildren(el('div', {class: 'loading', text: `Loading ${dfmt(VIEW)}…`}));
  try {
    const v = await loadDayDb(VIEW);
    SNAP.set(VIEW, v);
    if (VIEW === d) show(v);
  } catch (e) {
    VIEW = '';
    if (LATEST) show(LATEST);
    $('#main').prepend(el('p', {class: 'err', text: `Could not load ${dfmt(d)}. Showing the latest day instead.`}));
  }
}

// Sign in first, then the data, the targets and the answers come from Supabase.
async function load(quiet) {
  if (loading) return;
  loading = true;
  if (!quiet || !D) $('#main').replaceChildren(el('div', {class: 'loading', text: 'Loading…'}));
  try {
    const me = await whoAmI();
    if (!me) { loading = false; const why = takeAuthError(), sent = otpPending(); if (sent && !why) showCode(sent); else showSignIn(why); return; }
    if (!me.role) { loading = false; showNoAccess(); return; }
    LATEST = await loadDataDb();
  } catch (e) {
    loading = false;
    const msg = navigator.onLine === false ? 'No connection. The app reads its figures from the database, so it needs a connection: tap Refresh when you are back online.'
      : 'Could not load from the database: ' + sbErr(e) + ' Tap Refresh.';
    if (!D) $('#main').replaceChildren(el('div', {class: 'loading', text: msg}),
      el('p', {style: 'text-align:center'}, el('button', {class: 'ghost', type: 'button', text: 'Sign out', onclick: signOut})));
    return;
  }
  loading = false;
  lastLoad = Date.now();
  SNAP.clear();
  if (VIEW && !(LATEST.snapshots || []).includes(VIEW)) VIEW = '';
  if (VIEW === (LATEST.snapshots || []).slice(-1)[0]) VIEW = '';
  document.body.classList.toggle('plant', isPlant());
  document.body.classList.toggle('admin', isAdmin());
  if (isAdmin()) await fxAfterSignIn();   // fabric settings (the Realisation switch) and the Approvals badge
  if (!tabAllowed(TAB)) TAB = 'actions';
  if (isPlant() && TAB === 'data') TAB = 'actions';
  db = canEdit() ? supaDb : null;
  loadState();
  if (VIEW) setView(VIEW); else show(LATEST);
}
$('#day').addEventListener('change', (ev) => setView(ev.target.value));

// Data health page: who is signed in, and a way to sign out.
const basePageData = PAGES.data;
PAGES.data = () => {
  const s = basePageData();
  s.append(el('p', {}, el('span', {class: 'note', text: `Signed in as ${ME ? ME.email : '—'} (${ME && ME.role ? ROLE_NAMES[ME.role] : 'no role'}). `}),
    el('button', {class: 'ghost', type: 'button', text: 'Sign out', onclick: signOut})));
  return s;
};


// Offline copy of the app and its last data (sw.js); nothing changes when the browser has no service workers.
// New version prompt: every publish stamps a new BUILD into sw.js. The new worker installs in the background while this page
// still runs the old copy, then takes over (skipWaiting + claim). When that happens on a page that already had a worker,
// a bar offers a reload, so the new version shows at once instead of after one or two more reloads. Not on a first visit:
// that page is already the newest copy.
function showUpdateBar() {
  if ($('#swbar')) return;
  const bar = el('div', {class: 'swbar', id: 'swbar', role: 'status'},
    el('span', {text: 'A new version of the app is ready.'}),
    el('button', {class: 'primary', type: 'button', text: 'Reload', onclick: () => location.reload()}),
    el('button', {class: 'icon-btn swx', type: 'button', text: '×', 'aria-label': 'Not now', title: 'Not now', onclick: () => bar.remove()}));
  document.body.append(bar);
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker) showUpdateBar(); });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // the home-screen app can stay open for days: look for a new version when it comes back, and every 30 minutes
    const check = () => { reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60e3);
  }).catch(() => {});
}
$('#refresh').addEventListener('click', () => load(true));
$('#refresh-m').addEventListener('click', () => load(true));
// The home-screen app stays in memory on iPhone; refetch when it comes back after a while.
// Not while a sign-in or code screen is up: that would wipe what is being typed.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('#main .gate') && !VIEW && Date.now() - lastLoad > 15 * 60e3) load(true); });
load();
