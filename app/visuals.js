// W2 Looms · app/visuals.js — Comparison visuals: heat grids, sparklines, ranked bars,
// stacked bars (with a legend that highlights a layer) and the small range bars on Targets.
// Every SVG chart here is drawn at the pixel width it is shown at and carries __redraw, so fitCharts (nav.js) redraws it
// when its box changes width and its text stays at its real size (11 px) on a phone. Sparklines and range bars have no text
// and scale with their box. Colours come from the app's CSS variables and the CC series list.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// First width to draw at, before fitCharts measures the real box (a frame later).
const estW = () => { const vw = document.documentElement.clientWidth || 1000; return Math.max(300, Math.min(1000, vw - (vw >= 1024 ? 330 : 64))); };
// Wrap a chart builder: draw at w, remember how to redraw, keep a minimum width (below it the box scrolls sideways).
function fitted(build, min) {
  const mk = (W) => { const s = build(W); s.__w = W; s.__min = min || 260; s.__redraw = (w) => mk(w); return s; };
  return el('div', {class: 'tablebox vis'}, mk(Math.max(min || 260, estW())));
}
const svgRoot = (W, H, aria) => svgEl('svg', {width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': aria || 'Chart', style: 'display:block;max-width:none'});
const tx = (attrs, text, style) => { const t = svgEl('text', {...attrs, style: style || 'fill:var(--muted);font-size:11px'}); t.textContent = text; return t; };
const tip = (node, text) => { const t = svgEl('title'); t.textContent = text; node.append(t); return node; };
// Clip a label to about n characters so it never runs into the plot.
const clip = (s, n) => { s = String(s); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; };

// ---------------------------------------------------------------- heat grid (HTML)
// cols: [{label, unit}]; rows: [{label (node), hg, cells: [{text, level 0–1, tone 'bad'|'good', none (why grey), title, onClick}]}]
function heatTable(cols, rows, o = {}) {
  const t = el('table', {class: 'heat'});
  t.append(el('thead', {}, el('tr', {}, el('th', {scope: 'col', text: o.first || ''}), cols.map((c) => el('th', {scope: 'col', class: 'num'}, c.label, c.unit ? el('span', {class: 'unit', text: c.unit}) : null)))));
  const tb = el('tbody');
  for (const r of rows) {
    tb.append(el('tr', {'data-hg': r.hg || null}, el('td', {}, r.label), r.cells.map((c) => {
      if (!c || c.none) return el('td', {class: 'hc none', title: c && c.title || (c && c.none) || 'No figure'}, el('span', {text: c && c.none ? c.none : '—'}));
      const a = Math.round(10 + 50 * Math.max(0, Math.min(1, c.level || 0)));
      const col = c.tone === 'good' ? 'var(--good)' : c.tone === 'bad' ? 'var(--bad)' : 'var(--muted)';
      const inner = c.onClick ? el('button', {type: 'button', class: 'hcb', title: c.title || null, onclick: c.onClick, text: c.text}) : el('span', {title: c.title || null, text: c.text});
      return el('td', {class: 'hc', style: `background:color-mix(in srgb, ${col} ${a}%, transparent)`}, inner);
    })));
  }
  t.append(tb);
  return el('div', {class: 'heatbox'}, t);
}
// The colour key under a heat grid.
function heatKey(text, seq, noneText) {
  const sw = (col, a) => el('i', {style: `background:color-mix(in srgb, ${col} ${a}%, transparent)`});
  return el('div', {class: 'legend heatkey'},
    seq ? el('span', {class: 'lg'}, sw('var(--bad)', 10), sw('var(--bad)', 35), sw('var(--bad)', 60), 'higher share, stronger red')
      : [el('span', {class: 'lg'}, sw('var(--good)', 60), sw('var(--good)', 25), 'better than the reference'), el('span', {class: 'lg'}, sw('var(--bad)', 25), sw('var(--bad)', 60), 'worse')],
    el('span', {class: 'lg'}, el('i', {class: 'hnone'}), noneText || 'grey: no reference'), text ? el('span', {text}) : null);
}

// ---------------------------------------------------------------- sparkline (no text; scales with its box)
// vals in day order; the last point is marked. title: the hover text (the days and values).
function spark(vals, o = {}) {
  const v = vals.map((x) => ok(x) ? x : null), pts = v.map((x, i) => x == null ? null : [i, x]).filter(Boolean);
  const s = svgEl('svg', {class: 'spark', viewBox: '0 0 100 28', preserveAspectRatio: 'none', role: 'img', 'aria-label': o.aria || '7-day trend'});
  if (pts.length < 2) { s.classList.add('flat'); return s; }
  const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1])), n = v.length;
  const X = (i) => 3 + 94 * i / Math.max(1, n - 1), Y = (x) => hi - lo < 1e-12 ? 14 : 24 - 20 * (x - lo) / (hi - lo);
  s.append(svgEl('polyline', {points: pts.map((p) => X(p[0]).toFixed(2) + ',' + Y(p[1]).toFixed(2)).join(' '), fill: 'none', 'vector-effect': 'non-scaling-stroke', style: 'stroke:var(--muted);stroke-width:1.6;stroke-linejoin:round'}));
  const L = pts[pts.length - 1];
  s.append(svgEl('line', {x1: X(L[0]), x2: X(L[0]), y1: Y(L[1]), y2: Y(L[1]), 'vector-effect': 'non-scaling-stroke', style: `stroke:${o.color || 'var(--series)'};stroke-width:6;stroke-linecap:round`}));
  if (o.title) tip(s, o.title);
  return s;
}

// ---------------------------------------------------------------- ranked bars (horizontal, from zero)
// rows: {label, v, tol (a tick at this row's tolerance; the part past it is drawn strong), color, text, title, onClick}
// o: {aria, fmt, axis (unit under the axis), ref: {v, label} (one line across every row), labelW}
function hbars0(rows, o = {}) {
  const fmt = o.fmt || pn;
  return fitted((W) => {
    const rowH = 24, L = Math.round(Math.max(64, Math.min(o.labelW || 170, W * (W < 480 ? 0.38 : 0.32)))), R = W < 420 ? 52 : 70, T = o.ref ? 20 : 6, B = 32;
    const H = T + B + rows.length * rowH, hiV = Math.max(...rows.map((r) => Math.max(r.v || 0, r.tol || 0)), o.ref && ok(o.ref.v) ? o.ref.v : 0, 1e-9);
    const [, b, ticks] = niceRange(0, hiV);
    const x = (v) => L + (W - L - R) * Math.max(0, v) / (b || 1);
    const svg = svgRoot(W, H, o.aria);
    for (const t of ticks) { svg.append(svgEl('line', {x1: x(t), x2: x(t), y1: T - 4, y2: H - B, style: 'stroke:var(--line);stroke-width:1'})); svg.append(tx({x: x(t), y: H - B + 14, 'text-anchor': 'middle'}, axisFmt(t))); }
    if (o.axis) svg.append(tx({x: L + (W - L - R) / 2, y: H - 3, 'text-anchor': 'middle'}, o.axis));
    const chars = Math.floor((L - 8) / 6.3);
    rows.forEach((r, i) => {
      const y = T + i * rowH, v = Math.max(0, r.v || 0), col = r.color || 'var(--bar)';
      const lt = tx({x: L - 8, y: y + 16, 'text-anchor': 'end', class: r.onClick ? 'lkt' : null}, clip(r.label, chars), 'fill:var(--ink);font-size:11.5px');
      if (r.onClick) lt.addEventListener('click', r.onClick);
      tip(lt, r.title || r.label); svg.append(lt);
      if (ok(r.tol) && r.tol > 0) {
        svg.append(svgEl('rect', {x: x(0), y: y + 6, width: Math.max(0, x(Math.min(v, r.tol)) - x(0)), height: 12, rx: 2, style: `fill:${col};opacity:.35`}));
        if (v > r.tol) svg.append(svgEl('rect', {x: x(r.tol), y: y + 6, width: Math.max(1, x(v) - x(r.tol)), height: 12, rx: 2, style: `fill:${col}`}));
        svg.append(svgEl('rect', {x: x(r.tol) - 1, y: y + 2, width: 2, height: 20, style: 'fill:var(--barline)'}));
      } else svg.append(svgEl('rect', {x: x(0), y: y + 6, width: Math.max(1, x(v) - x(0)), height: 12, rx: 2, style: `fill:${col}`}));
      const hit = svgEl('rect', {x: L, y, width: W - L - R, height: rowH, style: `fill:transparent;${r.onClick ? 'cursor:pointer' : ''}`});
      tip(hit, r.title || `${r.label}: ${fmt(r.v)}`); if (r.onClick) hit.addEventListener('click', r.onClick); svg.append(hit);
      svg.append(tx({x: Math.min(W - 2, x(Math.max(v, r.tol || 0)) + 6), y: y + 16, 'text-anchor': x(Math.max(v, r.tol || 0)) + 6 > W - R + 30 ? 'end' : 'start'}, r.text != null ? r.text : fmt(r.v), 'fill:var(--ink);font-size:11px;font-weight:600'));
    });
    if (o.ref && ok(o.ref.v)) {
      svg.append(svgEl('line', {x1: x(o.ref.v), x2: x(o.ref.v), y1: T - 6, y2: H - B, style: 'stroke:var(--muted);stroke-width:1.4;stroke-dasharray:5 4'}));
      svg.append(tx({x: x(o.ref.v), y: 11, 'text-anchor': x(o.ref.v) > W - 90 ? 'end' : 'middle'}, o.ref.label, 'fill:var(--muted);font-size:11px;font-weight:600'));
    }
    return svg;
  }, 300);
}

// ---------------------------------------------------------------- signed ranked bars (horizontal, either side of zero)
// Like hbars, for a figure that can be negative (profit per pick, R1 11 Nov 2026): bars grow right from zero when positive
// and left when negative, with one dashed reference line (the plant average). rows: {label, v, text, title, onClick, color};
// o: {aria, fmt, axis, ref: {v, label}, labelW}.
function signedBars0(rows, o = {}) {
  const fmt = o.fmt || pn;
  return fitted((W) => {
    const rowH = 24, L = Math.round(Math.max(64, Math.min(o.labelW || 170, W * (W < 480 ? 0.38 : 0.32)))), R = W < 420 ? 52 : 70, T = o.ref ? 20 : 6, B = 32;
    const H = T + B + rows.length * rowH;
    const vs = rows.map((r) => r.v).filter(ok).concat(o.ref && ok(o.ref.v) ? [o.ref.v] : []);
    const lo = Math.min(0, ...vs), hi = Math.max(0, ...vs, 1e-9);
    const [a, b, ticks] = niceRange(lo, hi);
    const x = (v) => L + (W - L - R) * (v - a) / ((b - a) || 1);
    const svg = svgRoot(W, H, o.aria);
    for (const t of ticks) { svg.append(svgEl('line', {x1: x(t), x2: x(t), y1: T - 4, y2: H - B, style: `stroke:var(--line);stroke-width:${Math.abs(t) < 1e-9 ? 1.6 : 1}`})); svg.append(tx({x: x(t), y: H - B + 14, 'text-anchor': 'middle'}, axisFmt(t))); }
    if (o.axis) svg.append(tx({x: L + (W - L - R) / 2, y: H - 3, 'text-anchor': 'middle'}, o.axis));
    const chars = Math.floor((L - 8) / 6.3);
    rows.forEach((r, i) => {
      const y = T + i * rowH, v = ok(r.v) ? r.v : 0, neg = v < 0, col = r.color || (neg ? 'var(--bad)' : 'var(--bar)');
      const lt = tx({x: L - 8, y: y + 16, 'text-anchor': 'end', class: r.onClick ? 'lkt' : null}, clip(r.label, chars), 'fill:var(--ink);font-size:11.5px');
      if (r.onClick) lt.addEventListener('click', r.onClick);
      tip(lt, r.title || r.label); svg.append(lt);
      if (ok(r.v)) svg.append(svgEl('rect', {x: Math.min(x(0), x(v)), y: y + 6, width: Math.max(1, Math.abs(x(v) - x(0))), height: 12, rx: 2, style: `fill:${col}`}));
      const hit = svgEl('rect', {x: L, y, width: W - L - R, height: rowH, style: `fill:transparent;${r.onClick ? 'cursor:pointer' : ''}`});
      tip(hit, r.title || `${r.label}: ${fmt(r.v)}`); if (r.onClick) hit.addEventListener('click', r.onClick); svg.append(hit);
      const vx = ok(r.v) ? Math.max(x(0), x(v)) + 6 : x(0) + 6;
      svg.append(tx({x: Math.min(W - 2, vx), y: y + 16, 'text-anchor': vx > W - R + 30 ? 'end' : 'start'}, r.text != null ? r.text : fmt(r.v), 'fill:var(--ink);font-size:11px;font-weight:600'));
    });
    if (o.ref && ok(o.ref.v)) {
      svg.append(svgEl('line', {x1: x(o.ref.v), x2: x(o.ref.v), y1: T - 6, y2: H - B, style: 'stroke:var(--muted);stroke-width:1.4;stroke-dasharray:5 4'}));
      svg.append(tx({x: x(o.ref.v), y: 11, 'text-anchor': x(o.ref.v) > W - 90 ? 'end' : 'middle'}, o.ref.label, 'fill:var(--muted);font-size:11px;font-weight:600'));
    }
    return svg;
  }, 300);
}

// ---------------------------------------------------------------- stacked bars, one per day
// o: {dates, xlabels, tips, layers: [{name, color, vals}], fmt, aria, onPick(date), pickDates, total (label the top of each
// bar), line: {name, vals, color} (a dashed line over the bars, e.g. the headline it should add up to)}.
// Every segment has its own hover text (day, layer, value, share of the bar, total) and opens the day on click; a segment tall
// enough carries its value. Segments carry data-layer so hlStack can highlight one layer from the legend.
function stackBars(o) {
  const n = o.dates.length, fmt = o.fmt || pn;
  return fitted((W) => {
    const L = 48, R = 10, T = 22, B = 34, H = o.h || 240;
    const tot = o.dates.map((_, i) => o.layers.reduce((a, l) => a + (ok(l.vals[i]) ? l.vals[i] : 0), 0));
    const lineV = o.line ? o.line.vals.filter(ok) : [];
    let [a, b, ticks] = niceRange(0, Math.max(...tot, ...lineV, 1e-9));
    if (o.int) ticks = ticks.filter((t) => Number.isInteger(t));   // counts: whole-number ticks only
    const slot = (W - L - R) / n, bw = Math.min(40, slot * 0.7), Y = (v) => T + (H - T - B) * (1 - (v - a) / ((b - a) || 1));
    const svg = svgRoot(W, H, o.aria);
    for (const t of ticks) { svg.append(svgEl('line', {x1: L, x2: W - R, y1: Y(t), y2: Y(t), style: 'stroke:var(--line);stroke-width:1'})); svg.append(tx({x: L - 6, y: Y(t) + 4, 'text-anchor': 'end'}, axisFmt(t))); }
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / (o.xlabels ? 90 : 58)))));
    const pick = (i) => o.onPick ? () => o.onPick(o.pickDates ? o.pickDates[i] : o.dates[i]) : null;
    o.dates.forEach((d, i) => {
      const cx = L + slot * (i + 0.5), edge = cx + 22 > W, when = o.tips ? o.tips[i] : o.xlabels ? o.xlabels[i] : dfmt(d);
      if (!((n - 1 - i) % every)) svg.append(tx({x: edge ? W - 2 : cx, y: H - 12, 'text-anchor': edge ? 'end' : 'middle'}, o.xlabels ? o.xlabels[i] : dfmt(d)));
      // the whole column first (behind the segments): hovering above a short bar still gives the day's breakdown
      const parts = o.layers.map((l) => ok(l.vals[i]) && l.vals[i] > 0 ? `${l.name} ${fmt(l.vals[i])}` : null).filter(Boolean);
      const hit = svgEl('rect', {x: cx - slot / 2, y: T, width: slot, height: H - T - B, style: `fill:transparent;${o.onPick ? 'cursor:pointer' : ''}`});
      tip(hit, `${when}: ${parts.join(' · ') || 'nothing'} · total ${fmt(tot[i])}`); if (pick(i)) hit.addEventListener('click', pick(i)); svg.append(hit);
      let run = 0;
      o.layers.forEach((l, k) => {
        const v = ok(l.vals[i]) ? l.vals[i] : 0; if (v <= 0) return;
        const h = Math.max(0.5, Y(run) - Y(run + v));
        const r = svgEl('rect', {x: cx - bw / 2, y: Y(run + v), width: bw, height: h, class: 'sbseg', 'data-layer': k, style: `fill:${l.color};${l.fade ? 'opacity:.45' : ''}${o.onPick ? ';cursor:pointer' : ''}`});
        tip(r, `${when} · ${l.name}: ${fmt(v)}${tot[i] > 0 ? ` (${pn(100 * v / tot[i], 0)}% of the bar)` : ''} · total ${fmt(tot[i])}`); if (pick(i)) r.addEventListener('click', pick(i)); svg.append(r);
        if (h >= 15 && bw >= 30) { const t = tx({x: cx, y: Y(run + v / 2) + 4, 'text-anchor': 'middle', 'data-layer': k, 'pointer-events': 'none'}, fmt(v), `fill:${inkOn(l.color)};font-size:10px;font-weight:600`); svg.append(t); }
        run += v;
      });
      if (o.total !== false && (slot >= 30 || i === n - 1)) svg.append(tx({x: cx, y: Y(Math.max(run, o.line && ok(o.line.vals[i]) ? o.line.vals[i] : 0)) - 5, 'text-anchor': cx > W - 20 ? 'end' : 'middle', 'pointer-events': 'none'}, fmt(o.line && ok(o.line.vals[i]) ? o.line.vals[i] : run), 'fill:var(--ink);font-size:10.5px;font-weight:600'));
    });
    if (o.line) o.dates.forEach((d, i) => { const v = o.line.vals[i]; if (!ok(v)) return; const cx = L + slot * (i + 0.5);
      svg.append(svgEl('line', {x1: cx - bw / 2 - 3, x2: cx + bw / 2 + 3, y1: Y(v), y2: Y(v), 'pointer-events': 'none', style: `stroke:${o.line.color || 'var(--ink)'};stroke-width:2;stroke-dasharray:4 3`})); });
    return svg;
  }, Math.min(300, 60 + n * 14));
}
// Dark or white text for a value drawn on a fill (a hex colour or a CSS variable), by the fill's luminance and the theme.
function inkOn(color) {
  let c = String(color || '').trim(); const m = c.match(/^var\((--[\w-]+)\)$/); if (m) c = css(m[1]);
  const h = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!h) return '#fff';
  const x = h[1].length === 3 ? h[1].split('').map((d) => d + d).join('') : h[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#14250a' : '#fff';
}
const stackKey = (layers) => el('div', {class: 'legend'}, layers.map((l) => el('span', {class: 'lg'}, el('span', {class: 'sq', style: `background:${l.color};${l.fade ? 'opacity:.45' : ''}`}), l.name)));
// Stacked bars with a legend that highlights one layer: click a layer to bring it forward and fade the rest; click it again
// (or another) to change. Remembered per chart (key) while the app is open. extra: nodes appended to the legend.
const HL = {};
function hlStack(o, key, extra) {
  const box = el('div', {class: 'hlbox'}), set = (k) => { HL[key] = k; if (k == null) box.removeAttribute('data-hl'); else box.setAttribute('data-hl', k); for (const b of box.querySelectorAll('.lg[data-k]')) b.setAttribute('aria-pressed', String(b.dataset.k) === String(k) ? 'true' : 'false'); };
  const leg = el('div', {class: 'legend hl-legend'}, o.layers.map((l, k) => el('button', {type: 'button', class: 'lg', 'data-k': k, 'aria-pressed': 'false', title: `Highlight ${l.name}`, onclick: () => set(HL[key] === k ? null : k)},
    el('span', {class: 'sq', style: `background:${l.color}`}), l.name)), ...(extra || []));
  box.append(stackBars(o), leg);
  if (HL[key] != null && HL[key] < o.layers.length) set(HL[key]);
  return box;
}

// ---------------------------------------------------------------- Targets: a small range bar (now, bm, best, target)
// Same marks as the by-loom charts: current = lime bar, benchmark = tick, best = green dot, target = hollow diamond.
function rangeBar(o) {
  const vs = [o.now, o.bm, o.best, o.tg].filter(ok);
  const s = svgEl('svg', {class: 'rbar', width: 132, height: 20, viewBox: '0 0 132 20', role: 'img', 'aria-label': o.aria || 'Now, benchmark, best and target'});
  if (!vs.length) return s;
  let lo = Math.min(...vs), hi = Math.max(...vs); const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.02 || 1; lo -= pad; hi += pad;
  const x = (v) => 8 + 116 * (v - lo) / (hi - lo);
  s.append(svgEl('line', {x1: 4, x2: 128, y1: 10, y2: 10, style: 'stroke:var(--line);stroke-width:2;stroke-linecap:round'}));
  if (ok(o.bm)) s.append(svgEl('rect', {x: x(o.bm) - 1.2, y: 2, width: 2.4, height: 16, style: 'fill:var(--barline)'}));
  if (ok(o.best)) s.append(svgEl('circle', {cx: x(o.best), cy: 10, r: 4.5, style: 'fill:var(--good);stroke:var(--panel);stroke-width:1.2'}));
  if (ok(o.tg)) { const c = x(o.tg); s.append(svgEl('path', {d: `M${c} 4L${c + 6} 10L${c} 16L${c - 6} 10Z`, style: 'fill:var(--panel);stroke:var(--barline);stroke-width:1.6'})); }
  if (ok(o.now)) s.append(svgEl('rect', {x: x(o.now) - 3, y: 5, width: 6, height: 10, rx: 1.5, style: 'fill:var(--bar);stroke:var(--barline);stroke-width:1'}));
  tip(s, o.title || [['now', o.now], ['bm', o.bm], ['best', o.best], ['target', o.tg]].filter((p) => ok(p[1])).map((p) => `${p[0]} ${(o.fmt || pn)(p[1])}`).join(' · '));
  return s;
}

// Ranked bars with a sort bar (12 Nov 2026): Name and Value, plus any o.sortBases [{v, label, get}]. o.nosort: none.
function barBases(o, valLabel) {
  return [{v: 'name', label: 'Name', get: (r) => r.label}, {v: 'val', label: valLabel || o.sortLabel || 'Value', get: (r) => ok(r.v) ? r.v : null}, ...(o.sortBases || [])];
}
function hbars(rows, o = {}) { return o.nosort || rows.length < 3 ? hbars0(rows, o) : sortableChart(o.sortId || o.aria || 'hbars', rows, barBases(o), (R) => hbars0(R, o)); }
function signedBars(rows, o = {}) { return o.nosort || rows.length < 3 ? signedBars0(rows, o) : sortableChart(o.sortId || o.aria || 'sbars', rows, barBases(o), (R) => signedBars0(R, o)); }
