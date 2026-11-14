// W2 Looms · app/trends.js — Trend cards and the all-trends panel.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- Trend lines
// Each analysis tab carries a Trend card: one head group or one loom, one point per complete day, every point labelled and
// clickable, drawn against the LATEST benchmark, best and target (even when an earlier day is being viewed) as flat lines for
// the quality at the end of the period; a loom's days on an earlier quality are shown but not judged. "View all trends"
// opens every metric for the same subject in the panel. Loom periods: 7 days or since the last head-group changeover;
// head-group periods: 7, 14 or 30 days. Values use the same records and formulas as the tables, so the two always agree.
function svgEl(tag, attrs = {}) { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); return n; }
function svgText(attrs, text) { const t = svgEl('text', attrs); t.textContent = text; return t; }

// Metrics a trend can show. hi = higher is better; tol = tolerance before a point counts as worse than its reference.
const TM = {
  erpm: {label: 'Effective RPM', unit: 'RPM × eff', fmt: f0, hi: true, tol: (r) => tolRpm(r)},
  rpm: {label: 'RPM', unit: 'picks/min', fmt: f0, hi: true, tol: (r) => tolRpm(r)},
  eff: {label: 'Efficiency', unit: '%', fmt: f1, hi: true},
  cfm: {label: 'CFM', unit: 'ft³/min running', fmt: f1, hi: false, tol: (r) => tolAir(r)},
  apk: {label: 'Air per 1,000 picks', unit: 'ft³ / 1,000 picks', fmt: f1, hi: false, tol: (r) => tolAir(r)},
  main_max: {label: 'Main pressure', unit: 'kgf/cm², day max', fmt: f2, hi: false, tol: () => tolP()},
  warp: {label: 'Warp breaks', unit: 'per 100k picks', fmt: f2, hi: false},
  looms: {label: 'Looms running', unit: 'looms, ≥ 60 min', fmt: f0, hi: true},
  hours: {label: 'Hours', unit: 'run · stopped · powered down', fmt: f1, hi: true},
  // 12 Nov 2026 (owner, analysis on): loom realisation, As sold
  real_ld: {label: 'Loom realisation, per loom', unit: '₹ per loom per day', fmt: (v) => rsShort(v), hi: true, tol: () => 0},
  real_tot: {label: 'Loom realisation, total', unit: '₹ in the day', fmt: (v) => rsShort(v), hi: true, tol: () => 0}};
const rsShort = (v) => !ok(v) ? '—' : (v < 0 ? '−₹' : '₹') + (Math.abs(v) >= 1e5 ? (Math.abs(v) / 1e5).toFixed(2) + 'L' : Math.abs(v) >= 1e3 ? (Math.abs(v) / 1e3).toFixed(1) + 'k' : Math.round(Math.abs(v)));
const REAL_M = new Set(['real_ld', 'real_tot']);
// What each tab plots: metric switch (first = default) and whose reference switch colours the points.
const TRTABS = {
  quality: {get metrics() { return ['eff', 'rpm', 'erpm', 'cfm', 'apk', 'main_max', 'warp', ...(typeof fxOn === 'function' && fxOn() ? ['real_ld', 'real_tot'] : [])]; }, mode: () => 'bm'},
  cfm: {metrics: ['cfm'], stack: ['cfm', 'apk'], mode: () => CMODE},
  erpm: {metrics: ['erpm', 'rpm', 'eff'], mode: () => EMODE},
  pressure: {metrics: ['main_max'], mode: () => PMODE, allWidths: true},
  utilisation: {metrics: ['eff', 'hours'], mode: () => 'bm'},
  warp: {metrics: ['warp'], mode: () => 'bm'}};
const DASH_METRICS = ['erpm', 'rpm', 'eff', 'cfm', 'apk', 'main_max', 'warp'];
const TR = {};                                   // per tab: {subj, metric}
let TRP = {loom: '7', hg: '7'};                  // period per subject kind, kept on this device
try { const p = JSON.parse(localStorage.getItem('w2-trend-period') || '{}'); if (['7', 'co', 'rng'].includes(p.loom)) TRP.loom = p.loom; if (['7', '14', '30', 'rng'].includes(p.hg)) TRP.hg = p.hg; } catch (e) {}
function setPer(kind, v) { TRP[kind] = v; try { localStorage.setItem('w2-trend-period', JSON.stringify(TRP)); } catch (e) {} }

// ---- the latest benchmarks (data.enc.json), whatever day the date picker shows
let LBM = null, LBM_SRC = null, LBM_SIG = '';
function lbench(w, hg) {
  const src = LATEST || D; if (!src) return null;
  if (src === D) return bench(w, hg);
  const sig = [...SINGLE].sort().join('|');
  if (LBM_SRC !== src || LBM_SIG !== sig) {
    applyPanna(src); addErpm(src);
    LBM = new Map(); for (const b of src.benchmarks || []) LBM.set(key(b.width, b.hg), b);
    LBM_SRC = src; LBM_SIG = sig;
  }
  return LBM.get(key(w, hg)) || null;
}
function lbest(b, m) {
  if (!b) return null;
  const R = b.runs && b.runs[m];
  if (R && R.best && ok(R.best[m]) && (m !== 'main_max' || R.best[m] > 0)) return R.best[m];
  return ok(b['best_' + m]) ? b['best_' + m] : null;
}
const latestDay = () => (LATEST && LATEST.latest) || D.latest;
// Reference lines for one metric of one quality. rpm = the RPM the CFM benchmark is worked at.
function trRefs(w, hg, m, rpm) {
  const none = {bm: null, best: null, tg: null};
  if (!hg || hg === 'Unassigned') return m === 'eff' ? {line: EFF_BAD()} : none;
  const b = lbench(w, hg), t = tgt(w, hg) || {};
  if (m === 'eff') return {line: EFF_BAD()};
  if (m === 'looms' || m === 'hours' || REAL_M.has(m)) return none;
  if (!b) return {bm: null, best: null, tg: m === 'rpm' ? t.rpm : m === 'erpm' ? tgtE(w, hg) : m === 'cfm' ? t.cfm : m === 'main_max' ? t.main : null};
  if (m === 'rpm') return {bm: b.rpm, best: lbest(b, 'rpm'), tg: t.rpm, pct: 'P90'};
  if (m === 'erpm') return {bm: b.erpm, best: lbest(b, 'erpm'), tg: tgtE(w, hg), pct: 'P90'};
  if (m === 'apk') return {bm: b.apk, best: lbest(b, 'apk'), tg: null, pct: 'P10'};
  if (m === 'cfm') return {bm: cfmOf(b.apk, w, hg, rpm), best: cfmOf(lbest(b, 'apk'), w, hg, rpm), tg: t.cfm, pct: 'Bm'};
  if (m === 'main_max') { const pk = pkey(b); return {bm: b[pk], best: lbest(b, pk), tg: t.main, pct: 'P10'}; }
  if (m === 'warp') { const med = b.warp_med; return {med, line: ok(med) ? Math.max((S().warp_multiple || 2) * med, S().warp_min_rate || 3) : null}; }
  return none;
}

// ---- subjects, periods and day slots
const days0 = () => (D.complete_days || []).filter((d) => d <= D.latest);
function loomRecs(loom) {
  const by = new Map();
  for (const x of D.loomdays || []) if (x.loom === loom) { if (!by.has(x.date)) by.set(x.date, []); by.get(x.date).push(x); }
  return by;
}
const mainRec = (R) => R && R.length ? R.slice().sort((a, b) => b.run - a.run)[0] : null;
// The run of days the loom has been on its current head group, back to the changeover day. Days powered down don't break it.
function changeover(loom) {
  const days = days0(), by = loomRecs(loom);
  let i = days.length - 1, cur = null;
  for (; i >= 0; i--) { const r = mainRec(by.get(days.at(i))); if (r) { cur = r.hg; break; } }
  if (cur == null) return {start: Math.max(0, days.length - 7), found: false, hg: null, days};
  let start = i, found = false;
  for (let j = i - 1; j >= 0; j--) {
    const r = mainRec(by.get(days.at(j))); if (!r) continue;
    if (r.hg !== cur) { found = true; break; }
    start = j;
  }
  if (!found) start = 0;
  return {start, found, hg: cur, days, n: days.length - start};
}
function coLabel(co) {
  if (!co || co.hg == null) return 'Since changeover';
  if (co.found) return `Since changeover (${co.n} day${co.n === 1 ? '' : 's'})`;
  return co.days.length >= 60 ? 'Since changeover (60+ days)' : `Since changeover (${co.n}+ days)`;
}
function subjWidth(s) { return s.kind === 'loom' ? String(((D.machine || {})[s.loom] || {}).width || '') : String(s.w); }
function subjName(s) { return s.kind === 'loom' ? `Loom ${s.loom}` : `${s.hg} · ${s.w} cm`; }
function trDates(s) {
  const days = days0();
  if (TRP[s.kind] === 'rng') { const ds = rngDays(days); return {dates: ds, want: ds.length || 1}; }
  if (s.kind === 'hg') return {dates: days.slice(-(+TRP.hg || 7)), want: +TRP.hg || 7};
  if (TRP.loom === 'co') { const co = changeover(s.loom); return {dates: days.slice(co.start), co, want: co.n || 7}; }
  return {dates: days.slice(-7), want: 7};
}
// One slot per complete day: the record(s) behind it, the value source A, and the head group whose references apply.
function trSlots(s, dates) {
  const w = subjWidth(s);
  let slots;
  if (s.kind === 'loom') {
    const by = loomRecs(s.loom);
    const U = new Map((D.util || []).filter((u) => u.loom === s.loom).map((u) => [u.date, u]));
    slots = dates.map((d) => { const R = by.get(d) || [], r = mainRec(R); return {d, w, recs: R, r, A: r, hg: r ? r.hg : null, short: !!r && r.run < 60, util: U.get(d), beam: r ? r.beam : null}; });
  } else {
    const set = new Set(dates);
    const by = new Map(dates.map((d) => [d, []]));
    for (const x of D.loomdays || []) if (set.has(x.date) && String(x.width) === w && x.hg === s.hg && x.run > 0) by.get(x.date).push(x);
    slots = dates.map((d) => { const L = by.get(d), L60 = L.filter((x) => x.run >= 60); return {d, w, recs: L, L60, A: agg(L60), hg: s.hg, looms: new Set(L60.map((x) => x.loom)).size}; });
  }
  // a loom's empty days take the head group of the day before (or after) them for their reference lines
  let last = null; for (const sl of slots) { if (sl.hg) last = sl.hg; sl.rhg = sl.hg || last; }
  let next = null; for (const sl of slots.slice().reverse()) { if (sl.hg) next = sl.hg; if (!sl.rhg) sl.rhg = next; }
  return slots;
}
function slotVal(sl, m) {
  const A = sl.A;
  if (m === 'looms') return sl.looms != null ? sl.looms : null;
  if (REAL_M.has(m)) { const q = fxRecsReal(sl.d, sl.recs); return q ? (m === 'real_ld' ? q.real / q.n : q.real) : null; }
  if (m === 'hours') return sl.util ? sl.util.run / 60 : (A ? A.run / 60 : null);
  if (!A) return null;
  if (m === 'warp') return ok(A.warpRate) ? A.warpRate : ok(A.warp_rate) ? A.warp_rate : null;
  if (m === 'erpm') return ok(A.erpm) ? A.erpm : erpmOf(A);
  if (m === 'main_max') return A.main_max > 0 ? A.main_max : null;
  return ok(A[m]) ? A[m] : null;
}
// Everything a chart needs: values, references, colour verdicts, changeover and beam markers, the period figure.
function trSeries(s, m, mode, dates) {
  const sl = trSlots(s, dates);
  const M = TM[m];
  // Reference lines are flat (10 Nov 2026): the latest benchmark, best and target of the quality the subject is on at the end
  // of the period, and for CFM worked at the RPM of its latest running day there. A loom's days on another quality before a
  // changeover are drawn but not judged against them (marked "other quality"), so a line never jumps at a changeover.
  const cur = sl.slice().reverse().find((x) => x.rhg) || null;
  const curRpm = cur ? ((sl.slice().reverse().find((x) => x.rhg === cur.rhg && x.A && ok(x.A.rpm)) || {}).A || {}).rpm : null;
  let Rc = cur ? trRefs(cur.w, cur.rhg, m, curRpm) : null;
  if (REAL_M.has(m)) { const ls = sl.slice().reverse().find((x) => x.rhg && ok(slotVal(x, m))); Rc = ls ? fxSlotRefs(ls.d, s, ls.w, ls.rhg, m) : {bm: null, best: null, tg: null}; }
  const pts = sl.map((x) => {
    const v = slotVal(x, m);
    const other = !!(cur && x.rhg && x.rhg !== cur.rhg);
    const R = Rc || trRefs(x.w, x.rhg, m, x.A ? x.A.rpm : null);
    let ref = null, worse = null;
    if (m === 'eff') { ref = R.line; worse = ok(v) ? v < R.line : null; }
    else if (m === 'warp') { ref = R.line; worse = ok(v) && ok(R.line) ? v > R.line : null; }
    else if (ok(R.bm) || ok(R.best) || ok(R.tg)) { ref = refOf(mode, R.bm, R.best, R.tg); if (ok(v) && ok(ref)) worse = M.hi ? v < ref - M.tol(ref) : v > ref + M.tol(ref); }
    if (other) worse = null;
    return Object.assign({v, R, ref: other ? null : ref, worse, other}, x);
  });
  const marks = [];
  if (s.kind === 'loom') {
    let prev = null;
    pts.forEach((p, i) => { if (!p.hg) return; if (prev && p.hg !== prev) marks.push({i, text: '→ ' + p.hg}); prev = p.hg; });
  }
  const beams = [];
  if (s.kind === 'loom') { let pb = null; pts.forEach((p, i) => { if (!p.beam) return; if (pb && p.beam !== pb) beams.push({i, from: pb, to: p.beam}); pb = p.beam; }); }
  // period figure: summed totals of the counted loom-days (≥ 60 min), not an average of the points
  const counted = s.kind === 'loom' ? pts.filter((p) => p.r && !p.short).flatMap((p) => p.recs.filter((r) => r.run >= 60)) : pts.flatMap((p) => p.L60 || []);
  const PA = agg(counted);
  let per = null;
  if (m === 'looms') { const vs = pts.map((p) => p.v).filter(ok); per = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null; }
  else if (m === 'hours') { const vs = pts.map((p) => p.v).filter(ok); per = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null; }
  else if (REAL_M.has(m)) { let re = 0, n = 0, days = 0; for (const p of pts) { const q = fxRecsReal(p.d, p.recs); if (q) { re += q.real; n += q.n; days++; } } per = !days ? null : m === 'real_ld' ? re / n : re / days; }
  else if (PA) per = m === 'warp' ? PA.warpRate : m === 'main_max' ? (Math.max(...counted.map((r) => r.main_max || 0)) || null) : PA[m];
  return {s, m, M, pts, marks, beams, per, PA};
}

// ---- the chart
const narrowW = () => window.innerWidth < 640;
// Chart width in px of the space it will sit in, so labels draw at their real size on a phone and a laptop.
function trWidth(where) {
  const vw = window.innerWidth;
  if (where === 'panel-small') { const pw = vw >= 1024 ? Math.min(1100, vw * 0.8) : vw; return Math.max(300, Math.floor(vw >= 1024 ? (pw - 32 - 14) / 2 - 32 : pw - 32 - 32)); }
  if (where === 'panel') { const pw = vw >= 1024 ? Math.min(1100, vw * 0.8) : vw; return Math.max(300, Math.floor(pw - 32 - 32)); }
  const side = vw >= 1366 ? 232 : vw >= 1024 ? 208 : 0, pad = vw >= 1366 ? 56 : 32;
  return Math.max(300, Math.min(1080, Math.floor(vw - side - pad - 32)));
}
// Reference lines on the trend charts (benchmark, best, target, efficiency or beam line, median) switch on and off with toggle
// boxes; the data line always shows. One setting for every trend chart, kept on this device.
let TRHIDE = new Set();
try { const h = JSON.parse(localStorage.getItem('w2-trend-hide') || '[]'); if (Array.isArray(h)) TRHIDE = new Set(h); } catch (e) {}
const TRREF = {bm: ['Benchmark', 'var(--muted)', true], best: ['Best', 'var(--good)', true], tg: ['Target', 'var(--ink)', false], line: ['Line', 'var(--warn)', true], med: ['Median', 'var(--muted)', true]};
const trRefKeys = (Ts) => Object.keys(TRREF).filter((k) => Ts.some((T) => T.pts.some((p) => ok(p.R[k]))));
function trRefToggles(keys, m) {
  if (!keys.length) return null;
  const name = (k) => k !== 'line' ? TRREF[k][0] : m === 'warp' ? 'Beam line' : m === 'eff' ? 'Efficiency line' : 'Efficiency and beam lines';
  return el('div', {class: 'togs', role: 'group', 'aria-label': 'Reference lines shown'}, keys.map((k) => {
    const on = !TRHIDE.has(k), [, col, dash] = TRREF[k];
    return el('button', {type: 'button', class: 'tog', 'aria-pressed': on ? 'true' : 'false', title: (on ? 'Hide ' : 'Show ') + name(k).toLowerCase(),
      onclick: (e) => { if (on) TRHIDE.add(k); else TRHIDE.delete(k); try { localStorage.setItem('w2-trend-hide', JSON.stringify([...TRHIDE])); } catch (x) {} if (e.currentTarget.closest('dialog')) drawPanel(true); else render(); }},
      el('i', {style: dash ? `background:repeating-linear-gradient(90deg,${col} 0 4px,transparent 4px 7px)` : `background:${col}`}), name(k));
  }));
}
function trChart(T, o = {}) {
  const pts = T.pts, M = T.M, n = pts.length;
  const Wd = o.width || trWidth(), compact = !!o.compact;
  const H = o.height || (compact ? 200 : narrowW() ? 240 : 270);
  const m = {l: 40, r: Wd < 420 ? 62 : 84, t: 30, b: 28};
  const wrap = el('div', {class: 'trchart'});
  const vals = pts.map((p) => p.v).filter(ok);
  if (!vals.length) { wrap.append(el('div', {class: 'empty', text: 'No running record in this period.'})); return wrap; }
  const refVals = [];
  for (const p of pts) for (const k of ['bm', 'best', 'tg', 'line', 'med']) if (ok(p.R[k]) && !TRHIDE.has(k)) refVals.push(p.R[k]);
  let lo = Math.min(...vals, ...refVals), hi = Math.max(...vals, ...refVals);
  if (T.m === 'looms') lo = 0;
  const span = hi - lo || Math.abs(hi) * 0.05 || 1; lo -= span * 0.08; hi += span * 0.16;
  if (lo < 0 && Math.min(...vals) >= 0) lo = 0;
  const x = (i) => n === 1 ? m.l + (Wd - m.l - m.r) / 2 : m.l + 10 + i * (Wd - m.l - m.r - 20) / (n - 1);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
  const svg = svgEl('svg', {viewBox: `0 0 ${Wd} ${H}`, width: '100%', class: 'chart trsvg', role: 'img', 'aria-label': `${M.label} trend, ${subjName(T.s)}`});
  const muted = css('--muted'), grid = css('--line'), ink = css('--ink'), series = css('--series') || '#2f5fc4';
  const cGood = css('--good'), cWarn = css('--warn-dot') || css('--warn'), cGrey = css('--muted-2'), panel = css('--panel');
  const fsz = 11;
  // grid and y ticks
  for (let k = 0; k <= 3; k++) {
    const v = lo + (hi - lo) * k / 3;
    svg.append(svgEl('line', {x1: m.l, x2: Wd - m.r, y1: y(v), y2: y(v), stroke: grid, 'stroke-width': 0.6}));
    svg.append(svgText({x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 10.5, fill: muted}, M.fmt(v)));
  }
  svg.append(svgText({x: 2, y: 12, 'font-size': 10.5, fill: muted}, M.unit));
  // date labels
  const stepD = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((Wd - m.l - m.r) / 46))));
  pts.forEach((p, i) => { if (i % stepD && i !== n - 1) return; if (i !== n - 1 && n - 1 - i < stepD && n > 2) return; svg.append(svgText({x: x(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 10.5, fill: muted}, dfmt(p.d))); });
  // reference lines: flat at the latest figures of the quality at the end of the period
  const refPath = (k) => {
    let d = '', prev = null, lastY = null, lastHg = null;
    pts.forEach((p, i) => {
      const v = p.R[k]; if (!ok(v)) { prev = null; return; }
      const X = x(i), Y = y(v);
      const half = n === 1 ? (Wd - m.l - m.r) / 2 - 10 : (x(1) - x(0)) / 2;
      if (prev == null) d += `M${(i === 0 ? m.l : X - half).toFixed(1)} ${Y.toFixed(1)}L${X.toFixed(1)} ${Y.toFixed(1)}`;
      else if (p.rhg !== lastHg) d += `L${X.toFixed(1)} ${lastY.toFixed(1)}L${X.toFixed(1)} ${Y.toFixed(1)}`;
      else d += `L${X.toFixed(1)} ${Y.toFixed(1)}`;
      if (i === n - 1) d += `L${(Wd - m.r).toFixed(1)} ${Y.toFixed(1)}`;
      prev = v; lastY = Y; lastHg = p.rhg;
    });
    return d;
  };
  const lastOf = (k) => { for (let i = n - 1; i >= 0; i--) if (ok(pts.at(i).R[k])) return pts.at(i).R[k]; return null; };
  const pctL = 'Bm';   // the toggle box says Benchmark, so the line says Bm on every metric (not P10 / P90)
  const lines = [
    ['bm', {stroke: muted, 'stroke-width': 1.4, 'stroke-dasharray': '6 4'}, pctL, muted],
    ['best', {stroke: cGood, 'stroke-width': 1.6, 'stroke-dasharray': '2 3'}, 'Best', cGood],
    ['tg', {stroke: ink, 'stroke-width': 1, opacity: 0.6}, 'Tgt', ink],
    ['line', {stroke: cWarn, 'stroke-width': 1.3, 'stroke-dasharray': '6 4'}, T.m === 'warp' ? 'Beam' : 'Line', cWarn],
    ['med', {stroke: muted, 'stroke-width': 1.2, 'stroke-dasharray': '6 4'}, 'Median', muted]];
  const rl = [];
  for (const [k, st, lab, col] of lines) {
    if (TRHIDE.has(k)) continue;
    const d = refPath(k); if (!d) continue;
    svg.append(svgEl('path', Object.assign({d, fill: 'none'}, st)));
    const lv = lastOf(k); if (ok(lv)) rl.push({y: y(lv), text: `${lab} ${M.fmt(lv)}`, col});
  }
  rl.sort((a, b) => a.y - b.y); let py = -1e9;
  for (const r of rl) { const yy = Math.max(r.y + 4, py + 12); py = yy; svg.append(svgText({x: Wd - m.r + 5, y: yy, 'font-size': 10.5, fill: r.col}, r.text)); }
  // changeover markers
  for (const mk of T.marks) {
    const X = x(mk.i);
    svg.append(svgEl('line', {x1: X, x2: X, y1: m.t - 14, y2: H - m.b, stroke: series, 'stroke-width': 1, 'stroke-dasharray': '4 4'}));
    const right = X > Wd - m.r - 90;
    svg.append(svgText({x: right ? X - 4 : X + 4, y: m.t - 18, 'text-anchor': right ? 'end' : 'start', 'font-size': 11, 'font-weight': 600, fill: series}, mk.text));
  }
  // beam changes: a B on the axis
  for (const bm of T.beams) {
    const tx = svgText({x: x(bm.i), y: H - m.b - 4, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 700, fill: css('--info')}, 'B');
    const tt = svgEl('title'); tt.textContent = `Beam changed: ${bm.from} → ${bm.to}`; tx.append(tt); svg.append(tx);
  }
  // the line: solid between consecutive days, dotted across days with no record
  for (let i = 0, j = null; i < n; i++) {
    if (!ok(pts.at(i).v)) continue;
    if (j != null) svg.append(svgEl('line', {x1: x(j), y1: y(pts.at(j).v), x2: x(i), y2: y(pts.at(i).v), stroke: series, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-dasharray': i - j > 1 ? '2 5' : null}));
    j = i;
  }
  // which points carry a label without a tap
  const vi = pts.map((p, i) => ok(p.v) ? i : -1).filter((i) => i >= 0);
  const full = !compact && (n <= 14 || Wd >= 700);
  const keep = new Set();
  if (full) vi.forEach((i) => keep.add(i));
  else {
    keep.add(vi[0]); keep.add(vi.at(-1));
    let mx = vi[0], mn = vi[0]; for (const i of vi) { if (pts.at(i).v > pts.at(mx).v) mx = i; if (pts.at(i).v < pts.at(mn).v) mn = i; }
    keep.add(mx); keep.add(mn);
    const bad = vi.filter((i) => pts.at(i).worse);
    if (bad.length <= 4) bad.forEach((i) => keep.add(i));   // a few misses are worth a label; a run of them is just the line
  }
  const dots = [], labs = [];
  const rDot = n > 1 ? Math.max(2.6, Math.min(4.6, (x(1) - x(0)) / 3)) : 4.6;
  let prevBox = null;
  vi.forEach((i) => {
    const p = pts.at(i), X = x(i), Y = y(p.v);
    const col = p.short ? cGrey : p.worse === true ? cWarn : p.worse === false ? cGood : cGrey;
    const g = svgEl('g', {class: 'trpt', tabindex: '0', role: 'button', 'aria-label': `${dfmt(p.d)}: ${M.fmt(p.v)} ${M.unit}`});
    g.append(svgEl('circle', {cx: X, cy: Y, r: 14, fill: 'transparent'}));
    const dot = svgEl('circle', {cx: X, cy: Y, r: rDot, fill: p.short ? panel : col, stroke: p.short ? cGrey : panel, 'stroke-width': p.short ? 1.6 : 1.2});
    g.append(dot);
    const txt = M.fmt(p.v), tw = txt.length * 6.2 + 4;
    const vp = i > 0 && ok(pts.at(i - 1).v) ? pts.at(i - 1).v : null, vn = i < n - 1 && ok(pts.at(i + 1).v) ? pts.at(i + 1).v : null;
    const dip = (vp != null || vn != null) && (vp == null || p.v < vp) && (vn == null || p.v < vn);
    let ly = dip ? Y + 17 : Y - 9;
    if (ly > H - m.b - 2) ly = Y - 9;
    if (prevBox && Math.abs(prevBox.x - X) < (prevBox.w + tw) / 2 + 2 && Math.abs(prevBox.y - ly) < 12) ly = Y + 17;
    if (ly < m.t - 4) ly = Y + 17;
    const lab = svgText({x: X, y: ly, 'text-anchor': i === vi.at(-1) && X > Wd - m.r - 20 ? 'end' : 'middle', 'font-size': fsz, 'font-weight': p.worse ? 700 : 500, fill: p.short ? cGrey : ink, visibility: keep.has(i) ? 'visible' : 'hidden'}, txt);
    if (keep.has(i)) prevBox = {x: X, y: ly, w: tw};
    g.append(lab);
    const sel = () => pick(i);
    g.addEventListener('click', sel); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(); } });
    if (!compact) g.addEventListener('mouseenter', () => { if (window.matchMedia('(hover:hover)').matches) sel(); });
    svg.append(g); dots[i] = dot; labs[i] = lab;
  });
  const box = el('div', {class: 'tablebox'}, svg);
  const det = el('div', {class: 'trdet', hidden: compact ? true : null});
  function pick(i) {
    if (o.onPoint) { o.onPoint(i); return; }
    dots.forEach((d, k) => { if (d) d.setAttribute('r', k === i ? rDot + 2 : rDot); });
    labs.forEach((l, k) => { if (l) l.setAttribute('visibility', k === i || keep.has(k) ? 'visible' : 'hidden'); });
    det.hidden = false; det.replaceChildren(...detail(T, i));
  }
  if (!compact) wrap.append(trRefToggles(trRefKeys([T]), T.m) || '');
  wrap.append(box);
  if (!compact) {
    wrap.append(trSummary(T), det);
    det.replaceChildren(el('span', {class: 'note', text: narrowW() ? 'Tap a point for its day.' : 'Point at or click a point for its day.'}));
  }
  return wrap;
}
// The detail strip under a chart for one day.
function detail(T, i) {
  const p = T.pts.at(i), M = T.M, out = [];
  out.push(el('b', {text: dfmt(p.d)}));
  out.push(el('span', {}, el('b', {text: M.fmt(p.v)}), ' ', M.unit));
  const R = p.R;
  if (T.m === 'eff') out.push(el('span', {text: `line ${f0(R.line)}`}));
  else if (T.m === 'warp') { if (ok(R.med)) out.push(el('span', {text: `median ${f2(R.med)} · beam line ${f2(R.line)}`})); if (p.A && ok(p.A.warp)) out.push(el('span', {text: `${f0(p.A.warp)} breaks`})); }
  else {
    const refs = [['benchmark', R.bm], ['best', R.best], ['target', R.tg]].filter((r) => ok(r[1])).map((r) => `${r[0]} ${M.fmt(r[1])}`);
    if (refs.length) out.push(el('span', {text: refs.join(' · ')}));
    if (p.other) out.push(el('span', {class: 'note', text: `on ${p.rhg}: the lines are ${T.pts.at(-1).rhg || 'the current quality'}'s, so this day is not judged`}));
    else if (ok(p.ref) && ok(p.v)) { const g = p.v - p.ref; out.push(el('span', {class: p.worse ? 'up-bad' : 'up-good', text: `${g >= 0 ? '+' : '−'}${M.fmt(Math.abs(g))} vs reference`})); }
  }
  const A = p.A;
  if (A) {
    out.push(el('span', {text: `run ${f1(A.run / 60)} h · stopped ${f1(A.stop / 60)} h`}));
    const fp = ok(A.fpicks) ? A.fpicks : (A.picks || 0) * pf(p.w, p.hg);
    out.push(el('span', {text: `Picks ${f2(fp / PICK_LAKH)}`}));
  }
  if (T.s.kind === 'hg') out.push(el('span', {text: `${p.looms} loom${p.looms === 1 ? '' : 's'}`}));
  if (T.s.kind === 'loom') {
    if (p.hg) out.push(el('span', {text: p.hg}));
    if (p.short) out.push(el('span', {class: 'note', text: 'ran under 60 min: not counted in the period figure'}));
    const other = (p.recs || []).filter((r) => r !== p.r);
    if (other.length) out.push(el('span', {class: 'note', text: 'also ran ' + other.map((r) => `${r.hg} for ${f1(r.run / 60)} h`).join(', ')}));
    if (!p.r && p.util && p.util.off) out.push(el('span', {class: 'note', text: `powered down ${f1(p.util.off / 60)} h`}));
  }
  if (p.A || (p.recs || []).length) out.push(el('button', {class: 'link', type: 'button', text: 'Open this day ›', onclick: () => T.s.kind === 'loom' ? openLoom(T.s.loom, p.d) : openHg(T.s.hg, T.s.w, p.d)}));
  else out.push(el('span', {class: 'note', text: T.s.kind === 'loom' ? 'No running record this day.' : 'Not run this day.'}));
  return out;
}
function trSummary(T) {
  const M = T.M, P = T.pts.filter((p) => ok(p.v));
  if (!P.length) return el('div', {class: 'trsum'});
  const first = P[0], last = P.at(-1), ch = last.v - first.v;
  const better = M.hi ? ch > 0 : ch < 0;
  const judged = P.filter((p) => p.worse != null && !p.short), worse = judged.filter((p) => p.worse).length;
  const refName = T.m === 'eff' ? 'the line' : T.m === 'warp' ? 'the beam line' : 'reference';
  return el('div', {class: 'trsum'},
    el('span', {}, 'Latest ', el('b', {text: M.fmt(last.v)})),
    el('span', {}, T.m === 'looms' || T.m === 'hours' ? 'Average ' : 'Period ', el('b', {text: M.fmt(T.per)})),
    P.length > 1 ? el('span', {}, 'Change ', el('b', {class: Math.abs(ch) < 1e-9 ? 'flat' : better ? 'up-good' : 'up-bad', text: `${ch >= 0 ? '+' : '−'}${M.fmt(Math.abs(ch))} ${ch > 0 ? '▲' : ch < 0 ? '▼' : ''}`})) : null,
    judged.length ? el('span', {}, `Days worse than ${refName} `, el('b', {text: `${worse} of ${judged.length}`})) : null);
}
// Run / stopped / powered-down hours per day: stacked 24-hour bars, run hours labelled (loom). A head group gets looms per day.
function hoursChart(T, o = {}) {
  const pts = T.pts, n = pts.length, Wd = o.width || trWidth(), H = o.height || (o.compact ? 200 : 240);
  const m = {l: 40, r: 20, t: 18, b: 28};
  const svg = svgEl('svg', {viewBox: `0 0 ${Wd} ${H}`, width: '100%', class: 'chart trsvg', role: 'img', 'aria-label': `Hours run, stopped and powered down, ${subjName(T.s)}`});
  const muted = css('--muted'), grid = css('--line'), ink = css('--ink');
  const y = (h) => m.t + (H - m.t - m.b) * (1 - h / 24);
  const bw = Math.min(34, (Wd - m.l - m.r) / n * 0.6);
  const x = (i) => m.l + (i + 0.5) * (Wd - m.l - m.r) / n;
  for (const h of [0, 8, 16, 24]) { svg.append(svgEl('line', {x1: m.l, x2: Wd - m.r, y1: y(h), y2: y(h), stroke: grid, 'stroke-width': 0.6})); svg.append(svgText({x: m.l - 6, y: y(h) + 4, 'text-anchor': 'end', 'font-size': 10.5, fill: muted}, h + ' h')); }
  const stepD = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((Wd - m.l - m.r) / 46))));
  pts.forEach((p, i) => {
    if (!(i % stepD) || i === n - 1) svg.append(svgText({x: x(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 10.5, fill: muted}, dfmt(p.d)));
    const u = p.util || {run: p.A ? p.A.run : 0, stop: p.A ? p.A.stop : 0, off: 0};
    const run = (u.run || 0) / 60, stop = (u.stop || 0) / 60, off = (u.off || 0) / 60;
    let top = 0;
    for (const [h, fill] of [[run, css('--series') || '#2f5fc4'], [stop, css('--warn-dot') || css('--warn')], [off, css('--muted-2')]]) {
      if (h <= 0) continue;
      svg.append(svgEl('rect', {x: x(i) - bw / 2, y: y(top + h), width: bw, height: Math.max(0.5, y(top) - y(top + h)), fill, opacity: fill === css('--muted-2') ? 0.45 : 0.85}));
      top += h;
    }
    const t = svgText({x: x(i), y: Math.min(y(run) - 4, H - m.b - 4), 'text-anchor': 'middle', 'font-size': 10.5, fill: ink}, f1(run)); svg.append(t);
    const tt = svgEl('title'); tt.textContent = `${dfmt(p.d)}: run ${f1(run)} h · stopped ${f1(stop)} h · powered down ${f1(off)} h`; t.append(tt);
  });
  const wrap = el('div', {class: 'trchart'}, el('div', {class: 'tablebox'}, svg),
    el('div', {class: 'legend'}, ...[['Run', css('--series') || '#2f5fc4'], ['Stopped', css('--warn-dot') || css('--warn')], ['Powered down', css('--muted-2')]].map(([l, c]) => el('span', {class: 'lg'}, el('span', {class: 'sq', style: `background:${c}`}), l))));
  return wrap;
}
const drawTrend = (T, o) => T.m === 'hours' && T.s.kind === 'loom' ? hoursChart(T, o) : trChart(T, o);

// ---- the Trend card on each tab
function hgChoices(allW) {
  const ds = new Set(days0().slice(-30)); const seen = new Map();
  for (const x of D.loomdays || []) if (ds.has(x.date) && x.hg !== 'Unassigned' && (allW || inW(x.width))) seen.set(key(x.width, x.hg), {w: String(x.width), hg: x.hg});
  return [...seen.values()].sort((a, b) => a.hg.localeCompare(b.hg) || a.w.localeCompare(b.w));
}
function loomChoices(allW) {
  return Object.keys(D.machine || {}).map(Number).filter((l) => allW || inW(D.machine[l].width)).sort((a, b) => a - b);
}
function validSubj(s, allW) {
  if (!s) return false;
  if (s.kind === 'loom') return loomChoices(allW).includes(s.loom);
  return hgChoices(allW).some((c) => c.w === String(s.w) && c.hg === s.hg);
}
// Search inside a trend: a loom number or any part of a head-group name, across both kinds. Focused while empty it lists
// the current kind, so it also works as a dropdown to browse.
function trSearch(cur, allW, onPick) {
  const hgNow = D.loom_hg || {};
  const both = allW || W === 'all';
  const opts = () => [
    ...loomChoices(allW).map((l) => ({kind: 'loom', s: {kind: 'loom', loom: l}, label: `Loom ${l}`, sub: `${hgNow[l] || 'no run'}${both ? ` · ${D.machine[l].width} cm` : ''}`})),
    ...hgChoices(allW).map((v) => ({kind: 'hg', s: {kind: 'hg', w: v.w, hg: v.hg}, label: v.hg, sub: `${v.w} cm`}))];
  const match = (q) => {
    const all = opts(); q = q.trim().toLowerCase();
    if (!q) return all.filter((o) => o.kind === cur.kind);
    const n = q.replace(/^loom\s*/, '');
    if (/^\d+$/.test(n)) return all.filter((o) => o.kind === 'loom' && String(o.s.loom).startsWith(String(+n)));
    return all.filter((o) => o.label.toLowerCase().includes(q) || (o.kind === 'loom' && o.sub.toLowerCase().includes(q)))
      .sort((a, b) => (a.kind === 'hg' ? 0 : 1) - (b.kind === 'hg' ? 0 : 1));
  };
  const curText = subjName(cur);
  const inp = el('input', {type: 'search', class: 'trq', value: curText, placeholder: 'Search loom or head group', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Search a loom or head group for this trend', role: 'combobox', 'aria-autocomplete': 'list'});
  const list = el('div', {class: 'trsugg', role: 'listbox', hidden: true});
  let items = [], idx = -1;
  const draw = () => {
    list.replaceChildren(...(items.length ? items.slice(0, 60).map((o, i) => el('button', {type: 'button', role: 'option', class: i === idx ? 'on' : null, 'aria-selected': i === idx ? 'true' : 'false',
      onmousedown: (e) => e.preventDefault(), onclick: () => go(i)}, el('span', {class: 'k', text: o.kind === 'loom' ? 'Loom' : 'Head group'}), el('span', {text: o.label}), el('span', {class: 's', text: o.sub})))
      : [el('div', {class: 'none', text: 'No loom or head group matches.'})]));
    list.hidden = false;
  };
  const go = (i) => { const o = items[i]; if (!o) return; list.hidden = true; inp.blur(); onPick(o.s); };
  const update = () => { items = match(inp.value === curText ? '' : inp.value); idx = items.length ? 0 : -1; draw(); };
  inp.addEventListener('focus', () => { inp.select(); update(); });
  inp.addEventListener('input', update);
  inp.addEventListener('blur', () => setTimeout(() => { list.hidden = true; if (!inp.value.trim()) inp.value = curText; }, 150));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); idx = (idx + 1) % Math.min(items.length, 60); draw(); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); idx = (idx - 1 + Math.min(items.length, 60)) % Math.min(items.length, 60); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(idx < 0 ? 0 : idx); }
    else if (e.key === 'Escape') { inp.value = curText; list.hidden = true; inp.blur(); }
    e.stopPropagation();
  });
  return el('div', {class: 'trsearch'}, el('span', {class: 'ic', 'aria-hidden': 'true'}, icon('search', 16)), inp, list);
}
// The tab's worst offender: the top loom of its loom-wise table, or the head group with the most at stake in quality-wise view.
function trDefault(items, view, top) {
  if (view === 'quality') {
    const by = new Map();
    for (const it of items) { if (it.x.hg === 'Unassigned') continue; const k = key(it.x.width, it.x.hg); by.set(k, (by.get(k) || 0) + (it.w || 0)); }
    const best = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) { const [w, ...h] = best[0].split('|'); return {kind: 'hg', w, hg: h.join('|')}; }
  }
  return top ? {kind: 'loom', loom: top.loom} : null;
}
function trendCard(tab, def) {
  const cfg = TRTABS[tab]; const allW = !!cfg.allWidths;
  const st = TR[tab] || (TR[tab] = {subj: null, metric: cfg.metrics[0]});
  if (!validSubj(st.subj, allW)) st.subj = validSubj(def, allW) ? def : (hgChoices(allW)[0] ? Object.assign({kind: 'hg'}, hgChoices(allW)[0]) : null);
  if (!cfg.metrics.includes(st.metric)) st.metric = cfg.metrics[0];
  const s = st.subj;
  const c = el('div', {class: 'card trendcard', id: 'trend-card'});
  const head = el('div', {class: 'cardhead'}, el('h3', {text: 'Trend'}), s ? el('button', {class: 'link', type: 'button', text: 'View all trends ›', onclick: () => openTrends(s, cfg.mode())}) : null);
  c.append(head);
  if (!s) { c.append(el('div', {class: 'empty', text: 'Nothing has run on this width in the last 30 days.'})); return c; }
  const kindSeg = el('div', {class: 'seg', role: 'group', 'aria-label': 'Trend of'},
    el('button', {type: 'button', 'aria-pressed': s.kind === 'hg' ? 'true' : 'false', text: 'Head group', onclick: () => { if (s.kind === 'hg') return; const h = hgChoices(allW); const l = mainRec((loomRecs(s.loom).get(D.latest)) || []); const pickH = l && h.find((c2) => c2.hg === l.hg && c2.w === String(l.width)); st.subj = pickH ? {kind: 'hg', w: pickH.w, hg: pickH.hg} : h[0] ? Object.assign({kind: 'hg'}, h[0]) : s; render(); }}),
    el('button', {type: 'button', 'aria-pressed': s.kind === 'loom' ? 'true' : 'false', text: 'Loom', onclick: () => { if (s.kind === 'loom') return; const L = (D.loomdays || []).filter((x) => x.date === D.latest && x.hg === s.hg && String(x.width) === String(s.w)).sort((a, b) => a.loom - b.loom); const ls = loomChoices(allW); st.subj = {kind: 'loom', loom: L[0] ? L[0].loom : ls[0]}; render(); }}));
  const sel = trSearch(s, allW, (ns) => { st.subj = ns; render(); const c2 = $('#trend-card'); if (c2) c2.scrollIntoView({block: 'nearest'}); });
  const per = perSeg(s, () => render());
  c.append(el('div', {class: 'toolbar'}, kindSeg, sel, per));
  // 12 Nov 2026 (Divyam): the metric is a searchable drop-down
  if (cfg.metrics.length > 1) c.append(el('div', {class: 'toolbar'}, pickSelect({label: 'Metric', aria: 'Metric', placeholder: 'Search a metric', value: st.metric,
    items: cfg.metrics.map((k) => ({v: k, label: k === 'hours' ? (s.kind === 'loom' ? 'Hours run / stopped / off' : 'Looms running') : TM[k].label, sub: TM[k].unit})), onPick: (k) => { st.metric = k; render(); }})));
  const {dates, want} = trDates(s);
  const metrics = cfg.stack || [st.metric === 'hours' && s.kind === 'hg' ? 'looms' : st.metric];
  const notes = [];
  if (dates.length < want) notes.push(`${dates.length} of ${want} days on record`);
  if (s.kind === 'hg' && s.hg === 'Unassigned') notes.push('assign a head group to get a benchmark');
  const mode = cfg.mode();
  for (const k of metrics) {
    const T = trSeries(s, k, mode, dates);
    if (metrics.length > 1) c.append(el('h4', {class: 'trh', text: TM[k].label}));
    c.append(drawTrend(T));
  }
  const sub = [subjName(s), s.kind === 'loom' ? `${(D.machine[s.loom] || {}).width} cm ${(D.machine[s.loom] || {}).type || ''}` : null, `references: latest ${mode === 'tgt' ? 'target (benchmark where unset)' : mode === 'best' ? 'best (benchmark where none)' : 'benchmark'}`, ...notes].filter(Boolean).join(' · ');
  head.insertBefore(el('span', {class: 'note', text: sub}), head.lastChild);
  return c;
}
function perSeg(s, redraw) {
  const b = (v, text) => el('button', {type: 'button', 'aria-pressed': TRP[s.kind] === v ? 'true' : 'false', text, onclick: () => { setPer(s.kind, v); redraw(); }});
  const seg = s.kind === 'hg' ? el('div', {class: 'seg', role: 'group', 'aria-label': 'Period'}, b('7', '7 days'), b('14', '14 days'), b('30', '30 days'), b('rng', 'Dates'))
    : el('div', {class: 'seg', role: 'group', 'aria-label': 'Period'}, b('7', '7 days'), b('co', coLabel(changeover(s.loom))), b('rng', 'Dates'));
  return TRP[s.kind] === 'rng' ? el('span', {class: 'rng'}, seg, rngCtl(days0(), redraw)) : seg;
}
// ↗ next to the first loom or head group in each table row: load it into this tab's Trend card.
function trendBtn(subj) {
  return el('button', {type: 'button', class: 'trb', title: `Trend for ${subjName(subj)}`, 'aria-label': `Show the trend for ${subjName(subj)}`, text: '↗',
    onclick: (e) => { e.stopPropagation(); const st = TR[TAB] || (TR[TAB] = {subj: null, metric: TRTABS[TAB].metrics[0]}); st.subj = subj; render(); const c = $('#trend-card'); if (c) c.scrollIntoView({behavior: 'smooth', block: 'start'}); }, onkeydown: stopKey});
}
function addRowTrendButtons(root) {
  for (const tr of root.querySelectorAll('tbody > tr')) {
    if (tr.closest('.trendcard')) continue;
    const td = tr.querySelector(':scope > td'); if (!td) continue;
    const a = td.querySelector('button.lk, button.hgl'); if (!a || a.nextElementSibling && a.nextElementSibling.classList.contains('trb')) continue;
    if (a.classList.contains('lk')) { const l = +a.dataset.loom; if ((D.machine || {})[l]) a.after(trendBtn({kind: 'loom', loom: l})); }
    else if (a.dataset.w) a.after(trendBtn({kind: 'hg', w: a.dataset.w, hg: a.dataset.hg}));
  }
}

// ---- all-trends dashboard (panel)
function openTrends(subj, mode) { const st = {mode: mode || 'bm'}; pushView(() => trendsView(subj, st)); }
function trendsView(s, st) {
  const mc = s.kind === 'loom' ? (D.machine || {})[s.loom] || {} : null;
  const {dates, want} = trDates(s);
  const T = {}; for (const k of DASH_METRICS) T[k] = trSeries(s, k, st.mode, dates);
  T.hours = trSeries(s, s.kind === 'loom' ? 'hours' : 'looms', st.mode, dates);
  const last = (k) => { const P = T[k].pts.filter((p) => ok(p.v)); return P.at(-1); };
  // header
  let sub;
  if (s.kind === 'loom') {
    const lr = mainRec((loomRecs(s.loom).get(D.latest)) || []) || (T.erpm.pts.filter((p) => p.r).at(-1) || {}).r;
    sub = [`${mc.width} cm ${mc.type || ''}`, lr ? `on ${lr.hg}` : 'no run on record', lr && lr.beam ? `beam ${lr.beam}` : null, String(mc.width) === '280' && lr ? (pf(mc.width, lr.hg) === 2 ? 'double panna' : 'single panna') : null,
      lr && lr.date !== D.latest ? `powered down on ${dfmt(D.latest)}` : null].filter(Boolean).join(' · ');
  } else {
    const nl = T.erpm.pts.at(-1) ? T.erpm.pts.at(-1).looms : 0;
    sub = [`${s.w} cm`, String(s.w) === '280' ? (pf(s.w, s.hg) === 2 ? 'double panna' : 'single panna') : null, `${nl} loom${nl === 1 ? '' : 's'} on ${dfmt(D.latest)}`].filter(Boolean).join(' · ');
  }
  const b = s.kind === 'hg' ? lbench(s.w, s.hg) : null;
  const per = perSeg(s, () => drawPanel(true));
  const nT = Object.keys(TG).filter((k) => ok(TG[k].rpm) || ok(TG[k].cfm) || ok(TG[k].main)).length;
  const modeB = (v, text) => el('button', {type: 'button', 'aria-pressed': st.mode === v ? 'true' : 'false', text, onclick: () => { st.mode = v; drawPanel(true); }});
  const mseg = el('div', {class: 'seg', role: 'group', 'aria-label': 'Colour points against'}, modeB('bm', 'Benchmark'), modeB('best', 'Best'), modeB('tgt', `Target (${nT} set)`));
  const notes = [];
  if (dates.length < want) notes.push(`${dates.length} of ${want} days on record.`);
  notes.push(`Reference lines are the latest benchmark, best and target (${dfmt(latestDay())}). Points are coloured against the ${st.mode === 'tgt' ? 'target, or the benchmark where no target is set' : st.mode === 'best' ? 'best, or the benchmark where there is none' : 'benchmark'}; efficiency against the ${f0(EFF_BAD())}% line, warp breaks against the beam line.`);
  // scorecard
  const tiles = el('div', {class: 'trtiles'}, ...[...DASH_METRICS, 'hours'].map((k) => {
    const S2 = T[k], p = last(k), M = S2.M;
    let arrow = null;
    if (p && p.worse != null) arrow = el('span', {class: p.worse ? 'up-bad' : 'up-good', text: p.worse ? (M.hi ? ' ▼ worse' : ' ▲ worse') : ' ✓ ok'});
    const label = k === 'hours' ? (s.kind === 'loom' ? 'Run hours' : 'Looms running') : M.label;
    return el('button', {type: 'button', class: 'trtile', onclick: () => { const t = document.getElementById('trc-' + k); if (t) t.scrollIntoView({behavior: 'smooth', block: 'start'}); }},
      el('div', {class: 'label', text: label}), el('div', {class: 'big'}, p ? M.fmt(p.v) : '—', arrow),
      el('div', {class: 'note', text: k === 'hours' ? `avg ${M.fmt(S2.per)} ${s.kind === 'loom' ? 'h a day' : 'looms a day'}` : `period ${M.fmt(S2.per)} · ${M.unit}`}));
  }));
  // charts
  const small = (k, label) => {
    const S2 = T[k];
    const big = () => pushView(() => ({title: `${subjName(s)} · ${label}`, sub: S2.M.unit, body: [el('div', {class: 'toolbar', style: 'margin:0'}, perSeg(s, () => { STACK.pop(); drawPanel(true); })), el('div', {class: 'card'}, drawTrend(trSeries(s, k, st.mode, trDates(s).dates), {width: trWidth('panel')}))]}));
    return el('div', {class: 'card', id: 'trc-' + k},
      el('div', {class: 'cardhead'}, el('h3', {text: label}), el('span', {class: 'note', text: S2.M.unit})),
      drawTrend(S2, {compact: true, width: trWidth('panel-small'), onPoint: () => big()}),
      el('div', {class: 'trfoot'}, trSummary(S2), el('button', {class: 'link', type: 'button', text: 'Full size ›', onclick: big})));
  };
  const charts = el('div', {class: 'trgrid'}, ...DASH_METRICS.map((k) => small(k, TM[k].label)), small('hours', s.kind === 'loom' ? 'Hours run, stopped, powered down' : 'Looms running'));
  // records
  let recs;
  const ds = new Set(dates);
  if (s.kind === 'loom') {
    const R = (D.loomdays || []).filter((x) => x.loom === s.loom && ds.has(x.date)).sort((a, c) => c.date.localeCompare(a.date) || c.run - a.run);
    recs = card(`Loom-days in this period · ${R.length}`, 'The records behind the charts', R.length ? runTable(R, mc.width, null, {hgCol: true, noLoom: true}) : el('div', {class: 'empty', text: 'None.'}));
  } else {
    const L = (D.loomdays || []).filter((x) => ds.has(x.date) && String(x.width) === String(s.w) && x.hg === s.hg && x.run >= 60);
    const by = new Map(); for (const x of L) { if (!by.has(x.loom)) by.set(x.loom, []); by.get(x.loom).push(x); }
    const rows = [...by.entries()].map(([loom, R]) => ({loom, R, A: agg(R), days: new Set(R.map((x) => x.date)).size})).filter((r) => r.A).sort((a, c) => c.A.cfm - a.A.cfm);
    recs = card(`Looms on ${s.hg} in this period · ${rows.length}`, 'Period figures per loom (loom-days of 60 min or more). Open a loom for its own trends.',
      table(['Loom', ['Days', 'ran'], ['RPM', 'picks/min'], ['Eff', '%'], ['Eff. RPM', 'RPM × eff'], ['CFM', 'ft³/min running'], ['Air', 'ft³/1,000 picks'], ['Main max', 'kgf/cm²'], ['Warp rate', '/100k picks']],
        rows.map((r) => [el('span', {}, el('button', {type: 'button', class: 'lk', 'data-loom': String(r.loom), text: String(r.loom), onclick: () => openTrends({kind: 'loom', loom: r.loom}, st.mode)}), el('div', {class: 'note', text: r.R[0].type || ''})),
          r.days, f0(r.A.rpm), f1(r.A.eff), f0(r.A.erpm), f1(r.A.cfm), f1(r.A.apk), f2(Math.max(...r.R.map((x) => x.main_max || 0)) || null), f2(r.A.warpRate)]), [1, 2, 3, 4, 5, 6, 7, 8]));
  }
  return {title: `${subjName(s)} · all trends`, sub,
    body: [el('div', {class: 'toolbar', style: 'margin:0'}, trSearch(s, true, (ns) => { STACK[STACK.length - 1] = () => trendsView(ns, st); drawPanel(); })),
      el('div', {class: 'toolbar', style: 'margin:0'}, per, mseg, s.kind === 'hg' ? benchTag(b) : null,
        s.kind === 'loom' ? el('button', {class: 'link', type: 'button', text: `Loom ${s.loom} on ${dfmt(D.latest)} ›`, onclick: () => openLoom(s.loom, D.latest)}) : el('button', {class: 'link', type: 'button', text: `Looms on ${dfmt(D.latest)} ›`, onclick: () => openHg(s.hg, s.w, D.latest)})),
      el('p', {class: 'note', style: 'margin:0', text: notes.join(' ')}),
      tiles, trRefToggles(trRefKeys(Object.values(T)), null), charts, compTrendBlock(s, dates), recs]};
}
// Compact 7-day trend for the loom and head group panels.
function panelTrend(s) {
  const m = (TR[TAB] && TR[TAB].metric) || (TRTABS[TAB] ? TRTABS[TAB].metrics[0] : 'erpm');
  const mm = m === 'hours' ? 'erpm' : m;
  const days = days0().slice(-7);
  const T = trSeries(s, mm, TRTABS[TAB] ? TRTABS[TAB].mode() : 'bm', days);
  return card(`${TM[mm].label}, last 7 days`, TM[mm].unit, drawTrend(T, {width: trWidth('panel'), height: 210}),
    el('button', {class: 'link', type: 'button', text: 'View all trends ›', onclick: () => openTrends(s, TRTABS[TAB] ? TRTABS[TAB].mode() : 'bm')}));
}
let trResizeW = window.innerWidth;
window.addEventListener('resize', () => {
  const w = window.innerWidth; if (Math.abs(w - trResizeW) < 60) return; trResizeW = w;
  clearTimeout(window.__trT); window.__trT = setTimeout(() => { if (D && TRTABS[TAB] && !busyEditing('#gsearch') && !busyEditing('.trsearch')) render(); if (dlg && dlg.open) drawPanel(true); }, 200);
});
