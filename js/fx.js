import { createParticles, stepParticle } from './particles.js';
import { createCelebration } from './celebration.js';
import { easeOutCubic } from './charts.js';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Full-viewport ambient particle field. Returns a stop function. */
export function startParticleField(canvas) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return () => {};
  let width = 0;
  let height = 0;
  let particles = [];
  let mouse = null;
  let raf = 0;
  let last = 0;
  let slowFrames = 0;
  let skip = false;
  let flip = false;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextW = window.innerWidth;
    const nextH = window.innerHeight;
    canvas.width = Math.round(nextW * dpr);
    canvas.height = Math.round(nextH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!particles.length) {
      particles = createParticles({ width: nextW, height: nextH });
    } else if (width && height) {
      particles = particles.map((p) => ({ ...p, x: (p.x / width) * nextW, y: (p.y / height) * nextH }));
    }
    width = nextW;
    height = nextH;
  };

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
  };

  const loop = (time) => {
    raf = requestAnimationFrame(loop);
    const dt = last ? time - last : 16;
    last = time;
    slowFrames = dt > 34 ? Math.min(slowFrames + 1, 30) : Math.max(slowFrames - 1, 0);
    skip = slowFrames > 10;
    flip = !flip;
    const bounds = { width, height };
    for (let i = 0; i < particles.length; i += 1) {
      const next = stepParticle(particles[i], bounds, mouse);
      // Mouse push decays so particles drift back to their own slow velocity.
      const base = particles[i].base ?? { vx: particles[i].vx, vy: particles[i].vy };
      next.vx = base.vx + (next.vx - base.vx) * 0.92;
      next.vy = base.vy + (next.vy - base.vy) * 0.92;
      next.base = base;
      particles[i] = next;
    }
    if (skip && flip) return;
    draw();
  };

  const onMove = (event) => {
    mouse = { x: event.clientX, y: event.clientY };
  };
  const onLeave = () => {
    mouse = null;
  };
  const onVisibility = () => {
    cancelAnimationFrame(raf);
    last = 0;
    if (!document.hidden && !reducedMotion()) raf = requestAnimationFrame(loop);
  };

  resize();
  draw();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  document.addEventListener('visibilitychange', onVisibility);
  if (!reducedMotion()) raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** Confetti burst with gravity, launched from a viewport point. Cleans itself up after 2s. */
export function burst(layer, origin) {
  if (!layer || reducedMotion()) return;
  const pieces = createCelebration(origin).map((piece) => {
    const el = document.createElement('span');
    el.className = `confetti ${piece.shape}`;
    el.style.width = `${piece.size}px`;
    el.style.height = `${piece.size}px`;
    el.style.background = piece.color;
    layer.append(el);
    return { ...piece, vx: piece.vx * 1.6, vy: piece.vy * 2.1, spin: (Math.random() - 0.5) * 18, angle: 0, el };
  });
  const start = performance.now();
  let last = start;
  const tick = (time) => {
    const elapsed = time - start;
    const dt = Math.min(2.5, (time - last) / 16.67);
    last = time;
    const fade = elapsed > 1300 ? Math.max(0, 1 - (elapsed - 1300) / 700) : 1;
    for (const p of pieces) {
      p.vy += 0.32 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.angle}deg)`;
      p.el.style.opacity = String(fade);
    }
    if (elapsed < 2000) requestAnimationFrame(tick);
    else pieces.forEach((p) => p.el.remove());
  };
  requestAnimationFrame(tick);
}

/** Counts a number from `from` to `to` over 1s with easeOutCubic. */
export function countUp(el, from, to, format, duration = 1000) {
  if (reducedMotion() || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (time) => {
    const t = Math.min(1, (time - start) / duration);
    el.textContent = format(from + (to - from) * easeOutCubic(t));
    if (t < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = format(from);
  requestAnimationFrame(step);
}
