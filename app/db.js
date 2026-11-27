// W2 Looms · app/db.js — Database mode: sign-in by email, roles, the Access screen (Supabase).
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- Database mode (Supabase): sign in by email, roles, Access screen
// Switchover done (14 Nov 2026): email sign-in is the only view; the passcode view and the public sealed files are gone.
// Data: app_data (loom, costing) and loom_days;
// targets and head-group answers: the targets and assignments tables; who may sign in: app_users (view, edit targets, admin).
const SB_URL = 'https://peyxkraamjopjlydqcwt.supabase.co';
const SB_KEY = 'sb_publishable_tpS9HRGmgqnAzvhjrvAWkg_NYOdvDgz';   // the publishable key: safe in the page, every row is guarded by RLS
const SB_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4';   // the package's UMD build (dist/umd/supabase.js)
let SB = null, ME = null;   // the client, and {email, role, status} of the signed-in person (role null until approved)
const AUTH_HASH = location.hash || '';   // read before supabase-js or the router touch it: a failed email link lands with #error=...
const canEdit = () => !!(ME && (ME.role === 'edit' || ME.role === 'admin'));
// Plant view: every loom tab (read-only) and the Costing tab in the plant's own figures; no Data health, no Access (0005).
const isPlant = () => MODE === 'db' && !!ME && ME.role === 'plant';
const isAdmin = () => MODE === 'db' && !!ME && ME.role === 'admin';
// The email a code was last sent to, kept on this device for an hour, so switching to the mail app (or the page being
// reloaded meanwhile) comes back to the code box instead of the email box.
const OTP_KEY = 'w2-otp', OTP_TTL = 60 * 60e3;
function otpPending() {
  try { const o = JSON.parse(localStorage.getItem(OTP_KEY) || 'null'); if (o && o.email && Date.now() - o.at < OTP_TTL) return o.email; } catch (e) {}
  return '';
}
function otpSet(addr) { try { if (addr) localStorage.setItem(OTP_KEY, JSON.stringify({email: addr, at: Date.now()})); else localStorage.removeItem(OTP_KEY); } catch (e) {} }
async function sbClient() {
  if (SB) return SB;
  if (!window.supabase) await new Promise((res, rej) => { const t = el('script', {src: SB_LIB, onload: res, onerror: () => rej(new Error('Could not load the sign-in library. Check the connection and tap Refresh.'))}); document.head.append(t); });
  SB = window.supabase.createClient(SB_URL, SB_KEY, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  // Signed in elsewhere (the email's link opened in another tab, or the code typed there): this tab follows.
  SB.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && !ME && !loading && $('#main .gate')) setTimeout(() => load(), 0); });
  return SB;
}
const sbErr = (e) => (e && (e.message || e.error_description || e.msg)) || 'unknown error';
// A database error as a thrown Error that keeps its code, so saveFail can tell a refusal from a lost connection.
const sbFail = (e) => Object.assign(new Error(sbErr(e)), {code: e && e.code, status: e && e.status});
// Plain words for a failed save (Round G, 18 Nov 2026): what happened and what to do next, never the browser's own text
// ("TypeError: Failed to fetch"). A lost connection, an expired sign-in, a real refusal (no write access; a sentence the
// database wrote itself) and anything else each read differently. `did` = the verb ("save"), `again` = the button to press
// again ('' = just "try again"). Roles that cannot fix a refusal are told to tell the owner; an admin checks Access.
function saveFail(e, did = 'save', again = 'Save') {
  const m = String(e && (e.message || e.error_description || e.msg) || ''), code = String(e && e.code || '');
  const retry = again ? `press ${again} again` : 'try again';
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed|timed out|timeout|aborted/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false))
    return `Could not reach the database: check the connection and ${retry}.`;
  if (code === 'PGRST301' || /jwt|not signed in/i.test(m))
    return `Could not ${did}: your sign-in has expired. Tap the round-arrow icon (Refresh), sign in again, then ${retry}.`;
  const fix = isAdmin() ? 'Check its role on Access.' : 'Tell the owner.';
  if (code === '42501' && /row-level security|permission denied/i.test(m) || /row-level security|permission denied|no write access/i.test(m))
    return `Could not ${did}: this sign-in has no write access. ${fix}`;
  if (/^(P0001|42501)$/.test(code) && m) {   // a sentence the database wrote for people
    const t = m.replace(/^(STALE|JUMP|DATE): /, '');
    return `Could not ${did}: ${t}${/[.!?]$/.test(t) ? '' : '.'}${code === '42501' ? ' ' + fix : ''}`;
  }
  return `Could not ${did}: the database did not accept it. ${retry[0].toUpperCase() + retry.slice(1)}; if it repeats, ${isAdmin() ? 'see Data health.' : 'tell the owner.'}`;
}
// A sign-in link that failed (expired, already used, replaced by a newer code) comes back as #error=...&error_code=...
function takeAuthError() {
  if (!/(^|[#&])error(_code)?=/.test(AUTH_HASH)) return '';
  const p = new URLSearchParams(AUTH_HASH.replace(/^#/, ''));
  if (/error/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#actions');
  const why = (p.get('error_code') || '') + ' ' + (p.get('error_description') || '') + ' ' + (p.get('error') || '');
  return /expired|invalid|denied/i.test(why) ? 'That sign-in link has expired or was already used. Each new code replaces the one before. Ask for a new code below.'
    : 'Sign-in did not work: ' + (p.get('error_description') || p.get('error') || 'unknown error');
}
function setAccessBadge(n) { for (const b of document.querySelectorAll('[data-badge="access"]')) { b.hidden = !n; b.textContent = n ? String(n) : ''; } }
async function sbRows(table, build) {   // one query, rows or a thrown error
  const c = await sbClient();
  const {data, error} = await build(c.from(table));
  if (error) throw sbFail(error);
  return data || [];
}
async function whoAmI() {
  const c = await sbClient();
  const {data: {session}} = await c.auth.getSession();
  if (!session || !session.user || !session.user.email) return null;
  // Files a request the first time this email signs in (0003) and says where it stands: pending, approved (with a role) or rejected.
  let st;
  const {data, error} = await c.rpc('request_access');
  if (!error) st = data || {};
  else if (error.code === 'PGRST202' || /request_access/.test(sbErr(error))) {   // the database not migrated yet: the old list
    const rows = await sbRows('app_users', (q) => q.select('email, role').ilike('email', session.user.email));
    st = rows.length ? {status: 'approved', role: rows[0].role} : {status: 'pending', role: null};
  } else throw sbFail(error);
  ME = {email: session.user.email, status: st.status || 'pending', role: st.status === 'approved' ? st.role || null : null};
  if (ME.role) c.rpc('touch_last_seen').then(() => {}, () => {});
  if (ME.role) prefsLoad(c);
  if (ME.role === 'admin') sbRows('app_users', (q) => q.select('email').eq('status', 'pending')).then((r) => setAccessBadge(r.length), () => {});
  return ME;
}
// Per-person view choices (12 Nov 2026): kept against the signed-in email in the database (user_prefs, migration 0012, read
// and written only through my_prefs() / set_my_pref(), each person their own row), so a choice holds across reloads and on
// any device that email signs in from. A copy on this device (w2-pref|<email>) answers at once, before the database replies,
// and is all there is before the migration. A failed save keeps the device copy and says nothing.
let UPREF = null;
const prefKey = () => 'w2-pref|' + (MODE === 'db' && ME && ME.email ? String(ME.email).toLowerCase() : 'device');
function prefAll() {
  if (UPREF && UPREF.k === prefKey()) return UPREF.v;
  let v = {}; try { const x = JSON.parse(localStorage.getItem(prefKey()) || '{}'); if (x && typeof x === 'object' && !Array.isArray(x)) v = x; } catch (e) {}
  UPREF = {k: prefKey(), v}; return v;
}
const prefGet = (k) => prefAll()[k];
function prefSet(k, v) {
  const all = prefAll(); all[k] = v;
  try { localStorage.setItem(prefKey(), JSON.stringify(all)); } catch (e) {}
  if (MODE === 'db' && ME && ME.role) sbClient().then((c) => c.rpc('set_my_pref', {p_key: k, p_value: v})).then(() => {}, () => {});
}
async function prefsLoad(c) {
  try {
    const {data, error} = await c.rpc('my_prefs');
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) return;
    const all = prefAll(), before = JSON.stringify(all), b0 = all.basis;
    Object.assign(all, data);   // the database wins over this device's copy
    try { localStorage.setItem(prefKey(), JSON.stringify(all)); } catch (e) {}
    if (JSON.stringify(all) === before || !D) return;
    if (typeof gapSoon === 'function') gapSoon();   // folded sections follow the email (12 Nov 2026)
    if (typeof navPaint === 'function') navPaint();   // Favourites follow the email (Round E, 17 Nov 2026)
    if (typeof render === 'function' && (TAB === 'realisation' || all.basis !== b0)) render();   // Round B1: a saved Plant file choice draws once the prefs arrive
  } catch (e) {}
}
async function signOut() { otpSet(''); try { const c = await sbClient(); await c.auth.signOut(); } catch (e) {} ME = null; D = null; LATEST = null; COST = null; CCHK = null; location.hash = '#actions'; load(); }

function showSignIn(msg) {
  $('#asof').textContent = 'Signed out';
  $('.filters').hidden = true; { const wb = $('#wbar'); if (wb) wb.hidden = true; }
  const email = el('input', {type: 'email', id: 'email', autocomplete: 'email', placeholder: 'you@example.com', 'aria-label': 'Email', required: true});
  const go = el('button', {type: 'submit', text: 'Email me a code'});
  const form = el('form', {class: 'gate'}, el('img', {class: 'gate-logo', src: 'logo.svg', alt: 'Hanuman', width: '72', height: '72'}), el('h2', {text: 'Sign in to W2 Looms'}),
    el('p', {class: 'note', style: 'margin:0', text: 'Enter your email. You will get a one-time code (and a link) by email; no password. A new email can see the app once Divyam approves it.'}),
    email, msg ? el('p', {class: 'err', style: 'margin:0', text: msg}) : null, go);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const addr = email.value.trim().toLowerCase();
    if (!addr) return;
    go.disabled = true; go.textContent = 'Sending…';
    try {
      const c = await sbClient();
      const {error} = await c.auth.signInWithOtp({email: addr, options: {shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname}});
      if (error) throw error;
      otpSet(addr);
      showCode(addr);
    } catch (e) {
      const m = sbErr(e), st = e && e.status;
      showSignIn(st === 429 || /rate|limit/i.test(m) ? 'Too many sign-in emails in a short time. Wait a few minutes and try again.'
        : st === 504 || /deadline|time ?out|^\{\}$/i.test(m) ? 'The email server did not answer in time. Wait a minute and try again.'
        : 'Could not send the code: ' + m);
    }
  });
  $('#main').replaceChildren(form);
  email.focus();
}
function showCode(addr, msg) {
  const code = el('input', {type: 'text', id: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: '6-digit code', 'aria-label': 'Code', style: 'font-family:var(--f-mono);letter-spacing:.2em;text-align:center'});
  const go = el('button', {type: 'submit', text: 'Open'});
  const form = el('form', {class: 'gate'}, el('img', {class: 'gate-logo', src: 'logo.svg', alt: 'Hanuman', width: '72', height: '72'}), el('h2', {text: 'Check your email'}),
    el('p', {class: 'note', style: 'margin:0', text: `A code was sent to ${addr}. Type it here, or tap the link in the email on this device. It expires in an hour.`}),
    code, msg ? el('p', {class: 'err', style: 'margin:0', text: msg}) : null, go,
    el('button', {type: 'button', class: 'ghost', text: 'Use another email', onclick: () => { otpSet(''); showSignIn(); }}));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const t = code.value.replace(/\D/g, '');
    if (t.length < 6) return;
    go.disabled = true; go.textContent = 'Checking…';
    try {
      const c = await sbClient();
      const {error} = await c.auth.verifyOtp({email: addr, token: t, type: 'email'});
      if (error) throw error;
      otpSet('');
      load();
    } catch (e) { showCode(addr, /expired|invalid/i.test(sbErr(e)) ? 'That code did not work. Check it, or ask for a new one.' : 'Could not sign in: ' + sbErr(e)); }
  });
  $('#main').replaceChildren(form);
  code.focus();
}
// Signed in, but not approved: a pending request waits for the admin; a rejected one is told so. Neither can read any data (RLS).
function showNoAccess() {
  const rejected = ME.status === 'rejected';
  $('#asof').textContent = rejected ? 'No access' : 'Waiting for approval';
  $('.filters').hidden = true; { const wb = $('#wbar'); if (wb) wb.hidden = true; }
  $('#main').replaceChildren(el('div', {class: 'gate'}, el('img', {class: 'gate-logo', src: 'logo.svg', alt: 'Hanuman', width: '72', height: '72'}),
    el('h2', {text: rejected ? 'No access' : 'Waiting for approval'}),
    el('p', {class: 'note', style: 'margin:0', text: rejected
      ? `${ME.email} has not been given access to this app. Ask Divyam if this is a mistake.`
      : `${ME.email} is signed in. Your request has gone to Divyam; you can use the app as soon as he approves it.`}),
    rejected ? null : el('button', {type: 'button', text: 'Check again', onclick: () => load()}),
    el('button', {type: 'button', class: 'ghost', text: 'Sign out', onclick: signOut})));
}

// Targets and head-group answers in the database (db.collection(...).doc(id).set / delete). Each write reloads the saved state
// and redraws, except inside a Save all (STATE_HOLD > 0), which reloads once at the end.
let STATE_HOLD = 0;
async function holdState(fn) { STATE_HOLD += 1; try { return await fn(); } finally { STATE_HOLD -= 1; if (!STATE_HOLD) await loadState(); } }
const supaDb = {
  collection: (name) => ({
    doc: (id) => ({
      set: async (data) => {
        const c = await sbClient();
        const row = name === 'targets'
          ? {id, width: String(data.width || ''), hg: String(data.hg || ''), cfm: ok(data.cfm) ? data.cfm : null, rpm: ok(data.rpm) ? data.rpm : null, main: ok(data.main) ? data.main : null, at: data.at || new Date().toISOString(), updated_by: ME && ME.email}
          : {id, style: String(data.style || ''), head_group: String(data.head_group || ''), is_new: !!data.is_new, status: data.status || 'pending', at: data.at || new Date().toISOString(), updated_by: ME && ME.email};
        const {error} = await c.from(name).upsert(row, {onConflict: 'id'});
        if (error) throw sbFail(error);
        if (!STATE_HOLD) await loadState();
      },
      delete: async () => {
        const c = await sbClient();
        const {error} = await c.from(name).delete().eq('id', id);
        if (error) throw sbFail(error);
        if (!STATE_HOLD) await loadState();
      },
    }),
  }),
};
// Round V (0018): the compressor set point's history. A failed read leaves the history unknown (SP_HIST null: the set point
// falls back to the targets row and the Pressure tab says why), never stops the load.
async function loadSpHist() {
  try { const r = await sbRows('compsp_history', (q) => q.select('eff_from, kgf, set_by, set_at').order('eff_from'));
    SP_HIST = r.map((x) => ({from: String(x.eff_from).slice(0, 10), kgf: +x.kgf, by: x.set_by || '', at: x.set_at || ''})).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.from) && x.kgf > 0); SP_ERR = ''; }
  catch (e) { SP_HIST = null; SP_ERR = 'the set point history could not be read'; }
}
// Round V: save one set point change (edit targets and admin; the database stamps who and when)
async function saveSpHist(from, kgf) {
  const c = await sbClient();
  const {error} = await c.from('compsp_history').upsert({eff_from: from, kgf, set_by: ME && ME.email}, {onConflict: 'eff_from'});
  if (error) throw sbFail(error);
}
// Round A9 (0019): the production check's flag levels. A failed read keeps the seeded levels and says so on Data health.
async function loadChkSet() {
  try { const r = await sbRows('app_settings', (q) => q.select('key, num, set_by, set_at'));
    const g = (k) => r.find((x) => x.key === k);
    PCHK = {pct: g('prodchk_pct') ? +g('prodchk_pct').num : 2, m: g('prodchk_m') ? +g('prodchk_m').num : 100, by: (g('prodchk_pct') || {}).set_by || '', at: (g('prodchk_pct') || {}).set_at || '', err: ''}; }
  catch (e) { PCHK = {pct: 2, m: 100, by: '', at: '', err: 'the levels could not be read, so the first ones (2% and 100 m) are used'}; }
}
async function saveChkSet(pct, m) {   // admin only (0019); the database stamps who and when
  const c = await sbClient();
  for (const [key, num] of [['prodchk_pct', pct], ['prodchk_m', m]]) {
    const {error} = await c.from('app_settings').upsert({key, num, set_by: ME && ME.email}, {onConflict: 'key'});
    if (error) throw sbFail(error);
  }
}
// Round A9 (0019): loom overrides as the database holds them (a row added today shows before the next daily run applies it)
async function loadOvrRows() { return sbRows('loom_overrides', (q) => q.select('id, loom, eff_from, root, styles, note, set_by, set_at').order('loom').order('eff_from').order('id')); }
async function addOvrRow(o) {   // admin only; append-only: a wrong row is put right by a new one for the same day
  const c = await sbClient();
  const {error} = await c.from('loom_overrides').insert(Object.assign({}, o, {set_by: ME && ME.email}));
  if (error) throw sbFail(error);
}
async function loadStateDb() {
  const [tg, asg] = await Promise.all([sbRows('targets', (q) => q.select('id, width, hg, cfm, rpm, main, at')), sbRows('assignments', (q) => q.select('style, head_group, is_new, status, at').eq('status', 'pending')), loadSpHist(), loadChkSet()]);
  applyState({targets: tg.map((t) => ({id: t.id, width: String(t.width || ''), hg: String(t.hg || ''), cfm: t.cfm == null ? null : +t.cfm, rpm: t.rpm == null ? null : +t.rpm, main: t.main == null ? null : +t.main, at: t.at || ''})),
              assignments: asg});
}
async function loadDataDb() {
  // Plant view (0005): the loom data and the plant-view copy of the costing (the plant's own figures), never the full costing row.
  // The owner also asks for the Sheet checks (0015: the database returns that row to the owner only).
  const ck = isPlant() ? 'costing_plant' : 'costing', own = !isPlant() && typeof fxIsOwner === 'function' && fxIsOwner();
  const rows = await sbRows('app_data', (q) => q.select('key, data, generated_at').in('key', ['loom', ck].concat(own ? ['cost_checks'] : [])));
  const loom = rows.find((r) => r.key === 'loom'), cost = rows.find((r) => r.key === ck), chk = own ? rows.find((r) => r.key === 'cost_checks') : null;
  if (!loom) throw new Error('The database holds no loom data yet. The next daily run fills it.');
  COST = cost ? trimCost(cost.data) : null; COST_ERR = cost ? '' : 'The database holds no costing data yet.';
  CCHK = chk && chk.data && chk.data.days ? chk.data : null;
  return loom.data;
}
async function loadDayDb(d) {
  const rows = await sbRows('loom_days', (q) => q.select('data').eq('day', d));
  if (!rows.length) throw new Error('no snapshot');
  return rows[0].data;
}

// Access screen (admin only): requests waiting for approval, who may use the app and with which role, and rejected emails.
const ROLE_NAMES = {view: 'View', edit: 'Edit targets', admin: 'Admin', plant: 'Plant view'};
function pageAccess() {
  const s = el('section', {class: 'page', id: 'access'});
  s.append(el('div', {}, el('p', {class: 'lead', text: 'Anyone can sign in with a one-time code sent to their email, but a new email sees nothing until you approve it here with a role.'})));
  if (!ME || ME.role !== 'admin') { s.append(el('p', {class: 'note', text: 'Only an admin can see this screen.'})); return s; }
  const box = el('div', {class: 'loading', text: 'Loading…'});
  s.append(box);
  const when = (t) => t ? new Date(t).toLocaleString('en-IN', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'}) : '—';
  const roleSel = (label, cur, dis) => el('select', {'aria-label': label, disabled: dis ? true : null},
    ...Object.entries(ROLE_NAMES).map(([v, t]) => el('option', {value: v, text: t, selected: (cur || 'view') === v ? true : null})));
  const isMe = (u) => u.email.toLowerCase() === ME.email.toLowerCase();
  const save = async (email, patch, msg) => {
    msg.className = 'meta'; msg.textContent = 'Saving…';
    try { const c = await sbClient(); const {error} = await c.from('app_users').update(patch).eq('email', email); if (error) throw error; return true; }
    catch (e) { msg.className = 'err'; msg.textContent = saveFail(e, 'save', ''); return false; }
  };
  const draw = async () => {
    let users;
    try { users = await sbRows('app_users', (q) => q.select('email, role, status, invited_by, invited_at, requested_at, decided_at, last_seen').order('invited_at')); }
    catch (e) { box.replaceChildren(el('p', {class: 'err', text: 'Could not load the list: ' + sbErr(e)})); return; }
    const pending = users.filter((u) => u.status === 'pending'), rejected = users.filter((u) => u.status === 'rejected');
    const people = users.filter((u) => !u.status || u.status === 'approved');
    setAccessBadge(pending.length);

    const reqRows = pending.map((u) => {
      const sel = roleSel('Role for ' + u.email, 'view'), msg = el('span', {class: 'meta'});
      const ok = el('button', {type: 'button', class: 'primary', text: 'Approve', onclick: async () => { if (await save(u.email, {status: 'approved', role: sel.value}, msg)) draw(); }});
      const no = el('button', {type: 'button', class: 'ghost', text: 'Reject', onclick: async () => { if (await save(u.email, {status: 'rejected', role: null}, msg)) draw(); }});
      return el('div', {class: 'req', style: 'padding:10px 0;border-top:1px solid var(--line)'},
        el('div', {}, el('b', {text: u.email}), ' ', el('span', {class: 'meta', text: '· asked ' + when(u.requested_at || u.invited_at)})),
        el('div', {class: 'toolbar', style: 'margin-top:8px;flex-wrap:wrap'}, sel, ok, no, msg));
    });
    const peopleRows = people.map((u) => {
      const sel = roleSel('Role for ' + u.email, u.role, isMe(u)), msg = el('span', {class: 'meta'});
      sel.addEventListener('change', async () => { if (await save(u.email, {role: sel.value}, msg)) msg.textContent = 'Saved'; });
      const rm = el('button', {type: 'button', class: 'ghost', text: 'Remove', disabled: isMe(u) ? true : null, onclick: async () => {
        if (!confirm(`Remove ${u.email}? They lose access at once. If they sign in again, it comes back to you as a new request.`)) return;
        try { const c = await sbClient(); const {error} = await c.from('app_users').delete().eq('email', u.email); if (error) throw error; draw(); }
        catch (e) { msg.className = 'err'; msg.textContent = saveFail(e, 'remove', ''); }
      }});
      return [u.email, sel, when(u.decided_at || u.invited_at), when(u.last_seen), el('span', {}, rm, ' ', msg)];
    });
    const rejRows = rejected.map((u) => {
      const sel = roleSel('Role for ' + u.email, 'view'), msg = el('span', {class: 'meta'});
      const ok = el('button', {type: 'button', class: 'ghost', text: 'Approve after all', onclick: async () => { if (await save(u.email, {status: 'approved', role: sel.value}, msg)) draw(); }});
      return [u.email, when(u.decided_at), sel, el('span', {}, ok, ' ', msg)];
    });

    const email = el('input', {type: 'email', placeholder: 'name@example.com', 'aria-label': 'Email to add', autocomplete: 'off', style: 'min-width:240px;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--ink)'});
    const role = roleSel('Role', 'view');
    const add = el('button', {type: 'button', class: 'primary', text: 'Add'});
    const amsg = el('span', {class: 'meta'});
    add.addEventListener('click', async () => {
      const addr = email.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { amsg.className = 'err'; amsg.textContent = 'Enter a full email address.'; return; }
      add.disabled = true; amsg.className = 'meta'; amsg.textContent = 'Saving…';
      try { const c = await sbClient(); const {error} = await c.from('app_users').upsert({email: addr, role: role.value, status: 'approved', invited_by: ME.email}, {onConflict: 'email'}); if (error) throw error; email.value = ''; amsg.textContent = `${addr} can now sign in with the app link.`; draw(); }
      catch (e) { amsg.className = 'err'; amsg.textContent = saveFail(e, 'add', 'Add'); }
      add.disabled = false;
    });
    box.className = '';
    box.replaceChildren(...[
      card('Requests', pending.length ? `${pending.length} waiting · pick a role and approve, or reject` : 'No requests waiting. New emails that sign in appear here.',
        pending.length ? el('div', {}, reqRows) : null),
      card('People', `${people.length} ${people.length === 1 ? 'person' : 'people'} · Plant view: the Costing tab only, in the plant's own figures. View: read everything. Edit targets: also save targets, head-group answers and switches. Admin: also this screen.`,
        table(['Email', 'Role', 'Since', 'Last seen', ''], peopleRows)),
      rejected.length ? card('Rejected', `${rejected.length} · they can sign in but see nothing`, table(['Email', 'Rejected', 'Role', ''], rejRows)) : null,
      card('Add someone directly', 'Approved at once, no request needed. They open the same app link, enter this email and get a code.',
        el('div', {class: 'toolbar'}, email, role, add, amsg)),
      el('p', {class: 'note', text: 'Sign-in emails are sent from dsaharia00@gmail.com. Removing or rejecting someone stops their access at once.'})].filter(Boolean));
  };
  draw();
  return s;
}

// Fabric health screen (admin only, database mode only; fabric integration stage 1, migration 0006). What the last read of
// the fabric database app's sheet found for Weavelon 2: each fabric under the fabric app's on-screen name, with its flags.
// It reads only fabric_reads and fabric_check_requests; no figure anywhere in the app reads the holding copy.
let FABSHOW = 'flagged';
const FAB_BAD = new Set(['no_price', 'price', 'no_ppi', 'ppi', 'no_warp', 'no_weft', 'no_rate', 'unreadable', 'duplicate', 'line']);
function pageFabric() {
  const s = el('section', {class: 'page', id: 'fabric'});
  s.append(el('div', {}, el('p', {class: 'lead', text: "What the dashboard last read from the fabric database app for Weavelon 2. The read is view-only: nothing here changes the fabric app, and no figure in this app uses these values yet."})));
  if (!isAdmin()) { s.append(el('p', {class: 'note', text: 'Only an admin can see this screen.'})); return s; }
  const box = el('div', {class: 'loading', text: 'Loading…'});
  s.append(box);
  const when = (t) => t ? new Date(t).toLocaleString('en-IN', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'}) : '—';
  const ago = (t) => { if (!t) return ''; const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 60e3)); return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };
  const STATUS = {ok: ['good', 'Read'], unreachable: ['bad', 'Sheet not reached'], stopped: ['bad', 'Stopped'], skipped: ['muted', 'Skipped']};
  const pill = (st) => el('span', {class: 'pill ' + (STATUS[st] || ['muted'])[0], text: (STATUS[st] || [null, st])[1]});
  const draw = async () => {
    let reads, open, reps;
    try {
      [reads, open] = await Promise.all([
        sbRows('fabric_reads', (q) => q.select('id, started_at, finished_at, trigger, status, reason').order('started_at', {ascending: false}).limit(15)),
        sbRows('fabric_check_requests', (q) => q.select('id, asked_at, dispatched, done_at').is('done_at', null))]);
      reads.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)) || b.id - a.id);
      const lastOk = reads.find((r) => r.status === 'ok'), latest = reads.find((r) => r.status !== 'skipped');
      const ids = [...new Set([lastOk && lastOk.id, latest && latest.id].filter(Boolean))];
      reps = ids.length ? await sbRows('fabric_reads', (q) => q.select('id, report').in('id', ids)) : [];
    } catch (e) { box.className = ''; box.replaceChildren(el('p', {class: 'err', text: /fabric_|relation|schema cache/i.test(sbErr(e)) ? 'The database has no fabric tables yet: the 0006 migration has not been applied.' : 'Could not load the fabric reads: ' + sbErr(e)})); return; }
    const rep = (r) => (r && (reps.find((x) => x.id === r.id) || {}).report) || {};
    const lastOk = reads.find((r) => r.status === 'ok'), latest = reads.find((r) => r.status !== 'skipped');
    const R = rep(lastOk), L = latest && latest !== lastOk ? rep(latest) : R;
    const rows = R.health || [];
    const flagged = rows.filter((r) => r.flags && r.flags.length);

    // ---- last read, and Check now
    const msg = el('span', {class: 'meta'});
    const ask = async (fn, args) => {
      msg.className = 'meta'; msg.textContent = 'Asking…';
      try {
        const c = await sbClient(); const {data, error} = await c.rpc(fn, args); if (error) throw error;
        const d = data || {};
        msg.textContent = d.dispatched ? 'Read started. It takes about a minute; tap Refresh then.' : d.reused ? 'A read is already asked for. It runs with the next hourly run (10:40 to 16:40).' : 'Asked. It runs with the next hourly run (10:40 to 16:40); starting it at once needs the GitHub token in the database Vault.';
        setTimeout(draw, 1500);
      } catch (e) { msg.className = 'err'; msg.textContent = saveFail(e, 'ask', ''); }
    };
    const kp = el('div', {class: 'kpis'},
      el('div', {class: 'card kpi'}, el('div', {class: 'label', text: 'Last successful read'}), el('div', {class: 'val', style: 'font-size:20px', text: lastOk ? when(lastOk.started_at) : 'None yet'}), el('div', {class: 'note', text: lastOk ? ago(lastOk.started_at) : 'The first read runs with the next hourly run, or tap Check now.'})),
      el('div', {class: 'card kpi'}, el('div', {class: 'label', text: 'Latest read'}), el('div', {class: 'val', style: 'font-size:20px'}, latest ? pill(latest.status) : '—'), el('div', {class: 'note', text: latest ? when(latest.started_at) + ' · ' + latest.trigger : ''})),
      el('div', {class: 'card kpi'}, el('div', {class: 'label', text: 'Weavelon 2 fabrics'}), el('div', {class: 'val', text: lastOk ? String(rows.length) : '—'}), el('div', {class: 'note', text: R.unit ? `assigned to ${R.unit.name} in the fabric app` : ''})),
      el('div', {class: 'card kpi'}, el('div', {class: 'label', text: 'Flagged'}), el('div', {class: 'val', text: lastOk ? String(flagged.length) : '—'}), el('div', {class: 'note', text: lastOk ? `${rows.length - flagged.length} with no flags` : ''})));
    const btn = el('button', {type: 'button', class: 'primary', text: 'Check now', onclick: () => ask('fabric_check_now')});
    const waiting = open.length ? el('span', {class: 'note', text: `Asked ${when(open.sort((a, b) => String(a.asked_at).localeCompare(String(b.asked_at)))[0].asked_at)}; waiting for the read.`}) : null;
    const out = [kp, el('div', {class: 'toolbar', style: 'margin-top:12px'}, btn, waiting, msg)];

    if (latest && latest.status !== 'ok') {
      const items = [];
      if (latest.status === 'unreachable') items.push(el('p', {}, `The sheet could not be read at ${when(latest.started_at)}. The last good copy is kept.`, L.error ? el('span', {class: 'note', text: ' ' + String(L.error).slice(0, 200)}) : null));
      else items.push(el('p', {text: L.text || `The read at ${when(latest.started_at)} stopped (${latest.reason || 'no reason given'}). Nothing was written.`}));
      if (latest.reason === 'breaker' && (L.tripped || []).length) {
        items.push(table(['Fabric', 'What happened'], L.tripped.map((t) => [t.name, t.what === 'vanished' ? 'no longer in the read' : 'changed'])));
        const am = el('span', {class: 'meta'});
        items.push(el('div', {class: 'toolbar', style: 'margin-top:10px'},
          el('button', {type: 'button', class: 'primary', text: 'These changes are right: read them', onclick: async () => {
            if (!confirm(`Accept the ${L.tripped.length} fabrics listed and read again? A read with any other fabric changing still stops.`)) return;
            am.textContent = 'Asking…';
            try { const c = await sbClient(); const {error} = await c.rpc('fabric_accept_changes', {read_id: latest.id}); if (error) throw error; am.textContent = 'Accepted. The next read goes ahead.'; setTimeout(draw, 1500); }
            catch (e) { am.className = 'err'; am.textContent = saveFail(e, 'accept', ''); }
          }}), am));
      }
      out.push(card(latest.status === 'unreachable' ? 'The sheet was not reached' : 'The latest read stopped', lastOk ? `The screen below is the last good read, ${when(lastOk.started_at)}.` : null, ...items));
    }

    // ---- fabrics and flags
    if (lastOk) {
      const seg = el('div', {class: 'seg', role: 'group', 'aria-label': 'Fabrics shown'}, [['flagged', `Flagged (${flagged.length})`], ['all', `All (${rows.length})`]].map(([v, t]) =>
        el('button', {type: 'button', 'aria-pressed': FABSHOW === v ? 'true' : 'false', text: t, onclick: () => { FABSHOW = v; draw(); }})));
      const shown = FABSHOW === 'all' ? rows : flagged;
      const flagCell = (r) => r.flags && r.flags.length ? el('div', {style: 'display:flex;flex-wrap:wrap;gap:4px'}, r.flags.map((f) => el('span', {class: 'pill ' + (FAB_BAD.has(f.code) ? 'bad' : 'warn'), text: f.text, style: 'white-space:normal'}))) : el('span', {class: 'pill good', text: 'no flags'});
      out.push(card('Fabrics', 'Named as the fabric app shows them: quality name, reed space and (RFD). Flags in red would stop a fabric being valued; amber ones are worth a look.',
        el('div', {class: 'toolbar'}, seg),
        shown.length ? table(['Fabric', 'Flags'], shown.map((r) => [el('span', {}, el('b', {text: r.name}), el('div', {class: 'note', text: `${r.finish || 'finish blank'} · ${r.id}`})), flagCell(r)])) : el('div', {class: 'empty', text: FABSHOW === 'flagged' ? 'No Weavelon 2 fabric has a flag.' : 'No fabrics are assigned to Weavelon 2.'})));
      const probs = [];
      for (const [tab, cols] of Object.entries(R.new_columns || {})) probs.push(`${tab}: new column${cols.length > 1 ? 's' : ''} ${cols.join(', ')} (not read)`);
      for (const [tab, rs] of Object.entries(R.rows_without_id || {})) probs.push(`${tab}: row${rs.length > 1 ? 's' : ''} ${rs.join(', ')} have no id and were skipped`);
      for (const [tab, d] of Object.entries(R.duplicates || {})) for (const [id, rs] of Object.entries(d)) probs.push(`${tab}: rows ${rs.join(', ')} share the id ${id}; both are held`);
      for (const f of R.assigned_missing || []) probs.push(`Assignments: Weavelon 2 has fabric ${f}, which is not in the Fabrics tab`);
      const w = R.written || {};
      const moved = Object.entries(w).filter(([, n]) => n.new || n.changed || n.gone).map(([k, n]) => `${k}: ${[n.new && n.new + ' new', n.changed && n.changed + ' changed', n.gone && n.gone + ' gone'].filter(Boolean).join(', ')}`);
      out.push(card('About this read', `${when(lastOk.started_at)} · ${R.sheet_rows ? Object.entries(R.sheet_rows).map(([t, n]) => `${t} ${n}`).join(', ') + ' rows in the sheet' : ''}`,
        el('p', {class: 'note', text: moved.length ? 'Compared with the read before: ' + moved.join(' · ') + '. Changes are found by comparing values, not the fabric app’s change log.' : 'Nothing changed since the read before.'}),
        probs.length ? el('ul', {class: 'alerts'}, probs.map((p) => el('li', {}, el('span', {class: 'pill warn', text: 'sheet'}), el('span', {text: p})))) : el('div', {class: 'empty', text: 'No problems with the sheet itself.'})));
    }
    const WHY = {breaker: 'too many fabrics changed (stop switched off since 11 Nov 2026)', missing_columns: 'a column is missing', missing_tab: 'a tab is missing', duplicate_column: 'two columns share a name', unit: 'Weavelon 2 not confirmed', unreachable: 'sheet not reached'};
    const hist = reads.slice(0, 10).map((r) => [el('span', {}, when(r.started_at), el('div', {class: 'note', text: r.trigger === 'check-now' ? 'Check now' : r.trigger})), el('span', {}, pill(r.status), r.reason && r.status !== 'unreachable' ? el('div', {class: 'note', text: WHY[r.reason] || r.reason}) : null)]);
    if (hist.length) out.push(card('Recent reads', 'Reads run after each hourly run (10:40 to 16:40) and when you tap Check now.', table(['Started', 'Result'], hist)));
    box.className = '';
    box.replaceChildren(...out);
    if (typeof collapseTables === 'function') collapseTables(box);
  };
  draw();
  return s;
}

// ---------------------------------------------------------------- Reload data (17 Nov 2026, 0016)
// The edit targets and admin roles start the Daily run now (reload_request), instead of waiting for the next hourly run, so head
// groups and targets saved in the app apply at once. While a run is open the button is greyed out and the app asks every 30 s
// how it is going (reload_status); when it ends, the app fetches the new figures and a bar says so, once, to the person who
// pressed it (reload_seen), on this device or the next one they open. The run also sends a phone notice.
let RL = null, RL_T = null, RL_ERR = '';
const RL_SHOWN = new Set();
const rlOpen = (r) => !!r && (r.status === 'asked' || r.status === 'running');
const rlDay = (d) => d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata'});
const rlTime = (iso) => {   // "14:05 IST" today, "16 Nov, 14:05 IST" on another day
  if (!iso) return '—';
  const d = new Date(iso), t = d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'}) + ' IST';
  return rlDay(d) === rlDay(new Date()) ? t : `${rlDay(d)}, ${t}`;
};
const rlNext = (r) => r && r.asked_at ? new Date(new Date(r.asked_at).getTime() + 10 * 60e3) : null;
function rlState() {
  const r = RL, now = Date.now(), nx = rlNext(r);
  if (rlOpen(r) && r.status === 'asked' && !r.dispatched) return {busy: true, text: `Asked at ${rlTime(r.asked_at)}. ${r.note || 'The run could not be started from the app. Tell the owner; the next daily run reloads the data.'} The daily run runs every hour, 10:40 to 16:40 IST.`};
  if (rlOpen(r)) return {busy: true, text: `Reloading… since ${rlTime(r.asked_at)}${r.status === 'running' ? '' : ' (waiting for the run to start)'}. It takes about 5 to 10 minutes; you get a notice here when it finishes.`};
  if (r && nx && nx.getTime() > now) return {busy: true, text: `${r.status === 'failed' ? `The last reload did not finish: ${r.note || 'the run failed.'}` : `Data reloaded at ${rlTime(r.done_at)}.`} You can reload again from ${rlTime(nx.toISOString())}.`};
  if (r && r.status === 'failed') return {busy: false, text: `The last reload, at ${rlTime(r.asked_at)}, did not finish: ${r.note || 'the run failed'}`};
  if (r && r.status === 'finished') return {busy: false, text: `Last reloaded at ${rlTime(r.done_at)}: loom data to ${dfmt(r.loom_to)}, costing to ${dfmt(r.costing_to)}.`};
  return {busy: false, text: ''};
}
function rlPaint() {
  const st = rlState();
  for (const b of document.querySelectorAll('.rlbtn')) { b.disabled = st.busy || !canEdit(); b.textContent = rlOpen(RL) ? 'Reloading…' : 'Reload data'; }
  for (const m of document.querySelectorAll('.rlmsg')) { m.className = 'rlmsg ' + (RL_ERR ? 'err' : 'meta'); m.textContent = RL_ERR || st.text; }
}
function reloadBox() {
  if (!canEdit()) return null;
  const btn = el('button', {class: 'primary rlbtn', type: 'button', text: 'Reload data', onclick: rlPress});
  const box = el('div', {class: 'rlbox'}, el('div', {class: 'toolbar'}, btn, el('span', {class: 'rlmsg meta'})),
    el('p', {class: 'note', text: 'Reload data starts the daily run now (it otherwise runs every hour, 10:40 to 16:40 IST), so head groups you have saved apply at once. Only saved answers apply: press Save or Save all first.'}));
  setTimeout(rlPaint, 0);
  return box;
}
async function rlPress() {
  RL_ERR = '';
  for (const b of document.querySelectorAll('.rlbtn')) b.disabled = true;
  try {
    const c = await sbClient(); const {data, error} = await c.rpc('reload_request'); if (error) throw error;
    RL = data && data.id ? data : RL;
  } catch (e) { RL_ERR = saveFail(e, 'start the reload', 'Reload data'); }
  rlPaint(); rlWatch();
}
function rlWatch() { clearTimeout(RL_T); if (rlOpen(RL) || (RL && rlNext(RL) > Date.now())) RL_T = setTimeout(rlPoll, rlOpen(RL) ? 30e3 : Math.max(5e3, rlNext(RL) - Date.now() + 1e3)); }
async function rlPoll() {
  if (MODE !== 'db' || !canEdit()) return;
  const was = RL;
  try { const c = await sbClient(); const {data, error} = await c.rpc('reload_status'); if (error) throw error; RL = data && data.id ? data : null; } catch (e) { rlWatch(); return; }
  rlPaint(); rlWatch();
  if (RL && RL.mine && RL.done_at && !RL.seen_at && !RL_SHOWN.has(RL.id)) {
    RL_SHOWN.add(RL.id);
    if (RL.status === 'finished' && rlOpen(was) && D) await load(true);   // it finished while the app was open: show the new figures
    rlNotice(RL);
  }
}
function rlNotice(r) {
  if ($('#rlbar')) $('#rlbar').remove();
  const ok = r.status === 'finished';
  const bar = el('div', {class: 'swbar', id: 'rlbar', role: 'status'},
    el('span', {text: ok ? `Data reloaded at ${rlTime(r.done_at)}. Loom data now to ${dfmt(r.loom_to)}, costing to ${dfmt(r.costing_to)}. The app shows it.`
      : `Reload data did not finish: ${r.note || 'the run failed'}`}),
    el('button', {class: 'icon-btn swx', type: 'button', text: '×', 'aria-label': 'Close', title: 'Close', onclick: () => bar.remove()}));
  document.body.append(bar);
  sbClient().then((c) => c.rpc('reload_seen', {p_id: r.id})).then(() => { r.seen_at = new Date().toISOString(); }, () => {});
}
