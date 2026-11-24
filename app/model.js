// W2 Looms · app/model.js — Double panna, effective RPM and best loom-day: the rules that derive figures from the pipeline data.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- Double panna
// 280 cm looms weave two panels side by side, so each machine pick makes two fabric picks. Default: double panna for every
// 280 cm head group; a head group can be switched to single panna (saved in the Config Sheet's App targets tab as a panna__ row).
// Fabric picks drive "Picks" and air per 1,000 picks. RPM, CFM and warp-break rate stay on the machine's own picks.
let SINGLE = new Set(), pannaLoaded = false;
const pf = (w, hg) => String(w) === '280' && !SINGLE.has(hg) ? 2 : 1;
const pannaId = (w, hg) => 'panna__' + tgtId(w, hg);
// Re-derive fabric picks and air per 1,000 picks for the current switches. Idempotent: loom-day records keep machine picks and air;
// benchmark air figures are rescaled from the panna the pipeline applied when it computed them (old data: none applied).
function applyPanna(data) {
  if (!data) return;
  const fix = (x, w, hg) => { if (!x) return; const f = pf(w, hg); x.fpicks = (x.picks || 0) * f; x.apk = x.fpicks && ok(x.air) ? 1000 * x.air / x.fpicks : null; };
  for (const x of data.loomdays || []) fix(x, x.width, x.hg);
  for (const b of data.benchmarks || []) {
    if (!b._o) b._o = {pf: ok(b.panna) ? b.panna : 1, apk: b.apk, best_apk: b.best_apk, cur_apk: b.cur_apk, rv: b.runs && b.runs.apk ? b.runs.apk.value : null};
    const s = b._o.pf / pf(b.width, b.hg);
    b.apk = ok(b._o.apk) ? b._o.apk * s : b._o.apk; b.best_apk = ok(b._o.best_apk) ? b._o.best_apk * s : b._o.best_apk;
    b.cur_apk = ok(b._o.cur_apk) ? b._o.cur_apk * s : b._o.cur_apk;
    for (const R of Object.values(b.runs || {})) for (const r of [R.lo, R.hi, R.best, ...(R.top || [])]) fix(r, b.width, b.hg);
    if (b.runs && b.runs.apk && ok(b._o.rv)) b.runs.apk.value = b._o.rv * s;
  }
}
// Benchmark CFM for a loom-day = benchmark air per 1,000 fabric picks × panna × the loom's RPM ÷ 1,000 (CFM itself is never doubled).
const cfmOf = (apk, w, hg, rpm) => ok(apk) && ok(rpm) && rpm > 0 ? apk * pf(w, hg) * rpm / 1000 : null;

// ---------------------------------------------------------------- Effective RPM
// Effective RPM = RPM × efficiency ÷ 100 = machine picks per minute of run + stop time. Benchmark: 90th percentile of the
// head group's loom-days (like RPM); best: the highest loom-day; target: 93% of the target RPM (no separate entry).
const ERPM_TGT = 0.93;
const erpmOf = (x) => x && ok(x.rpm) && ok(x.eff) ? x.rpm * x.eff / 100 : null;
const tgtE = (w, hg) => { const t = tgt(w, hg); return t && ok(t.rpm) ? t.rpm * ERPM_TGT : null; };
// Data from before the pipeline computed it: derive it on each loom-day, and the benchmark from the loom-days kept on the page.
function addErpm(data) {
  if (!data || data._erpm) return; data._erpm = true;
  const fix = (x) => { if (x && !ok(x.erpm)) x.erpm = erpmOf(x); };
  for (const x of data.loomdays || []) fix(x);
  const pHigh = (data.settings && data.settings.benchmark_pct_high) || 90;
  for (const b of data.benchmarks || []) {
    for (const R of Object.values(b.runs || {})) for (const r of [R.lo, R.hi, R.best, ...(R.top || [])]) fix(r);
    if (b.runs && b.runs.erpm) { if (!ok(b.erpm)) b.erpm = b.runs.erpm.value; continue; }
    const s = (data.loomdays || []).filter((x) => String(x.width) === String(b.width) && x.hg === b.hg && x.eligible && ok(x.erpm) && (!data.latest || x.date <= data.latest))
      .sort((a, c) => a.erpm - c.erpm || a.date.localeCompare(c.date) || a.loom - c.loom);
    if (!s.length) continue;
    const k = (s.length - 1) * pHigh / 100, f = Math.floor(k), c = Math.ceil(k), fr = k - f;
    const val = f === c ? s[f].erpm : s[f].erpm + (s[c].erpm - s[f].erpm) * fr;
    const better = s.filter((x) => x.erpm >= val - 1e-9).sort((a, c2) => c2.erpm - a.erpm || a.date.localeCompare(c2.date) || a.loom - c2.loom);
    const R = {pct: pHigh, value: val, pos: k, of: s.length, lo: s[f], lo_w: f !== c ? 1 - fr : 1, dropped: [], best: s[s.length - 1], n_better: better.length, top: better.slice(0, 40), local: true};
    if (f !== c) Object.assign(R, {hi: s[c], hi_w: fr});
    b.runs = b.runs || {}; b.runs.erpm = R; b.erpm = val; b.best_erpm = s[s.length - 1].erpm;
  }
}

function agg(L) {
  let picks = 0, fpicks = 0, run = 0, stop = 0, air = 0, warp = 0, mw = 0, mmax = 0; const looms = new Set();
  for (const x of L) {
    picks += x.picks || 0; fpicks += ok(x.fpicks) ? x.fpicks : (x.picks || 0); run += x.run || 0; stop += x.stop || 0; air += x.air || 0; warp += x.warp || 0;
    mw += (x.main || 0) * (x.run || 0); mmax = Math.max(mmax, x.main_max || 0); looms.add(x.loom);
  }
  if (!run || !picks) return null;
  return {looms: looms.size, picks, fpicks, run, stop, air, warp, rpm: picks / run, eff: 100 * run / (run + stop), erpm: picks / (run + stop),
    apk: 1000 * air / fpicks, cfm: air / run, main: mw / run, main_max: mmax, warpRate: warp / picks * 1e5};
}

// ---------------------------------------------------------------- Best loom-day
// The single best loom-day behind each benchmark: fastest RPM, lowest air per 1,000 picks, lowest pressure.
// New data carries it with the benchmark (all history); older data falls back to the loom-days kept on this page.
const BEST_OK = {rpm: 1, erpm: 1, apk: 1, main_max: 1, main: 1};
const HIGH = {rpm: 1, erpm: 1};   // metrics where higher is better
function bestRec(w, hg, m) {
  const b = bench(w, hg); if (!b || !BEST_OK[m]) return null;
  const R = b.runs && b.runs[m];
  if (R && R.best) return R.best;
  const hi = !!HIGH[m];
  const L = (D.loomdays || []).filter((x) => String(x.width) === String(w) && x.hg === hg && x.eligible && ok(x[m]) && (m !== 'main_max' || x[m] > 0));
  if (!L.length) return null;
  return L.reduce((a, x) => (hi ? x[m] > a[m] : x[m] < a[m]) ? x : a);
}
const bestVal = (w, hg, m) => { const r = bestRec(w, hg, m); return r ? r[m] : null; };
// Loom-days at or better than the benchmark, best first.
function betterRecs(w, hg, m) {
  const b = bench(w, hg); const R = b && b.runs && b.runs[m]; if (!R) return {list: [], n: 0, full: true};
  if (R.top) return {list: R.top, n: R.n_better != null ? R.n_better : R.top.length, full: (R.n_better || R.top.length) <= R.top.length, local: !!R.local};
  const hi = !!HIGH[m];
  const L = (D.loomdays || []).filter((x) => String(x.width) === String(w) && x.hg === hg && x.eligible && ok(x[m]) && (m !== 'main_max' || x[m] > 0)
    && (hi ? x[m] >= R.value - 1e-9 : x[m] <= R.value + 1e-9)).sort((a, c) => hi ? c[m] - a[m] : a[m] - c[m]);
  return {list: L, n: L.length, full: false, local: true};
}
const latestRecs = (minRun = 60) => (D.loomdays || []).filter((x) => x.date === D.latest && x.run >= minRun && inW(x.width));
const priorDates = () => (D.complete_days || []).filter((d) => d < D.latest).slice(-7);

function card(title, note, ...body) {
  return el('div', {class: 'card'}, el('div', {class: 'cardhead'}, el('h3', {text: title}), note ? el('span', {class: 'note', text: note}) : null), ...body);
}
function th(label, unit, num) { return el('th', {class: num ? 'num' : null, scope: 'col'}, label, unit ? el('span', {class: 'unit', text: unit}) : null); }
function table(headers, rows, numCols = []) {
  const t = el('table');
  t.append(el('thead', {}, el('tr', {}, headers.map((h, i) => Array.isArray(h) ? th(h[0], h[1], numCols.includes(i)) : th(h, null, numCols.includes(i))))));
  const tb = el('tbody');
  // a cell element carrying data-sort hands it to its td, so the table sorts on that figure (18 Nov 2026)
  for (const r of rows) tb.append(r.nodeType ? r : el('tr', {}, r.map((c, i) => el('td', {class: numCols.includes(i) ? 'num' : null, 'data-sort': c && c.dataset && c.dataset.sort != null ? c.dataset.sort : null}, c))));
  t.append(tb);
  return el('div', {class: 'tablebox'}, t);
}
function moreButton(id, total, shown) {
  if (total <= shown && !SHOWALL[id]) return null;
  return el('button', {class: 'link', type: 'button', text: SHOWALL[id] ? 'Show fewer' : `Show all ${total}`, onclick: () => { SHOWALL[id] = !SHOWALL[id]; render(); }});
}
// Every table longer than 8 rows shows its first 8, with "Show all N rows" under it ("Show fewer" once open). A closing
// Total row stays in view, and an open drill-down row goes with its row. Open tables stay open while the page is open
// (keyed by the card title and the column headings). While the Filter tables box (above the tables) filters a page, every matching row shows.
const TMAX = 8, TOPEN = new Set();
function tableKey(t) {
  const c = t.closest('.card,dialog'), h = c && c.querySelector('h3,h2');
  return ((h ? h.textContent : '') + '|' + [...t.querySelectorAll(':scope>thead th')].map((x) => x.textContent).join('/')).replace(/\d+/g, '#');
}
// ---------------------------------------------------------------- sorting (Divyam, 12 Nov 2026)
// Every table with 3+ rows and every ranked bar chart gets a "Sorting basis" picker (searchable) and an Ascending /
// Descending switch. Tables are sorted in the page itself (sortTables, run with collapseTables on every redraw): the
// basis is any column heading, numbers by value, dates by date, words by name, gaps ("—", "not priced") always last, a
// closing Total row stays last and an open drill-down row stays under its row. "As shown" keeps the screen's own order.
// Bar charts take named bases (sortableChart). The choice is kept per table or chart against the email (the 'sort'
// preference) with a device copy.
function sortAll() {
  let p = null; try { p = typeof prefGet === 'function' ? prefGet('sort') : null; } catch (e) {}
  if (!p) { try { p = JSON.parse(localStorage.getItem('w2-sort') || 'null'); } catch (e) {} }
  return p && typeof p === 'object' ? p : {};
}
const sortGet = (k) => sortAll()[k] || null;
function sortPut(k, v) {
  const all = {...sortAll()}; if (v && v.b) all[k] = v; else delete all[k];   // {b: 'none'} = "As shown" picked over a default
  const keys = Object.keys(all); if (keys.length > 120) delete all[keys[0]];
  try { localStorage.setItem('w2-sort', JSON.stringify(all)); } catch (e) {}
  if (typeof prefSet === 'function') try { prefSet('sort', all); } catch (e) {}
}
// A searchable drop-down: items [{v, label, sub}], value, onPick(v). Typing filters; arrows and Enter pick.
function pickSelect(o) {
  const cur = o.items.find((i) => i.v === o.value) || o.items[0] || {label: ''};
  const inp = el('input', {type: 'search', class: 'trq', value: cur.label, placeholder: o.placeholder || 'Search', autocomplete: 'off', spellcheck: 'false', 'aria-label': o.aria || o.label, role: 'combobox', 'aria-autocomplete': 'list'});
  const list = el('div', {class: 'trsugg', role: 'listbox', hidden: true});
  let items = [], idx = -1;
  const draw = () => {
    list.replaceChildren(...(items.length ? items.slice(0, 80).map((it, i) => el('button', {type: 'button', role: 'option', class: i === idx ? 'on' : null, 'aria-selected': it.v === o.value ? 'true' : 'false',
      onmousedown: (e) => e.preventDefault(), onclick: () => go(i)}, el('span', {text: it.label}), it.sub ? el('span', {class: 's', text: it.sub}) : null))
      : [el('div', {class: 'none', text: 'Nothing matches.'})]));
    list.hidden = false;
  };
  const go = (i) => { const it = items[i]; if (!it) return; list.hidden = true; inp.value = it.label; inp.blur(); o.onPick(it.v); };
  const update = () => { const q = inp.value === cur.label ? '' : inp.value.trim().toLowerCase(); items = q ? o.items.filter((it) => (it.label + ' ' + (it.sub || '')).toLowerCase().includes(q)) : o.items.slice(); idx = items.length ? Math.max(0, items.findIndex((it) => it.v === o.value)) : -1; draw(); };
  inp.addEventListener('focus', () => { inp.select(); update(); });
  inp.addEventListener('input', update);
  inp.addEventListener('blur', () => setTimeout(() => { list.hidden = true; inp.value = cur.label; }, 150));
  inp.addEventListener('keydown', (e) => {
    const n = Math.min(items.length, 80);
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); idx = (idx + 1) % n; draw(); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); idx = (idx - 1 + n) % n; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(idx < 0 ? 0 : idx); }
    else if (e.key === 'Escape') { inp.value = cur.label; list.hidden = true; inp.blur(); }
    e.stopPropagation();
  });
  return el('div', {class: 'trsearch pick', title: o.label}, o.label ? el('span', {class: 'pl', text: o.label}) : null, inp, list);
}
// The sort bar: basis picker + Ascending / Descending. st: {b, d: 'a' | 'd'}; bases [{v, label}] with '' = as shown.
// st.b 'none' (or '') = as shown. A picked basis starts on its own natural order (o.d of the basis, else Descending).
function sortBar(bases, st, set) {
  const b = st && st.b && st.b !== 'none' ? st.b : '', d = st && st.d === 'a' ? 'a' : 'd';
  const dir = (v, t) => el('button', {type: 'button', 'aria-pressed': d === v && b ? 'true' : 'false', disabled: b ? null : true, text: t, onclick: () => set({b, d: v})});
  return el('div', {class: 'toolbar sortbar', 'data-nofold': '1'},
    pickSelect({label: 'Sorting basis', aria: 'Sorting basis', placeholder: 'Search a column', value: b, items: [{v: '', label: 'As shown'}, ...bases.map(({v, label, sub}) => ({v, label, sub}))],
      onPick: (v) => { const B = bases.find((x) => x.v === v); set({b: v || 'none', d: v === b ? d : (B && B.d) || 'd'}); }}),
    el('div', {class: 'seg', role: 'group', 'aria-label': 'Sort order'}, dir('a', '↑ Ascending'), dir('d', '↓ Descending')));
}
const MON = {jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12};
// A cell's sort value: {n} for a number or date, {t} for words, null for a gap.
// The text a cell sorts on: its data-sort (on the td, or on its one element child), else its own text without the small
// print under it (.note, .hint), so "₹130" over "0.006 paise/pick" sorts as 130, not 1300.006 (18 Nov 2026).
function sortText(n) {
  let t = '';
  for (const c of n.childNodes) t += c.nodeType === 3 ? c.textContent + ' ' : c.nodeType === 1 && !(c.classList.contains('note') || c.classList.contains('hint')) ? sortText(c) + ' ' : ' ';
  return t;
}
function sortAs(c, v) { const n = c && c.nodeType ? c : el('span', {text: c == null ? '' : String(c)}); n.dataset.sort = v == null || (typeof v === 'number' && !isFinite(v)) ? '' : String(v); return n; }
function sortVal(td) {
  if (!td) return null;
  const kid = td.dataset && td.dataset.sort == null && td.childElementCount === 1 && td.firstElementChild.dataset.sort != null ? td.firstElementChild.dataset.sort : null;
  const own = td.dataset && td.dataset.sort != null ? td.dataset.sort : kid != null ? kid : td.childNodes ? sortText(td) : td.textContent;
  const t = (own.trim() || td.dataset && td.dataset.sort != null || kid != null ? own : td.textContent).replace(/\s+/g, ' ').trim();   // a cell that is all small print sorts on it
  if (!t || /^(—|–|-|not priced|n\/a|no reference|no figure)$/i.test(t)) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);   // 2026-11-10, 2026-11-18 13:07 (18 Nov 2026)
  if (iso) return {n: (+iso[1] * 10000 + +iso[2] * 100 + +iso[3]) * 10000 + (iso[4] ? +iso[4] * 100 + +iso[5] : 0)};
  const dm = t.match(/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b(?: (\d{4}))?(?:,? (\d{1,2}):(\d{2})\s*(am|pm)?)?/i);
  if (dm) { const hh = dm[4] ? (+dm[4] % 12) + (/pm/i.test(dm[6] || '') ? 12 : 0) : 0;
    return {n: ((+(dm[3] || 2026)) * 10000 + MON[dm[2].toLowerCase()] * 100 + +dm[1]) * 10000 + (dm[4] ? (dm[6] ? hh : +dm[4]) * 100 + +dm[5] : 0)}; }
  const nm = t.match(/^[+]?(?:₹\s?)?([−-])?\s?(?:₹\s?)?(\d[\d,]*(?:\.\d+)?)/);
  if (nm) return {n: (nm[1] ? -1 : 1) * parseFloat(nm[2].replace(/,/g, ''))};
  return {t: t.toLowerCase()};
}
// Gaps last; in a column of figures, a worded cell ("no rate in force", "pick or reed space") goes after the figures in
// both directions, like a gap (18 Nov 2026: it used to jump to the top on Descending).
function sortCmp(a, b, desc) {
  if (!a && !b) return 0; if (!a) return 1; if (!b) return -1;
  if ((a.n != null) !== (b.n != null)) return a.n != null ? -1 : 1;
  const c = a.n != null ? a.n - b.n : a.t.localeCompare(b.t, undefined, {numeric: true});
  return desc ? -c : c;
}
// A table's default sort (18 Nov 2026, Divyam: worst first): sortDefault(tablebox, 'Heading:d', 'Other heading:a', ...),
// the first heading present wins (owner-only columns). Used until the person picks a basis (or "As shown").
function sortDefault(box, ...specs) { const t = box && (box.tagName === 'TABLE' ? box : box.querySelector('table')); if (t) t.dataset.sortdef = specs.join('|'); return box; }
// 'Label:d' or 'Label#unit:a' (unit for headings that repeat, e.g. Realisation ₹ and Realisation paise/pick). A heading
// whose rows are all gaps is passed over for the next one.
function sortDefCol(t, heads, rows) {
  for (const sp of sortSpecs(t)) {
    const m = sp.match(/^(.*?)(?:#(.*))?:([ad])$/); if (!m) continue;
    const i = heads.findIndex((h) => headLabel(h).toLowerCase() === m[1].toLowerCase() && (!m[2] || ((h.querySelector('.unit') || {}).textContent || '').toLowerCase() === m[2].toLowerCase()));
    if (i < 0 || (rows && !rows.some((r) => sortVal(r.children[i])))) continue;
    return {b: String(i), d: m[3]};
  }
  return null;
}
function sortSpecs(t) {
  if (t.dataset.sortdef) return t.dataset.sortdef.split('|');
  const c = t.closest('.card,details'), h = c && c.querySelector('h3,h2'), title = h ? h.textContent.trim() : '';
  const hit = SORT_DEFS.find(([re]) => re.test(title));
  return hit ? hit.slice(1) : [];
}
// Default sorting basis per table, by card title (18 Nov 2026, Divyam: worst first; dates newest first). The first
// heading present (and not all gaps) wins, so owner-only columns fall back for other roles. Not listed = as shown.
const SORT_DEFS = [
  [/^RPM · /, 'Lost:d'], [/^Efficiency · /, 'Picks short:d'], [/^CFM · /, 'Excess:d'], [/^Pressure · /, 'Excess:d'],
  [/^Gap to the reference, by head group/, 'Loom realisation gap#₹ total in the day:a', 'Eff. RPM:a'],
  [/^Current vs reference$/, 'Profit (loom cost):a', 'Looms:d', 'Realisation:a', 'Loom:a'],
  [/^Reference vs running CFM/, 'Worth:d', 'Excess:d', 'Excess air:d'],
  [/^Reference vs running effective RPM/, 'Lost realisation:d', 'Shortfall:d', 'Gained if fixed:d'],
  [/^Reference vs running pressure/, 'Excess:d', 'Energy saved:d'],
  [/^(Excess CFM by day|Picks by day|Floor by day|Days|File health|Corrections)$/, 'Date:d', 'Day:d'],
  [/^Head groups holding the floor up/, 'Days at top:d'],
  [/^Powered down on /, 'Powered down:d'], [/^Consistently low efficiency/, 'Below line:d'],
  [/^By quality$/, 'Rate:d'], [/^Loom-wise: /, 'Rate:d'], [/^Flagged looms/, 'Rate:d'], [/^Qualities breaking/, 'Median rate:d'],
  [/^Break rate by beam|^Realisation lost on each beam/, 'Realisation lost:d', 'Warp stops:d'],
  [/^Why cost per pick moved/, 'Effect:d'], [/^Fixed against variable cost/, 'Amount:d'],
  [/^Production by quality head group/, 'Total:d'], [/^B grade by head group$/, 'B grade:d'], [/^B grade share by head group/, 'Period:d'],
  [/^Loom-wise B grade/, 'B-grade metres produced:d'], [/^B-grade reasons/, 'B grade where named:d', 'B grade:d'],
  [/^Month to date$/, 'Month total:d'], [/^By loom$|^By head group$/, 'Profit (loom cost)#₹/loom/day:a', 'Realisation#paise/pick:a'],   // Round Y: the loom cost basis first; Round A3: the only profit
  [/^Realisation targets/, 'Now vs target:a'], [/^Coverage$/, 'Picks:d'], [/^Files$/, 'Checked:d'],
  [/^Where the saving is$/, 'Effect on cost per pick:a'],   // Round F: the biggest saving (most negative effect) first
];
const headLabel = (h) => (h.firstChild && h.firstChild.nodeType === 3 ? h.firstChild.textContent : h.textContent).trim();
function sortTables(root) {
  if (!root) return;
  for (const t of root.querySelectorAll('.tablebox>table,.heatbox>table')) {
    const box = t.parentElement;
    if (t.classList.contains('nosort') || box.closest('.nosort,.guide')) continue;
    const tb = t.querySelector(':scope>tbody'); if (!tb) continue;
    const all = [...tb.children];
    let main = all.filter((r) => !r.classList.contains('drillrow'));
    const last = main[main.length - 1], lead = last ? [...last.children].slice(0, 2).map((c) => c.textContent.trim()).join(' ') : '';
    const total = last && /^(#?\s*)?(total|together|plant|all)\b/i.test(lead) ? last : null;
    if (total) main = main.slice(0, -1);
    const heads = [...t.querySelectorAll(':scope>thead>tr:last-child>th')];
    if (main.length < 3 || heads.length < 2 || !heads[0].textContent.trim()) continue;   // a blank first heading = rows of figures, not records
    const k = 't:' + tableKey(t);
    main.forEach((r, i) => { if (r.dataset.o == null) r.dataset.o = i; });
    let bar = box.previousElementSibling && box.previousElementSibling.classList.contains('sortbar') ? box.previousElementSibling : null;
    if (!bar) {
      const def = sortDefCol(t, heads, main);
      const bases = heads.map((h, i) => ({v: String(i), label: headLabel(h), sub: (h.querySelector('.unit') || {}).textContent || '', d: def && def.b === String(i) ? def.d : 'd'})).filter((x) => x.label);
      const set = (v) => { sortPut(k, v.b ? v : null); const nb = sortBar(bases, sortGet(k) || sortDefCol(t, heads, main), set); bar.replaceWith(nb); bar = nb; sortTables(box.parentElement); collapseTables(box.parentElement, false); };
      bar = sortBar(bases, sortGet(k) || def, set);
      box.before(bar);
    }
    const st = sortGet(k) || sortDefCol(t, heads, main), col = st && st.b && st.b !== 'none' ? +st.b : -1;
    const order = main.slice().sort(col < 0 || col >= heads.length ? (a, b) => a.dataset.o - b.dataset.o
      : (a, b) => sortCmp(sortVal(a.children[col]), sortVal(b.children[col]), st.d !== 'a') || a.dataset.o - b.dataset.o);
    if (order.every((r, i) => r === main[i])) continue;
    const frag = document.createDocumentFragment();
    for (const r of order) { frag.append(r); const nx = all[all.indexOf(r) + 1]; if (nx && nx.classList.contains('drillrow')) frag.append(nx); }
    if (total) frag.append(total);
    for (const r of all) if (r.parentElement === tb && !order.includes(r) && r !== total && !r.classList.contains('drillrow')) frag.append(r);
    tb.prepend(frag);
  }
}
// A ranked bar chart with its own sort bar. id: kept per chart; rows: the chart's rows; bases: [{v, label, get(row)}]
// (numbers; null = gap, always last; a 'name' base may return a string); draw(rows) → the chart.
// def {b, d}: the chart's default basis (18 Nov 2026, worst first), used until the person picks one or "As shown".
function sortableChart(id, rows, bases, draw, def) {
  const k = 'c:' + id, box = el('div', {class: 'sortchart'});
  const cur = () => sortGet(k) || (def && bases.some((b) => b.v === def.b) ? def : null);
  const sorted = () => {
    const st = cur(), B = st && bases.find((b) => b.v === st.b);
    if (!B) return rows;
    const val = (r) => { const v = B.get(r); return v == null || (typeof v === 'number' && !isFinite(v)) ? null : typeof v === 'number' ? {n: v} : {t: String(v).toLowerCase()}; };
    return rows.map((r, i) => [r, i, val(r)]).sort((a, b) => sortCmp(a[2], b[2], st.d !== 'a') || a[1] - b[1]).map((x) => x[0]);
  };
  const paint = () => {
    const bar = sortBar(bases.map((b) => ({v: b.v, label: b.label, sub: b.sub, d: b.d || (def && def.b === b.v ? def.d : 'd')})), cur(), (v) => { sortPut(k, v.b ? v : null); paint(); });
    box.replaceChildren(bar, draw(sorted()));
  };
  paint();
  return box;
}
function collapseTables(root, off) {
  if (!root) return;
  sortTables(root);
  for (const t of root.querySelectorAll('.tablebox>table')) {
    const box = t.parentElement, main = [...t.querySelectorAll(':scope>tbody>tr')].filter((r) => !r.classList.contains('drillrow'));
    const last = main[main.length - 1], lead = last ? [...last.children].slice(0, 2).map((c) => c.textContent.trim()).join(' ') : '';
    const body = last && /^(#?\s*)?(total|together)\b/i.test(lead.replace(/^\s+/, '')) ? main.slice(0, -1) : main;
    let btn = box.nextElementSibling && box.nextElementSibling.classList.contains('tmore') ? box.nextElementSibling : null;
    const k = tableKey(t), long = body.length > TMAX, open = off || !long || TOPEN.has(k);
    body.forEach((r, i) => {
      const cut = !open && i >= TMAX; r.classList.toggle('cut', cut);
      const nx = r.nextElementSibling; if (nx && nx.classList.contains('drillrow')) nx.classList.toggle('cut', cut);
    });
    if (off || !long) { if (btn) btn.remove(); continue; }
    if (!btn) {
      btn = el('button', {class: 'link tmore', type: 'button'});
      btn.addEventListener('click', () => {
        const y0 = btn.getBoundingClientRect().top;
        if (TOPEN.has(k)) TOPEN.delete(k); else TOPEN.add(k);
        collapseTables(box.parentElement, false);
        const d = btn.getBoundingClientRect().top - y0, sc = btn.closest('dialog');
        if (d < 0) { if (sc) sc.scrollTop += d; else window.scrollBy(0, d); }  // closing: keep the button where it was on screen
      });
      box.after(btn);
    }
    const txt = open ? 'Show fewer' : `Show all ${body.length} rows`;
    if (btn.textContent !== txt) btn.textContent = txt;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}
// Collapsible sections (Divyam, 12 Nov 2026): every card with a heading folds and unfolds when its heading row is tapped
// (buttons and links in that row keep their own job). What is folded is kept against the signed-in email (the 'fold'
// preference, prefGet / prefSet in db.js), keyed by tab (or the panel) and heading, counts ignored, so it follows the person
// to any device; in passcode mode it stays on the device. A device's older w2-fold copy seeds the first save. Coverage
// starts folded; every other card starts open. While the Filter tables box filters a page, every card shows. Wired on each redraw
// by the same observer as collapseTables (gapSoon in nav.js).
const FOLD_DEF = {'Coverage': true};
function foldMap() {
  const v = typeof prefGet === 'function' ? prefGet('fold') : null;
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  try { const o = JSON.parse(localStorage.getItem('w2-fold') || '{}'); if (o && typeof o === 'object' && !Array.isArray(o)) return o; } catch (e) {}
  return {};
}
const foldName = (h) => h.textContent.trim();
const foldKey = (c, h) => (c.closest('dialog') ? 'panel' : TAB) + '|' + foldName(h).replace(/\d[\d,.]*/g, '#');
const foldShut = (c, h) => { const k = foldKey(c, h), F = foldMap(); return k in F ? !!F[k] : !!FOLD_DEF[foldName(h)]; };
function foldSet(c, shut) {
  const h = c.querySelector(':scope>.cardhead>h3'); if (!h) return;
  const k = foldKey(c, h), F = Object.assign({}, foldMap());
  if (shut === !!FOLD_DEF[foldName(h)]) delete F[k]; else F[k] = shut;   // only what differs from the default is kept
  if (typeof prefSet === 'function') prefSet('fold', F);
  c.classList.toggle('shut', shut); h.setAttribute('aria-expanded', shut ? 'false' : 'true');
  if (!shut && typeof gapSoon === 'function') gapSoon();   // charts drawn while folded get their width now
}
function foldCards(root, off) {
  if (!root) return;
  for (const hd of root.querySelectorAll('.card>.cardhead')) {
    const c = hd.parentElement, h = hd.querySelector(':scope>h3');
    if (!h || !foldName(h) || c.closest('tr.drillrow')) continue;
    if (!hd.dataset.fold) {
      hd.dataset.fold = '1'; hd.classList.add('fold'); h.setAttribute('role', 'button'); h.tabIndex = 0;
      hd.addEventListener('click', (e) => { if (e.target.closest('a,button,input,select,textarea,label,[role="link"]') && !e.target.closest('h3')) return; foldSet(c, !c.classList.contains('shut')); });
      h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); foldSet(c, !c.classList.contains('shut')); } });
    }
    const shut = !off && foldShut(c, h);
    if (c.classList.contains('shut') !== shut) c.classList.toggle('shut', shut);
    if (h.getAttribute('aria-expanded') !== String(!shut)) h.setAttribute('aria-expanded', shut ? 'false' : 'true');
  }
}
const collapseAll = () => { const q = !!(typeof QF === 'string' && QF.trim()); collapseTables($('#main'), q); foldCards($('#main'), q); if (dlg && dlg.open) { collapseTables(dlg, false); foldCards(dlg, false); } if (typeof wkDecorate === 'function') wkDecorate(); };
function delta(cur, prev, goodUp, fmt = (x) => x.toFixed(1), unit = '') {
  if (!ok(cur) || !ok(prev)) return el('span', {class: 'delta flat', text: 'no prior days'});
  const d = cur - prev;
  if (Math.abs(d) < 1e-9) return el('span', {class: 'delta flat', text: '±0 vs prior days'});
  const good = goodUp ? d > 0 : d < 0;
  if (!/[1-9]/.test(fmt(Math.abs(d)))) return el('span', {class: 'delta flat', text: '±0' + unit + ' vs prior-days avg'});   // rounds to zero: no arrow, no '−0'
  return el('span', {class: 'delta ' + (good ? 'up-good' : 'up-bad'), text: (d > 0 ? '▲ +' : '▼ −') + fmt(Math.abs(d)) + unit + ' vs prior-days avg'});
}
function benchTag(b) {
  if (!b) return el('span', {class: 'pill muted', text: 'no benchmark'});
  const m = {published: ['good', 'benchmark'], 'single-loom': ['info', 'single loom'], provisional: ['warn', 'provisional']};
  const [c, t] = m[b.status] || ['muted', b.status || 'none'];
  return el('span', {}, el('span', {class: 'pill ' + c, text: t}), el('div', {class: 'note', text: `${b.n} loom-days · ${b.dates} dates · ${b.looms} looms`}));
}
// A metric cell: current value, then "bm x · tgt y". Missed references are underlined in red and the value gets ▼/▲.
// 12 Nov 2026 (Divyam): "Current vs reference". While MREF is set ('bm' | 'best' | 'tgt'), mcell shows only that reference,
// with the gap to it, and judges the cell against it alone.
let MREF = null;
function mcellOne(now, bm, tg, fmt, higherBetter, tolBm, tolTg, ref, mode) {
  let rv = mode === 'bm' ? bm : mode === 'tgt' ? tg : null;
  if (mode === 'best' && ref && BEST_OK[ref.m]) { rv = bestVal(ref.w, ref.hg, ref.m); if (ref.view === 'cfm') rv = cfmOf(rv, ref.w, ref.hg, ref.rpm); }
  if (!ok(rv) && mode !== 'bm' && ok(bm)) { rv = bm; mode = 'bm'; }   // no target / no best: the benchmark stands in, labelled bm
  const tol = mode === 'tgt' ? (tolTg || (() => 0)) : tolBm, lab = {bm: 'bm', best: 'best', tgt: 'tgt'}[mode];
  const miss = ok(now) && ok(rv) && (higherBetter ? now < rv - tol(rv) : now > rv + tol(rv));
  const mk = miss ? el('span', {class: 'mk', 'aria-label': higherBetter ? 'below reference' : 'above reference', text: higherBetter ? '▼' : '▲'}) : null;
  const txt = lab + ' ' + fmt(rv);
  const r = ref && ok(rv) && mode !== 'tgt' ? bmBtn(txt, ref.w, ref.hg, ref.m, {miss, kind: mode === 'best' ? 'best' : undefined, view: ref.view, rpm: ref.rpm}) : el('span', {class: miss ? 'miss' : null, text: txt});
  const g = ok(now) && ok(rv) ? now - rv : null;
  return el('div', {class: 'mv'}, el('div', {class: 'v'}, fmt(now), mk), el('div', {class: 'ref'}, r, ok(g) ? ` · ${g >= 0 ? '+' : '−'}${fmt(Math.abs(g))}` : ''));
}
function mcell(now, bm, tg, fmt, higherBetter, tolBm, tolTg, ref) {
  if (MREF) return mcellOne(now, bm, tg, fmt, higherBetter, tolBm, tolTg, ref, MREF);
  const missB = ok(now) && ok(bm) && (higherBetter ? now < bm - tolBm(bm) : now > bm + tolBm(bm));
  const missT = ok(now) && ok(tg) && (higherBetter ? now < tg - (tolTg ? tolTg(tg) : 0) : now > tg + (tolTg ? tolTg(tg) : 0));
  const mk = (missB || missT) ? el('span', {class: 'mk', 'aria-label': higherBetter ? 'below reference' : 'above reference', text: higherBetter ? '▼' : '▲'}) : null;
  const refs = [];
  refs.push(ref && ok(bm) ? bmBtn('bm ' + fmt(bm), ref.w, ref.hg, ref.m, {miss: missB, view: ref.view, rpm: ref.rpm}) : el('span', {class: missB ? 'miss' : null, text: 'bm ' + fmt(bm)}));
  if (ref && BEST_OK[ref.m]) {
    let bv = bestVal(ref.w, ref.hg, ref.m);
    if (ref.view === 'cfm') bv = cfmOf(bv, ref.w, ref.hg, ref.rpm);
    if (ok(bv)) refs.push(' · ', bmBtn('best ' + fmt(bv), ref.w, ref.hg, ref.m, {kind: 'best', view: ref.view, rpm: ref.rpm}));
  }
  if (ok(tg)) refs.push(' · ', el('span', {class: missT ? 'miss' : null, text: 'tgt ' + fmt(tg)}));
  return el('div', {class: 'mv'}, el('div', {class: 'v'}, fmt(now), mk), el('div', {class: 'ref'}, refs));
}
const tolRpm = (r) => r * (S().tol_rpm_pct || 3) / 100;
const EFF_BAD = () => ok(S().eff_bad_below) ? S().eff_bad_below : 90;
// Efficiency has no benchmark: any loom below the fixed line (Config Sheet, eff_bad_below) is bad.
function effCell(now) {
  const bad = ok(now) && now < EFF_BAD();
  return el('div', {class: 'mv'}, el('div', {class: 'v'}, f1(now), bad ? el('span', {class: 'mk', 'aria-label': 'below the line', text: '▼'}) : null),
    el('div', {class: 'ref'}, el('span', {class: bad ? 'miss' : null, text: `line ${f0(EFF_BAD())}`})));
}
const tolAir = (r) => r * (S().tol_air_pct || 5) / 100;
const tolP = () => PRESS_TOL;
// ---- This week vs last week on a period bar (Round D, Divyam 17 Nov 2026). c: a wkMean / wkBy result (calc.js);
// o: {what (the figure's name), fmt (number only), unit, dunit (the change's unit, if not unit), basis (named when the figure sits on a basis switch)}.
// "This week" = the 7 days to the day shown, "last week" = the 7 before (D1); a week with missing days shows "5 of 7 days"
// and compares the average of the days it has (D3); a week with no day is "—", never 0. Each week carries its dates on
// both widths, so a phone reader sees they are rolling 7 days, not calendar weeks.
function wkPill(c, o) {
  if (!c) return null;
  const sp = (x) => shortRange(x.from, x.to), cov = (x) => x.days < c.of ? ` (${x.days} of ${c.of} days)` : '';
  const tip = `This week = ${sp(c.cur)}, the 7 days to the day shown. Last week = ${sp(c.prev)}, the 7 days before. A week with missing days compares the average of the days it has.`;
  const u = (x) => !x ? '' : x[0] === '%' ? x : ' ' + x, unit = u(o.unit), dunit = u(o.dunit != null ? o.dunit : o.unit), basis = o.basis ? ` · ${o.basis}` : '';
  const dd = (x) => el('span', {class: 'wkd', text: ` (${sp(x)})`});   // the week's dates, on both widths
  if (!c.dir) {
    const miss = !ok(c.cur.v) && !ok(c.prev.v) ? ['neither this week', dd(c.cur), ' nor last week', dd(c.prev), ' has a day with figures yet']
      : !ok(c.prev.v) ? ['last week', dd(c.prev), ' has no day with figures yet'] : ['this week', dd(c.cur), ' has no day with figures yet'];
    return el('div', {class: 'wkcmp', 'data-wk': 'gap', title: tip}, el('b', {text: o.what}), ', this week vs last week: — ', ...miss,
      `. The comparison shows once both weeks have a day: pick a later day${typeof wkNext === 'function' ? ' with ' + wkNext('{day}') : ''}, or check again after the daily run (it updates the app every hour, 10:40 to 16:40 IST). ` +
      (typeof fxIsOwner === 'function' && fxIsOwner() ? 'If a week stays empty, see Files per day on Data health for the missing days.' : 'If a week stays empty, tell the owner.'));
  }
  const ad = Math.abs(c.d), zero = !/[1-9]/.test(o.fmt(ad));
  const cls = zero || c.good == null ? 'flat' : c.good ? 'up-good' : 'up-bad';
  const chg = zero ? '±0' : (c.d > 0 ? '▲ +' : '▼ −') + o.fmt(ad) + dunit;
  return el('div', {class: 'wkcmp', 'data-wk': c.dir, title: tip},
    el('b', {text: o.what}), ', this week', dd(c.cur), ` ${o.fmt(c.cur.v)}${unit}${cov(c.cur)} vs last week`, dd(c.prev), ` ${o.fmt(c.prev.v)}${unit}${cov(c.prev)} `,
    el('span', {class: 'delta ' + cls, text: chg}), basis,
    typeof wkMark === 'function' ? wkMark(['A7'], `This week vs last week: ${o.what}`, {A7: {cur: c.cur.v, prev: c.prev.v, cn: c.cur.days, pn: c.prev.days, of: c.of, fmt: o.fmt, unit, dunit}}) : null);   // Round J
}

// ---------------------------------------------------------------- Search, favourites and recent places (Round E, 17 Nov 2026)
// Pure parts, tested in tests/test_nav.py; the screens are in nav.js. Visits are kept per place as [IST day number, count]
// pairs for the last NAV_DAYS days; favourites are the NAV_FAV places with the most visits in that window (ties: the most
// recent visit first, then the place id). Recent holds the last NAV_RECENT places or searches, newest first, no repeats.
const NAV_DAYS = 30, NAV_FAV = 5, NAV_RECENT = 10, NAV_MAX_PLACES = 40;
const navDay = (t) => Math.floor((t + 5.5 * 3600e3) / 86400e3);   // the IST calendar day
function navVisit(store, id, t) {
  const d = navDay(t), s = {};
  for (const [k, a] of Object.entries(store && typeof store === 'object' ? store : {})) {
    const kept = (Array.isArray(a) ? a : []).filter((x) => Array.isArray(x) && x[0] > d - NAV_DAYS && x[1] > 0);
    if (kept.length) s[k] = kept;
  }
  const a = s[id] || (s[id] = []), last = a[a.length - 1];
  if (last && last[0] === d) a[a.length - 1] = [d, last[1] + 1]; else a.push([d, 1]);
  const ids = Object.keys(s);
  if (ids.length > NAV_MAX_PLACES) {   // keep the places with the most visits (the one just visited always stays)
    const tot = (k) => s[k].reduce((n, x) => n + x[1], 0);
    for (const k of ids.filter((k) => k !== id).sort((x, y) => tot(x) - tot(y) || s[x].at(-1)[0] - s[y].at(-1)[0]).slice(0, ids.length - NAV_MAX_PLACES)) delete s[k];
  }
  return s;
}
function navFavs(store, t, okId = () => true) {
  const d = navDay(t);
  return Object.entries(store && typeof store === 'object' ? store : {}).map(([id, a]) => {
    const w = (Array.isArray(a) ? a : []).filter((x) => Array.isArray(x) && x[0] > d - NAV_DAYS && x[0] <= d);
    return {id, n: w.reduce((n, x) => n + (x[1] > 0 ? x[1] : 0), 0), last: w.reduce((m, x) => Math.max(m, x[0]), -1)};
  }).filter((x) => x.n > 0 && okId(x.id)).sort((a, b) => b.n - a.n || b.last - a.last || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, NAV_FAV);
}
function navRecentAdd(list, item) {
  return [item, ...(Array.isArray(list) ? list : []).filter((x) => x && x.id !== item.id)].slice(0, NAV_RECENT);
}
// A card's place id ignores the figures in its heading ("RPM · 18 looms" and "RPM · 20 looms" are one place).
const navCardName = (t) => String(t).trim().replace(/\s·\s[^·]*\d[^·]*$/, '');
const navNorm = (t) => navCardName(t).toLowerCase().replace(/\d[\d,.]*/g, '#');
// Matches every word of Q against an item's label (and its tab or group, `sub`), best first: the whole label, the label's
// start, a word's start, inside the label, then only through `sub`. Ties keep the items' own order (tab order).
function navMatch(items, q) {
  const words = String(q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const qq = words.join(' ');
  const out = [];
  items.forEach((it, i) => {
    const lab = String(it.label || '').toLowerCase(), all = lab + ' ' + String(it.sub || '').toLowerCase();
    if (!words.every((w) => all.includes(w))) return;
    const inLab = words.every((w) => lab.includes(w));
    const s = lab === qq ? 5 : lab.startsWith(qq) ? 4 : inLab && words.every((w) => (' ' + lab).includes(' ' + w)) ? 3 : inLab ? 2 : 1;
    out.push({it, s, i});
  });
  return out.sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.it);
}
