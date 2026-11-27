// W2 Looms · app/calc.js — Pure calculations behind the comparison visuals (heat grids, floor ladder, beams, calendars,
// cost types). No DOM and no page state: each function takes plain records and returns plain records, so
// tests/test_calc.py can run them under Node on hand-made inputs. Loaded after model.js (uses ok and agg).
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';

// ---- gap to a reference, for the heat grids. p = (now − reference) ÷ reference × 100, signed the way the value sits
// (+ above, − below); worse says whether that side is the bad one for the metric (hi = higher is better).
function gapPct(now, ref, hi) {
  if (!ok(now) || !ok(ref) || ref === 0) return null;
  const p = (now - ref) / Math.abs(ref) * 100;
  return {p, worse: Math.abs(p) < 1e-9 ? false : hi ? p < 0 : p > 0};
}
// Colour strength of a gap, 0 to 1: full at HEAT_FULL % or more.
const HEAT_FULL = 10;
const heatLevel = (p) => !ok(p) ? 0 : Math.min(1, Math.abs(p) / HEAT_FULL);

// ---- Pressure: the floor ladder. looms: [{loom, hg, width, main, ref}], every loom on the compressor. At each step the
// loom setting the floor is brought down to its reference (lowest loom number first on a tie) and the floor is worked out
// again. The ladder stops after `max` steps, or when a loom at the floor cannot come down (no reference, or already at or
// below it): `held` names it. drop = how far that step lowered the floor (0 when another loom sits at the same level).
function floorLadder(looms, max = 5) {
  const L = (looms || []).filter((l) => ok(l.main));
  if (!L.length) return {now: null, steps: [], held: null, after: null};
  const cur = new Map(L.map((l) => [l.loom, l.main]));
  const top = () => Math.max(...cur.values());
  const now = top();
  let floor = now, held = null;
  const steps = [];
  while (steps.length < max) {
    const at = L.filter((l) => Math.abs(cur.get(l.loom) - floor) < 1e-9).sort((a, b) => a.loom - b.loom);
    const stuck = at.find((l) => !(ok(l.ref) && l.ref < cur.get(l.loom) - 1e-9));
    if (stuck) { held = {loom: stuck.loom, hg: stuck.hg, width: stuck.width, main: cur.get(stuck.loom), why: !ok(stuck.ref) ? 'no reference' : 'at or below its reference'}; break; }
    const fix = at[0];
    cur.set(fix.loom, fix.ref);
    const nf = top();
    steps.push({loom: fix.loom, hg: fix.hg, width: fix.width, from: fix.main, to: fix.ref, before: floor, floor: nf, drop: floor - nf});
    floor = nf;
  }
  return {now, steps, held, after: floor};
}

// ---- Warp breaks by beam. recs: loom-day records (run ≥ 60 min already applied). One row per loom and beam:
// breaks ÷ machine picks × 100,000 over every day the beam ran.
function beamStats(recs) {
  const by = new Map();
  for (const x of recs || []) {
    if (!x.beam) continue;
    const k = x.loom + '|' + x.beam;
    let b = by.get(k);
    if (!b) by.set(k, b = {loom: x.loom, beam: x.beam, hg: x.hg, width: x.width, dates: new Set(), picks: 0, warp: 0, first: x.date, last: x.date});
    b.dates.add(x.date); b.picks += x.picks || 0; b.warp += x.warp || 0;
    if (x.date < b.first) b.first = x.date;
    if (x.date >= b.last) { b.last = x.date; b.hg = x.hg; }
  }
  return [...by.values()].map((b) => ({...b, days: b.dates.size, dates: [...b.dates].sort(), rate: b.picks > 0 ? b.warp / b.picks * 1e5 : null}))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.loom - b.loom || a.beam.localeCompare(b.beam));
}
// The beam each loom carries now: the beam of its latest record (the longer-running one when a day has two). A beam that has
// been changed out is history and no longer actionable (Divyam, 10 Nov 2026), so the warp tab lists only these.
function currentBeams(recs) {
  const cur = new Map();
  for (const x of recs || []) {
    if (!x.beam) continue;
    const c = cur.get(x.loom);
    if (!c || x.date > c.date || (x.date === c.date && (x.run || 0) > c.run)) cur.set(x.loom, {date: x.date, run: x.run || 0, beam: x.beam});
  }
  return new Map([...cur].map(([l, c]) => [l, c.beam]));
}

// ---- dates
const addDays = (d, k) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);   // b − a, in days
const weekStart = (d) => { const t = new Date(d + 'T00:00:00Z'); return addDays(d, -((t.getUTCDay() + 6) % 7)); };

// ---- Data health: one cell per calendar day for the n days ending on `end`. days: [{date, status}] from the daily run.
// status: complete; missing (a file came but the day is not complete, or no file came and a later day did); later
// (after the newest day with a file: not in yet); before (before the oldest day on record).
function dayCalendar(days, end, n = 30) {
  const st = new Map((days || []).map((d) => [d.date, d.status]));
  const newest = (days || []).reduce((a, d) => d.date > a ? d.date : a, ''), oldest = (days || []).reduce((a, d) => !a || d.date < a ? d.date : a, '');
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    const date = addDays(end, -k), s = st.get(date);
    out.push({date, status: s === 'complete' ? 'complete' : s ? 'missing' : date > newest ? 'later' : date < oldest ? 'before' : 'missing', raw: s || null});
  }
  return out;
}
// Files the daily run looked at, per folder day and status: {date: {ingested: 2, quarantined: 1, ...}}.
function filesPerDay(files) {
  const out = {};
  for (const f of files || []) { const d = f.folder_date || f.date; if (!d) continue; const o = out[d] = out[d] || {}; o[f.status || 'other'] = (o[f.status || 'other'] || 0) + 1; }
  return out;
}

// ---- Costing: cost per pick split by cost type, in paise. Each type = its lines' rupees ÷ picks; cut = cut-piece loss ÷
// picks. They add up to the headline cost per pick whenever the day's lines add up to its total (the Files check).
const COST_TYPES = ['fixed', 'attendance', 'output', 'lumpy'];
function costTypes(day) {
  if (!day || !(day.picks > 0)) return null;
  const P = day.picks * 1e5, o = {fixed: 0, attendance: 0, output: 0, lumpy: 0};
  for (const l of day.lines || []) { const t = COST_TYPES.includes(l.t) ? l.t : 'lumpy'; o[t] += (l.a || 0) / P * 100; }
  o.cut = (day.cut || 0) / P * 100;
  o.sum = COST_TYPES.reduce((a, t) => a + o[t], 0) + o.cut;
  return o;
}
// The same over a list of days (a week): rupees summed, then ÷ the days' picks.
function costTypesOf(days) {
  const L = (days || []).filter((d) => d && d.picks > 0);
  if (!L.length) return null;
  const sum = {picks: L.reduce((a, d) => a + d.picks, 0), cut: L.reduce((a, d) => a + (d.cut || 0), 0), lines: L.flatMap((d) => d.lines || [])};
  return costTypes(sum);
}

// ---- B grade: a head group × period grid of B-grade share (latest day on its own, the rest in 7-day blocks).
// days: [{date, reg}] (reg = the register was read that day); reg: [{date, hg, m}]; hgM: {date: {hg: produced metres}}.
// Share = B-grade metres ÷ produced metres of the head group in that week, register days only.
function hgWeekShare(days, reg, hgM) {
  const regDays = (days || []).filter((d) => d.reg).map((d) => d.date).sort();
  const weeks = [...new Set(regDays.map(weekStart))];
  return hgBucketShare(weeks.map((w) => regDays.filter((d) => weekStart(d) === w)), reg, hgM, weeks);
}
// The register days of a period split so the LATEST day stands alone at the right, and the days before it fall in 7-day
// blocks counted back from the day before it (the oldest block may be shorter). Divyam, 10 Nov 2026: the latest data on its
// own, the rest of the period separately. Returns [[dates], …] oldest first, the last one being [latest].
function latestBuckets(days) {
  const R = (days || []).filter((d) => d.reg).map((d) => d.date).sort();
  if (!R.length) return [];
  const last = R.at(-1), rest = R.slice(0, -1), out = [];
  if (rest.length) {
    const end = addDays(last, -1);
    const by = new Map();
    for (const d of rest) { const k = Math.floor(daysBetween(d, end) / 7); if (!by.has(k)) by.set(k, []); by.get(k).push(d); }
    for (const k of [...by.keys()].sort((a, b) => b - a)) out.push(by.get(k));
  }
  out.push([last]);
  return out;
}
// B-grade share of each head group in each bucket of register days (buckets: [[dates]]), and over all of them.
function hgBucketShare(buckets, reg, hgM, ids) {
  const cell = {};   // hg -> bucket index -> {m, prod}
  const idx = new Map(); buckets.forEach((L, i) => L.forEach((d) => idx.set(d, i)));
  const get = (hg, i) => { const c = cell[hg] = cell[hg] || {}; return c[i] = c[i] || {m: 0, prod: 0}; };
  for (const [d, i] of idx) for (const [hg, m] of Object.entries((hgM || {})[d] || {})) get(hg, i).prod += m || 0;
  for (const e of reg || []) if (idx.has(e.date)) get(e.hg, idx.get(e.date)).m += e.m || 0;
  const rows = Object.keys(cell).map((hg) => {
    const cells = buckets.map((_, i) => { const c = cell[hg][i]; const id = ids ? ids[i] : i; return c ? {week: id, m: c.m, prod: c.prod, pct: c.prod > 0 ? 100 * c.m / c.prod : null} : {week: id, m: 0, prod: 0, pct: null}; });
    const m = cells.reduce((a, c) => a + c.m, 0), prod = cells.reduce((a, c) => a + c.prod, 0);
    return {hg, cells, m, prod, pct: prod > 0 ? 100 * m / prod : null};
  }).filter((r) => r.prod > 0 || r.m > 0).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.m - a.m || a.hg.localeCompare(b.hg));
  return {weeks: ids || buckets.map((_, i) => i), buckets, rows};
}

// ---- top k layers of a stacked chart by their total; the rest are added into one "Other" layer.
// layers: [{name, vals}] with vals aligned on the same days.
function topLayers(layers, k, otherName = 'Other') {
  const tot = (l) => l.vals.reduce((a, v) => a + (ok(v) ? v : 0), 0);
  const L = (layers || []).filter((l) => tot(l) > 0).sort((a, b) => tot(b) - tot(a) || a.name.localeCompare(b.name));
  if (L.length <= k + 1) return L;
  const rest = L.slice(k), n = L[0].vals.length;
  return [...L.slice(0, k), {name: otherName, other: rest.length, vals: Array.from({length: n}, (_, i) => rest.reduce((a, l) => a + (ok(l.vals[i]) ? l.vals[i] : 0), 0))}];
}

// ---- Rounded figures that still add up: each value to `dec` decimals, then the units lost to rounding go to the values with
// the largest remainders, so the shown figures sum exactly to the rounded total (the bridges' effects on screen).
function balanced(vals, dec = 2) {
  const k = Math.pow(10, dec), raw = vals.map((v) => (ok(v) ? v : 0) * k);
  const fl = raw.map(Math.floor), want = Math.round(raw.reduce((a, v) => a + v, 0));
  let left = want - fl.reduce((a, v) => a + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const out = fl.slice();
  for (let j = 0; left > 0 && j < order.length; j++, left--) out[order[j][1]] += 1;
  return out.map((v) => v / k);
}

// ---- 12 Nov 2026 round
// B grade in rupees from the plant's B.LOSS table (12 Nov 2026, Divyam): the pipeline gives each register entry its metres
// × its quality's rupees per metre in that day's B.LOSS (50% of the quality's rate) as e.rs. An entry without one (B.LOSS not
// read that day, or no line for its quality) stays unvalued (null: a gap, never ₹0).
function bgEntryRs(entries) {
  return (entries || []).map((e) => e && ok(e.rs) ? e.rs : null);
}
// Summed by a key of the entry (head group, loom): {key: {rs, miss}}; rs is null when no entry of the key could be valued.
function bgRsBy(entries, keyOf) {
  const v = bgEntryRs(entries), out = {};
  (entries || []).forEach((e, i) => { const k = keyOf(e), o = out[k] || (out[k] = {rs: null, miss: 0}); if (ok(v[i])) o.rs = (o.rs || 0) + v[i]; else o.miss++; });
  return out;
}
// Savings as paise per pick of the whole floor (CFM tab, 12 Nov 2026): each row's rupees ÷ the floor's picks, so the rows
// add up to the floor's total paise per pick saved. null where rupees or picks are missing.
function floorPaise(rupees, picks) {
  const each = rupees.map((r) => ok(r) && picks > 0 ? 100 * r / picks : null);
  const tot = rupees.filter(ok).reduce((a, r) => a + r, 0);
  return {each, total: picks > 0 && rupees.some(ok) ? 100 * tot / picks : null};
}

// ---- Sheet checks on the Costing tab (Divyam, 14 Nov 2026; owner only). Three sources, three names on screen:
//   "Plant file"  = the plant's costing.xlsx as uploaded (app_data 'cost_checks', days[d].plant);
//   "Recomputed"  = the CPP task's corrected tab (the plant's own entries with per-pick, progressives, totals and cost per pick
//                   worked out again), the Plant file basis of the app-wide switch (COST.days_entered);
//   Realisation and profit use "Recomputed + power fix" (COST.days), which these cards do not compare.
// A missing figure is a gap: its difference is null (shown "—"), never 0.
// Under these the two sides agree: rupees, the files' 2-decimal rounding; picks, the app data's lakh to 4 decimals (±5 picks);
// paise per pick, the files' 5-decimal rupees.
const SC_TOL = {rs: 0.5, picks: 10, paise: 0.001};
const scDiff = (p, c, unit) => !ok(p) || !ok(c) ? {d: null, state: 'gap'} : (Math.abs(p - c) < SC_TOL[unit] ? {d: p - c, state: 'agree'} : {d: p - c, state: 'differ'});

// The plant's lines, same-named lines added together (OPERATOR appears twice), as the pipeline's line_map does for the
// recomputed side. lines: [[name, amount, progressive, month total]]. A null in any copy of a line keeps that figure null.
function scPlantLines(lines) {
  const out = new Map();
  for (const [n, a, prog, mt] of lines || []) {
    const o = out.get(n);
    if (!o) { out.set(n, {n, a: ok(a) ? a : null, prog: ok(prog) ? prog : null, mt: ok(mt) ? mt : null}); continue; }
    o.a = ok(o.a) && ok(a) ? o.a + a : null; o.prog = ok(o.prog) && ok(prog) ? o.prog + prog : null; o.mt = ok(o.mt) && ok(mt) ? o.mt + mt : null;
  }
  return out;
}

// Plant file vs recomputed for one day. plant = cost_checks days[d].plant ({lines, total, prog_total, month_total, picks, prog_picks,
// month_picks, cpp, fcpp}: rupees, picks, rupees per pick); day = the Recomputed day (COST.days_entered: lines {n, a, prog, mt},
// total, prog_total, mtd.amount, picks and mtd.picks in lakh, cpp_ex and fcpp in paise). One row per figure:
// {line, fig: 'Day' | 'Progressive' | 'Month', unit, plant, corr, d, state}; the statement's totals first, then the lines.
// Order: differing rows (totals, then the biggest difference), then gaps, then the rows that agree in statement order.
// adj (optional) = sheetAdjust(...) for that day: the expected part of the file's Progressive and Month figures under the day
// rules; with it, and with the plant's POWER (COMPRESSOR) counted again in TOTAL AMOUNT (scCompPart), each row carries exp
// (expected part, null when it cannot be worked out) and left (difference − expected), and a difference that is all expected
// gets state 'expected' instead of 'differ'.
function sheetPlantVs(plant, day, adj) {
  if (!plant || !day) return null;
  const rows = [], add = (line, fig, unit, p, c, total, e) => {
    const r = {line, fig, unit, plant: ok(p) ? p : null, corr: ok(c) ? c : null, total: !!total, ...scDiff(p, c, unit)};
    rows.push(scExpect(r, e === undefined ? 0 : e, unit));
  };
  const lk = (x) => ok(x) ? x * 1e5 : null, pz = (x) => ok(x) ? x * 100 : null;
  const m = day.mtd || {};
  const at = adj ? adj.total : 0, al = (n) => !adj ? 0 : !ok(adj.total) ? null : ((adj.lines[n] || {}).total || 0);
  const plus = (a, b) => ok(a) && ok(b) ? a + b : null;
  add('TOTAL AMOUNT', 'Day', 'rs', plant.total, day.total, true, scCompPart(plant, 'a'));
  add('TOTAL AMOUNT', 'Progressive', 'rs', plant.prog_total, day.prog_total, true, plus(at, scCompPart(plant, 'prog')));
  add('TOTAL AMOUNT', 'Month', 'rs', plant.month_total, m.amount, true, plus(at, scCompPart(plant, 'mt')));
  add('PICK', 'Day', 'picks', plant.picks, lk(day.picks), true);
  add('PICK', 'Month', 'picks', plant.month_picks, lk(m.picks), true, adj ? adj.picks : 0);
  add('COST PER PICK', 'Day', 'paise', pz(plant.cpp), day.cpp_ex, true);
  add('COST PER PICK (FOLDED)', 'Day', 'paise', pz(plant.fcpp), day.fcpp, true);
  const P = scPlantLines(plant.lines), C = new Map((day.lines || []).map((l) => [l.n, l]));
  const names = [...P.keys(), ...[...C.keys()].filter((n) => !P.has(n))];
  for (const n of names) {
    const p = P.get(n) || {}, c = C.get(n) || {};
    add(n, 'Day', 'rs', p.a, c.a); add(n, 'Progressive', 'rs', p.prog, c.prog, false, al(n)); add(n, 'Month', 'rs', p.mt, c.mt, false, al(n));
  }
  const rank = {differ: 0, gap: 1, expected: 2, agree: 3};
  const idx = new Map(rows.map((r, i) => [r, i]));
  const big = (r) => Math.abs(ok(r.left) ? r.left : r.d);
  rows.sort((a, b) => rank[a.state] - rank[b.state] || (a.state === 'differ' ? (b.total - a.total) || big(b) - big(a) : 0) || idx.get(a) - idx.get(b));
  const n = (s) => rows.filter((r) => r.state === s).length;
  return {rows, differ: n('differ'), gap: n('gap'), agree: n('agree'), expected: n('expected')};
}

// A row's expected part: exp (0 = none, null = cannot be worked out) and left = difference − exp. A differing row whose
// difference is all expected becomes 'expected'. Gaps and agreeing rows keep their state.
function scExpect(r, e, unit) {
  r.exp = ok(e) ? e : (e === null ? null : 0);
  r.left = ok(r.d) && ok(r.exp) ? r.d - r.exp : (ok(r.d) && r.exp === null ? null : r.d);
  if (r.state === 'differ' && ok(r.exp) && Math.abs(r.exp) >= SC_TOL[unit] && Math.abs(r.left) < SC_TOL[unit]) r.state = 'expected';
  return r;
}

// ---- Day rules (Config Sheet Settings tab; Diwali break, Divyam 14 Nov 2026). rules = cost_checks.json `rules`:
// {excluded, reason, double, double_except, double_extra}. Excluded days are left out of costing; the plant still carries their
// amounts in its month totals. Double-pay days are costed single; the plant books the double (the day's single amount on every
// line above the salary TOTAL except double_except, plus double_extra) into the next day's PROGRESSIVE. Both are an expected
// part of the file's month totals, not errors; a double-pay line the plant booked differently is a reconciliation issue.
// Mirrors pipeline/day_rules.py and costing.py mtd_expected (the notification); cpp.py's validator checks the same carry.
const drKey = (n) => String(n == null ? '' : n).replace(/\s+/g, '').toUpperCase();
function drIsDouble(name, above, R) {
  const k = drKey(name);
  return (above && !(R.double_except || []).includes(k)) || (R.double_extra || []).includes(k);
}

// The expected part of the plant file's PROGRESSIVE and TOTAL columns on day d (both carry it): the plant's day amounts on the
// excluded days of the month before d, and the correct double for the double-pay days of the month before d. cc = cost_checks
// days ({date: {plant}}). null when no rule touches the month before d. A day the rules need whose plant file is not read
// (or whose salary TOTAL could not be placed) is listed in missing, and every figure is then null: never guessed.
function sheetAdjust(cc, R, d) {
  if (!R || !d || !cc) return null;
  const ym = d.slice(0, 7), exs = R.excluded || [];
  const ex = exs.filter((x) => x.slice(0, 7) === ym && x < d).sort();
  const db = (R.double || []).filter((x) => x.slice(0, 7) === ym && x < d && !exs.includes(x)).sort();
  if (!ex.length && !db.length) return null;
  const lines = {}, missing = [];
  const add = (n, k, v) => { const o = lines[n] || (lines[n] = {line: n, excl: 0, dbl: 0, total: 0}); o[k] += v; o.total += v; };
  let picks = 0;
  for (const x of ex) {
    const p = (cc[x] || {}).plant;
    if (!p) { missing.push(x); continue; }
    for (const [n, a] of p.lines || []) if (ok(a) && a) add(n, 'excl', a);
    picks = ok(picks) && ok(p.picks) ? picks + p.picks : null;   // the plant's PICK month figure carries them too
  }
  for (const x of db) {
    const p = (cc[x] || {}).plant;
    if (!p || !ok(p.above)) { missing.push(x); continue; }
    (p.lines || []).forEach(([n, a], i) => { if (ok(a) && a && drIsDouble(n, i < p.above, R)) add(n, 'dbl', a); });
  }
  const known = !missing.length, sum = (k) => Object.values(lines).reduce((t, o) => t + o[k], 0);
  return {excluded: ex, doubled: db, reason: R.reason || '', missing: missing.sort(), lines: known ? lines : {},
          excl: known ? sum('excl') : null, dbl: known ? sum('dbl') : null, total: known ? sum('total') : null, picks: known ? picks : null};
}

// The plant's POWER (COMPRESSOR) counted again in its TOTAL AMOUNT for one figure ('a' day, 'prog', 'mt' month): the part of
// TOTAL AMOUNT its own lines do not explain, when that equals the compressor line's amount, progressive or month total (within
// ₹1). Expected: the compressor is inside POWER and never a cost (8 Nov 2026), but the plant's TOTAL AMOUNT counted it (in the
// day figure before 10 Nov, in the progressive since). 0 otherwise.
function scCompPart(plant, fig) {
  const c = plant && plant.comp, col = {a: 1, prog: 2, mt: 3}[fig];
  const tot = plant ? {a: plant.total, prog: plant.prog_total, mt: plant.month_total}[fig] : null;
  if (!c || !ok(tot)) return 0;
  let sum = 0;
  for (const l of plant.lines || []) { if (!ok(l[col])) return 0; sum += l[col]; }
  const rest = tot - sum;
  return [c.a, c.prog, c.mt].some((v) => ok(v) && Math.abs(v) >= SC_TOL.rs && Math.abs(rest - v) <= 1) ? rest : 0;
}

// The previous day's double pay in day d's PROGRESSIVE, line by line (rows of the statement, the 2nd OPERATOR as its own row):
// expected = the previous plant day's single amount on a double-pay line (else 0), added = d's PROGRESSIVE − the previous
// day's TOTAL column, gap = added − expected. The previous plant day is the latest one read before d (an excluded day too);
// null unless it is a double-pay day. rows null (with why) when either file or the salary TOTAL's place is missing.
// Rows: the misses (gap of ₹0.50 or more) biggest first, then the lines that carry the double as they should.
function sheetDoublePay(cc, R, d) {
  if (!R || !(R.double || []).length || !cc || !d) return null;
  const p = Object.keys(cc).filter((x) => x < d && x.slice(0, 7) === d.slice(0, 7) && cc[x] && cc[x].plant).sort().pop();
  if (!p || !R.double.includes(p)) return null;
  const P = cc[p].plant, T = (cc[d] || {}).plant;
  if (!T) return {from: p, rows: null, why: 'the plant file for this day has not been read'};
  if (!ok(P.above)) return {from: p, rows: null, why: `the salary TOTAL could not be placed in the ${p} file`};
  const occ = (L) => { const c = {}; return (L || []).map(([n, a, prog, mt], i) => ({n, a, prog, mt, i, k: (c[n] = (c[n] || 0) + 1)})); };
  const PR = occ(P.lines), TR = occ(T.lines);
  const rows = [];
  for (const t of TR) {
    const q = PR.find((x) => x.n === t.n && x.k === t.k);
    const exp = q && ok(q.a) && q.a && drIsDouble(t.n, q.i < P.above, R) ? q.a : 0;
    const added = q && ok(t.prog) && ok(q.mt) ? t.prog - q.mt : null;
    const gap = ok(added) ? added - exp : null;
    if (exp || !ok(gap) || Math.abs(gap) >= SC_TOL.rs)
      rows.push({line: t.n, nth: t.k, expected: exp, added, gap, state: !ok(gap) ? 'gap' : Math.abs(gap) < SC_TOL.rs ? 'agree' : 'differ', i: t.i});
  }
  const misses = rows.filter((r) => r.state === 'differ').sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.i - b.i);
  const rest = rows.filter((r) => r.state !== 'differ');
  const s = (L, f) => L.reduce((t, r) => t + (ok(r[f]) ? r[f] : 0), 0);
  return {from: p, rows: [...misses, ...rest], misses: misses.length, expected: s(rows, 'expected'), added: s(rows, 'added'),
          short: s(misses.filter((r) => r.gap < 0), 'gap'), over: s(misses.filter((r) => r.gap > 0), 'gap'), net: s(misses, 'gap')};
}

// Month to date, file vs correct, on day `date`. plant = that day's plant file (its TOTAL column is the file's month to date);
// days = the Recomputed days (any order). Correct = the sum of the recomputed day amounts from the 1st to `date`. When a day of
// the month up to `date` is not in `days`, every correct figure is a gap (missing lists those days): it is never filled with 0.
// A line that is not in a day's statement counts 0 for that day (the day is there; the line had no amount).
// lines: the lines whose month total differs, biggest first; rest: what the TOTAL AMOUNT difference has that the lines' don't
// (the file's TOTAL column not adding up its own lines). cpp: month cost per pick (excl. cut piece loss), paise.
// With the day rules (R, adj = sheetAdjust for `date`): the excluded days are left out of the month (not missing), each line's
// row and the total carry the expected part (exp, left, state 'expected' as in sheetPlantVs), comp is the plant's POWER
// (COMPRESSOR) counted again in its TOTAL AMOUNT, and rest is what is left after it.
function sheetMtd(plant, days, date, adj, R) {
  if (!plant || !date) return null;
  const by = new Map((days || []).map((d) => [d.date, d]));
  const month = [], skip = new Set((R && R.excluded) || []);
  for (let k = 1; k <= +date.slice(8, 10); k++) { const x = date.slice(0, 8) + String(k).padStart(2, '0'); if (!skip.has(x)) month.push(x); }
  const missing = month.filter((d) => !by.has(d) || !ok(by.get(d).total));
  const have = !missing.length;
  const corr = new Map();
  if (have) for (const d of month) for (const l of by.get(d).lines || []) corr.set(l.n, (corr.get(l.n) || 0) + (ok(l.a) ? l.a : 0));
  const P = scPlantLines(plant.lines);
  const all = [];
  for (const n of [...P.keys(), ...[...corr.keys()].filter((x) => !P.has(x))]) {
    const file = (P.get(n) || {}).mt, correct = have ? (corr.get(n) || 0) : null;
    const e = !adj ? 0 : !ok(adj.total) ? null : ((adj.lines[n] || {}).total || 0);
    all.push(scExpect({line: n, file: ok(file) ? file : null, correct, ...scDiff(file, correct, 'rs')}, e, 'rs'));
  }
  const tc = have ? month.reduce((a, d) => a + by.get(d).total, 0) : null;
  const tp = have ? month.reduce((a, d) => a + (ok(by.get(d).picks) ? by.get(d).picks * 1e5 : NaN), 0) : null;
  const comp = scCompPart(plant, 'mt');
  const te = !adj ? comp : ok(adj.total) ? adj.total + comp : null;
  const total = scExpect({line: 'TOTAL AMOUNT', file: ok(plant.month_total) ? plant.month_total : null, correct: tc, ...scDiff(plant.month_total, tc, 'rs')}, te, 'rs');
  const big = (r) => Math.abs(ok(r.left) ? r.left : r.d);
  const lines = all.filter((r) => r.state === 'differ').sort((a, b) => big(b) - big(a));
  const expected = all.filter((r) => r.state === 'expected').sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const gaps = all.filter((r) => r.state === 'gap' && have);
  const sumL = [...lines, ...expected].reduce((a, r) => a + r.d, 0);
  const rest0 = ok(total.d) ? total.d - sumL - comp : null;
  const cppC = have && ok(tp) && tp > 0 ? 100 * tc / tp : null, cppF = ok(plant.cpp_month) ? plant.cpp_month * 100 : null;
  return {days: month.length, missing, total, lines, expected, gaps, comp, adj: adj || null,
          rest: ok(rest0) && Math.abs(rest0) >= SC_TOL.rs ? rest0 : (ok(rest0) ? 0 : null),
          cpp: {file: cppF, correct: cppC, ...scDiff(cppF, cppC, 'paise')}};
}

// The CPP task's checks of the plant's file for one day (cost_checks days[d].checks: {headline, counts, counts_fig, findings,
// more}). null = the day was not validated (a gap). Errors and warnings only, new first, errors before warnings.
// 16 Nov 2026 (Divyam): a finding carries `fig`, the app figure it can change ('' = none, hidden here and counted in `hidden`).
// A day checked before then has counts_fig null and fig null on every finding: classified = false, nothing is hidden.
// mode 'new' (the card opens on it) | 'standing' | 'all' filters the rows; tabs = each button's count. The counts (KPI tiles)
// are the findings that can change a figure (counts_fig; on an older day every finding) and never follow the mode. Counts come
// from the validator's headline and cover every finding, also those past the 40 the Validation tab lists (unlisted).
function sheetChecks(c, mode) {
  if (!c) return null;
  mode = ['new', 'standing', 'all'].includes(mode) ? mode : 'new';
  const sev = {ERROR: 0, WARN: 1};
  const classified = !!c.counts_fig;
  const all = (c.findings || []).filter((f) => f.sev in sev).map((f, i) => ({...f, i}))
    .sort((a, b) => (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1) || sev[a.sev] - sev[b.sev] || a.i - b.i);
  const shown = classified ? all.filter((f) => f.fig !== '' && f.fig !== null && f.fig !== undefined) : all;
  const isNew = (f) => f.status === 'new';
  const pick = {new: shown.filter(isNew), standing: shown.filter((f) => !isNew(f)), all: shown};
  const k = classified ? c.counts_fig : (c.counts || null), kAll = c.counts || null;
  const kn = k ? {new: k.errors_new + k.warnings_new, all: k.errors + k.warnings} : null;
  if (kn) kn.standing = kn.all - kn.new;
  const tabs = kn ? {new: Math.max(kn.new, pick.new.length), standing: Math.max(kn.standing, pick.standing.length), all: Math.max(kn.all, pick.all.length)}
    : {new: pick.new.length, standing: pick.standing.length, all: pick.all.length};
  const hidden = !classified ? 0 : (kAll && k) ? Math.max(0, kAll.errors + kAll.warnings - k.errors - k.warnings) : all.length - shown.length;
  return {rows: pick[mode], mode, classified, counts: k, tabs, hidden,
    unlisted: kn ? Math.max(0, kn[mode] - pick[mode].length) : null, headline: c.headline || ''};
}
// What a Sheet checks finding can change, as the card names it under the message (fig: the validator's labels, ", "-joined).
const SC_FIG = {'cost chain': 'cost per pick, folded cost and profit', 'file side': 'the Plant file figures in Plant file vs recomputed and Month to date',
  'production': 'production by quality, looms and picks', 'B grade': 'B grade % and rupee impact', 'stock': 'the Stock card',
  'whole day': 'every figure of this day', 'day rules': 'the Day rules card',
  'not classified': 'possibly any figure: this check is new and not yet sorted, so treat it as one that can'};
function scFigText(fig) {
  if (!fig) return '';
  const parts = String(fig).split(', ').filter((x) => x && x !== 'not checked').map((x) => SC_FIG[x] || x);
  return parts.join('; ');
}
const scNotChecked = (f) => !!f && (f.cat === 'validator' || String(f.fig || '').split(', ').includes('not checked'));

// ---- Why cost per pick moved, against a chosen basis (16 Nov 2026, Divyam). Day records are the Costing tab's days
// (costing.json days / days_entered): picks in lakh, total and cut in rupees, looms, lines [{n, a}] in rupees.
// avgDay: the picks-weighted average day of `days`: the mean of picks, total, cut piece loss and each line's rupees (a line
// missing on a day counts ₹0 that day), so its cost per pick = (Σ total + Σ cut) ÷ Σ picks. Looms are averaged only when
// every day has them (else null, and the volume split is not shown).
function avgDay(days) {
  const L = (days || []).filter((d) => d && ok(d.picks) && d.picks > 0 && ok(d.total));
  if (!L.length) return null;
  const n = L.length, mean = (f) => L.reduce((a, d) => a + f(d), 0) / n;
  const names = [...new Set(L.flatMap((d) => (d.lines || []).map((l) => l.n)))];
  const lines = names.map((nm) => ({n: nm, a: mean((d) => (d.lines || []).filter((l) => l.n === nm).reduce((a, l) => a + (ok(l.a) ? l.a : 0), 0))}));
  return {date: null, n, from: L[0].date, to: L[n - 1].date, picks: mean((d) => d.picks), total: mean((d) => d.total), cut: mean((d) => ok(d.cut) ? d.cut : 0),
    looms: L.every((d) => ok(d.looms) && d.looms > 0) ? mean((d) => d.looms) : null, lines};
}
// cppBridge: costing.py bridge() on these records, in paise per pick, so against the day before it gives the pipeline's own
// daily bridge. Volume = the reference's cost (incl. cut piece loss) over the day's picks less the reference's cost per pick;
// each line (and CUT PIECE LOSS) = its change in rupees ÷ the day's picks. The effects add up exactly to the change.
function cppBridge(ref, r) {
  if (!ref || !r || !(ref.picks > 0) || !(r.picks > 0)) return null;
  const P = r.picks * 1e5, Pp = ref.picks * 1e5, cut = (d) => ok(d.cut) ? d.cut : 0, Np = ref.total + cut(ref);
  const amt = (d) => { const m = new Map(); for (const l of d.lines || []) m.set(l.n, (m.get(l.n) || 0) + (ok(l.a) ? l.a : 0)); return m; };
  const lm = amt(r), pl = amt(ref);
  const lines = [...new Set([...lm.keys(), ...pl.keys()])].sort().map((n) => { const d = (lm.get(n) || 0) - (pl.get(n) || 0); return {n, d, e: d / P * 100}; });
  const dc = cut(r) - cut(ref);
  lines.push({n: 'CUT PIECE LOSS', d: dc, e: dc / P * 100});
  lines.sort((a, b) => Math.abs(b.e) - Math.abs(a.e) || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
  let vs = null;
  if (ok(r.looms) && r.looms > 0 && ok(ref.looms) && ref.looms > 0) {
    const fromL = (r.looms - ref.looms) * (Pp / ref.looms);
    vs = {looms0: ref.looms, looms1: r.looms, ppl0: Pp / ref.looms, ppl1: P / r.looms, picks_looms: fromL / 1e5, picks_perloom: (P - Pp - fromL) / 1e5, picks_change: (P - Pp) / 1e5};
  }
  return {prev_cpp: Np / Pp * 100, now_cpp: (r.total + cut(r)) / P * 100, volume: (Np / P - Np / Pp) * 100, picks0: ref.picks, picks1: r.picks, lines, vol_split: vs};
}
// bridgeBasis: what the day `date` is compared with. mode:
//   'prev'  V yesterday: the last costing day before it (excluded days are not in `days`, so 10 Nov meets 7 Nov);
//   'mtd'   V yesterday avg: the average day of its month from the 1st costing day up to the day before;
//   'month' V running avg: the average day of its month, every costing day so far (the whole month once it is over);
//   'date'  Select date: the costing day `pick`.
// Returns {ref, label, n} or {ref: null, why} when there is nothing to compare with (a gap, never a zero change).
function bridgeBasis(days, date, mode, pick) {
  const D = (days || []).filter((d) => d && d.date), ym = String(date).slice(0, 7);
  const cur = D.find((d) => d.date === date);
  if (!cur) return {ref: null, why: 'no costing day'};
  if (mode === 'prev') {
    const p = D.filter((d) => d.date < date).at(-1);
    return p ? {ref: p, label: p.date, n: 1} : {ref: null, why: 'first'};
  }
  if (mode === 'mtd' || mode === 'month') {
    const L = D.filter((d) => d.date.slice(0, 7) === ym && (mode === 'month' || d.date < date));
    if (!L.length) return {ref: null, why: 'month-first'};
    if (mode === 'month' && L.length === 1) return {ref: null, why: 'month-only'};
    const a = avgDay(L);
    return a ? {ref: a, label: null, n: a.n, from: a.from, to: a.to} : {ref: null, why: 'month-first'};
  }
  if (mode === 'date') {
    const p = D.find((d) => d.date === pick);
    if (!p) return {ref: null, why: 'pick'};
    if (p.date === date) return {ref: null, why: 'same'};
    return {ref: p, label: p.date, n: 1};
  }
  return {ref: null, why: 'mode'};
}

// ---- Round A8 (Divyam, 25 Nov 2026, the Quality period bar, answer 4 a with b on pointing): the floor's effective RPM gap
// to the reference over a set of loom-days: now = Σ picks ÷ Σ (minutes run + stopped); reference = Σ (each loom-day's
// reference effective RPM × its minutes) ÷ Σ minutes, over the loom-days that have a reference (the others are left out of
// both sides, counted in miss). p = (now − reference) ÷ reference × 100 (+ faster, − slower). L: [{picks, run, stop, ref}].
// → {now, ref, p, n, miss} or null (no loom-day with a reference and minutes: a gap, never 0).
function erpmGapPool(L) {
  let p = 0, m = 0, rm = 0, n = 0, miss = 0;
  for (const x of L || []) {
    const mm = (x.run || 0) + (x.stop || 0);
    if (!ok(x.ref) || !(x.ref > 0) || !(mm > 0)) { miss++; continue; }
    p += x.picks || 0; m += mm; rm += x.ref * mm; n++;
  }
  if (!(m > 0)) return null;
  const now = p / m, ref = rm / m;
  return {now, ref, p: (now - ref) / ref * 100, n, miss};
}
// The head groups worse than the reference over the same loom-days: each group's erpmGapPool, worse when its gap is −0.05%
// or lower (the grid shows ±0.0% above that). keyOf(x) → the group's key. → {worse, of} (of = groups with a figure).
function erpmWorse(L, keyOf) {
  const by = new Map();
  for (const x of L || []) { const k = keyOf(x); if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
  let worse = 0, of = 0;
  for (const R of by.values()) { const g = erpmGapPool(R); if (!g) continue; of++; if (g.p <= -0.05) worse++; }
  return {worse, of};
}

// ---- This week vs last week on every period bar (Round D, Divyam 17 Nov 2026, D1–D4).
// D1: "this week" = the 7 days to the day shown, "last week" = the 7 days before them (rolling, not calendar weeks).
const WK_N = 7;
function wkSpans(end) {
  return {cur: {from: addDays(end, -(WK_N - 1)), to: end}, prev: {from: addDays(end, -(2 * WK_N - 1)), to: addDays(end, -WK_N)}};
}
// D2/D3: one week's figure from any records. fig(records) is the card's own headline formula, so the week's figure is
// worked exactly as the card works its period (totals, weighted or averages); days = the days of the week whose own records
// give a figure. A week with no such day has no figure (null, never 0). dateOf(record) → 'YYYY-MM-DD'.
function wkSide(recs, sp, dateOf, fig) {
  const by = new Map();
  for (const r of recs || []) { const d = dateOf(r); if (d >= sp.from && d <= sp.to) { if (!by.has(d)) by.set(d, []); by.get(d).push(r); } }
  let days = 0; for (const L of by.values()) if (ok(fig(L))) days++;
  const v = days ? fig([...by.values()].flat()) : null;
  return {from: sp.from, to: sp.to, v: ok(v) ? v : null, days: ok(v) ? days : 0};
}
// The comparison: d = this week − last week, pct = d ÷ |last week| × 100. better: 'up' (higher is better), 'down', or null
// (neither: no colour). dir: 'up' / 'down' / 'flat' (exactly equal), null when either week has no figure.
function wkCompare(cur, prev, better) {
  const has = ok(cur.v) && ok(prev.v), d = has ? cur.v - prev.v : null;
  const dir = !has ? null : Math.abs(d) < 1e-9 ? 'flat' : d > 0 ? 'up' : 'down';
  return {cur, prev, of: WK_N, d, pct: has && prev.v !== 0 ? d / Math.abs(prev.v) * 100 : null, dir,
    good: !dir || dir === 'flat' || !better ? null : dir === better, short: cur.days < WK_N || prev.days < WK_N};
}
function wkBy(recs, end, dateOf, fig, better) {
  const S = wkSpans(end);
  return wkCompare(wkSide(recs, S.cur, dateOf, fig), wkSide(recs, S.prev, dateOf, fig), better);
}
// Day rows with one figure a day: the week's figure is Σ v·w ÷ Σ w over the days with a figure and a weight above 0
// (w omitted: 1, a plain average a day; w = picks: the picks-weighted mean, which for a per-pick figure is the week's
// rupees ÷ the week's picks).
function wkMean(days, end, get, w, better) {
  const pts = (days || []).map((d) => ({date: d.date, v: get(d), w: w ? w(d) : 1})).filter((p) => ok(p.v) && ok(p.w) && p.w > 0);
  const fig = (L) => { const W = L.reduce((a, p) => a + p.w, 0); return W > 0 ? L.reduce((a, p) => a + p.v * p.w, 0) / W : null; };
  return wkBy(pts, end, (p) => p.date, fig, better);
}

// ================================================================ Round T (Divyam, 20 Nov 2026): the air and compressor card
// One day of the whole floor (both widths: one compressor serves them) for the CFM tab's top card, its three views
// (CFM, Air per 1,000 picks, Compressor power). L: the day's loom-days that ran [{cfm, run, fpicks, tcfm}] (tcfm = the
// head group's target CFM, null where it has none); comp: that day's own Power (Compressor) line {kwh, rate, rupees}, or
// null (a day with no reading is a gap for the compressor figures, never borrowed and never 0).
// Air = Σ CFM × minutes run (ft³). Floor CFM = air ÷ 1,440 (the 24-h average draw). Average CFM per loom = air ÷ minutes
// run (CFM while running). At target: each loom with a target CFM at the lower of its CFM and the target (Target cost per
// pick, step 1); a loom with no target stays as it ran and is counted in noTarget; with no target on any loom the
// target figures are a gap (null), never the day's own figures. Air per 1,000 picks is on fabric picks
// (as the Air column and the benchmarks); the per-pick figures are on picks = fabric picks ÷ 39.37 (the costing basis).
function airDay(L, comp) {
  const R = (L || []).filter((x) => x.run > 0 && ok(x.cfm));
  if (!R.length) return null;
  let air = 0, run = 0, fp = 0, tair = 0, nT = 0;
  for (const x of R) {
    const a = x.cfm * x.run; air += a; run += x.run; fp += ok(x.fpicks) ? x.fpicks : 0;
    if (ok(x.tcfm)) { nT++; tair += Math.min(x.cfm, x.tcfm) * x.run; } else tair += a;
  }
  const picks = fp / 39.37, cfm = air / 1440, c = comp && ok(comp.kwh) && ok(comp.rupees) && air > 0 ? comp : null;
  return {looms: R.length, noTarget: R.length - nT, air, run, fpicks: fp, picks, tair: nT ? tair : null,
    cfm, tcfm: nT ? tair / 1440 : null, gap: nT ? (tair - air) / 1440 : null, lcfm: run > 0 ? air / run : null,
    apk: fp > 0 ? 1000 * air / fp : null, tapk: fp > 0 && nT ? 1000 * tair / fp : null,
    kwh: c ? c.kwh : null, rate: c ? c.rate : null, rupees: c ? c.rupees : null,
    rsCfm: c ? c.rupees / cfm : null, kwhLakh: c && picks > 0 ? 1e5 * c.kwh / picks : null, ppPick: c && picks > 0 ? 100 * c.rupees / picks : null,
    kwhAir: c ? 1000 * c.kwh / air : null, rsAir: c ? 1000 * c.rupees / air : null,
    ref: {bm: airRef(R, 'bm', air, run, fp, c), best: airRef(R, 'best', air, run, fp, c), tg: airRef(R, 'tcfm', air, run, fp, c)}};
}
// Round U (Divyam, 20 Nov 2026): the card's reference line, one per reference (bm benchmark, best, tg target; key = the
// loom-day field holding that reference CFM). Each loom above its reference is brought down to it, a loom at or below it
// or with none stays as it ran (counted in `none`), as the at-target figures of Round T did. The compressor's kWh and
// rupees fall by the air taken off × the energy rate for the CFM saving (Round V: the fitted slope, else the 30-day average;
// comp.k), at the day's ₹ a unit (as Target cost per pick step 1), so Cost per CFM,
// Energy per air and Cost per air have no line (they would not move). No loom with that reference = every figure null.
// over / overApk: now − the line (CFM; ft³ per 1,000 picks), never below 0.
function airRef(R, key, air, run, fp, c) {
  let ra = 0, n = 0;
  for (const x of R) { const v = x[key], a = x.cfm * x.run; if (ok(v)) { n++; ra += Math.min(x.cfm, v) * x.run; } else ra += a; }
  const none = R.length - n;
  if (!n) return {n, none, air: null, cfm: null, over: null, lcfm: null, apk: null, overApk: null, kwh: null, rupees: null, kwhLakh: null, ppPick: null};
  // Round V: with the energy rate for the CFM saving (c.k, kWh per ft³) the kWh fall by the air taken off × that rate, the
  // rupees at the day's ₹ a unit; without it (no valid day for the fit) in step with the air, as before
  const f = air > 0 ? ra / air : null, picks = fp / 39.37;
  const kwh = c && ok(f) ? (ok(c.k) ? Math.max(0, c.kwh - (air - ra) * c.k) : c.kwh * f) : null;
  const rupees = c && ok(kwh) ? (ok(c.k) ? (c.kwh > 0 ? kwh * c.rupees / c.kwh : null) : c.rupees * f) : null;
  return {n, none, air: ra, cfm: ra / 1440, over: (air - ra) / 1440, lcfm: run > 0 ? ra / run : null,
    apk: fp > 0 ? 1000 * ra / fp : null, overApk: fp > 0 ? 1000 * (air - ra) / fp : null,
    kwh, rupees, kwhLakh: ok(kwh) && picks > 0 ? 1e5 * kwh / picks : null, ppPick: ok(rupees) && picks > 0 ? 100 * rupees / picks : null};
}

// ================================================================ Round V (Divyam, 20 Nov 2026): the energy rate for the CFM saving
// A robust (Huber) regression of the compressor's kWh a day on the floor's air: kWh = a + b × air (1,000 ft³) + c × set point
// (kgf/cm²). b, the kWh per 1,000 ft³ of air saved, replaces the day's average kWh per ft³ for the CFM saving, Target cost
// per pick steps 1, 2 and 4 and the Air and compressor card's reference line. Settled (Divyam, 20 Nov 2026):
//  · the window is the last ER_WIN valid days ending on the day shown, so a past day never moves; valid = from ER_START (the
//    first power-register day; 1-4 Nov 2026 are left out), a compressor kWh and floor air on the day;
//  · c enters only when the window holds at least two set points with ER_SPDAYS days or more each (else a + b × air);
//  · the window average (the window's total kWh ÷ its total air) is used with fewer than ER_MIN days, R² under ER_R2, or b not above 0 and below the
//    average; with no valid day in the window at all the caller uses the day's own rate, as before;
//  · each day's deviation = its kWh − the fitted kWh of the fit used for that day; an outlier lies more than ER_OUT robust
//    standard deviations (1.4826 × the median absolute deviation of the window's residuals, Huber's own scale) from it,
//    labelled only once the window has ER_MIN days.
// Huber: tuning constant 1.345, solved by iteratively reweighted least squares from the ordinary fit, the scale taken again
// each pass; R² is the plain one of the Huber line on the window's days.
const ER_START = '2026-11-05', ER_WIN = 30, ER_MIN = 10, ER_R2 = 0.7, ER_K = 1.345, ER_OUT = 3, ER_SPDAYS = 5;
// The set point in force on a day: the latest entry of the history [{from, kgf}] taking effect on or before it; null before any.
function spAt(hist, d) {
  let v = null, f = '';
  for (const h of hist || []) if (h && ok(h.kgf) && h.from <= d && h.from >= f) { v = h.kgf; f = h.from; }
  return v;
}
// Weighted least squares through the normal equations (rows X with the intercept column, weights w): β, or null when singular.
function erWls(X, y, w) {
  const p = X[0].length, A = Array.from({length: p}, () => new Array(p + 1).fill(0));
  X.forEach((x, i) => { for (let j = 0; j < p; j++) { for (let k = 0; k < p; k++) A[j][k] += w[i] * x[j] * x[k]; A[j][p] += w[i] * x[j] * y[i]; } });
  for (let c = 0; c < p; c++) {
    let m = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    if (Math.abs(A[m][c]) < 1e-12) return null;
    [A[c], A[m]] = [A[m], A[c]];
    for (let r = 0; r < p; r++) if (r !== c) { const q = A[r][c] / A[c][c]; for (let k = c; k <= p; k++) A[r][k] -= q * A[c][k]; }
  }
  return A.map((r, i) => r[p] / r[i]);
}
const erMed = (v) => { const s = v.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
// The robust standard deviation of residuals: 1.4826 × the median absolute deviation from their median.
const erScale = (r) => { const m = erMed(r); return m == null ? null : erMed(r.map((x) => Math.abs(x - m))) / 0.6744897501960817; };
function huberFit(X, y) {
  const n = y.length; let w = new Array(n).fill(1), b = erWls(X, y, w);
  if (!b) return null;
  const res = (bb) => y.map((v, i) => v - X[i].reduce((a, x, j) => a + x * bb[j], 0));
  let it = 0;
  for (; it < 200; it++) {
    const r = res(b), s = erScale(r);
    if (!(s > 0)) break;   // the points sit on the line: nothing to down-weight
    w = r.map((x) => Math.abs(x) <= ER_K * s ? 1 : ER_K * s / Math.abs(x));
    const nb = erWls(X, y, w); if (!nb) return null;
    const done = nb.every((v, j) => Math.abs(v - b[j]) <= 1e-10 * (1 + Math.abs(v)));
    b = nb; if (done) break;
  }
  const r = res(b), my = y.reduce((a, v) => a + v, 0) / n, tot = y.reduce((a, v) => a + (v - my) ** 2, 0);
  return {beta: b, w, resid: r, scale: erScale(r), r2: tot > 0 ? 1 - r.reduce((a, v) => a + v * v, 0) / tot : null, iter: it};
}
// series: [{d, kwh, air (ft³)}], any order; hist: the set point history [{from, kgf}]; date: the day shown.
// → {used: 'slope' | 'avg' | 'none', why (avg: 'few' | 'r2' | 'b'), k (kWh per ft³ to use), rate (kWh per 1,000 ft³), avg, a, b,
//    c (null without the set point), useC, sps (set points in the window: [[kgf, days]]), r2, n, from, to, scale, days: [the
//    window's days {d, kwh, air, sp, fit, dev, pct, z, out}], day (the day shown's own entry, or null)}
// Round A2 (Divyam, 24 Nov 2026): opt.press fits a second model beside it, kWh a day = a + b × air (1,000 ft³) + p × the day's
// floor pressure (series r.fl, the highest main pressure, kgf/cm²), on the valid days that also have a floor (no set point
// term). Same window, Huber settings, R² floor and slope check; shown on the owner's kWh against the fit card only, with a
// switch. The energy rate for the CFM saving keeps the current fit until Divyam picks the new one.
function erFit(series, date, hist, opt) {
  const pr = !!(opt && opt.press);
  const W = (series || []).filter((r) => r && r.d >= ER_START && r.d <= date && r.kwh > 0 && r.air > 0 && (!pr || ok(r.fl))).sort((a, b) => a.d.localeCompare(b.d)).slice(-ER_WIN);
  const n = W.length;
  if (!n) return {used: 'none', why: 'none', k: null, rate: null, n: 0, press: pr, days: [], day: null};
  const sk = W.reduce((a, r) => a + r.kwh, 0), sa = W.reduce((a, r) => a + r.air, 0), avg = 1000 * sk / sa;
  const sp = W.map((r) => spAt(hist, r.d)), cnt = new Map();
  for (const v of sp) if (ok(v)) cnt.set(v, (cnt.get(v) || 0) + 1);
  const sps = [...cnt.entries()].sort((a, b) => a[0] - b[0]);
  const useC = !pr && sp.every(ok) && sps.filter((e) => e[1] >= ER_SPDAYS).length >= 2;
  let fit = null, why = null;
  if (n < ER_MIN) why = 'few';
  else {
    fit = huberFit(W.map((r, i) => pr ? [1, r.air / 1000, r.fl] : useC ? [1, r.air / 1000, sp[i]] : [1, r.air / 1000]), W.map((r) => r.kwh));
    if (!fit || !ok(fit.r2) || fit.r2 < ER_R2) why = 'r2';
    else if (!(fit.beta[1] > 0) || !(fit.beta[1] < avg)) why = 'b';
  }
  const used = why ? 'avg' : 'slope', a = fit ? fit.beta[0] : null, b = fit ? fit.beta[1] : null, c = fit && useC ? fit.beta[2] : null, p = fit && pr ? fit.beta[2] : null;
  const rate = used === 'slope' ? b : avg;
  const fitted = (r, i) => used === 'slope' ? a + b * r.air / 1000 + (useC ? c * sp[i] : 0) + (pr ? p * r.fl : 0) : avg * r.air / 1000;
  const days = W.map((r, i) => { const f = fitted(r, i); return {d: r.d, kwh: r.kwh, air: r.air, sp: sp[i], fl: pr ? r.fl : null, fit: f, dev: r.kwh - f, pct: f > 0 ? 100 * (r.kwh - f) / f : null}; });
  const scale = used === 'slope' ? fit.scale : erScale(days.map((x) => x.dev));
  for (const x of days) { x.z = scale > 0 ? x.dev / scale : null; x.out = n >= ER_MIN && ok(x.z) && Math.abs(x.z) > ER_OUT; }
  return {used, why, k: rate / 1000, rate, avg, a, b, c, p, press: pr, useC, sps, r2: fit ? fit.r2 : null, n, from: W[0].d, to: W[n - 1].d, scale,
    days, day: days.find((x) => x.d === date) || null};
}
// Round V: the deviation card's week line, the average size of the deviation (|%|) over a week's days
const erAbsPct = (x) => x && ok(x.pct) ? Math.abs(x.pct) : null;

// ================================================================ Round F (Divyam, 18 Nov 2026): set point and target tiles
// ---- Pressure. The set point needed = the floor (the highest main pressure of the day) + the margin from the Config
// sheet's Settings tab (setpoint_margin_kgf, kgf/cm²; it replaced the 0.2 bar line drop). The saving, as a share of the
// compressor's energy, is the rule's pct % per kgf/cm² of the drop from where the compressor runs (`from`) to where it
// needs to run (`to`): 0 where it already runs at or below it, never negative; null when a figure is missing.
function pressNeed(floor, margin) { return ok(floor) && ok(margin) ? floor + margin : null; }
function pressFrac(from, to, pct) { return ok(from) && ok(to) && ok(pct) ? pct / 100 * Math.max(0, from - to) : null; }
// The Pressure tab's two parts, which add up to the whole: the set point brought down to what today's floor needs
// (fix), then the looms brought to their reference (looms), from wherever the fix leaves the compressor.
function pressParts(sp, floorNow, floorNew, margin, pct) {
  const now = pressNeed(floorNow, margin), after = pressNeed(floorNew, margin);
  if (!ok(sp) || !ok(now) || !ok(after)) return {now, after, fix: null, looms: null, total: null};
  const fix = pressFrac(sp, now, pct), looms = pressFrac(Math.min(sp, now), after, pct);
  return {now, after, fix, looms, total: fix + looms};
}

// ---- Folding shortage (Divyam, 18 Nov 2026), month to date up to the day shown, dropped days left out (they are not in
// the costing days): 1 − (A-grade folded picks + B grade picks + cut piece picks) ÷ production picks. B grade picks = each
// register entry's metres × its quality's PICK (PROD.PICK = metres × PICK, so the units meet); an entry whose quality has
// no PICK takes the floor's weighted PICK (the day's production picks ÷ its metres), as cut pieces do. A day without the
// figures it needs (no picks, no A-grade folded picks, no cut piece metres, no B grade register) is left out, never 0.
// days: costing days [{date, picks (lakh), afold (lakh), metres, bgrade: {cut_pcs}}]; reg: [{date, m, ppi}];
// regDays: dates that have a register. → {s, days, of, from, to, A, B, C, P, avgM, out: [{date, why}]} (picks in units).
function foldShort(days, reg, regDays, date) {
  const ym = String(date || '').slice(0, 7), has = new Set(regDays || []);
  const mtd = (days || []).filter((d) => d.date.slice(0, 7) === ym && d.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  const byDay = new Map();
  for (const e of reg || []) { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); }
  let A = 0, B = 0, C = 0, P = 0, avgM = 0, n = 0; const out = [], used = [];
  for (const d of mtd) {
    const x = foldDay(d, byDay, has);
    if (x.why) { out.push({date: d.date, why: x.why}); continue; }
    A += x.A; B += x.B; C += x.C; P += x.P; avgM += x.avgM; n += 1; used.push(d.date);
  }
  return {s: P > 0 ? 1 - (A + B + C) / P : null, days: n, of: mtd.length, from: used[0] || null, to: used[used.length - 1] || null, A, B, C, P, avgM, out};
}
// One costing day's parts of the folding shortage, counted as foldShort counts them (Round A1 shares it): A-grade folded,
// B grade and cut piece picks against production picks; why = the figure the day is missing (the day is then left out).
function foldDay(d, byDay, has) {
  const cut = d.bgrade ? d.bgrade.cut_pcs : null;
  const why = !(d.picks > 0) ? 'no production picks' : !ok(d.afold) ? 'no A-grade folded picks' : !(d.metres > 0) ? 'no metres' : !ok(cut) ? 'no cut piece metres' : !has.has(d.date) ? 'no B grade register' : null;
  if (why) return {date: d.date, why};
  const p = d.picks * 1e5, w = p / d.metres;
  let b = 0, avgM = 0;
  for (const e of byDay.get(d.date) || []) { if (!ok(e.m)) continue; if (ok(e.ppi) && e.ppi > 0) b += e.m * e.ppi; else { b += e.m * w; avgM += e.m; } }
  return {date: d.date, why: null, A: d.afold * 1e5, B: b, C: cut * w, P: p, avgM};
}
// ---- Round A1 (Divyam, 24 Nov 2026): the folding shortage day by day for the Folding shortage tile's chart. Every costing
// day up to `date` (oldest first): its own shortage (s) and the month to date up to it (mtd, as the tile works it: the same
// month, days missing a figure left out); a day missing a figure has s null and says why.
function foldDays(days, reg, regDays, date) {
  const has = new Set(regDays || []), byDay = new Map();
  for (const e of reg || []) { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); }
  const L = (days || []).filter((d) => !date || d.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  const run = {}, out = [];
  for (const d of L) {
    const x = foldDay(d, byDay, has), ym = d.date.slice(0, 7), m = run[ym] || (run[ym] = {A: 0, B: 0, C: 0, P: 0, n: 0});
    if (!x.why) { m.A += x.A; m.B += x.B; m.C += x.C; m.P += x.P; m.n += 1; }
    out.push({...x, s: x.why ? null : 1 - (x.A + x.B + x.C) / x.P, mtd: m.P > 0 ? 1 - (m.A + m.B + m.C) / m.P : null, mtdDays: m.n});
  }
  return out;
}

// ---- PACKING grows at the month-to-date rupees per metre: Σ PACKING ÷ Σ metres over the month's costing days up to the
// day shown (dropped days are not costing days). A day without a PACKING amount or metres is left out (never ₹0); null
// when no day has both.
function packRate(days, date) {
  const ym = String(date || '').slice(0, 7);
  let a = 0, m = 0;
  for (const d of days || []) {
    if (d.date.slice(0, 7) !== ym || d.date > date || !(d.metres > 0)) continue;
    const l = (d.lines || []).find((x) => x.n === 'PACKING');
    if (!l || !ok(l.a)) continue;
    a += l.a; m += d.metres;
  }
  return m > 0 ? a / m : null;
}

// ---- Target cost per pick (Divyam, 18 Nov 2026). The headline cost per pick, on the day passed (Round B1: the chosen basis), for one day: (total expenses +
// cut piece loss) ÷ production picks. Steps applied in order, so they add up:
//   1. CFM: each loom at its target CFM (excess air only, never more air); the compressor's kWh fall by the air saved ×
//      the energy rate for the CFM saving (Round V: comp.k, the fitted slope or the window average; else the day's own kWh
//      per ft³, Power (Compressor) kWh ÷ the floor's air), at its ₹ per unit.
//   2. Pressure: the compressor at the set point needed with every loom at its best main pressure (Round A2: the pressure target is the best) (press.frac, a share of its energy), on the kWh
//      left after step 1.
//   3. Extra picks: each loom that ran at its target effective RPM (93% of target RPM); one already above adds nothing.
//      Fixed costs spread over the larger pick count.
//   4. The lines that grow with the extra picks: POWER (the compressor's units for the extra picks at the loom's new air
//      per pick and the lower pressure), WARPING and TRANSPORT (the rate on the day's file × extra metres) and PACKING
//      (month-to-date ₹ per metre × extra metres). Extra metres loom by loom: extra picks ÷ its quality's PICK.
//   5. No B grade and no cut pieces (Divyam, 18 Nov 2026): the B GRADE line and the cut piece loss to 0.
// Every other line stays fixed. A loom with no target, or no PICK for its quality, is a gap for the step it lacks (never
// 0) and counts in the coverage. A missing compressor reading, set point or line rate leaves that part out, named in gaps.
// Picks are on the costing basis (fabric picks ÷ 39.37); paise per pick; rupees for the day.
// inp = {day: {date, picks (lakh), total, cut, lines: [{n, a, r}], hg: [{hg, root, ppi}]}, comp: {kwh, rate} | null,
//        pack: ₹ per metre | null, frac: pressure share | null, fracWhy, looms: [{loom, width, hg, hg0, run, stop, cfm,
//        erpm, fpicks, pf, tcfm, terpm}]}
const TC_PPI = 39.37;
// Extra fabric picks of one loom-day at its target effective RPM: (target − now) × its run + stop minutes × its panna
// factor; 0 when it already runs at or above the target; null with no target.
function tcExtraFab(x) { return x && ok(x.terpm) && ok(x.erpm) ? Math.max(0, x.terpm - x.erpm) * ((x.run || 0) + (x.stop || 0)) * (x.pf || 1) : null; }
function targetCost(inp) {
  const day = inp && inp.day;
  if (!day || !(day.picks > 0) || !ok(day.total)) return {ok: false, why: 'no costing'};
  const P = day.picks * 1e5, N0 = day.total + (ok(day.cut) ? day.cut : 0);
  const line = (n) => (day.lines || []).find((x) => x.n === n) || null;
  const rate = (n) => { const l = line(n); return l && ok(l.r) ? l.r : null; };
  const ppiBy = new Map();
  for (const h of day.hg || []) { if (!(h.ppi > 0)) continue; if (h.root) ppiBy.set('r:' + h.root, h.ppi); ppiBy.set('n:' + h.hg, h.ppi); }
  const L = (inp.looms || []).filter((x) => x.run > 0);
  const comp = inp.comp && ok(inp.comp.kwh) && ok(inp.comp.rate) ? inp.comp : null;
  const F = L.reduce((a, x) => a + (ok(x.cfm) ? x.cfm * x.run : 0), 0);
  // Round V: comp.k, the energy rate for the CFM saving (kWh per ft³: the fitted slope, else the window average), when given;
  // else the day's own kWh ÷ the floor's air, as before
  const k = comp && F > 0 ? (ok(comp.k) ? comp.k : comp.kwh / F) : null, rho = comp ? comp.rate : null;
  const f = ok(inp.frac) ? inp.frac : null;
  const rW = rate('WARPING'), rT = rate('TRANSPORT'), rP = ok(inp.pack) ? inp.pack : null;
  const recs = L.map((x) => {
    const a0 = ok(x.cfm) ? x.cfm * x.run : 0;
    const a1 = ok(x.tcfm) && ok(x.cfm) ? Math.min(x.cfm, x.tcfm) * x.run : a0;
    const eFab = tcExtraFab(x);
    const E = ok(eFab) ? eFab / TC_PPI : null;
    const ppi = ppiBy.get('r:' + (x.hg0 || x.hg)) || ppiBy.get('n:' + x.hg) || null;
    const dM = ok(E) && ppi ? E / ppi : null;
    const xAir = ok(eFab) && x.fpicks > 0 ? eFab * a1 / x.fpicks : null;
    // no CFM reading: its saving and the air its extra picks need are unknown (a gap, never 0)
    const cfmKwh = k != null && ok(x.tcfm) && ok(x.cfm) ? (a0 - a1) * k : null;
    const addKwh = k != null && ok(x.cfm) && ok(xAir) ? xAir * k * (1 - (f != null ? f : 0)) : null;
    const gaps = [];
    if (!ok(x.cfm)) gaps.push('no CFM reading');
    else if (!ok(x.tcfm)) gaps.push('no target CFM');
    if (!ok(x.terpm)) gaps.push('no target RPM');
    else if (E > 0 && !ppi) gaps.push('no picks per metre for its quality in the day\'s costing');
    else if (E > 0 && !(x.fpicks > 0)) gaps.push('no picks recorded for this loom that day');
    // extra picks count only where the extra metres can be worked out, so every added cost has its picks and vice versa
    const Ek = ok(E) && (E === 0 || (ppi && x.fpicks > 0)) ? E : null;
    return {x, a0, a1, eFab, E: Ek, dM: Ek == null ? null : Ek === 0 ? 0 : dM, ppi, xAir: Ek == null ? null : xAir, cfmKwh, addKwh: Ek == null ? null : addKwh, gaps};
  });
  const sum = (g) => recs.reduce((a, r) => a + (ok(g(r)) ? g(r) : 0), 0);
  const E = sum((r) => r.E), dM = sum((r) => r.dM);
  const gaps = [];
  const Sc = k != null ? sum((r) => r.cfmKwh) * rho : null;
  if (!comp) gaps.push('compressor');
  const K1 = comp ? comp.kwh - (k != null ? sum((r) => r.cfmKwh) : 0) : null;
  const Sp = comp && f != null ? K1 * f * rho : null;
  if (comp && f == null) gaps.push('pressure');
  // the extra picks' compressor power counts whenever there is a reading; without the pressure step it is at today's pressure
  const add = {power: comp && k != null ? sum((r) => r.addKwh) * rho : null,
    warping: rW != null ? rW * dM : null, transport: rT != null ? rT * dM : null, packing: rP != null ? rP * dM : null};
  for (const [n, v] of [['WARPING', add.warping], ['TRANSPORT', add.transport], ['PACKING', add.packing]]) if (v == null && dM > 0) gaps.push('rate:' + n);
  const Add = (add.power || 0) + (add.warping || 0) + (add.transport || 0) + (add.packing || 0);
  const bl = line('B GRADE'), Bq = (bl && ok(bl.a) ? bl.a : 0) + (ok(day.cut) ? day.cut : 0);
  const s0 = 100 * N0 / P, s1 = 100 * (N0 - (Sc || 0)) / P, s2 = 100 * (N0 - (Sc || 0) - (Sp || 0)) / P;
  const s3 = 100 * (N0 - (Sc || 0) - (Sp || 0)) / (P + E), s4 = 100 * (N0 - (Sc || 0) - (Sp || 0) + Add) / (P + E);
  const s5 = 100 * (N0 - (Sc || 0) - (Sp || 0) + Add - Bq) / (P + E);
  const steps = [
    {id: 'cfm', pp: Sc != null ? s1 - s0 : null, rs: Sc != null ? -Sc : null},
    {id: 'press', pp: Sp != null ? s2 - s1 : null, rs: Sp != null ? -Sp : null},
    // step 3 saves no rupee: the same fixed costs are shared over more picks, so its rupees are 0 and the rupee column adds to
    // the foot exactly (Divyam, 19 Nov, H1 option d); its paise still add up. Its effect shows only per pick.
    {id: 'picks', pp: s3 - s2, rs: 0},
    {id: 'added', pp: s4 - s3, rs: Add, parts: add},
    {id: 'quality', pp: s5 - s4, rs: -Bq, bgrade: bl && ok(bl.a) ? bl.a : 0, cut: ok(day.cut) ? day.cut : 0}];
  // per loom (its loom-day records together): CFM saving, extra picks and metres, and its effect on the target cost per
  // pick = (− its CFM saving + its added costs − today's cost per pick × its extra picks) ÷ the target day's picks, so the
  // looms' effects plus the floor-wide pressure and quality steps add up to the whole change.
  const c0 = N0 / P;
  const parts = recs.map((r) => {
    const cRs = r.cfmKwh != null ? r.cfmKwh * rho : null;
    const aRs = (r.addKwh != null ? r.addKwh * rho : 0) + (r.dM != null ? (rW || 0) * r.dM + (rT || 0) * r.dM + (rP || 0) * r.dM : 0);
    // Round A6: a1 (its air after step 1, ft³) and addRs (its added costs, ₹) for the target folded cost per pick by quality
    return {loom: r.x.loom, width: r.x.width, hg: r.x.hg, cfmRs: cRs, E: r.E, Eraw: ok(r.eFab) ? r.eFab / TC_PPI : null, dM: r.dM, gaps: r.gaps, a1: r.a1, addRs: aRs,
      effect: 100 * (-(cRs || 0) + aRs - c0 * (ok(r.E) ? r.E : 0)) / (P + E)};
  });
  const rows = tcGroup(parts, (q) => q.loom);
  const cover = {looms: rows.length, full: rows.filter((o) => !o.gap).length, cfm: recs.filter((r) => ok(r.x.tcfm) && ok(r.x.cfm)).length, rpm: recs.filter((r) => ok(r.x.terpm) && r.ppi).length, recs: recs.length};
  // the whole-floor parts on the same footing as the loom rows (over the target day's picks), so rows + these = the change
  const floorPp = {press: Sp != null ? -100 * Sp / (P + E) : null, quality: s5 - s4};
  return {ok: true, date: day.date, P, E, dM, c0: s0, cpp: s5, steps, rows, parts, floorPp, gaps, cover, Sc, Sp, Add, Bq, add, f, kwhFt3: k, rate: rho,
    rates: {warping: rW, transport: rT, packing: rP}};
}
// targetCost's per-record parts added up by a key (the loom, or head group × width): a figure no record has stays null
// (a gap, never 0); gaps are listed once each.
function tcGroup(parts, key) {
  const by = new Map();
  for (const q of parts || []) {
    const k = key(q), o = by.get(k) || {key: k, loom: q.loom, width: q.width, hgs: [], looms: [], cfmRs: null, E: null, dM: null, effect: 0, gaps: []};
    if (!o.hgs.includes(q.hg)) o.hgs.push(q.hg);
    if (!o.looms.includes(q.loom)) o.looms.push(q.loom);
    if (ok(q.cfmRs)) o.cfmRs = (o.cfmRs || 0) + q.cfmRs;
    if (ok(q.E)) o.E = (o.E || 0) + q.E;
    if (ok(q.dM)) o.dM = (o.dM || 0) + q.dM;
    o.effect += q.effect;
    for (const g of q.gaps) if (!o.gaps.includes(g)) o.gaps.push(g);
    by.set(k, o);
  }
  return [...by.values()].map((o) => ({...o, gap: o.gaps.length ? o.gaps.join('; ') : null, none: o.cfmRs == null && o.E == null}));
}
// Round A9 (Divyam, 26 Nov 2026, point 10): targetFolded, the per pick basis's target folded cost, is removed; Target profit
// per pick uses fcTargetFoldLc (app/fabric_calc.js), the loom cost basis, since Round A4.

// ================================================================ Round J (18 Nov 2026): the Working
// Each "=" mark on a tile or card title opens the Working: the formula in words (app/working.js), then the same line with
// the day's own figures and the result. The screens hand the figures they drew with to wkPut (working.js); WKL[id](d)
// turns them into {line, res, unit}. One rule holds for every entry, by construction (wkOut): the line names the figures
// that go in and ENDS on its result with its unit, so the Result row never shows a figure the line does not end on, and
// never a bare number. res is worked here from those figures and formatted the way the tile or card prints it, so the
// Working and the screen can be checked against each other (tests/test_working.py by hand, headless check_working on
// every mark for every role). null = the figure is a gap.
const wkN = (x, d = 0) => { if (!ok(x)) return '—'; const s = Math.abs(x).toLocaleString('en-IN', {minimumFractionDigits: d, maximumFractionDigits: d}); return (x < 0 && /[1-9]/.test(s) ? '−' : '') + s; };
const wkR = (x, d = 0) => !ok(x) ? '—' : (x < 0 && /[1-9]/.test(Math.abs(x).toFixed(d)) ? '−₹' : '₹') + wkN(Math.abs(x), d);
const wkF = (x, d) => !ok(x) ? '—' : x.toFixed(d);   // toFixed, as most tiles print (no grouping)
const wkS = (x, d) => !ok(x) ? '—' : (x > 0 && /[1-9]/.test(x.toFixed(d)) ? '+' : x < 0 && /[1-9]/.test(Math.abs(x).toFixed(d)) ? '−' : '') + Math.abs(x).toFixed(d);   // signed
const wkPz = (x) => !ok(x) ? '—' : x.toFixed(x !== 0 && Math.abs(x) < 0.1 ? 3 : 2);   // paise per pick of a saving, as on the CFM and Pressure tabs
const wkSum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
// up to n terms written out, then "+ k more" (a sum over many looms)
const wkTerms = (xs, f, n = 3) => xs.slice(0, n).map(f).join(' + ') + (xs.length > n ? ` + ${xs.length - n} more` : '');
const wkPn = (pf) => pf === 2 ? ' × 2 panels' : '';
// The result with its unit, as the Result row shows it ("83.3%", "10.14 lakh", "₹2,135 a day")
const wkShown = (res, unit) => !unit ? res : unit === '%' ? res + '%' : `${res} ${unit}`;
// {line, res, unit, v}: the line is `pre`, then sep (" = " unless the result is read, not worked), then the result and unit
const wkOut = (pre, res, unit, v, sep = ' = ') => ({line: pre + sep + wkShown(res, unit), res, unit: unit || '', v});
const WKL = {
  // ---- A. ideas used on every tab
  A1: (d) => { if (!d || !(d.fpicks > 0)) return null; const p = d.fpicks / 39.37, v = p / 1e5 / (d.days || 1);
    return wkOut(`${wkN(d.fpicks)} fabric picks ÷ 39.37 = ${wkN(p)} picks${d.days > 1 ? ` over ${d.days} days` : ''}`, wkF(v, 2), 'lakh', v); },
  A6: (d) => { if (!d || !ok(d.now) || !ok(d.prev)) return null; const v = d.now - d.prev, zero = !/[1-9]/.test(Math.abs(v).toFixed(d.dp));
    return wkOut(`${wkF(d.now, d.dp)} ${d.unit} on the day − ${wkF(d.prev, d.dp)} ${d.unit}, the average of the ${d.n} day${d.n === 1 ? '' : 's'} before`,
      zero ? '±0' : (v > 0 ? '▲ +' : '▼ −') + Math.abs(v).toFixed(d.dp), d.unit, v); },
  A2e: (d) => { if (!d || !(d.tot > 0)) return null; const v = 100 * d.run / d.tot; return wkOut(`${wkN(d.run)} minutes run ÷ ${wkN(d.tot)} minutes run and stopped × 100`, wkF(v, 1), '%', v); },
  A2r: (d) => { if (!d || !(d.run > 0)) return null; const v = d.picks / d.run; return wkOut(`${wkN(d.picks)} machine picks ÷ ${wkN(d.run)} minutes run`, f0(v), 'RPM', v); },
  A2x: (d) => { if (!d || !(d.tot > 0)) return null; const v = d.picks / d.tot; return wkOut(`${wkN(d.picks)} machine picks ÷ ${wkN(d.tot)} minutes run and stopped`, f0(v), 'effective RPM', v); },
  A3: (d) => { if (!d || !(d.fpicks > 0)) return null; const v = 1000 * d.air / d.fpicks; return wkOut(`${wkN(d.air)} ft³ of air ÷ ${wkN(d.fpicks)} fabric picks × 1,000`, wkF(v, 1), 'ft³ per 1,000 picks', v); },
  A3b: (d) => { if (!d || !ok(d.apk) || !ok(d.rpm)) return null; const v = d.apk * d.pf * d.rpm / 1000;
    return wkOut(`Loom ${d.loom} (${d.hg}): benchmark ${wkF(d.apk, 1)} ft³ per 1,000 picks × ${d.pf} panel${d.pf === 1 ? '' : 's'} × its own ${wkN(d.rpm)} RPM ÷ 1,000`, wkF(v, 1), 'CFM', v); },
  A5: (d) => { if (!d || !ok(d.now) || !ok(d.ref)) return null; const t = d.ref * d.tol / 100, g = d.now - d.ref, miss = d.hi ? d.now < d.ref - t : d.now > d.ref + t;
    return wkOut(`${d.hg}: ${d.what} ${wkN(d.now, d.dp)} against ${d.name} ${wkN(d.ref, d.dp)}. Tolerance ${d.tol}% of ${wkN(d.ref, d.dp)} = ${wkN(t, d.dp + 1)}, so anything ${d.hi ? 'under' : 'over'} ${wkN(d.hi ? d.ref - t : d.ref + t, d.dp + 1)} is marked ${d.hi ? '▼' : '▲'} (this one ${miss ? 'is' : 'is not'}). Gap ${wkN(d.now, d.dp)} − ${wkN(d.ref, d.dp)}`,
      (g >= 0 ? '+' : '−') + Math.abs(g).toFixed(d.dp), d.what, g); },
  A7: (d) => { if (!d || !ok(d.cur) || !ok(d.prev)) return null; const v = d.cur - d.prev, zero = !/[1-9]/.test(d.fmt(Math.abs(v)));
    const of = d.of || 7, u = d.unit || '', du = String(d.dunit != null ? d.dunit : u).trim();
    return wkOut(`this week ${d.fmt(d.cur)}${u}${d.cn < of ? ` (${d.cn} of ${of} days)` : ''} − last week ${d.fmt(d.prev)}${u}${d.pn < of ? ` (${d.pn} of ${of} days)` : ''}`,
      zero ? '±0' : (v > 0 ? '▲ +' : '▼ −') + d.fmt(Math.abs(v)), du, v); },
  A8: (d) => { if (!d || !ok(d.rs) || !(d.picks > 0)) return null; const v = 100 * d.rs / d.picks;
    return wkOut(`${wkR(d.rs)} saved a day ÷ ${wkN(d.picks)} picks × 100`, wkPz(v), 'paise per pick', v); },
  // ---- B. Actions
  B1c: (d) => { if (!d || !(d.run > 0)) return null; const v = d.air / d.run; return wkOut(`${wkN(d.air)} ft³ of air ÷ ${wkN(d.run)} minutes run`, wkF(v, 1), 'CFM', v); },
  B1t: (d) => { if (!d || !ok(d.air)) return null; const v = d.air / 1440; return wkOut(`${wkN(d.air)} ft³ of air in the day ÷ 1,440 minutes`, f0(v), 'CFM', v); },
  B1o: (d) => { if (!d || !ok(d.min)) return null; const v = d.min / 60; return wkOut(`${wkN(d.min)} loom-minutes powered down (24 h less run and stopped, loom by loom) ÷ 60`, wkF(v, 1), 'loom-h', v); },
  B1f: (d) => { if (!d || !ok(d.floor)) return null; return wkOut(`the highest main pressure of any loom that day, on loom ${d.loom} (${d.hg})`, wkF(d.floor, 2), 'kgf/cm²', d.floor, ': '); },
  B3: (d) => { if (!d || !ok(d.c0)) return null; const S = d.steps.filter((s) => ok(s.pp)), v = d.c0 + wkSum(S, (s) => s.pp);
    return wkOut(`${wkF(d.c0, 2)} paise now ${S.map((s) => `${s.pp < 0 ? '−' : '+'} ${Math.abs(s.pp).toFixed(Math.abs(s.pp) < 0.1 && s.pp !== 0 ? 3 : 2)} (${s.name})`).join(' ')}${d.left ? ` (left out: ${d.left})` : ''}`, wkF(v, 2), 'paise', v); },
  B4: (d) => { if (!d || !(d.P > 0)) return null; const v = 1 - (d.A + d.B + d.C) / d.P;
    return wkOut(`${d.days} of ${d.of} days: 1 − (A-grade folded picks ${wkN(d.A)} + B grade picks ${wkN(d.B)} + cut piece picks ${wkN(d.C)}) ÷ production picks ${wkN(d.P)}`, wkF(v * 100, 1), '%', v); },
  // Round A10 (Divyam, 26 Nov 2026): each quality's own folding % (B4:q) and the check line under By quality (B4:qt)
  'B4q': (d) => { if (!d || !(d.pf > 0) || !ok(d.s)) return null; const own = d.num / d.pf, pre = `${d.name}: its ${d.n} of ${d.m} days with a figure, each day's own folding % weighted by its loom picks that day (${wkN(d.pf)} picks)`;
    return d.src === 'own' ? wkOut(pre, wkF(own * 100, 2), '%', own)
      : wkOut(`${pre} = its own ${wkF(own * 100, 2)}%; it ran under ${d.min} such days, so it uses ${d.src === 'own-last' ? 'its own figure from last month' : 'the plant\'s month to date'}`, wkF(d.s * 100, 2), '%', d.s, ': '); },
  'B4qt': (d) => { if (!d || !ok(d.readd) || !ok(d.ps)) return null; const v = 100 * (d.readd - d.ps);
    return wkOut(`each quality's figure used × its loom picks, added up ÷ ${wkN(d.lp)} loom picks = ${wkF(d.readd * 100, 2)}%, against the plant's ${wkF(d.ps * 100, 2)}%`, `${Math.round(v * 100) < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}`, 'points', v, ': '); },
  // Round A10: the Quality bar's pooling (C6) and its week line (C7)
  C6: (d) => { if (!d || !(d.run > 0)) return null; const v = d.picks / d.run;
    return wkOut(`${d.hg}, ${d.w} cm: ${wkN(d.picks)} picks ÷ ${wkN(d.run)} minutes run over ${d.ld} loom-day${d.ld === 1 ? '' : 's'} of 60 minutes or more (Looms ran: ${d.ld})`, f0(v), 'RPM', v); },
  C7: (d) => { if (!d || !ok(d.now) || !(d.ref > 0)) return null; const v = (d.now - d.ref) / d.ref * 100;
    return wkOut(`this week, ${d.n} loom-day${d.n === 1 ? '' : 's'}: ${wkF(d.now, 1)} effective RPM against the ${d.nm} ${wkF(d.ref, 1)} (each loom-day's weighted by its minutes): (${wkF(d.now, 1)} − ${wkF(d.ref, 1)}) ÷ ${wkF(d.ref, 1)} × 100`, wkS(v, 1), '%', v); },
  B6: (d) => { if (!d) return null; const parts = [];
    if (ok(d.rsPicks)) parts.push(`lost picks ${wkN(d.picks)} × ${wkF(d.pp, 2)} paise ${d.by === 'realisation' ? 'of realisation per pick (the owner\'s valuation, in place of the cost per pick)' : 'of cost per pick (the lines paid whether or not the loom weaves)'} = ${wkR(d.rsPicks)}`);
    if (ok(d.rsAir) && d.ft3 > 0) parts.push(`extra air ${wkN(d.ft3)} ft³ × ₹${wkF(d.rsFt3 * 1000, 2)} per 1,000 ft³ = ${wkR(d.rsAir)}`);
    if (ok(d.rsPress) && d.press > 0) parts.push(`its step of the floor ladder (the compressor saving when its pressure comes down to its reference) ${wkR(d.rsPress)}`);
    if (!parts.length) return null; const v = (ok(d.rsPicks) ? d.rsPicks : 0) + (ok(d.rsAir) ? d.rsAir : 0) + (ok(d.rsPress) ? d.rsPress : 0);
    return wkOut(`Loom ${d.loom}: ${parts.join(' + ')}${parts.length > 1 ? '; together' : '; in all'}`, wkR(v), 'a day', v, ' '); },
  C1: (d) => { if (!d || !ok(d.now) || !ok(d.ref) || d.ref === 0) return null; const p = (d.now - d.ref) / Math.abs(d.ref) * 100;
    return wkOut(`${d.hg}, ${d.what}: (${wkN(d.now, d.dp)} − ${d.name} ${wkN(d.ref, d.dp)}) ÷ ${wkN(d.ref, d.dp)} × 100`, `${Math.abs(p) < 0.05 ? '±' : p > 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`, '', p); },
  D1: (d) => { if (!d || !(d.n > 0)) return null; const k = (d.n - 1) * d.p, f = Math.floor(k), w = k - f, v = d.lo + (d.hi - d.lo) * w;
    return wkOut(`${d.hg}, ${d.what}: ${d.n} loom-days in order; ${wkN(d.p * 100)}% of the way along the ${d.n - 1} step${d.n === 2 ? '' : 's'} between them is ${wkN(k, 2)} steps, so ${wkN(w, 2)} of the way from ${wkN(d.lo, d.dp)} to ${wkN(d.hi, d.dp)}: ${wkN(d.lo, d.dp)} × ${wkN(1 - w, 2)} + ${wkN(d.hi, d.dp)} × ${wkN(w, 2)}`, wkN(v, d.dp), d.u || '', v); },
  L1: (d) => { if (!d || !ok(d.rpm)) return null; const v = 0.93 * d.rpm; return wkOut(`${d.hg}, ${d.w} cm: 93% × target RPM ${wkN(d.rpm)}`, f0(v), 'effective RPM', v); },
  // ---- E. CFM and compressor money
  E1n: (d) => d && ok(d.air) ? wkOut(`${wkN(d.air)} ft³ of air in the day ÷ 1,440 minutes`, f0(d.air / 1440), 'CFM', d.air / 1440) : null,
  E1a: (d) => d && ok(d.after) ? wkOut(`${wkN(d.after)} ft³ (each loom above its reference brought down to it, the rest as they ran) ÷ 1,440 minutes`, f0(d.after / 1440), 'CFM', d.after / 1440) : null,
  E1s: (d) => { if (!d || !ok(d.air)) return null; const v = (d.air - d.after) / 1440;
    return wkOut(`${wkN(d.air)} − ${wkN(d.after)} = ${wkN(d.air - d.after)} ft³ a day${d.date ? ` on ${d.date}` : ''}; ÷ 1,440 minutes`, f0(v), 'CFM', v); },
  E1p: (d) => { if (!d || !(d.air > 0)) return null; const v = 100 * (d.air - d.after) / d.air; return wkOut(`${wkN(d.air - d.after)} ft³ saved ÷ ${wkN(d.air)} ft³ now × 100`, wkF(v, 1), '%', v); },
  E2k: (d) => { if (!d || !ok(d.ft3)) return null; const v = d.ft3 * d.kwhFt3; return wkOut(`${wkN(d.ft3)} ft³ of air saved × ${wkF(d.kwhFt3 * 1000, 2)} kWh per 1,000 ft³${d.how ? ` (${d.how})` : ''}`, f0(v), 'kWh a day', v); },
  // Round V: the energy rate for the CFM saving (erFit's figures, costing.js erWk) and each day's kWh against its fit
  E9: (d) => { if (!d || !ok(d.rate)) return null;
    const span = `${d.n} day${d.n === 1 ? '' : 's'}, ${d.from} – ${d.to}`;
    const pre = d.used === 'slope' ? `fit over ${span}: kWh = ${wkN(d.a)} + ${wkF(d.b, 2)} × air in 1,000 ft³${d.useC ? ` + ${wkN(d.c)} × set point (${d.sps})` : ''}, R² ${wkF(d.r2, 2)} (at least ${wkF(d.floor, 2)}) and b between 0 and the average ${wkF(d.avg, 2)}, so the rate is the slope b`
      : d.used === 'avg' ? `${span}: ${d.why === 'few' ? `fewer than ${d.min} days for a fit` : d.why === 'r2' ? `the fit's R² ${wkF(d.r2, 2)} is under ${wkF(d.floor, 2)}` : `the fit's slope ${wkF(d.b, 2)} is not above 0 and below the average`}, so the rate is the window average, its total kWh ÷ its total air × 1,000`
      : `no day from 5 Nov 2026 with a compressor reading and loom data up to ${d.date}, so the rate is the day's own kWh ÷ air × 1,000`;
    return wkOut(pre, wkF(d.rate, 2), 'kWh per 1,000 ft³', d.rate); },
  G6: (d) => { if (!d || !ok(d.kwh) || !ok(d.fit)) return null; const v = d.kwh - d.fit, p = d.fit > 0 ? 100 * v / d.fit : null;
    return wkOut(`${d.date}${ok(d.z) ? `, ${wkS(d.z, 1)} robust standard deviations from the fit${d.out ? ' (an outlier)' : ' (not an outlier)'}` : ''}: ${wkN(d.kwh)} kWh − ${wkN(d.fit)} kWh fitted (${d.how})`, `${wkS(v, 0)} kWh (${wkS(p, 2)}%)`, '', v); },
  G3k: (d) => { if (!d || !ok(d.frac)) return null; const v = d.frac * d.kwh; return wkOut(`${wkF(d.frac * 100, 1)}% of the compressor's ${wkN(d.kwh)} kWh`, f0(v), 'kWh a day', v); },
  E2r: (d) => { if (!d || !ok(d.kwh)) return null; const v = d.kwh * d.rate; return wkOut(`${wkN(d.kwh, 1)} kWh × ₹${wkF(d.rate, 2)} a unit`, wkR(v), 'a day', v); },
  E2m: (d) => { if (!d || !ok(d.rs)) return null; return wkOut(`${wkR(d.rs, 2)} a day × 30 days`, wkR(d.rs * 30), '', d.rs * 30); },
  // Round U: d.src names where the kWh came from (5-19 Nov 2026: the power register, at the costing sheet's ₹ a unit)
  E3d: (d) => d && ok(d.rupees) ? wkOut(`${d.src || 'the costing sheet\'s Power (Compressor) line'} on ${d.date}, ${wkN(d.kwh)} kWh at ₹${wkF(d.rate, 2)} a unit`, wkR(d.rupees), '', d.rupees, ': ') : null,
  E3k: (d) => d && ok(d.kwh) ? wkOut(`${d.src || 'the costing sheet\'s Power (Compressor) line'} on ${d.date}`, f0(d.kwh), 'kWh', d.kwh, ': ') : null,
  E3e: (d) => { if (!d || !(d.ft3 > 0)) return null; const v = d.kwh / d.ft3 * 1000;   // Round T: ft³ only
    return wkOut(`${wkN(d.kwh)} kWh ÷ ${wkN(d.ft3)} ft³ of floor air × 1,000`, wkF(v, 2), 'kWh per 1,000 ft³', v); },
  E3a: (d) => { if (!d || !(d.ft3 > 0)) return null; const v = d.rupees / d.ft3 * 1000; return wkOut(`${wkR(d.rupees)} ÷ ${wkN(d.ft3)} ft³ of floor air × 1,000`, wkR(v, 2), 'per 1,000 ft³', v); },
  // Round T (20 Nov 2026): the CFM and Air per 1,000 picks views of the air and compressor card (calc.js airDay)
  // Round U (20 Nov 2026): the gap to the reference line (calc.js airRef), on the switch's reference (d.w)
  E7o: (d) => { if (!d || !ok(d.rair)) return null; const v = (d.air - d.rair) / 1440;
    return wkOut(`${wkN(d.air)} ft³ now − ${wkN(d.rair)} ft³ with each loom above its ${d.w} CFM brought down to it${d.none ? ` (${d.none} loom${d.none === 1 ? '' : 's'} with no ${d.w} CFM as ${d.none === 1 ? 'it' : 'they'} ran)` : ''} = ${wkN(d.air - d.rair)} ft³; ÷ 1,440 minutes`, f0(v), 'CFM', v); },
  E7r: (d) => { if (!d || !ok(d.rupees) || !(d.air > 0)) return null; const c = d.air / 1440, v = d.rupees / c;
    return wkOut(`${wkR(d.rupees)} ÷ ${wkF(c, 2)} CFM (${wkN(d.air)} ft³ ÷ 1,440 minutes)`, wkR(v, 2), 'a day per CFM', v); },
  E8o: (d) => { if (!d || !(d.fpicks > 0) || !ok(d.rair)) return null; const v = 1000 * (d.air - d.rair) / d.fpicks;
    return wkOut(`(${wkN(d.air)} ft³ now − ${wkN(d.rair)} ft³ with each loom above its ${d.w} CFM brought down to it) ÷ ${wkN(d.fpicks)} fabric picks × 1,000`, wkF(v, 1), 'ft³ per 1,000 picks', v); },
  E8k: (d) => { if (!d || !ok(d.kwh) || !(d.fpicks > 0)) return null; const p = d.fpicks / 39.37, v = 1e5 * d.kwh / p;
    return wkOut(`${wkN(d.kwh)} kWh ÷ ${wkN(p)} picks (${wkN(d.fpicks)} fabric picks ÷ 39.37) × 1,00,000`, f0(v), 'kWh per lakh picks', v); },
  E8r: (d) => { if (!d || !ok(d.rupees) || !(d.fpicks > 0)) return null; const p = d.fpicks / 39.37, v = 100 * d.rupees / p;
    return wkOut(`${wkR(d.rupees)} ÷ ${wkN(p)} picks (${wkN(d.fpicks)} fabric picks ÷ 39.37) × 100`, wkF(v, 2), 'paise per pick', v); },
  E6: (d) => { if (!d || !ok(d.rsFt3)) return null; const v = d.ft3 * d.rsFt3; return wkOut(`${d.date}: this ${d.what}'s ${wkN(d.ft3)} ft³ × the floor's ₹${wkF(d.rsFt3 * 1000, 2)} per 1,000 ft³`, wkR(v), '', v); },
  // ---- F. Effective RPM
  F1n: (d) => d && ok(d.now) ? wkOut(`${wkN(d.now)} fabric picks ÷ 39.37 = ${wkN(d.now / 39.37)} picks`, wkF(d.now / 39.37 / 1e5, 2), 'lakh', d.now / 39.37 / 1e5) : null,
  F1g: (d) => { if (!d || !ok(d.gain)) return null; const v = d.gain / 39.37 / 1e5;
    return wkOut(`(reference − effective RPM) × (run + stopped) minutes × panels, for each loom below its reference: ${d.terms.length ? wkTerms(d.terms, (t) => `loom ${t.loom} (${wkN(t.ref)} − ${wkN(t.now, 1)}) × ${wkN(t.min)}${t.pf === 2 ? ' × 2' : ''}`) : 'no loom'} = ${wkN(d.gain)} fabric picks; ÷ 39.37 = ${wkN(d.gain / 39.37)} picks`, wkF(v, 2), 'lakh', v); },
  F1a: (d) => d && ok(d.now) ? wkOut(`${wkN(d.now)} + ${wkN(d.gain)} fabric picks gained = ${wkN(d.now + d.gain)}; ÷ 39.37 = ${wkN((d.now + d.gain) / 39.37)} picks`, wkF((d.now + d.gain) / 39.37 / 1e5, 2), 'lakh', (d.now + d.gain) / 39.37 / 1e5) : null,
  // the Shortfall cell prints "−n" for a loom below its reference and "0" for one at or past it
  F2: (d) => { if (!d || !ok(d.ref)) return null; const s = d.ref - d.now, p = Math.max(0, s) * d.min * d.pf / 39.37;
    return wkOut(`Loom ${d.loom}: picks short = its shortfall of ${wkN(Math.max(0, s), 1)} effective RPM × ${wkN(d.min)} minutes run and stopped${wkPn(d.pf)} ÷ 39.37 = ${wkN(p)} picks (${wkF(p / 1e5, 2)} lakh). The shortfall: reference ${wkN(d.ref, 1)} − ${wkN(d.now, 1)} now = ${wkN(Math.max(0, s), 1)}, shown as`, s > 0.5 ? '−' + f0(s) : '0', 'effective RPM', s, ' '); },
  // ---- G. Pressure
  G1n: (d) => d && ok(d.floor) ? wkOut(`the highest main pressure of any loom, both widths, on loom ${d.loom}`, wkF(d.floor, 2), 'kgf/cm²', d.floor, ': ') : null,
  G1a: (d) => d && ok(d.floor) ? wkOut(`each loom above its reference brought down to it, the rest as they ran; the highest is then${d.held ? ` on loom ${d.held}` : ''}`, wkF(d.floor, 2), 'kgf/cm²', d.floor, ': ') : null,
  G2: (d) => { if (!d || !ok(d.m) || !ok(d.now)) return null; const a = d.now + d.m, b = d.after + d.m;
    return wkOut(`floor now ${wkF(d.now, 2)} + margin ${wkF(d.m, 2)} = ${wkF(a, 2)}; floor after the work ${wkF(d.after, 2)} + ${wkF(d.m, 2)} = ${wkF(b, 2)}; on the tile`, `needed ${wkF(a, 2)} → ${wkF(b, 2)}`, 'kgf/cm²', a, ': '); },
  G3: (d) => { if (!d || !ok(d.sp) || !ok(d.m)) return null; const P = pressParts(d.sp, d.now, d.after, d.m, d.rule); if (!ok(P.total)) return null;
    const from2 = Math.min(d.sp, P.now);
    const p1 = d.sp > P.now ? `the set point ${wkF(d.sp, 2)} → ${wkF(P.now, 2)} needed now: ${wkF(d.sp - P.now, 2)} × ${d.rule}% = ${wkF(P.fix * 100, 1)}%` : `the set point ${wkF(d.sp, 2)} is already at or below the ${wkF(P.now, 2)} needed now: 0%`;
    const p2 = from2 > P.after ? `${wkF(from2, 2)} → ${wkF(P.after, 2)} needed after the work: ${wkF(from2 - P.after, 2)} × ${d.rule}% = ${wkF(P.looms * 100, 1)}%` : `${wkF(from2, 2)} is already at or below the ${wkF(P.after, 2)} needed after the work: 0%`;
    return wkOut(`part 1, ${p1}; part 2, ${p2}; together`, wkF(P.total * 100, 1), '%', P.total, ' '); },
  G4: (d) => { if (!d) return null; return wkOut(`step 1: loom ${d.loom} (it sets the floor) brought from ${wkF(d.from, 2)} to its reference ${wkF(d.to, 2)}; the floor worked out again drops ${wkF(d.drop, 2)}, from ${wkF(d.before, 2)} to`, wkF(d.floor, 2), 'kgf/cm²', d.floor, ' '); },
  G5: (d) => { if (!d) return null; return wkOut(`${d.hg}: only its looms brought down to their reference (the others as they ran); the highest main pressure is then`, wkF(d.floor, 2), 'kgf/cm²', d.floor, ' '); },
  // ---- H, I. Utilisation and Warp breaks
  H1: (d) => { if (!d) return null; const same = Math.abs(1440 - d.run - d.stop - d.off) < 0.5;   // the daily run counts under 10 minutes as 0 and a missing shift as powered down
    return wkOut(same ? `Loom ${d.loom}: 1,440 − ${wkN(d.run)} minutes run − ${wkN(d.stop)} stopped = ${wkN(d.off)} minutes; ÷ 60`
      : `Loom ${d.loom}: it ran ${wkN(d.run)} and stood ${wkN(d.stop)} minutes; ${wkN(d.off)} minutes powered down as counted for the day (a shift missing from the files counts as powered down; under 10 minutes counts as 0) ÷ 60`, wkF(d.off / 60, 1), 'h', d.off / 60); },
  H3: (d) => { if (!d || !d.effs.length) return null; const v = wkSum(d.effs, (e) => e) / d.effs.length;
    return wkOut(`Loom ${d.loom}: ${d.low} of its last ${d.effs.length} running days under ${d.line}%; Below line = ${d.line} − the average = ${wkF(d.line - v, 1)} points; the average: (${d.effs.map((e) => wkF(e, 1)).join(' + ')}) ÷ ${d.effs.length}`, wkF(v, 1), '%', v); },
  I1: (d) => { if (!d || !(d.picks > 0)) return null; const v = d.warp / d.picks * 1e5;
    return wkOut(`${d.what}${ok(d.med) && d.med > 0 ? ` (${wkF(v / d.med, 1)}× its head group's median rate of ${wkF(d.med, 2)})` : ''}: ${wkN(d.warp)} warp breaks ÷ ${wkN(d.picks)} machine picks × 1,00,000`, wkF(v, 2), 'per 100k picks', v); },
  I2: (d) => { if (!d || !(d.picks > 0)) return null; const v = d.warp / d.picks * 1e5;
    return wkOut(`Beam ${d.beam} on loom ${d.loom} (its beam line is ${wkF(d.line, 2)}): ${wkN(d.warp)} breaks ÷ ${wkN(d.picks)} machine picks over its ${d.days} day${d.days === 1 ? '' : 's'} × 1,00,000`, wkF(v, 2), 'per 100k picks', v); },
};
// ---- J. Costing (picks in lakh, as the costing days carry them)
Object.assign(WKL, {
  J1: (d) => { if (!d || !(d.picks > 0)) return null; const v = 100 * (d.total + (d.cut || 0)) / (d.picks * 1e5);
    return wkOut(`(total expenses ${wkR(d.total)} + cut piece loss ${wkR(d.cut || 0)}) ÷ ${wkN(d.picks * 1e5)} production picks × 100`, wkF(v, 2), 'paise', v); },
  // OPEX is not carried on the app's costing day: it is the costing's OPEX row (on either basis), recovered here from that file's own
  // folded cost per pick, so the line shows each part of the folded cost.
  J2: (d) => { if (!d || !ok(d.fcpp) || !(d.afold > 0)) return null; const P = d.afold * 1e5, bl = ok(d.bl) ? d.bl : 0, br = ok(d.brev) ? d.brev : 0, cut = d.cut || 0;
    const opex = d.fcpp / 100 * P - (bl + cut - br), v = 100 * (opex + bl + cut - br) / P;
    return wkOut(`(OPEX ${wkR(opex)}, the costing sheet's operating expenses row, + B grade loss ${wkR(bl)} + cut piece loss ${wkR(cut)} − B grade revenue ${wkR(br)}) ÷ ${wkN(P)} A-grade folded picks × 100`, wkF(v, 2), 'paise', v); },
  J3p: (d) => { if (!d || !ok(d.picks)) return null; const pk = ok(d.prev) && d.prev > 0 ? (d.picks / d.prev - 1) * 100 : null;
    return wkOut(`${ok(pk) ? `${wkS(pk, 1)}% against ${wkF(d.prev, 2)} lakh on ${d.prevDate} ((${wkF(d.picks, 2)} ÷ ${wkF(d.prev, 2)} − 1) × 100); ` : ''}the costing file's production picks (metres × picks per inch)`, wkF(d.picks, 2), 'lakh', d.picks, ': '); },
  J3t: (d) => d && ok(d.total) ? wkOut(`the costing file's total expenses (its total row, TOTAL AMOUNT), without the cut piece loss`, wkR(d.total), '', d.total, ': ') : null,
  J3m: (d) => d && ok(d.metres) ? wkOut(`picks per loom = ${wkN(d.picks * 1e5)} picks ÷ ${wkN(d.looms, 1)} looms running = ${wkN(d.picks * 1e5 / d.looms)}; the costing file's metres produced`, f0(d.metres), 'm', d.metres, ': ') : null,
  J4: (d) => { if (!d || !(d.total > 0)) return null; const v = d.fixed / d.total; return wkOut(`${wkR(d.fixed)} on lines that are fixed per day ÷ ${wkR(d.total)} total expenses × 100`, wkF(v * 100, 1) + '%', '', v); },
  J5: (d) => { if (!d || !(d.picks > 0)) return null; const v = 100 * (d.amount + (d.cut || 0)) / (d.picks * 1e5);
    return wkOut(`(the month's expenses ${wkR(d.amount)} + its cut piece loss ${wkR(d.cut || 0)}) ÷ ${wkN(d.picks * 1e5)} picks over ${d.days} day${d.days === 1 ? '' : 's'} × 100`, wkF(v, 2), 'paise', v); },
  J6: (d) => d && ok(d.ly) ? wkOut(`today ${wkF(d.cpp, 2)} paise, ${wkS(d.cpp - d.ly, 2)} paise against the same date last month; that date, ${d.lyDate}: (its expenses + cut piece loss) ÷ its picks`, wkF(d.ly, 2), 'paise', d.ly) : null,
  J7: (d) => { if (!d || !ok(d.prev)) return null; const v = wkSum(d.parts, (p) => p.e);
    const sg = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(2);   // as the card's Total row
    return wkOut(`${d.ref}: ${wkF(d.prev, 2)} paise; ${d.date}: ${wkF(d.prev + v, 2)} paise. The parts, in paise: ${d.parts.map((p, i) => `${p.e < 0 ? '−' : i ? '+' : ''} ${Math.abs(p.e).toFixed(2)} (${p.n})`.trim()).join(' ')}`, sg(v), 'paise', v); },
  J8: (d) => { if (!d || !ok(d.prev) || !ok(d.bgrade)) return null; const v = d.prev + d.folding + d.opex + d.bgrade + d.cut;   // Round A9: the net B grade step (missing: a gap, never 0)
    return wkOut(`${d.date}: ${d.prevDate}'s ${wkF(d.prev, 2)} paise ${wkS(d.folding, 2)} (picks folded) ${wkS(d.opex, 2)} (OPEX) ${wkS(d.bgrade, 2)} (net B grade) ${wkS(d.cut, 2)} (cut-piece loss)`, wkF(v, 2), 'paise', v); },
  J9: (d) => { if (!d || !(d.picks > 0)) return null; const P = d.picks * 1e5, v = 100 * (wkSum(d.types, (t) => t.a) + (d.cut || 0)) / P;
    return wkOut(`${d.types.map((t) => `${t.name.toLowerCase()} ${wkR(t.a)}`).join(' + ')} + cut piece loss ${wkR(d.cut || 0)}, each ÷ ${wkN(P)} picks × 100: ${d.types.map((t) => wkF(100 * t.a / P, 2)).join(' + ')} + ${wkF(100 * (d.cut || 0) / P, 2)}`, wkF(v, 2), 'paise', v); },
  J10: (d) => { if (!d || !(d.picks > 0)) return null; const v = 100 * d.fixed / (d.picks * 1e5); return wkOut(`${d.date}: fixed lines ${wkR(d.fixed)} ÷ ${wkN(d.picks * 1e5)} picks × 100`, wkF(v, 2), 'paise', v); },
  J11: (d) => { if (!d || !(d.picks > 0) || !ok(d.a)) return null; const v = 100 * d.a / (d.picks * 1e5); return wkOut(`${d.date}: ${d.n} ${wkR(d.a)} ÷ ${wkN(d.picks * 1e5)} picks × 100`, wkF(v, 2), 'paise', v); },
  J12: (d) => { if (!d || !(d.picks > 0) || !ok(d.units)) return null; const v = d.units / d.picks;
    return wkOut(`power cost per pick ${wkR(d.amount)} ÷ ${wkN(d.picks * 1e5)} picks × 100 = ${wkF(100 * d.amount / (d.picks * 1e5), 2)} paise; ${wkN(d.units)} units ÷ ${wkF(d.picks, 2)} lakh picks`, wkF(v, 0), 'units per lakh picks', v); },
  J13: (d) => { if (!d || !(d.picks > 0) || !ok(d.cost)) return null; const v = 100 * d.cost / (d.picks * 1e5);
    return wkOut(`${wkR(d.cost)} ÷ ${wkN(d.looms, 1)} looms running = ${wkR(d.cost / d.looms)} a loom; labour lines ${wkR(d.cost)} ÷ ${wkN(d.picks * 1e5)} picks × 100`, wkF(v, 2), 'paise', v); },
  J14: (d) => { if (!d || !ok(d.ppi) || !ok(d.cpp)) return null; const v = d.cpp / 100 * d.ppi;
    return wkOut(`${d.hg}: ${wkN(d.tm)} m × ${wkF(d.ppi, 1)} picks per inch = ${wkN(d.tm * d.ppi)} picks; converting cost ${wkF(d.cpp, 2)} paise × ${wkF(d.ppi, 1)} ÷ 100`, '₹' + wkF(v, 2), 'a metre', v); },
  J15: (d) => { if (!d || !(d.produced > 0) || !ok(d.closing)) return null; const v = d.closing / d.produced;
    return wkOut(`${ok(d.dispatch) ? `dispatch ${wkN(d.dispatch)} m ÷ ${wkN(d.produced)} m × 100 = ${wkF(100 * d.dispatch / d.produced, 1)}%; ` : ''}stock days: ${wkN(d.closing)} m closing stock ÷ ${wkN(d.produced)} m produced`, wkF(v, 1), 'days', v); },
  J17: (d) => { if (!d || !(d.af > 0)) return null; const P = d.af, b = ok(d.bl) ? 100 * d.bl / P : null, c = ok(d.cl) ? 100 * d.cl / P : null; if (!ok(b) && !ok(c)) return null;   // P: A-grade folded picks, as the B grade register days carry them
    const v = (ok(b) ? b : 0) + (ok(c) ? c : 0), parts = [ok(b) ? `B grade loss ${wkR(d.bl)} ÷ ${wkN(P)} A-grade folded picks × 100 = ${wkF(b, 2)} paise` : 'no B grade loss on the file (left out)', ok(c) ? `cut piece loss ${wkR(d.cl)} ÷ the same picks × 100 = ${wkF(c, 2)} paise` : 'no cut piece loss on the file (left out)'];
    return wkOut(`${d.date}: ${ok(d.bm) && d.fm > 0 ? `B grade ${wkN(d.bm)} m ÷ ${wkN(d.fm)} m folded × 100 = ${wkF(100 * d.bm / d.fm, 2)}%; ` : ''}${parts.join('; ')}; together`, wkF(v, 2), 'paise', v, ' '); },
  J18: (d) => { if (!d || !(d.prod > 0)) return null; const v = 100 * d.m / d.prod; return wkOut(`${d.hg}: ${wkN(d.m)} m of B grade ÷ ${wkN(d.prod)} m it produced on register days × 100`, wkF(v, 2), '%', v); },
  J19: (d) => { if (!d || !ok(d.file) || !ok(d.calc)) return null; const v = d.file - d.calc, u = d.unit;
    const fm = (x) => u === 'rs' ? wkR(x, 2) : u === 'picks' ? wkN(x) + ' picks' : x.toFixed(3) + ' paise', sg = (x) => (x > 0 ? '+' : '−') + (u === 'rs' ? wkR(Math.abs(x), 2) : u === 'picks' ? wkN(Math.abs(x)) : Math.abs(x).toFixed(3));
    if (d.agree) return wkOut(`${d.what}: ${fm(d.file)} in the plant's file and ${fm(d.calc)} recomputed are within ₹0.50, 10 picks or 0.001 paise of each other`, 'agrees', '', v, ': ');
    return wkOut(`${d.what}: ${ok(d.exp) && d.exp !== 0 ? `${sg(d.exp)} of it is expected from the day rules, ${sg(v - d.exp)} is unexplained; ` : ''}${fm(d.file)} in the plant's file − ${fm(d.calc)} recomputed`, sg(v), u === 'picks' ? 'picks' : u === 'rs' ? '' : 'paise', v); },
  J20: (d) => { if (!d || !ok(d.file) || !ok(d.correct)) return null; const v = d.file - d.correct;
    return wkOut(`the file's month total ${wkR(d.file)} is ${Math.abs(v) < 0.5 ? 'the same as' : `${wkR(Math.abs(v))} ${v >= 0 ? 'more' : 'less'} than`} the correct one: the recomputed day amounts from the 1st, added up`, wkR(d.correct), '', v); },
  J21: (d) => { if (!d || !ok(d.expected) || !ok(d.added)) return null; const v = d.added - d.expected;
    if (Math.abs(v) < 0.5) return wkOut(`${d.line}: the plant added ${wkR(d.added)} (today's running total before the day less ${d.prevDate}'s month total), and ${wkR(d.expected)} was expected (the single amount)`, 'as it should be', '', v, ': ');
    return wkOut(`${d.line}: the plant added ${wkR(d.added)} (today's running total before the day less ${d.prevDate}'s month total); ${wkR(d.expected)} was expected (the single amount); gap ${wkR(d.added)} − ${wkR(d.expected)}`, wkR(v), '', v); },
});

// ================================================================ Round A1 (Divyam, 24 Nov 2026): the Actions tiles' views
// One day's loom-days that ran (already filtered to the day and the width shown), grouped by quality (head group × width):
// picks, fabric picks, minutes run and stopped, air and looms, with efficiency (run ÷ run + stopped), average CFM per loom
// (air ÷ minutes run), the share of the floor's picks and of its air. The groups add up to the floor (the Actions tiles).
// Largest picks first.
function actByQuality(L) {
  const by = new Map(), add = (o, x) => { o.picks += x.picks || 0; o.fpicks += ok(x.fpicks) ? x.fpicks : (x.picks || 0); o.run += x.run || 0; o.stop += x.stop || 0; o.air += x.air || 0; o.looms.add(x.loom); };
  const nu = () => ({picks: 0, fpicks: 0, run: 0, stop: 0, air: 0, looms: new Set()}), tot = nu();
  for (const x of L || []) {
    if (!(x.run > 0)) continue;
    const k = x.hg + '|' + x.width;
    if (!by.has(k)) by.set(k, Object.assign(nu(), {key: k, hg: x.hg, width: String(x.width)}));
    add(by.get(k), x); add(tot, x);
  }
  const fin = (o) => Object.assign(o, {n: o.looms.size, eff: o.run + o.stop > 0 ? 100 * o.run / (o.run + o.stop) : null, cfm: o.run > 0 ? o.air / o.run : null,
    floor_cfm: o.air / 1440, share: tot.fpicks > 0 ? o.fpicks / tot.fpicks : null, airShare: tot.air > 0 ? o.air / tot.air : null});
  return {rows: [...by.values()].map(fin).sort((a, b) => b.fpicks - a.fpicks || a.key.localeCompare(b.key)), total: fin(tot)};
}
// A loom's last change of quality in the loom data up to `upto`: the latest day it ran a head group it did not run on the
// day it last ran before, or ran two head groups in one day (a change within the day). L: loom-days [{date, loom, hg, run}].
// change: {date, from: [...], to: [...]} or null; first: the first day the data holds for the loom (null: it never ran).
function lastChange(L, loom, upto) {
  const by = new Map();
  for (const x of L || []) { if (String(x.loom) !== String(loom) || !(x.run > 0) || (upto && x.date > upto)) continue; if (!by.has(x.date)) by.set(x.date, new Set()); by.get(x.date).add(x.hg); }
  const ds = [...by.keys()].sort();
  let change = null;
  ds.forEach((d, i) => {
    const cur = by.get(d), prev = i ? by.get(ds[i - 1]) : null;
    if (cur.size > 1) change = {date: d, from: prev ? [...prev].sort() : [], to: [...cur].sort()};
    else if (prev && ![...cur].some((h) => prev.has(h))) change = {date: d, from: [...prev].sort(), to: [...cur].sort()};
  });
  return {change, first: ds[0] || null};
}
// The looms at the floor pressure (the day's highest main pressure, both widths), and the next level down with its looms.
// looms: [{loom, hg, width, main}] (D.pressure.looms). A loom is at the floor when its main pressure equals it (1e-6).
function floorLooms(looms, floor) {
  const L = (looms || []).filter((l) => ok(l.main));
  if (!ok(floor) || !L.length) return {at: [], next: null, nextLooms: [], of: L.length};
  const at = L.filter((l) => Math.abs(l.main - floor) < 1e-6), rest = L.filter((l) => l.main < floor - 1e-6);
  const next = rest.length ? Math.max(...rest.map((l) => l.main)) : null;
  return {at, next, nextLooms: next == null ? [] : rest.filter((l) => Math.abs(l.main - next) < 1e-6), of: L.length};
}
// The looms powered down on one day: util rows [{loom, width, run, stop, off}] (off in minutes, already for the day and the
// width shown) with the head groups each ran that day (L: the day's loom-days), else its latest head group (hgNow, the
// loom's last quality: 'last'). Most minutes first; total = the minutes added up (the Powered down tile).
function offLooms(util, L, hgNow) {
  const ran = new Map();
  for (const x of L || []) { if (!(x.run > 0)) continue; const k = String(x.loom); if (!ran.has(k)) ran.set(k, new Set()); ran.get(k).add(x.hg); }
  const rows = (util || []).filter((u) => u.off > 0).map((u) => {
    const h = ran.get(String(u.loom)), last = !h && hgNow ? hgNow[u.loom] || hgNow[String(u.loom)] || null : null;
    return {loom: u.loom, width: String(u.width), off: u.off, run: u.run || 0, stop: u.stop || 0, hgs: h ? [...h].sort() : last ? [last] : [], last: !h && !!last};
  }).sort((a, b) => b.off - a.off || a.loom - b.loom);
  return {rows, total: rows.reduce((a, r) => a + r.off, 0)};
}

// ================================================================ Round A9 (Divyam, 26 Nov 2026): the production check
// One day's loom readings against the costing file's production table, by quality × loom width (the Excel has no loom-wise
// production since its READING sheet went stale on 7 Nov). L: the day's loom-days (D.loomdays of that date, both widths:
// {loom, width, hg0, hg, fpicks, picks, run}); P: that costing day's production rows (COST.days[].prod: {q, root, looms,
// rpm, dm, nm, tm, ppi, pp}); names: {root|width: shown name} (from every loom-day, so an Excel row finds its name on a day
// its quality did not run); set: {pct, m}, the flag levels (app_settings, 0019; 2% and 100 m to begin with).
// - The file has no width column: a row takes the width its quality ran on in the loom readings that day; a quality on both
//   widths gives each row the width whose loom RPM (machine picks ÷ minutes run) is nearer the row's RPM; a quality the looms
//   ran on both widths with fewer than two file lines (or a line with no RPM) is compared across both widths at once ('both').
// - Rows are compared by the shown name × width, so qualities shown as one head group (Pashmina Twill and Rangila Twill as
//   Rangila Twill 54) are compared together, as the plant books them.
// - Loom metres = each loom-day's fabric picks ÷ 39.37 ÷ the file's picks per inch for its own quality (PROD.PICK ÷ metres of
//   its rows, that width), else the name's; loom picks = fabric picks ÷ 39.37 (the file's PROD.PICK unit).
// - Gap = loom − file; % of the file. Flagged when |gap| > set.m metres AND |gap %| > set.pct. A row on one side only
//   (the file has the quality and no loom ran it, the loom readings have it and the file does not, or the file's quality name
//   has no head group) is never 0: it is named with its reason and flagged when its own metres pass set.m (a loom-only row:
//   its picks ÷ the file's picks per metre for the whole day, as it has no picks per inch of its own).
function prodCheck(L, P, names, set) {
  const key = (n, w) => n + '|' + w, nm = names || {};
  const loom = new Map(), rootW = new Map();   // root -> {width: {picks, run}}
  for (const x of L || []) {
    if (!x || !(x.fpicks > 0) || !x.hg0 || x.hg0 === 'Unassigned') continue;
    const w = String(x.width), rw = rootW.get(x.hg0) || {}; rootW.set(x.hg0, rw);
    const t = rw[w] = rw[w] || {picks: 0, run: 0}; t.picks += x.picks || 0; t.run += x.run || 0;
  }
  const xl = new Map(), noHg = [], ppiOf = new Map(), xlOnly = [], both = new Set();
  const lines = new Map(); for (const p of P || []) if (p && p.root) lines.set(p.root, (lines.get(p.root) || 0) + (ok(p.rpm) ? 1 : 1e9));
  for (const [root, rw] of rootW) if (Object.keys(rw).length > 1 && !((lines.get(root) || 0) >= 2 && lines.get(root) < 1e9)) both.add(root);
  for (const p of P || []) {
    if (!p) continue;
    const m = (p.dm || 0) + (p.nm || 0);
    if (!p.root) { noHg.push({q: p.q, m, picks: p.pp || 0, looms: p.looms || 0}); continue; }
    const rw = rootW.get(p.root) || {}, ws = Object.keys(rw);
    let w = ws.length === 1 ? ws[0] : null;
    if (both.has(p.root)) w = 'both';   // one file line (or no RPM) for a quality the looms ran on both widths: compared across both
    else if (ws.length > 1) w = ws.map((k) => [k, rw[k].run > 0 ? rw[k].picks / rw[k].run : null]).filter((a) => a[1] != null)
      .sort((a, b) => Math.abs(a[1] - p.rpm) - Math.abs(b[1] - p.rpm) || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
    if (!w) { xlOnly.push({q: p.q, root: p.root, m, picks: p.pp || 0, looms: p.looms || 0}); continue; }
    const name = nm[key(p.root, w)] || nm[key(p.root, '190')] || nm[key(p.root, '280')] || p.root, k = key(name, w);
    const g = xl.get(k) || {name, width: w, m: 0, picks: 0, looms: 0, qs: []}; xl.set(k, g);
    g.m += m; g.picks += p.pp || 0; g.looms += p.looms || 0; g.qs.push(p.q);
    const pk = key(p.root, w), o = ppiOf.get(pk) || {pp: 0, m: 0}; ppiOf.set(pk, o); o.pp += p.pp || 0; o.m += m;
  }
  const unas = {picks: 0, looms: new Set()};
  for (const x of L || []) {
    if (!x || !(x.fpicks > 0)) continue;
    if (!x.hg0 || x.hg0 === 'Unassigned') { unas.picks += x.fpicks / 39.37; unas.looms.add(x.loom); continue; }
    const w = both.has(x.hg0) ? 'both' : String(x.width), name = both.has(x.hg0) ? (nm[key(x.hg0, '190')] || x.hg || x.hg0) : (x.hg || nm[key(x.hg0, w)] || x.hg0), k = key(name, w);
    const g = loom.get(k) || {name, width: w, picks: 0, m: 0, nom: 0, looms: new Set(), roots: new Set()}; loom.set(k, g);
    const pk = x.fpicks / 39.37, o = ppiOf.get(key(x.hg0, w)), X = xl.get(k);
    const ppi = o && o.m > 0 ? o.pp / o.m : X && X.m > 0 ? X.picks / X.m : null;
    g.picks += pk; g.looms.add(x.loom); g.roots.add(x.hg0);
    if (ppi > 0) g.m += pk / ppi; else g.nom += pk;
  }
  const rows = [], S = set || {}, big = (m) => Math.abs(m) > (S.m ?? 0);
  const fpm = (() => { let a = 0, b = 0; for (const p of P || []) if (p) { a += p.pp || 0; b += (p.dm || 0) + (p.nm || 0); } return b > 0 ? a / b : null; })();
  for (const k of new Set([...loom.keys(), ...xl.keys()])) {
    const a = loom.get(k), b = xl.get(k);
    const r = {name: (a || b).name, width: (a || b).width, looms: a ? [...a.looms].sort((p, q) => p - q) : [], xlLooms: b ? b.looms : null, qs: b ? b.qs : [],
               loomM: a && !a.nom ? a.m : null, loomPicks: a ? a.picks : null, xlM: b ? b.m : null, xlPicks: b ? b.picks : null, gapM: null, gapPicks: null, pct: null, flag: false, why: null};
    if (!a) { r.why = 'not in the loom readings'; r.flag = big(b.m); }
    else if (!b) { r.why = 'not in the costing file\'s production table'; r.loomM = null; r.flag = fpm > 0 && big(a.picks / fpm); }   // flagged at the file's own picks per metre for the day
    else if (a.nom) { r.why = 'no picks per inch for it in the costing file'; r.gapPicks = a.picks - b.picks; r.flag = fpm > 0 && big(r.gapPicks / fpm); }
    else {
      r.gapM = a.m - b.m; r.gapPicks = a.picks - b.picks; r.pct = b.m > 0 ? 100 * r.gapM / b.m : null;
      r.flag = r.pct != null && Math.abs(r.gapM) > (S.m ?? 0) && Math.abs(r.pct) > (S.pct ?? 0);
    }
    rows.push(r);
  }
  if (unas.picks > 0) rows.push({name: 'Unassigned', width: null, looms: [...unas.looms].sort((p, q) => p - q), xlLooms: null, qs: [], loomM: null, loomPicks: unas.picks, xlM: null, xlPicks: null, gapM: null, gapPicks: null, pct: null,
    flag: fpm > 0 && big(unas.picks / fpm), why: 'the loom\'s style has no head group (Needs a head group on Actions)'});
  for (const n of noHg) rows.push({name: n.q, width: null, looms: [], xlLooms: n.looms, qs: [n.q], loomM: null, loomPicks: null, xlM: n.m, xlPicks: n.picks, gapM: null, gapPicks: null, pct: null, flag: big(n.m), why: 'the costing file\'s quality name has no head group'});
  for (const n of xlOnly) rows.push({name: nm[key(n.root, '190')] || nm[key(n.root, '280')] || n.root, width: null, looms: [], xlLooms: n.looms, qs: [n.q], loomM: null, loomPicks: null, xlM: n.m, xlPicks: n.picks, gapM: null, gapPicks: null, pct: null, flag: big(n.m), why: 'not in the loom readings'});
  rows.sort((p, q) => (q.flag - p.flag) || Math.abs(q.gapM ?? q.xlM ?? 0) - Math.abs(p.gapM ?? p.xlM ?? 0) || (p.name < q.name ? -1 : 1));
  const T = (f) => rows.reduce((s, r) => s + (r.gapM == null ? 0 : r[f]), 0);
  return {rows, flagged: rows.filter((r) => r.flag).length, loomM: T('loomM'), xlM: T('xlM')};
}
// The names each Style-map head group shows on each width, from every loom-day: {root|width: name}.
function prodNames(L) { const o = {}; for (const x of L || []) if (x && x.hg0 && x.hg) o[x.hg0 + '|' + x.width] = x.hg; return o; }
// A missed reading is "likely" when its loom-day's quality × width row on the day's production check has the loom readings
// below the file by more than the flag levels (the file counted production the loom readings miss).
function missedLikely(m, chk) {
  if (!m || m.kind !== 'short' || !chk) return false;
  const r = chk.rows.find((x) => x.name === m.hg && (x.width === String(m.width) || x.width === 'both'));
  return !!(r && r.flag && r.gapM != null && r.gapM < 0);
}
