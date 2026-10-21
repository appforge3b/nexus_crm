import { describe, expect, it } from 'vitest';
import { barScale, donutAngles, easeOutCubic, normalizeArea, winLossModel } from '../../js/charts.js';
import { createParticles, stepParticle } from '../../js/particles.js';
import { createCelebration } from '../../js/celebration.js';
import { at } from '../helpers/time.js';

describe('chart geometry', () => {
  it('eases with easeOutCubic and scales bars and area points from zero', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(barScale([0, 10, 5], 100)).toEqual([0, 100, 50]);
    expect(barScale([0, 0], 100)).toEqual([0, 0]);
    expect(normalizeArea([0, 10, 5])).toEqual([0, 1, 0.5]);
    expect(normalizeArea([0, 0])).toEqual([0, 0]);
  });

  it('turns win and loss counts into donut angles and a rounded rate', () => {
    expect(donutAngles(0, 0)).toEqual({ won: 0, lost: 0 });
    expect(donutAngles(3, 1)).toEqual({ won: 270, lost: 90 });
    const now = at(2026, 10, 21, 12);
    const summary = winLossModel([
      { stage: 'won', value: 80, stageChangedAt: now.toISOString() },
      { stage: 'won', value: 20, stageChangedAt: now.toISOString() },
      { stage: 'lost', value: 25, stageChangedAt: now.toISOString() },
      { stage: 'prospect', value: 999, stageChangedAt: now.toISOString() },
    ], { start: null, end: null });
    expect(summary).toMatchObject({ wonCount: 2, lostCount: 1, wonValue: 100, lostValue: 25, winRate: 67 });
  });
});

describe('particle field', () => {
  it('creates a field of 60 to 100 faint indigo particles that wrap and drift off the cursor', () => {
    const random = () => 0.5;
    const particles = createParticles({ width: 200, height: 100, random });
    expect(particles.length).toBeGreaterThanOrEqual(60);
    expect(particles.length).toBeLessThanOrEqual(100);
    for (const particle of particles) {
      expect(particle.r).toBeGreaterThanOrEqual(1);
      expect(particle.r).toBeLessThanOrEqual(3);
      const speed = Math.hypot(particle.vx, particle.vy);
      expect(speed).toBeGreaterThanOrEqual(0.1);
      expect(speed).toBeLessThanOrEqual(0.5);
      expect(particle.color).toBe('rgba(99, 102, 241, 0.15)');
    }

    const wrapped = stepParticle({ x: -1, y: 10, vx: -0.2, vy: 0.1, r: 2 }, { width: 100, height: 50 }, null);
    expect(wrapped.x).toBeGreaterThanOrEqual(0);
    expect(wrapped.x).toBeLessThanOrEqual(100);

    const pushed = stepParticle({ x: 0, y: 0, vx: 0.2, vy: 0, r: 2 }, { width: 400, height: 400 }, { x: 10, y: 0 });
    expect(pushed.vx).toBeLessThan(0.2);
  });
});

describe('win celebration', () => {
  it('bursts 50 to 80 pieces upward in emerald, gold, and white', () => {
    let n = 0;
    const random = () => {
      n += 1;
      return (n % 10) / 10;
    };
    const pieces = createCelebration({ x: 40, y: 80 }, random);
    expect(pieces.length).toBeGreaterThanOrEqual(50);
    expect(pieces.length).toBeLessThanOrEqual(80);
    for (const piece of pieces) {
      expect(piece.size).toBeGreaterThanOrEqual(4);
      expect(piece.size).toBeLessThanOrEqual(8);
      expect(['#10b981', '#f5c542', '#ffffff']).toContain(piece.color);
      expect(piece.vy).toBeLessThan(0);
      expect(['circle', 'square']).toContain(piece.shape);
    }
  });
});
