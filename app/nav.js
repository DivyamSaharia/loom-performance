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
const FAB_NAV = [['approvals', 'Approvals', 'layers', 'approvals'], ['masters', 'Fabric masters', 'layers'], ['links', 'Head-group links', 'layers'], ['realisation', 'Realisation', 'rupee', 'corrections']];
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
    el('button', {type: 'button', id: 'morebtn', onclick: () => { navMoreFavs(); $('#more').showModal(); }}, icon('dots', 24), el('span', {text: 'More'}), el('span', {class: 'badge', 'data-badge': 'corrections', hidden: true})));   // Round B: unread realisation corrections (Realisation sits in More)
  const more = $('#more');
  more.replaceChildren(el('div', {id: 'nfav-more'}), ...GROUPS.flatMap(([name, ids]) => { const its = ids.filter((id) => inMode(id) && !MOB.includes(id)); return its.length ? [el('div', {class: 'more-grp', 'data-grp': name, text: name}), ...its.map((id) => { const a = item(id, 'more-item', 22); a.addEventListener('click', () => more.close()); return a; })] : []; }),
    el('a', {href: '#', onclick: (e) => { e.preventDefault(); more.close(); openGuide(); }}, icon('help', 22), el('span', {text: 'Guide'})));
  more.addEventListener('click', (e) => { if (e.target === more) more.close(); });
  for (const a of document.querySelectorAll('.sb-nav .sb-item[data-tab="actions"]')) a.append(el('span', {class: 'badge', 'data-badge': 'actions', hidden: true}));
  $('#sb-guide').addEventListener('click', openGuide);
  $('#help').replaceChildren(icon('help', 22)); $('#help').addEventListener('click', openGuide);
  $('#refresh').replaceChildren(icon('refresh', 20)); $('#refresh-m').replaceChildren(icon('refresh', 22));
  $('#gs-icon').replaceChildren(icon('search', 18));
  $('#nq-icon').replaceChildren(icon('search', 16)); $('#nqm-icon').replaceChildren(icon('search', 18)); $('#nfind-m').replaceChildren(icon('search', 22));
  sbGroups();
}
// Round E: Favourites at the top of More (phone), folded, filled each time More opens.
function navMoreFavs() { const b = $('#nfav-more'); if (b) b.replaceChildren(navSignedIn() ? navFavBox(() => $('#more').close()) : ''); }
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
  if (typeof spSync === 'function') spSync();   // Round V: the compressor set point in force on the day shown
  for (const b of document.querySelectorAll('.segmented[aria-label="Loom width"] button')) b.setAttribute('aria-pressed', b.dataset.w === W ? 'true' : 'false');
  for (const a of document.querySelectorAll('[data-tab]')) { if (a.dataset.tab === TAB) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  const mb = $('#morebtn'); if (mb) { if (!MOB.includes(TAB)) mb.setAttribute('aria-current', 'page'); else mb.removeAttribute('aria-current'); }
  const pendingNames = (D.unassigned || []).filter((u) => !assigned[u.style]).length;
  for (const bd of document.querySelectorAll('[data-badge="actions"]')) { bd.hidden = !pendingNames; bd.textContent = pendingNames; }
  const nb = (D.benchmarks || []).filter((b) => inW(b.width)).length;
  for (const c of document.querySelectorAll('[data-count="benchmarks"]')) c.textContent = nb || '';
  $('#ptitle').textContent = TITLES[TAB] || 'Loom Performance';
  sbGroups();
  if (typeof fxNavSpark === 'function') fxNavSpark();   // Round C: 7-day realisation line beside Realisation (owner, laptop sidebar)
  document.title = `${TITLES[TAB] || 'Loom Performance'} · W2 Looms`;
  const y = window.scrollY;
  { // only the filters that change what the tab shows: Costing, Access and Data health don't follow the loom width or the day
    const noF = TAB === 'costing' || (ADMIN_TABS.includes(TAB) && TAB !== 'realisation');   // Realisation follows the width and the day (12 Nov 2026)
    const fl = $('.filters'); if (fl) fl.hidden = noF;
    const wb = $('#wbar'); if (wb) wb.hidden = noF || TAB === 'pressure' || TAB === 'data';   // Round A2: the sticky width row (one compressor: none on Pressure)
    const dy = $('#day'); if (dy) dy.hidden = TAB === 'data';
    const as = $('#asof'); if (as) as.hidden = ADMIN_TABS.includes(TAB) && TAB !== 'realisation'; }
  $('#main').replaceChildren(PAGES[TAB]());
  if (TRTABS[TAB]) addRowTrendButtons($('#main'));
  fixPlurals($('#main'));
  jumpNav($('#main > section.page'));
  applyFilter();
  setStickTop();
  window.scrollTo(0, y);
  navPaint();
}
// Sticky period bars sit just under the sticky section bar, which sits under the sticky loom-width row (Round A2): tell CSS
// how tall each is (0 when the tab has none).
function setStickTop() {
  const j = $('#main .jump'), w = $('#wbar'), r = document.documentElement.style;
  r.setProperty('--w-top', (w && !w.hidden ? w.offsetHeight : 0) + 'px');
  r.setProperty('--stick-top', (j && !j.hidden ? j.offsetHeight : 0) + 'px');
}
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
const jshort = (t) => t.replace(/\s·\s\d[\d,]*\s\w+$/, '').replace(/^Current vs benchmark(, best and target| and best), by loom$/, 'By loom')
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
function setTab(t) {
  if (t === 'trends') t = 'actions';   // Round A2: the Trend card moved from Quality to Actions
  const was = TAB;
  TAB = tabAllowed(t) ? t : 'actions'; if (location.hash.slice(1) !== TAB) history.replaceState(null, '', '#' + TAB); render(); window.scrollTo(0, 0);
  if (TAB !== was && !NAV_QUIET && typeof navPlace === 'function') navPlace({id: 't:' + TAB, label: TITLES[TAB], sub: navTabSub(TAB)}, true);   // Round E: a tab visit
}
function busyEditing(sel) { const a = document.activeElement; return a && a.closest && a.closest(sel); }
// Unsaved edits (17 Nov 2026): what is typed in a Targets box or picked for a style is kept by box id until it is saved, so a
// redraw (another row's save, Save all, a data refresh) never wipes it. FLASH keeps a row's last message for 2 minutes across
// those redraws.
const DRAFT = new Map(), FLASH = new Map();
function draftOf(id, saved) { return DRAFT.has(id) ? DRAFT.get(id) : saved; }
function draftKeep(id, v, saved) { if (v === saved) DRAFT.delete(id); else DRAFT.set(id, v); }
function flashSet(id, cls, text) { FLASH.set(id, {cls, text, at: Date.now()}); }
function flashShow(id, node) { const f = FLASH.get(id); if (f && Date.now() - f.at < 120e3) { node.className = f.cls; node.textContent = f.text; } return node; }

// Filter (the box above the tables, since 17 Nov 2026 Round E): filters the rows of every table on the page (loom number =
// exact loom, text = head group or any cell). Finding a place (tab, card, loom, head group, Guide) is the side-menu search below.
let QF = '';
const qIn = $('#q');
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
      out.push({k: 'Loom', id: 'l:' + l, label: `Loom ${l}`, sub: `${mc.width} cm ${mc.type || ''} · ${hgNow[l] || 'no run'}`, go: () => openLoom(l, D.latest)});
      if (out.length >= 8) break;
    }
    for (const o of out.slice(0, 2)) { const l = +o.label.slice(5); out.push({k: 'Trends', id: 'rl:' + l, label: `Loom ${l} · all trends`, sub: 'every metric, 7 days or since changeover', go: () => openTrends({kind: 'loom', loom: l})}); }
  }
  const seen = new Map();
  for (const b of D.benchmarks || []) seen.set(key(b.width, b.hg), {w: String(b.width), hg: b.hg});
  for (const x of D.loomdays || []) if (x.hg !== 'Unassigned') seen.set(key(x.width, x.hg), {w: String(x.width), hg: x.hg});
  const hits = [...seen.values()].filter((v) => v.hg.toLowerCase().includes(q)).sort((a, b) => (W !== 'all' && (a.w === W) !== (b.w === W) ? (a.w === W ? -1 : 1) : 0) || a.hg.localeCompare(b.hg) || a.w.localeCompare(b.w));
  for (const v of hits.slice(0, 10)) {
    const nl = new Set((D.loomdays || []).filter((x) => x.date === D.latest && x.hg === v.hg && String(x.width) === v.w).map((x) => x.loom)).size;
    out.push({k: 'Head group', id: 'h:' + v.w + '|' + v.hg, label: v.hg, sub: `${v.w} cm · ${nl} loom${nl === 1 ? '' : 's'} on ${dfmt(D.latest)}`,
      go: () => { if (TAB === 'benchmarks' && bench(v.w, v.hg)) { BQ = key(v.w, v.hg); render(); } else openHg(v.hg, v.w, D.latest); }});
  }
  for (const v of hits.slice(0, 2)) out.push({k: 'Trends', id: 'rh:' + v.w + '|' + v.hg, label: `${v.hg} ${v.w} cm · all trends`, sub: 'every metric, 7 / 14 / 30 days', go: () => openTrends({kind: 'hg', w: v.w, hg: v.hg})});
  if (!/^\d+$/.test(n) && typeof fxSearchHits === 'function') out.push(...fxSearchHits(q));   // R2: fabric names (owner, analysis on)
  return out;
}
function clearSearch() { qIn.value = ''; QF = ''; $('#q-clear').hidden = true; applyFilter(); }
qIn.addEventListener('input', () => { QF = qIn.value; $('#q-clear').hidden = !QF; applyFilter(); });
qIn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.preventDefault();
  else if (e.key === 'Escape') { if (qIn.value) clearSearch(); else qIn.blur(); }
});
$('#q-clear').addEventListener('click', () => { clearSearch(); qIn.focus(); });

// ---------------------------------------------------------------- Find: search, favourites, recent, shortcuts (Round E, 17 Nov 2026)
// One search on both widths: under the logo in the side menu on a laptop (results drop below it), and a full-screen sheet
// from the search icon next to Refresh on a phone. It finds every tab and card the signed-in role can see, plus Guide
// headings, looms and head groups (suggestions() above) and, for the owner, fabrics. The cards come from drawing each tab
// once off screen (navIndex), so a role only ever finds what its own screens show; tabs whose cards arrive after the page is
// drawn, or that read the database while drawn, list their cards here (NAV_STATIC). Plant view never gets a money section.
// Favourites (the 5 most-visited tabs and cards over 30 days) and Recent (the last 10 places or searches) follow the email
// (user_prefs keys nav_visits and nav_recent). Shortcuts: 1–9 the first nine tabs, / or Ctrl/⌘ K the search, g then l a
// loom, Esc closes. Nothing here changes data.
const NAV_HEADS = ['.card>.cardhead>h3', '.card>summary>h3', 'h3.sechead'];
const NAV_MONEY = /realis|profit|sale value/i;
const NAV_STATIC = {
  realisation: ['Corrections', 'Coverage', 'Trend', 'By loom / By head group', 'Per folded pick: sale value to profit', 'By width'],
  data: ['Last 30 days', 'Files per day', 'Backup age', () => canEdit() ? 'Reload data' : null, 'Days', 'Files', 'Other alerts', 'Settings in use'],
  links: ['Head-group links'], masters: ['Fabrics', 'Yarns', 'Switches', 'History'], approvals: [],
  fabric: ['Fabrics', 'About this read', 'Recent reads'], access: ['Requests', 'People', 'Add someone directly']};
const NAV_ALT = {'By loom / By head group': ['By loom', 'By head group'],
  'Current vs benchmark, best and target, by loom': ['Current vs benchmark, best and target, by loom', 'Current vs benchmark, best and target, by head group'],
  'Current vs benchmark and best, by loom': ['Current vs benchmark and best, by loom', 'Current vs benchmark and best, by head group']};   // Round A2: Pressure has no target   // Round F links   // a card whose heading follows its own switch
const navGrp = (t) => (GROUPS.find((g) => g[1].includes(t)) || ['', []])[0];
const navTabSub = (t) => 'in ' + navGrp(t);   // a tab's second line: its side-menu group
const navTabs = () => GROUPS.flatMap((g) => g[1]).filter(tabAllowed);
let NIDX = null, NIDX_T = 0, NAV_QUIET = false, NAV_BUSY = false;
const navSig = () => [D, typeof COST !== 'undefined' ? COST : null, ME && ME.role, fxAnalysisOn(), typeof FX !== 'undefined' ? FX : null];
const navFresh = () => { const g = navSig(); return !!NIDX && NIDX.sig.every((v, i) => v === g[i]); };
function navIndex() {
  if (!D) return [];
  if (navFresh()) return NIDX.items;
  NAV_BUSY = true;
  try { return navIndex0(); } finally { NAV_BUSY = false; }
}
// A Working entry is named by its tile or card as last drawn (wkScan in working.js): the built index follows the screen.
function navRelabel() {
  if (!NIDX || NAV_BUSY) return;
  for (const it of NIDX.items) if (it.wk && typeof wkLabel === 'function' && wkName(it.wk)) it.label = 'Working: ' + wkLabel(it.wk);
}
function navIndex0() {
  const items = [], saved = TAB, plant = isPlant();
  for (const t of navTabs()) {
    items.push({id: 't:' + t, k: 'Tab', label: TITLES[t], sub: navTabSub(t)});
    let names = [];
    if (NAV_STATIC[t]) names = NAV_STATIC[t].map((x) => typeof x === 'function' ? x() : x).filter(Boolean);
    else {
      try { TAB = t; const sec = PAGES[t](); if (typeof wkScan === 'function') wkScan(sec, t, null, true); names = [...sec.querySelectorAll(NAV_HEADS.join(','))].filter((h) => !h.closest('tr.drillrow')).map((h) => navCardName(h.textContent)); }
      catch (e) { names = []; } finally { TAB = saved; }
    }
    const seen = new Set();
    for (const n of names) {
      const id = 'c:' + t + '|' + navNorm(n);
      if (!n || seen.has(id) || (plant && NAV_MONEY.test(n))) continue;
      seen.add(id); items.push({id, k: 'Card', label: n, sub: TITLES[t] + ' tab', t, card: n});
    }
  }
  for (const g of guideSections()) if (!(plant && NAV_MONEY.test(g.title))) items.push({id: 'g:' + g.id, k: 'Guide', label: g.title, sub: 'Guide · ' + g.grp, gid: g.id});
  // Round J: "Working: <name>" for every = mark this role can see (owner entries for the owner only; no money for the plant view)
  if (typeof wkSearchItems === 'function') for (const w of wkSearchItems()) if (!(plant && NAV_MONEY.test(w.label))) items.push(w);
  NIDX = {sig: navSig(), items, by: new Map(items.map((x) => [x.id, x]))};
  return items;
}
// Build the index when the app is idle after a redraw, so the first search answers at once.
function navSoon() { clearTimeout(NIDX_T); NIDX_T = setTimeout(() => { if (D && !navFresh()) { try { navIndex(); } catch (e) { return; } navPaint(); } }, 900); }
const navReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function navFindHead(name) {
  const want = (NAV_ALT[name] || [name]).map(navNorm);
  return [...document.querySelectorAll(NAV_HEADS.map((x) => '#main ' + x).join(','))].find((h) => !h.closest('tr.drillrow') && want.includes(navNorm(h.textContent)));
}
function navNote(text) {
  const m = $('#main'); if (!m) return;
  const old = m.querySelector('.navnote'); if (old) old.remove();
  const n = el('p', {class: 'note navnote', role: 'status', text}); m.prepend(n);
  setTimeout(() => n.remove(), 8000);
}
// Go to a card: open its tab, wait for the card (Realisation draws after loading), open it if folded and scroll to it.
function navGoCard(t, name) {
  if (TAB !== t) { NAV_QUIET = true; try { setTab(t); } finally { NAV_QUIET = false; } }
  if (TAB !== t) return;
  const until = Date.now() + 8000;
  const look = () => {
    if (TAB !== t) return;
    const h = navFindHead(name);
    if (!h) { if (Date.now() < until) setTimeout(look, 250); else navNote(`“${name}” is not on ${TITLES[t]} for the day shown: pick another day with the date chip at the top of the page, or look the card up in the Guide.`); return; }
    const c = h.closest('.card') || h;
    if (c.tagName === 'DETAILS') c.open = true;
    const hh = c.querySelector(':scope>.cardhead>h3');   // the fold state a fresh page has not applied yet counts too
    if (c.classList.contains('shut') || (hh && foldShut(c, hh))) foldSet(c, false);
    c.scrollIntoView({behavior: navReduced() ? 'auto' : 'smooth', block: 'start'});
    c.classList.add('navhit'); setTimeout(() => c.classList.remove('navhit'), 2000);
  };
  requestAnimationFrame(() => requestAnimationFrame(look));   // after the redraw's own fold and table pass
}
function navGuide(gid) {
  GUIDE_Q = '';
  pushView(() => guideView());
  requestAnimationFrame(() => { const x = panelEl().querySelector('#' + gid); if (x) x.scrollIntoView({block: 'start'}); });
}
// A stored place (Favourites, Recent) back to something that can be opened, or null when this role cannot see it now.
function navResolve(r) {
  if (!r || typeof r.id !== 'string' || !D) return null;
  const p = r.id.slice(0, r.id.indexOf(':') + 1), v = r.id.slice(p.length), plant = isPlant();
  if (plant && NAV_MONEY.test(String(r.label || ''))) return null;
  if (p === 't:') return tabAllowed(v) ? {id: r.id, k: 'Tab', label: TITLES[v], sub: navTabSub(v)} : null;
  if (p === 'c:' || p === 'g:' || p === 'w:') { const it = NIDX && NIDX.by.get(r.id); return it || null; }   // w: a Working entry (Round J)
  if (p === 'l:') return (D.machine || {})[+v] ? {id: r.id, k: 'Loom', label: `Loom ${+v}`, sub: r.sub || '', go: () => openLoom(+v, D.latest)} : null;
  if (p === 'rl:') return (D.machine || {})[+v] ? {id: r.id, k: 'Trends', label: `Loom ${+v} · all trends`, sub: r.sub || '', go: () => openTrends({kind: 'loom', loom: +v})} : null;
  const [w, ...h] = v.split('|'), hg = h.join('|');
  if (p === 'h:' && hg) return {id: r.id, k: 'Head group', label: hg, sub: `${w} cm`, go: () => openHg(hg, w, D.latest)};
  if (p === 'rh:' && hg) return {id: r.id, k: 'Trends', label: `${hg} ${w} cm · all trends`, sub: r.sub || '', go: () => openTrends({kind: 'hg', w, hg})};
  if (p === 'q:' && r.label) return {id: r.id, k: 'Search', label: r.label, sub: 'search again', search: r.label};
  return null;
}
const navSignedIn = () => !!D;   // the loom data loads only after an email sign-in (MODE is always 'db' since the 14 Nov 2026 switchover)
// A place opened: tabs and cards count towards Favourites; every place (and a search with no place) goes into Recent.
function navPlace(it, count) {
  if (!navSignedIn() || !it || !it.id) return;
  if (count) prefSet('nav_visits', navVisit(prefGet('nav_visits'), it.id, Date.now()));
  prefSet('nav_recent', navRecentAdd(prefGet('nav_recent'), {id: it.id, label: it.label, sub: it.sub || ''}));
  navPaint();
}
function navGo(it, q) {
  if (!it) return;
  if (it.search != null) { navOpen(it.search); return; }
  if (it.go) {   // looms, head groups, trends, fabrics
    if (it.id) navPlace(it, false); else if (q && q.trim()) navPlace({id: 'q:' + q.trim().toLowerCase(), label: q.trim(), sub: 'search again'}, false);
    it.go(); return;
  }
  const p = it.id.slice(0, 2);
  if (p === 't:') { if (TAB === it.id.slice(2)) { window.scrollTo(0, 0); navPlace(it, true); } else setTab(it.id.slice(2)); }
  else if (p === 'c:') { navPlace(it, true); navGoCard(it.t, it.card); }
  else if (p === 'g:') { navPlace(it, false); navGuide(it.gid); }
}
const navFavList = () => navFavs(prefGet('nav_visits'), Date.now(), (id) => !!navResolve({id})).map((f) => navResolve({id: f.id}));
const navRecentList = () => (prefGet('nav_recent') || []).map(navResolve).filter(Boolean);
// One row of results (the same look as the search suggestions).
function navRow(it, on, pick) {
  return el('button', {type: 'button', role: 'option', class: on ? 'on' : null, 'aria-selected': on ? 'true' : 'false', onmousedown: (e) => e.preventDefault(), onclick: pick},
    el('span', {class: 'k', text: it.k}), el('span', {class: 'nl', text: it.label}), el('span', {class: 's', text: it.sub || ''}));
}
// Favourites: a list that starts folded (side menu, the phone's search sheet, the top of More).
function navFavBox(onPick) {
  const favs = navFavList();
  return el('details', {class: 'nfav'}, el('summary', {}, 'Favourites', favs.length ? el('span', {class: 'nfn', text: ` (${favs.length})`}) : null),
    favs.length ? el('div', {class: 'nfav-list'}, favs.map((f) => el('button', {type: 'button', onclick: () => { if (onPick) onPick(); navGo(f); }},
      el('span', {class: 'nl', text: f.label}), el('span', {class: 'ns', text: f.sub}))))
      : el('p', {class: 'nempty', text: 'None yet: open a tab, or pick a card from the search, and the 5 you open most over the last 30 days show here.'}));
}
function navPaint() {
  const sb = $('#nfav-sb'); if (sb) { const open = sb.querySelector('details[open]'); sb.replaceChildren(navSignedIn() ? navFavBox() : ''); if (open) sb.querySelector('details').open = true; }
  if (D && !navFresh()) navSoon();
}
// The results list, shared by the laptop drop-down and the phone sheet.
function navFinder(inp, list, o) {
  let rows = [], sel = -1;
  const pick = (i) => { const it = rows[i]; if (!it) return; const q = inp.value; o.done(); navGo(it, q); };
  const head = (t, btn) => el('div', {class: 'nh'}, el('span', {text: t}), btn || null);
  function draw() {
    if (!navSignedIn()) { list.replaceChildren(el('div', {class: 'none', text: 'Search works once the loom data has loaded. If it does not load, press Refresh (the round-arrow icon).'})); rows = []; return; }
    const q = inp.value.trim(), parts = [];
    rows = [];
    const add = (it) => { const i = rows.length; rows.push(it); parts.push(navRow(it, i === sel, () => pick(i))); };
    if (!q) {
      if (o.favs) parts.push(navFavBox(o.done));
      const rec = navRecentList();
      parts.push(head('Recent', rec.length ? el('button', {type: 'button', class: 'link', text: 'Clear', onmousedown: (e) => e.preventDefault(), onclick: () => { prefSet('nav_recent', []); draw(); inp.focus(); }}) : null));
      if (rec.length) rec.forEach(add); else parts.push(el('div', {class: 'none', text: 'Nothing yet: open a tab, or pick a card, loom or head group from the search, and it shows here.'}));
    } else {
      let all = [], broke = false;
      try { all = navIndex(); } catch (e) { broke = true; }
      if (broke) parts.push(el('div', {class: 'none', text: 'Cards and Guide headings could not be listed: press Refresh (the round-arrow icon). Looms and head groups are still found.'}));
      const idx = navMatch(all, q), num = /^(loom\s*)?\d+$/i.test(q), sug = suggestions(q);
      const tc = idx.filter((x) => x.k !== 'Guide').slice(0, 10), gd = idx.filter((x) => x.k === 'Guide').slice(0, 5);
      (num ? [...sug, ...tc, ...gd] : [...tc, ...sug.slice(0, 12), ...gd]).forEach(add);
      if (/^loom\s*$/i.test(q)) parts.unshift(el('div', {class: 'none', text: 'Type the loom number, then Enter.'}));
      else if (!rows.length) parts.push(el('div', {class: 'none', text: `Nothing matches “${q}”. Try a tab or card name, a loom number or a head group.`}));
    }
    if (o.keys) parts.push(el('div', {class: 'nkeys', text: 'Keys: 1–9 open the first nine tabs · / or Ctrl K (⌘ K on a Mac) opens this search · g then l opens a loom · Esc closes'}));
    list.replaceChildren(...parts);
  }
  inp.addEventListener('input', () => { sel = inp.value.trim() ? 0 : -1; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && rows.length) { e.preventDefault(); sel = (sel + 1) % rows.length; draw(); }
    else if (e.key === 'ArrowUp' && rows.length) { e.preventDefault(); sel = (sel - 1 + rows.length) % rows.length; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows.length) pick(sel < 0 ? 0 : sel); }
    else if (e.key === 'Escape') { e.preventDefault(); if (inp.value) { inp.value = ''; sel = -1; draw(); } else o.done(); }
  });
  return {draw, reset: () => { sel = inp.value.trim() ? 0 : -1; }};
}
// Laptop: the box under the logo, its results in a drop-down beside the side menu.
const nIn = $('#nq'), nRes = $('#nres');
function navPlaceRes() { const r = nIn.getBoundingClientRect(); nRes.style.left = Math.round(r.left) + 'px'; nRes.style.top = Math.round(r.bottom + 6) + 'px'; }
const NF = navFinder(nIn, nRes, {keys: true, done: () => { nRes.hidden = true; nIn.setAttribute('aria-expanded', 'false'); nIn.blur(); }});
function navShowRes() { navPlaceRes(); NF.draw(); nRes.hidden = false; nIn.setAttribute('aria-expanded', 'true'); }
nIn.addEventListener('focus', () => { NF.reset(); navShowRes(); });
nIn.addEventListener('input', () => { if (nRes.hidden) navShowRes(); });
nIn.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== nIn) { nRes.hidden = true; nIn.setAttribute('aria-expanded', 'false'); } }, 150));
window.addEventListener('resize', () => { if (!nRes.hidden) navPlaceRes(); });
// Phone: the search sheet.
const nSheet = $('#nsheet'), nInM = $('#nq-m');
const NFM = navFinder(nInM, $('#nres-m'), {favs: true, done: () => nSheet.close()});
$('#nsheet-x').addEventListener('click', () => nSheet.close());
$('#nfind-m').addEventListener('click', () => navOpen(''));
// Open the search with TEXT typed: in the side menu on a laptop, else the sheet.
function navOpen(text) {
  if (nIn.offsetParent) { nIn.value = text; nIn.focus(); NF.reset(); navShowRes(); const n = nIn.value.length; nIn.setSelectionRange(n, n); return; }
  nInM.value = text; NFM.reset(); NFM.draw(); if (!nSheet.open) nSheet.showModal(); nInM.focus(); const n = nInM.value.length; nInM.setSelectionRange(n, n);
}
// Shortcuts: never while typing in a box, with a panel or sheet open, or with Ctrl, ⌘ or Alt held (except Ctrl/⌘ K).
let NAV_G = 0;
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || !navSignedIn()) return;
  const k = e.key, a = document.activeElement, open = document.querySelector('dialog[open]');
  const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (k === 'k' || k === 'K')) { if (open && open !== nSheet) return; e.preventDefault(); navOpen(''); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || typing || open) { NAV_G = 0; return; }
  if (k === '/') { e.preventDefault(); NAV_G = 0; navOpen(''); return; }
  if (k === 'g') { NAV_G = Date.now(); return; }
  if ((k === 'l' || k === 'L') && NAV_G && Date.now() - NAV_G < 1500) { NAV_G = 0; e.preventDefault(); navOpen('Loom '); return; }
  NAV_G = 0;
  if (/^[1-9]$/.test(k)) { const t = navTabs()[+k - 1]; if (t) { e.preventDefault(); if (t === TAB) window.scrollTo(0, 0); else setTab(t); } }
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
TAB = location.hash.slice(1) === 'trends' ? 'actions' : PAGES[location.hash.slice(1)] ? location.hash.slice(1) : 'actions';
if (location.hash.slice(1) === 'trends') history.replaceState(null, '', '#actions');
