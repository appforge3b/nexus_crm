import { describe, expect, it } from 'vitest';
import {
  avatarGradient,
  exportFilename,
  formatLongDate,
  formatMediumDate,
  formatMoney,
  formatMoneyCompact,
  formatRelativeTime,
  greetingForHour,
  hashString,
  initials,
  stageAgeTone,
  truncate,
} from '../../js/format.js';
import { at, daysBefore } from '../helpers/time.js';

describe('money formatting', () => {
  it('groups rupees in the Indian system below one lakh', () => {
    expect(formatMoney(0)).toBe('₹0');
    expect(formatMoney(12400)).toBe('₹12,400');
    expect(formatMoney(99999)).toBe('₹99,999');
    expect(formatMoney(120000)).toBe('₹1,20,000');
    expect(formatMoney(1500000)).toBe('₹15,00,000');
    expect(formatMoney(1500.5)).toBe('₹1,500.50');
    expect(formatMoney(-5)).toBe('-₹5');
  });

  it('compacts lakhs and crores for KPIs and column totals', () => {
    expect(formatMoneyCompact(0)).toBe('₹0');
    expect(formatMoneyCompact(99999)).toBe('₹99,999');
    expect(formatMoneyCompact(100000)).toBe('₹1L');
    expect(formatMoneyCompact(810000)).toBe('₹8.1L');
    expect(formatMoneyCompact(1500000)).toBe('₹15L');
    expect(formatMoneyCompact(4720000)).toBe('₹47.2L');
    expect(formatMoneyCompact(10000000)).toBe('₹1Cr');
    expect(formatMoneyCompact(12400000)).toBe('₹1.2Cr');
    expect(formatMoneyCompact(12500000)).toBe('₹1.3Cr');
    expect(formatMoneyCompact(102000000)).toBe('₹10.2Cr');
    expect(formatMoneyCompact(810000, '$')).toBe('$8.1L');
  });
});

describe('dates, greetings, and relative time', () => {
  const now = at(2026, 10, 21, 10, 0, 0);

  it('formats the briefing date and picks the greeting band from the hour', () => {
    expect(formatLongDate(at(2026, 10, 21, 10))).toBe('Wednesday, October 21, 2026');
    expect(greetingForHour(5)).toBe('Good morning');
    expect(greetingForHour(11)).toBe('Good morning');
    expect(greetingForHour(12)).toBe('Good afternoon');
    expect(greetingForHour(16)).toBe('Good afternoon');
    expect(greetingForHour(17)).toBe('Good evening');
    expect(greetingForHour(20)).toBe('Good evening');
    expect(greetingForHour(21)).toBe('Good night');
    expect(greetingForHour(0)).toBe('Good night');
    expect(greetingForHour(4)).toBe('Good night');
  });

  it('renders relative timestamps the way the activity feed and deal cards read', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 30 * 1000).toISOString(), now)).toBe('just now');
    expect(formatRelativeTime(new Date(now.getTime() - 59 * 1000).toISOString(), now)).toBe('just now');
    expect(formatRelativeTime(new Date(now.getTime() - 60 * 1000).toISOString(), now)).toBe('1 minute ago');
    expect(formatRelativeTime(new Date(now.getTime() - 5 * 60 * 1000).toISOString(), now)).toBe('5 minutes ago');
    expect(formatRelativeTime(new Date(now.getTime() - 60 * 60 * 1000).toISOString(), now)).toBe('1 hour ago');
    expect(formatRelativeTime(new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), now)).toBe('2 hours ago');
    expect(formatRelativeTime(at(2026, 10, 20, 15).toISOString(), now)).toBe('yesterday');
    expect(formatRelativeTime(daysBefore(now, 3).toISOString(), now)).toBe('3 days ago');
    expect(formatRelativeTime(daysBefore(now, 10).toISOString(), now)).toBe('Oct 11, 2026');
  });

  it('formats calendar dates from the date prefix so timezones cannot shift them', () => {
    expect(formatMediumDate('2026-01-10')).toBe('Jan 10, 2026');
    expect(formatMediumDate('2026-01-10T09:00:00.000Z')).toBe('Jan 10, 2026');
    expect(formatMediumDate('2026-10-20')).toBe('Oct 20, 2026');
  });

  it('names the export file from the local calendar date', () => {
    expect(exportFilename(at(2026, 10, 21))).toBe('nexus-backup-2026-10-21.json');
    expect(exportFilename(at(2026, 1, 5))).toBe('nexus-backup-2026-01-05.json');
  });
});

describe('avatar, truncation, and stage age', () => {
  it('builds initials from the first and last word', () => {
    expect(initials('Ravi Krishnan')).toBe('RK');
    expect(initials('  Mary Ann Smith ')).toBe('MS');
    expect(initials('puja')).toBe('P');
    expect(initials('A')).toBe('A');
    expect(initials('')).toBe('?');
  });

  it('hashes a name to a stable hue gradient', () => {
    expect(hashString('nexus')).toBe(104715263);
    const first = avatarGradient('Ravi Krishnan');
    expect(avatarGradient('Ravi Krishnan')).toBe(first);
    expect(first).toMatch(/^linear-gradient\(135deg, hsl\(\d+ 70% 55%\), hsl\(\d+ 70% 45%\)\)$/);
    expect(avatarGradient('Priya Shah')).not.toBe(first);
  });

  it('truncates deal titles past 30 characters with an ellipsis', () => {
    expect(truncate('Short title', 30)).toBe('Short title');
    expect(truncate('a'.repeat(30), 30)).toBe('a'.repeat(30));
    expect(truncate('a'.repeat(31), 30)).toBe(`${'a'.repeat(30)}…`);
  });

  it('colors time-in-stage green, yellow, then red', () => {
    expect(stageAgeTone(0)).toBe('fresh');
    expect(stageAgeTone(6.9)).toBe('fresh');
    expect(stageAgeTone(7)).toBe('aging');
    expect(stageAgeTone(14)).toBe('aging');
    expect(stageAgeTone(14.01)).toBe('stale');
  });
});
