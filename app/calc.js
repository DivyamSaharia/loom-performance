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
