// W2 Looms · app/charts.js — The small SVG charts (lines, bars, waterfall, toggles, panning).
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
'use strict';
// ---------------------------------------------------------------- small SVG charts
function niceRange(lo, hi) {
  if (!ok(lo) || !ok(hi)) return [0, 1, [0, 1]];
  if (hi - lo < 1e-9) { hi = lo + Math.max(Math.abs(lo) * 0.1, 1); lo = lo - Math.max(Math.abs(lo) * 0.1, 1) * 0.0; }
  const span = hi - lo, raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, t = [];
  for (let v = a; v <= b + step / 2; v += step) t.push(+v.toFixed(6));
  return [a, b, t];
}
// The Y axis of a line chart. o.max: 0 to max; o.fit (Round C2a, audit #3): from the lowest to the highest value drawn, padded
// 5% and rounded out to whole units (paise), so two close lines fill the panel; else a nice range (from 0 with o.zero).
function yAxis(o, lo, hi) {
  if (o.max != null) return [0, o.max, [0, o.max / 2, o.max]];
  if (o.fit && ok(lo) && ok(hi)) {
    const pad = (hi - lo) * 0.05 || Math.max(Math.abs(hi) * 0.05, 0.5), a = Math.floor(lo - pad), b = Math.max(Math.ceil(hi + pad), a + 1);
    const t = niceRange(a, b)[2].filter((v) => v >= a - 1e-9 && v <= b + 1e-9);
    return [a, b, t.length >= 2 ? t : [a, b]];
  }
  if (o.barPad && ok(lo) && ok(hi)) {   // bars (Round C2a): room past the longest bar for its value label
    const sp = Math.max(hi, 0) - Math.min(lo, 0) || 1; lo = lo < 0 ? lo - 0.2 * sp : lo; hi = hi > 0 ? hi + 0.2 * sp : hi;
  }
  return o.zero ? niceRange(Math.min(0, lo), Math.max(0, hi)) : niceRange(lo, hi);
}
function axisFmt(v) { const a = Math.abs(v); return a >= 1e5 ? (v / 1e5).toFixed(v % 1e4 ? 2 : 1) + 'L' : a >= 1000 ? (v / 1000).toFixed(v % 100 ? 2 : v % 1000 ? 1 : 0) + 'k' : (+v.toFixed(2)).toString(); }   // enough decimals that no two ticks read the same
function frame(o, lo, hi, n) {
  const W = o.w || 680, H = o.h || 230, L = 50, R = o.w && o.w < 420 ? 14 : 26, T = 18, B = 34;
  const [a, b, ticks] = yAxis(o, lo, hi);
  const svg = svgEl('svg', {viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': o.aria || 'Chart', style: 'max-width:100%;height:auto;display:block'});
  // o.padX (Round C2a): room between the axis and the first day, so a bar there clears the axis labels (two panels keep one value)
  const PX = o.padX || 0, X = (i) => L + PX + (n <= 1 ? (W - L - R - PX) / 2 : (i * (W - L - R - PX)) / (n - 1)), Y = (v) => T + (H - T - B) * (1 - (v - a) / ((b - a) || 1));
  for (const t of ticks) {
    svg.append(svgEl('line', {x1: L, x2: W - R, y1: Y(t), y2: Y(t), style: 'stroke:var(--line);stroke-width:1'}));
    const tx = svgEl('text', {x: L - 6, y: Y(t) + 4, 'text-anchor': 'end', style: 'fill:var(--muted);font-size:11px'}); tx.textContent = axisFmt(t); svg.append(tx);
  }
  const every = Math.max(1, Math.ceil(n / Math.max(3, Math.floor((W - L - R) / (o.xlabels ? 110 : 62)))));
  (o.dates || []).forEach((d, i) => {
    if (i % every && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < every * 0.6) return;  // keep the last label clear of its neighbour
    const edge = X(i) + 26 > W ? 'end' : 'middle';   // the last date stays inside the chart on a phone
    const tx = svgEl('text', {x: edge === 'end' ? W - 2 : X(i), y: H - 12, 'text-anchor': edge, style: 'fill:var(--muted);font-size:11px'}); tx.textContent = o.xlabels ? o.xlabels[i] : dfmt(d); svg.append(tx);
  });
  return {svg, X, Y, W, H, L, R, T, B, PX, a, b};
}
// Every line chart with more than one line gets toggle boxes for its legend (toggleChart); o.plain draws it as is.
// o.id names the chart so its switched-on lines are kept while the page is open (defaults to its aria label).
// Long charts stay readable without getting taller:
//  · o.pan = N: past N points the chart shows N at a time and scrolls sideways (latest first); the Y axis stays put and
//    keeps one scale for the whole period (panChart).
//  · without pan, past LIGHT points the dots and most value labels go (only the last, highest and lowest are labelled);
//    hovering or tapping the chart shows that day's values under it.
//  · a series with avgOf (a 7-day average) fades the series it averages, so the trend reads first.
// o.xlabels / o.tips replace the date labels (weekly charts); o.pickDates is what a click opens (default o.dates).
// o.marks: [{date, text}] draws a dashed vertical marker on those days (plotMarks).
const LIGHT = 16;
// the period averages drawn (they set the Y range too: a week's sum can sit outside the days' own values)
const perVals = (o) => o.pavg === false ? [] : o.series.filter((s) => s.per && ok(s.per.v) && !s.avgOf).map((s) => s.per.v);
// Round C2b (audit #9): a series with s.win = [lo, hi] (calc.js dotWin) sets the axis only with its values inside that window;
// the rest are drawn at the edge of the axis as arrows with their value (plotEdge)
const axVals = (o) => o.series.flatMap((s) => s.win ? s.vals.filter((v) => ok(v) && v >= s.win[0] && v <= s.win[1]) : s.vals).filter(ok);
const inAxis = (o, a, b) => o.series.some((s) => s.win) ? {...o, series: o.series.map((s) => s.win ? {...s, vals: s.vals.map((v) => ok(v) && (v < a - 1e-9 || v > b + 1e-9) ? null : v)} : s)} : o;
function plotEdge(svg, o, X, a, b, top, bottom) {
  const fmt = o.fmt || pn, drawn = svg.__lab = svg.__lab || [];
  o.series.forEach((s, si) => {
    if (!s.win) return;
    const col = s.color || ccAt(si);
    s.vals.forEach((v, i) => {
      if (!ok(v) || (v >= a - 1e-9 && v <= b + 1e-9)) return;
      const up = v > b, x = X(i), y = up ? top + 1 : bottom - 1, d = up ? 7 : -7;
      const p = svgEl('path', {d: `M${x - 5} ${y + d}L${x} ${y}L${x + 5} ${y + d}Z`, class: 'edgear', style: `fill:${col}`});
      const tt = svgEl('title'); tt.textContent = `${s.name} · ${ptLabel(o, i)}: ${fmt(v)} (off the axis)`; p.append(tt); svg.append(p);
      const ty = up ? y + 19 : y - 11, txt = fmt(v), bx = labBox(x, ty, txt, 'middle');
      if (drawn.some((q) => labHit(bx, q))) return;   // the value stays in the hover text and the details bar
      const t = svgEl('text', {x, y: ty, 'text-anchor': 'middle', class: 'edgel', style: 'fill:var(--ink);font-size:10px;font-weight:600;paint-order:stroke;stroke:var(--panel);stroke-width:3px'});
      t.textContent = txt; svg.append(t); drawn.push(bx);
    });
  });
}
// Round C2a (audit #3): pan charts with the same o.sync scroll together (two panels on one date axis)
const SYNC = {};
const ptLabel = (o, i) => o.tips ? o.tips[i] : dfmt(o.dates[i]);
const ptPick = (o, i) => (o.pickDates || o.dates)[i];
function lineChart(o) {
  if (!o.plain && (o.series.length > 1 || o.series.some((x) => x.per))) {
    const ser = o.series.map((x, i) => ({...x, key: x.key || String(i), color: x.color || ccAt(i)}));
    return toggleChart(o.id || 'lc:' + (o.aria || ''), {...o, series: ser}, o.defaults || ser.filter((x) => !x.avgOf).map((x) => x.key));
  }
  const n = o.dates.length, vals = axVals(o).concat((o.refs || []).map((r) => r.v).filter(ok), perVals(o));
  if (!n || !vals.length) return el('div', {class: 'empty', text: o.empty || 'Not available for this period.'});
  if ((o.pan && n > o.pan) || (o.px && n > 1)) return panChart(o);
  const f = frame(o, Math.min(...vals), Math.max(...vals), n), {svg, X, Y} = f, light = n > LIGHT;
  for (const r of o.refs || []) if (ok(r.v)) {
    svg.append(svgEl('line', {x1: f.L, x2: f.W - f.R, y1: Y(r.v), y2: Y(r.v), style: 'stroke:var(--muted);stroke-width:1.2;stroke-dasharray:5 4'}));
    const t = svgEl('text', {x: f.W - f.R, y: Y(r.v) - 4, 'text-anchor': 'end', style: 'fill:var(--muted);font-size:11px'}); t.textContent = r.label; svg.append(t);
    refLab(svg, t, f.W - f.R, Y(r.v) - 4, r.label, f.L + 4);
  }
  plotMarks(svg, o, X, f.T, f.H - f.B, f.W);
  plotShade(svg, o, X, Y);
  plotSeries(svg, inAxis(o, f.a, f.b), X, Y, light, f.W);
  plotEdge(svg, o, X, f.a, f.b, f.T, f.H - f.B);
  plotAvg(svg, o, f.L, f.W - f.R, Y, false);
  const box = el('div', {class: 'tablebox'}, svg, legend(o.series));
  if (!o.noread) readout(svg, box, o, X, f);
  svg.__w0 = o.w0 || f.W; svg.__w = f.W; svg.__redraw = (W) => { const nb = lineChart({...o, plain: true, w: W, w0: svg.__w0}), ns = nb.querySelector('svg'); const ro = box.querySelector('.readout'), nr = nb.querySelector('.readout'); if (ro && nr) ro.replaceWith(nr); else if (ro) ro.replaceChildren(); return ns; };
  return box;
}
// Round C1 (audit #15): value labels never print over each other. Each label's box is kept on the chart (svg.__lab); a label
// within 12 px of one already drawn is left out (its value stays in the hover text and the details bar). The last, highest and
// lowest point of each series are drawn first and always kept; a reference line's label that one of them would cover moves
// to the left end of its line.
const LAB_GAP = 12;
const labBox = (x, y, text, anchor) => { const w = String(text).length * 6.2 + 4, x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x; return {x0, x1: x0 + w, y0: y - 11, y1: y + 2}; };
const labHit = (a, b) => a.x0 < b.x1 + LAB_GAP && b.x0 < a.x1 + LAB_GAP && a.y0 < b.y1 + LAB_GAP && b.y0 < a.y1 + LAB_GAP;
const labHitX = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 + LAB_GAP && b.y0 < a.y1 + LAB_GAP;
function refLab(svg, t, x, y, text, xLeft) { (svg.__lab = svg.__lab || []).push({...labBox(x, y, text, 'end'), ref: t, xLeft, y, text}); }
function plotSeries(svg, o, X, Y, light, wMax) {
  const faded = new Set(o.series.filter((s) => s.avgOf).map((s) => s.avgOf));
  const strong = o.series.filter((s) => !faded.has(s.key));
  const drawn = svg.__lab = svg.__lab || [], cand = [];
  o.series.forEach((s, si) => {
    const col = s.color || ccAt(si), pts = s.vals.map((v, i) => ok(v) ? [X(i), Y(v), v, i] : null).filter(Boolean), fade = faded.has(s.key);
    // Round C2a (audit #3): o.breaks: a day with no figure breaks the line (no join across it); s.bars: bars from 0, green at or
    // above 0, red below (profit and loss), no dots; Round C3 (#12): s.upBad turns it round (above 0 red: kWh over the fit)
    const runs = o.breaks ? pts.reduce((R, p) => { const r = R[R.length - 1]; if (r && r[r.length - 1][3] === p[3] - 1) r.push(p); else R.push([p]); return R; }, []) : [pts];
    if (s.bars) {
      const step = s.vals.length > 1 ? Math.abs(X(1) - X(0)) : 40, bw = Math.max(3, Math.min(22, step * 0.62)), y0 = Y(0);
      for (const p of pts) {
        const r = svgEl('rect', {x: p[0] - bw / 2, y: Math.min(p[1], y0), width: bw, height: Math.max(1, Math.abs(y0 - p[1])), class: 'pbar', style: `fill:var(${(s.upBad ? p[2] > 0 : p[2] < 0) ? '--bad' : '--good'});${o.onPick ? 'cursor:pointer;' : ''}`});
        const tt = svgEl('title'); tt.textContent = `${s.name} · ${ptLabel(o, p[3])}: ${(o.fmt || pn)(p[2])}`; r.append(tt);
        if (o.onPick) r.addEventListener('click', () => o.onPick(ptPick(o, p[3])));
        svg.append(r);
      }
    } else if (!s.dots) for (const r of runs) if (r.length > 1) svg.append(svgEl('polyline', {points: r.map((p) => p[0] + ',' + p[1]).join(' '), fill: 'none', style: `stroke:${col};stroke-width:${s.avgOf ? 2.8 : 2};${s.dash ? 'stroke-dasharray:5 4;' : ''}${fade ? 'opacity:.35;' : ''}`}));
    const alone = new Set(runs.filter((r) => r.length === 1).map((r) => r[0][3]));
    const lab = !fade && !s.dots && strong.length <= 2, k = Math.max(1, Math.ceil(pts.length / 12));
    let mark = null;
    if (light && pts.length) { const hi = pts.reduce((a, p) => p[2] > a[2] ? p : a), lo = pts.reduce((a, p) => p[2] < a[2] ? p : a); mark = new Set([hi[3], lo[3], pts[pts.length - 1][3]]); }
    pts.forEach((p, j) => {
      // Round C2b (audit #9): s.dots draws the series as faint dots only (no line, no value labels), every point shown
      const showDot = !fade && !s.bars && (s.dots || !light || j === pts.length - 1 || alone.has(p[3]));
      if (showDot) {
        const c = svgEl('circle', {cx: p[0], cy: p[1], r: s.dots ? 3.2 : 3.6, class: s.dots ? 'fdot' : null, style: `fill:${col};stroke:var(--panel);stroke-width:1.5;${s.dots ? 'opacity:.5;' : ''}${o.onPick ? 'cursor:pointer;' : ''}`});
        const tt = svgEl('title'); tt.textContent = `${s.name} · ${ptLabel(o, p[3])}: ${(o.fmt || pn)(p[2])}`; c.append(tt);
        if (o.onPick && !light && !o.pan) c.addEventListener('click', () => o.onPick(ptPick(o, p[3])));
        svg.append(c);
      }
      if (lab && (light ? mark.has(p[3]) : (j % k === 0 || j === pts.length - 1))) {
        const x0 = X(0), edge = p[0] - x0 < 18 && p[0] < 80 ? 'start' : wMax && p[0] > wMax - 30 ? 'end' : 'middle';  // keep edge labels inside the chart
        const lx = edge === 'start' ? Math.max(1, p[0] - 2) : edge === 'end' ? p[0] + 4 : p[0], txt = (o.fmt || pn)(p[2]);
        const keep = j === pts.length - 1 || (light ? true : (mark0(pts, j)));
        cand.push({keep, si, x: lx, y: s.bars && p[2] < 0 ? p[1] + 13 : p[1] - (s.bars ? 5 : 8), edge, col: s.bars ? 'var(--ink)' : col, txt});
      }
    });
  });
  // the kept labels first (last, highest, lowest of each series), then the rest in order; a label too close to one drawn is skipped
  cand.sort((a, b) => (b.keep - a.keep));
  for (const c of cand) {
    const bx = labBox(c.x, c.y, c.txt, c.edge);
    if (!c.keep && drawn.some((d) => labHit(bx, d))) continue;
    if (c.keep) for (const d of drawn) if (d.ref && labHitX(bx, d)) {   // a reference label under a kept value label moves left
      d.ref.setAttribute('x', d.xLeft); d.ref.setAttribute('text-anchor', 'start'); Object.assign(d, labBox(d.xLeft, d.y, d.text, 'start'));
    }
    const t = svgEl('text', {x: c.x, y: c.y, 'text-anchor': c.edge, style: `fill:${c.col};font-size:10.5px;font-weight:600`}); t.textContent = c.txt; svg.append(t);
    drawn.push(bx);
  }
}
// a series' highest or lowest point among pts (for the kept labels on a chart that is not light)
function mark0(pts, j) { let hi = 0, lo = 0; pts.forEach((p, i) => { if (p[2] > pts[hi][2]) hi = i; if (p[2] < pts[lo][2]) lo = i; }); return j === hi || j === lo; }
// Round C2a (audit #3): o.shade = [a, b] (two series keys): the gap between those two lines is shaded, green where a is above b,
// red where it is below; split where the lines cross; nothing over a day either line has no figure (the lines break there too).
function plotShade(svg, o, X, Y) {
  if (!o.shade) return;
  const A = o.series.find((s) => s.key === o.shade[0]), B = o.series.find((s) => s.key === o.shade[1]);
  if (!A || !B) return;
  const poly = (pts, up) => svg.append(svgEl('polygon', {points: pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '), class: 'shade', style: `fill:var(${up ? '--good' : '--bad'});opacity:.2;pointer-events:none`}));
  for (let i = 0; i + 1 < A.vals.length; i++) {
    const a0 = A.vals[i], a1 = A.vals[i + 1], b0 = B.vals[i], b1 = B.vals[i + 1];
    if (![a0, a1, b0, b1].every(ok)) continue;
    const d0 = a0 - b0, d1 = a1 - b1, x0 = X(i), x1 = X(i + 1);
    if (d0 * d1 >= 0) { poly([[x0, Y(a0)], [x1, Y(a1)], [x1, Y(b1)], [x0, Y(b0)]], d0 + d1 >= 0); continue; }
    const t = d0 / (d0 - d1), xc = x0 + t * (x1 - x0), yc = Y(a0 + t * (a1 - a0));
    poly([[x0, Y(a0)], [xc, yc], [x0, Y(b0)]], d0 > 0); poly([[xc, yc], [x1, Y(a1)], [x1, Y(b1)]], d1 > 0);
  }
}
// Round C2a (Divyam, 28 Nov 2026, audit #29): the period average of each series that carries one (s.per = {v, n, m}, calc.js
// perAvg): a dotted line in the series' colour across the plot, labelled "avg x · n of m days". The label goes where it
// covers no value label already drawn (left end above the line, then below; on a pan chart the right end first, the part in
// view); if every place is taken it is left out (the line's hover text and the details bar still give it). o.pavg === false:
// switched off in the legend.
function plotAvg(svg, o, x0, x1, Y, right) {
  if (o.pavg === false) return;
  const drawn = svg.__lab = svg.__lab || [], fmt = o.fmt || pn;
  for (const s of o.series) {
    if (!s.per || !ok(s.per.v) || s.avgOf) continue;
    const y = Y(s.per.v), col = s.color || 'var(--muted)', txt = perLabel(s.per, fmt);
    const ln = svgEl('line', {x1: x0, x2: x1, y1: y, y2: y, class: 'pavg', style: `stroke:${col};stroke-width:1.4;stroke-dasharray:1.5 3.5;stroke-linecap:round`});
    const tt = svgEl('title'); tt.textContent = `${s.name}, period average: ${txt}`; ln.append(tt); svg.append(ln);
    const spots = [[x0 + 4, y - 4, 'start'], [x0 + 4, y + 12, 'start'], [x1 - 2, y - 4, 'end'], [x1 - 2, y + 12, 'end']];
    const at = (right ? [spots[2], spots[3], spots[0], spots[1]] : spots).map(([x, yy, an]) => ({x, y: yy, an, bx: labBox(x, yy, txt, an)})).find((c) => !drawn.some((d) => labHitX(c.bx, d)));
    if (!at) continue;
    const t = svgEl('text', {x: at.x, y: at.y, 'text-anchor': at.an, class: 'pavgl', style: `fill:${col};font-size:10px;font-weight:600;paint-order:stroke;stroke:var(--panel);stroke-width:3px`});
    t.textContent = txt; svg.append(t); drawn.push(at.bx);
  }
}
// Dashed vertical markers (o.marks: [{date, text}], e.g. the days a money approval took effect, R1 11 Nov 2026). A mark
// lands on its date, or on the week that holds it when the chart is weekly (o.pickDates = each bucket's last day).
function markIdx(o, d) {
  if (o.pickDates) return o.dates.findIndex((s, i) => s <= d && d <= o.pickDates[i]);
  return o.dates.indexOf(d);
}
// Round C1 (audit #16): each mark is a short tick under the top of the plot; its full-height dashed line shows only while
// that day is the one being read in the details bar (markShow).
function plotMarks(svg, o, X, top, bottom, wMax) {
  let last = -1e9;
  for (const m of o.marks || []) {
    const i = markIdx(o, m.date); if (i < 0) continue;
    const x = X(i);
    svg.append(svgEl('line', {x1: x, x2: x, y1: top - 4, y2: top + 6, class: 'mktick', style: 'stroke:var(--muted);stroke-width:1.6'}));
    svg.append(svgEl('line', {x1: x, x2: x, y1: top - 4, y2: bottom, class: 'mkline', 'data-i': i, style: 'stroke:var(--muted);stroke-width:1.2;stroke-dasharray:4 4;display:none'}));
    const tt = svgEl('title'); tt.textContent = `${dfmt(m.date)}: ${m.text}`;
    const t = svgEl('text', {x: x > (wMax || 680) - 60 ? x - 3 : x + 3, y: top - 6, 'text-anchor': x > (wMax || 680) - 60 ? 'end' : 'start', style: 'fill:var(--muted);font-size:10px;font-weight:600'});
    t.textContent = x - last < 40 ? '' : (m.short || '▾'); t.append(tt); svg.append(t);   // the label stays out of the way; hover reads the approval
    last = x;
  }
}
const markShow = (svg, i) => { for (const l of svg.querySelectorAll('.mkline')) l.style.display = +l.dataset.i === i ? '' : 'none'; };
// Hover or tap a light chart: a guide line on that day and its values under the chart, with a button to open the day.
// The details bar under every line chart (12 Nov 2026: on every line chart, not only long ones): hover or tap a point for
// that day's figures, then "Open this day" (the chart's own onPick, else openDayAny).
function readoutBar(o) {
  const out = el('div', {class: 'readout dbar', 'aria-live': 'polite'});
  let cur = -1;
  const show = (i) => {
    if (i < 0 || i === cur) return; cur = i;
    const prev = (s) => { for (let j = i - 1; j >= 0; j--) if (ok(s.vals[j])) return s.vals[j]; return null; };
    const parts = o.series.filter((s) => ok(s.vals[i])).map((s, j) => {
      const p = prev(s), d = ok(p) ? s.vals[i] - p : null;
      const va = o.pavg !== false && s.per && ok(s.per.v) ? s.vals[i] - s.per.v : null;   // Round C2a (audit #29): against the period average
      return el('span', {class: 'ro'}, el('i', {style: `background:${s.color || ccAt(j)}`}), `${s.name} `, el('b', {text: (o.fmt || pn)(s.vals[i])}),
        ok(d) && Math.abs(d) > 1e-9 ? el('span', {class: 'note', text: ` (${d > 0 ? '+' : '−'}${(o.fmt || pn)(Math.abs(d))} vs previous)`}) : null,
        ok(va) ? el('span', {class: 'note vsavg', text: ` · vs avg ${Math.abs(va) < 1e-9 ? '±' : va > 0 ? '+' : '−'}${(o.fmt || pn)(Math.abs(va))}`}) : null);
    });
    // o.extra (Round C2a, audit #3): figures from a panel drawn under this chart on the same days; a day with none reads "—"
    for (const x of o.extra || []) parts.push(el('span', {class: 'ro'}, el('i', {style: `background:${x.color || 'var(--muted)'}`}), `${x.name} `, el('b', {text: ok(x.vals[i]) ? (x.fmt || o.fmt || pn)(x.vals[i]) : '—'})));
    const refs = (o.refs || []).filter((r) => ok(r.v)).map((r) => el('span', {class: 'note', text: `${r.label} ${(o.fmt || pn)(r.v)}`}));
    const pick = o.onPick || (o.noOpen ? null : openDayAny);
    // o.detail(i): more of that day's figures, drawn under the values (Round V: the deviation card's day)
    const more = o.detail ? o.detail(i) : null;
    out.replaceChildren(...[el('b', {text: ptLabel(o, i)}), ...(parts.length ? parts : [el('span', {text: 'no figure'})]), ...refs, ...(more ? [more] : []),
      pick ? el('button', {class: 'link', type: 'button', text: o.pickDates ? 'Open the last day ›' : 'Open this day ›', onclick: () => pick(ptPick(o, i))}) : null].filter(Boolean));
  };
  out.append(el('span', {class: 'note', text: 'Point at or tap the chart to read a day.'}));
  return {out, show};
}
function readout(svg, box, o, X, f) {
  const n = o.dates.length, R = readoutBar(o);
  const guide = svgEl('line', {y1: f.T, y2: f.H - f.B, style: 'stroke:var(--muted);stroke-width:1;stroke-dasharray:2 3;display:none'});
  const hit = svgEl('rect', {x: f.L, y: f.T, width: Math.max(1, f.W - f.L - f.R), height: Math.max(1, f.H - f.T - f.B), style: 'fill:transparent;cursor:crosshair'});
  svg.append(guide, hit);
  const at = (e) => {
    const r = svg.getBoundingClientRect(); if (!r.width) return -1;
    const x = (e.clientX - r.left) * (f.W / r.width), step = n > 1 ? (f.W - f.L - f.R - (f.PX || 0)) / (n - 1) : 1;
    return Math.max(0, Math.min(n - 1, Math.round((x - f.L - (f.PX || 0)) / step)));
  };
  const show = (i) => { if (i < 0) return; guide.setAttribute('x1', X(i)); guide.setAttribute('x2', X(i)); guide.style.display = ''; markShow(svg, i); R.show(i); };
  hit.addEventListener('pointermove', (e) => show(at(e)));
  hit.addEventListener('click', (e) => show(at(e)));
  box.append(R.out);
}
// "Open this day" where a chart has no day view of its own: Costing opens the day on Costing; elsewhere the app's date chip.
function openDayAny(d) {
  if (TAB === 'costing' && typeof pickDay === 'function') { pickDay(d); return; }
  const sel = $('#day'), opts = sel ? [...sel.options] : [];
  const o = opts.find((x) => x.value === d) || (opts[0] && LATEST && LATEST.latest === d ? opts[0] : null);
  if (!o) { const n = el('span', {class: 'note', text: `No saved loom day for ${dfmt(d)}.`}); document.activeElement && document.activeElement.after && document.activeElement.after(n); setTimeout(() => n.remove(), 2500); return; }
  sel.value = o.value; setView(o.value); window.scrollTo(0, 0);
}
// Pan window: o.pan points fill the width; earlier points sit to the left (drag, swipe, scroll or the buttons). The Y axis is
// drawn apart from the plot so it never scrolls away. Drawn in screen pixels at the box's real width, redrawn when it changes.
function panChart(o) {
  const n = o.dates.length, win = Math.min(n, o.pan || n), scrolls = n > win, AX = 48, R = 24, T = 18, B = 34, PADL = o.padL || 12;   // o.padL: room for a bar at the first day (two panels keep one value)
  const vals = axVals(o).concat((o.refs || []).map((r) => r.v).filter(ok), perVals(o));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const [a, b, ticks] = yAxis(o, lo, hi);
  const wrap = el('div', {class: 'panbox'}), axis = el('div', {class: 'panaxis'}), sc = el('div', {class: 'panscroll' + (scrolls ? '' : ' still')});
  const prevB = el('button', {type: 'button', class: 'ghost', text: '‹ Earlier'}), nextB = el('button', {type: 'button', class: 'ghost', text: 'Later ›'});
  const pinfo = el('span', {class: 'note'}), RO = o.noread ? null : readoutBar(o);
  // back: how many points the view sits before the latest one (0 = at the end). Kept from the last scroll, so a redraw at a
  // new width keeps the same days in view.
  let W = 0, step = 0, back = 0, busy = false;
  const draw = (cw) => {
    cw = Math.max(260, Math.round(cw)); if (Math.abs(cw - W) < 4) return;
    W = cw; busy = true;
    const H0 = o.h || 230, H = Math.round(Math.max(Math.min(200, H0), Math.min(H0, cw * H0 / (o.w || 680))));   // Round C2a: a short panel (o.h under 200) keeps its height
    step = (cw - AX - PADL - R) / (win - 1);
    const PW = Math.round(PADL + step * (n - 1) + R);
    const Y = (v) => T + (H - T - B) * (1 - (v - a) / ((b - a) || 1)), X = (i) => PADL + i * step;
    const ax = svgEl('svg', {width: AX, height: H, viewBox: `0 0 ${AX} ${H}`, role: 'presentation', style: 'display:block'});
    for (const t of ticks) { const tx = svgEl('text', {x: AX - 6, y: Y(t) + 4, 'text-anchor': 'end', style: 'fill:var(--muted);font-size:11px'}); tx.textContent = axisFmt(t); ax.append(tx); }
    const svg = svgEl('svg', {width: PW, height: H, viewBox: `0 0 ${PW} ${H}`, role: 'img', 'aria-label': o.aria || 'Chart', style: 'display:block;max-width:none'});
    for (const t of ticks) svg.append(svgEl('line', {x1: 0, x2: PW, y1: Y(t), y2: Y(t), style: 'stroke:var(--line);stroke-width:1'}));
    const every = Math.max(1, Math.ceil((o.xlabels ? 70 : 46) / step));
    o.dates.forEach((d, i) => {
      if ((n - 1 - i) % every) return;  // count back from the latest day, so the newest label always shows
      const tx = svgEl('text', {x: i ? X(i) : 2, y: H - 12, 'text-anchor': i ? 'middle' : 'start', style: 'fill:var(--muted);font-size:11px'}); tx.textContent = o.xlabels ? o.xlabels[i] : dfmt(d); svg.append(tx);
    });
    for (const r of o.refs || []) if (ok(r.v)) {
      svg.append(svgEl('line', {x1: 0, x2: PW, y1: Y(r.v), y2: Y(r.v), style: 'stroke:var(--muted);stroke-width:1.2;stroke-dasharray:5 4'}));
      const t = svgEl('text', {x: PW - R, y: Y(r.v) - 4, 'text-anchor': 'end', style: 'fill:var(--muted);font-size:11px'}); t.textContent = r.label; svg.append(t);
      refLab(svg, t, PW - R, Y(r.v) - 4, r.label, PADL + 4);
    }
    plotMarks(svg, o, X, T, H - B, PW);
    plotShade(svg, o, X, Y);
    plotSeries(svg, inAxis(o, a, b), X, Y, false, PW);
    plotEdge(svg, o, X, a, b, T, H - B);
    plotAvg(svg, o, PADL, PW - R, Y, true);
    if (RO) {
      const guide = svgEl('line', {y1: T, y2: H - B, style: 'stroke:var(--muted);stroke-width:1;stroke-dasharray:2 3;display:none'});
      const hit = svgEl('rect', {x: 0, y: T, width: PW, height: Math.max(1, H - T - B), style: 'fill:transparent;cursor:crosshair'});
      const at = (e) => { const r = svg.getBoundingClientRect(); return r.width ? Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) * PW / r.width - PADL) / step))) : -1; };
      const sh = (e) => { if (dragged) return; const i = at(e); if (i < 0) return; guide.setAttribute('x1', X(i)); guide.setAttribute('x2', X(i)); guide.style.display = ''; markShow(svg, i); RO.show(i); };
      hit.addEventListener('pointermove', sh); hit.addEventListener('click', sh);
      svg.append(guide, hit);
    }
    axis.replaceChildren(ax); sc.replaceChildren(svg);
    const settle = () => { sc.scrollLeft = Math.max(0, sc.scrollWidth - sc.clientWidth - back * step); busy = false; upd(); };
    settle(); requestAnimationFrame(settle);
  };
  const upd = () => {
    const max = sc.scrollWidth - sc.clientWidth; if (busy || !sc.isConnected || !step || max < 0) return;
    const fromRight = Math.max(0, max - sc.scrollLeft); back = fromRight / step;
    prevB.disabled = sc.scrollLeft <= 2 ? true : null; nextB.disabled = fromRight <= 2 ? true : null;
    if (!step) return;
    const i0 = Math.max(0, Math.round((sc.scrollLeft) / step)), i1 = Math.min(n - 1, i0 + win - 1);
    pinfo.textContent = `${ptLabel(o, i0)} – ${ptLabel(o, i1)} of ${n} ${o.xlabels ? 'weeks' : 'days'}`;
  };
  sc.addEventListener('scroll', upd, {passive: true});
  if (o.sync) {
    SYNC[o.sync] = (SYNC[o.sync] || []).filter((x) => x.isConnected); SYNC[o.sync].push(sc);
    sc.addEventListener('scroll', () => {
      if (sc.__sy) { sc.__sy = false; return; }
      for (const x of SYNC[o.sync]) if (x !== sc && x.isConnected && Math.abs(x.scrollLeft - sc.scrollLeft) > 1) { x.__sy = true; x.scrollLeft = sc.scrollLeft; }
    }, {passive: true});
  }
  const jump = (k) => sc.scrollBy({left: k * step * Math.max(1, Math.floor(win / 2)), behavior: 'smooth'});
  prevB.addEventListener('click', () => jump(-1)); nextB.addEventListener('click', () => jump(1));
  // drag to pan with a mouse (touch already swipes)
  let drag = null, dragged = false;
  sc.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button === 0) { drag = {x: e.clientX, l: sc.scrollLeft}; dragged = false; } });
  sc.addEventListener('pointermove', (e) => {
    if (!drag) return; const dx = e.clientX - drag.x;
    if (!dragged && Math.abs(dx) > 4) { dragged = true; try { sc.setPointerCapture(e.pointerId); } catch (er) {} sc.classList.add('dragging'); }
    if (dragged) sc.scrollLeft = drag.l - dx;
  });
  const endDrag = () => { drag = null; sc.classList.remove('dragging'); };
  sc.addEventListener('pointerup', endDrag); sc.addEventListener('pointercancel', endDrag);
  sc.addEventListener('click', (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
  const vw = document.documentElement.clientWidth || 1000;
  draw(Math.min(o.w || 680, vw - (vw >= 1024 ? 330 : 64)));
  if ('ResizeObserver' in window) new ResizeObserver((es) => { const w = es[0].contentRect.width; if (w) draw(w); }).observe(wrap);
  return el('div', {class: 'tablebox'}, scrolls && !o.nobar ? el('div', {class: 'toolbar panbar'}, prevB, nextB, pinfo) : null, el('div', {class: 'panrow'}, axis, sc), wrap, RO ? RO.out : null, legend(o.series));
}
// Line chart whose legend is a row of toggle boxes. series: {key, name, vals, color, dash, off (reason it cannot be shown)}.
// One or several boxes can be on; the chart draws only those. defaults: keys switched on when the page opens.
const PAVG = 'pavg';
function toggleChart(id, o, defaults) {
  const hasAvg = o.series.some((s) => s.per && ok(s.per.v));
  if (!TOGS[id]) TOGS[id] = new Set([...defaults, PAVG]);   // Round C2a (audit #29): the period average starts on
  const on = TOGS[id], cols = {};
  // a line that first appears on a later draw (e.g. a reference line once a reference is picked) starts as its defaults say
  if (!on.seen) on.seen = new Set(o.series.map((s) => s.key));
  for (const s of o.series) if (!on.seen.has(s.key)) { on.seen.add(s.key); if (defaults.includes(s.key)) on.add(s.key); }
  o.series.forEach((s, i) => { cols[s.key] = s.color || ccAt(i); });
  const avail = (s) => !s.off && s.vals.some(ok);
  const boxes = el('div', {class: 'togs', role: 'group', 'aria-label': 'Series shown'}, o.series.map((s) => {
    const can = avail(s), pressed = can && on.has(s.key);
    return el('button', {type: 'button', class: 'tog', 'aria-pressed': pressed ? 'true' : 'false', disabled: can ? null : true,
      title: can ? (pressed ? 'Hide ' : 'Show ') + s.name : (s.off || 'Not available for this period'),
      onclick: (e) => { if (on.has(s.key)) on.delete(s.key); else on.add(s.key); if (e.currentTarget.closest('dialog')) drawPanel(true); else render(); }},
      el('i', {style: `background:${cols[s.key]};${s.dash ? `background:repeating-linear-gradient(90deg,${cols[s.key]} 0 4px,transparent 4px 7px);` : ''}${s.dots ? 'border-radius:50%;opacity:.6;' : ''}`}), s.name);
  }), hasAvg ? el('button', {type: 'button', class: 'tog tavg', 'aria-pressed': on.has(PAVG) ? 'true' : 'false', title: (on.has(PAVG) ? 'Hide' : 'Show') + ' the period average of each line shown (dotted)',
    onclick: (e) => { if (on.has(PAVG)) on.delete(PAVG); else on.add(PAVG); if (e.currentTarget.closest('dialog')) drawPanel(true); else render(); }},
    el('i', {style: 'background:repeating-linear-gradient(90deg,var(--muted) 0 2px,transparent 2px 5px)'}), 'Period average') : null);
  const shown = o.series.filter((s) => avail(s) && on.has(s.key)).map((s) => ({...s, color: cols[s.key]}));
  const notes = o.series.filter((s) => s.off).map((s) => el('p', {class: 'note', text: `${s.name}: ${s.off}`}));
  const chart = shown.length ? lineChart({...o, series: shown, plain: true, pavg: on.has(PAVG)}) : el('div', {class: 'empty', text: 'Switch on at least one box above to draw the chart.'});
  if (chart.querySelector && chart.querySelector('.legend')) chart.querySelector('.legend').remove();
  return el('div', {}, boxes, chart, ...notes);
}
function legend(series) {
  if (series.length < 2) return null;
  return el('div', {class: 'legend'}, series.map((s, i) => el('span', {class: 'lg'}, el('i', {style: `display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:${s.color || ccAt(i)}`}), s.name)));
}
// o (optional): {unit (in the hover text, default paise), dec (decimals on the bars)}
function waterfall(items, aria, Wd, o = {}) {
  // items: {label, v, total}. Totals are full bars from zero (axis cut to the data); deltas float.
  let run = 0, lo = Infinity, hi = -Infinity;
  // Round C2a (audit #41): a step with gap: true (no figure) keeps its slot with "—" and no bar; the running figure carries on
  const bars = items.map((it) => {
    if (it.gap) return {...it, v: 0, a: run, b: run};
    if (it.total) { run = it.v; lo = Math.min(lo, it.v); hi = Math.max(hi, it.v); return {...it, a: it.v, b: it.v}; }
    const a = run, b = run + it.v; run = b; lo = Math.min(lo, a, b); hi = Math.max(hi, a, b); return {...it, a, b};
  });
  const pad = (hi - lo) * 0.25 || 1, W = Wd || 680, H = 250, L = 46, R = 10, T = 24, B = 56, n = bars.length;
  const [a0, b0, ticks] = niceRange(lo - pad, hi + pad);
  const svg = svgEl('svg', {viewBox: `0 0 ${W} ${H}`, width: Wd ? W : '100%', role: 'img', 'aria-label': aria, style: Wd ? 'max-width:none;height:auto;display:block' : 'max-width:100%;height:auto;display:block'});
  // about 80 px a bar keeps the labels apart; a narrower box scrolls sideways
  svg.__w = W; svg.__min = Math.max(360, n * 80); svg.__redraw = (w) => waterfall(items, aria, w, o).querySelector('svg');
  const unit = o.unit || 'paise', dec = o.dec != null ? o.dec : 1;
  const Y = (v) => T + (H - T - B) * (1 - (v - a0) / ((b0 - a0) || 1)), slot = (W - L - R) / n, bw = Math.min(54, slot * 0.66);
  for (const t of ticks) {
    svg.append(svgEl('line', {x1: L, x2: W - R, y1: Y(t), y2: Y(t), style: 'stroke:var(--line);stroke-width:1'}));
    const tx = svgEl('text', {x: L - 6, y: Y(t) + 4, 'text-anchor': 'end', style: 'fill:var(--muted);font-size:11px'}); tx.textContent = (+t.toFixed(2)).toString(); svg.append(tx);
  }
  bars.forEach((b, i) => {
    const cx = L + slot * i + slot / 2, y1 = Y(Math.max(b.a, b.b)), y2 = Y(Math.min(b.a, b.b));
    // Round C2a (audit #17): o.grey draws cost steps grey (a cost is not a loss) and a total marked res (the result, e.g. profit)
    // green at or above 0, red below
    const col = b.total ? (b.res ? `var(${b.v < 0 ? '--bad' : '--good'})` : 'var(--muted-2)') : o.grey ? (b.v < 0 ? 'var(--muted)' : 'var(--good)') : (o.flip ? b.v < 0 : b.v > 0) ? 'var(--bad)' : 'var(--good)';
    if (i < bars.length - 1) { const lv = b.total ? b.v : b.b, nx = L + slot * (i + 1) + slot / 2; svg.append(svgEl('line', {x1: cx + bw / 2, x2: nx - bw / 2, y1: Y(lv), y2: Y(lv), style: 'stroke:var(--muted);stroke-width:1;stroke-dasharray:3 2'})); }
    if (b.gap) {
      const g = svgEl('text', {x: cx, y: Y(b.a) - 5, 'text-anchor': 'middle', style: 'fill:var(--muted);font-size:11px;font-weight:600'}); g.textContent = '—';
      const gt = svgEl('title'); gt.textContent = b.tip || `${b.label}: no figure`; g.append(gt); svg.append(g);
    }
    const r = b.gap ? null : svgEl('rect', {x: cx - bw / 2, y: b.total ? Y(b.v) : y1, width: bw, height: Math.max(2, b.total ? Y(a0) - Y(b.v) : y2 - y1), style: `fill:${col};opacity:${b.total ? 0.75 : 1}`});
    if (r) { const tt = svgEl('title'); tt.textContent = b.tip || `${b.label}: ${b.total ? pn(b.v, 2).replace(/^-(?=.*[1-9])/, '−').replace(/^-/, '') : sg(b.v)} ${unit}`; r.append(tt); svg.append(r); }
    // Round C1 (audit #25): a total bar on an axis that does not start at 0 is cut; two short slashes near its foot say so
    if (b.total && a0 > 0 && b.v > a0) { const yb = Y(a0) - 7; for (const dx of [-4, 3]) svg.append(svgEl('line', {x1: cx + dx - 3, x2: cx + dx + 3, y1: yb + 4, y2: yb - 4, class: 'wfcut', style: 'stroke:var(--panel);stroke-width:2.4'})); }
    const t = b.gap ? null : svgEl('text', {x: cx, y: (b.total ? Y(b.v) : y1) - 5, 'text-anchor': 'middle', style: 'fill:var(--ink);font-size:11px;font-weight:600'}); if (t) { t.textContent = b.total ? pn(b.v, dec).replace(/^-(?=.*[1-9])/, '−').replace(/^-/, '') : sg(b.v); svg.append(t); }   // Round Y: a negative total with a proper minus, as every figure
    const words = b.label.length > 11 && b.label.includes(' ') ? [b.label.slice(0, b.label.lastIndexOf(' ', 11) > 0 ? b.label.lastIndexOf(' ', 11) : b.label.indexOf(' ')), b.label.slice((b.label.lastIndexOf(' ', 11) > 0 ? b.label.lastIndexOf(' ', 11) : b.label.indexOf(' ')) + 1)] : [b.label];
    words.forEach((w, k) => { const lt = svgEl('text', {x: cx, y: H - B + 16 + k * 13, 'text-anchor': 'middle', style: 'fill:var(--muted);font-size:10.5px'}); lt.textContent = w.length > 14 ? w.slice(0, 13) + '…' : w; svg.append(lt); });
  });
  return el('div', {class: 'tablebox'}, svg);
}
// Round B3 (Divyam, 27 Nov 2026): a share pie (a ring), for a share of a total only (section 5). slices: [{key, label, pct,
// color, sel}], each a part of 1. Each slice and its legend row is a button (tap, Enter, Space) that calls onPick(key); the
// picked slice stands out. The centre carries o.mid (two short lines). Built for one card: Realisation per pick by quality.
// Round C1 (audit #1, #2): slice colours come from the chart palette (CC), set by the caller per quality; a slice's hatch (1 =
// 45° stripes, 2 = crossed) tells apart a seventh or later quality that shares a colour, on the ring and in the list.
let PIEN = 0;
const pieHatchCss = (c, h) => h === 2 ? `repeating-linear-gradient(45deg,transparent 0 3px,var(--panel) 3px 4.5px),repeating-linear-gradient(135deg,${c} 0 3px,var(--panel) 3px 4.5px)` : `repeating-linear-gradient(45deg,${c} 0 3px,var(--panel) 3px 4.5px)`;
function pieChart(slices, o = {}) {
  const S = 220, c = S / 2, R = 100, r = 58, svg = svgEl('svg', {viewBox: `0 0 ${S} ${S}`, width: S, height: S, role: 'group', 'aria-label': o.aria || 'Share', class: 'pie', style: 'display:block;max-width:100%;height:auto'});
  const defs = svgEl('defs'), pid = 'pieh' + (++PIEN);
  const fillOf = (s, j) => {
    if (!s.hatch) return s.color;
    const id = `${pid}-${j}`, pat = svgEl('pattern', {id, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'});
    pat.append(svgEl('rect', {width: 6, height: 6, style: `fill:${s.color}`}), svgEl('line', {x1: 0, y1: 0, x2: 0, y2: 6, style: 'stroke:var(--panel);stroke-width:2'}));
    if (s.hatch === 2) pat.append(svgEl('line', {x1: 0, y1: 3, x2: 6, y2: 3, style: 'stroke:var(--panel);stroke-width:2'}));
    defs.append(pat); return `url(#${id})`;
  };
  svg.append(defs);
  const pt = (a, rad) => [c + rad * Math.sin(a), c - rad * Math.cos(a)], f = (v) => v.toFixed(2);
  const key = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  let a0 = 0, j = 0;
  for (const s of slices) {
    const a1 = a0 + s.pct * 2 * Math.PI, big = a1 - a0 > Math.PI ? 1 : 0, Ro = s.sel ? R + 6 : R, pick = () => o.onPick && o.onPick(s.key);
    let d;
    if (s.pct >= 0.9999) d = `M${c},${c - Ro}A${Ro},${Ro} 0 1 1 ${c - 0.01},${c - Ro}L${c - 0.01},${c - r}A${r},${r} 0 1 0 ${c},${c - r}Z`;
    else { const [x0, y0] = pt(a0, Ro), [x1, y1] = pt(a1, Ro), [x2, y2] = pt(a1, r), [x3, y3] = pt(a0, r);
      d = `M${f(x0)},${f(y0)}A${Ro},${Ro} 0 ${big} 1 ${f(x1)},${f(y1)}L${f(x2)},${f(y2)}A${r},${r} 0 ${big} 0 ${f(x3)},${f(y3)}Z`; }
    const p = svgEl('path', {d, tabindex: '0', role: 'button', 'aria-pressed': s.sel ? 'true' : 'false', 'aria-label': `${s.label}: ${(s.pct * 100).toFixed(1)}%`,
      style: `fill:${fillOf(s, j++)};stroke:var(--panel);stroke-width:1.5;cursor:pointer;opacity:${slices.some((x) => x.sel) && !s.sel ? 0.55 : 1}`});
    const tt = svgEl('title'); tt.textContent = `${s.label}: ${(s.pct * 100).toFixed(1)}%`; p.append(tt);
    p.addEventListener('click', pick); p.addEventListener('keydown', key(pick));
    svg.append(p); a0 = a1;
  }
  (o.mid || []).forEach((t, i) => svg.append(svgText({x: c, y: c + (i ? 14 : -4), 'text-anchor': 'middle', style: `fill:var(${i ? '--muted' : '--ink'});font-size:${i ? 11 : 15}px;font-weight:${i ? 400 : 600}`}, t)));
  const lg = el('div', {class: 'pielg'}, slices.map((s) => { const pick = () => o.onPick && o.onPick(s.key);
    return el('button', {type: 'button', class: 'pierow', 'aria-pressed': s.sel ? 'true' : 'false', onclick: pick},
      el('span', {class: 'sq', style: `background:${s.hatch ? pieHatchCss(s.color, s.hatch) : s.color}`}), el('span', {class: 'pn', text: s.label}), el('span', {class: 'pv', text: `${(s.pct * 100).toFixed(1)}%`})); }));
  return el('div', {class: 'piebox'}, svg, lg);
}
