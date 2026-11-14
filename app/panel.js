// W2 Looms · app/panel.js — The drill-down panel: benchmark, best, loom and head-group details.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- Drill-down panel (benchmark, best, loom, head group)
const BMETA = {
  rpm: {label: 'RPM', unit: 'picks/min', fmt: (x) => f0(x), best: 'high'},
  erpm: {label: 'Effective RPM', unit: 'picks/min of run + stop time', fmt: (x) => f0(x), best: 'high'},
  apk: {label: 'Air per 1,000 picks', unit: 'ft³ / 1,000 picks', fmt: (x) => f1(x), best: 'low'},
  main_max: {label: 'Main pressure (day max)', unit: 'kgf/cm²', fmt: (x) => f2(x), best: 'low'},
  main: {label: 'Main pressure (run-weighted avg)', unit: 'kgf/cm²', fmt: (x) => f2(x), best: 'low'},
  warp_rate: {label: 'Warp break rate (median)', unit: 'per 100k picks', fmt: (x) => f2(x), best: 'low'}};
const pkey = (b) => b && ok(b.main_max) ? 'main_max' : 'main';
const stopKey = (e) => e.stopPropagation();
const pctText = (p) => p === 50 ? 'median' : `${f0(p)}th percentile`;
// A benchmark or best figure that opens the loom-days behind it. view 'cfm' shows the air figure as CFM.
function bmBtn(text, w, hg, m, opts = {}) {
  const b = bench(w, hg); const best = opts.kind === 'best';
  if (!b || !b.runs || !b.runs[m] || (best && !bestRec(w, hg, m))) return el('span', {class: opts.miss ? 'miss' : null, text});
  return el('button', {type: 'button', class: 'bmb' + (opts.miss ? ' miss' : '') + (best ? ' best' : ''), text,
    title: best ? 'See the best loom-day' : 'See the loom-days behind this benchmark',
    'aria-label': `${text}: show the ${best ? 'best loom-day' : 'loom-days behind the benchmark'} for ${BMETA[m].label}, ${hg}, ${w} cm`,
    onclick: (e) => { e.stopPropagation(); openBm(w, hg, m, opts); }, onkeydown: stopKey});
}
// Loom numbers and head groups anywhere on the page open their own details for the date shown.
function loomLink(loom, date, label) {
  return el('button', {type: 'button', class: 'lk', 'data-loom': String(loom), text: label != null ? label : String(loom), title: `Loom ${loom}: details`,
    'aria-label': `Loom ${loom}: show details`, onclick: (e) => { e.stopPropagation(); openLoom(+loom, date || D.latest); }, onkeydown: stopKey});
}
// A head group carries its linked fabric's name, which can be the same on both loom widths, so the width rides beside it as a
// small label (Divyam, 12 Nov 2026).
const wTag = (w) => (String(w) === '190' || String(w) === '280') ? el('span', {class: 'wtag' + (String(w) === '190' ? ' n190' : ''), text: String(w), title: `${w} cm loom`, 'aria-hidden': 'true'}) : null;
function hgLink(hg, w, date, label) {
  if (!hg || hg === 'Unassigned' || hg === '—') return el('span', {'data-hg': hg || '', text: label || hg || '—'});
  return el('button', {type: 'button', class: 'hgl', 'data-hg': hg, 'data-w': w ? String(w) : null, title: `${hg}${w ? ', ' + w + ' cm' : ''}: benchmark and looms`,
    'aria-label': `${hg}${w ? ', ' + w + ' cm' : ''}: show benchmark and looms`, onclick: (e) => { e.stopPropagation(); openHg(hg, w, date || D.latest); }, onkeydown: stopKey},
    label || hg, label ? null : wTag(w));
}
// Turn "Loom 12" in alert text into a link.
function linkify(text, date) {
  const parts = String(text).split(/(\b[Ll]oom \d{1,2}\b)/);
  return parts.map((p) => { const m = /^[Ll]oom (\d{1,2})$/.exec(p); return m && (D.machine || {})[m[1]] ? loomLink(+m[1], date, p) : p; });
}

let dlg = null; const STACK = [];
function panelEl() {
  if (!dlg) {
    dlg = el('dialog', {class: 'bmp', 'aria-labelledby': 'bmp-t'});
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { STACK.length = 0; });
    document.body.append(dlg);
  }
  return dlg;
}
function pushView(fn) { const d = panelEl(); if (!d.open) STACK.length = 0; STACK.push(fn); drawPanel(); if (!d.open) d.showModal(); }
function drawPanel(keepScroll) {
  const d = panelEl(); if (!STACK.length) return;
  const y = d.scrollTop; const v = STACK[STACK.length - 1]();
  d.replaceChildren(
    el('div', {class: 'hd'},
      STACK.length > 1 ? el('button', {class: 'back', type: 'button', text: '‹ Back', onclick: () => { STACK.pop(); drawPanel(); }}) : null,
      el('div', {class: 'ttl'}, el('h2', {id: 'bmp-t', text: v.title}), v.sub ? el('div', {class: 'lead'}, v.sub) : null),
      el('button', {class: 'x', type: 'button', 'aria-label': 'Close', text: '×', onclick: () => d.close()})),
    el('div', {class: 'bd'}, ...v.body.filter(Boolean)));
  fixPlurals(d); collapseTables(d, false);
  d.scrollTop = keepScroll ? y : 0;
}
const closePanel = () => { if (dlg && dlg.open) dlg.close(); };

// One table layout for loom-day records everywhere in the panel and the Benchmarks tab.
const RCOLS = [['Date'], ['Loom'], ['Head group'], ['RPM', 'picks/min', 'rpm'], ['Eff', '%', 'eff'], ['Eff. RPM', 'RPM × eff', 'erpm'], ['CFM', 'ft³/min running', 'cfm'], ['Air', 'ft³/1,000 picks', 'apk'],
  ['Main max', 'kgf/cm²', 'main_max'], ['Warp', 'breaks', 'warp'], ['Warp rate', '/100k picks', 'warp_rate'], ['Picks', 'lakh', 'picks'],
  ['Beam'], ['Run', 'h'], ['Style as uploaded']];
function runTable(recs, w, hg, opts = {}) {
  const hl = opts.hl, cols = RCOLS.filter((c) => (opts.hgCol || c[0] !== 'Head group') && (!opts.noLoom || c[0] !== 'Loom'));
  const lead = opts.lead || [];
  const t = el('table');
  t.append(el('thead', {}, el('tr', {}, [...lead.map((c) => th(c[0], c[1], true)), ...cols.map((c) => {
    const h = th(c[0], c[1], !!c[2] || c[0] === 'Run' || c[0] === 'Loom'); if (c[2] && c[2] === hl) h.classList.add('hl'); return h; })])));
  const tb = el('tbody');
  for (const x of recs) {
    if (x.__row) { tb.append(x.__row); continue; }
    const xw = x.width || w, xh = x.hg || hg;
    const fp = ok(x.fpicks) ? x.fpicks : (x.picks || 0) * pf(xw, xh);
    const v = {rpm: f0(x.rpm), eff: f1(x.eff), erpm: f0(ok(x.erpm) ? x.erpm : erpmOf(x)), cfm: f1(x.cfm), apk: f1(x.apk), main: f2(x.main), main_max: f2(x.main_max), warp: f0(x.warp), warp_rate: f2(x.warp_rate), picks: f2(fp / PICK_LAKH)};
    tb.append(el('tr', {class: opts.rowClass ? opts.rowClass(x) : null}, ...lead.map((c) => el('td', {class: 'num'}, c[2](x))), ...cols.map((c) => {
      if (c[0] === 'Date') return el('td', {class: 'd', text: dfmt(x.date)});
      if (c[0] === 'Loom') return el('td', {class: 'num'}, loomLink(x.loom, x.date), el('div', {class: 'note', text: x.type || ''}));
      if (c[0] === 'Head group') return el('td', {}, hgLink(x.hg, xw, x.date));
      if (c[0] === 'Beam') return el('td', {class: 'mono d', text: x.beam || '—'});
      if (c[0] === 'Run') return el('td', {class: 'num', text: f1(x.run / 60)});
      if (c[0] === 'Style as uploaded') return el('td', {class: 'mono', text: (x.styles || []).join(', ') || '—'});
      return el('td', {class: 'num' + (c[2] === hl ? ' hl' : ''), text: v[c[2]]});
    })));
  }
  t.append(tb);
  return el('div', {class: 'tablebox'}, t);
}

// Benchmark (percentile) or best loom-day for one metric of one quality: the content of the panel and of the Benchmarks tab.
function bmDetail(w, hg, m, kind, opts = {}) {
  const b = bench(w, hg); const R = b && b.runs && b.runs[m]; const M = BMETA[m];
  if (!R) return [el('div', {class: 'empty', text: 'No benchmark for this metric yet.'})];
  const asCfm = opts.view === 'cfm' && m === 'apk';
  const pctTxt = pctText(R.pct);
  const out = [];
  const cfmNote = (v, label) => asCfm ? el('p', {class: 'scopenote', text: `CFM figures on the page are this air figure converted at each loom's own speed: ${label} CFM = ${M.fmt(v)} × RPM ÷ 1,000${pf(w, hg) === 2 ? ' × 2 (double panna)' : ''}.${ok(opts.rpm) ? ` At ${f0(opts.rpm)} RPM that is ${f1(cfmOf(v, w, hg, opts.rpm))} CFM.` : ''} The loom-days below set the air figure; their own CFM is in the CFM column.`}) : null;
  if (kind === 'best') {
    const r = bestRec(w, hg, m);
    if (!r) return [el('div', {class: 'empty', text: m === 'warp_rate' ? 'The warp benchmark is a median, so there is no best loom-day for it.' : 'No loom-day to show.'})];
    const gap = ok(R.value) ? (M.best === 'high' ? r[m] - R.value : R.value - r[m]) : null;
    out.push(el('div', {class: 'lead'}, `Best ${m === 'rpm' ? 'RPM' : m === 'erpm' ? 'effective RPM' : M.label.charAt(0).toLowerCase() + M.label.slice(1)} `, el('b', {text: `${M.fmt(r[m])} ${M.unit}`}),
      ok(gap) ? ` · ${M.fmt(Math.abs(gap))} ${M.best === 'high' ? 'faster than' : 'below'} the ${pctTxt} benchmark of ${M.fmt(R.value)}` : '',
      ` · the ${M.best === 'high' ? 'fastest' : 'lowest'} of ${R.of} counted loom-days${b.runs[m].best && !R.local ? '' : ' kept on this page'}`));
    out.push(cfmNote(r[m], 'best'));
    out.push(runTable([r], w, hg, {hl: m}));
    return out;
  }
  const tie = R.hi && Math.abs(R.hi[m] - R.lo[m]) < 1e-9;
  out.push(el('div', {class: 'lead'}, `${asCfm ? 'Air per 1,000 picks (shown as CFM on the page)' : M.label} benchmark `, el('b', {text: `${M.fmt(R.value)} ${M.unit}`}),
    ` · ${pctTxt} of ${R.of} counted loom-days${R.local ? ' kept on this page' : ''} · `, benchTag(b)));
  if (m === 'erpm') out.push(el('p', {class: 'scopenote', text: `Effective RPM = RPM × efficiency ÷ 100, the picks a loom makes per minute of run plus stop time. Target effective RPM = ${f0(ERPM_TGT * 100)}% of the target RPM.`}));
  out.push(cfmNote(R.value, 'benchmark'));
  const pair = [[R.lo, R.lo_w], [R.hi, R.hi_w]].filter((p) => p[0]);
  out.push(el('div', {}, el('h3', {text: R.hi && !tie ? 'The two loom-days either side of the benchmark' : 'The loom-day at the benchmark'}),
    el('p', {class: 'note', text: R.hi && !tie ? `The ${pctTxt} falls at position ${f2(R.pos + 1)} of ${R.of} counted loom-days, between these two. Weight = how much each contributes.` : `The ${pctTxt} lands on this loom-day.`}),
    runTable(pair.map((p) => Object.assign({}, p[0], {__w: p[1]})), w, hg, {hl: m, lead: [['Weight', null, (x) => R.hi ? `${f0(x.__w * 100)}%` : '100%']]}),
    el('div', {class: 'formula', text: R.hi && !tie ? `${M.fmt(R.lo[m])} × ${f2(R.lo_w)} + ${M.fmt(R.hi[m])} × ${f2(R.hi_w)} = ${M.fmt(R.value)} ${M.unit}`
      : `${M.fmt(R.value)} ${M.unit}${tie ? ' (both loom-days either side have this value)' : ''}`})));
  if (R.pct !== 50) {
    const B = betterRecs(w, hg, m);
    out.push(el('div', {}, el('h3', {text: `Loom-days ${M.best === 'high' ? 'at or above' : 'at or below'} the benchmark (${B.n})`}),
      el('p', {class: 'note', text: `These make up the best ${f0(M.best === 'high' ? 100 - R.pct : R.pct)}% that the benchmark is drawn from, ${M.best === 'high' ? 'fastest' : 'lowest'} first.${B.list.length < B.n ? ` Showing the best ${B.list.length}.` : ''}${B.local ? ' From the 60 days kept in detail on this page.' : ''}`}),
      B.list.length ? runTable(B.list, w, hg, {hl: m}) : el('div', {class: 'empty', text: 'None.'})));
  } else {
    out.push(el('p', {class: 'note', text: 'The warp break benchmark is the median loom-day of this head group, so half the loom-days are on each side of it.'}));
  }
  return out;
}
function openBm(w, hg, m, opts = {}) {
  const st = {kind: opts.kind === 'best' ? 'best' : 'pct'};
  pushView(() => {
    const b = bench(w, hg); const R = b.runs[m];
    const seg = BEST_OK[m] ? el('div', {class: 'seg', role: 'group', 'aria-label': 'Benchmark or best'},
      el('button', {type: 'button', 'aria-pressed': st.kind === 'pct' ? 'true' : 'false', text: `Benchmark · ${pctText(R.pct)}`, onclick: () => { st.kind = 'pct'; drawPanel(); }}),
      el('button', {type: 'button', 'aria-pressed': st.kind === 'best' ? 'true' : 'false', text: 'Best loom-day', onclick: () => { st.kind = 'best'; drawPanel(); }})) : null;
    return {title: `${hg} · ${w} cm`, sub: `${opts.view === 'cfm' && m === 'apk' ? 'CFM (from air per 1,000 picks)' : BMETA[m].label}`,
      body: [el('div', {class: 'toolbar', style: 'margin:0'}, seg, el('button', {class: 'link', type: 'button', text: 'All benchmarks and looms for this quality ›', onclick: () => openHg(hg, w, D.latest)})),
        ...bmDetail(w, hg, m, st.kind, opts)]};
  });
}

// Benchmark, best and target for every metric of one quality, against a day's figures (A = agg of loom-days or null).
function benchSummary(w, hg, A, nowLabel, opts = {}) {
  const b = bench(w, hg) || {}, t = tgt(w, hg) || {};
  // R2 (11 Nov 2026): a "Gap worth" column for the owner with the analysis on (fxGapWorth); absent for everyone else
  const G = typeof fxGapWorth === 'function' ? fxGapWorth(w, hg, A, opts.date || D.latest, opts.loom) : null;
  const gw = (k) => !G ? null : G.loading ? el('span', {class: 'note', text: '…'}) : (G[k] != null ? G[k] : '—');
  const rpm = A && A.rpm;
  const pk = pkey(b);
  const btn = (v, m, fmt, o = {}) => ok(v) ? bmBtn(fmt(v), w, hg, m, o) : '—';
  const worse = (now, ref, hi, tol) => ok(now) && ok(ref) && (hi ? now < ref - tol : now > ref + tol);
  const nowCell = (v, fmt, bad, hi) => el('span', {style: bad ? 'color:var(--bad);font-weight:700' : null, text: fmt(v) + (bad ? (hi ? ' ▼' : ' ▲') : '')});
  const rows = [
    ['RPM', 'picks/min', A && nowCell(A.rpm, f0, worse(A.rpm, b.rpm, true, tolRpm(b.rpm || 0)), true), btn(b.rpm, 'rpm', f0), btn(bestVal(w, hg, 'rpm'), 'rpm', f0, {kind: 'best'}), f0(t.rpm), gw('rpm')],
    ['Effective RPM', `RPM × eff · target ${f0(ERPM_TGT * 100)}% of target RPM`, A && nowCell(A.erpm, f0, worse(A.erpm, b.erpm, true, tolRpm(b.erpm || 0)), true), btn(b.erpm, 'erpm', f0), btn(bestVal(w, hg, 'erpm'), 'erpm', f0, {kind: 'best'}), f0(tgtE(w, hg)), gw('erpm')],
    ['CFM', 'ft³/min running, at this RPM', A && nowCell(A.cfm, f1, worse(A.cfm, cfmOf(b.apk, w, hg, rpm), false, tolAir(cfmOf(b.apk, w, hg, rpm) || 0))),
      ok(rpm) ? btn(cfmOf(b.apk, w, hg, rpm), 'apk', f1, {view: 'cfm', rpm}) : '—', ok(rpm) ? btn(cfmOf(bestVal(w, hg, 'apk'), w, hg, rpm), 'apk', f1, {kind: 'best', view: 'cfm', rpm}) : '—', f1(t.cfm), gw('cfm')],
    ['Air', 'ft³/1,000 picks' + (pf(w, hg) === 2 ? ', double panna' : ''), A && nowCell(A.apk, f1, worse(A.apk, b.apk, false, tolAir(b.apk || 0))), btn(b.apk, 'apk', f1), btn(bestVal(w, hg, 'apk'), 'apk', f1, {kind: 'best'}), '—', gw('apk')],
    ['Main pressure', 'kgf/cm², day max', A && nowCell(A.main_max, f2, worse(A.main_max, b[pk], false, PRESS_TOL)), btn(b[pk], pk, f2), btn(bestVal(w, hg, pk), pk, f2, {kind: 'best'}), f2(t.main), G ? '—' : null],
    ['Efficiency', '%', A && nowCell(A.eff, f1, A.eff < EFF_BAD(), true), `line ${f0(EFF_BAD())}`, '—', '—', gw('eff')],
    ['Warp breaks', 'per 100k picks', A && f2(A.warpRate), btn(b.warp_med, 'warp_rate', f2), '—', '—', G ? '—' : null]];
  const t2 = el('table');
  t2.append(el('thead', {}, el('tr', {}, th('Metric'), th(nowLabel || 'This day', null, true), th('Benchmark', null, true), th('Best', 'single loom-day', true), th('Target', null, true), G ? th('Gap worth', '₹ a day, to benchmark', true) : null)));
  const tb = el('tbody');
  for (const r of rows) tb.append(el('tr', {}, el('td', {}, el('b', {text: r[0]}), el('div', {class: 'note', text: r[1]})),
    el('td', {class: 'num'}, A ? r[2] : '—'), el('td', {class: 'num hl'}, r[3]), el('td', {class: 'num'}, r[4]), el('td', {class: 'num'}, r[5]), G ? el('td', {class: 'num'}, A ? r[6] : '—') : null));
  t2.append(tb);
  return el('div', {}, el('div', {class: 'tablebox'}, t2), G && !G.loading && A ? el('p', {class: 'note', text: G.note}) : null);
}

// Panna switch for a 280 cm head group (default double panna).
const PANNA_MSG = {};
function pannaSwitch(w, hg) {
  if (String(w) !== '280' || !hg || hg === 'Unassigned') return null;
  const single = SINGLE.has(hg);
  const set = async (toSingle) => {
    if (toSingle === SINGLE.has(hg)) return;
    if (!db) { PANNA_MSG[hg] = ['err', 'Saving is not connected yet.']; refreshAll(); return; }
    const prev = new Set(SINGLE);
    if (toSingle) SINGLE.add(hg); else SINGLE.delete(hg);
    PANNA_MSG[hg] = ['note', 'Saving…']; refreshAll();
    try {
      const root = hgRootOf(w, hg);   // saved under the Style-map name (12 Nov 2026)
      if (SINGLE_RAW) { for (const r of hgKeys(w, hg)) SINGLE_RAW.delete(r); if (toSingle) SINGLE_RAW.add(root); }
      if (toSingle) await db.collection('targets').doc(pannaId(w, root)).set({width: '280', hg: root});
      else for (const id of hgPannaIds(w, hg)) await db.collection('targets').doc(id).delete();   // every member of a merged group, and any stray
      PANNA_MSG[hg] = ['saved', `Saved: ${toSingle ? 'single' : 'double'} panna`];
    } catch (e) { SINGLE = prev; PANNA_MSG[hg] = ['err', 'Could not save: ' + (e && e.message || 'no write access')]; }
    refreshAll();
  };
  const msg = PANNA_MSG[hg];
  return el('div', {class: 'sw'}, el('div', {class: 'seg', role: 'group', 'aria-label': `Panna for ${hg}`},
    el('button', {type: 'button', 'aria-pressed': single ? 'false' : 'true', text: 'Double panna', onclick: (e) => { e.stopPropagation(); set(false); }}),
    el('button', {type: 'button', 'aria-pressed': single ? 'true' : 'false', text: 'Single panna', onclick: (e) => { e.stopPropagation(); set(true); }})),
    msg ? el('span', {class: msg[0], text: msg[1]}) : null);
}
function refreshAll() { applyPanna(D); render(); if (dlg && dlg.open) drawPanel(true); }

// Loom: that day and the two complete days before it, and the benchmark for the quality it ran.
function openLoom(loom, date) { pushView(() => loomView(loom, date)); }
function loomView(loom, date) {
  const mc = (D.machine || {})[loom] || {};
  const days = (D.complete_days || []).filter((d) => d <= date).slice(-3).reverse();
  const recs = (D.loomdays || []).filter((x) => x.loom === loom && days.includes(x.date));
  const rows = [];
  for (const d of days) {
    const R = recs.filter((x) => x.date === d).sort((a, b) => b.run - a.run);
    if (R.length) rows.push(...R);
    else rows.push({__row: el('tr', {}, el('td', {class: 'd', text: dfmt(d)}), el('td', {colspan: RCOLS.length - 2, class: 'note', text: 'No running record this day (powered down or not in the files).'}))});
  }
  const util = (D.util || []).filter((u) => u.loom === loom && days.includes(u.date) && u.off > 0);
  const dayRecs = recs.filter((x) => x.date === date);
  const quals = new Map();
  for (const x of (dayRecs.length ? dayRecs : recs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 1))) {
    const k = key(x.width, x.hg); if (!quals.has(k)) quals.set(k, []); quals.get(k).push(x);
  }
  const body = [
    card(`${dfmt(date)} and the 2 days before`, `${recs.length} loom-day record${recs.length === 1 ? '' : 's'}`, runTable(rows, mc.width, null, {hgCol: true, noLoom: true}),
      util.length ? el('p', {class: 'note', text: 'Powered down: ' + util.map((u) => `${dfmt(u.date)} ${f1(u.off / 60)} h`).join(' · ')}) : null,
      typeof fxLoomLines === 'function' ? fxLoomLines(loom, days, recs) : null)];   // R2: one realisation line per loom-day (owner, analysis on)
  for (const L of quals.values()) {
    const x0 = L[0]; const A = agg(L.filter((x) => x.date === x0.date));
    body.push(card(`Benchmark for ${x0.hg} · ${x0.width} cm`, x0.hg === 'Unassigned' ? 'assign a head group to get a benchmark' : null,
      el('div', {class: 'toolbar'}, hgLink(x0.hg, x0.width, date, `${x0.hg}: all looms on ${dfmt(date)} ›`)),
      x0.hg === 'Unassigned' ? el('div', {class: 'empty', text: 'No benchmark.'}) : benchSummary(x0.width, x0.hg, A, `Loom ${loom}, ${dfmt(x0.date)}`, {date: x0.date, loom})));
  }
  body.push(panelTrend({kind: 'loom', loom}));
  return {title: `Loom ${loom}`, sub: `${mc.width || '?'} cm ${mc.type || ''} · ${dfmt(date)}`, body};
}

// Head group: benchmark, best and target, plus every loom that ran it on the day.
function openHg(hg, w, date) {
  if (!w) {
    const ws = [...new Set([...(D.loomdays || []).filter((x) => x.hg === hg && x.date === date).map((x) => String(x.width)), ...(D.benchmarks || []).filter((b) => b.hg === hg).map((b) => String(b.width))])];
    w = ws.includes(W) ? W : ws[0] || '190';
  }
  pushView(() => hgView(hg, String(w), date));
}
function hgView(hg, w, date) {
  const L = (D.loomdays || []).filter((x) => x.date === date && String(x.width) === w && x.hg === hg && x.run > 0);
  const L60 = L.filter((x) => x.run >= 60);
  const A = agg(L60);
  const other = (D.benchmarks || []).filter((b) => b.hg === hg && String(b.width) !== w).map((b) => String(b.width));
  return {title: hg, sub: `${w} cm · ${dfmt(date)}`, body: [
    el('div', {class: 'toolbar', style: 'margin:0'}, benchTag(bench(w, hg)),
      other.map((ow) => el('button', {class: 'ghost', type: 'button', text: `Same quality on ${ow} cm`, onclick: () => openHg(hg, ow, date)})),
      el('button', {class: 'link', type: 'button', text: 'Open in Benchmarks tab ›', onclick: () => { BQ = key(w, hg); closePanel(); setTab('benchmarks'); }})),
    card('Benchmark, best and target', `Day figures from looms that ran at least 60 min on ${dfmt(date)}`, benchSummary(w, hg, A, `${dfmt(date)}, all looms`, {date})),
    card(`Looms running ${hg} on ${dfmt(date)} · ${new Set(L.map((x) => x.loom)).size}`, 'Each loom against the head group benchmark and target',
      L.length ? loomTable(L) : el('div', {class: 'empty', text: 'No loom ran this quality on this day.'})),
    hg !== 'Unassigned' ? panelTrend({kind: 'hg', w, hg}) : null]};
}
// openGuide lives in app/guide.js

