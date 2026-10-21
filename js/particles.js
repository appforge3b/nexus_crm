const COLOR = 'rgba(99, 102, 241, 0.15)';

export function createParticles({ count, width, height, random = Math.random } = {}) {
  const total = count ?? (60 + Math.floor(random() * 41));
  return Array.from({ length: total }, () => {
    const speed = 0.1 + random() * 0.4;
    const angle = random() * Math.PI * 2;
    return {
      x: random() * width,
      y: random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 1 + random() * 2,
      color: COLOR,
    };
  });
}

export function stepParticle(particle, bounds, mouse) {
  let { x, y, vx, vy } = particle;
  if (mouse) {
    const dx = x - mouse.x;
    const dy = y - mouse.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    if (dist < 80) {
      const force = ((80 - dist) / 80) * 0.8;
      vx += (dx / dist) * force;
      vy += (dy / dist) * force;
    }
  }
  x += vx;
  y += vy;
  while (x < 0) x += bounds.width;
  while (x > bounds.width) x -= bounds.width;
  while (y < 0) y += bounds.height;
  while (y > bounds.height) y -= bounds.height;
  return { ...particle, x, y, vx, vy };
}
