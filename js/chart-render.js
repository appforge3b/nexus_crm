import { easeOutCubic } from './charts.js';
import { esc } from './markup.js';
import { formatMediumDate } from './format.js';

const DURATION = 800;
const FONT = '500 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
const MUTED = '#64748b';
const SECONDARY = '#94a3b8';
const GRID = 'rgba(255, 255, 255, 0.05)';
const INDIGO = '#6366f1';
const VIOLET = '#8b5cf6';
const EMERALD = '#10b981';
const RED = '#ef4444';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function niceMax(value) {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Monotone cubic interpolation (Fritsch–Carlson) so curves never overshoot below zero. */
function monotone(ctx, points, moveFirst = true) {
  const n = points.length;
  if (!n) return;
  if (moveFirst) ctx.moveTo(points[0].x, points[0].y);
  else ctx.lineTo(points[0].x, points[0].y);
  if (n === 1) return;
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = points[i + 1].x - points[i].x;
    slope[i] = dx[i] ? (points[i + 1].y - points[i].y) / dx[i] : 0;
  }
  const tangent = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      tangent[i] = tau * a * slope[i];
      tangent[i + 1] = tau * b * slope[i];
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3;
    ctx.bezierCurveTo(
      points[i].x + third, points[i].y + tangent[i] * third,
      points[i + 1].x - third, points[i + 1].y - tangent[i + 1] * third,
      points[i + 1].x, points[i + 1].y,
    );
  }
}

function setup(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

export function showTooltip(el, html, x, y) {
  if (!el) return;
  el.innerHTML = html;
  el.dataset.visible = 'true';
  const box = el.getBoundingClientRect();
  const left = clamp(x + 14, 8, window.innerWidth - box.width - 8);
  const top = y - box.height - 12 < 8 ? y + 16 : y - box.height - 12;
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

export function hideTooltip(el) {
  if (el) el.dataset.visible = 'false';
}

/**
 * Paints `draw` onto the canvas, easing from 0→1 over 800ms when `animate` is set,
 * and wires hover hit-testing to a shared DOM tooltip.
 */
export function mountChart(canvas, draw, model, { animate = true, tooltip = null, format = String } = {}) {
  if (!canvas?.getContext) return;
  canvas._chart?.cancel?.();
  const state = { hits: [], hover: -1, raf: 0, done: false };
  const paint = (progress) => {
    const { ctx, width, height } = setup(canvas);
    ctx.clearRect(0, 0, width, height);
    state.hits = draw(ctx, { width, height, model, progress, format, hover: state.hover }) || [];
  };
  state.cancel = () => cancelAnimationFrame(state.raf);
  state.repaint = () => paint(1);
  if (animate && !reducedMotion()) {
    const start = performance.now();
    const step = (time) => {
      const raw = clamp((time - start) / DURATION, 0, 1);
      paint(easeOutCubic(raw));
      if (raw < 1 && canvas.isConnected) state.raf = requestAnimationFrame(step);
      else state.done = true;
    };
    paint(0);
    state.raf = requestAnimationFrame(step);
  } else {
    paint(1);
    state.done = true;
  }
  if (tooltip) {
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = state.hits.find((item) => item.test(x, y));
      const index = hit ? hit.index : -1;
      if (index !== state.hover) {
        state.hover = index;
        if (state.done) paint(1);
      }
      canvas.style.cursor = hit ? 'pointer' : '';
      if (hit) showTooltip(tooltip, hit.html, event.clientX, event.clientY);
      else hideTooltip(tooltip);
    });
    canvas.addEventListener('mouseleave', () => {
      state.hover = -1;
      if (state.done) paint(1);
      hideTooltip(tooltip);
    });
  }
  canvas._chart = state;
}

function emptyState(ctx, width, height, text) {
  ctx.fillStyle = MUTED;
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
}

export function drawForecast(ctx, { width, height, model, progress, format, hover }) {
  const points = model.points ?? [];
  if (!points.length) return [];
  const pad = { l: 56, r: 18, t: 18, b: 30 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...points.map((p) => Math.max(p.high, p.value))) * 1.08);
  const step = points.length > 1 ? plotW / (points.length - 1) : plotW;
  const x = (i) => pad.l + (points.length > 1 ? i * step : plotW / 2);
  const y = (v) => pad.t + plotH - (v / max) * plotH;
  const split = points.findIndex((p) => p.forecast);

  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i += 1) {
    const value = (max * i) / 4;
    const yy = Math.round(y(value)) + 0.5;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, yy);
    ctx.lineTo(width - pad.r, yy);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText(format(value), pad.l - 10, yy);
  }
  points.forEach((point, i) => {
    ctx.fillStyle = i === hover ? '#f1f5f9' : point.forecast ? '#7c83c9' : MUTED;
    ctx.textAlign = 'center';
    ctx.fillText(point.label, x(i), height - 12);
  });

  if (split > 0) {
    const sx = x(split) - step / 2;
    const zone = ctx.createLinearGradient(sx, 0, width, 0);
    zone.addColorStop(0, 'rgba(139, 92, 246, 0.07)');
    zone.addColorStop(1, 'rgba(139, 92, 246, 0.01)');
    ctx.fillStyle = zone;
    ctx.fillRect(sx, pad.t, width - pad.r - sx, plotH);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.45)';
    ctx.beginPath();
    ctx.moveTo(Math.round(sx) + 0.5, pad.t);
    ctx.lineTo(Math.round(sx) + 0.5, pad.t + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#a5b4fc';
    ctx.textAlign = 'left';
    ctx.fillText('FORECAST', sx + 8, pad.t + 8);
  }

  const coords = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const past = split < 0 ? coords : coords.slice(0, split + 1);
  const future = split < 0 ? [] : coords.slice(Math.max(0, split - 1));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, pad.l + (plotW + pad.r) * progress, height);
  ctx.clip();

  if (future.length > 1) {
    const from = Math.max(0, split - 1);
    const high = points.slice(from).map((p, i) => ({ x: x(from + i), y: y(p.high) }));
    const low = points.slice(from).map((p, i) => ({ x: x(from + i), y: y(p.low) })).reverse();
    ctx.beginPath();
    monotone(ctx, high);
    monotone(ctx, low, false);
    ctx.closePath();
    ctx.fillStyle = `rgba(139, 92, 246, ${0.16 * progress})`;
    ctx.fill();
  }

  const fill = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
  fill.addColorStop(0, `rgba(99, 102, 241, ${0.5 * progress})`);
  fill.addColorStop(1, 'rgba(99, 102, 241, 0)');
  if (past.length > 1) {
    ctx.beginPath();
    monotone(ctx, past);
    ctx.lineTo(past.at(-1).x, pad.t + plotH);
    ctx.lineTo(past[0].x, pad.t + plotH);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (future.length > 1) {
    const ghost = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
    ghost.addColorStop(0, `rgba(139, 92, 246, ${0.28 * progress})`);
    ghost.addColorStop(1, 'rgba(139, 92, 246, 0)');
    ctx.beginPath();
    monotone(ctx, future);
    ctx.lineTo(future.at(-1).x, pad.t + plotH);
    ctx.lineTo(future[0].x, pad.t + plotH);
    ctx.closePath();
    ctx.fillStyle = ghost;
    ctx.fill();
  }

  const stroke = ctx.createLinearGradient(pad.l, 0, width - pad.r, 0);
  stroke.addColorStop(0, INDIGO);
  stroke.addColorStop(1, VIOLET);
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(99, 102, 241, 0.6)';
  ctx.shadowBlur = 14;
  if (past.length > 1) {
    ctx.beginPath();
    monotone(ctx, past);
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
  if (future.length > 1) {
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    monotone(ctx, future);
    ctx.strokeStyle = '#a78bfa';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.shadowBlur = 0;

  coords.forEach((c, i) => {
    const active = i === hover;
    ctx.beginPath();
    ctx.arc(c.x, c.y, active ? 5.5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0f';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = points[i].forecast ? '#a78bfa' : '#818cf8';
    ctx.stroke();
    if (active) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(129, 140, 248, 0.18)';
      ctx.fill();
    }
  });
  ctx.restore();

  if (hover >= 0 && coords[hover]) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(Math.round(coords[hover].x) + 0.5, pad.t);
    ctx.lineTo(Math.round(coords[hover].x) + 0.5, pad.t + plotH);
    ctx.stroke();
  }

  return points.map((point, i) => ({
    index: i,
    test: (px, py) => py >= pad.t - 6 && py <= height && Math.abs(px - x(i)) <= Math.max(step / 2, 8),
    html: point.forecast
      ? `<strong>${esc(point.title)} · forecast</strong><span>${esc(format(point.value))} weighted</span><span class="tip-muted">Range ${esc(format(point.low))} – ${esc(format(point.high))}</span>`
      : `<strong>${esc(point.title)}</strong><span>${esc(format(point.value))} won</span>`,
  }));
}

function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(', ')})`;
}

export function drawFunnel(ctx, { width, height, model, progress, format, hover }) {
  const stages = model.stages ?? [];
  if (!stages.length || !stages[0].count) {
    emptyState(ctx, width, height, 'No deals in this range yet');
    return [];
  }
  const n = stages.length;
  const labelW = Math.min(112, width * 0.26);
  const top = 4;
  const rowH = (height - top * 2) / n;
  const gap = 5;
  const areaW = width - labelW - 8;
  const cx = labelW + areaW / 2;
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const minW = areaW * 0.14;
  const maxW = areaW * 0.98;
  const widthFor = (count) => minW + (maxW - minW) * (count / maxCount);
  const hits = [];
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  stages.forEach((stage, i) => {
    const y0 = top + i * rowH;
    const y1 = y0 + rowH - gap;
    const mid = (y0 + y1) / 2;
    ctx.fillStyle = i === hover ? '#f1f5f9' : SECONDARY;
    ctx.textAlign = 'left';
    ctx.fillText(stage.label, 2, mid);
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y1 + gap / 2) + 0.5);
    ctx.lineTo(labelW - 10, Math.round(y1 + gap / 2) + 0.5);
    ctx.stroke();

    const appear = clamp(progress * n - i, 0, 1);
    if (appear > 0) {
      const topW = widthFor(stage.count) * appear;
      const next = stages[i + 1];
      const botW = (next ? widthFor(next.count) : widthFor(stage.count) * 0.82) * appear;
      const t = n > 1 ? i / (n - 1) : 0;
      const color = mix('6366f1', 'a78bfa', t);
      const grad = ctx.createLinearGradient(cx - topW / 2, 0, cx + topW / 2, 0);
      grad.addColorStop(0, color);
      grad.addColorStop(0.5, mix('818cf8', 'c4b5fd', t));
      grad.addColorStop(1, color);
      ctx.globalAlpha = (i === hover ? 1 : 0.86) * appear;
      if (i === hover) {
        ctx.shadowColor = 'rgba(139, 92, 246, 0.7)';
        ctx.shadowBlur = 18;
      }
      ctx.beginPath();
      ctx.moveTo(cx - topW / 2, y0);
      ctx.lineTo(cx + topW / 2, y0);
      ctx.lineTo(cx + botW / 2, y1);
      ctx.lineTo(cx - botW / 2, y1);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = appear;
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 12px Inter, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${stage.percent}%`, cx, mid);
      ctx.font = FONT;
      ctx.globalAlpha = 1;
    }
    hits.push({
      index: i,
      test: (px, py) => py >= y0 && py <= y1 + gap,
      html: `<strong>${esc(stage.label)}</strong><span>${stage.count} ${stage.count === 1 ? 'deal' : 'deals'} · ${esc(format(stage.value))}</span><span class="tip-muted">${stage.percent}% of prospects reached this stage</span>`,
    });
  });
  return hits;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HEAT = ['rgba(255, 255, 255, 0.045)', 'rgba(16, 185, 129, 0.28)', 'rgba(16, 185, 129, 0.5)', 'rgba(16, 185, 129, 0.75)', '#10b981'];

export function drawHeatmap(ctx, { width, height, model, progress, format, hover }) {
  const days = model.days ?? [];
  if (!days.length) return [];
  const left = 32;
  const bottom = 26;
  const weeks = Math.ceil(days.length / 7);
  const cell = Math.max(5, Math.min((width - left - 4) / weeks, (height - 20 - bottom) / 7));
  const top = 20 + Math.max(0, (height - 20 - bottom - 7 * cell) / 2);
  const gap = Math.max(2, cell * 0.2);
  const size = cell - gap;
  const ox = left + Math.max(0, (width - left - 4 - weeks * cell) / 2);
  const hits = [];
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  [['Mon', 1], ['Wed', 3], ['Fri', 5]].forEach(([label, row]) => ctx.fillText(label, ox - left, top + row * cell + size / 2));

  days.forEach((day, index) => {
    const col = Math.floor(index / 7);
    const row = index % 7;
    const x = ox + col * cell;
    const y = top + row * cell;
    if (day.date.endsWith('-01') || (index === 0)) {
      const month = Number(day.date.slice(5, 7)) - 1;
      if (index !== 0 || Number(day.date.slice(8)) <= 7) {
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'left';
        ctx.fillText(MONTHS[month], x, top - 12);
      }
    }
    const appear = clamp((progress - (col / weeks) * 0.55) / 0.45, 0, 1);
    const level = day.value > 0 && model.max > 0 ? clamp(Math.ceil((day.value / model.max) * 4), 1, 4) : 0;
    ctx.globalAlpha = appear * (day.inRange ? 1 : 0.35);
    if (level === 4 || index === hover) {
      ctx.shadowColor = 'rgba(16, 185, 129, 0.7)';
      ctx.shadowBlur = index === hover ? 14 : 8;
    }
    roundRect(ctx, x, y, size, size, Math.min(3, size / 4));
    ctx.fillStyle = HEAT[level];
    ctx.fill();
    if (index === hover) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    hits.push({
      index,
      test: (px, py) => px >= x && px <= x + size && py >= y && py <= y + size,
      html: `<strong>${esc(formatMediumDate(day.date))}</strong><span>${day.value ? `${esc(format(day.value))} won` : 'No wins'}</span>`,
    });
  });

  const legendY = height - 10;
  let lx = width - 4 - HEAT.length * 14 - 32;
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.fillText('Less', lx - 6, legendY);
  HEAT.forEach((color) => {
    roundRect(ctx, lx, legendY - 5, 10, 10, 2);
    ctx.fillStyle = color;
    ctx.fill();
    lx += 14;
  });
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.fillText('More', lx + 2, legendY);
  return hits;
}

export function drawVelocity(ctx, { width, height, model, progress, hover }) {
  const rows = model.rows ?? [];
  if (!rows.some((row) => row.days > 0)) {
    emptyState(ctx, width, height, 'Not enough stage movement yet');
    return [];
  }
  const labelW = 96;
  const right = 64;
  const top = 6;
  const bottom = 24;
  const plotW = width - labelW - right;
  const rowH = (height - top - bottom) / rows.length;
  const barH = Math.min(18, rowH * 0.58);
  const max = niceMax(Math.max(...rows.map((row) => row.days)) * 1.05);
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 5; i += 1) {
    const gx = Math.round(labelW + (plotW * i) / 5) + 0.5;
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(gx, top);
    ctx.lineTo(gx, height - bottom + 2);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'center';
    const tick = (max * i) / 5;
    ctx.fillText(Number.isInteger(tick) ? String(tick) : tick.toFixed(1), gx, height - 10);
  }
  return rows.map((row, i) => {
    const cy = top + i * rowH + rowH / 2;
    ctx.fillStyle = i === hover ? '#f1f5f9' : SECONDARY;
    ctx.textAlign = 'right';
    ctx.fillText(row.label, labelW - 12, cy);
    const w = Math.max(row.days > 0 ? 4 : 0, (row.days / max) * plotW * progress);
    const grad = ctx.createLinearGradient(labelW, 0, labelW + Math.max(w, 1), 0);
    grad.addColorStop(0, INDIGO);
    grad.addColorStop(1, VIOLET);
    if (i === hover) {
      ctx.shadowColor = 'rgba(139, 92, 246, 0.7)';
      ctx.shadowBlur = 16;
    }
    roundRect(ctx, labelW, cy - barH / 2, w, barH, 5);
    ctx.fillStyle = grad;
    ctx.globalAlpha = i === hover ? 1 : 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    const label = `${row.days < 10 ? row.days.toFixed(1) : Math.round(row.days)} days`;
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'left';
    ctx.globalAlpha = progress;
    ctx.fillText(label, labelW + w + 8, cy);
    ctx.globalAlpha = 1;
    return {
      index: i,
      test: (px, py) => Math.abs(py - cy) <= rowH / 2,
      html: `<strong>${esc(row.label)}</strong><span>${row.days.toFixed(1)} days on average</span><span class="tip-muted">${row.samples} ${row.samples === 1 ? 'deal' : 'deals'} measured</span>`,
    };
  });
}

export function drawDonut(ctx, { width, height, model, progress, format, hover }) {
  const { wonCount = 0, lostCount = 0, wonValue = 0, lostValue = 0 } = model;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(10, Math.min(width, height) / 2 - 18);
  const thickness = Math.max(14, radius * 0.24);
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.stroke();
  const total = wonCount + lostCount;
  if (!total) return [];
  const start = -Math.PI / 2;
  const full = Math.PI * 2 * progress;
  const wonA = (wonCount / total) * full;
  const lostA = (lostCount / total) * full;
  const gap = wonCount && lostCount ? 0.035 : 0;
  const segments = [
    { from: start, to: start + wonA, colors: ['#34d399', '#059669'], glow: 'rgba(16, 185, 129, 0.55)' },
    { from: start + wonA, to: start + wonA + lostA, colors: ['#f87171', '#dc2626'], glow: 'rgba(239, 68, 68, 0.5)' },
  ];
  segments.forEach((seg, i) => {
    if (seg.to - seg.from <= gap * 2) return;
    const grad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    grad.addColorStop(0, seg.colors[0]);
    grad.addColorStop(1, seg.colors[1]);
    ctx.shadowColor = seg.glow;
    ctx.shadowBlur = i === hover ? 22 : 12;
    ctx.lineWidth = i === hover ? thickness + 4 : thickness;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, seg.from + gap, seg.to - gap);
    ctx.strokeStyle = grad;
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
  if (wonA > 0.05) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius + thickness / 2 + 7, start + 0.02, start + wonA - 0.02);
    ctx.stroke();
  }
  const inner = radius - thickness / 2 - 6;
  const outer = radius + thickness / 2 + 6;
  const hit = (index, from, to) => (px, py) => {
    const dist = Math.hypot(px - cx, py - cy);
    if (dist < inner || dist > outer) return false;
    let angle = Math.atan2(py - cy, px - cx);
    while (angle < start) angle += Math.PI * 2;
    return angle >= from && angle <= to;
  };
  return [
    { index: 0, test: hit(0, start, start + wonA), html: `<strong>Won</strong><span>${wonCount} ${wonCount === 1 ? 'deal' : 'deals'} · ${esc(format(wonValue))}</span>` },
    { index: 1, test: hit(1, start + wonA, start + wonA + lostA), html: `<strong>Lost</strong><span>${lostCount} ${lostCount === 1 ? 'deal' : 'deals'} · ${esc(format(lostValue))}</span>` },
  ];
}

export function drawSparkline(ctx, { width, height, model, progress }) {
  const values = model.values ?? [];
  const pad = 2;
  if (values.length < 2) {
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, height - pad - 1);
    ctx.lineTo(width - pad, height - pad - 1);
    ctx.stroke();
    return [];
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((value, i) => ({
    x: pad + (i / (values.length - 1)) * (width - pad * 2),
    y: height - pad - ((value - min) / span) * (height - pad * 2),
  }));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width * progress, height);
  ctx.clip();
  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
  fill.addColorStop(1, 'rgba(16, 185, 129, 0)');
  ctx.beginPath();
  monotone(ctx, points);
  ctx.lineTo(points.at(-1).x, height);
  ctx.lineTo(points[0].x, height);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  monotone(ctx, points);
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = 'rgba(16, 185, 129, 0.6)';
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.restore();
  return [];
}

export const DRAWERS = {
  forecast: drawForecast,
  funnel: drawFunnel,
  heatmap: drawHeatmap,
  velocity: drawVelocity,
  winloss: drawDonut,
  sparkline: drawSparkline,
};

