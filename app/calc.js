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
//                   worked out again), which the Costing tab's "As entered" view shows (COST.days_entered);
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

// Plant vs corrected for one day. plant = cost_checks days[d].plant ({lines, total, prog_total, month_total, picks, prog_picks,
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
const SC_FIG = {'cost chain': 'cost per pick, folded cost and profit', 'file side': 'the Plant file figures in Plant vs corrected and Month to date',
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
    const cut = d.bgrade ? d.bgrade.cut_pcs : null;
    const why = !(d.picks > 0) ? 'no production picks' : !ok(d.afold) ? 'no A-grade folded picks' : !(d.metres > 0) ? 'no metres' : !ok(cut) ? 'no cut piece metres' : !has.has(d.date) ? 'no B grade register' : null;
    if (why) { out.push({date: d.date, why}); continue; }
    const p = d.picks * 1e5, w = p / d.metres;
    let b = 0;
    for (const e of byDay.get(d.date) || []) { if (!ok(e.m)) continue; if (ok(e.ppi) && e.ppi > 0) b += e.m * e.ppi; else { b += e.m * w; avgM += e.m; } }
    A += d.afold * 1e5; B += b; C += cut * w; P += p; n += 1; used.push(d.date);
  }
  return {s: P > 0 ? 1 - (A + B + C) / P : null, days: n, of: mtd.length, from: used[0] || null, to: used[used.length - 1] || null, A, B, C, P, avgM, out};
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

// ---- Target cost per pick (Divyam, 18 Nov 2026). The headline cost per pick, As entered, for one day: (total expenses +
// cut piece loss) ÷ production picks. Steps applied in order, so they add up:
//   1. CFM: each loom at its target CFM (excess air only, never more air); the compressor's kWh fall by the air saved ×
//      its kWh per ft³ that day (Power (Compressor) kWh ÷ the floor's air), at its ₹ per unit.
//   2. Pressure: the compressor at the set point needed with every loom at its target main pressure (press.frac, a share of its energy), on the kWh
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
  const k = comp && F > 0 ? comp.kwh / F : null, rho = comp ? comp.rate : null;
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
    {id: 'picks', pp: s3 - s2, rs: (s3 - s2) / 100 * (P + E)},
    {id: 'added', pp: s4 - s3, rs: Add, parts: add},
    {id: 'quality', pp: s5 - s4, rs: -Bq, bgrade: bl && ok(bl.a) ? bl.a : 0, cut: ok(day.cut) ? day.cut : 0}];
  // per loom (its loom-day records together): CFM saving, extra picks and metres, and its effect on the target cost per
  // pick = (− its CFM saving + its added costs − today's cost per pick × its extra picks) ÷ the target day's picks, so the
  // looms' effects plus the floor-wide pressure and quality steps add up to the whole change.
  const c0 = N0 / P;
  const parts = recs.map((r) => {
    const cRs = r.cfmKwh != null ? r.cfmKwh * rho : null;
    const aRs = (r.addKwh != null ? r.addKwh * rho : 0) + (r.dM != null ? (rW || 0) * r.dM + (rT || 0) * r.dM + (rP || 0) * r.dM : 0);
    return {loom: r.x.loom, width: r.x.width, hg: r.x.hg, cfmRs: cRs, E: r.E, Eraw: ok(r.eFab) ? r.eFab / TC_PPI : null, dM: r.dM, gaps: r.gaps,
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
// Target folded cost per pick (owner, Divyam 18 Nov 2026): the folded cost per pick of the corrected costing (COST.days) with
// the same savings, extra picks and added costs, and no B grade or cut pieces: (OPEX − savings + added costs) ÷ target
// A-grade folded picks, where OPEX = the folded cost × A-grade folded picks − (B grade loss + cut piece loss − B grade
// revenue) and target A-grade folded picks = target production picks × (1 − folding shortage). Paise; null when missing.
function targetFolded(fday, tc, short) {
  if (!fday || !ok(fday.fcpp) || !(fday.afold > 0) || !tc || !tc.ok || !ok(short)) return null;
  const b = fday.bgrade || {}, cut = ok(fday.cut) ? fday.cut : 0;
  const opex = fday.fcpp / 100 * fday.afold * 1e5 - ((ok(b.loss) ? b.loss : 0) + cut - (ok(b.rev) ? b.rev : 0));
  const num = opex - (tc.Sc || 0) - (tc.Sp || 0) + tc.Add, den = (fday.picks * 1e5 + tc.E) * (1 - short);
  return den > 0 ? 100 * num / den : null;
}
