// Tiny SVG line chart. No library. Colors come from CSS variables, so Light and
// Dark Mode just work. Touch or drag across the chart to read any point.
import { h } from './ui.js';
import { roundTo } from './logic.js';

export function niceTicks(min, max, count = 3) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(roundTo(v, 6));
  return ticks;
}

const axisLabel = (v) => (Math.abs(v) >= 10000 ? roundTo(v / 1000, 1) + 'k' : String(roundTo(v, 1)));
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dayYearFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * cfg.series: [{ points: [{ t: ms, v: number }], muted?: bool, dots?: bool }]
 *   The first series is the one you inspect by touch; muted series are drawn thin behind it.
 * cfg.format(v): value text for the readout.  cfg.label: accessible name.  cfg.emptyText.
 */
export function drawChart(el, cfg) {
  const { series, format = (v) => String(v), label = 'Chart', emptyText = 'No data yet' } = cfg;
  const all = series.flatMap((s) => s.points);
  el.replaceChildren();
  if (!all.length) { el.append(h('div', { class: 'chart-empty' }, emptyText)); return; }

  const W = Math.max(240, Math.round(el.clientWidth) || 340);
  const H = 190, L = 6, R = 44, T = 10, B = 26;
  const tMin = Math.min(...all.map((p) => p.t));
  const tMax = Math.max(...all.map((p) => p.t));
  let vMin = Math.min(...all.map((p) => p.v));
  let vMax = Math.max(...all.map((p) => p.v));
  if (vMin === vMax) { const pad = Math.abs(vMin) * 0.05 || 1; vMin -= pad; vMax += pad; }
  const ticks = niceTicks(vMin, vMax);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const x = (t) => (tMin === tMax ? L + (W - L - R) / 2 : L + ((t - tMin) / (tMax - tMin)) * (W - L - R));
  const y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const n = (v) => roundTo(v, 1);

  let svg = '';
  for (const tick of ticks) {
    svg += `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${n(y(tick))}" y2="${n(y(tick))}"/>` +
      `<text class="c-axis" x="${W - R + 7}" y="${n(y(tick) + 4)}">${axisLabel(tick)}</text>`;
  }
  // back to front: muted series first, main series on top
  for (const s of series.slice().reverse()) {
    const cls = s.muted ? 'muted' : 'main';
    if (s.points.length > 1 && !s.muted) {
      svg += `<path class="c-line ${cls}" d="${s.points.map((p, i) => `${i ? 'L' : 'M'}${n(x(p.t))} ${n(y(p.v))}`).join(' ')}"/>`;
    }
    if (s.muted || s.points.length === 1 || (s.dots !== false && s.points.length <= 40)) {
      const r = s.muted ? 2.2 : s.points.length === 1 ? 4.5 : 3;
      svg += s.points.map((p) => `<circle class="c-dot ${cls}" cx="${n(x(p.t))}" cy="${n(y(p.v))}" r="${r}"/>`).join('');
    }
  }
  const spanYears = new Date(tMin).getFullYear() !== new Date(tMax).getFullYear();
  const xf = spanYears ? dayYearFmt : dayFmt;
  if (tMin === tMax) {
    svg += `<text class="c-axis" text-anchor="middle" x="${n(x(tMin))}" y="${H - 6}">${xf.format(new Date(tMin))}</text>`;
  } else {
    svg += `<text class="c-axis" x="${L}" y="${H - 6}">${xf.format(new Date(tMin))}</text>` +
      `<text class="c-axis" text-anchor="end" x="${W - R}" y="${H - 6}">${xf.format(new Date(tMax))}</text>`;
  }
  svg += `<line class="c-cursor" y1="${T}" y2="${H - B}" x1="0" x2="0" visibility="hidden"/>` +
    `<circle class="c-marker" r="5.5" cx="0" cy="0" visibility="hidden"/>`;

  const main = series[0].points;
  const last = main[main.length - 1];
  const value = h('strong', {}, '');
  const when = h('span', {}, '');
  const readout = h('div', { class: 'chart-readout', 'aria-hidden': 'true' }, value, when);
  const holder = h('div', { class: 'chart-svg' });
  holder.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img">${svg}</svg>`;
  const svgEl = holder.firstChild;
  svgEl.setAttribute('aria-label', main.length
    ? `${label}. ${main.length} ${main.length === 1 ? 'point' : 'points'}. Latest ${format(last.v)} on ${dayYearFmt.format(new Date(last.t))}.`
    : label);
  el.append(readout, holder);
  if (!main.length) return;

  const cursor = svgEl.querySelector('.c-cursor');
  const marker = svgEl.querySelector('.c-marker');
  const show = (p, active) => {
    value.textContent = format(p.v);
    when.textContent = dayYearFmt.format(new Date(p.t));
    for (const node of [cursor, marker]) node.setAttribute('visibility', active ? 'visible' : 'hidden');
    cursor.setAttribute('x1', n(x(p.t))); cursor.setAttribute('x2', n(x(p.t)));
    marker.setAttribute('cx', n(x(p.t))); marker.setAttribute('cy', n(y(p.v)));
  };
  show(last, false);
  const pick = (e) => {
    const rect = svgEl.getBoundingClientRect();
    const px = ((e.clientX - rect.left) * W) / rect.width;
    let best = main[0];
    for (const p of main) if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p;
    show(best, true);
  };
  svgEl.addEventListener('pointerdown', pick);
  svgEl.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons || e.pressure > 0) pick(e); });
  svgEl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') show(last, false); });
}
