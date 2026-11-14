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
function axisFmt(v) { const a = Math.abs(v); return a >= 1e5 ? (v / 1e5).toFixed(v % 1e4 ? 2 : 1) + 'L' : a >= 1000 ? (v / 1000).toFixed(v % 100 ? 2 : v % 1000 ? 1 : 0) + 'k' : (+v.toFixed(2)).toString(); }   // enough decimals that no two ticks read the same
function frame(o, lo, hi, n) {
  const W = o.w || 680, H = o.h || 230, L = 50, R = o.w && o.w < 420 ? 14 : 26, T = 18, B = 34;
  const [a, b, ticks] = o.max != null ? [0, o.max, [0, o.max / 2, o.max]] : niceRange(o.zero ? Math.min(0, lo) : lo, hi);
  const svg = svgEl('svg', {viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': o.aria || 'Chart', style: 'max-width:100%;height:auto;display:block'});
  const X = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1)), Y = (v) => T + (H - T - B) * (1 - (v - a) / ((b - a) || 1));
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
  return {svg, X, Y, W, H, L, R, T, B};
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
const ptLabel = (o, i) => o.tips ? o.tips[i] : dfmt(o.dates[i]);
const ptPick = (o, i) => (o.pickDates || o.dates)[i];
function lineChart(o) {
  if (!o.plain && o.series.length > 1) {
    const ser = o.series.map((x, i) => ({...x, key: x.key || String(i), color: x.color || CC[i % CC.length]}));
    return toggleChart(o.id || 'lc:' + (o.aria || ''), {...o, series: ser}, o.defaults || ser.filter((x) => !x.avgOf).map((x) => x.key));
  }
  const n = o.dates.length, vals = o.series.flatMap((s) => s.vals).filter(ok).concat((o.refs || []).map((r) => r.v).filter(ok));
  if (!n || !vals.length) return el('div', {class: 'empty', text: o.empty || 'Not available for this period.'});
  if ((o.pan && n > o.pan) || (o.px && n > 1)) return panChart(o);
  const f = frame(o, Math.min(...vals), Math.max(...vals), n), {svg, X, Y} = f, light = n > LIGHT;
  for (const r of o.refs || []) if (ok(r.v)) {
    svg.append(svgEl('line', {x1: f.L, x2: f.W - f.R, y1: Y(r.v), y2: Y(r.v), style: 'stroke:var(--muted);stroke-width:1.2;stroke-dasharray:5 4'}));
    const t = svgEl('text', {x: f.W - f.R, y: Y(r.v) - 4, 'text-anchor': 'end', style: 'fill:var(--muted);font-size:11px'}); t.textContent = r.label; svg.append(t);
  }
  plotMarks(svg, o, X, f.T, f.H - f.B, f.W);
  plotSeries(svg, o, X, Y, light, f.W);
  const box = el('div', {class: 'tablebox'}, svg, legend(o.series));
  if (!o.noread) readout(svg, box, o, X, f);
  svg.__w0 = o.w0 || f.W; svg.__w = f.W; svg.__redraw = (W) => { const nb = lineChart({...o, plain: true, w: W, w0: svg.__w0}), ns = nb.querySelector('svg'); const ro = box.querySelector('.readout'), nr = nb.querySelector('.readout'); if (ro && nr) ro.replaceWith(nr); else if (ro) ro.replaceChildren(); return ns; };
  return box;
}
// Lines, dots and value labels for one chart. light: no dots and labels only on the last, highest and lowest point.
function plotSeries(svg, o, X, Y, light, wMax) {
  const faded = new Set(o.series.filter((s) => s.avgOf).map((s) => s.avgOf));
  const strong = o.series.filter((s) => !faded.has(s.key));
  o.series.forEach((s, si) => {
    const col = s.color || CC[si % CC.length], pts = s.vals.map((v, i) => ok(v) ? [X(i), Y(v), v, i] : null).filter(Boolean), fade = faded.has(s.key);
    if (pts.length > 1) svg.append(svgEl('polyline', {points: pts.map((p) => p[0] + ',' + p[1]).join(' '), fill: 'none', style: `stroke:${col};stroke-width:${s.avgOf ? 2.8 : 2};${s.dash ? 'stroke-dasharray:5 4;' : ''}${fade ? 'opacity:.35;' : ''}`}));
    const lab = !fade && strong.length <= 2, k = Math.max(1, Math.ceil(pts.length / 12));
    let mark = null;
    if (light && pts.length) { const hi = pts.reduce((a, p) => p[2] > a[2] ? p : a), lo = pts.reduce((a, p) => p[2] < a[2] ? p : a); mark = new Set([hi[3], lo[3], pts[pts.length - 1][3]]); }
    pts.forEach((p, j) => {
      const showDot = !fade && (!light || j === pts.length - 1);
      if (showDot) {
        const c = svgEl('circle', {cx: p[0], cy: p[1], r: 3.6, style: `fill:${col};stroke:var(--panel);stroke-width:1.5;${o.onPick ? 'cursor:pointer;' : ''}`});
        const tt = svgEl('title'); tt.textContent = `${s.name} · ${ptLabel(o, p[3])}: ${(o.fmt || pn)(p[2])}`; c.append(tt);
        if (o.onPick && !light && !o.pan) c.addEventListener('click', () => o.onPick(ptPick(o, p[3])));
        svg.append(c);
      }
      if (lab && (light ? mark.has(p[3]) : (j % k === 0 || j === pts.length - 1))) {
        const x0 = X(0), edge = p[0] - x0 < 18 && p[0] < 80 ? 'start' : wMax && p[0] > wMax - 30 ? 'end' : 'middle';  // keep edge labels inside the chart
        const t = svgEl('text', {x: edge === 'start' ? Math.max(1, p[0] - 2) : edge === 'end' ? p[0] + 4 : p[0], y: p[1] - 8, 'text-anchor': edge, style: `fill:${col};font-size:10.5px;font-weight:600`}); t.textContent = (o.fmt || pn)(p[2]); svg.append(t);
      }
    });
  });
}
// Dashed vertical markers (o.marks: [{date, text}], e.g. the days a money approval took effect, R1 11 Nov 2026). A mark
// lands on its date, or on the week that holds it when the chart is weekly (o.pickDates = each bucket's last day).
function markIdx(o, d) {
  if (o.pickDates) return o.dates.findIndex((s, i) => s <= d && d <= o.pickDates[i]);
  return o.dates.indexOf(d);
}
function plotMarks(svg, o, X, top, bottom, wMax) {
  let last = -1e9;
  for (const m of o.marks || []) {
    const i = markIdx(o, m.date); if (i < 0) continue;
    const x = X(i);
    svg.append(svgEl('line', {x1: x, x2: x, y1: top - 4, y2: bottom, style: 'stroke:var(--info);stroke-width:1.2;stroke-dasharray:4 4'}));
    const tt = svgEl('title'); tt.textContent = `${dfmt(m.date)}: ${m.text}`;
    const t = svgEl('text', {x: x > (wMax || 680) - 60 ? x - 3 : x + 3, y: top - 6, 'text-anchor': x > (wMax || 680) - 60 ? 'end' : 'start', style: 'fill:var(--info);font-size:10px;font-weight:600'});
    t.textContent = x - last < 40 ? '' : (m.short || '▾'); t.append(tt); svg.append(t);   // the label stays out of the way; hover reads the approval
    last = x;
  }
}
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
      return el('span', {class: 'ro'}, el('i', {style: `background:${s.color || CC[j % CC.length]}`}), `${s.name} `, el('b', {text: (o.fmt || pn)(s.vals[i])}),
        ok(d) && Math.abs(d) > 1e-9 ? el('span', {class: 'note', text: ` (${d > 0 ? '+' : '−'}${(o.fmt || pn)(Math.abs(d))} vs previous)`}) : null);
    });
    const refs = (o.refs || []).filter((r) => ok(r.v)).map((r) => el('span', {class: 'note', text: `${r.label} ${(o.fmt || pn)(r.v)}`}));
    const pick = o.onPick || (o.noOpen ? null : openDayAny);
    out.replaceChildren(...[el('b', {text: ptLabel(o, i)}), ...(parts.length ? parts : [el('span', {text: 'no figure'})]), ...refs,
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
    const x = (e.clientX - r.left) * (f.W / r.width), step = n > 1 ? (f.W - f.L - f.R) / (n - 1) : 1;
    return Math.max(0, Math.min(n - 1, Math.round((x - f.L) / step)));
  };
  const show = (i) => { if (i < 0) return; guide.setAttribute('x1', X(i)); guide.setAttribute('x2', X(i)); guide.style.display = ''; R.show(i); };
  hit.addEventListener('pointermove', (e) => show(at(e)));
  hit.addEventListener('click', (e) => show(at(e)));
  box.append(R.out);
}
// "Open this day" where a chart has no day view of its own: Costing opens the day on Costing; elsewhere the app's day picker.
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
  const n = o.dates.length, win = Math.min(n, o.pan || n), scrolls = n > win, AX = 48, R = 24, T = 18, B = 34, PADL = 12;
  const vals = o.series.flatMap((s) => s.vals).filter(ok).concat((o.refs || []).map((r) => r.v).filter(ok));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const [a, b, ticks] = o.max != null ? [0, o.max, [0, o.max / 2, o.max]] : niceRange(o.zero ? Math.min(0, lo) : lo, hi);
  const wrap = el('div', {class: 'panbox'}), axis = el('div', {class: 'panaxis'}), sc = el('div', {class: 'panscroll' + (scrolls ? '' : ' still')});
  const prevB = el('button', {type: 'button', class: 'ghost', text: '‹ Earlier'}), nextB = el('button', {type: 'button', class: 'ghost', text: 'Later ›'});
  const pinfo = el('span', {class: 'note'}), RO = o.noread ? null : readoutBar(o);
  // back: how many points the view sits before the latest one (0 = at the end). Kept from the last scroll, so a redraw at a
  // new width keeps the same days in view.
  let W = 0, step = 0, back = 0, busy = false;
  const draw = (cw) => {
    cw = Math.max(260, Math.round(cw)); if (Math.abs(cw - W) < 4) return;
    W = cw; busy = true;
    const H = Math.round(Math.max(200, Math.min(o.h || 230, cw * (o.h || 230) / (o.w || 680))));
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
    }
    plotMarks(svg, o, X, T, H - B, PW);
    plotSeries(svg, o, X, Y, false, PW);
    if (RO) {
      const guide = svgEl('line', {y1: T, y2: H - B, style: 'stroke:var(--muted);stroke-width:1;stroke-dasharray:2 3;display:none'});
      const hit = svgEl('rect', {x: 0, y: T, width: PW, height: Math.max(1, H - T - B), style: 'fill:transparent;cursor:crosshair'});
      const at = (e) => { const r = svg.getBoundingClientRect(); return r.width ? Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) * PW / r.width - PADL) / step))) : -1; };
      const sh = (e) => { if (dragged) return; const i = at(e); if (i < 0) return; guide.setAttribute('x1', X(i)); guide.setAttribute('x2', X(i)); guide.style.display = ''; RO.show(i); };
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
  return el('div', {class: 'tablebox'}, scrolls ? el('div', {class: 'toolbar panbar'}, prevB, nextB, pinfo) : null, el('div', {class: 'panrow'}, axis, sc), wrap, RO ? RO.out : null, legend(o.series));
}
// Line chart whose legend is a row of toggle boxes. series: {key, name, vals, color, dash, off (reason it cannot be shown)}.
// One or several boxes can be on; the chart draws only those. defaults: keys switched on when the page opens.
function toggleChart(id, o, defaults) {
  if (!TOGS[id]) TOGS[id] = new Set(defaults);
  const on = TOGS[id], cols = {};
  o.series.forEach((s, i) => { cols[s.key] = s.color || CC[i % CC.length]; });
  const avail = (s) => !s.off && s.vals.some(ok);
  const boxes = el('div', {class: 'togs', role: 'group', 'aria-label': 'Series shown'}, o.series.map((s) => {
    const can = avail(s), pressed = can && on.has(s.key);
    return el('button', {type: 'button', class: 'tog', 'aria-pressed': pressed ? 'true' : 'false', disabled: can ? null : true,
      title: can ? (pressed ? 'Hide ' : 'Show ') + s.name : (s.off || 'Not available for this period'),
      onclick: (e) => { if (on.has(s.key)) on.delete(s.key); else on.add(s.key); if (e.currentTarget.closest('dialog')) drawPanel(true); else render(); }},
      el('i', {style: `background:${cols[s.key]};${s.dash ? `background:repeating-linear-gradient(90deg,${cols[s.key]} 0 4px,transparent 4px 7px);` : ''}`}), s.name);
  }));
  const shown = o.series.filter((s) => avail(s) && on.has(s.key)).map((s) => ({...s, color: cols[s.key]}));
  const notes = o.series.filter((s) => s.off).map((s) => el('p', {class: 'note', text: `${s.name}: ${s.off}`}));
  const chart = shown.length ? lineChart({...o, series: shown, plain: true}) : el('div', {class: 'empty', text: 'Switch on at least one box above to draw the chart.'});
  if (chart.querySelector && chart.querySelector('.legend')) chart.querySelector('.legend').remove();
  return el('div', {}, boxes, chart, ...notes);
}
function legend(series) {
  if (series.length < 2) return null;
  return el('div', {class: 'legend'}, series.map((s, i) => el('span', {class: 'lg'}, el('i', {style: `display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:${s.color || CC[i % CC.length]}`}), s.name)));
}
// o (optional): {unit (in the hover text, default paise), dec (decimals on the bars)}
function waterfall(items, aria, Wd, o = {}) {
  // items: {label, v, total}. Totals are full bars from zero (axis cut to the data); deltas float.
  let run = 0, lo = Infinity, hi = -Infinity;
  const bars = items.map((it) => {
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
    const col = b.total ? 'var(--muted-2)' : (o.flip ? b.v < 0 : b.v > 0) ? 'var(--bad)' : 'var(--good)';
    if (i < bars.length - 1) { const lv = b.total ? b.v : b.b, nx = L + slot * (i + 1) + slot / 2; svg.append(svgEl('line', {x1: cx + bw / 2, x2: nx - bw / 2, y1: Y(lv), y2: Y(lv), style: 'stroke:var(--muted);stroke-width:1;stroke-dasharray:3 2'})); }
    const r = svgEl('rect', {x: cx - bw / 2, y: b.total ? Y(b.v) : y1, width: bw, height: Math.max(2, b.total ? Y(a0) - Y(b.v) : y2 - y1), style: `fill:${col};opacity:${b.total ? 0.75 : 1}`});
    const tt = svgEl('title'); tt.textContent = b.tip || `${b.label}: ${b.total ? pn(b.v, 2) : sg(b.v)} ${unit}`; r.append(tt); svg.append(r);
    const t = svgEl('text', {x: cx, y: (b.total ? Y(b.v) : y1) - 5, 'text-anchor': 'middle', style: 'fill:var(--ink);font-size:11px;font-weight:600'}); t.textContent = b.total ? pn(b.v, dec) : sg(b.v); svg.append(t);
    const words = b.label.length > 11 && b.label.includes(' ') ? [b.label.slice(0, b.label.lastIndexOf(' ', 11) > 0 ? b.label.lastIndexOf(' ', 11) : b.label.indexOf(' ')), b.label.slice((b.label.lastIndexOf(' ', 11) > 0 ? b.label.lastIndexOf(' ', 11) : b.label.indexOf(' ')) + 1)] : [b.label];
    words.forEach((w, k) => { const lt = svgEl('text', {x: cx, y: H - B + 16 + k * 13, 'text-anchor': 'middle', style: 'fill:var(--muted);font-size:10.5px'}); lt.textContent = w.length > 14 ? w.slice(0, 13) + '…' : w; svg.append(lt); });
  });
  return el('div', {class: 'tablebox'}, svg);
}
