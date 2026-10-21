import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

function normalizeCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .trim();
}

describe('design tokens and cockpit css', () => {
  it('defines the PRD custom properties on :root', () => {
    const css = normalizeCss(read('css/tokens.css'));
    const expected = {
      '--bg-void': '#0a0a0f',
      '--bg-surface': '#12121a',
      '--bg-elevated': '#1a1a2e',
      '--bg-glass': 'rgba(255,255,255,0.03)',
      '--glass-border': 'rgba(255,255,255,0.06)',
      '--glass-border-hover': 'rgba(255,255,255,0.12)',
      '--glass-blur': '24px',
      '--accent-primary': '#6366f1',
      '--accent-secondary': '#8b5cf6',
      '--accent-gradient': 'linear-gradient(135deg,#6366f1,#8b5cf6)',
      '--success': '#10b981',
      '--success-dim': 'rgba(16,185,129,0.15)',
      '--warning': '#f59e0b',
      '--warning-dim': 'rgba(245,158,11,0.15)',
      '--danger': '#ef4444',
      '--danger-dim': 'rgba(239,68,68,0.15)',
      '--text-primary': '#f1f5f9',
      '--text-secondary': '#94a3b8',
      '--text-muted': '#64748b',
      '--radius-sm': '8px',
      '--radius-md': '12px',
      '--radius-lg': '16px',
      '--radius-xl': '24px',
      '--shadow-glow': '0 0 20px rgba(99,102,241,0.15)',
      '--transition-fast': '150ms ease',
      '--transition-normal': '250ms ease',
      '--transition-slow': '400ms cubic-bezier(0.16,1,0.3,1)',
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(css).toContain(`${name}:${value}`);
    }
  });

  it('paints the void background, Inter, glass panels, and the won column', () => {
    const base = normalizeCss(read('css/base.css'));
    expect(base).toContain("font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif");
    expect(base).toContain('background:var(--bg-void)');

    const components = normalizeCss(read('css/components.css'));
    for (const snippet of [
      'background:var(--bg-glass)',
      'backdrop-filter:blur(var(--glass-blur))',
      '-webkit-backdrop-filter:blur(var(--glass-blur))',
      'border:1px solid var(--glass-border)',
      'border-radius:var(--radius-lg)',
      '.card:hover',
      'translateY(-2px)',
      '[data-stage="won"]',
      'var(--success)',
      '.field-error',
      'color:var(--danger)',
      '[data-tone="success"]',
      '[data-tone="error"]',
      '[data-tone="info"]',
    ]) {
      expect(components).toContain(snippet);
    }
  });

  it('includes the critical pulse, drag feedback, and the 1.5s heartbeat', () => {
    const css = normalizeCss(read('css/animations.css'));
    expect(css).toContain('@keyframes pulse-critical{0%,100%{transform:scale(1);opacity:1;box-shadow:0 0 0 0 rgba(239,68,68,0.4);}50%{transform:scale(1.3);opacity:0.8;box-shadow:0 0 0 8px rgba(239,68,68,0);}}');
    expect(css).toContain('.pulse-critical{animation:pulse-critical 1.5s ease infinite;}');
    expect(css).toContain('.is-dragging{transform:rotate(2deg) scale(1.05);opacity:0.8;cursor:grabbing;}');
  });

  it('covers the desktop, tablet, mobile, and full-screen modal breakpoints', () => {
    const css = read('css/responsive.css');
    expect(css).toContain('@media (max-width: 1023px)');
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain('@media (max-width: 480px)');
    expect(css).toContain('.bottom-nav');
  });
});
