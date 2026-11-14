// W2 Looms · app/pages-config.js — Targets, Data health and Benchmarks pages.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- Targets
function pageTargets() {
  const s = el('section', {class: 'page', id: 'targets'});
  s.append(el('div', {}, el('h2', {text: `Targets, ${wLabel()}`}),
    el('p', {class: 'lead', text: `Set any or all of target CFM, RPM and main pressure for a head group on each width. Leave a box empty for no target. The effective RPM target is ${f0(ERPM_TGT * 100)}% of the target RPM, so it needs no box of its own. Every page compares against these alongside the benchmark and best; they apply as soon as you save. 280 cm head groups count double panna (picks ×2, air per 1,000 picks halved) unless you switch them to single panna here; that applies straight away too.`})));
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
      const box = el('input', {type: 'number', id: `${id}-${f}`, step, min: '0', inputmode: 'decimal', 'aria-label': `Target ${f} for ${hg} ${w} cm`, value: ok(t[f]) ? String(t[f]) : null});
      const rb = () => { const v = box.value.trim() === '' ? null : Number(box.value); return rangeBar({now, bm, best, tg: ok(v) && v > 0 ? v : null, fmt, aria: `${f.toUpperCase()} for ${hg}, ${w} cm: now, benchmark, best and target`}); };
      let bar = rb(); box.addEventListener('input', () => { const nb = rb(); bar.replaceWith(nb); bar = nb; });
      return el('div', {}, el('div', {class: 'tgin'}, box, bar),
      el('div', {class: 'hint'}, `now ${fmt(now)} · `, ok(bm) && bk ? bmBtn('bm ' + fmt(bm), w, hg, bk.m, bk) : `bm ${fmt(bm)}`,
        ok(best) && bk ? [' · ', bmBtn('best ' + fmt(best), w, hg, bk.m, {...bk, kind: 'best'})] : null, extra || null)); };
    const msg = el('div', {class: 'meta'});
    const btn = el('button', {class: 'primary', type: 'button', text: 'Save', disabled: !db});
    const save = async (onlyChanged) => {
      const num = (f) => { const v = $(`#${id}-${f}`).value.trim(); if (v === '') return null; const n = Number(v); return isFinite(n) && n > 0 ? n : NaN; };
      const vals = {cfm: num('cfm'), rpm: num('rpm'), main: num('main')};
      if (Object.values(vals).some((v) => Number.isNaN(v))) { msg.className = 'err'; msg.textContent = 'Use positive numbers, or leave the box empty.'; return 'bad'; }
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
        msg.className = 'saved'; msg.textContent = 'Saved';
      } catch (e) { msg.className = 'err'; msg.textContent = 'Could not save: ' + (e && e.message || 'no write access'); res = 'err'; }
      btn.disabled = false;
      return res;
    };
    btn.addEventListener('click', () => save(false));
    savers.push(save);
    const cB = A ? cfmOf(b.apk, w, hg, A.rpm) : null;
    return [el('span', {}, hgLink(hg, w, D.latest), el('div', {class: 'note', text: w + ' cm'})),
      inp('cfm', '0.1', A && A.cfm, cB, A ? cfmOf(bestVal(w, hg, 'apk'), w, hg, A.rpm) : null, f1, {m: 'apk', view: 'cfm', rpm: A && A.rpm}),
      inp('rpm', '1', A && A.rpm, b.rpm, bestVal(w, hg, 'rpm'), f0, {m: 'rpm'}, ok(t.rpm) ? el('div', {}, `effective RPM target ${f0(t.rpm * ERPM_TGT)} (${f0(ERPM_TGT * 100)}%)`) : null),
      inp('main', '0.05', A && A.main_max, ok(b.main_max) ? b.main_max : b.main, bestVal(w, hg, pkey(b)), f2, {m: pkey(b)}),
      ...(W === '190' ? [] : [String(w) === '280' ? pannaSwitch(w, hg) : el('span', {class: 'note', text: 'single panna'})]), el('div', {}, btn, msg)];
  });
  const tb = table(['Head group', ['Target CFM', 'ft³/min while running'], ['Target RPM', 'picks/min'], ['Target main pressure', 'kgf/cm²'], ...(W === '190' ? [] : [['Panna', '280 cm: double unless switched']]), ''], rows);
  tb.classList.add('tg');
  // Save all: saves every head group whose boxes differ from what is saved, one after another, and reports the count.
  const allMsg = el('span', {class: 'meta'});
  const allBtns = [];
  const saveAll = async () => {
    for (const x of allBtns) x.disabled = true;
    allMsg.className = 'meta'; allMsg.textContent = 'Saving…';
    const n = {saved: 0, same: 0, bad: 0, err: 0};
    for (const f of savers) n[await f(true)] += 1;
    for (const x of allBtns) x.disabled = !db;
    allMsg.className = n.err || n.bad ? 'err' : 'saved';
    allMsg.textContent = !n.saved && !n.err && !n.bad ? 'Nothing changed to save.' : [`${n.saved} head group${n.saved === 1 ? '' : 's'} saved`, n.bad ? `${n.bad} with a number to fix` : null, n.err ? `${n.err} could not be saved` : null].filter(Boolean).join(' · ');
  };
  const allBar = () => { const b = el('button', {class: 'primary', type: 'button', text: 'Save all', disabled: !db, onclick: saveAll}); allBtns.push(b); return el('div', {class: 'toolbar'}, b, allMsg); };
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
      ['Loom-day counts toward benchmark from', st.benchmark_min_run_min + ' min run'], ['RPM tolerance', st.tol_rpm_pct + '%'],       ['Air and CFM tolerance', st.tol_air_pct + '%'], ['Pressure tolerance (this page)', PRESS_TOL + ' kgf/cm²'], ['Line drop, compressor to loom', st.line_drop_bar + ' bar'],
      ['Long power-down (this page)', OFF_LONG / 60 + ' h'], ['Consistently low efficiency', `below ${f0(EFF_BAD())}% on ${LOW_EFF_DAYS} of last ${LOW_EFF_WINDOW} running days`]])));
  s.append(el('p', {class: 'note', text: `Data generated ${D.generated_at} IST. Head groups, machine master and thresholds are edited in the W2 Loom Performance Config sheet; targets on the Targets tab.`}));
  return s;
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
      el('p', {class: 'note', text: 'Two shift files a day is the normal day. Set aside means the run could not use the file (the table below says why); duplicates and superseded files are copies or older versions of a file already read.'})));
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
        el('div', {class: 'qv'}, `RPM ${f0(b.rpm)}`, el('br'), `air ${f1(b.apk)}`));
    });
    box.replaceChildren(...(rows.length ? rows : [el('div', {class: 'empty', text: 'No quality matches.'})]));
  };
  q.addEventListener('input', () => { BQS = q.value; draw(); });
  draw();
  const left = el('div', {class: 'card bench-list'}, el('div', {class: 'search'}, icon('search', 18), q), box,
    el('div', {class: 'legend'}, el('span', {class: 'lg'}, el('span', {class: 'qdot', style: 'background:var(--good)'}), 'benchmark'),
      el('span', {class: 'lg'}, el('span', {class: 'qdot', style: 'background:var(--info)'}), 'single loom'), el('span', {class: 'lg'}, el('span', {class: 'qdot', style: 'background:var(--warn)'}), 'provisional')));
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
// Power units: 'fixed' = POWER units with the flat 0.02 rupees per pick taken out (default), 'entered' = as in the plant's file.
// Display only: the sheets are never changed. Remembered per browser.
let CPOW = 'entered';   // the plant's figures are the headline (decided 9 Nov 2026)
// Production by quality head group: 'today' (default) or 'mtd'. Remembered per browser.
let CHGV = 'today';
try { if (localStorage.getItem('w2-cost-hgview') === 'mtd') CHGV = 'mtd'; } catch (e) {}
try { if (localStorage.getItem('w2-cost-power2') === 'fixed') CPOW = 'fixed'; } catch (e) {}
const NA = 'Not available';
const monthName = (d) => new Date(d.slice(0, 7) + '-01T00:00:00Z').toLocaleDateString('en-GB', {month: 'long', timeZone: 'UTC'});
// Toggle boxes for line charts: one Set of switched-on series keys per chart id, kept while the page is open.
const TOGS = {};
const CC = ['var(--accent)', 'var(--info)', 'var(--warn)', 'var(--bad)', 'var(--muted)', '#8e6bbf', '#c77d1a'];
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
