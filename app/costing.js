// W2 Looms · app/costing.js — The Costing page, B grade and cut pieces, compressor money on the CFM and Pressure tabs.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- Costing page
const cHasFix = () => !!(COST && COST.schema >= 2 && Array.isArray(COST.days_entered));
const cFixed = () => cHasFix() && CPOW !== 'entered';
const cDays = () => !COST ? [] : (cHasFix() && CPOW === 'entered' ? COST.days_entered : COST.days) || [];
function powSeg() {
  if (isPlant()) return null;   // plant view: the plant's figures only, no switch
  const b = (v, t) => el('button', {type: 'button', 'aria-pressed': (cHasFix() ? CPOW : 'entered') === v ? 'true' : 'false', text: t, disabled: cHasFix() ? null : true,
    onclick: () => { CPOW = v; try { localStorage.setItem('w2-cost-power2', v); } catch (e) {} render(); }});
  return el('div', {class: 'toolbar'}, el('span', {class: 'note', text: 'Power units'}),
    el('div', {class: 'seg', role: 'group', 'aria-label': 'Power units'}, b('entered', 'As entered (plant file)'), b('fixed', 'Corrected')),
    el('span', {class: 'note', text: !cHasFix() ? 'Corrected view: not available yet. It arrives with the next costing run; figures below are as entered.'
      : cFixed() ? `POWER units less ${pn(COST.pfix && COST.pfix.paise, 0)} paise × picks ÷ rate${COST.pfix && COST.pfix.from ? ` from ${dfmt(COST.pfix.from)}${COST.pfix.to ? ` to ${dfmt(COST.pfix.to)}` : ''}` : ' every day'}. Cost per pick, totals, folded cost and month to date follow. The sheets are unchanged.${COST.pfix && COST.pfix.below && COST.pfix.below.length ? ` On ${COST.pfix.below.length} day${COST.pfix.below.length === 1 ? '' : 's'} the corrected units fall below the compressor's own units: check the plant's entry (${COST.pfix.below.slice(-3).map(dfmt).join(', ')}).` : ''}`
      : 'Exactly as the plant\'s file has it.'}));
}
const cDay = () => { const D0 = cDays(); return D0.find((d) => d.date === CDATE) || D0[D0.length - 1]; };
// Period per chart group on the Costing tab ('cpp', 'trends', 'line', 'hg', 'stock', 'power', 'labour'), kept on this device.
// A group never switched uses its default: month to date for cost per pick, 7 days for the rest.
let CPG = {};
try { const g = JSON.parse(localStorage.getItem('w2-cost-periods') || '{}'); if (g && typeof g === 'object') CPG = g; } catch (e) {}
const CPER_OK = [7, 14, 30, 'mtd', 'range'];
const cPer = (g) => CPER_OK.includes(CPG[g]) ? CPG[g] : (g === 'cpp' || g === 'types' ? 'mtd' : CPER);
function cPeriod(g) {
  const D0 = cDays(), cur = cDay(); if (!cur) return [];
  const per = g ? cPer(g) : CPER;
  const upto = D0.filter((d) => d.date <= cur.date);
  if (per === 'mtd') return upto.filter((d) => d.date.slice(0, 7) === cur.date.slice(0, 7));
  if (per === 'range') { const ds = new Set(rngDays(D0.map((d) => d.date))); return D0.filter((d) => ds.has(d.date)); }
  return upto.slice(-per);
}
function pickDay(d) { CDATE = d; render(); window.scrollTo(0, 0); }
function kpiC(label, big, unit, note) { return el('div', {}, el('div', {class: 'kpi'}, el('div', {class: 'label', text: label}), el('div', {class: 'big'}, big, unit ? el('small', {text: unit}) : null), note ? (note.nodeType ? note : el('div', {class: 'note', text: note})) : null)); }
function dlt(cur, prev, goodUp, fmt, unit = '') {
  if (!ok(cur) || !ok(prev)) return el('span', {class: 'delta flat', text: 'no prior day'});
  const d = cur - prev; if (Math.abs(d) < 1e-9) return el('span', {class: 'delta flat', text: '±0 vs previous day'});
  if (!/[1-9]/.test(fmt(Math.abs(d)))) return el('span', {class: 'delta flat', text: '±0' + unit + ' vs previous day'});
  return el('span', {class: 'delta ' + ((goodUp ? d > 0 : d < 0) ? 'up-good' : 'up-bad'), text: (d > 0 ? '▲ +' : '▼ −') + fmt(Math.abs(d)) + unit + ' vs previous day'});
}
function perSegC(g) {
  const cur = cPer(g);
  const b = (v, t, sh) => el('button', {type: 'button', 'aria-pressed': cur === v ? 'true' : 'false', 'aria-label': t, onclick: () => { CPG[g] = v; try { localStorage.setItem('w2-cost-periods', JSON.stringify(CPG)); } catch (e) {} render(); }},
    el('span', {class: 'lgl', text: t}), el('span', {class: 'sml', text: sh || t}));   // short labels on a phone, so every option fits (12 Nov 2026)
  return el('div', {class: 'seg', role: 'group', 'aria-label': 'Period'}, b(7, '7 days', '7d'), b(14, '14 days', '14d'), b(30, '30 days', '30d'), b('mtd', 'Month to date', 'MTD'), b('range', 'Dates'));
}
const periodNote = (g) => { const P = cPeriod(g); return P.length ? `${dfmt(P[0].date)} – ${dfmt(P[P.length - 1].date)} · ${P.length} day${P.length === 1 ? '' : 's'}` : ''; };
// The period switch for one chart or one group of charts: buttons, the date boxes when "Dates" is on, the span shown, and
// (past LONGP days) a Daily / Weekly switch for that group.
const perBar = (g) => el('div', {class: 'toolbar perbar stickper'}, perSegC(g), cPer(g) === 'range' ? rngCtl(cDays().map((d) => d.date), render) : null, viewSeg(g, cPeriod(g).length), el('span', {class: 'note', text: periodNote(g)}));

// ---- long periods on Costing charts. Up to LONGP days a chart draws every day as before. Past that:
//  · Daily (default): PAN days at a time, scrolling sideways with a fixed Y axis, plus a "7-day average" toggle box.
//  · Weekly (on request, per chart group, kept on this device): one point per Monday–Sunday week. Per-pick figures are
//    weighted by picks (the week's cost ÷ the week's picks); stock levels and month-to-date figures take the week's last day;
//    the rest are the week's average a day. Partial weeks at the ends say how many days they hold.
const LONGP = 12, PAN = 14;
let CVW = {};
try { const v = JSON.parse(localStorage.getItem('w2-cost-view') || '{}'); if (v && typeof v === 'object') CVW = v; } catch (e) {}
const cWeekly = (g, n) => CVW[g] === 'w' && n > LONGP;
function viewSeg(g, n) {
  if (n <= LONGP) return null;
  const b = (v, t) => el('button', {type: 'button', 'aria-pressed': (CVW[g] === 'w') === (v === 'w') ? 'true' : 'false', text: t,
    onclick: () => { CVW[g] = v; try { localStorage.setItem('w2-cost-view', JSON.stringify(CVW)); } catch (e) {} render(); }});
  return el('div', {class: 'seg', role: 'group', 'aria-label': 'Daily or weekly'}, b('d', 'Daily'), b('w', 'Weekly'));
}
const monday = (d) => { const t = new Date(d + 'T00:00:00Z'), k = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - k); return t.toISOString().slice(0, 10); };
function weekBuckets(P) {
  const m = new Map();
  for (const d of P) { const k = monday(d.date); if (!m.has(k)) m.set(k, []); m.get(k).push(d); }
  return [...m.values()];
}
const shortRange = (a, b) => { const A = dfmt(a), Bf = dfmt(b); if (a === b) return A; const [da, ma] = A.split(' '), [db, mb] = Bf.split(' '); return ma === mb ? `${da}–${db} ${mb}` : `${A} – ${Bf}`; };
// One figure for a list of days. s.agg: 'w' (weighted by s.w(d), e.g. picks), 'last', 'sum' or 'mean' (default); s.wk(L) overrides.
function aggDays(L, s, rolling) {
  if (s.wk) return s.wk(L);
  const v = L.map((d) => [s.get(d), s.w ? s.w(d) : 1]).filter((x) => ok(x[0]));
  if (!v.length) return null;
  const agg = rolling && s.agg === 'last' ? 'mean' : s.agg;
  if (agg === 'last') return v[v.length - 1][0];
  if (agg === 'sum') return v.reduce((a, x) => a + x[0], 0);
  if (agg === 'w') { const W = v.reduce((a, x) => a + (ok(x[1]) ? x[1] : 0), 0); return W ? v.reduce((a, x) => a + x[0] * (ok(x[1]) ? x[1] : 0), 0) / W : null; }
  return v.reduce((a, x) => a + x[0], 0) / v.length;
}
// A Costing line chart built from day records. g: the chart group (period and Daily/Weekly); P: the days in the period;
// pre: earlier days, so a 7-day average is a full 7 days from the first point. specs: {key, name, get(d), agg, w, wk, color,
// dash, off, avg (offer a 7-day average; default on for a one-line chart)}. defaults: boxes on when the page opens.
function dayChart(g, P, pre, o, specs, defaults) {
  const wk = cWeekly(g, P.length), long = P.length > LONGP;
  specs = specs.map((s, i) => ({...s, key: s.key || 's' + i, color: s.color || CC[i % CC.length]}));
  if (wk) {
    const Bk = weekBuckets(P);
    const tips = Bk.map((L) => `${shortRange(L[0].date, L[L.length - 1].date)}${L.length < 7 ? ` (${L.length} day${L.length === 1 ? '' : 's'})` : ''}`);
    return lineChart({...o, id: o.id ? o.id + ':w' : undefined, dates: Bk.map((L) => L[0].date), xlabels: Bk.map((L) => shortRange(L[0].date, L[L.length - 1].date)), tips,
      pickDates: Bk.map((L) => L[L.length - 1].date), defaults, pan: PAN, px: true, series: specs.map((s) => ({...s, vals: Bk.map((L) => aggDays(L, s))}))});
  }
  const series = specs.map((s) => ({...s, vals: P.map((d) => s.get(d))}));
  if (long) {
    const all = [...(pre || []), ...P], off = (pre || []).length;
    for (const s of specs) if (s.avg || (s.avg !== false && specs.length === 1)) {
      series.push({key: s.key + '-7', avgOf: s.key, name: specs.length === 1 ? '7-day average' : `${s.name}, 7-day average`, color: s.color,
        vals: P.map((d, i) => aggDays(all.slice(Math.max(0, off + i - 6), off + i + 1), s, true))});
    }
  }
  return lineChart({...o, dates: P.map((d) => d.date), defaults, pan: PAN, series});
}
// The days just before a period (for 7-day averages), from the same day list.
const preOf = (L, P) => { if (!P.length) return []; const i = L.findIndex((d) => d.date === P[0].date); return i > 0 ? L.slice(Math.max(0, i - 6), i) : []; };

// Why cost per pick moved over the month: the month's first costing day against the day shown, by the same method as the
// daily bridge (costing.py bridge(): volume, then each line's change in rupees ÷ the day's picks), so the effects add up
// exactly to the change. "All other" is the change less the bars shown, so the chart closes on the day's figure exactly.
function mtdBridgeCard(cur) {
  const m = cur.bridge_mtd, ttl = 'Why cost per pick moved this month';
  if (!m) return card(ttl, `${monthName(cur.date)} · paise per pick`, el('p', {class: 'scopenote', text: cDays().some((d) => d.bridge_mtd) ? `${dfmt(cur.date)} is the month's first costing day, so there is nothing to compare it with yet.` : 'The month-to-date bridge arrives with the next costing run.'}));
  const top = m.lines.filter((l) => Math.abs(l.e) >= 0.005).slice(0, 5), rest = m.lines.filter((l) => !top.includes(l));
  const restE0 = (m.now_cpp - m.prev_cpp) - m.volume - top.reduce((a, l) => a + l.e, 0), restD = rest.reduce((a, l) => a + l.d, 0);
  const Rb = balanced([m.volume, ...top.map((l) => l.e), restE0]), volE = Rb[0], topE = Rb.slice(1, -1), restE = Rb.at(-1);
  const steps = [{label: dfmt(m.prev_date), v: m.prev_cpp, total: true}, {label: 'Volume', v: volE}, ...top.map((l, i) => ({label: l.n, v: topE[i]})), {label: 'All other', v: restE}, {label: dfmt(cur.date), v: m.now_cpp, total: true}];
  const typeOf = (n) => { if (n === 'CUT PIECE LOSS') return 'Quality loss'; const l = cur.lines.find((x) => x.n === n); return l ? COST.types[l.t] : '—'; };
  const rows = [[el('b', {text: 'Volume'}), `Picks ${pn(m.picks0, 2)} → ${pn(m.picks1, 2)} lakh (${sg((m.picks1 / m.picks0 - 1) * 100, 1)}%)`, sg(volE), 'Fixed cost spread over more or fewer picks'],
    ...top.map((l, i) => [l.n, (l.d >= 0 ? '+' : '−') + rs(Math.abs(l.d)).replace('−', ''), sg(topE[i]), typeOf(l.n)]),
    ['All other lines', `${rest.length} lines, ${restD >= 0 ? '+' : '−'}${rs(Math.abs(restD)).replace('−', '')}`, sg(restE), ''],
    [el('b', {text: 'Total'}), '', el('b', {text: sg(Rb.reduce((a, v) => a + v, 0))}), `${pn(m.prev_cpp, 2)} → ${pn(m.now_cpp, 2)} paise`]];
  return card(ttl, `${dfmt(m.prev_date)} → ${dfmt(cur.date)} · paise per pick · the month's first costing day against this one`,
    waterfall(steps, 'Bridge of cost per pick from the first day of the month to today'),
    (() => { const t = table(['Driver', [`Change`, `₹ vs ${dfmt(m.prev_date)}`], ['Effect', 'paise per pick'], 'Type'], rows, [2]); t.classList.add('bridge'); return t; })(),
    el('p', {class: 'note', text: `The effects add up exactly to the change (each is shown to 2 decimals, rounded so the figures shown add up too). The same method as the daily one, with ${dfmt(m.prev_date)} as the starting day: volume is what that day's total cost would have been per pick at today's picks; each line is its change in rupees since then divided by today's picks. It compares the two days, not the month's totals: the month-to-date cost per pick is ${pn(cur.mtd.cpp, 2)} paise.`}));
}
// Cost per pick split by cost type, day by day (weekly on request): fixed per day, follows attendance, follows output, lumpy,
// and the cut-piece loss, as stacked bars that add up to the headline cost per pick (the dashed mark). Legend highlights a type.
const CT_COLS = {fixed: '#8e6bbf', attendance: 'var(--info)', output: 'var(--accent)', lumpy: 'var(--warn)', cut: 'var(--bad)'};
function costTypeCard() {
  const P = cPeriod('types'), wk = cWeekly('types', P.length);
  const Bk = wk ? weekBuckets(P) : P.map((d) => [d]);
  const T = Bk.map((L) => costTypesOf(L));
  const names = {...COST.types, cut: 'Cut-piece loss'};
  const layers = [...COST_TYPES, 'cut'].map((k) => ({name: names[k] || k, color: CT_COLS[k], vals: T.map((t) => t ? t[k] : null)}));
  const line = {name: 'Cost per pick', color: 'var(--ink)', vals: Bk.map((L) => aggDays(L, {get: (d) => d.cpp, agg: 'w', w: (d) => d.picks}))};
  const last = T.at(-1);
  return card('Cost per pick by cost type', `paise per pick${isPlant() ? '' : cFixed() ? ' · power units corrected' : ' · as entered'}${wk ? ' · week by week' : ''}`, perBar('types'),
    P.length ? hlStack({dates: Bk.map((L) => L[0].date), xlabels: wk ? Bk.map((L) => shortRange(L[0].date, L.at(-1).date)) : null, tips: wk ? Bk.map((L) => shortRange(L[0].date, L.at(-1).date)) : null,
      pickDates: Bk.map((L) => L.at(-1).date), layers, line, h: 280, fmt: (v) => pn(v, 2), aria: 'Cost per pick by cost type', onPick: pickDay}, 'cost-types',
      [el('span', {class: 'lg'}, el('i', {style: 'display:inline-block;width:14px;border-top:2px dashed var(--ink)'}), 'cost per pick (the figure on top of each bar)')]) : el('div', {class: 'empty', text: NA + ' for this period.'}),
    last ? el('p', {class: 'note', text: `${wk ? 'Last week' : dfmt(P.at(-1).date)}: ${[...COST_TYPES, 'cut'].map((k) => `${(names[k] || k).toLowerCase()} ${pn(last[k], 2)}`).join(', ')} = ${pn(last.sum, 2)} paise. Each line is tagged once, as in "Fixed against variable cost"; a type's layer is its lines' rupees ÷ picks. Fixed lines move cost per pick only through volume, so a taller purple block on a low-picks day is volume, not spending. Hover any block for its figure; click a cost type in the legend to highlight it; click a bar to open the day.`}) : null);
}

// ---------------------------------------------------------------- B grade and cut pieces (from November)
// Plant level from the corrected costing (B GRADE and CUT PIECE REV LOSS lines, folding metres, A-grade folded picks);
// loom, quality and reason from the B-grade register in the plant's own costing.xlsx. Cut pieces are a daily figure in metres (CUT PIC., K35 in the plant's file).
let BGPER = 'mtd', BGHG = '', BGLOOM = '';
// A head group in the B-grade cards opens the loom-wise table on it (10 Nov 2026).
function goBgLoom(hg) {
  BGHG = hg; BGLOOM = ''; render();
  requestAnimationFrame(() => { const t = document.getElementById('bg-loomwise'); if (t) t.scrollIntoView({behavior: 'smooth', block: 'start'}); });
}
const bgHgBtn = (hg) => el('button', {type: 'button', class: 'lk', title: `Open ${hg} in the loom-wise B grade`, text: hg, onclick: () => goBgLoom(hg)});
function bgradeSection(cur) {
  const bq = COST.bq;
  if (!bq || !(bq.days || []).length) return card('B grade and cut pieces', 'quality loss', el('p', {class: 'empty', text: `${NA} yet. This section arrives with the next costing run, which also reads the B-grade register from the plant's costing.xlsx.`}));
  const all = bq.days.filter((d) => d.date <= cur.date);
  if (!all.length) return card('B grade and cut pieces', 'quality loss', el('p', {class: 'empty', text: `${NA} for ${dfmt(cur.date)}: B-grade data starts on ${dfmt(bq.days[0].date)}.`}));
  const PB = BGPER === 'mtd' ? all.filter((d) => d.date.slice(0, 7) === cur.date.slice(0, 7)) : BGPER === 'all' ? all : BGPER === 'range' ? (() => { const ds = new Set(rngDays(bq.days.map((d) => d.date))); return bq.days.filter((d) => ds.has(d.date)); })() : all.slice(-BGPER);
  const dset = new Set(PB.map((d) => d.date)), day = all.find((d) => d.date === cur.date);
  const regDays = PB.filter((d) => d.reg), noReg = PB.filter((d) => !d.reg).map((d) => dfmt(d.date));
  const E = (bq.reg || []).filter((e) => dset.has(e.date));
  const sum = (L, k) => { const v = L.map((d) => d[k]).filter(ok); return v.length ? v.reduce((a, x) => a + x, 0) : null; };
  const per = (L) => {
    const bm = sum(L, 'bgrade_m'), fm = sum(L, 'folded_m'), bl = sum(L, 'bgrade_loss'), cl = sum(L, 'cut_loss'), af = sum(L, 'afold'), cp = sum(L, 'cut_pcs');
    const cm = ok(cp) ? cp : null; // cut pieces are already in metres
    return {bm, fm, cp, bl, cl, tl: ok(bl) || ok(cl) ? (bl || 0) + (cl || 0) : null, cpf: ok(cm) && fm ? 100 * cm / fm : null, tpf: ok(cm) && ok(bm) && fm ? 100 * (bm + cm) / fm : null, pctF: ok(bm) && fm ? 100 * bm / fm : null, bp: ok(bl) && af ? 100 * bl / af : null, cpp: ok(cl) && af ? 100 * cl / af : null, tp: (ok(bl) || ok(cl)) && af ? 100 * ((bl || 0) + (cl || 0)) / af : null};
  };
  const A = day ? per([day]) : null, B = per(PB);
  const na = (v, f) => ok(v) ? f(v) : NA;
  const pLabel = BGPER === 'mtd' ? 'Month to date' : BGPER === 'all' ? 'All days' : BGPER === 'range' ? 'Selected dates' : `${BGPER} days`;
  const seg = el('div', {class: 'seg', role: 'group', 'aria-label': 'B grade period'}, [[7, '7 days'], [14, '14 days'], ['mtd', 'Month to date'], ['all', 'All days'], ['range', 'Dates']].map(([v, t]) =>
    el('button', {type: 'button', 'aria-pressed': BGPER === v ? 'true' : 'false', text: t, onclick: () => { BGPER = v; render(); }})));
  const span = PB.length ? `${dfmt(PB[0].date)} – ${dfmt(PB[PB.length - 1].date)} · ${PB.length} day${PB.length === 1 ? '' : 's'}` : NA;
  const out = el('div', {class: 'stack'});
  out.append(el('h3', {class: 'sechead', text: 'B grade and cut pieces'}), el('div', {class: 'toolbar stickper'}, seg, BGPER === 'range' ? rngCtl(bq.days.map((d) => d.date), render) : null, viewSeg('bq', PB.length), el('span', {class: 'note', text: span})));

  // cut loss should equal cut metres x the flat rate; say so when the file disagrees (guards the reading of CUT PIC. as metres)
  const rate = bq.cut_rate || 60, odd = PB.filter((d) => ok(d.cut_pcs) && ok(d.cut_loss) && Math.abs(d.cut_loss - d.cut_pcs * rate) > Math.max(1, 0.01 * d.cut_loss));
  const cutRateNote = odd.length ? el('p', {class: 'note', text: `Cut-piece loss is not cut metres × ₹${rate} on ${odd.map((d) => dfmt(d.date)).join(', ')}; check CUT PIC. in the plant's file.`}) : null;

  // 1. volume, loss and what each adds to cost per good pick
  const row = (label, f, k) => [label, A ? na(A[k], f) : NA, na(B[k], f)];
  out.append(card('Quality loss', `${dfmt(cur.date)} and ${pLabel.toLowerCase()} · plant level`,
    table(['', dfmt(cur.date), pLabel], [
      row('B grade, metres', (v) => f0(v) + ' m', 'bm'), row('B grade, share of folded metres', (v) => v.toFixed(2) + '%', 'pctF'), row('Cut pieces, metres', (v) => f0(v) + ' m', 'cp'), row('Cut pieces, share of folded metres', (v) => v.toFixed(2) + '%', 'cpf'), row('B grade + cut pieces, share of folded metres', (v) => v.toFixed(2) + '%', 'tpf'),
      row('B grade revenue loss', rs, 'bl'), row('Cut-piece revenue loss', rs, 'cl'),
      row('B grade adds to cost per good pick', (v) => v.toFixed(2) + ' paise', 'bp'), row('Cut pieces add to cost per good pick', (v) => v.toFixed(2) + ' paise', 'cpp'),
      [el('b', {text: 'Together'}), A ? na(A.tp, (v) => v.toFixed(2) + ' paise') : NA, el('b', {text: na(B.tp, (v) => v.toFixed(2) + ' paise')})]], [1, 2]),
    el('p', {class: 'note', text: `Good pick = A-grade folded pick. Each loss is divided by the A-grade folded picks of the same day or period. B grade is costed at 50% of the quality's rate (the plant's B.LOSS table); cut pieces at a flat ₹${bq.cut_rate || 60} a metre.`}), cutRateNote));

  // 2. daily trends with toggle boxes (weekly on request: each week's figures come from that week's totals)
  const bqPre = preOf(bq.days, PB), bs = (k, sc = 1) => {
    // ratios come from the week's (or 7 days') totals; rupee figures are an average a day
    const sumK = ['bl', 'cl', 'tl'].includes(k), one = (d) => { const v = per([d])[k]; return ok(v) ? v / sc : null; };
    return {get: one, wk: (L) => { const v = per(L)[k]; if (!ok(v)) return null; const n = sumK ? L.filter((d) => ok(one(d))).length : 1; return n ? v / sc / n : null; }};
  };
  const bWk = cWeekly('bq', PB.length);
  out.append(el('div', {class: 'trgrid'},
    card('Quality loss per good pick', bWk ? 'paise, week by week' : 'paise, day by day', dayChart('bq', PB, bqPre, {id: 'bq-p', aria: 'Quality loss per good pick', fmt: (v) => pn(v, 2), onPick: pickDay}, [
      {key: 'b', name: 'B grade', ...bs('bp'), color: CC[0], avg: true}, {key: 'c', name: 'Cut pieces', ...bs('cpp'), color: CC[2], avg: true}, {key: 't', name: 'Together', ...bs('tp'), color: 'var(--muted)', dash: true, avg: true}], ['b', 'c'])),
    card('Quality loss and volume', bWk ? 'week by week · ₹ figures are an average a day' : 'day by day', dayChart('bq', PB, bqPre, {id: 'bq-v', aria: 'Quality loss and volume', fmt: (v) => pn(v, 2), onPick: pickDay}, [
      {key: 'pf', name: 'B grade, % of folded', ...bs('pctF'), color: CC[0]},
      {key: 'cpf', name: 'Cut pieces, % of folded', ...bs('cpf'), color: CC[3]},
      {key: 'tpf', name: 'B grade + cut pieces, % of folded', ...bs('tpf'), color: '#8e6bbf', dash: true},
      {key: 'bl', name: 'B grade loss (₹ thousand)', ...bs('bl', 1000), color: CC[1], avg: true},
      {key: 'cl', name: 'Cut-piece loss (₹ thousand)', ...bs('cl', 1000), color: CC[2], avg: true},
      {key: 'tl', name: 'B grade + cut-piece loss (₹ thousand)', ...bs('tl', 1000), color: 'var(--muted)', dash: true}], ['bl', 'cl']))));

  // 3. B grade by head group, ranked (denominator: that head group's produced metres on register days)
  const regNote = noReg.length ? `B-grade register ${NA.toLowerCase()} for ${noReg.join(', ')}; those days are left out below.` : null;
  // 12 Nov 2026 (Divyam): rupee impact from the plant's B.LOSS table: each register entry carries its metres × its quality's
  // rupees per metre in that day's B.LOSS (50% of the quality's rate), worked out in the pipeline; without one it is a gap
  // ("—"), never ₹0.
  const eRsA = bgEntryRs(E), eRsV = new Map(E.map((e, i) => [e, eRsA[i]])), eRs = (e) => eRsV.get(e);   // calc.js, tested
  const rsOf = (v, miss) => !ok(v) ? '—' : miss ? el('span', {}, rs(v), el('div', {class: 'note', text: `${miss} entr${miss === 1 ? 'y' : 'ies'} unvalued`})) : rs(v);
  const byHg = {};
  for (const d of regDays) for (const [hg, tm] of Object.entries(bq.hg_m[d.date] || {})) { const g = byHg[hg] = byHg[hg] || {hg, m: 0, prod: 0, n: 0, looms: new Set()}; g.prod += tm || 0; }
  for (const e of E) { const g = byHg[e.hg] = byHg[e.hg] || {hg: e.hg, m: 0, prod: 0, n: 0, looms: new Set()}; g.m += e.m; g.n += 1; if (e.loom != null) g.looms.add(e.loom); const v = eRs(e); if (ok(v)) g.rs = (g.rs || 0) + v; else g.miss = (g.miss || 0) + 1; }
  const hgR = Object.values(byHg).filter((g) => g.m > 0).map((g) => ({...g, pct: g.prod ? 100 * g.m / g.prod : null})).sort((a, c) => (c.pct ?? -1) - (a.pct ?? -1) || c.m - a.m);
  const totB = E.reduce((a, e) => a + e.m, 0);
  out.append(card('B grade by head group', `${span} · ranked by B grade as a share of the head group's produced metres`,
    hgR.length ? table(['#', 'Head group', ['B grade', 'm'], ['Rupee impact', '₹ B grade loss'], ['Produced', 'm'], ['B grade share', '% of produced'], ['Share of all B grade', '%'], ['Entries', 'looms']],
      hgR.map((g, i) => [String(i + 1), bgHgBtn(g.hg), f0(g.m), rsOf(g.rs, g.miss), g.prod ? f0(g.prod) : NA, ok(g.pct) ? g.pct.toFixed(2) + '%' : NA, totB ? (100 * g.m / totB).toFixed(1) + '%' : NA, `${g.n} · ${g.looms.size}`]), [2, 3, 4, 5, 6, 7])
      : el('p', {class: 'empty', text: regDays.length ? 'No B grade in this period.' : `${NA}: no B-grade register for this period.`}),
    el('p', {class: 'note', text: 'Produced metres, not folded: folding is not split by quality. Rupee impact = B grade metres × the quality\'s rupees per metre in that day\'s B.LOSS table (50% of the quality\'s rate); a quality or day missing from B.LOSS shows —. Click a head group for its looms.'}), regNote ? el('p', {class: 'scopenote', text: regNote}) : null));

  // 3b. head group × period: B-grade share of the head group's produced metres, the latest register day on its own at the
  // right and the days before it in 7-day blocks counted back from it (10 Nov 2026), then the whole period.
  { const BK = latestBuckets(PB), G = hgBucketShare(BK, bq.reg || [], bq.hg_m || {});
    const mx = Math.max(0, ...G.rows.flatMap((r) => r.cells.map((c) => c.pct)).filter(ok));
    const lab = (L, i) => i === BK.length - 1 ? `Latest · ${dfmt(L[0])}` : L.length === 1 ? dfmt(L[0]) : shortRange(L[0], L.at(-1));
    const cell = (c, hg, l) => c.prod > 0 ? {text: c.pct.toFixed(2) + '%', level: mx ? c.pct / mx : 0, tone: c.m > 0 ? 'bad' : 'none', title: `${hg}, ${l}: ${f0(c.m)} m B grade of ${f0(c.prod)} m produced = ${c.pct.toFixed(2)}%. Click for its looms.`, onClick: () => goBgLoom(hg)}
      : c.m > 0 ? {none: 'no production', title: `${hg}, ${l}: ${f0(c.m)} m B grade but no production recorded`} : {none: 'not run', title: `${hg} did not run in ${l}`};
    const rows = G.rows.filter((r) => r.m > 0 || r.prod > 0).map((r) => ({hg: r.hg, label: bgHgBtn(r.hg),
      cells: [...r.cells.map((c, i) => cell(c, r.hg, BK[i] ? lab(BK[i], i).replace('Latest · ', '') : '')), cell({m: r.m, prod: r.prod, pct: r.pct}, r.hg, 'the period')]}));
    out.append(card('B grade share by head group: latest day and the rest of the period', `${span} · % of the head group's produced metres · latest register day on its own`,
      rows.length ? heatTable([...BK.map((L, i) => ({label: lab(L, i), unit: i === BK.length - 1 ? 'latest day' : `${L.length} day${L.length === 1 ? '' : 's'}`})), {label: 'Period', unit: 'all days'}], rows, {first: 'Head group'})
        : el('p', {class: 'empty', text: regDays.length ? 'No production by head group in this period.' : `${NA}: no B-grade register for this period.`}),
      rows.length ? heatKey(`strongest red = the highest cell, ${pn(mx, 2)}%`, true, 'grey: not run, or no B grade') : null,
      el('p', {class: 'note', text: 'The latest register day has its own column at the right; the days before it are in 7-day blocks counted back from it (the oldest block can be shorter). Each cell is the head group\'s B-grade metres ÷ the metres it produced on those register days. A head group red block after block has a standing quality problem; red on the latest day only is new. Click a head group or a cell for its looms.'}))); }

  // 4. loom-wise B grade for one head group over the period
  const hgOpts = hgR.map((g) => g.hg);
  if (!hgOpts.includes(BGHG)) BGHG = hgOpts[0] || '';
  const hs = el('select', {id: 'bghg', 'aria-label': 'Head group for the loom table'}, hgOpts.map((n) => el('option', {value: n, text: n, selected: n === BGHG ? true : null})));
  hs.addEventListener('change', () => { BGHG = hs.value; render(); });
  const lm = {}, lrs = {}, lmiss = {};
  for (const e of E.filter((x) => x.hg === BGHG)) { const k = e.loom == null ? '—' : e.loom; lm[k] = (lm[k] || 0) + e.m; const v = eRs(e); if (ok(v)) lrs[k] = (lrs[k] || 0) + v; else lmiss[k] = (lmiss[k] || 0) + 1; }
  const rsTot = Object.values(lrs).reduce((a, x) => a + x, 0), missTot = Object.values(lmiss).reduce((a, x) => a + x, 0);
  const hgTot = Object.values(lm).reduce((a, x) => a + x, 0);
  const lr = Object.entries(lm).sort((a, c) => c[1] - a[1] || String(a[0]).localeCompare(String(c[0]), undefined, {numeric: true}));
  const lwCard = card('Loom-wise B grade', `${BGHG || NA} · ${span} · highest first`,
    hgOpts.length ? el('div', {class: 'toolbar'}, el('label', {for: 'bghg', text: 'Head group'}), hs) : null,
    lr.length ? table(['#', 'Loom', ['B-grade metres produced', 'm'], ['Rupee impact', '₹ B grade loss'], ['Share of B-grade metres produced', `% of ${BGHG}`]],
      [...lr.flatMap(([l, m], i) => {
        const k = String(l), isOpen = BGLOOM === BGHG + '|' + k, name = l === '—' ? 'Loom not recorded' : 'Loom ' + l;
        const btn = el('button', {type: 'button', class: 'lk', 'aria-expanded': isOpen ? 'true' : 'false', title: isOpen ? 'Hide the entries' : 'Show every entry for this loom in the period',
          onclick: () => { BGLOOM = isOpen ? '' : BGHG + '|' + k; render(); }, text: (isOpen ? '▾ ' : '▸ ') + name});
        const row = el('tr', {}, el('td', {text: String(i + 1)}), el('td', {}, btn), el('td', {class: 'num', text: f0(m)}), el('td', {class: 'num'}, rsOf(lrs[k], lmiss[k])), el('td', {class: 'num', text: (100 * m / hgTot).toFixed(1) + '%'}));
        if (!isOpen) return [row];
        const LE = E.filter((x) => x.hg === BGHG && String(x.loom == null ? '—' : x.loom) === k).sort((a, c) => a.date.localeCompare(c.date) || c.m - a.m);
        return [row, el('tr', {class: 'drillrow'}, el('td', {colspan: 5}, el('div', {class: 'note', style: 'margin-bottom:6px', text: `${name}, ${BGHG}: ${LE.length} entries in ${span}`}),
          table(['Date', 'Quality as written', ['B grade', 'm'], ['Rupee impact', '₹'], 'Remark', 'Reason'], LE.map((x) => [dfmt(x.date), x.item || '—', f0(x.m), ok(eRs(x)) ? rs(eRs(x)) : '—', x.remark || '—', (x.cats || ['Other']).join(', ')]), [2, 3])))];
      }),
        el('tr', {}, el('td', {}), el('td', {}, el('b', {text: 'Total'})), el('td', {class: 'num'}, el('b', {text: f0(hgTot)})), el('td', {class: 'num'}, el('b', {}, rsOf(rsTot, missTot))), el('td', {class: 'num', text: '100%'}))], [2, 3, 4])
      : el('p', {class: 'empty', text: `${NA}: no loom recorded B grade in this period.`}),
    el('p', {class: 'note', text: 'Only looms with B grade in the period are listed. Click a loom to see every register entry for it in the period. From the plant\'s B-grade register.'}));
  lwCard.id = 'bg-loomwise'; out.append(lwCard);

  // 5. reasons, grouped into categories
  const cats = {};
  for (const e of E) for (const c of e.cats || ['Other']) { const o = cats[c] = cats[c] || {c, n: 0, m: 0}; o.n += 1; o.m += e.m; }
  const remarks = {};
  for (const e of E) { const k = e.remark || '(no remark)'; const o = remarks[k] = remarks[k] || {k, n: 0, m: 0}; o.n += 1; o.m += e.m; }
  const cr = (bq.cats || Object.keys(cats)).map((c) => cats[c]).filter(Boolean).sort((a, c) => c.m - a.m);
  out.append(card('B-grade reasons', `${span} · grouped from the register's remarks · most metres first`,
    cr.length ? hbars(cr.map((o) => ({label: o.c, v: o.m, color: 'var(--bar)', text: `${f0(o.m)} m · ${totB ? (100 * o.m / totB).toFixed(0) + '%' : NA}`,
      title: `${o.c}: named on ${o.n} entr${o.n === 1 ? 'y' : 'ies'} covering ${f0(o.m)} m, ${totB ? (100 * o.m / totB).toFixed(1) + '%' : NA} of the ${f0(totB)} m of B grade`})),
      {aria: 'B-grade reasons, metres', axis: 'B-grade metres where the reason is named', fmt: f0, labelW: 140}) : null,
    cr.length ? table(['Reason', ['Entries', 'count'], ['B grade where named', 'm'], ['Share of B grade', '%']], cr.map((o) => [o.c, String(o.n), f0(o.m), totB ? (100 * o.m / totB).toFixed(1) + '%' : NA]), [1, 2, 3])
      : el('p', {class: 'empty', text: `${NA}: no B-grade register entries in this period.`}),
    cr.length ? table(['Remark as written', ['Entries', 'count'], ['B grade', 'm']], Object.values(remarks).sort((a, c) => c.m - a.m).map((o) => [o.k, String(o.n), f0(o.m)]), [1, 2]) : null,
    el('p', {class: 'note', text: 'Each bar is the B-grade metres whose remark names that reason, and its share of all B grade in the period. A remark naming two problems (for example "lacing & dhagali") counts under both, so the shares add up to more than 100%; that is why there is no running total.'})));

  out.append(el('p', {class: 'scopenote', text: `Cut pieces by head group, by loom and by length: ${NA.toLowerCase()}. The plant records cut pieces only as a daily total in metres, so they stay at plant level.`}));
  const mism = PB.filter((d) => d.reg && ok(d.reg_m) && ok(d.bgrade_m) && Math.abs(d.reg_m - d.bgrade_m) > 0.5);
  if (mism.length) out.append(el('p', {class: 'scopenote', text: 'Register and cost statement differ: ' + mism.map((d) => `${dfmt(d.date)} register ${f0(d.reg_m)} m, cost statement ${f0(d.bgrade_m)} m`).join('; ') + '.'}));
  return out;
}

function pageCosting() {
  const s = el('section', {class: 'page', id: 'costing'});
  if (!COST) {
    if (!COST_LOADING && !COST_ERR) loadCosting();
    s.append(el('div', {}, el('h2', {text: 'Costing'})), COST_ERR ? el('p', {class: 'err', text: COST_ERR}) : el('div', {class: 'loading', text: 'Loading costing data…'}));
    return s;
  }
  const cur = cDay();
  if (!cur) { s.append(el('div', {}, el('h2', {text: 'Costing'}), el('p', {class: 'lead', text: 'No costing day has been published yet.'}))); return s; }
  const D0 = cDays(), idx = D0.indexOf(cur), prev = idx > 0 ? D0[idx - 1] : null, last = D0[D0.length - 1];
  const cAge = ageDays(last.date);
  if (cAge > 3) s.append(el('p', {class: 'err', text: `Latest costing day is ${dfmt(last.date)}, ${cAge} days ago: the costing file may be missing or the costing run may have stopped.`}));
  // ---- header and day picker
  const sel = el('select', {id: 'cday', 'aria-label': 'Costing day'}, D0.slice().reverse().map((d) => el('option', {value: d.date, text: (d.date === last.date ? 'Latest · ' : '') + dfmt(d.date), selected: d.date === cur.date ? true : null})));
  sel.addEventListener('change', () => { CDATE = sel.value === last.date ? '' : sel.value; render(); });
  s.append(el('div', {}, el('h2', {text: `Costing, ${dfmt(cur.date)}`}),
    el('p', {class: 'lead', text: isPlant() ? 'Why cost per pick moved, what the plant produced by quality head group, and the lines that drive cost, from the plant\'s costing file. Click any point on a chart to open that day.' : `Why cost per pick moved, what the plant produced by quality head group, and the lines that drive cost. Built from Unit 2\'s corrected costing. It runs on its own and is not reconciled with the loom tabs: metres, picks and looms running can differ, because this tab uses the plant\'s production block and the loom tabs use the Toyota reports. Click any point on a chart to open that day.`})));
  s.append(el('div', {class: 'toolbar'}, el('label', {for: 'cday', text: 'Day'}), sel,
    el('span', {class: 'pill lime', text: `Costing: up to ${dfmt(last.date)}`}), D && !isPlant() ? el('span', {class: 'pill muted', text: `Looms: up to ${dfmt(D.latest)}`}) : null,
    cur.date !== last.date ? el('button', {class: 'ghost', type: 'button', text: 'Back to latest', onclick: () => { CDATE = ''; render(); }}) : null));
  if (!isPlant()) s.append(powSeg());
  const un = (COST.unassigned || []).filter((u) => !assigned[u.style] && !(D.unassigned || []).some((x) => x.style === u.style));
  if (un.length && !isPlant()) s.append(assignCard(un.map((u) => ({...u, looms: [], run_h: null, costing: true}))));

  // ---- headline numbers
  const b = cur.bridge, pk = prev ? (cur.picks / prev.picks - 1) : null;
  s.append(el('div', {class: 'kpis'},
    kpiC('Cost per pick (incl. cut piece loss)', pn(cur.cpp, 2), 'paise', dlt(cur.cpp, prev && prev.cpp, false, (x) => x.toFixed(2), ' paise')),
    kpiC('Folded cost per pick', pn(cur.fcpp, 2), 'paise', dlt(cur.fcpp, prev && prev.fcpp, false, (x) => x.toFixed(2), ' paise')),
    kpiC('Picks', pn(cur.picks, 2), 'lakh', ok(pk) ? el('span', {class: 'delta ' + (pk >= 0 ? 'up-good' : 'up-bad'), text: `${pk >= 0 ? '▲ +' : '▼ −'}${Math.abs(pk * 100).toFixed(1)}% vs previous day`}) : null),
    kpiC('Total cost', rs(cur.total), '', dlt(cur.total, prev && prev.total, false, rs)),
    kpiC('Metres produced', f0(cur.metres), 'm', `${pn(cur.looms, 1)} looms running · ${f0(cur.ppl)} picks per loom`),
    kpiC('Fixed per day', pc(cur.fixed_share), '', `${rs(cur.fixed_amt)} of the day's cost does not change with output`),
    kpiC('Month to date', pn(cur.mtd.cpp, 2), 'paise', `folded ${pn(cur.mtd.fcpp, 2)}`),
    kpiC('Same day last month', cur.ly ? pn(cur.ly.cpp, 2) : NA, cur.ly ? 'paise' : '', cur.ly ? `${dfmt(cur.ly.date)} · ${sg(cur.cpp - cur.ly.cpp)} paise now` : (cur.date.slice(0, 7) === COST_FROM.slice(0, 7) ? 'no data until 1 Dec: this tab starts on 1 Nov' : 'no costing day for that date'))));

  // ---- Sheet checks (owner only, 14 Nov 2026): the CPP task's checks of the plant's file, plant vs corrected, month to date
  if (!isPlant() && typeof fxIsOwner === 'function' && fxIsOwner()) s.append(...sheetCheckCards(cur));

  // ---- 1. daily drivers
  if (b) {
    const top = b.lines.filter((l) => Math.abs(l.e) >= 0.005).slice(0, 5), rest = b.lines.filter((l) => !top.includes(l));
    const restE0 = rest.reduce((a, l) => a + l.e, 0), restD = rest.reduce((a, l) => a + l.d, 0);
    // shown to 2 decimals and balanced, so the figures on screen add up to the change shown
    const Rb = balanced([b.volume, ...top.map((l) => l.e), restE0]), volE = Rb[0], topE = Rb.slice(1, -1), restE = Rb.at(-1);
    const steps = [{label: dfmt(b.prev_date), v: b.prev_cpp, total: true}, {label: 'Volume', v: volE}, ...top.map((l, i) => ({label: l.n, v: topE[i]})), {label: 'All other', v: restE}, {label: dfmt(cur.date), v: b.now_cpp, total: true}];
    const typeOf = (n) => { if (n === 'CUT PIECE LOSS') return 'Quality loss'; const l = cur.lines.find((x) => x.n === n); return l ? COST.types[l.t] : '—'; };
    const rows = [[el('b', {text: 'Volume'}), `Picks ${pn(b.picks0, 2)} → ${pn(b.picks1, 2)} lakh (${sg((b.picks1 / b.picks0 - 1) * 100, 1)}%)`, sg(volE), 'Fixed cost spread over more or fewer picks'],
      ...top.map((l, i) => [l.n, (l.d >= 0 ? '+' : '−') + rs(Math.abs(l.d)).replace('−', ''), sg(topE[i]), typeOf(l.n)]),
      ['All other lines', `${rest.length} lines, ${restD >= 0 ? '+' : '−'}${rs(Math.abs(restD)).replace('−', '')}`, sg(restE), ''],
      [el('b', {text: 'Total'}), '', el('b', {text: sg(Rb.reduce((a, v) => a + v, 0))}), `${pn(b.prev_cpp, 2)} → ${pn(b.now_cpp, 2)} paise`]];
    const vs = b.vol_split;
    s.append(card('Why cost per pick moved', `${dfmt(b.prev_date)} → ${dfmt(cur.date)} · paise per pick`, waterfall(steps, 'Bridge of cost per pick from the previous day to today'),
      el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('i', {style: 'display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:var(--bad)'}), 'pushed cost per pick up'), el('span', {class: 'lg'}, el('i', {style: 'display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:var(--good)'}), 'pulled it down'), el('span', {class: 'lg'}, el('i', {style: 'display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:var(--muted-2);opacity:.75'}), 'day total')),
      (() => { const t = table(['Driver', 'Change', ['Effect', 'paise per pick'], 'Type'], rows, [2]); t.classList.add('bridge'); return t; })(),
      el('p', {class: 'note', text: 'The effects add up exactly to the change. Volume is what yesterday\'s total cost would have been per pick at today\'s picks; each line is its change in rupees divided by today\'s picks.'}),
      vs ? el('p', {class: 'scopenote', text: `Volume, in two parts: looms running ${pn(vs.looms0, 2)} → ${pn(vs.looms1, 2)} accounts for ${sg(vs.picks_looms, 2)} lakh picks, and picks per running loom ${f0(vs.ppl0)} → ${f0(vs.ppl1)} for ${sg(vs.picks_perloom, 2)} lakh. Together ${sg(vs.picks_change, 2)} lakh${Math.abs(vs.picks_change) > 0.005 ? `, so ${Math.round(Math.abs(vs.picks_looms / vs.picks_change) * 100)}% of the change in picks came from the number of looms running` : ''}.`}) : null));
    s.append(mtdBridgeCard(cur));
    // folded
    const fb = b.folded;
    if (fb) s.append(card('Folded cost per pick', 'Cost of A-grade folded picks: OPEX plus cut-piece loss, over picks folded',
      table(['Step', ['Effect', 'paise per pick']], [[dfmt(b.prev_date), pn(fb.prev, 2)], ['Picks folded (timing of folding)', sg(fb.folding)], ['OPEX', sg(fb.opex)], ['Cut-piece loss', sg(fb.cut)], [dfmt(cur.date), el('b', {text: pn(fb.now, 2)})]], [1]),
      el('p', {class: 'note', text: `${f0(fb.folded_m)} m were folded against ${f0(fb.produced_m)} m produced, so folded cost per pick can move the other way from cost per pick on a day when folding runs ahead of or behind production.`})));
  } else s.append(el('p', {class: 'scopenote', text: 'This is the first costing day on record, so there is no previous day to compare with.'}));
  if (!b) s.append(mtdBridgeCard(cur));

  // ---- 2. fixed against variable
  const byT = {};
  for (const l of cur.lines) { const o = byT[l.t] = byT[l.t] || {t: l.t, a: 0, lines: []}; o.a += l.a; o.lines.push(l); }
  const spikes = cur.lines.filter((l) => l.spike), newL = cur.lines.filter((l) => l.new);
  s.append(card('Fixed against variable cost', `${dfmt(cur.date)} · each line is tagged once`,
    table(['Type', ['Amount', '₹'], ['Share', '% of cost'], ['Per pick', 'paise'], 'Largest lines'],
      ['fixed', 'attendance', 'output', 'lumpy'].filter((t) => byT[t]).map((t) => { const o = byT[t]; return [COST.types[t], rs(o.a), pc(o.a / cur.total), pn(o.a / (cur.picks * 1e5) * 100, 2), o.lines.slice(0, 3).map((l) => `${l.n} ${rs(l.a)}`).join(' · ')]; }), [1, 2, 3]),
    el('p', {class: 'note', text: 'Fixed lines move cost per pick only through volume, so this separates "we spent more" from "we made less". Lumpy lines are a bill on some days and nothing on others.'}),
    spikes.length ? el('p', {class: 'scopenote', text: `One-off day: ${spikes.map((l) => `${l.n} ${rs(l.a)} against a ${rs(l.avg)} daily average`).join('; ')}. Read a jump in these lines as timing, not a trend. With lumpy lines spread over the month, cost per pick is ${pn(cur.cpp_smooth, 2)} paise against ${pn(cur.cpp, 2)}.`}) : el('p', {class: 'note', text: `With lumpy lines spread over the month, cost per pick is ${pn(cur.cpp_smooth, 2)} paise against ${pn(cur.cpp, 2)} as booked.`}),
    newL.length ? el('p', {class: 'scopenote', text: `New expense line${newL.length === 1 ? '' : 's'} today: ${newL.map((l) => l.n).join(', ')}. Shown as lumpy until it is tagged.`}) : null));

  // ---- 3. trends. Every chart or group of charts has its own period switch (perBar), kept on this device.
  const onPick = pickDay;
  const per = (g) => { const P = cPeriod(g); return {P, dates: P.map((d) => d.date), pre: preOf(cDays(), P)}; };
  const wPk = (d) => d.picks, wFpk = (d) => d.afold;
  // cost per pick: month to date by default (starts again on the 1st), any period on request; series switched with toggle boxes
  const {P: M, pre: mPre} = per('cpp'), ym0 = cur.date.slice(0, 7);
  const first = cDays()[0] ? cDays()[0].date : ym0 + '-01', fy = +first.slice(0, 4), fm = +first.slice(5, 7);
  const lyFrom = dfmt(`${fm === 12 ? fy + 1 : fy}-${String(fm === 12 ? 1 : fm + 1).padStart(2, '0')}-01`);
  const lyOff = M.some((d) => d.ly && ok(d.ly.cpp)) ? null : (M.every((d) => d.date.slice(0, 7) === first.slice(0, 7)) ? `no data until ${lyFrom}, because this tab holds data from ${monthName(first)} onward.` : 'not available for this period.');
  s.append(card('Cost per pick', `paise, incl. cut piece loss${isPlant() ? '' : cFixed() ? ' · power units corrected' : ' · as entered'}`, perBar('cpp'),
    dayChart('cpp', M, mPre, {id: 'cpp', w: Math.round(Math.max(340, Math.min(1000, (document.documentElement.clientWidth || 1000) - (document.documentElement.clientWidth >= 1024 ? 300 : 64)))), h: (document.documentElement.clientWidth || 1000) < 700 ? 260 : 280, aria: 'Cost per pick', fmt: (v) => pn(v, 1), onPick}, [
      {key: 'cpp', name: 'Cost per pick', get: (d) => d.cpp, agg: 'w', w: wPk, color: CC[0], avg: true},
      {key: 'fcpp', name: 'Folded', get: (d) => d.fcpp, agg: 'w', w: wFpk, color: CC[1], dash: true, avg: true},
      {key: 'mtd', name: 'Month-to-date cost per pick', get: (d) => d.mtd.cpp, agg: 'last', color: 'var(--muted)', dash: true, avg: false},
      {key: 'mtdf', name: 'Month-to-date folded', get: (d) => d.mtd.fcpp, agg: 'last', color: '#8e6bbf', dash: true, avg: false},
      {key: 'ly', name: 'Same day last month', get: (d) => d.ly ? d.ly.cpp : null, agg: 'w', w: (d) => d.ly ? d.ly.picks : null, color: 'var(--warn)', off: lyOff, avg: false}], ['cpp', 'fcpp'])));
  if (typeof fxCostChart === 'function') { const fc = fxCostChart(M, mPre); if (fc) s.append(fc); }   // R2: realisation against cost per pick (owner, analysis on)
  s.append(costTypeCard());
  { const {P, pre} = per('trends'), wkNote = cWeekly('trends', P.length) ? ', weekly: average a day' : '';
    s.append(el('div', {class: 'stack'}, perBar('trends'), el('div', {class: 'trgrid'},
      card('Picks per day', 'lakh picks, whole plant' + wkNote, dayChart('trends', P, pre, {aria: 'Picks per day', fmt: (v) => pn(v, 1), onPick}, [{name: 'Picks', get: wPk}])),
      card('Fixed-cost absorption', 'fixed cost per pick against picks: each extra lakh picks spreads the fixed cost thinner', dayChart('trends', P, pre, {aria: 'Fixed cost per pick', fmt: (v) => pn(v, 1), onPick}, [{name: 'Fixed cost per pick (paise)', get: (d) => d.picks ? d.fixed_amt / (d.picks * 1e5) * 100 : null, agg: 'w', w: wPk}]))))); }

  // single expense line
  const names = [...new Set(cDays().slice(-30).flatMap((d) => d.lines.map((l) => l.n)))].sort();
  if (!names.includes(CLINE)) CLINE = names.includes('POWER') ? 'POWER' : names[0];
  if (CLINE === 'PACKING' && !CLINE_SET && names.includes('POWER')) CLINE = 'POWER';
  const lsel = el('select', {id: 'cline', 'aria-label': 'Expense line'}, names.map((n) => el('option', {value: n, text: n, selected: n === CLINE ? true : null})));
  lsel.addEventListener('change', () => { CLINE = lsel.value; CLINE_SET = true; render(); });
  // search beside the dropdown: typing narrows the dropdown; Enter (or a single match) opens that line
  const lmsg = el('span', {class: 'note'});
  const lfind = el('input', {type: 'search', id: 'clfind', class: 'csearch', placeholder: 'Search lines', 'aria-label': 'Search expense lines', value: CLQ, autocomplete: 'off'});
  const narrow = () => {
    const q = lfind.value.trim().toUpperCase(), hits = names.filter((n) => !q || n.toUpperCase().includes(q));
    lsel.replaceChildren(...(hits.length ? hits : names).map((n) => el('option', {value: n, text: n, selected: n === CLINE ? true : null})));
    lmsg.textContent = !q ? '' : hits.length ? `${hits.length} line${hits.length === 1 ? '' : 's'} match` : 'No line matches; showing all.';
    return hits;
  };
  const openLine = (n) => { if (!n || n === CLINE) return; CLINE = n; CLINE_SET = true; render(); const f = document.getElementById('clfind'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } };
  lfind.addEventListener('input', () => { CLQ = lfind.value; const h = narrow(); if (h.length === 1) openLine(h[0]); });
  lfind.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const h = narrow(); if (h.length) openLine(h.includes(CLINE) ? CLINE : h[0]); } });
  if (CLQ) narrow();
  const {P: PLn, pre: lnPre} = per('line');
  const lv = (d, k) => { const l = d.lines.find((x) => x.n === CLINE); return l ? l[k] : null; };
  s.append(card('Any single expense line', 'Day amount and paise per pick', el('div', {class: 'toolbar'}, el('label', {for: 'clfind', text: 'Line'}), lfind, lsel, lmsg), perBar('line'),
    el('div', {class: 'trgrid'}, el('div', {}, el('h4', {class: 'trh', text: cWeekly('line', PLn.length) ? '₹ a day, average of the week' : '₹ a day'}), dayChart('line', PLn, lnPre, {aria: CLINE + ' amount', fmt: (v) => rs(v), onPick}, [{name: CLINE + (cWeekly('line', PLn.length) ? ' (₹, average a day)' : ' (₹)'), get: (d) => lv(d, 'a')}])),
      el('div', {}, el('h4', {class: 'trh', text: 'Paise per pick'}), dayChart('line', PLn, lnPre, {aria: CLINE + ' per pick', fmt: (v) => pn(v, 2), onPick}, [{name: CLINE + ' (paise per pick)', get: (d) => lv(d, 'pp'), agg: 'w', w: wPk}]))),
    CLINE === 'POWER' && cHasFix() ? el('p', {class: 'note', text: cFixed() ? 'POWER is shown with corrected units. Switch "Power units" at the top to see it as entered.' : 'POWER is shown as entered in the plant\'s file.'}) : null));

  // ---- 4. power (cost line) and labour, above production
  const {P: PP, pre: pPre} = per('power'), {P: PL, pre: lPre} = per('labour');
  const powPP = (d) => d.power && ok(d.power.amount) && d.picks ? d.power.amount / (d.picks * 1e5) * 100 : null;
  s.append(el('div', {class: 'trgrid'},
    card('Power', 'POWER line of the costing: units, rate and cost per lakh picks', table(['', 'Today'], [['Units', f0(cur.power.units)], ['Units per lakh picks', pn(cur.power.per_lakh, 0)], ['Rate per unit', '₹ ' + pn(cur.power.rate, 2)], ['Amount', rs(cur.power.amount)], ['Power cost per pick', ok(powPP(cur)) ? pn(powPP(cur), 2) + ' paise' : NA], ['₹ per lakh picks', rs(cur.power.rs_lakh)]], [1]),
      perBar('power'),
      el('h4', {class: 'trh', text: 'Power cost per pick, paise'}),
      dayChart('power', PP, pPre, {aria: 'Power cost per pick', fmt: (v) => pn(v, 2), onPick}, [{name: 'Power cost per pick (paise)', get: powPP, agg: 'w', w: wPk}]),
      el('h4', {class: 'trh', text: 'Units per lakh picks'}),
      dayChart('power', PP, pPre, {aria: 'Power units per lakh picks', fmt: f0, onPick}, [{name: 'Units per lakh picks', get: (d) => d.power.per_lakh, agg: 'w', w: wPk}]),
      cur.pfix ? el('p', {class: 'scopenote', text: cFixed() ? `Corrected: ${f0(cur.pfix.units_entered)} units entered, less ${f0(cur.pfix.units)} (${pn(COST.pfix && COST.pfix.paise, 0)} paise × ${pn(cur.picks, 2)} lakh picks ÷ ₹${pn(cur.power.rate, 2)}) = ${f0(cur.power.units)} units.` : `As entered. Corrected units would be ${f0(cur.pfix.units_entered - cur.pfix.units)}, ${f0(cur.pfix.units)} fewer.`}) : null,
      cur.pfix && cur.pfix.below ? el('p', {class: 'err', text: `The corrected units (${f0(cur.pfix.units_entered - cur.pfix.units)}) are below the compressor's own units for the day: the POWER or Power (Compressor) entry in the plant's file needs a look.`}) : null,
      el('p', {class: 'note', text: 'The power line here is the plant\'s whole electricity bill. The compressor share of it is analysed on the CFM and Pressure tabs.'})),
    card('Labour', 'attendance and cost from the costing\'s labour lines', table(['', 'Today'], [['Headcount on salary lines', f0(cur.labour.head)], ['Labour cost', rs(cur.labour.cost)], ['Labour cost per pick', pn(cur.labour.per_pick, 2) + ' paise'], ['Labour cost per running loom', rs(cur.labour.per_loom)]], [1]),
      perBar('labour'),
      el('h4', {class: 'trh', text: 'Labour cost per pick, paise'}),
      dayChart('labour', PL, lPre, {aria: 'Labour cost per pick', fmt: (v) => pn(v, 2), onPick}, [{name: 'Labour cost per pick (paise)', get: (d) => d.labour.per_pick, agg: 'w', w: wPk}]),
      PL.some((d) => ok(d.labour && d.labour.head)) ? el('div', {}, el('h4', {class: 'trh', text: 'Headcount on salary lines'}), dayChart('labour', PL, lPre, {aria: 'Headcount', fmt: f0, onPick}, [{name: cWeekly('labour', PL.length) ? 'Headcount (average a day)' : 'Headcount', get: (d) => d.labour.head}])) : null)));

  // ---- 5. production by head group
  const hgRows = cur.hg, pv = prev ? Object.fromEntries(prev.hg.map((h) => [h.hg, h])) : {};
  // Today or month to date (switch kept on this device); the month view sums the month's days up to the day shown
  const ym = cur.date.slice(0, 7), agg = {};
  for (const d of D0.filter((x) => x.date.slice(0, 7) === ym && x.date <= cur.date)) for (const h of d.hg) { const g = agg[h.hg] = agg[h.hg] || {hg: h.hg, names: new Set(), dm: 0, nm: 0, tm: 0, pp: 0, loomdays: 0}; for (const n of h.names || []) g.names.add(n); g.dm += h.dm || 0; g.nm += h.nm || 0; g.tm += h.tm; g.pp += h.pp; g.loomdays += h.looms; }
  const ag = Object.values(agg).sort((a, c) => c.tm - a.tm), totM = ag.reduce((a, g) => a + g.tm, 0), totP = ag.reduce((a, g) => a + g.pp, 0);
  const vb = (v, t) => el('button', {type: 'button', 'aria-pressed': CHGV === v ? 'true' : 'false', text: t, onclick: () => { CHGV = v; try { localStorage.setItem('w2-cost-hgview', v); } catch (e) {} render(); }});
  const hgSeg = el('div', {class: 'toolbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Production view'}, vb('today', 'Today'), vb('mtd', 'Month to date')));
  if (CHGV === 'mtd') s.append(card('Production by quality head group', `${dfmt(ym + '-01')} – ${dfmt(cur.date)} · month to date · whole plant, both widths together · sorted by metres`, hgSeg,
    table(['Head group', ['Metres', 'day / night'], ['Total', 'm'], ['Share', '% of metres'], ['Picks', 'lakh'], ['Share', '% of picks'], ['Average looms', 'a day'], ['Metres per loom-day', 'm']],
      ag.map((g) => [el('span', {}, el('b', {text: g.hg}), el('div', {class: 'note', text: [...g.names].join(', ')})), `${f0(g.dm)} / ${f0(g.nm)}`, f0(g.tm), pc(g.tm / totM), pn(g.pp, 2), pc(totP ? g.pp / totP : null), pn(g.loomdays / (cur.mtd.days || 1), 1), f0(g.tm / (g.loomdays || 1))]), [1, 2, 3, 4, 5, 6, 7]),
    el('p', {class: 'note', text: `${cur.mtd.days} day${cur.mtd.days === 1 ? '' : 's'} of ${monthName(cur.date)}. Average looms = loom-days ÷ days in the month so far. Converting cost per metre is a day figure: switch to Today to see it.`})));
  else s.append(card('Production by quality head group', `${dfmt(cur.date)} · whole plant, both widths together · sorted by metres`, hgSeg,
    table(['Head group', ['Metres', 'day / night'], ['Total', 'm'], ['vs previous day', 'm'], ['Picks', 'lakh'], ['Share', '% of picks'], ['Looms', 'running'], ['Metres per loom', 'm'], ['Converting cost', '₹ per metre']],
      hgRows.map((h) => [el('span', {}, el('b', {text: h.hg}), el('div', {class: 'note', text: h.names.join(', ')})), `${f0(h.dm)} / ${f0(h.nm)}`, f0(h.tm), pv[h.hg] ? ((h.tm - pv[h.hg].tm) >= 0 ? '+' : '−') + f0(Math.abs(h.tm - pv[h.hg].tm)) : 'new', pn(h.pp, 2), pc(h.share), pn(h.looms, 2), f0(h.mpl), ok(h.conv) ? pn(h.conv, 2) : '—']), [1, 2, 3, 4, 5, 6, 7, 8]),
    el('p', {class: 'note', text: `Converting cost per metre = the day's cost per pick (${pn(cur.cpp, 2)} paise) × the quality's picks per inch, so it differs between groups only through picks per inch. A quality running on both widths counts once. Click a point on a chart below to open another day.`}),
    (() => { const R = hgRows.filter((h) => ok(h.conv) && h.hg !== 'Unassigned').sort((a, c) => c.conv - a.conv || a.hg.localeCompare(c.hg));
      return R.length ? el('div', {}, el('h4', {class: 'trh', text: 'Converting cost per metre, highest first'}),
        hbars(R.map((h) => ({label: h.hg, v: h.conv, color: 'var(--bar)', text: '₹' + pn(h.conv, 2), title: `${h.hg}: ₹${pn(h.conv, 2)} a metre = ${pn(cur.cpp, 2)} paise × ${pn(h.ppi, 1)} picks per inch · ${f0(h.tm)} m today`})),
          {aria: 'Converting cost per metre by head group', axis: '₹ per metre', fmt: (v) => pn(v, 2), labelW: 150})) : null; })()));
  const hgNames = [...new Set(cDays().slice(-30).flatMap((d) => d.hg.map((h) => h.hg)))].sort();
  if (!hgNames.includes(CHSEL)) CHSEL = (cur.hg[0] || {}).hg || hgNames[0];
  const hsel = el('select', {id: 'chg', 'aria-label': 'Head group'}, hgNames.map((n) => el('option', {value: n, text: n, selected: n === CHSEL ? true : null})));
  hsel.addEventListener('change', () => { CHSEL = hsel.value; render(); });
  const hv = (d, k) => { const h = d.hg.find((x) => x.hg === CHSEL); return h ? h[k] : null; };
  { const {P, pre} = per('hg');
  s.append(card('Metres per day, one head group', 'metres a day for the head group chosen' + (cWeekly('hg', P.length) ? ' · weekly: average a day' : ''), el('div', {class: 'toolbar'}, el('label', {for: 'chg', text: 'Head group'}), hsel), perBar('hg'), dayChart('hg', P, pre, {aria: 'Metres for ' + CHSEL, fmt: f0, onPick}, [{name: CHSEL, get: (d) => hv(d, 'tm')}]))); }
  // ---- 4b. stock and dispatch (full width). Stock days = closing stock ÷ metres produced a day; dispatch % = dispatched ÷ produced, month to date.
  const sumK = (L, k) => { const v = L.map((d) => d.stock[k]).filter(ok); return v.length ? v.reduce((a, x) => a + x, 0) : null; };
  const mtdOf = (d) => D0.filter((x) => x.date.slice(0, 7) === d.date.slice(0, 7) && x.date <= d.date);
  const {P, pre} = per('stock'), sWk = cWeekly('stock', P.length);
  const st = cur.stock, MD = mtdOf(cur), mProd = sumK(MD, 'produced'), mFold = sumK(MD, 'folding'), mDisp = sumK(MD, 'dispatch');
  const sDays = (d) => ok(d.stock.closing) && d.stock.produced ? d.stock.closing / d.stock.produced : null;
  const dPct = (d) => { const L = mtdOf(d), pr = sumK(L, 'produced'), dp = sumK(L, 'dispatch'); return ok(dp) && pr ? 100 * dp / pr : null; };
  const avgProd = ok(mProd) && MD.length ? mProd / MD.length : null;
  const dd = (v) => ok(v) ? v.toFixed(1) + ' days' : NA, pp1 = (v) => ok(v) ? v.toFixed(1) + '%' : NA;
  s.append(card('Stock and dispatch', `metres · ${dfmt(cur.date)} and ${monthName(cur.date)} to date`,
    table(['', 'Today', 'Month to date'], [
      ['Produced', f0(st.produced), f0(mProd)], ['Folded', f0(st.folding), f0(mFold)], ['Dispatched', f0(st.dispatch), f0(mDisp)],
      ['Closing stock', f0(st.closing), ''], ['RFD stock', f0(st.rfd), ''], ['Produced but not folded', '', f0(st.backlog)],
      ...(typeof fxStockRows === 'function' ? fxStockRows(st, cur, MD) : []),   // R2: the stock valued at prevailing rate (owner, analysis on)
      [el('b', {text: 'Stock days'}), el('b', {text: dd(sDays(cur))}), dd(ok(st.closing) && avgProd ? st.closing / avgProd : null)],
      [el('b', {text: 'Dispatch %'}), ok(st.dispatch) && st.produced ? pp1(100 * st.dispatch / st.produced) : NA, el('b', {text: pp1(ok(mDisp) && mProd ? 100 * mDisp / mProd : null)})]], [1, 2]),
    el('p', {class: 'note', text: 'Stock days = closing stock ÷ metres produced: today\'s production in the Today column, the month\'s average a day in the Month to date column. Dispatch % = metres dispatched ÷ metres produced, month to date (Today column: the day alone).'}),
    perBar('stock'),
    el('div', {class: 'sdgrid'},
      el('div', {}, el('h4', {class: 'trh', text: sWk ? 'Closing stock, m, end of week' : 'Closing stock, m'}), dayChart('stock', P, pre, {w: 520, h: 300, aria: 'Closing stock', fmt: f0, onPick}, [{name: 'Closing stock (m)', get: (d) => d.stock.closing, agg: 'last'}])),
      el('div', {}, el('h4', {class: 'trh', text: sWk ? 'RFD stock, m, end of week' : 'RFD stock, m'}), dayChart('stock', P, pre, {w: 520, h: 300, aria: 'RFD stock', fmt: f0, onPick}, [{name: 'RFD stock (m)', get: (d) => d.stock.rfd, agg: 'last', color: CC[1]}])),
      el('div', {}, el('h4', {class: 'trh', text: sWk ? 'Produced and dispatched, m, average a day' : 'Produced and dispatched, m'}), dayChart('stock', P, pre, {id: 'stock-pd', w: 520, h: 300, aria: 'Produced and dispatched', fmt: f0, onPick}, [{key: 'p', name: 'Produced (m)', get: (d) => d.stock.produced, color: 'var(--muted)'}, {key: 'd', name: 'Dispatched (m)', get: (d) => d.stock.dispatch, color: CC[2]}])),
      el('div', {}, el('h4', {class: 'trh', text: 'Stock days'}), dayChart('stock', P, pre, {w: 520, h: 300, aria: 'Stock days', fmt: (v) => pn(v, 1), onPick}, [{name: 'Stock days', get: sDays,
        wk: (L) => { const c = L.map((d) => d.stock.closing).filter(ok), pr = L.map((d) => d.stock.produced).filter((v) => ok(v) && v > 0); return c.length && pr.length ? c[c.length - 1] / (pr.reduce((a, x) => a + x, 0) / pr.length) : null; }}])),
      el('div', {}, el('h4', {class: 'trh', text: 'Dispatch %, month to date'}), dayChart('stock', P, pre, {w: 520, h: 300, zero: true, aria: 'Dispatch percent month to date', fmt: (v) => pn(v, 1) + '%', onPick}, [{name: 'Dispatch % (month to date)', get: dPct, agg: 'last', avg: false}])))));

  // ---- 5b. B grade and cut pieces
  s.append(bgradeSection(cur));

  // ---- 6. month to date table
  const lines = cur.lines.slice().sort((a, c) => c.mt - a.mt);
  s.append(card('Month to date', `${cur.mtd.days} day${cur.mtd.days === 1 ? '' : 's'} of ${dfmt(ym + '-01').split(' ')[1]}`,
    table(['Line', ['Today', '₹'], ['Average a day', '₹'], ['Month total', '₹'], ['Per pick, month', 'paise']],
      [...lines.slice(0, 14).map((l) => [l.n, rs(l.a), rs(l.avg), rs(l.mt), pn(l.mt / (cur.mtd.picks * 1e5) * 100, 2)]),
        lines.length > 14 ? ['Other lines (' + (lines.length - 14) + ')', rs(lines.slice(14).reduce((a, l) => a + l.a, 0)), rs(lines.slice(14).reduce((a, l) => a + l.avg, 0)), rs(lines.slice(14).reduce((a, l) => a + l.mt, 0)), pn(lines.slice(14).reduce((a, l) => a + l.mt, 0) / (cur.mtd.picks * 1e5) * 100, 2)] : null,
        ['Cut piece loss', rs(cur.cut || 0), rs((cur.mtd.cut || 0) / (cur.mtd.days || 1)), rs(cur.mtd.cut || 0), pn((cur.mtd.cut || 0) / (cur.mtd.picks * 1e5) * 100, 2)],
        el('tr', {}, el('td', {}, el('b', {text: 'Total incl. cut piece loss'})), el('td', {class: 'num', text: rs(cur.total + (cur.cut || 0))}), el('td', {class: 'num', text: rs(cur.mtd.avg_total + (cur.mtd.cut || 0) / (cur.mtd.days || 1))}), el('td', {class: 'num', text: rs(cur.mtd.amount + (cur.mtd.cut || 0))}), el('td', {class: 'num', text: pn(cur.mtd.cpp, 2)}))].filter(Boolean), [1, 2, 3, 4])));

  // ---- 7. file health (not in the plant view, which ends with who is signed in)
  if (isPlant()) {
    s.append(el('p', {}, el('span', {class: 'note', text: `Data generated ${COST.generated_at} IST · signed in as ${ME.email} (Plant view). `}), el('button', {class: 'ghost', type: 'button', text: 'Sign out', onclick: signOut})));
    return s;
  }
  const H = D0.slice(-14).reverse();
  s.append(card('File health', 'One line per day. It reports and never corrects; full validation stays with the costing analysis task.',
    table(['Day', 'Layout', 'Own checks', ['Checks not agreeing', 'count'], 'Error cells', 'New lines', ['Corrected vs plant file', '₹, month total']],
      H.map((d) => { const ck = d.health.checks || {}; const bad = Object.keys(ck).filter((k) => !ck[k].ok); const names = {lines: 'lines ≠ total', cpp: 'total ÷ picks ≠ cost per pick', prog: 'progressive ≠ previous total'};
        return [el('span', {style: 'white-space:nowrap', text: dfmt(d.date)}), el('span', {class: 'pill good', text: 'recognised'}),
          !Object.keys(ck).length ? '—' : bad.length ? el('span', {class: 'pill warn', title: bad.map((k) => ck[k].note).join(' | '), text: bad.map((k) => names[k] || k).join(', ')}) : el('span', {class: 'pill good', title: Object.values(ck).map((c) => c.note).join(' | '), text: `${Object.keys(ck).length} agree`}),
          d.health.mismatch == null ? '—' : String(d.health.mismatch), d.health.errors && d.health.errors.length ? el('span', {class: 'pill warn', title: d.health.errors.join(' | '), text: d.health.errors.length + ' flagged'}) : el('span', {class: 'pill good', text: 'none'}),
          d.health.new_lines && d.health.new_lines.length ? d.health.new_lines.join(', ') : '—', ok(d.health.corrected_gap) ? sg(d.health.corrected_gap, 0) : '—']; }), [3, 6]),
    el('p', {class: 'note', text: 'Own checks, run by the app on every day: the expense lines add to TOTAL AMOUNT (within ₹1); TOTAL AMOUNT ÷ PICK equals the sheet\'s COST PER PICK; PROGRESSIVE equals the previous day\'s TOTAL column. Hover a pill for the figures.'}),
    (COST.skipped || []).length ? el('p', {class: 'scopenote', text: 'Not logged: ' + COST.skipped.map((d) => `${dfmt(d)} (${(COST.skipped_why[d] || []).join(', ')} not found)`).join('; ') + '. The tab keeps the last logged day until it is fixed.'}) : null,
    el('p', {class: 'note', text: `Data generated ${COST.generated_at} IST. The B-grade register comes from the plant's own costing.xlsx; labour detail by person, beam changes and the planning sheet are not on this tab yet.`})));
  return s;
}

// ---------------------------------------------------------------- Sheet checks (Divyam, 14 Nov 2026; owner only)
// Three cards for the costing day picked. The database returns app_data 'cost_checks' to the owner only (0015); the plant view
// and every other role never get here. Arithmetic: calc.js sheetChecks / sheetPlantVs / sheetMtd. Gaps show "—", never 0.
// Names on screen: "Plant file" (costing.xlsx as uploaded) and "Recomputed" (the corrected costing, COST.days_entered, which the
// "As entered" view shows). Realisation uses Recomputed + the power fix (COST.days), named in a footnote.
const scRecomputed = () => (cHasFix() ? COST.days_entered : COST.days) || [];
const rs2 = (x) => !ok(x) ? '—' : (x < 0 ? '−₹' : '₹') + Math.abs(x).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const scFmt = (v, unit) => !ok(v) ? '—' : unit === 'rs' ? rs2(v) : unit === 'picks' ? f0(v) : v.toFixed(3);
const scDiffCell = (r, unit) => r.state === 'gap' ? el('span', {class: 'pill muted', text: '—'})
  : r.state === 'agree' ? el('span', {class: 'pill good', text: 'agrees'})
  : el('b', {class: 'diffcell', 'data-sort': String(r.d), text: (r.d > 0 ? '+' : '−') + scFmt(Math.abs(r.d), unit).replace('−', '')});
const SC_UNIT = {rs: '₹', picks: 'picks', paise: 'paise'};
function sheetCheckCards(cur) {
  const d = cur.date;
  if (!CCHK) return [card('Sheet checks', `${dfmt(d)} · owner only`, el('p', {class: 'empty', text: `${NA} yet: the sheet checks arrive with the next costing run.`}))];
  const day = (CCHK.days || {})[d] || null;
  const fileNote = !day || !day.plant_read ? `the plant's costing.xlsx for ${dfmt(d)} has not been read yet` : !day.plant ? `no cost statement could be read from the plant's costing.xlsx for ${dfmt(d)}` : '';
  const out = [];
  // (a) the CPP task's checks of the file
  const C = sheetChecks(day && day.checks);
  if (!C) out.push(card('Sheet checks', `${dfmt(d)} · the costing run's checks of the plant's costing.xlsx · owner only`,
    el('p', {class: 'empty', text: `— Not checked: the costing run has not validated the plant's file for ${dfmt(d)} yet.`})));
  else {
    const k = C.counts, sev = {ERROR: ['bad', 'Error'], WARN: ['warn', 'Warning']};
    out.push(card('Sheet checks', `${dfmt(d)} · the costing run's checks of the plant's costing.xlsx · owner only`,
      k ? el('div', {class: 'kpis sc'}, kpiC('New errors', String(k.errors_new), '', `${k.errors - k.errors_new} standing`), kpiC('New warnings', String(k.warnings_new), '', `${k.warnings - k.warnings_new} standing`))
        : el('p', {class: 'err', text: 'The counts could not be read from the checks\' summary; the list below is what the log holds.'}),
      C.rows.length ? table(['Line', 'Where', 'What the file shows'], C.rows.map((f) => [
        el('div', {}, el('b', {text: f.label || '—'}), el('div', {style: 'margin-top:4px;display:flex;gap:4px;flex-wrap:wrap'},
          el('span', {class: 'pill ' + sev[f.sev][0], text: sev[f.sev][1]}), f.status === 'new' ? el('span', {class: 'pill info', text: 'New'}) : el('span', {class: 'pill muted', text: 'Standing'}))),
        [f.sheet, f.cell].filter(Boolean).join(' ') || '—', f.msg]))
        : el('p', {class: 'empty', text: 'No errors or warnings in the plant\'s file for this day.'}),
      C.unlisted ? el('p', {class: 'note', text: `${C.unlisted} more are not listed here; they are in the Validation tab of the month's cost-per-pick log.`}) : null,
      el('p', {class: 'note', text: 'New = first seen in this day\'s file; standing = also in the previous day\'s file. The checks report and never change the plant\'s file.'})));
  }
  // (b) plant vs corrected, line by line
  const rec = scRecomputed().find((x) => x.date === d) || null;
  const V = day && day.plant ? sheetPlantVs(day.plant, rec) : null;
  const fix = COST.pfix && ok(COST.pfix.paise) ? `${pn(COST.pfix.paise, 0)} paise a pick off the POWER line` : 'the POWER correction';
  out.push(card('Plant vs corrected', `${dfmt(d)} · Plant file = costing.xlsx as uploaded · Recomputed = the corrected costing ("As entered" view)`,
    !V ? el('p', {class: 'empty', text: `— ${fileNote || `no recomputed costing for ${dfmt(d)}`}.`})
      : el('div', {}, el('div', {class: 'toolbar'}, el('span', {class: 'pill ' + (V.differ ? 'warn' : 'good'), text: V.differ ? `${V.differ} figure${V.differ === 1 ? '' : 's'} differ` : 'Every figure agrees'}),
          V.gap ? el('span', {class: 'pill muted', text: `${V.gap} not in one of the two`}) : null, el('span', {class: 'note', text: `${V.agree} agree`})),
        table(['Line', 'Figure', 'Plant file', 'Recomputed', 'Difference'], V.rows.map((r) => [r.line === 'COST PER PICK' ? 'COST PER PICK (sheet row, excl. cut piece loss)' : r.line, `${r.fig}${r.unit === 'rs' ? '' : ', ' + SC_UNIT[r.unit]}`, scFmt(r.plant, r.unit), scFmt(r.corr, r.unit), scDiffCell(r, r.unit)]), [2, 3, 4])),
    el('p', {class: 'note', text: `Difference = plant file − recomputed. Day = AMOUNT, Progressive = PROGRESSIVE, Month = TOTAL column. Lines with the same name are added together. COST PER PICK here is the sheet's own row (TOTAL AMOUNT ÷ PICK), without the cut piece loss that the tab's headline cost per pick adds. Realisation and profit use Recomputed with ${fix}, which this card does not compare.`})));
  // (c) month to date, file vs correct
  const M = day && day.plant ? sheetMtd(day.plant, scRecomputed(), d) : null;
  const ttl = 'Month to date: file vs correct', sub = `1–${dfmt(d)} · the plant file's TOTAL column against the sum of the recomputed day amounts`;
  if (!M) out.push(card(ttl, sub, el('p', {class: 'empty', text: `— ${fileNote || 'no plant file for this day'}.`})));
  else {
    const T = M.total;
    const rows = [...M.lines.map((r) => [r.line, rs2(r.file), rs2(r.correct), scDiffCell(r, 'rs')]),
      ...M.gaps.map((r) => [r.line, rs2(r.file), rs2(r.correct), scDiffCell(r, 'rs')]),
      ok(M.rest) && M.rest !== 0 ? [el('i', {text: 'TOTAL AMOUNT itself (not from a line)'}), '', '', scDiffCell({state: 'differ', d: M.rest}, 'rs')] : null,
      el('tr', {}, el('td', {}, el('b', {text: 'Total (TOTAL AMOUNT)'})), el('td', {class: 'num', text: rs2(T.file)}), el('td', {class: 'num', text: rs2(T.correct)}), el('td', {class: 'num'}, scDiffCell(T, 'rs')))].filter(Boolean);
    out.push(card(ttl, sub,
      el('div', {class: 'kpis sc sc4'}, kpiC('File, month total', rs(T.file), '', 'TOTAL AMOUNT, TOTAL column'), kpiC('Correct', rs(T.correct), '', M.missing.length ? 'days missing' : `${M.days} day${M.days === 1 ? '' : 's'} added`),
        kpiC('File minus correct', T.state === 'gap' ? '—' : T.state === 'agree' ? 'agrees' : (T.d > 0 ? '+' : '−') + rs(Math.abs(T.d)).replace('−', ''), '', T.state === 'differ' ? (T.d > 0 ? 'the file shows more' : 'the file shows less') : ''),
        kpiC('Cost per pick, month', pn(M.cpp.file, 2), 'paise', ok(M.cpp.correct) ? `correct ${pn(M.cpp.correct, 2)} · excl. cut piece loss` : 'correct —')),
      M.missing.length ? el('p', {class: 'err', text: `— Correct month to date not worked out: no recomputed costing for ${M.missing.map(dfmt).join(', ')}. A missing day is never counted as zero.`}) : null,
      M.missing.length ? null : (M.lines.length || M.gaps.length || (ok(M.rest) && M.rest !== 0) || T.state === 'differ')
        ? table(['Line', ['File', '₹'], ['Correct', '₹'], 'Difference'], rows, [1, 2, 3])
        : el('p', {class: 'empty', text: 'Every line\'s month total in the file matches the sum of its day amounts.'}),
      el('p', {class: 'note', text: 'Lines responsible: lines whose month total in the file differs from the sum of their day amounts, biggest first. "TOTAL AMOUNT itself" is the part of the difference no line explains: the file\'s TOTAL column does not add up its own lines. A line missing from a day\'s statement counts nothing for that day.'})));
  }
  return out;
}

// ---------------------------------------------------------------- Compressor power: money on the CFM and Pressure tabs
// Power (Compressor) kWh and rupees come from the costing sheet (D.power, from 07 Nov 2026). One compressor serves both widths,
// so the day's kWh is spread over the whole floor's air (all looms, both widths).
let POWER_PCT = 7;   // compressor energy saved per 1 kgf/cm² of pressure; set on the Targets tab
// Cost per pick saved, in paise per pick on the costing basis: rupees saved ÷ picks of the same scope and day, where picks are
// fabric picks ÷ 39.37 (= metres × picks per inch, the costing sheet's PROD PICK), so it compares with the Costing tab's cost per pick.
const cPicks = (L) => L.reduce((a, x) => a + (ok(x.fpicks) ? x.fpicks : (x.picks || 0)), 0) / 39.37;
const floorPicks = (date) => cPicks((D.loomdays || []).filter((x) => x.date === date && x.run > 0));
const ppS = (rupees, picks) => ok(rupees) && picks > 0 ? 100 * rupees / picks : null;
const pzD = (...v) => v.some((x) => ok(x) && x !== 0 && Math.abs(x) < 0.1) ? 3 : 2;
const pz = (x, d) => !ok(x) ? '—' : x.toFixed(d || pzD(x));
const pzR = (a, b) => Math.abs(b - a) < 0.0005 ? pz(a) : `${pz(a, pzD(a, b))}–${pz(b, pzD(a, b))}`;
const ppTxt = (rupees, picks) => { const v = ppS(rupees, picks); return ok(v) ? pz(v) + ' paise/pick' : ''; };
const withPP = (money, rupees, picks) => { const t = ppTxt(rupees, picks); return t ? el('span', {}, money, el('div', {class: 'note', text: t})) : money; };
function compDay(date) {
  const P = (D.power && D.power.days) || {}, ks = Object.keys(P).filter((k) => k <= date).sort();
  const d = ks.pop(); if (!d) return null;
  const L = (D.loomdays || []).filter((x) => x.date === d && x.run > 0), ft3 = L.reduce((a, x) => a + x.cfm * x.run, 0);
  if (!ft3) return null;
  const p = P[d];
  return {date: d, exact: d === date, kwh: p.kwh, rate: p.rate, rupees: p.rupees, ft3, kwhFt3: p.kwh / ft3, rsFt3: p.rupees / ft3, kwhKm3: p.kwh / (ft3 * 0.0283168) * 1000};
}
function compNote(c, date) {
  if (!c) return 'Compressor power (kWh and rupees) arrives with the costing sheet, from 7 Nov 2026. The money figures appear once a day with that line has loom data.';
  return `Uses the compressor's ${f0(c.kwh)} kWh at ₹${f2(c.rate)} a unit on ${dfmt(c.date)}${c.exact ? '' : ` (the latest day with a compressor reading; ${dfmt(date)} is not in the costing sheet yet)`}, spread over the ${f0(c.ft3 / 1000)} thousand ft³ the floor drew. Money figures are for one day and ×30 for a month at that day's level.`;
}
function moneyKpis(c, kwhLo, kwhHi, picks, scope) {
  const rng = (lo, hi, fmt) => Math.abs(hi - lo) < 0.5 * (hi >= 100 ? 1 : 0.05) ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
  const rsLo = kwhLo * c.rate, rsHi = kwhHi * c.rate, pLo = ppS(rsLo, picks), pHi = ppS(rsHi, picks);
  return el('div', {class: 'kpis'},
    kpiC('Energy saved', rng(kwhLo, kwhHi, f0), 'kWh a day', null),
    kpiC('Money saved', rng(rsLo, rsHi, rs), 'a day', null),
    kpiC('Cost per pick saved', ok(pLo) ? pzR(pLo, pHi) : NA, ok(pLo) ? 'paise per pick' : '', ok(pLo) ? `over ${pn(picks / 1e5, 2)} lakh picks, ${scope}` : 'no picks for that day'),
    kpiC('In a month', rng(rsLo * 30, rsHi * 30, rs), '× 30 days', null),
    kpiC('Compressor, that day', rs(c.rupees), '', `${f0(c.kwh)} kWh · ₹${f2(c.rate)} a unit`));
}
function cfmMoneyCard(day, date) {
  const c = compDay(date);
  const body = [];
  if (c && day) {
    const saved = (day.now - day.after) * 1440;
    body.push(moneyKpis(c, saved * c.kwhFt3, saved * c.kwhFt3, day.cpk, `${wLabel()} looms on ${dfmt(date)}`));
    body.push(el('p', {class: 'note', text: `Saved air ${f0(saved)} ft³ a day × ${f2(c.kwhFt3 * 1000)} kWh per 1,000 ft³ (${f1(c.kwhKm3)} kWh per 1,000 m³) × ₹${f2(c.rate)} a unit. Cost per pick saved = rupees saved ÷ the same looms' picks that day, in paise. Picks are fabric picks ÷ 39.37, the costing sheet's basis, so it compares with the Costing tab's cost per pick. In the tables it is per loom or per head group, over that loom's or head group's own picks.`}));
  }
  body.push(el('p', {class: 'note', text: compNote(c, date) + ' Pressure savings are on the Pressure tab and are not added to this.'}));
  if (typeof fxRpmGainNote === 'function') body.push(fxRpmGainNote(date, false));   // R2: realisation gained at benchmark RPM (owner, analysis on)
  return card('What the CFM saving is worth', 'Excess air brought down to the reference, in kWh and rupees', ...body);
}
// Period for the compressor trend line: 7, 14 or 30 days, all days with a reading (default) or the shared "Dates" range.
let CPWPER = 'all';
try { const v = localStorage.getItem('w2-comp-period'); if (['7', '14', '30', 'all', 'range'].includes(v)) CPWPER = v; } catch (e) {}
function compPowerCard() {
  const P = (D.power && D.power.days) || {}, ds = Object.keys(P).sort();
  if (!ds.length) return card('Compressor power', 'from the costing sheet', el('p', {class: 'note', text: compNote(null)}));
  const allRows = ds.map((d) => ({d, c: compDay(d)})).filter((r) => r.c);
  const last = allRows.at(-1);
  const inR = CPWPER === 'range' ? new Set(rngDays(allRows.map((r) => r.d))) : null;
  const rows = CPWPER === 'all' ? allRows : inR ? allRows.filter((r) => inR.has(r.d)) : allRows.slice(-(+CPWPER));
  const b = (v, t) => el('button', {type: 'button', 'aria-pressed': CPWPER === v ? 'true' : 'false', text: t, onclick: () => { CPWPER = v; try { localStorage.setItem('w2-comp-period', v); } catch (e) {} render(); }});
  const bar = allRows.length > 1 ? el('div', {class: 'toolbar perbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Period'}, b('7', '7 days'), b('14', '14 days'), b('30', '30 days'), b('all', 'All days'), b('range', 'Dates')),
    CPWPER === 'range' ? rngCtl(allRows.map((r) => r.d), render) : null, rows.length ? el('span', {class: 'note', text: `${dfmt(rows[0].d)} – ${dfmt(rows.at(-1).d)} · ${rows.length} days`}) : null) : null;
  return card('Compressor power', 'Power (Compressor) from the costing sheet, against the floor\'s air',
    last ? el('div', {class: 'kpis'}, kpiC('Compressor energy', f0(last.c.kwh), 'kWh', dfmt(last.d)), kpiC('Cost', rs(last.c.rupees), '', `₹${f2(last.c.rate)} a unit`), kpiC('Energy per air', f1(last.c.kwhKm3), 'kWh per 1,000 m³', `${f2(last.c.kwhFt3 * 1000)} kWh per 1,000 ft³`), kpiC('Cost per air', rs(last.c.rsFt3 * 1000), 'per 1,000 ft³', null)) : null,
    bar, rows.length > 1 ? lineChart({dates: rows.map((r) => r.d), aria: 'Compressor energy per 1,000 m³ of air', fmt: f1, series: [{name: 'kWh per 1,000 m³', vals: rows.map((r) => r.c.kwhKm3)}]}) : el('p', {class: 'note', text: allRows.length > 1 ? 'Pick a longer period: the line needs two days with a compressor reading.' : 'The trend line starts once a second day with a compressor reading is in.'}));
}
function pressureMoneyCard(floorNow, floorNew, rule, adia) {
  const c = compDay(D.latest);
  const body = [];
  if (c && floorNow > floorNew) {
    body.push(moneyKpis(c, rule * c.kwh, adia * c.kwh, floorPicks(c.date), `all looms, both widths, on ${dfmt(c.date)}`));
    body.push(el('p', {class: 'note', text: `${f1(rule * 100)}–${f1(adia * 100)}% of the compressor's ${f0(c.kwh)} kWh. The low end is the ${POWER_PCT}% per 1 kgf/cm² rule (editable on the Targets tab); the high end is the adiabatic estimate. Cost per pick saved = rupees saved ÷ the whole floor's picks that day (fabric picks ÷ 39.37, the costing sheet's basis), in paise. A pressure saving is a whole-compressor saving, so the tables use the whole floor's picks too.`}));
  } else if (c) body.push(el('p', {class: 'note', text: 'No loom sits above its reference pressure, so there is nothing to save.'}));
  body.push(el('p', {class: 'note', text: compNote(c, D.latest) + ' CFM savings are on the CFM tab and are not added to this: lowering pressure also lowers air use, so the two overlap.'}));
  if (typeof fxRpmGainNote === 'function') body.push(fxRpmGainNote(D.latest, true));   // R2: realisation gained at benchmark RPM, whole floor (owner, analysis on)
  return card('What lowering the pressure is worth', 'Compressor energy at the lower setpoint, in kWh and rupees', ...body);
}
function moneyRange(lo, hi) {
  const c = compDay(D.latest); if (!c) return '—';
  const a = Math.round(lo * c.kwh * c.rate), b = Math.round(hi * c.kwh * c.rate), pk = floorPicks(c.date);
  const pa = ppS(lo * c.kwh * c.rate, pk), pb = ppS(hi * c.kwh * c.rate, pk);
  const money = a === b ? rs(a) : `${rs(a)}–${rs(b)}`;
  if (!ok(pa)) return money;
  return el('span', {}, money, el('div', {class: 'note', text: pzR(pa, pb) + ' paise/pick'}));
}
function setPct(x) { const [a, b] = saving(x.floor, x.without); return `${f1(a * 100)}–${f1(b * 100)}`; }
function setRs(x) { const [a, b] = saving(x.floor, x.without); return moneyRange(a, b); }
// All-trends panel: what the subject's air costs, from the floor's compressor energy per ft³ (days with a compressor reading only)
function compTrendBlock(s, dates) {
  const P = (D.power && D.power.days) || {};
  const ds = dates.filter((d) => P[d]).map((d) => ({d, c: compDay(d)})).filter((r) => r.c && r.c.exact);
  if (!ds.length) return card('Compressor cost of this air', 'from the costing sheet, from 7 Nov 2026', el('p', {class: 'note', text: 'No day in this period has a compressor reading yet.'}));
  const mine = (d) => (D.loomdays || []).filter((x) => x.date === d && x.run > 0 && (s.kind === 'loom' ? x.loom === s.loom : String(x.width) === String(s.w) && x.hg === s.hg));
  const air = ds.map((r) => mine(r.d).reduce((a, x) => a + x.cfm * x.run, 0));
  return card('Compressor cost of this air', 'Whole-floor compressor energy per ft³ × this ' + (s.kind === 'loom' ? 'loom' : 'head group') + '\'s air, per day',
    lineChart({dates: ds.map((r) => r.d), aria: 'Compressor cost of this air per day', fmt: rs, series: [{name: 'Cost of the air (₹ a day)', vals: ds.map((r, i) => air[i] * r.c.rsFt3)}]}),
    lineChart({dates: ds.map((r) => r.d), aria: 'Compressor energy per 1,000 cubic metres', fmt: f1, series: [{name: 'Floor compressor kWh per 1,000 m³', vals: ds.map((r) => r.c.kwhKm3)}]}),
    el('p', {class: 'note', text: 'The compressor is shared, so this is an allocation by air drawn, not a meter on this loom or quality.'}));
}
function compTrendCard() {
  const P = (D.power && D.power.days) || {};
  if (!Object.keys(P).length) return null;
  return compPowerCard();
}
function powerRuleCard() {
  const inp = el('input', {type: 'number', step: '0.5', min: '1', max: '30', value: String(POWER_PCT), 'aria-label': 'Percent of compressor energy saved per 1 kgf/cm²', style: 'width:90px'});
  const msg = el('span', {class: 'meta'});
  const btn = el('button', {class: 'primary', type: 'button', text: 'Save', onclick: async () => {
    const v = parseFloat(inp.value); if (!(v >= 1 && v <= 30)) { msg.className = 'err'; msg.textContent = 'Enter a number from 1 to 30.'; return; }
    btn.disabled = true; msg.className = 'meta'; msg.textContent = 'Saving…';
    try { if (!db) throw new Error('no write access'); await db.collection('targets').doc('power__pct').set({width: 'all', hg: 'all', main: v}); POWER_PCT = v; msg.className = 'saved'; msg.textContent = 'Saved. Applies straight away.'; if (D) setTimeout(render, 600); }
    catch (e) { msg.className = 'err'; msg.textContent = 'Could not save: ' + (e && e.message || 'no write access'); }
    btn.disabled = false;
  }});
  return card('Compressor power rule', 'Used on the Pressure tab',
    el('div', {class: 'toolbar'}, el('label', {text: 'Energy saved per 1 kgf/cm² of lower pressure'}), inp, el('span', {text: '%'}), btn, msg),
    el('p', {class: 'note', text: 'Rule of thumb: about 7% of compressor power per 1 kgf/cm² (about 1 bar) of pressure. Set the figure for your compressor; the Pressure tab uses it for the low end of the saving range, and the adiabatic estimate stays as the high end.'}));
}
// ================================================================ END COSTING TAB
// COSTING-TAB>>
