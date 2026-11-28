// W2 Looms · app/costing.js — The Costing page, B grade and cut pieces, compressor money on the CFM and Pressure tabs.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- Costing page
// ---------------------------------------------------------------- The costing basis (Round B1, Divyam 27 Nov 2026)
// One app-wide switch, "Plant file · Actual", beside the date chip (on Costing, beside the Day list). Actual (the default) =
// COST.days, the POWER line less COST.pfix's paise a pick; Plant file = COST.days_entered, the costing as the plant entered it.
// Kept per email (user_prefs 'basis', like q_period); a new email, or one that never switched, opens on Actual. The plant role
// has no switch and no basis word: its COST.days is its own costing_plant copy (the plant's figures, no days_entered).
// Round B1 moved the cost side (Costing, the Actions cost tiles and Where the saving is); Round B2 the money side (profit, loom
// cost, break-even, folded cost by quality, through fxInput's costing). Corrections and the hourly notification stay on Actual (Q4).
let BASIS = 'actual';
const cHasFix = () => !!(COST && COST.schema >= 2 && Array.isArray(COST.days_entered));
const bSync = () => { BASIS = typeof isPlant === 'function' && !isPlant() && typeof prefGet === 'function' && prefGet('basis') === 'plant' ? 'plant' : 'actual'; return BASIS; };
// The cost side reads the plant's figures: Plant file chosen, or no Actual yet (an old costing file, schema < 2)
const bPlant = () => !isPlant() && (!cHasFix() || BASIS === 'plant');
// Every read of the costing days for a cost figure: the chosen basis (the plant role: its own copy)
const bDays = () => !COST ? [] : (!isPlant() && cHasFix() && BASIS === 'plant' ? COST.days_entered : COST.days) || [];
// The folding readers (folding shortage, each quality's folding %, A-grade folded picks): one set on both bases, so no
// folding figure can move with the switch (design R6; picks, afold, metres, cut and bgrade are the same in both sets)
const foldSrc = () => !COST ? [] : (cHasFix() ? COST.days_entered : COST.days) || [];
const bName = () => isPlant() ? '' : bPlant() ? 'Plant file' : 'Actual';
const bTxt = () => isPlant() ? '' : ' · ' + bName();
const cDays = () => bDays();
// What the two choices mean, from COST.pfix (the Config sheet Settings rows); nothing here holds the rate or the dates
function bTip() {
  if (!cHasFix()) return 'Actual: not available yet. It arrives with the next costing run; the figures are as the plant entered them.';
  const f = COST.pfix || {};
  return `Actual: POWER less ${ok(f.paise) ? pn(f.paise, 0) : 'the correction\'s'} paise a pick${f.from ? ` from ${dfmt(f.from)}${f.to ? ` to ${dfmt(f.to)}` : ''}` : ' every day'} (Config sheet Settings). Plant file: the costing as the plant entered it.`;
}
let BASINFO = false;   // Round C1: the ⓘ note under the switch on a phone, open or shut while the page is open
function basisSeg() {
  if (isPlant() || !COST) return null;   // plant view: its own figures only, no switch (R3)
  const has = cHasFix(), cur = has ? BASIS : 'plant', tip = bTip();
  const b = (v, t) => el('button', {type: 'button', 'aria-pressed': cur === v ? 'true' : 'false', text: t, disabled: v === 'actual' && !has ? true : null,
    onclick: () => { if (cur === v) return; prefSet('basis', v); bSync(); render(); }});
  // Round C1 (Divyam, 28 Nov 2026, audit #20): on a phone the date chip and the switch share one row; the switch's meaning
  // sits behind an ⓘ button (shown on a phone only) and opens under the row on a tap. On a laptop it shows on pointing.
  const note = el('span', {class: 'note onph basnote', id: 'basnote', text: tip, hidden: BASINFO ? null : true});
  const info = el('button', {type: 'button', class: 'basi onph', text: 'ⓘ', 'aria-expanded': BASINFO ? 'true' : 'false', 'aria-controls': 'basnote',
    'aria-label': 'What Plant file and Actual mean', title: 'What Plant file and Actual mean',
    onclick: (e) => { BASINFO = !BASINFO; note.hidden = !BASINFO; e.currentTarget.setAttribute('aria-expanded', BASINFO ? 'true' : 'false'); }});
  return el('div', {class: 'basis', title: tip}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Costing basis: Plant file or Actual'}, b('plant', 'Plant file'), b('actual', 'Actual')), info, note);
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
const perBar = (g) => el('div', {class: 'toolbar perbar stickper'}, perSegC(g), cPer(g) === 'range' ? rngCtl(cDays().map((d) => d.date), render) : null, viewSeg(g, cPeriod(g).length), el('span', {class: 'note', text: periodNote(g)}), cWk(g));
// This week vs last week on each Costing period bar (Round D, Divyam 17 Nov 2026): the group's own headline figure (D2), the
// 7 days to the day picked against the 7 before (D1). Per-pick figures are weighted by picks (the week's rupees ÷ its picks);
// picks, metres and stock are an average a day (D3). An excluded day is not a costing day, so it counts as a missing day.
// The plant view sees the same comparison in its own figures (D4).
const cLinePP = (d) => { const l = d.lines.find((x) => x.n === CLINE); return l ? l.pp : null; };
const cPowPP = (d) => d.power && ok(d.power.amount) && d.picks ? d.power.amount / (d.picks * 1e5) * 100 : null;
const cHgM = (d) => { const h = d.hg.find((x) => x.hg === CHSEL); return h ? h.tm : null; };
const C_WK = {
  cpp: {what: 'Cost per pick', get: (d) => d.cpp, w: (d) => d.picks, unit: 'paise', fmt: (v) => pn(v, 2), better: 'down'},
  types: {what: 'Cost per pick', get: (d) => d.cpp, w: (d) => d.picks, unit: 'paise', fmt: (v) => pn(v, 2), better: 'down'},
  trends: {what: 'Picks a day', get: (d) => d.picks, unit: 'lakh picks', fmt: (v) => pn(v, 1), better: 'up'},
  line: {what: () => `${CLINE}, paise per pick`, get: cLinePP, w: (d) => d.picks, unit: 'paise', fmt: (v) => pn(v, 2), better: 'down'},
  power: {what: 'Power cost per pick', get: cPowPP, w: (d) => d.picks, unit: 'paise', fmt: (v) => pn(v, 2), better: 'down'},
  labour: {what: 'Labour cost per pick', get: (d) => d.labour ? d.labour.per_pick : null, w: (d) => d.picks, unit: 'paise', fmt: (v) => pn(v, 2), better: 'down'},
  hg: {what: () => `${CHSEL}, metres a day`, get: cHgM, unit: 'm', fmt: f0, better: 'up'},
  stock: {what: 'Closing stock, average a day', get: (d) => d.stock ? d.stock.closing : null, unit: 'm', fmt: f0, better: null}};
function cWk(g) {
  const s = C_WK[g], cur = cDay(); if (!s || !cur) return null;
  return wkPill(wkMean(cDays(), cur.date, s.get, s.w, s.better), {...s, what: typeof s.what === 'function' ? s.what() : s.what});
}

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
// Round C2a (audit #29): each spec's period average over every day of P (calc.js perAvg; s.per: false for a running line), the
// same on Daily and Weekly. o.extra: specs worked the same way, read in the details bar only (a panel drawn under this one).
function dayChart(g, P, pre, o, specs, defaults) {
  const wk = cWeekly(g, P.length), long = P.length > LONGP;
  specs = specs.map((s, i) => ({...s, key: s.key || 's' + i, color: s.color || ccAt(i), per: perAvg(P, s)}));
  const exOf = (vals) => (o.extra || []).map((x) => ({...x, vals: vals(x)}));
  if (wk) {
    const Bk = weekBuckets(P);
    o = {...o, extra: exOf((x) => Bk.map((L) => aggDays(L, x)))};
    const tips = Bk.map((L) => `${shortRange(L[0].date, L[L.length - 1].date)}${L.length < 7 ? ` (${L.length} day${L.length === 1 ? '' : 's'})` : ''}`);
    return lineChart({...o, id: o.id ? o.id + ':w' : undefined, dates: Bk.map((L) => L[0].date), xlabels: Bk.map((L) => shortRange(L[0].date, L[L.length - 1].date)), tips,
      pickDates: Bk.map((L) => L[L.length - 1].date), defaults, pan: PAN, px: true, series: specs.map((s) => ({...s, vals: Bk.map((L) => aggDays(L, s))}))});
  }
  o = {...o, extra: exOf((x) => P.map((d) => x.get(d)))};
  const series = specs.map((s) => ({...s, vals: P.map((d) => s.get(d))}));
  if (long) {
    const all = [...(pre || []), ...P], off = (pre || []).length;
    for (const s of specs) if (s.avg || (s.avg !== false && specs.length === 1)) {
      series.push({key: s.key + '-7', avgOf: s.key, per: null, name: specs.length === 1 ? '7-day average' : `${s.name}, 7-day average`, color: s.color,
        vals: P.map((d, i) => aggDays(all.slice(Math.max(0, off + i - 6), off + i + 1), s, true))});
    }
  }
  return lineChart({...o, dates: P.map((d) => d.date), defaults, pan: PAN, series});
}
// Round C2a (Divyam, 28 Nov 2026, audit #3): two panels on one date axis. Top: specs as lines, the axis fitted to the lines
// shown (o.fit), a day with no figure a break in each line, the gap between the two lines o.shade names shaded green where the
// first is above, red where below. Bottom: one spec (bot) as bars either side of 0, green at or above, red below, on its own
// axis from 0 and its own period average. The two scroll together; the top's details bar reads the bottom's figure too ("—" on
// a day with none). Both on the same period and Daily / Weekly choice (g).
function twinDay(g, P, pre, o, specs, defaults, bot) {
  const sync = 'tw:' + o.id, top = dayChart(g, P, pre, {...o, fit: true, breaks: true, sync, padL: 26, padX: 16, extra: [bot]}, specs, defaults);
  const tid = cWeekly(g, P.length) ? o.id + ':w' : o.id, pavg = !TOGS[tid] || TOGS[tid].has(PAVG);
  const low = dayChart(g, P, pre, {...o, id: o.id + '-b', aria: bot.aria || bot.name, plain: true, zero: true, fit: false, breaks: false, shade: null, marks: null,
    sync, padL: 26, padX: 16, barPad: true, nobar: true, noread: true, pavg, h: 160}, [{...bot, bars: true, avg: false}]);
  return el('div', {class: 'twin'}, top, el('h4', {class: 'trh twinh', text: bot.head || bot.name}), low);
}
// The days just before a period (for 7-day averages), from the same day list.
const preOf = (L, P) => { if (!P.length) return []; const i = L.findIndex((d) => d.date === P[0].date); return i > 0 ? L.slice(Math.max(0, i - 6), i) : []; };

// Why cost per pick moved, against a basis picked on the card (16 Nov 2026, Divyam): V yesterday, V yesterday avg (the month's
// average day up to the day before, the default), V running avg (the month's average day, every costing day so far) or a
// selected date. calc.js bridgeBasis picks the reference and cppBridge works the bridge (costing.py bridge(), so against
// yesterday it is the pipeline's own daily bridge). Averages are picks-weighted. "All other" is the change less the bars
// shown, so the chart closes on the day's figure exactly. Same card in plant view, on its own as-entered figures.
let BMODE = 'mtd', BPICK = '';
// Divyam's names on a laptop; plain words on a phone, where a "V" shorthand is easy to misread (fresh-eyes review, 16 Nov).
const BMODES = [['prev', 'V yesterday', 'Yesterday'], ['mtd', 'V yesterday avg', 'Avg till yesterday'], ['month', 'V running avg', 'Month avg'], ['date', 'Select date', 'Date']];
function moveCard(cur) {
  const D = cDays(), ttl = 'Why cost per pick moved';
  if (BMODE === 'date' && (!BPICK || BPICK === cur.date || !D.some((d) => d.date === BPICK))) {
    const i = D.findIndex((d) => d.date === cur.date); BPICK = (D[i - 1] || D[i + 1] || {}).date || '';
  }
  const seg = el('div', {class: 'seg bseg', role: 'group', 'aria-label': 'Compare with'}, BMODES.map(([v, t, sh]) => el('button', {type: 'button', 'aria-pressed': BMODE === v ? 'true' : 'false', 'aria-label': t, title: t, onclick: () => { BMODE = v; render(); }},
    el('span', {class: 'lgl', text: t}), el('span', {class: 'sml', text: sh}))));
  let pickSel = null;
  const others = D.filter((d) => d.date !== cur.date);
  if (BMODE === 'date' && others.length) {
    pickSel = el('select', {id: 'bpick', 'aria-label': 'Compare with the costing day'}, D.filter((d) => d.date !== cur.date).slice().reverse().map((d) => el('option', {value: d.date, text: dfmt(d.date), selected: d.date === BPICK ? true : null})));
    pickSel.addEventListener('change', () => { BPICK = pickSel.value; render(); });
  }
  const bar = el('div', {class: 'toolbar'}, el('span', {class: 'note', text: 'Compare with'}), seg, pickSel);
  const B = bridgeBasis(D, cur.date, BMODE, BPICK), mon = monthName(cur.date);
  if (!B.ref) {
    // Every empty state says what to do next (16 Nov, fresh-eyes review). The buttons are named as they read on this screen:
    // the laptop label, or the phone label below 560 px (.nm in style.css).
    const nm = (v) => { const b = BMODES.find((x) => x[0] === v); return el('span', {class: 'nm'}, el('b', {class: 'lgl', text: b[1]}), el('b', {class: 'sml', text: b[2]})); };
    const hasPrev = D.some((d) => d.date < cur.date), opts = [];
    if (hasPrev && BMODE !== 'prev') opts.push(nm('prev'));
    if (others.length && BMODE !== 'date') opts.push(nm('date'));
    const next = opts.length ? ['Pick ', ...opts.flatMap((o, i) => (i ? [' or ', o] : [o])), ' to compare with another costing day, or wait for the next costing day.'] : ['Wait for the next costing day to be uploaded.'];
    const why = {first: 'This is the first costing day on record, so there is no previous day to compare with.',
      'month-first': `${dfmt(cur.date)} is ${mon}'s first costing day, so there is no earlier day this month to average.`,
      'month-only': `${dfmt(cur.date)} is ${mon}'s only costing day so far, so the running average is this day itself.`,
      pick: others.length ? 'Pick a costing day to compare with.' : 'There is no other costing day to compare with yet.', same: 'Pick a different day to compare with.'}[B.why] || NA + '.';
    const more = B.why === 'pick' && others.length || B.why === 'same' ? [] : [' ', ...next];
    return card(ttl, `paise per pick${bTxt()}`, bar, el('p', {class: 'scopenote'}, why, ...more));
  }
  const m = cppBridge(B.ref, cur);
  const avg = BMODE === 'mtd' || BMODE === 'month';
  const span = avg ? `${shortRange(B.from, B.to)}, ${B.n} costing day${B.n === 1 ? '' : 's'}` : '';
  const refName = avg ? (BMODE === 'mtd' ? `the average day of ${span}` : `${mon}'s running average (${span})`) : dfmt(B.label);
  const refShort = avg ? `Avg ${shortRange(B.from, B.to)}` : dfmt(B.label);
  const top = m.lines.filter((l) => Math.abs(l.e) >= 0.005).slice(0, 5), rest = m.lines.filter((l) => !top.includes(l));
  const restE0 = (m.now_cpp - m.prev_cpp) - m.volume - top.reduce((a, l) => a + l.e, 0), restD = rest.reduce((a, l) => a + l.d, 0);
  // shown to 2 decimals and balanced, so the figures on screen add up to the change shown
  const Rb = balanced([m.volume, ...top.map((l) => l.e), restE0]), volE = Rb[0], topE = Rb.slice(1, -1), restE = Rb.at(-1);
  if (typeof wkPut === 'function') wkPut('J7', {ref: refName, prev: m.prev_cpp, date: dfmt(cur.date), parts: [{n: 'Volume', e: volE}, ...top.map((l, i) => ({n: l.n, e: topE[i]})), {n: 'All other', e: restE}]});   // Round J
  const steps = [{label: refShort, v: m.prev_cpp, total: true}, {label: 'Volume', v: volE}, ...top.map((l, i) => ({label: l.n, v: topE[i]})), {label: 'All other', v: restE}, {label: dfmt(cur.date), v: m.now_cpp, total: true}];
  const typeOf = (n) => { if (n === 'CUT PIECE LOSS') return 'Quality loss'; const l = cur.lines.find((x) => x.n === n); return l ? COST.types[l.t] : '—'; };
  const rows = [[el('b', {text: 'Volume'}), `Picks ${pn(m.picks0, 2)} → ${pn(m.picks1, 2)} lakh (${sg((m.picks1 / m.picks0 - 1) * 100, 1)}%)`, sg(volE), 'Fixed cost spread over more or fewer picks'],
    ...top.map((l, i) => [l.n, (l.d >= 0 ? '+' : '−') + rs(Math.abs(l.d)).replace('−', ''), sg(topE[i]), typeOf(l.n)]),
    ['All other lines', `${rest.length} lines, ${restD >= 0 ? '+' : '−'}${rs(Math.abs(restD)).replace('−', '')}`, sg(restE), ''],
    [el('b', {text: 'Total'}), '', el('b', {text: sg(Rb.reduce((a, v) => a + v, 0))}), `${pn(m.prev_cpp, 2)} → ${pn(m.now_cpp, 2)} paise`]];
  const vs = m.vol_split, who = avg ? 'the average day' : dfmt(B.label);
  const sw = (c, t, o) => el('span', {class: 'lg'}, el('i', {style: `display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:${c}${o ? ';opacity:.75' : ''}`}), t);
  return card(ttl, `${refName} → ${dfmt(cur.date)} · paise per pick${bTxt()}`, bar,
    waterfall(steps, `Bridge of cost per pick from ${refName} to ${dfmt(cur.date)}`),
    el('div', {class: 'legend'}, sw('var(--bad)', 'pushed cost per pick up'), sw('var(--good)', 'pulled it down'), sw('var(--muted-2)', avg ? 'average and day totals' : 'day totals', true)),
    (() => { const t = table(['Driver', ['Change', `₹ vs ${avg ? 'the average day' : dfmt(B.label)}`], ['Effect', 'paise per pick'], 'Type'], rows, [2]); t.classList.add('bridge'); return t; })(),
    el('p', {class: 'note', text: `The effects add up exactly to the change (each shown to 2 decimals, rounded so the figures shown add up too). Volume is what ${who}'s total cost would have been per pick at ${dfmt(cur.date)}'s picks; each line is its change in rupees divided by ${dfmt(cur.date)}'s picks.${avg ? ` The average day is each line's rupees, the cut piece loss and the picks averaged over ${span}, so its cost per pick is the picks-weighted average: total cost ÷ total picks over those days.${BMODE === 'month' ? ` It includes ${dfmt(cur.date)} and every costing day of ${mon} uploaded so far.` : ''}` : ''}`}),
    vs ? el('p', {class: 'scopenote', text: `Volume, in two parts: looms running ${pn(vs.looms0, 2)} → ${pn(vs.looms1, 2)} accounts for ${sg(vs.picks_looms, 2)} lakh picks, and picks per running loom ${f0(vs.ppl0)} → ${f0(vs.ppl1)} for ${sg(vs.picks_perloom, 2)} lakh. Together ${sg(vs.picks_change, 2)} lakh${Math.abs(vs.picks_change) > 0.005 ? `, so ${Math.round(Math.abs(vs.picks_looms / vs.picks_change) * 100)}% of the change in picks came from the number of looms running` : ''}.`}) : null);
}
// Cost per pick split by cost type, day by day (weekly on request): fixed per day, follows attendance, follows output, lumpy,
// and the cut-piece loss, as stacked bars that add up to the headline cost per pick (the dashed mark). Legend highlights a type.
// Round C1 (audit #1): the chart palette's slots (style.css --c1…--c6); cut-piece loss is the cut pieces' slot on every chart
const CT_COLS = {fixed: 'var(--c1)', attendance: 'var(--c2)', output: 'var(--c3)', lumpy: 'var(--c4)', cut: CSL.cut};   // cut pieces: magenta, never a green-looking slot (a loss)
function costTypeCard() {
  const P = cPeriod('types'), wk = cWeekly('types', P.length);
  const Bk = wk ? weekBuckets(P) : P.map((d) => [d]);
  const T = Bk.map((L) => costTypesOf(L));
  const names = {...COST.types, cut: 'Cut-piece loss'};
  const layers = [...COST_TYPES, 'cut'].map((k) => ({name: names[k] || k, color: CT_COLS[k], vals: T.map((t) => t ? t[k] : null)}));
  const line = {name: 'Cost per pick', color: 'var(--ink)', vals: Bk.map((L) => aggDays(L, {get: (d) => d.cpp, agg: 'w', w: (d) => d.picks}))};
  const last = T.at(-1);
  return card('Cost per pick by cost type', `paise per pick${bTxt()}${wk ? ' · week by week' : ''}`, perBar('types'),
    P.length ? hlStack({dates: Bk.map((L) => L[0].date), xlabels: wk ? Bk.map((L) => shortRange(L[0].date, L.at(-1).date)) : null, tips: wk ? Bk.map((L) => shortRange(L[0].date, L.at(-1).date)) : null,
      pickDates: Bk.map((L) => L.at(-1).date), layers, line, h: 280, fmt: (v) => pn(v, 2), aria: 'Cost per pick by cost type', onPick: pickDay}, 'cost-types',
      [el('span', {class: 'lg'}, el('i', {style: 'display:inline-block;width:14px;border-top:2px dashed var(--ink)'}), 'cost per pick (the figure on top of each bar)')]) : el('div', {class: 'empty', text: NA + ' for this period.'}),
    last ? el('p', {class: 'note', text: `${wk ? 'Last week' : dfmt(P.at(-1).date)}: ${[...COST_TYPES, 'cut'].map((k) => `${(names[k] || k).toLowerCase()} ${pn(last[k], 2)}`).join(', ')} = ${pn(last.sum, 2)} paise. Each line is tagged once, as in "Fixed against variable cost"; a type's layer is its lines' rupees ÷ picks. Fixed lines move cost per pick only through volume, so a taller purple block on a low-picks day is volume, not spending. Hover any block for its figure; click a cost type in the legend to highlight it; click a bar to open the day.`}) : null);
}

// ---------------------------------------------------------------- B grade and cut pieces (from November)
// Plant level from the costing (the same on both bases: B GRADE and CUT PIECE REV LOSS lines, folding metres, A-grade folded picks);
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
  if (typeof wkPut === 'function') wkPut('J17', A && day ? {date: dfmt(day.date), af: day.afold, bl: A.bl, cl: A.cl, bm: A.bm, fm: A.fm} : null);   // Round J
  const na = (v, f) => ok(v) ? f(v) : NA;
  const pLabel = BGPER === 'mtd' ? 'Month to date' : BGPER === 'all' ? 'All days' : BGPER === 'range' ? 'Selected dates' : `${BGPER} days`;
  const seg = el('div', {class: 'seg', role: 'group', 'aria-label': 'B grade period'}, [[7, '7 days'], [14, '14 days'], ['mtd', 'Month to date'], ['all', 'All days'], ['range', 'Dates']].map(([v, t]) =>
    el('button', {type: 'button', 'aria-pressed': BGPER === v ? 'true' : 'false', text: t, onclick: () => { BGPER = v; render(); }})));
  const span = PB.length ? `${dfmt(PB[0].date)} – ${dfmt(PB[PB.length - 1].date)} · ${PB.length} day${PB.length === 1 ? '' : 's'}` : NA;
  const out = el('div', {class: 'stack'});
  out.append(el('h3', {class: 'sechead', text: 'B grade and cut pieces'}), el('div', {class: 'toolbar stickper'}, seg, BGPER === 'range' ? rngCtl(bq.days.map((d) => d.date), render) : null, viewSeg('bq', PB.length), el('span', {class: 'note', text: span}),
    wkPill(wkMean(bq.days, cur.date, (d) => ok(d.bgrade_m) && d.folded_m > 0 ? 100 * d.bgrade_m / d.folded_m : null, (d) => d.folded_m, 'down'),
      {what: 'B grade, share of folded metres', fmt: (v) => v.toFixed(2), unit: '%', dunit: 'points'})));   // Round D: Σ B grade m ÷ Σ folded m, each week

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
      {key: 'b', name: 'B grade', ...bs('bp'), color: CSL.bgrade, avg: true}, {key: 'c', name: 'Cut pieces', ...bs('cpp'), color: CSL.cut, avg: true}, {key: 't', name: 'Together', ...bs('tp'), color: 'var(--muted)', dash: true, avg: true}], ['b', 'c'])),
    card('Quality loss and volume', bWk ? 'week by week · ₹ figures are an average a day' : 'day by day', dayChart('bq', PB, bqPre, {id: 'bq-v', aria: 'Quality loss and volume', fmt: (v) => pn(v, 2), onPick: pickDay}, [
      {key: 'pf', name: 'B grade, % of folded', ...bs('pctF'), color: CSL.bgrade, dash: true},
      {key: 'cpf', name: 'Cut pieces, % of folded', ...bs('cpf'), color: CSL.cut, dash: true},
      {key: 'tpf', name: 'B grade + cut pieces, % of folded', ...bs('tpf'), color: 'var(--muted)', dash: true},
      {key: 'bl', name: 'B grade loss (₹ thousand)', ...bs('bl', 1000), color: CSL.bgrade, avg: true},
      {key: 'cl', name: 'Cut-piece loss (₹ thousand)', ...bs('cl', 1000), color: CSL.cut, avg: true},
      {key: 'tl', name: 'B grade + cut-piece loss (₹ thousand)', ...bs('tl', 1000), color: 'var(--muted)'}], ['bl', 'cl']))));

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
  if (typeof wkPut === 'function') wkPut('J18', hgR[0] && hgR[0].prod ? {hg: hgR[0].hg, m: hgR[0].m, prod: hgR[0].prod} : null);   // Round J
  // Round C2a (Divyam, 28 Nov 2026, audit #40): ranked bars of the B grade share above the table, the rupee impact beside each
  // (calc.js bgHgBars); a head group with no produced metres on register days has no share: named, not drawn
  const BGB = bgHgBars(hgR);
  out.append(card('B grade by head group', `${span} · ranked by B grade as a share of the head group's produced metres`,
    BGB.bars.length ? hbars(BGB.bars.map((g) => ({label: g.hg, v: g.pct, rs: g.rs, color: CSL.bgrade, onClick: () => goBgLoom(g.hg),
      text: `${g.pct.toFixed(2)}% · ${ok(g.rs) ? rs(g.rs) : '₹ —'}`, title: `${g.hg}: ${g.pct.toFixed(2)}% of its produced metres · ${f0(g.m)} m B grade · rupee impact ${ok(g.rs) ? rs(g.rs) : '— (no B grade rate for it in the plant\'s B.LOSS table)'}${g.miss ? ` (${g.miss} entr${g.miss === 1 ? 'y' : 'ies'} unvalued)` : ''}. Tap for its looms.`})),
      {aria: 'B grade share by head group', axis: 'B grade, % of produced metres', fmt: (v) => v.toFixed(2) + '%', labelW: 150, wideText: true, nameLabel: 'Head group', sortLabel: 'B grade share', sortId: 'cost-bghg',
        sortBases: [{v: 'rs', label: 'Rupee impact', get: (r) => ok(r.rs) ? r.rs : null}]}) : null,
    BGB.out.length ? el('p', {class: 'note', text: `Not drawn, no produced metres on the register days: ${BGB.out.join(', ')}. Next: check the head group in Production by quality head group.`}) : null,
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
  const lwCard = card('Loom-wise B grade', `${BGHG || NA} · ${span}`,
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
  out.append(card('B-grade reasons', `${span} · grouped from the register's remarks`,
    cr.length ? hbars(cr.map((o) => ({label: o.c, v: o.m, color: 'var(--bar)', text: `${f0(o.m)} m · ${totB ? (100 * o.m / totB).toFixed(0) + '%' : NA}`,
      title: `${o.c}: named on ${o.n} entr${o.n === 1 ? 'y' : 'ies'} covering ${f0(o.m)} m, ${totB ? (100 * o.m / totB).toFixed(1) + '%' : NA} of the ${f0(totB)} m of B grade`})),
      {aria: 'B-grade reasons, metres', axis: 'B-grade metres where the reason is named', fmt: f0, labelW: 140, nameLabel: 'Reason', sortLabel: 'B-grade metres where named'}) : null,
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
  // ---- header and the Day list
  const sel = el('select', {id: 'cday', 'aria-label': 'Costing day'}, D0.slice().reverse().map((d) => el('option', {value: d.date, text: (d.date === last.date ? 'Latest · ' : '') + dfmt(d.date), selected: d.date === cur.date ? true : null})));
  sel.addEventListener('change', () => { CDATE = sel.value === last.date ? '' : sel.value; render(); });
  s.append(el('div', {}, el('h2', {text: `Costing, ${dfmt(cur.date)}${bTxt()}`}),   // Round B1: the heading names the basis for the tiles under it
    el('p', {class: 'lead', text: isPlant() ? 'Why cost per pick moved, what the plant produced by quality head group, and the lines that drive cost, from the plant\'s costing file. Click any point on a chart to open that day.' : `Why cost per pick moved, what the plant produced by quality head group, and the lines that drive cost. Built from Unit 2\'s costing on the basis chosen at the top (Actual or Plant file). It runs on its own and is not reconciled with the loom tabs: metres, picks and looms running can differ, because this tab uses the plant\'s production block and the loom tabs use the Toyota reports. Click any point on a chart to open that day.`})));
  s.append(el('div', {class: 'toolbar cdayrow'}, el('label', {for: 'cday', text: 'Day'}), sel,   // Round C1 (#20): on a phone the Day list and the switch share the first row
    el('span', {class: 'pill lime', text: `Costing: up to ${dfmt(last.date)}`}), D && !isPlant() ? el('span', {class: 'pill muted', text: `Looms: up to ${dfmt(D.latest)}`}) : null,
    cur.date !== last.date ? el('button', {class: 'ghost', type: 'button', text: 'Back to latest', onclick: () => { CDATE = ''; render(); }}) : null, basisSeg()));
  // Round B1: no Power units switch here any more; the app-wide basis switch sits in the Day row above
  if (!isPlant() && !bPlant() && COST.pfix && COST.pfix.below && COST.pfix.below.length) s.append(el('p', {class: 'note', text: `On ${COST.pfix.below.length} day${COST.pfix.below.length === 1 ? '' : 's'} the Actual POWER units fall below the compressor's own units: check the plant's entry (${COST.pfix.below.slice(-3).map(dfmt).join(', ')}).`}));
  const un = (COST.unassigned || []).filter((u) => !assigned[u.style] && !(D.unassigned || []).some((x) => x.style === u.style));
  if (un.length && !isPlant()) s.append(assignCard(un.map((u) => ({...u, looms: [], run_h: null, costing: true}))));

  // ---- headline numbers
  const b = cur.bridge, pk = prev ? (cur.picks / prev.picks - 1) : null;
  if (typeof wkPut === 'function') {   // Round J: the figures the tiles and cards below are drawn with, for their Working
    const bg = cur.bgrade || {};
    wkPut('J1', {total: cur.total, cut: cur.cut, picks: cur.picks}); wkPut('J2', {fcpp: cur.fcpp, afold: cur.afold, cut: cur.cut, bl: bg.loss, brev: bg.rev});
    wkPut('J3:picks', {picks: cur.picks, prev: prev && prev.picks, prevDate: prev && dfmt(prev.date)}); wkPut('J3:total', {total: cur.total}); wkPut('J3:m', {metres: cur.metres, picks: cur.picks, looms: cur.looms});
    wkPut('J4', {fixed: cur.fixed_amt, total: cur.total}); wkPut('J5', {amount: cur.mtd.amount, cut: cur.mtd.cut || 0, picks: cur.mtd.picks, days: cur.mtd.days});
    wkPut('J6', cur.ly ? {ly: cur.ly.cpp, lyDate: dfmt(cur.ly.date), cpp: cur.cpp} : null);
    const T = {}; for (const l of cur.lines) T[l.t] = (T[l.t] || 0) + l.a;
    wkPut('J9', {types: ['fixed', 'attendance', 'output', 'lumpy'].filter((t) => t in T).map((t) => ({name: COST.types[t] || t, a: T[t]})), cut: cur.cut, picks: cur.picks});
    wkPut('J10', {date: dfmt(cur.date), fixed: cur.fixed_amt, picks: cur.picks});
    wkPut('J12', cur.power ? {units: cur.power.units, amount: cur.power.amount, picks: cur.picks} : null);
    wkPut('J13', cur.labour ? {cost: cur.labour.cost, picks: cur.picks, looms: cur.looms} : null);
    wkPut('J15', cur.stock ? {closing: cur.stock.closing, produced: cur.stock.produced, dispatch: cur.stock.dispatch} : null);
  }
  s.append(el('div', {class: 'kpis'},
    kpiC('Cost per pick (incl. cut piece loss)', pn(cur.cpp, 2), 'paise', dlt(cur.cpp, prev && prev.cpp, false, (x) => x.toFixed(2), ' paise')),
    kpiC('Folded cost per pick', pn(cur.fcpp, 2), 'paise', dlt(cur.fcpp, prev && prev.fcpp, false, (x) => x.toFixed(2), ' paise')),
    kpiC('Picks', pn(cur.picks, 2), 'lakh', ok(pk) ? el('span', {class: 'delta ' + (pk >= 0 ? 'up-good' : 'up-bad'), text: `${pk >= 0 ? '▲ +' : '▼ −'}${Math.abs(pk * 100).toFixed(1)}% vs previous day`}) : null),
    kpiC('Total cost', rs(cur.total), '', dlt(cur.total, prev && prev.total, false, rs)),
    kpiC('Metres produced', f0(cur.metres), 'm', `${pn(cur.looms, 1)} looms running · ${f0(cur.ppl)} picks per loom`),
    kpiC('Fixed per day', pc(cur.fixed_share), '', `${rs(cur.fixed_amt)} of the day's cost does not change with output`),
    kpiC('Month to date', pn(cur.mtd.cpp, 2), 'paise', `folded ${pn(cur.mtd.fcpp, 2)}`),
    kpiC('Same day last month', cur.ly ? pn(cur.ly.cpp, 2) : NA, cur.ly ? 'paise' : '', cur.ly ? `${dfmt(cur.ly.date)} · ${sg(cur.cpp - cur.ly.cpp)} paise now` : (cur.date.slice(0, 7) === COST_FROM.slice(0, 7) ? 'no data until 1 Dec: this tab starts on 1 Nov' : 'no costing day for that date'))));

  // ---- Sheet checks (owner only, 14 Nov 2026): the CPP task's checks of the plant's file, plant file vs recomputed, month to date
  if (!isPlant() && typeof fxIsOwner === 'function' && fxIsOwner()) s.append(...sheetCheckCards(cur));

  // ---- 1. why cost per pick moved, against the basis picked on the card
  s.append(moveCard(cur));
  if (b) {
    // folded
    const fb = b.folded;
    if (fb && typeof wkPut === 'function') wkPut('J8', {prev: fb.prev, folding: fb.folding, opex: fb.opex, bgrade: fb.bgrade, cut: fb.cut, prevDate: dfmt(b.prev_date), date: dfmt(cur.date)});   // Round J
    // Round C2a (Divyam, 28 Nov 2026, audit #41): the same steps as a bridge above the table (a cost going up red, down green);
    // a step with no figure keeps its place with "—"
    const FB = fb ? foldBridge(fb, dfmt(b.prev_date), dfmt(cur.date)) : null;
    if (fb) s.append(card('Folded cost per pick', `Cost of A-grade folded picks: OPEX, net B grade and cut-piece loss, over picks folded${bTxt()}`,
      FB ? waterfall(FB, 'Folded cost per pick, step by step from the previous costing day', null, {dec: 2}) : null,
      el('div', {class: 'nosort'}, table(['Step', ['Effect', 'paise per pick']], [[dfmt(b.prev_date), pn(fb.prev, 2)], ['Picks folded (timing of folding)', sg(fb.folding)], ['OPEX', sg(fb.opex)], ['Net B grade', ok(fb.bgrade) ? sg(fb.bgrade) : el('span', {class: 'note', text: 'bgrade' in fb ? '— the costing file has no B grade loss or revenue on one of the two days, so this card leaves it out. Next: ' + (isAdmin() ? 'see Files per day on Data health' : 'tell the owner') : '— until the next daily run (it runs every hour, 10:40 to 16:40 IST)'})], ['Cut-piece loss', sg(fb.cut)], [dfmt(cur.date), el('b', {text: pn(fb.now, 2)})]], [1])),   // a bridge from one day to the next: its steps are not a list to sort
      el('p', {class: 'note', text: `${f0(fb.folded_m)} m were folded against ${f0(fb.produced_m)} m produced, so folded cost per pick can move the other way from cost per pick on a day when folding runs ahead of or behind production.`})));
  }

  // ---- 2. fixed against variable
  // Round C2a (Divyam, 28 Nov 2026, audit #30): one segmented bar of the cost types above the table (calc.js costTypeSplit, the
  // table's own figures): each part its paise per pick and share of the day's cost
  const CTS = costTypeSplit(cur.lines, cur.total, cur.picks), ctSum = CTS.reduce((a, o) => a + (ok(o.pp) ? o.pp : 0), 0);
  const spikes = cur.lines.filter((l) => l.spike), newL = cur.lines.filter((l) => l.new);
  s.append(card('Fixed against variable cost', `${dfmt(cur.date)} · each line is tagged once${bTxt()}`,
    segBar(CTS.map((o) => ({label: COST.types[o.t] || o.t, v: o.pp, color: CT_COLS[o.t] || 'var(--muted)', text: `${pn(o.pp, 2)} paise · ${pc(o.share)}`})),
      {aria: 'The day\'s cost per pick split by cost type', total: `${pn(ctSum, 2)} paise a pick before the cut piece loss`, empty: 'No expense line on this day. Next: see Files per day on Data health.'}),
    table(['Type', ['Amount', '₹'], ['Share', '% of cost'], ['Per pick', 'paise'], 'Largest lines'],
      CTS.map((o) => [COST.types[o.t], rs(o.a), pc(o.share), pn(o.pp, 2), o.lines.slice(0, 3).map((l) => `${l.n} ${rs(l.a)}`).join(' · ')]), [1, 2, 3]),
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
  s.append(card('Cost per pick', `paise, incl. cut piece loss${bTxt()}`, perBar('cpp'),
    dayChart('cpp', M, mPre, {id: 'cpp', w: Math.round(Math.max(340, Math.min(1000, (document.documentElement.clientWidth || 1000) - (document.documentElement.clientWidth >= 1024 ? 300 : 64)))), h: (document.documentElement.clientWidth || 1000) < 700 ? 260 : 280, aria: 'Cost per pick', fmt: (v) => pn(v, 1), onPick}, [
      {key: 'cpp', name: 'Cost per pick', get: (d) => d.cpp, agg: 'w', w: wPk, color: CSL.cpp, avg: true},
      {key: 'fcpp', name: 'Folded', get: (d) => d.fcpp, agg: 'w', w: wFpk, color: CSL.fcpp, dash: true, avg: true},
      {key: 'mtd', name: 'Month-to-date cost per pick', get: (d) => d.mtd.cpp, agg: 'last', color: 'var(--muted)', dash: true, avg: false, per: false},
      {key: 'mtdf', name: 'Month-to-date folded', get: (d) => d.mtd.fcpp, agg: 'last', color: CSL.mtdf, dash: true, avg: false, per: false},
      {key: 'ly', name: 'Same day last month', get: (d) => d.ly ? d.ly.cpp : null, agg: 'w', w: (d) => d.ly ? d.ly.picks : null, color: CSL.ly, off: lyOff, avg: false}], ['cpp', 'fcpp'])));
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
  if (typeof wkPut === 'function') wkPut('J11', {date: dfmt(cur.date), n: CLINE, a: lv(cur, 'a'), picks: cur.picks});   // Round J
  s.append(card('Any single expense line', `Day amount and paise per pick${CLINE === 'POWER' ? bTxt() : ''}`, el('div', {class: 'toolbar'}, el('label', {for: 'clfind', text: 'Line'}), lfind, lsel, lmsg), perBar('line'),
    el('div', {class: 'trgrid'}, el('div', {}, el('h4', {class: 'trh', text: cWeekly('line', PLn.length) ? '₹ a day, average of the week' : '₹ a day'}), dayChart('line', PLn, lnPre, {aria: CLINE + ' amount', fmt: (v) => rs(v), onPick}, [{name: CLINE + (cWeekly('line', PLn.length) ? ' (₹, average a day)' : ' (₹)'), get: (d) => lv(d, 'a')}])),
      el('div', {}, el('h4', {class: 'trh', text: 'Paise per pick'}), dayChart('line', PLn, lnPre, {aria: CLINE + ' per pick', fmt: (v) => pn(v, 2), onPick}, [{name: CLINE + ' (paise per pick)', get: (d) => lv(d, 'pp'), agg: 'w', w: wPk}]))),
    CLINE === 'POWER' && cHasFix() && !isPlant() ? el('p', {class: 'note', text: bPlant() ? 'POWER is shown as the plant entered it (Plant file). Pick Actual at the top for it less the POWER correction.' : 'POWER is shown on Actual: the plant\'s units less the POWER correction. Pick Plant file at the top to see it as entered.'}) : null));

  // ---- 4. power (cost line) and labour, above production
  const {P: PP, pre: pPre} = per('power'), {P: PL, pre: lPre} = per('labour');
  // Round B1: the day's POWER correction, from the Actual set (a Plant file day carries none of its own)
  const pfx = !isPlant() && cHasFix() ? ((COST.days || []).find((x) => x.date === cur.date) || {}).pfix || null : null;
  const powPP = (d) => d.power && ok(d.power.amount) && d.picks ? d.power.amount / (d.picks * 1e5) * 100 : null;
  s.append(el('div', {class: 'trgrid'},
    card('Power', `POWER line of the costing: units, rate and cost per lakh picks${bTxt()}`, table(['', 'Today'], [['Units', f0(cur.power.units)], ['Units per lakh picks', pn(cur.power.per_lakh, 0)], ['Rate per unit', '₹ ' + pn(cur.power.rate, 2)], ['Amount', rs(cur.power.amount)], ['Power cost per pick', ok(powPP(cur)) ? pn(powPP(cur), 2) + ' paise' : NA], ['₹ per lakh picks', rs(cur.power.rs_lakh)]], [1]),
      perBar('power'),
      el('h4', {class: 'trh', text: 'Power cost per pick, paise'}),
      dayChart('power', PP, pPre, {aria: 'Power cost per pick', fmt: (v) => pn(v, 2), onPick}, [{name: 'Power cost per pick (paise)', get: powPP, agg: 'w', w: wPk}]),
      el('h4', {class: 'trh', text: 'Units per lakh picks'}),
      dayChart('power', PP, pPre, {aria: 'Power units per lakh picks', fmt: f0, onPick}, [{name: 'Units per lakh picks', get: (d) => d.power.per_lakh, agg: 'w', w: wPk}]),
      pfx ? el('p', {class: 'scopenote', text: !bPlant() ? `Actual: ${f0(pfx.units_entered)} units entered, less ${f0(pfx.units)} (${pn(COST.pfix && COST.pfix.paise, 0)} paise × ${pn(cur.picks, 2)} lakh picks ÷ ₹${pn(cur.power.rate, 2)}) = ${f0(cur.power.units)} units.` : `Plant file: as entered. On Actual the units would be ${f0(pfx.units_entered - pfx.units)}, ${f0(pfx.units)} fewer.`}) : null,
      pfx && pfx.below ? el('p', {class: 'err', text: `On Actual the units (${f0(pfx.units_entered - pfx.units)}) are below the compressor's own units for the day: the POWER or Power (Compressor) entry in the plant's file needs a look.`}) : null,
      !isPlant() && cHasFix() && !pfx ? el('p', {class: 'note', text: 'No POWER correction on this day: both bases agree.'}) : null,
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
  if (typeof wkPut === 'function') { const h = CHGV === 'mtd' ? null : hgRows.find((x) => ok(x.conv) && x.hg !== 'Unassigned'); wkPut('J14', h ? {hg: h.hg, tm: h.tm, ppi: h.ppi, cpp: cur.cpp} : null); }   // Round J
  // Round A8 (scope item 3; Divyam, 25 Nov 2026): the owner's Folded cost per pick and Target folded cost columns (paise),
  // all widths together by the quality's Style-map name; Today = the day, Month to date = MTD; a name with no match "—", named
  const FQ = typeof fxCostFq === 'function' ? fxCostFq(cur.date, CHGV === 'mtd') : null, fqH = FQ ? [['Folded cost per pick', CHGV === 'mtd' ? 'paise, month to date' : 'paise, the day'], ['Target folded cost', CHGV === 'mtd' ? 'paise, month to date' : 'paise, the day']] : [];
  const fqN = (cols) => FQ ? [...cols, cols.length + 1, cols.length + 2] : cols;
  const fqNote = () => FQ ? el('p', {class: 'note', text: `Folded cost per pick and Target folded cost (owner only): the Actions view Folded cost per pick by quality's All widths figures${CHGV === 'mtd' ? ', month to date' : ' for the day'}, each quality across both widths by its head group's Style-map name, in paise per A-grade folded pick (not per metre).${FQ.miss.length ? ` No match in the loom data, so "—": ${FQ.miss.join(', ')}. Next: check the name against the Style map on Head-group links.` : ''}`}) : null;
  // Round C2a (Divyam, 28 Nov 2026, audit #31): ranked bars of metres above the table, day and night in two shades, each with
  // its share of all metres (calc.js prodBars, the table's figures). No money: the owner columns stay in the table.
  const prodChart = (R) => {
    const B = prodBars(R); if (!B.length) return null;
    const dn = (r) => ok(r.dm) && ok(r.nm) && Math.abs(r.dm + r.nm - r.tm) < 1;
    return el('div', {}, hbars(B.map((r) => ({label: r.hg, v: r.tm, dm: r.dm, nm: r.nm, segs: dn(r) ? [{name: 'Day', v: r.dm, color: 'var(--bar)'}, {name: 'Night', v: r.nm, color: 'var(--bar)', op: 0.5}] : null,
      text: `${f0(r.tm)} m · ${pc(r.share)}`, title: `${r.hg}: ${f0(r.tm)} m${dn(r) ? ` (day ${f0(r.dm)}, night ${f0(r.nm)})` : ''} · ${pc(r.share)} of all metres`})),
      {aria: 'Metres by quality head group, day and night', axis: 'metres', fmt: f0, labelW: 150, wideText: true, nameLabel: 'Head group', sortLabel: 'Metres', sortId: 'cost-prodhg',
        sortBases: [{v: 'day', label: 'Day metres', get: (r) => r.dm}, {v: 'night', label: 'Night metres', get: (r) => r.nm}]}),
      B.some((r) => !dn(r)) ? el('p', {class: 'note', text: `One colour, no day and night split in the file: ${B.filter((r) => !dn(r)).map((r) => r.hg).join(', ')}. Next: the metres are in the table.`}) : null,
      el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bar)'}), 'Day'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bar);opacity:.5'}), 'Night'), el('span', {class: 'lg', text: 'beside each bar: metres · share of all metres'})));
  };
  if (CHGV === 'mtd') s.append(card('Production by quality head group', `${dfmt(ym + '-01')} – ${dfmt(cur.date)} · month to date · whole plant, both widths together · sorted by metres`, hgSeg, prodChart(ag),
    table(['Head group', ['Metres', 'day / night'], ['Total', 'm'], ['Share', '% of metres'], ['Picks', 'lakh'], ['Share', '% of picks'], ['Average looms', 'a day'], ['Metres per loom-day', 'm'], ...fqH],
      ag.map((g) => [el('span', {}, el('b', {text: g.hg}), el('div', {class: 'note', text: [...g.names].join(', ')})), `${f0(g.dm)} / ${f0(g.nm)}`, f0(g.tm), pc(g.tm / totM), pn(g.pp, 2), pc(totP ? g.pp / totP : null), pn(g.loomdays / (cur.mtd.days || 1), 1), f0(g.tm / (g.loomdays || 1)), ...(FQ ? FQ.cells(g.hg) : [])]), fqN([1, 2, 3, 4, 5, 6, 7])), fqNote(),
    el('p', {class: 'note', text: `${cur.mtd.days} day${cur.mtd.days === 1 ? '' : 's'} of ${monthName(cur.date)}. Average looms = loom-days ÷ days in the month so far. Converting cost per metre is a day figure: switch to Today to see it.`})));
  else s.append(card('Production by quality head group', `${dfmt(cur.date)} · whole plant, both widths together · sorted by metres${bTxt()}`, hgSeg, prodChart(hgRows),
    table(['Head group', ['Metres', 'day / night'], ['Total', 'm'], ['vs previous day', 'm'], ['Picks', 'lakh'], ['Share', '% of picks'], ['Looms', 'running'], ['Metres per loom', 'm'], ['Converting cost', '₹ per metre'], ...fqH],
      hgRows.map((h) => [el('span', {}, el('b', {text: h.hg}), el('div', {class: 'note', text: h.names.join(', ')})), `${f0(h.dm)} / ${f0(h.nm)}`, f0(h.tm), pv[h.hg] ? ((h.tm - pv[h.hg].tm) >= 0 ? '+' : '−') + f0(Math.abs(h.tm - pv[h.hg].tm)) : 'new', pn(h.pp, 2), pc(h.share), pn(h.looms, 2), f0(h.mpl), ok(h.conv) ? pn(h.conv, 2) : '—', ...(FQ ? FQ.cells(h.hg) : [])]), fqN([1, 2, 3, 4, 5, 6, 7, 8])), fqNote(),
    el('p', {class: 'note', text: `Converting cost per metre = the day's cost per pick (${pn(cur.cpp, 2)} paise) × the quality's picks per inch, so it differs between groups only through picks per inch. A quality running on both widths counts once. Click a point on a chart below to open another day.`}),
    (() => { const R = hgRows.filter((h) => ok(h.conv) && h.hg !== 'Unassigned').sort((a, c) => c.conv - a.conv || a.hg.localeCompare(c.hg));
      return R.length ? el('div', {}, el('h4', {class: 'trh', text: 'Converting cost per metre'}),
        hbars(R.map((h) => ({label: h.hg, v: h.conv, color: 'var(--bar)', text: '₹' + pn(h.conv, 2), title: `${h.hg}: ₹${pn(h.conv, 2)} a metre = ${pn(cur.cpp, 2)} paise × ${pn(h.ppi, 1)} picks per inch · ${f0(h.tm)} m today`})),
          {aria: 'Converting cost per metre by head group', axis: '₹ per metre', fmt: (v) => pn(v, 2), labelW: 150, nameLabel: 'Head group', sortLabel: 'Converting cost per metre'})) : null; })()));
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
      el('div', {}, el('h4', {class: 'trh', text: 'Dispatch %, month to date'}), dayChart('stock', P, pre, {w: 520, h: 300, zero: true, aria: 'Dispatch percent month to date', fmt: (v) => pn(v, 1) + '%', onPick}, [{name: 'Dispatch % (month to date)', get: dPct, agg: 'last', avg: false, per: false}])))));

  // ---- 5b. B grade and cut pieces
  s.append(bgradeSection(cur));

  // ---- 6. month to date table
  const lines = cur.lines.slice().sort((a, c) => c.mt - a.mt);
  // Round C2a (Divyam, 28 Nov 2026, audit #42): ranked bars of each line's month-to-date paise per pick above the table, with its
  // share of the month's cost (calc.js mtdLineBars: the table's rows, the tail in "Other lines", then the cut piece loss)
  const MLB = mtdLineBars(cur.lines, cur.mtd.picks, cur.mtd.cut || 0, 14).filter((r) => ok(r.pp) && r.mt > 0);
  s.append(card('Month to date', `${cur.mtd.days} day${cur.mtd.days === 1 ? '' : 's'} of ${dfmt(ym + '-01').split(' ')[1]}${bTxt()}`,
    MLB.length ? hbars(MLB.map((r) => ({label: r.label, v: r.pp, color: r.cut ? CSL.cut : r.other ? 'var(--muted-2)' : CSL.cost, text: `${pn(r.pp, 2)} · ${pc(r.share)}`,
      title: `${r.label}: ${pn(r.pp, 2)} paise per pick this month · ${rs(r.mt)} · ${pc(r.share)} of the month's cost incl. cut piece loss`})),
      {aria: 'Month-to-date paise per pick by expense line', axis: 'paise per pick, month to date', fmt: (v) => pn(v, 2), labelW: 150, wideText: true, nameLabel: 'Line', sortLabel: 'Paise per pick, month', sortId: 'cost-mtdl'}) : null,
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
    (COST.excluded || []).length ? el('p', {class: 'scopenote', text: 'Left out of costing (day rules in the Config sheet\'s Settings tab): ' + COST.excluded.map(dfmt).join(', ') + '. These days are in no figure on this tab, month to date included.'}) : null,
    el('p', {class: 'note', text: `Data generated ${COST.generated_at} IST. The B-grade register comes from the plant's own costing.xlsx; labour detail by person, beam changes and the planning sheet are not on this tab yet.`})));
  return s;
}

// ---------------------------------------------------------------- Sheet checks (Divyam, 14 Nov 2026; owner only)
// Three cards for the costing day picked. The database returns app_data 'cost_checks' to the owner only (0015); the plant view
// and every other role never get here. Arithmetic: calc.js sheetChecks / sheetPlantVs / sheetMtd. Gaps show "—", never 0.
// Names on screen: "Plant file" (costing.xlsx as uploaded) and "Recomputed" (the app's re-working of it, COST.days_entered, the
// Plant file basis of the app-wide switch). Actual is Recomputed + the power fix (COST.days), named in a footnote.
const scRecomputed = () => (cHasFix() ? COST.days_entered : COST.days) || [];
const rs2 = (x) => !ok(x) ? '—' : (x < 0 ? '−₹' : '₹') + Math.abs(x).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const scFmt = (v, unit) => !ok(v) ? '—' : unit === 'rs' ? rs2(v) : unit === 'picks' ? f0(v) : v.toFixed(3);
const scSigned = (v, unit) => (v > 0 ? '+' : '−') + scFmt(Math.abs(v), unit).replace('−', '');
const scDiffCell = (r, unit) => r.state === 'gap' ? el('span', {class: 'pill muted', text: '—'})
  : r.state === 'agree' ? el('span', {class: 'pill good', text: 'agrees'})
  : el('b', {class: 'diffcell', 'data-sort': String(r.d), text: scSigned(r.d, unit)});
// Day rules (Diwali break, 14 Nov 2026): the expected part of a difference, and what is left of it.
const scExpCell = (r, unit) => r.exp === null ? el('span', {class: 'pill muted', title: 'a plant file the day rules need has not been read', text: '—'})
  : !ok(r.exp) || Math.abs(r.exp) < SC_TOL[unit] ? '' : el('span', {'data-sort': String(r.exp), text: scSigned(r.exp, unit)});
const scLeftCell = (r, unit) => r.state === 'expected' ? el('span', {class: 'pill info', text: 'as expected'})
  : r.state !== 'differ' ? '' : !ok(r.left) ? el('span', {class: 'pill muted', text: '—'})
  : el('b', {class: 'diffcell', 'data-sort': String(r.left), text: scSigned(r.left, unit)});
const SC_UNIT = {rs: '₹', picks: 'picks', paise: 'paise'};
// The Sheet checks card's New / Standing / All switch (Divyam, 16 Nov 2026): opens on New on every load, not saved per email.
let SCMODE = 'new';
const SCMODES = [['new', 'New'], ['standing', 'Standing'], ['all', 'All']];
function sheetCheckCards(cur) {
  const d = cur.date;
  if (!CCHK) return [card('Sheet checks', `${dfmt(d)} · owner only`, el('p', {class: 'empty', text: `${NA} yet: the sheet checks arrive with the next costing run.`}))];
  const day = (CCHK.days || {})[d] || null;
  const R = CCHK.rules || null, adj = sheetAdjust(CCHK.days || {}, R, d), dp = sheetDoublePay(CCHK.days || {}, R, d);
  const fileNote = !day || !day.plant_read ? `the plant's costing.xlsx for ${dfmt(d)} has not been read yet` : !day.plant ? `no cost statement could be read from the plant's costing.xlsx for ${dfmt(d)}` : '';
  const out = [];
  // (a) the CPP task's checks of the file: only findings that can change a figure the app shows (16 Nov 2026), New first
  const C = sheetChecks(day && day.checks, SCMODE);
  if (!C) out.push(card('Sheet checks', `${dfmt(d)} · the costing run's checks of the plant's costing.xlsx · owner only`,
    el('p', {class: 'empty', text: `— Not checked: the costing run has not validated the plant's file for ${dfmt(d)} yet.`})));
  else {
    const k = C.counts, sev = {ERROR: ['bad', 'Error'], WARN: ['warn', 'Warning']}, T = C.tabs;
    const seg = el('div', {class: 'seg', role: 'group', 'aria-label': 'Findings shown'}, SCMODES.map(([v, t]) =>
      el('button', {type: 'button', 'aria-pressed': C.mode === v ? 'true' : 'false', text: `${t} (${T[v]})`, onclick: () => { SCMODE = v; render(); }})));
    const none = C.mode === 'new' ? (T.standing ? `Nothing new that can change a figure. ${T.standing} standing: pick Standing to see ${T.standing === 1 ? 'it' : 'them'}.` : 'Nothing new or standing that can change a figure: nothing to act on for this day.')
      : C.mode === 'standing' ? (T.new ? `Nothing standing that can change a figure. ${T.new} new: pick New to see ${T.new === 1 ? 'it' : 'them'}.` : 'Nothing standing or new that can change a figure: nothing to act on for this day.')
      : 'No errors or warnings that can change a figure in the plant\'s file for this day: nothing to act on.';
    out.push(card('Sheet checks', `${dfmt(d)} · the costing run's checks of the plant's costing.xlsx · owner only`,
      k ? el('div', {class: 'kpis sc'}, kpiC('New errors', String(k.errors_new), '', `${k.errors - k.errors_new} standing`), kpiC('New warnings', String(k.warnings_new), '', `${k.warnings - k.warnings_new} standing`))
        : el('p', {class: 'err', text: 'The counts could not be read from the checks\' summary; the list below is what the log holds.'}),
      el('div', {class: 'toolbar'}, seg),
      C.rows.length ? table(['Line', 'Where', 'What the file shows'], C.rows.map((f) => [
        el('div', {}, el('b', {text: f.label || '—'}), el('div', {style: 'margin-top:4px;display:flex;gap:4px;flex-wrap:wrap'},
          el('span', {class: 'pill ' + sev[f.sev][0], text: sev[f.sev][1]}), scNotChecked(f) ? el('span', {class: 'pill muted', title: 'this check could not run on the file; it counts as a warning', text: 'Not checked'}) : null,
          f.status === 'new' ? el('span', {class: 'pill info', text: 'New'}) : el('span', {class: 'pill muted', text: 'Standing'}))),
        [f.sheet, f.cell].filter(Boolean).join(' ') || '—',
        el('div', {}, el('div', {text: f.msg}), scFigText(f.fig) ? el('div', {class: 'note', style: 'margin:4px 0 0', text: `Can change: ${scFigText(f.fig)}.`}) : null)]))
        : el('p', {class: 'empty', text: none}),
      C.unlisted ? el('p', {class: 'note', text: `${C.unlisted} more are not listed here; they are in the Validation tab of the month's cost-per-pick log.`}) : null,
      C.hidden ? el('p', {class: 'note', text: `${C.hidden} more finding${C.hidden === 1 ? '' : 's'} cannot change the app's figures; ${C.hidden === 1 ? 'it is' : 'they are'} in the Validation tab of the month's cost-per-pick log.`}) : null,
      !C.classified ? el('p', {class: 'note', text: 'Checked before 16 Nov 2026: every finding is listed, also those that cannot change a figure, and the counts cover them all. The list is narrowed once this day is checked again (Daily run with validate_days, RUNBOOK 3b3); nothing to do here.'}) : null,
      el('p', {class: 'note', text: 'New = first seen in this day\'s file; Standing = the previous day\'s file had the same finding on the same line, with the same figures. The counts above are the findings that can change a figure and do not follow the New / Standing / All switch. The checks report and never change the plant\'s file.'})));
  }
  // (a2) day rules: the expected adjustment in the plant's month totals, and the previous day's double pay line by line
  if (adj || dp) out.push(dayRulesCard(d, adj, dp, R));
  // (b) plant file vs recomputed, line by line
  const rec = scRecomputed().find((x) => x.date === d) || null;
  const V = day && day.plant ? sheetPlantVs(day.plant, rec, adj) : null;
  if (typeof wkPut === 'function') { const r = V && (V.rows.find((x) => x.state === 'differ') || V.rows.find((x) => x.state !== 'gap'));   // Round J
    wkPut('J19', r ? {what: `${r.line}, ${r.fig}`, file: r.plant, calc: r.corr, exp: r.exp, unit: r.unit, agree: r.state === 'agree'} : null); }
  const xc = !!V && V.rows.some((r) => r.exp === null || (ok(r.exp) && Math.abs(r.exp) >= SC_TOL[r.unit]));
  const fix = COST.pfix && ok(COST.pfix.paise) ? `${pn(COST.pfix.paise, 0)} paise a pick off the POWER line` : 'the POWER correction';
  out.push(card('Plant file vs recomputed', `${dfmt(d)} · Plant file = costing.xlsx as uploaded · Recomputed = the app's re-working of it, before the POWER correction (the Plant file basis)`,
    !V ? el('p', {class: 'empty', text: `— ${fileNote || `no recomputed costing for ${dfmt(d)}`}.`})
      : el('div', {}, el('div', {class: 'toolbar'}, el('span', {class: 'pill ' + (V.differ ? 'warn' : 'good'), text: V.differ ? `${V.differ} figure${V.differ === 1 ? '' : 's'} differ${xc ? ' beyond the expected part' : ''}` : xc ? 'No difference beyond the expected part' : 'Every figure agrees'}),
          V.expected ? el('span', {class: 'pill info', text: `${V.expected} differ as expected`}) : null,
          V.gap ? el('span', {class: 'pill muted', text: `${V.gap} not in one of the two`}) : null, el('span', {class: 'note', text: `${V.agree} agree`})),
        table(['Line', 'Figure', 'Plant file', 'Recomputed', 'Difference', ...(xc ? ['Expected', 'Unexplained'] : [])], V.rows.map((r) => [r.line === 'COST PER PICK' ? 'COST PER PICK (sheet row, excl. cut piece loss)' : r.line, `${r.fig}${r.unit === 'rs' ? '' : ', ' + SC_UNIT[r.unit]}`, scFmt(r.plant, r.unit), scFmt(r.corr, r.unit), scDiffCell(r, r.unit),
          ...(xc ? [scExpCell(r, r.unit), scLeftCell(r, r.unit)] : [])]), xc ? [2, 3, 4, 5, 6] : [2, 3, 4])),
    el('p', {class: 'note', text: `Difference = plant file − recomputed. Day = AMOUNT, Progressive = PROGRESSIVE, Month = TOTAL column. Lines with the same name are added together. COST PER PICK here is the sheet's own row (TOTAL AMOUNT ÷ PICK), without the cut piece loss that the tab's headline cost per pick adds. Realisation and profit use Recomputed with ${fix}, which this card does not compare.${xc ? ' Expected = the day rules\' adjustment (days left out of costing, the correct double pay; see Day rules above) and, on TOTAL AMOUNT, the plant\'s POWER (COMPRESSOR) counted again (it is inside POWER). Unexplained = difference − expected.' : ''}`})));
  // (c) month to date, file vs correct
  const M = day && day.plant ? sheetMtd(day.plant, scRecomputed(), d, adj, R) : null;
  const ttl = 'Month to date: file vs correct', sub = `1–${dfmt(d)} · the plant file's TOTAL column against the sum of the recomputed day amounts`;
  if (!M) out.push(card(ttl, sub, el('p', {class: 'empty', text: `— ${fileNote || 'no plant file for this day'}.`})));
  else {
    const T = M.total, xm = !!adj || Math.abs(M.comp || 0) >= SC_TOL.rs;
    if (typeof wkPut === 'function') wkPut('J20', T.state === 'gap' ? null : {file: T.file, correct: T.correct});   // Round J
    const ex = (r) => xm ? [scExpCell(r, 'rs'), scLeftCell(r, 'rs')] : [];
    const rows = [...M.lines.map((r) => [r.line, rs2(r.file), rs2(r.correct), scDiffCell(r, 'rs'), ...ex(r)]),
      ...M.expected.map((r) => [r.line, rs2(r.file), rs2(r.correct), scDiffCell(r, 'rs'), ...ex(r)]),
      ...M.gaps.map((r) => [r.line, rs2(r.file), rs2(r.correct), scDiffCell(r, 'rs'), ...(xm ? ['', ''] : [])]),
      Math.abs(M.comp || 0) >= SC_TOL.rs ? [el('i', {text: 'POWER (COMPRESSOR) counted again in TOTAL AMOUNT'}), '', '', scDiffCell({state: 'differ', d: M.comp}, 'rs'), ...ex({state: 'expected', d: M.comp, exp: M.comp})] : null,
      ok(M.rest) && M.rest !== 0 ? [el('i', {text: 'TOTAL AMOUNT itself (not from a line)'}), '', '', scDiffCell({state: 'differ', d: M.rest}, 'rs'), ...(xm ? ['', scLeftCell({state: 'differ', d: M.rest, left: M.rest}, 'rs')] : [])] : null,
      el('tr', {}, el('td', {}, el('b', {text: 'Total (TOTAL AMOUNT)'})), el('td', {class: 'num', text: rs2(T.file)}), el('td', {class: 'num', text: rs2(T.correct)}), el('td', {class: 'num'}, scDiffCell(T, 'rs')),
        ...(xm ? [el('td', {class: 'num'}, scExpCell(T, 'rs')), el('td', {class: 'num'}, scLeftCell(T, 'rs'))] : []))].filter(Boolean);
    const sgn = (v) => (v > 0 ? '+' : '−') + rs(Math.abs(v)).replace('−', '');
    out.push(card(ttl, sub + (M.adj && M.adj.excluded.length ? ` (${M.adj.excluded.map(dfmt).join(', ')} left out)` : ''),
      el('div', {class: 'kpis sc sc4'}, kpiC('File, month total', rs(T.file), '', 'TOTAL AMOUNT, TOTAL column'), kpiC('Correct', rs(T.correct), '', M.missing.length ? 'days missing' : `${M.days} day${M.days === 1 ? '' : 's'} added`),
        kpiC('File minus correct', T.state === 'gap' ? '—' : T.state === 'agree' ? 'agrees' : sgn(T.d), '', T.state === 'differ' ? (T.d > 0 ? 'the file shows more' : 'the file shows less') : T.state === 'expected' ? 'all of it expected' : ''),
        xm ? kpiC('Beyond the expected part', !ok(T.left) || T.state === 'gap' ? '—' : Math.abs(T.left) < SC_TOL.rs ? 'none' : sgn(T.left), '', ok(T.exp) ? `expected ${sgn(T.exp)}` : 'expected part —')
          : kpiC('Cost per pick, month', pn(M.cpp.file, 2), 'paise', ok(M.cpp.correct) ? `correct ${pn(M.cpp.correct, 2)} · excl. cut piece loss` : 'correct —')),
      M.missing.length ? el('p', {class: 'err', text: `— Correct month to date not worked out: no recomputed costing for ${M.missing.map(dfmt).join(', ')}. A missing day is never counted as zero.`}) : null,
      M.missing.length ? null : (M.lines.length || M.expected.length || M.gaps.length || (ok(M.rest) && M.rest !== 0) || Math.abs(M.comp || 0) >= SC_TOL.rs || T.state === 'differ')
        ? table(['Line', ['File', '₹'], ['Correct', '₹'], 'Difference', ...(xm ? ['Expected', 'Unexplained'] : [])], rows, xm ? [1, 2, 3, 4, 5] : [1, 2, 3])
        : el('p', {class: 'empty', text: 'Every line\'s month total in the file matches the sum of its day amounts.'}),
      el('p', {class: 'note', text: 'Lines responsible: lines whose month total in the file differs from the sum of their day amounts, biggest first. "TOTAL AMOUNT itself" is the part of the difference no line explains: the file\'s TOTAL column does not add up its own lines. A line missing from a day\'s statement counts nothing for that day.' +
        (xm ? ' Expected = the day rules\' adjustment (see Day rules) and the plant\'s POWER (COMPRESSOR) counted again in TOTAL AMOUNT (it is inside POWER, never a cost). Unexplained = difference − expected.' : '') +
        (xm ? ` Month cost per pick: file ${pn(M.cpp.file, 2)} paise, correct ${ok(M.cpp.correct) ? pn(M.cpp.correct, 2) : '—'} (excl. cut piece loss).` : '')})));
  }
  return out;
}

// Day rules card (owner only): what the plant's month totals carry that costing leaves out, and the previous day's double pay
// in this day's PROGRESSIVE, line by line (calc.js sheetAdjust / sheetDoublePay).
function dayRulesCard(d, adj, dp, R) {
  const why = R && R.reason ? ` (${R.reason})` : '';
  const sgn = (v) => !ok(v) ? '—' : (v > 0 ? '+' : '−') + rs2(Math.abs(v)).replace('−', '');
  const body = [];
  if (adj) {
    const rows = [];
    if (adj.excluded.length) rows.push([`Days left out of costing: ${adj.excluded.map(dfmt).join(', ')}${why}`, 'the plant\'s day amounts on those days', rs2(adj.excl)]);
    if (adj.doubled.length) rows.push([`Double pay for ${adj.doubled.map(dfmt).join(', ')}`, 'the correct double: each day\'s single amount on the double-pay lines', rs2(adj.dbl)]);
    rows.push([el('b', {text: 'Expected in the plant\'s month totals'}), `by ${dfmt(d)}; costing counts none of it`, el('b', {text: rs2(adj.total)})]);
    body.push(el('h4', {class: 'trh', text: 'Expected adjustment'}),
      adj.missing.length ? el('p', {class: 'err', text: `— Not worked out: the plant's costing.xlsx for ${adj.missing.map(dfmt).join(', ')} has not been read. Nothing is guessed.`}) : null,
      el('div', {class: 'nosort'}, table(['What', 'Basis', ['Amount', '₹']], rows, [2])));   // rows are figures, not a list to sort
  }
  if (typeof wkPut === 'function') { const r = dp && dp.rows && dp.rows.find((x) => x.state !== 'gap');   // Round J
    wkPut('J21', r ? {line: r.line, expected: r.expected, added: r.added, prevDate: dfmt(dp.from)} : null); }
  if (dp) {
    const head = `The double pay for ${dfmt(dp.from)} in ${dfmt(d)}'s PROGRESSIVE`;
    if (!dp.rows) body.push(el('h4', {class: 'trh', text: head}), el('p', {class: 'empty', text: `— Not checked: ${dp.why}.`}));
    else body.push(el('h4', {class: 'trh', text: head}),
      el('div', {class: 'kpis sc'}, kpiC('Lines that miss it', String(dp.misses), '', dp.misses ? 'reconciliation issues' : 'every line as it should be'),
        kpiC('Short', dp.short ? sgn(dp.short) : 'none', '', 'lines booked too little'), kpiC('Over', dp.over ? sgn(dp.over) : 'none', '', 'lines booked too much'),
        kpiC('Net gap', dp.misses ? sgn(dp.net) : 'none', '', `correct double ${rs2(dp.expected)} · plant added ${rs2(dp.added)}`)),
      table(['Line', ['Correct double', '₹'], ['Plant added', '₹'], 'Gap'], dp.rows.map((r) => [r.nth > 1 ? `${r.line} (2nd line)` : r.line, rs2(r.expected), rs2(r.added),
        r.state === 'gap' ? el('span', {class: 'pill muted', text: '—'}) : r.state === 'agree' ? el('span', {class: 'pill good', text: 'as it should be'}) : el('b', {class: 'diffcell', 'data-sort': String(r.gap), text: sgn(r.gap)})]), [1, 2, 3]),
      el('p', {class: 'note', text: `Correct double = ${dfmt(dp.from)}'s single amount, on every line above the salary TOTAL except ${(R.double_except || []).join(', ') || 'none'}${(R.double_extra || []).length ? `, plus ${R.double_extra.join(', ')}` : ''}. Plant added = ${dfmt(d)}'s PROGRESSIVE − ${dfmt(dp.from)}'s TOTAL column. Gap = plant added − correct double. The plant will not re-send sheets; costing counts these days at single cost either way.`}));
  }
  return card('Day rules', `${dfmt(d)} · days left out and double pay (Config sheet Settings tab) · owner only`, ...body);
}

// ---------------------------------------------------------------- Compressor power: money on the CFM and Pressure tabs
// Power (Compressor) kWh and rupees (D.power, from 5 Nov 2026: the power register's on 5-19 Nov (Round U), else the costing sheet's). One compressor serves both widths,
// so the day's kWh is spread over the whole floor's air (all looms, both widths).
let POWER_PCT = 7;   // compressor energy saved per 1 kgf/cm² of pressure; set on the Targets tab
let COMP_SP = null;  // Round F: the compressor's own set point, kgf/cm², typed on the Pressure tab (App targets row compsp__kgf)
// Round V (Divyam, 20 Nov 2026): the set point has a history with effective-from dates (table compsp_history, migration
// 0018: [{from, kgf, by, at}], seeded 5.0 from 1 Nov 2026 and 4.8 from 5 Nov 2026). COMP_SP is the set point in force on the
// day shown (spSync, at every redraw); with no history (not loaded, or empty) it is the targets row as before (COMP_SP_ROW).
let SP_HIST = null, SP_ERR = '', COMP_SP_ROW = null;
// A day before the history's first entry has no set point (a gap with its next step), never a later one.
function spSync() { COMP_SP = SP_HIST && SP_HIST.length ? (D && D.latest ? spAt(SP_HIST, D.latest) : null) : COMP_SP_ROW; return COMP_SP; }
// The history entry in force on a day (for the tile's "since"), or null
const spEntry = (d) => { let e = null; for (const h of SP_HIST || []) if (h.from <= d && (!e || h.from >= e.from)) e = h; return e; };
// The energy rate for the CFM saving, per day (calc.js erFit): the compressor's kWh against the floor's air on every day with
// both (D.power.days and the loom-days that ran), worked once per data load and history.
let ER_MEMO = {key: null, ser: null, by: new Map()};
function erSeries() {
  const P = (D && D.power && D.power.days) || {}, air = new Map();
  for (const x of (D && D.loomdays) || []) if (x.run > 0 && ok(x.cfm)) air.set(x.date, (air.get(x.date) || 0) + x.cfm * x.run);
  const fl = new Map(((D && D.pressure && D.pressure.floor) || []).map((f) => [f.date, f.floor]));   // Round A2: the day's floor pressure, for the air + pressure fit
  return Object.keys(P).sort().map((d) => ({d, kwh: P[d].kwh, air: air.get(d) || 0, fl: fl.has(d) && ok(fl.get(d)) ? fl.get(d) : null}));
}
function erDay(date, press) {   // press (Round A2): the air + floor pressure fit, for the owner's kWh against the fit card only
  if (!D || !date) return null;
  if (ER_MEMO.key !== D || ER_MEMO.hist !== SP_HIST) ER_MEMO = {key: D, hist: SP_HIST, ser: erSeries(), by: new Map()};
  const k = (press ? 'p|' : '') + date;
  if (!ER_MEMO.by.has(k)) ER_MEMO.by.set(k, erFit(ER_MEMO.ser, date, SP_HIST || [], {press: !!press}));
  return ER_MEMO.by.get(k);
}
// The rate a CFM saving uses on a day, kWh per ft³: the fit's (slope or window average), else the day's own (no valid day yet).
const erK = (date, own) => { const f = erDay(date); return f && f.used !== 'none' ? f.k : own; };
// The rate a CFM saving uses on a day, in kWh per 1,000 ft³ (the day's own average where there is no fit yet), and its name.
function erRateOf(date) { const f = erDay(date); if (f && f.used !== 'none') return f.rate; const c = compDay(date); return c && c.exact ? c.kwhFt3 * 1000 : null; }
const erWord = (f) => !f || f.used === 'none' ? 'the day\'s own average' : f.used === 'slope' ? 'the fitted slope' : `the ${f.n}-day average`;
// The Energy rate tile's note: which rate, over how many days, and the R² against the floor
// Round W (20 Nov 2026): plain words for plant staff; R² glossed where it shows (1.00 = every day on the line)
const erShort = (f) => !f || f.used === 'none' ? 'the day\'s own average: too few days for a line yet'
  : f.used === 'slope' ? `slope of a line through ${f.n} days: the extra kWh per extra 1,000 ft³ · R² ${f2(f.r2)} (1.00 = every day on the line)`
  : `${f.n}-day average · ${f.why === 'few' ? `a line needs ${ER_MIN} days` : f.why === 'r2' ? `the days sit loosely on a line: R² ${f2(f.r2)}, under ${f2(ER_R2)}` : 'the line\'s slope is out of range'}`;
// Round X: the same note in a few words for a phone (below 560 px, .nm in style.css); the Working (E9) keeps the full story.
const erPhone = (f) => !f || f.used === 'none' ? 'the day\'s own average' : f.used === 'slope' ? `line through ${f.n} days · fit ${f2(f.r2)} (1.00 = every day on it)`
  : `${f.n}-day average · ${f.why === 'few' ? 'too few days for a line' : f.why === 'r2' ? 'days too loose for a line' : 'slope out of range'}`;
const erNote = (f) => el('div', {class: 'note nm'}, el('span', {class: 'lgl', text: erShort(f)}), el('span', {class: 'sml', text: erPhone(f) + ' · details in the Working (the = mark)'}));
// The figures the Working (E9) shows for the rate on a day
const erWk = (f, date, own) => !f ? null : {date: dfmt(date), used: f.used, why: f.why, n: f.n, from: f.from ? dfmt(f.from) : '', to: f.to ? dfmt(f.to) : '', a: f.a, b: f.b, c: f.c, useC: f.useC,
  r2: f.r2, avg: f.avg, rate: f.used === 'none' ? (ok(own) ? own * 1000 : null) : f.rate, min: ER_MIN, floor: ER_R2, sps: (f.sps || []).map((e) => `${f2(e[0])} kgf/cm² on ${e[1]} day${e[1] === 1 ? '' : 's'}`).join(', ')};
// In words, for notes and the Working: which rate it is and what it rests on.
function erHow(f) {
  if (!f || f.used === 'none') return 'the day\'s own kWh ÷ the floor\'s air (no day from 5 Nov 2026 with a compressor reading and loom data yet, so no fit)';
  const span = `${f.n} day${f.n === 1 ? '' : 's'}, ${dfmt(f.from)} – ${dfmt(f.to)}`;
  if (f.used === 'slope') return `the fitted slope b over ${span} (kWh = ${f0(f.a)} + ${f2(f.b)} × air in 1,000 ft³${f.useC ? ` + ${f0(f.c)} × set point` : ''}; R² ${f2(f.r2)})`;
  const why = f.why === 'few' ? `fewer than ${ER_MIN} days for a fit` : f.why === 'r2' ? `the fit's R² ${f2(f.r2)} is under ${f2(ER_R2)}` : `the fit's slope ${f2(f.b)} is not above 0 and below the average`;
  return `the average over ${span} (the window's total kWh ÷ its total air), because ${why}`;
}
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
  // Round V: sFt3 / sRsFt3, the kWh and rupees per ft³ a CFM saving uses (the energy rate: fitted slope, else the window
  // average; erDay); kwhFt3 / rsFt3 stay the day's own average (Energy per air, the cost of a loom's air)
  const fit = erDay(d), sFt3 = fit && fit.used !== 'none' ? fit.k : p.kwh / ft3;
  return {date: d, exact: d === date, kwh: p.kwh, rate: p.rate, rupees: p.rupees, ft3, kwhFt3: p.kwh / ft3, rsFt3: p.rupees / ft3, kwhKm3: p.kwh / (ft3 * 0.0283168) * 1000,
    fit, sFt3, sRsFt3: p.kwh > 0 ? sFt3 * p.rupees / p.kwh : null};
}
// Round U: where a day's compressor kWh comes from (src 'register': the 5-19 Nov 2026 backfill, costing.py comp_backfill)
function compSrc(d) { const p = ((D.power && D.power.days) || {})[d]; return p && p.src === 'register' ? 'the weaving compressor\'s meter reading' : 'the costing sheet\'s Power (Compressor) line'; }
function compNote(c, date) {
  if (!c) return `Compressor power (kWh and rupees) starts on 5 Nov 2026: the weaving compressor's meter readings for 5–19 Nov, then the costing sheet's Power (Compressor) line. The money figures appear once a day with a compressor reading has loom data. Next: ${tcNext()}.`;
  return `Uses the compressor's ${f0(c.kwh)} kWh (${compSrc(c.date)}) at ₹${f2(c.rate)} a unit on ${dfmt(c.date)}${c.exact ? '' : ` (the latest day with a compressor reading; ${dfmt(date)} is not in the costing sheet yet)`}, spread over the ${f0(c.ft3 / 1000)} thousand ft³ the floor drew. Money figures are for one day and ×30 for a month at that day's level.`;
}
// Round A2 (Divyam, 24 Nov 2026): the money tiles of "If every loom ran at its reference CFM" (and, from the Pressure push,
// its pressure twin). The Energy saved and Money saved tiles are gone: Cost per pick saved's note carries the rupees and kWh
// a day. Compressor, that day keeps its rupees; its note gives the kWh and the compressor's cost per pick on the whole floor's
// picks that day (both widths, one compressor) in place of the ₹ a unit, and names the day when it is not the day shown.
// kwh: the energy saved a day; picks: the picks the saving is spread over (paise per pick); rate: the Energy rate tile too.
function worthTiles(c, kwh, picks, scope, date, rate, extra) {   // extra: more words in the brackets (Pressure: the share of the compressor's energy)
  const r = kwh * c.rate, p = ppS(r, picks), cp = ppS(c.rupees, floorPicks(c.date));
  const saved = `${rs(r)} a day saved (${f0(kwh)} kWh${extra ? ', ' + extra : ''})`;
  return [
    kpiC('Cost per pick saved', ok(p) ? pz(p) : NA, ok(p) ? 'paise per pick' : '', ok(p) ? `${saved} · over ${pn(picks / 1e5, 2)} lakh picks, ${scope}` : `${saved} · no picks for that day: pick another day with the date chip at the top of the page`),
    kpiC('In a month', rs(r * 30), '× 30 days', null),
    kpiC('Compressor, that day', rs(c.rupees), '', `${f0(c.kwh)} kWh · ${ok(cp) ? `${pz(cp)} paise per pick, both widths` : `no picks on ${dfmt(c.date)}: pick another day with the date chip at the top of the page`}${c.exact ? '' : ` · from ${dfmt(c.date)}, the latest day with a reading (${dfmt(date)} has none yet)`}`),
    rate ? kpiC('Energy rate', f2(c.sFt3 * 1000), 'kWh per 1,000 ft³', erNote(c.fit)) : null].filter(Boolean);   // Round V: the rate the CFM saving uses
}
// The CFM saving in rupees for the combined card on the CFM tab (Round A2): its tiles, or the note saying why there are none.
function cfmWorth(day, date) {
  const c = compDay(date);
  if (!c) return {tiles: [], gap: el('p', {class: 'note', text: compNote(c, date)})};
  if (!day) return {tiles: [], gap: el('p', {class: 'note', text: `No loom data for ${dfmt(date)}, so there is nothing to value: pick another day with the date chip at the top of the page.`})};
  const saved = (day.now - day.after) * 1440;
  if (typeof wkPut === 'function') { const kwh = saved * c.sFt3, r = kwh * c.rate;   // Round J: the tiles' Working
    wkPut('E2:kwh', {ft3: saved, kwhFt3: c.sFt3, how: erHow(c.fit)}); wkPut('E2:rs', {kwh, rate: c.rate}); wkPut('E2', {kwh, rate: c.rate}); wkPut('A8:cfm', {rs: r, picks: day.cpk}); wkPut('E2:month', {rs: r});
    wkPut('E3:day', {date: dfmt(c.date), kwh: c.kwh, rate: c.rate, rupees: c.rupees, src: compSrc(c.date)}); wkPut('E9', erWk(c.fit, c.date, c.kwhFt3)); }
  return {tiles: worthTiles(c, saved * c.sFt3, day.cpk, `${wLabel()} looms on ${dfmt(date)}`, date, true), gap: null};
}
// Period for the air and compressor card's line: 7, 14 or 30 days, all days (default) or the shared "Dates" range.
let CPWPER = 'all';
try { const v = localStorage.getItem('w2-comp-period'); if (['7', '14', '30', 'all', 'range'].includes(v)) CPWPER = v; } catch (e) {}
// Round T (Divyam, 20 Nov 2026): the CFM tab's top card. Three views (CFM, Air per 1,000 picks, Compressor power); it opens
// on Air per 1,000 picks on every load (not kept). Each view has four tiles; tapping a tile charts its own figure day by day
// (the first tile to begin with), and the period bar's week line follows the figure charted. Whole floor, both widths: one
// compressor serves them. Figures: calc.js airDay. A day with no compressor reading of its own is a gap in the compressor
// figures (the tiles use the latest day with one and name it).
// Round U (Divyam, 20 Nov 2026): a Benchmark / Best / Target switch (opens on Target every load, not kept) draws the
// charted figure with every loom above that reference brought down to it as a dashed line (calc.js airRef); the second
// tile of the CFM and Air views is now the gap to that line ("CFM over target", "Air over target"), replacing the two
// at-target tiles. Cost per CFM, Energy per air and Cost per air have no line: they would not move.
const AP_CARD = 'Air and compressor';
let APVIEW = 'air', APREF = 'tg';
const AP_REFS = [['bm', 'Benchmark', 'benchmark', 'var(--muted)'], ['best', 'Best', 'best', 'var(--good)'], ['tg', 'Target', 'target', 'var(--ink)']];
const apRefW = () => AP_REFS.find((r) => r[0] === APREF)[2];
const APPICK = {cfm: 'cfm', air: 'apk', pow: 'kwhAir'};
const AP_VIEWS = [['cfm', 'CFM', 'CFM'], ['air', 'Air per 1,000 picks', 'Air'], ['pow', 'Compressor power', 'Compressor']];   // short labels on a phone
const rsP2 = (x) => !ok(x) ? '—' : '₹' + x.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
function airRows() {
  const P = (D.power && D.power.days) || {};
  const ds = (D.complete_days || []).filter((d) => d <= D.latest).slice().sort();
  return ds.map((d) => {
    const L = (D.loomdays || []).filter((x) => x.date === d && x.run > 0).map((x) => { const t = x.hg !== 'Unassigned' ? tgt(x.width, x.hg) : null;
      const r = x.hg !== 'Unassigned' && typeof cfmRefs === 'function' ? cfmRefs(x) : {};   // Round U: benchmark and best CFM, as the CFM tab works them
      return {cfm: x.cfm, run: x.run, fpicks: ok(x.fpicks) ? x.fpicks : x.picks, tcfm: t && ok(t.cfm) ? t.cfm : null, bm: ok(r.bm) ? r.bm : null, best: ok(r.best) ? r.best : null}; });
    return {d, a: airDay(L, P[d] ? {...P[d], k: erK(d, null)} : null)};   // Round V: k, the energy rate for the reference line
  }).filter((r) => r.a);
}
function apFigs() {
  const they = (n) => n === 1 ? 'it' : 'they', s = (n) => n === 1 ? '' : 's';
  const w = apRefW(), R = (a) => a.ref[APREF];
  const noRef = () => APREF === 'tg' ? `no loom has a target CFM yet: ${typeof canEdit === 'function' && canEdit() ? 'set them on Targets' : 'tell the owner'}`
    : `no loom has a ${w} CFM on this day: pick another day with the date chip at the top of the page`;
  const noneNote = (a) => R(a).none ? ` · ${R(a).none} loom${s(R(a).none)} with no ${w} CFM as ${they(R(a).none)} ran` : '';
  return {
    cfm: [
      {k: 'cfm', id: 'E7:cfm', label: 'Floor CFM', unit: 'CFM', fmt: f0, get: (a) => a.cfm, line: (a) => R(a).cfm, w: () => 1, wu: 'CFM', note: (a) => `24-h average draw · ${f0(a.air)} ft³ in the day`, put: (a) => ({air: a.air})},
      {k: 'over', id: 'E7:tcfm', label: `CFM over ${w}`, unit: 'CFM', fmt: f0, get: (a) => R(a).over, gap: 'cfm', w: () => 1, wu: 'CFM',
        note: (a) => !ok(R(a).over) ? noRef() : `${a.cfm > 0 ? f1(100 * R(a).over / a.cfm) : '—'}% of Floor CFM${noneNote(a)}`, put: (a) => ({air: a.air, rair: R(a).air, none: R(a).none, w})},
      {k: 'lcfm', id: 'E7:lcfm', label: 'Average CFM per loom', unit: 'CFM', fmt: f1, get: (a) => a.lcfm, line: (a) => R(a).lcfm, w: (a) => a.run, wu: 'CFM', note: (a) => `while running · ${a.looms} looms`, put: (a) => ({air: a.air, run: a.run})},
      {k: 'rsCfm', id: 'E7:rscfm', label: 'Cost per CFM', unit: 'a day per CFM', fmt: rsP2, get: (a) => a.rsCfm, w: (a) => a.cfm, wu: 'a day per CFM', comp: true, note: () => 'compressor ₹ for the day ÷ floor CFM', put: (a) => ({rupees: a.rupees, air: a.air})}],
    air: [
      {k: 'apk', id: 'E8:apk', label: 'Air per 1,000 picks', unit: 'ft³', fmt: f1, get: (a) => a.apk, line: (a) => R(a).apk, w: (a) => a.fpicks, wu: 'ft³', note: (a) => `floor air ÷ fabric picks × 1,000 · ${a.looms} looms`, put: (a) => ({air: a.air, fpicks: a.fpicks})},
      {k: 'overApk', id: 'E8:tapk', label: `Air over ${w}`, unit: 'ft³ per 1,000 picks', fmt: f1, get: (a) => R(a).overApk, gap: 'apk', w: (a) => a.fpicks, wu: 'ft³ per 1,000 picks',
        note: (a) => !ok(R(a).overApk) ? noRef() : `${f1(R(a).apk)} ft³ at ${w}, same picks${noneNote(a)}`, put: (a) => ({air: a.air, rair: R(a).air, none: R(a).none, fpicks: a.fpicks, w})},
      {k: 'kwhLakh', id: 'E8:kwh', label: 'Energy per lakh picks', unit: 'kWh', fmt: f0, get: (a) => a.kwhLakh, line: (a) => R(a).kwhLakh, w: (a) => a.picks, wu: 'kWh', comp: true, note: () => 'compressor kWh · picks = fabric picks ÷ 39.37, as on Costing', put: (a) => ({kwh: a.kwh, fpicks: a.fpicks})},
      {k: 'ppPick', id: 'E8:pp', label: 'Compressor cost per pick', unit: 'paise', fmt: f2, get: (a) => a.ppPick, line: (a) => R(a).ppPick, w: (a) => a.picks, wu: 'paise', comp: true, note: () => 'picks = fabric picks ÷ 39.37, as on Costing', put: (a) => ({rupees: a.rupees, fpicks: a.fpicks})}],
    pow: [
      {k: 'kwh', id: 'E3:kwh', label: 'Compressor energy', unit: 'kWh', fmt: f0, get: (a) => a.kwh, line: (a) => R(a).kwh, w: () => 1, wu: 'kWh', comp: true, note: (a, d) => compSrc(d).replace(/^the /, ''), put: (a, d) => ({date: d, kwh: a.kwh, src: compSrc(d)})},
      {k: 'rupees', id: 'E3:cost', label: 'Cost', unit: '', fmt: rs, get: (a) => a.rupees, line: (a) => R(a).rupees, w: () => 1, wu: '', comp: true, note: (a, d) => `₹${f2(a.rate)} a unit × ${f0(a.kwh)} kWh, ${compSrc(d).replace(/^the /, '')}`, put: (a, d) => ({date: d, kwh: a.kwh, rate: a.rate, rupees: a.rupees, src: compSrc(d)})},
      {k: 'kwhAir', id: 'E3:air', label: 'Energy per air', unit: 'kWh per 1,000 ft³', fmt: f2, get: (a) => a.kwhAir, w: (a) => a.air, wu: 'kWh per 1,000 ft³', comp: true, note: () => 'compressor kWh ÷ floor air', put: (a) => ({kwh: a.kwh, ft3: a.air})},
      {k: 'rsAir', id: 'E3:rsair', label: 'Cost per air', unit: 'per 1,000 ft³', fmt: rsP2, get: (a) => a.rsAir, w: (a) => a.air, wu: 'per 1,000 ft³', comp: true, note: () => 'compressor ₹ ÷ floor air', put: (a) => ({rupees: a.rupees, ft3: a.air})}]};
}
function airCard() {
  const all = airRows(), F = apFigs(), figs = F[APVIEW], last = all.at(-1), lastC = all.filter((r) => ok(r.a.kwh)).at(-1);
  if (typeof wkPut === 'function') for (const v of Object.values(F)) for (const f of v) { const r = f.comp ? lastC : last; wkPut(f.id, r ? f.put(r.a, dfmt(r.d)) : null); }   // Round J
  const pick = figs.find((f) => f.k === APPICK[APVIEW]) || figs[0];
  const tile = (f) => {
    const r = f.comp ? lastC : last, v = r ? f.get(r.a) : null;
    const note = !r ? (f.comp ? `no Power (Compressor) line on the costing sheet yet: ${tcNext()}` : 'no loom data yet: press Refresh (the round arrow)')
      : `${f.note(r.a, r.d)}${f.comp && last && r.d !== last.d ? ` · ${dfmt(r.d)}, the latest day with a compressor reading` : ''}`;
    const t = kpiC(f.label, ok(v) ? f.fmt(v) : '—', ok(v) ? f.unit : '', note), k = t.querySelector('.kpi'), on = f.k === pick.k;
    k.classList.add('tap', 'ap'); if (on) k.classList.add('sel');
    k.setAttribute('role', 'button'); k.setAttribute('tabindex', '0'); k.setAttribute('aria-pressed', on ? 'true' : 'false'); k.setAttribute('aria-label', `${f.label}: chart it day by day`);
    tapTip(k, on ? `Charted below: ${f.label}, day by day` : `Tap to chart ${f.label} day by day`, false);   // Round A1: the hover note
    const go = () => { APPICK[APVIEW] = f.k; render(); };
    k.addEventListener('click', go); k.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return t;
  };
  const vb = (v, t, sh) => el('button', {type: 'button', 'aria-pressed': APVIEW === v ? 'true' : 'false', 'aria-label': t, onclick: () => { APVIEW = v; render(); }}, el('span', {class: 'lgl', text: t}), el('span', {class: 'sml', text: sh}));
  const views = el('div', {class: 'toolbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'View'}, ...AP_VIEWS.map(([v, t, sh]) => vb(v, t, sh))));
  const allF = all.filter((r) => ok(pick.get(r.a)));   // the days with the charted figure (compressor figures: from 7 Nov 2026)
  const inR = CPWPER === 'range' ? new Set(rngDays(allF.map((r) => r.d))) : null;
  const rows = CPWPER === 'all' ? allF : inR ? allF.filter((r) => inR.has(r.d)) : allF.slice(-(+CPWPER));
  const b = (v, t, sh) => el('button', {type: 'button', 'aria-pressed': CPWPER === v ? 'true' : 'false', 'aria-label': t, onclick: () => { CPWPER = v; try { localStorage.setItem('w2-comp-period', v); } catch (e) {} render(); }}, el('span', {class: 'lgl', text: t}), el('span', {class: 'sml', text: sh || t}));
  const name = pick.label + (pick.unit ? `, ${pick.unit.startsWith('a day') ? '₹ ' + pick.unit : pick.unit}` : '');   // Round X: "Cost per CFM, ₹ a day per CFM"
  const bar = allF.length > 1 ? el('div', {class: 'toolbar perbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Period'}, b('7', '7 days', '7d'), b('14', '14 days', '14d'), b('30', '30 days', '30d'), b('all', 'All days', 'All days'), b('range', 'Dates')),
    CPWPER === 'range' ? rngCtl(allF.map((r) => r.d), render) : null, rows.length ? el('span', {class: 'note', text: `${dfmt(rows[0].d)} – ${dfmt(rows.at(-1).d)} · ${rows.length} days`}) : null,
    // Round D: the charted figure, this week vs last week (each day weighted as the figure is: by picks, air or minutes run)
    wkPill(wkMean(all.map((r) => ({date: r.d, a: r.a})), D.latest, (r) => pick.get(r.a), (r) => pick.w(r.a), 'down'), {what: pick.label, fmt: pick.fmt, unit: pick.wu})) : null;
  // Round U: the reference line (dashed) for a figure that has one; it follows the Benchmark / Best / Target switch
  const [, refT, refW, refC] = AP_REFS.find((r) => r[0] === APREF);
  const lineVals = pick.line ? rows.map((r) => pick.line(r.a)) : [];
  // Round C2a (audit #29): the period average weighted as the week line weights the figure (by picks, air or minutes run)
  const series = [{name, vals: rows.map((r) => pick.get(r.a)), per: perAvg(rows, {get: (r) => pick.get(r.a), agg: 'w', w: (r) => pick.w(r.a)})}].concat(lineVals.some(ok) ? [{key: 'ref', name: `At ${refW}`, vals: lineVals, dash: true, color: refC}] : []);
  const chart = rows.length > 1 ? lineChart({dates: rows.map((r) => r.d), aria: `${name}, day by day`, fmt: pick.fmt, series})
    : el('p', {class: 'note', text: allF.length > 1 ? 'Pick a longer period: the line needs two days with this figure.' : pick.comp ? `The line starts once a second day with a compressor reading is in (${tcNext()} if it does not come).` : 'The line starts once a second complete day is in: check again after the daily run.'});
  // the costing sheet's compressor kWh has so far been a near-fixed figure, not a daily meter reading (energy-rate analysis,
  // 19 Nov 2026): say so only while the days charted show it (less than 2% between the highest and lowest)
  const kw = rows.map((r) => r.a.kwh).filter(ok), flat = kw.length > 1 && Math.max(...kw) - Math.min(...kw) < 0.02 * Math.max(...kw);
  const sub = {cfm: 'Whole floor, both widths · the 24-h average draw and what the compressor costs per CFM', air: 'Whole floor, both widths · air and compressor cost for the picks woven', pow: 'Whole floor, both widths · the compressor\'s kWh and rupees, against the floor\'s air'}[APVIEW];
  const rb = (v, t) => el('button', {type: 'button', 'aria-pressed': APREF === v ? 'true' : 'false', 'aria-label': `Reference line: ${t}`, text: t, onclick: () => { APREF = v; render(); }});
  const refs = el('div', {class: 'toolbar'}, el('span', {class: 'note', text: 'Reference line'}), el('div', {class: 'seg', role: 'group', 'aria-label': 'Reference line'}, ...AP_REFS.map(([v, t]) => rb(v, t))));
  const lastR = rows.length ? rows.at(-1).a.ref[APREF] : null, gapOf = pick.gap ? figs.find((f) => f.k === pick.gap) : null;
  const refNote = pick.line ? (lineVals.some(ok) ? `Dashed line, At ${refW}: ${pick.label} with every loom above its ${refW} CFM brought down to it, the rest as they ran${lastR && lastR.none ? ` (${dfmt(rows.at(-1).d)}: ${lastR.none} loom${lastR.none === 1 ? '' : 's'} with no ${refW} CFM)` : ''}.${pick.comp ? ` The compressor's kWh fall by the air taken off × the energy rate for the CFM saving (${f2(erRateOf(rows.at(-1).d))} kWh per 1,000 ft³ on ${dfmt(rows.at(-1).d)}: ${erWord(erDay(rows.at(-1).d))}), and the rupees at the day's ₹ a unit, as in step 1 of Target cost per pick.` : ''}`
      : `No At ${refW} line: ${APREF === 'tg' ? `no loom has a target CFM yet (${typeof canEdit === 'function' && canEdit() ? 'set them on Targets' : 'tell the owner'})` : `no loom has a ${refW} CFM on these days: pick a longer period, or another day with the date chip at the top of the page`}.`)
    : gapOf ? `${pick.label} is ${gapOf.label} less its At ${refW} line; tap ${gapOf.label} to see both lines.`
    : `${pick.label} has no reference line: the compressor's energy is taken to fall in step with the floor's air, so this figure would not change with the looms brought down to their ${refW} CFM.`;
  return card(AP_CARD, sub, views, refs, el('div', {class: 'kpis sc sc4'}, ...figs.map(tile)),   // 2 × 2 on a phone
    el('p', {class: 'note'}, el('b', {text: `Tap a tile to chart it day by day; now charting ${pick.label}.`}), `${APVIEW === 'pow' && flat ? ' Over these days the compressor\'s kWh changes by under 2%, so Energy per air and Cost per air move mostly with the floor\'s air (Cost per air also with the ₹ a unit).' : ''}`),
    bar, chart, rows.length > 1 ? el('p', {class: 'note', text: refNote}) : null);
}
// Round A2 (Divyam, 24 Nov 2026): the pressure saving's money tiles go into "If every loom ran at its reference pressure" (no
// separate card): Cost per pick saved (its note: the rupees and kWh a day and the share of the compressor's energy, the old
// Compressor energy saved, Energy saved and Money saved tiles), In a month and Compressor, that day. No notes under them,
// except the one that says why there are none (no set point, no margin, no compressor reading, or nothing to save).
function pressWorth(pp) {
  const c = compDay(D.latest);
  if (c && ok(pp.total) && pp.total > 0) {
    if (typeof wkPut === 'function') { const kwh = pp.total * c.kwh, r = kwh * c.rate;   // Round J
      wkPut('G3:kwh', {frac: pp.total, kwh: c.kwh}); wkPut('G3:rs', {kwh, rate: c.rate}); wkPut('A8:press', {rs: r, picks: floorPicks(c.date)}); wkPut('G3:month', {rs: r});
      wkPut('G3:day', {date: dfmt(c.date), kwh: c.kwh, rate: c.rate, rupees: c.rupees, src: compSrc(c.date)}); }
    return {tiles: worthTiles(c, pp.total * c.kwh, floorPicks(c.date), `all looms, both widths, on ${dfmt(c.date)}`, D.latest, false, `${f1(pp.total * 100)}% of the compressor's energy`), gap: null};
  }
  const own = typeof fxIsOwner === 'function' && fxIsOwner();
  const t = !c ? compNote(c, D.latest)
    : ok(pp.total) ? `The compressor already runs at or below the set point needed, and no loom sits above its reference pressure, so there is nothing to save (${f1(pp.total * 100)}% of the compressor's energy).`
    : !ok(COMP_SP) ? (canEdit() ? 'Type the compressor set point on the tile above to see the saving.' : 'The compressor set point is not typed in yet: tell the owner.')
    : !ok(pMargin()) ? (own ? 'The margin is missing: add setpoint_margin_kgf (kgf/cm²) to the Config sheet Settings tab.' : 'The margin is not set yet: tell the owner.')
    : `The saving cannot be worked out for this day: no loom has a main pressure reading. Next: ${tcNext()}.`;
  return {tiles: [], gap: el('p', {class: 'note', text: t})};
}
// Round V (Divyam, 20 Nov 2026): the Pressure tab's owner-only card, each day's compressor kWh against the energy rate's
// fit (calc.js erFit): the deviation in kWh and %, labelled as an outlier more than ER_OUT robust standard deviations from
// it. One point a day; pointing at or tapping the chart shows that day's figures. Its own period (MTD to begin with) and
// a week line on the average size of the deviation. Never drawn for any other role (so neither searched nor listed).
const ER_CARD = 'Compressor kWh against the fit';
let ERPER = 'mtd';
try { const v = localStorage.getItem('w2-erdev-period'); if (['7', '14', '30', 'mtd', 'range'].includes(v)) ERPER = v; } catch (e) {}
function erDevRows(press) {
  return erSeries().filter((r) => r.d <= D.latest).map((r) => { const f = erDay(r.d, press); return f && f.day ? {d: r.d, f, x: f.day} : null; }).filter(Boolean);
}
// Round A2 (Divyam, 24 Nov 2026): which fit the card draws, Current fit (the energy rate's) or Air + floor pressure; Current
// fit on every load (not kept). The fit's name in words, and its formula, for the card's notes and the Working (G6).
let ERFIT = 'cur';
const erFitName = (f) => !f || f.used === 'none' ? 'no fit yet' : !f.press ? erWord(f) : f.used === 'slope' ? 'the air + floor pressure fit' : `the ${f.n}-day average (the air + floor pressure fit is not good enough yet)`;
function erHowP(f) {
  if (!f || f.used === 'none') return 'no day from 5 Nov 2026 has a compressor reading, loom data and a floor pressure yet';
  const span = `${f.n} day${f.n === 1 ? '' : 's'}, ${dfmt(f.from)} – ${dfmt(f.to)}`;
  if (f.used === 'slope') return `kWh = ${f0(f.a)} + ${f2(f.b)} × air in 1,000 ft³ + ${f0(f.p)} × floor pressure (kgf/cm²) over ${span}; R² ${f2(f.r2)}`;
  return `the average over ${span}, because ${f.why === 'few' ? `fewer than ${ER_MIN} days have a floor pressure` : f.why === 'r2' ? `the fit's R² ${f2(f.r2)} is under ${f2(ER_R2)}` : `the fit's slope ${f2(f.b)} is not above 0 and below the average`}`;
}
function erDevCard() {
  if (!(typeof fxIsOwner === 'function' && fxIsOwner())) return null;
  const P = ERFIT === 'ap', all = erDevRows(P), sub = P ? 'Owner only · each day\'s kWh − the kWh the air + floor pressure fit gives for its air and floor' : 'Owner only · each day\'s kWh − the kWh the energy rate\'s fit gives for its air';
  const allC = P ? erDevRows(false) : all, allP = P ? all : erDevRows(true);   // both, for their R² side by side
  const fb = (v, t, sh) => el('button', {type: 'button', 'aria-pressed': ERFIT === v ? 'true' : 'false', 'aria-label': `Fit: ${t}`, onclick: () => { ERFIT = v; render(); }}, el('span', {class: 'lgl', text: t}), el('span', {class: 'sml', text: sh || t}));
  const fsw = el('div', {class: 'toolbar'}, el('span', {class: 'note', text: 'Fit'}), el('div', {class: 'seg', role: 'group', 'aria-label': 'Fit'}, fb('cur', 'Current fit'), fb('ap', 'Air + floor pressure', 'Air + pressure')));
  const last = all.at(-1);
  if (typeof wkPut === 'function') wkPut('G6', last ? {date: dfmt(last.d), kwh: last.x.kwh, fit: last.x.fit, z: last.x.z, out: last.x.out, how: erFitName(last.f)} : null);
  if (!all.length) return card(ER_CARD, sub, fsw, el('p', {class: 'note', text: P ? 'No day from 5 Nov 2026 has a compressor reading, loom data and a floor pressure yet: pick Current fit, or check again after the daily run (it updates the app every hour, 10:40 to 16:40 IST).' : 'No day from 5 Nov 2026 has both a compressor reading and loom data yet. It fills in with the daily run (it updates the app every hour, 10:40 to 16:40 IST); if it stays empty, see Files per day on Data health.'}));
  const ds = all.map((r) => r.d), inR = ERPER === 'range' ? new Set(rngDays(ds)) : null, ym = D.latest.slice(0, 7);
  const rows = ERPER === 'mtd' ? all.filter((r) => r.d.slice(0, 7) === ym) : inR ? all.filter((r) => inR.has(r.d)) : all.slice(-(+ERPER));
  const b = (v, t, sh) => el('button', {type: 'button', 'aria-pressed': ERPER === v ? 'true' : 'false', 'aria-label': t, onclick: () => { ERPER = v; try { localStorage.setItem('w2-erdev-period', v); } catch (e) {} render(); }}, el('span', {class: 'lgl', text: t}), el('span', {class: 'sml', text: sh || t}));
  const bar = el('div', {class: 'toolbar perbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Period'}, b('7', '7 days', '7d'), b('14', '14 days', '14d'), b('30', '30 days', '30d'), b('mtd', 'Month to date', 'MTD'), b('range', 'Dates')),
    ERPER === 'range' ? rngCtl(ds, render) : null, rows.length ? el('span', {class: 'note', text: `${ERPER === 'mtd' ? 'Month to date: ' : ''}${dfmt(rows[0].d)} – ${dfmt(rows.at(-1).d)} · ${rows.length} day${rows.length === 1 ? '' : 's'}`}) : null,
    wkPill(wkMean(all.map((r) => ({date: r.d, x: r.x})), D.latest, (r) => erAbsPct(r.x), null, 'down'), {what: 'Average deviation from the fit, either side', fmt: (v) => v.toFixed(2), unit: '%', dunit: ' points'}));
  const outs = rows.filter((r) => r.x.out);
  const detail = (i) => { const r = rows[i]; if (!r) return null; const x = r.x;
    return el('span', {class: 'note'}, `${f0(x.kwh)} kWh against ${f0(x.fit)} fitted (${erFitName(r.f)}${r.f.used === 'slope' ? `, b ${f2(r.f.b)}${r.f.press ? `, p ${f0(r.f.p)}` : ''}, R² ${f2(r.f.r2)}` : ''}, ${r.f.n} day${r.f.n === 1 ? '' : 's'}): ${sg(x.dev, 0)} kWh`
      + (ok(x.z) ? ` · ${sg(x.z, 1)} robust standard deviations` : ''), x.out ? el('span', {class: 'pill bad', text: 'outlier'}) : null); };
  // Round C3 (Divyam, 28 Nov 2026, audit #12): the deviation as bars either side of 0 (red over the fit, green under it), and
  // above it the scatter itself, floor air against kWh with the fit's line, the outliers ringed; a day with no kWh is named
  const chart = rows.length ? lineChart({dates: rows.map((r) => r.d), aria: 'Deviation from the fit, % of the fitted kWh, day by day', fmt: (v) => sg(v, 2) + '%', noOpen: true, detail, barPad: true,
    refs: [{v: 0, label: 'On the fit'}], marks: outs.map((r) => ({date: r.d, text: `outlier, ${sg(r.x.dev, 0)} kWh (${sg(r.x.pct, 2)}%)`, short: 'outlier'})),
    series: [{name: 'Deviation from the fit, %', vals: rows.map((r) => r.x.pct), bars: true, upBad: true}]}) : el('p', {class: 'note', text: 'No day in this period: pick a longer period.'});
  const lr = rows.at(-1), ln = lr ? erLine(lr.f, rows.map((r) => r.x.air / 1000), lr.x.sp, lr.x.fl) : null;
  const scat = rows.length ? scatterChart(rows.map((r) => ({x: r.x.air / 1000, y: r.x.kwh, out: r.x.out, label: `outlier ${dfmt(r.d)}`,
    title: `${dfmt(r.d)}: ${f0(r.x.air / 1000)} thousand ft³ of floor air, ${f0(r.x.kwh)} kWh against ${f0(r.x.fit)} fitted (${sg(r.x.dev, 0)} kWh, ${sg(r.x.pct, 2)}%)${r.x.out ? ', an outlier' : ''}`})),
    {aria: 'Compressor kWh against the floor\'s air, one point a day, with the fit\'s line', xAxis: 'Floor air, thousand ft³ a day', yAxis: 'Compressor kWh', line: ln, lineName: lr ? `The fit as on ${dfmt(lr.d)} (${erFitName(lr.f)})` : null, empty: 'Fewer than two days in this period: pick a longer period.'}) : null;
  const from = ERPER === 'mtd' ? [ym + '-01', ER_START].sort()[1] : rows.length ? rows[0].d : D.latest, to = ERPER === 'range' && rows.length ? rows.at(-1).d : D.latest, inRows = new Set(rows.map((r) => r.d));
  const noK = (D.complete_days || []).filter((d) => d >= from && d <= to && d >= ER_START && !inRows.has(d));
  const scatNote = rows.length ? el('p', {class: 'note', text: `Each point is one day: the floor's air (across) and the compressor's kWh (up)${outs.length ? '; a ringed point is an outlier' : ''}. The dashed line is ${lr ? `the last day's fit (${dfmt(lr.d)}${lr.f.used === 'slope' ? (lr.f.useC ? `, at its set point ${f2(lr.x.sp)}` : lr.f.press ? `, at its floor ${f2(lr.x.fl)} kgf/cm²` : '') : ', the window average: kWh in step with the air'})` : 'the fit'}; each day is judged against its own day's fit, which the bars under it show.${noK.length ? ` Left out, no kWh${P ? ' or no floor pressure' : ''}: ${noK.map(dfmt).join(', ')}. Next: check that day's compressor reading (Files per day on Data health).` : ''}`}) : null;
  const fr = P ? allC.at(-1) : last, f = fr ? fr.f : null;   // the energy rate's own fit, whichever fit is drawn (none yet: no note)
  const lx = last.x, lastLine = el('p', {class: 'note', text: `${dfmt(last.d)}${last.d === D.latest ? '' : ' (the latest day with a compressor reading)'}: ${f0(lx.kwh)} kWh against ${f0(lx.fit)} kWh fitted, ${wkS(lx.dev, 0)} kWh (${wkS(lx.pct, 2)}%)${ok(lx.z) ? `, ${wkS(lx.z, 1)} robust standard deviations${lx.out ? ': an outlier' : ''}` : ''}.`});
  const lc = allC.find((r) => r.d === last.d), lp = allP.find((r) => r.d === last.d), r2 = (r) => r && r.f.used !== 'none' && ok(r.f.r2) ? f2(r.f.r2) : '—';
  const both = el('p', {class: 'note'}, el('b', {text: `R² on ${dfmt(last.d)}: Current fit ${r2(lc)} · Air + floor pressure ${r2(lp)}`}), ` (1.00 = every day on the line). The energy rate for the CFM saving uses the Current fit.${lp && lp.f.used === 'slope' ? ` The air + floor pressure fit: ${erHowP(lp.f)}; its p is ${f0(lp.f.p)} kWh per kgf/cm² of floor pressure, ${lp.x.fit > 0 ? f1(100 * lp.f.p / lp.x.fit) : '—'}% of the day's fitted kWh, beside the ${f1(POWER_PCT)}% rule the pressure saving uses.` : lp ? ` The air + floor pressure fit: ${erHowP(lp.f)}.` : ''}`);
  return card(ER_CARD, sub, fsw, lastLine, bar, scat, scatNote, chart, both,
    el('p', {class: 'note', text: `${outs.length ? `${outs.length} outlier${outs.length === 1 ? '' : 's'} in this period (${outs.map((r) => dfmt(r.d)).join(', ')}): a day more than ${ER_OUT} robust standard deviations from its fit. Check that day's compressor kWh: the power register's WEAVING COMPRESSOR up to 19 Nov 2026, the costing sheet's Power (Compressor) kWh from 20 Nov.` : `No outlier in this period (more than ${ER_OUT} robust standard deviations from the fit).`} Each day is set against the fit used for that day, over its own last 30 days, so a past day does not move. The first days have few days to set against, so they sit near 0; outliers are labelled from the ${ER_MIN}th day.`}),
    !fr ? null : el('p', {class: 'note', text: `On ${dfmt(fr.d)} the energy rate is ${erHow(f)}.${f.useC ? ` The set point term c is ${f0(f.c)} kWh per kgf/cm², ${f.a + f.b * fr.x.air / 1000 + f.c * fr.x.sp > 0 ? f1(100 * f.c / (f.a + f.b * fr.x.air / 1000 + f.c * fr.x.sp)) : '—'}% of the day's fitted kWh: a measured check beside the Pressure tab's ${f1(POWER_PCT)}% rule, which the pressure saving still uses.` : ` The set point term c needs two set points with ${ER_SPDAYS} days or more each in the window (now: ${(f.sps || []).map((e) => `${f2(e[0])} kgf/cm² on ${e[1]} day${e[1] === 1 ? '' : 's'}`).join(', ') || 'no set point history'}), so it is not fitted yet; the pressure saving uses the ${f1(POWER_PCT)}% rule.`}`}));
}
// A share of the compressor's energy, in rupees a day on the day shown, with its paise per pick under it (Round F: one
// figure, the rule only).
function moneyOne(frac) {
  const c = compDay(D.latest); if (!c || !ok(frac)) return '—';
  const r = frac * c.kwh * c.rate, pa = ppS(r, floorPicks(c.date));
  return ok(pa) ? el('span', {}, rs(Math.round(r)), el('div', {class: 'note', text: pz(pa) + ' paise/pick'})) : rs(Math.round(r));
}
function setPct(x) { const a = saving(x.floor, x.without); return ok(a) ? f1(a * 100) : '—'; }
function setRs(x) { const a = saving(x.floor, x.without); return ok(a) ? moneyOne(a) : '—'; }
// All-trends panel: what the subject's air costs, from the floor's compressor energy per ft³ (days with a compressor reading only)
function compTrendBlock(s, dates) {
  const P = (D.power && D.power.days) || {};
  const ds = dates.filter((d) => P[d]).map((d) => ({d, c: compDay(d)})).filter((r) => r.c && r.c.exact);
  if (!ds.length) return card('Compressor cost of this air', 'compressor readings from 5 Nov 2026', el('p', {class: 'note', text: 'No day in this period has a compressor reading yet.'}));
  const mine = (d) => (D.loomdays || []).filter((x) => x.date === d && x.run > 0 && (s.kind === 'loom' ? x.loom === s.loom : String(x.width) === String(s.w) && x.hg === s.hg));
  const air = ds.map((r) => mine(r.d).reduce((a, x) => a + x.cfm * x.run, 0));
  if (typeof wkPut === 'function') { const i = ds.length - 1; wkPut('E6', {date: dfmt(ds[i].d), ft3: air[i], rsFt3: ds[i].c.rsFt3, what: s.kind === 'loom' ? 'loom' : 'head group'}); }   // Round J
  return card('Compressor cost of this air', 'Whole-floor compressor energy per ft³ × this ' + (s.kind === 'loom' ? 'loom' : 'head group') + '\'s air, per day',
    lineChart({dates: ds.map((r) => r.d), aria: 'Compressor cost of this air per day', fmt: rs, series: [{name: 'Cost of the air (₹ a day)', vals: ds.map((r, i) => air[i] * r.c.rsFt3), per: perAvg(ds.map((r, i) => ({v: air[i] * r.c.rsFt3})), {get: (x) => x.v})}]}),   // Round C2a (#29): ₹ a day, the mean of the days
    lineChart({dates: ds.map((r) => r.d), aria: 'Compressor energy per 1,000 ft³ of air', fmt: f2, series: [{name: 'Floor compressor kWh per 1,000 ft³', vals: ds.map((r) => r.c.kwhFt3 * 1000), per: perAvg(ds, {get: (r) => r.c.kwhFt3 * 1000, agg: 'w', w: (r) => r.c.ft3})}]}),   // Round C2a (#29): Σ kWh ÷ Σ ft³   // Round T: ft³ only
    el('p', {class: 'note', text: 'The compressor is shared, so this is an allocation by air drawn, not a meter on this loom or quality.'}));
}
function powerRuleCard() {
  const inp = el('input', {type: 'number', step: '0.5', min: '1', max: '30', value: String(POWER_PCT), 'aria-label': 'Percent of compressor energy saved per 1 kgf/cm²', style: 'width:90px'});
  const msg = el('span', {class: 'meta'});
  const btn = el('button', {class: 'primary', type: 'button', text: 'Save', onclick: async () => {
    const v = parseFloat(inp.value); if (!(v >= 1 && v <= 30)) { msg.className = 'err'; msg.textContent = 'Enter a number from 1 to 30.'; return; }
    btn.disabled = true; msg.className = 'meta'; msg.textContent = 'Saving…';
    try { if (!db) throw new Error('no write access'); await db.collection('targets').doc('power__pct').set({width: 'all', hg: 'all', main: v}); POWER_PCT = v; msg.className = 'saved'; msg.textContent = 'Saved. Applies straight away.'; if (D) setTimeout(render, 600); }
    catch (e) { msg.className = 'err'; msg.textContent = saveFail(e, 'save', 'Save'); }
    btn.disabled = false;
  }});
  return card('Compressor power rule', 'Used on the Pressure tab and the Target cost per pick tile on Actions',
    el('div', {class: 'toolbar'}, el('label', {text: 'Energy saved per 1 kgf/cm² of lower pressure'}), inp, el('span', {text: '%'}), btn, msg),
    el('p', {class: 'note', text: 'Rule of thumb: about 7% of compressor power per 1 kgf/cm² (about 1 bar) of pressure. Set the figure for your compressor; the Pressure tab and the Target cost per pick tile on Actions use it for every pressure saving.'}));
}
// ================================================================ Round F (Divyam, 18 Nov 2026): Target cost per pick
// The Actions tiles (Target cost per pick, Folding shortage) and the "Where the saving is" card. Same day as Actions
// (D.latest); headline cost per pick on the chosen basis (Round B1: Actual or Plant file, bDays); whole plant, both
// widths. Never falls back to another day. Arithmetic: targetCost, foldShort, packRate in calc.js.
const tcOwner = () => typeof fxIsOwner === 'function' && fxIsOwner();
const tcNext = () => tcOwner() ? 'see Files per day on Data health' : 'tell the owner';
const TC_CARD = 'Where the saving is';
// Round A6 (25 Nov 2026): the looms at the floor pressure on an earlier day (Folded cost per pick by quality's month to date
// target): each loom's highest main pressure over its shifts of 60 minutes or more (the loom data's main_max, as the
// pipeline's day floor), with its head group's best; the day on the date chip keeps pressLooms (the Pressure tab's own list).
function tcPressAt(date) {
  const by = new Map();
  for (const x of D.loomdays || []) if (x.date === date && x.main_max > 0 && (!by.has(x.loom) || x.main_max > by.get(x.loom).main)) by.set(x.loom, {loom: x.loom, hg: x.hg || 'Unassigned', width: String(x.width), main: x.main_max});
  return [...by.values()].map((l) => ({...l, best: pBest(l.width, l.hg)}));
}
function tcRun(date) {
  const days = bDays(), day = days.find((d) => d.date === date) || null;   // Round B1: the chosen basis
  const PL = date === D.latest ? pressLooms() : tcPressAt(date);
  // Round A2 (Divyam, 24 Nov 2026): every loom at its best main pressure (the pressure target is the best), else where it ran
  const floorT = PL.length ? Math.max(...PL.map((l) => ok(l.best) ? Math.min(l.main, l.best) : l.main)) : null;
  // Round A6: an earlier day uses the set point in force that day (the set point history), never today's
  const sp = date === D.latest ? COMP_SP : SP_HIST && SP_HIST.length ? spAt(SP_HIST, date) : COMP_SP_ROW;
  const need = pressNeed(floorT, pMargin()), frac = pressFrac(sp, need, POWER_PCT);
  const c = compDay(date), comp = c && c.exact ? {kwh: c.kwh, rate: c.rate, k: c.sFt3} : null;   // Round V: k, the energy rate for the CFM saving
  const looms = tcLooms(date);
  const tc = targetCost({day, comp, pack: packRate(days, date), frac, looms});
  return Object.assign(tc, {date, looms, floorT, need, frac, noTgtP: PL.filter((l) => !ok(l.best)).length, nPress: PL.length, comp: !!comp});
}
// The loom-days that ran on a day, with their targets (target CFM; target effective RPM = 93% of target RPM)
function tcLooms(date) {
  return (D.loomdays || []).filter((x) => x.date === date && x.run > 0).map((x) => {
    const t = x.hg !== 'Unassigned' ? tgt(x.width, x.hg) : null;
    return {loom: x.loom, width: String(x.width), hg: x.hg, hg0: x.hg0, run: x.run, stop: x.stop, cfm: x.cfm, erpm: ok(x.erpm) ? x.erpm : erpmOf(x),
      fpicks: ok(x.fpicks) ? x.fpicks : x.picks, pf: pf(x.width, x.hg), tcfm: t && ok(t.cfm) ? t.cfm : null, terpm: x.hg !== 'Unassigned' ? tgtE(x.width, x.hg) : null};
  });
}
function tcShort(date) {
  const bq = (COST && COST.bq) || {};
  return foldShort(foldSrc(), bq.reg || [], (bq.days || []).filter((d) => d.reg).map((d) => d.date), date);
}
const tcUnavail = (date) => `Unavailable: costing for ${dfmt(date)} not uploaded yet`;
const tcPp = (x) => !ok(x) ? '—' : (x < 0 ? '−' : x > 0 ? '+' : '') + Math.abs(x).toFixed(Math.abs(x) < 0.1 && x !== 0 ? 3 : 2);
// What a gap on the tile leaves out, in plain words
function tcGapText(tc) {
  const g = tc.gaps || [], out = [];
  if (g.includes('compressor')) out.push(`CFM, pressure and the extra picks' compressor power left out: no compressor reading for ${dfmt(tc.date)} (${tcNext()})`);
  if (g.includes('pressure')) out.push(!ok(COMP_SP) ? (canEdit() ? 'pressure left out: type the compressor set point on the Pressure tab' : 'pressure left out: the compressor set point is not typed in yet (tell the owner)') : !ok(pMargin()) ? (tcOwner() ? 'pressure left out: add setpoint_margin_kgf to the Config sheet Settings tab' : 'pressure left out: no set point margin yet (tell the owner)') : `pressure left out: no main pressure readings for ${dfmt(tc.date)}`);
  const r = g.filter((x) => x.startsWith('rate:') && x !== 'rate:PACKING').map((x) => x.slice(5));
  if (r.length) out.push(`${r.map((x) => x.charAt(0) + x.slice(1).toLowerCase()).join(', ')} left out: no rate on the day's costing file (${tcNext()})`);
  if (g.includes('rate:PACKING')) out.push(`Packing left out: no packing amount on this month's costing days up to ${dfmt(tc.date)} yet, so there is no month-to-date rupees per metre (${tcNext()})`);
  return out;
}
function tcActionTiles(kpi) {
  if (!COST) { const why = `costing not loaded yet: press Refresh (the round arrow); if it stays, ${tcNext()}`;
    return [kpi('Target cost per pick', '—', '', null, why), kpi('Folding shortage', '—', '', null, why)]; }
  const date = D.latest, tc = tcRun(date), out = [];
  if (typeof wkPut === 'function') {   // Round J: the five steps, for the Working of the tile and the card
    const NM = {cfm: 'every loom at its target CFM', press: 'the compressor at the set point needed', picks: 'every loom at its target effective RPM', added: 'costs that grow with the extra picks', quality: 'no B grade and no cut pieces'};
    wkPut('B3', tc.ok ? {c0: tc.c0, steps: tc.steps.map((x) => ({pp: x.pp, name: NM[x.id] || x.id})), left: tc.steps.filter((x) => !ok(x.pp)).map((x) => NM[x.id] || x.id).join(', ')} : null);
  }
  const t = tc.ok
    ? kpi('Target cost per pick', pn(tc.cpp, 2), 'paise', el('span', {class: 'delta ' + (tc.cpp < tc.c0 ? 'up' : 'flat'), text: `now ${pn(tc.c0, 2)} · ${tcPp(tc.cpp - tc.c0)} paise`}),
      `${bName() ? bName() + ' · ' : ''}${tc.cover.full} of ${tc.cover.looms} looms with every target${tcGapText(tc).length ? ' · ' + tcGapText(tc).length + ' part' + (tcGapText(tc).length === 1 ? '' : 's') + ' left out' : ''}`)
    : kpi('Target cost per pick', '—', '', null, `${tcUnavail(date)}. Next: ${tcNext()}.`);
  // Round C2b (audit #28): the note stays within 3 lines on a laptop; the lag note and the parts left out are at the top of
  // Where the saving is (tcFull), and on pointing at the note
  if (tc.ok) kpiCap(t, tcFull(tc));
  t.classList.add('tap'); t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0'); t.setAttribute('aria-label', 'Target cost per pick: open Where the saving is');
  tapTip(t, 'Tap to see Where the saving is: the five steps and every loom\'s part');   // Round A1: the hover note
  const go = () => navGoCard('actions', TC_CARD);
  t.addEventListener('click', go); t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  out.push(t);
  const fs = tcShort(date);
  if (typeof wkPut === 'function') wkPut('B4', ok(fs.s) ? {A: fs.A, B: fs.B, C: fs.C, P: fs.P, days: fs.days, of: fs.of} : null);   // Round J
  out.push(ok(fs.s)
    ? actTap(kpi('Folding shortage', f1(fs.s * 100), '%', null, `month to date, ${fs.days} of ${fs.of} days (${dfmt(fs.from)}–${dfmt(fs.to)}) · picks woven but not folded as A grade, B grade or cut pieces`), 'fold')   // Round A1: opens Folding shortage by day
    : kpi('Folding shortage', '—', '', null, fs.of ? `no day this month has all its figures yet (${fs.out.map((o) => `${dfmt(o.date)}: ${o.why}`).slice(0, 2).join('; ')}). Next: ${tcNext()}.` : `no costing day this month up to ${dfmt(date)} yet. Next: ${tcNext()}.`));
  if (typeof fxTargetTiles === 'function') out.push(...fxTargetTiles(kpi, tc, fs));
  return out;
}
// Round C2b (audit #28): the Target cost per pick tile's note in full, at the top of Where the saving is
const tcFull = (tc) => `The Target cost per pick tile in full: ${bName() ? bName() + ', ' : ''}${tc.cover.full} of ${tc.cover.looms} looms with every target${tcGapText(tc).length ? `; left out: ${tcGapText(tc).join('; ')}` : ''}. Folding, beams and dispatch lag the looms: this assumes they catch up within the month.`;
// Round C2b (audit #8): the five steps as a bridge, the short names under the bars (the table names them in full)
const TC_BR = {cfm: '1. Target CFM', press: '2. Set point', picks: '3. Effective RPM', added: '4. Growing costs', quality: '5. No B grade or cut'};
function tcBridgeChart(tc) {
  const W = tcBridge(tc, TC_BR, 'Cost per pick now', 'Target cost per pick');
  if (!W) return null;
  return [waterfall(W.map((it) => it.gap ? {...it, tip: `${it.label}: left out, no figure (the table says why)`} : it), `Cost per pick now to the target cost per pick, step by step, ${dfmt(tc.date)}`, null, {dec: 2}),
    el('p', {class: 'note', text: `Each bar is a step of the table below, in paise per pick: green lowers the cost per pick, red raises it; a step left out reads "—" (the table says why and what to do). The last bar is the Target cost per pick tile, ${pn(tc.cpp, 2)} paise.`})];
}
function tcCard() {
  if (!COST) return null;
  const date = D.latest, tc = tcRun(date);
  if (!tc.ok) return card(TC_CARD, `${dfmt(date)} · target cost per pick, step by step`,
    el('p', {class: 'empty', text: `${tcUnavail(date)}. Next: ${tcNext()}. This card never uses another day's costing.`}));
  const hgTab = (name) => () => navGoCard('quality', name);
  const go = (t, name) => el('button', {class: 'link', type: 'button', text: name ? `${TITLES[t]}: ${name}` : TITLES[t], onclick: () => name ? navGoCard(t, name) : setTab(t)});
  const toCosting = (name) => el('button', {class: 'link', type: 'button', text: `Costing: ${name}`, onclick: () => { CDATE = date; navGoCard('costing', name); }});
  const st = Object.fromEntries(tc.steps.map((x) => [x.id, x]));
  const rsC = (x) => !ok(x) ? '—' : rs(x);
  const left = tcGapText(tc);
  // a step left out says why, with the same next step as tcGapText
  const noComp = `left out: no compressor reading for ${dfmt(date)}. Next: ${tcNext()}`;
  const why = (id) => id === 'cfm' && !tc.comp ? noComp : id === 'press' && st.press.pp == null ? (tc.comp ? (!ok(COMP_SP) ? (canEdit() ? 'left out: type the compressor set point on the Pressure tab' : 'left out: the compressor set point is not typed in yet. Next: tell the owner') : !ok(pMargin()) ? (tcOwner() ? 'left out: no set point margin. Next: add setpoint_margin_kgf to the Config sheet Settings tab' : 'left out: no set point margin yet. Next: tell the owner') : `left out: no main pressure readings for ${dfmt(date)}. Next: ${tcNext()}`) : noComp) : null;
  const lk = (p) => pn(p / 1e5, 2);
  const A = tc.add;
  const at = (v, r, dec, miss) => ok(r) ? `${rsC(v)} at ₹${pn(r, dec)}/m${dec === 3 ? ' (month to date)' : ''}` : `left out (${miss})`;
  const SAME_RS = '₹0 · same rupees, more picks';
  const stepRow = (label, sub, x, link, rsText) => [el('div', {}, el('div', {text: label}), sub ? el('div', {class: 'note', text: sub}) : null, link ? el('div', {}, link) : null),
    x && x.pp != null ? tcPp(x.pp) : el('span', {class: 'pill muted', text: 'left out'}), x && x.rs != null ? (rsText ? el('span', {class: 'tcsame', text: rsText}) : rsC(x.rs)) : '—'];
  const steps = el('div', {class: 'nosort tcsteps'}, table(['Step', ['Per pick', 'paise'], ['The day', '₹']], [
    [el('b', {text: 'Cost per pick now'}), pn(tc.c0, 2), rsC(tc.c0 / 100 * tc.P)],
    stepRow('1. Every loom at its target CFM', why('cfm') || `${ok(tc.Sc) ? f0(tc.Sc / tc.rate) : '—'} kWh less at ₹${f2(tc.rate)} a unit (Power (Compressor) for the day)`, st.cfm, go('cfm', 'Current vs benchmark, best and target, by loom')),
    stepRow('2. Compressor at the set point needed with every loom at its best pressure', why('press') || (COMP_SP > tc.need ? `${f2(COMP_SP)} → ${f2(tc.need)} kgf/cm² (the floor with every loom at its best main pressure, ${f2(tc.floorT)}, + margin; for pressure the target is the best, whatever the Pressure tab's Reference switch shows), on the air left after step 1` : `the compressor runs at ${f2(COMP_SP)} kgf/cm², already at or below the ${f2(tc.need)} needed with every loom at its best main pressure (floor ${f2(tc.floorT)} + margin): nothing to save`) + (tc.noTgtP ? ` · ${tc.noTgtP} of ${tc.nPress} looms have no best pressure yet and stay where they run` : ''), st.press, go('pressure')),
    stepRow('3. Every loom at its target effective RPM', `+${lk(tc.E)} lakh picks, looms that ran only; a loom already above its target adds nothing; the same fixed costs are shared over ${lk(tc.P + tc.E)} lakh picks`, st.picks, go('erpm'), SAME_RS),
    stepRow('4. Costs that grow with the extra picks', `+${f0(tc.dM)} m: compressor power ${rsC(A.power)} · warping ${at(A.warping, tc.rates.warping, 2, 'no rate on the day\'s file')} · transport ${at(A.transport, tc.rates.transport, 2, 'no rate on the day\'s file')} · packing ${at(A.packing, tc.rates.packing, 3, 'no packing amount this month yet')}. Every other expense line stays the same.`, st.added, toCosting('Power')),
    stepRow('5. No B grade and no cut pieces', `the B grade expense line ${rs(st.quality.bgrade)} and the cut piece loss ${rs(st.quality.cut)} both taken as 0`, st.quality, toCosting('B grade and cut pieces')),
    [el('b', {text: 'Target cost per pick'}), el('b', {text: pn(tc.cpp, 2)}), rsC(tc.cpp / 100 * (tc.P + tc.E))]], [1, 2]));
  // the loom-wise / head-group-wise table, gaps last with the next step
  const hg = bv('tc') === 'hg';
  const R = hg ? tcGroup(tc.parts, (q) => q.hg + '|' + q.width) : tc.rows;
  // the next step for a row's gap: a missing target → Targets; no picks per metre → Costing; a missing reading → Data health (owner) or tell the owner
  const gapCell = (o) => { const g = o.gap, tg = /no target/.test(g), pm = g.includes('picks per metre');
    const rd = /no CFM reading|no picks recorded/.test(g), next = [];   // one next step per kind of gap the row has
    if (tg) next.push(el('button', {class: 'link', type: 'button', text: 'Set a target on Targets', onclick: () => setTab('targets')}));
    if (pm) next.push(el('button', {class: 'link', type: 'button', text: 'Check the day on Costing', onclick: () => toCosting('Production by quality head group').click()}));
    if (rd || !next.length) next.push(tcOwner() ? el('button', {class: 'link', type: 'button', text: 'See Files per day on Data health', onclick: () => setTab('data')}) : el('span', {class: 'note', text: 'Next: tell the owner'}));
    return el('div', {}, el('span', {class: 'pill muted', style: 'white-space:normal', text: g}), ...next.map((n) => el('div', {}, n))); };
  const name = (o) => hg ? el('div', {}, el('button', {class: 'link', type: 'button', text: `${o.hgs[0]} · ${o.width}`, onclick: hgTab('Current vs reference')}))
    : el('div', {}, loomLink(o.loom, date, 'Loom ' + o.loom), el('div', {class: 'note', text: `${o.hgs.join(', ')} · ${o.width} cm`}));
  const cell = (v, fmt) => ok(v) ? fmt(v) : '—';
  const phone = window.matchMedia('(max-width: 560px)').matches;
  const tot = R.reduce((a, o) => ({cfm: a.cfm + (o.cfmRs || 0), E: a.E + (o.E || 0), dM: a.dM + (o.dM || 0), ef: a.ef + o.effect}), {cfm: 0, E: 0, dM: 0, ef: 0});
  const top = [el('p', {class: 'note tcfull', text: tcFull(tc)}), ...(tcBridgeChart(tc) || [])];
  if (!R.length) return card(TC_CARD, `${dfmt(date)} · target cost per pick, step by step`, ...top, steps, el('p', {class: 'empty', text: `No loom ran on ${dfmt(date)}, so there is no loom to bring to its targets. Pick another day with the date chip at the top of the page.`}));
  const heads = [hg ? 'Head group' : 'Loom', hg ? ['Looms', 'ran'] : null, ['CFM saving', '₹'], ['Extra picks', 'lakh'], ['Extra metres', 'm'], ['Effect on cost per pick', 'paise']].filter(Boolean);
  const body = phone
    ? sortableChart('tc-' + (hg ? 'hg' : 'loom'), R, [{v: 'name', label: hg ? 'Head group' : 'Loom', get: (o) => hg ? o.hgs[0] : o.loom, d: 'a'}, ...(hg ? [{v: 'looms', label: 'Looms', get: (o) => o.looms.length}] : []),
      {v: 'cfm', label: 'CFM saving', get: (o) => o.cfmRs}, {v: 'E', label: 'Extra picks', get: (o) => o.E}, {v: 'dM', label: 'Extra metres', get: (o) => o.dM}, {v: 'ef', label: 'Effect on cost per pick', get: (o) => o.effect, d: 'a'}],
      (RR) => el('div', {}, RR.map((o) => el('div', {style: 'padding:10px 0;border-top:1px solid var(--line, #ddd)'}, name(o),
        hg ? el('div', {text: `Looms: ${o.looms.length}`}) : null,
        el('div', {text: `CFM saving: ${cell(o.cfmRs, rs)} · Extra picks: ${cell(o.E, (v) => pn(v / 1e5, 3))} lakh · Extra metres: ${cell(o.dM, f0)} m`}),
        el('div', {text: `Effect on cost per pick: ${tcPp(o.effect)} paise`}), o.gap ? gapCell(o) : null))), {b: 'ef', d: 'a'})
    : table(heads, [...R.map((o) => [el('div', {}, name(o), o.gap ? gapCell(o) : null), ...(hg ? [o.looms.length] : []), cell(o.cfmRs, rs), cell(o.E, (v) => pn(v / 1e5, 3)), cell(o.dM, f0), sortAs(el('span', {text: tcPp(o.effect)}), o.none ? null : o.effect)]),
      [el('b', {text: 'Total'}), ...(hg ? [R.reduce((a, o) => a + o.looms.length, 0)] : []), rs(tot.cfm), pn(tot.E / 1e5, 3), f0(tot.dM), tcPp(tot.ef)]], hg ? [1, 2, 3, 4, 5] : [1, 2, 3, 4]);
  return card(TC_CARD, `${dfmt(date)} · headline cost per pick${bName() ? ', ' + bName() : ''} · whole plant, both widths`,
    ...top, steps,
    el('p', {class: 'note', text: `Coverage: ${tc.cover.full} of ${tc.cover.looms} looms that ran have a target CFM, a target RPM and a picks-per-metre figure for their quality on the day's costing; the rest count only the parts they have and are listed below as gaps, never as 0.${left.length ? ' ' + left.join('. ') + '.' : ''}`}),
    el('div', {class: 'toolbar'}, bvSeg('tc')), body,
    el('p', {class: 'note', text: `Effect on cost per pick = (− the CFM saving + the added costs − today's cost per pick × the extra picks) ÷ the target day's ${lk(tc.P + tc.E)} lakh picks. The pressure step (${tcPp(tc.floorPp.press)} paise on that footing) and step 5 (${tcPp(tc.floorPp.quality)} paise) are whole-floor and not split by ${hg ? 'head group' : 'loom'}; with them the rows add up to the change on the tile.`}),
    el('p', {class: 'note', text: 'Folding, beams and dispatch lag the looms. Valuing warping, transport and packing on metres woven assumes they catch up within the month. Extra metres are worked out loom by loom: extra picks ÷ the picks per metre of its quality on the day\'s costing.'}));
}
// Round A1 (Divyam, 24 Nov 2026): Folding shortage by day, opened from the Folding shortage tile (owner for now). Each
// costing day's own shortage and the month to date up to it (foldDays, the tile's own count), its own period (month to
// date to begin with) and a week line on the shortage of each week's days together. A day missing a figure is left out
// and named, never drawn as 0.
let TCFPER = 'mtd';
const FOLD_WIN = 5;   // Round C2b (audit #9): points either side of the month to date line that the day's own dots may stretch the axis to
try { const v = localStorage.getItem('w2-act-fold-period'); if (['7', '14', '30', 'mtd', 'range'].includes(v)) TCFPER = v; } catch (e) {}
function tcFoldCard() {
  if (!COST) return null;
  const title = ACTV.fold[0], bq = COST.bq || {}, sub = 'whole plant, both widths · 1 − (A-grade folded + B grade + cut piece picks) ÷ production picks';
  const all = foldDays(foldSrc(), bq.reg || [], (bq.days || []).filter((d) => d.reg).map((d) => d.date), D.latest);
  if (!all.length) return card(title, sub, el('p', {class: 'empty', text: `No costing day up to ${dfmt(D.latest)} yet. Next: ${tcNext()}.`}));
  const ds = all.map((r) => r.date), inR = TCFPER === 'range' ? new Set(rngDays(ds)) : null, ym = D.latest.slice(0, 7);
  const per = TCFPER === 'mtd' ? all.filter((r) => r.date.slice(0, 7) === ym) : inR ? all.filter((r) => inR.has(r.date)) : all.slice(-(+TCFPER));
  const good = all.filter((r) => !r.why), sh = (L) => { const P = L.reduce((a, r) => a + r.P, 0); return P > 0 ? 1 - L.reduce((a, r) => a + r.A + r.B + r.C, 0) / P : null; };
  const b = (v, t, sh2) => el('button', {type: 'button', 'aria-pressed': TCFPER === v ? 'true' : 'false', 'aria-label': t, onclick: () => { TCFPER = v; try { localStorage.setItem('w2-act-fold-period', v); } catch (e) {} render(); }}, el('span', {class: 'lgl', text: t}), el('span', {class: 'sml', text: sh2 || t}));
  const bar = el('div', {class: 'toolbar perbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Period'}, b('7', '7 days', '7d'), b('14', '14 days', '14d'), b('30', '30 days', '30d'), b('mtd', 'Month to date', 'MTD'), b('range', 'Dates')),
    TCFPER === 'range' ? rngCtl(ds, render) : null, per.length ? el('span', {class: 'note', text: `${TCFPER === 'mtd' ? 'Month to date: ' : ''}${dfmt(per[0].date)} – ${dfmt(per.at(-1).date)} · ${per.filter((r) => !r.why).length} of ${per.length} costing day${per.length === 1 ? '' : 's'} with every figure`}) : null,
    wkPill(wkBy(good, D.latest, (r) => r.date, sh, 'down'), {what: 'Folding shortage', fmt: (v) => (100 * v).toFixed(1), unit: '%', dunit: ' points'}));
  const pc = (v) => pcz(v, 1), lk = (p) => pn(p / 1e5, 2);   // Round C2b (audit #9): "0.0%", never "−0.0%"
  // Round C2b (audit #9): the month to date line (the tile) leads; the day's own figure is faint dots; the axis fits the month to
  // date line ± FOLD_WIN points and the dots inside that, and a dot outside it sits at the edge as an arrow with its value
  const mv = per.map((r) => ok(r.mtd) && r.mtdDays ? 100 * r.mtd : null);
  const chart = per.some((r) => ok(r.s)) ? lineChart({id: 'act-fold', dates: per.map((r) => r.date), aria: 'Folding shortage by day, %', fmt: (v) => pn(v, 1).replace(/^-(?=0\.0$)/, '').replace('-', '−') + '%',
    series: [{key: 'mtd', name: 'Month to date, %', vals: mv}, {key: 'day', name: 'The day\'s own, %', vals: per.map((r) => ok(r.s) ? 100 * r.s : null), dots: true, win: dotWin(mv, FOLD_WIN),
      per: perAvg(per, {get: (r) => ok(r.s) ? 100 * r.s : null, agg: 'w', w: (r) => r.P})}]})   // Round C2a (#29): 1 − Σ (folded + B grade + cut) ÷ Σ production picks, the days with every figure
    : el('p', {class: 'empty', text: 'No day in this period has every figure: pick a longer period.'});
  const last = per.at(-1);
  const tb = actTable('fold', ['Date', ['Production picks', 'lakh'], ['A-grade folded', 'lakh picks'], ['B grade', 'lakh picks'], ['Cut pieces', 'lakh picks'], ['The day\'s own', '%'], ['Month to date', '%']],
    per.slice().reverse().map((r) => r.why ? [[dfmt(r.date), el('span', {class: 'pill muted', text: `left out: ${r.why}`}), '—', '—', '—', '—', pc(r.mtdDays ? r.mtd : null)], [r.date, null, null, null, null, null, r.mtdDays ? r.mtd : null]]
      : [[dfmt(r.date), lk(r.P), lk(r.A), lk(r.B), lk(r.C), pc(r.s), pc(r.mtd)], [r.date, r.P, r.A, r.B, r.C, r.s, r.mtd]]), [1, 2, 3, 4, 5, 6]);
  const miss = per.filter((r) => r.why);
  return card(title, sub,
    ...(last ? notePh(`${dfmt(last.date)}: month to date ${pc(last.mtdDays ? last.mtd : null)} over ${last.mtdDays} day${last.mtdDays === 1 ? '' : 's'}${ok(last.s) ? `, the day's own ${pc(last.s)}` : ` (the day itself is left out: ${last.why})`}. The month to date line (solid) is the tile; it starts again on the 1st. The day's own figure is the faint dots; the axis fits the month to date line and the dots within ${FOLD_WIN} points of its range, and a dot off the axis sits at its edge as an arrow with its value.`,
      `${dfmt(last.date)}: month to date ${pc(last.mtdDays ? last.mtd : null)}${ok(last.s) ? `, the day's own ${pc(last.s)}` : ''}. Solid line: month to date (the tile). Dots: each day's own; an arrow at the edge is a day off the axis. More in the Guide, under Actions.`) : []),
    bar, chart, tb,
    miss.length ? el('p', {class: 'note', text: `${miss.length} day${miss.length === 1 ? '' : 's'} left out (a figure missing; never counted as 0). Next: ${tcNext()}.`}) : null,
    ...tcFoldByQ(),
    el('p', {class: 'note', text: 'B grade picks = each register entry\'s metres × its quality\'s picks per metre; cut piece picks = cut metres × the floor\'s average picks per metre that day. The day\'s own figure jumps more than the month to date, because folding lags the looms: a taka woven one day can be folded the next.'}));
}
// Round A10 (Divyam, 26 Nov 2026, D0–D3; design 2026-11-27_folding-shortage-design.md section 3): By quality, under Folding
// shortage by day, for the date chip's day (month to date as at it). One row per quality across both widths (its head group's
// Style-map name, D2), with the widths it ran on: its days with a figure (n of m), its own %, the % used and where it comes
// from (its own once it ran 7 of those days, else its own last month's, else the plant's: D1), its loom picks. Most picks
// first. Then the check line: the figures used, re-added by their loom picks, against the plant's (D3: named, never forced).
// No money (loom picks and %), so it shows wherever this view shows.
function tcFoldByQ() {
  const Q = typeof fxSQDay === 'function' ? fxSQDay(D.latest) : null, h = el('h3', {style: 'margin-top:14px', text: 'By quality'});
  // Round B2 (A10 backlog): while the costing or the loom data loads, say so rather than leave the table out with no word
  if (!Q) return [h, el('p', {class: 'note', text: 'Loading the costing and the loom data… If this stays, press Refresh (the round arrow).'})];
  const R = Object.entries(Q.by).filter(([, e]) => e.picks > 0).map(([q, e]) => ({q, e})).sort((a, b) => b.e.picks - a.e.picks);
  const intro = el('p', {class: 'note', text: `${dfmt(D.latest)}, month to date: each quality's own folding % = each day's own figure weighted by the quality's loom picks that day. It is used once the quality has run on ${Q.min} costing days with a figure (a day on either width counts once); before that, its own figure from last month, then the plant's.`});
  if (!R.length) return [h, intro, el('p', {class: 'empty', text: `No quality wove on a costing day of this month with a figure up to ${dfmt(D.latest)} yet. Next: ${tcNext()}.`})];
  const pc2 = (v) => ok(v) ? (100 * v).toFixed(2) + '%' : '—', lk = (p) => pn(p / 1e5, 2);
  const mo = (m) => new Date(m + '-01T00:00:00Z').toLocaleString('en-IN', {month: 'short', timeZone: 'UTC'});
  const src = (e) => e.src === 'own' ? 'its own figure' : e.src === 'own-last' ? `its own ${mo(e.from)} figure` : e.src === 'plant' ? `the plant's (ran under ${Q.min} days)`
    : e.src === 'plant-earlier' ? `the plant's of ${dfmt(e.at)} (ran under ${Q.min} days)` : `none yet. Next: ${tcNext()}`;
  const name = (q, e) => `${(e.names.length ? e.names : [q]).join(' / ')} · ${e.ws.join(' and ')} cm`;
  const tb = actTable('foldq', ['Quality', ['Days with a figure', `of ${Q.mdays}`], ['Its own', '% month to date'], ['Figure used', '%'], ['From', 'which'], ['Loom picks', 'lakh']],
    R.map(({q, e}) => [[name(q, e), `${e.n} of ${Q.mdays}`, pc2(e.own), el('b', {text: pc2(e.s)}), src(e), lk(e.picks)], [name(q, e), e.n, e.own, e.s, src(e), e.picks]]), [1, 2, 3, 5]);
  if (typeof wkPut === 'function') {   // the Working: the first quality on its own figure, else the first row; and the check line
    const t = R.find((x) => x.e.src === 'own') || R[0];
    wkPut('B4:q', {name: name(t.q, t.e), num: t.e.num, pf: t.e.pf, n: t.e.n, m: Q.mdays, s: t.e.s, own: t.e.own, src: t.e.src, min: Q.min});
    wkPut('B4:qt', ok(Q.readd) ? {readd: Q.readd, ps: Q.ps, lp: Q.lp} : null);
  }
  const pl = Q.back.filter((x) => x.src !== 'own-last'), la = Q.back.filter((x) => x.src === 'own-last'), sgn = (v) => (Math.round(v * 100) < 0 ? '−' : '+') + Math.abs(v).toFixed(2);   // the sign of the figure as shown, as the Working's line
  const why = [pl.length ? `${pl.length} quality${pl.length === 1 ? '' : ' qualities'} on the plant's figure (${lk(pl.reduce((a, x) => a + x.pf, 0))} lakh picks)` : null,
    la.length ? `${la.length} on its own last month's figure` : null,
    Q.lp > 0 && Math.abs(Q.cp / Q.lp - 1) >= 0.00005 ? `costing picks are ${Math.abs(100 * (Q.cp / Q.lp - 1)).toFixed(2)}% ${Q.cp >= Q.lp ? 'above' : 'below'} loom picks` : null,
    Q.unas > 0 ? `${lk(Q.unas)} lakh picks with no head group at the plant's figure` : null].filter(Boolean);
  const chk = ok(Q.readd) ? `Check: the figures used, re-added by their loom picks, give ${pc2(Q.readd)} against the plant's ${pc2(Q.ps)} (${sgn(100 * Q.diff)} points)${why.length ? ': ' + why.join(', ') : ''}. A check, not a gap: nothing is forced to tie.`
    : `Check: not worked out yet (no costing day this month has a figure). Next: ${tcNext()}.`;
  // Round C2b (Divyam, 28 Nov 2026, audit #33): the figures used as ranked bars above the table, the plant's month to date as a
  // dashed line; a quality on its own figure in lime (now), one on a fallback (last month's, the plant's) grey. No money.
  const fb = R.filter(({e}) => ok(e.s)), fo = R.filter(({e}) => !ok(e.s));
  const qchart = fb.length ? [signedBars(fb.map(({q, e}) => ({label: name(q, e), v: 100 * e.s, own: ok(e.own) ? 100 * e.own : null, lp: e.picks, color: e.src === 'own' ? 'var(--bar)' : 'var(--muted-2)', text: pc2(e.s),
      title: `${name(q, e)}: figure used ${pc2(e.s)} (${src(e)}); its own ${pc2(e.own)} month to date over ${e.n} of ${Q.mdays} days; ${lk(e.picks)} lakh loom picks`})),
    {aria: `Folding % used for each quality, month to date as at ${dfmt(D.latest)}`, fmt: (v) => pn(v, 2) + '%', axis: 'Folding % used, month to date', labelW: 150, limit: 15, nameLabel: 'Quality', sortLabel: 'Figure used', sortId: 'act-foldq-bars',
      sortBases: [{v: 'own', label: 'Its own % month to date', get: (r) => ok(r.own) ? r.own : null}, {v: 'lp', label: 'Loom picks', get: (r) => ok(r.lp) ? r.lp : null}],
      ref: ok(Q.ps) ? {v: 100 * Q.ps, label: `Plant ${pc2(Q.ps)}`} : null}),
    el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bar)'}), 'its own figure'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--muted-2)'}), 'a fallback: its own last month\'s, or the plant\'s'),
      el('span', {class: 'lg'}, legendShape('dash'), 'the plant\'s month to date')),
    fo.length ? el('p', {class: 'note', text: `No folding figure yet (not drawn, never 0): ${fo.map(({q, e}) => name(q, e)).join('; ')}. Next: ${tcNext()}.`}) : null,
    typeof actCut === 'function' ? actCut(fb.length, 15, 'qualities') : null] : [];
  return [h, intro, ...qchart, tb, el('p', {class: 'note', text: chk})];
}
// ================================================================ END COSTING TAB
// COSTING-TAB>>
