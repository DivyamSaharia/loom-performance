// W2 Looms · app/pages-looms.js — The loom pages: KPIs, Actions, Quality, Pressure, CFM, Effective RPM, Utilisation, Warp breaks.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- KPIs
function kpiSet(dates) {
  const L = (D.loomdays || []).filter((x) => dates.includes(x.date) && inW(x.width) && x.run > 0);
  const A = agg(L); if (!A) return null;
  const n = dates.length;
  const off = (D.util || []).filter((u) => dates.includes(u.date) && inW(u.width)).reduce((s, u) => s + u.off, 0);
  return {picks_l: A.fpicks / PICK_LAKH / n, eff: A.eff, rpm: A.rpm, apk: A.apk, cfm: A.cfm, floor_cfm: A.air / 1440 / n, air: A.air / n, off_h: off / 60 / n};
}

// ---------------------------------------------------------------- Actions (latest day only)
function actionLists() {
  const L = latestRecs().filter((x) => x.hg !== 'Unassigned');
  const out = {rpm: [], eff: [], cfm: [], press: []};
  for (const x of latestRecs()) {
    if (!(x.eff < EFF_BAD())) continue;
    const b = bench(x.width, x.hg) || {};
    const lostMin = Math.max(0, EFF_BAD() / 100 * (x.run + x.stop) - x.run);
    const beam = ok(x.warp_rate) && x.warp_rate > Math.max((S().warp_multiple || 2) * (b.warp_med || 0), S().warp_min_rate || 3);
    out.eff.push({x, now: x.eff, gap: EFF_BAD() - x.eff, impact: lostMin * x.rpm * pf(x.width, x.hg) / PICK_LAKH, lostMin, beam});
  }
  const floor = (D.pressure.floor || []).slice(-1)[0];
  for (const x of L) {
    const b = bench(x.width, x.hg), t = tgt(x.width, x.hg) || {};
    if (!b) continue;
    // RPM
    const rB = b.rpm, rT = ok(t.rpm) ? t.rpm : null;
    const offRB = ok(rB) && x.rpm < rB - tolRpm(rB), offRT = ok(rT) && x.rpm < rT - tolRpm(rT);
    if (offRB || offRT) {
      const ref = Math.max(offRB ? rB : 0, offRT ? rT : 0);
      out.rpm.push({x, b, t, now: x.rpm, bm: rB, tg: rT, gap: ref - x.rpm, impact: (ref - x.rpm) * x.run * pf(x.width, x.hg) / PICK_LAKH});
    }
    // CFM: benchmark CFM = benchmark air per 1,000 picks at this loom's own speed
    const cB = cfmOf(b.apk, x.width, x.hg, x.rpm), cT = ok(t.cfm) ? t.cfm : null;
    const offCB = ok(cB) && x.cfm > cB + tolAir(cB), offCT = ok(cT) && x.cfm > cT + tolAir(cT);
    if (offCB || offCT) {
      const ref = Math.min(offCB ? cB : Infinity, offCT ? cT : Infinity);
      out.cfm.push({x, b, t, now: x.cfm, bm: cB, tg: cT, gap: x.cfm - ref, impact: (x.cfm - ref) * x.run});
    }
    // Pressure: highest main pressure the loom ran at in the day vs head group benchmark
    const pB = ok(b.main_max) ? b.main_max : b.main, pT = pBest(x.width, x.hg);   // Round A2: for pressure the target is the best
    const offPB = ok(pB) && x.main_max > pB + PRESS_TOL, offPT = ok(pT) && x.main_max > pT + PRESS_TOL;
    if (offPB || offPT) {
      const ref = Math.min(offPB ? pB : Infinity, offPT ? pT : Infinity);
      out.press.push({x, b, t, now: x.main_max, bm: pB, tg: pT, gap: x.main_max - ref, atFloor: floor && Math.abs(x.main_max - floor.floor) < 1e-6});
    }
  }
  out.rpm.sort((a, b) => b.impact - a.impact);
  out.eff.sort((a, b) => b.impact - a.impact);
  out.cfm.sort((a, b) => b.gap - a.gap);
  out.press.sort((a, b) => b.now - a.now || b.gap - a.gap);
  return out;
}
function loomCell(x) { return el('div', {}, el('div', {}, loomLink(x.loom, x.date, 'Loom ' + x.loom)), el('div', {class: 'note'}, hgLink(x.hg, x.width, x.date), ` · ${x.width} cm ${x.type}`)); }
// Priority note (10 Nov 2026): the looms to work on first on the day shown, ranked by what fixing them is worth a day.
// Lost picks (RPM below its reference, efficiency below the line) are valued at the day's fixed + attendance-following
// cost per pick: costs that run whether or not the loom weaves, so every pick lost leaves them on fewer picks. Excess air is
// valued at the compressor's rupees per ft³ that day; a loom holding up the floor pressure at its step of the floor ladder
// (to benchmark, or the best where lower: Round A2), mid-point of the energy range. Without a costing day the ranking falls back to
// lost picks, then excess air.
function costDayOn(date) {
  if (typeof cDays !== 'function' || !COST) return null;
  const L = cDays().filter((d) => d.date <= date);
  return L.length ? L[L.length - 1] : null;
}
function priorityList(n = 5) {
  const A = actionLists(), by = new Map();
  const get = (x) => { if (!by.has(x.loom)) by.set(x.loom, {x, why: [], lakh: 0, ft3: 0, press: 0, rsAir: 0, rsPress: 0, beam: null}); return by.get(x.loom); };
  const cd = costDayOn(D.latest), ct = cd ? costTypes(cd) : null, ppPick = ct ? ct.fixed + ct.attendance : null;   // paise per pick
  const cc = typeof compDay === 'function' ? compDay(D.latest) : null;
  for (const r of A.eff) { const o = get(r.x); o.lakh += r.impact; o.why.push({k: 'Efficiency', t: `${f1(r.now)}%, ${f1(r.gap)} points under the ${f0(EFF_BAD())}% line`}); if (r.beam) o.beam = r.x; }
  for (const r of A.rpm) { const o = get(r.x); o.lakh += r.impact; o.why.push({k: 'Speed', t: `${f0(r.now)} RPM, ${f0(r.gap)} under its ${ok(r.tg) && r.now + r.gap === r.tg ? 'target' : 'benchmark'}`}); }
  for (const r of A.cfm) { const o = get(r.x); const ft3 = r.gap * r.x.run; o.ft3 += ft3; o.rsAir += cc ? ft3 * cc.sRsFt3 : 0; o.why.push({k: 'Air', t: `${f1(r.now)} CFM, ${f1(r.gap)} over its reference`}); }
  const looms = (D.pressure.looms || []).map((l) => { const b = bench(l.width, l.hg) || {}, bm = ok(b.main_max) ? b.main_max : (ok(b.main) ? b.main : null), tg = pBest(l.width, l.hg);   // Round A2: the best stands in for a pressure target
    return {loom: l.loom, hg: l.hg, width: l.width, main: l.main, ref: ok(bm) && ok(tg) ? Math.min(bm, tg) : ok(tg) ? tg : bm}; });
  const F = floorLadder(looms, n);
  let prev = 0;
  const done = [];
  for (const [i, st] of (F.steps || []).entries()) {
    const before = done.slice(); done.push(st.loom);
    if (!(st.drop > 1e-9)) continue;
    // Round F: the rule only; no set point or margin = the pressure money is a gap (null, shown "—" with its next step), never ₹0
    const s0 = saving(F.now, st.floor), cur = s0 || 0, part = cur - prev; prev = cur;
    const x = latestRecs().find((r) => r.loom === st.loom) || {loom: st.loom, hg: st.hg, width: st.width};
    const o = get(x); o.press += st.drop; o.rsPress = s0 == null || o.rsPress == null ? null : o.rsPress + (cc ? part * cc.kwh * cc.rate : 0);
    o.why.push({k: 'Main pressure', t: `${f2(st.from)} kgf/cm²; bring it to ${f2(st.to)} and the compressor set point drops ${f2(st.drop)} kgf/cm² more`, sub: `step ${i + 1} of the floor ladder${before.length ? `, after loom${before.length === 1 ? '' : 's'} ${before.join(', ')}` : ''}`});
  }
  // R2 (11 Nov 2026): the same lost picks valued in rupees of realisation (that loom-day's realisation per pick, As sold),
  // beside the cost figure; the ranking is unchanged. null = that loom-day is not priced (a gap, never ₹0).
  // 12 Nov 2026 (Divyam): the quality's realisation is factored in. For the owner with the analysis on, a lost pick on a
  // priced loom-day is valued at that loom-day's realisation per pick (its own quality, the rates in force), so a loom on a
  // dearer cloth ranks higher; an unpriced loom-day falls back to the fixed + attendance-following cost per pick (fcPrioValue).
  const money2 = typeof fxOn === 'function' && fxOn();
  const realPp = (o) => { if (!money2 || typeof fxLd !== 'function') return null; const L = fxLd(D.latest, o.x.loom, o.x.hg); return L && L.real_pp != null ? L.real_pp : null; };
  // 13 Nov 2026 (Divyam): a loom whose head group changed in either of the last 2 shifts is left out until it settles
  // (D.changeover from the pipeline, per snapshot). The floor ladder above still counts it: the compressor serves it anyway.
  const co = D.changeover || {};
  const skipped = [...by.values()].filter((o) => co[o.x.loom]).map((o) => ({loom: o.x.loom, ...co[o.x.loom]}));
  const rows = [...by.values()].filter((o) => !co[o.x.loom]).map((o) => {
    const v = fcPrioValue({picks: o.lakh * 1e5, realPp: realPp(o), costPp: ppPick, rsAir: o.rsAir, rsPress: o.rsPress});
    const rsCost = ok(ppPick) ? o.lakh * 1e5 * ppPick / 100 : 0;
    return {...o, rsPicks: v.rsPicks, rsCost, pickBy: v.by, rs: v.rs, rsReal: v.by === 'realisation' ? v.rsPicks : null};
  });
  const money = rows.some((o) => o.rs > 0);
  rows.sort((a, b) => money ? b.rs - a.rs || b.lakh - a.lakh : b.lakh - a.lakh || b.ft3 - a.ft3 || b.press - a.press);
  return {rows: rows.slice(0, n), total: rows.length, money, ppPick, cc, cd, skipped: skipped.sort((a, b) => a.loom - b.loom)};
}
function priorityCard() {
  const P = priorityList(5);
  if (typeof wkPut === 'function') {   // Round J: the top loom, for its Working (cost valuation; owner: realisation)
    const o = P.rows[0], real = o && o.pickBy === 'realisation';
    wkPut('B6', o ? {loom: o.x.loom, by: o.pickBy, picks: o.lakh * 1e5, pp: o.lakh > 0 ? 100 * o.rsPicks / (o.lakh * 1e5) : null, rsPicks: o.pickBy ? o.rsPicks : null, ft3: o.ft3, rsFt3: P.cc ? P.cc.sRsFt3 : null, rsAir: P.cc ? o.rsAir : null, press: o.press, rsPress: P.cc ? o.rsPress : null} : null);
    wkPut('K12', real ? {loom: o.x.loom, picks: o.lakh * 1e5, pp: 100 * o.rsPicks / (o.lakh * 1e5)} : null);
  }
  // Round A1 (Divyam, 24 Nov 2026): the day of the quality change, for a loom left out and for each loom listed
  const sk = P.skipped.length ? el('p', {class: 'note co-skip', text: `${P.skipped.length} loom${P.skipped.length === 1 ? '' : 's'} left out: head group changed in the last 2 shifts (${P.skipped.map((c) => `loom ${c.loom}, changed on ${dfmt(c.date)} in shift ${c.shift}${c.to && c.to.length ? ` to ${c.to.join(', ')}` : ''}`).join('; ')}). ${P.skipped.length === 1 ? 'It comes' : 'They come'} back once 2 shifts pass on the new head group.`}) : null;
  if (!P.rows.length) return card('Work on these first', dfmt(D.latest), el('p', {class: 'empty', text: P.skipped.length ? 'No other loom is off its reference today.' : 'No loom is off its reference today. Nothing to chase.'}), sk);
  // 12 Nov 2026 (Divyam): why as short points, impact as a total in rupees with its breakdown.
  const li = P.rows.map((o) => {
    const why = o.why.slice();
    if (o.beam) why.push({k: 'Warp breaks', t: `${f1(o.beam.warp_rate)} per 100k picks${o.beam.beam ? ` on beam ${o.beam.beam}` : ''}: check the beam before the loom`});
    const pricedOff = typeof fxOn === 'function' && fxOn() && typeof fxAll === 'function' && fxAll();
    const imp = [];   // [what, how worked out, ₹ or null]
    if (o.lakh > 0.0005) imp.push(['Lost picks', `${Math.round(o.lakh * 1e5).toLocaleString('en-IN')} picks × ${o.pickBy === 'realisation' ? `${f2(100 * o.rsPicks / (o.lakh * 1e5))} paise per pick of realisation on ${o.x.hg}` : o.pickBy === 'cost' ? `${f2(P.ppPick)} paise fixed + attendance cost per pick${pricedOff ? ' (this loom-day is not priced)' : ''}` : 'not valued: no costing for the day'}`, o.pickBy ? o.rsPicks : null]);
    if (o.ft3 > 0) imp.push(['Extra air', `${f0(o.ft3)} ft³ at the compressor's ₹ per ft³`, P.cc ? o.rsAir : null]);
    if (o.press > 0) imp.push(['Floor pressure', `set point down ${f2(o.press)} kgf/cm²${o.rsPress == null ? ` · no ₹ yet: ${!ok(COMP_SP) ? (canEdit() ? 'type the compressor set point on the Pressure tab' : 'the compressor set point is not typed in, tell the owner') : (typeof fxIsOwner === 'function' && fxIsOwner() ? 'add setpoint_margin_kgf to the Config sheet Settings tab' : 'no set point margin yet, tell the owner')}` : ''}`, P.cc ? o.rsPress : null]);
    const any = imp.some((r) => ok(r[2]));
    const tb = el('table', {class: 'impt nosort'}, el('tbody', {}, ...imp.map((r) => el('tr', {}, el('td', {text: r[0]}), el('td', {class: 'note', text: r[1]}), el('td', {class: 'num', text: ok(r[2]) ? rs(r[2]) : '—'}))),
      any && imp.length > 1 ? el('tr', {class: 'tot'}, el('td', {}, el('b', {text: 'Total'})), el('td', {class: 'note', text: 'a day'}), el('td', {class: 'num'}, el('b', {text: rs(o.rs)}))) : null));
    return el('li', {},
      el('div', {class: 'prio-head'}, loomLink(o.x.loom, D.latest, 'Loom ' + o.x.loom), el('span', {class: 'note', text: ` · ${o.x.hg || '—'}${o.x.width ? `, ${o.x.width} cm` : ''}`}),
        P.money ? el('b', {class: 'prio-rs', text: `${rs(o.rs)} a day`}) : null),
      prioChange(o.x.loom),
      el('div', {class: 'prio-sec'}, el('b', {text: 'Why'}), el('ul', {class: 'why'}, why.map((w) => el('li', {}, el('b', {text: w.k + ': '}), w.t, w.sub ? el('span', {class: 'note', text: ` (${w.sub})`}) : null)))),
      el('div', {class: 'prio-sec'}, el('b', {text: 'Impact'}), el('div', {class: 'tablebox'}, tb),
        o.rsReal != null && o.rsCost > 0 ? el('p', {class: 'note', text: `Also ${rs(o.rsCost)} of fixed and staff cost left on fewer picks; not added to the total, which values the lost picks at realisation.`}) : null));
  });
  const basis = (P.money ? `Ranked by rupees a day. ${ok(P.ppPick) ? `Lost picks are valued at ${f2(P.ppPick)} paise each, the fixed and attendance-following cost per pick on ${dfmt(P.cd.date)}: these costs run whether or not the loom weaves.` : 'Lost picks carry no rupee value here: the costing for this day is not in yet.'}${P.cc ? ` Air and pressure use the compressor's rupees on ${dfmt(P.cc.date)}.` : ''} Air and pressure savings overlap a little, as on the CFM and Pressure tabs.`
    : 'Ranked by lost picks, then extra air: the costing for this day is not in yet, so there are no rupee figures.')
    + (P.rows.some((o) => o.rsReal != null) ? ' With the realisation analysis on, lost picks on a priced loom-day are valued at that loom-day\'s realisation per pick instead (sale value at prevailing rate less standard yarn cost, As sold, its own quality), so a loom on a dearer cloth ranks higher; a loom-day the Realisation tab cannot price keeps the cost valuation and says so.' : '');
  return card('Work on these first', `${dfmt(D.latest)} · top ${P.rows.length} of ${P.total} loom${P.total === 1 ? '' : 's'} off their reference`,
    el('ol', {class: 'prio'}, li), sk, el('p', {class: 'note', text: basis}));
}
// Round A1: the loom's last quality change in the loom data (the last 60 complete days), under its name in the list
function prioChange(loom) {
  const c = lastChange(D.loomdays, loom, D.latest);
  if (!c.first) return null;
  return el('div', {class: 'note prio-co', text: c.change ? `Quality changed on ${dfmt(c.change.date)}${c.change.from.length ? ` from ${c.change.from.join(', ')}` : ''} to ${c.change.to.join(', ')}`
    : `No quality change since ${dfmt(c.first)}, the first day in the loom data`});
}

function pageActions() {
  const s = el('section', {class: 'page', id: 'actions'});
  const day = kpiSet([D.latest]), pr = priorDates().length ? kpiSet(priorDates()) : null;
  s.append(el('div', {}, el('h2', {text: `${wLabel()} on ${dfmt(D.latest)}`}),
    el('p', {class: 'lead', text: 'Day totals across shifts A and B for the day shown, compared with the average of the days before it. Everything on this page uses the latest day only.'})));
  // Round A1 (Divyam, 24 Nov 2026): Needs a head group at the top of the tab, folded unless a style is waiting for one
  s.append(assignCard(D.unassigned || [], {pending: true}));
  const kp = el('div', {class: 'kpis act'});
  // each tile ends with a 7-day trend line (the last 7 complete days up to the day shown; the last point is that day)
  const kpi = (label, val, unit, d, sub, sp) => el('div', {class: 'card kpi'}, el('div', {class: 'label', text: label}), el('div', {class: 'val'}, val, unit ? el('small', {text: unit}) : null), sub ? el('div', {class: 'note', text: sub}) : null, d, sp || null);
  const last7 = (D.complete_days || []).filter((d) => d <= D.latest).slice(-7), K7 = last7.map((d) => ({d, k: kpiSet([d])}));
  const spk = (vals, fmt, label) => last7.length > 1 ? el('div', {}, spark(vals, {aria: `${label}, last ${last7.length} days`, title: `${label}: ` + last7.map((d, i) => `${dfmt(d)} ${fmt(vals[i])}`).join(' · ')}),
    el('div', {class: 'spk'}, el('span', {text: dfmt(last7[0])}), el('span', {text: `${last7.length} days`}), el('span', {text: dfmt(last7.at(-1))}))) : null;
  const sp = (k, fmt, label) => spk(K7.map((r) => r.k ? r.k[k] : null), fmt, label);
  if (day && typeof wkPut === 'function') {   // Round J: the figures the tiles are drawn with, for their Working
    const L0 = (D.loomdays || []).filter((x) => x.date === D.latest && inW(x.width) && x.run > 0), A0 = agg(L0);
    if (A0) { wkPut('A1', {fpicks: A0.fpicks, days: 1}); wkPut('A2:eff', {run: A0.run, tot: A0.run + A0.stop}); wkPut('A2:rpm', {picks: A0.picks, run: A0.run});
      wkPut('B1:cfm', {air: A0.air, run: A0.run}); wkPut('B1:total', {air: A0.air}); }
    wkPut('B1:off', {min: (D.util || []).filter((u) => u.date === D.latest && inW(u.width)).reduce((a, u) => a + u.off, 0)});
    wkPut('A6', pr ? {now: day.picks_l, prev: pr.picks_l, n: priorDates().length, dp: 2, unit: 'lakh'} : null);
  }
  if (day) {
    kp.append(
      actTap(kpi('Picks', f2(day.picks_l), 'lakh', delta(day.picks_l, pr && pr.picks_l, true, (x) => x.toFixed(2), ' lakh'), null, sp('picks_l', f2, 'Picks, lakh')), 'picks'),
      actTap(kpi('Efficiency', f1(day.eff), '%', delta(day.eff, pr && pr.eff, true, (x) => x.toFixed(1), ' pts'), null, sp('eff', f1, 'Efficiency, %')), 'eff'),
      kpi('Speed while running', f0(day.rpm), 'RPM', delta(day.rpm, pr && pr.rpm, true, (x) => x.toFixed(0), ' RPM'), null, sp('rpm', f0, 'RPM')),
      kpi('Average CFM per loom', f1(day.cfm), 'CFM', delta(day.cfm, pr && pr.cfm, false, (x) => x.toFixed(1), ' CFM'), 'ft³/min while running, run-weighted', sp('cfm', f1, 'Average CFM per loom')),
      actTap(kpi('Total CFM consumption', f0(day.floor_cfm), 'CFM', delta(day.floor_cfm, pr && pr.floor_cfm, false, (x) => x.toFixed(0), ' CFM'), `24-h average draw of all looms · average ${f1(day.cfm)} CFM per loom while running`, sp('floor_cfm', f0, 'Total CFM')), 'cfm'),
      actTap(kpi('Powered down', f1(day.off_h), 'loom-h', delta(day.off_h, pr && pr.off_h, false, (x) => x.toFixed(1), ' h'), null, sp('off_h', f1, 'Powered down, loom-h')), 'off'));
    const fl = (D.pressure.floor || []).slice(-1)[0];
    const fm = new Map((D.pressure.floor || []).map((f) => [f.date, f.floor]));
    if (fl && typeof wkPut === 'function') wkPut('B1:floor', {floor: fl.floor, loom: fl.loom, hg: fl.hg});
    if (fl) kp.append(actTap(kpi('Floor pressure', f2(fl.floor), 'kgf/cm²', el('span', {class: 'delta flat', text: `both widths · loom ${fl.loom}, ${fl.hg}`}), null, spk(last7.map((d) => fm.has(d) ? fm.get(d) : null), f2, 'Floor pressure, kgf/cm²')), 'floor'));
    if (typeof fxActionTiles === 'function') kp.append(...fxActionTiles(kpi, last7, spk));   // 12 Nov 2026: realisation per pick (owner) and cost per pick
    if (typeof tcActionTiles === 'function') kp.append(...tcActionTiles(kpi));   // Round F: target cost per pick, folding shortage (+ owner: target profit; Round A1: no target realisation tile)
    if (typeof fxBeActTile === 'function') { const t = fxBeActTile(kpi, last7, spk); if (t) kp.append(t); }   // Round A1: Break-even realisation (owner)
  }
  s.append(kp);
  if (day) { const v = actView(); if (v) s.append(v); }   // Round A1: the open tile's view, under the tiles
  if (day) s.append(priorityCard());
  if (day && typeof tcCard === 'function') { const c = tcCard(); if (c) s.append(c); }   // Round F: Where the saving is (opens from the Target cost per pick tile)
  s.append(trendCard('actions', trendSubj0()));   // Round A2 (Divyam, 24 Nov 2026): the Trend card, moved here from Quality

  const al = (D.alerts || []).filter((a) => a.level === 'Critical');
  if (al.length) s.append(card('Data and floor flags', null, el('ul', {class: 'alerts'}, al.slice(0, 8).map((a) => el('li', {}, el('span', {class: 'pill bad', text: a.scope}), el('span', {}, linkify(a.msg)))))));
  return s;
}

// ---------------------------------------------------------------- Round A1 (Divyam, 24 Nov 2026): tiles that open a view
// Seven Actions tiles open a view under the tiles (one at a time; tapping the tile again, or Close, shuts it; not kept across
// loads): Picks, Efficiency and Total CFM consumption by quality, Powered down loom by loom, the looms at the floor pressure,
// (fabric.js) Realisation per pick by quality and Break-even realisation by day, (costing.js) Folding shortage by day. Owner
// only for now (Divyam: who sees what is a later round). Every tile that opens something carries a note on pointing at it
// (data-tip, drawn by style.css) and, where nothing can point (a phone), the same words under the tile (.taphint).
let ACTOPEN = null;
const actOwn = () => typeof fxIsOwner === 'function' && fxIsOwner() && !isPlant();
const ACTV = {picks: ['Picks by quality', 'picks by quality'], eff: ['Efficiency by quality', 'efficiency by quality'], cfm: ['Average CFM per loom by quality', 'average CFM per loom by quality'],
  off: ['Powered down, loom by loom', 'which looms were powered down, their quality and for how long'], floor: ['Looms at the floor pressure', 'which looms ran at this pressure'],
  real: ['Realisation per pick by quality', 'realisation per pick by quality'], fold: ['Folding shortage by day', 'how the folding shortage moved over the month'],
  be: ['Break-even realisation by day', 'break-even realisation day by day, month to date'],
  fq: ['Folded cost per pick by quality', 'the folded cost per pick of each quality, on the loom cost method']};   // Round A3 (item 8)
function tapTip(k, tip, hint) { if (!k) return k; k.dataset.tip = tip; if (hint !== false) k.append(el('div', {class: 'note taphint', text: tip})); return k; }
function actTap(k, id) {
  if (!k || !actOwn() || !ACTV[id]) return k;
  const [title, what] = ACTV[id], on = ACTOPEN === id, lb = k.querySelector('.label'), label = lb ? lb.textContent : title;
  k.classList.add('tap'); if (on) k.classList.add('sel');
  k.dataset.act = id; k.setAttribute('role', 'button'); k.setAttribute('tabindex', '0'); k.setAttribute('aria-pressed', on ? 'true' : 'false');
  k.setAttribute('aria-label', `${label}: ${on ? 'close' : 'open'} ${title}`);
  tapTip(k, on ? `Tap again to close ${title}` : `Tap to see ${what}`);
  const go = () => {
    ACTOPEN = on ? null : id; render();
    requestAnimationFrame(() => { const t = document.querySelector(`#main .kpi[data-act="${id}"]`); if (t) t.focus({preventScroll: true});
      const c = document.getElementById('actview'); if (c && ACTOPEN) c.scrollIntoView({block: 'nearest', behavior: 'smooth'}); });
  };
  k.addEventListener('click', (e) => { if (e.target.closest('.wkb, a, button, input, select')) return; go(); });
  k.addEventListener('keydown', (e) => { if (e.target !== k) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  return k;
}
function actView() {
  if (!ACTOPEN || !actOwn()) return null;
  const f = {picks: actPicksCard, eff: actEffCard, cfm: actCfmCard, off: actOffCard, floor: actFloorCard,
    real: typeof fxRealQCard === 'function' ? fxRealQCard : null, fold: typeof tcFoldCard === 'function' ? tcFoldCard : null, be: typeof fxBeTrendCard === 'function' ? fxBeTrendCard : null, fq: typeof fxFoldQCard === 'function' ? fxFoldQCard : null}[ACTOPEN];
  const c = f ? f() : null;
  if (!c) return null;
  c.id = 'actview'; c.classList.add('actview');
  const h = c.querySelector('.cardhead');
  if (h) h.append(el('button', {class: 'link actclose', type: 'button', text: 'Close', 'aria-label': `Close ${ACTV[ACTOPEN][0]}`, onclick: (e) => { e.stopPropagation(); ACTOPEN = null; render(); }}));
  return c;
}
const actDayL = () => (D.loomdays || []).filter((x) => x.date === D.latest && inW(x.width) && x.run > 0);
const actPct = (x) => ok(x) ? (100 * x).toFixed(1) + '%' : '—';
const actHgCell = (o) => hgLink(o.hg, o.width, D.latest, `${o.hg} · ${o.width}`);
const actCut = (n, lim, what) => n > lim ? el('p', {class: 'note', text: `The chart shows the first ${lim} of these ${n} ${what} in the Sorting basis order; the table below lists all ${n}.`}) : null;
const actSub = () => `${dfmt(D.latest)} · ${wLabel()}`;
// A view's table; on a phone (560 px and narrower) one block per row, each figure named, sortable on the same columns, the
// Total under them (a wide table would scroll sideways inside the card). rows: [[cells], [sort values]]; tot: the Total's cells.
const actPhone = () => window.matchMedia('(max-width: 560px)').matches;
function actTable(id, heads, rows, num, tot) {
  if (!actPhone()) return table(heads, [...rows.map((r) => r[0]), ...(tot ? [tot] : [])], num);
  const nm = (h) => Array.isArray(h) ? `${h[0]}, ${h[1]}` : h;
  const blk = (cells, t) => el('div', {class: 'actblk' + (t ? ' tot' : '')}, el('div', {class: 'actblk-h'}, cells[0]),
    el('div', {class: 'actblk-b'}, ...cells.slice(1).map((c, i) => el('span', {}, el('span', {class: 'note', text: nm(heads[i + 1]) + ': '}), c))));
  const bases = heads.map((h, i) => ({v: 'c' + i, label: Array.isArray(h) ? h[0] : h, get: (r) => r[1][i], d: i ? 'd' : 'a'}));
  return el('div', {class: 'actblks'}, sortableChart('act-' + id, rows, bases, (R) => el('div', {}, R.map((r) => blk(r[0]))), null), tot ? blk(tot, true) : null);
}
function actQBars(R, o) {
  return hbars(R.map((q) => ({label: `${q.hg} · ${q.width}`, v: o.v(q), text: o.text(q), color: o.color ? o.color(q) : null, onClick: () => openHg(q.hg, q.width, D.latest),
    title: `${q.hg}, ${q.width} cm: ${o.title(q)} · ${q.n} loom${q.n === 1 ? '' : 's'}`})), {aria: o.aria, axis: o.axis, labelW: 150, limit: 15, nameLabel: 'Head group', sortLabel: o.sortLabel, ref: o.ref || null});
}
function actPicksCard() {
  const Q = actByQuality(actDayL()), R = Q.rows, T = Q.total, lk = (q) => q.fpicks / PICK_LAKH;
  if (!R.length) return card(ACTV.picks[0], actSub(), el('p', {class: 'empty', text: 'No loom ran on this day. Pick another day with the date chip at the top of the page.'}));
  return card(ACTV.picks[0], `${actSub()} · each quality's picks and its share of the day's`,
    actQBars(R, {v: lk, text: (q) => `${f2(lk(q))} · ${actPct(q.share)}`, title: (q) => `${f2(lk(q))} lakh picks, ${actPct(q.share)} of the day's picks`, aria: 'Picks by quality', axis: 'Picks, lakh', sortLabel: 'Picks'}),
    actCut(R.length, 15, 'qualities'),
    actTable('picks', ['Head group', ['Looms', 'ran'], ['Picks', 'lakh'], ['Share', 'of the day\'s picks']],
      R.map((q) => [[actHgCell(q), q.n, f2(lk(q)), actPct(q.share)], [q.hg, q.n, q.fpicks, q.share]]), [1, 2, 3], [el('b', {text: 'Total'}), T.n, el('b', {text: f2(lk(T))}), '100.0%']),
    el('p', {class: 'note', text: 'Picks = fabric picks ÷ 39.37, in lakh, as on the tile; a loom that changed quality that day counts once in each quality it ran, so the Looms column can add up to more than the Total. Shown as bars rather than a pie: with this many qualities the slices of a pie would be too thin to compare.'}));
}
function actEffCard() {
  const Q = actByQuality(actDayL()), R = Q.rows, T = Q.total, line = EFF_BAD();
  if (!R.length) return card(ACTV.eff[0], actSub(), el('p', {class: 'empty', text: 'No loom ran on this day. Pick another day with the date chip at the top of the page.'}));
  return card(ACTV.eff[0], `${actSub()} · minutes run ÷ minutes run and stopped, quality by quality`,
    actQBars(R, {v: (q) => q.eff, text: (q) => f1(q.eff) + '%', color: (q) => ok(q.eff) && q.eff < line ? 'var(--bad)' : 'var(--bar)', title: (q) => `${f1(q.eff)}% efficiency (${f1(q.run / 60)} h run, ${f1(q.stop / 60)} h stopped)`,
      aria: 'Efficiency by quality', axis: 'Efficiency, %', sortLabel: 'Efficiency', ref: {v: line, label: `${f0(line)}% line`}}),
    el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad)'}), `below the ${f0(line)}% line`), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bar)'}), 'at or above it'), el('span', {class: 'lg'}, legendShape('dash'), `the ${f0(line)}% line`)),
    actCut(R.length, 15, 'qualities'),
    actTable('eff', ['Head group', ['Looms', 'ran'], ['Efficiency', '%'], ['Run', 'h'], ['Stopped', 'h']],
      R.map((q) => [[actHgCell(q), q.n, effCell(q.eff), f1(q.run / 60), f1(q.stop / 60)], [q.hg, q.n, q.eff, q.run, q.stop]]), [1, 2, 3, 4], [el('b', {text: 'Total'}), T.n, el('b', {text: f1(T.eff)}), f1(T.run / 60), f1(T.stop / 60)]),
    el('p', {class: 'note', text: `Efficiency = minutes run ÷ (minutes run + minutes stopped), as on the tile; the line is the ${f0(line)}% below which a loom counts as bad, whatever the quality. Run and stopped are added over the looms, in h.`}));
}
function actCfmCard() {
  const Q = actByQuality(actDayL()), R = Q.rows, T = Q.total;
  if (!R.length) return card(ACTV.cfm[0], actSub(), el('p', {class: 'empty', text: 'No loom ran on this day. Pick another day with the date chip at the top of the page.'}));
  return card(ACTV.cfm[0], `${actSub()} · air ÷ minutes run, quality by quality`,
    actQBars(R, {v: (q) => q.cfm, text: (q) => f1(q.cfm), title: (q) => `${f1(q.cfm)} CFM per loom while running, ${f0(q.floor_cfm)} CFM over 24 h, ${actPct(q.airShare)} of the floor's air`,
      aria: 'Average CFM per loom by quality', axis: 'Average CFM per loom while running', sortLabel: 'Average CFM per loom', ref: {v: T.cfm, label: `Floor ${f1(T.cfm)}`}}),
    el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bar)'}), 'the quality'), el('span', {class: 'lg'}, legendShape('dash'), 'the floor\'s average CFM per loom')),
    actCut(R.length, 15, 'qualities'),
    actTable('cfm', ['Head group', ['Looms', 'ran'], ['Average CFM per loom', 'CFM while running'], ['Total CFM', 'CFM, 24-h average'], ['Share of air', '%']],
      R.map((q) => [[actHgCell(q), q.n, f1(q.cfm), f0(q.floor_cfm), actPct(q.airShare)], [q.hg, q.n, q.cfm, q.floor_cfm, q.airShare]]), [1, 2, 3, 4], [el('b', {text: 'Total'}), T.n, el('b', {text: f1(T.cfm)}), el('b', {text: f0(T.floor_cfm)}), '100.0%']),
    el('p', {class: 'note', text: 'Average CFM per loom = the quality\'s air (ft³) ÷ the minutes its looms ran: the average weighted by run time, as the Average CFM per loom tile. Total CFM = its air ÷ 1,440 minutes; the rows add up to the Total CFM consumption tile.'}));
}
function actOffCard() {
  const U = (D.util || []).filter((u) => u.date === D.latest && inW(u.width));
  const O = offLooms(U, (D.loomdays || []).filter((x) => x.date === D.latest), D.loom_hg || {}), R = O.rows, hg = bv('a-off') === 'hg';
  if (!R.length) return card(ACTV.off[0], actSub(), el('p', {class: 'empty', text: 'No loom was powered down on this day: every loom ran or stood with power on all day. Nothing to do.'}));
  const qText = (r) => r.hgs.length ? `${r.hgs.join(', ')} · ${r.width} cm${r.last ? ' (did not run that day: its last quality)' : ''}` : `${r.width} cm · no quality in the loom data`;
  let body;
  if (!hg) {
    body = [hbars(R.map((r) => ({label: 'Loom ' + r.loom, v: r.off / 60, text: f1(r.off / 60), color: 'var(--bad)', onClick: () => openLoom(r.loom, D.latest),
      title: `Loom ${r.loom} (${qText(r)}): powered down ${f1(r.off / 60)} h, ran ${f1(r.run / 60)} h, stopped ${f1(r.stop / 60)} h`})), {aria: 'Powered down by loom', axis: 'Powered down, h', labelW: 90, limit: 15, nameLabel: 'Loom', sortLabel: 'Powered down'}),
      actCut(R.length, 15, 'looms'),
      actTable('off', ['Loom', 'Quality', ['Powered down', 'h'], ['Ran', 'h'], ['Stopped', 'h']],
        R.map((r) => [[loomLink(r.loom, D.latest, 'Loom ' + r.loom), el('span', {class: 'note', text: qText(r)}), f1(r.off / 60), f1(r.run / 60), f1(r.stop / 60)], [r.loom, r.hgs.join(', '), r.off, r.run, r.stop]]), [2, 3, 4],
        [el('b', {text: 'Total'}), `${R.length} loom${R.length === 1 ? '' : 's'}`, el('b', {text: f1(O.total / 60)}), f1(R.reduce((a, r) => a + r.run, 0) / 60), f1(R.reduce((a, r) => a + r.stop, 0) / 60)])];
  } else {
    const by = new Map();
    for (const r of R) { const k = (r.hgs.join(', ') || 'no quality in the loom data') + '|' + r.width; if (!by.has(k)) by.set(k, {k, hg: r.hgs.join(', ') || 'no quality in the loom data', width: r.width, off: 0, looms: []}); const g = by.get(k); g.off += r.off; g.looms.push(r.loom); }
    const G = [...by.values()].sort((a, b) => b.off - a.off);
    body = [hbars(G.map((g) => ({label: `${g.hg} · ${g.width}`, v: g.off / 60, text: f1(g.off / 60), color: 'var(--bad)', title: `${g.hg}, ${g.width} cm: ${f1(g.off / 60)} h powered down over loom${g.looms.length === 1 ? '' : 's'} ${g.looms.join(', ')}`})),
      {aria: 'Powered down by head group', axis: 'Powered down, h', labelW: 150, limit: 15, nameLabel: 'Head group', sortLabel: 'Powered down'}), actCut(G.length, 15, 'head groups'),
      actTable('off-hg', ['Head group', ['Looms', 'which'], ['Powered down', 'h']], G.map((g) => [[`${g.hg} · ${g.width}`, g.looms.join(', '), f1(g.off / 60)], [g.hg, g.looms.length, g.off]]), [2], [el('b', {text: 'Total'}), `${R.length} loom${R.length === 1 ? '' : 's'}`, el('b', {text: f1(O.total / 60)})])];
  }
  return card(ACTV.off[0], `${actSub()} · ${R.length} loom${R.length === 1 ? '' : 's'} powered down for part or all of the day`, el('div', {class: 'toolbar'}, bvSeg('a-off')), ...body,
    el('p', {class: 'note', text: 'Powered down = 1,440 minutes − minutes run − minutes stopped, loom by loom (under 10 minutes counts as 0); a loom missing from a shift file counts as powered down for that shift. A loom that did not run that day shows the last quality it ran. The rows add up to the Powered down tile.'}));
}
function actFloorCard() {
  const fl = (D.pressure.floor || []).slice(-1)[0];
  if (!fl) return card(ACTV.floor[0], dfmt(D.latest), el('p', {class: 'empty', text: 'No main pressure reading on this day. Pick another day with the date chip at the top of the page.'}));
  const F = floorLooms(D.pressure.looms, fl.floor);
  const toLadder = el('button', {class: 'link', type: 'button', text: 'Floor ladder on Pressure ›', onclick: () => navGoCard('pressure', 'Floor ladder')});
  const row = (l) => [loomLink(l.loom, D.latest, 'Loom ' + l.loom), l.hg ? hgLink(l.hg, l.width, D.latest, `${l.hg} · ${l.width}`) : '—', l.width ? `${l.width} cm${l.type ? ' ' + l.type : ''}` : '—', f2(l.main)];
  return card(ACTV.floor[0], `${dfmt(fl.date || D.latest)} · both widths: one compressor serves the whole floor`,
    el('p', {class: 'note', text: `${F.at.length} of ${F.of} loom${F.of === 1 ? '' : 's'} with a main pressure reading ran at ${f2(fl.floor)} kgf/cm², the floor pressure (the highest main pressure of the day). The compressor has to supply at least that.`}),
    F.at.length ? actTable('floor', ['Loom', 'Quality', 'Width', ['Main pressure', 'kgf/cm², day max']], F.at.map((l) => [row(l), [l.loom, l.hg, l.width, l.main]]), [3]) : el('p', {class: 'empty', text: 'No loom reading matches the floor on this day: see the Floor ladder on Pressure.'}),
    el('p', {class: 'note', text: ok(F.next) ? `Next level down: ${f2(F.next)} kgf/cm², on loom${F.nextLooms.length === 1 ? '' : 's'} ${F.nextLooms.map((l) => l.loom).join(', ')}. Bring every loom at the floor down to it and the floor drops ${f2(fl.floor - F.next)} kgf/cm²; the Floor ladder shows each step and what it saves.` : 'Every loom ran at the floor pressure: there is no lower level to step down to.'}),
    el('div', {}, toLadder));
}
function assignCard(un, o) {
  if (!un.length) return el('details', {class: 'card collapsible'}, el('summary', {}, el('h3', {text: 'Needs a head group'}), el('span', {class: 'note', text: 'Nothing to assign: every style on the looms has a head group'})),
    el('p', {class: 'note', style: 'margin:0', text: 'A style found on the looms or the costing sheet without a head group shows here, and the card opens by itself until you assign it.'}));
  const box = el('div', {class: 'assign'});
  const groups = D.head_groups || [];
  const savers = [];
  for (const u of un) {
    const id = 'as-' + u.style.replace(/[^A-Za-z0-9]/g, '_').slice(0, 60);
    const sel = el('select', {id, 'aria-label': 'Head group for ' + u.style},
      el('option', {value: '', text: 'Choose head group…'}), groups.map((g) => el('option', {value: g, text: g})), el('option', {value: '__new', text: 'New head group…'}));
    const nw = el('input', {type: 'text', id: id + '-new', placeholder: 'New head group name', hidden: true});
    const btn = el('button', {class: 'primary', type: 'button', text: 'Save', disabled: true});
    const msg = el('div', {class: 'meta'});
    const prev = assigned[u.style];
    const savedSel = prev ? (prev.is_new ? '__new' : prev.head_group) : '', savedNew = prev && prev.is_new ? prev.head_group : '';
    if (prev) { msg.className = 'saved'; msg.textContent = `Saved as ${prev.head_group}. Applies on the next daily run, or press Reload data.`; }
    // 17 Nov 2026: a pick not yet saved survives a redraw (another style's save), kept by box id until it is saved
    sel.value = draftOf(id, savedSel); nw.value = draftOf(id + '-new', savedNew); nw.hidden = sel.value !== '__new';
    flashShow(id, msg);
    const changed = () => !!sel.value && (sel.value !== '__new' || !!nw.value.trim()) && !(sel.value === savedSel && (sel.value !== '__new' || nw.value.trim() === savedNew));
    const ready = () => { btn.disabled = !db || !(sel.value && (sel.value !== '__new' || nw.value.trim())); };
    sel.addEventListener('change', () => { nw.hidden = sel.value !== '__new'; draftKeep(id, sel.value, savedSel); FLASH.delete(id); ready(); });
    nw.addEventListener('input', () => { draftKeep(id + '-new', nw.value, savedNew); FLASH.delete(id); ready(); });
    ready();
    const save = async (onlyChanged) => {
      if (!sel.value) return 'none';
      if (sel.value === '__new' && !nw.value.trim()) { msg.className = 'err'; msg.textContent = 'Type the new head group name, or pick one.'; return 'bad'; }
      if (onlyChanged && !changed()) return 'same';
      const isNew = sel.value === '__new';
      // a head group picked by its fabric name is saved under its Style-map name, on the widths this style's looms have
      const ws = [...new Set((u.looms || []).map((l) => String(((D.machine || {})[l] || {}).width || '')).filter(Boolean))];
      const hg = isNew ? nw.value.trim() : hgRootAny(sel.value, ws);
      btn.disabled = true; msg.className = 'meta'; msg.textContent = 'Saving…';
      let res = 'saved';
      try {
        await db.collection('assignments').doc(u.style.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || 'blank').set(
          {style: u.style, head_group: hg, is_new: isNew, status: 'pending', at: new Date().toISOString()});
        DRAFT.delete(id); DRAFT.delete(id + '-new');
        msg.className = 'saved'; msg.textContent = `Saved as ${hg}. Applies on the next daily run, or press Reload data.`;
      } catch (e) { msg.className = 'err'; msg.textContent = saveFail(e, 'save', 'Save') + ' You can also assign it in the Config Sheet.'; res = 'err'; ready(); }
      flashSet(id, msg.className, msg.textContent);
      return res;
    };
    btn.addEventListener('click', () => save(false));
    savers.push(save);
    box.append(el('div', {class: 'row'},
      el('div', {}, el('div', {class: 'name', text: u.style || '(blank)'}),
        el('div', {class: 'meta'}, u.costing ? `Costing sheet only, ${dfmt(u.first)}${u.last !== u.first ? '–' + dfmt(u.last) : ''}, not on a loom yet` : ['Loom ', ...u.looms.flatMap((l, i) => i ? [', ', loomLink(l, u.last)] : [loomLink(l, u.last)]), ` · ${dfmt(u.first)}${u.last !== u.first ? '–' + dfmt(u.last) : ''} · ${f1(u.run_h)} h run`])),
      el('div', {style: 'display:grid;gap:6px'}, sel, nw), el('div', {}, btn), msg));
  }
  // Save all (17 Nov 2026): saves every style with a pick that differs from what is saved, then reloads and redraws once.
  const allMsg = flashShow('as-all', el('span', {class: 'meta'}));
  const allBtn = el('button', {class: 'primary', type: 'button', text: 'Save all', disabled: !db, onclick: async () => {
    allBtn.disabled = true; allMsg.className = 'meta'; allMsg.textContent = 'Saving…';
    const n = {saved: 0, same: 0, none: 0, bad: 0, err: 0};
    await holdState(async () => {
      for (const f of savers) n[await f(true)] += 1;
      flashSet('as-all', n.err || n.bad ? 'err' : 'saved', !n.saved && !n.err && !n.bad ? 'Nothing new to save: pick a head group for a style first.'
        : [`${n.saved} style${n.saved === 1 ? '' : 's'} saved`, n.bad ? `${n.bad} with a new head group name to type` : null, n.err ? `${n.err} could not be saved: the reason is on each row` : null].filter(Boolean).join(' · ') + (n.saved ? '. They apply on the next daily run, or press Reload data.' : ''));
      allBtn.disabled = !db; flashShow('as-all', allMsg);
    });
  }});
  const saved = un.filter((u) => assigned[u.style]).length, left = un.length - saved;
  const ak = un.some((u) => !u.costing) ? 'loom' : 'cost';
  const open = ASSIGN_OPEN[ak] == null ? left > 0 && (ak === 'loom' || !!(o && o.pending)) : ASSIGN_OPEN[ak];   // Round A1: on Actions, open while anything is pending
  const c = el('details', {class: 'card collapsible' + (left ? ' attn' : ''), open: open ? true : null},
    el('summary', {}, el('h3', {text: 'Needs a head group'}),
      el('span', {class: 'note', text: left ? `${left} of ${un.length} to assign${saved ? ` · ${saved} saved` : ''}${open ? '' : ' · open to assign'}` : `All ${un.length} saved · applied on the next daily run`})),
    el('p', {class: 'note', style: 'margin:0 0 6px', text: 'Until assigned, these style names count in totals and pressure but not in benchmarks or actions.'}),
    db ? el('div', {class: 'toolbar'}, allBtn, allMsg) : null, box, db ? reloadBox() : null);
  c.addEventListener('toggle', () => { ASSIGN_OPEN[ak] = c.open; });
  if (!db) c.append(el('p', {class: 'note', text: 'Saving is not connected yet (the app has no backend address). You can assign these in the Style map tab of the Config Sheet.'}));
  return c;
}

// ---------------------------------------------------------------- Quality
function loomTable(recs) {
  const money = typeof fxOn === 'function' && fxOn();   // 12 Nov 2026: each loom's own realisation (owner, analysis on)
  const rows = recs.slice().sort((a, b) => a.loom - b.loom).map((x) => {
    const b = bench(x.width, x.hg) || {}, t = tgt(x.width, x.hg) || {};
    const cB = cfmOf(b.apk, x.width, x.hg, x.rpm);
    return [el('span', {}, loomLink(x.loom, x.date), el('div', {class: 'note', text: x.type})),
      mcell(x.rpm, b.rpm, t.rpm, f0, true, tolRpm, tolRpm, {w: x.width, hg: x.hg, m: 'rpm'}), effCell(x.eff),
      mcell(x.erpm, b.erpm, tgtE(x.width, x.hg), f0, true, tolRpm, tolRpm, {w: x.width, hg: x.hg, m: 'erpm'}),
      mcell(x.cfm, cB, t.cfm, f1, false, tolAir, tolAir, {w: x.width, hg: x.hg, m: 'apk', view: 'cfm', rpm: x.rpm}), mcell(x.apk, b.apk, null, f1, false, tolAir, null, {w: x.width, hg: x.hg, m: 'apk'}),
      mcell(x.main_max, ok(b.main_max) ? b.main_max : b.main, null, f2, false, tolP, tolP, {w: x.width, hg: x.hg, m: pkey(b)}),   // Round A2: no pressure target
      sortAs(el('span', {}, f0(x.warp), el('div', {class: 'note', text: f1(x.warp_rate) + ' /100k'})), x.warp), x.beam || '—', f1(x.run / 60),
      ...(money ? [fxLoomRealCell(x)] : [])];
  });
  return table(['Loom', ['RPM', 'picks/min'], ['Eff', '%'], ['Eff. RPM', 'RPM × eff'], ['CFM', 'ft³/min'], ['Air', 'ft³/1,000 picks'], ['Main', 'kgf/cm², max'], ['Warp', 'breaks'], 'Beam', ['Run', 'h'],
    ...(money ? [['Realisation', '₹ in the day · paise/pick']] : [])], rows, money ? [1, 2, 3, 4, 5, 6, 7, 9, 10] : [1, 2, 3, 4, 5, 6, 7, 9]);
}
// The Trend card's first head group (Round A2: on Actions, as it was on Quality): the day's biggest by picks, width by width.
function trendSubj0() {
  const by = new Map();
  for (const x of latestRecs()) { if (x.hg === 'Unassigned') continue; const k = key(x.width, x.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
  const g = [...by.values()].map((r) => ({w: r[0].width, hg: r[0].hg, A: agg(r)})).filter((x) => x.A).sort((a, b) => String(a.w).localeCompare(String(b.w)) || b.A.picks - a.A.picks)[0];
  return g ? {kind: 'hg', w: String(g.w), hg: g.hg} : null;
}
function pageQuality() {
  const s = el('section', {class: 'page', id: 'quality'});
  s.append(el('div', {}, el('h2', {text: `Head groups on ${wLabel()} looms, ${dfmt(D.latest)}`}),
    el('p', {class: 'lead', text: `Running conditions from the day shown (looms that ran at least 60 min), against each head group's benchmark from all history and your target where set. Benchmarks become final after ${S().benchmark_min_loom_days} loom-days on ${S().benchmark_min_dates} dates from ${S().benchmark_min_looms} looms. Open a head group to see its looms.`})));
  const L = latestRecs();
  const by = new Map();
  for (const x of L) { const k = key(x.width, x.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
  // R2 (11 Nov 2026): for the owner with the analysis on, two money columns beside the running figures and a sort by profit
  const money = typeof fxOn === 'function' && fxOn();
  const groups = [...by.entries()].map(([k, recs]) => ({k, w: recs[0].width, hg: recs[0].hg, recs, A: agg(recs)})).filter((g) => g.A)
    .sort((a, b) => (a.hg === 'Unassigned') - (b.hg === 'Unassigned') || a.w.localeCompare(b.w) || b.A.picks - a.A.picks);
  if (typeof wkPut === 'function') { wkPut('C2', null); wkPut('C3', null); wkPut('C4', null); }   // Round J: filled by the first head group drawn
  s.append(qualityHeat(groups.filter((g) => g.hg !== 'Unassigned')));
  { const g = groups.find((x) => x.hg !== 'Unassigned'), b = g && bench(g.w, g.hg), t = g && (tgt(g.w, g.hg) || {});   // Round J: A5, the first head group's RPM
    let rv = !g ? null : QREF === 'tgt' ? t.rpm : QREF === 'best' ? bestVal(g.w, g.hg, 'rpm') : b && b.rpm, nm = REF_NAME[QREF];
    if (g && !ok(rv) && b && ok(b.rpm)) { rv = b.rpm; nm = 'benchmark'; }
    if (typeof wkPut === 'function') wkPut('A5', g && ok(rv) ? {hg: g.hg, what: 'RPM', now: g.A.rpm, ref: rv, name: nm, tol: S().tol_rpm_pct || 3, hi: true, dp: 0} : null); }
  MREF = QREF;   // 12 Nov 2026: one reference at a time in this card (reset below)
  const t = el('table');
  // 13 Nov 2026 (Divyam): the money columns sit right after Looms ran, with Total loom realisation (looms ran × ₹ per loom).
  const hdr = ['Head group', ['Looms', 'ran'], ...(money ? [['Realisation', 'paise/pick · ₹/loom/day'], ['Total loom realisation', '₹ in the day · looms × ₹/loom'], ['Profit', 'paise/pick · ₹/loom/day']] : []),
    ['RPM', 'picks/min'], ['Efficiency', '%'], ['Eff. RPM', 'RPM × eff'], ['CFM', 'ft³/min running'], ['Air', 'ft³/1,000 picks'], ['Main pressure', 'kgf/cm², highest'], ['Warp breaks', 'total · /100k picks'], 'Benchmark basis', ''];
  t.append(el('thead', {}, el('tr', {}, hdr.map((h, i) => Array.isArray(h) ? th(h[0], h[1], i > 0 && i < hdr.length - 2) : th(h, null, false)))));
  const tb = el('tbody');
  for (const g of groups) {
    const b = bench(g.w, g.hg) || {}, tg = tgt(g.w, g.hg) || {}, A = g.A;
    const cB = cfmOf(b.apk, g.w, g.hg, A.rpm);
    const open = OPEN.has(g.k);
    const btn = el('button', {class: 'drill', type: 'button', 'aria-expanded': open ? 'true' : 'false', text: open ? 'Hide looms' : 'Looms ▸',
      onclick: () => { open ? OPEN.delete(g.k) : OPEN.add(g.k); render(); }});
    tb.append(el('tr', {},
      el('td', {}, hgLink(g.hg, g.w, D.latest), el('div', {class: 'note', text: g.w + ' cm · ' + [...new Set(g.recs.map((x) => x.type))].join(', ')}), String(g.w) === '280' && g.hg !== 'Unassigned' ? el('div', {class: 'note', text: pf(g.w, g.hg) === 2 ? 'double panna' : 'single panna'}) : null),
      el('td', {class: 'num', text: A.looms}),
      ...(money ? (() => { const c = fxHgCells(D.latest, g.w, g.hg) || []; return [c[0], fxHgTotalCell(D.latest, g.w, g.hg, A.looms), c[1]]; })() : []),
      el('td', {class: 'mvc'}, mcell(A.rpm, b.rpm, tg.rpm, f0, true, tolRpm, tolRpm, {w: g.w, hg: g.hg, m: 'rpm'})),
      el('td', {class: 'mvc'}, effCell(A.eff)),
      el('td', {class: 'mvc'}, mcell(A.erpm, b.erpm, tgtE(g.w, g.hg), f0, true, tolRpm, tolRpm, {w: g.w, hg: g.hg, m: 'erpm'})),
      el('td', {class: 'mvc'}, mcell(A.cfm, cB, tg.cfm, f1, false, tolAir, tolAir, {w: g.w, hg: g.hg, m: 'apk', view: 'cfm', rpm: A.rpm})),
      el('td', {class: 'mvc'}, mcell(A.apk, b.apk, null, f1, false, tolAir, null, {w: g.w, hg: g.hg, m: 'apk'})),
      el('td', {class: 'mvc'}, mcell(A.main_max, ok(b.main_max) ? b.main_max : b.main, MREF === 'tgt' ? pBest(g.w, g.hg) : null, f2, false, tolP, tolP, {w: g.w, hg: g.hg, m: pkey(b)})),   // Round A2: Target = the best for pressure
      el('td', {class: 'num', 'data-sort': String(A.warp)}, f0(A.warp), el('div', {class: 'note', text: f1(A.warpRate) + ' /100k'})),
      el('td', {}, g.hg === 'Unassigned' ? el('span', {class: 'pill muted', text: 'assign a head group'}) : benchTag(bench(g.w, g.hg))),
      el('td', {}, btn)));
    if (open) tb.append(el('tr', {class: 'drillrow'}, el('td', {colspan: hdr.length}, el('div', {class: 'note', style: 'margin-bottom:6px', text: `${g.hg}, ${g.w} cm: each loom against the head group benchmark and target`}), loomTable(g.recs))));
  }
  t.append(tb);
  // 18 Nov 2026: the By picks / By profit per pick switch is gone; Sorting basis above the table does it (Profit, lowest first, by default)
  const sortSeg = money ? el('p', {class: 'note', text: 'Realisation and profit per pick are the day\'s, As sold, from the Realisation tab; the pill is the margin over conversion cost.'}) : null;
  MREF = null;
  const nTq = groups.filter((g) => { const x = tgt(g.w, g.hg); return x && (ok(x.rpm) || ok(x.cfm)); }).length;   // Round A2: pressure targets are not counted
  const qb = (v, text) => el('button', {type: 'button', 'aria-pressed': QREF === v ? 'true' : 'false', text, onclick: () => { QREF = v; try { localStorage.setItem('w2-q-ref', v); } catch (e) {} render(); }});
  s.append(card('Current vs reference', `Against the ${HEAT_REF[QREF]} · CFM references are air per 1,000 picks at the RPM actually run`,
    el('div', {class: 'toolbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Reference'}, qb('bm', 'Benchmark'), qb('best', 'Best'), qb('tgt', `Target (${nTq} set)`))),
    sortSeg, el('div', {class: 'tablebox'}, t)));   // Round A2 (Divyam, 24 Nov 2026): no key note under this table
  // Round A2 (Divyam, 24 Nov 2026): the Trend card moved to Actions (trendSubj0 gives it the same first head group)
  const dr = (D.alerts || []).filter((a) => a.scope === 'Quality' && (W === 'all' || a.msg.includes(W + ' cm')));
  s.append(card('Drift alerts', 'Latest day vs the 7 days before, and week on week once 14 days exist', dr.length ? el('ul', {class: 'alerts'}, dr.map((a) => el('li', {}, el('span', {class: 'pill warn', text: a.level}), el('span', {}, linkify(a.msg))))) : el('div', {class: 'empty', text: 'No drift on this width.'})));
  return s;
}

// Heat grid at the top of Quality: head groups × metrics, each cell the day's % gap from the chosen reference.
// Benchmark / Best / Target switch kept on this device (w2-heat-ref). Efficiency is always against the line, warp breaks
// has a benchmark (its median) only; a cell with no reference is grey and says why. Follows the width and the date chip.
let QREF = 'tgt';   // Quality: Current vs reference (12 Nov 2026)
try { const v = localStorage.getItem('w2-q-ref'); if (['bm', 'best', 'tgt'].includes(v)) QREF = v; } catch (e) {}
let QHM = 'bm';
try { const v = localStorage.getItem('w2-heat-ref'); if (['bm', 'best', 'tgt'].includes(v)) QHM = v; } catch (e) {}
const HEAT_M = [['rpm', 'RPM', 'picks/min', true, f0], ['eff', 'Efficiency', '%', true, f1], ['erpm', 'Eff. RPM', 'RPM × eff', true, f0], ['cfm', 'CFM', 'ft³/min', false, f1],
  ['apk', 'Air', 'ft³/1,000 picks', false, f1], ['main', 'Pressure', 'kgf/cm², max', false, f2], ['warp', 'Warp', 'per 100k picks', false, f2]];
const HEAT_REF = {bm: 'benchmark', best: 'best', tgt: 'target'};
function heatRef(g, m, mode) {
  const {w, hg, A} = g, b = bench(w, hg), t = tgt(w, hg) || {};
  if (m === 'eff') return {v: EFF_BAD(), name: `the ${f0(EFF_BAD())}% line`};
  if (m === 'warp') return mode !== 'bm' ? {none: mode === 'best' ? 'no best (median)' : 'no target'} : b && ok(b.warp_med) ? {v: b.warp_med, name: 'benchmark (median)'} : {none: 'no benchmark'};
  if (mode === 'tgt') {
    const v = m === 'rpm' ? t.rpm : m === 'erpm' ? tgtE(w, hg) : m === 'cfm' ? t.cfm : m === 'main' ? pBest(w, hg) : null;   // Round A2: the pressure target is the best
    return m === 'apk' ? {none: 'no target'} : ok(v) ? {v, name: m === 'erpm' ? `target (${f0(ERPM_TGT * 100)}% of target RPM)` : m === 'main' ? 'best (the pressure target)' : 'target'} : {none: m === 'main' ? 'no best yet' : 'no target'};
  }
  if (!b) return {none: mode === 'best' ? 'no best yet' : 'no benchmark'};
  const mk = m === 'main' ? pkey(b) : m === 'cfm' ? 'apk' : m;
  let v = mode === 'best' ? bestVal(w, hg, mk) : m === 'main' ? (ok(b.main_max) ? b.main_max : b.main) : m === 'cfm' ? b.apk : b[m];
  if (m === 'cfm') v = cfmOf(v, w, hg, A.rpm);
  return ok(v) ? {v, name: m === 'cfm' ? `${HEAT_REF[mode]} at this RPM` : HEAT_REF[mode]} : {none: mode === 'best' ? 'no best yet' : 'no benchmark'};
}
function qualityHeat(groups) {
  const nowOf = (A, m) => m === 'main' ? (A.main_max > 0 ? A.main_max : null) : m === 'warp' ? A.warpRate : A[m];
  const money = typeof fxOn === 'function' && fxOn();   // 12 Nov 2026: loom realisation per loom and in total, first (owner)
  const rows = groups.map((g) => ({hg: g.hg, label: el('div', {}, hgLink(g.hg, g.w, D.latest), el('div', {class: 'note', text: `${g.w} cm · ${g.A.looms} loom${g.A.looms === 1 ? '' : 's'}`})),
    cells: [...(money ? fxHeatReal(D.latest, g.w, g.hg, QHM === 'tgt' ? 'tg' : QHM) : []), ...HEAT_M.map(([m, label, unit, hi, fmt]) => {
      const now = nowOf(g.A, m), R = heatRef(g, m, QHM);
      // Round A2 (Divyam, 24 Nov 2026): pointing at any cell shows the head group's figure and the reference's
      const head = `${g.hg}, ${g.w} cm · ${label}`, cur = `Current: ${ok(now) ? `${fmt(now)} ${unit}` : 'no figure on this day'}`, cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
      if (R.none) return {none: R.none, tip: `${head}\n${cur}\n${cap(HEAT_REF[QHM])}: none (${R.none})`};
      const G = gapPct(now, R.v, hi);
      if (!G) return {none: 'no figure', tip: `${head}\n${cur}\n${cap(R.name)}: ${fmt(R.v)} ${unit}`};
      const txt = `${Math.abs(G.p) < 0.05 ? '±' : G.p > 0 ? '+' : '−'}${Math.abs(G.p).toFixed(1)}%`;
      return {text: txt, level: heatLevel(G.p), tone: Math.abs(G.p) < 0.05 ? 'none' : G.worse ? 'bad' : 'good',
        tip: `${head}\n${cur}\n${cap(R.name)}: ${fmt(R.v)} ${unit} (${txt})\nClick to open the head group.`,
        onClick: () => openHg(g.hg, g.w, D.latest)};
    })]}));
  if (typeof wkPut === 'function') {   // Round J: C1, the first cell of the grid that has a reference
    let c1 = null;
    for (const g of groups) { for (const [m, label, , hi] of HEAT_M) { const now = nowOf(g.A, m), R = heatRef(g, m, QHM); if (!R.none && ok(now) && ok(R.v)) { c1 = {hg: g.hg, what: label, now, ref: R.v, name: R.name, dp: m === 'main' || m === 'warp' ? 2 : m === 'rpm' || m === 'erpm' ? 0 : 1}; break; } } if (c1) break; }
    wkPut('C1', c1);
  }
  const nT = groups.filter((g) => { const t = tgt(g.w, g.hg); return t && (ok(t.rpm) || ok(t.cfm)); }).length;
  const b = (v, text) => el('button', {type: 'button', 'aria-pressed': QHM === v ? 'true' : 'false', text, onclick: () => { QHM = v; try { localStorage.setItem('w2-heat-ref', v); } catch (e) {} render(); }});
  return card('Gap to the reference, by head group', `% of the ${HEAT_REF[QHM]} · ${dfmt(D.latest)} · ${wLabel()}`,
    el('div', {class: 'toolbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Reference for the heat grid'}, b('bm', 'Benchmark'), b('best', 'Best'), b('tgt', `Target (${nT} set)`))),
    rows.length ? heatTable([...(money ? [{label: 'Loom realisation gap', unit: '₹ per loom per day'}, {label: 'Loom realisation gap', unit: '₹ total in the day'}] : []), ...HEAT_M.map(([, label, unit]) => ({label, unit}))], rows, {first: 'Head group'}) : el('div', {class: 'empty', text: 'No head group ran on this width on this day.'}),
    heatKey(`full colour at ${HEAT_FULL}% or more`),
    el('p', {class: 'note', text: `Each cell is the head group's figure for the day (looms that ran at least 60 min) against its ${HEAT_REF[QHM]}, as a % of it: + above, − below. Efficiency is always against the ${f0(EFF_BAD())}% line, and warp breaks against the head group's median rate (it has no best or target). CFM is compared at the RPM the head group ran. Point at a cell for the head group's figure and the reference's; click it to open the head group.${money ? ` Loom realisation gap (As sold) is the rupees above (+, green) or below (−, red) the same loom-days re-worked at the ${HEAT_REF[QHM]} effective RPM; point at it for both figures.` : ''}`}));
}

// ---------------------------------------------------------------- Pressure
// Round F (Divyam, 18 Nov 2026): set point needed = floor + the margin (Config sheet Settings tab, setpoint_margin_kgf,
// kgf/cm²; it replaced the line drop); the compressor's own set point is typed on this tab (COMP_SP); the saving is the
// rule's POWER_PCT % per kgf/cm² only (the adiabatic range is gone). saving(fNow, fNew) = the share of the compressor's
// energy the looms' work saves when the floor drops from fNow to fNew, from wherever the set point fix leaves the
// compressor (pressParts in calc.js); null without a set point or margin, 0 when nothing comes down, never negative.
const pMargin = () => { const v = S().setpoint_margin_kgf; return ok(v) ? v : null; };
const pParts = (fNow, fNew) => pressParts(COMP_SP, fNow, fNew, pMargin(), POWER_PCT);
function saving(fNow, fNew) { return ok(fNow) && ok(fNew) ? pParts(fNow, fNew).looms : null; }
let PSP_EDIT = false;
// Round F: why the Pressure tab's Energy saved and Worth columns show "—", with the next step (null when nothing is missing).
// Owner: Files per day on Data health for a missing compressor reading; everyone else: tell the owner.
// Round F: the tables' Energy saved and Worth count the looms' part only; the tile at the top adds the set point fix.
const pLoomsNote = () => el('p', {class: 'note', text: 'Energy saved and Worth here count the looms\' part only (the floor coming down as looms reach their reference). The Cost per pick saved tile at the top of this tab also counts bringing the compressor down from its set point to what today\'s floor needs, so its saving can be higher.'});
function pGapNote() {
  const own = typeof fxIsOwner === 'function' && fxIsOwner(), tell = own ? null : 'tell the owner';
  if (!ok(COMP_SP)) return el('p', {class: 'note', text: `Energy saved and Worth show "—" until the compressor set point is typed in: ${canEdit() ? 'tap the Compressor set point tile at the top of this tab and type it' : tell}.`});
  if (!ok(pMargin())) return el('p', {class: 'note', text: `Energy saved and Worth show "—" until the set point margin is set: ${own ? 'add setpoint_margin_kgf to the Config sheet Settings tab' : tell}.`});
  if (!compDay(D.latest)) return el('p', {class: 'note', text: `Worth shows "—" until the day's Power (Compressor) reading is in the costing: ${own ? 'see Files per day on Data health' : tell}.`});
  return null;
}
// The compressor set point tile: tap to type the set point (edit targets and admin); everyone else reads it.
function spTile(pp, M, noM) {
  const ed = canEdit() && !!db, has = ok(COMP_SP);
  const need = ok(pp.now) ? `needed ${f2(pp.now)} → ${f2(pp.after)} after the work (floor + ${f2(M)} margin)` : noM;
  const e = typeof spEntry === 'function' ? spEntry(D.latest) : null, since = has && e ? `since ${dfmt(e.from)} · ` : '';   // Round V: the history entry in force
  const unset = SP_HIST && SP_HIST.length && !e ? `none in the set point history on ${dfmt(D.latest)}: ` : 'not set yet: ';
  // Round W (20 Nov 2026): every role is told when the history could not be read (the tile then shows the last set point saved)
  const noHist = db && SP_HIST == null ? `the set point history could not be read, so this is the last set point saved: press Refresh (the round arrow); if it stays, ${typeof fxIsOwner === 'function' && fxIsOwner() ? 'see Backup age on Data health: if it cannot be read either, the database is not answering' : 'tell the owner'} · ` : '';
  const note = noHist + since + (has ? '' : (ed ? unset + 'tap to type it · ' : unset + 'tell the owner · ')) + need + (has && ed ? ' · tap to change' : '');
  const k = el('div', {class: 'kpi' + (ed ? ' tap' : ''), role: ed ? 'button' : null, tabindex: ed ? '0' : null, 'aria-label': ed ? 'Compressor set point: tap to change' : null},
    el('div', {class: 'label', text: 'Compressor set point'}), el('div', {class: 'big'}, has ? f2(COMP_SP) : '—', el('small', {text: 'kgf/cm²'})), el('div', {class: 'note', text: note}));
  if (ed) tapTip(k, PSP_EDIT ? 'Tap again to close the set point box' : 'Tap to type the compressor set point and the day it took effect', false);   // Round A1: the hover note
  if (ed) { const go = () => { PSP_EDIT = !PSP_EDIT; render(); }; k.addEventListener('click', go); k.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); }
  return el('div', {}, k);
}
function spEditor() {
  if (!PSP_EDIT || !canEdit() || !db) return null;
  const inp = el('input', {type: 'number', step: '0.05', min: '1', max: '15', value: ok(COMP_SP) ? String(COMP_SP) : '', 'aria-label': 'Compressor set point, kgf/cm²', style: 'width:100px'});
  // Round V (Divyam, 20 Nov 2026): each set point carries the day it took effect (the day shown to begin with, never after today)
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const dt = el('input', {type: 'date', class: 'rngin', max: today, value: D.latest <= today ? D.latest : today, 'aria-label': 'Set point effective from'});
  const msg = el('span', {class: 'meta'});
  const btn = el('button', {class: 'primary', type: 'button', text: 'Save', onclick: async () => {
    const v = parseFloat(inp.value); if (!(v >= 1 && v <= 15)) { msg.className = 'err'; msg.textContent = 'Enter the set point in kgf/cm², from 1 to 15.'; return; }
    const f = dt.value; if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || f > today) { msg.className = 'err'; msg.textContent = 'Pick the day the set point took effect: today or earlier.'; return; }
    btn.disabled = true; msg.className = 'meta'; msg.textContent = 'Saving…';
    // the targets row keeps the latest set point (the Config sheet's copy); the history keeps every change with its date
    const latest = !(SP_HIST || []).some((h) => h.from > f);
    // one reload after both writes; a failed write reloads nothing, so its message stays on the box
    try { STATE_HOLD += 1;
      try { if (latest) await db.collection('targets').doc('compsp__kgf').set({width: 'all', hg: 'all', main: v}); await saveSpHist(f, v); } finally { STATE_HOLD -= 1; }
      await loadState(); PSP_EDIT = false; render(); }
    catch (e) { msg.className = 'err'; msg.textContent = saveFail(e, 'save', 'Save'); btn.disabled = false; }
  }});
  const H = (SP_HIST || []).slice().sort((a, b) => a.from.localeCompare(b.from));
  const hist = SP_HIST == null ? `The set point history could not be read, so the tile shows the last set point saved. Press Refresh (the round arrow) to try again; if it stays, ${typeof fxIsOwner === 'function' && fxIsOwner() ? 'see Backup age on Data health: if it cannot be read either, the database is not answering' : 'tell the owner'}.`
    : H.length ? 'Set point history: ' + H.map((h) => `${f2(h.kgf)} kgf/cm² from ${dfmt(h.from)}`).join(' · ') + '.' : 'No set point history yet: the first set point you save starts it.';
  return el('div', {class: 'toolbar'}, el('label', {text: 'Compressor set point, as set on the compressor'}), inp, el('span', {text: 'kgf/cm²'}),
    el('label', {text: 'Effective from'}), dt, btn,
    el('button', {class: 'ghost', type: 'button', text: 'Cancel', onclick: () => { PSP_EDIT = false; render(); }}), msg,
    el('p', {class: 'note', text: `Saved for everyone at once, from the day picked: a day uses the set point in force on it. The Pressure tab and the Target cost per pick tile on Actions use it straight away, and the energy rate on the CFM tab is worked out again from that day. To correct a set point, type the right one for the same day. ${hist}`}));
}
// Round A2 (Divyam, 24 Nov 2026): for pressure the target is really the best. A head group's best main pressure (its best
// loom-day's highest main pressure, the Best reference) stands wherever a pressure target was used (Target cost per pick
// step 2, Work on these first, the Quality grid on Target); typed pressure targets stay saved but are not used or shown.
function pBest(w, hg) { if (!hg || hg === 'Unassigned') return null; const v = bestVal(w, hg, pkey(bench(w, hg))); return ok(v) ? v : null; }
function pressLooms() {
  // every loom that ran ≥60 min in a shift on the latest day, both widths (one compressor)
  return (D.pressure.looms || []).map((l) => {
    const b = bench(l.width, l.hg) || {};
    const bm = ok(b.main_max) ? b.main_max : (ok(b.main) ? b.main : null);
    const best = pBest(l.width, l.hg);
    // Round A2 (Divyam, 24 Nov 2026): no pressure target on this tab (the switch is Benchmark / Best); tg stays empty
    return {...l, bm, best, tg: null, ref: refOf(PMODE === 'tgt' ? 'best' : PMODE, bm, best, null)};
  });
}
// Reference for the "if every loom ran at…" figures: benchmark, best loom-day or target (falling back to the benchmark where unset).
function refOf(mode, bm, best, tg) { return mode === 'tgt' ? (ok(tg) ? tg : bm) : mode === 'best' ? (ok(best) ? best : bm) : bm; }
const REF_NOTE = {bm: 'Head group benchmark', best: 'Best loom-day where there is one, benchmark otherwise', tgt: 'Target where you set one, benchmark otherwise'};
function modeSeg(cur, set, nT, label, short, noT) {   // noT (Round A2, Pressure): Benchmark and Best only
  const b = (v, text) => el('button', {type: 'button', 'aria-pressed': cur === v ? 'true' : 'false', text, onclick: () => { set(v); render(); }});
  return el('div', {class: 'seg', role: 'group', 'aria-label': label}, b('bm', short ? 'Benchmark' : 'Bring looms to benchmark'), b('best', short ? 'Best' : 'To best'), noT ? null : b('tgt', `${short ? 'Target' : 'To target'} (${nT} set)`));
}
// Best marker in the bar charts: a filled circle (benchmark is a tick, target a hollow diamond).
function bestDot(svg, cx, cy) { svg.append(svgEl('circle', {cx, cy, r: 5.5, fill: css('--good'), stroke: css('--panel'), 'stroke-width': 1.5})); }
const lowered = (l) => ok(l.ref) ? Math.min(l.main, l.ref) : l.main;
// Drawn at the width it is shown at (fitCharts redraws it), with a narrower label column on a phone.
function pressureChart(rows, floorNow, floorNew, Wd0) {
  const Wd = Math.max(300, Wd0 || estW()), narrow = Wd < 520, rowH = 24, m = {l: narrow ? 122 : 210, r: narrow ? 44 : 60, t: 34, b: 40};
  const H = m.t + m.b + rows.length * rowH;
  const xmax = Math.ceil(Math.max(5, ...rows.map((r) => Math.max(r.main, r.bm || 0, r.best || 0, r.tg || 0))) * 2) / 2 + 0.25;
  const x = (v) => m.l + (Wd - m.l - m.r) * v / xmax;
  const svg = svgEl('svg', {viewBox: `0 0 ${Wd} ${H}`, width: Wd, height: H, style: 'display:block;max-width:none', role: 'img', 'aria-label': 'Main pressure per loom: current against benchmark, best and target'});
  svg.__w = Wd; svg.__min = 300; svg.__redraw = (w) => pressureChart(rows, floorNow, floorNew, w);
  const lchars = Math.floor((m.l - 14) / 6.6);
  const muted = css('--muted'), line = css('--line'), ink = css('--barline'), bar = css('--bar'), bad = css('--bad');
  for (let v = 0; v <= xmax + 1e-9; v += 0.5) {
    svg.append(svgEl('line', {x1: x(v), x2: x(v), y1: m.t - 6, y2: H - m.b, stroke: line}));
    if (Math.abs(v - Math.round(v)) < 1e-9) { const t = svgEl('text', {x: x(v), y: H - m.b + 16, 'text-anchor': 'middle', 'font-size': 11.5, fill: muted}); t.textContent = v.toFixed(0); svg.append(t); }
  }
  const ax = svgEl('text', {x: m.l + (Wd - m.l - m.r) / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 12, fill: muted}); ax.textContent = narrow ? 'Main pressure, kgf/cm², day max' : 'Main nozzle pressure, kgf/cm² (highest the loom ran at in the day)'; svg.append(ax);
  rows.forEach((r, i) => {
    const y = m.t + i * rowH;
    // a row is a loom or, with r.label / r.open / r.tip, a head group (12 Nov 2026)
    const lt = svgEl('text', {x: m.l - 10, y: y + 15, 'text-anchor': 'end', 'font-size': 12, fill: ink, class: 'lkt', 'data-loom': r.label ? null : r.loom}); lt.textContent = clip(r.label || `${r.loom} · ${r.hg} · ${r.width}`, lchars); lt.addEventListener('click', r.open || (() => openLoom(r.loom, D.latest))); tip(lt, r.tip || `Loom ${r.loom} · ${r.hg} · ${r.width} cm`); svg.append(lt);
    svg.append(svgEl('rect', {x: x(0), y: y + 5, width: Math.max(1, x(r.main) - x(0)), height: 13, rx: 2, fill: bar}));
    if (ok(r.bm)) svg.append(svgEl('rect', {x: x(r.bm) - 1.5, y: y + 1, width: 3, height: 21, fill: ink}));
    if (ok(r.best)) bestDot(svg, x(r.best), y + 11.5);
    if (ok(r.tg)) { const cx = x(r.tg), cy = y + 11.5; svg.append(svgEl('path', {d: `M${cx} ${cy - 7}L${cx + 7} ${cy}L${cx} ${cy + 7}L${cx - 7} ${cy}Z`, fill: css('--panel'), stroke: ink, 'stroke-width': 2})); }
    const vt = svgEl('text', {x: x(Math.max(r.main, r.bm || 0, r.best || 0, r.tg || 0)) + 10, y: y + 15, 'font-size': 11.5, fill: ink, 'font-family': 'IBM Plex Mono, monospace'}); vt.textContent = r.main.toFixed(2); svg.append(vt);
  });
  const vline = (v, label, dash, color, row) => {
    if (!ok(v)) return;
    svg.append(svgEl('line', {x1: x(v), x2: x(v), y1: m.t - 6, y2: H - m.b, stroke: color, 'stroke-width': 1.6, 'stroke-dasharray': dash}));
    const t = svgEl('text', {x: x(v), y: row, 'text-anchor': v > xmax * 0.75 ? 'end' : 'start', 'font-size': 11.5, 'font-weight': 600, fill: color}); t.textContent = label; svg.append(t);
  };
  vline(floorNow, ` Floor now ${f2(floorNow)} `, '2 3', bad, 12);
  if (ok(floorNew) && floorNew < floorNow - 1e-9) vline(floorNew, ` Floor after the work ${f2(floorNew)} `, '7 4', ink, 26);
  return svg;
}
function legendShape(kind) {
  const s = svgEl('svg', {width: 22, height: 14, viewBox: '0 0 22 14', 'aria-hidden': 'true'});
  const ink = css('--barline');
  if (kind === 'bar') s.append(svgEl('rect', {x: 1, y: 3, width: 20, height: 8, rx: 2, fill: css('--bar')}));
  if (kind === 'tick') s.append(svgEl('rect', {x: 9.5, y: 0, width: 3, height: 14, fill: ink}));
  if (kind === 'circle') s.append(svgEl('circle', {cx: 11, cy: 7, r: 5.5, fill: css('--good'), stroke: css('--panel'), 'stroke-width': 1.5}));
  if (kind === 'diamond') s.append(svgEl('path', {d: 'M11 1L17 7L11 13L5 7Z', fill: css('--panel'), stroke: ink, 'stroke-width': 2}));
  if (kind === 'dash') s.append(svgEl('line', {x1: 11, x2: 11, y1: 0, y2: 14, stroke: ink, 'stroke-width': 1.6, 'stroke-dasharray': '7 4'}));
  if (kind === 'dot') s.append(svgEl('line', {x1: 11, x2: 11, y1: 0, y2: 14, stroke: css('--bad'), 'stroke-width': 1.6, 'stroke-dasharray': '2 3'}));
  return s;
}
// Width switch for the two by-loom cards on the Pressure tab. It only picks which looms are listed; the floor, the savings
// and every other card on the page always cover all 72 looms.
function pressWidthSeg() {
  const b = (v, t) => el('button', {type: 'button', 'aria-pressed': PW === v ? 'true' : 'false', text: t, onclick: () => { PW = v; render(); }});
  return el('div', {class: 'seg', role: 'group', 'aria-label': 'Looms shown by width'}, b('190', '190'), b('280', '280'), b('all', 'All'));
}
function pagePressure() {
  const s = el('section', {class: 'page', id: 'pressure'});
  const P = D.pressure; const fl = (P.floor || []).slice(-1)[0];
  const M = pMargin();
  // Round A2 (Divyam, 24 Nov 2026): no lead note; no pressure target (Benchmark / Best); the reference and what it is worth in one card
  s.append(el('div', {}, el('h2', {text: `Main pressure, all 72 looms, ${dfmt(D.latest)}`})));
  const looms = pressLooms();
  const floorNow = looms.length ? Math.max(...looms.map((l) => l.main)) : null;
  const floorNew = looms.length ? Math.max(...looms.map(lowered)) : null;
  const pp = looms.length ? pParts(floorNow, floorNew) : {now: null, after: null, fix: null, looms: null, total: null};
  const holders = looms.filter((l) => Math.abs(lowered(l) - floorNew) < 1e-9);
  const why = (l) => !ok(l.ref) ? 'has no benchmark yet' : l.main <= l.ref + 1e-9 ? 'is already at or below its reference' : 'is at its reference';
  const holdNote = holders.length ? 'Held by ' + holders.slice(0, 3).map((l) => `loom ${l.loom} (${l.hg}), which ${why(l)}`).join('; ') + (holders.length > 3 ? ` and ${holders.length - 3} more` : '') : '';
  if (PMODE === 'tgt') PMODE = 'best';
  const mode = modeSeg(PMODE, (v) => { PMODE = v; }, 0, 'Reference pressure', false, true);
  const owner = typeof fxIsOwner === 'function' && fxIsOwner();
  const noM = owner ? 'no margin row: add setpoint_margin_kgf to the Config sheet Settings tab' : 'no margin set: tell the owner';
  if (typeof wkPut === 'function') {   // Round J: the four tiles, for their Working
    wkPut('G1:now', looms.length ? {floor: floorNow, loom: fl ? fl.loom : (looms.find((l) => l.main === floorNow) || {}).loom} : null);
    wkPut('G1:after', looms.length ? {floor: floorNew, held: holders.length ? holders[0].loom : null} : null);
    wkPut('G2', looms.length ? {now: floorNow, after: floorNew, m: M} : null);
    wkPut('G3', looms.length ? {sp: COMP_SP, now: floorNow, after: floorNew, m: M, rule: POWER_PCT} : null);
  }
  const worth = pressWorth(pp);
  const kp = (label, big, unit, note) => el('div', {}, el('div', {class: 'kpi'}, el('div', {class: 'label', text: label}), el('div', {class: 'big'}, ...big, el('small', {text: unit})), note ? el('div', {class: 'note', text: note}) : null));
  const sumBox = el('div', {class: 'kpis'},
    kp('Floor now', [f2(floorNow)], 'kgf/cm²', fl ? `loom ${fl.loom}, ${fl.hg}` : ''),
    kp('Floor after the work', [f2(floorNew)], 'kgf/cm²', holdNote),
    spTile(pp, M, noM),
    ...worth.tiles);
  s.append(card('If every loom ran at its reference pressure', (PMODE === 'bm' ? 'Head group benchmark (10th percentile)' : REF_NOTE.best) + ' · what lowering the pressure is worth', el('div', {class: 'toolbar'}, mode), sumBox, spEditor(), worth.gap));
  s.append(floorLadderCard(looms, floorNew));
  const erc = erDevCard(); if (erc) s.append(erc);   // Round V: the owner's kWh against the energy rate's fit

  // chart: current vs benchmark and target, looms sorted by current pressure
  const inPW = (w) => PW === 'all' || String(w) === PW, pwNote = PW === 'all' ? '' : ` · ${PW} cm only, floor lines still cover all ${looms.length}`;
  const sorted = looms.filter((l) => inPW(l.width)).sort((a, b) => b.main - a.main || a.loom - b.loom);
  // 12 Nov 2026: Head-group-wise = each head group's highest main pressure now against its benchmark, best and target
  const phg = bv('pressure') === 'hg';
  const pHg = () => { const by = new Map(); for (const l of sorted) { const k = key(l.width, l.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(l); }
    return [...by.values()].map((L) => { const l0 = L.reduce((a, b) => b.main > a.main ? b : a); return {...l0, label: `${l0.hg} · ${l0.width}`, open: () => openHg(l0.hg, l0.width, D.latest), tip: `${l0.hg}, ${l0.width} cm: highest ${f2(l0.main)} kgf/cm² on loom ${l0.loom} · ${L.length} loom${L.length === 1 ? '' : 's'}`}; })
      .sort((a, b) => b.main - a.main || a.label.localeCompare(b.label)); };
  const pRows = phg ? pHg() : sorted, pLim = phg || PALL ? 0 : 25;   // 18 Nov 2026: the basis ranks every loom, the first 25 are drawn
  s.append(card(`Current vs benchmark and best, ${phg ? 'by head group' : 'by loom'}`, (phg ? `${pRows.length} head groups` : PALL ? `All ${sorted.length} looms` : `First 25 of ${sorted.length} looms`) + ' in the Sorting basis order' + pwNote,
    el('div', {class: 'toolbar'}, bvSeg('pressure'), pressWidthSeg()),
    sortableChart('pressure', pRows, [{v: 'name', label: phg ? 'Head group' : 'Loom', get: (r) => r.label || r.loom}, {v: 'now', label: 'Now', get: (r) => r.main}, {v: 'ref', label: 'Reference', get: (r) => ok(r.ref) ? r.ref : null}, {v: 'gap', label: 'Excess', sub: 'over reference', get: (r) => ok(r.ref) ? r.main - r.ref : null}],
      (R) => el('div', {class: 'tablebox'}, pressureChart(pLim ? R.slice(0, pLim) : R, floorNow, floorNew)), {b: 'gap', d: 'd'}),
    el('div', {class: 'legend'}, el('span', {class: 'lg'}, legendShape('bar'), 'Current'), el('span', {class: 'lg'}, legendShape('tick'), 'Benchmark'),
      el('span', {class: 'lg'}, legendShape('circle'), 'Best'), el('span', {class: 'lg'}, legendShape('dot'), 'Floor now'), el('span', {class: 'lg'}, legendShape('dash'), 'Floor after the work')),
    phg ? null : el('button', {class: 'link', type: 'button', text: PALL ? 'Show the first 25' : `Show all ${sorted.length} looms`, onclick: () => { PALL = !PALL; render(); }})));

  // loom-wise / quality-wise comparison
  const view = el('div', {class: 'seg', role: 'group', 'aria-label': 'View'},
    el('button', {type: 'button', 'aria-pressed': PVIEW === 'loom' ? 'true' : 'false', text: 'Loom-wise', onclick: () => { PVIEW = 'loom'; render(); }}),
    el('button', {type: 'button', 'aria-pressed': PVIEW === 'quality' ? 'true' : 'false', text: 'Quality-wise', onclick: () => { PVIEW = 'quality'; render(); }}));
  let body;
  if (PVIEW === 'loom') {
    body = table(['Loom', 'Head group', ['Now', 'kgf/cm²'], ['Reference', `kgf/cm², ${REF_NAME[PMODE]}`], ['Excess', 'kgf/cm² over reference'], 'Status'],
      sorted.map((l) => {
        const ex = ok(l.ref) ? l.main - l.ref : null;
        return [loomLink(l.loom, D.latest), el('span', {}, hgLink(l.hg, l.width, D.latest), el('div', {class: 'note', text: `${l.width} cm ${l.type}`})), f2(l.main), refCell(PMODE, l.bm, l.best, l.tg, f2, () => bmBtn(f2(l.bm), l.width, l.hg, pkey(bench(l.width, l.hg))), () => bmBtn(f2(l.best), l.width, l.hg, pkey(bench(l.width, l.hg)), {kind: 'best'})), ok(ex) ? (ex > 0 ? '+' : '') + f2(ex) : '—',
          Math.abs(l.main - floorNow) < 1e-9 ? el('span', {class: 'pill bad', text: 'sets floor'}) : ok(ex) && ex > PRESS_TOL ? el('span', {class: 'pill warn', text: 'above reference'}) : ''];
      }), [2, 3, 4]);
  } else {
    const by = new Map();
    for (const l of looms) { const k = key(l.width, l.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(l); }
    const rows = [...by.values()].filter((L) => inPW(L[0].width)).map((L) => {
      const l0 = L[0]; const hi = Math.max(...L.map((l) => l.main)); const avg = L.reduce((a, l) => a + l.main, 0) / L.length;
      const k = key(l0.width, l0.hg);
      const only = Math.max(...looms.map((l) => key(l.width, l.hg) === k ? lowered(l) : l.main));
      const r1 = saving(floorNow, only);
      return {l0, L, hi, avg, only, r1};
    }).sort((a, b) => b.hi - a.hi);
    if (typeof wkPut === 'function') wkPut('G5', rows[0] ? {hg: rows[0].l0.hg, floor: rows[0].only} : null);   // Round J
    body = table(['Head group', ['Looms', 'ran'], ['Highest now', 'kgf/cm²'], ['Average now', 'kgf/cm²'], ['Reference', `kgf/cm², ${REF_NAME[PMODE]}`], ['Floor if only this quality is fixed', 'kgf/cm²'], ['Energy saved', '% of compressor, from the looms'], ['Worth', '₹ a day · paise per pick, from the looms']],
      rows.map((r) => [el('span', {}, hgLink(r.l0.hg, r.l0.width, D.latest), el('div', {class: 'note', text: r.l0.width + ' cm'})), r.L.length, f2(r.hi), f2(r.avg), refCell(PMODE, r.l0.bm, r.l0.best, r.l0.tg, f2, () => bmBtn(f2(r.l0.bm), r.l0.width, r.l0.hg, pkey(bench(r.l0.width, r.l0.hg))), () => bmBtn(f2(r.l0.best), r.l0.width, r.l0.hg, pkey(bench(r.l0.width, r.l0.hg)), {kind: 'best'})),
        r.only < floorNow - 1e-9 ? el('b', {text: f2(r.only)}) : f2(r.only), !ok(r.r1) ? '—' : r.r1 > 0 ? f1(r.r1 * 100) : '0', !ok(r.r1) ? '—' : r.r1 > 0 ? moneyOne(r.r1) : '0']), [1, 2, 3, 4, 5, 6, 7]);
  }
  s.append(card('Reference vs running pressure', (PVIEW === 'quality' ? 'The floor only drops when every quality at the top comes down, so most single-quality rows show no saving on their own.' : 'Highest pressure each loom ran at in the day') + pwNote,
    el('div', {class: 'toolbar'}, view, pressWidthSeg(), modeSeg(PMODE, (v) => { PMODE = v; }, 0, 'Reference pressure', true, true)), body, PVIEW === 'quality' ? pLoomsNote() : null, PVIEW === 'quality' ? pGapNote() : null));

  const ps = looms.slice().sort((a, b) => b.main - a.main || a.loom - b.loom)[0];
  s.append(trendCard('pressure', ps ? (PVIEW === 'loom' ? {kind: 'loom', loom: ps.loom} : {kind: 'hg', w: String(ps.width), hg: ps.hg}) : null));
  s.append(el('div', {class: 'split'},
    card('Floor by day', 'Highest main pressure per day and shift, kgf/cm²',
      table(['Date', ['Floor', 'kgf/cm²'], ['Shift A', 'kgf/cm²'], ['Shift B', 'kgf/cm²'], 'Set by'], (P.floor || []).slice().reverse().slice(0, 14).map((f) => [dfmt(f.date), f2(f.floor), f2(f.A), f2(f.B), el('span', {}, loomLink(f.loom, f.date, 'Loom ' + f.loom), ' · ', hgLink(f.hg, (D.machine[f.loom] || {}).width, f.date))]), [1, 2, 3])),
    card('Head groups holding the floor up', 'At the top on at least half of the last 14 days. Drop decisions are yours.',
      (P.setters || []).length ? table(['Head group', 'Days at top', ['Floor → without it', 'kgf/cm²'], ['Saving', '% of compressor, from the looms'], ['Worth', '₹ a day · paise per pick, from the looms'], ['Share of picks', '%'], 'Recommendation'],
        P.setters.map((x) => [el('span', {}, hgLink(x.hg, null, D.latest), el('div', {class: 'note'}, 'Looms ', (x.looms || []).flatMap((l, i) => [i ? ', ' : '', loomLink(l.loom, D.latest)]))), `${x.days}/${x.of}`, `${f2(x.floor)} → ${f2(x.without)}`, setPct(x), setRs(x), f1(x.share),
          el('div', {}, el('span', {class: 'pill warn', text: x.rec}), el('p', {class: 'why', text: x.why}))]), [3, 4, 5])
        : el('div', {class: 'empty', text: 'None yet.'}), (P.setters || []).length ? pLoomsNote() : null, (P.setters || []).length ? pGapNote() : null)));
  return s;
}

// The floor ladder: the loom setting the floor is brought down to its reference, then the next one, five times over,
// showing how far the floor (and so the compressor set point) drops at each step. Uses the reference switched above.
function floorLadderCard(looms, floorNew) {
  const F = floorLadder(looms.map((l) => ({loom: l.loom, hg: l.hg, width: l.width, main: l.main, ref: l.ref})), 5);
  if (typeof wkPut === 'function') { const st = F.steps && F.steps[0]; wkPut('G4', st ? {loom: st.loom, from: st.from, to: st.to, before: st.before, floor: st.floor, drop: st.drop} : null); }   // Round J
  if (!ok(F.now)) return card('Floor ladder', null, el('div', {class: 'empty', text: 'No loom pressure for this day.'}));
  const items = [{label: 'Now', v: F.now, total: true, tip: `Floor now ${f2(F.now)} kgf/cm²`},
    ...F.steps.map((st, i) => ({label: `${i + 1}. Loom ${st.loom}`, v: -st.drop, tip: `Step ${i + 1}: loom ${st.loom} (${st.hg}) from ${f2(st.from)} to ${f2(st.to)}; floor ${f2(st.before)} → ${f2(st.floor)}`})),
    {label: F.steps.length ? `After ${F.steps.length}` : 'Now', v: F.after, total: true, tip: `Floor after ${F.steps.length} step${F.steps.length === 1 ? '' : 's'}: ${f2(F.after)} kgf/cm²`}];
  const why = F.held ? `Loom ${F.held.loom} (${F.held.hg}) holds the floor at ${f2(F.held.main)}: it has ${F.held.why === 'no reference' ? 'no reference yet' : 'come down to its reference already, or runs below it'}.` : '';
  const rows = F.steps.map((st, i) => { const a = saving(F.now, st.floor);
    return [el('span', {}, `${i + 1}. `, loomLink(st.loom, D.latest, 'Loom ' + st.loom)), el('span', {}, hgLink(st.hg, st.width, D.latest), el('div', {class: 'note', text: st.width + ' cm'})), `${f2(st.from)} → ${f2(st.to)}`, f2(st.floor), st.drop > 1e-9 ? '−' + f2(st.drop) : '0', !ok(a) ? '—' : a > 0 ? f1(a * 100) : '0', !ok(a) ? '—' : a > 0 ? moneyOne(a) : '0']; });
  return card('Floor ladder', `The ${F.steps.length || 'no'} loom${F.steps.length === 1 ? '' : 's'} to fix first, in order · ${PMODE === 'bm' ? 'to benchmark' : 'to best'} · kgf/cm²`,
    F.steps.length ? waterfall(items, 'Floor pressure after each loom is brought down to its reference', null, {unit: 'kgf/cm²', dec: 2}) : el('p', {class: 'empty', text: why || 'The floor cannot come down.'}),
    F.steps.length ? el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--muted-2);opacity:.75'}), 'floor'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--good)'}), 'drop from fixing that loom')) : null,
    F.steps.length ? el('div', {class: 'nosort'}, table(['Step and loom', 'Head group', ['Loom pressure', 'now → reference'], ['Floor after', 'kgf/cm²'], ['Drop', 'kgf/cm²'], ['Energy saved so far', '% of compressor, from the looms'], ['Worth so far', '₹ a day · paise per pick, from the looms']], rows, [2, 3, 4, 5, 6])) : null,   // steps build on each other: not sortable
    F.steps.length ? pLoomsNote() : null,
    F.steps.length ? pGapNote() : null,
    el('p', {class: 'note', text: `Each step brings the loom that sets the floor down to its reference and works the floor out again; a step that drops 0 means another loom sat at the same pressure. ${why} With every loom at its reference the floor would be ${f2(floorNew)}. The reference follows the switch at the top.`}));
}

// ---------------------------------------------------------------- CFM
// Total air is the sum over looms, so every loom brought down to its reference cuts demand directly (no floor, unlike pressure).
// Reference CFM for a loom-day = head group benchmark air per 1,000 picks × that loom's RPM ÷ 1,000, or your target CFM in target mode.
function cfmRefs(x) {
  const b = bench(x.width, x.hg) || {}, t = tgt(x.width, x.hg) || {};
  const bm = x.hg !== 'Unassigned' ? cfmOf(b.apk, x.width, x.hg, x.rpm) : null;
  const tg = x.hg !== 'Unassigned' && ok(t.cfm) ? t.cfm : null;
  const best = x.hg !== 'Unassigned' ? cfmOf(bestVal(x.width, x.hg, 'apk'), x.width, x.hg, x.rpm) : null;
  const ref = refOf(CMODE, bm, best, tg);
  const after = ok(ref) ? Math.min(x.cfm, ref) : x.cfm;
  return {bm, best, tg, ref, after, ex: x.cfm - after};
}
function cfmDay(date) {
  // every loom-day record with run time (same base as the Actions tab's total CFM), current benchmarks
  const L = (D.loomdays || []).filter((x) => x.date === date && inW(x.width) && x.run > 0);
  let now = 0, after = 0;
  for (const x of L) { const r = cfmRefs(x); now += x.cfm * x.run; after += r.after * x.run; }
  return L.length ? {now: now / 1440, after: after / 1440, air: now, n: new Set(L.map((x) => x.loom)).size, cpk: cPicks(L)} : null;
}
// Horizontal bar per loom: current value, benchmark tick, best dot, target diamond. rows: {x (loom-day), v, bm, best, tg, ex}
// o: {step, labelEvery, axis, aria, dec, exSign, fmt, tick}
function refChart(rows, o, Wd0) {
  const Wd = Math.max(300, Wd0 || estW()), narrow = Wd < 520, rowH = 24, m = {l: narrow ? 122 : 210, r: narrow ? 64 : 70, t: 14, b: 40};
  const H = m.t + m.b + rows.length * rowH;
  const top = Math.max(o.step * 2, ...rows.map((r) => Math.max(r.v || 0, r.bm || 0, r.best || 0, r.tg || 0)));
  const xmax = Math.ceil(top / o.labelEvery) * o.labelEvery + o.step;
  const x = (v) => m.l + (Wd - m.l - m.r) * v / xmax;
  const svg = svgEl('svg', {viewBox: `0 0 ${Wd} ${H}`, width: Wd, height: H, style: 'display:block;max-width:none', role: 'img', 'aria-label': o.aria});
  svg.__w = Wd; svg.__min = 300; svg.__redraw = (w) => refChart(rows, o, w);
  const lchars = Math.floor((m.l - 14) / 6.6);
  const muted = css('--muted'), line = css('--line'), ink = css('--barline'), bar = css('--bar');
  const skip = Math.max(1, Math.ceil(36 / ((Wd - m.l - m.r) * o.labelEvery / xmax)));   // labels at least 36 px apart
  for (let v = 0; v <= xmax + 1e-9; v += o.step) {
    svg.append(svgEl('line', {x1: x(v), x2: x(v), y1: m.t - 6, y2: H - m.b, stroke: line}));
    if (Math.abs(v / o.labelEvery - Math.round(v / o.labelEvery)) < 1e-9 && Math.round(v / o.labelEvery) % skip === 0) { const t = svgEl('text', {x: x(v), y: H - m.b + 16, 'text-anchor': 'middle', 'font-size': 11.5, fill: muted}); t.textContent = o.tick ? o.tick(v) : v; svg.append(t); }
  }
  const ax = svgEl('text', {x: m.l + (Wd - m.l - m.r) / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 12, fill: muted}); ax.textContent = narrow && o.axisShort ? o.axisShort : o.axis; svg.append(ax);
  rows.forEach((r, i) => {
    const y = m.t + i * rowH;
    // a row is a loom (r.x) or, with r.label / r.open / r.tip, anything else (a head group on the CFM tab)
    const open = r.open || (() => openLoom(r.x.loom, r.x.date)), tipT = r.tip || `Loom ${r.x.loom} · ${r.x.hg} · ${r.x.width} cm`;
    const lt = svgEl('text', {x: m.l - 10, y: y + 15, 'text-anchor': 'end', 'font-size': 12, fill: ink, class: 'lkt', 'data-loom': r.x ? r.x.loom : null}); lt.textContent = clip(r.label || `${r.x.loom} · ${r.x.hg} · ${r.x.width}`, lchars); lt.addEventListener('click', open); tip(lt, tipT); svg.append(lt);
    const br = svgEl('rect', {x: x(0), y: y + 5, width: Math.max(1, x(r.v || 0) - x(0)), height: 13, rx: 2, fill: bar, style: r.open ? 'cursor:pointer' : null});
    if (r.open) { br.addEventListener('click', open); tip(br, tipT); }
    svg.append(br);
    if (ok(r.bm)) svg.append(svgEl('rect', {x: x(r.bm) - 1.5, y: y + 1, width: 3, height: 21, fill: ink}));
    if (ok(r.best)) bestDot(svg, x(r.best), y + 11.5);
    if (ok(r.tg)) { const cx = x(r.tg), cy = y + 11.5; svg.append(svgEl('path', {d: `M${cx} ${cy - 7}L${cx + 7} ${cy}L${cx} ${cy + 7}L${cx - 7} ${cy}Z`, fill: css('--panel'), stroke: ink, 'stroke-width': 2})); }
    const vt = svgEl('text', {x: x(Math.max(r.v || 0, r.bm || 0, r.best || 0, r.tg || 0)) + 10, y: y + 15, 'font-size': 11.5, fill: ink, 'font-family': 'IBM Plex Mono, monospace'});
    const nf = o.fmt || ((v) => v.toFixed(o.dec));   // o.fmt / o.tick: optional formatters (rupees on the Effective RPM tab, 12 Nov 2026)
    vt.textContent = nf(r.v || 0) + (r.ex > 0.05 ? `  ${o.exSign}${nf(r.ex)}` : ''); svg.append(vt);
  });
  return svg;
}
// "Reference vs running" tables (12 Nov 2026): one Reference column that follows the tab's Benchmark / Best / Target switch,
// with the benchmark standing in (and saying so) where there is no best or no target. bmEl / bestEl: clickable versions.
function refCell(mode, bm, best, tg, fmt, bmEl, bestEl) {
  if (mode === 'tgt' && ok(tg)) return fmt(tg);
  if (mode === 'best' && ok(best)) return bestEl ? bestEl() : fmt(best);
  if (!ok(bm)) return '—';
  const v = bmEl ? bmEl() : fmt(bm);
  return mode === 'bm' ? v : el('span', {}, v, el('div', {class: 'note', text: mode === 'tgt' ? 'no target: benchmark' : 'no best: benchmark'}));
}
const REF_NAME = {bm: 'benchmark', best: 'best', tgt: 'target'};
// refChart with a sort bar (12 Nov 2026): name, now, reference, and the gap to it. 18 Nov 2026 (Divyam): where less is
// worse (effective RPM, realisation; o.exSign '−') the gap is "Shortfall" (below reference) = reference − now, else "Excess
// over reference" = now − reference; signed, so a loom on the good side ranks after every loom on the bad side (the gap
// used to stop at 0, so every loom past its reference tied). Default: the gap, largest first. o.limit: rows drawn.
function refBars(rows, o) {
  const name = (r) => r.label || (r.x ? r.x.loom : '');
  const ref = (r) => ok(r.ref) ? r.ref : ok(r.tg) ? r.tg : ok(r.best) ? r.best : ok(r.bm) ? r.bm : null;
  const short = o.exSign === '−';
  return sortableChart(o.sortId || o.aria, rows, [{v: 'name', label: r0(rows) ? 'Head group' : 'Loom', get: name, d: 'a'}, {v: 'now', label: 'Now', get: (r) => ok(r.v) ? r.v : null},
    {v: 'ref', label: 'Reference', get: ref}, {v: 'gap', label: short ? 'Shortfall' : 'Excess', sub: short ? 'below reference' : 'over reference', get: (r) => ok(ref(r)) && ok(r.v) ? (short ? ref(r) - r.v : r.v - ref(r)) : null}],
    (R) => el('div', {class: 'tablebox'}, refChart(o.limit ? R.slice(0, o.limit) : R, o)), {b: 'gap', d: 'd'});
}
const r0 = (rows) => rows.length && !rows[0].x;
const chartLegend = (what, exText) => el('div', {class: 'legend'}, el('span', {class: 'lg'}, legendShape('bar'), `Current ${what}`), el('span', {class: 'lg'}, legendShape('tick'), `Benchmark ${what}`),
  el('span', {class: 'lg'}, legendShape('circle'), `Best ${what}`), el('span', {class: 'lg'}, legendShape('diamond'), `Target ${what}`), el('span', {text: exText}));
function pageCfm() {
  const s = el('section', {class: 'page', id: 'cfm'});
  // Round A2 (Divyam, 24 Nov 2026): no lead note; "If every loom ran at its reference CFM" and "What the CFM saving is worth"
  // are one card, first on the tab; its Air saved, Compressor energy saved, Energy saved and Money saved tiles are notes now
  s.append(el('div', {}, el('h2', {text: `CFM, ${wLabel()} looms, ${dfmt(D.latest)}`})));
  const recs = latestRecs().map((x) => ({x, ...cfmRefs(x)}));
  const day = cfmDay(D.latest);
  const nT = Object.keys(TG).filter((k) => ok(TG[k].cfm)).length;
  const mode = modeSeg(CMODE, (v) => { CMODE = v; }, nT, 'Reference CFM');
  const above = recs.filter((r) => ok(r.ref) && r.x.cfm > r.ref + tolAir(r.ref));
  const noRef = recs.filter((r) => !ok(r.ref)).length;
  const saved = day ? day.now - day.after : null, pct = day && day.now ? 100 * saved / day.now : null;
  if (typeof wkPut === 'function') { const w = day ? {air: day.air, after: day.after * 1440, date: dfmt(D.latest)} : null;   // Round J
    for (const k of ['E1:now', 'E1:after', 'E1:saved', 'E1:pct', 'E5']) wkPut(k, w); }
  const kp = (label, big, unit, note) => el('div', {}, el('div', {class: 'kpi'}, el('div', {class: 'label', text: label}), el('div', {class: 'big'}, ...big, el('small', {text: unit})), note ? el('div', {class: 'note', text: note}) : null));
  const worth = cfmWorth(day, D.latest);
  s.append(card('If every loom ran at its reference CFM', (CMODE === 'bm' ? 'Head group benchmark' : REF_NOTE[CMODE]) + ' at each loom\'s own RPM · what the air saved is worth',
    el('div', {class: 'toolbar'}, mode),
    el('div', {class: 'kpis'},
      kp('Total CFM now', [f0(day && day.now)], 'CFM', `24-h average draw of ${day ? day.n : 0} looms · ${f0(day && day.air)} ft³ in the day`),
      kp('Total CFM after the work', [f0(day && day.after)], 'CFM', ok(saved) ? `air saved ${f0(saved)} CFM · ${f0(saved * 1440)} ft³ a day · ${f1(pct)}% of the floor's air` : null),
      ...worth.tiles),
    worth.gap,
    el('p', {class: 'note', text: `Each loom above its reference is brought down to it; looms already below stay where they are. ${above.length} loom${above.length === 1 ? ' is' : 's are'} above reference by more than ${S().tol_air_pct}%.${noRef ? ` ${noRef} loom${noRef === 1 ? ' has' : 's have'} no head group or benchmark and stay as they are.` : ''} Pressure savings are on the Pressure tab and are not added here.`})));
  s.append(airCard());   // Round T (Divyam, 20 Nov 2026): the air and compressor card (second since Round A2)
  const cc = compDay(D.latest);

  // 12 Nov 2026: one card, Loom-wise / Head-group-wise (the head-group bars were their own card before)
  const sorted = recs.slice().sort((a, b) => b.ex - a.ex || b.x.cfm - a.x.cfm || a.x.loom - b.x.loom);
  const chg = bv('cfm') === 'hg', H = chg ? cfmHgRows(recs) : null;
  s.append(card(`Current vs benchmark, best and target, ${chg ? 'by head group' : 'by loom'}`, chg ? `At each head group's own RPM · against the ${({bm: 'benchmark', best: 'best', tgt: 'target'})[CMODE]} · in the Sorting basis order` : CALL ? `All ${sorted.length} looms, in the Sorting basis order` : `First 25 of ${sorted.length} looms, in the Sorting basis order`,
    el('div', {class: 'toolbar'}, bvSeg('cfm')),
    chg ? (H.rows.length ? refBars(H.rows, {step: 5, labelEvery: 10, axis: 'CFM, ft³/min while running', axisShort: 'CFM while running', aria: 'CFM by head group: current against benchmark, best and target', dec: 1, exSign: '+'}) : el('div', {class: 'empty', text: 'No head group with a reference ran on this day.'}))
      : refBars(sorted.map((r) => ({...r, v: r.x.cfm})), {limit: CALL ? 0 : 25, step: 5, labelEvery: 10, axis: 'CFM, ft³/min while running', axisShort: 'CFM while running', aria: 'CFM per loom while running: current against benchmark, best and target', dec: 1, exSign: '+'}),
    chartLegend('CFM', chg ? '+n after the value = excess CFM over the reference picked at the top' : '+n after the value = excess CFM over the reference'),
    chg ? el('p', {class: 'note', text: `Run-weighted CFM of the looms that ran at least 60 min. Benchmark and best are the head group's air per 1,000 picks at its own RPM.${H.none.length ? ` No reference: ${H.none.join(', ')}.` : ''} Click a row to open the head group.`})
      : el('button', {class: 'link', type: 'button', text: CALL ? 'Show the first 25' : `Show all ${sorted.length} looms`, onclick: () => { CALL = !CALL; render(); }})));

  const view = el('div', {class: 'seg', role: 'group', 'aria-label': 'View'},
    el('button', {type: 'button', 'aria-pressed': CVIEW === 'loom' ? 'true' : 'false', text: 'Loom-wise', onclick: () => { CVIEW = 'loom'; render(); }}),
    el('button', {type: 'button', 'aria-pressed': CVIEW === 'quality' ? 'true' : 'false', text: 'Quality-wise', onclick: () => { CVIEW = 'quality'; render(); }}));
  let body;
  if (CVIEW === 'loom') {
    const fp = floorPicks(D.latest);   // 12 Nov 2026: paise per pick on the whole floor's picks, so the rows add up to the plant's saving
    if (typeof wkPut === 'function') { const r = sorted.find((y) => ok(y.bm)), b = r && (bench(r.x.width, r.x.hg) || {});   // Round J: benchmark CFM of the first loom
      wkPut('A3:bm', r ? {loom: r.x.loom, hg: r.x.hg, apk: b.apk, pf: pf(r.x.width, r.x.hg), rpm: r.x.rpm} : null); }
    const totRs = cc ? sorted.reduce((a, r) => a + (r.ex > 0.05 ? r.ex * r.x.run * cc.sRsFt3 : 0), 0) : null;
    body = table(['Loom', 'Head group', ['RPM', 'picks/min'], ['Now', 'CFM'], ['Reference', `CFM, ${REF_NAME[CMODE]}`], ['Excess', 'CFM over reference'], ['Air', 'ft³/1,000 picks'], ['Excess air', 'ft³ in the day'], ['Worth', '₹ a day · paise per pick of plant cost'], 'Status'],
      [...sorted.map((r) => {
        const st = ok(r.ref) && r.x.cfm > r.ref + tolAir(r.ref) ? el('span', {class: 'pill warn', text: 'above reference'}) : !ok(r.ref) ? el('span', {class: 'pill muted', text: 'no reference'}) : '';
        return [loomLink(r.x.loom, r.x.date), el('span', {}, hgLink(r.x.hg, r.x.width, r.x.date), el('div', {class: 'note', text: `${r.x.width} cm ${r.x.type}`})), f0(r.x.rpm), f1(r.x.cfm),
          refCell(CMODE, r.bm, r.best, r.tg, f1, () => bmBtn(f1(r.bm), r.x.width, r.x.hg, 'apk', {view: 'cfm', rpm: r.x.rpm}), () => bmBtn(f1(r.best), r.x.width, r.x.hg, 'apk', {kind: 'best', view: 'cfm', rpm: r.x.rpm})),
          r.ex > 0.05 ? '+' + f1(r.ex) : '0', f1(r.x.apk), r.ex > 0.05 ? f0(r.ex * r.x.run) : '0', r.ex > 0.05 && cc ? sortAs(withPP(rs(r.ex * r.x.run * cc.sRsFt3), r.ex * r.x.run * cc.sRsFt3, fp), r.ex * r.x.run * cc.sRsFt3) : (cc ? '₹0' : '—'), st];
      }), ...(cc ? [el('tr', {class: 'tot'}, el('td', {}, el('b', {text: 'Total'})), el('td', {colspan: 6, class: 'note', text: 'every loom brought to its reference'}), el('td', {class: 'num', text: f0(sorted.reduce((a, r) => a + (r.ex > 0.05 ? r.ex * r.x.run : 0), 0))}), el('td', {class: 'num'}, el('b', {}, withPP(rs(totRs), totRs, fp))), el('td', {}))] : [])], [2, 3, 4, 5, 6, 7, 8]);
  } else {
    const by = new Map();
    for (const r of recs) { const k = key(r.x.width, r.x.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
    const tot = recs.reduce((a, r) => a + r.ex * r.x.run, 0);
    const rows = [...by.values()].map((R) => {
      const x0 = R[0].x, A = agg(R.map((r) => r.x)), b = bench(x0.width, x0.hg) || {}, t = tgt(x0.width, x0.hg) || {};
      const exAir = R.reduce((a, r) => a + r.ex * r.x.run, 0);
      const ba = x0.hg !== 'Unassigned' ? bestVal(x0.width, x0.hg, 'apk') : null;
      return {x0, R, A, b, t, ba, bm: x0.hg !== 'Unassigned' ? cfmOf(b.apk, x0.width, x0.hg, A.rpm) : null, best: cfmOf(ba, x0.width, x0.hg, A.rpm), exAir, over: R.filter((r) => ok(r.ref) && r.x.cfm > r.ref + tolAir(r.ref)).length};
    }).sort((a, b) => b.exAir - a.exAir);
    const fp = floorPicks(D.latest), totRs = cc ? tot * cc.sRsFt3 : null;
    const airRef = (r) => CMODE === 'best' && ok(r.ba) ? bmBtn(f1(r.ba), r.x0.width, r.x0.hg, 'apk', {kind: 'best'}) : ok(r.b.apk) && r.x0.hg !== 'Unassigned' ? bmBtn(f1(r.b.apk), r.x0.width, r.x0.hg, 'apk') : '—';
    body = table(['Head group', ['Looms', 'ran'], ['RPM', 'picks/min'], ['CFM now', 'ft³/min running'], ['Reference', `CFM, ${REF_NAME[CMODE]}`], ['Air now', 'ft³/1,000 picks'], ['Air reference', CMODE === 'best' ? 'ft³/1,000 picks, best' : 'ft³/1,000 picks, benchmark'], ['Looms above', 'reference'], ['Saved if fixed', 'CFM, 24-h draw'], ['Worth', '₹ a day · paise per pick of plant cost'], ['Share of saving', '%']],
      [...rows.map((r) => [el('span', {}, hgLink(r.x0.hg, r.x0.width, D.latest), el('div', {class: 'note', text: r.x0.width + ' cm'})), r.A.looms, f0(r.A.rpm), f1(r.A.cfm),
        refCell(CMODE, r.bm, r.best, r.t.cfm, f1, () => bmBtn(f1(r.bm), r.x0.width, r.x0.hg, 'apk', {view: 'cfm', rpm: r.A.rpm}), () => bmBtn(f1(r.best), r.x0.width, r.x0.hg, 'apk', {kind: 'best', view: 'cfm', rpm: r.A.rpm})),
        f1(r.A.apk), airRef(r), r.over, f1(r.exAir / 1440), cc ? sortAs(withPP(rs(r.exAir * cc.sRsFt3), r.exAir * cc.sRsFt3, fp), r.exAir * cc.sRsFt3) : '—', tot > 0 ? f0(100 * r.exAir / tot) : '0']),
      ...(cc ? [el('tr', {class: 'tot'}, el('td', {}, el('b', {text: 'Total'})), el('td', {colspan: 7, class: 'note', text: 'every head group brought to its reference'}), el('td', {class: 'num', text: f1(tot / 1440)}), el('td', {class: 'num'}, el('b', {}, withPP(rs(totRs), totRs, fp))), el('td', {class: 'num', text: tot > 0 ? '100' : '0'}))] : [])], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  }
  s.append(card('Reference vs running CFM', (CVIEW === 'quality' ? 'Unlike pressure, fixing one quality saves its own share straight away' : 'CFM while running on the latest day; references at each loom\'s own RPM') + ' · paise per pick are on the whole floor\'s picks, so they add up to the total',
    el('div', {class: 'toolbar'}, view, modeSeg(CMODE, (v) => { CMODE = v; }, nT, 'Reference CFM', true)), body));

  s.append(trendCard('cfm', trDefault(recs.map((r) => ({x: r.x, w: r.ex * r.x.run})), CVIEW, sorted[0] && sorted[0].x)));
  const hist = (D.complete_days || []).slice().reverse().slice(0, 14).map((d) => ({d, c: cfmDay(d)})).filter((h) => h.c);
  s.append(card('Excess CFM by day', 'Both shifts, 24-h average draw above the reference; the reference uses today\'s benchmarks, best and targets for every day',   // Round T: the excess only
    table(['Date', ['Excess', 'CFM over reference'], ['Excess air', 'ft³ in the day'], ['Share', '% of the floor\'s air']],
      hist.map((h) => [dfmt(h.d), f0(h.c.now - h.c.after), f0((h.c.now - h.c.after) * 1440), f1(100 * (h.c.now - h.c.after) / h.c.now)]), [1, 2, 3])));
  return s;
}

// Now against the reference, one row per head group, for the CFM card's Head-group-wise view: bar = CFM now, tick =
// benchmark, dot = best, diamond = target, each at the head group's own RPM. Most excess over the switched reference first.
function cfmHgRows(recs) {
  const by = new Map();
  for (const r of recs) { if (r.x.hg === 'Unassigned') continue; const k = key(r.x.width, r.x.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(r.x); }
  const rows = [], none = [];
  for (const L of by.values()) {
    const x0 = L[0], A = agg(L), b = bench(x0.width, x0.hg) || {}, t = tgt(x0.width, x0.hg) || {};
    const bm = cfmOf(b.apk, x0.width, x0.hg, A.rpm), best = cfmOf(bestVal(x0.width, x0.hg, 'apk'), x0.width, x0.hg, A.rpm), tg = ok(t.cfm) ? t.cfm : null;
    const ref = refOf(CMODE, bm, best, tg);
    if (!ok(ref)) { none.push(x0.hg); continue; }
    rows.push({label: `${x0.hg} · ${x0.width}`, v: A.cfm, bm, best, tg, ref, ex: A.cfm - ref, open: () => openHg(x0.hg, x0.width, D.latest),
      tip: `${x0.hg}, ${x0.width} cm: ${f1(A.cfm)} CFM now · benchmark ${f1(bm)}${ok(best) ? ` · best ${f1(best)}` : ''}${ok(tg) ? ` · target ${f1(tg)}` : ''} at its RPM (${f0(A.rpm)}) · ${A.looms} looms`});
  }
  rows.sort((a, b) => b.ex - a.ex || a.label.localeCompare(b.label));
  return {rows, none};
}
// ---------------------------------------------------------------- Effective RPM
// Same layout as the CFM tab. Every loom brought up to its reference effective RPM adds picks directly.
// Reference = head group benchmark (90th percentile), best loom-day, or target (93% of target RPM); benchmark where unset.
function erpmRefs(x) {
  const b = bench(x.width, x.hg) || {}, has = x.hg !== 'Unassigned';
  const bm = has && ok(b.erpm) ? b.erpm : null, best = has ? bestVal(x.width, x.hg, 'erpm') : null, tg = has ? tgtE(x.width, x.hg) : null;
  const ref = refOf(EMODE, bm, best, tg);
  const after = ok(ref) ? Math.max(x.erpm, ref) : x.erpm;
  const gap = after - x.erpm;
  return {bm, best, tg, ref, after, ex: gap, gain: gap * (x.run + x.stop) * pf(x.width, x.hg)};   // gain in fabric picks
}
function erpmDay(date) {
  const L = (D.loomdays || []).filter((x) => x.date === date && inW(x.width) && x.run > 0);
  let now = 0, gain = 0;
  for (const x of L) { now += ok(x.fpicks) ? x.fpicks : x.picks; gain += erpmRefs(x).gain; }
  const A = agg(L);
  return L.length ? {now, after: now + gain, gain, erpm: A && A.erpm, n: new Set(L.map((x) => x.loom)).size} : null;
}
function pageErpm() {
  const s = el('section', {class: 'page', id: 'erpm'});
  s.append(el('div', {}, el('h2', {text: `Effective RPM, ${wLabel()} looms, ${dfmt(D.latest)}`}),
    el('p', {class: 'lead', text: `Effective RPM = RPM × efficiency ÷ 100: the picks a loom actually makes per minute of run plus stop time, so it counts speed and stoppages together. Benchmark is the 90th percentile of each head group's loom-days (all history), best is its highest loom-day, and the target is ${f0(ERPM_TGT * 100)}% of your target RPM. Every loom brought up to its reference adds picks directly. Picks count double panna on 280 cm. Click any benchmark or best figure to see the loom runs behind it.`})));
  const recs = latestRecs().map((x) => ({x, ...erpmRefs(x)}));
  const day = erpmDay(D.latest);
  const money = typeof fxOn === 'function' && fxOn();
  const nT = Object.keys(TG).filter((k) => ok(TG[k].rpm)).length;
  const mode = modeSeg(EMODE, (v) => { EMODE = v; }, nT, 'Reference effective RPM');
  const below = recs.filter((r) => ok(r.ref) && r.x.erpm < r.ref - tolRpm(r.ref));
  const noRef = recs.filter((r) => !ok(r.ref)).length;
  const lk = (p) => f2(p / PICK_LAKH);
  if (typeof wkPut === 'function') {   // Round J: the tiles and the reference table, for their Working
    const L0 = (D.loomdays || []).filter((x) => x.date === D.latest && inW(x.width) && x.run > 0), A0 = agg(L0);
    const T = L0.map((x) => ({x, r: erpmRefs(x)})).filter((o) => o.r.gain > 0).sort((a, b) => b.r.gain - a.r.gain)
      .map((o) => ({loom: o.x.loom, ref: o.r.after, now: o.x.erpm, min: o.x.run + o.x.stop, pf: pf(o.x.width, o.x.hg)}));
    wkPut('A2:erpm', A0 ? {picks: A0.picks, tot: A0.run + A0.stop} : null);
    wkPut('F1:now', day ? {now: day.now} : null); wkPut('F1:after', day ? {now: day.now, gain: day.gain} : null); wkPut('F1:gain', day ? {gain: day.gain, terms: T} : null);
    const r0 = recs.slice().sort((a, b) => b.ex - a.ex || a.x.erpm - b.x.erpm || a.x.loom - b.x.loom).find((r) => ok(r.ref));
    wkPut('F2', r0 ? {loom: r0.x.loom, ref: r0.ref, now: r0.x.erpm, min: r0.x.run + r0.x.stop, pf: pf(r0.x.width, r0.x.hg)} : null);
    const o = r0 && money && typeof fxLd === 'function' ? fxLd(r0.x.date, r0.x.loom, r0.x.hg) : null;
    wkPut('F2m', o && o.real_pp != null && r0.ex > 0.5 ? {loom: r0.x.loom, picks: r0.gain / 39.37, pp: o.real_pp} : null);
  }
  const kp = (label, big, unit, note) => el('div', {}, el('div', {class: 'kpi'}, el('div', {class: 'label', text: label}), el('div', {class: 'big'}, ...big, el('small', {text: unit})), note ? el('div', {class: 'note', text: note}) : null));
  s.append(card('If every loom ran at its reference effective RPM', EMODE === 'bm' ? 'Head group benchmark (90th percentile)' : EMODE === 'tgt' ? `Target (${f0(ERPM_TGT * 100)}% of target RPM) where you set one, benchmark otherwise` : REF_NOTE[EMODE],
    el('div', {class: 'toolbar'}, mode),
    el('div', {class: 'kpis'},
      kp('Effective RPM now', [f0(day && day.erpm)], 'RPM', `all ${day ? day.n : 0} looms that ran, picks ÷ (run + stop) minutes`),
      kp('Picks now', [lk(day && day.now)], 'lakh', 'in the day'),
      kp('Picks after the work', [lk(day && day.after)], 'lakh', 'each loom at or above its reference'),
      kp('Picks gained', [lk(day && day.gain)], 'lakh', day && day.now ? `${f1(100 * day.gain / day.now)}% more output` : null),
      ...(money && typeof fxErpmRealTiles === 'function' ? fxErpmRealTiles(recs, kp) : [])),   // 12 Nov 2026: realisation now and after the work (owner)
    el('p', {class: 'note', text: `Each loom below its reference is brought up to it; looms already above stay where they are. ${below.length} loom${below.length === 1 ? ' is' : 's are'} below reference by more than ${S().tol_rpm_pct}%.${noRef ? ` ${noRef} loom${noRef === 1 ? ' has' : 's have'} no head group or benchmark and stay as they are.` : ''}`}),
    typeof fxMixNote === 'function' ? fxMixNote(D.latest) : null));   // R2: best loom type × product mix (owner, analysis on)

  const sorted = recs.slice().sort((a, b) => b.ex - a.ex || a.x.erpm - b.x.erpm || a.x.loom - b.x.loom);
  const ehg = bv('erpm') === 'hg';   // 12 Nov 2026: loom-wise or head-group-wise
  const eHgRows = () => {
    const by = new Map();
    for (const r of recs) { if (r.x.hg === 'Unassigned') continue; const k = key(r.x.width, r.x.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(r.x); }
    return [...by.values()].map((L) => {
      const x0 = L[0], A = agg(L), b = bench(x0.width, x0.hg) || {};
      const bm = ok(b.erpm) ? b.erpm : null, best = bestVal(x0.width, x0.hg, 'erpm'), tg = tgtE(x0.width, x0.hg), ref = refOf(EMODE, bm, best, tg);
      return {label: `${x0.hg} · ${x0.width}`, v: A.erpm, bm, best, tg, ref, ex: ok(ref) ? Math.max(0, ref - A.erpm) : 0, open: () => openHg(x0.hg, x0.width, D.latest),
        tip: `${x0.hg}, ${x0.width} cm: ${f0(A.erpm)} effective RPM now · benchmark ${f0(bm)}${ok(best) ? ` · best ${f0(best)}` : ''}${ok(tg) ? ` · target ${f0(tg)}` : ''} · ${A.looms} looms`};
    }).sort((a, b) => b.ex - a.ex || a.label.localeCompare(b.label));
  };
  const eRows = ehg ? eHgRows() : sorted.map((r) => ({...r, v: r.x.erpm}));
  s.append(card(`Current vs benchmark, best and target, ${ehg ? 'by head group' : 'by loom'}`, ehg ? `${eRows.length} head groups, in the Sorting basis order` : EALL ? `All ${sorted.length} looms, in the Sorting basis order` : `First 25 of ${sorted.length} looms, in the Sorting basis order`,
    el('div', {class: 'toolbar'}, bvSeg('erpm')),
    eRows.length ? refBars(eRows, {limit: ehg || EALL ? 0 : 25, step: 50, labelEvery: 100, axis: 'Effective RPM, picks per minute of run + stop time', axisShort: 'Effective RPM', aria: `Effective RPM ${ehg ? 'by head group' : 'per loom'}: current against benchmark, best and target`, dec: 0, exSign: '−'}) : el('div', {class: 'empty', text: 'No loom with a head group ran on this day.'}),
    chartLegend('effective RPM', '−n after the value = effective RPM short of the reference'),
    ehg ? null : el('button', {class: 'link', type: 'button', text: EALL ? 'Show the first 25' : `Show all ${sorted.length} looms`, onclick: () => { EALL = !EALL; render(); }})));
  if (money && typeof fxErpmRealCard === 'function') s.append(fxErpmRealCard(recs));   // 12 Nov 2026: realisation against benchmark, best and target (owner)

  const view = el('div', {class: 'seg', role: 'group', 'aria-label': 'View'},
    el('button', {type: 'button', 'aria-pressed': EVIEW === 'loom' ? 'true' : 'false', text: 'Loom-wise', onclick: () => { EVIEW = 'loom'; render(); }}),
    el('button', {type: 'button', 'aria-pressed': EVIEW === 'quality' ? 'true' : 'false', text: 'Quality-wise', onclick: () => { EVIEW = 'quality'; render(); }}));
  let body;
  if (EVIEW === 'loom') {
    body = table(['Loom', 'Head group', ['RPM', 'picks/min'], ['Eff', '%'], ['Now', 'effective RPM'], ['Reference', EMODE === 'tgt' ? `target, ${f0(ERPM_TGT * 100)}% of target RPM` : `effective RPM, ${REF_NAME[EMODE]}`], ['Shortfall', 'effective RPM below reference'], ['Picks short', 'lakh in the day'], ...(money ? [['Lost realisation', '₹ in the day']] : []), 'Status'],
      sorted.map((r) => {
        const st = ok(r.ref) && r.x.erpm < r.ref - tolRpm(r.ref) ? el('span', {class: 'pill warn', text: 'below reference'}) : !ok(r.ref) ? el('span', {class: 'pill muted', text: 'no reference'}) : '';
        return [loomLink(r.x.loom, r.x.date), el('span', {style: 'white-space:nowrap;display:block'}, hgLink(r.x.hg, r.x.width, r.x.date), el('div', {class: 'note', text: `${r.x.width} cm ${r.x.type}`})), f0(r.x.rpm), f1(r.x.eff), f0(r.x.erpm),
          refCell(EMODE, r.bm, r.best, r.tg, f0, () => bmBtn(f0(r.bm), r.x.width, r.x.hg, 'erpm'), () => bmBtn(f0(r.best), r.x.width, r.x.hg, 'erpm', {kind: 'best'})),
          sortAs(r.ex > 0.5 ? '−' + f0(r.ex) : '0', ok(r.ref) ? (r.ex > 0.5 ? r.ex : 0) : null), r.ex > 0.5 ? lk(r.gain) : '0', ...(money ? [fxErpmCell(r.x, r.ex > 0.5 ? r.gain : 0)] : []), st];
      }), money ? [2, 3, 4, 5, 6, 7, 8] : [2, 3, 4, 5, 6, 7]);
  } else {
    const by = new Map();
    for (const r of recs) { const k = key(r.x.width, r.x.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
    const tot = recs.reduce((a, r) => a + r.gain, 0);
    const rows = [...by.values()].map((R) => {
      const x0 = R[0].x, A = agg(R.map((r) => r.x)), b = bench(x0.width, x0.hg) || {}, has = x0.hg !== 'Unassigned';
      return {x0, R, A, bm: has && ok(b.erpm) ? b.erpm : null, best: has ? bestVal(x0.width, x0.hg, 'erpm') : null, tg: has ? tgtE(x0.width, x0.hg) : null,
        gain: R.reduce((a, r) => a + r.gain, 0), under: R.filter((r) => ok(r.ref) && r.x.erpm < r.ref - tolRpm(r.ref)).length};
    }).sort((a, b) => b.gain - a.gain);
    body = table(['Head group', ['Looms', 'ran'], ['RPM', 'picks/min'], ['Eff', '%'], ['Now', 'effective RPM'], ['Reference', EMODE === 'tgt' ? `target, ${f0(ERPM_TGT * 100)}% of target RPM` : `effective RPM, ${REF_NAME[EMODE]}`], ['Looms below', 'reference'], ['Gained if fixed', 'lakh picks'], ...(money ? [['Lost realisation', '₹ in the day']] : []), ['Share of gain', '%']],
      rows.map((r) => [el('span', {}, hgLink(r.x0.hg, r.x0.width, D.latest), el('div', {class: 'note', text: r.x0.width + ' cm'})), r.A.looms, f0(r.A.rpm), f1(r.A.eff), f0(r.A.erpm),
        refCell(EMODE, r.bm, r.best, r.tg, f0, () => bmBtn(f0(r.bm), r.x0.width, r.x0.hg, 'erpm'), () => bmBtn(f0(r.best), r.x0.width, r.x0.hg, 'erpm', {kind: 'best'})),
        r.under, lk(r.gain), ...(money ? [fxErpmHgCell(r.R)] : []), tot > 0 ? f0(100 * r.gain / tot) : '0']), money ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8]);
  }
  s.append(card('Reference vs running effective RPM', EVIEW === 'quality' ? 'Fixing one quality adds its own share of picks straight away' : 'Latest day; picks short = shortfall × (run + stop) minutes, double panna on 280 cm',
    el('div', {class: 'toolbar'}, view, modeSeg(EMODE, (v) => { EMODE = v; }, nT, 'Reference effective RPM', true)), body, money ? el('p', {class: 'note', text: 'Lost realisation = the picks short × that loom-day\'s realisation per pick (sale value at prevailing rate less standard yarn cost, As sold, from the Realisation tab); a loom-day it cannot price says so.'}) : null));

  s.append(trendCard('erpm', trDefault(recs.map((r) => ({x: r.x, w: r.gain})), EVIEW, sorted[0] && sorted[0].x)));
  const hist = (D.complete_days || []).slice().reverse().slice(0, 14).map((d) => ({d, c: erpmDay(d)})).filter((h) => h.c);
  s.append(card('Picks by day', 'Both shifts; "at reference" uses today\'s benchmarks, best and targets for every day',
    table(['Date', ['Effective RPM', 'all looms'], ['Picks now', 'lakh'], ['At reference', 'lakh'], ['Gained', 'lakh'], ['Gain', '% of picks']],
      hist.map((h) => [dfmt(h.d), f0(h.c.erpm), lk(h.c.now), lk(h.c.after), lk(h.c.gain), f1(100 * h.c.gain / h.c.now)]), [1, 2, 3, 4, 5])));
  return s;
}

// ---------------------------------------------------------------- Utilisation
function pageUtil() {
  const s = el('section', {class: 'page', id: 'utilisation'});
  s.append(el('div', {}, el('h2', {text: `Powered-down and low-efficiency looms, ${wLabel()}`}),
    el('p', {class: 'lead', text: `Looms powered down for ${OFF_LONG / 60} h or more on ${dfmt(D.latest)}, and looms that ran below ${f0(EFF_BAD())}% efficiency on at least ${LOW_EFF_DAYS} of their last ${LOW_EFF_WINDOW} running days.`})));
  s.append(utilCalendar());
  const U = (D.util || []).filter((u) => u.date === D.latest && inW(u.width));
  const hgOf = (loom) => (D.loom_hg || {})[loom] || '—';
  const offLong = U.filter((u) => u.off >= OFF_LONG).sort((a, b) => b.off - a.off);
  const offShort = U.filter((u) => u.off >= 60 && u.off < OFF_LONG).length;
  const money = typeof fxOn === 'function' && fxOn();   // R2: idle hours as realisation forgone (owner, analysis on)
  if (typeof wkPut === 'function') { const u = offLong[0], r = u && money && typeof fxIdleRs === 'function' ? fxIdleRs(u.loom, u.date, u.off) : null;   // Round J
    wkPut('H1', u ? {loom: u.loom, run: u.run, stop: u.stop, off: u.off} : null);
    wkPut('H2', r && r.rs != null ? {loom: u.loom, off: u.off, rpm: r.rpm, pf: r.pf, pp: r.pp} : null); }
  s.append(card(`Powered down on ${dfmt(D.latest)} · ${offLong.length} loom${offLong.length === 1 ? '' : 's'}`, `${OFF_LONG / 60} h or more out of 24 h. ${offShort} more loom${offShort === 1 ? ' was' : 's were'} off between 1 and ${OFF_LONG / 60} h. A loom missing from a shift file counts as powered down for that shift.`,
    offLong.length ? table(['Loom', 'Head group', ['Powered down', 'h'], ['Run', 'h'], ['Stopped', 'h'], ...(money ? [['Realisation forgone', '₹, at its current quality']] : []), 'Off on earlier days'],
      offLong.map((u) => {
        const prev = (D.util || []).filter((v) => v.loom === u.loom && v.date < D.latest && v.off >= OFF_LONG).length;
        return [el('span', {}, loomLink(u.loom, u.date), el('div', {class: 'note', text: `${u.width} cm ${u.type}`})), hgLink(hgOf(u.loom), u.width, u.date), f1(u.off / 60), f1(u.run / 60), f1(u.stop / 60), ...(money ? [fxIdleCell(u.loom, u.date, u.off)] : []), prev ? `${prev} earlier day${prev > 1 ? 's' : ''} ≥ ${OFF_LONG / 60} h` : '—'];
      }), money ? [2, 3, 4, 5] : [2, 3, 4]) : el('div', {class: 'empty', text: `No loom was powered down for ${OFF_LONG / 60} h or more.`}),
    money && offLong.length ? el('p', {class: 'note', text: 'Realisation forgone = the powered-down minutes × the RPM the loom runs on its current quality × that quality\'s realisation per pick on this loom (the day\'s own, else the loom\'s latest priced day on it), As sold, from the Realisation tab. What the idle hours would have made at the going rate, less standard yarn.'}) : null));

  // consistently low efficiency
  const byLoom = new Map();
  for (const x of D.loomdays || []) { if (!inW(x.width) || x.run < 60) continue; if (!byLoom.has(x.loom)) byLoom.set(x.loom, []); byLoom.get(x.loom).push(x); }
  const bad = [];
  for (const [loom, L0] of byLoom) {
    const L = L0.slice().sort((a, b) => a.date.localeCompare(b.date) || a.run - b.run);
    const cur = L[L.length - 1]; const b = bench(cur.width, cur.hg) || {};
    const days = [...new Set(L.map((x) => x.date))].slice(-LOW_EFF_WINDOW);
    const win = days.map((d) => { const A = agg(L.filter((x) => x.date === d)); return A ? {date: d, eff: A.eff, warp_rate: A.warpRate} : null; }).filter(Boolean);
    const low = win.filter((x) => x.eff < EFF_BAD());
    if (low.length >= LOW_EFF_DAYS) {
      const avg = win.reduce((a, x) => a + x.eff, 0) / win.length;
      const wr = win.filter((x) => ok(x.warp_rate)); const warp = wr.length ? wr.reduce((a, x) => a + x.warp_rate, 0) / wr.length : null;
      const beam = ok(warp) && warp > Math.max((S().warp_multiple || 2) * (b.warp_med || 0), S().warp_min_rate || 3);
      bad.push({loom, cur, b, win, low, avg, warp, beam, gap: EFF_BAD() - avg});
    }
  }
  bad.sort((a, b) => b.gap - a.gap);
  if (typeof wkPut === 'function') wkPut('H3', bad[0] ? {loom: bad[0].loom, effs: bad[0].win.map((x) => x.eff), low: bad[0].low.length, line: f0(EFF_BAD())} : null);   // Round J
  s.append(card(`Consistently low efficiency · ${bad.length} loom${bad.length === 1 ? '' : 's'}`, (D.complete_days || []).length < LOW_EFF_WINDOW ? `${(D.complete_days || []).length} days of history so far; the window fills to ${LOW_EFF_WINDOW} days as uploads come in.` : `Below ${f0(EFF_BAD())}% on at least 3 of each loom's last ${LOW_EFF_WINDOW} running days`,
    bad.length ? table(['Loom', 'Head group', ['Days low', `of last ${LOW_EFF_WINDOW}`], ['Average efficiency', '%'], ['Below line', 'points'], ['Latest day', '%'], ['Warp breaks', 'avg /100k picks']],
      bad.map((r) => [el('span', {}, loomLink(r.loom, r.cur.date), el('div', {class: 'note', text: `${r.cur.width} cm ${r.cur.type}`})), el('span', {}, hgLink(r.cur.hg, r.cur.width, r.cur.date), r.beam ? el('div', {}, el('span', {class: 'pill info', text: 'likely beam'})) : null),
        `${r.low.length}/${r.win.length}`, f1(r.avg), f1(r.gap), r.win[r.win.length - 1].date === D.latest ? f1(r.win[r.win.length - 1].eff) : `ran ${dfmt(r.cur.date)}`, f1(r.warp)]), [2, 3, 4, 5, 6])
      : el('div', {class: 'empty', text: `No loom has been below ${f0(EFF_BAD())}% on most of its recent days.`})));
  const u0 = bad[0] ? bad[0].loom : offLong[0] ? offLong[0].loom : null;
  s.append(trendCard('utilisation', u0 != null ? {kind: 'loom', loom: u0} : null));
  return s;
}

// Loom × day for the last 14 complete days: each cell is the loom's 24 hours as a small stacked column, run (bottom),
// stopped, then powered down (top). Looms that lost the most hours first; a cell opens that loom on that day.
function utilCalendar() {
  const dates = (D.complete_days || []).filter((d) => d <= D.latest).slice(-14);
  const U = new Map((D.util || []).filter((u) => inW(u.width)).map((u) => [u.loom + '|' + u.date, u]));
  const looms = Object.keys(D.machine || {}).map(Number).filter((l) => inW(D.machine[l].width));
  const lost = (l) => dates.reduce((a, d) => { const u = U.get(l + '|' + d); return a + (u ? (u.stop || 0) + (u.off || 0) : 1440); }, 0);
  const rows = looms.map((l) => ({l, lost: lost(l)})).sort((a, b) => b.lost - a.lost || a.l - b.l);
  const COL = {run: 'var(--series)', stop: 'var(--warn-dot)', off: 'var(--muted-2)'};
  const h = (m) => f1((m || 0) / 60);
  const t = el('table', {class: 'ucal'});
  t.append(el('thead', {}, el('tr', {}, el('th', {scope: 'col', text: 'Loom'}), dates.map((d, i) => el('th', {scope: 'col', title: dfmt(d)}, d.slice(8, 10).replace(/^0/, ''), i === 0 || d.slice(8, 10) === '01' ? el('span', {class: 'unit', text: dfmt(d).split(' ')[1]}) : el('span', {class: 'unit', text: '\u00a0'}))))));
  const tb = el('tbody');
  for (const {l, lost: lm} of rows) {
    const m = D.machine[l] || {};
    tb.append(el('tr', {}, el('td', {title: `Loom ${l}: ${h(dates.length * 1440 - lm)} h run of ${dates.length * 24} in these ${dates.length} days`}, loomLink(l, D.latest, 'Loom ' + l), el('div', {class: 'note', text: `${m.width} cm · ${h(dates.length * 1440 - lm)} h run`})),
      dates.map((d) => {
        const u = U.get(l + '|' + d);
        if (!u) return el('td', {}, el('span', {class: 'ucell', title: `Loom ${l}, ${dfmt(d)}: no record`}));   // a gap: sorts last
        const tot = (u.run || 0) + (u.stop || 0) + (u.off || 0) || 1440;
        return el('td', {'data-sort': f2(((u.stop || 0) + (u.off || 0)) / 60)}, el('button', {type: 'button', class: 'ucell', 'aria-label': `Loom ${l}, ${dfmt(d)}: run ${h(u.run)} h, stopped ${h(u.stop)} h, powered down ${h(u.off)} h`,
          title: `Loom ${l}, ${dfmt(d)}: run ${h(u.run)} h · stopped ${h(u.stop)} h · powered down ${h(u.off)} h`, onclick: () => openLoom(l, d)},
          ['run', 'stop', 'off'].map((k) => (u[k] || 0) > 0 ? el('i', {style: `height:${(100 * u[k] / tot).toFixed(1)}%;background:${COL[k]};${k === 'off' ? 'opacity:.55' : ''}`}) : null)));
      })));
  }
  t.append(tb);
  return card(`Run, stopped and powered down · last ${dates.length} days`, `${wLabel()} · each cell is one loom's 24 hours · most hours lost first`,
    dates.length ? el('div', {class: 'tablebox'}, t) : el('div', {class: 'empty', text: 'No complete day yet.'}),
    el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: `background:${COL.run}`}), 'run'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: `background:${COL.stop}`}), 'stopped'),
      el('span', {class: 'lg'}, el('span', {class: 'sq', style: `background:${COL.off};opacity:.55`}), 'powered down'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--soft)'}), 'no record')),
    el('p', {class: 'note', text: 'A tall blue column is a full day running. Orange is time stopped while powered on, grey is time powered down (a loom missing from a shift file counts as powered down for that shift). Hover a cell for the hours; click it to open that loom on that day. A "no record" cell (pale) means no shift file had that loom that day: ' + (typeof fxIsOwner === 'function' && fxIsOwner() ? 'check Files per day on Data health.' : 'tell the owner if it should have run.')}));
}

// ---------------------------------------------------------------- Warp
// Beams: the break rate of each beam still on its loom (a changed-out beam is not actionable, 10 Nov 2026), over its whole
// time on the loom (loom-days kept on the page), ranked; the tick is the head group's beam line (multiple × median, at least
// the floor rate).
let WBALL = false;
const beamLine = (w, hg) => { const b = bench(w, hg); return Math.max((S().warp_multiple || 2) * ((b && b.warp_med) || 0), S().warp_min_rate || 3); };
function warpBeamCards(dates) {
  const recs = (D.loomdays || []).filter((x) => inW(x.width) && x.run >= 60 && x.date <= D.latest);
  const inP = new Set(dates), cur = currentBeams(recs);
  const beams = beamStats(recs).filter((b) => ok(b.rate) && cur.get(b.loom) === b.beam && b.dates.some((d) => inP.has(d)));
  const over = beams.filter((b) => b.rate > beamLine(b.width, b.hg)).length;
  if (typeof wkPut === 'function') { const b = beams.slice().sort((a, c) => c.rate - a.rate)[0];   // Round J: the beam breaking most
    wkPut('I2', b ? {beam: b.beam, loom: b.loom, warp: b.warp, picks: b.picks, days: b.days, line: beamLine(b.width, b.hg)} : null); }
  if (bv('warp') === 'hg') return [warpHgCard(recs, dates, beams)];   // 12 Nov 2026: head-group-wise
  const c1 = card('Break rate by beam', `${beams.length} beam${beams.length === 1 ? '' : 's'} still on the loom · rate over each beam's whole run · in the Sorting basis order`,
    el('div', {class: 'toolbar'}, bvSeg('warp')),
    beams.length ? hbars(beams.map((b) => { const ln = beamLine(b.width, b.hg); return {label: `${b.beam} · loom ${b.loom}`, v: b.rate, tol: ln, color: 'var(--bad)', text: f2(b.rate), onClick: () => openLoom(b.loom, b.last),
      title: `Beam ${b.beam} on loom ${b.loom} (${b.hg}, ${b.width} cm): ${f0(b.warp)} breaks over ${f2(b.picks / 1e5)} lakh machine picks on ${b.days} day${b.days === 1 ? '' : 's'} (${dfmt(b.first)}–${dfmt(b.last)}) = ${f2(b.rate)} per 100k picks; beam line ${f2(ln)}`}; }),
      {aria: 'Warp break rate by beam', axis: 'Warp breaks per 100k picks', fmt: f2, labelW: 150, limit: WBALL ? 0 : 15, nameLabel: 'Beam', sortLabel: 'Warp breaks per 100k picks'}) : el('div', {class: 'empty', text: 'No beam still on a loom ran in this period.'}),
    beams.length ? el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad);opacity:.35'}), 'up to the beam line'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad)'}), 'past it'), el('span', {class: 'lg'}, legendShape('tick'), 'beam line of its head group')) : null,
    beams.length > 15 ? el('button', {class: 'link', type: 'button', text: WBALL ? 'Show the first 15' : `Show all ${beams.length} beams`, onclick: () => { WBALL = !WBALL; render(); }}) : null,
    el('p', {class: 'note', text: `${over} of ${beams.length} beam${beams.length === 1 ? ' is' : 's are'} past the beam line (${S().warp_multiple || 2}× the head group's median rate, at least ${S().warp_min_rate || 3} per 100k picks). Only the beam each loom carries now is listed: a beam already changed out cannot be acted on. A beam that breaks well past its head group points to warping or sizing, not the loom. Click a bar to open the loom.`}),
    beams.length && typeof fxBeamTable === 'function' ? fxBeamTable(beams, recs) : null);   // R2: what each beam's stops cost in realisation (owner, analysis on)
  return [c1];
}
// Warp breaks head-group-wise (12 Nov 2026): each head group's break rate over the period (its looms' breaks ÷ machine picks
// × 100k, looms that ran at least 60 min), against its beam line, highest first. The beams behind it are in its panel.
function warpHgCard(recs, dates, beams) {
  const inP = new Set(dates), by = new Map();
  for (const x of recs) { if (!inP.has(x.date) || x.hg === 'Unassigned' || !ok(x.warp)) continue; const k = key(x.width, x.hg); const o = by.get(k) || {w: x.width, hg: x.hg, warp: 0, picks: 0, looms: new Set()}; o.warp += x.warp; o.picks += x.picks || 0; o.looms.add(x.loom); by.set(k, o); }
  const G = [...by.values()].filter((o) => o.picks > 0).map((o) => ({...o, rate: o.warp / o.picks * 1e5, line: beamLine(o.w, o.hg), over: beams.filter((b) => b.hg === o.hg && String(b.width) === String(o.w) && b.rate > beamLine(b.width, b.hg)).length})).sort((a, b) => b.rate - a.rate);
  return card('Break rate by head group', `${G.length} head group${G.length === 1 ? '' : 's'} · the period's breaks ÷ machine picks · in the Sorting basis order`,
    el('div', {class: 'toolbar'}, bvSeg('warp')),
    G.length ? hbars(G.map((o) => ({label: `${o.hg} · ${o.w}`, v: o.rate, tol: o.line, color: 'var(--bad)', text: f2(o.rate), onClick: () => openHg(o.hg, o.w, D.latest),
      title: `${o.hg}, ${o.w} cm: ${f0(o.warp)} breaks over ${f2(o.picks / 1e5)} lakh machine picks on ${o.looms.size} loom${o.looms.size === 1 ? '' : 's'} = ${f2(o.rate)} per 100k picks; beam line ${f2(o.line)}; ${o.over} current beam${o.over === 1 ? '' : 's'} past it`})),
      {aria: 'Warp break rate by head group', axis: 'Warp breaks per 100k picks', fmt: f2, labelW: 150, nameLabel: 'Head group', sortLabel: 'Warp breaks per 100k picks'}) : el('div', {class: 'empty', text: 'No head group ran in this period.'}),
    G.length ? el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad);opacity:.35'}), 'up to the beam line'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad)'}), 'past it'), el('span', {class: 'lg'}, legendShape('tick'), 'beam line')) : null,
    el('p', {class: 'note', text: `The beam line is ${S().warp_multiple || 2}× the head group's median rate, at least ${S().warp_min_rate || 3} per 100k picks. A head group past it on most of its looms points to the yarn or the warping of that quality rather than one beam. Switch to Loom-wise for the beam each loom carries now. Click a bar to open the head group.`}));
}
function pageWarp() {
  const s = el('section', {class: 'page', id: 'warp'});
  const dates = WPER === 'day' ? [D.latest] : WPER === 'range' ? rngDays(days0()) : (D.complete_days || []).slice(-7);
  s.append(el('div', {}, el('h2', {text: `Warp breaks, ${wLabel()}`}),
    el('p', {class: 'lead', text: 'Warp stops point to warping and beam quality rather than loom settings. Counts are breaks (times); rates are breaks per 100,000 picks.'})));
  const L = (D.loomdays || []).filter((x) => dates.includes(x.date) && inW(x.width) && x.run >= 60);
  const A = agg(L);
  const day = agg(latestRecs()), wk = agg((D.loomdays || []).filter((x) => (D.complete_days || []).slice(-7).includes(x.date) && inW(x.width) && x.run >= 60));
  if (typeof wkPut === 'function') { wkPut('I1:day', day ? {what: `every loom on ${dfmt(D.latest)}`, warp: day.warp, picks: day.picks} : null); wkPut('I1:week', wk ? {what: 'the last 7 days', warp: wk.warp, picks: wk.picks} : null); }   // Round J
  s.append(el('div', {class: 'kpis'},
    el('div', {class: 'card kpi'}, el('div', {class: 'label', text: `Warp breaks on ${dfmt(D.latest)}`}), el('div', {class: 'val'}, f0(day && day.warp), el('small', {text: 'breaks'})), el('div', {class: 'note', text: f2(day && day.warpRate) + ' per 100k picks'})),
    el('div', {class: 'card kpi'}, el('div', {class: 'label', text: 'Last 7 days'}), el('div', {class: 'val'}, f0(wk && wk.warp), el('small', {text: 'breaks'})), el('div', {class: 'note', text: f2(wk && wk.warpRate) + ` per 100k picks · ${Math.min(7, (D.complete_days || []).length)} days`}))));

  const per = el('div', {class: 'seg', role: 'group', 'aria-label': 'Period'},
    el('button', {type: 'button', 'aria-pressed': WPER === 'day' ? 'true' : 'false', text: `Latest day (${dfmt(D.latest)})`, onclick: () => { WPER = 'day'; render(); }}),
    el('button', {type: 'button', 'aria-pressed': WPER === 'week' ? 'true' : 'false', text: 'Last 7 days', onclick: () => { WPER = 'week'; render(); }}),
    el('button', {type: 'button', 'aria-pressed': WPER === 'range' ? 'true' : 'false', text: 'Dates', onclick: () => { WPER = 'range'; render(); }}));
  const by = new Map();
  for (const x of L) { const k = key(x.width, x.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
  const qs = [...by.entries()].map(([k, recs]) => ({k, w: recs[0].width, hg: recs[0].hg, recs, A: agg(recs)})).filter((q) => q.A).sort((a, b) => b.A.warp - a.A.warp);
  if (!WQ || !by.has(WQ)) WQ = qs.length ? qs[0].k : '';
  const sel = el('select', {id: 'warp-q', 'aria-label': 'Quality'}, qs.map((q) => el('option', {value: q.k, text: `${q.hg} · ${q.w} cm`, selected: q.k === WQ ? true : null})));
  sel.addEventListener('change', () => { WQ = sel.value; render(); });
  const t = el('table');
  t.append(el('thead', {}, el('tr', {}, ['Head group', ['Looms', 'ran'], ['Warp breaks', 'total'], ['Rate', 'per 100k picks'], ['Efficiency', '%'], ['Benchmark rate', 'median /100k']].map((h, i) => Array.isArray(h) ? th(h[0], h[1], true) : th(h, null, false)))));
  const tb = el('tbody');
  for (const q of qs) {
    const b = bench(q.w, q.hg);
    tb.append(el('tr', {class: 'pick' + (q.k === WQ ? ' sel' : ''), tabindex: '0', onclick: () => { WQ = q.k; render(); }, onkeydown: (e) => { if (e.key === 'Enter') { WQ = q.k; render(); } }},
      el('td', {}, hgLink(q.hg, q.w, D.latest), el('div', {class: 'note', text: q.w + ' cm'})), el('td', {class: 'num', text: q.A.looms}), el('td', {class: 'num', text: f0(q.A.warp)}),
      el('td', {class: 'num', text: f2(q.A.warpRate)}), el('td', {class: 'num', text: f1(q.A.eff)}), el('td', {class: 'num'}, b ? bmBtn(f2(b.warp_med), q.w, q.hg, 'warp_rate') : '—')));
  }
  t.append(tb);
  // The period switch governs By quality, Loom-wise and Break rate by beam: it sits above them and stays in view while
  // you scroll through them (sticky, 10 Nov 2026).
  const grp = el('div', {class: 'stack pergrp'}, el('div', {class: 'toolbar stickper'}, el('span', {class: 'note', text: 'Period'}), per, WPER === 'range' ? rngCtl(days0(), render) : null, WPER === 'range' ? el('span', {class: 'note', text: rngNote(days0())}) : null,
    // Round D: the floor's break rate (Σ breaks ÷ Σ picks × 100k, loom-days of 60 min or more, this width), this week vs last week
    wkPill(wkBy((D.loomdays || []).filter((x) => inW(x.width) && x.run >= 60), D.latest, (x) => x.date, (L) => { const a = agg(L); return a ? a.warpRate : null; }, 'down'),
      {what: 'Warp breaks', fmt: f2, unit: 'per 100k picks'})));
  s.append(grp);
  grp.append(card('By quality', `${f0(A && A.warp)} breaks in total for this period · select a quality to see its looms`, el('div', {class: 'tablebox'}, t)));

  const q = qs.find((x) => x.k === WQ);
  if (q) {
    const byL = new Map();
    for (const x of q.recs) { if (!byL.has(x.loom)) byL.set(x.loom, []); byL.get(x.loom).push(x); }
    const rows = [...byL.entries()].map(([loom, recs]) => ({loom, recs, A: agg(recs), beams: [...new Set(recs.map((x) => x.beam).filter(Boolean))]})).sort((a, b) => b.A.warp - a.A.warp);
    const med = (bench(q.w, q.hg) || {}).warp_med;
    if (typeof wkPut === 'function') wkPut('I1', rows[0] ? {what: `Loom ${rows[0].loom}`, warp: rows[0].A.warp, picks: rows[0].A.picks, med} : null);   // Round J
    grp.append(card(`Loom-wise: ${q.hg}, ${q.w} cm`, WPER === 'day' ? dfmt(D.latest) : WPER === 'range' ? rngNote(days0()) : 'Last 7 days',
      el('div', {class: 'toolbar'}, el('label', {for: 'warp-q', text: 'Quality'}), sel),
      table(['Loom', ['Warp breaks', 'total'], ['Rate', 'per 100k picks'], ['vs head group', '× median'], ['Efficiency', '%'], ['Days', 'ran'], 'Beam'],
        rows.map((r) => [el('span', {}, loomLink(r.loom, r.recs[r.recs.length - 1].date), el('div', {class: 'note', text: r.recs[0].type})), f0(r.A.warp), f2(r.A.warpRate), ok(med) && med > 0 ? f1(r.A.warpRate / med) + '×' : '—', f1(r.A.eff), new Set(r.recs.map((x) => x.date)).size, r.beams.join(', ') || '—']), [1, 2, 3, 4, 5])));
  }
  grp.append(...warpBeamCards(dates));
  s.append(trendCard('warp', q ? {kind: 'hg', w: String(q.w), hg: q.hg} : null));
  const wl = (D.warp || []).filter((x) => inW(x.width)), wq = (D.warp_quality || []).filter((x) => inW(x.width));
  s.append(el('div', {class: 'split'},
    card('Flagged looms', `Over ${S().warp_multiple}× head group median and over ${S().warp_min_rate} per 100k picks on ${S().warp_days} of the last 5 running days`,
      wl.length ? table(['Loom', 'Head group', ['Rate', '/100k picks'], ['Group median', '/100k picks'], 'Days', 'Beams'], wl.map((w) => [loomLink(w.loom, D.latest), el('span', {}, hgLink(w.hg, w.width, D.latest), ` · ${w.width} cm`), f2(w.rate), f2(w.median), `${w.days}/${w.of}`, w.beams.join(', ')]), [2, 3])
        : el('div', {class: 'empty', text: 'No single loom stands out from its head group yet.'})),
    card('Qualities breaking at over twice the width median', 'Last 14 days, breaks per 100k picks',
      wq.length ? table(['Head group', ['Median rate', '/100k picks'], ['Width median', '/100k picks']], wq.map((x) => [el('span', {}, hgLink(x.hg, x.width, D.latest), ` · ${x.width} cm`), f2(x.median), f2(x.width_median)]), [1, 2]) : el('div', {class: 'empty', text: 'None.'}))));
  return s;
}
