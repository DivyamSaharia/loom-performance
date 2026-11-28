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
// Round C1 (audit #6): a label that ends in its loom width (" · 190", " · 280 cm") keeps it and cuts the name instead, so two
// widths of one quality stay apart on a phone.
const clip = (s, n) => {
  s = String(s); if (s.length <= n) return s;
  const m = s.match(/ · (190|280)( cm)?$/);
  if (m && n - m[0].length >= 4) return s.slice(0, n - m[0].length - 1).trimEnd() + '…' + m[0];
  return s.slice(0, Math.max(1, n - 1)) + '…';
};

// ---------------------------------------------------------------- heat grid (HTML)
// cols: [{label, unit}]; rows: [{label (node), hg, cells: [{text, level 0–1, tone 'bad'|'good', none (why grey), title, onClick}]}]
function heatTable(cols, rows, o = {}) {
  const t = el('table', {class: 'heat'});
  t.append(el('thead', {}, el('tr', {}, el('th', {scope: 'col', text: o.first || ''}), cols.map((c) => el('th', {scope: 'col', class: 'num', 'data-sm': c.sm || null}, c.label, c.unit ? el('span', {class: 'unit', text: c.unit}) : null)))));
  const tb = el('tbody');
  for (const r of rows) {
    tb.append(el('tr', {'data-hg': r.hg || null}, el('td', {}, r.label), r.cells.map((c) => {
      // Round A2 (Divyam, 24 Nov 2026): pointing at a cell shows its note at once (htip below), not the browser's slow title
      if (!c || c.none) return el('td', {class: 'hc none', 'data-htip': c && (c.tip || c.title) || (c && c.none) || 'No figure'}, el('span', {text: c && c.none ? c.none : '—'}));
      const a = Math.round(10 + 50 * Math.max(0, Math.min(1, c.level || 0)));
      const col = c.tone === 'good' ? 'var(--good)' : c.tone === 'bad' ? 'var(--bad)' : 'var(--muted)';
      const tip = c.tip || c.title || null;
      const inner = c.onClick ? el('button', {type: 'button', class: 'hcb', 'data-htip': tip, 'aria-label': tip ? `${c.text}. ${tip.replace(/\n/g, '. ')}` : null, onclick: c.onClick, text: c.text}) : el('span', {'data-htip': tip, text: c.text});
      return el('td', {class: 'hc', style: `background:color-mix(in srgb, ${col} ${a}%, transparent)`}, inner);
    })));
  }
  t.append(tb);
  return el('div', {class: 'heatbox'}, t);
}
// Round A2 (Divyam, 24 Nov 2026): the note for whatever carries data-htip (the heat grids' cells), shown at once on pointing
// at it with a mouse or moving to it with the keyboard; one box for the page, fixed to the screen, so a table that scrolls
// sideways does not clip it. A touch screen cannot point: a tap does what it always did (opens the head group).
let HTIP = null;
function htipShow(t) {
  const txt = t.dataset.htip; if (!txt) return;
  if (!HTIP) { HTIP = el('div', {class: 'htip', role: 'tooltip', id: 'htip'}); document.body.append(HTIP); }
  HTIP.textContent = txt; HTIP.hidden = false;
  const r = t.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 16);
  HTIP.style.maxWidth = w + 'px'; HTIP.style.left = '0px'; HTIP.style.top = '0px';
  const b = HTIP.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2));
  const top = r.bottom + 6 + b.height <= window.innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - 6 - b.height);
  HTIP.style.left = Math.round(left) + 'px'; HTIP.style.top = Math.round(top) + 'px';
}
function htipHide() { if (HTIP) HTIP.hidden = true; }
document.addEventListener('pointerover', (e) => { if (e.pointerType === 'touch') return; const t = e.target.closest && e.target.closest('[data-htip]'); if (t) htipShow(t); });
document.addEventListener('pointerout', (e) => { const t = e.target.closest && e.target.closest('[data-htip]'); if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) htipHide(); });
document.addEventListener('focusin', (e) => { const t = e.target.closest && e.target.closest('[data-htip]'); if (t && t.matches(':focus-visible')) htipShow(t); else htipHide(); });
document.addEventListener('focusout', htipHide);
window.addEventListener('scroll', htipHide, {passive: true});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') htipHide(); });
// The colour key under a heat grid.
// Round C1 (audit #5): bands = true lists the five fixed steps of the gap's size (calc.js HEAT_BANDS), each in red and green.
function heatKey(text, seq, noneText, bands) {
  const sw = (col, a) => el('i', {style: `background:color-mix(in srgb, ${col} ${a}%, transparent)`});
  const al = (lv) => Math.round(10 + 50 * lv);   // the same strength heatTable draws
  return el('div', {class: 'legend heatkey'},
    seq ? el('span', {class: 'lg'}, sw('var(--bad)', 10), sw('var(--bad)', 35), sw('var(--bad)', 60), 'higher share, stronger red')
      : [el('span', {class: 'lg'}, sw('var(--good)', 60), sw('var(--good)', 25), 'better than the reference'), el('span', {class: 'lg'}, sw('var(--bad)', 25), sw('var(--bad)', 60), 'worse')],
    el('span', {class: 'lg'}, el('i', {class: 'hnone'}), noneText || 'grey: no reference'), text ? el('span', {text}) : null,
    bands ? el('div', {class: 'hbands'}, el('span', {text: 'Colour steps by the gap\'s size:'}),
      HEAT_BAND_TXT.map((t, i) => el('span', {class: 'lg'}, sw('var(--good)', al(HEAT_LV[i])), sw('var(--bad)', al(HEAT_LV[i])), t))) : null);
}

// ---------------------------------------------------------------- sparkline (no text; scales with its box)
// vals in day order; the last point is marked. title: the hover text (the days and values).
const SPARK_MIN = 0.03;
function spark(vals, o = {}) {
  const v = vals.map((x) => ok(x) ? x : null), pts = v.map((x, i) => x == null ? null : [i, x]).filter(Boolean);
  const s = svgEl('svg', {class: 'spark', viewBox: '0 0 100 28', preserveAspectRatio: 'none', role: 'img', 'aria-label': o.aria || '7-day trend'});
  if (pts.length < 2) { s.classList.add('flat'); return s; }
  // Round C1 (audit #18): the line's range is at least ±3% of its middle value, so a flat week draws flat, not as a cliff
  let lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  const mid = (hi + lo) / 2, half = Math.max((hi - lo) / 2, SPARK_MIN * Math.abs(mid)), n = v.length;
  if (half > 0) { lo = mid - half; hi = mid + half; }
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
    const rowH = 24, L = Math.round(Math.max(64, Math.min(o.labelW || 170, W * (W < 480 ? 0.38 : 0.32)))), R = (W < 420 ? 52 : 70) + (o.wideText ? 44 : 0), T = o.ref ? 20 : 6, B = 32;   // Round C2a: o.wideText leaves room for a two-part value
    const H = T + B + rows.length * rowH, hiV = Math.max(...rows.map((r) => Math.max(r.v || 0, r.tol || 0, r.tick || 0)), o.ref && ok(o.ref.v) ? o.ref.v : 0, 1e-9);
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
      if (r.segs) {   // Round C2a (audit #31): the bar in parts, left to right (e.g. day and night metres); each part its own hover text
        let run = 0;
        for (const g of r.segs) { const gv = Math.max(0, g.v || 0); if (!gv) continue;
          svg.append(tip(svgEl('rect', {x: x(run), y: y + 6, width: Math.max(1, x(run + gv) - x(run)), height: 12, rx: 2, class: 'hseg', style: `fill:${g.color || col};${g.op ? `opacity:${g.op}` : ''}`}), `${r.title || r.label} · ${g.name}: ${fmt(gv)}`)); run += gv; }
      } else if (ok(r.tol) && r.tol > 0) {
        // Round C3 (audit #13, #47): r.past = the colour past the line (the bar up to it full strength in its own colour)
        svg.append(svgEl('rect', {x: x(0), y: y + 6, width: Math.max(0, x(Math.min(v, r.tol)) - x(0)), height: 12, rx: 2, class: r.past ? 'hpre' : null, style: `fill:${col};${r.past ? '' : 'opacity:.35'}`}));
        if (v > r.tol) svg.append(svgEl('rect', {x: x(r.tol), y: y + 6, width: Math.max(1, x(v) - x(r.tol)), height: 12, rx: 2, class: r.past ? 'hpast' : null, style: `fill:${r.past || col}`}));
        if (!r.notol) svg.append(svgEl('rect', {x: x(r.tol) - 1, y: y + 2, width: 2, height: 20, style: 'fill:var(--barline)'}));
      } else svg.append(svgEl('rect', {x: x(0), y: y + 6, width: Math.max(1, x(v) - x(0)), height: 12, rx: 2, style: `fill:${col}`}));
      if (ok(r.tick)) svg.append(svgEl('rect', {x: x(r.tick) - 1, y: y + 2, width: 2, height: 20, class: 'htick', style: 'fill:var(--barline)'}));   // Round C3 (#47): a reference tick
      const hit = svgEl('rect', {x: L, y, width: W - L - R, height: rowH, style: `fill:transparent;${r.onClick ? 'cursor:pointer' : ''}`});
      tip(hit, r.title || `${r.label}: ${fmt(r.v)}`); if (r.onClick) hit.addEventListener('click', r.onClick); svg.append(hit);
      const te = Math.max(v, r.notol ? 0 : r.tol || 0, r.tick || 0);
      svg.append(tx({x: Math.min(W - 2, x(te) + 6), y: y + 16, 'text-anchor': x(te) + 6 > W - R + 30 ? 'end' : 'start'}, r.text != null ? r.text : fmt(r.v), 'fill:var(--ink);font-size:11px;font-weight:600'));
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
// o: {aria, fmt, axis, ref: {v, label}, labelW}. Round A5 (25 Nov 2026): a row with split {cost, cover, over, short} (from
// fcRealLessFold, its cost known) is drawn in three parts: the cost covered (grey, 0 → the lower of v and cost), then green
// from the cost up to v, or red from v up to the cost. split {cost: null} = cost not known: the bar alone, faded.
// Round A7 (25 Nov 2026): a row's dia (a number) draws a hollow diamond there, the app's target mark (the target folded cost).
function signedBars0(rows, o = {}) {
  const fmt = o.fmt || pn;
  return fitted((W) => {
    const rowH = 24, L = Math.round(Math.max(64, Math.min(o.labelW || 170, W * (W < 480 ? 0.38 : 0.32)))), R = (W < 420 ? 52 : 70) + (o.wideText ? 40 : 0), T = o.ref ? 20 : 6, B = 32;   // Round A5: o.wideText leaves room for a two-figure value
    const H = T + B + rows.length * rowH;
    const vs = rows.flatMap((r) => [r.v, r.split ? r.split.cost : null, r.dia]).filter(ok).concat(o.ref && ok(o.ref.v) ? [o.ref.v] : []);
    const lo = Math.min(0, ...vs), hi = Math.max(0, ...vs, 1e-9);
    const [a, b, ticks] = niceRange(lo, hi);
    const x = (v) => L + (W - L - R) * (v - a) / ((b - a) || 1);
    const svg = svgRoot(W, H, o.aria);
    const seg = (y, v0, v1, fill, op) => svg.append(svgEl('rect', {x: Math.min(x(v0), x(v1)), y: y + 6, width: Math.max(1, Math.abs(x(v1) - x(v0))), height: 12, rx: 2, style: `fill:${fill}${op ? `;opacity:${op}` : ''}`}));
    for (const t of ticks) { svg.append(svgEl('line', {x1: x(t), x2: x(t), y1: T - 4, y2: H - B, style: `stroke:var(--line);stroke-width:${Math.abs(t) < 1e-9 ? 1.6 : 1}`})); svg.append(tx({x: x(t), y: H - B + 14, 'text-anchor': 'middle'}, axisFmt(t))); }
    if (o.axis) svg.append(tx({x: L + (W - L - R) / 2, y: H - 3, 'text-anchor': 'middle'}, o.axis));
    const chars = Math.floor((L - 8) / 6.3);
    rows.forEach((r, i) => {
      const y = T + i * rowH, v = ok(r.v) ? r.v : 0, neg = v < 0, col = r.color || (neg ? 'var(--bad)' : 'var(--bar)');
      const lt = tx({x: L - 8, y: y + 16, 'text-anchor': 'end', class: r.onClick ? 'lkt' : null}, clip(r.label, chars), 'fill:var(--ink);font-size:11.5px');
      if (r.onClick) lt.addEventListener('click', r.onClick);
      tip(lt, r.title || r.label); svg.append(lt);
      const sp = r.split, top = sp && ok(sp.cost) ? Math.max(v, sp.cost) : v;
      if (ok(r.v) && sp && ok(sp.cost)) {   // Round A5: cost covered, then what is left above it or how far the cost runs past
        if (sp.cover > 0) seg(y, 0, sp.cover, 'var(--muted-2)', 0.55);
        if (sp.over > 0) seg(y, sp.cost, v, 'var(--good)');
        if (sp.short > 0) seg(y, v, sp.cost, 'var(--bad)');
      } else if (ok(r.v)) seg(y, 0, v, col, sp ? 0.45 : 0);
      if (ok(r.dia)) { const cx = x(r.dia), cy = y + 12; svg.append(svgEl('path', {d: `M${cx} ${cy - 7}L${cx + 6} ${cy}L${cx} ${cy + 7}L${cx - 6} ${cy}Z`, style: 'fill:var(--panel);stroke:var(--barline);stroke-width:2'})); }
      const hit = svgEl('rect', {x: L, y, width: W - L - R, height: rowH, style: `fill:transparent;${r.onClick ? 'cursor:pointer' : ''}`});
      tip(hit, r.title || `${r.label}: ${fmt(r.v)}`); if (r.onClick) hit.addEventListener('click', r.onClick); svg.append(hit);
      const vx = (ok(r.v) ? Math.max(x(0), x(top), ok(r.dia) ? x(r.dia) + 4 : -1e9) : x(0)) + 6;
      svg.append(tx({x: Math.min(W - 2, vx), y: y + 16, 'text-anchor': vx > W - R + 30 ? 'end' : 'start'}, r.text != null ? r.text : fmt(r.v), 'fill:var(--ink);font-size:11px;font-weight:600'));
    });
    if (o.ref && ok(o.ref.v)) {
      svg.append(svgEl('line', {x1: x(o.ref.v), x2: x(o.ref.v), y1: T - 6, y2: H - B, style: 'stroke:var(--muted);stroke-width:1.4;stroke-dasharray:5 4'}));
      svg.append(tx({x: x(o.ref.v), y: 11, 'text-anchor': x(o.ref.v) > W - 90 ? 'end' : 'middle'}, o.ref.label, 'fill:var(--muted);font-size:11px;font-weight:600'));
    }
    return svg;
  }, 300);
}

// ---------------------------------------------------------------- one segmented bar (a split of one whole)
// Round C2a (Divyam, 28 Nov 2026, audit #30): parts [{label, v, color, text}] that add up to one whole (Fixed against variable
// cost: the cost types' paise per pick), drawn as one bar, left to right, each part its width; a part wide enough carries its
// text on it; the key under it names every part with its text, so a small part is never lost. o: {aria, fmt, total (words at
// the right end)}. A part with no figure is left out (the caller names it), never drawn as 0.
function segBar(parts, o = {}) {
  const P = parts.filter((p) => ok(p.v) && p.v > 0), T = P.reduce((a, p) => a + p.v, 0), fmt = o.fmt || pn;
  if (!(T > 0)) return el('p', {class: 'empty', text: o.empty || 'Nothing to split on this day.'});
  const svgBox = fitted((W) => {
    const H = 44, L = 2, R = 2, svg = svgRoot(W, H, o.aria), x = (v) => L + (W - L - R) * v / T;
    let run = 0;
    for (const p of P) {
      const x0 = x(run), w = Math.max(1, x(run + p.v) - x0), txt = p.text != null ? p.text : fmt(p.v);
      svg.append(tip(svgEl('rect', {x: x0, y: 6, width: w, height: 30, class: 'segp', style: `fill:${p.color};stroke:var(--panel);stroke-width:1.5`}), `${p.label}: ${txt}`));
      if (w >= txt.length * 6.2 + 8) svg.append(tx({x: x0 + w / 2, y: 25, 'text-anchor': 'middle', 'pointer-events': 'none'}, txt, `fill:${inkOn(p.color)};font-size:11px;font-weight:600`));
      run += p.v;
    }
    return svg;
  }, 260);
  const out = parts.filter((p) => !(ok(p.v) && p.v > 0));
  return el('div', {class: 'segbar'}, svgBox, out.length ? el('p', {class: 'note', text: `Not in the bar (no figure, or at or below 0): ${out.map((p) => `${p.label} ${ok(p.v) ? fmt(p.v) : '—'}`).join(', ')}. Next: see the table under it.`}) : null, el('div', {class: 'legend'}, P.map((p) => el('span', {class: 'lg'}, el('span', {class: 'sq', style: `background:${p.color}`}), `${p.label} ${p.text != null ? p.text : fmt(p.v)}`)),
    o.total ? el('span', {class: 'lg', text: o.total}) : null));
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
        if (h >= 15 && bw >= 30) { const t = tx({x: cx, y: Y(run + v / 2) + 4, 'text-anchor': 'middle', 'data-layer': k, class: 'sbval', 'pointer-events': 'none'}, fmt(v), `fill:${inkOn(l.color)};font-size:10px;font-weight:600`); svg.append(t); }
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
// Round C1 (audit #26): inside it, the segments carry their value only for the layer picked in the legend (style.css .sbval);
// with none picked, only the bars' totals; every value stays in the hover text.
const HL = {};
function hlStack(o, key, extra) {
  const box = el('div', {class: 'hlbox'}), set = (k) => { HL[key] = k; if (k == null) box.removeAttribute('data-hl'); else box.setAttribute('data-hl', k); for (const b of box.querySelectorAll('.lg[data-k]')) b.setAttribute('aria-pressed', String(b.dataset.k) === String(k) ? 'true' : 'false'); };
  const leg = el('div', {class: 'legend hl-legend'}, o.layers.map((l, k) => el('button', {type: 'button', class: 'lg', 'data-k': k, 'aria-pressed': 'false', title: `Highlight ${l.name} and show its values on the bars`, onclick: () => set(HL[key] === k ? null : k)},
    el('span', {class: 'sq', style: `background:${l.color}`}), l.name)), ...(extra || []));
  box.append(stackBars(o), leg);
  if (HL[key] != null && HL[key] < o.layers.length) set(HL[key]);
  return box;
}

// ---------------------------------------------------------------- Targets: a small range bar (now, bm, best, target)
// Same marks as the by-loom charts: current = lime bar, benchmark = tick, best = green dot, target = hollow diamond.
// Round C3 (audit #22, #23): o.w draws it narrower (a table cell); the marks keep their size.
function rangeBar(o) {
  const vs = [o.now, o.bm, o.best, o.tg].filter(ok), Wb = o.w || 132;
  const s = svgEl('svg', {class: 'rbar', width: Wb, height: 20, viewBox: `0 0 ${Wb} 20`, role: 'img', 'aria-label': o.aria || 'Now, benchmark, best and target'});
  if (!vs.length) return s;
  let lo = Math.min(...vs), hi = Math.max(...vs); const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.02 || 1; lo -= pad; hi += pad;
  const x = (v) => 8 + (Wb - 16) * (v - lo) / (hi - lo);
  s.append(svgEl('line', {x1: 4, x2: Wb - 4, y1: 10, y2: 10, style: 'stroke:var(--line);stroke-width:2;stroke-linecap:round'}));
  if (ok(o.bm)) s.append(svgEl('rect', {x: x(o.bm) - 1.2, y: 2, width: 2.4, height: 16, style: 'fill:var(--barline)'}));
  if (ok(o.best)) s.append(svgEl('circle', {cx: x(o.best), cy: 10, r: 4.5, style: 'fill:var(--good);stroke:var(--panel);stroke-width:1.2'}));
  if (ok(o.tg)) { const c = x(o.tg); s.append(svgEl('path', {d: `M${c} 4L${c + 6} 10L${c} 16L${c - 6} 10Z`, style: 'fill:var(--panel);stroke:var(--barline);stroke-width:1.6'})); }
  if (ok(o.now)) s.append(svgEl('rect', {x: x(o.now) - 3, y: 5, width: 6, height: 10, rx: 1.5, style: 'fill:var(--bar);stroke:var(--barline);stroke-width:1'}));
  tip(s, o.title || [['now', o.now], ['bm', o.bm], ['best', o.best], ['target', o.tg]].filter((p) => ok(p[1])).map((p) => `${p[0]} ${(o.fmt || pn)(p[1])}`).join(' · '));
  return s;
}

// ---------------------------------------------------------------- Round C3: a small gap bar in a table cell (audit #24, #43)
// v: the gap; max: the column's largest |gap| (the bar's half width, or full width with one: true for a gap that is never
// below 0); tone 'bad' | 'good' | null (grey). No text: the cell's figure sits beside it. A gap with no figure: no bar.
function gapBar(v, max, o = {}) {
  const Wb = o.w || 56, s = svgEl('svg', {class: 'gbar', width: Wb, height: 10, viewBox: `0 0 ${Wb} 10`, 'aria-hidden': 'true'});
  if (!ok(v) || !(max > 0)) return s;
  const one = !!o.one, mid = one ? 1 : Wb / 2, half = one ? Wb - 2 : Wb / 2 - 1, len = Math.min(1, Math.abs(v) / max) * half;
  s.append(svgEl('line', {x1: mid, x2: mid, y1: 0, y2: 10, style: 'stroke:var(--muted);stroke-width:1'}));
  const col = o.tone === 'bad' ? 'var(--bad)' : o.tone === 'good' ? 'var(--good)' : 'var(--muted-2)';
  if (len > 0) s.append(svgEl('rect', {x: v < 0 && !one ? mid - len : mid, y: 2, width: Math.max(1, len), height: 6, rx: 1, style: `fill:${col}`}));
  return s;
}
// A table cell: the figure, then its gap bar under it; sorts on the gap.
const gapCell = (text, v, max, o) => sortAs(el('span', {class: 'gcell'}, el('span', {text}), gapBar(v, max, o)), ok(v) ? v : null);
const gapMax = (vals) => Math.max(0, ...vals.filter(ok).map(Math.abs));

// ---------------------------------------------------------------- Round C3: a scatter with its fit line (audit #12)
// Divyam's call (28 Nov 2026): one exception to "no scatters", the owner's Compressor kWh against the fit. pts: [{x, y, out
// (an outlier, ringed red), title, onClick}]; o: {aria, xAxis, yAxis, line: [[x0, y0], [x1, y1]] (the fit), lineName, fmtX, fmtY}.
function scatterChart(pts, o = {}) {
  const P = (pts || []).filter((p) => ok(p.x) && ok(p.y));
  if (P.length < 2) return el('p', {class: 'empty', text: o.empty || 'Fewer than two days to draw.'});
  return fitted((W) => {
    const H = Math.round(Math.min(300, Math.max(220, W * 0.5))), L = 54, R = 14, T = 14, B = 42, svg = svgRoot(W, H, o.aria);
    const xs = P.map((p) => p.x).concat(o.line ? o.line.map((q) => q[0]) : []), ys = P.map((p) => p.y).concat(o.line ? o.line.map((q) => q[1]) : []);
    const [xa, xb, xt] = niceRange(Math.min(...xs), Math.max(...xs)), [ya, yb, yt] = niceRange(Math.min(...ys), Math.max(...ys));
    const X = (v) => L + (W - L - R) * (v - xa) / ((xb - xa) || 1), Y = (v) => T + (H - T - B) * (1 - (v - ya) / ((yb - ya) || 1));
    for (const t of yt) { svg.append(svgEl('line', {x1: L, x2: W - R, y1: Y(t), y2: Y(t), style: 'stroke:var(--line);stroke-width:1'})); svg.append(tx({x: L - 6, y: Y(t) + 4, 'text-anchor': 'end'}, axisFmt(t))); }
    const every = Math.max(1, Math.ceil(xt.length / Math.max(2, Math.floor((W - L - R) / 56))));
    xt.forEach((t, i) => { svg.append(svgEl('line', {x1: X(t), x2: X(t), y1: T, y2: H - B, style: 'stroke:var(--line);stroke-width:1;opacity:.6'})); if (!(i % every)) svg.append(tx({x: X(t), y: H - B + 14, 'text-anchor': 'middle'}, axisFmt(t))); });
    if (o.xAxis) svg.append(tx({x: L + (W - L - R) / 2, y: H - 4, 'text-anchor': 'middle'}, o.xAxis));
    if (o.yAxis) { const t = tx({x: 12, y: T + (H - T - B) / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${T + (H - T - B) / 2})`}, o.yAxis); svg.append(t); }
    if (o.line) { const ln = svgEl('line', {x1: X(o.line[0][0]), y1: Y(o.line[0][1]), x2: X(o.line[1][0]), y2: Y(o.line[1][1]), class: 'fitline', style: 'stroke:var(--ink);stroke-width:1.6;stroke-dasharray:6 4'}); tip(ln, o.lineName || 'The fit'); svg.append(ln); }
    for (const p of P) {
      const c = svgEl('circle', {cx: X(p.x), cy: Y(p.y), r: 4.5, class: p.out ? 'scpt out' : 'scpt', style: `fill:${CC[0]};fill-opacity:.8;stroke:${p.out ? 'var(--bad)' : 'var(--panel)'};stroke-width:${p.out ? 2.5 : 1}${p.onClick ? ';cursor:pointer' : ''}`});
      tip(c, p.title || `${(o.fmtX || pn)(p.x)} · ${(o.fmtY || pn)(p.y)}`); if (p.onClick) c.addEventListener('click', p.onClick); svg.append(c);
      if (p.out) { const lb = p.label || 'outlier', ax = X(p.x) > W - 70 ? 'end' : 'start'; svg.append(tx({x: X(p.x) + (ax === 'end' ? -8 : 8), y: Y(p.y) - 7, 'text-anchor': ax}, lb, 'fill:var(--bad);font-size:11px;font-weight:600')); }
    }
    return svg;
  }, 280);
}

// Ranked bars with a sort bar (12 Nov 2026): Name and Value, plus any o.sortBases [{v, label, get}]. o.nosort: none.
// 18 Nov 2026: o.nameLabel / o.sortLabel name the two bases after what they are ("Loom", "Warp breaks per 100k picks");
// o.limit draws only the first n rows after sorting, so a basis ranks every row, not just the n drawn; o.sortDir is the
// default order of the value basis ('d' highest first, 'a' lowest first: worst first either way).
function barBases(o, valLabel) {
  return [{v: 'name', label: o.nameLabel || 'Name', get: (r) => r.label, d: 'a'}, {v: 'val', label: valLabel || o.sortLabel || 'Value', get: (r) => ok(r.v) ? r.v : null}, ...(o.sortBases || [])];
}
const barCut = (R, o) => o.limit ? R.slice(0, o.limit) : R;
function hbars(rows, o = {}) { return o.nosort || rows.length < 3 ? hbars0(barCut(rows, o), o) : sortableChart(o.sortId || o.aria || 'hbars', rows, barBases(o), (R) => hbars0(barCut(R, o), o), {b: 'val', d: o.sortDir || 'd'}); }
function signedBars(rows, o = {}) { return o.nosort || rows.length < 3 ? signedBars0(barCut(rows, o), o) : sortableChart(o.sortId || o.aria || 'sbars', rows, barBases(o), (R) => signedBars0(barCut(R, o), o), {b: 'val', d: o.sortDir || 'd'}); }
