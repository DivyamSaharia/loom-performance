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
    const pB = ok(b.main_max) ? b.main_max : b.main, pT = ok(t.main) ? t.main : null;
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
// vis: {bar(item) -> a ranked-bar row, axis}: each listed loom's excess as a bar, with a tick at its own tolerance.
// vis.hg: {axis, val(items) -> the head group's figure, text(v)}: the same card's bars head-group-wise (12 Nov 2026).
function actionCard(id, title, note, items, cols, row, extra, vis) {
  const lim = SHOWALL[id] ? items.length : 8;
  const hgMode = vis && vis.hg && bv(id) === 'hg';
  let bars = null;
  if (vis && items.length && !hgMode) bars = hbars(items.slice(0, lim).map(vis.bar), {aria: `${title}: each loom's excess against its tolerance`, axis: vis.axis, labelW: 90});
  if (hgMode && items.length) {
    const by = new Map();
    for (const r of items) { const k = key(r.x.width, r.x.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
    const G = [...by.values()].map((R) => ({R, x0: R[0].x, v: vis.hg.val(R)})).sort((a, b) => b.v - a.v);
    bars = hbars(G.map((g) => ({label: `${g.x0.hg} · ${g.x0.width}`, v: g.v, color: 'var(--bad)', text: vis.hg.text(g.v), onClick: () => openHg(g.x0.hg, g.x0.width, D.latest),
      title: `${g.x0.hg}, ${g.x0.width} cm: ${vis.hg.text(g.v)} over ${g.R.length} loom${g.R.length === 1 ? '' : 's'} (${g.R.map((r) => r.x.loom).join(', ')})`})), {aria: `${title} by head group`, axis: vis.hg.axis, labelW: 130});
  }
  const legend = bars && !hgMode ? el('div', {class: 'legend'}, vis.tick === false ? null : el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad);opacity:.35'}), 'within tolerance'),
      el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad)'}), vis.past || 'past tolerance'), vis.tick === false ? null : el('span', {class: 'lg'}, legendShape('tick'), 'tolerance')) : null;
  const body = items.length ? [vis && vis.hg ? el('div', {class: 'toolbar'}, bvSeg(id)) : null, bars, legend,
    table(cols, items.slice(0, lim).map(row), cols.map((_, i) => i).filter((i) => i > 0)), moreButton(id, items.length, 8)]
    : [el('div', {class: 'empty', text: 'No loom off its benchmark or target on this day.'})];
  return card(`${title} · ${items.length} loom${items.length === 1 ? '' : 's'}`, note, ...body, extra || null);
}

// Priority note (10 Nov 2026): the looms to work on first on the day shown, ranked by what fixing them is worth a day.
// Lost picks (RPM below its reference, efficiency below the line) are valued at the day's fixed + attendance-following
// cost per pick: costs that run whether or not the loom weaves, so every pick lost leaves them on fewer picks. Excess air is
// valued at the compressor's rupees per ft³ that day; a loom holding up the floor pressure at its step of the floor ladder
// (to benchmark, or target where lower), mid-point of the energy range. Without a costing day the ranking falls back to
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
  for (const r of A.cfm) { const o = get(r.x); const ft3 = r.gap * r.x.run; o.ft3 += ft3; o.rsAir += cc ? ft3 * cc.rsFt3 : 0; o.why.push({k: 'Air', t: `${f1(r.now)} CFM, ${f1(r.gap)} over its reference`}); }
  const looms = (D.pressure.looms || []).map((l) => { const b = bench(l.width, l.hg) || {}, t = tgt(l.width, l.hg) || {}, bm = ok(b.main_max) ? b.main_max : (ok(b.main) ? b.main : null), tg = ok(t.main) ? t.main : null;
    return {loom: l.loom, hg: l.hg, width: l.width, main: l.main, ref: ok(bm) && ok(tg) ? Math.min(bm, tg) : ok(tg) ? tg : bm}; });
  const F = floorLadder(looms, n);
  let prev = [0, 0];
  const done = [];
  for (const [i, st] of (F.steps || []).entries()) {
    const before = done.slice(); done.push(st.loom);
    if (!(st.drop > 1e-9)) continue;
    const cur = saving(F.now, st.floor), part = ((cur[0] - prev[0]) + (cur[1] - prev[1])) / 2; prev = cur;
    const x = latestRecs().find((r) => r.loom === st.loom) || {loom: st.loom, hg: st.hg, width: st.width};
    const o = get(x); o.press += st.drop; o.rsPress += cc ? part * cc.kwh * cc.rate : 0;
    o.why.push({k: 'Main pressure', t: `${f2(st.from)} kgf/cm²; bring it to ${f2(st.to)} and the compressor setpoint drops ${f2(st.drop)} kgf/cm² more`, sub: `step ${i + 1} of the floor ladder${before.length ? `, after loom${before.length === 1 ? '' : 's'} ${before.join(', ')}` : ''}`});
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
  const sk = P.skipped.length ? el('p', {class: 'note co-skip', text: `${P.skipped.length} loom${P.skipped.length === 1 ? '' : 's'} left out: head group changed in the last 2 shifts (${P.skipped.map((c) => `loom ${c.loom}, shift ${c.shift}`).join('; ')}). ${P.skipped.length === 1 ? 'It comes' : 'They come'} back once 2 shifts pass on the new head group.`}) : null;
  if (!P.rows.length) return card('Work on these first', dfmt(D.latest), el('p', {class: 'empty', text: P.skipped.length ? 'No other loom is off its reference today.' : 'No loom is off its reference today. Nothing to chase.'}), sk, typeof fxBreakEvenChart === 'function' ? fxBreakEvenChart(D.latest) : null);
  // 12 Nov 2026 (Divyam): why as short points, impact as a total in rupees with its breakdown.
  const li = P.rows.map((o) => {
    const why = o.why.slice();
    if (o.beam) why.push({k: 'Warp breaks', t: `${f1(o.beam.warp_rate)} per 100k picks${o.beam.beam ? ` on beam ${o.beam.beam}` : ''}: check the beam before the loom`});
    const pricedOff = typeof fxOn === 'function' && fxOn() && typeof fxAll === 'function' && fxAll();
    const imp = [];   // [what, how worked out, ₹ or null]
    if (o.lakh > 0.0005) imp.push(['Lost picks', `${Math.round(o.lakh * 1e5).toLocaleString('en-IN')} picks × ${o.pickBy === 'realisation' ? `${f2(100 * o.rsPicks / (o.lakh * 1e5))} paise per pick of realisation on ${o.x.hg}` : o.pickBy === 'cost' ? `${f2(P.ppPick)} paise fixed + attendance cost per pick${pricedOff ? ' (this loom-day is not priced)' : ''}` : 'not valued: no costing for the day'}`, o.pickBy ? o.rsPicks : null]);
    if (o.ft3 > 0) imp.push(['Extra air', `${f0(o.ft3)} ft³ at the compressor's ₹ per ft³`, P.cc ? o.rsAir : null]);
    if (o.press > 0) imp.push(['Floor pressure', `setpoint down ${f2(o.press)} kgf/cm²`, P.cc ? o.rsPress : null]);
    const any = imp.some((r) => ok(r[2]));
    const tb = el('table', {class: 'impt nosort'}, el('tbody', {}, ...imp.map((r) => el('tr', {}, el('td', {text: r[0]}), el('td', {class: 'note', text: r[1]}), el('td', {class: 'num', text: ok(r[2]) ? rs(r[2]) : '—'}))),
      any && imp.length > 1 ? el('tr', {class: 'tot'}, el('td', {}, el('b', {text: 'Total'})), el('td', {class: 'note', text: 'a day'}), el('td', {class: 'num'}, el('b', {text: rs(o.rs)}))) : null));
    return el('li', {},
      el('div', {class: 'prio-head'}, loomLink(o.x.loom, D.latest, 'Loom ' + o.x.loom), el('span', {class: 'note', text: ` · ${o.x.hg || '—'}${o.x.width ? `, ${o.x.width} cm` : ''}`}),
        P.money ? el('b', {class: 'prio-rs', text: `${rs(o.rs)} a day`}) : null),
      el('div', {class: 'prio-sec'}, el('b', {text: 'Why'}), el('ul', {class: 'why'}, why.map((w) => el('li', {}, el('b', {text: w.k + ': '}), w.t, w.sub ? el('span', {class: 'note', text: ` (${w.sub})`}) : null)))),
      el('div', {class: 'prio-sec'}, el('b', {text: 'Impact'}), el('div', {class: 'tablebox'}, tb),
        o.rsReal != null && o.rsCost > 0 ? el('p', {class: 'note', text: `Also ${rs(o.rsCost)} of fixed and staff cost left on fewer picks; not added to the total, which values the lost picks at realisation.`}) : null));
  });
  const basis = (P.money ? `Ranked by rupees a day. ${ok(P.ppPick) ? `Lost picks are valued at ${f2(P.ppPick)} paise each, the fixed and attendance-following cost per pick on ${dfmt(P.cd.date)}: these costs run whether or not the loom weaves.` : 'Lost picks carry no rupee value here: the costing for this day is not in yet.'}${P.cc ? ` Air and pressure use the compressor's rupees on ${dfmt(P.cc.date)}.` : ''} Air and pressure savings overlap a little, as on the CFM and Pressure tabs.`
    : 'Ranked by lost picks, then extra air: the costing for this day is not in yet, so there are no rupee figures.')
    + (P.rows.some((o) => o.rsReal != null) ? ' With the realisation analysis on, lost picks on a priced loom-day are valued at that loom-day\'s realisation per pick instead (sale value at prevailing rate less standard yarn cost, As sold, its own quality), so a loom on a dearer cloth ranks higher; a loom-day the Realisation tab cannot price keeps the cost valuation and says so.' : '');
  return card('Work on these first', `${dfmt(D.latest)} · top ${P.rows.length} of ${P.total} loom${P.total === 1 ? '' : 's'} off their reference`,
    el('ol', {class: 'prio'}, li), sk, el('p', {class: 'note', text: basis + ' The cards below list every loom per metric.'}),
    typeof fxBreakEvenChart === 'function' ? fxBreakEvenChart(D.latest) : null);   // 12 Nov 2026: loom realisation against break-even (owner, analysis on)
}

function pageActions() {
  const s = el('section', {class: 'page', id: 'actions'});
  const day = kpiSet([D.latest]), pr = priorDates().length ? kpiSet(priorDates()) : null;
  s.append(el('div', {}, el('h2', {text: `${wLabel()} on ${dfmt(D.latest)}`}),
    el('p', {class: 'lead', text: 'Day totals across shifts A and B for the day shown, compared with the average of the days before it. Everything on this page uses the latest day only.'})));
  const kp = el('div', {class: 'kpis'});
  // each tile ends with a 7-day trend line (the last 7 complete days up to the day shown; the last point is that day)
  const kpi = (label, val, unit, d, sub, sp) => el('div', {class: 'card kpi'}, el('div', {class: 'label', text: label}), el('div', {class: 'val'}, val, unit ? el('small', {text: unit}) : null), sub ? el('div', {class: 'note', text: sub}) : null, d, sp || null);
  const last7 = (D.complete_days || []).filter((d) => d <= D.latest).slice(-7), K7 = last7.map((d) => ({d, k: kpiSet([d])}));
  const spk = (vals, fmt, label) => last7.length > 1 ? el('div', {}, spark(vals, {aria: `${label}, last ${last7.length} days`, title: `${label}: ` + last7.map((d, i) => `${dfmt(d)} ${fmt(vals[i])}`).join(' · ')}),
    el('div', {class: 'spk'}, el('span', {text: dfmt(last7[0])}), el('span', {text: `${last7.length} days`}), el('span', {text: dfmt(last7.at(-1))}))) : null;
  const sp = (k, fmt, label) => spk(K7.map((r) => r.k ? r.k[k] : null), fmt, label);
  if (day) {
    kp.append(
      kpi('Picks', f2(day.picks_l), 'lakh', delta(day.picks_l, pr && pr.picks_l, true, (x) => x.toFixed(2), ' lakh'), null, sp('picks_l', f2, 'Picks, lakh')),
      kpi('Efficiency', f1(day.eff), '%', delta(day.eff, pr && pr.eff, true, (x) => x.toFixed(1), ' pts'), null, sp('eff', f1, 'Efficiency, %')),
      kpi('Speed while running', f0(day.rpm), 'RPM', delta(day.rpm, pr && pr.rpm, true, (x) => x.toFixed(0), ' RPM'), null, sp('rpm', f0, 'RPM')),
      kpi('Air per 1,000 picks', f1(day.apk), 'ft³', delta(day.apk, pr && pr.apk, false, (x) => x.toFixed(1), ' ft³'), null, sp('apk', f1, 'Air per 1,000 picks, ft³')),
      kpi('Average CFM per loom', f1(day.cfm), 'CFM', delta(day.cfm, pr && pr.cfm, false, (x) => x.toFixed(1), ' CFM'), 'ft³/min while running, run-weighted', sp('cfm', f1, 'Average CFM per loom')),
      kpi('Total CFM consumption', f0(day.floor_cfm), 'CFM', delta(day.floor_cfm, pr && pr.floor_cfm, false, (x) => x.toFixed(0), ' CFM'), `24-h average draw of all looms · ${f0(day.air)} ft³ in the day`, sp('floor_cfm', f0, 'Total CFM')),
      kpi('Powered down', f1(day.off_h), 'loom-h', delta(day.off_h, pr && pr.off_h, false, (x) => x.toFixed(1), ' h'), null, sp('off_h', f1, 'Powered down, loom-hours')));
    const fl = (D.pressure.floor || []).slice(-1)[0];
    const fm = new Map((D.pressure.floor || []).map((f) => [f.date, f.floor]));
    if (fl) kp.append(kpi('Floor pressure', f2(fl.floor), 'kgf/cm²', el('span', {class: 'delta flat', text: `both widths · loom ${fl.loom}, ${fl.hg}`}), null, spk(last7.map((d) => fm.has(d) ? fm.get(d) : null), f2, 'Floor pressure, kgf/cm²')));
    if (typeof fxActionTiles === 'function') kp.append(...fxActionTiles(kpi, last7, spk));   // 12 Nov 2026: realisation per pick (owner) and cost per pick
  }
  s.append(kp);
  if (day) s.append(priorityCard());

  const un = D.unassigned || [];
  if (un.length) s.append(assignCard(un));

  const A = actionLists();
  const lostRpm = A.rpm.reduce((a, r) => a + r.impact, 0), lostEff = A.eff.reduce((a, r) => a + r.impact, 0);
  const exCfm = A.cfm.reduce((a, r) => a + r.gap, 0);
  s.append(el('div', {class: 'split'},
    actionCard('a-rpm', 'RPM', `Below benchmark by more than ${S().tol_rpm_pct}% or below your target · ${f2(lostRpm)} lakh picks lost`, A.rpm,
      ['Loom', ['RPM', 'picks/min'], ['Gap', 'RPM'], ['Lost', 'lakh picks']],
      (r) => [loomCell(r.x), mcell(r.now, r.bm, r.tg, f0, true, tolRpm, tolRpm, {w: r.x.width, hg: r.x.hg, m: 'rpm'}), f0(r.gap), f3(r.impact)], null,
      {axis: 'RPM below the reference', bar: (r) => { const ref = r.now + r.gap, tol = tolRpm(ref); return {label: 'Loom ' + r.x.loom, v: r.gap, tol, color: 'var(--bad)', text: `−${f0(r.gap)}`, onClick: () => openLoom(r.x.loom, r.x.date),
        title: `Loom ${r.x.loom} (${r.x.hg}): ${f0(r.now)} RPM against ${f0(ref)}, ${f0(r.gap)} below; tolerance ${f0(tol)} (${S().tol_rpm_pct}%)`}; },
        hg: {axis: 'Lost picks, lakh, by head group', val: (R) => R.reduce((a, r) => a + r.impact, 0), text: (v) => f3(v)}}),
    actionCard('a-eff', 'Efficiency', `Below ${f0(EFF_BAD())}%, any quality · ${f2(lostEff)} lakh picks short of ${f0(EFF_BAD())}%`, A.eff,
      ['Loom', ['Efficiency', '%'], ['Below line', 'points'], ['Short', 'lakh picks']],
      (r) => [el('div', {}, loomCell(r.x), r.beam ? el('span', {class: 'pill info', text: `likely beam · ${f1(r.x.warp_rate)} warp/100k picks`}) : null),
        effCell(r.now), f1(r.gap), f3(r.impact)], null,
      {axis: `Points below the ${f0(EFF_BAD())}% line (no tolerance)`, tick: false, past: 'below the line', bar: (r) => ({label: 'Loom ' + r.x.loom, v: r.gap, color: 'var(--bad)', text: `−${f1(r.gap)}`, onClick: () => openLoom(r.x.loom, r.x.date),
        title: `Loom ${r.x.loom} (${r.x.hg}): ${f1(r.now)}% efficiency, ${f1(r.gap)} points below the ${f0(EFF_BAD())}% line`}),
        hg: {axis: `Picks short of ${f0(EFF_BAD())}%, lakh, by head group`, val: (R) => R.reduce((a, r) => a + r.impact, 0), text: (v) => f3(v)}}),
    actionCard('a-cfm', 'CFM', `Above benchmark CFM by more than ${S().tol_air_pct}% or above your target · ${f1(exCfm)} CFM excess while running`, A.cfm,
      ['Loom', ['CFM', 'ft³/min running'], ['Air', 'ft³/1,000 picks'], ['Excess', 'CFM']],
      (r) => [loomCell(r.x), mcell(r.now, r.bm, r.tg, f1, false, tolAir, tolAir, {w: r.x.width, hg: r.x.hg, m: 'apk', view: 'cfm', rpm: r.x.rpm}), f1(r.x.apk), f1(r.gap)],
      el('p', {class: 'note', text: 'Benchmark CFM = the head group\'s benchmark air per 1,000 picks × this loom\'s RPM ÷ 1,000, so a loom is not rewarded for running slow.'}),
      {axis: 'CFM over the reference', bar: (r) => { const ref = r.now - r.gap, tol = tolAir(ref); return {label: 'Loom ' + r.x.loom, v: r.gap, tol, color: 'var(--bad)', text: `+${f1(r.gap)}`, onClick: () => openLoom(r.x.loom, r.x.date),
        title: `Loom ${r.x.loom} (${r.x.hg}): ${f1(r.now)} CFM against ${f1(ref)}, ${f1(r.gap)} over; tolerance ${f1(tol)} (${S().tol_air_pct}%)`}; },
        hg: {axis: 'Excess CFM while running, by head group', val: (R) => R.reduce((a, r) => a + r.gap, 0), text: (v) => '+' + f1(v)}}),
    actionCard('a-press', 'Pressure', `Main pressure more than ${PRESS_TOL} kgf/cm² above benchmark or target`, A.press,
      ['Loom', ['Main pressure', 'kgf/cm², day max'], ['Excess', 'kgf/cm²'], 'Floor'],
      (r) => [loomCell(r.x), mcell(r.now, r.bm, r.tg, f2, false, tolP, tolP, {w: r.x.width, hg: r.x.hg, m: pkey(r.b)}), f2(r.gap), r.atFloor ? el('span', {class: 'pill bad', text: 'sets floor'}) : ''], null,
      {axis: 'kgf/cm² over the reference', bar: (r) => ({label: 'Loom ' + r.x.loom, v: r.gap, tol: PRESS_TOL, color: 'var(--bad)', text: `+${f2(r.gap)}`, onClick: () => openLoom(r.x.loom, r.x.date),
        title: `Loom ${r.x.loom} (${r.x.hg}): ${f2(r.now)} kgf/cm² against ${f2(r.now - r.gap)}, ${f2(r.gap)} over; tolerance ${PRESS_TOL}`}),
        hg: {axis: 'Highest kgf/cm² over the reference, by head group', val: (R) => Math.max(...R.map((r) => r.gap)), text: (v) => '+' + f2(v)}}),
  ));
  s.append(keyline('Benchmarks still marked provisional are based on few days; treat their gaps as indicative.'));

  const al = (D.alerts || []).filter((a) => a.level === 'Critical');
  if (al.length) s.append(card('Data and floor flags', null, el('ul', {class: 'alerts'}, al.slice(0, 8).map((a) => el('li', {}, el('span', {class: 'pill bad', text: a.scope}), el('span', {}, linkify(a.msg)))))));
  return s;
}

function assignCard(un) {
  const box = el('div', {class: 'assign'});
  const groups = D.head_groups || [];
  for (const u of un) {
    const id = 'as-' + u.style.replace(/[^A-Za-z0-9]/g, '_').slice(0, 60);
    const sel = el('select', {id, 'aria-label': 'Head group for ' + u.style},
      el('option', {value: '', text: 'Choose head group…'}), groups.map((g) => el('option', {value: g, text: g})), el('option', {value: '__new', text: 'New head group…'}));
    const nw = el('input', {type: 'text', id: id + '-new', placeholder: 'New head group name', hidden: true});
    const btn = el('button', {class: 'primary', type: 'button', text: 'Save', disabled: true});
    const msg = el('div', {class: 'meta'});
    const prev = assigned[u.style];
    if (prev) { sel.value = prev.is_new ? '__new' : prev.head_group; if (prev.is_new) { nw.hidden = false; nw.value = prev.head_group; } msg.className = 'saved'; msg.textContent = `Saved as ${prev.head_group}. Applies on the next daily run.`; }
    const ready = () => { btn.disabled = !db || !(sel.value && (sel.value !== '__new' || nw.value.trim())); };
    sel.addEventListener('change', () => { nw.hidden = sel.value !== '__new'; ready(); });
    nw.addEventListener('input', ready);
    btn.addEventListener('click', async () => {
      const isNew = sel.value === '__new';
      // a head group picked by its fabric name is saved under its Style-map name, on the widths this style's looms have
      const ws = [...new Set((u.looms || []).map((l) => String(((D.machine || {})[l] || {}).width || '')).filter(Boolean))];
      const hg = isNew ? nw.value.trim() : hgRootAny(sel.value, ws);
      btn.disabled = true; msg.className = 'meta'; msg.textContent = 'Saving…';
      try {
        await db.collection('assignments').doc(u.style.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || 'blank').set(
          {style: u.style, head_group: hg, is_new: isNew, status: 'pending', at: new Date().toISOString()});
        msg.className = 'saved'; msg.textContent = `Saved as ${hg}. Applies on the next daily run.`;
      } catch (e) { msg.className = 'err'; msg.textContent = 'Could not save: ' + (e && e.message || 'no write access') + '. Assign it in the Config Sheet instead.'; ready(); }
    });
    box.append(el('div', {class: 'row'},
      el('div', {}, el('div', {class: 'name', text: u.style || '(blank)'}),
        el('div', {class: 'meta'}, u.costing ? `Costing sheet only, ${dfmt(u.first)}${u.last !== u.first ? '–' + dfmt(u.last) : ''}, not on a loom yet` : ['Loom ', u.looms.flatMap((l, i) => i ? [', ', loomLink(l, u.last)] : [loomLink(l, u.last)]), ` · ${dfmt(u.first)}${u.last !== u.first ? '–' + dfmt(u.last) : ''} · ${f1(u.run_h)} h run`])),
      el('div', {style: 'display:grid;gap:6px'}, sel, nw), el('div', {}, btn), msg));
  }
  const saved = un.filter((u) => assigned[u.style]).length, left = un.length - saved;
  const ak = un.some((u) => !u.costing) ? 'loom' : 'cost';
  const open = ASSIGN_OPEN[ak] == null ? left > 0 && ak === 'loom' : ASSIGN_OPEN[ak];
  const c = el('details', {class: 'card collapsible' + (left ? ' attn' : ''), open: open ? true : null},
    el('summary', {}, el('h3', {text: 'Needs a head group'}),
      el('span', {class: 'note', text: left ? `${left} of ${un.length} to assign${saved ? ` · ${saved} saved` : ''}${open ? '' : ' · open to assign'}` : `All ${un.length} saved · applied on the next daily run`})),
    el('p', {class: 'note', style: 'margin:0 0 6px', text: 'Until assigned, these style names count in totals and pressure but not in benchmarks or actions.'}), box);
  c.addEventListener('toggle', () => { ASSIGN_OPEN[ak] = c.open; });
  if (!db) c.append(el('p', {class: 'note', text: 'Saving is not connected yet (the app has no backend address). You can assign these in the Style map tab of the Config Sheet.'}));
  return c;
}

// ---------------------------------------------------------------- Quality
let QSORT = 'picks';   // R2: the owner can sort the head groups by profit per pick
function loomTable(recs) {
  const money = typeof fxOn === 'function' && fxOn();   // 12 Nov 2026: each loom's own realisation (owner, analysis on)
  const rows = recs.slice().sort((a, b) => a.loom - b.loom).map((x) => {
    const b = bench(x.width, x.hg) || {}, t = tgt(x.width, x.hg) || {};
    const cB = cfmOf(b.apk, x.width, x.hg, x.rpm);
    return [el('span', {}, loomLink(x.loom, x.date), el('div', {class: 'note', text: x.type})),
      mcell(x.rpm, b.rpm, t.rpm, f0, true, tolRpm, tolRpm, {w: x.width, hg: x.hg, m: 'rpm'}), effCell(x.eff),
      mcell(x.erpm, b.erpm, tgtE(x.width, x.hg), f0, true, tolRpm, tolRpm, {w: x.width, hg: x.hg, m: 'erpm'}),
      mcell(x.cfm, cB, t.cfm, f1, false, tolAir, tolAir, {w: x.width, hg: x.hg, m: 'apk', view: 'cfm', rpm: x.rpm}), mcell(x.apk, b.apk, null, f1, false, tolAir, null, {w: x.width, hg: x.hg, m: 'apk'}),
      mcell(x.main_max, ok(b.main_max) ? b.main_max : b.main, t.main, f2, false, tolP, tolP, {w: x.width, hg: x.hg, m: pkey(b)}),
      el('span', {}, f0(x.warp), el('div', {class: 'note', text: f1(x.warp_rate) + ' /100k'})), x.beam || '—', f1(x.run / 60),
      ...(money ? [fxLoomRealCell(x)] : [])];
  });
  return table(['Loom', ['RPM', 'picks/min'], ['Eff', '%'], ['Eff. RPM', 'RPM × eff'], ['CFM', 'ft³/min'], ['Air', 'ft³/1,000 picks'], ['Main', 'kgf/cm², max'], ['Warp', 'breaks'], 'Beam', ['Run', 'h'],
    ...(money ? [['Realisation', '₹ in the day · paise/pick']] : [])], rows, money ? [1, 2, 3, 4, 5, 6, 7, 9, 10] : [1, 2, 3, 4, 5, 6, 7, 9]);
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
    .sort((a, b) => (a.hg === 'Unassigned') - (b.hg === 'Unassigned') || (money && QSORT === 'profit' ? fxHgSort(D.latest, b.w, b.hg) - fxHgSort(D.latest, a.w, a.hg) : 0) || a.w.localeCompare(b.w) || b.A.picks - a.A.picks);
  s.append(qualityHeat(groups.filter((g) => g.hg !== 'Unassigned')));
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
      el('td', {class: 'mvc'}, mcell(A.main_max, ok(b.main_max) ? b.main_max : b.main, tg.main, f2, false, tolP, tolP, {w: g.w, hg: g.hg, m: pkey(b)})),
      el('td', {class: 'num'}, f0(A.warp), el('div', {class: 'note', text: f1(A.warpRate) + ' /100k'})),
      el('td', {}, g.hg === 'Unassigned' ? el('span', {class: 'pill muted', text: 'assign a head group'}) : benchTag(bench(g.w, g.hg))),
      el('td', {}, btn)));
    if (open) tb.append(el('tr', {class: 'drillrow'}, el('td', {colspan: hdr.length}, el('div', {class: 'note', style: 'margin-bottom:6px', text: `${g.hg}, ${g.w} cm: each loom against the head group benchmark and target`}), loomTable(g.recs))));
  }
  t.append(tb);
  const sortSeg = money ? el('div', {class: 'toolbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Sort head groups'}, [['picks', 'By picks'], ['profit', 'By profit per pick']].map(([v, l]) => el('button', {type: 'button', 'aria-pressed': QSORT === v ? 'true' : 'false', text: l, onclick: () => { QSORT = v; render(); }}))),
    el('span', {class: 'note', text: 'Realisation and profit per pick are the day\'s, As sold, from the Realisation tab; the pill is the margin over conversion cost.'})) : null;
  MREF = null;
  const nTq = groups.filter((g) => { const x = tgt(g.w, g.hg); return x && (ok(x.rpm) || ok(x.cfm) || ok(x.main)); }).length;
  const qb = (v, text) => el('button', {type: 'button', 'aria-pressed': QREF === v ? 'true' : 'false', text, onclick: () => { QREF = v; try { localStorage.setItem('w2-q-ref', v); } catch (e) {} render(); }});
  s.append(card('Current vs reference', `Against the ${HEAT_REF[QREF]} · CFM references are air per 1,000 picks at the RPM actually run`,
    el('div', {class: 'toolbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Reference'}, qb('bm', 'Benchmark'), qb('best', 'Best'), qb('tgt', `Target (${nTq} set)`))),
    sortSeg, el('div', {class: 'tablebox'}, t), keyline()));
  const g0 = groups.find((g) => g.hg !== 'Unassigned');
  s.append(trendCard('quality', g0 ? {kind: 'hg', w: String(g0.w), hg: g0.hg} : null));
  const dr = (D.alerts || []).filter((a) => a.scope === 'Quality' && (W === 'all' || a.msg.includes(W + ' cm')));
  s.append(card('Drift alerts', 'Latest day vs the 7 days before, and week on week once 14 days exist', dr.length ? el('ul', {class: 'alerts'}, dr.map((a) => el('li', {}, el('span', {class: 'pill warn', text: a.level}), el('span', {}, linkify(a.msg))))) : el('div', {class: 'empty', text: 'No drift on this width.'})));
  return s;
}

// Heat grid at the top of Quality: head groups × metrics, each cell the day's % gap from the chosen reference.
// Benchmark / Best / Target switch kept on this device (w2-heat-ref). Efficiency is always against the line, warp breaks
// has a benchmark (its median) only; a cell with no reference is grey and says why. Follows the width and the day picker.
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
    const v = m === 'rpm' ? t.rpm : m === 'erpm' ? tgtE(w, hg) : m === 'cfm' ? t.cfm : m === 'main' ? t.main : null;
    return m === 'apk' ? {none: 'no target'} : ok(v) ? {v, name: m === 'erpm' ? `target (${f0(ERPM_TGT * 100)}% of target RPM)` : 'target'} : {none: 'no target'};
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
      if (R.none) return {none: R.none, title: `${label}: ${R.none} for ${g.hg}`};
      const G = gapPct(now, R.v, hi);
      if (!G) return {none: 'no figure', title: `${label}: no figure for ${g.hg} on this day`};
      const txt = `${Math.abs(G.p) < 0.05 ? '±' : G.p > 0 ? '+' : '−'}${Math.abs(G.p).toFixed(1)}%`;
      return {text: txt, level: heatLevel(G.p), tone: Math.abs(G.p) < 0.05 ? 'none' : G.worse ? 'bad' : 'good',
        title: `${g.hg}, ${g.w} cm · ${label} ${fmt(now)} ${unit} against ${R.name} ${fmt(R.v)} (${txt}). Click to open the head group.`,
        onClick: () => openHg(g.hg, g.w, D.latest)};
    })]}));
  const nT = groups.filter((g) => { const t = tgt(g.w, g.hg); return t && (ok(t.rpm) || ok(t.cfm) || ok(t.main)); }).length;
  const b = (v, text) => el('button', {type: 'button', 'aria-pressed': QHM === v ? 'true' : 'false', text, onclick: () => { QHM = v; try { localStorage.setItem('w2-heat-ref', v); } catch (e) {} render(); }});
  return card('Gap to the reference, by head group', `% of the ${HEAT_REF[QHM]} · ${dfmt(D.latest)} · ${wLabel()}`,
    el('div', {class: 'toolbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'Reference for the heat grid'}, b('bm', 'Benchmark'), b('best', 'Best'), b('tgt', `Target (${nT} set)`))),
    rows.length ? heatTable([...(money ? [{label: 'Loom realisation gap', unit: '₹ per loom per day'}, {label: 'Loom realisation gap', unit: '₹ total in the day'}] : []), ...HEAT_M.map(([, label, unit]) => ({label, unit}))], rows, {first: 'Head group'}) : el('div', {class: 'empty', text: 'No head group ran on this width on this day.'}),
    heatKey(`full colour at ${HEAT_FULL}% or more`),
    el('p', {class: 'note', text: `Each cell is the head group's figure for the day (looms that ran at least 60 min) against its ${HEAT_REF[QHM]}, as a % of it: + above, − below. Efficiency is always against the ${f0(EFF_BAD())}% line, and warp breaks against the head group's median rate (it has no best or target). CFM is compared at the RPM the head group ran. Hover a cell for the figures; click it to open the head group.${money ? ` Loom realisation gap (As sold) is the rupees above (+, green) or below (−, red) the same loom-days re-worked at the ${HEAT_REF[QHM]} effective RPM; hover for both figures.` : ''}`}));
}

// ---------------------------------------------------------------- Pressure
function compWork(p) { return Math.pow((p * KGF + PATM) / PATM, 0.2857) - 1; }
function saving(pNow, pNew) {
  const drop = D.pressure.line_drop_kgf || 0.2 / KGF;
  if (!ok(pNow) || !ok(pNew) || pNew >= pNow) return [0, 0];
  return [POWER_PCT / 100 * (pNow - pNew), 1 - compWork(pNew + drop) / compWork(pNow + drop)];
}
function pressLooms() {
  // every loom that ran ≥60 min in a shift on the latest day, both widths (one compressor)
  return (D.pressure.looms || []).map((l) => {
    const b = bench(l.width, l.hg) || {}, t = tgt(l.width, l.hg) || {};
    const bm = ok(b.main_max) ? b.main_max : (ok(b.main) ? b.main : null);
    const tg = ok(t.main) ? t.main : null;
    const best = l.hg !== 'Unassigned' ? bestVal(l.width, l.hg, pkey(b)) : null;
    return {...l, bm, best, tg, ref: refOf(PMODE, bm, best, tg)};
  });
}
// Reference for the "if every loom ran at…" figures: benchmark, best loom-day or target (falling back to the benchmark where unset).
function refOf(mode, bm, best, tg) { return mode === 'tgt' ? (ok(tg) ? tg : bm) : mode === 'best' ? (ok(best) ? best : bm) : bm; }
const REF_NOTE = {bm: 'Head group benchmark', best: 'Best loom-day where there is one, benchmark otherwise', tgt: 'Target where you set one, benchmark otherwise'};
function modeSeg(cur, set, nT, label, short) {
  const b = (v, text) => el('button', {type: 'button', 'aria-pressed': cur === v ? 'true' : 'false', text, onclick: () => { set(v); render(); }});
  return el('div', {class: 'seg', role: 'group', 'aria-label': label}, b('bm', short ? 'Benchmark' : 'Bring looms to benchmark'), b('best', short ? 'Best' : 'To best'), b('tgt', `${short ? 'Target' : 'To target'} (${nT} set)`));
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
  const drop = P.line_drop_kgf || 0.2 / KGF;
  s.append(el('div', {}, el('h2', {text: `Main pressure, all 72 looms, ${dfmt(D.latest)}`}),
    el('p', {class: 'lead', text: `One compressor serves both widths, so this page always covers both. The loom with the highest main pressure sets the floor; the compressor must give that plus ${f2(drop)} kgf/cm² (0.2 bar) line drop. Benchmark pressure is the 10th percentile of each head group's daily highest main pressure on that width. Click any benchmark or best figure to see the loom runs behind it.`})));
  const looms = pressLooms();
  const floorNow = looms.length ? Math.max(...looms.map((l) => l.main)) : null;
  const floorNew = looms.length ? Math.max(...looms.map(lowered)) : null;
  const [rule, adia] = saving(floorNow, floorNew);
  const holders = looms.filter((l) => Math.abs(lowered(l) - floorNew) < 1e-9);
  const why = (l) => !ok(l.ref) ? 'has no benchmark yet' : l.main <= l.ref + 1e-9 ? 'is already at or below its reference' : 'is at its reference';
  const holdNote = holders.length ? 'Held by ' + holders.slice(0, 3).map((l) => `loom ${l.loom} (${l.hg}), which ${why(l)}`).join('; ') + (holders.length > 3 ? ` and ${holders.length - 3} more` : '') : '';
  const nT = Object.keys(TG).filter((k) => ok(TG[k].main)).length;
  const mode = modeSeg(PMODE, (v) => { PMODE = v; }, nT, 'Reference pressure');
  const sumBox = el('div', {class: 'kpis'},
    el('div', {}, el('div', {class: 'kpi'}, el('div', {class: 'label', text: 'Floor now'}), el('div', {class: 'big'}, f2(floorNow), el('small', {text: 'kgf/cm²'})), el('div', {class: 'note', text: fl ? `loom ${fl.loom}, ${fl.hg}` : ''}))),
    el('div', {}, el('div', {class: 'kpi'}, el('div', {class: 'label', text: 'Floor after the work'}), el('div', {class: 'big'}, f2(floorNew), el('small', {text: 'kgf/cm²'})), el('div', {class: 'note', text: holdNote}))),
    el('div', {}, el('div', {class: 'kpi'}, el('div', {class: 'label', text: 'Compressor setpoint'}), el('div', {class: 'big'}, f2(floorNow + drop), el('span', {class: 'arrow', text: '→'}), f2(floorNew + drop), el('small', {text: 'kgf/cm²'})))),
    el('div', {}, el('div', {class: 'kpi'}, el('div', {class: 'label', text: 'Compressor energy saved'}), el('div', {class: 'big'}, `${f1(rule * 100)}–${f1(adia * 100)}`, el('small', {text: '%'})), el('div', {class: 'note', text: `${f1(POWER_PCT)}% per kgf/cm² rule to adiabatic estimate`}))));
  s.append(card('If every loom ran at its reference pressure', PMODE === 'bm' ? 'Head group benchmark (10th percentile)' : REF_NOTE[PMODE], el('div', {class: 'toolbar'}, mode), sumBox,
    el('p', {class: 'note', text: 'Each loom above its reference is brought down to it; looms already below stay where they are. Looms with no head group or no benchmark stay as they are.'})));
  s.append(pressureMoneyCard(floorNow, floorNew, rule, adia));
  s.append(floorLadderCard(looms, floorNew));

  // chart: current vs benchmark and target, looms sorted by current pressure
  const inPW = (w) => PW === 'all' || String(w) === PW, pwNote = PW === 'all' ? '' : ` · ${PW} cm only, floor lines still cover all ${looms.length}`;
  const sorted = looms.filter((l) => inPW(l.width)).sort((a, b) => b.main - a.main || a.loom - b.loom);
  const shown = PALL ? sorted : sorted.slice(0, 25);
  // 12 Nov 2026: Head-group-wise = each head group's highest main pressure now against its benchmark, best and target
  const phg = bv('pressure') === 'hg';
  const pHg = () => { const by = new Map(); for (const l of sorted) { const k = key(l.width, l.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(l); }
    return [...by.values()].map((L) => { const l0 = L.reduce((a, b) => b.main > a.main ? b : a); return {...l0, label: `${l0.hg} · ${l0.width}`, open: () => openHg(l0.hg, l0.width, D.latest), tip: `${l0.hg}, ${l0.width} cm: highest ${f2(l0.main)} kgf/cm² on loom ${l0.loom} · ${L.length} loom${L.length === 1 ? '' : 's'}`}; })
      .sort((a, b) => b.main - a.main || a.label.localeCompare(b.label)); };
  const pRows = phg ? pHg() : shown;
  s.append(card(`Current vs benchmark, best and target, ${phg ? 'by head group' : 'by loom'}`, (phg ? `${pRows.length} head groups, highest first` : PALL ? `All ${sorted.length} looms` : `Highest 25 of ${sorted.length} looms`) + pwNote,
    el('div', {class: 'toolbar'}, bvSeg('pressure'), pressWidthSeg()),
    sortableChart('pressure', pRows, [{v: 'name', label: phg ? 'Head group' : 'Loom', get: (r) => r.label || r.loom}, {v: 'now', label: 'Now', get: (r) => r.main}, {v: 'ref', label: 'Reference', get: (r) => ok(r.ref) ? r.ref : null}, {v: 'gap', label: 'Excess over reference', get: (r) => ok(r.ref) ? r.main - r.ref : null}],
      (R) => el('div', {class: 'tablebox'}, pressureChart(R, floorNow, floorNew))),
    el('div', {class: 'legend'}, el('span', {class: 'lg'}, legendShape('bar'), 'Current'), el('span', {class: 'lg'}, legendShape('tick'), 'Benchmark'),
      el('span', {class: 'lg'}, legendShape('circle'), 'Best'), el('span', {class: 'lg'}, legendShape('diamond'), 'Target'), el('span', {class: 'lg'}, legendShape('dot'), 'Floor now'), el('span', {class: 'lg'}, legendShape('dash'), 'Floor after the work')),
    phg ? null : el('button', {class: 'link', type: 'button', text: PALL ? 'Show the highest 25' : `Show all ${sorted.length} looms`, onclick: () => { PALL = !PALL; render(); }})));

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
      const [r1, r2] = saving(floorNow, only);
      return {l0, L, hi, avg, only, r1, r2};
    }).sort((a, b) => b.hi - a.hi);
    body = table(['Head group', ['Looms', 'ran'], ['Highest now', 'kgf/cm²'], ['Average now', 'kgf/cm²'], ['Reference', `kgf/cm², ${REF_NAME[PMODE]}`], ['Floor if only this quality is fixed', 'kgf/cm²'], ['Energy saved', '% of compressor'], ['Worth', '₹ a day · paise per pick']],
      rows.map((r) => [el('span', {}, hgLink(r.l0.hg, r.l0.width, D.latest), el('div', {class: 'note', text: r.l0.width + ' cm'})), r.L.length, f2(r.hi), f2(r.avg), refCell(PMODE, r.l0.bm, r.l0.best, r.l0.tg, f2, () => bmBtn(f2(r.l0.bm), r.l0.width, r.l0.hg, pkey(bench(r.l0.width, r.l0.hg))), () => bmBtn(f2(r.l0.best), r.l0.width, r.l0.hg, pkey(bench(r.l0.width, r.l0.hg)), {kind: 'best'})),
        r.only < floorNow - 1e-9 ? el('b', {text: f2(r.only)}) : f2(r.only), r.r2 > 0 ? `${f1(r.r1 * 100)}–${f1(r.r2 * 100)}` : '0', r.r2 > 0 ? moneyRange(r.r1, r.r2) : '0']), [1, 2, 3, 4, 5, 6, 7]);
  }
  s.append(card('Reference vs running pressure', (PVIEW === 'quality' ? 'The floor only drops when every quality at the top comes down, so most single-quality rows show no saving on their own.' : 'Highest pressure each loom ran at in the day') + pwNote,
    el('div', {class: 'toolbar'}, view, pressWidthSeg(), modeSeg(PMODE, (v) => { PMODE = v; }, nT, 'Reference pressure', true)), body));

  const ps = looms.slice().sort((a, b) => b.main - a.main || a.loom - b.loom)[0];
  s.append(trendCard('pressure', ps ? (PVIEW === 'loom' ? {kind: 'loom', loom: ps.loom} : {kind: 'hg', w: String(ps.width), hg: ps.hg}) : null));
  s.append(el('div', {class: 'split'},
    card('Floor by day', 'Highest main pressure per day and shift, kgf/cm²',
      table(['Date', ['Floor', 'kgf/cm²'], ['Shift A', 'kgf/cm²'], ['Shift B', 'kgf/cm²'], 'Set by'], (P.floor || []).slice().reverse().slice(0, 14).map((f) => [dfmt(f.date), f2(f.floor), f2(f.A), f2(f.B), el('span', {}, loomLink(f.loom, f.date, 'Loom ' + f.loom), ' · ', hgLink(f.hg, (D.machine[f.loom] || {}).width, f.date))]), [1, 2, 3])),
    card('Head groups holding the floor up', 'At the top on at least half of the last 14 days. Drop decisions are yours.',
      (P.setters || []).length ? table(['Head group', 'Days at top', ['Floor → without it', 'kgf/cm²'], ['Saving', '% of compressor'], ['Worth', '₹ a day · paise per pick'], ['Share of picks', '%'], 'Recommendation'],
        P.setters.map((x) => [el('span', {}, hgLink(x.hg, null, D.latest), el('div', {class: 'note'}, 'Looms ', (x.looms || []).flatMap((l, i) => [i ? ', ' : '', loomLink(l.loom, D.latest)]))), `${x.days}/${x.of}`, `${f2(x.floor)} → ${f2(x.without)}`, setPct(x), setRs(x), f1(x.share),
          el('div', {}, el('span', {class: 'pill warn', text: x.rec}), el('p', {class: 'why', text: x.why}))]), [3, 4, 5])
        : el('div', {class: 'empty', text: 'None yet.'}))));
  return s;
}

// The floor ladder: the loom setting the floor is brought down to its reference, then the next one, five times over,
// showing how far the floor (and so the compressor setpoint) drops at each step. Uses the reference switched above.
function floorLadderCard(looms, floorNew) {
  const F = floorLadder(looms.map((l) => ({loom: l.loom, hg: l.hg, width: l.width, main: l.main, ref: l.ref})), 5);
  if (!ok(F.now)) return card('Floor ladder', null, el('div', {class: 'empty', text: 'No loom pressure for this day.'}));
  const items = [{label: 'Now', v: F.now, total: true, tip: `Floor now ${f2(F.now)} kgf/cm²`},
    ...F.steps.map((st, i) => ({label: `${i + 1}. Loom ${st.loom}`, v: -st.drop, tip: `Step ${i + 1}: loom ${st.loom} (${st.hg}) from ${f2(st.from)} to ${f2(st.to)}; floor ${f2(st.before)} → ${f2(st.floor)}`})),
    {label: F.steps.length ? `After ${F.steps.length}` : 'Now', v: F.after, total: true, tip: `Floor after ${F.steps.length} step${F.steps.length === 1 ? '' : 's'}: ${f2(F.after)} kgf/cm²`}];
  const why = F.held ? `Loom ${F.held.loom} (${F.held.hg}) holds the floor at ${f2(F.held.main)}: it has ${F.held.why === 'no reference' ? 'no reference yet' : 'come down to its reference already, or runs below it'}.` : '';
  const rows = F.steps.map((st, i) => { const [a, b] = saving(F.now, st.floor);
    return [el('span', {}, `${i + 1}. `, loomLink(st.loom, D.latest, 'Loom ' + st.loom)), el('span', {}, hgLink(st.hg, st.width, D.latest), el('div', {class: 'note', text: st.width + ' cm'})), `${f2(st.from)} → ${f2(st.to)}`, f2(st.floor), st.drop > 1e-9 ? '−' + f2(st.drop) : '0', b > 0 ? `${f1(a * 100)}–${f1(b * 100)}` : '0', b > 0 ? moneyRange(a, b) : '0']; });
  return card('Floor ladder', `The ${F.steps.length || 'no'} loom${F.steps.length === 1 ? '' : 's'} to fix first, in order · ${PMODE === 'bm' ? 'to benchmark' : PMODE === 'best' ? 'to best' : 'to target'} · kgf/cm²`,
    F.steps.length ? waterfall(items, 'Floor pressure after each loom is brought down to its reference', null, {unit: 'kgf/cm²', dec: 2}) : el('p', {class: 'empty', text: why || 'The floor cannot come down.'}),
    F.steps.length ? el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--muted-2);opacity:.75'}), 'floor'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--good)'}), 'drop from fixing that loom')) : null,
    F.steps.length ? table(['Step and loom', 'Head group', ['Loom pressure', 'now → reference'], ['Floor after', 'kgf/cm²'], ['Drop', 'kgf/cm²'], ['Energy saved so far', '% of compressor'], ['Worth so far', '₹ a day · paise per pick']], rows, [2, 3, 4, 5, 6]) : null,
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
// refChart with a sort bar (12 Nov 2026): name, now, reference, excess over it.
function refBars(rows, o) {
  const name = (r) => r.label || (r.x ? r.x.loom : '');
  const ref = (r) => ok(r.ref) ? r.ref : ok(r.tg) ? r.tg : ok(r.best) ? r.best : ok(r.bm) ? r.bm : null;
  return sortableChart(o.sortId || o.aria, rows, [{v: 'name', label: r0(rows) ? 'Head group' : 'Loom', get: name}, {v: 'now', label: 'Now', get: (r) => ok(r.v) ? r.v : null},
    {v: 'ref', label: 'Reference', get: ref}, {v: 'gap', label: o.gapLabel || 'Excess over reference', get: (r) => ok(r.ex) ? r.ex : ok(ref(r)) && ok(r.v) ? r.v - ref(r) : null}],
    (R) => el('div', {class: 'tablebox'}, refChart(R, o)));
}
const r0 = (rows) => rows.length && !rows[0].x;
const chartLegend = (what, exText) => el('div', {class: 'legend'}, el('span', {class: 'lg'}, legendShape('bar'), `Current ${what}`), el('span', {class: 'lg'}, legendShape('tick'), `Benchmark ${what}`),
  el('span', {class: 'lg'}, legendShape('circle'), `Best ${what}`), el('span', {class: 'lg'}, legendShape('diamond'), `Target ${what}`), el('span', {text: exText}));
function pageCfm() {
  const s = el('section', {class: 'page', id: 'cfm'});
  s.append(el('div', {}, el('h2', {text: `CFM, ${wLabel()} looms, ${dfmt(D.latest)}`}),
    el('p', {class: 'lead', text: 'The compressor supplies the sum of every loom\'s air, so each loom brought down to its reference cuts total demand directly. Benchmark CFM is the head group\'s benchmark air per 1,000 picks (10th percentile) at the RPM the loom actually ran, so a loom is not rewarded for running slow; best CFM is the best loom-day\'s air per 1,000 picks at that RPM. Click any benchmark or best figure to see the loom runs behind it.'})));
  const recs = latestRecs().map((x) => ({x, ...cfmRefs(x)}));
  const day = cfmDay(D.latest);
  const cc = compDay(D.latest);
  const nT = Object.keys(TG).filter((k) => ok(TG[k].cfm)).length;
  const mode = modeSeg(CMODE, (v) => { CMODE = v; }, nT, 'Reference CFM');
  const above = recs.filter((r) => ok(r.ref) && r.x.cfm > r.ref + tolAir(r.ref));
  const noRef = recs.filter((r) => !ok(r.ref)).length;
  const saved = day ? day.now - day.after : null, pct = day && day.now ? 100 * saved / day.now : null;
  const kp = (label, big, unit, note) => el('div', {}, el('div', {class: 'kpi'}, el('div', {class: 'label', text: label}), el('div', {class: 'big'}, ...big, el('small', {text: unit})), note ? el('div', {class: 'note', text: note}) : null));
  s.append(card('If every loom ran at its reference CFM', (CMODE === 'bm' ? 'Head group benchmark' : REF_NOTE[CMODE]) + ' at each loom\'s own RPM',
    el('div', {class: 'toolbar'}, mode),
    el('div', {class: 'kpis'},
      kp('Total CFM now', [f0(day && day.now)], 'CFM', `24-h average draw of ${day ? day.n : 0} looms · ${f0(day && day.air)} ft³ in the day`),
      kp('Total CFM after the work', [f0(day && day.after)], 'CFM', 'same picks, each loom at or below its reference'),
      kp('Air saved', [f0(saved)], 'CFM', ok(saved) ? `${f0(saved * 1440)} ft³ a day` : null),
      kp('Compressor energy saved', [f1(pct)], '%', 'of compressor air; energy follows air on a variable-speed compressor')),
    el('p', {class: 'note', text: `Each loom above its reference is brought down to it; looms already below stay where they are. ${above.length} loom${above.length === 1 ? ' is' : 's are'} above reference by more than ${S().tol_air_pct}%.${noRef ? ` ${noRef} loom${noRef === 1 ? ' has' : 's have'} no head group or benchmark and stay as they are.` : ''} Pressure savings are on the Pressure tab and are not added here.`})));
  s.append(cfmMoneyCard(day, D.latest));
  s.append(compPowerCard());   // 12 Nov 2026 (Divyam): third from the top
  s.append(cfmStackCard());

  // 12 Nov 2026: one card, Loom-wise / Head-group-wise (the head-group bars were their own card before)
  const sorted = recs.slice().sort((a, b) => b.ex - a.ex || b.x.cfm - a.x.cfm || a.x.loom - b.x.loom);
  const shown = CALL ? sorted : sorted.slice(0, 25);
  const chg = bv('cfm') === 'hg', H = chg ? cfmHgRows(recs) : null;
  s.append(card(`Current vs benchmark, best and target, ${chg ? 'by head group' : 'by loom'}`, chg ? `At each head group's own RPM · most excess over the ${({bm: 'benchmark', best: 'best', tgt: 'target'})[CMODE]} first` : CALL ? `All ${sorted.length} looms, most excess first` : `25 looms with the most excess, of ${sorted.length}`,
    el('div', {class: 'toolbar'}, bvSeg('cfm')),
    chg ? (H.rows.length ? refBars(H.rows, {step: 5, labelEvery: 10, axis: 'CFM, ft³/min while running', axisShort: 'CFM while running', aria: 'CFM by head group: current against benchmark, best and target', dec: 1, exSign: '+'}) : el('div', {class: 'empty', text: 'No head group with a reference ran on this day.'}))
      : refBars(shown.map((r) => ({...r, v: r.x.cfm})), {step: 5, labelEvery: 10, axis: 'CFM, ft³/min while running', axisShort: 'CFM while running', aria: 'CFM per loom while running: current against benchmark, best and target', dec: 1, exSign: '+'}),
    chartLegend('CFM', chg ? '+n after the value = excess CFM over the reference picked at the top' : '+n after the value = excess CFM over the reference'),
    chg ? el('p', {class: 'note', text: `Run-weighted CFM of the looms that ran at least 60 min. Benchmark and best are the head group's air per 1,000 picks at its own RPM.${H.none.length ? ` No reference: ${H.none.join(', ')}.` : ''} Click a row to open the head group.`})
      : el('button', {class: 'link', type: 'button', text: CALL ? 'Show the top 25' : `Show all ${sorted.length} looms`, onclick: () => { CALL = !CALL; render(); }})));

  const view = el('div', {class: 'seg', role: 'group', 'aria-label': 'View'},
    el('button', {type: 'button', 'aria-pressed': CVIEW === 'loom' ? 'true' : 'false', text: 'Loom-wise', onclick: () => { CVIEW = 'loom'; render(); }}),
    el('button', {type: 'button', 'aria-pressed': CVIEW === 'quality' ? 'true' : 'false', text: 'Quality-wise', onclick: () => { CVIEW = 'quality'; render(); }}));
  let body;
  if (CVIEW === 'loom') {
    const fp = floorPicks(D.latest);   // 12 Nov 2026: paise per pick on the whole floor's picks, so the rows add up to the plant's saving
    const totRs = cc ? sorted.reduce((a, r) => a + (r.ex > 0.05 ? r.ex * r.x.run * cc.rsFt3 : 0), 0) : null;
    body = table(['Loom', 'Head group', ['RPM', 'picks/min'], ['Now', 'CFM'], ['Reference', `CFM, ${REF_NAME[CMODE]}`], ['Excess', 'CFM over reference'], ['Air', 'ft³/1,000 picks'], ['Excess air', 'ft³ in the day'], ['Worth', '₹ a day · paise per pick of plant cost'], 'Status'],
      [...sorted.map((r) => {
        const st = ok(r.ref) && r.x.cfm > r.ref + tolAir(r.ref) ? el('span', {class: 'pill warn', text: 'above reference'}) : !ok(r.ref) ? el('span', {class: 'pill muted', text: 'no reference'}) : '';
        return [loomLink(r.x.loom, r.x.date), el('span', {}, hgLink(r.x.hg, r.x.width, r.x.date), el('div', {class: 'note', text: `${r.x.width} cm ${r.x.type}`})), f0(r.x.rpm), f1(r.x.cfm),
          refCell(CMODE, r.bm, r.best, r.tg, f1, () => bmBtn(f1(r.bm), r.x.width, r.x.hg, 'apk', {view: 'cfm', rpm: r.x.rpm}), () => bmBtn(f1(r.best), r.x.width, r.x.hg, 'apk', {kind: 'best', view: 'cfm', rpm: r.x.rpm})),
          r.ex > 0.05 ? '+' + f1(r.ex) : '0', f1(r.x.apk), r.ex > 0.05 ? f0(r.ex * r.x.run) : '0', r.ex > 0.05 && cc ? withPP(rs(r.ex * r.x.run * cc.rsFt3), r.ex * r.x.run * cc.rsFt3, fp) : (cc ? '₹0' : '—'), st];
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
    const fp = floorPicks(D.latest), totRs = cc ? tot * cc.rsFt3 : null;
    const airRef = (r) => CMODE === 'best' && ok(r.ba) ? bmBtn(f1(r.ba), r.x0.width, r.x0.hg, 'apk', {kind: 'best'}) : ok(r.b.apk) && r.x0.hg !== 'Unassigned' ? bmBtn(f1(r.b.apk), r.x0.width, r.x0.hg, 'apk') : '—';
    body = table(['Head group', ['Looms', 'ran'], ['RPM', 'picks/min'], ['CFM now', 'ft³/min running'], ['Reference', `CFM, ${REF_NAME[CMODE]}`], ['Air now', 'ft³/1,000 picks'], ['Air reference', CMODE === 'best' ? 'ft³/1,000 picks, best' : 'ft³/1,000 picks, benchmark'], ['Looms above', 'reference'], ['Saved if fixed', 'CFM, 24-h draw'], ['Worth', '₹ a day · paise per pick of plant cost'], ['Share of saving', '%']],
      [...rows.map((r) => [el('span', {}, hgLink(r.x0.hg, r.x0.width, D.latest), el('div', {class: 'note', text: r.x0.width + ' cm'})), r.A.looms, f0(r.A.rpm), f1(r.A.cfm),
        refCell(CMODE, r.bm, r.best, r.t.cfm, f1, () => bmBtn(f1(r.bm), r.x0.width, r.x0.hg, 'apk', {view: 'cfm', rpm: r.A.rpm}), () => bmBtn(f1(r.best), r.x0.width, r.x0.hg, 'apk', {kind: 'best', view: 'cfm', rpm: r.A.rpm})),
        f1(r.A.apk), airRef(r), r.over, f1(r.exAir / 1440), cc ? withPP(rs(r.exAir * cc.rsFt3), r.exAir * cc.rsFt3, fp) : '—', tot > 0 ? f0(100 * r.exAir / tot) : '0']),
      ...(cc ? [el('tr', {class: 'tot'}, el('td', {}, el('b', {text: 'Total'})), el('td', {colspan: 7, class: 'note', text: 'every head group brought to its reference'}), el('td', {class: 'num', text: f1(tot / 1440)}), el('td', {class: 'num'}, el('b', {}, withPP(rs(totRs), totRs, fp))), el('td', {class: 'num', text: tot > 0 ? '100' : '0'}))] : [])], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  }
  s.append(card('Reference vs running CFM', (CVIEW === 'quality' ? 'Unlike pressure, fixing one quality saves its own share straight away' : 'CFM while running on the latest day; references at each loom\'s own RPM') + ' · paise per pick are on the whole floor\'s picks, so they add up to the total',
    el('div', {class: 'toolbar'}, view, modeSeg(CMODE, (v) => { CMODE = v; }, nT, 'Reference CFM', true)), body));

  s.append(trendCard('cfm', trDefault(recs.map((r) => ({x: r.x, w: r.ex * r.x.run})), CVIEW, sorted[0] && sorted[0].x)));
  const hist = (D.complete_days || []).slice().reverse().slice(0, 14).map((d) => ({d, c: cfmDay(d)})).filter((h) => h.c);
  s.append(card('Total CFM by day', 'Both shifts, 24-h average draw; "at reference" uses today\'s benchmarks, best and targets for every day',
    table(['Date', ['Total now', 'CFM'], ['At reference', 'CFM'], ['Excess', 'CFM'], ['Saving', '% of air'], ['Air in the day', 'ft³']],
      hist.map((h) => [dfmt(h.d), f0(h.c.now), f0(h.c.after), f0(h.c.now - h.c.after), f1(100 * (h.c.now - h.c.after) / h.c.now), f0(h.c.air)]), [1, 2, 3, 4, 5])));
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
    rows.push({label: `${x0.hg} · ${x0.width}`, v: A.cfm, bm, best, tg, ex: A.cfm - ref, open: () => openHg(x0.hg, x0.width, D.latest),
      tip: `${x0.hg}, ${x0.width} cm: ${f1(A.cfm)} CFM now · benchmark ${f1(bm)}${ok(best) ? ` · best ${f1(best)}` : ''}${ok(tg) ? ` · target ${f1(tg)}` : ''} at its RPM (${f0(A.rpm)}) · ${A.looms} looms`});
  }
  rows.sort((a, b) => b.ex - a.ex || a.label.localeCompare(b.label));
  return {rows, none};
}
// Total CFM day by day (24-h average draw), split into what the looms need at their reference and the excess above it,
// the excess split by the head groups with the most of it over the period. Today's references for every day, as the table.
const EXC_COLS = ['var(--bad)', 'var(--warn)', '#8e6bbf', 'var(--info)', '#c77d1a', '#d16ba5', 'var(--series)'];
let CSTK = 'both';   // 'both' = needed and excess; 'ex' = the excess alone, on its own scale
function cfmStackCard() {
  const dates = (D.complete_days || []).filter((d) => d <= D.latest).slice(-14);
  const need = dates.map(() => 0), exc = new Map();
  dates.forEach((d, i) => {
    for (const x of (D.loomdays || []).filter((y) => y.date === d && inW(y.width) && y.run > 0)) {
      const r = cfmRefs(x); need[i] += r.after * x.run / 1440;
      if (r.ex > 0) { const k = `${x.hg} · ${x.width}`; if (!exc.has(k)) exc.set(k, dates.map(() => 0)); exc.get(k)[i] += r.ex * x.run / 1440; }
    }
  });
  const top = topLayers([...exc.entries()].map(([name, vals]) => ({name, vals})), 6, 'Other head groups');
  const exL = top.map((l, i) => ({...l, name: l.other ? `${l.name} (${l.other})` : l.name, color: l.other ? EXC_COLS[6] : EXC_COLS[i]}));
  const layers = CSTK === 'ex' ? exL : [{name: 'Needed at reference', color: 'var(--muted)', fade: true, vals: need}, ...exL];
  const b = (v, t) => el('button', {type: 'button', 'aria-pressed': CSTK === v ? 'true' : 'false', text: t, onclick: () => { CSTK = v; render(); }});
  const exTot = dates.map((_, i) => exL.reduce((a, l) => a + (l.vals[i] || 0), 0)), sh = dates.length && need.at(-1) + exTot.at(-1) ? 100 * exTot.at(-1) / (need.at(-1) + exTot.at(-1)) : null;
  return card('Total CFM by day: needed and excess', `${dates.length} days to ${dfmt(D.latest)} · 24-h average draw · excess by head group`,
    el('div', {class: 'toolbar'}, el('div', {class: 'seg', role: 'group', 'aria-label': 'What the bars show'}, b('both', 'Needed and excess'), b('ex', 'Excess only')),
      ok(sh) ? el('span', {class: 'note', text: `Excess on ${dfmt(D.latest)}: ${f0(exTot.at(-1))} CFM, ${f1(sh)}% of the total`}) : null),
    dates.length ? hlStack({dates, layers, fmt: f0, aria: CSTK === 'ex' ? 'Excess CFM by day, by head group' : 'Total CFM by day, needed at reference and excess by head group'}, 'cfm-' + CSTK) : el('div', {class: 'empty', text: 'No complete day yet.'}),
    el('p', {class: 'note', text: `Each bar is the floor's total CFM that day. The grey part is what every loom would draw at its reference (looms already below it at their own figure); the coloured parts are the excess above it, by the head groups with the most excess over these days. Uses today's ${CMODE === 'bm' ? 'benchmarks' : CMODE === 'best' ? 'best loom-days' : 'targets'} for every day, as the "Total CFM by day" table below. "Excess only" draws the coloured part on its own scale. Hover a bar for its figures.`}));
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
  const shown = EALL ? sorted : sorted.slice(0, 25);
  const ehg = bv('erpm') === 'hg';   // 12 Nov 2026: loom-wise or head-group-wise
  const eHgRows = () => {
    const by = new Map();
    for (const r of recs) { if (r.x.hg === 'Unassigned') continue; const k = key(r.x.width, r.x.hg); if (!by.has(k)) by.set(k, []); by.get(k).push(r.x); }
    return [...by.values()].map((L) => {
      const x0 = L[0], A = agg(L), b = bench(x0.width, x0.hg) || {};
      const bm = ok(b.erpm) ? b.erpm : null, best = bestVal(x0.width, x0.hg, 'erpm'), tg = tgtE(x0.width, x0.hg), ref = refOf(EMODE, bm, best, tg);
      return {label: `${x0.hg} · ${x0.width}`, v: A.erpm, bm, best, tg, ex: ok(ref) ? Math.max(0, ref - A.erpm) : 0, open: () => openHg(x0.hg, x0.width, D.latest),
        tip: `${x0.hg}, ${x0.width} cm: ${f0(A.erpm)} effective RPM now · benchmark ${f0(bm)}${ok(best) ? ` · best ${f0(best)}` : ''}${ok(tg) ? ` · target ${f0(tg)}` : ''} · ${A.looms} looms`};
    }).sort((a, b) => b.ex - a.ex || a.label.localeCompare(b.label));
  };
  const eRows = ehg ? eHgRows() : shown.map((r) => ({...r, v: r.x.erpm}));
  s.append(card(`Current vs benchmark, best and target, ${ehg ? 'by head group' : 'by loom'}`, ehg ? `${eRows.length} head groups, biggest shortfall first` : EALL ? `All ${sorted.length} looms, biggest shortfall first` : `25 looms with the biggest shortfall, of ${sorted.length}`,
    el('div', {class: 'toolbar'}, bvSeg('erpm')),
    eRows.length ? refBars(eRows, {step: 50, labelEvery: 100, axis: 'Effective RPM, picks per minute of run + stop time', axisShort: 'Effective RPM', aria: `Effective RPM ${ehg ? 'by head group' : 'per loom'}: current against benchmark, best and target`, dec: 0, exSign: '−'}) : el('div', {class: 'empty', text: 'No loom with a head group ran on this day.'}),
    chartLegend('effective RPM', '−n after the value = effective RPM short of the reference'),
    ehg ? null : el('button', {class: 'link', type: 'button', text: EALL ? 'Show the top 25' : `Show all ${sorted.length} looms`, onclick: () => { EALL = !EALL; render(); }})));
  if (money && typeof fxErpmRealCard === 'function') s.append(fxErpmRealCard(recs));   // 12 Nov 2026: realisation against benchmark, best and target (owner)

  const view = el('div', {class: 'seg', role: 'group', 'aria-label': 'View'},
    el('button', {type: 'button', 'aria-pressed': EVIEW === 'loom' ? 'true' : 'false', text: 'Loom-wise', onclick: () => { EVIEW = 'loom'; render(); }}),
    el('button', {type: 'button', 'aria-pressed': EVIEW === 'quality' ? 'true' : 'false', text: 'Quality-wise', onclick: () => { EVIEW = 'quality'; render(); }}));
  let body;
  if (EVIEW === 'loom') {
    body = table(['Loom', 'Head group', ['RPM', 'picks/min'], ['Eff', '%'], ['Now', 'effective RPM'], ['Reference', EMODE === 'tgt' ? `target, ${f0(ERPM_TGT * 100)}% of target RPM` : `effective RPM, ${REF_NAME[EMODE]}`], ['Short', 'effective RPM'], ['Picks short', 'lakh in the day'], ...(money ? [['Lost realisation', '₹ in the day']] : []), 'Status'],
      sorted.map((r) => {
        const st = ok(r.ref) && r.x.erpm < r.ref - tolRpm(r.ref) ? el('span', {class: 'pill warn', text: 'below reference'}) : !ok(r.ref) ? el('span', {class: 'pill muted', text: 'no reference'}) : '';
        return [loomLink(r.x.loom, r.x.date), el('span', {style: 'white-space:nowrap;display:block'}, hgLink(r.x.hg, r.x.width, r.x.date), el('div', {class: 'note', text: `${r.x.width} cm ${r.x.type}`})), f0(r.x.rpm), f1(r.x.eff), f0(r.x.erpm),
          refCell(EMODE, r.bm, r.best, r.tg, f0, () => bmBtn(f0(r.bm), r.x.width, r.x.hg, 'erpm'), () => bmBtn(f0(r.best), r.x.width, r.x.hg, 'erpm', {kind: 'best'})),
          r.ex > 0.5 ? '−' + f0(r.ex) : '0', r.ex > 0.5 ? lk(r.gain) : '0', ...(money ? [fxErpmCell(r.x, r.ex > 0.5 ? r.gain : 0)] : []), st];
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
    el('p', {class: 'lead', text: `Looms powered down for ${OFF_LONG / 60} hours or more on ${dfmt(D.latest)}, and looms that ran below ${f0(EFF_BAD())}% efficiency on at least ${LOW_EFF_DAYS} of their last ${LOW_EFF_WINDOW} running days.`})));
  s.append(utilCalendar());
  const U = (D.util || []).filter((u) => u.date === D.latest && inW(u.width));
  const hgOf = (loom) => (D.loom_hg || {})[loom] || '—';
  const offLong = U.filter((u) => u.off >= OFF_LONG).sort((a, b) => b.off - a.off);
  const offShort = U.filter((u) => u.off >= 60 && u.off < OFF_LONG).length;
  const money = typeof fxOn === 'function' && fxOn();   // R2: idle hours as realisation forgone (owner, analysis on)
  s.append(card(`Powered down on ${dfmt(D.latest)} · ${offLong.length} loom${offLong.length === 1 ? '' : 's'}`, `${OFF_LONG / 60} h or more out of 24 h. ${offShort} more loom${offShort === 1 ? ' was' : 's were'} off between 1 and ${OFF_LONG / 60} h. A loom missing from a shift file counts as powered down for that shift.`,
    offLong.length ? table(['Loom', 'Head group', ['Powered down', 'h'], ['Run', 'h'], ['Stopped', 'h'], ...(money ? [['Realisation forgone', '₹, at its current quality']] : []), 'Off on earlier days'],
      offLong.map((u) => {
        const prev = (D.util || []).filter((v) => v.loom === u.loom && v.date < D.latest && v.off >= OFF_LONG).length;
        return [el('span', {}, loomLink(u.loom, u.date), el('div', {class: 'note', text: `${u.width} cm ${u.type}`})), hgLink(hgOf(u.loom), u.width, u.date), f1(u.off / 60), f1(u.run / 60), f1(u.stop / 60), ...(money ? [fxIdleCell(u.loom, u.date, u.off)] : []), prev ? `${prev} earlier day${prev > 1 ? 's' : ''} ≥ ${OFF_LONG / 60} h` : '—'];
      }), money ? [2, 3, 4, 5] : [2, 3, 4]) : el('div', {class: 'empty', text: `No loom was powered down for ${OFF_LONG / 60} hours or more.`}),
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
        if (!u) return el('td', {}, el('span', {class: 'ucell', title: `Loom ${l}, ${dfmt(d)}: no record`}));
        const tot = (u.run || 0) + (u.stop || 0) + (u.off || 0) || 1440;
        return el('td', {}, el('button', {type: 'button', class: 'ucell', 'aria-label': `Loom ${l}, ${dfmt(d)}: run ${h(u.run)} h, stopped ${h(u.stop)} h, powered down ${h(u.off)} h`,
          title: `Loom ${l}, ${dfmt(d)}: run ${h(u.run)} h · stopped ${h(u.stop)} h · powered down ${h(u.off)} h`, onclick: () => openLoom(l, d)},
          ['run', 'stop', 'off'].map((k) => (u[k] || 0) > 0 ? el('i', {style: `height:${(100 * u[k] / tot).toFixed(1)}%;background:${COL[k]};${k === 'off' ? 'opacity:.55' : ''}`}) : null)));
      })));
  }
  t.append(tb);
  return card(`Run, stopped and powered down · last ${dates.length} days`, `${wLabel()} · each cell is one loom's 24 hours · looms that lost the most hours first`,
    dates.length ? el('div', {class: 'tablebox'}, t) : el('div', {class: 'empty', text: 'No complete day yet.'}),
    el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: `background:${COL.run}`}), 'run'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: `background:${COL.stop}`}), 'stopped'),
      el('span', {class: 'lg'}, el('span', {class: 'sq', style: `background:${COL.off};opacity:.55`}), 'powered down'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--soft)'}), 'no record')),
    el('p', {class: 'note', text: 'A tall blue column is a full day running. Orange is time stopped while powered on, grey is time powered down (a loom missing from a shift file counts as powered down for that shift). Hover a cell for the hours; click it to open that loom on that day.'}));
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
  const shownB = WBALL ? beams : beams.slice(0, 15);
  const over = beams.filter((b) => b.rate > beamLine(b.width, b.hg)).length;
  if (bv('warp') === 'hg') return [warpHgCard(recs, dates, beams)];   // 12 Nov 2026: head-group-wise
  const c1 = card('Break rate by beam', `${beams.length} beam${beams.length === 1 ? '' : 's'} still on the loom · rate over each beam's whole run · highest first`,
    el('div', {class: 'toolbar'}, bvSeg('warp')),
    beams.length ? hbars(shownB.map((b) => { const ln = beamLine(b.width, b.hg); return {label: `${b.beam} · loom ${b.loom}`, v: b.rate, tol: ln, color: 'var(--bad)', text: f2(b.rate), onClick: () => openLoom(b.loom, b.last),
      title: `Beam ${b.beam} on loom ${b.loom} (${b.hg}, ${b.width} cm): ${f0(b.warp)} breaks over ${f2(b.picks / 1e5)} lakh machine picks on ${b.days} day${b.days === 1 ? '' : 's'} (${dfmt(b.first)}–${dfmt(b.last)}) = ${f2(b.rate)} per 100k picks; beam line ${f2(ln)}`}; }),
      {aria: 'Warp break rate by beam', axis: 'Warp breaks per 100k picks', fmt: f2, labelW: 150}) : el('div', {class: 'empty', text: 'No beam still on a loom ran in this period.'}),
    beams.length ? el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad);opacity:.35'}), 'up to the beam line'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad)'}), 'past it'), el('span', {class: 'lg'}, legendShape('tick'), 'beam line of its head group')) : null,
    beams.length > 15 ? el('button', {class: 'link', type: 'button', text: WBALL ? 'Show the highest 15' : `Show all ${beams.length} beams`, onclick: () => { WBALL = !WBALL; render(); }}) : null,
    el('p', {class: 'note', text: `${over} of ${beams.length} beam${beams.length === 1 ? ' is' : 's are'} past the beam line (${S().warp_multiple || 2}× the head group's median rate, at least ${S().warp_min_rate || 3} per 100k picks). Only the beam each loom carries now is listed: a beam already changed out cannot be acted on. A beam that breaks well past its head group points to warping or sizing, not the loom. Click a bar to open the loom.`}),
    beams.length && typeof fxBeamTable === 'function' ? fxBeamTable(shownB, recs) : null);   // R2: what each beam's stops cost in realisation (owner, analysis on)
  return [c1];
}
// Warp breaks head-group-wise (12 Nov 2026): each head group's break rate over the period (its looms' breaks ÷ machine picks
// × 100k, looms that ran at least 60 min), against its beam line, highest first. The beams behind it are in its panel.
function warpHgCard(recs, dates, beams) {
  const inP = new Set(dates), by = new Map();
  for (const x of recs) { if (!inP.has(x.date) || x.hg === 'Unassigned' || !ok(x.warp)) continue; const k = key(x.width, x.hg); const o = by.get(k) || {w: x.width, hg: x.hg, warp: 0, picks: 0, looms: new Set()}; o.warp += x.warp; o.picks += x.picks || 0; o.looms.add(x.loom); by.set(k, o); }
  const G = [...by.values()].filter((o) => o.picks > 0).map((o) => ({...o, rate: o.warp / o.picks * 1e5, line: beamLine(o.w, o.hg), over: beams.filter((b) => b.hg === o.hg && String(b.width) === String(o.w) && b.rate > beamLine(b.width, b.hg)).length})).sort((a, b) => b.rate - a.rate);
  return card('Break rate by head group', `${G.length} head group${G.length === 1 ? '' : 's'} · the period's breaks ÷ machine picks · highest first`,
    el('div', {class: 'toolbar'}, bvSeg('warp')),
    G.length ? hbars(G.map((o) => ({label: `${o.hg} · ${o.w}`, v: o.rate, tol: o.line, color: 'var(--bad)', text: f2(o.rate), onClick: () => openHg(o.hg, o.w, D.latest),
      title: `${o.hg}, ${o.w} cm: ${f0(o.warp)} breaks over ${f2(o.picks / 1e5)} lakh machine picks on ${o.looms.size} loom${o.looms.size === 1 ? '' : 's'} = ${f2(o.rate)} per 100k picks; beam line ${f2(o.line)}; ${o.over} current beam${o.over === 1 ? '' : 's'} past it`})),
      {aria: 'Warp break rate by head group', axis: 'Warp breaks per 100k picks', fmt: f2, labelW: 150}) : el('div', {class: 'empty', text: 'No head group ran in this period.'}),
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
  const grp = el('div', {class: 'stack pergrp'}, el('div', {class: 'toolbar stickper'}, el('span', {class: 'note', text: 'Period'}), per, WPER === 'range' ? rngCtl(days0(), render) : null, WPER === 'range' ? el('span', {class: 'note', text: rngNote(days0())}) : null));
  s.append(grp);
  grp.append(card('By quality', `${f0(A && A.warp)} breaks in total for this period · select a quality to see its looms`, el('div', {class: 'tablebox'}, t)));

  const q = qs.find((x) => x.k === WQ);
  if (q) {
    const byL = new Map();
    for (const x of q.recs) { if (!byL.has(x.loom)) byL.set(x.loom, []); byL.get(x.loom).push(x); }
    const rows = [...byL.entries()].map(([loom, recs]) => ({loom, recs, A: agg(recs), beams: [...new Set(recs.map((x) => x.beam).filter(Boolean))]})).sort((a, b) => b.A.warp - a.A.warp);
    const med = (bench(q.w, q.hg) || {}).warp_med;
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
