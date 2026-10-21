const COLORS = ['#10b981', '#f5c542', '#ffffff'];

export function createCelebration(origin, random = Math.random) {
  const count = 50 + Math.floor(random() * 31);
  return Array.from({ length: count }, () => ({
    x: origin.x,
    y: origin.y,
    size: 4 + random() * 4,
    color: COLORS[Math.floor(random() * COLORS.length) % COLORS.length],
    vx: (random() - 0.5) * 6,
    vy: -(1 + random() * 6),
    shape: random() < 0.5 ? 'circle' : 'square',
  }));
}
