import { describe, expect, it } from 'vitest';
import {
  agendaForBriefing,
  defaultPlanDate,
  dueLabel,
  dueTone,
  isPlanned,
  nextStepForDeal,
  planningInUse,
  shortDue,
  splitTimeline,
} from '../../js/agenda.js';
import { at } from '../helpers/time.js';

const now = at(2026, 10, 21, 9);
const step = (id, date, status = 'planned', extra = {}) => ({ id, title: id, contactId: 'c1', date: date.toISOString(), status, ...extra });

describe('agenda', () => {
  it('treats activities without a status as done', () => {
    expect(isPlanned({ status: 'planned' })).toBe(true);
    expect(isPlanned({})).toBe(false);
    expect(planningInUse([{ status: 'done' }])).toBe(false);
    expect(planningInUse([{ status: 'planned' }])).toBe(true);
  });

  it('splits the timeline around now: upcoming above, overdue and later today next, history below', () => {
    const groups = splitTimeline([
      step('next-week', at(2026, 10, 28, 10)),
      step('tomorrow', at(2026, 10, 22, 10)),
      step('overdue', at(2026, 10, 19, 11)),
      step('this-afternoon', at(2026, 10, 21, 15)),
      step('this-morning', at(2026, 10, 21, 8), 'done'),
      step('last-week', at(2026, 10, 14, 8), 'done'),
    ], now);
    expect(groups.upcoming.map((item) => item.id)).toEqual(['next-week', 'tomorrow']);
    expect(groups.overdue.map((item) => item.id)).toEqual(['overdue']);
    expect(groups.todayPlanned.map((item) => item.id)).toEqual(['this-afternoon']);
    expect(groups.todayDone.map((item) => item.id)).toEqual(['this-morning']);
    expect(groups.past.map((item) => item.id)).toEqual(['last-week']);
  });

  it('finds the earliest planned step for a deal, including stakeholders', () => {
    const deal = { id: 'd1', contactId: 'c1' };
    const steps = [
      step('later', at(2026, 10, 30), 'planned', { dealId: 'd1' }),
      step('sooner', at(2026, 10, 23), 'planned', { dealId: 'd1' }),
      step('done', at(2026, 10, 22), 'done', { dealId: 'd1' }),
    ];
    expect(nextStepForDeal(deal, steps).id).toBe('sooner');
  });

  it('groups the briefing agenda into overdue, today and the next few days', () => {
    const agenda = agendaForBriefing([
      step('overdue', at(2026, 10, 20, 9)),
      step('today', at(2026, 10, 21, 16)),
      step('friday', at(2026, 10, 23, 10)),
      step('far', at(2026, 11, 20, 10)),
    ], now);
    expect(agenda.overdue.map((item) => item.id)).toEqual(['overdue']);
    expect(agenda.today.map((item) => item.id)).toEqual(['today']);
    expect(agenda.soon.map((item) => item.id)).toEqual(['friday']);
  });

  it('labels due dates relative to now', () => {
    expect(dueTone(at(2026, 10, 20, 9).toISOString(), now)).toBe('overdue');
    expect(dueTone(at(2026, 10, 21, 17).toISOString(), now)).toBe('today');
    expect(dueLabel(at(2026, 10, 22, 10).toISOString(), now)).toMatch(/Tomorrow/);
    expect(shortDue(at(2026, 10, 21, 17).toISOString(), now)).toBe('Today');
    expect(defaultPlanDate(now)).toEqual(at(2026, 10, 22, 10));
  });
});
