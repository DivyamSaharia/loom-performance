// W2 Looms · app/fabric_calc.js — The fabric masters' timelines and the realisation analysis, as pure functions.
// No DOM and no page state: tests/test_fabric_calc.py runs them under Node on hand-made masters. The one place where a
// loom-day becomes metres, sale value, realisation and profit, used by both the Realisation screen and the impact preview
// of the Approvals inbox (failure case 39: one shared, tested place).
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';

const FC_PICKS_PER_INCH = 39.37;   // fabric picks ÷ 39.37 = the costing basis (metres × picks per inch), as everywhere in the app
const FC_NE = 5315;                // denier = 5315 ÷ Ne, as the fabric app converts a cotton count
const FC_TPM_EXTRA = 50;           // a TPM yarn with no extra entered costs its base rate + 50, as the fabric app prices it
const FC_SALE = ['price', 'vatav_pct', 'brokering_pct', 'processing_charge', 'transport_charge', 'rfd_shortage_pct'];
const FC_HG = 'hg:';               // a link keyed by a loom head group is stored as 'hg:<head group>' in fm_style_links.style (10 Nov 2026)
const FC_ASSOLD = 'As sold';       // the third basis (R1, 11 Nov 2026): each link valued on its own default record, so coverage can reach 100%
const FC_BASES = ['Greige', 'RFD', FC_ASSOLD];
const fcIsHg = (style) => String(style || '').startsWith(FC_HG);
const fcHgName = (style) => fcIsHg(style) ? String(style).slice(FC_HG.length) : String(style || '');
// The link's default basis lives in its note as JSON ({"basis": "Greige"|"RFD"}, R1): no migration, append-only rules and
// undo untouched (a changed default is a correction row with the same fabrics and a new note). Blank = greige where a greige
// record is linked, else RFD.
function fcNoteBasis(note) {
  if (note == null || note === '') return null;
  try { const o = typeof note === 'string' ? JSON.parse(note) : note; const b = o && o.basis; return b === 'RFD' || b === 'Greige' ? b : null; } catch (e) { return null; }
}
function fcLinkDefault(v) {   // v: a link's value {greige, rfd, basis}
  if (!v) return null;
  if (v.basis === 'RFD' && v.rfd != null) return 'RFD';
  if (v.basis === 'Greige' && v.greige != null) return 'Greige';
  return v.greige != null ? 'Greige' : v.rfd != null ? 'RFD' : null;
}
const fcNum = (v) => typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? +v : null);
const fcPct = (v) => (fcNum(v) ?? 0) / 100;

// ---- timelines. entries: [{id, eff_from, value, void_of}] of one field. The live entry in force on day d: voids and voided
// entries are skipped (a void that is itself voided brings its target back), the latest eff_from on or before d wins, and on
// the same eff_from the later entry (higher id) wins (case 30). The same rule as migration 0007 and fabric_masters.in_force.
function fcInForce(entries, d) {
  if (!entries || !entries.length) return null;
  const voided = new Set(entries.filter((e) => e.void_of != null).map((e) => e.void_of));
  const liveVoid = new Set(entries.filter((e) => e.void_of != null && !voided.has(e.id)).map((e) => e.void_of));
  let best = null;
  for (const e of entries) {
    if (e.void_of != null || liveVoid.has(e.id) || String(e.eff_from) > d) continue;
    if (!best || String(e.eff_from) > String(best.eff_from) || (String(e.eff_from) === String(best.eff_from) && e.id > best.id)) best = e;
  }
  return best;
}
// The window an entry covers: from its eff_from to the day before the next live entry (null = open ended).
function fcWindow(entries, entry) {
  const later = entries.filter((e) => e !== entry && e.void_of == null && String(e.eff_from) > String(entry.eff_from) && fcInForce(entries, String(e.eff_from)) === e);
  const next = later.map((e) => String(e.eff_from)).sort()[0] || null;
  return {from: String(entry.eff_from), to: next ? fcAddDays(next, -1) : null};
}
function fcAddDays(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

// ---- masters from the rows the database returns (fm_* tables, admin only)
function fcMasters(rows) {
  const M = {fab: {}, sale: {}, yarn: {}, rate: {}, links: {}, version: rows.version || null};
  const put = (o, uid, field, e) => { ((o[uid] = o[uid] || {})[field] = o[uid][field] || []).push(e); };
  const ent = (r, value) => ({id: +r.id, eff_from: String(r.eff_from).slice(0, 10), value, void_of: r.void_of == null ? null : +r.void_of, mode: r.mode, at: r.created_at, by: r.created_by, request_id: r.request_id});
  for (const r of rows.fabric_versions || []) put(M.fab, +r.fabric_uid, r.field, ent(r, r.value));
  for (const r of rows.sale_rates || []) put(M.sale, +r.fabric_uid, r.field, ent(r, r.value));
  for (const r of rows.yarn_versions || []) put(M.yarn, +r.yarn_uid, r.field, ent(r, r.value));
  for (const r of rows.yarn_rates || []) (M.rate[+r.yarn_uid] = M.rate[+r.yarn_uid] || []).push(Object.assign(ent(r, fcNum(+r.rate)), {src_date: r.src_date}));
  for (const r of rows.style_links || []) (M.links[r.style + '|' + r.width] = M.links[r.style + '|' + r.width] || []).push(Object.assign(ent(r, {greige: r.greige_uid == null ? null : +r.greige_uid, rfd: r.rfd_uid == null ? null : +r.rfd_uid, basis: fcNoteBasis(r.note)}), {style: r.style, width: r.width}));
  return M;
}
// A copy of the masters with one more (hypothetical) entry, for the impact preview. edit: {table: 'fab'|'sale'|'yarn'|'rate'|
// 'links', uid (or key for links), field, value, eff_from, mode: 'new'|'correction'}. A correction lands on the eff_from of
// the entry in force on edit.eff_from, as the database does.
function fcWith(M, edit) {
  if (Array.isArray(edit)) {   // several edits (a "possibly a different fabric" request): applied one after another
    let cur = {M, eff_from: null};
    for (const e of edit) { const n = fcWith(cur.M, e); cur = {M: n.M, eff_from: cur.eff_from && cur.eff_from < n.eff_from ? cur.eff_from : n.eff_from}; }
    return cur;
  }
  const C = {fab: {...M.fab}, sale: {...M.sale}, yarn: {...M.yarn}, rate: {...M.rate}, links: {...M.links}, version: M.version};
  const src = edit.table === 'rate' ? (M.rate[edit.uid] || []) : edit.table === 'links' ? (M.links[edit.uid] || []) : ((M[edit.table][edit.uid] || {})[edit.field] || []);
  let eff = edit.eff_from;
  if (edit.mode === 'correction') { const cur = fcInForce(src, edit.eff_from); if (cur) eff = cur.eff_from; }
  const e = {id: Number.MAX_SAFE_INTEGER, eff_from: eff, value: edit.value, void_of: null, mode: edit.mode || 'new'};
  if (edit.table === 'rate' || edit.table === 'links') C[edit.table][edit.uid] = src.concat([e]);
  else C[edit.table][edit.uid] = Object.assign({}, M[edit.table][edit.uid] || {}, {[edit.field]: src.concat([e])});
  return {M: C, eff_from: eff};
}

const fcVal = (byField, field, d) => { const e = fcInForce((byField || {})[field], d); return e ? e.value : null; };
function fcFabricAt(M, uid, d) {
  const F = M.fab[uid];
  if (!F) return null;
  const o = {uid};
  for (const k of Object.keys(F)) o[k] = fcVal(F, k, d);
  for (const k of FC_SALE) o[k] = fcVal(M.sale[uid], k, d);
  return o;
}
function fcFabricName(M, uid, d) {
  const f = fcFabricAt(M, uid, d || '9999-12-31');
  if (!f) return 'Fabric ' + uid;
  const rs = fcNum(f.reed_space_in);
  const nm = String(f.name || '').trim();
  return `${nm}${rs != null && !new RegExp(`\\b${Math.floor(rs + 0.5)}$`).test(nm) ? ' ' + Math.floor(rs + 0.5) : ''}${f.finish === 'RFD' ? ' (RFD)' : ''}`.trim();
}
// Denier of a yarn (a TPM yarn with no count of its own takes its base yarn's), as the fabric app's Ve().
function fcDenier(M, yuid, d, seen) {
  const Y = M.yarn[yuid]; if (!Y) return null;
  const n = fcNum(fcVal(Y, 'count', d));
  if (n && n > 0) return fcVal(Y, 'count_unit', d) === 'Ne' ? FC_NE / n : n;
  const b = fcVal(Y, 'base_yarn_id', d);
  if (fcVal(Y, 'kind', d) === 'tpm' && b != null && !(seen || []).includes(yuid)) return fcDenier(M, +b, d, (seen || []).concat([yuid]));
  return null;
}
// Rate per kg in force on d: a base yarn's own rate; a TPM yarn's base rate + its extra (50 when blank).
function fcYarnRate(M, yuid, d, seen) {
  const Y = M.yarn[yuid]; if (!Y || (seen || []).includes(yuid)) return null;
  if (fcVal(Y, 'kind', d) === 'tpm') {
    const b = fcVal(Y, 'base_yarn_id', d);
    const br = b == null ? null : fcYarnRate(M, +b, d, (seen || []).concat([yuid]));
    if (!br) return null;
    const x = fcNum(fcVal(Y, 'tpm_delta', d));
    return {rate: br.rate + (x == null ? FC_TPM_EXTRA : x), base: br.rate, extra: x == null ? FC_TPM_EXTRA : x, base_uid: br.base_uid ?? +b};
  }
  const e = fcInForce(M.rate[yuid], d);
  return e && fcNum(e.value) != null ? {rate: fcNum(e.value), base: fcNum(e.value), extra: 0, base_uid: yuid, eff_from: e.eff_from} : null;
}
// Standard yarn cost per greige metre (rupees), the fabric app's way (its Ye()): warp g/m = ends × denier ÷ 9000 × (1 +
// warp shortage); weft g/m = PPI × reed space × share of the weft parts × denier ÷ 9000 × (1 + weft shortage); cost = g/m ÷
// 1000 × rate per kg. missing lists what stops it.
function fcYarnCost(M, f, d) {
  const missing = [], lines = Array.isArray(f.lines) ? f.lines : [];
  const ppi = fcNum(f.ppi), rs = fcNum(f.reed_space_in), ws = fcPct(f.warp_shortage_pct), wf = fcPct(f.weft_shortage_pct);
  if (fcNum(f.warp_shortage_pct) == null) missing.push('warp shortage');   // blank is not 0%: the fabric app flags it too
  if (fcNum(f.weft_shortage_pct) == null) missing.push('weft shortage');
  const warp = lines.filter((l) => l.side === 'warp'), weft = lines.filter((l) => l.side === 'weft');
  if (!warp.length) missing.push('warp yarn');
  if (!weft.length) missing.push('weft yarn');
  const parts = weft.reduce((s, l) => s + (fcNum(l.parts) ?? 1), 0) || 1;
  let cost = 0, gpm = 0;
  const yarns = [];
  for (const l of lines) {
    const den = fcDenier(M, +l.yarn, d), r = fcYarnRate(M, +l.yarn, d);
    let g = null;
    if (l.side === 'warp') g = den && fcNum(l.ends) ? fcNum(l.ends) * den / 9000 * (1 + ws) : null;
    else g = den && ppi && rs ? ppi * rs * ((fcNum(l.parts) ?? 1) / parts) * den / 9000 * (1 + wf) : null;
    if (g == null) { missing.push(den ? (l.side === 'warp' ? 'warp ends' : 'pick or reed space') : 'yarn count'); continue; }
    if (!r) { missing.push('yarn rate'); continue; }
    gpm += g; cost += g / 1000 * r.rate;
    yarns.push({yarn: +l.yarn, side: l.side, gpm: g, rate: r.rate, base_uid: r.base_uid});
  }
  return missing.length ? {rm: null, missing: [...new Set(missing)], yarns} : {rm: cost, gpm, missing: [], yarns};
}
// What one greige metre of fabric f is worth on its own basis (f.finish). Greige: sale = price × (1 − VATAV). RFD (the fabric
// app's g = 1 ÷ (1 − RFD shortage) greige metres per RFD metre): sale per RFD metre = price × (1 − VATAV − brokering) −
// processing × g − transport. Realisation = sale − standard yarn cost. Both returned per greige metre, so metres woven ×
// these = rupees. Matches the fabric app's "realisation without VATAV" × metres.
function fcPerMetre(M, f, d) {
  const missing = [];
  const price = fcNum(f.price);
  if (price == null || price <= 0) missing.push('sale rate');
  const yc = fcYarnCost(M, f, d);
  missing.push(...yc.missing);
  const vat = fcPct(f.vatav_pct);
  let sale = null, g = 1;
  if (price != null && price > 0) {
    if (f.finish === 'RFD') {
      const sh = fcPct(f.rfd_shortage_pct);   // blank = 0%, as the fabric app computes it (Divyam, 10 Nov 2026: Salsa Butty RFD has none)
      g = sh < 1 ? 1 / (1 - sh) : null;
      if (g == null) missing.push('RFD shortage');
      else sale = (price * (1 - vat - fcPct(f.brokering_pct)) - (fcNum(f.processing_charge) ?? 0) * g - (fcNum(f.transport_charge) ?? 0)) / g;
    } else sale = price * (1 - vat);
  }
  return {sale, rm: yc.rm, real: sale != null && yc.rm != null ? sale - yc.rm : null, g, missing: [...new Set(missing)], yarns: yc.yarns};
}

// ---- the day's cost per pick, from the costing data (the days of the basis chosen at the top, Round B2; Actual by default)
// The plant's folded cost per pick = (OPEX + B grade loss + cut piece loss − B grade revenue) ÷ A-grade folded picks. The
// analysis applies it to every pick of every loom without its B grade part, and charges each loom its own B grade metres at
// the day's net B grade loss per B grade metre, so B grade is neither shared out nor counted twice (Divyam, 10 Nov 2026).
function fcCostDay(day) {
  if (!day || !ok(day.fcpp) || !ok(day.afold) || day.afold <= 0) return null;
  const b = day.bgrade || {};
  const bnet = (ok(b.loss) ? b.loss : 0) - (ok(b.rev) ? b.rev : 0);
  const fold = day.fcpp / 100;                       // rupees per A-grade folded pick, incl. the B grade part
  const bpart = bnet / (day.afold * 1e5);            // that B grade part, rupees per folded pick
  // Round A3: the parts the loom cost method splits the day's cost into. pw = the POWER line (on Actual with the 0.02 ₹/pick
  // correction taken off, on Plant file as entered; Round B2); cut = the cut piece loss. The loom cost method's cost is the day as it
  // is (Round A5, 25 Nov 2026; day.pfix is not read).
  const pw = day.power && ok(day.power.amount) ? day.power.amount : null;
  return {date: day.date, fold, bpart, base: fold - bpart, bnet, bm: ok(b.m) ? b.m : null, has_rev: ok(b.rev), afold: day.afold,
          pw, cut: ok(day.cut) ? day.cut : 0};
}

// ---- one analysis run. inp: {M, loomdays: [{date, loom, width, hg, fpicks, styles}], costing: [costing day], reg: [{date,
// loom, m}] (B grade register), basis: 'Greige'|'RFD'|'As sold', from, to}. Every loom-day is valued at the rates in force on
// its own date, at fabric level, then added up (case 38). Nothing is guessed: a loom-day with no link, a mixed link, no rate
// or missing construction is a gap with its reason, counted in coverage (cases 17, 32, 40). "As sold" values each loom-day
// on its link's default record (fcLinkDefault), so greige-only and RFD-only groups are both priced on one screen; Greige and
// RFD stay as what-if views. Each row carries the basis it was valued on (r.basis).
function fcAnalyse(inp) {
  const {M, basis} = inp;
  // Round A7 (Divyam, 25 Nov 2026; design 2026-11-25_folded-basis-design.md): realisation on folded metres = woven metres ×
  // (1 − s), s = each quality's own folding % (Round A10, fcShortQ; was the plant's month to date) as at the date chip's day (one figure for every quality). The app
  // and the realisation notice always pass inp.s (a number, or null = no shortage yet: every priced loom-day is a gap with
  // that reason, never valued without it). inp.s left out = no shrinkage: the approvals impact preview (fcImpact, per metre
  // what-ifs, Divyam's answer 4) and the engine's older tests. inp.fold ({date: {C, w}}, as fcFoldByQuality) gives each row
  // its A-grade folded picks (r.afold).
  // Round A10: inp.s may be a map (fcShortQ: each quality its own folding %, the plant's for a row with no quality); a map with
  // no plant figure is null, as before
  const snull = inp.s !== undefined && !fcSOk(inp.s), S = snull || inp.s === undefined ? 0 : inp.s;
  const days = (inp.loomdays || []).filter((x) => (!inp.from || x.date >= inp.from) && (!inp.to || x.date <= inp.to));
  const cost = new Map((inp.costing || []).map((c) => [c.date, fcCostDay(c)]));
  const bReg = new Map();
  for (const e of inp.reg || []) { const k = e.date + '|' + e.loom; bReg.set(k, (bReg.get(k) || 0) + (ok(e.m) ? e.m : 0)); }
  const regDays = new Set((inp.reg || []).map((e) => e.date));
  const regTotal = new Map();
  for (const e of inp.reg || []) regTotal.set(e.date, (regTotal.get(e.date) || 0) + (ok(e.m) ? e.m : 0));
  const picksOf = new Map(), picksDay = new Map();   // costing picks per loom-day (to share a loom's B grade over its records on a changeover day) and per day
  for (const x of days) {
    const k = x.date + '|' + x.loom, P = (x.fpicks || 0) / FC_PICKS_PER_INCH;
    picksOf.set(k, (picksOf.get(k) || 0) + P); picksDay.set(x.date, (picksDay.get(x.date) || 0) + P);
  }
  // B grade per day (Divyam, 10 Nov 2026: each loom's own B grade is charged to that loom). The day's net B grade loss is
  // charged per B grade metre: to each loom for its own register metres, and what the register cannot pin to a loom of the
  // day (no register, a row with no loom, fewer metres than the costing) spread over every pick of the day, as the plant's
  // folded formula does. So the day's charges always add up to its net B grade loss (review 2). rate = net loss ÷ the larger
  // of the costing's and the register's B grade metres.
  const bday = new Map();
  for (const [d, c] of cost) {
    if (!c || !picksDay.get(d)) continue;
    const denom = Math.max(c.bm || 0, regTotal.get(d) || 0);
    const rate = denom > 0 ? c.bnet / denom : 0;
    let pinned = 0;
    for (const [k, m] of bReg) if (k.startsWith(d + '|') && picksOf.get(k) > 0) pinned += m * rate;   // a loom stopped all day has no picks to carry it: spread
    bday.set(d, {rate, spread: (c.bnet - pinned) / picksDay.get(d), pinned, unpinned: c.bnet - pinned, reg: regDays.has(d)});
  }
  const rows = [];
  for (const x of days) {
    const P = (x.fpicks || 0) / FC_PICKS_PER_INCH;
    const r = {date: x.date, loom: x.loom, width: String(x.width), hg: x.hg, hg0: x.hg0 || x.hg, styles: x.styles || [], picks: P, metres: null, fabric: null, basis: null,
               sale: null, real: null, bcharge: null, costed: false, gap: null};
    rows.push(r);
    if (!P) { r.gap = 'no picks'; continue; }
    // the loom-day's head group -> its fabric for this basis (Divyam, 10 Nov 2026: a head group is the quality, so one link
    // covers every style name in it). Without a head-group link, each style name on the loom-day is looked up on its own; the
    // picks cannot be split between styles, so a loom-day whose styles lead to different outcomes is a gap of its own (case 18)
    const outs = new Set();
    let gap = null;
    // the link is saved under the head group's Style-map name (hg0); its shown name is the linked fabric's (12 Nov 2026)
    const hl = r.hg && r.hg !== 'Unassigned' ? fcInForce(M.links[FC_HG + r.hg0 + '|' + r.width], x.date) : null;
    const links = hl ? [hl] : r.styles.map((s) => fcInForce(M.links[s + '|' + r.width], x.date));
    for (const l of links) {
      if (!l) { gap = 'unlinked style'; break; }
      const want = basis === FC_ASSOLD ? fcLinkDefault(l.value) : basis;   // the record this loom-day is valued on
      const u = want === 'RFD' ? l.value.rfd : want === 'Greige' ? l.value.greige : null;
      outs.add(u != null ? 'u' + u + '|' + want : l.value.greige == null && l.value.rfd == null ? 'skip' : 'none');
    }
    if (!gap && !outs.size) gap = 'unlinked style';
    if (!gap && outs.size > 1) gap = 'styles linked to different fabrics on one loom-day';
    if (!gap && outs.has('skip')) gap = 'not valued (link says so)';
    if (!gap && outs.has('none')) gap = `no ${basis === 'RFD' ? 'RFD' : 'greige'} record linked`;
    if (gap) { r.gap = gap; continue; }
    const [uidS, want] = [...outs][0].slice(1).split('|');
    const uid = +uidS;
    r.fabric = uid; r.basis = want;
    const f = fcFabricAt(M, uid, x.date);
    if (!f || f.status == null) { r.gap = 'fabric not in the masters on this day'; continue; }   // before its first entry (case 32), or undone
    if (f.status === 'retired') { r.gap = 'retired fabric still linked'; continue; }
    if ((want === 'RFD') !== (f.finish === 'RFD')) { r.gap = `linked ${want === 'RFD' ? 'RFD' : 'greige'} record is now ${f.finish || 'blank'}`; continue; }   // review 9
    const ppi = fcNum(f.ppi);
    if (!ppi) { r.gap = 'no PPI'; continue; }
    r.metres = P / ppi;
    const pm = fcPerMetre(M, f, x.date);
    if (pm.missing.length) { r.gap = pm.missing.includes('sale rate') ? 'no sale rate in force' : 'no yarn cost: ' + pm.missing.join(', '); continue; }
    r.sale0 = r.metres * pm.sale;   // Round A7: before the folding shortage (woven metres); r.sale and r.real are on folded metres
    r.real0 = r.metres * pm.real;
    const sr = snull ? null : fcSOf(S, r);
    if (sr == null) { r.gap = 'no folding shortage yet'; r.sale0 = r.real0 = null; continue; }
    r.sale = r.sale0 * (1 - sr); r.real = r.real0 * (1 - sr); r.fmetres = r.metres * (1 - sr); r.s = sr;
  }
  // B grade on every row of a costed day (gap rows too, so the day reconciles). Round A9 (Divyam, 26 Nov 2026, point 10): the
  // old per pick basis's cost and profit are gone (no screen used them since Round A4); `costed` says a priced row is on a
  // costed day, which the loom cost basis and Coverage's "priced and costed" need.
  for (const r of rows) {
    const c = cost.get(r.date), b = bday.get(r.date);
    if (!c || !b || !r.picks) continue;
    const k = r.date + '|' + r.loom;
    const share = picksOf.get(k) ? r.picks / picksOf.get(k) : 1;
    r.bm = (bReg.get(k) || 0) * share;
    r.bcharge = r.bm * b.rate + r.picks * b.spread;
    r.bnote = !b.reg ? 'no B grade register for the day: its B grade is spread over all picks' : null;
    if (r.gap) { r.bcharge_gap = r.bcharge; r.bcharge = null; continue; }
    r.costed = true;
  }
  rows.bday = bday;
  rows.lday = inp.running ? fcLoomCost(rows, cost, inp.running, picksOf, inp) : null;
  // Round A7: each row's B grade picks and cut piece share (fcAfoldParts, the same helper as Folded cost per pick by quality, so
  // the two can never differ), on the days that have a loom cost and folding figures; then its A-grade folded picks at s
  const fold = inp.fold || {}, L = rows.lday || {};
  const okDay = (d) => L[d] && L[d].per != null && fold[d] && typeof fold[d].C === 'number' && isFinite(fold[d].C);
  const parts = fcAfoldParts(rows.filter((r) => r.lc && okDay(r.date)), inp.reg, fold);
  for (const [r, q] of parts) if (!r.synth) { r.afB = q.B; r.afC = q.C; }
  rows.s = snull ? null : S;
  for (const r of rows) fcRowAtS(r, S);
  return rows;
}
// ---- Round A7 (Divyam, 25 Nov 2026, answers 1 b, 2 a and 2): which folding shortage s a screen uses.
// fd: foldDays(costing days, register, register days, up to) from calc.js, oldest first: each day {date, why, mtd} (mtd = the
// month to date up to it, days missing a figure left out). The date chip's day: its own month-to-date figure when the day has
// its figures; otherwise the latest earlier day that has (last month's final figure in a new month), named (fallback). No
// figure at all = null with the reason (realisation is then a gap, never valued without it).
// → {s, at (the day the figure is as at), fallback, why}
function fcShortAt(fd, date) {
  const L = (fd || []).filter((x) => x.date <= date && !x.why && typeof x.mtd === 'number' && isFinite(x.mtd));
  if (!L.length) return {s: null, at: null, fallback: false, why: 'no folding shortage yet'};
  const e = L[L.length - 1];
  return {s: e.mtd, at: e.date, fallback: e.date !== date, why: null};
}
// A period from..to (answer 2): within one month, that month's figure (the date chip's month as at the date chip's day, an
// earlier month its final figure); across months, Σ (month m's figure × the period's production picks in m) ÷ the period's
// production picks of the months that have a figure; a month with no figure is left out and named (out); none = null.
// picks: {date: production picks} of the costing days. → {s, at, fallback, why, months: [{m, s, at, P}], out: [m]}
function fcShortPeriod(fd, from, to, chip, picks) {
  const ym = (d) => String(d).slice(0, 7), cm = ym(chip), ms = [];
  for (let d = from; d <= to; d = fcAddDays(d, 1)) if (!ms.includes(ym(d))) ms.push(ym(d));
  const fig = (m) => m === cm ? fcShortAt(fd, chip) : (() => { const L = (fd || []).filter((x) => ym(x.date) === m && !x.why && typeof x.mtd === 'number' && isFinite(x.mtd)); return L.length ? {s: L[L.length - 1].mtd, at: L[L.length - 1].date, fallback: false} : {s: null}; })();
  if (ms.length === 1) { const f = fig(ms[0]); return Object.assign({months: [], out: []}, f, f.s == null ? {why: f.why || 'no folding shortage for ' + ms[0]} : {}); }
  const months = [], out = [];
  for (const m of ms) {
    const f = fig(m); let P = 0;
    for (const [d, p] of Object.entries(picks || {})) if (ym(d) === m && d >= from && d <= to && typeof p === 'number' && isFinite(p)) P += p;
    if (f.s == null || !(P > 0)) { if (f.s == null) out.push(m); continue; }
    months.push({m, s: f.s, at: f.at, fallback: !!f.fallback, P});
  }
  const T = months.reduce((a, x) => a + x.P, 0);
  if (!(T > 0)) return {s: null, at: null, fallback: false, why: 'no folding shortage for the period', months, out};
  return {s: months.reduce((a, x) => a + x.s * x.P, 0) / T, at: null, fallback: months.some((x) => x.fallback), why: null, months, out, weighted: true};
}
// ---- Round A10 (Divyam, 26 Nov 2026, D0–D3; design 2026-11-27_folding-shortage-design.md): each quality's own folding %.
// A quality (its head group's Style-map name, hg0, across both widths: D2) = Σ (each day's own plant shortage s_d × the
// quality's loom picks that day) ÷ Σ its loom picks, over the costing days of the month up to the day that have a figure (D3:
// loom picks as they are, not scaled to costing picks). It is used once the quality ran on FC_FQ_MIN of those days (a day on
// either width counts once; D1); before that its own final figure from last month (when it met the same guard there), then
// the plant's month to date as at the day (fcShortAt, the latest earlier day's when the day has none). Each is named (src).
// Not a Config row: writing the Config sheet needs Divyam's OK and nothing else reads it.
const FC_FQ_MIN = 7;
// The quality a loom-day or row belongs to (its Style-map name), or null with no head group (Unassigned: the plant's figure)
const fcQKey = (x) => { if (!x || x.hg === 'Unassigned') return null; const k = x.hg0 || x.hg; return k && k !== 'Unassigned' ? String(k) : null; };
// s is one number (one figure for every row, as before Round A10, and the engine's older tests) or a map from fcShortQ /
// fcShortQPeriod ({by: {quality: {s, …}}, ps: the plant's figure for a row with no quality of its own}).
const fcSOk = (s) => typeof s === 'number' ? isFinite(s) : !!(s && typeof s === 'object' && typeof s.ps === 'number' && isFinite(s.ps));
function fcSOf(s, r) {
  if (typeof s === 'number') return isFinite(s) ? s : null;
  if (!fcSOk(s)) return null;   // a map with no plant figure is not used at all (numbers review)
  const q = fcQKey(r), e = q != null && s.by ? s.by[q] : null;
  return e && typeof e.s === 'number' && isFinite(e.s) ? e.s : typeof s.ps === 'number' && isFinite(s.ps) ? s.ps : null;
}
const fcPrevMonth = (m) => { const [y, n] = String(m).split('-').map(Number); return n === 1 ? `${y - 1}-12` : `${y}-${String(n - 1).padStart(2, '0')}`; };
// One month's own figures, up to `upto`: per quality its Σ s_d × picks, its picks on days with a figure (pf), the days it ran
// with one (n), its loom picks in the month (picks), widths and names; and the month's loom picks (lp), costing picks (cp) and
// Unassigned loom picks (un) on the days with a figure (for the check line).
function fcQOwn(fd, loomdays, m, upto) {
  const sd = new Map(), cpd = new Map();
  for (const x of fd || []) if (String(x.date).slice(0, 7) === m && x.date <= upto && !x.why && typeof x.s === 'number' && isFinite(x.s)) { sd.set(x.date, x.s); cpd.set(x.date, typeof x.P === 'number' && isFinite(x.P) ? x.P : 0); }
  const by = {};
  let lp = 0, un = 0;
  for (const x of loomdays || []) {
    const d = String(x.date);
    if (d.slice(0, 7) !== m || d > upto) continue;
    const p = (x.fpicks || 0) / FC_PICKS_PER_INCH;
    if (!(p > 0)) continue;
    const q = fcQKey(x), f = sd.has(d);
    if (f) lp += p;
    if (q == null) { if (f) un += p; continue; }
    const o = by[q] || (by[q] = {num: 0, pf: 0, days: new Set(), picks: 0, ws: new Set(), names: new Set()});
    o.picks += p; o.ws.add(String(x.width)); if (x.hg) o.names.add(x.hg);
    if (f) { o.num += sd.get(d) * p; o.pf += p; o.days.add(d); }
  }
  for (const o of Object.values(by)) { o.own = o.pf > 0 ? o.num / o.pf : null; o.n = o.days.size; }
  return {by, lp, un, cp: [...cpd.values()].reduce((a, v) => a + v, 0), mdays: sd.size};
}
// fd: foldDays (each day's own s and P); loomdays: [{date, hg, hg0, width, fpicks}] (the loom data); date: the date chip's day.
// → {by: {quality: {s, src ('own' | 'own-last' | 'plant' | 'plant-earlier' | 'none'), n, own, picks, pf, ws, names, from, at}},
//    ps, plant (fcShortAt), at, fallback, why, date, m, lm, min, mdays, readd, diff, back, unas, lp, cp, key}
// readd = the qualities' figures used, re-added by their picks on the month's days with a figure (Unassigned picks at the
// plant's): the check line against the plant's month to date (diff). Nothing is forced to tie (D3).
function fcShortQ(fd, loomdays, date, opt) {
  const min = opt && opt.min > 0 ? opt.min : FC_FQ_MIN, m = String(date).slice(0, 7), lm = fcPrevMonth(m);
  const plant = fcShortAt(fd, date), ps = plant.s;
  const cur = fcQOwn(fd, loomdays, m, date), prev = fcQOwn(fd, loomdays, lm, lm + '-31');
  const by = {};
  for (const q of new Set([...Object.keys(cur.by), ...Object.keys(prev.by)])) {
    const c = cur.by[q], l = prev.by[q], n = c ? c.n : 0, own = c ? c.own : null;
    const e = c && n >= min && own != null ? {s: own, src: 'own'}
      : l && l.n >= min && l.own != null ? {s: l.own, src: 'own-last', from: lm, nl: l.n}
      : ps != null ? {s: ps, src: plant.fallback ? 'plant-earlier' : 'plant', at: plant.at} : {s: null, src: 'none'};
    const z = c || l;
    by[q] = Object.assign(e, {n, own, num: c ? c.num : 0, picks: c ? c.picks : 0, pf: c ? c.pf : 0, ws: [...z.ws].sort(), names: [...z.names].sort()});
  }
  let num = 0, den = 0, bad = false;
  const back = [];
  for (const [q, c] of Object.entries(cur.by)) {
    if (!(c.pf > 0)) continue;
    const e = by[q];
    if (e.s == null) { bad = true; continue; }
    num += e.s * c.pf; den += c.pf;
    if (e.src !== 'own') back.push({q, src: e.src, pf: c.pf, n: e.n, names: e.names});
  }
  if (cur.un > 0) { if (ps == null) bad = true; else { num += ps * cur.un; den += cur.un; } }
  const readd = !bad && den > 0 ? num / den : null;
  return {by, ps, plant, at: plant.at, fallback: plant.fallback, why: plant.why, date, m, lm, min, mdays: cur.mdays, readd, diff: readd != null && ps != null ? readd - ps : null,
          back: back.sort((a, b) => b.pf - a.pf), unas: cur.un, lp: cur.lp, cp: cur.cp, key: 'q|' + date};
}
// A period from..to (design section 3): within one month, that month's map (the date chip's month as at the date chip's day,
// an earlier month as at its last day with a figure); across months, per quality Σ (its month m figure × its loom picks of
// the period in m) ÷ its loom picks of the period, the months with no figure left out (as fcShortPeriod, which gives the
// plant's period figure, ps); a quality that wove nothing in the period takes ps. → a map as fcShortQ (weighted: true,
// months, out), or {by: {}, ps: null, why} when there is no figure.
function fcShortQPeriod(fd, loomdays, from, to, chip, picks, opt) {
  const P = fcShortPeriod(fd, from, to, chip, picks), ym = (d) => String(d).slice(0, 7), cm = ym(chip);
  if (P.s == null) return {by: {}, ps: null, plant: P, why: P.why, months: P.months || [], out: P.out || [], key: 'qp|' + from + '|' + to};
  if (!P.weighted) return fcShortQ(fd, loomdays, ym(from) === cm ? chip : P.at, opt);
  const months = P.months.map((x) => ({m: x.m, Q: fcShortQ(fd, loomdays, x.m === cm ? chip : x.at, opt)})), acc = {};
  for (const x of loomdays || []) {
    const d = String(x.date), mo = months.find((y) => y.m === ym(d));
    if (d < from || d > to || !mo) continue;
    const p = (x.fpicks || 0) / FC_PICKS_PER_INCH, q = fcQKey(x);
    if (!(p > 0) || q == null) continue;
    const s = fcSOf(mo.Q, x);
    if (s == null) continue;
    const o = acc[q] || (acc[q] = {num: 0, p: 0, months: {}, ws: new Set(), names: new Set()});
    o.num += s * p; o.p += p; o.ws.add(String(x.width)); if (x.hg) o.names.add(x.hg);
    const e = mo.Q.by[q], k = o.months[mo.m] || (o.months[mo.m] = {m: mo.m, s, src: e ? e.src : 'plant', p: 0});
    k.p += p;
  }
  const by = {};
  for (const [q, o] of Object.entries(acc)) by[q] = {s: o.num / o.p, src: 'period', months: Object.values(o.months), picks: o.p, ws: [...o.ws].sort(), names: [...o.names].sort()};
  return {by, ps: P.s, plant: P, weighted: true, months: P.months, out: P.out, fallback: P.fallback, at: null, why: null, key: 'qp|' + from + '|' + to};
}
// Target profit per pick (design section 3): the target picks' own folding %, s_T = Σ (each loom-day's target picks × its
// quality's figure) ÷ Σ target picks, over the loom-days that wove (target picks = its picks + the extra picks at the target
// effective RPM, extra(r); a loom-day with no target adds no extra picks). s a number: that number. → {s, tp} or {s: null}.
function fcShortT(rows, extra, s) {
  if (typeof s === 'number') return {s: isFinite(s) ? s : null, tp: null};
  if (!fcSOk(s)) return {s: null, tp: null};
  let num = 0, tp = 0;
  for (const r of rows || []) {
    const p = r.synth ? (r.lpicks || 0) : (r.picks || 0);
    if (!(p > 0)) continue;
    const e = extra ? extra(r) : 0, t = p + (typeof e === 'number' && isFinite(e) ? Math.max(0, e) : 0), v = fcSOf(s, r);
    if (v == null) continue;
    num += t * v; tp += t;
  }
  return tp > 0 ? {s: num / tp, tp} : {s: s.ps, tp: 0};
}
// Round A7: one row at the folding shortage s (in place). Realisation, sale value and both profits follow s; A-grade folded
// picks = picks × (1 − s) − its B grade picks − its share of the day's cut piece picks (null without the day's folding
// figures). A row valued before s (r.real0) is the only one that changes.
// Round A10: s a number or a map (fcSOf: the row's quality's own figure); a map with no figure for the row leaves it a gap.
function fcRowAtS(r, s0) {
  const s = fcSOf(s0, r);
  r.afold = r.afB != null && s != null ? r.picks * (1 - s) - r.afB - r.afC : null;
  if (r.real0 == null) return r;
  if (s == null) { r.s = null; r.sale = r.real = r.fmetres = null; if (r.profit_lc != null) { r.lcost_gap = r.lcost; r.lcost = r.profit_lc = null; } r.gap = r.gap || 'no folding shortage yet'; return r; }
  r.s = s; r.sale = r.sale0 * (1 - s); r.real = r.real0 * (1 - s); r.fmetres = r.metres * (1 - s);
  if (r.profit_lc != null) r.profit_lc = r.real - r.lcost - r.bcharge;
  return r;
}
// Round A7: the same rows at another folding shortage (a card whose period crosses a month: the picks-weighted s, design
// answer 2). Copies, so the cached rows stay as they are; lday and bday ride along. s: a number or (Round A10) a map.
function fcAtS(rows, s) {
  const out = (rows || []).map((r) => fcRowAtS(Object.assign({}, r), s));
  out.lday = rows.lday; out.bday = rows.bday; out.s = s;
  return out;
}
// Round A7: the B grade picks and the cut piece share of each row, as Folded cost per pick by quality has always worked them
// (one helper for both). R: the rows of the days wanted (each with r.lc, synth rows included: they carry picks but no B
// grade); reg: [{date, loom, m, ppi}]; fold: {date: {C, w}}. B grade picks = the register metres × the quality's PICK (else
// the floor's), shared over the loom's fabric records by picks; what cannot be pinned to a loom of the day is spread over the
// day's fabric-record picks. Cut piece share = the day's cut piece picks × its picks ÷ the day's picks. → Map(row → {B, C}).
function fcAfoldParts(R, reg, fold) {
  const P = (r) => r.synth ? (r.lpicks || 0) : (r.picks || 0), use = new Set(R.map((r) => r.date));
  const byLd = new Map(), dayP = new Map(), dayB = new Map();
  for (const r of R) { const k = r.date + '|' + r.loom; if (!byLd.has(k)) byLd.set(k, []); byLd.get(k).push(r); dayP.set(r.date, (dayP.get(r.date) || 0) + P(r)); if (!r.synth) dayB.set(r.date, (dayB.get(r.date) || 0) + P(r)); }
  const bp = new Map(), spread = new Map();
  for (const e of reg || []) {
    if (!use.has(e.date) || !(typeof e.m === 'number' && isFinite(e.m))) continue;
    const pick = typeof e.ppi === 'number' && e.ppi > 0 ? e.ppi : fold[e.date].w, b = e.m * (pick || 0), rs = (byLd.get(e.date + '|' + e.loom) || []).filter((r) => !r.synth && P(r) > 0);
    const lp = rs.reduce((a, r) => a + P(r), 0);
    if (lp > 0) for (const r of rs) bp.set(r, (bp.get(r) || 0) + b * P(r) / lp); else spread.set(e.date, (spread.get(e.date) || 0) + b);
  }
  const out = new Map();
  for (const r of R) {
    const p = P(r), dp = dayP.get(r.date) || 0, db = r.synth ? 0 : dayB.get(r.date) || 0;
    out.set(r, {B: (bp.get(r) || 0) + (db > 0 ? (spread.get(r.date) || 0) * p / db : 0), C: dp > 0 ? fold[r.date].C * p / dp : 0});
  }
  return out;
}
// ---- The loom cost basis. Round Y (23 Nov 2026) built it; Round A3 (Divyam, 24 Nov 2026) is its method now, the only profit:
// each costed day's cost on the chosen basis (Round B2; its pool, OPEX + cut piece loss, POWER with the 0.02 ₹/pick correction
// taken off, as it is since Round A5) is split in four and charged to the
// loom-days that made it:
//   1. the compressor (the exact day's Power (Compressor) rupees, never borrowed from another day) by air: each loom's air in
//      the day (CFM × run minutes, ft³) × the day's compressor ₹ per ft³ (its rupees ÷ the air of every loom with a CFM reading);
//   2. the rest of POWER (POWER less the compressor), per pick: the same paise on every pick of the day;
//   3. the cut piece loss, per pick, in the same paise;
//   4. every other head (OPEX less POWER and cut piece loss) ÷ the looms running (run minutes > 0, as Break-even) = per loom.
// A day whose compressor rupees cannot be split by air (no reading that day, more than the POWER line, or no loom with a CFM
// reading) charges the whole of POWER per pick (L.nocomp); with no POWER line at all, POWER cannot be told apart from the
// other heads and stays with them (per loom). A loom-day split across
// head groups (a changeover) shares its loom's parts 1 and 4 by its picks. A loom that ran with no reading of its air, on a day
// with a compressor, gets no loom cost profit ('no CFM reading for the loom', counted in Coverage, never ₹0). A loom that ran
// and is not priced (no link, no rate, no picks, or no fabric record) leaves its loom cost not recovered (lcost_gap, U), never
// put into a priced row. B grade is the loom's own, as before.
// running: {date: [{loom, width, hg, hg0, air, picks}] | [loom]}; air: ft³ (null with no CFM reading); picks: the loom data's
// picks (fabric picks ÷ 39.37), for a loom with no fabric record. inp.comp: {date: compressor rupees}.
// Returns {date: {pool, total, pw, comp, cut, other, n, per, pp, rate, air, nocomp, unrec, unrec_ld, nopick_ld, why}};
// sets lcost and its parts lc {loom, comp, pick} / profit_lc (priced rows), lcost_gap (the rest), lrun.
function fcLoomCost(rows, cost, running, picksOf, inp) {
  const lday = {}, byLd = new Map(), comp = inp.comp || {};
  for (const r of rows) { const k = r.date + '|' + r.loom; if (!byLd.has(k)) byLd.set(k, []); byLd.get(k).push(r); }
  const inRange = (d) => (!inp.from || d >= inp.from) && (!inp.to || d <= inp.to);
  for (const [d, c] of cost) {
    if (!c || !inRange(d)) continue;
    const pool = c.base * c.afold * 1e5, raw = running[d];
    const L = {pool, total: pool, bnet: c.bnet, pw: c.pw, comp: null, cut: c.cut, other: null, n: null, per: null, pp: null, rate: null, air: null, nocomp: false,
               unrec: 0, unrec_ld: 0, nopick_ld: 0, noair_ld: 0, why: null};
    lday[d] = L;
    if (!Array.isArray(raw)) { L.why = 'no loom data for the day'; continue; }
    if (!rows.some((r) => r.date === d)) { L.why = 'no fabric data for the day'; continue; }   // the fabric records lag the loom data: a gap, not the whole day as not recovered
    const lm = new Map();   // one entry per loom (a changeover loom-day has one entry per head group in the loom data)
    for (const y of raw) {
      const x = typeof y === 'object' && y ? y : {loom: y}, key = String(x.loom);
      if (!lm.has(key)) lm.set(key, {loom: x.loom, width: x.width, hg: x.hg, hg0: x.hg0, air: null, picks: 0});
      const o = lm.get(key);
      if (typeof x.air === 'number' && isFinite(x.air) && x.air > 0) o.air = (o.air || 0) + x.air;
      if (typeof x.picks === 'number' && isFinite(x.picks)) o.picks += x.picks;
    }
    const looms = [...lm.values()];
    L.n = looms.length;
    if (!L.n) { L.why = 'no loom ran'; continue; }
    // the parts of the day's cost
    const cr = typeof comp[d] === 'number' && isFinite(comp[d]) ? comp[d] : null;
    L.air = looms.reduce((a, x) => a + (x.air || 0), 0);
    if (cr != null && cr > 0 && L.pw != null && cr <= L.pw && L.air > 0) { L.comp = cr; L.rate = cr / L.air; } else { L.comp = 0; L.nocomp = true; }
    const pw = L.pw != null ? L.pw : 0;
    L.other = pool - L.cut - pw;
    const pickPool = pw - L.comp + L.cut;
    let Ptot = 0;
    for (const r of rows) if (r.date === d) Ptot += r.picks || 0;
    for (const x of looms) if (!byLd.has(d + '|' + x.loom)) Ptot += x.picks || 0;
    // no fabric record with picks: no row carries the day's B grade (fcAnalyse charges it over the picks), so it goes per loom too
    L.bper = rows.bday && rows.bday.has(d) ? 0 : L.bnet;
    if (Ptot > 0) { L.pp = pickPool / Ptot; L.per = (L.other + L.bper) / L.n; } else { L.pp = 0; L.per = (L.other + L.bper + pickPool) / L.n; }   // no picks woven at all: the whole day per loom
    L.pick = pickPool; L.ptot = Ptot;   // Round A6: the picks the per pick part is shared over (fcTargetFoldByQuality takes each row's cut piece share off)
    const ran = new Set(looms.map((x) => String(x.loom)));
    for (const x of looms) {
      const k = d + '|' + x.loom, rs = byLd.get(k) || [], P = picksOf.get(k) || 0;
      const noAir = !L.nocomp && !(x.air > 0), cpart = L.nocomp || noAir ? 0 : x.air * L.rate;
      let u = 0;
      if (!rs.length) {   // ran in the loom data, no fabric record (D2): its whole loom cost is not recovered
        const lp = x.picks || 0, lc = L.per + cpart + lp * L.pp;
        rows.push({date: d, loom: x.loom, width: String(x.width ?? ''), hg: x.hg || 'Unassigned', hg0: x.hg0 || x.hg || 'Unassigned', styles: [], picks: 0, lpicks: lp, metres: null, fabric: null, basis: null,
                   sale: null, real: null, bcharge: null, costed: false, gap: lp > 0 ? 'no fabric record' : 'no picks woven', lcost_gap: lc, lc: {loom: L.per, comp: cpart, pick: lp * L.pp}, lrun: true, synth: true, noair: noAir});
        u = lc;
        if (!(lp > 0)) L.nopick_ld++;
      } else {
        rs.forEach((r, i) => {
          const share = P > 0 ? r.picks / P : (i === 0 ? 1 : 0);   // no picks at all: the whole loom part on its first record
          const parts = {loom: L.per * share, comp: cpart * share, pick: (r.picks || 0) * L.pp}, lc = parts.loom + parts.comp + parts.pick;
          r.lrun = true; r.lc = parts; if (noAir) r.noair = true;   // Round A3: its compressor part is unknown (fcFoldByQuality makes its quality a gap)
          if (!r.gap && r.costed && noAir) { r.lc_gap = 'no CFM reading for the loom'; r.lc_noair = lc; }
          else if (!r.gap && r.costed) { r.lcost = lc; r.profit_lc = r.real - lc - r.bcharge; }
          else { r.lcost_gap = lc; u += lc; }
        });
        if (!(P > 0) && u > 0) L.nopick_ld++;
        if (noAir && rs.some((r) => r.lc_noair != null)) L.noair_ld++;
      }
      if (u > 0) { L.unrec += u; L.unrec_ld++; }
    }
    // picks with no run minutes (D2): not counted in the looms running, so no per loom part or air; their picks carry the per pick parts
    const nu = new Set();
    for (const r of rows) {
      if (r.date !== d || ran.has(String(r.loom)) || r.synth) continue;
      const lc = (r.picks || 0) * L.pp;
      r.lc = {loom: 0, comp: 0, pick: lc};
      if (!r.gap && r.costed) { r.lcost = lc; r.profit_lc = r.real - lc - r.bcharge; r.lc_norun = true; }
      else if (lc > 0) { r.lcost_gap = lc; L.unrec += lc; nu.add(String(r.loom)); }
    }
    L.unrec_ld += nu.size;
  }
  for (const r of rows) if (!r.gap && r.costed && r.profit_lc == null && !r.lc_gap) r.lc_gap = (lday[r.date] && lday[r.date].why) || 'no loom data for the day';
  return lday;
}
// ---- Round A3, item 8 (Divyam, 24 Nov 2026): the folded cost per pick of each quality (head group × width), on the loom
// cost method. Each quality carries its own loom cost (the compressor by its air, the rest of POWER (on the chosen basis) + cut piece
// loss per pick, other heads per loom running; fcLoomCost's parts r.lc) and its own B grade, net of B grade revenue (r.bcharge,
// as the engine charges it). Its A-grade folded picks = its picks × (1 − its quality's own folding % (Round A10; was one s, the same for
// every quality) − its B grade picks (its register metres × the quality's PICK; what cannot be pinned to a loom of the day,
// spread over the day's picks) − its share of the day's cut piece picks (by picks). So the qualities' A-grade folded picks
// add up to the floor's picks × (1 − s) − B − C. Folded cost per pick = cost ÷ A-grade folded picks × 100 (paise).
// rows: fcAnalyse rows (all widths) of the days wanted (they need rows.lday); reg: [{date, loom, m, ppi}]; fold: {date: {C, w}}
// (the day's cut piece picks and the floor's PICK, foldDay); s: a number or (Round A10) each quality's own folding % (fcShortQ). A day without a loom cost
// (no costing, no loom data) or without its folding figures is left out (out). Round A4 (Divyam, 24 Nov 2026, answer 1 a): a
// loom-day that ran with no CFM reading, on a day with a compressor, is left out of its quality (its cost, picks, B grade and
// cut piece share) and counted in noair (loom-days, named on screen); a quality with nothing left is a gap, never ₹0.
// Round A4, the reference (the Quality grid): scale(r) = how many times its picks the loom-day would weave at the reference
// effective RPM (null = no reference for it). Its picks, B grade picks and rupees and cut piece share scale; the loom cost
// stays (Round Y decision 4). A loom-day with no reference is left out and counted in noref.
// Round A6 (Divyam, 25 Nov 2026, answer 1 b): key(r) → [group key, name, width] groups the rows another way; fcFqAll groups a
// quality across both widths by its head group's Style-map root (hg0), whatever its fabric names on each width. With a key
// there are no width rows (widths []); each group carries names (its head groups' shown names) and ws (its widths).
// → {s, groups: [{key, hg, width, names, ws, ld, picks, cost, B, C, A, pp, noair, noref}], widths, all, days, out}
const fcFqWidth = (r) => [r.hg + '|' + r.width, r.hg, r.width];
const fcFqAll = (r) => ['r:' + (r.hg0 || r.hg), r.hg0 || r.hg, 'all'];
function fcFoldByQuality(rows, reg, fold, s, from, to, scale, key) {
  if (!fcSOk(s)) return null;   // Round A10: s a number or a map (each quality its own folding %)
  const lday = rows.lday || {}, P = (r) => r.synth ? (r.lpicks || 0) : (r.picks || 0);
  const okDay = (d) => lday[d] && lday[d].per != null && fold && fold[d] && typeof fold[d].C === 'number' && isFinite(fold[d].C);
  // the days: every date of the rows, and every costed day the loom cost table holds in from..to (a costed day with no fabric record is named, not dropped)
  const inR = (d) => (!from || d >= from) && (!to || d <= to);
  const days = [...new Set([...rows.map((r) => r.date), ...Object.keys(lday)].filter(inR))].sort(), use = new Set(days.filter(okDay));
  const out = days.filter((d) => !use.has(d)).map((d) => ({date: d, why: !lday[d] ? 'no costing day' : lday[d].per == null ? lday[d].why || 'no loom cost' : 'no folding figures'}));
  // B grade picks ride on the fabric records' picks only, as the engine charges B grade rupees (a loom with no fabric record
  // carries none of either). Round A7: worked by fcAfoldParts, the helper the Realisation tab's A-grade folded picks use too.
  const R = rows.filter((r) => use.has(r.date) && r.lc), parts = fcAfoldParts(R, reg, fold);
  const G = new Map(), add = (k, hg, width) => { if (!G.has(k)) G.set(k, {key: k, hg, width, names: new Set(), ws: new Set(), ld: new Set(), picks: 0, pf: 0, cost: 0, B: 0, C: 0, noair: new Set(), noref: new Set()}); return G.get(k); };
  for (const r of R) {
    const g = add(...(key || fcFqWidth)(r)), p = P(r), q = parts.get(r), k = r.date + '|' + r.loom;
    g.names.add(r.hg); g.ws.add(String(r.width));
    if (r.noair) { g.noair.add(k); continue; }   // answer 1 a: left out and named, the rest of the quality stands
    const f = scale ? scale(r) : 1;
    if (!(typeof f === 'number' && isFinite(f) && f >= 0)) { g.noref.add(k); continue; }
    g.ld.add(k); g.picks += p * f; g.pf += p * f * (1 - fcSOf(s, r));   // Round A10: its picks after its own quality's folding %
    g.cost += r.lc.loom + r.lc.comp + r.lc.pick + f * (r.bcharge ?? r.bcharge_gap ?? 0);
    g.B += f * q.B;
    g.C += f * q.C;
  }
  // the loom-days are counted once each (a changeover loom-day sits in two qualities): the width and Both widths rows take the union of the keys (Fable review, Round A4)
  const fin = (g) => { g.keys = {ld: g.ld, noair: g.noair, noref: g.noref}; for (const x of ['ld', 'noair', 'noref']) g[x] = g.keys[x].size;
    g.A = (typeof s === 'number' ? g.picks * (1 - s) : g.pf) - g.B - g.C; g.pp = g.ld > 0 && g.A > 0 ? 100 * g.cost / g.A : null;
    g.sq = typeof s === 'number' ? s : g.picks > 0 ? 1 - g.pf / g.picks : null; return g; };   // Round A10: the folding % its picks were taken at (a width row: the mix)
  const groups = [...G.values()].map(fin).sort((a, b) => b.picks - a.picks);
  const tot = (L, x) => L.reduce((a, g) => a + g[x], 0), un = (L, x) => new Set(L.flatMap((g) => [...g.keys[x]]));
  const sum = (L, key) => fin({key, ld: un(L, 'ld'), picks: tot(L, 'picks'), pf: tot(L, 'pf'), cost: tot(L, 'cost'), B: tot(L, 'B'), C: tot(L, 'C'), noair: un(L, 'noair'), noref: un(L, 'noref')});
  const strip = (g) => { delete g.keys; if (g.names) { g.names = [...g.names].sort(); g.ws = [...g.ws].sort(); } return g; };
  const widths = key ? [] : [...new Set(groups.map((g) => g.width))].sort().map((w) => Object.assign(sum(groups.filter((g) => g.width === w), w + ' cm'), {width: w}));
  const all = sum(groups, 'Both widths');
  [...groups, ...widths, all].forEach(strip);
  return {s, groups, widths, all, days: [...use], out};
}
// ---- Round A8 (Divyam, 25 Nov 2026, the Quality period bar, answers 2 a and 3 b): a quality's folded cost per pick over a
// period = Σ the days' cost ÷ Σ their A-grade folded picks × 100, each day worked by fcFoldByQuality at its own month-to-date
// folding shortage, and the reference the same way (each day re-worked at the reference effective RPM). days: [{date, why}
// (a day with no figure: no shortage, no costing, no loom cost or no folding figures; left out and named) or {date, F, R}
// (fcFoldByQuality now and at the reference, R null when there is no reference)]; k: the group's key. A day the quality did
// not weave is skipped. The reference stands only when every day used has one (a head group with no reference effective
// RPM has none on any day). → {cost, A, pp, ld, noair, days (dates used), out, ref: {cost, A, pp} | null}, or null when the
// quality wove on no day with a figure (its cost is never shown as 0).
function fcFoldPool(days, k) {
  let cost = 0, A = 0, ld = 0, noair = 0, rc = 0, rA = 0, refOk = true;
  const used = [], out = [];
  for (const d of days || []) {
    if (d.why) { out.push({date: d.date, why: d.why}); continue; }
    const g = d.F && d.F.groups.find((x) => x.key === k);
    if (!g) continue;
    noair += g.noair || 0;
    if (!(g.ld > 0)) continue;
    cost += g.cost; A += g.A; ld += g.ld; used.push(d.date);
    const r = d.R && d.R.groups.find((x) => x.key === k);
    if (!r || !(r.ld > 0) || r.noref) refOk = false; else { rc += r.cost; rA += r.A; }
  }
  if (!used.length) return noair || out.length ? {cost: null, A: null, pp: null, ld: 0, noair, days: used, out, ref: null} : null;
  return {cost, A, pp: A > 0 ? 100 * cost / A : null, ld, noair, days: used, out, ref: refOk ? {cost: rc, A: rA, pp: rA > 0 ? 100 * rc / rA : null} : null};
}
// ---- Round A6 (Divyam, 25 Nov 2026, answers 2 a and 3 a): the target folded cost per pick of each quality, the day and month
// to date: Target profit per pick's target folded cost (fcTargetFoldLc) split quality by quality. Each loom-day row keeps its
// loom cost (fcLoomCost's parts r.lc; Round Y decision 4) less its share of the cut piece loss (its picks × the cut piece loss
// ÷ the day's picks, as the per pick part charges it), less its own CFM saving (Target cost per pick step 1), less its share
// of the pressure saving (step 2, by its air after step 1), plus its own added costs (step 4); no B grade and no cut pieces
// (step 5). Its target A-grade folded picks = (its picks + its extra picks at the target effective RPM) × (1 − s, the same
// quality figures as the folded cost; Round A10). A quality = Σ its loom-days' target cost ÷ Σ their target A-grade folded
// picks × 100 (paise); the width rows, Both widths and month to date add up the same way (Σ cost ÷ Σ picks, never an average).
// A loom-day whose Target cost per pick record has a gap (no CFM reading, no target CFM, no target RPM, no picks per metre)
// is left out of its quality and named (lo, with its reasons), never counted as 0; a quality with nothing left is a gap.
// The tie (each day): the qualities' target cost + that of the loom-days left out = the day's target cost on Target profit
// per pick (L.total − L.cut − Sc − Sp + Add), to the rupee. A row that wove picks with no run minutes has no record: no
// saving, no extra picks (it did not run), not a gap.
// days: [{date, rows (fcAnalyse rows of that day, with r.lc), L (rows.lday[date]), parts (targetCost's parts: loom, hg,
// cfmRs, E, a1, addRs, gaps), Sc, Sp, Add (the day's savings and added costs, ₹, or null)}]; s: the folding shortage; key as
// fcFoldByQuality. → {s, groups: [{key, hg, width, names, ws, ld, lo, why, picks, E, lc, cut, cfm, press, add, cost, A, pp}],
// widths, all, tie: [{date, cost, lo, sum, want, diff, nrec, gaps}], out: [{date, why}] (days left out)}
function fcTargetFoldByQuality(days, s, key) {
  const n = (v) => typeof v === 'number' && isFinite(v);
  if (!fcSOk(s)) return null;   // Round A10: s a number or a map (each quality its own folding %)
  const P = (r) => r.synth ? (r.lpicks || 0) : (r.picks || 0), G = new Map(), tie = [], out = [];
  const add = (k, hg, width) => { if (!G.has(k)) G.set(k, {key: k, hg, width, names: new Set(), ws: new Set(), ld: new Set(), lo: new Set(), why: {}, picks: 0, E: 0, pfE: 0, lc: 0, cut: 0, cfm: 0, press: 0, add: 0}); return G.get(k); };
  for (const D of days || []) {
    const L = D.L, rows = (D.rows || []).filter((r) => r.date === D.date && r.lc);
    if (!L || L.per == null) { out.push({date: D.date, why: (L && L.why) || 'no loom cost for the day'}); continue; }
    if (!rows.length) { out.push({date: D.date, why: 'no fabric data for the day'}); continue; }
    if (!(L.ptot > 0)) { out.push({date: D.date, why: 'no picks woven'}); continue; }   // numbers review: nothing to share the day's cost over
    const rec = new Map();   // the Target cost per pick records of a loom × head group, added up
    for (const q of D.parts || []) {
      const k = q.loom + '|' + q.hg, o = rec.get(k) || {cfm: 0, add: 0, E: 0, a1: 0, gaps: []};
      if (n(q.cfmRs)) o.cfm += q.cfmRs;
      if (n(q.addRs)) o.add += q.addRs;
      if (n(q.E)) o.E += q.E;
      if (n(q.a1)) o.a1 += q.a1;
      for (const x of q.gaps || []) if (!o.gaps.includes(x)) o.gaps.push(x);
      rec.set(k, o);
    }
    const A1 = [...rec.values()].reduce((a, o) => a + o.a1, 0), Sp = n(D.Sp) ? D.Sp : 0;
    const lp = new Map(), cnt = new Map();   // the picks and rows of a loom × head group (a share when one record covers several rows)
    for (const r of rows) { const k = r.loom + '|' + r.hg; lp.set(k, (lp.get(k) || 0) + P(r)); cnt.set(k, (cnt.get(k) || 0) + 1); }
    let tot = 0, lo = 0;
    const used = new Set();
    for (const r of rows) {
      const k = r.loom + '|' + r.hg, o = rec.get(k), p = P(r), lpk = lp.get(k) || 0, f = lpk > 0 ? p / lpk : 1 / cnt.get(k);
      // numbers review: a day whose B grade could not ride on a fabric record carries it per loom (L.bper inside L.per); the
      // target has no B grade, so that share comes off the loom cost
      const bp = L.bper && L.per > 0 && L.n > 0 ? r.lc.loom * (L.bper / L.n) / L.per : 0, lc = r.lc.loom + r.lc.comp + r.lc.pick - bp;
      const cut = n(L.cut) && L.cut ? p * L.cut / L.ptot : 0;
      if (o) used.add(k);
      const cfm = o ? o.cfm * f : 0, press = o && A1 > 0 ? Sp * o.a1 / A1 * f : 0, ad = o ? o.add * f : 0, E = o ? o.E * f : 0;
      const tc = lc - cut - cfm - press + ad, g = add(...(key || fcFqWidth)(r)), ldk = r.date + '|' + r.loom;
      g.names.add(r.hg); g.ws.add(String(r.width)); tot += tc;
      const gaps = o ? o.gaps : r.lrun ? ['not on Target cost per pick that day'] : [];
      if (gaps.length) { g.lo.add(ldk); for (const x of gaps) (g.why[x] = g.why[x] || new Set()).add(ldk); lo += tc; continue; }
      g.ld.add(ldk); g.picks += p; g.E += E; g.pfE += (p + E) * (1 - fcSOf(s, r)); g.lc += lc; g.cut += cut; g.cfm += cfm; g.press += press; g.add += ad;
    }
    // numbers review: a record with no row of its own (its loom|hg not in the fabric rows) and a pressure saving with no air
    // to share it by belong to no quality: they go with what is left out, so the day still ties
    let nrec = 0;
    for (const [k, o] of rec) if (!used.has(k)) { const x = -o.cfm - (A1 > 0 ? Sp * o.a1 / A1 : 0) + o.add; lo += x; tot += x; nrec++; }
    if (!(A1 > 0) && Sp) { lo -= Sp; tot -= Sp; }
    const want = L.total - (n(L.cut) ? L.cut : 0) - (n(D.Sc) ? D.Sc : 0) - Sp + (n(D.Add) ? D.Add : 0);
    tie.push({date: D.date, cost: tot - lo, lo, sum: tot, want, diff: tot - want, nrec, gaps: D.gaps || []});
  }
  const fin = (g) => { g.cost = g.lc - g.cut - g.cfm - g.press + g.add; g.A = typeof s === 'number' ? (g.picks + g.E) * (1 - s) : g.pfE; g.sq = typeof s === 'number' ? s : g.picks + g.E > 0 ? 1 - g.pfE / (g.picks + g.E) : null; g.pp = g.ld.size > 0 && g.A > 0 ? 100 * g.cost / g.A : null; return g; };
  const groups = [...G.values()].map(fin).sort((a, b) => b.picks - a.picks);
  const F = ['picks', 'E', 'pfE', 'lc', 'cut', 'cfm', 'press', 'add'];
  const sum = (L, k) => { const o = {key: k, ld: new Set(L.flatMap((g) => [...g.ld])), lo: new Set(L.flatMap((g) => [...g.lo])), why: {}};
    for (const x of F) o[x] = L.reduce((a, g) => a + g[x], 0);
    for (const g of L) for (const [w, c] of Object.entries(g.why)) for (const x of c) (o.why[w] = o.why[w] || new Set()).add(x);
    return fin(o); };
  const widths = key ? [] : [...new Set(groups.map((g) => g.width))].sort().map((w) => Object.assign(sum(groups.filter((g) => g.width === w), w + ' cm'), {width: w}));
  const all = sum(groups, 'Both widths');
  for (const g of [...groups, ...widths, all]) { g.ld = g.ld.size; g.lo = g.lo.size; for (const w in g.why) g.why[w] = g.why[w].size; if (g.names) { g.names = [...g.names].sort(); g.ws = [...g.ws].sort(); } }
  return {s, groups, widths, all, tie, out};
}
// Round A5 (Divyam, 25 Nov 2026, option B): the split bar of Realisation per pick by quality on Actions. Round A7 (the
// folded basis): real = the quality's realisation per A-grade folded pick and fold = the folded cost per pick of the same
// priced loom-days with a loom cost profit (fcSum's real_fp_lc and cost_fp), so the difference IS the profit per folded pick.
// cover = the part of the bar the cost takes (grey), over = what is left above it (green), short = how far the cost runs past
// the realisation (red). Either missing = null (a gap, never 0). → {diff, cover, over, short} in paise.
function fcRealLessFold(real, fold) {
  const n = (v) => typeof v === 'number' && isFinite(v);
  if (!n(real) || !n(fold)) return null;
  const diff = real - fold;
  return {diff, cover: Math.max(0, Math.min(real, fold)), over: Math.max(0, diff), short: Math.max(0, -diff)};
}
// Round B3 (Divyam, 27 Nov 2026): the realisation share pie of Realisation per pick by quality (Current, Best or Target).
// items: [{key, real, ...}] with real = the quality's realisation ₹. A slice only for real > 0: its share = real ÷ the total
// of the slices (so the pie adds to 100%). real ≤ 0 is listed apart (neg), never a slice; real not a number is a gap (gap),
// never 0. Slices under `min` (0.03) of the total go into one Others slice (its own items kept in `items`), unless only one
// would go there (then it stays as itself); past the maxN (9) largest, the rest always go into Others (no colour repeats). Largest first. → {total, slices: [{key, real, pct, items?}], neg, gap}.
function fcShare(items, min = 0.03, maxN = 9) {
  const n = (v) => typeof v === 'number' && isFinite(v);
  const pos = items.filter((x) => n(x.real) && x.real > 0).sort((a, b) => b.real - a.real);
  const neg = items.filter((x) => n(x.real) && x.real <= 0), gap = items.filter((x) => !n(x.real));
  const total = pos.reduce((a, x) => a + x.real, 0);
  if (!(total > 0)) return {total: null, slices: [], neg, gap};
  let big = pos.filter((x) => x.real / total >= min), small = pos.filter((x) => x.real / total < min);
  const cap = big.length > maxN;
  if (cap) { small = big.slice(maxN).concat(small); big = big.slice(0, maxN); }
  const grp = small.length > 1 || cap, slices = (grp ? big : pos).map((x) => Object.assign({}, x, {pct: x.real / total}));
  if (grp) { const r = small.reduce((a, x) => a + x.real, 0); slices.push({key: 'Others', others: true, real: r, pct: r / total, items: small.map((x) => Object.assign({}, x, {pct: x.real / total}))}); }
  return {total, slices, neg, gap};
}
// What the analysis charged against what the plant's costing says the same days cost (review 7): the folded cost is per
// A-grade folded pick and is applied to every woven pick, so the two differ when folding runs behind or ahead of weaving.
// Round Y: charged_lc, the loom cost basis (each day's pool ÷ looms running, per loom-day, priced or not, plus B grade),
// ties to the plant's figure on every day with loom data (lc_days); lc_nodays counts costed days without it.
function fcReconcile(rows, costing) {
  const days = new Set(rows.map((r) => r.date));
  let plant = 0, bnet = 0, nodays = 0, noreg = 0, charged_lc = 0, plant_lc = 0, lc_days = 0, lc_nodays = 0;
  const lday = rows.lday || null;
  for (const c of costing || []) {
    if (!days.has(c.date)) continue;
    const k = fcCostDay(c); if (!k) continue;
    plant += k.fold * c.afold * 1e5; bnet += k.bnet; nodays++;
    if (lday) { const L = lday[c.date]; if (L && L.per != null) { lc_days++; plant_lc += k.fold * c.afold * 1e5; } else lc_nodays++; }   // the plant's folded total as it is (Round A5, 25 Nov 2026)
  }
  for (const r of rows) {
    if (lday && lday[r.date] && lday[r.date].per != null) charged_lc += (r.lcost ?? r.lcost_gap ?? r.lc_noair ?? 0) + (r.bcharge ?? r.bcharge_gap ?? 0);   // Round A3: a loom with no CFM reading is charged too (its profit is the gap)
  }
  for (const [, b] of rows.bday || []) if (!b.reg) noreg++;
  return {plant, days: nodays, bnet, noreg, uncosted: [...days].filter((d) => !(costing || []).some((c) => c.date === d && fcCostDay(c))).length,
          charged_lc: lday ? charged_lc : null, plant_lc: lday ? plant_lc : null, diff_lc: lday ? charged_lc - plant_lc : null, lc_days, lc_nodays};
}
// Totals of a set of rows: picks (all and priced), coverage, rupees and paise per pick, loom-days.
// Round Y: the loom cost basis too. withU (default true): the rows are the whole floor or one width, so the loom cost of
// their running loom-days that are not priced (unrec) is taken off profit_lc, and ₹ a loom a day divides by every running
// loom-day with a loom cost (D3). withU false (By loom, By head group): priced rows only, never U.
function fcSum(rows, withU = true) {
  const t = {picks: 0, priced: 0, costed: 0, metres: 0, sale: 0, real: 0, bcharge: 0, loomdays: 0, priced_ld: 0, costed_ld: 0, gaps: {},
             lc_priced: 0, lcost: 0, lc_costed: 0, lc_bcharge: 0, unrec: 0, unrec_ld: 0, lc_ld: 0, lc_gaps: {}, norun_ld: 0, nopick_ld: 0, lc_metres: 0, fmetres: 0};
  const ld = new Set(), pld = new Set(), cld = new Set(), lld = new Set(), uld = new Set(), rld = new Set(), nld = new Set(), npld = new Set();
  // Round A7: the folded basis. fp: priced rows with A-grade folded picks; fl: of those, the rows with a loom cost profit (the
  // identity realisation − folded cost = profit holds on them exactly); U on the days that have A-grade folded picks only
  const F = {A: 0, real: 0, sale: 0, ld: new Set(), lA: 0, lreal: 0, lcost: 0, lb: 0, lprof: 0, lld: new Set(), U: 0, nofold: new Set(), days: new Set()};
  for (const r of rows) if (r.afold != null) F.days.add(r.date);
  for (const r of rows) {
    const k = r.date + '|' + r.loom;
    if (r.lcost_gap != null && F.days.has(r.date)) F.U += r.lcost_gap;
    if (!r.gap) { if (r.afold != null) { F.A += r.afold; F.real += r.real; F.sale += r.sale; F.ld.add(k); if (r.profit_lc != null) { F.lA += r.afold; F.lreal += r.real; F.lcost += r.lcost; F.lb += r.bcharge; F.lprof += r.profit_lc; F.lld.add(k); } } else F.nofold.add(k); }
    t.picks += r.picks; ld.add(k);
    if (r.lcost_gap != null) { t.unrec += r.lcost_gap; if (r.lcost_gap > 0) { uld.add(k); if (r.gap === 'no picks' || r.gap === 'no picks woven') npld.add(k); } if (r.lrun) rld.add(k); }   // Round A3: picks with no run minutes are not a loom-day running
    if (r.gap) { t.gaps[r.gap] = (t.gaps[r.gap] || 0) + r.picks; continue; }
    t.priced += r.picks; t.metres += r.metres; t.fmetres += r.fmetres ?? r.metres; t.sale += r.sale; t.real += r.real; pld.add(k);   // Round A7: fmetres = folded metres (sale value is on them)
    if (r.costed) { t.costed += r.picks; t.bcharge += r.bcharge; cld.add(k); }
    if (r.profit_lc != null) { t.lc_costed += r.picks; t.lc_priced += r.profit_lc; t.lcost += r.lcost; t.lc_bcharge += r.bcharge; lld.add(k); if (r.lrun) rld.add(k); if (r.lc_norun) nld.add(k); }
    else if (r.lc_gap) t.lc_gaps[r.lc_gap] = (t.lc_gaps[r.lc_gap] || 0) + r.picks;
  }
  t.loomdays = ld.size; t.priced_ld = pld.size; t.costed_ld = cld.size;
  t.coverage = t.picks ? t.priced / t.picks : null;
  t.cost_coverage = t.picks ? t.costed / t.picks : null;
  const pp = (rs, p) => p ? rs / p * 100 : null;
  t.sale_pp = pp(t.sale, t.priced); t.real_pp = pp(t.real, t.priced);
  // rupees per loom per day (Divyam, 10 Nov 2026): the period's rupees ÷ the loom-days they came from
  t.sale_ld = t.priced_ld ? t.sale / t.priced_ld : null; t.real_ld = t.priced_ld ? t.real / t.priced_ld : null;
  // the loom cost basis (Round Y): nothing priced with a loom cost = a gap (null), never ₹0
  t.lc_ld = lld.size; t.unrec_ld = uld.size; t.norun_ld = nld.size;
  t.nopick_ld = npld.size;   // Round A3 (risk D): the loom-days not priced that ran but wove no picks, named apart from those not priced
  if (!withU) { t.unrec = 0; t.unrec_ld = 0; t.nopick_ld = 0; }
  t.lc_run_ld = withU ? new Set([...rld, ...[...lld].filter((k) => !nld.has(k))]).size : lld.size;
  t.profit_lc = t.lc_ld ? t.lc_priced - t.unrec : null;
  // Round A7: every per-pick realisation and profit is per A-grade folded pick (design 2026-11-25). real_pp stays the
  // realisation per woven pick (now after shrinkage), used inside the rupee valuations only (lost picks × it); no screen shows
  // it as "per pick". A ≤ 0 or no folding figures = a gap (null), never 0.
  const U = withU ? F.U : 0, fp = (v, a) => a > 0 ? v / a * 100 : null;
  t.afold = F.A; t.fp_ld = F.ld.size; t.nofold_ld = F.nofold.size; t.afold_lc = F.lA; t.fl_ld = F.lld.size; t.unrec_fp = U;
  t.real_fp = F.ld.size ? fp(F.real, F.A) : null; t.sale_fp = F.ld.size ? fp(F.sale, F.A) : null;
  t.real_fp_lc = F.lld.size ? fp(F.lreal, F.lA) : null;
  t.cost_fp = F.lld.size ? fp(F.lcost + F.lb, F.lA) : null;
  t.cost_fp_u = F.lld.size ? fp(F.lcost + F.lb + U, F.lA) : null;
  t.profit_fp = F.lld.size ? fp(F.lprof - U, F.lA) : null;
  t.profit_lc_pp = t.lc_ld ? t.profit_fp : null;
  t.profit_lc_ld = t.lc_ld && t.lc_run_ld ? t.profit_lc / t.lc_run_ld : null;
  t.lc_coverage = t.picks ? t.lc_costed / t.picks : null;
  // Round A3 (risk C): nothing priced with a loom cost, but looms ran: profit stays a gap, the loom cost not recovered is shown
  // with it (unrec_only), and anything that adds days up (a week, the month) counts it, as fcSum over those days does
  t.unrec_only = !t.lc_ld && t.unrec > 0;
  return t;
}
// One analysis row re-worked at f times its picks (the Benchmark / Best / Target views): metres, sale value, realisation
// and B grade scale with the picks; on the loom cost basis the loom-day's loom cost stays
// as it was (Round Y, decision 4: a loom costs the same for the day however fast it runs) and only B grade scales.
function fcScaleRow(r, f) {
  const sc = (v) => typeof v === 'number' && isFinite(v) ? v * f : v;
  // Round A7: A-grade folded picks scale with the picks (its B grade and cut piece picks scale too, as Folded cost by quality's reference)
  const o = Object.assign({}, r, {picks: sc(r.picks), metres: sc(r.metres), sale: sc(r.sale), real: sc(r.real), sale0: sc(r.sale0), real0: sc(r.real0), fmetres: sc(r.fmetres), bcharge: sc(r.bcharge),
    afold: sc(r.afold), afB: sc(r.afB), afC: sc(r.afC)});
  if (r.profit_lc != null) o.profit_lc = o.real - r.lcost - o.bcharge;
  return o;
}
function fcGroup(rows, key, withU = false) {
  const g = new Map();
  for (const r of rows) { const k = key(r); if (k == null) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return [...g.entries()].map(([k, rs]) => Object.assign({key: k, rows: rs}, fcSum(rs, withU)));
}

// ---- R1 (11 Nov 2026): coverage, the per-pick waterfall, product ranking, lost realisation, approval markers.
// Coverage of a set of rows as one bar: costed (priced with profit), priced only (no costing day yet) and gap picks, with
// every gap reason, its picks and where it is put right ('links' = Head-group links, 'approvals' = Approvals, 'masters' = Fabric
// masters, 'costing' = the Costing tab). Never zero and never guessed: a reason is listed with its picks, not valued.
const FC_GAP_GO = (reason) => /^(unlinked style|no (greige|RFD) record linked|not valued|styles linked to different)/.test(reason) ? 'links'
  : /^no folding shortage/.test(reason) ? 'costing' : /^(no sale rate|no yarn cost)/.test(reason) ? 'approvals' : /^(fabric not in the masters|retired fabric|linked .* record is now|no PPI)/.test(reason) ? 'masters' : null;
function fcCoverage(rows) {
  const t = fcSum(rows);
  const reasons = Object.entries(t.gaps).filter(([, picks]) => picks > 0).map(([reason, picks]) => ({reason, picks, share: t.picks ? picks / t.picks : 0, go: FC_GAP_GO(reason)})).sort((a, b) => b.picks - a.picks);
  const uncosted = t.priced - t.costed;
  if (uncosted > 1e-9) reasons.push({reason: 'no costing day yet (priced, no profit)', picks: uncosted, share: t.picks ? uncosted / t.picks : 0, go: 'costing', soft: true});
  // Round Y: the loom cost of running loom-days that are not priced (U, by reason), and loom-days with picks but no run minutes (D2)
  const ur = new Map(), uld = new Map();
  for (const r of rows) if (r.lcost_gap > 0) { const why = r.gap || 'not priced'; ur.set(why, (ur.get(why) || 0) + r.lcost_gap); if (!uld.has(why)) uld.set(why, new Set()); uld.get(why).add(r.date + '|' + r.loom); }
  const unrec = [...ur.entries()].map(([reason, rs]) => ({reason, rs, ld: uld.get(reason).size, go: reason === 'no fabric record' ? null : FC_GAP_GO(reason)})).sort((a, b) => b.rs - a.rs);
  return {picks: t.picks, priced: t.priced, costed: t.costed, gap: t.picks - t.priced, coverage: t.coverage, cost_coverage: t.cost_coverage, loomdays: t.loomdays, priced_ld: t.priced_ld, reasons,
          unrec, unrec_rs: t.unrec, unrec_ld: t.unrec_ld, norun_ld: t.norun_ld, lc_gaps: t.lc_gaps};
}
// Sale → yarn → conversion → B grade → profit, in paise per pick, over the costed rows only (so the steps add up exactly to
// the profit shown). yarn = sale − realisation (the standard yarn cost), conversion = the folded cost per pick without B
// grade, B grade = the loom's own charge. Rupees are returned too. null when nothing is costed.
// Round Y, basis 'lc' (the loom cost basis, the default on screen): Sale → Yarn → Loom cost → B grade → Unpriced looms (U)
// → Profit, over the rows with a loom cost profit; U = the loom cost of the running loom-days among rows that are not priced,
// so pass the floor's or one width's rows (D3); withU false (one loom or head group) leaves U out.
// Round A7 (design, section 3): on the loom cost basis every step is ÷ the A-grade folded picks of the rows with a loom cost
// profit (picks = those A-grade folded picks; a row without them is left out, nofold_ld), with Realisation as a subtotal and
// the loom cost not recovered (U, on the days that have A-grade folded picks) as its own step: Sale value → Yarn →
// Realisation → Loom cost → B grade → Loom cost not recovered → Profit. null when no row has both.
function fcWaterfall(rows, basis, withU = true) {
  if (basis !== 'lc') return null;   // Round A9 (point 10): the old per pick basis is gone; the loom cost basis is the only one
  const R = rows.filter((r) => r.profit_lc != null && r.picks > 0 && r.afold != null);
  if (!R.length) return null;
  const s = {basis: 'lc', picks: 0, woven: 0, sale: 0, yarn: 0, real: 0, conv: 0, bgrade: 0, unrec: 0, unrec_ld: 0, profit: 0, loomdays: new Set(R.map((r) => r.date + '|' + r.loom)).size,
             nofold_ld: new Set(rows.filter((r) => r.profit_lc != null && r.afold == null).map((r) => r.date + '|' + r.loom)).size};
  for (const r of R) { s.picks += r.afold; s.woven += r.picks; s.sale += r.sale; s.yarn += r.sale - r.real; s.real += r.real; s.conv += r.lcost; s.bgrade += r.bcharge; s.profit += r.profit_lc; }
  // numbers review (Round A7): U on every day with A-grade folded picks, as fcSum takes it
  if (withU) { const days = new Set(rows.filter((r) => r.afold != null).map((r) => r.date)), u = new Set(); for (const r of rows) if (r.lcost_gap > 0 && days.has(r.date)) { s.unrec += r.lcost_gap; u.add(r.date + '|' + r.loom); } s.unrec_ld = u.size; s.profit -= s.unrec; }
  if (!(s.picks > 0)) return null;
  const pp = (v) => v / s.picks * 100;
  s.pp = {sale: pp(s.sale), yarn: pp(s.yarn), real: pp(s.real), conv: pp(s.conv), bgrade: pp(s.bgrade), unrec: pp(s.unrec), profit: pp(s.profit)};
  s.steps = [{label: 'Sale value', v: s.pp.sale, total: true}, {label: 'Yarn', v: -s.pp.yarn}, {label: 'Realisation', v: s.pp.real, total: true}, {label: 'Loom cost', v: -s.pp.conv}, {label: 'B grade', v: -s.pp.bgrade}, {label: 'Loom cost not recovered', v: -s.pp.unrec}, {label: 'Profit', v: s.pp.profit, total: true}];
  return s;
}
// Products (or head groups) ranked by profit a loom a day on the loom cost basis (Round A4, Divyam, 24 Nov 2026; realisation
// a loom a day where nothing has a loom cost profit), with the plant average over the same rows as the reference.
// key: (row) => the group key. Each group is By head group's figure (fcGroup, withU false: priced rows only, never U).
function fcRank(rows, key) {
  const all = fcSum(rows);
  const g = fcGroup(rows.filter((r) => key(r) != null && !r.gap), key).map((x) => Object.assign(x, {widths: [...new Set(x.rows.map((r) => r.width))].sort()}));
  const v = (x) => x.lc_ld ? x.profit_lc_ld : null;
  g.sort((a, b) => (v(b) ?? b.real_ld ?? -1e18) - (v(a) ?? a.real_ld ?? -1e18) || b.priced - a.priced);
  return {groups: g, plant: {real_ld: all.real_ld, profit_lc_ld: all.lc_ld ? all.profit_lc_ld : null, priced: all.priced, lc_costed: all.lc_costed}};
}
// The best product per loom type (Effective RPM): for each width, the product with the highest profit a loom a day on the
// loom cost basis (Round A4; realisation a loom a day where no product on that width has a loom cost profit), with its
// figure (₹ a loom a day) and how many loom-days it rests on.
function fcBestByWidth(rows, key) {
  const out = {};
  for (const w of [...new Set(rows.map((r) => r.width))].sort()) {
    const R = fcRank(rows.filter((r) => r.width === w), key).groups.filter((g) => g.priced > 0);
    if (!R.length) continue;
    const costed = R.some((g) => g.lc_ld > 0);
    const best = R.filter((g) => !costed || g.lc_ld > 0)[0];
    out[w] = {key: best.key, by: costed ? 'profit' : 'realisation', value: costed ? best.profit_lc_ld : best.real_ld, loomdays: costed ? best.lc_ld : best.priced_ld, of: R.length};
  }
  return out;
}
// Lost picks of one loom-day, the Actions tab's way (10 Nov 2026): below the efficiency line, the minutes short of it at
// the loom's own RPM; below the RPM reference by more than its tolerance, the RPM short × run minutes. x: {run, stop, rpm,
// eff} (minutes, RPM, %); refs: {effLine, rpmBm, rpmTg, tolPct}. Machine picks; the caller applies the panna factor and
// ÷ 39.37 for the costing basis.
function fcLostPicks(x, refs) {
  const run = x.run || 0, stop = x.stop || 0, rpm = x.rpm || 0;
  const eff = x.eff != null ? x.eff : (run + stop ? 100 * run / (run + stop) : null);
  let effMin = 0, effPicks = 0, rpmRef = null, rpmPicks = 0;
  if (eff != null && refs.effLine != null && eff < refs.effLine) { effMin = Math.max(0, refs.effLine / 100 * (run + stop) - run); effPicks = effMin * rpm; }
  const tol = (v) => v * (refs.tolPct == null ? 3 : refs.tolPct) / 100;
  const offB = refs.rpmBm != null && rpm < refs.rpmBm - tol(refs.rpmBm), offT = refs.rpmTg != null && rpm < refs.rpmTg - tol(refs.rpmTg);
  if (offB || offT) { rpmRef = Math.max(offB ? refs.rpmBm : 0, offT ? refs.rpmTg : 0); rpmPicks = (rpmRef - rpm) * run; }
  return {effMin, effPicks, rpmRef, rpmPicks, picks: effPicks + rpmPicks};
}
// Lost realisation: every loom-day's lost picks (costing basis) × that loom-day's realisation paise per pick, from the
// analysis rows of the same day, loom and head group. lost: [{date, loom, hg, width, picks, effPicks, rpmPicks}] with picks on
// the costing basis. A loom-day the analysis could not price keeps its lost picks but no rupees (a gap, never zero).
function fcLostRealisation(rows, lost) {
  const pp = new Map();
  for (const r of rows) {
    if (r.gap || !r.picks) continue;
    const k = r.date + '|' + r.loom + '|' + r.hg, o = pp.get(k) || {real: 0, picks: 0};
    o.real += r.real; o.picks += r.picks; pp.set(k, o);
  }
  const out = (lost || []).map((l) => {
    const o = pp.get(l.date + '|' + l.loom + '|' + l.hg), rate = o && o.picks ? o.real / o.picks * 100 : null;
    return Object.assign({}, l, {real_pp: rate, rs: rate == null ? null : l.picks * rate / 100, rs_eff: rate == null ? null : (l.effPicks || 0) * rate / 100, rs_rpm: rate == null ? null : (l.rpmPicks || 0) * rate / 100});
  });
  const sum = (L) => {
    const t = {picks: 0, valued: 0, rs: 0, rs_eff: 0, rs_rpm: 0, loomdays: new Set(L.map((l) => l.date + '|' + l.loom)).size, n: L.length};
    for (const l of L) { t.picks += l.picks; if (l.rs != null) { t.valued += l.picks; t.rs += l.rs; t.rs_eff += l.rs_eff; t.rs_rpm += l.rs_rpm; } }
    t.coverage = t.picks ? t.valued / t.picks : null;
    return t;
  };
  const by = (key) => { const g = new Map(); for (const l of out) { const k = key(l); if (!g.has(k)) g.set(k, []); g.get(k).push(l); } return [...g.entries()].map(([k, L]) => Object.assign({key: k}, sum(L))).sort((a, b) => b.rs - a.rs || b.picks - a.picks); };
  return {rows: out, total: sum(out), byLoom: by((l) => l.loom), byHg: by((l) => l.hg + '|' + l.width), daily: by((l) => l.date).sort((a, b) => a.key.localeCompare(b.key))};
}
// Days a money approval took effect, from fm_history rows (for the dashed markers on the trend): an approval of a money
// field, a rate removal, a retirement or an undo of one of those, on its effective-from date.
const FC_MONEY_FIELDS = new Set(FC_SALE.concat(['ppi', 'reed', 'reed_space_in', 'greige_width_in', 'warp_shortage_pct', 'weft_shortage_pct', 'lines', 'finish', 'rate', 'kind', 'base_yarn_id', 'count', 'count_unit', 'tpm_delta', 'status', '_src']));
function fcApprovalDays(hist) {
  const out = new Map();
  for (const h of hist || []) {
    if (!h.eff_from) continue;
    const money = h.action === 'approved' ? FC_MONEY_FIELDS.has(h.field) : /^(rate removed|retired|undone|added as a new fabric|linked to existing fabric)$/.test(h.action || '');
    if (!money) continue;
    const d = String(h.eff_from).slice(0, 10), title = (h.detail && h.detail.title) || [h.action, h.field].filter(Boolean).join(' ');
    if (!out.has(d)) out.set(d, []); out.get(d).push(title);
  }
  return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, items]) => ({date, n: items.length, text: items.length === 1 ? items[0] : `${items.length} approvals`}));
}

// ---- 12 Nov 2026: realisation against production, break-even per loom, priority valuation, the quality mix.
// Realisation at an effective RPM (Divyam, 12 Nov 2026: there is no typed realisation target; the target is the production
// at the target effective RPM × the per-pick realisation, and benchmark and best are worked the same way): erpm × the same
// run + stop minutes × the panna factor = fabric picks, ÷ 39.37 = the costing basis, × realisation paise per pick ÷ 100.
// null when any input is missing.
function fcRealAtErpm(erpm, minutes, pf, realPp) {
  const n = (v) => typeof v === 'number' && isFinite(v);
  if (!n(erpm) || !n(minutes) || !n(realPp) || !(minutes > 0)) return null;
  return erpm * minutes * (n(pf) ? pf : 1) / FC_PICKS_PER_INCH * realPp / 100;
}
// Round W (Divyam, 17 Nov 2026): a beam is priced on its warp-stop minutes, not every stop (the Toyota report's "Warp (min)").
// Each of the beam's loom-days: warp minutes × the loom-day's RPM × its panna factor = fabric picks lost to warp stops,
// ÷ 39.37 = the costing basis, × that loom-day's realisation paise per pick ÷ 100. A loom-day with no warp minutes (a file
// read before 17 Nov and not yet read back, or one without the column) is a gap: out of the minutes, picks and rupees and
// counted, never 0. A loom-day with minutes the analysis cannot price is in the minutes and picks, not the rupees.
// days: [{warp_min, rpm, pf, realPp}] → {min, picks, rs, timed, priced, days}; min/picks null when no day has minutes,
// rs null when no day is priced.
function fcBeamWarpLoss(days) {
  const n = (v) => typeof v === 'number' && isFinite(v);
  let min = 0, picks = 0, rs = 0, timed = 0, priced = 0;
  for (const d of days || []) {
    if (!n(d.warp_min) || d.warp_min < 0) continue;
    timed++; min += d.warp_min;
    const p = d.warp_min * (n(d.rpm) ? d.rpm : 0) * (n(d.pf) ? d.pf : 1) / FC_PICKS_PER_INCH;
    picks += p;
    if (n(d.realPp)) { rs += p * d.realPp / 100; priced++; }
  }
  return {min: timed ? min : null, picks: timed ? picks : null, rs: priced ? rs : null, timed, priced, days: (days || []).length};
}
// Round C (Divyam, 17 Nov 2026): the 7-day realisation lines (sidebar, loom panel). For each date, the realisation per pick
// of the rows kept (As sold rows from fcAnalyse; `keep` picks a loom or both widths): the day's realisation ÷ its priced
// picks × 100, with the share of picks priced. A day with nothing priced is null (a gap in the line, never 0).
// → [{date, real_pp, real, coverage}]
// Round A4: with the day's profit per pick on the loom cost basis too (profit_pp; null when no loom-day has one). withU false
// for one loom or head group (its own loom-days not priced stay a gap, never taken off), true for the floor.
function fcRealSeries(rows, dates, keep, withU = true) {
  return (dates || []).map((date) => {
    const t = fcSum((rows || []).filter((r) => r.date === date && (!keep || keep(r))), withU);
    // Round A7: real_fp and profit_pp per A-grade folded pick (a day with no costing has none: a gap in the line)
    return {date, real_pp: t.priced ? t.real_pp : null, real_fp: t.priced ? t.real_fp : null, real: t.priced ? t.real : null, coverage: t.picks ? t.coverage : null, profit_pp: t.lc_ld ? t.profit_lc_pp : null, profit: t.lc_ld ? t.profit_lc : null,
            nofold: !!t.priced && t.real_fp == null};
  });
}
// Break-even realisation per loom per day (Divyam, 12 Nov 2026): the day's cost ÷ the looms running; the cost is fcBeCost's
// (OPEX + cut piece loss + net B grade on the chosen basis, Round Y D1 a; Round B2), the looms those with any run time.
function fcBreakEven(cost, looms) { return typeof cost === 'number' && isFinite(cost) && looms > 0 ? cost / looms : null; }
// Round Y, D1 a (Divyam, 23 Nov 2026): the break-even's cost is the loom cost basis's own: (OPEX + cut piece loss + net B
// grade), on the day passed (Round B2: the chosen basis) = the folded cost per pick × A-grade folded picks. null when the day has no such costing.
function fcBeCost(day) {
  const k = fcCostDay(day); if (!k) return null;
  const total = k.fold * day.afold * 1e5;   // Round A3 (Divyam, 24 Nov 2026; Q3): the loom cost method's own total, on the day's basis
  return {total, pool: total - k.bnet, bnet: k.bnet};
}
// What fixing a loom is worth a day (Actions, "Work on these first"), with the quality's realisation factored in: lost picks
// (costing basis) at that loom-day's realisation per pick where it is priced, else at the cost per pick that runs whether
// or not the loom weaves (the fixed + attendance-following paise per pick), plus the air and pressure rupees.
// o: {picks, realPp, costPp, rsAir, rsPress}. by: 'realisation' | 'cost' | null (nothing to value the picks at).
function fcPrioValue(o) {
  const picks = o.picks || 0, n = (v) => typeof v === 'number' && isFinite(v);
  const by = !(picks > 0) ? null : n(o.realPp) ? 'realisation' : n(o.costPp) ? 'cost' : null;
  const rsPicks = by === 'realisation' ? picks * o.realPp / 100 : by === 'cost' ? picks * o.costPp / 100 : 0;
  return {by, rsPicks, rs: rsPicks + (o.rsAir || 0) + (o.rsPress || 0)};
}
// The quality mix behind a weighted realisation per pick: each head group's priced picks, its own realisation per pick and
// its share of the priced picks; pp = Σ (share × its paise per pick) = Σ realisation ÷ Σ priced picks. Gap rows are left out.
function fcQualityMix(rows, key) {
  const k = key || ((r) => r.hg + '|' + r.width);
  const g = fcGroup(rows.filter((r) => !r.gap), k), tot = g.reduce((a, x) => a + x.priced, 0);
  const mix = g.map((x) => ({key: x.key, picks: x.priced, real_pp: x.real_pp, real_fp: x.real_fp, share: tot ? x.priced / tot : null})).sort((a, b) => b.picks - a.picks);   // Round A7: real_fp per A-grade folded pick, for showing
  return {mix, picks: tot, pp: tot ? mix.reduce((a, x) => a + x.share * x.real_pp, 0) : null};
}

// ---- the impact preview of one change: the analysis over the change's window, with and without it, both bases.
// Returns {from, to, fabrics: [{uid, loomdays, d_real_greige, d_real_rfd, d_sale_...}], loomdays, before/after totals}.
function fcImpact(inp, edit) {
  const {M: M2, eff_from} = fcWith(inp.M, edit);
  const one = Array.isArray(edit) ? null : edit;
  const ent = !one ? null : one.table === 'rate' ? M2.rate[one.uid] : one.table === 'links' ? M2.links[one.uid] : M2[one.table][one.uid][one.field];
  const w = one ? fcWindow(ent, ent[ent.length - 1]) : {from: eff_from, to: null};
  const to = w.to && inp.to ? (w.to < inp.to ? w.to : inp.to) : (w.to || inp.to || null);
  const out = {from: w.from, to, open: !w.to, eff_from, bases: {}};
  for (const basis of ['Greige', 'RFD']) {
    // Round A7 (Divyam, answer 4): the approvals impact preview stays without shrinkage (per metre what-ifs), so no s
    const a = fcAnalyse(Object.assign({}, inp, {basis, from: w.from, to, s: undefined}));
    const b = fcAnalyse(Object.assign({}, inp, {M: M2, basis, from: w.from, to, s: undefined}));
    const per = new Map();
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      const dr = (y.real ?? 0) - (x.real ?? 0), ds = (y.sale ?? 0) - (x.sale ?? 0);   // Round A9 (point 10): no profit change (d_profit): the preview shows realisation
      const moved = Math.abs(dr) > 1e-9 || Math.abs(ds) > 1e-9 || (x.gap || '') !== (y.gap || '');
      if (!moved) continue;
      const u = y.fabric ?? x.fabric;
      const o = per.get(u) || {uid: u, loomdays: 0, d_sale: 0, d_real: 0, newly_priced: 0, newly_gap: 0};
      o.loomdays++; o.d_sale += ds; o.d_real += dr;
      if (x.gap && !y.gap) o.newly_priced++;
      if (!x.gap && y.gap) o.newly_gap++;
      per.set(u, o);
    }
    const sa = fcSum(a), sb = fcSum(b);
    out.bases[basis] = {fabrics: [...per.values()].sort((p, q) => Math.abs(q.d_real) - Math.abs(p.d_real)), before: sa, after: sb,
                        loomdays: [...per.values()].reduce((s, o) => s + o.loomdays, 0)};
  }
  return out;
}
// Case 35: a style's greige record priced above its RFD twin on day d is most likely a price on the wrong basis.
function fcTwinCheck(M, link, d) {
  if (!link || link.greige == null || link.rfd == null) return null;
  const g = fcNum(fcVal(M.sale[link.greige], 'price', d)), r = fcNum(fcVal(M.sale[link.rfd], 'price', d));
  return g != null && r != null && g > r ? {greige: g, rfd: r} : null;
}
// Fabrics that use a yarn (directly or as a TPM yarn's base) on day d, for the "which fabrics move" list of a rate request.
function fcFabricsUsing(M, yuid, d) {
  const out = [];
  for (const uid of Object.keys(M.fab)) {
    const f = fcFabricAt(M, +uid, d);
    if (!f || !Array.isArray(f.lines)) continue;
    if (f.lines.some((l) => +l.yarn === +yuid || (fcYarnRate(M, +l.yarn, d) || {}).base_uid === +yuid)) out.push(+uid);
  }
  return out;
}
// Quality tab (13 Nov 2026, Divyam). The gap of a head group's loom realisation to the same loom-days re-worked at the
// reference effective RPM: per loom-day (now − reference) and for the day (that × priced loom-days). − is a deficit, + a
// surplus. null when either side is missing: a gap is never shown as ₹0.
function fcRealGap(nowLd, refLd, pricedLd) {
  if (nowLd == null || refLd == null || !isFinite(nowLd) || !isFinite(refLd)) return null;
  const ld = nowLd - refLd;
  return {ld, tot: pricedLd > 0 ? ld * pricedLd : null};
}
// Total loom realisation for "Current vs reference" = looms ran × average realisation per loom. When fewer loom-days are
// priced than looms ran, the looms not priced are not guessed: the total is the priced looms' only (full false, says so).
function fcLoomTotal(looms, perLoom, pricedLd) {
  if (perLoom == null || !isFinite(perLoom) || !(looms > 0) || !(pricedLd > 0)) return null;
  const full = pricedLd >= looms;
  return {rs: (full ? looms : pricedLd) * perLoom, full, looms, priced: Math.min(pricedLd, looms)};
}

// ---- Round F (Divyam, 18 Nov 2026): target realisation per pick = Σ (each loom-day's target picks × its realisation per
// pick, As sold) ÷ Σ target picks. Target picks = its picks + the extra picks at target effective RPM (extra(r): costing
// picks, 0 for a loom already above target, null for a loom with no target). It is a mix effect only: each loom keeps its
// own quality's rate. A loom-day not priced, or with no target, is left out and counted in the coverage (share of the
// day's picks), never 0. rows: fcAnalyse rows of one day. → {pp (paise), tp, priced, all, coverage, n, gaps} or pp null.
function fcTargetReal(rows, extra) {
  let num = 0, tp = 0, priced = 0, all = 0, n = 0, gaps = 0, s = 0, af = 0;
  for (const r of rows || []) {
    if (!(r.picks > 0)) continue;
    all += r.picks;
    const e = extra(r);
    if (r.gap || r.real == null || e == null || !isFinite(e)) { gaps += 1; continue; }
    const t = r.picks + Math.max(0, e);
    num += r.real / r.picks * t; tp += t; priced += r.picks; n += 1; af += t * (1 - (typeof r.s === 'number' ? r.s : 0));
  }
  // Round A7: per target A-grade folded pick = num ÷ Σ (target picks × (1 − s)); realisation per woven pick carries (1 − s).
  // Round A10: each loom keeps its own quality's folding % (r.s), so shrinkage is still counted once; s = the priced target
  // picks' own figure (1 − af ÷ tp). af = the target A-grade folded picks.
  s = tp > 0 ? 1 - af / tp : 0;
  return {pp: af > 0 ? 100 * num / af : null, num, tp, af, s, priced, all, coverage: all > 0 ? priced / all : null, n, gaps};
}
// Target profit per pick = target realisation per pick − target folded cost per pick (no B grade, so no loom B grade
// charge). Paise; null when either is missing.
function fcTargetProfit(realPp, foldPp) {
  const n = (v) => typeof v === 'number' && isFinite(v);
  return n(realPp) && n(foldPp) ? realPp - foldPp : null;
}
// Round A4 (Divyam, 24 Nov 2026): the target folded cost per pick on the loom cost basis. The day's loom cost total on the
// Round A3 method (L.total: OPEX + cut piece loss on the chosen basis; no B grade) less its cut piece loss, less the
// CFM saving (Target cost per pick step 1) and the pressure saving (step 2), plus the costs that grow with the extra metres
// (step 4); no B grade and no cut pieces (step 5); the loom cost otherwise stays (Round Y decision 4). Shared over the target
// A-grade folded picks = (P + E) × (1 − s), the target picks' own folding % (s_T, Round A10). Paise, or null.
// L: rows.lday[date]; t: {Sc, Sp, Add} (tcRun); P: the costing's production picks; E: the extra picks at target effective RPM.
function fcTargetFoldLc(L, t, P, E, s) {
  const n = (v) => typeof v === 'number' && isFinite(v);
  if (!L || !n(L.total) || !t || !n(P) || !n(s)) return null;
  const cost = L.total - (n(L.cut) ? L.cut : 0) - (n(t.Sc) ? t.Sc : 0) - (n(t.Sp) ? t.Sp : 0) + (n(t.Add) ? t.Add : 0), den = (P + (n(E) ? E : 0)) * (1 - s);
  return den > 0 ? {pp: 100 * cost / den, cost, afold: den} : null;
}
// Round A1 (Divyam, 24 Nov 2026): the Target profit per pick in rupees for the day, on the target A-grade folded picks: every
// target pick taken as A grade, less the folding shortage (month to date) = (P + E) × (1 − s), the same picks the target
// folded cost is shared over. pp in paise; P = the costing's production picks, E = the extra picks at target effective RPM.
function fcTargetProfitRs(pp, P, E, s) {
  const n = (v) => typeof v === 'number' && isFinite(v);
  if (!n(pp) || !n(P) || !n(s)) return null;
  const a = (P + (n(E) ? E : 0)) * (1 - s);
  return a > 0 ? {rs: pp / 100 * a, afold: a} : null;
}

// ================================================================ Round J (18 Nov 2026): the Working, owner-only money lines
// Same shape as WKL in calc.js ({line, res, unit} from the figures a screen drew with, the line ending on its result and
// unit by construction: fwOut); kept here, standalone, because the realisation notice loads this file without calc.js.
// working.js merges the two. Money, so owner only (fxOn).
const fwN = (x, d = 0) => { if (!(typeof x === 'number' && isFinite(x))) return '—'; const s = Math.abs(x).toLocaleString('en-IN', {minimumFractionDigits: d, maximumFractionDigits: d}); return (x < 0 && /[1-9]/.test(s) ? '−' : '') + s; };
const fwR = (x) => !(typeof x === 'number' && isFinite(x)) ? '—' : (x < 0 && Math.round(Math.abs(x)) > 0 ? '−₹' : '₹') + Math.round(Math.abs(x)).toLocaleString('en-IN');
const fwP = (x) => !(typeof x === 'number' && isFinite(x)) ? '—' : x.toFixed(2);
const fwL = (x) => !(typeof x === 'number' && isFinite(x)) ? '—' : (x < 0 ? '−₹' : '₹') + (Math.abs(x) / 1e5).toFixed(2);   // ₹ lakh, as the Realisation tiles
const fwOk = (x) => typeof x === 'number' && isFinite(x);
const fwOut = (pre, res, unit, v, sep = ' = ') => ({line: pre + sep + (unit ? `${res} ${unit}` : res), res, unit: unit || '', v});
const WKLF = {
  B2r: (d) => { if (!d || !(d.picks > 0) || !fwOk(d.real)) return null; const v = 100 * d.real / d.picks;
    return fwOut(`${fwR(d.real)} realisation ÷ ${fwN(d.picks)} A-grade folded picks × 100`, fwP(v), 'paise per folded pick', v); },
  B5r: (d) => { if (!d || !(d.tp > 0)) return null; const k = 1 - (fwOk(d.s) ? d.s : 0), v = 100 * d.num / (d.tp * k);   // Round A7: ÷ target A-grade folded picks
    return fwOut(`now ${fwP(d.now)} paise per folded pick. Each loom-day's target picks × its own realisation per woven pick (after the folding shortage), added up = ${fwR(d.num)}; ÷ (${fwN(d.tp)} target picks × (1 − ${(100 * (1 - k)).toFixed(1)}% folding shortage) = ${fwN(d.tp * k)} target A-grade folded picks) × 100`, fwP(v), 'paise', v); },
  B5p: (d) => { if (!d || !fwOk(d.tr) || !fwOk(d.s) || !fwOk(d.total)) return null; const num = d.total - d.cut - d.Sc - d.Sp + d.Add, den = (d.P + d.E) * (1 - d.s); if (!(den > 0)) return null; const tf = 100 * num / den, v = d.tr - tf;
    return fwOut(`target folded cost = (the day's loom cost ${fwR(d.total)} − cut piece loss ${fwR(d.cut)} − CFM saving ${fwR(d.Sc)} − pressure saving ${fwR(d.Sp)} + added costs ${fwR(d.Add)}) ÷ (${fwN(d.P + d.E)} target picks × (1 − ${(d.s * 100).toFixed(1)}% folding shortage)) × 100 = ${fwP(tf)} paise; target realisation ${fwP(d.tr)} − ${fwP(tf)}`, fwP(v), 'paise', v); },
  B5s: (d) => { if (!d || !fwOk(d.pp) || !fwOk(d.s)) return null; const T = fcTargetProfitRs(d.pp, d.P, d.E, d.s); if (!T) return null;
    return fwOut(`${fwP(d.pp)} paise × (${fwN(d.P + (d.E || 0))} target picks × (1 − ${(d.s * 100).toFixed(1)}% folding shortage) = ${fwN(T.afold)} A-grade folded picks) ÷ 100`, fwR(T.rs), 'in the day', T.rs); },
  B7: (d) => { if (!d || !fwOk(d.cost) || !(d.looms > 0)) return null; const v = d.cost / d.looms;
    return fwOut(`(operating expenses and cut piece loss ${fwR(d.pool)} + net B grade ${fwR(d.bnet)} = ${fwR(d.cost)}) ÷ ${d.looms} loom${d.looms === 1 ? '' : 's'} running`, fwR(v), 'a loom', v); },
  RLF: (d) => { if (!d) return null; const r = fcRealLessFold(d.real, d.fold); if (!r) return null;
    const sg = (x) => (x < 0 && /[1-9]/.test(Math.abs(x).toFixed(2)) ? '−' : '') + Math.abs(x).toFixed(2);   // Round A7: the folded basis, and the target diamond
    const tg = fwOk(d.tgt) ? `; target folded cost ${fwP(d.tgt)} paise (the diamond)${fwOk(d.treal) ? `, so at target ${fwP(d.treal)} realisation per target A-grade folded pick − ${fwP(d.tgt)} = ${sg(d.treal - d.tgt)} paise` : ''}` : '';
    return fwOut(`${d.hg}: realisation ${fwP(d.real)} paise per folded pick − folded cost ${fwP(d.fold)} paise per pick, both ÷ the same ${d.A > 0 ? fwN(d.A) + ' ' : ''}A-grade folded picks${tg}; profit per folded pick`, sg(r.diff), 'paise', r.diff); },
  FQ: (d) => { if (!d || !fwOk(d.cost) || !fwOk(d.s)) return null; const A = d.picks * (1 - d.s) - d.B - d.C; if (!(A > 0)) return null; const v = 100 * d.cost / A;
    return fwOut(`${d.hg}: loom cost and own B grade ${fwR(d.cost)} ÷ (${fwN(d.picks)} picks × (1 − ${(d.s * 100).toFixed(1)}% folding shortage) − ${fwN(d.B)} B grade picks − ${fwN(d.C)} cut piece picks = ${fwN(A)} A-grade folded picks) × 100`, fwP(v), 'paise', v); },
  FQT: (d) => { if (!d || !fwOk(d.lc) || !fwOk(d.s)) return null; const c = d.lc - d.cut - d.cfm - d.press + d.add, A = (d.picks + d.E) * (1 - d.s); if (!(A > 0)) return null; const v = 100 * c / A;
    return fwOut(`${d.hg}: (loom cost ${fwR(d.lc)} − its cut piece share ${fwR(d.cut)} − CFM saving ${fwR(d.cfm)} − its share of the pressure saving ${fwR(d.press)} + added costs ${fwR(d.add)} = ${fwR(c)}) ÷ ((${fwN(d.picks)} picks + ${fwN(d.E)} extra picks) × (1 − ${(d.s * 100).toFixed(1)}% folding shortage) = ${fwN(A)} target A-grade folded picks) × 100`, fwP(v), 'paise', v); },
  C2: (d) => { if (!d || !fwOk(d.ld)) return null; const n = d.full ? d.looms : d.priced, v = n * d.ld;
    return fwOut(`${d.hg}: ${n} loom${n === 1 ? '' : 's'}${d.full ? ' that ran' : ' priced (of ' + d.looms + ' that ran)'} × ${fwR(d.ld)} realisation per loom-day`, fwR(v), 'in the day', v); },
  C3: (d) => { if (!d || !(d.conv > 0) || !fwOk(d.real)) return null; const v = (d.real - d.conv) / d.conv;
    return fwOut(`${d.hg}: (realisation ${fwR(d.real)} − loom cost ${fwR(d.conv)}) ÷ ${fwR(d.conv)} × 100`, `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`, '', v); },
  C5: (d) => { if (!d || !fwOk(d.now) || !fwOk(d.ref) || !(d.A > 0) || !(d.rA > 0)) return null; const now = 100 * d.cost / d.A, ref = 100 * d.rcost / d.rA, v = (now - ref) / Math.abs(ref) * 100;
    return fwOut(`${d.hg}: now ${fwR(d.cost)} ÷ ${fwN(d.A)} A-grade folded picks × 100 = ${fwP(now)} paise; at the ${d.name} effective RPM ${fwR(d.rcost)} ÷ ${fwN(d.rA)} × 100 = ${fwP(ref)} paise; (${fwP(now)} − ${fwP(ref)}) ÷ ${fwP(ref)} × 100`, `${Math.abs(v) < 0.05 ? '±' : v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`, '', v); },
  C4: (d) => { if (!d || !fwOk(d.now) || !fwOk(d.at)) return null; const v = d.now - d.at;
    return fwOut(`${d.hg}: realisation now ${fwR(d.now)} − the same loom-days at the ${d.ref} effective RPM ${fwR(d.at)}`, Math.abs(v) < 0.5 ? '±₹0' : (v > 0 ? '+' : '') + fwR(v), 'in the day', v); },
  F2m: (d) => { if (!d || !fwOk(d.pp) || !fwOk(d.picks)) return null; const v = d.picks * d.pp / 100;
    return fwOut(`Loom ${d.loom}, realisation lost: ${fwN(d.picks)} picks short × ${fwP(d.pp)} paise of realisation per pick`, fwR(v), 'in the day', v); },
  F3r: (d) => { if (!d || !d.rows.length) return null; const v = d.rows.reduce((a, r) => a + r.after, 0);
    return fwOut(`now ${fwR(d.now)}. Each priced loom at its reference effective RPM: reference × (run + stopped) minutes × panels ÷ 39.37 × its own realisation per pick, added up over ${d.rows.length} loom${d.rows.length === 1 ? '' : 's'}`, fwR(v), 'in the day', v); },
  F3p: (d) => { if (!d || !(d.picks > 0)) return null; const v = 100 * d.after / d.picks;   // Round A7: picks = the picks after the work × (1 − s), every pick A grade
    return fwOut(`${fwR(d.after)} ÷ ${fwN(d.picks)} A-grade folded picks after the work (every pick A grade, after the folding shortage) × 100`, fwP(v), 'paise per folded pick', v); },
  H2: (d) => { if (!d || !fwOk(d.pp)) return null; const p = d.off * d.rpm * d.pf / 39.37, v = p * d.pp / 100;
    return fwOut(`Loom ${d.loom}: ${fwN(d.off)} minutes powered down × ${fwN(d.rpm)} RPM${d.pf === 2 ? ' × 2 panels' : ''} ÷ 39.37 = ${fwN(p)} picks; × ${fwP(d.pp)} paise of realisation per pick`, fwR(v), 'in the day', v); },
  I3: (d) => { if (!d || !d.days.length) return null; const T = d.days.filter((x) => fwOk(x.warp_min) && x.warp_min >= 0 && fwOk(x.realPp));
    if (!T.length) return null; const terms = T.map((x) => ({p: x.warp_min * x.rpm * (x.pf || 1) / 39.37, pp: x.realPp, m: x.warp_min, rpm: x.rpm})), v = terms.reduce((a, t) => a + t.p * t.pp / 100, 0);
    return fwOut(`Beam ${d.beam}, day by day: minutes stopped for warp breaks × RPM ÷ 39.37 × that day's realisation per pick: ${terms.slice(0, 3).map((t) => `${fwN(t.m, 1)} × ${fwN(t.rpm)} ÷ 39.37 × ${fwP(t.pp)} paise`).join(' + ')}${terms.length > 3 ? ` + ${terms.length - 3} more` : ''}`, fwR(v), 'over the beam', v); },
  J16: (d) => { if (!d || !(d.metres > 0) || !fwOk(d.closing)) return null; const r = d.sale / d.metres, v = d.closing * r;
    return fwOut(`the month's sale value ${fwR(d.sale)} ÷ ${fwN(d.metres)} m woven = ₹${r.toFixed(2)} a metre; × ${fwN(d.closing)} m closing stock`, fwR(v), '', v); },
  J22: (d) => { if (!d || !fwOk(d.real) || !fwOk(d.cost) || !(d.picks > 0)) return null; const a = 100 * d.real / d.picks, b = 100 * d.cost / d.picks, v = a - b;   // Round A7: the three folded lines
    return fwOut(`${d.date}, each ÷ ${fwN(d.picks)} A-grade folded picks × 100: realisation ${fwR(d.real)} = ${fwP(a)} paise; cost (loom cost, own B grade and the loom cost not recovered) ${fwR(d.cost)} = ${fwP(b)} paise; profit = ${fwP(a)} − ${fwP(b)}`,
      (v < 0 && /[1-9]/.test(Math.abs(v).toFixed(2)) ? '−' : '') + Math.abs(v).toFixed(2), 'paise per folded pick', v); },
  K1: (d) => { if (!d || !(d.ppi > 0)) return null; const v = d.picks / d.ppi; return fwOut(`Loom ${d.loom} on ${d.date}: ${fwN(d.picks)} picks ÷ ${fwN(d.ppi, 1)} picks per inch (PPI)`, fwN(v, 1), 'm', v); },
  // Round A7: sale value and realisation are on folded metres (woven × (1 − s))
  K2: (d) => { if (!d || d.rfd || !fwOk(d.price)) return null; const pm = d.price * (1 - d.vat), v = d.metres * (1 - (d.s || 0)) * pm;
    return fwOut(`Loom ${d.loom} (greige): ₹${d.price.toFixed(2)} × (1 − ${(d.vat * 100).toFixed(1)}% VATAV) = ₹${pm.toFixed(2)} a metre; × ${fwN(d.metres, 1)} m woven × (1 − ${(100 * (d.s || 0)).toFixed(1)}% folding shortage) = ${fwN(d.metres * (1 - (d.s || 0)), 1)} folded m`, fwR(v), '', v); },
  K3: (d) => { if (!d || !d.rfd || !fwOk(d.price) || !fwOk(d.g)) return null; const rm = d.price * (1 - d.vat - d.brok) - d.proc * d.g - d.trans, pm = rm / d.g, v = d.metres * (1 - (d.s || 0)) * pm;
    return fwOut(`Loom ${d.loom} (RFD): g = ${d.g.toFixed(4)}; ₹${d.price.toFixed(2)} × (1 − ${(d.vat * 100).toFixed(1)}% − ${(d.brok * 100).toFixed(1)}%) − ₹${d.proc.toFixed(2)} × ${d.g.toFixed(4)} − ₹${d.trans.toFixed(2)} = ₹${rm.toFixed(2)} an RFD metre; ÷ ${d.g.toFixed(4)} = ₹${pm.toFixed(2)} a greige metre; × ${fwN(d.metres, 1)} m woven × (1 − ${(100 * (d.s || 0)).toFixed(1)}% folding shortage) = ${fwN(d.metres * (1 - (d.s || 0)), 1)} folded m`, fwR(v), '', v); },
  K4: (d) => { if (!d || !d.yarns.length) return null; const v = d.yarns.reduce((a, y) => a + y.gpm / 1000 * y.rate, 0);
    return fwOut(`${d.hg}: ${d.yarns.map((y) => `${y.side} ${fwN(y.gpm, 2)} g ÷ 1,000 × ₹${fwN(y.rate)} a kg`).join(' + ')}`, '₹' + v.toFixed(2), 'a metre', v); },
  K5: (d) => { if (!d || !fwOk(d.sale) || !fwOk(d.yarn)) return null; const fm = d.metres * (1 - (d.s || 0)), v = d.sale - d.yarn * fm;
    return fwOut(`Loom ${d.loom}: ${d.afold > 0 ? `${fwP(100 * v / d.afold)} paise per folded pick (the rupees below ÷ ${fwN(d.afold)} A-grade folded picks × 100)` : 'per folded pick: its day has no costing yet'}. Sale value ${fwR(d.sale)} − standard yarn ₹${d.yarn.toFixed(2)} a metre × ${fwN(fm, 1)} folded m`, fwR(v), '', v); },
  K6L: (d) => { if (!d || !fwOk(d.real) || !fwOk(d.lcost)) return null; const v = d.real - d.lcost - (d.bcharge || 0), sh = d.share < 1 - 1e-9;
    const comp = d.nocomp ? 'the compressor could not be split by air that day (no reading, more than the POWER line, or no loom with a CFM reading), so all of POWER is in the per pick part' : `compressor ${fwR(d.comp)} ÷ ${fwN(d.air)} ft³ × the loom's ${fwN(d.lair)} ft³${sh ? ` × ${fwN(d.picks)} of its ${fwN(d.lpicks)} picks that day` : ''} = ${fwR(d.cpart)}`;
    return fwOut(`Loom ${d.loom}: realisation ${fwR(d.real)} − its loom cost ${fwR(d.lcost)} (other heads ${fwR(d.other)} ÷ ${d.n} loom${d.n === 1 ? '' : 's'} running = ${fwR(d.per)}${sh ? ` × ${fwN(d.picks)} of the loom's ${fwN(d.lpicks)} picks that day` : ''}; ${comp}; per pick ${fwR(d.pick)} ÷ ${fwN(d.P)} picks = ${fwP(100 * d.pp)} paise × ${fwN(d.picks)} picks = ${fwR(d.ppart)}) − its own B grade ${fwR(d.bcharge || 0)}`, fwR(v), '', v); },
  K7L: (d) => { if (!d || !fwOk(d.v) || !(d.ld > 0)) return null;
    return fwOut(`Profit (loom cost basis): ${d.unrec > 0 ? `the priced loom-days' ${fwR(d.v + d.unrec)} − ${fwR(d.unrec)} loom cost not recovered (${d.uld} loom-day${d.uld === 1 ? '' : 's'} not priced) = ${fwR(d.v)}` : fwR(d.v)}${d.picks > 0 ? `; ÷ ${fwN(d.picks)} A-grade folded picks × 100 = ${fwP(100 * d.v / d.picks)} paise per folded pick` : ''}; ÷ ${fwN(d.ld)} loom-days running = ${fwR(d.v / d.ld)} a loom a day; on the tile in lakh, ${fwR(d.v)} ÷ 1,00,000`, fwL(d.v), 'lakh', d.v); },
  K7U: (d) => { if (!d || !fwOk(d.unrec) || !(d.uld > 0)) return null;
    return fwOut(`${d.date}, loom cost of the running loom-days not priced (each: other heads ${fwR(d.per)} a loom + its air and its picks): ${d.items.slice(0, 3).map((x) => `loom ${x.loom} (${x.why}) ${fwR(x.rs)}`).join(' + ')}${d.items.length > 3 ? ` + ${d.items.length - 3} more` : ''}`, fwR(d.unrec), 'not recovered', d.unrec); },
  K7: (d) => { if (!d || !fwOk(d.v) || !(d.ld > 0)) return null;
    return fwOut(`${d.what}: ${fwR(d.v)} over ${fwN(d.ld)} ${d.costed ? 'costed' : 'priced'} loom-days${d.picks > 0 ? `; ÷ ${fwN(d.picks)} A-grade folded picks × 100 = ${fwP(100 * d.v / d.picks)} paise per folded pick` : ''}; ÷ ${fwN(d.ld)} loom-days = ${fwR(d.v / d.ld)} a loom a day; on the tile in lakh, ${fwR(d.v)} ÷ 1,00,000`, fwL(d.v), 'lakh', d.v); },
  K7S: (d) => { if (!d || !fwOk(d.v) || !(d.m > 0)) return null;
    return fwOut(`Sale value ${fwR(d.v)} over ${fwN(d.ld)} priced loom-days; ÷ ${fwN(d.m)} m priced = ₹${(d.v / d.m).toFixed(2)} a metre on average; on the tile in lakh, ${fwR(d.v)} ÷ 1,00,000`, fwL(d.v), 'lakh', d.v); },
  K8: (d) => { if (!d || !(d.picks > 0)) return null; const v = d.priced / d.picks;
    return fwOut(`${fwN(d.priced / 1e5, 2)} lakh priced picks ÷ ${fwN(d.picks / 1e5, 2)} lakh picks × 100`, (v * 100).toFixed(0) + '%', '', v); },
  K9: (d) => { if (!d || !fwOk(d.sale) || !(d.picks > 0)) return null; const u = d.unrec || 0, v = d.sale - d.yarn - d.conv - d.bgrade - u, pp = (x) => fwP(100 * x / d.picks), r = 100 * v / d.picks;
    return fwOut(`Loom cost basis, in rupees: sale ${fwR(d.sale)} − standard yarn ${fwR(d.yarn)} = realisation ${fwR(d.sale - d.yarn)}; − loom cost ${fwR(d.conv)} − the looms' own B grade ${fwR(d.bgrade)} − loom cost not recovered ${fwR(u)} = ${fwR(v)} of profit. Per folded pick, each ÷ ${fwN(d.picks)} A-grade folded picks × 100: sale ${pp(d.sale)} − standard yarn ${pp(d.yarn)} = realisation ${pp(d.sale - d.yarn)}; − loom cost ${pp(d.conv)} − B grade ${pp(d.bgrade)} − loom cost not recovered ${pp(u)}`,
      (r < 0 && /[1-9]/.test(Math.abs(r).toFixed(2)) ? '−' : '') + Math.abs(r).toFixed(2), 'paise of profit per folded pick', r); },
  K10L: (d) => { if (!d || !fwOk(d.charged) || !fwOk(d.plant) || !(d.days > 0)) return null; const v = d.charged - d.plant;
    return fwOut(`both widths, over the ${d.days} costed day${d.days === 1 ? '' : 's'} with loom data: charged to the looms ${fwR(d.charged)} (each loom's loom cost, plus B grade) − the plant's folded cost ${fwR(d.plant)}`, fwR(Math.abs(v) < 0.5 ? 0 : v), '', v); },
  K11: (d) => { if (!d || !fwOk(d.v) || !(d.n > 0)) return null; const v = d.v / d.n;
    return d.pp ? fwOut(`${d.name}: ${d.what}, realisation × 100 = ${fwN(d.v, 0)} paise ÷ ${fwN(d.n)} picks`, fwP(v), 'paise', v)
      : fwOut(`${d.name}: ${d.what} ${fwR(d.v)} ÷ ${fwN(d.n)} loom-days`, fwR(v), 'a loom per day', v); },
  K12: (d) => { if (!d || !fwOk(d.pp) || !(d.picks > 0)) return null; const v = d.picks * d.pp / 100;
    return fwOut(`Loom ${d.loom}: ${fwN(d.picks)} lost picks × ${fwP(d.pp)} paise of realisation per pick`, fwR(v), 'a day', v); },
  K13: (d) => { if (!d || !(d.picks > 0)) return null; const v = 100 * d.real / d.picks;
    return fwOut(`${d.date}: realisation ${fwR(d.real)} ÷ ${fwN(d.picks)} A-grade folded picks × 100`, fwP(v), 'paise per folded pick', v); },
  K14: (d) => { if (!d || !fwOk(d.now) || !fwOk(d.tgt)) return null; const v = d.now - d.tgt;
    return fwOut(`${d.hg}: now ${fwR(d.real)} ÷ ${d.ld} priced loom-days = ${fwR(d.now)}; target ${fwR(d.tgt)} (each loom-day at 93% of the target RPM, averaged); now − target, ${fwR(d.now)} − ${fwR(d.tgt)}`, fwR(v), 'a loom per day', v); },
};
