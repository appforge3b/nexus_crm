import { describe, expect, it, vi } from 'vitest';
import { shortcutAction } from '../../js/keyboard.js';
import { parseRoute } from '../../js/router.js';
import { debounce } from '../../js/debounce.js';
import { renderNotes } from '../../js/markdown.js';
import { defaultSettings, renameStage } from '../../js/settings.js';

function key(name, extras = {}) {
  return {
    key: name,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: { tagName: 'BODY', isContentEditable: false },
    ...extras,
  };
}

describe('keyboard shortcuts', () => {
  it('maps the number keys to the six views and ignores them while typing', () => {
    const hashes = ['#/briefing', '#/pipeline', '#/roster', '#/chronicle', '#/radar', '#/customers'];
    hashes.forEach((hash, index) => {
      expect(shortcutAction(key(String(index + 1)))).toEqual({ type: 'navigate', hash });
    });
    expect(shortcutAction(key('1', { target: { tagName: 'INPUT', isContentEditable: false } }))).toBeNull();
    expect(shortcutAction(key('1', { metaKey: true }))).toBeNull();
    expect(shortcutAction(key('Escape', { target: { tagName: 'TEXTAREA', isContentEditable: false } }))).toEqual({ type: 'close' });
  });

  it('opens create, search, and the shortcut overlay', () => {
    expect(shortcutAction(key('n'))).toEqual({ type: 'create' });
    expect(shortcutAction(key('N'))).toEqual({ type: 'create' });
    expect(shortcutAction(key('/'))).toEqual({ type: 'search' });
    expect(shortcutAction(key('?'))).toEqual({ type: 'help' });
  });
});

describe('router', () => {
  it('parses view hashes and query params, and sends unknowns to the briefing', () => {
    expect(parseRoute('')).toEqual({ view: 'briefing', params: {} });
    expect(parseRoute('#/')).toEqual({ view: 'briefing', params: {} });
    expect(parseRoute('#/nope')).toEqual({ view: 'briefing', params: {} });
    expect(parseRoute('#/settings')).toEqual({ view: 'settings', params: {} });
    expect(parseRoute('#/pipeline?deal=abc')).toEqual({ view: 'pipeline', params: { deal: 'abc' } });
    expect(parseRoute('#/chronicle?contact=c1')).toEqual({ view: 'chronicle', params: { contact: 'c1' } });
  });
});

describe('debounce', () => {
  it('invokes the last call after the wait and drops the earlier ones', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced('a');
    debounced('b');
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
    vi.useRealTimers();
  });
});

describe('notes markdown', () => {
  it('renders bold, italic, and lists, and escapes raw html', () => {
    expect(renderNotes('**hi**')).toBe('<p><strong>hi</strong></p>');
    expect(renderNotes('Call on **Fridays**.')).toBe('<p>Call on <strong>Fridays</strong>.</p>');
    expect(renderNotes('*hi*')).toBe('<p><em>hi</em></p>');
    expect(renderNotes('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(renderNotes('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(renderNotes('Tom & Jerry')).toBe('<p>Tom &amp; Jerry</p>');
  });
});

describe('settings', () => {
  it('renames a stage without adding or removing any', () => {
    const settings = defaultSettings();
    const next = renameStage(settings, 'prospect', 'Lead');
    expect(next.stages).toHaveLength(settings.stages.length);
    expect(next.stages.map((stage) => stage.id)).toEqual(settings.stages.map((stage) => stage.id));
    expect(next.stages[0]).toEqual({ id: 'prospect', name: 'Lead' });
    expect(() => renameStage(settings, 'custom', 'Extra')).toThrow(/unknown stage/i);
    expect(() => renameStage(settings, 'won', '   ')).toThrow(/name/i);
  });
});
