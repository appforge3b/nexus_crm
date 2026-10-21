import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

describe('frontend constraints', () => {
  it('keeps runtime dependencies empty so the app stays vanilla', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('loads Inter, a module entry, and no framework or chart library', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('id="app"');
    expect(html).toContain('fonts.googleapis.com');
    expect(html).toMatch(/Inter/);
    expect(html).toMatch(/300/);
    expect(html).toMatch(/700/);
    const scriptTags = [...html.matchAll(/<script\b([^>]*)>/g)].map((match) => match[1]);
    const entry = scriptTags.find((attrs) => attrs.includes('src="js/main.js"'));
    expect(entry).toBeTruthy();
    expect(entry).toMatch(/type="module"/);

    const externalScripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    expect(externalScripts).toEqual(['js/main.js']);
    expect(html.toLowerCase()).not.toMatch(/tailwind|bootstrap|chart\.js|d3(?:\.|\/)|jquery|react|vue|angular/);
  });
});
