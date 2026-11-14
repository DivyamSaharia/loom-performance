// W2 Looms · app/core.js — Shared state and helpers: D (the data), W (width), TAB, formatting, el() and the card/table builders.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// Email sign-in is the only way in (switchover, 14 Nov 2026): the data, targets and answers come from the database (Supabase).
// The passcode view and the public sealed files are gone. MODE stays so older checks read the same; it is always 'db'.
const MODE = 'db';
try { localStorage.removeItem('w2-passcode'); localStorage.removeItem('w2-mode'); } catch (e) {}   // left over from the passcode view
let D = null, W = '190', TAB = 'actions';
let db = null, assigned = {}, TG = {}, targetsLoaded = false;
const BM = new Map();
// view state
const OPEN = new Set(); const SHOWALL = {};
const ASSIGN_OPEN = {}; // per list; unset = automatic: open while a loom's style name is unsaved (costing-only names start closed)
let PMODE = 'bm', PVIEW = 'loom', PALL = false, PW = 'all', CMODE = 'bm', CVIEW = 'loom', CALL = false, EMODE = 'bm', EVIEW = 'loom', EALL = false, WPER = 'day', WQ = '';
// Loom-wise / Head-group-wise switch on every bar chart that can be read either way (Divyam, 12 Nov 2026): one state per
// chart id, remembered per browser (w2-bar-view), default loom-wise. The tables keep their own Loom-wise / Quality-wise switch.
const BVIEW = (() => { try { const v = JSON.parse(localStorage.getItem('w2-bar-view') || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } })();
// A view choice kept on this device (never data: the fabric screens keep no masters on the device, see test_fabric_guards).
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const bv = (id) => BVIEW[id] === 'hg' ? 'hg' : 'loom';
function bvSeg(id, redraw) {
  const b = (v, t) => el('button', {type: 'button', 'aria-pressed': bv(id) === v ? 'true' : 'false', text: t, onclick: () => {
    BVIEW[id] = v; try { localStorage.setItem('w2-bar-view', JSON.stringify(BVIEW)); } catch (e) {} (redraw || render)(); }});
  return el('div', {class: 'seg', role: 'group', 'aria-label': 'Bars by', 'data-bv': id}, b('loom', 'Loom-wise'), b('hg', 'Head-group-wise'));
}
// thresholds set in this page (the rest come from the Config Sheet's Settings tab)
const PRESS_TOL = 0.1;      // kgf/cm² over benchmark or target before a loom is listed
const OFF_LONG = 240;       // minutes powered down in the day
const LOW_EFF_DAYS = 3, LOW_EFF_WINDOW = 5;
const KGF = 0.980665, PATM = 1.01325;

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
const ok = (x) => x != null && isFinite(x);
const f0 = (x) => !ok(x) ? '—' : Math.round(x).toLocaleString('en-IN');
const f1 = (x) => !ok(x) ? '—' : x.toFixed(1);
const f2 = (x) => !ok(x) ? '—' : x.toFixed(2);
const f3 = (x) => !ok(x) ? '—' : x.toFixed(3);
// Pick counts are shown in lakh picks after dividing the machine count by 39.37 (rates such as RPM stay on raw picks)
const PICK_LAKH = 39.37 * 1e5;
const dfmt = (d) => d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}) : '—';
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const inW = (w) => W === 'all' || String(w) === W;
const wLabel = () => W === 'all' ? '190 + 280 cm' : W + ' cm';
const key = (w, hg) => w + '|' + hg;
const bench = (w, hg) => BM.get(key(w, hg)) || null;
const tgt = (w, hg) => TG[key(w, hg)] || null;
const tgtId = (w, hg) => (w + '__' + hg).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 150);
const S = () => (D && D.settings) || {};
const UNITS = {rpm: 'RPM', eff: '%', cfm: 'CFM (ft³/min)', apk: 'ft³ / 1,000 picks', main: 'kgf/cm²', warp: 'breaks', warpRate: 'per 100k picks'};
