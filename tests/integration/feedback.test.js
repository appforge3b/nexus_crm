import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { click, field, mount, setValue } from '../helpers/mount.js';

describe('modals and toasts', () => {
  beforeEach(() => {
    mount({ hash: '#/roster' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function openContactModal() {
    click([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Add Contact'));
    return document.querySelector('[role="dialog"]');
  }

  it('closes on Escape and on the overlay, and stays open when the panel itself is clicked', () => {
    const dialog = openContactModal();
    expect(document.querySelector('[data-overlay]')).not.toBeNull();
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    document.querySelector('[data-overlay]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    openContactModal();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('stacks a success toast and dismisses it after three seconds or on click', () => {
    vi.useFakeTimers();
    const dialog = openContactModal();
    setValue(field('name', dialog), 'Toast Person');
    click([...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    const toast = document.querySelector('[role="status"][data-tone="success"]');
    expect(toast).not.toBeNull();
    expect(document.querySelector('[aria-label="Dismiss"]')).not.toBeNull();

    vi.advanceTimersByTime(2999);
    expect(document.querySelector('[role="status"]')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector('[role="status"]')).toBeNull();

    const again = openContactModal();
    setValue(field('name', again), 'Second Person');
    click([...again.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save'));
    click(document.querySelector('[aria-label="Dismiss"]'));
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it('focuses the view search input when / is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(document.activeElement).toBe(document.querySelector('[data-view="roster"] [data-search]'));
  });

  it('opens the new-contact modal with N on the roster', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    expect(document.querySelector('[role="dialog"]').textContent).toContain('Name');
  });
});
