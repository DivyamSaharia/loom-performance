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

// ---- the day's cost per pick, from the costing data (the corrected costing's days, Divyam 10 Nov 2026)
// The plant's folded cost per pick = (OPEX + B grade loss + cut piece loss − B grade revenue) ÷ A-grade folded picks. The
// analysis applies it to every pick of every loom without its B grade part, and charges each loom its own B grade metres at
// the day's net B grade loss per B grade metre, so B grade is neither shared out nor counted twice (Divyam, 10 Nov 2026).
function fcCostDay(day) {
  if (!day || !ok(day.fcpp) || !ok(day.afold) || day.afold <= 0) return null;
  const b = day.bgrade || {};
  const bnet = (ok(b.loss) ? b.loss : 0) - (ok(b.rev) ? b.rev : 0);
  const fold = day.fcpp / 100;                       // rupees per A-grade folded pick, incl. the B grade part
  const bpart = bnet / (day.afold * 1e5);            // that B grade part, rupees per folded pick
  return {date: day.date, fold, bpart, base: fold - bpart, bnet, bm: ok(b.m) ? b.m : null, has_rev: ok(b.rev)};
}

// ---- one analysis run. inp: {M, loomdays: [{date, loom, width, hg, fpicks, styles}], costing: [costing day], reg: [{date,
// loom, m}] (B grade register), basis: 'Greige'|'RFD'|'As sold', from, to}. Every loom-day is valued at the rates in force on
// its own date, at fabric level, then added up (case 38). Nothing is guessed: a loom-day with no link, a mixed link, no rate
// or missing construction is a gap with its reason, counted in coverage (cases 17, 32, 40). "As sold" values each loom-day
// on its link's default record (fcLinkDefault), so greige-only and RFD-only groups are both priced on one screen; Greige and
// RFD stay as what-if views. Each row carries the basis it was valued on (r.basis).
function fcAnalyse(inp) {
  const {M, basis} = inp;
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
               sale: null, real: null, cost: null, bcharge: null, profit: null, gap: null};
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
    r.sale = r.metres * pm.sale;
    r.real = r.metres * pm.real;
  }
  // cost per pick and B grade on every row of a costed day (gap rows too, so the day reconciles; only priced rows show profit)
  for (const r of rows) {
    const c = cost.get(r.date), b = bday.get(r.date);
    if (!c || !b || !r.picks) continue;
    const k = r.date + '|' + r.loom;
    const share = picksOf.get(k) ? r.picks / picksOf.get(k) : 1;
    r.bm = (bReg.get(k) || 0) * share;
    r.cost = r.picks * c.base;
    r.bcharge = r.bm * b.rate + r.picks * b.spread;
    r.bnote = !b.reg ? 'no B grade register for the day: its B grade is spread over all picks' : null;
    if (r.gap) { r.cost_gap = r.cost; r.cost = null; r.bcharge_gap = r.bcharge; r.bcharge = null; continue; }
    r.profit = r.real - r.cost - r.bcharge;
  }
  rows.bday = bday;
  return rows;
}
// What the analysis charged against what the plant's costing says the same days cost (review 7): the folded cost is per
// A-grade folded pick and is applied to every woven pick, so the two differ when folding runs behind or ahead of weaving.
function fcReconcile(rows, costing) {
  const days = new Set(rows.map((r) => r.date));
  let charged = 0, plant = 0, bnet = 0, nodays = 0, noreg = 0;
  for (const c of costing || []) {
    if (!days.has(c.date)) continue;
    const k = fcCostDay(c); if (!k) continue;
    plant += k.fold * c.afold * 1e5; bnet += k.bnet; nodays++;
  }
  for (const r of rows) charged += (r.cost ?? r.cost_gap ?? 0) + (r.bcharge ?? r.bcharge_gap ?? 0);
  for (const [, b] of rows.bday || []) if (!b.reg) noreg++;
  return {charged, plant, diff: charged - plant, days: nodays, bnet, noreg, uncosted: [...days].filter((d) => !(costing || []).some((c) => c.date === d && fcCostDay(c))).length};
}
// Totals of a set of rows: picks (all and priced), coverage, rupees and paise per pick, loom-days.
function fcSum(rows) {
  const t = {picks: 0, priced: 0, costed: 0, metres: 0, sale: 0, real: 0, profit: 0, cost: 0, bcharge: 0, loomdays: 0, priced_ld: 0, costed_ld: 0, gaps: {}};
  const ld = new Set(), pld = new Set(), cld = new Set();
  for (const r of rows) {
    t.picks += r.picks; ld.add(r.date + '|' + r.loom);
    if (r.gap) { t.gaps[r.gap] = (t.gaps[r.gap] || 0) + r.picks; continue; }
    t.priced += r.picks; t.metres += r.metres; t.sale += r.sale; t.real += r.real; pld.add(r.date + '|' + r.loom);
    if (r.profit != null) { t.costed += r.picks; t.profit += r.profit; t.cost += r.cost; t.bcharge += r.bcharge; cld.add(r.date + '|' + r.loom); }
  }
  t.loomdays = ld.size; t.priced_ld = pld.size; t.costed_ld = cld.size;
  t.coverage = t.picks ? t.priced / t.picks : null;
  t.cost_coverage = t.picks ? t.costed / t.picks : null;
  const pp = (rs, p) => p ? rs / p * 100 : null;
  t.sale_pp = pp(t.sale, t.priced); t.real_pp = pp(t.real, t.priced); t.profit_pp = pp(t.profit, t.costed);
  // rupees per loom per day (Divyam, 10 Nov 2026): the period's rupees ÷ the loom-days they came from
  t.sale_ld = t.priced_ld ? t.sale / t.priced_ld : null; t.real_ld = t.priced_ld ? t.real / t.priced_ld : null; t.profit_ld = t.costed_ld ? t.profit / t.costed_ld : null;
  return t;
}
function fcGroup(rows, key) {
  const g = new Map();
  for (const r of rows) { const k = key(r); if (k == null) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return [...g.entries()].map(([k, rs]) => Object.assign({key: k, rows: rs}, fcSum(rs)));
}

// ---- R1 (11 Nov 2026): coverage, the per-pick waterfall, product ranking, lost realisation, approval markers.
// Coverage of a set of rows as one bar: costed (priced with profit), priced only (no costing day yet) and gap picks, with
// every gap reason, its picks and where it is put right ('links' = Head-group links, 'approvals' = Approvals, 'masters' = Fabric
// masters, 'costing' = the Costing tab). Never zero and never guessed: a reason is listed with its picks, not valued.
const FC_GAP_GO = (reason) => /^(unlinked style|no (greige|RFD) record linked|not valued|styles linked to different)/.test(reason) ? 'links'
  : /^(no sale rate|no yarn cost)/.test(reason) ? 'approvals' : /^(fabric not in the masters|retired fabric|linked .* record is now|no PPI)/.test(reason) ? 'masters' : null;
function fcCoverage(rows) {
  const t = fcSum(rows);
  const reasons = Object.entries(t.gaps).map(([reason, picks]) => ({reason, picks, share: t.picks ? picks / t.picks : 0, go: FC_GAP_GO(reason)})).sort((a, b) => b.picks - a.picks);
  const uncosted = t.priced - t.costed;
  if (uncosted > 1e-9) reasons.push({reason: 'no costing day yet (priced, no profit)', picks: uncosted, share: t.picks ? uncosted / t.picks : 0, go: 'costing', soft: true});
  return {picks: t.picks, priced: t.priced, costed: t.costed, gap: t.picks - t.priced, coverage: t.coverage, cost_coverage: t.cost_coverage, loomdays: t.loomdays, priced_ld: t.priced_ld, reasons};
}
// Sale → yarn → conversion → B grade → profit, in paise per pick, over the costed rows only (so the steps add up exactly to
// the profit shown). yarn = sale − realisation (the standard yarn cost), conversion = the folded cost per pick without B
// grade, B grade = the loom's own charge. Rupees are returned too. null when nothing is costed.
function fcWaterfall(rows) {
  const R = rows.filter((r) => r.profit != null && r.picks > 0);
  if (!R.length) return null;
  const s = {picks: 0, sale: 0, yarn: 0, conv: 0, bgrade: 0, profit: 0, loomdays: new Set(R.map((r) => r.date + '|' + r.loom)).size};
  for (const r of R) { s.picks += r.picks; s.sale += r.sale; s.yarn += r.sale - r.real; s.conv += r.cost; s.bgrade += r.bcharge; s.profit += r.profit; }
  const pp = (v) => v / s.picks * 100;
  s.pp = {sale: pp(s.sale), yarn: pp(s.yarn), conv: pp(s.conv), bgrade: pp(s.bgrade), profit: pp(s.profit)};
  s.steps = [{label: 'Sale value', v: s.pp.sale, total: true}, {label: 'Yarn', v: -s.pp.yarn}, {label: 'Conversion', v: -s.pp.conv}, {label: 'B grade', v: -s.pp.bgrade}, {label: 'Profit', v: s.pp.profit, total: true}];
  return s;
}
// Products (or head groups) ranked by profit per pick (realisation per pick where nothing is costed), with the plant
// average over the same rows as the reference. key: (row) => the group key; name: optional (key) => label.
function fcRank(rows, key) {
  const all = fcSum(rows);
  const g = fcGroup(rows.filter((r) => key(r) != null && !r.gap), key).map((x) => Object.assign(x, {widths: [...new Set(x.rows.map((r) => r.width))].sort()}));
  g.sort((a, b) => (b.profit_pp ?? b.real_pp ?? -1e18) - (a.profit_pp ?? a.real_pp ?? -1e18) || b.priced - a.priced);
  return {groups: g, plant: {real_pp: all.real_pp, profit_pp: all.profit_pp, priced: all.priced, costed: all.costed}};
}
// The best product per loom type: for each width, the product with the highest profit per pick (realisation per pick where
// no product on that width is costed), with its figure and how many loom-days it rests on.
function fcBestByWidth(rows, key) {
  const out = {};
  for (const w of [...new Set(rows.map((r) => r.width))].sort()) {
    const R = fcRank(rows.filter((r) => r.width === w), key).groups.filter((g) => g.priced > 0);
    if (!R.length) continue;
    const costed = R.some((g) => g.costed > 0);
    const best = R.filter((g) => !costed || g.costed > 0)[0];
    out[w] = {key: best.key, by: costed ? 'profit' : 'realisation', value: costed ? best.profit_pp : best.real_pp, loomdays: costed ? best.costed_ld : best.priced_ld, of: R.length};
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
// Break-even realisation per loom per day (Divyam, 12 Nov 2026): the day's total cost ÷ the looms running.
function fcBreakEven(cost, looms) { return typeof cost === 'number' && isFinite(cost) && looms > 0 ? cost / looms : null; }
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
  const mix = g.map((x) => ({key: x.key, picks: x.priced, real_pp: x.real_pp, share: tot ? x.priced / tot : null})).sort((a, b) => b.picks - a.picks);
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
    const a = fcAnalyse(Object.assign({}, inp, {basis, from: w.from, to}));
    const b = fcAnalyse(Object.assign({}, inp, {M: M2, basis, from: w.from, to}));
    const per = new Map();
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      const dr = (y.real ?? 0) - (x.real ?? 0), ds = (y.sale ?? 0) - (x.sale ?? 0), dp = (y.profit ?? 0) - (x.profit ?? 0);
      const moved = Math.abs(dr) > 1e-9 || Math.abs(ds) > 1e-9 || (x.gap || '') !== (y.gap || '');
      if (!moved) continue;
      const u = y.fabric ?? x.fabric;
      const o = per.get(u) || {uid: u, loomdays: 0, d_sale: 0, d_real: 0, d_profit: 0, newly_priced: 0, newly_gap: 0};
      o.loomdays++; o.d_sale += ds; o.d_real += dr; o.d_profit += dp;
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
// priced than looms ran, the unpriced looms are not guessed: the total is the priced looms' only (full false, says so).
function fcLoomTotal(looms, perLoom, pricedLd) {
  if (perLoom == null || !isFinite(perLoom) || !(looms > 0) || !(pricedLd > 0)) return null;
  const full = pricedLd >= looms;
  return {rs: (full ? looms : pricedLd) * perLoom, full, looms, priced: Math.min(pricedLd, looms)};
}
