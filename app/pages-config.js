// W2 Looms · app/pages-config.js — Targets, Data health and Benchmarks pages.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- Targets
function pageTargets() {
  const s = el('section', {class: 'page', id: 'targets'});
  s.append(el('div', {}, el('h2', {text: `Targets, ${wLabel()}`}),
    el('p', {class: 'lead', text: `Set any or all of target CFM and RPM for a head group on each width. Leave a box empty for no target. Main pressure has no target box: for pressure the target is the head group's best main pressure, which every tab uses. The effective RPM target is ${f0(ERPM_TGT * 100)}% of the target RPM, so it needs no box of its own. Every page compares against these alongside the benchmark and best; they apply as soon as you save. 280 cm head groups count double panna (picks ×2, air per 1,000 picks halved) unless you switch them to single panna here; that applies straight away too.`})));
  const ks = new Map();
  for (const b of D.benchmarks || []) if (inW(b.width)) ks.set(key(b.width, b.hg), {w: b.width, hg: b.hg});
  for (const x of D.loomdays || []) if (inW(x.width) && x.hg !== 'Unassigned') ks.set(key(x.width, x.hg), {w: x.width, hg: x.hg});
  for (const k of Object.keys(TG)) { const t = TG[k]; if (inW(t.width)) ks.set(k, {w: t.width, hg: t.hg}); }
  for (const hg of SINGLE) if (inW('280')) ks.set(key('280', hg), {w: '280', hg});
  const list = [...ks.values()].sort((a, b) => a.w.localeCompare(b.w) || a.hg.localeCompare(b.hg));
  const cur = new Map();
  for (const x of latestRecs()) { const k = key(x.width, x.hg); if (!cur.has(k)) cur.set(k, []); cur.get(k).push(x); }
  const savers = [];
  const rows = list.map(({w, hg}) => {
    const k = key(w, hg), b = bench(w, hg) || {}, t = TG[k] || {}, A = cur.has(k) ? agg(cur.get(k)) : null;
    const id = 'tg-' + tgtId(w, hg);
    // beside each box, a small bar of now, bm, best and the target (as typed), on one scale
    const inp = (f, step, now, bm, best, fmt, bk, extra) => {
      const bid = `${id}-${f}`, saved = ok(t[f]) ? String(t[f]) : '';
      const box = el('input', {type: 'number', id: bid, step, min: '0', inputmode: 'decimal', 'aria-label': `Target ${f} for ${hg} ${w} cm`, value: draftOf(bid, saved) || null});
      const rb = () => { const v = box.value.trim() === '' ? null : Number(box.value); return rangeBar({now, bm, best, tg: ok(v) && v > 0 ? v : null, fmt, aria: `${f.toUpperCase()} for ${hg}, ${w} cm: now, benchmark, best and target`}); };
      let bar = rb(); box.addEventListener('input', () => { draftKeep(bid, box.value, saved); FLASH.delete(id); const nb = rb(); bar.replaceWith(nb); bar = nb; });
      return el('div', {'data-sort': saved}, el('div', {class: 'tgin'}, box, bar),   // sorts on the saved target; none = a gap (18 Nov 2026)
      el('div', {class: 'hint'}, `now ${fmt(now)} · `, ok(bm) && bk ? bmBtn('bm ' + fmt(bm), w, hg, bk.m, bk) : `bm ${fmt(bm)}`,
        ok(best) && bk ? [' · ', bmBtn('best ' + fmt(best), w, hg, bk.m, {...bk, kind: 'best'})] : null, extra || null)); };
    const msg = flashShow(id, el('div', {class: 'meta'}));
    const btn = el('button', {class: 'primary', type: 'button', text: 'Save', disabled: !db});
    const save = async (onlyChanged) => {
      // the typed value is read from the draft (or the saved target), not the box: a redraw may have replaced the box
      const num = (f) => { const v = String(draftOf(`${id}-${f}`, ok(t[f]) ? String(t[f]) : '')).trim(); if (v === '') return null; const n = Number(v); return isFinite(n) && n > 0 ? n : NaN; };
      const vals = {cfm: num('cfm'), rpm: num('rpm'), main: num('main')};
      if (Object.values(vals).some((v) => Number.isNaN(v))) { msg.className = 'err'; msg.textContent = 'Use positive numbers, or leave the box empty.'; flashSet(id, 'err', msg.textContent); return 'bad'; }
      if (onlyChanged && ['cfm', 'rpm', 'main'].every((f) => (ok(t[f]) ? +t[f] : null) === vals[f])) return 'same';
      btn.disabled = true; msg.className = 'meta'; msg.textContent = 'Saving…';
      let res = 'saved';
      try {
        const root = hgRootOf(w, hg);   // saved under the Style-map name: it follows the head group through any rename
        const ref = db.collection('targets').doc(tgtId(w, root));
        const stray = [...(STRAY[key(w, hg)] || [])].filter((id) => id !== tgtId(w, root));   // other members' rows of a merged group
        if (vals.cfm == null && vals.rpm == null && vals.main == null) await ref.delete();
        else await ref.set({width: w, hg: root, ...vals, at: new Date().toISOString()});
        for (const id of stray) { try { await db.collection('targets').doc(id).delete(); STRAY[key(w, hg)].delete(id); } catch (e) {} }
        for (const f of ['cfm', 'rpm', 'main']) DRAFT.delete(`${id}-${f}`);
        msg.className = 'saved'; msg.textContent = 'Saved';
      } catch (e) { msg.className = 'err'; msg.textContent = saveFail(e, 'save', 'Save'); res = 'err'; }
      flashSet(id, msg.className, msg.textContent);
      btn.disabled = false;
      return res;
    };
    btn.addEventListener('click', () => save(false));
    savers.push(save);
    const cB = A ? cfmOf(b.apk, w, hg, A.rpm) : null;
    return [el('span', {}, hgLink(hg, w, D.latest), el('div', {class: 'note', text: w + ' cm'})),
      inp('cfm', '0.1', A && A.cfm, cB, A ? cfmOf(bestVal(w, hg, 'apk'), w, hg, A.rpm) : null, f1, {m: 'apk', view: 'cfm', rpm: A && A.rpm}),
      inp('rpm', '1', A && A.rpm, b.rpm, bestVal(w, hg, 'rpm'), f0, {m: 'rpm'}, ok(t.rpm) ? el('div', {}, `effective RPM target ${f0(t.rpm * ERPM_TGT)} (${f0(ERPM_TGT * 100)}%)`) : null),
      // Round A2 (Divyam, 24 Nov 2026): no pressure target box: for pressure the target is the head group's best (a saved
      // pressure target stays in the database; Save keeps it as it is, num('main') reads it back)
      ...(W === '190' ? [] : [String(w) === '280' ? pannaSwitch(w, hg) : el('span', {class: 'note', text: 'single panna'})]), el('div', {}, btn, msg)];
  });
  const tb = table(['Head group', ['Target CFM', 'ft³/min while running'], ['Target RPM', 'picks/min'], ...(W === '190' ? [] : [['Panna', '280 cm: double unless switched']]), ''], rows);
  tb.classList.add('tg');
  // Save all: saves every head group whose boxes differ from what is saved, one after another, and reports the count.
  // The saved targets are reloaded and the page redrawn once, after the last save (17 Nov 2026: a redraw after each save
  // replaced the boxes, so the rows after the first one or two lost what was typed).
  const allMsg = flashShow('tg-all', el('span', {class: 'meta'}));
  const allBtns = [];
  const saveAll = async () => {
    for (const x of allBtns) x.disabled = true;
    allMsg.className = 'meta'; allMsg.textContent = 'Saving…';
    const n = {saved: 0, same: 0, bad: 0, err: 0};
    await holdState(async () => {
      for (const f of savers) n[await f(true)] += 1;
      flashSet('tg-all', n.err || n.bad ? 'err' : 'saved', !n.saved && !n.err && !n.bad ? 'Nothing changed to save. Type a target in a box first.' : [`${n.saved} head group${n.saved === 1 ? '' : 's'} saved`, n.bad ? `${n.bad} with a number to fix` : null, n.err ? `${n.err} could not be saved: the reason is on each row` : null].filter(Boolean).join(' · '));
      for (const x of allBtns) x.disabled = !db;
      flashShow('tg-all', allMsg);
    });
  };
  const allBar = () => { const b = el('button', {class: 'primary', type: 'button', text: 'Save all', disabled: !db, onclick: saveAll}); allBtns.push(b); return el('div', {class: 'toolbar'}, b, allMsg); };
  if (typeof wkPut === 'function') { const k = Object.keys(TG).sort().find((x) => ok(TG[x].rpm) && (D.benchmarks || []).some((b) => key(b.width, b.hg) === x && inW(b.width)));   // Round J: the first head group with a target RPM
    wkPut('L1', k ? {hg: TG[k].hg, w: TG[k].width, rpm: TG[k].rpm} : null); }
  s.append(card('Targets by head group', targetsLoaded ? `${Object.keys(TG).length} head group${Object.keys(TG).length === 1 ? '' : 's'} with targets` : 'Loading saved targets…', allBar(), tb, el('div', {class: 'toolbar', style: 'margin-top:10px'}, (() => { const b = el('button', {class: 'primary', type: 'button', text: 'Save all', disabled: !db, onclick: saveAll}); allBtns.push(b); return b; })()),
    el('div', {class: 'legend'}, el('span', {class: 'lg'}, legendShape('bar'), 'now'), el('span', {class: 'lg'}, legendShape('tick'), 'benchmark'), el('span', {class: 'lg'}, legendShape('circle'), 'best'), el('span', {class: 'lg'}, legendShape('diamond'), 'target, as typed')),
    el('p', {class: 'note', text: '"now" is the latest day (pressure: highest the head group ran at). Benchmark CFM is shown at the RPM run on the latest day. The small bar beside each box puts now, benchmark, best and the target on one scale, so a target looser than the benchmark shows at a glance; it follows what you type. Targets are saved to the App targets tab of the Config Sheet.'}),
    !db ? el('p', {class: 'err', text: 'Saving targets is not connected yet (the app has no backend address).'}) : null));
  s.append(powerRuleCard());
  if (typeof fxTargetsCard === 'function') { const rt = fxTargetsCard(); if (rt) s.append(rt); }   // R2: realisation targets (owner, analysis on)
  return s;
}

// ---------------------------------------------------------------- Data health
function pageData() {
  const s = el('section', {class: 'page', id: 'data'});
  s.append(el('div', {},
    el('p', {class: 'lead', text: 'Every file the daily run looked at, which days are complete, and the checks behind the numbers.'})));
  s.append(dataHealthVisuals());
  s.append(prodCheckCard(), missedCard(), ovrCard());   // Round A9 (Divyam, 26 Nov 2026)
  s.append(backupCard());
  if (typeof reloadBox === 'function' && canEdit()) s.append(card('Reload data', 'Start the daily run now instead of waiting for the next one', reloadBox()));
  s.append(card('Days', null, table(['Date', 'Status'], (D.days || []).slice().reverse().slice(0, 30).map((d) => [dfmt(d.date), el('span', {class: 'pill ' + (d.status === 'complete' ? 'good' : 'bad'), text: d.status})]))));
  s.append(card('Files', 'Most recent first', table(['Checked', 'Folder', 'File', 'Header date', 'Shift', ['Looms', 'count'], 'Status', 'Note'],
    (D.files || []).slice().reverse().map((f) => [f.checked_at, f.folder_date, f.file_name, f.date, f.shift, f.looms,
      el('span', {class: 'pill ' + ({ingested: 'good', quarantined: 'bad', duplicate: 'muted', skipped: 'muted', superseded: 'muted'}[f.status] || 'muted'), text: f.status}), f.reason]), [5])));
  const info = (D.alerts || []).filter((a) => a.level !== 'Critical');
  s.append(card('Other alerts', 'Warnings and info items from the daily run', info.length ? el('ul', {class: 'alerts'}, info.map((a) => el('li', {}, el('span', {class: 'pill ' + (a.level === 'Warning' ? 'warn' : 'info'), text: a.scope}), el('span', {}, linkify(a.msg))))) : el('div', {class: 'empty', text: 'None.'})));
  const st = S();
  s.append(card('Settings in use', 'Edit these in the Settings tab of the W2 Loom Performance Config sheet',
    table(['Setting', 'Value'], [
      ['Bad efficiency', `below ${f0(EFF_BAD())}%, any quality`], ['Benchmark percentile, RPM', st.benchmark_pct_high + 'th'], ['Benchmark percentile, air and pressure', st.benchmark_pct_low + 'th'],
      ['Loom-day counts toward benchmark from', st.benchmark_min_run_min + ' min run'], ['RPM tolerance', st.tol_rpm_pct + '%'],       ['Air and CFM tolerance', st.tol_air_pct + '%'], ['Pressure tolerance (this page)', PRESS_TOL + ' kgf/cm²'], ['Set point margin over the floor', ok(st.setpoint_margin_kgf) ? st.setpoint_margin_kgf + ' kgf/cm²' : 'not set (setpoint_margin_kgf)'],
      ['Long power-down (this page)', OFF_LONG / 60 + ' h'], ['Consistently low efficiency', `below ${f0(EFF_BAD())}% on ${LOW_EFF_DAYS} of last ${LOW_EFF_WINDOW} running days`]])));
  s.append(el('p', {class: 'note', text: `Data generated ${D.generated_at} IST. Head groups, machine master and thresholds are edited in the W2 Loom Performance Config sheet; targets on the Targets tab.`}));
  return s;
}

// ---------------------------------------------------------------- Round A9 (Divyam, 26 Nov 2026): loom readings vs the costing file
// The production check (app/calc.js prodCheck), the missed loom readings (the daily run's `missed`) and the loom overrides
// (migration 0019). Metres and picks only, no money: every role sees them (the plant view on Actions; Data health is not its).
let PCHK = {pct: 2, m: 100, by: '', at: '', err: ''}, OVR_MSG = '';
const PC_TITLE = 'Production check: loom readings vs the costing file';
let PC_NAMES = null, PC_NAMES_OF = null;
function pcNames() { if (PC_NAMES_OF !== D) { PC_NAMES = prodNames(D.loomdays || []); PC_NAMES_OF = D; } return PC_NAMES; }
const pcNext = () => isAdmin() ? 'see Files per day on Data health' : 'tell the owner';
// One day's check, or why there is none (never a check of 0 against a missing side).
function pcDay(d) {
  const C = typeof COST !== 'undefined' && COST ? COST : null;
  if (!C) return {why: 'the costing data has not loaded. Next: press Refresh (the round-arrow icon)'};
  const cd = (C.days || []).find((x) => x.date === d);
  if (!cd) return {why: `no costing file read for ${dfmt(d)}. Next: ${pcNext()}`};
  if (!Array.isArray(cd.prod)) return {why: 'the costing file was read before this check existed. Next: nothing to do, it fills in at the next daily run (every hour, 10:40 to 16:40 IST)'};
  const L = (D.loomdays || []).filter((x) => x.date === d);
  if (!L.length) return {why: `no loom readings for ${dfmt(d)}. Next: ${pcNext()}`};
  return {chk: prodCheck(L, cd.prod, pcNames(), PCHK)};
}
const pcM = (x) => ok(x) ? f0(x) : '—';
const pcSg = (x, n = 0) => !ok(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '±') + (n ? Math.abs(x).toFixed(n) : Math.round(Math.abs(x)).toLocaleString('en-IN'));
function pcRow(r, d) {
  const gap = r.gapM != null ? pcSg(r.gapM) : el('span', {class: 'note', text: r.why || '—'});
  const looms = !r.looms.length ? '' : 'looms ' + (r.looms.length > 6 ? `${r.looms.slice(0, 6).join(', ')} +${r.looms.length - 6} more` : r.looms.join(', '));
  const head = el('span', {}, r.name, looms ? el('div', {class: 'note', text: looms}) : null, r.qs && r.qs.length ? el('div', {class: 'note', text: 'file: ' + [...new Set(r.qs)].join(', ')}) : null);
  return [d ? dfmt(d) : null, head, r.width === 'both' ? 'both' : r.width ? r.width + ' cm' : '—', pcM(r.loomM), pcM(r.xlM),
    el('span', {class: r.flag ? 'pill bad' : null}, gap), r.pct != null ? pcSg(r.pct, 1) + '%' : '—'].filter((c, i) => d || i);
}
const pcLevels = () => `flagged over ${PCHK.pct}% and ${f0(PCHK.m)} m`;
const PC_HEAD = ['Quality', 'Width', ['Loom', 'm'], ['File', 'm'], ['Gap', 'm'], 'Gap %'];
const pcFoot = () => el('p', {class: 'note', text: 'Loom = the loom readings: each loom-day\'s picks ÷ the costing file\'s picks per inch for its quality. File = the costing file\'s production table, Day + Night metres. Gap = loom − file: + means the loom readings are higher, − the costing file is higher. The file has no width column, so its lines are matched to a width by loom speed (RPM); "both" = compared across both widths. A row on one side only is named, never 0.'});
// Actions: the day's flagged rows and its missed readings (the date chip's day)
function prodCheckActions() {
  const d = D.latest, x = pcDay(d), M = (D.missed || []).filter((m) => m.date === d);
  const body = [];
  if (!x.chk) body.push(el('p', {class: 'note', text: 'Production check: ' + x.why + '.'}));
  else {
    const F = x.chk.rows.filter((r) => r.flag);
    body.push(F.length ? table(PC_HEAD, F.map((r) => pcRow(r)), [2, 3, 4, 5])
      : el('p', {class: 'note', text: `No quality × width differs by more than ${PCHK.pct}% and ${f0(PCHK.m)} m on ${dfmt(d)}.`}));
  }
  const sh = M.filter((m) => m.kind === 'shift'), st = M.filter((m) => m.kind === 'short');
  const lk = x.chk ? st.filter((m) => missedLikely(m, x.chk)).length : 0;
  body.push(el('p', {class: 'note'}, M.length ? `Missed loom readings: ${sh.length ? `${sh.length} loom-shift${sh.length === 1 ? '' : 's'} missing from a shift file (looms ${[...new Set(sh.map((m) => m.loom))].join(', ')})` : 'no shift file short of looms'}; ${st.length} loom-day${st.length === 1 ? '' : 's'} under ${f0((D.settings || {}).missed_reading_min || 1380)} minutes run + stopped${lk ? `, ${lk} likely missed (its quality reads below the costing file)` : ''}.` : 'Missed loom readings: none on this day.',
    M.length ? (isPlant() ? ' Next: tell the owner.' : ' Next: ask the plant for the missing readings.') : '',
    !isPlant() ? ' ' : null, !isPlant() ? el('button', {class: 'link', type: 'button', text: 'Open Data health ›', onclick: () => setTab('data')}) : null));
  return card(PC_TITLE, `${dfmt(d)} · by quality and loom width · ${pcLevels()}`, ...body, pcFoot());
}
// Data health: the last 14 days, flagged rows (with the looms behind each) and the days with no check; the levels
function prodCheckCard() {
  const days = (D.complete_days || []).slice(-14).reverse(), rows = [], none = [];
  for (const d of days) { const x = pcDay(d); if (!x.chk) none.push(`${dfmt(d)}: ${x.why}`); else for (const r of x.chk.rows) if (r.flag) rows.push(pcRow(r, d)); }
  const lv = el('div', {class: 'meta'}, `Levels: a row is flagged when it differs by more than ${PCHK.pct}% and more than ${f0(PCHK.m)} m.`,
    PCHK.by ? ` Set by ${PCHK.by}${PCHK.at ? ' on ' + new Date(PCHK.at).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'}) + ' IST' : ''}.` : '',
    PCHK.err ? ` (${PCHK.err}; press Refresh, the round-arrow icon)` : '');
  const edit = isAdmin() ? (() => {
    const p = el('input', {type: 'number', min: '0.1', max: '50', step: '0.1', value: String(PCHK.pct), 'aria-label': 'Flag level, percent', style: 'width:6em'});
    const m = el('input', {type: 'number', min: '0', max: '5000', step: '10', value: String(PCHK.m), 'aria-label': 'Flag level, metres', style: 'width:6em'});
    const msg = el('span', {class: 'note'});
    const b = el('button', {class: 'ghost', type: 'button', text: 'Save', onclick: async () => {
      const a = +p.value, c = +m.value;
      if (!(a > 0 && a <= 50) || !(c >= 0 && c <= 5000)) { msg.textContent = ' The percentage must be above 0 and at most 50, the metres 0 to 5,000.'; return; }
      b.disabled = true; msg.textContent = ' Saving…';
      try { await saveChkSet(a, c); await loadChkSet(); render(); }
      catch (e) { msg.textContent = ' Not saved: ' + sbErr(e) + ' Check its role on Access.'; b.disabled = false; }
    }});
    return el('div', {class: 'pcset'}, el('label', {}, 'Flag over ', p, ' %'), ' and ', el('label', {}, m, ' m'), ' ', b, msg);
  })() : el('p', {class: 'note', text: 'The levels are set here by the owner or an admin.'});
  return card(PC_TITLE, `last ${days.length} days · by quality and loom width · ${pcLevels()}`, lv, edit,
    rows.length ? table(['Day', ...PC_HEAD], rows, [3, 4, 5, 6])
      : el('p', {class: 'note', text: 'No flagged row in these days.'}),
    none.length ? el('ul', {class: 'note'}, none.map((t) => el('li', {text: t}))) : null, pcFoot());
}
function missedCard() {
  const M = (D.missed || []).slice().sort((a, b) => b.date.localeCompare(a.date) || a.loom - b.loom), lim = f0((D.settings || {}).missed_reading_min || 1380);
  const chk = {}; const ck = (d) => (chk[d] = chk[d] || pcDay(d)).chk;
  const rows = M.map((m) => [dfmt(m.date), String(m.loom), m.width ? m.width + ' cm' : '—',
    m.kind === 'shift' ? `shift ${m.shift} file has no reading (it lists ${m.looms} of ${m.of} looms)` : `${f0(m.min)} minutes run + stopped, under ${lim}`,
    m.kind === 'short' ? (m.hg || m.hg0 || '—') : '—',
    m.kind === 'short' ? (missedLikely(m, ck(m.date)) ? el('span', {class: 'pill bad', text: 'likely missed'}) : el('span', {class: 'note', text: 'missed or powered down'})) : el('span', {class: 'pill bad', text: 'missed'})]);
  return card('Missed loom readings', `last ${((D.complete_days || []).slice(-31)).length} days · a loom missing from a shift file, or a loom-day under ${lim} minutes`,
    rows.length ? table(['Day', 'Loom', 'Width', 'What', 'Quality', 'Reading'], rows) : el('p', {class: 'note', text: Array.isArray(D.missed) ? 'None in these days.' : 'Shows after the next daily run (every hour, 10:40 to 16:40 IST).'}),
    el('p', {class: 'note', text: `A loom-day under ${lim} minutes is either missing part of a shift's readings or was powered down; "likely missed" when its quality reads below the costing file on the production check. The loom-day keeps the minutes and picks it has: it is never shown as 0. Next: ask the plant for the missing shift readings.`}));
}
function ovrCard() {
  const P = D.loom_overrides, body = el('div', {}, el('div', {class: 'meta', text: 'Checking…'}));
  const c = card('Loom quality overrides', 'a loom weaving another quality than its panel style says · from a date, until its style changes', body);
  const when = (t) => t ? new Date(t).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'}) + ' IST' : '—';
  (async () => {
    let rows = null, err = '';
    try { rows = await loadOvrRows(); } catch (e) { err = sbErr(e); }
    const byId = new Map((P || []).map((o) => [o.id, o]));
    const L = rows || (P || []);
    const shown = (o) => { const w = (D.machine || {})[String(o.loom)]; const n = o.root && w ? (D.loomdays || []).find((x) => x.hg0 === o.root && x.width === w.width) : null; return n ? n.hg : o.root; };
    const tr = L.map((o) => { const s = byId.get(o.id);
      const state = !o.root ? 'ends the earlier override' : !s ? 'applies from the next daily run' : s.ended ? `ended ${dfmt(s.ended)} (style ${s.ended_style})` : s.until ? `until ${dfmt(s.until)}` : 'in force';
      return [String(o.loom), dfmt(String(o.eff_from).slice(0, 10)), o.root ? shown(o) : '—', (o.styles || []).join(', ') || 'any style', state, s ? f0(s.loomdays) : '—', (o.set_by || '—') + ' · ' + when(o.set_at)]; });
    const add = isAdmin() ? (() => {
      const sn = new Map(); for (const x of D.loomdays || []) if (x.hg0 && x.hg0 !== 'Unassigned' && !sn.has(x.hg0)) sn.set(x.hg0, x.hg);
      const roots = [...sn.keys()].sort((a, b) => (sn.get(a) + a).localeCompare(sn.get(b) + b));
      const loom = el('input', {type: 'number', min: '1', max: '999', 'aria-label': 'Loom', style: 'width:5em'}), from = el('input', {type: 'date', 'aria-label': 'From'});
      const hg = el('select', {'aria-label': 'Head group'}, el('option', {value: '', text: 'none: ends the earlier override'}), roots.map((r) => el('option', {value: r, text: sn.get(r) && sn.get(r) !== r ? `${sn.get(r)} (${r})` : r})));
      const st = el('input', {type: 'text', placeholder: 'blank = any style; comma between', 'aria-label': 'Style texts', style: 'width:16em'}), msg = el('span', {class: 'note', text: OVR_MSG}); OVR_MSG = '';
      const b = el('button', {class: 'ghost', type: 'button', text: 'Add', onclick: async () => {
        if (!(+loom.value >= 1) || !/^\d{4}-\d{2}-\d{2}$/.test(from.value)) { msg.textContent = ' Type the loom and the day it took effect.'; return; }
        b.disabled = true; msg.textContent = ' Saving…';
        try { await addOvrRow({loom: +loom.value, eff_from: from.value, root: hg.value || null, styles: st.value.split(',').map((x) => x.trim()).filter(Boolean)}); OVR_MSG = ' Saved. The next daily run works the loom\'s days again from that day.'; render(); }
        catch (e) { msg.textContent = ' Not saved: ' + sbErr(e) + ' Check its role on Access.'; b.disabled = false; }
      }});
      return el('div', {class: 'pcset'}, el('label', {}, 'Loom ', loom), ' ', el('label', {}, 'from ', from), ' ', el('label', {}, 'weaves ', hg), ' ', el('label', {}, 'while the panel says ', st), ' ', b, msg);
    })() : null;
    body.replaceChildren(
      tr.length ? table(['Loom', 'From', 'Quality', 'Panel style texts', 'State', 'Loom-days moved', 'Set by'], tr, [5]) : el('p', {class: 'note', text: 'No override.'}),
      err ? el('p', {class: 'note', text: `The database list could not be read (${err}); showing the overrides the data was last worked with. Press Refresh (the round-arrow icon).`}) : null,
      add, el('p', {class: 'note', text: 'Rows are never changed or deleted: a wrong row is put right by adding the right one for the same day. Past days are worked again by the next daily run; announced realisation days that move by ₹500 or more come up as corrections on Realisation.'}));
  })();
  return c;
}

// Backup age (17 Nov 2026, 0016 job_status): when the nightly database backup last succeeded. Red after 26 hours, so a backup
// that stopped running gets noticed. A gap (never stamped, or not readable) says so; it is never shown as fine.
const BACKUP_LATE_H = 26;
function backupAge(okAt, now) {
  if (!okAt) return null;
  const h = (now - new Date(okAt).getTime()) / 3600e3;
  return isFinite(h) ? {h, late: h > BACKUP_LATE_H} : null;
}
function backupCard() {
  const body = el('div', {class: 'meta', text: 'Checking…'});
  const c = card('Backup age', 'The nightly database backup, 02:17 IST, newest 14 kept', body);
  (async () => {
    try {
      const rows = await sbRows('job_status', (q) => q.select('job, ok_at, note').eq('job', 'backup'));
      const r = rows[0], a = backupAge(r && r.ok_at, Date.now());
      if (!a) { body.replaceChildren(el('span', {class: 'pill muted', text: 'no record yet'}), (isAdmin() ? ' No backup recorded yet. The first nightly backup after 17 Nov records itself; if this stays after a night, look at the DB backup Action in GitHub.' : ' No backup recorded yet. If this stays after a night, tell the owner.')); return; }
      const ago = a.h < 1 ? 'under an hour ago' : a.h < 48 ? `${Math.floor(a.h)} h ago` : `${Math.floor(a.h / 24)} days ago`;
      body.replaceChildren(el('span', {class: 'pill ' + (a.late ? 'bad' : 'good'), text: a.late ? 'late' : 'ok'}),
        ` Newest backup ${new Date(r.ok_at).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'})} IST, ${ago}.`,
        a.late ? (isAdmin() ? ' More than a day old: look at the DB backup Action in GitHub.' : ' More than a day old: tell the owner.') : '');
    } catch (e) { body.replaceChildren(el('span', {class: 'pill muted', text: '—'}), ' Could not read the backup record: ' + sbErr(e) + ' Tap the round-arrow icon (Refresh); if it stays, tell the owner.'); }
  })();
  return c;
}

// A 30-day calendar of complete and missing days (Monday-first weeks) and the files the daily run looked at per day.
function dataHealthVisuals() {
  const todayIST = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const newest = (D.days || []).reduce((a, d) => d.date > a ? d.date : a, '');
  const end = [newest, addDays(todayIST, -1)].filter(Boolean).sort().at(-1);
  const cal = dayCalendar(D.days || [], end, 30), F = filesPerDay(D.files || []);
  const nF = (d) => Object.values(F[d] || {}).reduce((a, v) => a + v, 0);
  const lead = (new Date(cal[0].date + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const NAME = {complete: 'complete', missing: 'missing or incomplete', later: 'not in yet', before: 'before the first file on record'};
  const grid = el('div', {class: 'dcal', role: 'grid', 'aria-label': 'Last 30 days: complete and missing'},
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => el('div', {class: 'dh', text: d})),
    Array.from({length: lead}, () => el('div', {class: 'dc blank'})),
    cal.map((c) => el('div', {class: 'dc ' + c.status, role: 'gridcell', title: `${dfmt(c.date)}: ${NAME[c.status]}${c.raw && c.raw !== 'complete' ? ` (${c.raw})` : ''} · ${nF(c.date)} file${nF(c.date) === 1 ? '' : 's'} looked at`},
      String(+c.date.slice(8, 10)), el('small', {text: c.status === 'complete' ? 'ok' : c.status === 'missing' ? 'missing' : c.status === 'later' ? 'not in' : '—'}))));
  const n = (k) => cal.filter((c) => c.status === k).length, nb = n('before');
  const ST = [['ingested', 'Read', 'var(--good)'], ['quarantined', 'Set aside', 'var(--bad)'], ['duplicate', 'Duplicate', 'var(--muted)'], ['superseded', 'Superseded', 'var(--muted-2)'], ['skipped', 'Skipped', 'var(--warn)']];
  const known = new Set(ST.map((x) => x[0]));
  const dates = cal.map((c) => c.date);
  const layers = [...ST.map(([k, name, color]) => ({name, color, vals: dates.map((d) => (F[d] || {})[k] || 0)})),
    {name: 'Other', color: 'var(--info)', vals: dates.map((d) => Object.entries(F[d] || {}).filter(([k]) => !known.has(k)).reduce((a, [, v]) => a + v, 0))}].filter((l) => l.vals.some((v) => v > 0));
  return el('div', {class: 'grid'},
    card('Last 30 days', `${n('complete')} complete · ${n('missing')} missing · ${n('later')} not in yet${nb ? ` · ${nb} before the data starts` : ''}`, grid,
      el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--good-soft);outline:1px solid var(--good)'}), 'complete: both shifts in'),
        el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--bad-soft);outline:1px solid var(--bad)'}), 'missing or incomplete'), el('span', {class: 'lg'}, el('span', {class: 'sq', style: 'background:var(--soft)'}), 'not in yet, or before the data starts')),
      el('p', {class: 'note', text: 'A day is complete when both shift files are in and read. A red day before the newest one is a gap to chase with the plant. Hover a day for its status and how many files the run looked at.'})),
    card('Files per day', 'by folder day · what the daily run did with each',
      layers.length ? stackBars({dates, layers, fmt: f0, h: 220, int: true, aria: 'Files the daily run looked at, per day, by what it did with them'}) : el('div', {class: 'empty', text: 'No file on record for these days.'}),
      layers.length ? stackKey(layers) : null,
      el('p', {class: 'note', text: 'Two shift files a day is the normal day. Set aside means the run could not use the file (the table below says why); duplicates and superseded files are copies or older versions of a file already read.'}),
      costPickNotes(dates)));
}

// Round X (20 Nov 2026): which costing file each day used, found by its content, not its name (pipeline/file_pick.py).
// Only the days where it was not one file named costing.xlsx are listed, each flag with its next step. Names and dates only.
const PICK_NEXT = [
  [/costing files; used/, 'Next: ask the plant to keep one costing file in each day folder.'],
  [/inside; used for the folder/, 'Next: move the file to its own day\'s folder; the run reads it for the folder\'s date until then.'],
  [/could not be read/, 'Next: ask the plant to upload that costing file again.'],
  [/not read again/, 'Next: nothing to do; the run reads a day again only within the last 31 days.'],
  [/re-read from/, 'Next: nothing to do; the day was read again, from a newer or different file than last time, and its figures now come from it. If that is the wrong file, ask the plant to remove it from the day\'s folder.'],
  [/costing read from/, 'Next: nothing to do; the usual name is costing.xlsx, but any name is read.'],
];
function costPickNotes(dates) {
  const C = typeof COST !== 'undefined' ? COST : null, P = C && C.picks;
  if (!C) return el('p', {class: 'note', text: 'Costing file: the costing data has not loaded. Press Refresh (the round-arrow icon) and look again.'});
  if (!P) return el('p', {class: 'note', text: 'Costing file: which file each day used shows after the next daily run (it runs every hour, 10:40 to 16:40 IST). Next: ' + (canEdit() ? 'press Reload data on this tab to run it now.' : 'wait for the next run.')});
  const days = (dates || []).filter((d) => P[d]).reverse();
  if (!days.length) return el('p', {class: 'note', text: 'Costing file: every day in the last 30 days that has one was read from a single file named costing.xlsx (the run finds the file by what is in it, so another name is read too).'});
  return el('div', {class: 'pickn'}, el('p', {class: 'note', text: 'Costing file: days that were not one file named costing.xlsx (the run finds the file by what is in it).'}),
    el('ul', {class: 'note'}, days.map((d) => {
      const r = P[d], fl = r.flags || [];
      const nx = [...new Set(fl.map((f) => (PICK_NEXT.find(([re]) => re.test(f)) || [, ''])[1]).filter(Boolean))];
      return el('li', {}, `${dfmt(d)}: ${r.file ? 'read from ' + r.file : 'no costing file read'}`,
        fl.length ? el('ul', {}, fl.map((f) => el('li', {text: f.replace(/^\d\d\.\d\d: /, '').replace(/ Check the file is in the right folder\.$/, '')}))) : null,
        nx.map((t) => el('div', {class: 'note', text: t})));
    })));
}

// ---------------------------------------------------------------- Benchmarks tab
let BQ = '', BMET = 'rpm', BQS = '', BKIND = 'pct';
const BMET_LIST = [['rpm', 'RPM'], ['erpm', 'Effective RPM'], ['apk', 'Air & CFM'], ['main_max', 'Main pressure'], ['warp_rate', 'Warp breaks']];
function pageBench() {
  const s = el('section', {class: 'page', id: 'benchmarks'});
  s.append(el('div', {}, el('h2', {text: `Benchmarks, ${wLabel()}`}),
    el('p', {class: 'lead', text: 'Pick a quality to see its benchmark (90th percentile for RPM and effective RPM, 10th for air and pressure, all history) and its single best loom-day, with the loom-days behind each. Click a loom number to open that loom.'})));
  const list = (D.benchmarks || []).filter((b) => inW(b.width)).slice().sort((a, b) => a.hg.localeCompare(b.hg) || String(a.width).localeCompare(String(b.width)));
  if (!list.length) { s.append(card('No benchmarks yet', null, el('div', {class: 'empty', text: 'Benchmarks appear once head groups have complete days of running.'}))); return s; }
  if (!BQ || !list.some((b) => key(b.width, b.hg) === BQ)) BQ = key(list[0].width, list[0].hg);
  const q = el('input', {type: 'search', placeholder: 'Search quality', value: BQS || null, 'aria-label': 'Search quality', autocomplete: 'off', spellcheck: 'false'});
  const box = el('div', {role: 'group', 'aria-label': 'Qualities'});
  const dot = {published: 'var(--good)', 'single-loom': 'var(--info)', provisional: 'var(--warn)'};
  const draw = () => {
    const f = BQS.trim().toLowerCase();
    const rows = list.filter((b) => !f || b.hg.toLowerCase().includes(f) || (b.width + ' cm').includes(f)).map((b) => {
      const k = key(b.width, b.hg);
      return el('button', {type: 'button', class: 'qrow', 'aria-pressed': k === BQ ? 'true' : 'false', 'data-hg': b.hg,
        onclick: () => { BQ = k; render(); if (window.innerWidth < 1180) { const d = $('#bdetail'); if (d) d.scrollIntoView({behavior: 'smooth', block: 'start'}); } }},
        el('span', {class: 'qdot', style: `background:${dot[b.status] || 'var(--muted)'}`, title: b.status}),
        el('div', {style: 'min-width:0'}, el('div', {class: 'qn', text: b.hg}), el('div', {class: 'qs', text: `${b.width} cm · ${b.n} loom-days · ${b.looms} loom${b.looms === 1 ? '' : 's'}`})),
        el('div', {class: 'qv'}, `RPM ${f0(b.rpm)}`, el('br'), `air ${f1(b.apk)}`, ...(typeof fxBenchListLine === 'function' ? fxBenchListLine(b.width, b.hg) || [] : [])));
    });
    box.replaceChildren(...(rows.length ? rows : [el('div', {class: 'empty', text: 'No quality matches.'})]));
  };
  q.addEventListener('input', () => { BQS = q.value; draw(); });
  draw();
  const left = el('div', {class: 'card bench-list'}, el('div', {class: 'search'}, icon('search', 18), q), box,
    el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'qdot', style: 'background:var(--good)'}), 'benchmark'),
      el('span', {class: 'lg'}, el('span', {class: 'qdot', style: 'background:var(--info)'}), 'single loom'), el('span', {class: 'lg'}, el('span', {class: 'qdot', style: 'background:var(--warn)'}), 'provisional')),
    typeof fxBenchListNote === 'function' ? fxBenchListNote() : null);
  const [w, hg] = BQ.split('|'); const b = bench(w, hg);
  const day = agg((D.loomdays || []).filter((x) => x.date === D.latest && String(x.width) === w && x.hg === hg && x.run >= 60));
  const met = el('div', {class: 'chips', role: 'group', 'aria-label': 'Metric'}, BMET_LIST.map(([k, l]) => el('button', {type: 'button', class: 'chip', 'aria-pressed': BMET === k ? 'true' : 'false', text: l, onclick: () => { BMET = k; render(); }})));
  const view = BMET === 'apk' ? {view: 'cfm', rpm: day && day.rpm} : {};
  const R = b.runs && b.runs[BMET];
  // Benchmark (percentile) or Best (single best loom-day); warp breaks has no best because its benchmark is a median.
  const kind = BKIND === 'best' && BEST_OK[BMET] ? 'best' : 'pct';
  const kindSeg = el('div', {class: 'segmented', role: 'group', 'aria-label': 'Benchmark or best', style: 'min-width:260px'},
    el('button', {type: 'button', 'aria-pressed': kind === 'pct' ? 'true' : 'false', text: 'Benchmark', onclick: () => { BKIND = 'pct'; render(); }}),
    el('button', {type: 'button', 'aria-pressed': kind === 'best' ? 'true' : 'false', text: 'Best', disabled: BEST_OK[BMET] ? null : true,
      title: BEST_OK[BMET] ? 'The single best loom-day' : 'Warp breaks are benchmarked on the median, so there is no best', onclick: () => { BKIND = 'best'; render(); }}));
  if (typeof wkPut === 'function') wkPut('D1', kind === 'best' ? null : wkBench(w, hg, BMET));   // Round J
  const right = el('div', {id: 'bdetail', style: 'display:grid;gap:16px;min-width:0;scroll-margin-top:12px'},
    el('div', {class: 'card'},
      el('div', {class: 'cardhead'}, el('div', {}, el('h2', {}, hgLink(hg, w, D.latest)), el('div', {class: 'note', text: `${w} cm · ${b.n} loom-days on ${b.dates} dates from ${b.looms} looms · click the name for every loom that ran it on ${dfmt(D.latest)}`})),
        el('div', {class: 'sw'}, el('span', {class: 'pill ' + ({published: 'good', 'single-loom': 'info', provisional: 'warn'}[b.status] || 'muted'), text: b.status === 'published' ? 'benchmark' : b.status}))),
      benchSummary(w, hg, day, day ? `Latest day, ${dfmt(D.latest)}` : `Latest day (did not run)`)),
    el('div', {class: 'toolbar', style: 'margin:0'}, kindSeg, met),
    kind === 'best'
      ? el('div', {class: 'card'}, el('div', {class: 'cardhead'}, el('h3', {text: `${BMETA[BMET].label}: best loom-day`})), ...bmDetail(w, hg, BMET, 'best', view))
      : el('div', {class: 'card'}, el('div', {class: 'cardhead'}, el('h3', {text: `${BMETA[BMET].label}: benchmark${R ? ' · ' + pctText(R.pct) : ''}`})), ...bmDetail(w, hg, BMET, 'pct', view)));
  s.append(el('div', {class: 'bench-layout'}, left, right));
  return s;
}

// <<COSTING-TAB
// ================================================================ COSTING TAB + COMPRESSOR MONEY (spliced into index.html; source: pipeline notes in README)
// The Costing tab reads app_data costing (costing_plant for plant view), written by the costing stream (pipeline/costing.py). It never reads the
// Toyota loom data, and the loom tabs never read it. Power (Compressor) is deliberately absent from the Costing tab:
// it sits in the loom data (D.power) and is used on the CFM and Pressure tabs.
let COST = null, COST_LOADING = false, COST_ERR = '';
// Sheet checks (14 Nov 2026, owner only): app_data 'cost_checks', which the database lets only the owner read (0015). null when
// not loaded (any other role, or no row yet).
let CCHK = null;
// The Costing tab shows November 2026 onward only: earlier days, comparisons with them (the bridge from the day before,
// same day last month) and style names last seen before then are dropped when the data loads.
const COST_FROM = '2026-11-01';
function trimCost(c) {
  if (!c) return c;
  const keep = (L) => (L || []).filter((d) => d.date >= COST_FROM).map((d) => {
    const x = {...d};
    if (x.bridge && x.bridge.prev_date < COST_FROM) delete x.bridge;
    if (x.bridge_mtd && x.bridge_mtd.prev_date < COST_FROM) delete x.bridge_mtd;
    if (x.ly && x.ly.date < COST_FROM) delete x.ly;
    return x;
  });
  c.days = keep(c.days);
  if (Array.isArray(c.days_entered)) c.days_entered = keep(c.days_entered);
  if (c.bq) { c.bq.days = (c.bq.days || []).filter((d) => d.date >= COST_FROM); c.bq.reg = (c.bq.reg || []).filter((e) => e.date >= COST_FROM); }
  c.unassigned = (c.unassigned || []).filter((u) => (u.last || '') >= COST_FROM);
  c.skipped = (c.skipped || []).filter((d) => d >= COST_FROM);
  return c;
}
let CDATE = '', CPER = 7, CLINE = 'POWER', CHG = '', CHSEL = '', CLINE_SET = false, CLQ = '';
// Production by quality head group: 'today' (default) or 'mtd'. Remembered per browser.
let CHGV = 'today';
try { if (localStorage.getItem('w2-cost-hgview') === 'mtd') CHGV = 'mtd'; } catch (e) {}
// Round B1 (Divyam, 27 Nov 2026): the Costing tab's own Power units switch is gone (the app-wide basis, BASIS in costing.js,
// opens on Actual and is kept per email); its old per-device choice is dropped once, not carried over.
try { localStorage.removeItem('w2-cost-power2'); } catch (e) {}
const NA = 'Not available';
const monthName = (d) => new Date(d.slice(0, 7) + '-01T00:00:00Z').toLocaleDateString('en-GB', {month: 'long', timeZone: 'UTC'});
// Toggle boxes for line charts: one Set of switched-on series keys per chart id, kept while the page is open.
const TOGS = {};
// Round C1 (Divyam, 28 Nov 2026, audit #1): the one chart palette (style.css --c1…--c6, validated in both themes). Series take
// slots in this fixed order; a seventh or later series is grey (ccAt), never a colour used again. CSL: the slot each metric
// keeps on every chart (B grade and cut pieces the same slot wherever they are drawn).
const CC = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
const ccAt = (i) => i < CC.length ? CC[i] : 'var(--muted-2)';
// The slots were picked with the validator so the lines that share a chart are told apart by every pair (blue–violet,
// orange–yellow, orange–magenta and aqua–magenta are too close, so never put together undashed): realisation 1 · cost 2 ·
// profit 3 on one chart; realisation 1 · profit 3 · sale 2 (dashed) on the other; B grade 4 (dashed there) and cut pieces 5.
const CSL = {real: 'var(--c1)', cost: 'var(--c2)', cpp: 'var(--c1)', fcpp: 'var(--c2)', mtdf: 'var(--c3)', ly: 'var(--c4)', cut: 'var(--c5)', bgrade: 'var(--c4)', sale: 'var(--c2)', profit: 'var(--c3)'};
const rs = (x) => !ok(x) ? '—' : (x < 0 ? '−₹' : '₹') + Math.round(Math.abs(x)).toLocaleString('en-IN');
const pn = (x, n = 1) => !ok(x) ? '—' : x.toFixed(n);
const sg = (x, n = 2) => !ok(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(n);
const pc = (x) => !ok(x) ? '—' : (x * 100).toFixed(1) + '%';
// ---- custom date range: one start and end date shared by every period switch in the app ("Dates"), kept on this device.
// A switch set to "Dates" shows only the days that fall inside it; an unset or out-of-range end falls back to the data.
let RNG = {from: '', to: ''};
try { const r = JSON.parse(localStorage.getItem('w2-range') || '{}'); for (const k of ['from', 'to']) if (/^\d{4}-\d{2}-\d{2}$/.test(r[k] || '')) RNG[k] = r[k]; } catch (e) {}
function rngOf(all) {
  const lo = all[0] || '', hi = all[all.length - 1] || '';
  const to = RNG.to && RNG.to >= lo && RNG.to <= hi ? RNG.to : hi;
  const from = RNG.from && RNG.from >= lo && RNG.from <= to ? RNG.from : (all.filter((d) => d <= to).slice(-14)[0] || lo);
  return {from, to, lo, hi};
}
const rngDays = (all) => { const r = rngOf(all); return all.filter((d) => d >= r.from && d <= r.to); };
const rngNote = (all) => { const r = rngOf(all), n = rngDays(all).length; return r.from ? `${dfmt(r.from)} – ${dfmt(r.to)} · ${n} day${n === 1 ? '' : 's'}` : ''; };
function rngCtl(all, onChange) {
  const r = rngOf(all);
  const inp = (k, lab) => {
    const i = el('input', {type: 'date', class: 'rngin', min: r.lo || null, max: r.hi || null, value: r[k] || null, 'aria-label': lab});
    i.addEventListener('change', () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(i.value)) return;
      const cur = rngOf(all); RNG.from = cur.from; RNG.to = cur.to; RNG[k] = i.value;
      if (RNG.from > RNG.to) { if (k === 'from') RNG.to = RNG.from; else RNG.from = RNG.to; }
      try { localStorage.setItem('w2-range', JSON.stringify(RNG)); } catch (e) {}
      onChange();
    });
    return i;
  };
  return el('span', {class: 'rng'}, el('span', {class: 'note', text: 'From'}), inp('from', 'Start date'), el('span', {class: 'note', text: 'to'}), inp('to', 'End date'));
}

async function loadCosting(force) {   // the costing comes with the loom data from the database (loadDataDb); this only redraws
  if (COST_LOADING || (COST && !force)) return;
  if (TAB === 'costing') render();
}
