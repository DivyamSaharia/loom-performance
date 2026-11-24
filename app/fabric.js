// W2 Looms · app/fabric.js — Fabric integration stages 2 to 4 (10 Nov 2026), database mode, admin only:
//   #masters      the reviewed first import, then the protected masters, the not-imported list and the switches
//   #links        style-to-fabric links: suggested from the 4-digit code and width, confirmed by the admin
//   #approvals    the inbox: pending, rejected and history; impact preview; undo
//   #realisation  sale value, realisation and profit (hidden until the owner switches it on)
// Every change goes through a database function of migration 0007, which checks the role and writes append-only rows. The
// arithmetic lives in fabric_calc.js. Rates are read from the database behind sign-in only, never from the public site.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';

const FX_OWNER = 'dsaharia00@gmail.com';
const FX_START = '2026-11-01';
const FX_COVER_MIN = 0.9;   // below this share of picks priced, a figure is greyed out with its reasons (case 40)
let FX = null, FXP = null;  // the loaded masters (one frozen copy per load: case 25), and its loading promise
let FXSHOW = 'pending', FXLINKS = 'unlinked', FXBASIS = FC_ASSOLD;
let FXAPP = [], FXBYK = 'lc', FXBY_ALL = false;   // Round Y: the By loom card opens on Profit (loom cost) on every load   // the days a money approval took effect; the By loom card's figure and length
// Product ranking (12 Nov 2026, second round): what it ranks (product / loom / head group) and the figure (profit or realisation
// per pick, or realisation per loom per day), and the By card's reference (running, benchmark, best, target). They are kept
// against the signed-in email (prefGet / prefSet in db.js), so they hold across reloads and devices.
const fxRk = () => ['profit', 'real', 'loomreal'].includes(prefGet('fx_rank_fig')) ? prefGet('fx_rank_fig') : 'profit';
const fxRkBy = () => ['loom', 'hg'].includes(prefGet('fx_rank_by')) ? prefGet('fx_rank_by') : 'hg';   // 12 Nov 2026: no Product option, a head group carries its fabric's name
const fxByRef = () => ['run', 'bm', 'best', 'tg'].includes(prefGet('fx_by_ref')) ? prefGet('fx_by_ref') : 'run';
const fxSet = {};           // fm_settings, by key, as last loaded
const fxWhen = (t) => t ? new Date(t).toLocaleString('en-IN', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'}) : '—';
const fxToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const fxIsOwner = () => isAdmin() && ME && String(ME.email || '').toLowerCase() === FX_OWNER;
const fxAnalysisOn = () => fxIsOwner() && fxSet.analysis_on === true;

// All rows of a table, 1,000 at a time (the database answers at most 1,000 rows per request).
async function sbAll(table, cols, order = 'id') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await sbRows(table, (q) => q.select(cols).order(order, {ascending: true}).range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
async function fxRpc(fn, args) {
  const c = await sbClient();
  const {data, error} = await c.rpc(fn, args);
  if (error) throw sbFail(error);
  return data;
}
async function fxSettings() {
  const rows = await sbRows('fm_settings', (q) => q.select('key, value, set_at'));
  for (const k of Object.keys(fxSet)) delete fxSet[k];
  for (const r of rows) { fxSet[r.key] = r.value; fxSet[r.key + '__at'] = r.set_at; }
  return fxSet;
}
// Sidebar badge: pending approvals (money and descriptive; "cannot read" notices are not counted).
function setApprovalsBadge(n) { for (const b of document.querySelectorAll('[data-badge="approvals"]')) { b.hidden = !n; b.textContent = n ? String(n) : ''; } }
async function fxBadge() {
  try {
    const r = await sbRows('fm_requests_now', (q) => q.select('id').eq('status', 'pending').neq('cls', 'info'));
    setApprovalsBadge(r.length);
  } catch (e) { setApprovalsBadge(0); }
}
// Realisation corrections (Round B, 17 Nov 2026; migration 0017): a day already announced in the hourly notification whose
// realisation or profit later moved by ₹500 or more (a back-dated approval, an undo, a head-group link, a costing re-read).
// The pipeline (realisation_notice.py) writes fm_corrections; the owner reads them here. The Realisation item carries a badge
// while one is unread; the Corrections card on Realisation lists them and marks them read (fm_corrections_seen).
let FXCOR = null, FXCOR_ERR = null;
const fxCorSeen = () => +(fxSet.corrections_seen || 0);
function setCorrectionsBadge(n) { for (const b of document.querySelectorAll('[data-badge="corrections"]')) { b.hidden = !n; b.textContent = n ? String(n) : ''; b.title = n ? `${n} corrected day${n === 1 ? '' : 's'} not read yet` : ''; } }
async function fxCorrLoad() {
  FXCOR = await sbRows('fm_corrections', (q) => q.select('id, created_at, days').order('id', {ascending: false}).limit(30));
  FXCOR_ERR = null;
  setCorrectionsBadge(FXCOR.filter((c) => c.id > fxCorSeen()).reduce((a, c) => a + (c.days || []).length, 0));   // one per corrected day, as the card's rows
  return FXCOR;
}
function fxCorrSeen() {
  const top = FXCOR && FXCOR.length ? FXCOR[0].id : 0;
  if (!top || top <= fxCorSeen()) return;
  fxRpc('fm_corrections_seen', {p_id: top}).then((v) => { fxSet.corrections_seen = v; setCorrectionsBadge(0); }, () => {});
}
function fxCorrectionsCard(cors) {
  const title = 'Corrections', what = 'Days already announced in the hourly notification whose realisation or profit (loom cost basis) later moved by ₹500 or more, As sold, as in the notification.';
  if (!cors) return card(title, what, el('p', {class: 'err', text: `Could not load the corrections${FXCOR_ERR ? ` (${FXCOR_ERR})` : ''}. Press the Refresh icon (the round arrow) to try again; if it keeps failing, the daily run's notification still carries every correction.`}));
  if (!cors.length) return card(title, what, el('p', {class: 'note', text: 'No corrections yet. Nothing to do: a day shows here, and in the hourly notification, if its figures move by ₹500 or more after it was announced (the last 31 days are checked every hour the daily run runs, 10:40 to 16:40 IST).'}));
  const seen = fxCorSeen(), arrow = (o, n, k) => `${fxMoney(o[k])} → ${fxMoney(n[k])}`;
  const arrowCell = (o, n, k) => el('span', {style: 'white-space:normal'}, el('span', {style: 'white-space:nowrap', text: `${fxMoney(o[k])} →`}), ' ', el('span', {style: 'white-space:nowrap', text: fxMoney(n[k])}));   // 18 Nov 2026: breaks after the arrow on a laptop
  const chg = (o, n, k) => ok(o[k]) && ok(n[k]) ? (n[k] - o[k] >= 0 ? '+' : '') + fxMoney(n[k] - o[k]) : '—';
  const days = cors.flatMap((c) => (c.days || []).map((d) => ({c, d, o: d.old || {}, n: d.new || {}, open: () => openDayAny(d.date)})));
  const tag = (x) => x.c.id > seen ? el('span', {class: 'pill warn', text: 'new', style: 'margin-left:6px'}) : null;
  const keys = (x) => ({tabindex: '0', title: 'Open this day', onclick: x.open, onkeydown: (e) => { if (e.key === 'Enter') x.open(); }});
  // On a phone (below 560 px) one block per day, so the day and the reason stay beside the figures with no sideways scroll.
  const body = window.matchMedia('(max-width: 560px)').matches
    ? el('div', {class: 'corrlist'}, days.map((x) => el('div', Object.assign({class: 'pick corr', style: 'padding:10px 0;border-top:1px solid var(--line, #ddd);cursor:pointer'}, keys(x)),
        el('div', {}, el('strong', {text: dfmt(x.d.date)}), tag(x), el('span', {class: 'note', text: ` · sent ${fxWhen(x.c.created_at)} IST`})),
        el('div', {class: 'note', text: (x.d.cause || []).join('; ')}),
        el('div', {text: `Realisation ${chg(x.o, x.n, 'real')} (told → now: ${arrow(x.o, x.n, 'real')})`}),
        el('div', {text: `Profit (loom cost) ${chg(x.o, x.n, 'profit_lc')} (told → now: ${arrow(x.o, x.n, 'profit_lc')})`}),
        el('div', {class: 'note', text: `Sale value, told → now: ${arrow(x.o, x.n, 'sale')}`}))))
    : table(['Day', 'Why', ['Realisation change', '₹'], ['Profit (loom cost) change', '₹'], ['Realisation', 'told → now'], ['Profit (loom cost)', 'told → now'], ['Sale value', 'told → now'], 'Sent'],
        days.map((x) => el('tr', Object.assign({class: 'pick corr'}, keys(x)), [el('span', {}, dfmt(x.d.date), tag(x)),
          el('span', {style: 'display:inline-block;min-width:160px', text: (x.d.cause || []).join('; ')}),
          chg(x.o, x.n, 'real'), chg(x.o, x.n, 'profit_lc'), arrowCell(x.o, x.n, 'real'), arrowCell(x.o, x.n, 'profit_lc'), arrowCell(x.o, x.n, 'sale'),
          (() => { const w = fxWhen(x.c.created_at), i = w.indexOf(', '); return i < 0 ? w + ' IST' : el('span', {}, el('span', {style: 'white-space:nowrap', text: w.slice(0, i + 1)}), ' ', el('span', {style: 'white-space:nowrap', text: w.slice(i + 2) + ' IST'})); })()].map((v, i) => el('td', {class: i >= 2 && i <= 6 ? 'num' : null}, v)))), [2, 3, 4, 5, 6]);
  return card(title, `${what} Last sent ${fxWhen(cors[0].created_at)} IST. Tap a day to open it.`, body,
    el('p', {class: 'note', text: '"new" marks a day not read yet; "—" is a figure that could not be worked out (nothing priced, no costing day, or for the loom cost basis no loom data), or a profit told before the loom cost method of 24 Nov 2026, never a zero; corrections sent before 23 Nov 2026 have no loom cost figure. The last 31 days are checked every hour the daily run runs (10:40 to 16:40 IST); the card keeps the last 30 corrections sent. The phone notice for a correction names the days only.'}));
}
// After sign-in (admin only): settings for the nav (the Realisation item shows only when switched on) and the badges.
async function fxAfterSignIn() {
  if (!isAdmin()) return;
  for (const a of document.querySelectorAll('.sb-fx')) if (!fxIsOwner()) a.hidden = true;   // the owner's screens (database: 0008)
  if (!fxIsOwner()) return;
  try { await fxSettings(); } catch (e) {}
  fxBadge();
  fxNavRealisation();
  if (fxAnalysisOn()) fxCorrLoad().catch(() => setCorrectionsBadge(0));
}
// The Realisation item (sidebar and More sheet) shows only once the analysis is switched on.
function fxNavRealisation() { for (const a of document.querySelectorAll('[data-tab="realisation"]')) a.hidden = !fxAnalysisOn(); if (typeof sbGroups === 'function') sbGroups(); }

// The masters, loom-days and the version stamp, loaded together.
async function fxLoad(force) {
  if (FX && !force) return FX;
  if (FXP && !force) return FXP;
  FXP = (async () => {
    const [fv, sr, yv, yr, sl, ld, hist, imp] = await Promise.all([
      sbAll('fm_fabric_versions', 'id, fabric_uid, field, value, eff_from, mode, void_of, request_id, created_at, created_by'),
      sbAll('fm_sale_rates', 'id, fabric_uid, field, value, eff_from, mode, void_of, request_id, created_at, created_by'),
      sbAll('fm_yarn_versions', 'id, yarn_uid, field, value, eff_from, mode, void_of, request_id, created_at, created_by'),
      sbAll('fm_yarn_rates', 'id, yarn_uid, rate, eff_from, src_date, mode, void_of, request_id, created_at, created_by'),
      sbAll('fm_style_links', 'id, style, width, greige_uid, rfd_uid, eff_from, mode, void_of, note, created_at, created_by'),
      sbAll('fab_loomdays', 'day, loom, hg, hg0, width, panna, picks, fpicks, styles', 'day'),
      sbRows('fm_history', (q) => q.select('id, at').order('id', {ascending: false}).limit(1)),
      sbRows('fm_imports', (q) => q.select('id, start_date, accepted_at, accepted_by').order('id').limit(1))]);
    const M = fcMasters({fabric_versions: fv, sale_rates: sr, yarn_versions: yv, yarn_rates: yr, style_links: sl, version: hist[0] || null});
    // fabric picks from machine picks and the app's own panna switch now, the same rule as every loom tab (case 39)
    // the name each loom-day carries now, from its Style-map name (rows outside the page's 60 days keep the name they were written with)
    const now = (x) => { const r = x.hg0 || x.hg; return !r || r === 'Unassigned' ? x.hg : hgNameOf(x.width, r); };
    for (const x of ld) { x.hg0 = x.hg0 || x.hg; x.hg = now(x); }
    const loomdays = ld.map((x) => ({date: String(x.day).slice(0, 10), loom: x.loom, hg: x.hg, hg0: x.hg0, width: String(x.width), panna: pf(x.width, x.hg), picks: +x.picks,
                                     fpicks: (+x.picks || 0) * pf(x.width, x.hg), styles: x.styles || []}));
    const srcOf = {}, fabOf = {}, yarnOf = {};
    for (const uid of Object.keys(M.fab)) { const s = fcVal(M.fab[uid], '_src', '9999-12-31'); if (s) { srcOf[uid] = s; fabOf[s] = +uid; } }
    for (const uid of Object.keys(M.yarn)) { const s = fcVal(M.yarn[uid], '_src', '9999-12-31'); if (s) yarnOf[s] = +uid; }
    FX = {M, loomdays, fabOf, srcOf, yarnOf, imp: imp[0] || null, at: Date.now()};
    FXP = null;
    return FX;
  })();
  try { return await FXP; } catch (e) { FXP = null; throw e; }
}
// The corrected costing (POWER units corrected), its folded cost per pick (Divyam, 10 Nov 2026), not the plant's as entered.
// Round Y (Divyam, 23 Nov 2026): the looms that ran each day for the loom cost basis, from the loom data (run minutes > 0, the
// same count as Break-even, both widths); a day the loom data holds with no loom running is [], a day it does not hold is absent.
let FXRUN = null;
function fxRunning() {
  if (FXRUN && FXRUN.D === D) return FXRUN.r;
  const r = {};
  // Round A3: each loom's air in the day (CFM × run minutes, ft³; null with no CFM reading) for the compressor by air, and its
  // picks (fabric picks ÷ 39.37) for a loom with no fabric record
  for (const x of (D && D.loomdays) || []) { if (!r[x.date]) r[x.date] = []; if (x.run > 0) r[x.date].push({loom: x.loom, width: String(x.width), hg: x.hg, hg0: x.hg0, air: ok(x.cfm) && x.cfm > 0 ? x.cfm * x.run : null, picks: ok(x.fpicks) ? x.fpicks / FC_PICKS_PER_INCH : 0}); }
  FXRUN = {D, r}; return r;
}
// Round A3: the compressor's rupees on each day that has a reading (power.json, incl. the 5-19 Nov meter readings), never borrowed
const fxComp = () => { const P = (D && D.power && D.power.days) || {}, o = {}; for (const [d, p] of Object.entries(P)) if (p && ok(p.rupees)) o[d] = p.rupees; return o; };
const fxInput = () => ({M: FX.M, loomdays: FX.loomdays, costing: (COST && COST.days) || [], reg: (COST && COST.bq && COST.bq.reg) || [], running: fxRunning(), comp: fxComp()});
const fxName = (uid) => uid == null ? '—' : fcFabricName(FX.M, uid);
const fxYarnName = (uid) => { const Y = FX.M.yarn[uid]; return Y ? (fcVal(Y, 'name', '9999-12-31') || 'Yarn ' + uid) : 'Yarn ' + uid; };
const fxMoney = (x) => !ok(x) ? '—' : (x < 0 ? '−₹' : '₹') + Math.round(Math.abs(x)).toLocaleString('en-IN');
const fxPaise = (x) => !ok(x) ? '—' : x.toFixed(2);
const fxShow = (v) => v == null || v === '' ? 'blank' : Array.isArray(v) ? v.map((l) => `${l.side} ${l.yarn_src || l.yarn}${l.ends ? ' × ' + l.ends : ''}${l.parts ? ' (' + l.parts + ' parts)' : ''}`).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
const fxLoading = () => el('div', {class: 'loading', text: 'Loading…'});
const fxErr = (box, e) => { box.className = ''; box.replaceChildren(el('p', {class: 'err', text: /fm_|relation|schema cache/i.test(sbErr(e)) ? 'The database has no fabric masters yet: the 0007 migration has not been applied.' : 'Could not load: ' + sbErr(e)})); };
function fxPage(id, lead, h2) {
  const s = el('section', {class: 'page', id});
  s.append(el('div', {}, h2 ? el('h2', {text: h2}) : null, lead ? el('p', {class: 'lead', text: lead}) : null));
  if (!fxIsOwner()) { s.append(el('p', {class: 'note', text: 'Only Divyam can see this screen.'})); return [s, null]; }
  const box = fxLoading(); s.append(box);
  return [s, box];
}
const fxDateIn = (v, label) => el('input', {type: 'date', value: v || '', 'aria-label': label, style: 'font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--ink)'});

// ================================================================ #masters: the first import, then the masters
function pageMasters() {
  const [s, box] = fxPage('masters', 'The dashboard keeps its own copy of the Weavelon 2 fabrics, yarns and rates. Nothing is ever overwritten: each change is a new dated entry, and only your approval adds one.');
  if (!box) return s;
  (async () => {
    try {
      await fxSettings();
      const imp = await sbRows('fm_imports', (q) => q.select('id, start_date, accepted_at, accepted_by').limit(1));
      if (!imp.length) return drawImport(box);
      await fxLoad(true);
      return drawMasters(box);
    } catch (e) { fxErr(box, e); }
  })();
  return s;
}

async function drawImport(box) {
  const ps = await sbRows('fm_import_proposals', (q) => q.select('id, created_at, fp, proposal').order('id', {ascending: false}).limit(1));
  box.className = 'fxpage';   // 18 Nov 2026: cards keep the page's 16 px gap
  if (!ps.length) { box.replaceChildren(card('First import', 'Waiting for the first read', el('p', {class: 'note', text: 'The proposal is built after the next read of the fabric sheet (hourly from 10:40, or Check now on Fabric health).'}))); return; }
  const P = ps[0], p = P.proposal, keep = new Map();
  const names = new Map(p.yarns.map((y) => [y.src_id, y.fields.name || y.src_id]));
  const msg = el('span', {class: 'meta'});
  const rows = p.fabrics.map((f) => {
    const cb = el('input', {type: 'checkbox', 'aria-label': 'Import ' + f.shown, checked: !f.suggest_skip ? true : null, disabled: f.blocked ? true : null});
    keep.set(f.src_id, cb);
    const fl = (f.flags || []).map((x) => el('span', {class: 'pill ' + (FAB_BAD.has(x.code) ? 'bad' : 'warn'), text: x.text, style: 'white-space:normal'}));
    const lines = (f.lines || []).map((l) => `${l.side}: ${names.get(l.yarn) || l.yarn}${l.ends ? ' × ' + l.ends : ''}`).join(' · ');
    return [cb, el('span', {}, el('b', {text: f.shown}), el('div', {class: 'note', text: `${f.fields.finish || 'finish blank'} · ${f.src_id}${f.blocked ? ' · cannot be imported yet: ' + f.state : ''}`})),
      ok(f.sale.price) ? '₹' + f.sale.price : 'blank', f.fields.ppi ?? '—', f.fields.reed_space_in ?? '—', el('span', {class: 'note', text: lines || 'no lines'}),
      fl.length ? el('div', {style: 'display:flex;flex-wrap:wrap;gap:4px'}, fl) : el('span', {class: 'pill good', text: 'no flags'})];
  });
  const yrows = p.yarns.map((y) => [el('b', {text: y.fields.name || y.src_id}), y.fields.kind === 'tpm' ? `TPM on ${names.get(y.fields.base_yarn_id) || y.fields.base_yarn_id}, extra ${y.fields.tpm_delta ?? '50 (blank)'}` : 'base',
    `${y.fields.count ?? '—'} ${y.fields.count_unit || ''}`, y.fields.kind === 'tpm' ? el('span', {class: 'note', text: 'base rate + extra'}) : (y.rates || []).map((r) => `₹${r.rate} from ${dfmt(r.date)}`).join(' · ') || '—',
    y.rate_note ? el('span', {class: 'pill warn', text: y.rate_note, style: 'white-space:normal'}) : '']);
  const go = el('button', {type: 'button', class: 'primary', text: 'Accept the import', onclick: async () => {
    const skip = [...keep].filter(([, cb]) => !cb.checked).map(([id]) => id);
    const n = p.fabrics.length - skip.length;
    if (!confirm(`Write ${n} fabrics and their yarns into the masters as version 1, with first rates from ${dfmt(p.start)}? ${skip.length} go to the not-imported list.`)) return;
    go.disabled = true; msg.className = 'meta'; msg.textContent = 'Writing…';
    try { const r = await fxRpc('fm_accept_import', {p_proposal: P.id, p_fp: P.fp, p_skip: skip}); msg.textContent = `Done: ${r.fabrics} fabrics, ${r.yarns} yarns, ${r.rates} rates. Requests start with the next reads; Head-group links is open now.`; FX = null; setTimeout(() => render(), 1200); }
    catch (e) { go.disabled = false; msg.className = 'err'; msg.textContent = saveFail(e, 'write the import', 'Accept the import'); }
  }});
  box.replaceChildren(
    card('First import', `Proposed from the read at ${fxWhen(P.created_at)} · first rates from ${dfmt(p.start)}`,
      el('p', {class: 'note', text: 'Untick any fabric to leave it out; it waits in a not-imported list and can be brought in later. Samples and tests start unticked. Records that cannot be read or are incomplete cannot be ticked until the fabric app is fixed. Nothing is written until you accept, and a newer read that changes anything replaces this proposal.'}),
      table(['Import', 'Fabric', 'Price', 'PPI', 'Reed space', 'Yarn lines', 'Flags'], rows)),
    card('Yarns these fabrics use', `${p.yarns.length} · a TPM yarn is priced as its base yarn's rate plus its extra, as the fabric app does`, table(['Yarn', 'Kind', 'Count', 'Rates', ''], yrows)),
    el('div', {class: 'toolbar'}, go, msg));
  collapseTables(box);
}

async function drawMasters(box) {
  const M = FX.M, today = fxToday();
  const [bl, pend, hist, held] = await Promise.all([
    sbAll('fm_baselines', 'id, key, value'),
    sbRows('fm_requests_now', (q) => q.select('id').eq('status', 'pending').neq('cls', 'info')),
    sbRows('fm_history', (q) => q.select('id, at, by, action, entity, uid, field, old, new, eff_from, mode, detail').order('id', {ascending: false}).limit(40)),
    sbRows('fabric_hold', (q) => q.select('id, raw').eq('kind', 'fabric'))]);
  setApprovalsBadge(pend.length);
  const presence = new Map();
  for (const b of bl) if (/^f\|.*\|presence$/.test(b.key)) presence.set(b.key.split('|')[1], b.value);
  const rawOf = new Map(held.map((h) => [h.id, h.raw]));
  const skipped = [...presence].filter(([, v]) => v === 'skipped').map(([s]) => s);
  const uids = Object.keys(M.fab).map(Number).filter((u) => FX.srcOf[u] || fcVal(M.fab[u], 'status', today) === 'active');
  const frows = uids.sort((a, b) => fxName(a).localeCompare(fxName(b))).map((u) => {
    const f = fcFabricAt(M, u, today), pm = f ? fcPerMetre(M, f, today) : null;
    const st = fcVal(M.fab[u], 'status', today);
    return [el('span', {}, el('b', {text: fxName(u)}), el('div', {class: 'note', text: `${f.finish || '—'} · ${FX.srcOf[u] || 'no longer fed by the fabric app'}${st === 'retired' ? ' · retired' : ''}`})),
      ok(f.price) ? '₹' + f.price : 'blank', f.ppi ?? '—', f.reed_space_in ?? '—', pm && ok(pm.rm) ? '₹' + pm.rm.toFixed(2) : el('span', {class: 'pill warn', text: pm ? pm.missing.join(', ') : '—'}),
      pm && ok(pm.real) ? '₹' + pm.real.toFixed(2) : '—'];
  });
  const yrows = Object.keys(M.yarn).map(Number).map((y) => {
    const r = fcYarnRate(M, y, today), Y = M.yarn[y];
    return [el('b', {text: fxYarnName(y)}), fcVal(Y, 'kind', today) === 'tpm' ? `TPM on ${fxYarnName(fcVal(Y, 'base_yarn_id', today))}` : 'base',
      `${fcVal(Y, 'count', today) ?? '—'} ${fcVal(Y, 'count_unit', today) || ''}`, r ? '₹' + r.rate + (r.extra ? ` (base ${r.base} + ${r.extra})` : '') : el('span', {class: 'pill warn', text: 'no rate in force'})];
  });
  const brows = skipped.map((sid) => {
    const raw = rawOf.get(sid) || {}, m = el('span', {class: 'meta'});
    return [el('b', {text: raw.name ? fxRawName(raw) : sid}), el('span', {class: 'note', text: sid}), el('span', {}, el('button', {type: 'button', class: 'ghost', text: 'Bring in', onclick: async () => {
      try { await fxRpc('fm_bring_in', {p_src: sid}); m.textContent = 'It comes back as a new-fabric request after the next two reads.'; } catch (e) { m.className = 'err'; m.textContent = saveFail(e, 'bring it in', ''); } }}), ' ', m)];
  });
  const hrows = hist.map((h) => [fxWhen(h.at), h.action, el('span', {class: 'note', text: [h.field, h.old != null ? fxShow(h.old) + ' →' : '', h.new != null ? fxShow(h.new) : ''].filter(Boolean).join(' ').slice(0, 160)}), h.eff_from ? dfmt(h.eff_from) + (h.mode && h.mode !== 'new' ? ' · ' + h.mode : '') : '', h.by]);
  // ---- switches
  const sm = el('span', {class: 'meta'});
  const paused = fxSet.sync_paused === true;
  const pause = el('button', {type: 'button', class: paused ? 'primary' : 'ghost', text: paused ? 'Resume the sync' : 'Pause the sync', onclick: async () => {
    try { await fxRpc('fm_pause', {p_on: !paused}); render(); } catch (e) { sm.className = 'err'; sm.textContent = saveFail(e, 'change the sync', ''); } }});
  const reviewed = fxSet.analysis_review && fxSet.analysis_review.passed === true;
  const am = el('span', {class: 'meta'});
  const on = fxSet.analysis_on === true;
  const sw = fxIsOwner() ? el('button', {type: 'button', class: on ? 'ghost' : 'primary', text: on ? 'Switch the analysis off' : 'Switch the analysis on', onclick: async () => {
    try { await fxRpc('fm_set_analysis', {p_on: !on}); await fxSettings(); fxNavRealisation(); render(); } catch (e) { am.className = 'err'; am.textContent = saveFail(e, 'switch the analysis', ''); } }}) : el('span', {class: 'note', text: 'Only Divyam can switch it on.'});
  box.className = 'fxpage';   // 18 Nov 2026: cards keep the page's 16 px gap
  box.replaceChildren(
    el('div', {class: 'kpis'},
      el('div', {class: 'card kpi'}, el('div', {class: 'label', text: 'Fabrics'}), el('div', {class: 'val', text: String(frows.length)}), el('div', {class: 'note', text: `first import ${FX.imp ? dfmt(String(FX.imp.accepted_at).slice(0, 10)) : '—'}`})),
      el('div', {class: 'card kpi'}, el('div', {class: 'label', text: 'Yarns'}), el('div', {class: 'val', text: String(yrows.length)})),
      el('div', {class: 'card kpi'}, el('div', {class: 'label', text: 'Waiting for approval'}), el('div', {class: 'val'}, el('a', {href: '#approvals', text: String(pend.length)}))),
      el('div', {class: 'card kpi'}, el('div', {class: 'label', text: 'Masters version'}), el('div', {class: 'val', style: 'font-size:18px', text: M.version ? fxWhen(M.version.at) : '—'}), el('div', {class: 'note', text: 'the last change of any kind'}))),
    card('Fabrics', `As they stand today. Yarn cost is the standard cost from the approved yarn rates, lines and shortage, not what was consumed (case 42).`,
      table(['Fabric', 'Price', 'PPI', 'Reed space', ['Yarn cost', '₹/greige m'], ['Realisation', '₹/greige m']], frows)),
    card('Yarns', 'Rates in force today', table(['Yarn', 'Kind', 'Count', ['Rate', '₹/kg']], yrows)),
    card('Not imported', skipped.length ? `${skipped.length} · skipped at import or as a new fabric` : 'Nothing skipped', skipped.length ? table(['Fabric', 'Id', ''], brows) : null),
    card('Switches', null,
      el('p', {class: 'note', text: paused ? `The sync is paused (since ${fxWhen(fxSet.sync_paused__at)}): no reads and no new requests. The masters stay exactly as they are.` : 'The sync reads the fabric app after each hourly run. Pausing it stops the reads and the requests; the masters stay exactly as they are.'}),
      el('div', {class: 'toolbar'}, pause, sm),
      el('p', {class: 'note', text: `Realisation analysis: ${on ? 'on' : 'hidden'}. You can switch it on once the first import is accepted and the independent review is recorded${reviewed ? ' (recorded)' : ' (not yet recorded)'}. Figures stay greyed out until 90% of the picks are linked and priced. Only you see it; plant view never does.`}),
      el('div', {class: 'toolbar'}, sw, am)),
    card('History', 'The latest 40 changes; nothing in the masters is ever erased', table(['When', 'What', 'Detail', 'From', 'By'], hrows)));
  collapseTables(box);
}
// The fabric app's on-screen name from a held row (name + reed space rounded + " (RFD)"), for records not in the masters.
const fxRawName = (raw) => `${raw.name || ''}${ok(+raw.reed_space_in) && raw.reed_space_in !== '' ? ' ' + Math.floor(+raw.reed_space_in + 0.5) : ''}${raw.finish === 'RFD' ? ' (RFD)' : ''}`.trim();

// ================================================================ #links: style-to-fabric links
function pageLinks() {
  const [s, box] = fxPage('links', 'Each loom head group (the quality, as you grouped the looms’ style names) needs a fabric from the fabric app before its picks can be valued; one link covers every style name in the group. Suggestions come from the 4-digit codes in those names and the loom width; nothing links until you confirm it, and a name alone never suggests anything. A linked head group takes the fabric’s name as the fabric app shows it (the greige record’s, else the RFD record’s without “(RFD)”) across the app from the next hourly run, with its loom width beside it.');
  if (!box) return s;
  (async () => {
    try {
      const imp = await sbRows('fm_imports', (q) => q.select('id').limit(1));
      if (!imp.length) { box.className = ''; box.replaceChildren(el('p', {class: 'note', text: 'Links can be confirmed once the first import is accepted on Fabric masters.'})); return; }
      await fxLoad(true);
      const sug = await sbRows('fm_link_suggestions', (q) => q.select('id, created_at, rows').order('id', {ascending: false}).limit(1));
      drawLinks(box, sug[0] || {rows: []});
    } catch (e) { fxErr(box, e); }
  })();
  return s;
}
function drawLinks(box, sug) {
  const M = FX.M, today = fxToday();
  const all = Object.keys(M.fab).map(Number).filter((u) => FX.srcOf[u] && fcVal(M.fab[u], 'status', today) !== 'retired');
  const greigeAll = all.filter((u) => fcVal(M.fab[u], 'finish', today) !== 'RFD').sort((a, b) => fxName(a).localeCompare(fxName(b)));
  const rfdAll = all.filter((u) => fcVal(M.fab[u], 'finish', today) === 'RFD').sort((a, b) => fxName(a).localeCompare(fxName(b)));
  const rows = (sug.rows || []).map((r) => Object.assign({}, r, {cur: fcInForce(M.links[r.style + '|' + r.width], '9999-12-31')}));
  const unlinked = rows.filter((r) => !r.cur);
  const shown = FXLINKS === 'all' ? rows : unlinked;
  const sel = (label, cands, pick, pool, curv) => {
    const s = el('select', {'aria-label': label, style: 'max-width:260px'});
    s.append(el('option', {value: '', text: '— none —'}));
    if (cands.length) s.append(el('optgroup', {label: 'Code matches'}, cands.map((u) => el('option', {value: u, text: '★ ' + fxName(u), selected: (curv ?? pick) === u ? true : null}))));
    s.append(el('optgroup', {label: 'All'}, pool.filter((u) => !cands.includes(u)).map((u) => el('option', {value: u, text: fxName(u), selected: curv === u ? true : null}))));
    return s;
  };
  const items = shown.map((r) => {
    const cur = r.cur && r.cur.value, root = fcHgName(r.style), isHg = fcIsHg(r.style);
    // 12 Nov 2026: the head group is called by its linked fabric's name; the link stays saved under its Style-map name (root)
    const name = isHg ? fxHgNow(root, r.width, r.name) : root;
    const applied = ((D && D.hg_names) || []).find((x) => x.root === root && String(x.width) === String(r.width));
    const want = cur ? (cur.greige != null ? cur.greige : cur.rfd) : null;
    const next = isHg && want != null && (!applied || +applied.uid !== +want) ? fxHgNext(cur) : null;   // linked, not yet renamed
    const grp = isHg ? (hgGroups()[String(r.width) + '|' + name] || []) : [], mates = grp.filter((x) => x !== root);   // merged under one name
    const other = isHg ? rows.find((o) => o.style === r.style && o.width !== r.width) : null;   // the same head group on the other loom width
    const g = sel('Greige fabric for ' + name, r.greige || [], r.pick_greige, greigeAll, cur ? cur.greige : undefined);
    const f = sel('RFD fabric for ' + name, r.rfd || [], r.pick_rfd, rfdAll, cur ? cur.rfd : undefined);
    const d = fxDateIn(cur ? r.cur.eff_from : (r.first && r.first < FX_START ? r.first : FX_START), 'Links from');
    const m = el('span', {class: 'meta'});
    // the link's default basis for "As sold" rides in its note as JSON (R1, 11 Nov 2026) and is carried into every later row
    const noteOf = (basis) => basis ? JSON.stringify({basis}) : null;
    const save = (gu, ru, mode, both) => async () => {
      if (gu == null && ru == null && !confirm(`Mark ${name} on ${r.width} cm as not a fabric to value? Its picks stay out of the analysis and are counted as a gap.`)) return;
      m.className = 'meta'; m.textContent = 'Saving…';
      try {
        for (const w of both && other ? [r.width, other.width] : [r.width]) await fxRpc('fm_link_style', {p_style: r.style, p_width: w, p_greige: gu, p_rfd: ru, p_eff: d.value || null, p_mode: mode, p_note: noteOf(cur && cur.basis)});
        m.textContent = 'Linked.'; await fxLoad(true); drawLinks(box, sug);
      } catch (e) { m.className = 'err'; m.textContent = saveFail(e, 'link', ''); }
    };
    // one tap sets which record "As sold" values this link on: a correction row with the same fabrics and the new note
    const def = cur ? fcLinkDefault(cur) : null;
    const setBasis = (v) => async () => {
      if (v === def) return;
      m.className = 'meta'; m.textContent = 'Saving…';
      try { await fxRpc('fm_link_style', {p_style: r.style, p_width: r.width, p_greige: cur.greige, p_rfd: cur.rfd, p_eff: r.cur.eff_from, p_mode: 'correction', p_note: noteOf(v)}); m.textContent = `As sold on ${v}.`; await fxLoad(true); drawLinks(box, sug); }
      catch (e) { m.className = 'err'; m.textContent = saveFail(e, 'save', ''); }
    };
    const basisSeg = cur && (cur.greige != null || cur.rfd != null) ? el('div', {class: 'toolbar', style: 'margin:6px 0 0'}, el('label', {text: 'As sold on'}),
      el('div', {class: 'seg', role: 'group', 'aria-label': 'As sold basis for ' + name}, ['Greige', 'RFD'].map((v) => el('button', {type: 'button', 'aria-pressed': def === v ? 'true' : 'false', text: v,
        disabled: (v === 'Greige' ? cur.greige == null : cur.rfd == null) ? true : null, title: (v === 'Greige' ? cur.greige == null : cur.rfd == null) ? `No ${v} record linked` : `Value this head group on its ${v} record in the As sold view`, onclick: setBasis(v)}))),
      el('span', {class: 'note', text: cur.basis ? 'set by you' : 'default: greige where linked, else RFD'})) : null;
    const num = (s) => s.value === '' ? null : +s.value;
    return el('div', {class: 'req', style: 'padding:10px 0;border-top:1px solid var(--line)'},
      el('div', {}, el('b', {text: name}), wTag(r.width), ' ', isHg ? el('span', {class: 'pill muted', text: 'head group'}) : null, ' ',
        el('span', {class: 'note', text: `${r.loomdays} loom-days · ${f2((r.fpicks || 0) / FC_PICKS_PER_INCH / 1e5)} lakh picks · ${dfmt(r.first)} to ${dfmt(r.last)}`})),
      isHg && name !== root ? el('div', {class: 'note', text: `Style-map name: ${root}`}) : null,
      mates.length ? el('div', {}, el('span', {class: 'pill info', style: 'white-space:normal', text: `One head group with ${mates.join(', ')} on ${r.width} cm${grp[0] === root ? '; its targets and switches are used' : `; targets and switches from ${grp[0]}`}. Each keeps its own link.`})) : null,
      next ? el('div', {}, el('span', {class: 'pill info', style: 'white-space:normal', text: `Takes the name ${next} on the next hourly run`})) : null,
      isHg && (r.styles || []).length ? el('div', {class: 'note', text: `Style names it covers: ${r.styles.join(', ')}`}) : null,
      cur ? el('div', {class: 'note', text: `Linked from ${dfmt(r.cur.eff_from)}: greige ${fxName(cur.greige)}, RFD ${fxName(cur.rfd)}${cur.greige == null && cur.rfd == null ? ' (not valued)' : ''}`}) : null,
      basisSeg,
      (() => { const tw = cur && fcTwinCheck(M, cur, today); return tw ? el('div', {}, el('span', {class: 'pill bad', text: `The greige price ₹${tw.greige} is above the RFD price ₹${tw.rfd}: one is probably on the wrong basis (case 35)`, style: 'white-space:normal'})) : null; })(),
      (r.why || []).length ? el('div', {class: 'note', text: (r.why || []).join(' · ')}) : null,
      el('div', {class: 'toolbar', style: 'margin-top:8px;flex-wrap:wrap'}, el('label', {text: 'Greige'}), g, el('label', {text: 'RFD'}), f, el('label', {text: 'from'}), d,
        el('button', {type: 'button', class: 'primary', text: cur ? 'Change from this date' : 'Confirm', onclick: () => save(num(g), num(f), 'new')()}),
        !cur && other && !other.cur ? el('button', {type: 'button', class: 'primary', text: `Confirm for ${r.width} and ${other.width} cm`, title: 'The same fabric on both loom widths', onclick: () => save(num(g), num(f), 'new', true)()}) : null,
        cur ? el('button', {type: 'button', class: 'ghost', text: 'Correct the link', title: 'Replace the current link for its whole period', onclick: () => save(num(g), num(f), 'correction')()}) : null,
        el('button', {type: 'button', class: 'ghost', text: 'Not a fabric to value', onclick: () => save(null, null, cur ? 'new' : 'new')()}),
        cur ? el('button', {type: 'button', class: 'ghost', text: 'Undo this link', onclick: async () => { if (!confirm('Undo this link? It is kept in history; the style becomes unlinked for that period.')) return; try { await fxRpc('fm_unlink', {p_link: r.cur.id}); await fxLoad(true); drawLinks(box, sug); } catch (e) { m.className = 'err'; m.textContent = saveFail(e, 'undo', ''); } }}) : null, m));
  });
  const seg = el('div', {class: 'seg', role: 'group', 'aria-label': 'Styles shown'}, [['unlinked', `Unlinked (${unlinked.length})`], ['all', `All (${rows.length})`]].map(([v, t]) =>
    el('button', {type: 'button', 'aria-pressed': FXLINKS === v ? 'true' : 'false', text: t, onclick: () => { FXLINKS = v; drawLinks(box, sug); }})));
  box.className = 'fxpage';   // 18 Nov 2026: cards keep the page's 16 px gap
  box.replaceChildren(card('Head-group links', `Suggestions from ${fxWhen(sug.created_at)} · one greige and one RFD fabric per head group and loom width (case 18). ★ marks a fabric carrying a code from the group's style names.`,
    el('div', {class: 'toolbar'}, seg), items.length ? el('div', {}, items) : el('div', {class: 'empty', text: FXLINKS === 'unlinked' ? 'Every head group the looms ran is linked.' : 'No head groups yet: they come from the loom data.'})));
}

// The name a head group carries now (the pipeline's, from the data) and the one its current link gives it on the next run.
const fxHgNow = (root, w, fallback) => { const n = ((D && D.hg_names) || []).find((x) => x.root === root && String(x.width) === String(w)); return n ? n.name : (fallback || root); };
const fxHgNext = (v) => v && v.greige != null ? fxName(v.greige) : v && v.rfd != null ? fxName(v.rfd).replace(/\s*\(RFD\)\s*/i, ' ').replace(/\s+/g, ' ').trim() : null;

// ================================================================ #approvals: the inbox
const FX_KIND = {new_fabric: 'New fabric', value: 'Changed value', sale: 'Rate change', yarn_value: 'Yarn change', rate: 'Rate change', rate_removed: 'Rate removed',
  different: 'Possibly a different fabric', removed: 'Removed or deleted', unreadable: 'Cannot read'};
function pageApprovals() {
  const [s, box] = fxPage('approvals', 'Every change the fabric app makes to a Weavelon 2 fabric, yarn or rate waits here until you decide. Money changes are approved one at a time with an effective-from date; descriptive ones together in one tap.');
  if (!box) return s;
  (async () => {
    try {
      const imp = await sbRows('fm_imports', (q) => q.select('id').limit(1));
      if (!imp.length) { box.className = ''; box.replaceChildren(el('p', {class: 'note', text: 'Requests start after the first import is accepted on Fabric masters.'})); return; }
      await fxLoad(true);
      await drawApprovals(box);
    } catch (e) { fxErr(box, e); }
  })();
  return s;
}
async function drawApprovals(box) {
  const [reqs, hold, hist] = await Promise.all([
    sbRows('fm_requests_now', (q) => q.select('id, gkey, kind, cls, entity, src_id, field, title, created_at, event_id, status, payload, base, changes, status_at, status_by, detail').in('status', ['pending', 'rejected', 'approved']).order('id', {ascending: false}).limit(300)),
    sbRows('fabric_hold', (q) => q.select('kind, id, raw').in('kind', ['fabric', 'yarn'])),
    sbRows('fm_history', (q) => q.select('id, at, by, action, request_id, entity, uid, field, old, new, eff_from, mode, detail').order('id', {ascending: false}).limit(100))]);
  const raw = new Map(hold.map((h) => [h.kind + '|' + h.id, h.raw || {}]));
  const pending = reqs.filter((r) => r.status === 'pending'), rejected = reqs.filter((r) => r.status === 'rejected');
  const approved = new Map(reqs.filter((r) => r.status === 'approved').map((r) => [r.id, r]));
  setApprovalsBadge(pending.filter((r) => r.cls !== 'info').length);
  const seg = el('div', {class: 'seg', role: 'group', 'aria-label': 'List'}, [['pending', `Pending (${pending.filter((r) => r.cls !== 'info').length})`], ['rejected', `Rejected (${rejected.length})`], ['history', 'History']].map(([v, t]) =>
    el('button', {type: 'button', 'aria-pressed': FXSHOW === v ? 'true' : 'false', text: t, onclick: () => { FXSHOW = v; drawApprovals(box); }})));
  const out = [el('div', {class: 'toolbar'}, seg)];
  const redraw = async () => { await fxLoad(true); await drawApprovals(box); };
  if (FXSHOW === 'pending') {
    const info = pending.filter((r) => r.cls === 'info'), desc = pending.filter((r) => r.cls === 'descriptive'), money = pending.filter((r) => r.cls === 'money');
    if (!pending.length) out.push(el('div', {class: 'empty', text: 'Nothing waiting. A change in the fabric app shows here after it has held for about 30 minutes.'}));
    if (desc.length) {
      const cbs = desc.map((r) => el('input', {type: 'checkbox', checked: true, 'aria-label': r.title}));
      const m = el('span', {class: 'meta'});
      out.push(card('Descriptive changes', `${desc.length} · names, weave, notes and other words that change no figure`,
        table(['', 'Change', 'Was', 'Now', 'Waiting'], desc.map((r, i) => [cbs[i], r.title, fxShow(r.base), fxShow(r.payload.value), fxAge(r)])),
        el('div', {class: 'toolbar', style: 'margin-top:10px'}, el('button', {type: 'button', class: 'primary', text: 'Approve the ticked ones together', onclick: async () => {
          const pick = desc.filter((r, i) => cbs[i].checked);
          if (!pick.length) return;
          m.textContent = 'Approving…';
          try { const x = await fxRpc('fm_approve_descriptive', {p_reqs: pick.map((r) => r.id), p_tokens: pick.map((r) => r.event_id)}); m.textContent = `${x.approved} approved.`; redraw(); }
          catch (e) { m.className = 'err'; m.textContent = saveFail(e, 'approve', ''); }
        }}), m)));
    }
    for (const r of money) out.push(fxRequestCard(r, raw, redraw));
    if (info.length) out.push(card('Cannot read', `${info.length} · these clear by themselves once the fabric app's value can be read; the dashboard keeps its last good value meanwhile`,
      el('ul', {class: 'alerts'}, info.map((r) => el('li', {}, el('span', {class: 'pill warn', text: 'read'}), el('span', {text: `${r.title}: ${(r.payload.problems || []).map((p) => `${p.field} ${p.why}${p.value != null ? ' (' + p.value + ')' : ''}`).join('; ')}`}))))));
  } else if (FXSHOW === 'rejected') {
    out.push(rejected.length ? card('Rejected', 'The fabric app says one thing, you kept another. A rejection is remembered until the fabric app changes the value again.',
      el('div', {}, rejected.map((r) => fxRequestCard(r, raw, redraw, true)))) : el('div', {class: 'empty', text: 'Nothing rejected.'}));
  } else {
    const rows = hist.map((h) => {
      const r = h.request_id && approved.get(h.request_id), m = el('span', {class: 'meta'});
      const undo = r && h.action === 'approved' || r && /fabric added|linked to existing|retired|rate removed|added as a new/.test(h.action) ? el('button', {type: 'button', class: 'ghost', text: 'Undo', onclick: async () => {
        if (!confirm(`Undo "${r.title}"? The reversal is saved as a new version and the change goes back to Pending.`)) return;
        try { await fxRpc('fm_undo', {p_req: r.id}); redraw(); } catch (e) { m.className = 'err'; m.textContent = saveFail(e, 'undo', ''); } }}) : null;
      return [fxWhen(h.at), el('span', {}, h.action, h.detail && h.detail.title ? el('div', {class: 'note', text: h.detail.title}) : null),
        el('span', {class: 'note', text: [h.field, h.old != null ? fxShow(h.old) + ' →' : '', h.new != null ? fxShow(h.new) : ''].filter(Boolean).join(' ').slice(0, 160)}),
        h.eff_from ? dfmt(h.eff_from) + (h.mode && h.mode !== 'new' ? ' · ' + h.mode : '') : '', h.by, el('span', {}, undo, m)];
    });
    out.push(card('History', 'Everything approved, rejected, undone or imported, newest first', table(['When', 'What', 'Detail', 'From', 'By', ''], rows)));
  }
  box.className = 'fxpage';   // 18 Nov 2026: cards keep the page's 16 px gap
  box.replaceChildren(...out);
  collapseTables(box);
}
const fxAge = (r) => { const d = Math.floor((Date.now() - new Date(r.created_at)) / 864e5); return d < 1 ? 'today' : `${d} day${d === 1 ? '' : 's'}`; };

// The edit a request would make, in the masters' terms, for the impact preview (null when it cannot be previewed).
function fxEditOf(r, eff, mode) {
  const p = r.payload || {};
  if (r.kind === 'sale') return {table: 'sale', uid: FX.fabOf[r.src_id], field: r.field, value: p.value, eff_from: eff, mode};
  if (r.kind === 'value' && r.field === 'lines') {
    const ls = (p.value || []).map((l) => Object.assign({}, l, {yarn: FX.yarnOf[l.yarn], yarn_src: l.yarn}));
    return ls.some((l) => l.yarn == null) ? null : {table: 'fab', uid: FX.fabOf[r.src_id], field: 'lines', value: ls, eff_from: eff, mode};
  }
  if (r.kind === 'value') return {table: 'fab', uid: FX.fabOf[r.src_id], field: r.field, value: p.value, eff_from: eff, mode};
  if (r.kind === 'yarn_value') return {table: 'yarn', uid: FX.yarnOf[r.src_id], field: r.field, value: r.field === 'base_yarn_id' ? FX.yarnOf[p.value] : p.value, eff_from: eff, mode};
  if (r.kind === 'rate') return {table: 'rate', uid: FX.yarnOf[r.src_id], value: p.value, eff_from: eff, mode};
  if (r.kind === 'different') {   // "update the existing fabric": every changed field at once (review 13)
    const u = FX.fabOf[r.src_id], out = [];
    for (const [k, v] of Object.entries(p.changes || {})) {
      if (['name', 'weave', 'design_note', 'end_use'].includes(k)) continue;
      if (k === 'lines') { const ls = (v || []).map((l) => Object.assign({}, l, {yarn: FX.yarnOf[l.yarn], yarn_src: l.yarn})); if (ls.some((l) => l.yarn == null)) return null; out.push({table: 'fab', uid: u, field: k, value: ls, eff_from: eff, mode}); }
      else out.push({table: FC_SALE.includes(k) ? 'sale' : 'fab', uid: u, field: k, value: v, eff_from: eff, mode});
    }
    return out.length && u != null ? out : null;
  }
  return null;
}
// The dashboard's own value today, for "you have".
function fxOurs(r) {
  const t = fxToday();
  if (r.kind === 'sale') { const u = FX.fabOf[r.src_id]; return u == null ? null : fcVal(FX.M.sale[u], r.field, t); }
  if (r.kind === 'value') { const u = FX.fabOf[r.src_id]; const v = u == null ? null : fcVal(FX.M.fab[u], r.field, t); return r.field === 'lines' && Array.isArray(v) ? v.map((l) => Object.assign({}, l, {yarn_src: l.yarn_src || fxYarnName(l.yarn)})) : v; }
  if (r.kind === 'yarn_value') { const u = FX.yarnOf[r.src_id]; const v = u == null ? null : fcVal(FX.M.yarn[u], r.field, t); return r.field === 'base_yarn_id' && v != null ? fxYarnName(v) : v; }
  if (r.kind === 'rate' || r.kind === 'rate_removed') { const u = FX.yarnOf[r.src_id]; const e = u == null ? null : fcInForce(FX.M.rate[u], r.field); return e ? e.value : null; }
  return null;
}
function fxDefaultDate(r) {
  const p = r.payload || {}, t = fxToday();
  if (r.kind === 'rate') return p.date > FX_START ? p.date : FX_START;
  if (r.kind === 'sale' && r.field === 'price' && p.sale_date && p.sale_date >= FX_START) return p.sale_date;
  if (r.kind === 'new_fabric') return FX_START;
  return t;
}
function fxRequestCard(r, raw, redraw, isRejected) {
  const p = r.payload || {}, rw = raw.get((r.entity === 'rate' ? 'yarn' : r.entity) + '|' + r.src_id) || {};
  const m = el('span', {class: 'meta'}), out = el('div');
  const ours = fxOurs(r);
  const who = rw.updated_by || rw.created_by ? `changed by ${rw.updated_by || rw.created_by}${rw.updated_at ? ' at ' + fxWhen(rw.updated_at) : ''} (the fabric app's typed name)` : '';
  const head = el('div', {}, el('span', {class: 'pill ' + (r.cls === 'money' ? 'warn' : 'muted'), text: FX_KIND[r.kind] || r.kind}), ' ', el('b', {text: r.title}),
    el('div', {class: 'note', text: [`raised ${fxWhen(r.created_at)}`, r.changes > 1 ? `changed ${r.changes} times while waiting` : '', who].filter(Boolean).join(' · ')}));
  const facts = [];
  if (['sale', 'value', 'yarn_value', 'rate', 'rate_removed'].includes(r.kind)) {
    facts.push(['Fabric app says', fxShow(p.value)], ['You have', fxShow(ours)], ['Decided before', fxShow(r.base)]);
    if (p.sale_date) facts.push(['Fabric app sale date', dfmt(p.sale_date)]);
    if (r.kind === 'rate') facts.push(['Its effective date there', dfmt(p.date)]);
  } else if (r.kind === 'different') {
    for (const [k, v] of Object.entries(p.changes || {})) facts.push([k, `${fxShow((p.before || {})[k])} → ${fxShow(v)}`]);
  } else if (r.kind === 'new_fabric') {
    const f = p.fabric || {};
    facts.push(['Fabric', f.shown], ['Price', f.sale && f.sale.price != null ? '₹' + f.sale.price : 'blank'], ['PPI / reed space', `${f.fields && f.fields.ppi} / ${f.fields && f.fields.reed_space_in}`], ['Yarn lines', fxShow(f.lines)]);
    if ((p.yarns || []).length) facts.push(['New yarns in this package', p.yarns.map((y) => y.fields.name || y.src_id).join(', ')]);
    if ((p.similar || []).length) facts.push(['Same construction as', p.similar.map((x) => x.shown || fxName(x.uid)).join(', ') + ' (perhaps deleted and re-created: link it to keep its history)']);
  } else if (r.kind === 'removed') {
    const u = FX.fabOf[r.src_id], styles = Object.values(FX.M.links).map((L) => fcInForce(L, '9999-12-31')).filter((l) => l && (l.value.greige === u || l.value.rfd === u)).map((l) => l.style);
    const recent = FX.loomdays.filter((x) => x.date >= fcAddDays(fxToday(), -7) && x.styles.some((s) => styles.includes(s)));
    facts.push(['Fabric', fxName(u)]);
    if (recent.length) facts.push(['Warning', `still running on looms: ${[...new Set(recent.map((x) => x.loom))].join(', ')} in the last 7 days (case 14)`]);
  }
  if (p.shared) facts.push(['Shared fabric', p.shared + ': the change may have been made for that unit. Rejecting leaves your copy as it is.']);
  const ftab = el('div', {class: 'tablebox'}, el('table', {}, el('tbody', {}, facts.map(([a, b]) => el('tr', {}, el('td', {class: 'note', text: a}), el('td', {text: b == null ? '—' : String(b)}))))));
  // ---- controls
  const date = fxDateIn(fxDefaultDate(r), 'Effective from');
  const modeSel = el('select', {'aria-label': 'Kind of change'}, el('option', {value: 'new', text: 'New from this date (the world changed)'}), el('option', {value: 'correction', text: 'Correction (the old value was wrong for its whole period)'}));
  const choice = el('select', {'aria-label': 'Choice', hidden: !['new_fabric', 'different', 'removed'].includes(r.kind) ? true : null});
  if (r.kind === 'new_fabric') choice.append(el('option', {value: 'import', text: 'Import it'}), el('option', {value: 'link', text: 'Link it to a fabric I already have', selected: (p.similar || []).length ? true : null}));
  if (r.kind === 'different') choice.append(el('option', {value: 'update', text: 'Update the existing fabric'}), el('option', {value: 'add_new', text: 'Add as a new fabric, keep the old one'}));
  if (r.kind === 'removed') choice.append(el('option', {value: 'keep', text: 'Keep it active'}), el('option', {value: 'retire', text: 'Retire it from the date'}));
  const linkTo = el('select', {'aria-label': 'Fabric to link to', hidden: true}, Object.keys(FX.M.fab).map(Number).sort((a, b) => fxName(a).localeCompare(fxName(b))).map((u) => el('option', {value: u, text: fxName(u)})));
  choice.addEventListener('change', () => { linkTo.hidden = choice.value !== 'link'; seen = false; });
  for (const c of [date, modeSel, linkTo]) c.addEventListener('change', () => { seen = false; });   // a changed choice needs a fresh preview
  if ((p.similar || []).length) { linkTo.value = String(p.similar[0].uid); linkTo.hidden = false; }
  const prev = el('div');
  const showImpact = () => {
    const edit = r.kind === 'different' && choice.value === 'add_new' ? null : fxEditOf(r, date.value, modeSel.value);
    if (!edit || (!Array.isArray(edit) && edit.uid == null)) { prev.replaceChildren(el('p', {class: 'note', text: r.kind === 'new_fabric' ? 'A new fabric moves no figure until a style is linked to it.' : r.kind === 'rate_removed' ? 'Approving ends this rate: the entry before it applies again for its period.' : 'No preview for this kind of change.'})); return null; }
    if (!date.value) { prev.replaceChildren(el('p', {class: 'err', text: 'Pick the effective-from date first.'})); return null; }
    const imp = fcImpact(Object.assign(fxInput(), {to: fxToday()}), edit);
    const bits = [];
    for (const b of ['Greige', 'RFD']) {
      const B = imp.bases[b];
      bits.push([b, B.fabrics.length ? B.fabrics.map((x) => fxName(x.uid)).join(', ') : 'no linked production moves', String(B.loomdays), fxMoney(B.after.real - B.before.real), fxMoney(B.after.sale - B.before.sale)]);
    }
    const using = r.kind === 'rate' && edit.uid != null ? fcFabricsUsing(FX.M, edit.uid, edit.eff_from).map(fxName) : [];
    seen = true; okBtn.textContent = isRejected ? 'Approve after all' : r.kind === 'new_fabric' ? 'Go ahead' : 'Approve';
    const past = imp.from < fxToday().slice(0, 7) + '-01';
    prev.replaceChildren(el('p', {class: 'note', text: `Window: ${dfmt(imp.from)} to ${imp.open ? 'today and on' : dfmt(imp.to)}${edit.mode === 'correction' ? ' (the whole period of the value it corrects)' : ''}.${imp.from > fxToday() ? ' A future date is scheduled: it takes effect by itself on that day.' : ''}${past ? ' This restates a past month; the note records the old and new totals.' : ''}`}),
      using.length ? el('p', {class: 'note', text: 'Fabrics on this yarn: ' + using.join(', ')}) : null,
      table(['Basis', 'Fabrics that move', 'Loom-days', ['Realisation', 'change'], ['Sale value', 'change']], bits),
      imp.open && !Array.isArray(edit) ? null : el('p', {class: 'note', text: Array.isArray(edit) ? 'All the changed fields together, from the date chosen.' : ''}));
    return {from: imp.from, to: imp.to, old_real: imp.bases.Greige.before.real, new_real: imp.bases.Greige.after.real, old_real_rfd: imp.bases.RFD.before.real, new_real_rfd: imp.bases.RFD.after.real};
  };
  let seen = false;
  const approve = async (extra = {}) => {
    // a money change is approved only after its preview has been on screen (review 13): the first tap shows it
    if (r.cls === 'money' && !seen && !extra.jump && !extra.date) { const pv = showImpact(); if (pv || prev.textContent) { seen = true; okBtn.textContent = 'Approve, having checked the preview'; m.textContent = 'Check the preview above, then tap again.'; return; } }
    const impact = r.cls === 'money' ? showImpact() : null;
    const conf = Object.assign({impact, choice: choice.hidden ? undefined : choice.value, link_uid: choice.value === 'link' ? +linkTo.value : undefined}, extra);
    m.className = 'meta'; m.textContent = 'Approving…';
    try {
      await fxRpc('fm_approve', {p_req: r.id, p_token: r.event_id, p_eff: r.kind === 'removed' && choice.value === 'keep' ? null : date.value || null, p_mode: modeSel.value, p_confirm: conf});
      m.textContent = 'Approved.'; redraw();
    } catch (e) {
      const t = sbErr(e);
      const all = r.kind === 'different' ? '\n\nEvery change in this request:\n' + facts.map(([a, b]) => `${a}: ${b}`).join('\n') : '';
      if (/^JUMP/.test(t) && confirm(t.replace(/^JUMP: /, '').replace(/\.\s*Confirm.*$/, '') + '.' + all + '\n\nThat is more than 25%. Approve ' + (all ? 'all of them' : 'it') + ' anyway?')) return approve(Object.assign(extra, {jump: true}));
      if (/^DATE/.test(t) && confirm(t.replace(/^DATE: /, '').replace(/\.\s*Confirm.*$/, '') + '.\n\nUse this date anyway?')) return approve(Object.assign(extra, {date: true}));
      m.className = 'err'; m.textContent = /^STALE/.test(t) ? t.replace(/^STALE: /, '') + ' Reloading…' : saveFail(e, 'approve', '');
      if (/^STALE/.test(t)) setTimeout(redraw, 1500);
    }
  };
  const reject = async () => {
    m.className = 'meta'; m.textContent = 'Rejecting…';
    try { await fxRpc('fm_reject', {p_req: r.id, p_token: r.event_id, p_note: null}); m.textContent = 'Rejected.'; redraw(); }
    catch (e) { m.className = 'err'; m.textContent = /^STALE/.test(sbErr(e)) ? sbErr(e).replace(/^STALE: /, '') : saveFail(e, 'reject', ''); }
  };
  const dated = r.cls === 'money' && r.kind !== 'rate_removed';
  const okBtn = el('button', {type: 'button', class: 'primary', text: isRejected ? 'Approve after all' : r.kind === 'new_fabric' ? 'Go ahead' : 'Approve', onclick: () => approve()});
  out.append(el('div', {class: 'card', style: 'margin-top:10px'}, head, ftab,
    el('div', {class: 'toolbar', style: 'margin-top:10px;flex-wrap:wrap'}, choice, linkTo,
      dated ? el('label', {text: 'Effective from'}) : null, dated ? date : null, dated && !['new_fabric', 'removed'].includes(r.kind) ? modeSel : null,
      dated ? el('button', {type: 'button', class: 'ghost', text: 'Preview the impact', onclick: showImpact}) : null),
    prev,
    el('div', {class: 'toolbar'}, okBtn,
      isRejected ? null : el('button', {type: 'button', class: 'ghost', text: r.kind === 'new_fabric' ? 'Skip it' : 'Reject', onclick: reject}), m)));
  return out;
}

// ================================================================ #realisation: the analysis (hidden until switched on)
// R1 (11 Nov 2026): three bases (As sold is the default), a sticky basis/period bar, the trend with Sale value and approval
// markers, a coverage card, the per-pick waterfall, product ranking with the best product per loom type, lost realisation
// from stops and low speed, and a click-through from every row to the loom-days behind it. Arithmetic: fabric_calc.js.
// 12 Nov 2026: laid out like the loom tabs. The app's width switch and date chip apply here: every figure follows the
// width; the tiles are as on the day picked and the period ends on it. Masters, pending requests and approval days load
// once a minute at most, so switching width or day redraws straight away.
let FXR_AT = 0, FXR_PEND = [];
function pageRealisation() {
  const [s, box] = fxPage('realisation', '',   // Round A3 (ask 2): no lead text; each figure's = mark opens its Working
    D ? `Realisation, ${wLabel()} looms, ${dfmt(D.latest)}` : 'Realisation');
  if (!box) return s;
  if (!fxAnalysisOn()) { box.className = ''; box.replaceChildren(el('p', {class: 'note', text: 'The analysis is hidden. Divyam can switch it on from Fabric masters.'})); return s; }
  (async () => {
    try {
      await null;   // let render() attach the page first, so the cached path below sees a connected box
      if (!FX || Date.now() - FXR_AT > 60e3) {
        await fxLoad(true);
        const [pend, hist] = await Promise.all([
          sbRows('fm_requests_now', (q) => q.select('src_id, entity, kind').eq('status', 'pending').eq('cls', 'money')),
          sbRows('fm_history', (q) => q.select('id, action, field, eff_from, detail').order('id', {ascending: false}).limit(500)),
          fxCorrLoad().catch((e) => { FXCOR = null; FXCOR_ERR = sbErr(e); })]);
        FXAPP = fcApprovalDays(hist); FXR_PEND = pend; FXR_AT = Date.now();
      }
      if (box.isConnected) { drawRealisation(box, FXR_PEND); fxCorrSeen(); }
    } catch (e) { fxErr(box, e); }
  })();
  return s;
}
// No page period (Divyam, 12 Nov 2026, second round): each card has its own period, ending on the day picked at the top of
// the app (else the latest day the analysis holds), remembered per browser (w2-fx-periods). "Dates" uses the app's one
// shared range (rngOf / rngCtl). Defaults: month to date everywhere.
let FXSP = {};
try { const v = JSON.parse(localStorage.getItem('w2-fx-periods') || '{}'); if (v && typeof v === 'object') FXSP = v; } catch (e) {}
const FXSP_OK = ['day', '7', '14', '30', 'mtd', 'range'];
const fxPer = (id) => FXSP_OK.includes(FXSP[id]) && !(id === 'trend' && FXSP[id] === 'day') ? FXSP[id] : 'mtd';
const fxEnd = () => (D && D.latest) || (COST && COST.days || []).map((d) => d.date).concat(FX.loomdays.map((x) => x.date)).sort().pop() || fxToday();
const fxDays = () => [...new Set((D && D.complete_days || []).concat(D && D.latest ? [D.latest] : []))].filter((d) => d >= FX_START).sort();
function fxRange(id) {
  const t = fxEnd(), p = fxPer(id);
  if (p === 'range') { const r = rngOf(fxDays()); if (r.from && r.to) return {from: r.from, to: r.to, label: `${dfmt(r.from)} to ${dfmt(r.to)}`}; }
  if (p === 'day') return {from: t, to: t, label: dfmt(t)};
  if (p === 'mtd' || p === 'range') return {from: t.slice(0, 7) + '-01', to: t, label: 'month to date'};
  const n = +p || 7;
  return {from: fcAddDays(t, -(n - 1)), to: t, label: `${n} days to ${dfmt(t)}`};
}
const fxPeriod = () => fxRange('by');   // search: the By loom / head group card's period (By product went on 12 Nov 2026)
// One card's period switch: Last day (not on the trend), 7, 14, 30 days, month to date, Dates; the dates boxes when Dates is
// on; anything extra (the trend's Daily / Weekly); and the span it covers. Sticks while the card scrolls, like Costing's.
function fxPerBar(id, redraw, extra, wk) {
  const cur = fxPer(id), R = fxRange(id), n = fxDays().filter((d) => d >= R.from && d <= R.to).length;
  const opts = [['day', 'Last day', 'Day'], ['7', '7 days', '7d'], ['14', '14 days', '14d'], ['30', '30 days', '30d'], ['mtd', 'Month to date', 'MTD'], ['range', 'Dates', 'Dates']].filter(([v]) => id !== 'trend' || v !== 'day');
  const sg = el('div', {class: 'seg', role: 'group', 'aria-label': 'Period'}, opts.map(([v, t, sh]) => el('button', {type: 'button', 'aria-pressed': cur === v ? 'true' : 'false', 'aria-label': t,
    onclick: () => { FXSP[id] = v; lsSet('w2-fx-periods', FXSP); redraw(); }}, el('span', {class: 'lgl', text: t}), el('span', {class: 'sml', text: sh}))));
  return el('div', {class: 'toolbar perbar stickper', 'data-fxper': id}, sg, cur === 'range' ? rngCtl(fxDays(), redraw) : null, extra || null,
    el('span', {class: 'note', text: `${R.label} · ${n} day${n === 1 ? '' : 's'}`}), wk || null);
}
// This week vs last week on a Realisation period bar (Round D, Divyam 17 Nov 2026): the card's own headline figure (D2) from
// fcSum over each week's rows (so it is worked exactly as the card works its period), the 7 days to the day picked at the
// top against the 7 before (D1); a day counts when its own rows give the figure (D3). Owner only, like the tab; the basis is
// named because the figure follows the basis switch.
const fxWkRows = (end) => fxRows({from: fcAddDays(end, -(2 * WK_N - 1)), to: end});
const FX_WK = {
  cov: {what: 'Share of picks priced', fig: (t) => t.picks ? 100 * t.coverage : null, better: 'up', fmt: f1, unit: '%', dunit: 'points'},
  real: {what: 'Realisation per pick', fig: (t) => t.priced ? t.real_pp : null, better: 'up', fmt: fxPaise, unit: 'paise'},
  lc: {what: 'Profit per pick (loom cost basis)', fig: (t) => t.lc_ld ? t.profit_lc_pp : null, better: 'up', fmt: fxPaise, unit: 'paise'}};
function fxWk(k, end) {
  const S = FX_WK[k];
  return wkPill(wkBy(fxWkRows(end), end, (r) => r.date, (L) => S.fig(fcSum(L)), S.better), {...S, basis: FXBASIS});
}
const FX_BASIS_NOTE = {Greige: 'Greige: every link\'s greige record, net of VATAV (a what-if view)', RFD: 'RFD: every link\'s RFD record, net of VATAV, brokering, processing and transport, with the RFD shortage (a what-if view)',
  [FC_ASSOLD]: 'As sold: each head group on its own default record, greige where a greige record is linked, else RFD, or the basis set on Head-group links'};
const fxPct = (v) => v == null ? '—' : (v * 100).toFixed(0) + '%';
const fxLakh = (p) => f2((p || 0) / 1e5);
// The analysis rows of the current period and basis, once per draw (every card reads the same rows).
// Round A3 (Divyam, 24 Nov 2026): one profit, the loom cost basis; the Profit basis switches are gone
let FXRC = null;   // the rows by period during one draw of the Realisation tab (cards that share a period share the work)
function fxRows(P, allW) {
  const k = P.from + '|' + P.to + '|' + FXBASIS + '|' + W;
  if (!allW && FXRC && FXRC.has(k)) return FXRC.get(k);
  const all = fcAnalyse(Object.assign(fxInput(), {basis: FXBASIS, from: P.from, to: P.to})), out = all.filter((r) => allW || inW(r.width));
  out.bday = all.bday; out.lday = all.lday;   // Round Y: the day tables (B grade, loom cost) survive the width filter
  if (!allW && FXRC) FXRC.set(k, out);
  return out;
}   // follows the app's width switch (12 Nov 2026)
// Lost picks per loom-day in the period, the Actions tab's way, from the loom records kept on the page: looms that ran
// at least 60 min, against the current benchmark and target of their head group (past days follow current head groups).
function fxLostInput(P) {
  const out = [];
  for (const x of D.loomdays || []) {
    if (x.date < P.from || x.date > P.to || !(x.run >= 60)) continue;
    const b = x.hg !== 'Unassigned' ? bench(x.width, x.hg) || {} : {}, t = x.hg !== 'Unassigned' ? tgt(x.width, x.hg) || {} : {};
    const lp = fcLostPicks(x, {effLine: EFF_BAD(), rpmBm: ok(b.rpm) ? b.rpm : null, rpmTg: ok(t.rpm) ? t.rpm : null, tolPct: S().tol_rpm_pct || 3});
    if (!(lp.picks > 0)) continue;
    const f = pf(x.width, x.hg) / FC_PICKS_PER_INCH;   // machine picks → fabric picks → the costing basis
    out.push({date: x.date, loom: x.loom, hg: x.hg, width: String(x.width), picks: lp.picks * f, effPicks: lp.effPicks * f, rpmPicks: lp.rpmPicks * f, eff: x.eff, rpm: x.rpm, rpmRef: lp.rpmRef});
  }
  return out;
}
// The loom-days behind a row, in the panel (the same style as Benchmarks): their own per-pick waterfall and coverage, then
// one line per loom-day. Loom numbers and head groups open the app's own panels. Round Y: the waterfall is on the loom cost
// basis (the default; on the per pick basis when the loom cost cannot be worked out) and the table has both profits;
// withU: the rows are a whole day or a width, so the loom cost of their unpriced running loom-days is taken off (D3).
function fxDaysPanel(title, sub, rows, withU) {
  pushView(() => {
    const Wf = fcWaterfall(rows, 'lc', !!withU), cov = fcCoverage(rows);
    const lcWhy = Object.keys(fcSum(rows).lc_gaps)[0];
    const sorted = rows.slice().sort((a, b) => b.date.localeCompare(a.date) || a.loom - b.loom);
    const gapCell = (r) => r.gap ? el('span', {class: 'pill warn', text: r.gap + (r.lcost_gap > 0 ? ` · loom cost ${fxMoney(r.lcost_gap)} not recovered` : '') + '. Next: see Coverage on the Realisation tab', style: 'white-space:normal'})
      : r.profit == null ? el('span', {class: 'note', text: 'no costing day. Next: see Files per day on Data health'}) : r.profit_lc == null ? el('span', {class: 'note', text: `loom cost: ${r.lc_gap || 'not worked out'}. Next: ${fxLcNext(r.lc_gap || 'not worked out')}`})
      : r.lc_norun ? el('span', {class: 'note', text: 'no run minutes: charged only its picks\' share of the day\'s cost. Next: see Files per day on Data health if the loom did run'}) : '';
    const steps = `sale → yarn → loom cost → B grade${withU ? ' → unpriced looms' : ''} → profit, paise, loom cost basis`;
    const words = Wf ? `Sale ${fxMoney(Wf.sale)} − yarn ${fxMoney(Wf.yarn)} − loom cost ${fxMoney(Wf.conv)} − B grade ${fxMoney(Wf.bgrade)}${withU ? ` − unpriced looms ${fxMoney(Wf.unrec)}` : ''} = profit ${fxMoney(Wf.profit)} (loom cost basis).` : '';
    return {title, sub: sub || null, body: [
      el('p', {class: 'note', style: 'margin:0', text: `${cov.loomdays} loom-days · ${fxLakh(cov.picks)} lakh picks · priced ${fxPct(cov.coverage)} · costed ${fxPct(cov.cost_coverage)}${cov.reasons.length ? ' · gaps: ' + cov.reasons.map((x) => `${x.reason} (${fxLakh(x.picks)} lakh)`).join(', ') : ''}${withU && cov.unrec_ld ? ` · loom cost of ${cov.unrec_ld} unpriced loom-day${cov.unrec_ld === 1 ? '' : 's'} ${fxMoney(cov.unrec_rs)}` : ''}`}),
      Wf ? card('Per pick', `${steps}, over the ${Wf.loomdays} costed loom-days`, waterfall(Wf.steps, `Sale value to profit per pick, ${title}`, null, {flip: true, dec: 2}), el('p', {class: 'note', text: words}))
        : card('Per pick', null, el('p', {class: 'empty', text: !cov.priced ? 'Nothing priced here: every loom-day is a gap. Next: see Coverage on the Realisation tab.' : cov.costed ? `No loom cost profit here: ${lcWhy || 'not worked out'}. Next: see Files per day on Data health.` : 'No costed loom-day here yet: the waterfall needs a costing day. Next: see Files per day on Data health.'})),
      card(`Loom-days · ${sorted.length}`, 'Newest first. A gap row carries its reason, never a zero.',
        table(['Date', 'Loom', 'Head group', ['Picks', 'lakh'], ['Metres', 'm'], ['Sale', '₹'], ['Realisation', '₹'], ['Loom cost', '₹'], ['Profit (loom cost)', '₹'], 'Gap'],
          sorted.map((r) => [dfmt(r.date), loomLink(r.loom, r.date), hgLink(r.hg, r.width, r.date), fxLakh(r.picks), f0(r.metres), fxMoney(r.sale), fxMoney(r.real), fxMoney(r.lcost), fxMoney(r.profit_lc), gapCell(r)]), [3, 4, 5, 6, 7, 8]))]};
  });
}
// Coverage as one bar: costed, priced only, gap; each reason with its picks and a link to where it is put right.
const FX_GO = {links: ['Head-group links', '#links'], approvals: ['Approvals', '#approvals'], masters: ['Fabric masters', '#masters'], costing: ['Costing', '#costing']};
function fxCoverageCard(cov, per, R) {
  if (typeof wkPut === 'function') wkPut('K8', cov.picks ? {priced: cov.priced, picks: cov.picks} : null);   // Round J
  const seg = (v, cls, label) => cov.picks && v > 0 ? el('span', {class: 'covseg ' + cls, style: `width:${(100 * v / cov.picks).toFixed(2)}%`, title: `${label}: ${fxLakh(v)} lakh picks, ${fxPct(v / cov.picks)}`}) : null;
  const bar = el('div', {class: 'covbar', role: 'img', 'aria-label': `Coverage: costed ${fxPct(cov.cost_coverage)}, priced ${fxPct(cov.coverage)}`},
    seg(cov.costed, 'c', 'Priced and costed'), seg(cov.priced - cov.costed, 'p', 'Priced, no costing day yet'), seg(cov.gap, 'g', 'Gap'));
  const key = el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--good)'}), `priced and costed ${fxPct(cov.picks ? cov.costed / cov.picks : null)}`),
    el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--info)'}), `priced, no costing yet ${fxPct(cov.picks ? (cov.priced - cov.costed) / cov.picks : null)}`),
    el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--muted-2)'}), `gap ${fxPct(cov.picks ? cov.gap / cov.picks : null)}`));
  const rows = cov.reasons.map((x) => [el('span', {}, el('span', {class: x.soft ? 'note' : null, text: x.reason}), x.go ? el('div', {}, el('a', {href: FX_GO[x.go][1], text: `Fix on ${FX_GO[x.go][0]} ›`})) : null), fxLakh(x.picks), fxPct(x.share)]);
  const low = cov.coverage == null || cov.coverage < FX_COVER_MIN;
  // Round Y (D2, D3): the loom cost of running loom-days that are not priced, by reason; it is taken off the floor's and each
  // width's Profit (loom cost basis), never shared into a priced loom or head group
  const urows = (cov.unrec || []).map((x) => [el('span', {}, el('span', {text: x.reason === 'no fabric record' ? 'ran in the loom data, no fabric record' : x.reason === 'no picks' || x.reason === 'no picks woven' ? 'ran, no picks woven' : x.reason}),
    x.go ? el('div', {}, el('a', {href: FX_GO[x.go][1], text: `Fix on ${FX_GO[x.go][0]} ›`})) : x.reason === 'no fabric record' ? el('div', {class: 'note', text: 'Next: see Fabric health'})
      : x.reason === 'no picks' || x.reason === 'no picks woven' ? el('div', {class: 'note', text: 'Next: check the loom on the floor (it ran but wove nothing)'}) : null), String(x.ld), fxMoney(x.rs)]);
  return card('Coverage', `${fxLakh(cov.picks)} lakh picks in ${cov.loomdays} loom-days · priced ${fxPct(cov.coverage)} · costed ${fxPct(cov.cost_coverage)}`,
    per || null, bar, key, rows.length ? table(['Reason', ['Picks', 'lakh'], 'Share'], rows, [1, 2]) : el('p', {class: 'note', text: 'Every pick in the period is priced and costed.'}),
    urows.length ? el('p', {class: 'note', text: `Loom cost not recovered (loom cost basis): ${fxMoney(cov.unrec_rs)} over ${cov.unrec_ld} running loom-day${cov.unrec_ld === 1 ? '' : 's'} that are not priced. Each day's cost ÷ looms running is charged to every loom that ran; these looms' share is taken off Profit (loom cost basis) for the floor and its width, never put on a priced loom.`}) : null,
    urows.length ? table(['Loom cost not recovered', 'Loom-days', ['Loom cost', '₹']], urows, [1, 2]) : null,
    cov.norun_ld ? el('p', {class: 'note', text: `${cov.norun_ld} loom-day${cov.norun_ld === 1 ? ' has' : 's have'} picks but no run minutes in the loom data: not counted in the looms running, so ${cov.norun_ld === 1 ? 'it is' : 'they are'} charged only ${cov.norun_ld === 1 ? 'its' : 'their'} picks' share of the day's cost (the rest of POWER, the 2 paise and the cut piece loss). Next: see Files per day on Data health.`}) : null,
    fxTieLine(R),
    low ? el('p', {class: 'note', text: `Below ${FX_COVER_MIN * 100}% priced, the figures above are dimmed until more is linked and priced; they are never filled in.`}) : null);
}
// Round A3 (Divyam, 24 Nov 2026; Q2): the Cost charged card is gone; this line keeps its check that every rupee of each costed
// day's cost reaches the looms (both widths, whatever width is picked): Σ loom cost + B grade against the plant's folded cost
// with the 2 paise a pick added (corrected POWER + 2 paise, the loom cost method's total). A difference names its next step.
function fxTieLine(R) {
  if (!R || !R.lc_days) return R && R.lc_nodays ? el('p', {class: 'note', text: `Loom cost check: none of the ${R.lc_nodays} costed day${R.lc_nodays === 1 ? '' : 's'} in the period has loom data yet. Next: see Files per day on Data health.`}) : null;
  if (typeof wkPut === 'function') wkPut('K10L', {charged: R.charged_lc, plant: R.plant_lc, days: R.lc_days});
  const d = R.diff_lc, okd = Math.abs(d) < 1;
  return el('p', {class: okd ? 'note' : 'err', text: `Loom cost check, both widths, ${R.lc_days} costed day${R.lc_days === 1 ? '' : 's'}: charged to the looms ${fxMoney(R.charged_lc)} (loom cost + B grade) ${okd ? '=' : '≠'} the plant's folded cost with the 2 paise a pick ${fxMoney(R.plant_lc)}, a difference of ${fxMoney(Math.abs(d) < 0.5 ? 0 : d)}${okd ? '.' : `: a costed day's cost did not reach the looms in full. Next: see Files per day on Data health.`}${R.lc_nodays ? ` ${R.lc_nodays} costed day${R.lc_nodays === 1 ? ' has' : 's have'} no loom data yet and ${R.lc_nodays === 1 ? 'is' : 'are'} left out.` : ''}`});
}
function drawRealisation(box, pend) {
  FXRC = new Map();
  try { drawRealisation0(box, pend); } finally { FXRC = null; }
}
function drawRealisation0(box, pend) {
  const redraw = () => drawRealisation(box, pend);
  const end = fxEnd(), RG = {}, rowsOf = (id) => fxRows(RG[id] = fxRange(id));
  const covRows = rowsOf('cov'), cov = fcCoverage(covRows), tie = fcReconcile(fxRows(RG.cov, true), fxInput().costing);
  const pendingFab = new Set(pend.filter((x) => x.entity === 'fabric').map((x) => FX.fabOf[x.src_id]));
  const pendingYarn = new Set(pend.filter((x) => x.entity !== 'fabric').map((x) => FX.yarnOf[x.src_id]));
  const fabPending = (u) => pendingFab.has(u) || (FX.M.fab[u] && (fcVal(FX.M.fab[u], 'lines', end) || []).some((l) => pendingYarn.has(+l.yarn) || pendingYarn.has((fcYarnRate(FX.M, +l.yarn, end) || {}).base_uid)));
  const seg = (lab, opts, cur, set) => el('div', {class: 'seg', role: 'group', 'aria-label': lab}, opts.map(([v, t]) => el('button', {type: 'button', 'aria-pressed': cur === v ? 'true' : 'false', text: t, onclick: () => { set(v); drawRealisation(box, pend); }})));
  // 12 Nov 2026: tiles as on the day picked at the top of the app (the end of the period), laid out like the Actions tiles:
  // the day's figure in ₹ lakh, the change against the average of the days before it, and the last 7 days as a line.
  const asOf = end, CD = (D.complete_days || []).filter((d) => d <= asOf), last7 = CD.slice(-7), prior = CD.filter((d) => d < asOf).slice(-7);
  const spanFrom = [last7[0], prior[0], (last7[0] || asOf).slice(0, 7) + '-01', asOf].filter(Boolean).sort()[0];
  const span = fxRows({from: spanFrom, to: asOf}), byDay = new Map();
  for (const r of span) { if (!byDay.has(r.date)) byDay.set(r.date, []); byDay.get(r.date).push(r); }
  const sumDays = (ds) => fcSum(ds.flatMap((d) => byDay.get(d) || []));
  const DT = sumDays([asOf]), MP = {from: asOf.slice(0, 7) + '-01', to: asOf};
  const mtdOf = (d) => fcSum(span.filter((r) => r.date >= d.slice(0, 7) + '-01' && r.date <= d)), MT = mtdOf(asOf);
  if (typeof wkPut === 'function') fxWkTiles(DT, MT, byDay.get(asOf) || [], (span.lday || {})[asOf]);   // Round J: the tiles and one loom-day's steps, for their Working
  // costed: false = priced loom-days, true = costed (a costing day), 'lc' = with a loom cost profit (Round Y)
  const hasOf = (t, costed) => costed === 'lc' ? t.lc_ld : costed ? t.costed_ld : t.priced_ld;
  const dayVal = (d, k, costed) => { const t = sumDays([d]); return hasOf(t, costed) ? t[k] : null; };
  const avgPrior = (k, costed) => { const v = prior.map((d) => dayVal(d, k, costed)).filter(ok); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null; };
  const lk = (x) => !ok(x) ? '—' : (x < 0 ? '−₹' : '₹') + (Math.abs(x) / 1e5).toFixed(2);
  const spk = (vals, label) => last7.length > 1 ? el('div', {}, spark(vals, {aria: `${label}, last ${last7.length} days`, title: `${label}: ` + last7.map((d, i) => `${dfmt(d)} ${ok(vals[i]) ? lk(vals[i]) + ' lakh' : '—'}`).join(' · ')}),
    el('div', {class: 'spk'}, el('span', {text: dfmt(last7[0])}), el('span', {}, `${last7.length} days`, el('br'), '₹ lakh'), el('span', {text: dfmt(last7.at(-1))}))) : null;
  const tile = (label, t, k, ppk, ldk, costed, d, sp, sub) => {
    const has = costed ? t.costed_ld : t.priced_ld;   // nothing priced: a gap, never ₹0
    // 18 Nov 2026: fxkpi = a column with the line pinned to the foot, so the four lines and their dates sit level
    return el('div', {class: 'card kpi fxkpi', style: t.coverage == null || t.coverage < FX_COVER_MIN ? 'opacity:.55' : null}, el('div', {class: 'label', text: label}),
      el('div', {class: 'val'}, has ? lk(t[k]) : '—', has ? el('small', {text: 'lakh'}) : null),
      el('div', {class: 'note', text: has ? `${fxPaise(t[ppk])} paise/pick · ${fxMoney(t[ldk])} per loom per day${sub ? ' · ' + sub : ''}` : (costed && t.priced_ld ? `no costing for ${dfmt(asOf)} yet: profit shows once that day's costing file is read${sp ? '. The line shows the days that have it' : ''}` : 'nothing priced')}), d,
      sp ? el('div', {class: 'kfoot'}, sp) : null);
  };
  const dl = (k, costed) => { const c = dayVal(asOf, k, costed); return ok(c) ? delta(c, avgPrior(k, costed), true, (x) => '₹' + (x / 1e5).toFixed(2), ' lakh') : null; };
  const spv = (k, costed) => spk(last7.map((d) => dayVal(d, k, costed)), k === 'sale' ? 'Sale value' : k === 'real' ? 'Realisation' : 'Profit (loom cost basis)');
  // Round Y (design item 1): Profit on the loom cost basis as the headline (₹ lakh, paise/pick, ₹ per loom per day over the
  // loom-days running, and the loom cost of unpriced looms it includes, which opens Coverage).
  // The change against the earlier days and the 7-day line follow the loom cost basis. On a phone the label is short.
  // Round A3 (risk D): the loom-days whose loom cost is not recovered, those that wove no picks named apart
  const uTxt = (T) => T.nopick_ld ? `of ${T.unrec_ld} loom-day${T.unrec_ld === 1 ? '' : 's'}: ${T.unrec_ld - T.nopick_ld} not priced, ${T.nopick_ld} with no picks woven` : `of ${T.unrec_ld} unpriced loom-day${T.unrec_ld === 1 ? '' : 's'}`;
  const ptile = (T, label, sm, mtd) => {
    const has = T.lc_ld > 0, why = Object.keys(T.lc_gaps)[0], on = mtd ? `${dfmt(MP.from)} to ${dfmt(asOf)}` : dfmt(asOf);
    // Round A3 (risk C): nothing priced, but looms ran: the profit stays a gap and the loom cost not recovered is named
    const gap = !T.priced_ld ? `nothing priced${T.unrec_only ? `; ${fxMoney(T.unrec)} loom cost not recovered on ${on}` : ''}. Next: see Coverage on this tab`
      : T.unrec_only ? `nothing with a loom cost profit; ${fxMoney(T.unrec)} loom cost not recovered on ${on}. Next: see Coverage on this tab`
      : mtd ? `no day this month up to ${dfmt(asOf)} has a loom cost profit yet: a day needs its costing, its loom data and a priced head group. Next: see Files per day on Data health, then Coverage on this tab`
      : !T.costed_ld ? `no costing for ${dfmt(asOf)} yet: profit shows once that day's costing file is read${last7.length > 1 ? '. The line shows the days that have it' : ''}. Next: see Files per day on Data health`
      : why === 'no loom ran' ? `no loom ran on ${dfmt(asOf)} in the loom data, so there is no loom cost to share. Next: pick another day with the date chip`
      : `no loom data for ${dfmt(asOf)}: the loom cost basis needs the looms that ran that day. Next: see Files per day on Data health`;
    return el('div', {class: 'card kpi fxkpi fxprof' + (mtd ? ' fxpmtd' : ''), style: T.coverage == null || T.coverage < FX_COVER_MIN ? 'opacity:.55' : null},
      el('div', {class: 'label', 'data-sm': sm, text: label}),
      el('div', {class: 'val'}, has ? lk(T.profit_lc) : '—', has ? el('small', {text: 'lakh'}) : null),
      el('div', {class: 'note', text: has ? `${fxPaise(T.profit_lc_pp)} paise/pick · ${fxMoney(T.profit_lc_ld)} per loom per day` : gap}),
      has && T.unrec > 0 ? el('button', {type: 'button', class: 'link fxunrec', title: mtd ? `Open Coverage on this tab: ${T.unrec_ld} loom-day${T.unrec_ld === 1 ? '' : 's'}${T.nopick_ld ? `, ${T.unrec_ld - T.nopick_ld} not priced, ${T.nopick_ld} with no picks woven` : ' not priced'}` : 'Open Coverage on this tab', onclick: () => navGoCard('realisation', 'Coverage'),
        text: `incl. ${fxMoney(T.unrec)} loom cost ${mtd ? 'not recovered' : uTxt(T)} ›`}) : null,
      mtd ? el('span', {class: 'delta flat', text: on}) : dl('profit_lc', 'lc'),
      last7.length > 1 ? el('div', {class: 'kfoot'}, mtd ? (() => { const v = last7.map((d) => { const t = mtdOf(d); return t.lc_ld ? t.profit_lc : null; }); return spk(v, 'Profit (loom cost basis), month to date'); })() : spv('profit_lc', 'lc')) : null);
  };
  // Round A3 (ask 3): the sale value tile gives the weighted average sale rate a metre (sale value ÷ priced metres)
  const stile = () => {
    const T = DT, has = T.priced_ld > 0 && T.metres > 0;
    return el('div', {class: 'card kpi fxkpi', style: T.coverage == null || T.coverage < FX_COVER_MIN ? 'opacity:.55' : null}, el('div', {class: 'label', text: 'Sale value at prevailing rate'}),
      el('div', {class: 'val'}, has ? lk(T.sale) : '—', has ? el('small', {text: 'lakh'}) : null),
      el('div', {class: 'note', text: has ? `₹${f2(T.sale / T.metres)} a metre on average (${f0(T.metres)} m priced) · covers ${fxPct(DT.coverage)} of picks` : 'nothing priced. Next: see Coverage on this tab'}),
      dl('sale'), last7.length > 1 ? el('div', {class: 'kfoot'}, spv('sale')) : null);
  };
  // Round A3: one profit, the loom cost basis, in the tables' three profit columns
  const PL = 'Profit (loom cost)';
  const colsOf = () => ['', 'Loom-days', ['Picks', 'lakh'], ['Sale value', '₹'], ['Realisation', '₹'], [PL, '₹'], ['Realisation', 'paise/pick'], [PL, 'paise/pick'], [PL, '₹/loom/day'], 'Priced', 'Costed'];
  const nums = [1, 2, 3, 4, 5, 6, 7, 8];
  // every row opens the loom-days behind it (R1); the name inside still opens the app's own loom or head-group panel
  const grow = (name, t, mark, title, lab, basis, withU) => {
    const cc = t.lc_coverage;
    const pr = (v) => t.priced_ld ? fxMoney(v) : '—', co = (v) => t.lc_ld ? fxMoney(v) : '—';   // nothing priced or costed: a dash, never ₹0
    const cells = [el('span', {}, name, mark ? el('span', {class: 'pill warn', text: 'pending change', style: 'margin-left:6px'}) : null), String(t.loomdays), fxLakh(t.picks), pr(t.sale), pr(t.real),
      co(t.profit_lc), fxPaise(t.real_pp), fxPaise(t.lc_ld ? t.profit_lc_pp : null), co(t.profit_lc_ld),
      el('span', {class: t.coverage < FX_COVER_MIN ? 'pill warn' : 'note', text: fxPct(t.coverage)}),
      el('span', {class: cc < t.coverage - 1e-9 ? 'pill warn' : 'note', text: fxPct(cc), title: 'Share of picks with a loom cost profit: a day with no costing or no loom data yet has realisation but no profit'})];
    const open = () => fxDaysPanel(title, lab, t.rows, withU);
    return el('tr', {class: 'pick', tabindex: '0', title: 'Open the loom-days behind this row', onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); }}, cells.map((c, i) => el('td', {class: nums.includes(i) ? 'num' : null}, c)));
  };
  const widthRows = rowsOf('width');
  const byW = fcGroup(widthRows, (r) => r.width + ' cm', true);   // Round Y: a width carries the loom cost of its own unpriced looms (D3)
  // Round A3 (ask 1): As sold is the only basis on this tab; no basis bar (Head-group links keep each link's own record)
  // ---- trend: realisation, profit and sale value per pick (weighted by picks week by week), approval markers, a click opens the day
  const rows = rowsOf('trend'), P = RG.trend, tcov = fcCoverage(rows);
  const daily = fcGroup(rows, (r) => r.date, true).sort((a, b) => a.key.localeCompare(b.key)).map((d) => Object.assign(d, {date: d.key}));
  const marks = FXAPP.filter((m) => m.date >= P.from && m.date <= P.to).map((m) => ({date: m.date, text: m.text}));
  const anyVal = daily.some((d) => ok(d.real_pp));
  if (typeof wkPut === 'function') { const d = daily.slice().reverse().find((x) => ok(x.real_pp)); wkPut('K13', d ? {date: dfmt(d.date), real: d.real, picks: d.priced} : null); }   // Round J
  // Round A3 (ask 5): no per pick profit line. Risk C: a week adds up its days' rupees, so a day with nothing priced takes its
  // unrecovered loom cost off the week's profit (it is a gap in the daily line)
  const lcWeek = (L) => { const c = L.reduce((a, d) => a + (d.lc_ld ? d.lc_costed : 0), 0); return c > 0 ? 100 * L.reduce((a, d) => a + (d.lc_ld ? d.profit_lc : d.unrec_only ? -d.unrec : 0), 0) / c : null; };
  const trend = anyVal ? dayChart('fx', daily, [], {id: 'fx-trend', aria: 'Realisation, profit (loom cost basis) and sale value per pick', fmt: f2, marks, onPick: (d) => fxDaysPanel(dfmt(d), `every loom on ${dfmt(d)} · As sold`, rows.filter((r) => r.date === d), true)}, [
      {key: 'real', name: 'Realisation', get: (d) => d.real_pp, agg: 'w', w: (d) => d.priced, color: CC[0], avg: false},
      {key: 'lc', name: 'Profit (loom cost)', get: (d) => d.lc_ld ? d.profit_lc_pp : null, wk: lcWeek, color: CC[1], avg: false},
      {key: 'sale', name: 'Sale value', get: (d) => d.sale_pp, agg: 'w', w: (d) => d.priced, color: CC[2], dash: true, avg: false}], ['real', 'lc'])
    : el('div', {class: 'empty'}, `Nothing priced in this period${tcov.reasons.length ? ': ' + tcov.reasons[0].reason + ` (${fxPct(tcov.reasons[0].share)} of picks)` : ''}. `, tcov.reasons.length && tcov.reasons[0].go ? el('a', {href: FX_GO[tcov.reasons[0].go][1], text: `Fix on ${FX_GO[tcov.reasons[0].go][0]} ›`}) : null);
  const trendCard = card('Trend', `Paise per pick each day${cWeekly('fx', daily.length) ? ', week by week (weighted by picks)' : ''}`, fxPerBar('trend', redraw, viewSeg('fx', daily.length), fxWk('real', end)), trend,
    marks.length ? el('p', {class: 'note', text: `Dashed markers: days a money approval took effect (${marks.map((m) => dfmt(m.date)).join(', ')}); hover one to read it.`}) : null,
    el('p', {class: 'note', text: 'Point at or tap a day for its figures, then Open this day for its loom-days. Realisation = sale value less yarn. Profit (loom cost), solid = realisation less each loom\'s loom cost, its own B grade and the loom cost not recovered; a day with nothing priced is a gap in the line, and week by week its loom cost not recovered is still taken off. Sale value is dashed.'}));
  // 12 Nov 2026 (Divyam): the ranking card is gone; By loom / By head group (with its Profit / Realisation / per pick switch)
  // sits right after Trend.
  // ---- per-pick waterfall for the plant (each row's panel has its own)
  const wfRows = rowsOf('wf'), wcov = fcCoverage(wfRows), Wf = fcWaterfall(wfRows, 'lc');   // Round A3: the loom cost basis only
  if (typeof wkPut === 'function') wkPut('K9', Wf ? {basis: 'lc', sale: Wf.sale, yarn: Wf.yarn, conv: Wf.conv, bgrade: Wf.bgrade, unrec: Wf.unrec, picks: Wf.picks} : null);   // Round J
  const wfWhy = Object.keys(fcSum(wfRows).lc_gaps)[0];
  const wfCard = card('Per pick: sale value to profit', Wf ? `paise per pick over the ${Wf.loomdays} costed loom-days · As sold · loom cost basis` : 'paise per pick', fxPerBar('wf', redraw, null, fxWk('lc', end)),
    Wf ? waterfall(Wf.steps, 'Sale value to profit per pick, whole plant', null, {flip: true, dec: 2}) : el('p', {class: 'empty', text: !wcov.priced ? 'Nothing priced in this period. Next: see Coverage on this tab.' : !wcov.costed ? 'Nothing costed yet in this period: the waterfall needs a costing day. Next: see Files per day on Data health.'
      : `No loom cost profit in this period: ${wfWhy || 'not worked out'}. Next: see Files per day on Data health.`}),
    Wf ? el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--muted-2);opacity:.75'}), 'sale value and profit'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad)'}), 'what each step takes')) : null,
    Wf ? el('p', {class: 'note', text: `Sale ${fxMoney(Wf.sale)} − standard yarn ${fxMoney(Wf.yarn)} − loom cost ${fxMoney(Wf.conv)} − the looms' own B grade ${fxMoney(Wf.bgrade)} − the loom cost of ${Wf.unrec_ld} unpriced loom-day${Wf.unrec_ld === 1 ? '' : 's'} ${fxMoney(Wf.unrec)} = profit ${fxMoney(Wf.profit)}, loom cost basis. Costed loom-days only, so the steps add up exactly. Tap any row below for the same chart for that loom or head group.`}) : null);
  box.className = 'fxpage';   // 18 Nov 2026: cards keep the page's 16 px gap
  box.replaceChildren(
    el('p', {class: 'note', text: `Masters as of ${FX.M.version ? fxWhen(FX.M.version.at) : '—'} · ${FX_BASIS_NOTE[FC_ASSOLD]}`}),
    fxCorrectionsCard(FXCOR),
    el('div', {class: 'kpis fx6'},   // Round A3: six tiles, 3 × 2 from 720 px, 2 × 3 on a phone
      stile(),
      tile('Realisation', DT, 'real', 'real_pp', 'real_ld', false, dl('real'), spv('real')),
      fxBeTile(asOf, DT),
      ptile(DT, 'Profit (loom cost basis)', 'Profit · loom cost'),
      tile('Realisation, month to date', MT, 'real', 'real_pp', 'real_ld', false, el('span', {class: 'delta flat', text: `${dfmt(MP.from)} to ${dfmt(asOf)}`}),
        last7.length > 1 ? (() => { const v = last7.map((d) => { const t = mtdOf(d); return t.priced_ld ? t.real_ld : null; }); return el('div', {}, spark(v, {aria: 'Month-to-date realisation per loom per day, last days', title: 'Month to date, ₹ per loom per day: ' + last7.map((d, i) => `${dfmt(d)} ${fxMoney(v[i])}`).join(' · ')}),
          el('div', {class: 'spk'}, el('span', {text: dfmt(last7[0])}), el('span', {}, `${last7.length} days`, el('br'), '₹/loom/day'), el('span', {text: dfmt(last7.at(-1))}))); })() : null),
      ptile(MT, 'Profit, month to date (loom cost basis)', 'Profit · MTD', true)),
    el('p', {class: 'note', text: `${dfmt(asOf)}: ${fxLakh(DT.picks)} lakh picks in ${DT.loomdays} loom-days, ${DT.priced_ld} priced. The tiles are the day picked at the top (and its month to date); each card below has its own period.`}),
    fxCoverageCard(cov, fxPerBar('cov', redraw, null, fxWk('cov', end)), tie),
    trendCard,
    fxByCard(box, fabPending, rowsOf('by'), RG.by, grow, colsOf, nums, redraw),
    wfCard,
    card('By width', 'Click a row for its loom-days. Profit on the loom cost basis; a width\'s profit includes the loom cost of its unpriced looms.', fxPerBar('width', redraw, null, fxWk('real', end)),
      table(['Width', ...colsOf().slice(1)], byW.map((g) => grow(g.key, g, false, g.key, RG.width.label, 'lc', true)), nums)));   // Round A3 (ask 8): no Cost charged card; its check is the line under Coverage
  collapseTables(box);
}

// Round W (Divyam, 20 Nov 2026): the Break-even realisation tile, owner only (the Realisation tab is). The day on the date
// chip, as the tiles beside it: the same break-even as the Actions tile (fxBreakEven; Round A1), set against the Realisation
// tile's ₹ per loom per day. No costing day, or no loom running, is a gap with its next step, never ₹0.
// Round A3 (Q3): the break-even's cost is the loom cost method's own total, corrected POWER + 2 paise a pick
const fxBeWords = (B) => `(operating expenses and cut piece loss ${fxMoney(B.C.pool - B.C.add)}, corrected costing, + 2 paise a pick ${fxMoney(B.C.add)} + net B grade ${fxMoney(B.C.bnet)}) ÷ ${B.running} loom${B.running === 1 ? '' : 's'} running`;
function fxBeTile(date, DT) {
  const B = fxBreakEven(date);
  if (typeof wkPut === 'function') wkPut('K7:be', B.wk);
  // Round Y (design item 10): set against the Profit tile's ₹ per loom per day on the loom cost basis (= realisation a loom − break-even
  // when every loom is priced)
  const has = ok(B.be), p = DT.lc_ld ? DT.profit_lc_ld : null;
  const cmp = has && ok(p) ? el('span', {class: 'delta ' + (p >= 0 ? 'up-good' : 'up-bad'), text: `Profit (loom cost basis) ${fxMoney(p)} a loom a day, so realisation is ${p >= 0 ? 'above' : 'below'} break-even by ${fxMoney(Math.abs(p))} a loom`})
    : has ? el('span', {class: 'delta flat', text: DT.priced_ld ? 'no loom cost profit to set against it on this day. Next: see the Profit tile' : 'no profit to set against it: nothing priced on this day. Next: see Coverage on this tab'}) : null;
  const why = !B.cd ? `no costing for ${dfmt(date)} yet: it shows once that day's costing file is read. Next: see Files per day on Data health.`
    : !B.C ? `the costing for ${dfmt(date)} has no folded cost per pick or no A-grade folded picks. Next: see Files per day on Data health.`
    : `no loom ran on ${dfmt(date)}, so there is nothing to share the cost over. Next: pick another day with the date chip.`;
  return el('div', {class: 'card kpi fxkpi fxbe'}, el('div', {class: 'label', text: 'Break-even realisation'}),
    el('div', {class: 'val'}, has ? fxMoney(B.be) : '—', has ? el('small', {text: 'a loom a day'}) : null),
    el('div', {class: 'note', text: has ? fxBeWords(B) : why}), cmp);
}
// Round J: the Realisation tiles' figures, and one loom-day's steps (the costed loom-day with the most picks) for K1 to K6
function fxWkTiles(DT, MT, dayRows, L) {
  const t = (what, T, k, costed) => (costed ? T.costed_ld : T.priced_ld) ? {what, v: T[k], ld: costed ? T.costed_ld : T.priced_ld, picks: costed ? T.costed : T.priced, costed} : null;
  wkPut('K7:sale', DT.priced_ld && DT.metres > 0 ? {v: DT.sale, ld: DT.priced_ld, m: DT.metres} : null); wkPut('K7:real', t('Realisation', DT, 'real')); wkPut('K7:mtd', t('Realisation, month to date', MT, 'real'));
  // Round Y: the Profit tile's headline on the loom cost basis (K7L) and the loom cost of unpriced looms (K7U); Round A3: the month to date twin
  wkPut('K7:profit', DT.lc_ld ? {v: DT.profit_lc, ld: DT.lc_run_ld, picks: DT.lc_costed, unrec: DT.unrec, uld: DT.unrec_ld} : null);
  wkPut('K7:pmtd', MT.lc_ld ? {v: MT.profit_lc, ld: MT.lc_run_ld, picks: MT.lc_costed, unrec: MT.unrec, uld: MT.unrec_ld} : null);
  const U = new Map();
  for (const r of dayRows) if (r.lcost_gap > 0) { const o = U.get(r.loom) || {loom: r.loom, rs: 0, why: r.gap || 'not priced'}; o.rs += r.lcost_gap; U.set(r.loom, o); }
  wkPut('K7:unrec', DT.lc_ld && DT.unrec > 0 && L && L.per != null ? {date: dfmt(dayRows[0].date), pool: L.pool, n: L.n, per: L.per, items: [...U.values()].sort((a, b) => b.rs - a.rs), unrec: DT.unrec, uld: DT.unrec_ld} : null);
  const r = dayRows.filter((x) => !x.gap && x.fabric != null).sort((a, b) => (b.profit != null) - (a.profit != null) || b.picks - a.picks)[0];
  const f = r ? fcFabricAt(FX.M, r.fabric, r.date) : null, pm = f ? fcPerMetre(FX.M, f, r.date) : null;
  for (const k of ['K1', 'K2', 'K3', 'K4', 'K5', 'K6L']) wkPut(k, null);
  if (!r || !f || !pm) return;
  const rfd = f.finish === 'RFD', n = (v) => fcNum(v) ?? 0;
  wkPut('K1', {loom: r.loom, date: dfmt(r.date), picks: r.picks, ppi: fcNum(f.ppi)});
  wkPut(rfd ? 'K3' : 'K2', {loom: r.loom, rfd, metres: r.metres, price: fcNum(f.price), vat: fcPct(f.vatav_pct), brok: fcPct(f.brokering_pct), proc: n(f.processing_charge), trans: n(f.transport_charge), g: pm.g});
  wkPut('K4', {hg: r.hg, yarns: (pm.yarns || []).map((y) => ({side: y.side, gpm: y.gpm, rate: y.rate}))});
  wkPut('K5', {loom: r.loom, sale: r.sale, yarn: pm.rm, metres: r.metres, picks: r.picks});
  const lp = dayRows.filter((x) => x.loom === r.loom).reduce((a, x) => a + (x.picks || 0), 0), share = lp > 0 ? r.picks / lp : 1;
  const run = (fxRunning()[r.date] || []).filter((x) => String(x.loom) === String(r.loom)), lair = run.reduce((a, x) => a + (x.air || 0), 0);
  // Round A3: the loom-day's loom cost in its parts, for its Working (the costed loom-day with the most picks)
  wkPut('K6L', r.profit_lc != null && !r.lc_norun && L && L.per != null && r.lc ? {loom: r.loom, real: r.real, lcost: r.lcost, bcharge: r.bcharge, other: L.other, n: L.n, per: L.per, share, picks: r.picks, lpicks: lp,
    nocomp: L.nocomp, comp: L.comp, air: L.air, lair, cpart: r.lc.comp, pick: L.pick, P: L.pp > 0 ? L.pick / L.pp : 0, pp: L.pp, ppart: r.lc.pick} : null);
}
// Realisation target per loom-day (12 Nov 2026): no typed target; the production at the target effective RPM (93% of the
// target RPM) × each loom-day's own realisation per pick (fcRealAtErpm), averaged over the priced loom-days of the rows.
// rows: analysis rows of one head group and width. null when no target RPM is set or nothing is priced.
let FXMIN = null;
function fxMinutes() {
  if (FXMIN && FXMIN.D === D) return FXMIN.m;
  const m = new Map();
  for (const x of D.loomdays || []) { const k = x.date + '|' + x.loom + '|' + x.hg; m.set(k, (m.get(k) || 0) + (x.run || 0) + (x.stop || 0)); }
  FXMIN = {D, m}; return m;
}
function fxTargetLd(rows, w, hg) { return fxRefLd(rows, w, hg, typeof tgtE === 'function' ? tgtE(w, hg) : null); }
// A head group's realisation per loom-day at an effective RPM (eR): each priced loom-day re-worked at eR (fcRealAtErpm), then
// averaged over those loom-days; tot = their sum. null when eR is missing or nothing is priced.
function fxRefLd(rows, w, hg, eR) {
  if (!ok(eR)) return null;
  const by = new Map();
  for (const r of rows) { if (r.gap || !r.picks || r.hg !== hg || r.width !== String(w)) continue; const k = r.date + '|' + r.loom + '|' + r.hg, o = by.get(k) || {real: 0, picks: 0}; o.real += r.real; o.picks += r.picks; by.set(k, o); }
  const M = fxMinutes(); let tot = 0, n = 0;
  for (const [k, o] of by) { const v = fcRealAtErpm(eR, M.get(k), pf(w, hg), o.real / o.picks * 100); if (v != null) { tot += v; n++; } }
  return n ? {ld: tot / n, tot, n, erpm: eR} : null;
}
// Trend card (on Quality from 12 Nov 2026, on Actions since Round A2): loom realisation of a slot's loom-day records (one loom, or a head group's looms) on a
// day: {real, n} over the priced loom-days, or null (not priced: a gap, never ₹0).
function fxRecsReal(d, recs) {
  if (!fxOn() || !fxAll()) return null;
  let real = 0; const ld = new Set();
  for (const x of recs || []) { const o = fxLd(d, x.loom, x.hg); if (o && o.priced) { real += o.real; ld.add(x.loom); } }
  return ld.size ? {real, n: ld.size} : null;
}
// Its reference lines: the same loom-days re-worked at the benchmark, best and target effective RPM (per loom-day, or total).
function fxSlotRefs(d, s, w, hg, m) {
  const rows = (fxDayRows(d) || []).filter((r) => s.kind !== 'loom' || r.loom === s.loom), out = {bm: null, best: null, tg: null};
  for (const k of ['bm', 'best', 'tg']) { const R = fxRefLd(rows, w, hg, fxRefErpm(w, hg, k)); if (R) out[k] = m === 'real_ld' ? R.ld : R.tot; }
  return out;
}
// Quality tab heat grid (12 Nov 2026): loom realisation per loom per day and in total for the day, each against the same
// figure at the reference effective RPM (benchmark, best or target, as the grid's switch). Owner only; gaps never ₹0.
function fxHeatReal(date, w, hg, mode) {
  if (!fxOn()) return null;
  if (!fxAll()) return [{none: '…', tip: 'Loading the realisation analysis'}, {none: '…', tip: 'Loading the realisation analysis'}];
  const h = hg === 'Unassigned' ? null : fxHgPp(date, w, hg);
  if (!h) { const t = `${hg}, ${w} cm · Loom realisation\nCurrent: not priced (no priced loom-day for this head group on this day)\nNext: see Coverage on the Realisation tab`; return [{none: 'not priced', tip: t}, {none: 'not priced', tip: t}]; }
  const name = {bm: 'benchmark', best: 'best', tg: 'target'}[mode];
  const R = fxRefLd(fxDayRows(date), w, hg, fxRefErpm(w, hg, mode));
  const cov = h.coverage < 1 - 1e-9 ? ` · ${fxPct(h.coverage)} of picks priced` : '';
  // 13 Nov 2026 (Divyam): each cell shows the gap in rupees (− deficit in red, + surplus in green), not the figure itself.
  const Gp = fcRealGap(h.real_ld, R && R.ld, h.T.priced_ld);
  const cell = (now, ref, gap, what) => {
    // Round A2 (Divyam, 24 Nov 2026): the note on pointing gives the current figure and the reference's, one a line
    const Nm = name.charAt(0).toUpperCase() + name.slice(1), head = `${hg}, ${w} cm · Loom ${what}`;
    if (!R || gap == null) return {none: `no ${name}`, tip: `${head}\nCurrent: ${fxMoney(now)}\n${Nm}: none (no ${name} effective RPM to compare with)${cov}`};
    const G = gapPct(now, ref, true), p = G ? G.p : 0, z = Math.abs(gap) < 0.5;
    return {text: z ? '±₹0' : (gap > 0 ? '+' : '') + fxMoney(gap), level: heatLevel(p), tone: z ? 'none' : gap < 0 ? 'bad' : 'good',
      tip: `${head}\nCurrent: ${fxMoney(now)}\n${Nm} (at its effective RPM ${f0(R.erpm)}): ${fxMoney(ref)} · ${z ? 'level' : gap < 0 ? 'a deficit of ' + fxMoney(-gap) : 'a surplus of ' + fxMoney(gap)} (${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%)${cov}\nClick to open the head group.`,
      onClick: () => openHg(hg, w, date)};
  };
  if (typeof wkPut === 'function' && !WKD.C4 && R && Gp && Gp.tot != null) wkPut('C4', {hg, now: h.T.real, at: R.ld * h.T.priced_ld, ref: name});   // Round J: the first head group with a reference
  return [cell(h.real_ld, R && R.ld, Gp && Gp.ld, 'realisation per loom-day'), cell(h.T.real, R && R.ld * h.T.priced_ld, Gp && Gp.tot, 'realisation in the day')];
}
// The analysis rows as they would be had every loom-day run at its head group's benchmark, best or target effective RPM
// (Divyam, 12 Nov 2026, second round): each loom-day's picks become that effective RPM × its own run + stop minutes × panna
// ÷ 39.37 (the costing basis), and its metres, sale value, realisation, cost, B grade and profit scale with them, so the
// paise per pick stay as they were (profit keeps the day's cost per pick). The same as fcRealAtErpm for a whole loom-day.
// Loom-days of a head group with no such reference are dropped and counted (miss), never valued at zero.
const FX_REF = {run: 'Running', bm: 'Benchmark', best: 'Best', tg: 'Target'};
function fxRefErpm(w, hg, mode) {
  if (!hg || hg === 'Unassigned') return null;
  if (mode === 'bm') { const b = bench(w, hg); return b && ok(b.erpm) ? b.erpm : null; }
  if (mode === 'best') { const v = typeof bestVal === 'function' ? bestVal(w, hg, 'erpm') : null; return ok(v) ? v : null; }
  if (mode === 'tg') { const v = tgtE(w, hg); return ok(v) ? v : null; }
  return null;
}
function fxRefRows(rows, mode) {
  const by = new Map();
  for (const r of rows) { const k = r.date + '|' + r.loom + '|' + r.hg; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  const M = fxMinutes(), out = []; let miss = 0;
  for (const [k, rs] of by) {
    const r0 = rs[0], e = fxRefErpm(r0.width, r0.hg, mode), min = M.get(k), picks = rs.reduce((a, r) => a + (r.picks || 0), 0);
    if (!ok(e) || !(min > 0) || !(picks > 0)) { miss++; continue; }
    const f = e * min * pf(r0.width, r0.hg) / FC_PICKS_PER_INCH / picks;
    for (const r of rs) out.push(fcScaleRow(r, f));   // Round Y: on the loom cost basis the loom cost stays, B grade scales
  }
  return {rows: out, miss};
}
// Realisation tab (12 Nov 2026): By loom and By head group in one card, with a Loom-wise / Head-group-wise switch, its own
// period, a Profit / Realisation switch and a Running / Benchmark / Best / Target switch (second round). The bars and the
// table both follow the switch: as the looms ran, or as they would be at the reference effective RPM (fxRefRows), highest
// first; every row and bar opens its loom-days on the same footing; the running figure stays under each name for comparison.
function fxByCard(box, fabPending, rows, range, grow, colsOf, nums, redraw) {
  // 12 Nov 2026: a third figure, realisation per pick (paise), beside profit and realisation per loom per day. Round Y (Divyam,
  // 23 Nov 2026): profit on both bases, Profit (loom cost) the default on every load; the table's profit columns follow the
  // figure (per pick only when Profit (per pick) is picked). A loom or head group is never given the loom cost of unpriced looms (D3).
  // Round A3 (ask 6): the per pick basis is gone; Profit (loom cost), Realisation or Realisation per pick
  const hg = bv('fx-by') === 'hg', ref = fxByRef(), ppk = FXBYK === 'pp', lc = !ppk && FXBYK !== 'real', prof = lc;
  const fl = lc ? 'profit (loom cost basis)' : ppk ? 'realisation per pick' : 'realisation', basis = 'lc', cols = colsOf(basis);
  const ff = ppk ? (v) => ok(v) ? fxPaise(v) + ' p' : '—' : fxMoney, unit = ppk ? 'paise per pick' : 'per loom per day';
  const keyOf = hg ? (r) => r.hg + '|' + r.width : (r) => r.loom;
  const RR = ref === 'run' ? null : fxRefRows(rows, ref), src = RR ? RR.rows : rows;
  const G = fcGroup(src, keyOf), G0 = new Map(fcGroup(rows, keyOf).map((g) => [g.key, g]));
  const fig = (g) => lc ? g.profit_lc_ld : prof ? g.profit_ld : ppk ? g.real_pp : g.real_ld;
  const nLd = (g) => lc ? g.lc_ld : prof ? g.costed_ld : g.priced_ld;
  G.sort((a, b) => (fig(b) ?? -1e18) - (fig(a) ?? -1e18));
  const nm = (k) => hg ? String(k).replace('|', ' · ') + ' cm' : 'Loom ' + k, name = (g) => nm(g.key);
  const B = G.filter((g) => ok(fig(g)));   // 18 Nov 2026: every bar ranked on the Sorting basis, the first 15 drawn
  const have = new Set(G.map((g) => String(g.key))), noRef = RR ? [...G0.values()].filter((g) => !have.has(String(g.key)) && ok(fig(g))) : [];
  const seg = (lab, opts, cur, set) => el('div', {class: 'seg', role: 'group', 'aria-label': lab}, opts.map(([v, x]) => el('button', {type: 'button', 'aria-pressed': cur === v ? 'true' : 'false', text: x, onclick: () => { set(v); redraw(); }})));
  const plant = fcSum(src), pv = fig(plant);
  if (typeof wkPut === 'function') { const g = B[0];   // Round J: the first bar, on the figure the switches show
    wkPut('K11', g ? {name: name(g), what: fl + (ppk ? '' : ' in the period'), v: lc ? g.profit_lc : prof ? g.profit : ppk ? 100 * g.real : g.real, n: lc ? g.lc_ld : prof ? g.costed_ld : ppk ? g.priced : g.priced_ld, pp: ppk} : null); }
  const rl = FX_REF[ref].toLowerCase(), at = RR ? ` at ${rl} effective RPM` : '', sub = `${range.label} · ${FXBASIS}${at}`;
  const now = (g) => { const g0 = G0.get(g.key); return g0 ? ff(fig(g0)) : '—'; };
  const sortName = lc ? 'Profit per loom per day (loom cost basis)' : ppk ? 'Realisation per pick' : 'Realisation per loom per day';
  const bars = B.length ? signedBars(B.map((g) => ({label: name(g), v: fig(g), text: ff(fig(g)), onClick: () => fxDaysPanel(name(g), sub, g.rows, false),
    title: `${name(g)}: ${fl}${at} ${ff(fig(g))}${ppk ? '' : ' per loom per day'}${RR ? ` (as run ${now(g)})` : ''} over ${nLd(g)} loom-days · ${ppk ? `${fxMoney(g.real_ld)} per loom per day` : `${fxPaise(lc ? g.profit_lc_pp : prof ? g.profit_pp : g.real_pp)} paise/pick`}. Click for its loom-days.`})),
    {aria: `${lc ? 'Profit (loom cost basis)' : 'Realisation'} ${unit}${at} ${hg ? 'by head group' : 'by loom'}`, sortId: `fx-by-${hg ? 'hg' : 'loom'}-${lc ? 'lc' : FXBYK}`, limit: FXBY_ALL ? 0 : 15, sortDir: 'a', nameLabel: hg ? 'Head group' : 'Loom', sortLabel: sortName, fmt: ff, axis: ppk ? `paise realisation per pick${at}` : `₹ ${fl} per loom per day${at}`, labelW: hg ? 170 : 90, ref: ok(pv) ? {v: pv, label: `Plant ${ff(pv)}`} : null})
    : el('div', {class: 'empty', text: RR && G0.size && !G.length ? `No ${hg ? 'head group' : 'loom'} in this period has a ${rl} effective RPM${ref === 'tg' ? ' (set target RPMs on Targets)' : ''}.` : lc && plant.costed_ld ? 'No loom cost profit in this period: its costed days have no loom data, or no loom ran. Next: see Files per day on Data health, or pick Realisation.' : lc ? 'Nothing costed in this period yet: switch to Realisation, or see Coverage on this tab.' : 'Nothing priced in this period: see Coverage on this tab.'});
  const trs = G.map((g) => {
    if (!hg) return grow(el('span', {}, loomLink(g.key, range.to, 'Loom ' + g.key), RR ? el('div', {class: 'note', text: `as run ${now(g)}${ppk ? '' : '/loom/day'}`}) : null), g, false, 'Loom ' + g.key, sub, basis, false);
    const [h, w] = g.key.split('|'), tg = RR ? null : fxTargetLd(g.rows, w, h);
    const mark = g.rows.some((r) => r.fabric != null && fabPending(r.fabric));   // a change to its fabric or yarns waits in Approvals
    return grow(el('span', {}, hgLink(h, w, range.to), el('div', {class: 'note', text: `${w} cm${RR ? ` · as run ${now(g)}${ppk ? '' : '/loom/day'}` : tg ? ` · target ${fxMoney(tg.ld)}/loom/day at ${f0(tg.erpm)} effective RPM · now ${fxMoney(g.real_ld)}` : ''}`})), g, mark, name(g), sub, basis, false);
  });
  return card(hg ? 'By head group' : 'By loom', `${range.label} · ${fl}${ppk ? '' : ' per loom per day'}${at} · in the Sorting basis order${RR ? ` · bars and table at each loom-day's ${rl} effective RPM × its own run + stop minutes, at its own paise per pick${lc ? ' (the loom cost held at the day\'s, B grade scaled)' : ''}` : ''} · click a bar or row for its loom-days`,
    fxPerBar('by', redraw, null, (() => {   // Round D: the figure the card's switches show, valued as the card values it
      const figL = (L) => { const t = fcSum(RR ? fxRefRows(L, ref).rows : L); return lc ? (t.lc_ld ? t.profit_lc_ld : null) : ppk ? (t.priced ? t.real_pp : null) : (t.priced_ld ? t.real_ld : null); };
      return wkPill(wkBy(fxWkRows(fxEnd()), fxEnd(), (r) => r.date, figL, 'up'),   // the day at the top, as every other card, whatever period is picked
        {what: sortName, fmt: ppk ? fxPaise : fxMoney, unit: ppk ? 'paise' : '', basis: `${FXBASIS}${at}`});
    })()),
    el('div', {class: 'toolbar'}, bvSeg('fx-by', redraw), seg('By loom figure', [['lc', 'Profit (loom cost)'], ['real', 'Realisation'], ['pp', 'Realisation per pick']], lc ? 'lc' : FXBYK, (v) => { FXBYK = v; })),
    el('div', {class: 'toolbar'}, seg('Valued at', Object.entries(FX_REF), ref, (v) => prefSet('fx_by_ref', v))),
    bars,
    noRef.length ? el('p', {class: 'note', text: `No ${rl} effective RPM, so left out of the bars and the table: ${noRef.map((g) => nm(g.key)).join(', ')}.`}) : null,
    B.length > 15 ? el('button', {class: 'link', type: 'button', text: FXBY_ALL ? 'Show the first 15' : `Show all ${B.length} ${hg ? 'head groups' : 'looms'}`, onclick: () => { FXBY_ALL = !FXBY_ALL; redraw(); }}) : null,
    table([hg ? 'Head group' : 'Loom', ...cols.slice(1)], trs, nums));
}

// ================================================================ R2 (11 Nov 2026): realisation inside the other tabs
// Owner only, behind the analysis switch, always on the As sold basis. Every money figure sits beside the existing figure,
// never in its place; without the switch (the plant view, any other admin, or the switch off) nothing here runs and every
// tab renders exactly as before. The masters load once per sign-in; until they are in, the figures are absent and the tab
// redraws when they arrive. The analysis over every loom-day the database holds runs once per load and is cached (fxAll).
let FXALL = null;
const fxOn = () => typeof fxAnalysisOn === 'function' && fxAnalysisOn() && !!COST;
function fxLive() {
  if (!fxOn()) return null;
  if (FX) return FX;
  if (!FXP) fxLoad().then(() => { FXALL = null; if (D && !busyEditing('.tg') && !busyEditing('.assign') && !busyEditing('#gsearch') && !busyEditing('.trsearch')) { render(); if (dlg && dlg.open) drawPanel(true); } }).catch(() => {});
  return null;
}
function fxAll() {
  const F = fxLive(); if (!F) return null;
  if (FXALL && FXALL.F === F && FXALL.C === COST && FXALL.D === D) return FXALL;   // Round Y: the rows depend on the loom data too (looms running)
  const rows = fcAnalyse(Object.assign(fxInput(), {basis: FC_ASSOLD}));
  const byKey = new Map();
  for (const r of rows) {
    const k = r.date + '|' + r.loom + '|' + r.hg, o = byKey.get(k) || {picks: 0, priced: 0, costed: 0, sale: 0, real: 0, profit: 0, lc: 0, lc_picks: 0, lc_gap: null, gaps: []};
    o.picks += r.picks;
    if (r.gap) o.gaps.push(r.gap);
    else { o.priced += r.picks; o.sale += r.sale; o.real += r.real; if (r.profit != null) { o.costed += r.picks; o.profit += r.profit; }
      if (r.profit_lc != null) { o.lc_picks += r.picks; o.lc += r.profit_lc; } else if (r.lc_gap) o.lc_gap = r.lc_gap; }   // Round A4: the loom cost profit of the loom-day
    byKey.set(k, o);
  }
  for (const o of byKey.values()) { o.real_pp = o.priced ? o.real / o.priced * 100 : null; o.profit_pp = o.costed ? o.profit / o.costed * 100 : null; o.profit_lc = o.lc_picks ? o.lc : null; o.profit_lc_pp = o.lc_picks ? o.lc / o.lc_picks * 100 : null; o.gap = o.priced ? null : (o.gaps[0] || 'not priced'); }
  return (FXALL = {F, C: COST, D, rows, byKey});
}
const fxDayRows = (date) => { const A = fxAll(); return A ? A.rows.filter((r) => r.date === date) : null; };
const fxLd = (date, loom, hg) => { const A = fxAll(); return A ? A.byKey.get(date + '|' + loom + '|' + hg) || null : null; };
// Rupees of realisation for a number of picks (costing basis) on one loom-day: null when that loom-day is not priced.
const fxPicksRs = (date, loom, hg, picks) => { const o = fxLd(date, loom, hg); return o && o.real_pp != null ? picks * o.real_pp / 100 : null; };
// The realisation per pick of a head group on a day (all its priced looms), or null.
function fxHgPp(date, w, hg) {
  const rows = fxDayRows(date); if (!rows) return null;
  const R = rows.filter((r) => r.hg === hg && r.width === String(w)), t = fcSum(R), tl = fcSum(R, false);
  // Round A4 (Divyam, 24 Nov 2026): profit on the loom cost basis (By head group's figure: priced rows only, never U), and the
  // margin over loom cost: realisation above the loom cost of the loom-days with a loom cost profit
  const C = R.filter((r) => r.profit_lc != null), conv = C.reduce((a, r) => a + r.lcost, 0), realC = C.reduce((a, r) => a + r.real, 0);
  return t.priced ? {real_pp: t.real_pp, coverage: t.coverage, real_ld: t.real_ld, profit_pp: tl.lc_ld ? tl.profit_lc_pp : null, profit_ld: tl.lc_ld ? tl.profit_lc_ld : null, profit: tl.lc_ld ? tl.profit_lc : null,
    lc_ld: tl.lc_ld, lc_gaps: tl.lc_gaps, margin: conv > 0 ? (realC - conv) / conv : null, realC, conv, T: t, R} : null;
}
// Quality tab (R2): the head group's realisation and profit beside its running figures, and the margin pill.
// Round A4 (Divyam, 24 Nov 2026): Profit is on the loom cost basis (paise a pick and ₹ a loom a day), the pill is the margin
// over loom cost, and pointing at the cell gives the profit at the table's reference (mode 'bm' | 'best' | 'tgt'): each
// loom-day re-worked at its head group's reference effective RPM, the loom cost held (Round Y decision 4), B grade scaled.
// Advisory round (24 Nov 2026): the next step for a loom cost profit gap. A missing costing day, loom data or CFM reading is put right in
// Files per day on Data health; a day on which no loom ran needs another day; the fabric records lag the loom data (Coverage).
const fxLcNext = (why) => why === 'no loom ran' ? 'pick another day with the date chip' : why === 'no fabric data for the day' ? 'see Coverage on the Realisation tab' : 'see Files per day on Data health';
function fxHgCells(date, w, hg, mode) {
  if (!fxOn()) return null;
  if (!fxAll()) return [el('td', {class: 'num'}, el('span', {class: 'note', text: '…'})), el('td', {class: 'num'})];
  const h = hg === 'Unassigned' ? null : fxHgPp(date, w, hg);
  if (!h) return [el('td', {class: 'num'}, el('span', {class: 'pill muted', text: 'not priced', title: 'No priced loom-day for this head group on this day: see Coverage on the Realisation tab'})), el('td', {class: 'num'})];
  const marg = h.margin == null ? null : el('span', {class: 'pill ' + (h.margin >= 0 ? 'good' : 'bad'), title: 'Margin over loom cost: the realisation above the loom cost of the loom-days with a loom cost profit, as a % of that loom cost', text: `${h.margin >= 0 ? '+' : '−'}${Math.abs(h.margin * 100).toFixed(0)}% over loom cost`});
  const nm = {bm: 'benchmark', best: 'best', tgt: 'target'}[mode] || 'benchmark', RR = h.profit_ld == null ? null : fxRefRows(h.R, mode === 'tgt' ? 'tg' : mode || 'bm'), ref = RR ? fcSum(RR.rows, false) : null;
  const miss = RR && RR.miss ? ` · ${RR.miss} loom-day${RR.miss === 1 ? '' : 's'} with no ${nm} effective RPM or minutes left out` : '';
  const tip = h.profit_ld == null ? null : `${hg}, ${w} cm · Profit (loom cost)\nCurrent: ${fxPaise(h.profit_pp)} paise/pick · ${fxMoney(h.profit_ld)} a loom a day\n${nm.charAt(0).toUpperCase() + nm.slice(1)}: ${ref && ref.lc_ld ? `${fxPaise(ref.profit_lc_pp)} paise/pick · ${fxMoney(ref.profit_lc_ld)} a loom a day (each loom at its ${nm} effective RPM, the loom cost held${miss})` : `none (no ${nm} effective RPM to compare with). Next: ${mode === 'tgt' ? 'set its target RPM on Targets' : 'use another reference above the table'}.`}`;
  const why = Object.keys(h.lc_gaps || {})[0];
  return [el('td', {class: 'num'}, el('div', {class: 'mv'}, el('div', {class: 'v', text: fxPaise(h.real_pp)}), el('div', {class: 'ref', text: `${fxMoney(h.real_ld)} /loom/day${h.coverage < 1 - 1e-9 ? ` · ${fxPct(h.coverage)} priced` : ''}`}))),
    el('td', {class: 'num', 'data-sort': h.profit_pp == null ? null : String(h.profit_pp)}, el('div', {class: 'mv', 'data-htip': tip}, el('div', {class: 'v', text: h.profit_pp == null ? '—' : fxPaise(h.profit_pp)}),
      el('div', {class: 'ref', text: h.profit_pp == null ? (why || 'no costing day') + '. Next: ' + fxLcNext(why || 'no costing day') : `${fxMoney(h.profit_ld)} /loom/day`}), marg ? el('div', {}, marg) : null))];
}
// Quality, Current vs reference (13 Nov 2026): total loom realisation = looms ran × the head group's realisation per loom-day.
// Unpriced looms are not guessed: with fewer priced, the cell shows the priced looms' total and says how many.
function fxHgTotalCell(date, w, hg, looms) {
  if (!fxOn()) return null;
  if (!fxAll()) return el('td', {class: 'num'}, el('span', {class: 'note', text: '…'}));
  const h = hg === 'Unassigned' ? null : fxHgPp(date, w, hg), T = h ? fcLoomTotal(looms, h.real_ld, h.T.priced_ld) : null;
  if (!T) return el('td', {class: 'num'}, el('span', {class: 'pill muted', text: 'not priced', title: 'No priced loom-day for this head group on this day: see Coverage on the Realisation tab'}));
  if (typeof wkPut === 'function' && !WKD.C2) wkPut('C2', {hg, looms, ld: h.real_ld, priced: T.priced, full: T.full});   // Round J: the first priced head group
  if (typeof wkPut === 'function' && !WKD.C3 && h.margin != null) wkPut('C3', {hg, real: h.realC, conv: h.conv});
  return el('td', {class: 'num', 'data-sort': String(Math.round(T.rs))}, el('div', {class: 'mv'}, el('div', {class: 'v', text: fxMoney(T.rs)}),
    el('div', {class: 'ref', text: T.full ? `${looms} × ${fxMoney(h.real_ld)}` : `${T.priced} of ${looms} looms priced`, title: T.full ? null : 'Only the priced looms are counted; the rest are a gap in the realisation analysis, not guessed'})));
}
// A money cell beside an existing figure: rupees, or a "not priced" pill (a gap, never ₹0); '…' while the masters load.
function fxRsCell(rs, o) {
  if (!fxOn()) return null;
  if (!fxAll()) return el('span', {class: 'note', text: '…'});
  if (rs == null) return el('span', {class: 'pill muted', text: o && o.why ? o.why : 'not priced', title: 'This loom-day is a gap in the realisation analysis: see Coverage on the Realisation tab'});
  return el('span', {class: o && o.cls ? o.cls : null, text: fxMoney(rs)});
}
const fxRsNote = (rs, what) => rs == null ? '' : ` (${fxMoney(rs)} of realisation ${what || 'lost'})`;
// Actions (12 Nov 2026, replaces the "In rupees" strip): two tiles beside the KPIs. Realisation per pick on the day shown,
// weighted by each quality's picks (= the day's realisation ÷ its priced picks; owner with the analysis on), with the two
// biggest qualities in the mix; and the day's cost per pick (the Costing tab's headline, incl. cut piece loss, whole plant).
// Each has the delta against the days before and the 7-day line, like the other tiles.
function fxActionTiles(kpi, last7, spk) {
  const out = [], pr = priorDates();
  if (fxOn()) {
    const A = fxAll();
    const T = (dates) => A ? fcSum(A.rows.filter((r) => dates.includes(r.date) && inW(r.width))) : null;
    const cur = T([D.latest]), prv = pr.length ? T(pr) : null;
    const mix = A ? fcQualityMix(A.rows.filter((r) => r.date === D.latest && inW(r.width))) : null;
    const top = mix ? mix.mix.slice(0, 2).map((m) => `${m.key.split('|')[0]} ${fxPct(m.share)} at ${fxPaise(m.real_pp)}`).join(' · ') : '';
    const has = cur && cur.priced > 0;
    if (typeof wkPut === 'function') wkPut('B2:real', has ? {real: cur.real, picks: cur.priced} : null);   // Round J
    out.push(actTap(kpi('Realisation per pick', !A ? '…' : has ? fxPaise(cur.real_pp) : '—', has ? 'paise' : '', has && prv && prv.priced ? delta(cur.real_pp, prv.real_pp, true, (x) => x.toFixed(2), ' paise') : null,
      !A ? 'loading the fabric masters' : has ? `weighted by each quality's picks · ${top}${cur.coverage < 1 - 1e-9 ? ` · ${fxPct(cur.coverage)} of picks priced` : ''}` : 'nothing priced on this day',
      spk(last7.map((d) => { const t = T([d]); return t && t.priced ? t.real_pp : null; }), f2, 'Realisation per pick, paise')), 'real'));   // Round A1: opens Realisation per pick by quality
  }
  if (COST && typeof cDays === 'function') {
    const C = cDays(), byD = new Map(C.map((d) => [d.date, d])), cd = byD.get(D.latest), last = C.filter((d) => d.date <= D.latest).slice(-1)[0];
    // folded cost per pick (Divyam, 12 Nov 2026): the prior-days figure is weighted by A-grade folded picks, as on Costing
    const P = C.filter((d) => pr.includes(d.date) && ok(d.fcpp) && d.afold > 0), pw = P.reduce((a, d) => a + d.afold, 0);
    const prev = pw ? P.reduce((a, d) => a + d.fcpp * d.afold, 0) / pw : null, has = cd && ok(cd.fcpp);
    if (typeof wkPut === 'function') wkPut('B2:fold', has ? {fcpp: cd.fcpp, afold: cd.afold, cut: cd.cut, bl: cd.bgrade && cd.bgrade.loss, brev: cd.bgrade && cd.bgrade.rev} : null);   // Round J
    const ft = kpi('Folded cost per pick', has ? pn(cd.fcpp, 2) : '—', has ? 'paise' : '', has ? delta(cd.fcpp, prev, false, (x) => x.toFixed(2), ' paise') : null,
      has ? `whole plant, per A-grade folded pick, as on Costing · normal ${pn(cd.cpp, 2)}` : `no costing day for ${dfmt(D.latest)} yet${last && ok(last.fcpp) ? ` · ${dfmt(last.date)}: ${pn(last.fcpp, 2)} paise` : ''}`,
      spk(last7.map((d) => byD.has(d) ? byD.get(d).fcpp : null), f2, 'Folded cost per pick, paise'));
    out.push(fxOn() ? actTap(ft, 'fq') : ft);   // Round A3 (item 8): the owner's tile opens Folded cost per pick by quality
  }
  return out;
}
// Round F (Divyam, 18 Nov 2026): Target realisation per pick and Target profit per pick, owner only (fxOn), not clickable,
// on Actions beside Target cost per pick. Same day, As sold, all widths. Realisation: each loom-day's target picks (its picks
// + the extra picks at target effective RPM) × its own realisation per pick (fcTargetReal), a mix effect only. Profit: that
// − the target folded cost per pick (targetFolded: the corrected costing's folded cost with the same savings, extra picks
// and added costs, no B grade and no cut pieces, A-grade folded picks = target picks × (1 − folding shortage)).
function fxTargetTiles(kpi, tc, fs) {
  if (typeof wkPut === 'function') { wkPut('B5:real', null); wkPut('B5:profit', null); wkPut('B5:rs', null); }   // Round J: nothing from an earlier draw while loading
  if (!fxOn()) return [];
  const rows = fxDayRows(tc.date || D.latest);
  if (!rows) return [kpi('Target profit per pick', '…', '', null, 'loading the fabric masters; if this stays, press Refresh (the round arrow)')];
  const ex = new Map();
  for (const x of tc.looms || tcLooms(tc.date || D.latest)) { const k = x.loom + '|' + x.hg, v = ex.has(k) ? ex.get(k) : 0, e = tcExtraFab(x); ex.set(k, v == null || e == null ? null : v + e / FC_PICKS_PER_INCH); }
  const T = fcTargetReal(rows, (r) => ex.has(r.loom + '|' + r.hg) ? ex.get(r.loom + '|' + r.hg) : null), now = fcSum(rows);
  if (typeof wkPut === 'function') { wkPut('B5:real', ok(T.pp) ? {num: T.num, tp: T.tp, now: now.real_pp} : null); wkPut('B5:profit', null); }   // Round J
  // Round A1 (Divyam, 24 Nov 2026): the Target realisation per pick tile is gone; its figure stays inside Target profit per pick
  const date = tc.date || D.latest, out = [];
  if (!tc.ok) { out.push(kpi('Target profit per pick', '—', '', null, `${tcUnavail(date)}. Next: see Files per day on Data health.`)); return out; }
  // Round A4 (Divyam, 24 Nov 2026): the target folded cost on the loom cost basis: the day's loom cost total (Round A3: corrected
  // POWER + 2 paise a pick) less its cut piece loss, less the CFM and pressure savings, plus the growing costs, no B grade;
  // over the target A-grade folded picks (the folding shortage kept, answer 2 b)
  const fday = (COST.days || []).find((d) => d.date === date), L = ((fxAll() || {}).rows || {}).lday ? fxAll().rows.lday[date] : null;
  const TF = fday ? fcTargetFoldLc(L, tc, fday.picks * 1e5, tc.E, fs && fs.s) : null, tf = TF ? TF.pp : null, pr = fcTargetProfit(T.pp, tf);
  if (typeof wkPut === 'function' && ok(pr)) wkPut('B5:profit', {tr: T.pp, total: L.total, cut: L.cut || 0, Sc: tc.Sc || 0, Sp: tc.Sp || 0, Add: tc.Add, P: fday.picks * 1e5, E: tc.E, s: fs.s});   // Round J: the parts of fcTargetFoldLc
  const R$ = ok(pr) ? fcTargetProfitRs(pr, fday.picks * 1e5, tc.E, fs.s) : null;
  if (typeof wkPut === 'function') wkPut('B5:rs', R$ ? {pp: pr, P: fday.picks * 1e5, E: tc.E, s: fs.s} : null);
  out.push(ok(pr)
    ? kpi('Target profit per pick', fxPaise(pr), 'paise', null, `As sold · target realisation ${fxPaise(T.pp)} − target folded cost ${pn(tf, 2)} (loom cost basis: the day's loom cost less the CFM and pressure savings, no B grade or cut pieces, folding shortage ${f1(fs.s * 100)}% month to date) · ${fxPct(T.coverage)} of picks${tcGapText(tc).length ? ` · ${tcGapText(tc).length} part${tcGapText(tc).length === 1 ? '' : 's'} left out, see Where the saving is` : ''}`,
      R$ ? el('div', {class: 'note tpabs', text: `Target: ${fwR(R$.rs)} in the day on ${fxLakh(R$.afold)} lakh A-grade folded picks (every target pick taken as A grade, less the ${f1(fs.s * 100)}% folding shortage; no B grade loss assumed)${T.coverage < 1 - 1e-9 ? `; the profit per pick is worked on the ${fxPct(T.coverage)} of picks priced and with a target` : ''}`}) : null)
    : kpi('Target profit per pick', '—', '', null, !ok(fs && fs.s) ? 'needs the folding shortage: no costing day this month has all its figures yet. Next: see Files per day on Data health.' : !ok(tf) ? `no loom cost for ${dfmt(date)}: that day's costing has no folded cost per pick or folded picks. Next: see Files per day on Data health.` : `needs the target realisation per pick: no loom that ran is both priced and has a target RPM. Next: see Coverage on the Realisation tab, and set targets on Targets.`));
  return out;
}
// The break-even per loom per day on one date, shared by the Actions Break-even realisation tile (Round A1; the chart before it) and (Round W, 20 Nov 2026) the Realisation
// tab's Break-even realisation tile: (total expenses + cut piece loss, Costing) ÷ the looms running that day. No costing day
// = cost and be null (a gap, never 0); wk = the figures the Working (B7, K7:be) works its line from.
function fxBreakEven(date) {
  // Round Y, D1 a (Divyam, 23 Nov 2026): the loom cost basis's own pool, (OPEX + cut piece loss + net B grade) on the corrected
  // costing (COST.days, as profit; not the As entered switch), so realisation a loom − break-even = Profit (loom cost basis) a
  // loom when every loom is priced
  const cd = ((COST && COST.days) || []).find((d) => d.date === date);
  const running = new Set((D.loomdays || []).filter((x) => x.date === date && x.run > 0).map((x) => x.loom)).size;
  const C = cd ? fcBeCost(cd) : null, cost = C ? C.total : null, be = fcBreakEven(cost, running);
  return {cd, C, running, cost, be, wk: cost != null ? {cost, pool: C.pool - C.add, add: C.add, bnet: C.bnet, looms: running} : null};
}
// ---------------------------------------------------------------- Round A1 (Divyam, 24 Nov 2026): Actions, owner only
// The Break-even realisation tile on Actions: the same figure as the Realisation tab's tile (fxBreakEven), on the date chip's
// day, with its 7-day line; it opens Break-even realisation by day (fxBeTrendCard).
function fxBeActTile(kpi, last7, spk) {
  if (!fxOn()) return null;
  const B = fxBreakEven(D.latest), has = ok(B.be);
  if (typeof wkPut === 'function') wkPut('B7', B.wk);
  const why = !B.cd ? `no costing for ${dfmt(D.latest)} yet: it shows once that day's costing file is read. Next: see Files per day on Data health.`
    : !B.C ? `the costing for ${dfmt(D.latest)} has no folded cost per pick or no A-grade folded picks. Next: see Files per day on Data health.`
    : `no loom ran on ${dfmt(D.latest)}, so there is nothing to share the cost over. Next: pick another day with the date chip.`;
  const t = kpi('Break-even realisation', has ? fxMoney(B.be) : '—', has ? 'a loom a day' : '', null,
    has ? fxBeWords(B) : why,
    spk(last7.map((d) => fxBreakEven(d).be), fxMoney, 'Break-even realisation, ₹ a loom a day'));
  t.classList.add('actbe');
  return actTap(t, 'be');
}
let FXBEPER = 'mtd';
try { const v = JSON.parse(localStorage.getItem('w2-act-be-period') || 'null'); if (['7', '14', '30', 'mtd', 'range'].includes(v)) FXBEPER = v; } catch (e) {}   // a choice only, kept with lsSet (no masters on the device)
// Break-even realisation by day: every costing day up to the date chip's day with its break-even (fxBreakEven, corrected
// costing), its own period (month to date to begin with), the period's average (Σ cost ÷ Σ looms running) as a line, and a
// week line on the same average. A costing day with no loom running, or no folded cost, is left out and named.
function fxBeTrendCard() {
  if (!fxOn()) return null;
  const title = ACTV.be[0], sub = 'Owner only · (operating expenses + cut piece loss, corrected costing, + 2 paise a pick + net B grade) ÷ looms running, day by day';
  const all = ((COST && COST.days) || []).filter((d) => d.date <= D.latest).map((d) => ({d: d.date, B: fxBreakEven(d.date)}));
  if (!all.length) return card(title, sub, el('p', {class: 'empty', text: 'No costing day up to the day shown yet. Next: see Files per day on Data health.'}));
  const ds = all.map((r) => r.d), inR = FXBEPER === 'range' ? new Set(rngDays(ds)) : null, ym = D.latest.slice(0, 7);
  const per = FXBEPER === 'mtd' ? all.filter((r) => r.d.slice(0, 7) === ym) : inR ? all.filter((r) => inR.has(r.d)) : all.slice(-(+FXBEPER));
  const rows = per.filter((r) => ok(r.B.be)), out = per.filter((r) => !ok(r.B.be));
  const avg = (L) => { const c = L.reduce((a, r) => a + r.B.cost, 0), n = L.reduce((a, r) => a + r.B.running, 0); return n > 0 ? c / n : null; };
  const b = (v, t, sh) => el('button', {type: 'button', 'aria-pressed': FXBEPER === v ? 'true' : 'false', 'aria-label': t, onclick: () => { FXBEPER = v; lsSet('w2-act-be-period', v); render(); }}, el('span', {class: 'lgl', text: t}), el('span', {class: 'sml', text: sh || t}));
  const ok7 = all.filter((r) => ok(r.B.be));
  const bar = el('div', {class: 'toolbar perbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Period'}, b('7', '7 days', '7d'), b('14', '14 days', '14d'), b('30', '30 days', '30d'), b('mtd', 'Month to date', 'MTD'), b('range', 'Dates')),
    FXBEPER === 'range' ? rngCtl(ds, render) : null, per.length ? el('span', {class: 'note', text: `${FXBEPER === 'mtd' ? 'Month to date: ' : ''}${dfmt(per[0].d)} – ${dfmt(per.at(-1).d)} · ${rows.length} of ${per.length} costing day${per.length === 1 ? '' : 's'}`}) : null,
    wkPill(wkBy(ok7, D.latest, (r) => r.d, avg, 'down'), {what: 'Break-even realisation (Σ cost ÷ Σ looms running)', fmt: fxMoney, unit: 'a loom a day'}));
  const A = avg(rows);
  const chart = rows.length ? lineChart({dates: rows.map((r) => r.d), aria: 'Break-even realisation, ₹ a loom a day, day by day', fmt: fxMoney,
    refs: ok(A) ? [{v: A, label: `Period average ${fxMoney(A)}`}] : [], series: [{name: 'Break-even realisation, ₹ a loom a day', vals: rows.map((r) => r.B.be)}]})
    : el('p', {class: 'empty', text: 'No day in this period has a break-even: pick a longer period.'});
  const tb = rows.length ? actTable('be', ['Date', ['Looms', 'running'], ['Cost', '₹, the day'], ['Break-even', '₹ a loom a day']],
    rows.slice().reverse().map((r) => [[dfmt(r.d), r.B.running, fxMoney(r.B.cost), fxMoney(r.B.be)], [r.d, r.B.running, r.B.cost, r.B.be]]), [1, 2, 3],
    [el('b', {text: 'Period'}), `${rows.reduce((a, r) => a + r.B.running, 0)} loom-days`, fxMoney(rows.reduce((a, r) => a + r.B.cost, 0)), el('b', {text: fxMoney(A)})]) : null;
  const last = rows.at(-1);
  return card(title, sub, last ? el('p', {class: 'note', text: `${dfmt(last.d)}: ${fxMoney(last.B.be)} a loom a day (${fxMoney(last.B.cost)} ÷ ${last.B.running} looms running). Period average ${fxMoney(A)} a loom a day: the period's cost ÷ its loom-days running, so a day with more looms weighs more.`}) : null,
    bar, chart, tb,
    out.length ? el('p', {class: 'note', text: `Left out: ${out.map((r) => `${dfmt(r.d)} (${!r.B.C ? 'no folded cost per pick or no A-grade folded picks on its costing' : 'no loom running'})`).join(', ')}. Next: see Files per day on Data health.`}) : null,
    el('p', {class: 'note', text: 'Break-even realisation = what each running loom has to realise in a day to cover the day\'s cost: the same figure as the tile and as Break-even realisation on the Realisation tab. A day without its costing file is not a costing day and is not drawn.'}));
}
// Realisation per pick by quality: the day's priced picks, quality by quality (As sold), with the floor's figure as a line.
// A quality with nothing priced is named under the chart with its reason, never drawn as 0.
function fxRealQCard() {
  if (!fxOn()) return null;
  const title = ACTV.real[0], A = fxAll(), sub = `${dfmt(D.latest)} · ${wLabel()} · As sold`;
  if (!A) return card(title, sub, el('p', {class: 'note', text: 'Loading the fabric masters… If this stays, press Refresh (the round arrow).'}));
  const rows = A.rows.filter((r) => r.date === D.latest && inW(r.width)), T = fcSum(rows);
  const G = fcGroup(rows, (r) => r.hg + '|' + r.width).map((g) => { const [hg, width] = g.key.split('|'); return {...g, hg, width}; });
  const P = G.filter((g) => g.priced > 0).sort((a, b) => b.priced - a.priced), gaps = G.filter((g) => !(g.priced > 0));
  const cov = el('button', {class: 'link', type: 'button', text: 'Coverage on the Realisation tab ›', onclick: () => navGoCard('realisation', 'Coverage')});
  if (!P.length) return card(title, sub, el('p', {class: 'empty', text: 'Nothing priced on this day.'}), cov);
  const why = (g) => { const r = g.rows.find((x) => x.gap); return r ? r.gap : 'not priced'; };
  return card(title, `${sub} · each quality's realisation ÷ its priced picks`,
    signedBars(P.map((g) => ({label: `${g.hg} · ${g.width}`, v: g.real_pp, text: fxPaise(g.real_pp), color: ok(T.real_pp) && g.real_pp < T.real_pp ? 'var(--bad)' : 'var(--bar)', onClick: () => openHg(g.hg, g.width, D.latest),
      title: `${g.hg}, ${g.width} cm: ${fxPaise(g.real_pp)} paise a pick, ${fxMoney(g.real)} over ${fxLakh(g.priced)} lakh priced picks (${fxPct(T.priced ? g.priced / T.priced : null)} of the day's priced picks)`})),
      {aria: 'Realisation per pick by quality', fmt: fxPaise, axis: 'Realisation per pick, paise', labelW: 150, limit: 15, nameLabel: 'Head group', sortLabel: 'Realisation per pick', ref: ok(T.real_pp) ? {v: T.real_pp, label: `Floor ${fxPaise(T.real_pp)}`} : null}),
    el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad)'}), 'below the floor\'s realisation per pick'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bar)'}), 'at or above it'), el('span', {class: 'lg'}, legendShape('dash'), 'the floor')),
    actCut(P.length, 15, 'qualities'),
    actTable('real', ['Head group', ['Priced picks', 'lakh'], ['Share', 'of priced picks'], ['Realisation per pick', 'paise'], ['Realisation', '₹, the day']],
      P.map((g) => [[actHgCell(g), fxLakh(g.priced), fxPct(T.priced ? g.priced / T.priced : null), fxPaise(g.real_pp), fxMoney(g.real)], [g.hg, g.priced, g.priced, g.real_pp, g.real]]), [1, 2, 3, 4],
      [el('b', {text: 'Total'}), fxLakh(T.priced), '100%', el('b', {text: fxPaise(T.real_pp)}), fxMoney(T.real)]),
    gaps.length ? el('p', {class: 'note', text: `Not priced (left out, never 0): ${gaps.map((g) => `${g.hg} · ${g.width} (${why(g)})`).join('; ')}.`}) : null,
    el('p', {class: 'note', text: 'Realisation = sale value at the prevailing rate less the standard yarn cost (As sold: each head group on its default record, greige where linked, else RFD). The Total row is the tile: the day\'s realisation ÷ its priced picks.'}), cov);
}
// Round A3, item 8 (Divyam, 24 Nov 2026): Folded cost per pick by quality, opened from the Folded cost per pick tile (owner).
// Each quality (head group × width, both widths: the cost is the whole plant's) on the loom cost method (fcFoldByQuality):
// its loom cost and own B grade ÷ its A-grade folded picks (its picks × (1 − the month-to-date folding shortage, the same for
// every quality) − its B grade picks − its share of the cut piece picks), for the day on the date chip and month to date;
// 190 cm, 280 cm and both widths together (Σ cost ÷ Σ A-grade folded picks). No line against the floor's tile (Divyam).
// The inputs of fcFoldByQuality for the day on the date chip (Round A3; shared with the Quality grid, Round A4): the B grade
// register, the month-to-date folding shortage, each day's cut piece picks and floor PICK, and the analysis rows from a date.
function fxFoldIn(date) {
  const A = fxAll(), bq = COST.bq || {}, reg = bq.reg || [], regDays = (bq.days || []).filter((d) => d.reg).map((d) => d.date), days = tcDays();
  const fs = foldShort(days, reg, regDays, date), s = fs ? fs.s : null, fold = {};
  for (const x of foldDays(days, reg, regDays, date)) { const cd = days.find((d) => d.date === x.date); if (!x.why && cd && cd.metres > 0) fold[x.date] = {C: x.C, w: cd.picks * 1e5 / cd.metres}; }
  const pick = (from) => { const R = A.rows.filter((r) => r.date >= from && r.date <= date); R.lday = A.rows.lday; return R; };
  return {reg, fs, s, fold, pick};
}
// Round A4 (Divyam, 24 Nov 2026): the Quality grid's Folded cost per pick cell. The head group's folded cost per pick on the
// day (fcFoldByQuality, the loom cost method) against the same loom-days at its reference effective RPM: each loom-day's
// picks × (reference effective RPM × its run + stop minutes × panna ÷ 39.37 ÷ its picks), the loom cost held, B grade and
// cut piece picks scaled. The cell is the % gap (lower is better); pointing shows both figures. mode 'bm' | 'best' | 'tg'.
let FXFQ = null;
function fxHeatFold(date, w, hg, mode) {
  if (!fxOn()) return null;
  const A = fxAll(), head = `${hg}, ${w} cm · Folded cost per pick (loom cost method)`;
  if (!A) return {none: '…', tip: 'Loading the realisation analysis'};
  if (hg === 'Unassigned') return {none: 'no head group', tip: `${head}\nNext: assign a head group (Needs a head group on Actions).`};
  const key = date + '|' + mode;
  if (!FXFQ || FXFQ.A !== A) FXFQ = {A, m: new Map()};
  if (!FXFQ.m.has(key)) {
    const {reg, s, fold, pick} = fxFoldIn(date), M = fxMinutes(), P = (r) => r.synth ? (r.lpicks || 0) : (r.picks || 0);
    const lp = new Map();   // the loom-day's picks for its head group (a changeover loom-day scales each head group on its own minutes)
    for (const r of pick(date)) { const k = r.date + '|' + r.loom + '|' + r.hg; lp.set(k, (lp.get(k) || 0) + P(r)); }
    const scale = (r) => { const k = r.date + '|' + r.loom + '|' + r.hg, e = fxRefErpm(r.width, r.hg, mode), min = M.get(k), p = lp.get(k);
      return !ok(e) ? null : min > 0 && p > 0 ? e * min * pf(r.width, r.hg) / FC_PICKS_PER_INCH / p : 1; };   // no picks or no minutes: nothing to re-work, it stays as it is
    FXFQ.m.set(key, ok(s) ? {s, now: fcFoldByQuality(pick(date), reg, fold, s, date, date), ref: fcFoldByQuality(pick(date), reg, fold, s, date, date, scale)} : {s: null});
  }
  const F = FXFQ.m.get(key), name = {bm: 'benchmark', best: 'best', tg: 'target'}[mode], Nm = name.charAt(0).toUpperCase() + name.slice(1);
  if (!ok(F.s)) return {none: 'no shortage', tip: `${head}\nNo folding shortage for this month yet (no costing day has all its figures), so no A-grade folded picks to divide by.\nNext: ${tcNext()}.`};
  const out = F.now.out.find((o) => o.date === date);
  if (out) return {none: 'no figure', tip: `${head}\n${dfmt(date)} has no figure: ${out.why}.\nNext: ${tcNext()}.`};
  const g = F.now.groups.find((x) => x.hg === hg && x.width === String(w)), r = F.ref.groups.find((x) => x.hg === hg && x.width === String(w));
  if (!g) return {none: 'no loom cost', tip: `${head}\nNo loom of this head group has a loom cost on ${dfmt(date)}.\nNext: see Coverage on the Realisation tab.`};
  const lo = g.noair ? `\n${g.noair} loom-day${g.noair === 1 ? '' : 's'} left out: no CFM reading (its compressor part is not known). Next: ${tcNext()}.` : '';
  if (!ok(g.pp)) return {none: g.noair && !(g.ld > 0) ? 'no CFM reading' : 'no A-grade picks', tip: `${head}\nCurrent: none (${g.noair && !(g.ld > 0) ? 'every loom-day ran with no CFM reading' : 'B grade and cut pieces took more than its folded share'})${lo || `\nNext: check the day's B grade and cut piece figures; ${tcNext()}.`}`};
  const cur = `Current: ${pn(g.pp, 2)} paise`;
  const refNext = mode === 'tg' ? 'Next: set its target RPM on Targets.' : `Next: the ${name} comes with more loom-days of this head group; meanwhile use another reference above the grid.`;
  if (!r || !ok(r.pp) || r.noref) return {none: `no ${name}`, tip: `${head}\n${cur}\n${Nm}: none (no ${name} effective RPM to compare with)\n${refNext}${lo}`};
  const G = gapPct(g.pp, r.pp, false);
  if (!G) return {none: 'no figure', tip: `${head}\n${cur}\n${Nm}: ${pn(r.pp, 2)} paise\nNext: see Coverage on the Realisation tab.${lo}`};
  const txt = `${Math.abs(G.p) < 0.05 ? '±' : G.p > 0 ? '+' : '−'}${Math.abs(G.p).toFixed(1)}%`;
  if (typeof wkPut === 'function' && !WKD.C5) wkPut('C5', {hg: `${hg}, ${w} cm`, now: g.pp, ref: r.pp, name, cost: g.cost, A: g.A, rcost: r.cost, rA: r.A});   // Round A4: the first head group with both
  return {text: txt, level: heatLevel(G.p), tone: Math.abs(G.p) < 0.05 ? 'none' : G.worse ? 'bad' : 'good',
    tip: `${head}\n${cur}\n${Nm} (each loom at its ${name} effective RPM, the loom cost held): ${pn(r.pp, 2)} paise (${txt})${lo}\nClick to open the head group.`,
    onClick: () => openHg(hg, w, date)};
}
function fxFoldQCard() {
  if (!fxOn() || !COST) return null;
  const title = ACTV.fq[0], A = fxAll(), sub = `${dfmt(D.latest)} and month to date · both widths · loom cost method`;
  if (!A) return card(title, sub, el('p', {class: 'note', text: 'Loading the fabric masters… If this stays, press Refresh (the round arrow).'}));
  const {reg, fs, s, fold, pick} = fxFoldIn(D.latest);
  if (!ok(s)) return card(title, sub, el('p', {class: 'empty', text: `No folding shortage for this month yet (no costing day has all its figures), so there is no A-grade folded picks figure to divide by. Next: ${tcNext()}.`}));
  const m0 = D.latest.slice(0, 7) + '-01', Fd = fcFoldByQuality(pick(D.latest), reg, fold, s, D.latest, D.latest), Fm = fcFoldByQuality(pick(m0), reg, fold, s, m0, D.latest);
  const mOf = new Map([...Fm.groups, ...Fm.widths, Fm.all].map((g) => [g.key, g]));
  // Round A4 (Divyam, 24 Nov 2026, answer 1 a): a loom-day with no CFM reading is left out of its quality and named; the rest stands
  const lo = (g) => g.noair ? ` · ${g.noair} loom-day${g.noair === 1 ? '' : 's'} left out` : '';
  const pp = (g) => !g ? '—' : ok(g.pp) ? (g.noair ? el('span', {}, pn(g.pp, 2), el('div', {class: 'note', text: lo(g).slice(3)})) : pn(g.pp, 2))
    : el('span', {class: 'note', text: g.noair && !(g.ld > 0) ? `— no CFM reading. Next: ${tcNext()}` : `— no A-grade picks left. Next: check the day's B grade and cut piece figures; ${tcNext()}`});
  const noair = [...Fd.groups, ...Fm.groups].some((g) => g.noair);
  const name = (g) => g.hg ? hgLink(g.hg, g.width, D.latest, `${g.hg} · ${g.width}`) : el('b', {text: g.key});
  const row = (g, tot) => [[name(g), fxLakh(g.picks), fxMoney(g.cost), fxLakh(g.A), tot ? el('b', {}, pp(g)) : pp(g), pp(mOf.get(g.key))], [g.hg || g.key, g.picks, g.cost, g.A, g.pp, (mOf.get(g.key) || {}).pp]];
  const dayOut = Fd.out.find((o) => o.date === D.latest);
  const top = Fd.groups.find((g) => ok(g.pp));
  if (typeof wkPut === 'function') wkPut('B2:fq', top ? {hg: `${top.hg} · ${top.width}`, cost: top.cost, picks: top.picks, s, B: top.B, C: top.C} : null);
  const heads = ['Head group', ['Picks', 'lakh'], ['Loom cost + B grade', '₹, the day'], ['A-grade folded', 'lakh picks'], ['Folded cost per pick', 'paise, the day'], ['Month to date', 'paise']];
  return card(title, sub,
    el('p', {class: 'note', style: 'background:var(--accent-soft);color:var(--accent-ink);padding:8px 10px;border-radius:8px', text: `The folding shortage is applied equally to every quality: ${(100 * s).toFixed(1)}%, month to date (${fs.days} of ${fs.of} days), taken off each quality's picks before its own B grade and cut piece picks.`}),
    dayOut ? el('p', {class: 'note', text: `${dfmt(D.latest)} has no figure of its own: ${dayOut.why}. Next: ${tcNext()}. The month to date column still shows the days that have one.`}) : null,
    Fd.groups.length ? actTable('fq', heads, [...Fd.groups.map((g) => row(g)), ...Fd.widths.map((g) => row(g, true))], [1, 2, 3, 4, 5], row(Fd.all, true)[0])
      : Fm.groups.length ? actTable('fq', heads, [...Fm.groups.map((g) => [[name(g), '—', '—', '—', '—', pp(g)], [g.hg, null, null, null, null, g.pp]])], [1, 2, 3, 4, 5], [el('b', {text: 'Both widths'}), '—', '—', '—', '—', el('b', {}, pp(Fm.all))])
      : el('p', {class: 'empty', text: `No day this month has a loom cost yet. Next: ${tcNext()}.`}),
    noair ? el('p', {class: 'note', text: `"left out": a loom of that quality ran with no CFM reading that day, so its compressor part is not known; that loom-day is left out of the quality, its width and Both widths (its cost and its picks), and the rest of the quality stands. "— no CFM reading": every loom-day of the quality was left out. Next: ${tcNext()}.`}) : null,
    Fm.out.length ? el('p', {class: 'note', text: `Left out of the month to date (never counted as 0): ${Fm.out.map((o) => `${dfmt(o.date)} (${o.why})`).join(', ')}. Next: ${tcNext()}.`}) : null,
    el('p', {class: 'note', text: 'Loom cost: the compressor by each loom\'s air, the rest of POWER (corrected) + 2 paise a pick + the cut piece loss by picks, and every other head ÷ the looms running that day; then each quality\'s own B grade, net of B grade revenue. A-grade folded picks = picks × (1 − the folding shortage) − its B grade picks (register metres × its picks per metre) − its share of the cut piece picks. The width and Both widths rows add up their qualities\' cost and divide by their A-grade folded picks added up. Tap = beside the title for the working with a worked example.'}));
}
// Quality tab (12 Nov 2026): each loom's own realisation in its head group's drill-down, beside its running figures.
function fxLoomRealCell(x) {
  if (!fxAll()) return fxRsCell(null);
  const o = fxLd(x.date, x.loom, x.hg);
  if (!o || o.real_pp == null) return fxRsCell(null);
  return el('div', {class: 'mv'}, el('div', {class: 'v', text: fxMoney(o.real)}), el('div', {class: 'ref', text: `${fxPaise(o.real_pp)} paise/pick${o.priced < o.picks - 1e-9 ? ` · ${fxPct(o.priced / o.picks)} priced` : ''}`}));
}
// Costing tab (R2): the profit layer. Realisation per pick against cost per pick by day, with the B grade loss per good
// pick and profit per pick, on the Cost per pick chart's own period (dayChart 'cpp'); and the closing stock valued at the
// month's average sale value per metre.
function fxCostChart(P, pre) {
  if (!fxOn()) return null;
  const A = fxAll();
  const by = new Map();
  if (A) for (const r of A.rows) { if (!by.has(r.date)) by.set(r.date, []); by.get(r.date).push(r); }
  const day = (d) => { const R = by.get(d.date); return R ? fcSum(R) : null; };
  const g = (k) => (d) => { const t = day(d); return t && t.priced ? t[k] : null; };
  const bq = (COST.bq && COST.bq.days) || [], bqOf = new Map(bq.map((x) => [x.date, x]));
  const bp = (d) => { const x = bqOf.get(d.date); return x && ok(x.bgrade_loss) && x.afold ? 100 * x.bgrade_loss / x.afold : null; };
  const body = !A ? el('p', {class: 'note', text: 'Loading the fabric masters…'}) : !P.some((d) => { const t = day(d); return t && t.priced; }) ? el('div', {class: 'empty', text: 'No priced loom-day in this period: see Coverage on the Realisation tab.'})
    : dayChart('cpp', P, pre, {id: 'fx-cost', aria: 'Realisation and cost per pick by day', fmt: (v) => pn(v, 2), onPick: pickDay}, [
      {key: 'real', name: 'Realisation per pick', get: g('real_pp'), agg: 'w', w: g('priced'), color: CC[0], avg: false},
      {key: 'cpp', name: 'Cost per pick (incl. cut piece loss)', get: (d) => d.cpp, agg: 'w', w: (d) => d.picks, color: CC[3], avg: false},
      {key: 'bg', name: 'B grade loss per good pick', get: bp, agg: 'w', w: (d) => d.afold, color: CC[2], avg: false},
      {key: 'profit', name: 'Profit per pick (loom cost)', get: (d) => { const t = day(d); return t && t.lc_ld ? t.profit_lc_pp : null; }, agg: 'w', w: (d) => { const t = day(d); return t && t.lc_ld ? t.lc_costed : null; },
        wk: (L) => { const t = fcSum(L.flatMap((d) => by.get(d.date) || [])); return t.lc_ld ? t.profit_lc_pp : null; }, color: CC[1], dash: true, avg: false}], ['real', 'cpp', 'profit']);   // a week or rolling 7 days: the days' rows added up, so a day with nothing priced still takes off its loom cost (risk C)   // Round A4: the loom cost basis
  const last = A ? [...P].reverse().map(day).find((t) => t && t.priced) : null;
  if (typeof wkPut === 'function') { const d0 = A ? [...P].reverse().find((d) => { const t = day(d); return t && t.priced; }) : null;   // Round J
    wkPut('J22', d0 ? {date: dfmt(d0.date), real: day(d0).real, picks: day(d0).priced, cpp: d0.cpp} : null); }
  return card('Realisation against cost per pick', 'paise per pick by day · the period of the Cost per pick chart above · realisation As sold, from the Realisation tab', body,
    el('p', {class: 'note', text: `Realisation = sale value at prevailing rate less standard yarn cost, over the priced loom-days of the day; cost per pick is the Costing figure above; profit (loom cost) = realisation less each loom's loom cost and its own B grade, less the loom cost not recovered, over the picks with a loom cost profit, as the Realisation tab's Profit (loom cost basis). The B grade line is the plant's B grade loss per A-grade folded pick, already in the Quality loss table.${last ? ` Latest priced day covers ${fxPct(last.coverage)} of its picks.` : ''}`}));
}
function fxStockRows(st, cur, MD) {
  if (!fxOn()) return [];
  const A = fxAll();
  if (!A) return [['Closing stock at prevailing rate', el('span', {class: 'note', text: '…'}), '']];
  const ym = cur.date.slice(0, 7), R = A.rows.filter((r) => r.date.slice(0, 7) === ym && r.date <= cur.date && !r.gap);
  const metres = R.reduce((a, r) => a + r.metres, 0), sale = R.reduce((a, r) => a + r.sale, 0), real = R.reduce((a, r) => a + r.real, 0);
  if (!metres) return [['Closing stock at prevailing rate', el('span', {class: 'pill muted', text: 'not priced', title: 'No priced loom-day this month yet'}), '']];
  const perM = sale / metres, realM = real / metres;
  if (typeof wkPut === 'function') wkPut('J16', ok(st.closing) ? {sale, metres, closing: st.closing} : null);   // Round J
  return [[el('span', {}, 'Closing stock at prevailing rate', el('div', {class: 'note', text: `× ₹${pn(perM, 2)} a metre, the month's average sale value per metre woven (As sold); realisation ₹${pn(realM, 2)} a metre`})),
    ok(st.closing) ? el('span', {}, rs(st.closing * perM), el('div', {class: 'note', text: `realisation ${rs(st.closing * realM)}`})) : NA, '']];
}
// Effective RPM tab (R2): the picks short of the reference valued at that loom-day's realisation per pick, and the best
// product per loom type with the product mix the looms run now.
function fxErpmCell(x, fabricPicks) {
  if (!fxOn()) return null;
  if (!(fabricPicks > 0.5)) return fxAll() ? '0' : fxRsCell(null);
  return fxRsCell(fxPicksRs(x.date, x.loom, x.hg, fabricPicks / FC_PICKS_PER_INCH));
}
function fxErpmHgCell(R) {   // R: [{x, gain}] of one head group on the day
  if (!fxOn()) return null;
  if (!fxAll()) return fxRsCell(null);
  let rs = 0, n = 0, m = 0;
  for (const r of R) { if (!(r.gain > 0.5)) continue; m++; const v = fxPicksRs(r.x.date, r.x.loom, r.x.hg, r.gain / FC_PICKS_PER_INCH); if (v != null) { rs += v; n++; } }
  if (!m) return '0';
  if (!n) return fxRsCell(null);
  return el('span', {}, fxMoney(rs), n < m ? el('div', {class: 'note', text: `${n} of ${m} looms priced`}) : null);
}
// Effective RPM tab (12 Nov 2026): realisation against production. Each loom's realisation at an effective RPM = that
// effective RPM × the loom's run + stop minutes × its panna factor ÷ 39.37 × that loom-day's realisation per pick
// (fcRealAtErpm), so now, benchmark, best and target are worked the same way. There is no typed realisation target: the
// target is the production at the target effective RPM (93% of the target RPM) × the per-pick realisation (Divyam).
function fxErpmReal(recs) {
  const A = fxAll(); if (!A) return null;
  const out = [];
  for (const r of recs) {
    const x = r.x; if (x.hg === 'Unassigned') continue;
    const o = fxLd(x.date, x.loom, x.hg); if (!o || o.real_pp == null) { out.push({r, gap: true}); continue; }
    const min = (x.run || 0) + (x.stop || 0), f = pf(x.width, x.hg), at = (e) => ok(e) ? fcRealAtErpm(e, min, f, o.real_pp) : null;
    const now = at(x.erpm), after = at(r.after);
    out.push({r, pp: o.real_pp, now, after, bm: at(r.bm), best: at(r.best), tg: at(r.tg), picks: ok(x.erpm) ? x.erpm * min * f / FC_PICKS_PER_INCH : 0, apicks: ok(r.after) ? r.after * min * f / FC_PICKS_PER_INCH : 0});
  }
  return out;
}
function fxErpmRealTiles(recs, kp) {
  const L = fxErpmReal(recs);
  if (!L) return [kp('Realisation after the work', ['…'], '', 'loading the fabric masters')];
  const P = L.filter((y) => !y.gap && ok(y.now)), n = P.reduce((a, y) => a + y.now, 0), a = P.reduce((s, y) => s + (ok(y.after) ? y.after : y.now), 0);
  const np = P.reduce((s, y) => s + y.picks, 0), ap = P.reduce((s, y) => s + (y.apicks || y.picks), 0), gaps = L.length - P.length;
  if (!P.length) return [kp('Realisation after the work', ['—'], '', 'no loom priced on this day')];
  const ppN = np ? n / np * 100 : null, ppA = ap ? a / ap * 100 : null;
  if (typeof wkPut === 'function') { wkPut('F3:rs', {rows: P.map((y) => ({after: ok(y.after) ? y.after : y.now})), now: n}); wkPut('F3:pp', {after: a, picks: ap}); }   // Round J
  return [kp('Realisation after the work', [fxMoney(a)], '', `+${fxMoney(a - n)} on ${fxMoney(n)} now · ${P.length} priced loom${P.length === 1 ? '' : 's'}${gaps ? `, ${gaps} not priced` : ''}`),
    kp('Realisation per pick after the work', [fxPaise(ppA)], 'paise', `now ${fxPaise(ppN)}: each loom keeps its own quality's rate, so this moves only as the mix of picks shifts`)];
}
let FXER_ALL = false;
function fxErpmRealCard(recs) {
  const L = fxErpmReal(recs);
  const title = 'Realisation now vs benchmark, best and target';
  if (!L) return card(title, 'owner only', el('p', {class: 'note', text: 'Loading the fabric masters…'}));
  const hg = bv('erpm-real') === 'hg';
  const refOfY = (y) => ok(y.tg) ? y.tg : y.bm;   // sorted on the target, the benchmark where no target RPM is set
  let rows;
  if (!hg) rows = L.filter((y) => !y.gap && ok(y.now)).map((y) => ({x: y.r.x, v: y.now, bm: y.bm, best: y.best, tg: y.tg, ref: refOfY(y), ex: ok(refOfY(y)) ? Math.max(0, refOfY(y) - y.now) : 0, sk: ok(refOfY(y)) ? refOfY(y) - y.now : -1e18,
    tip: `Loom ${y.r.x.loom} · ${y.r.x.hg} · ${y.r.x.width} cm: ${fxMoney(y.now)} now · benchmark ${fxMoney(y.bm)} · best ${fxMoney(y.best)} · target ${fxMoney(y.tg)} · ${fxPaise(y.pp)} paise/pick`}));
  else {
    const by = new Map();
    for (const y of L) { if (y.gap || !ok(y.now)) continue; const k = key(y.r.x.width, y.r.x.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(y); }
    const mean = (Y, f) => { const v = Y.map(f).filter(ok); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    rows = [...by.values()].map((Y) => {
      const x0 = Y[0].r.x, v = mean(Y, (y) => y.now), bm = mean(Y, (y) => y.bm), best = mean(Y, (y) => y.best), tg = mean(Y, (y) => y.tg), ref = ok(tg) ? tg : bm;
      return {label: `${x0.hg} · ${x0.width}`, v, bm, best, tg, ref, ex: ok(ref) ? Math.max(0, ref - v) : 0, sk: ok(ref) ? ref - v : -1e18, open: () => openHg(x0.hg, x0.width, D.latest),
        tip: `${x0.hg}, ${x0.width} cm, per loom-day over ${Y.length} priced loom${Y.length === 1 ? '' : 's'}: ${fxMoney(v)} now · benchmark ${fxMoney(bm)} · best ${fxMoney(best)} · target ${fxMoney(tg)}`};
    });
  }
  rows.sort((a, b) => b.sk - a.sk || (a.x ? a.x.loom - b.x.loom : a.label.localeCompare(b.label)));
  const top = Math.max(1, ...rows.map((r) => Math.max(r.v || 0, r.bm || 0, r.best || 0, r.tg || 0))), [, , ticks] = niceRange(0, top), every = ticks.length > 1 ? ticks[1] - ticks[0] : top;
  const noTg = rows.filter((r) => !ok(r.tg)).length, gaps = L.filter((y) => y.gap).length;
  return card(`${title}, ${hg ? 'by head group' : 'by loom'}`, `${dfmt(D.latest)} · ₹ of realisation in the day at each effective RPM · in the Sorting basis order`,
    el('div', {class: 'toolbar'}, bvSeg('erpm-real')),
    rows.length ? refBars(rows, {limit: hg || FXER_ALL ? 0 : 25, step: every / 2, labelEvery: every, axis: `₹ realisation ${hg ? 'per loom-day' : 'in the day'} (sale value less yarn)`, axisShort: '₹ realisation', aria: `Realisation ${hg ? 'by head group' : 'per loom'}: now against benchmark, best and target`, dec: 0, exSign: '−', fmt: (v) => Math.round(v).toLocaleString('en-IN'), tick: (v) => v >= 1000 ? (v / 1000).toLocaleString('en-IN') + 'k' : String(v)})
      : el('div', {class: 'empty', text: 'No loom with a head group is priced on this day: see Coverage on the Realisation tab.'}),
    rows.length ? chartLegend('realisation', '−n after the value = rupees short of the target (the benchmark where no target is set)') : null,
    !hg && rows.length > 25 ? el('button', {class: 'link', type: 'button', text: FXER_ALL ? 'Show the first 25' : `Show all ${rows.length} looms`, onclick: () => { FXER_ALL = !FXER_ALL; render(); }}) : null,
    el('p', {class: 'note', text: `Each figure is production × realisation per pick: the effective RPM (now, benchmark, best, or target = ${f0(ERPM_TGT * 100)}% of the target RPM) × the loom's run + stop minutes on the day × its panna factor, on the costing basis, × that loom-day's realisation per pick (As sold, the Realisation tab). There is no separate realisation target. ${hg ? 'Head-group-wise is the average per priced loom-day. ' : ''}${noTg ? `${noTg} ${hg ? 'head group' : 'loom'}${noTg === 1 ? ' has' : 's have'} no target RPM, so ${noTg === 1 ? 'it is' : 'they are'} sorted on the benchmark. ` : ''}${gaps ? `${gaps} loom${gaps === 1 ? ' is' : 's are'} not priced and left out.` : ''}`}));
}
function fxMixNote(date) {
  if (!fxOn()) return null;
  const rows = fxDayRows(date);
  if (!rows) return el('p', {class: 'note', text: 'Loading the fabric masters…'});
  const best = fcBestByWidth(rows.filter((r) => inW(r.width)), (r) => r.fabric);
  const parts = Object.entries(best).map(([w, b]) => `${w} cm: ${fxName(b.key)} at ${fxMoney(b.value)} a loom a day ${b.by === 'profit' ? 'profit (loom cost)' : 'realisation (no loom cost profit on this width)'}`);   // Round A4
  const mix = {};
  for (const x of latestRecs()) { if (x.hg === 'Unassigned') continue; const k = x.width + ' cm'; mix[k] = mix[k] || {}; mix[k][x.hg] = (mix[k][x.hg] || 0) + 1; }
  const mixTxt = Object.entries(mix).map(([w, m]) => `${w}: ` + Object.entries(m).sort((a, b) => b[1] - a[1]).map(([hg, n]) => `${n} on ${hg}`).join(', ')).join(' · ');
  return el('p', {class: 'note'}, el('b', {text: 'Best product per loom type: '}), parts.length ? parts.join(' · ') : 'nothing priced on this day (see Coverage on the Realisation tab, or pick another day on the date chip)', '. ', el('b', {text: 'Mix now: '}), mixTxt || '—', '. The best product is the one with the highest profit a loom a day on the loom cost basis among the loom-days priced on that width (As sold, By loom / By head group on the Realisation tab); where none has a loom cost profit, the highest realisation a loom a day.');
}
// Utilisation tab (R2): idle hours valued as realisation forgone at the loom's current quality: the powered-down minutes
// × the RPM the loom runs on that quality × that quality's realisation per pick on the loom (the day's own priced loom-day,
// else the loom's latest priced day on the same quality).
function fxIdleRs(loom, date, offMin) {
  if (!fxOn()) return null;
  const A = fxAll(); if (!A) return {loading: true};
  const recs = (D.loomdays || []).filter((x) => x.loom === loom && x.date <= date && x.run > 0).sort((a, b) => b.date.localeCompare(a.date) || b.run - a.run);
  const cur = recs[0]; if (!cur) return {rs: null, why: 'no run on record'};
  let o = A.byKey.get(date + '|' + loom + '|' + cur.hg), when = date;
  if (!o || o.real_pp == null) { for (const r of recs) { const k = A.byKey.get(r.date + '|' + loom + '|' + r.hg); if (k && k.real_pp != null && r.hg === cur.hg) { o = k; when = r.date; break; } } }
  if (!o || o.real_pp == null) return {rs: null, why: 'not priced', hg: cur.hg};
  const picks = offMin * cur.rpm * pf(cur.width, cur.hg) / FC_PICKS_PER_INCH;
  return {rs: picks * o.real_pp / 100, picks, hg: cur.hg, rpm: cur.rpm, when, pp: o.real_pp, pf: pf(cur.width, cur.hg)};
}
function fxIdleCell(loom, date, offMin) {
  const r = fxIdleRs(loom, date, offMin);
  if (!r) return null;
  if (r.loading) return fxRsCell(null);
  if (r.rs == null) return el('span', {class: 'pill muted', text: r.why, title: r.hg ? `${r.hg}: no priced loom-day for this loom on it` : null});
  return el('span', {}, fxMoney(r.rs), el('div', {class: 'note', text: `${fxLakh(r.picks)} lakh picks on ${r.hg}${r.when !== date ? ` · rate of ${dfmt(r.when)}` : ''}`}));
}
// Warp breaks tab (R2; Round W, 17 Nov 2026): a bad beam has a price. Since Round W it is the warp-stop minutes of each
// beam's loom-days (the report's "Warp (min)"), not every stop: × the loom's RPM = picks lost to warp stops, valued at that
// loom-day's realisation per pick (fcBeamWarpLoss). A loom-day with no warp minutes is a gap, shown in "Days counted".
function fxBeamTable(beams, recs) {
  if (!fxOn()) return null;
  if (!fxAll()) return el('p', {class: 'note', text: 'Realisation lost on each beam: loading the fabric masters…'});
  const rows = beams.map((b) => {
    const L = recs.filter((x) => x.loom === b.loom && x.beam === b.beam);
    const r = fcBeamWarpLoss(L.map((x) => { const o = fxLd(x.date, x.loom, x.hg); return {warp_min: x.warp_min, rpm: x.rpm, pf: pf(x.width, x.hg), realPp: o && o.real_pp != null ? o.real_pp : null}; }));
    return {b, ...r};
  }).sort((a, c) => (c.rs ?? -1) - (a.rs ?? -1) || (c.min ?? -1) - (a.min ?? -1));
  if (typeof wkPut === 'function') { const r = rows.find((y) => y.rs != null);   // Round J: the beam that lost the most
    wkPut('I3', r ? {beam: r.b.beam, days: recs.filter((x) => x.loom === r.b.loom && x.beam === r.b.beam).map((x) => { const o = fxLd(x.date, x.loom, x.hg); return {warp_min: x.warp_min, rpm: x.rpm, pf: pf(x.width, x.hg), realPp: o && o.real_pp != null ? o.real_pp : null}; })} : null); }
  const rsC = (r) => r.rs != null ? el('b', {text: fxMoney(r.rs)}) : el('span', {class: 'pill muted', text: r.timed ? 'not priced' : 'no warp minutes yet'});
  const dc = (r) => el('span', {class: r.timed < r.days || r.priced < r.timed ? 'pill warn' : 'note', style: 'white-space:normal', text: `${r.timed} of ${r.days} days with warp minutes · ${r.priced} priced`});
  const hrs = (r) => r.min == null ? '—' : f1(r.min / 60), lk = (r) => r.picks == null ? '—' : fxLakh(r.picks);
  // On a phone (below 560 px) one block per beam carrying the column names, so nothing scrolls sideways (Round W).
  // 18 Nov 2026: the phone blocks carry the same Sorting basis as the table's columns (Realisation lost, highest first, by default)
  const body = window.matchMedia('(max-width: 560px)').matches
    ? sortableChart('beam-loss-phone', rows, [{v: 'beam', label: 'Beam', get: (r) => r.b.beam, d: 'a'}, {v: 'loom', label: 'Loom', get: (r) => r.b.loom, d: 'a'},
      {v: 'min', label: 'Warp stops', get: (r) => r.min}, {v: 'picks', label: 'Picks lost on warp stops', get: (r) => r.picks}, {v: 'rs', label: 'Realisation lost', get: (r) => r.rs},
      {v: 'days', label: 'Days counted', get: (r) => r.timed}], (RR) => el('div', {class: 'beamlist'}, RR.map((r) => el('div', {style: 'padding:10px 0;border-top:1px solid var(--line, #ddd)'},
        el('div', {}, el('strong', {text: 'Beam ' + r.b.beam}), ' · ', loomLink(r.b.loom, r.b.last, 'Loom ' + r.b.loom)),
        el('div', {class: 'note', text: `${r.b.hg} · ${r.b.width} cm · ${f2(r.b.rate)} breaks /100k picks`}),
        el('div', {}, 'Realisation lost: ', rsC(r)),
        el('div', {text: `Warp stops: ${hrs(r)} h · Picks lost on warp stops: ${lk(r)} lakh`}),
        el('div', {}, 'Days counted: ', dc(r))))), {b: 'rs', d: 'd'})
    : table(['Beam', 'Loom', ['Warp stops', 'h on this beam'], ['Picks lost on warp stops', 'lakh'], ['Realisation lost', '₹'], 'Days counted'],
      rows.map((r) => [r.b.beam, el('span', {}, loomLink(r.b.loom, r.b.last, 'Loom ' + r.b.loom), el('div', {class: 'note', text: `${r.b.hg} · ${r.b.width} cm · ${f2(r.b.rate)} /100k`})),
        hrs(r), lk(r), rsC(r), dc(r)]), [2, 3, 4]);
  return el('div', {}, el('h3', {text: 'Realisation lost on each beam'}), body,
    el('p', {class: 'note', text: 'Warp stops are the report\'s "Warp (min)": the minutes each loom stood on warp breaks on this beam\'s loom-days. Picks lost on warp stops = those minutes × the loom\'s RPM, and Realisation lost values them at that loom-day\'s realisation per pick (As sold, from the Realisation tab). Weft and other stops are not charged to the beam. A day without warp minutes is left out and shown in Days counted, never counted as 0; "—" means no day of the beam has warp minutes yet.'}),
    el('p', {class: 'note', text: '"no warp minutes yet": days stored before 17 Nov are read again from the plant files over the next daily runs (every hour, 10:40 to 16:40 IST); if it stays a day later, that shift\'s file has no warp minutes, so ask the plant for the full Toyota report. "not priced": the beam\'s days have no realisation price; see Coverage on the Realisation tab for what to link or approve. Read the table with the break rate: a beam high on both is the one to send back to warping first.'}));
}
// Benchmarks (R2): what each benchmark gap is worth for that quality on that day, in rupees: a picks gap (RPM, effective
// RPM, efficiency) × the realisation per pick of the subject on the day (the head group's priced looms, or the one loom);
// an air gap (CFM, air per 1,000 picks) × the compressor's rupees per ft³ that day. Rows that have no gap say so.
function fxGapWorth(w, hg, A, date, loom) {
  if (!fxOn() || !A) return null;
  if (!fxAll()) return {loading: true};
  const b = bench(w, hg) || {}, c = typeof compDay === 'function' ? compDay(date) : null;
  const pp = loom != null ? (fxLd(date, loom, hg) || {}).real_pp : (fxHgPp(date, w, hg) || {}).real_pp;
  const f = pf(w, hg) / FC_PICKS_PER_INCH, rsPicks = (p) => pp == null ? null : p * f * pp / 100;
  const cell = (gap, rs, unit) => gap == null ? '—' : gap <= 1e-9 ? el('span', {class: 'note', text: 'no gap'}) : rs == null ? el('span', {class: 'pill muted', text: unit === 'air' ? 'no compressor reading' : 'not priced'}) : fxMoney(rs);
  const out = {};
  out.rpm = ok(b.rpm) && ok(A.rpm) ? cell(b.rpm - A.rpm, rsPicks(Math.max(0, b.rpm - A.rpm) * A.run)) : '—';
  out.erpm = ok(b.erpm) && ok(A.erpm) ? cell(b.erpm - A.erpm, rsPicks(Math.max(0, b.erpm - A.erpm) * (A.run + A.stop))) : '—';
  const effMin = Math.max(0, EFF_BAD() / 100 * (A.run + A.stop) - A.run);
  out.eff = ok(A.eff) ? cell(A.eff < EFF_BAD() ? effMin : 0, rsPicks(effMin * A.rpm)) : '—';
  const cfmB = cfmOf(b.apk, w, hg, A.rpm);
  out.cfm = ok(cfmB) && ok(A.cfm) ? cell(A.cfm - cfmB, c ? Math.max(0, A.cfm - cfmB) * A.run * c.sRsFt3 : null, 'air') : '—';
  out.apk = ok(b.apk) && ok(A.apk) ? cell(A.apk - b.apk, c ? Math.max(0, A.apk - b.apk) * A.fpicks / 1000 * c.sRsFt3 : null, 'air') : '—';
  out.note = `Gap worth: a picks gap × ${pp == null ? 'the realisation per pick (not priced here)' : fxPaise(pp) + ' paise of realisation per pick'} on ${dfmt(date)} (As sold); an air gap × ${c ? '₹' + pn(c.sRsFt3 * 1000, 2) + ' per 1,000 ft³ of air saved (the energy rate on the CFM tab, at the compressor\'s ₹ a unit) on ' + dfmt(c.date) : 'the compressor\'s rupees per ft³ (no reading yet)'}. For the day's run time; pressure is floor-wide and has no figure of its own.`;
  return out;
}
// Targets tab (R2; 12 Nov 2026: the realisation target is worked out from the target RPM, not typed): realisation now against
// that target per head group and width, and a target product mix (looms per head group) per width. Owner only; saved to fm_settings 'realisation_targets' through fm_set_realisation_targets
// (migration 0011), never to the targets table the plant view reads. "Now" is the month to date, As sold.
// The target mix is saved under the primary's Style-map name and shown under the head group's name (12 Nov 2026, hgCollapse).
const fxRT = () => {
  const R = (fxSet.realisation_targets && typeof fxSet.realisation_targets === 'object') ? fxSet.realisation_targets : {ld: {}, mix: {}};
  const mix = {};
  for (const [w, m] of Object.entries(R.mix || {})) mix[w] = hgCollapse(w, m)[0];
  return Object.assign({}, R, {mix, ld: R.ld || {}});
};
const fxRTSaved = (mix) => {   // shown names back to the primaries' Style-map names
  const out = {};
  for (const [w, m] of Object.entries(mix || {})) { out[w] = {}; for (const [h, n] of Object.entries(m)) out[w][hgRootOf(w, h)] = n; }
  return out;
};
function fxTargetsCard() {
  if (!fxOn()) return null;
  const A = fxAll();
  if (!A) return card('Realisation targets', 'owner only', el('p', {class: 'note', text: 'Loading the fabric masters…'}));
  const RT = fxRT(), ld = RT.ld || {}, mix = RT.mix || {};
  if (typeof wkPut === 'function') wkPut('K14', null);
  const latest = D.latest, ym = latest.slice(0, 7);
  const M = A.rows.filter((r) => r.date.slice(0, 7) === ym && r.date <= latest);
  const ks = new Map();
  for (const b of D.benchmarks || []) if (inW(b.width)) ks.set(key(b.width, b.hg), {w: String(b.width), hg: b.hg});
  for (const x of D.loomdays || []) if (inW(x.width) && x.hg !== 'Unassigned') ks.set(key(x.width, x.hg), {w: String(x.width), hg: x.hg});
  for (const k of Object.keys(ld)) { const [w, ...h] = k.split('|'); if (inW(w)) ks.set(key(w, h.join('|')), {w, hg: h.join('|')}); }
  const list = [...ks.values()].sort((a, b) => a.w.localeCompare(b.w) || a.hg.localeCompare(b.hg));
  const now = new Map();
  for (const x of latestRecs()) { const k = key(x.width, x.hg); now.set(k, (now.get(k) || 0) + 1); }
  const inputs = {};
  const rows = list.map(({w, hg}) => {
    const k = key(w, hg), T = fcSum(M.filter((r) => r.width === w && r.hg === hg));
    const Rk = M.filter((r) => r.width === w && r.hg === hg), tg = fxTargetLd(Rk, w, hg), curMix = (mix[w] || {})[hg];   // 12 Nov 2026: the target is worked out, not typed
    const inMix = el('input', {type: 'number', step: '1', min: '0', inputmode: 'numeric', 'aria-label': `Target looms for ${hg} ${w} cm`, value: ok(curMix) ? String(curMix) : null, style: 'width:80px'});
    inputs[k] = {w, hg, inMix};
    const gap = tg && T.priced_ld ? T.real_ld - tg.ld : null;
    if (typeof wkPut === 'function' && gap != null && !WKD.K14) wkPut('K14', {hg, real: T.real, ld: T.priced_ld, now: T.real_ld, tgt: tg.ld});   // Round J: the first head group with both
    return [el('span', {}, hgLink(hg, w, latest), el('div', {class: 'note', text: w + ' cm'})),
      T.priced_ld ? sortAs(el('span', {}, fxMoney(T.real_ld), el('div', {class: 'note', text: `${T.priced_ld} priced loom-days · profit (loom cost) ${(() => { const t = fcSum(Rk, false); return t.lc_ld ? fxMoney(t.profit_lc_ld) + ' a loom a day' : 'none yet (no costing day or CFM reading; see Coverage on the Realisation tab)'; })()}`})), T.real_ld) : el('span', {class: 'pill muted', text: 'not priced'}),
      tg ? sortAs(el('span', {}, fxMoney(tg.ld), el('div', {class: 'note', text: `at ${f0(tg.erpm)} effective RPM`})), tg.ld) : sortAs(el('span', {class: 'note', text: T.priced_ld ? 'no target RPM' : '—'}), null), gap == null ? '—' : el('span', {class: gap >= 0 ? 'up-good' : 'up-bad', 'data-sort': String(gap), text: `${gap >= 0 ? '+' : '−'}${fxMoney(Math.abs(gap)).replace('₹', '₹')}`}),
      String(now.get(k) || 0), inMix];
  });
  const msg = el('span', {class: 'meta'});
  const save = el('button', {type: 'button', class: 'primary', text: 'Save target mix', onclick: async () => {
    const out = {ld: Object.assign({}, ld), mix: JSON.parse(JSON.stringify(mix))};
    for (const [k, o] of Object.entries(inputs)) {
      const b = o.inMix.value.trim();
      out.mix[o.w] = out.mix[o.w] || {};
      if (b === '') delete out.mix[o.w][o.hg]; else { const n = Math.round(Number(b)); if (!(n >= 0)) { msg.className = 'err'; msg.textContent = `${o.hg}: looms must be a whole number, zero or more.`; return; } out.mix[o.w][o.hg] = n; }
      if (!Object.keys(out.mix[o.w]).length) delete out.mix[o.w];
    }
    save.disabled = true; msg.className = 'meta'; msg.textContent = 'Saving…';
    out.mix = fxRTSaved(out.mix);
    try { await fxRpc('fm_set_realisation_targets', {p_value: out}); await fxSettings(); msg.className = 'saved'; msg.textContent = 'Saved. Applies straight away.'; setTimeout(render, 600); }
    catch (e) { msg.className = 'err'; msg.textContent = saveFail(e, 'save', 'Save'); }
    save.disabled = false;
  }});
  const mixTot = (w) => Object.values(mix[w] || {}).reduce((a, n) => a + n, 0), loomsW = (w) => Object.keys(D.machine || {}).filter((l) => String(D.machine[l].width) === w).length;
  const mixNote = ['190', '280'].filter((w) => inW(w)).map((w) => `${w} cm: ${mixTot(w)} loom${mixTot(w) === 1 ? '' : 's'} in the target mix of ${loomsW(w)}`).join(' · ');
  return card('Realisation targets', `owner only · ₹ per loom per day, As sold · "now" is ${monthName(latest)} to date · the target is worked out from the target RPM`,
    table(['Head group', ['Now', '₹ realisation per loom per day'], ['Target', '₹ per loom per day at target'], ['Now vs target', '₹'], ['Looms now', dfmt(latest)], ['Target looms', 'product mix']], rows, [1, 2, 3, 4]),
    el('div', {class: 'toolbar', style: 'margin-top:10px'}, save, msg, el('span', {class: 'note', text: mixNote})),
    el('p', {class: 'note', text: 'Realisation per loom per day = the month\'s realisation (sale value at prevailing rate less standard yarn cost) ÷ the priced loom-days it came from. There is no typed realisation target: the target is the production at the target effective RPM (93% of the target RPM set above) over each loom-day\'s run + stop minutes × that loom-day\'s realisation per pick, averaged over the month\'s priced loom-days; set a target RPM to get one. The target product mix is how many looms of each width you want on each head group; "Looms now" is the latest day. Saved to the fabric masters\' settings (only you can read them), not to the Config Sheet.'}));
}
// Loom panel (R2): one realisation line per loom-day in the day detail (the day shown and the two before it).
function fxLoomLines(loom, days, recs) {
  if (!fxOn()) return null;
  const A = fxAll();
  if (!A) return el('p', {class: 'note', text: 'Realisation: loading the fabric masters…'});
  const rows = [];
  for (const d of days) {
    const R = recs.filter((x) => x.date === d), hgs = [...new Set(R.map((x) => x.hg))];
    if (!hgs.length) continue;
    for (const hg of hgs) {
      const o = A.byKey.get(d + '|' + loom + '|' + hg);
      rows.push([dfmt(d), hgLink(hg, (R[0] || {}).width, d), o ? fxLakh(o.picks) : '—',
        o && o.priced ? fxMoney(o.sale) : '—', o && o.priced ? el('span', {}, fxMoney(o.real), el('div', {class: 'note', text: `${fxPaise(o.real_pp)} paise/pick`})) : '—',
        o && o.profit_lc != null ? el('span', {}, fxMoney(o.profit_lc), el('div', {class: 'note', text: `${fxPaise(o.profit_lc_pp)} paise/pick`})) : (o && o.priced ? el('span', {class: 'note', text: `${o.lc_gap || 'no costing day'}. Next: ${fxLcNext(o.lc_gap || 'no costing day')}`}) : '—'),   // Round A4: loom cost basis
        !o ? el('span', {class: 'pill muted', text: 'not in the analysis'}) : o.priced ? (o.gaps.length ? el('span', {class: 'pill warn', text: 'partly: ' + o.gaps[0]}) : '') : el('span', {class: 'pill warn', text: o.gaps[0] || 'not priced', style: 'white-space:normal'})]);
    }
  }
  return el('div', {}, el('h3', {text: 'Realisation'}), fxLoomSpark(loom, days.slice().sort().pop()), el('p', {class: 'note', text: 'Sale value at prevailing rate, realisation and profit (loom cost basis) per loom-day, As sold, from the Realisation tab.'}),
    rows.length ? table(['Date', 'Head group', ['Picks', 'lakh'], ['Sale', '₹'], ['Realisation', '₹'], ['Profit (loom cost)', '₹'], 'Gap'], rows, [2, 3, 4, 5]) : el('p', {class: 'empty', text: 'No loom-day in the analysis for these days.'}));
}
// Round C (Divyam, 17 Nov 2026): 7-day realisation lines. Realisation per pick (paise, As sold) for the last 7 days that have
// loom data, up to the day shown; a day with nothing priced is a gap in the line, never 0. The sidebar's is the whole floor
// (both widths), beside Realisation; the loom panel's is that loom. Owner with the analysis on only.
const fxLast7 = (end) => fxDays().filter((d) => d <= end).slice(-7);
function fxSparkTitle(label, S) {
  return `${label}, paise per pick (As sold): ` + S.map((p) => `${dfmt(p.date)} ${p.real_pp == null ? '— not priced' : fxPaise(p.real_pp) + (p.coverage < 1 - 1e-9 ? ` (${fxPct(p.coverage)} of picks priced)` : '')}`).join(' · ');
}
function fxNavSpark() {
  for (const a of document.querySelectorAll('#sbnav .sb-item[data-tab="realisation"]')) {
    let box = a.querySelector('.sb-spark'), sub = a.querySelector('.sb-sub');
    if (!box) { box = el('span', {class: 'sb-spark'}); const bd = a.querySelector('.badge'); a.insertBefore(box, bd || null); }
    if (!sub) { const lab = a.querySelector('span:not(.badge):not(.sb-spark)'); sub = el('small', {class: 'sb-sub'}); if (lab) { lab.classList.add('sb-lab'); lab.append(sub); } }
    const A = fxOn() && D ? fxAll() : null;
    const S = A ? fcRealSeries(A.rows, fxLast7(D.latest)) : [], last = [...S].reverse().find((p) => p.real_pp != null);
    const show = S.filter((p) => p.real_pp != null).length >= 2;
    box.hidden = sub.hidden = !show; a.classList.toggle('sb-two', show);
    box.replaceChildren(...(show ? [spark(S.map((p) => p.real_pp), {aria: `Realisation per pick, whole floor, last ${S.length} days`, title: fxSparkTitle('Realisation per pick, whole floor, both widths', S)})] : []));
    sub.textContent = show ? `${fxPaise(last.real_pp)} paise/pick` : '';
  }
}
// Round A4 (Divyam, 24 Nov 2026): beside it, the loom's profit per pick on the loom cost basis over the same days (its own
// unpriced loom-days a gap in the line, never taken off: one loom, withU false).
function fxLoomSpark(loom, date) {
  if (!fxOn()) return null;
  const A = fxAll(); if (!A) return null;
  const L7 = fxLast7(date); if (!L7.length) return null;
  const S = fcRealSeries(A.rows, L7, (r) => +r.loom === +loom, false), n = S.filter((p) => p.real_pp != null).length, np = S.filter((p) => p.profit_pp != null).length;
  const last = [...S].reverse().find((p) => p.real_pp != null), lastP = [...S].reverse().find((p) => p.profit_pp != null);
  return el('div', {class: 'fx-lspark'},
    el('div', {class: 'note', text: n ? `Realisation per pick, last ${S.length} days: ${fxPaise(last.real_pp)} paise on ${dfmt(last.date)}${n < S.length ? ` · ${S.length - n} day${S.length - n === 1 ? '' : 's'} not priced (gap in the line)` : ''}` : `Realisation per pick, last ${S.length} days: no day priced (see Coverage on the Realisation tab)`}),
    n >= 2 ? spark(S.map((p) => p.real_pp), {aria: `Realisation per pick, loom ${loom}, last ${S.length} days`, title: fxSparkTitle(`Loom ${loom}`, S)}) : null,
    el('div', {class: 'note', text: np ? `Profit per pick (loom cost), last ${S.length} days: ${fxPaise(lastP.profit_pp)} paise on ${dfmt(lastP.date)}${np < S.length ? ` · ${S.length - np} day${S.length - np === 1 ? '' : 's'} with no loom cost profit (gap in the line)` : ''}` : `Profit per pick (loom cost), last ${S.length} days: no day with a loom cost profit (a costing day, loom data and a CFM reading are needed: see Files per day on Data health)`}),
    np >= 2 ? spark(S.map((p) => p.profit_pp), {aria: `Profit per pick on the loom cost basis, loom ${loom}, last ${S.length} days`, title: `Loom ${loom}, profit per pick (loom cost): ` + S.map((p) => `${dfmt(p.date)} ${p.profit_pp == null ? '—' : fxPaise(p.profit_pp)}`).join(' · ')}) : null);
}
// Benchmarks quality list (Round C, backlog 5): the head group's realisation per pick on the latest day, under its RPM and
// air. "—" = not priced that day (a gap, never 0); owner with the analysis on only.
function fxBenchListLine(w, hg) {
  if (!fxOn()) return null;
  if (!fxAll()) return [el('br'), 'paise/pick …'];
  const h = hg === 'Unassigned' ? null : fxHgPp(D.latest, w, hg);
  return [el('br'), el('span', {class: h ? 'qreal' : null, title: h ? `Realisation per pick on ${dfmt(D.latest)}, As sold${h.coverage < 1 - 1e-9 ? ` · ${fxPct(h.coverage)} of picks priced` : ''}` : `Not priced on ${dfmt(D.latest)}: see Coverage on the Realisation tab`, text: h ? `${fxPaise(h.real_pp)} paise/pick` : 'not priced'})];
}
const fxBenchListNote = () => fxOn() ? el('p', {class: 'note', text: `paise/pick = realisation per pick on ${dfmt(D.latest)}, As sold (from the Realisation tab). "not priced": nothing of that quality was priced that day; see Coverage on the Realisation tab.`}) : null;
// Search (R2): fabric names, for the owner with the analysis on. A hit opens the product's loom-days (its own waterfall
// and coverage) for the Realisation tab's period, or Fabric masters while the masters are still loading.
function fxSearchHits(q) {
  if (!fxOn() || !FX) return [];
  const out = [];
  for (const uid of Object.keys(FX.M.fab).map(Number)) {
    const name = fxName(uid); if (!name.toLowerCase().includes(q)) continue;
    const f = fcFabricAt(FX.M, uid, fxToday()); if (!f || f.status === 'retired') continue;
    const hgs = Object.values(FX.M.links).map((L) => fcInForce(L, '9999-12-31')).filter((l) => l && (l.value.greige === uid || l.value.rfd === uid)).map((l) => `${fcHgName(l.style)} ${l.width}`);
    out.push({k: 'Fabric', label: name, sub: `${f.finish || 'greige'} · ${ok(f.price) ? '₹' + f.price : 'no price'}${hgs.length ? ' · ' + [...new Set(hgs)].join(', ') : ' · not linked'}`,
      go: () => { if (!fxAll()) { setTab('masters'); return; } const P = fxPeriod(); const rows = fxRows(P, true).filter((r) => r.fabric === uid); /* a search covers both widths */ if (rows.length) fxDaysPanel(name, `${P.label} · ${FXBASIS}`, rows); else setTab('masters'); }});
    if (out.length >= 6) break;
  }
  return out;
}
