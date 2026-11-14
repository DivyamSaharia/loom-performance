// W2 Looms · app/nav.js — Navigation, search, theme, the page table and render().
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- Navigation, search, theme
const ICONS = {
  bolt: ['M13 3 4 14h7l-1 7 9-11h-7l1-7z'], spin: ['M20 12a8 8 0 1 1-2.3-5.6', 'M20 4v4h-4', 'M12 12l3-2'], layers: ['M12 3 3 8l9 5 9-5-9-5z', 'M3 12.5l9 5 9-5', 'M3 16.5l9 5 9-5'],
  bars: ['M5 20v-9', 'M12 20V4', 'M19 20v-6', 'M3 20h18'], wind: ['M3 8h10a3 3 0 1 0-3-3', 'M3 12h15a3 3 0 1 1-3 3', 'M3 16h6'],
  gauge: ['M4.5 17a8.5 8.5 0 1 1 15 0', 'M12 14l4-5', ['circle', {cx: 12, cy: 14, r: 1.3}]], power: ['M12 3v8', 'M7 5.8a8 8 0 1 0 10 0'],
  warp: ['M6 4v16', 'M12 4v6', 'M12 14v6', 'M18 4v16'], trend: ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'],
  target: [['circle', {cx: 12, cy: 12, r: 9}], ['circle', {cx: 12, cy: 12, r: 5}], ['circle', {cx: 12, cy: 12, r: 1.2}]],
  db: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  people: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  help: [['circle', {cx: 12, cy: 12, r: 9}], 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6', ['circle', {cx: 12, cy: 17, r: 0.6}]],
  sun: [['circle', {cx: 12, cy: 12, r: 4}], 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'], refresh: ['M20 11a8 8 0 0 0-14.6-4.5L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14.6 4.5L20 16', 'M20 20v-4h-4'],
  rupee: ['M7 5h10', 'M7 9.5h10', 'M7 5h2.5a4.5 4.5 0 0 1 0 9H7l7 6'], search: [['circle', {cx: 11, cy: 11, r: 7}], 'M20 20l-4-4'], dots: [['circle', {cx: 5, cy: 12, r: 1.4}], ['circle', {cx: 12, cy: 12, r: 1.4}], ['circle', {cx: 19, cy: 12, r: 1.4}]]};
function icon(name, size = 20) {
  const s = svgEl('svg', {width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'});
  for (const d of ICONS[name]) s.append(typeof d === 'string' ? svgEl('path', {d}) : svgEl(d[0], d[1]));
  return s;
}
const NAV = [['actions', 'Actions', 'bolt'], ['quality', 'Quality', 'layers'], ['benchmarks', 'Benchmarks', 'bars'], ['cfm', 'CFM', 'wind'], ['erpm', 'Effective RPM', 'spin'], ['pressure', 'Pressure', 'gauge'],
  ['utilisation', 'Utilisation', 'power'], ['warp', 'Warp breaks', 'warp'], ['costing', 'Costing', 'rupee'], ['targets', 'Targets', 'target']];
const TITLES = Object.assign(Object.fromEntries(NAV.map((n) => [n[0], n[1]])), {data: 'Data health', access: 'Access', fabric: 'Fabric health',
  approvals: 'Approvals', masters: 'Fabric masters', links: 'Head-group links', realisation: 'Realisation'});
// The admin's own screens (database mode): Access and the fabric integration's. Realisation shows only once switched on.
const ADMIN_TABS = ['access', 'fabric', 'approvals', 'masters', 'links', 'realisation'];
const FAB_NAV = [['approvals', 'Approvals', 'layers', 'approvals'], ['masters', 'Fabric masters', 'layers'], ['links', 'Head-group links', 'layers'], ['realisation', 'Realisation', 'rupee']];
// Reading order, not build order (11 Nov 2026): the sidebar and the More sheet are grouped Today / Looms / Money / Setup /
// Admin. Items keep their ids and classes (sb-data, sb-access, sb-fabric, sb-fx, sb-realisation): the CSS, fxAfterSignIn
// and tabAllowed hide what a role may not see, and a group whose items are all hidden hides its label (sbGroups).
const GROUPS = [['Today', ['actions']], ['Looms', ['quality', 'benchmarks', 'cfm', 'erpm', 'pressure', 'utilisation', 'warp']], ['Money', ['costing', 'realisation']],
  ['Setup', ['targets', 'links', 'masters', 'approvals']], ['Admin', ['data', 'fabric', 'access']]];
const ITEMS = Object.assign(Object.fromEntries(NAV.map((n) => [n[0], {label: n[1], ic: n[2]}])), {data: {label: 'Data health', ic: 'db', id: 'sb-data'}, access: {label: 'Access', ic: 'people', id: 'sb-access', db: true, badge: 'access'},
  fabric: {label: 'Fabric health', ic: 'layers', id: 'sb-fabric', db: true}}, Object.fromEntries(FAB_NAV.map((n) => [n[0], {label: n[1], ic: n[2], id: 'sb-' + n[0], db: true, fx: true, badge: n[3], hidden: n[0] === 'realisation'}])));
const MOB = ['actions', 'quality', 'cfm', 'costing'];
function buildNav() {
  const item = (id, cls, size) => { const it = ITEMS[id]; return el('a', {class: cls + (it.fx ? ' sb-fx' : ''), href: '#' + id, 'data-tab': id, id: cls === 'sb-item' ? it.id || null : null, hidden: it.hidden ? true : null},
    icon(it.ic, size), el('span', {text: it.label}), it.badge ? el('span', {class: 'badge', 'data-badge': it.badge, hidden: true}) : el('span', {class: 'sb-count', 'data-count': id})); };
  const inMode = (id) => !ITEMS[id].db || MODE === 'db';
  $('#sbnav').replaceChildren(...GROUPS.flatMap(([name, ids]) => { const its = ids.filter(inMode); return its.length ? [el('div', {class: 'sb-grp', 'data-grp': name, text: name}), ...its.map((id) => item(id, 'sb-item', 20))] : []; }));
  $('#sb-guide').replaceChildren(icon('help'), el('span', {text: 'Guide'}));
  const tb = $('#tabbar');
  tb.replaceChildren(...MOB.map((id) => { const n = NAV.find((x) => x[0] === id); return el('a', {href: '#' + id, 'data-tab': id}, icon(n[2], 24), el('span', {text: n[1]}), el('span', {class: 'badge', 'data-badge': id, hidden: true})); }),
    el('button', {type: 'button', id: 'morebtn', onclick: () => $('#more').showModal()}, icon('dots', 24), el('span', {text: 'More'})));
  const more = $('#more');
  more.replaceChildren(...GROUPS.flatMap(([name, ids]) => { const its = ids.filter((id) => inMode(id) && !MOB.includes(id)); return its.length ? [el('div', {class: 'more-grp', 'data-grp': name, text: name}), ...its.map((id) => { const a = item(id, 'more-item', 22); a.addEventListener('click', () => more.close()); return a; })] : []; }),
    el('a', {href: '#', onclick: (e) => { e.preventDefault(); more.close(); openGuide(); }}, icon('help', 22), el('span', {text: 'Guide'})));
  more.addEventListener('click', (e) => { if (e.target === more) more.close(); });
  for (const a of document.querySelectorAll('.sb-nav .sb-item[data-tab="actions"]')) a.append(el('span', {class: 'badge', 'data-badge': 'actions', hidden: true}));
  $('#sb-guide').addEventListener('click', openGuide);
  $('#help').replaceChildren(icon('help', 22)); $('#help').addEventListener('click', openGuide);
  $('#refresh').replaceChildren(icon('refresh', 20)); $('#refresh-m').replaceChildren(icon('refresh', 22));
  $('#gs-icon').replaceChildren(icon('search', 18));
  sbGroups();
}
// A group label shows only while one of its items does (plant view, other admins and the Realisation switch collapse groups).
function sbGroups() {
  for (const root of ['#sbnav', '#more']) for (const g of document.querySelectorAll(root + ' [data-grp]')) {
    let n = g.nextElementSibling, any = false;
    for (; n && !n.dataset.grp; n = n.nextElementSibling) if (n.dataset.tab && !n.hidden && getComputedStyle(n).display !== 'none') any = true;
    g.hidden = !any;
  }
}

const PAGES = {actions: pageActions, quality: pageQuality, benchmarks: pageBench, pressure: pagePressure, cfm: pageCfm, erpm: pageErpm, utilisation: pageUtil, warp: pageWarp, costing: pageCosting, targets: pageTargets, data: pageData, access: pageAccess, fabric: pageFabric,
  approvals: pageApprovals, masters: pageMasters, links: pageLinks, realisation: pageRealisation};
function render() {
  if (!D) return;
  for (const b of document.querySelectorAll('.segmented[aria-label="Loom width"] button')) b.setAttribute('aria-pressed', b.dataset.w === W ? 'true' : 'false');
  for (const a of document.querySelectorAll('[data-tab]')) { if (a.dataset.tab === TAB) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  const mb = $('#morebtn'); if (mb) { if (!MOB.includes(TAB)) mb.setAttribute('aria-current', 'page'); else mb.removeAttribute('aria-current'); }
  const pendingNames = (D.unassigned || []).filter((u) => !assigned[u.style]).length;
  for (const bd of document.querySelectorAll('[data-badge="actions"]')) { bd.hidden = !pendingNames; bd.textContent = pendingNames; }
  const nb = (D.benchmarks || []).filter((b) => inW(b.width)).length;
  for (const c of document.querySelectorAll('[data-count="benchmarks"]')) c.textContent = nb || '';
  $('#ptitle').textContent = TITLES[TAB] || 'Loom Performance';
  sbGroups();
  document.title = `${TITLES[TAB] || 'Loom Performance'} · W2 Looms`;
  const y = window.scrollY;
  { // only the filters that change what the tab shows: Costing, Access and Data health don't follow the loom width or the day
    const noF = TAB === 'costing' || (ADMIN_TABS.includes(TAB) && TAB !== 'realisation');   // Realisation follows the width and the day (12 Nov 2026)
    const fl = $('.filters'); if (fl) fl.hidden = noF;
    const ws = $('.segmented[aria-label="Loom width"]'); if (ws) ws.hidden = TAB === 'pressure' || TAB === 'data';
    const dy = $('#day'); if (dy) dy.hidden = TAB === 'data';
    const as = $('#asof'); if (as) as.hidden = ADMIN_TABS.includes(TAB) && TAB !== 'realisation'; }
  $('#main').replaceChildren(PAGES[TAB]());
  if (TRTABS[TAB]) addRowTrendButtons($('#main'));
  fixPlurals($('#main'));
  jumpNav($('#main > section.page'));
  applyFilter();
  setStickTop();
  window.scrollTo(0, y);
}
// Sticky period bars sit just under the sticky section bar: tell CSS how tall that bar is (0 when the tab has none).
function setStickTop() { const j = $('#main .jump'); document.documentElement.style.setProperty('--stick-top', (j && !j.hidden ? j.offsetHeight : 0) + 'px'); }
window.addEventListener('resize', () => setStickTop());
// No half-empty rows anywhere in the app: in a grid of cards or charts, the last item of a short final row stretches across
// the space left (a lone card in a two-column grid takes the full width). Runs after every redraw and on resize.
const GAPGRIDS = '.grid,.split,.trgrid,.sdgrid,.kpis';   // .kpis too (R2, 11 Nov 2026): a lone fifth tile stretches across its row
function fillGaps(root) {
  for (const g of (root || document).querySelectorAll(GAPGRIDS)) {
    const kids = [...g.children].filter((c) => !c.hidden);
    for (const c of kids) if (c.dataset.gapfill) { c.style.gridColumn = ''; delete c.dataset.gapfill; }
    const tpl = getComputedStyle(g).gridTemplateColumns;
    const cols = !tpl || tpl === 'none' ? 0 : tpl.split(' ').filter((t) => parseFloat(t) > 0).length;
    const rem = cols >= 2 && kids.length >= 2 ? kids.length % cols : 0, last = rem ? kids.at(-1) : null;
    for (const c of kids) if (c === last) { c.style.gridColumn = `span ${cols - rem + 1}`; c.dataset.gapfill = '1'; }
  }
}
// Every chart is drawn at the width it is shown at, so its text stays at its real size (11 px) on a phone, in a half-width
// card and in a stretched one. A chart with a minimum width (the waterfall) scrolls sideways inside its box below it.
function fitCharts(root) {
  for (const v of (root || document).querySelectorAll('svg')) {
    if (!v.__redraw || !v.isConnected || !v.parentElement) continue;
    const cw = v.parentElement.clientWidth; if (!cw) continue;
    const t = Math.max(v.__min || 260, Math.round(cw));
    if (Math.abs(t - v.__w) > 4) v.replaceWith(v.__redraw(t));
  }
}
let GAP_RAF = 0;
const gapSoon = () => { if (!GAP_RAF) GAP_RAF = requestAnimationFrame(() => { GAP_RAF = 0; collapseAll(); fillGaps(document); fitCharts(document); }); };
if ('MutationObserver' in window) new MutationObserver(gapSoon).observe(document.documentElement, {childList: true, subtree: true});
window.addEventListener('resize', gapSoon);
document.addEventListener('toggle', gapSoon, true);   // a chart inside a <details> that has just opened
// "1 dates" → "1 date": counts written as template text get the singular when the count is exactly one.
const PLURAL = /(^|[^\d.,])1 (loom-days|looms|dates|days|lines|breaks|names|styles|files|items|head groups|qualities|entries)\b/g;
const SING = {'loom-days': 'loom-day', looms: 'loom', dates: 'date', days: 'day', lines: 'line', breaks: 'break', names: 'name', styles: 'style', files: 'file', items: 'item', 'head groups': 'head group', qualities: 'quality', entries: 'entry'};
function fixPlurals(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) if (n.nodeValue.includes('1 ')) { const v = n.nodeValue.replace(PLURAL, (m, a, b) => a + '1 ' + SING[b]); if (v !== n.nodeValue) n.nodeValue = v; }
}
// Section bar (every tab with 3+ sections, laptop and phone): one sticky row that never needs scrolling. It names the
// section on screen, shows as many chips as fit (Costing: its groups; other tabs: the sections), and "All sections" opens
// every section at once, grouped. Costing groups follow the page order; JMOVE puts a section into another group.
const JGROUPS = [['Needs a head group', 'To do'], ['Why cost per pick moved', 'Today'], ['Fixed against variable cost', 'Today'], ['Cost per pick', 'Trends'], ['Any single expense line', 'Expenses'],
  ['Production by quality head group', 'Production'], ['B grade and cut pieces', 'B grade'], ['Month to date', 'Month'], ['File health', 'Files']];
const JMOVE = {'Stock and dispatch': 'Production'};
const jshort = (t) => t.replace(/\s·\s\d[\d,]*\s\w+$/, '').replace(/^Current vs benchmark, best and target, by loom$/, 'By loom')
  .replace(/^Benchmark, best and target vs running .*/, 'vs benchmark').replace(/^If every loom ran at its reference .*/, 'If every loom ran at reference')
  .replace(/^What (the|lowering the) .* (is )?worth$/, 'What it is worth');
let JUMP_IO = null, JUMP_DOC = null, JUMP_RO = null;
function jumpNav(page) {
  if (JUMP_IO) { JUMP_IO.disconnect(); JUMP_IO = null; }
  if (JUMP_RO) { JUMP_RO.disconnect(); JUMP_RO = null; }
  if (JUMP_DOC) { document.removeEventListener('click', JUMP_DOC); document.removeEventListener('keydown', JUMP_DOC); JUMP_DOC = null; }
  if (!page) return;
  const hs = [...page.querySelectorAll('.card>.cardhead>h3, .card>summary>h3, h3.sechead')].filter((h) => !h.closest('tr.drillrow') && h.textContent.trim());
  if (hs.length < 3) return;
  const groups = [], byName = {}; let g = null;
  const grp = (name) => byName[name] || (groups.push(byName[name] = {name, items: []}), byName[name]);
  const items = hs.map((h) => {
    const name = h.textContent.trim(), t = h.closest('.card') || h, start = page.id === 'costing' ? JGROUPS.find((x) => x[0] === name) : null;
    let gg;
    if (page.id === 'costing' && JMOVE[name]) gg = grp(JMOVE[name]);
    else { if (start || !g) g = grp(start ? start[1] : 'On this page'); gg = g; }
    const it = {name, t, g: gg}; gg.items.push(it);
    t.classList.add('jumped'); return it;
  });
  const order = groups.flatMap((gr) => gr.items); // panel and chip order: by group
  const grouped = groups.length > 1;
  const go = (it) => { if (it.t.tagName === 'DETAILS') it.t.open = true; if (it.t.classList.contains('shut')) foldSet(it.t, false); close(); it.t.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'}); };
  const now = el('div', {class: 'jnow'}, el('b', {text: items[0].name}));
  const chips = grouped ? groups.map((gr) => ({b: el('button', {type: 'button', text: gr.name, onclick: () => go(gr.items[0])}), on: (c) => c.g === gr}))
    : order.map((it) => ({b: el('button', {type: 'button', text: jshort(it.name), title: it.name, onclick: () => go(it)}), on: (c) => c === it}));
  const box = el('div', {class: 'jgroups'}, chips.map((c) => c.b));
  const panel = el('div', {class: 'jpanel', id: 'jpanel', role: 'menu', hidden: true},
    groups.map((gr) => el('div', {class: 'jg'}, el('h4', {text: gr.name}), gr.items.map((it) => (it.b = el('button', {type: 'button', role: 'menuitem', text: it.name, onclick: () => go(it)}))))));
  const all = el('button', {type: 'button', class: 'jall', 'aria-expanded': 'false', 'aria-controls': 'jpanel', onclick: (e) => { e.stopPropagation(); panel.hidden ? open() : close(); }},
    `All ${items.length}`, el('span', {class: 'w', text: ' sections'}), ' ▾');
  function open() { panel.hidden = false; all.setAttribute('aria-expanded', 'true'); const c = panel.querySelector('[aria-current="true"]'); (c || panel.querySelector('button')).focus({preventScroll: true}); }
  function close() { panel.hidden = true; all.setAttribute('aria-expanded', 'false'); }
  const nav = el('nav', {class: 'jump', 'aria-label': 'Sections on this page'}, now, box, all, panel);
  JUMP_DOC = (e) => { if (panel.hidden) return; if (e.type === 'keydown' ? e.key === 'Escape' : !nav.contains(e.target)) { close(); if (e.type === 'keydown') all.focus(); } };
  document.addEventListener('click', JUMP_DOC);
  document.addEventListener('keydown', JUMP_DOC);
  page.prepend(nav);
  // show only the chips that fit on the row; "All sections" always has every one
  const fit = () => { for (const c of chips) c.b.hidden = false; for (let k = chips.length - 1; k >= 0 && box.scrollWidth > box.clientWidth + 1; k--) chips[k].b.hidden = true; };
  requestAnimationFrame(fit);
  if ('ResizeObserver' in window) { let w = 0; JUMP_RO = new ResizeObserver(() => { if (nav.clientWidth !== w) { w = nav.clientWidth; fit(); } }); JUMP_RO.observe(nav); }
  if ('IntersectionObserver' in window) {
    const vis = new Set();
    JUMP_IO = new IntersectionObserver((es) => {
      for (const e of es) e.isIntersecting ? vis.add(e.target) : vis.delete(e.target);
      const cur = items.find((x) => vis.has(x.t)); if (!cur) return;
      now.replaceChildren(grouped && cur.g.name !== cur.name ? `${cur.g.name} · ` : '', el('b', {text: cur.name}));
      for (const it of items) it.b.setAttribute('aria-current', it === cur ? 'true' : 'false');
      for (const c of chips) c.b.setAttribute('aria-current', c.on(cur) ? 'true' : 'false');
    }, {rootMargin: '-60px 0px -55% 0px'});
    for (const x of items) JUMP_IO.observe(x.t);
  }
}

// Access and the fabric screens are the admin's only; Realisation only once Divyam has switched it on; the plant view has no
// Data health either (10 Nov 2026). The database enforces the same with RLS.
const tabAllowed = (t) => !!PAGES[t] && (!ADMIN_TABS.includes(t) || isAdmin()) && (!['approvals', 'masters', 'links'].includes(t) || fxIsOwner()) && (t !== 'realisation' || fxAnalysisOn()) && !(t === 'data' && isPlant());
function setTab(t) { if (t === 'trends') t = 'quality'; TAB = tabAllowed(t) ? t : 'actions'; if (location.hash.slice(1) !== TAB) history.replaceState(null, '', '#' + TAB); render(); window.scrollTo(0, 0); }
function busyEditing(sel) { const a = document.activeElement; return a && a.closest && a.closest(sel); }

// Search: filters the rows of every table on the page (loom number = exact loom, text = head group or any cell)
// and suggests looms and head groups to open directly.
let QF = '', SUG = [], SUGI = -1;
const qIn = $('#q'), sugBox = $('#sugg');
function rowMatches(node, q) {
  const n = q.replace(/^loom\s*/, '').trim();
  const looms = [...node.querySelectorAll('[data-loom]')].map((e) => e.dataset.loom);
  if (/^\d+$/.test(n)) return looms.length ? looms.includes(String(+n)) : new RegExp('(^|\\D)' + n + '(\\D|$)').test(node.textContent);
  if ([...node.querySelectorAll('[data-hg]')].some((e) => e.dataset.hg.toLowerCase().includes(q)) || (node.dataset.hg || '').toLowerCase().includes(q)) return true;
  return node.textContent.toLowerCase().includes(q);
}
function applyFilter() {
  const q = QF.trim().toLowerCase(); const main = $('#main');
  let shown = 0, total = 0;
  for (const tr of main.querySelectorAll('tbody > tr')) {
    if (tr.classList.contains('drillrow') || tr.classList.contains('mark') || tr.parentElement.closest('tr.drillrow')) continue;
    total++;
    const hit = !q || rowMatches(tr, q);
    tr.hidden = !hit; if (hit) shown++;
    const nx = tr.nextElementSibling; if (nx && nx.classList.contains('drillrow')) nx.hidden = !hit;
  }
  for (const b of main.querySelectorAll('.qrow')) { const hit = !q || rowMatches(b, q); b.hidden = !hit; }
  collapseTables(main, !!q);
  const fn = $('#fnote');
  fn.replaceChildren(...(q ? ['Filtering tables on this page: ', el('b', {text: `${shown} of ${total}`}), ` rows match “${QF.trim()}” `, el('button', {class: 'ghost', type: 'button', text: 'Clear', onclick: clearSearch})] : []));
}
function suggestions(raw) {
  const q = raw.trim().toLowerCase(); if (!q || !D) return [];
  const out = []; const n = q.replace(/^loom\s*/, '');
  const hgNow = D.loom_hg || {};
  if (/^\d+$/.test(n)) {
    for (const l of Object.keys(D.machine || {}).map(Number).sort((a, b) => a - b)) {
      if (!String(l).startsWith(String(+n))) continue;
      const mc = D.machine[l] || {};
      out.push({k: 'Loom', label: `Loom ${l}`, sub: `${mc.width} cm ${mc.type || ''} · ${hgNow[l] || 'no run'}`, go: () => openLoom(l, D.latest)});
      if (out.length >= 8) break;
    }
    for (const o of out.slice(0, 2)) { const l = +o.label.slice(5); out.push({k: 'Trends', label: `Loom ${l} · all trends`, sub: 'every metric, 7 days or since changeover', go: () => openTrends({kind: 'loom', loom: l})}); }
  }
  const seen = new Map();
  for (const b of D.benchmarks || []) seen.set(key(b.width, b.hg), {w: String(b.width), hg: b.hg});
  for (const x of D.loomdays || []) if (x.hg !== 'Unassigned') seen.set(key(x.width, x.hg), {w: String(x.width), hg: x.hg});
  const hits = [...seen.values()].filter((v) => v.hg.toLowerCase().includes(q)).sort((a, b) => (W !== 'all' && (a.w === W) !== (b.w === W) ? (a.w === W ? -1 : 1) : 0) || a.hg.localeCompare(b.hg) || a.w.localeCompare(b.w));
  for (const v of hits.slice(0, 10)) {
    const nl = new Set((D.loomdays || []).filter((x) => x.date === D.latest && x.hg === v.hg && String(x.width) === v.w).map((x) => x.loom)).size;
    out.push({k: 'Head group', label: v.hg, sub: `${v.w} cm · ${nl} loom${nl === 1 ? '' : 's'} on ${dfmt(D.latest)}`,
      go: () => { if (TAB === 'benchmarks' && bench(v.w, v.hg)) { BQ = key(v.w, v.hg); render(); } else openHg(v.hg, v.w, D.latest); }});
  }
  for (const v of hits.slice(0, 2)) out.push({k: 'Trends', label: `${v.hg} ${v.w} cm · all trends`, sub: 'every metric, 7 / 14 / 30 days', go: () => openTrends({kind: 'hg', w: v.w, hg: v.hg})});
  if (!/^\d+$/.test(n) && typeof fxSearchHits === 'function') out.push(...fxSearchHits(q));   // R2: fabric names (owner, analysis on)
  return out;
}
function drawSugg() {
  if (!SUG.length && !QF.trim()) { sugBox.hidden = true; return; }
  sugBox.replaceChildren(...(SUG.length ? SUG.map((s, i) => el('button', {type: 'button', role: 'option', class: i === SUGI ? 'on' : null, 'aria-selected': i === SUGI ? 'true' : 'false',
    onmousedown: (e) => e.preventDefault(), onclick: () => pick(i)}, el('span', {class: 'k', text: s.k}), el('span', {text: s.label}), el('span', {class: 's', text: s.sub})))
    : [el('div', {class: 'none', text: 'No loom or head group matches. Tables below are filtered by this text.'})]));
  sugBox.hidden = false;
}
function pick(i) { const s = SUG[i]; if (!s) return; sugBox.hidden = true; qIn.blur(); s.go(); }
function clearSearch() { qIn.value = ''; QF = ''; SUG = []; SUGI = -1; sugBox.hidden = true; $('#q-clear').hidden = true; $('#q-kbd').hidden = false; applyFilter(); }
qIn.addEventListener('input', () => {
  QF = qIn.value; $('#q-clear').hidden = !QF; $('#q-kbd').hidden = !!QF;
  SUG = suggestions(QF); SUGI = SUG.length ? 0 : -1; drawSugg(); applyFilter();
});
qIn.addEventListener('focus', () => { if (QF) { SUG = suggestions(QF); drawSugg(); } });
qIn.addEventListener('blur', () => setTimeout(() => { sugBox.hidden = true; }, 120));
qIn.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && SUG.length) { e.preventDefault(); SUGI = (SUGI + 1) % SUG.length; drawSugg(); }
  else if (e.key === 'ArrowUp' && SUG.length) { e.preventDefault(); SUGI = (SUGI - 1 + SUG.length) % SUG.length; drawSugg(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (SUG.length) pick(SUGI < 0 ? 0 : SUGI); }
  else if (e.key === 'Escape') { if (qIn.value) clearSearch(); else qIn.blur(); }
});
$('#q-clear').addEventListener('click', () => { clearSearch(); qIn.focus(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
  const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return;
  if (dlg && dlg.open) return;
  e.preventDefault(); qIn.focus(); qIn.select();
});

// Light / dark (follows the phone or laptop until switched here)
const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
function setTheme(t, save) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  if (save) { try { localStorage.setItem('w2-theme', t || ''); } catch (e) {} }
  $('#theme').replaceChildren(icon(isDark() ? 'moon' : 'sun', 22));
  if (D) render();
}
$('#theme').addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark', true));
try { setTheme(localStorage.getItem('w2-theme') || '', false); } catch (e) { setTheme('', false); }

buildNav();
for (const b of document.querySelectorAll('.segmented[aria-label="Loom width"] button')) b.addEventListener('click', () => { W = b.dataset.w; try { localStorage.setItem('w2-width', W); } catch (e) {} render(); });
window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));
try { const w = localStorage.getItem('w2-width'); if (w === '190' || w === '280' || w === 'all') W = w; } catch (e) {}
TAB = location.hash.slice(1) === 'trends' ? 'quality' : PAGES[location.hash.slice(1)] ? location.hash.slice(1) : 'actions';
if (location.hash.slice(1) === 'trends') history.replaceState(null, '', '#quality');
