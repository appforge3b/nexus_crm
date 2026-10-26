import { calendarKey } from './format.js';
import { activityCompanyId } from './companies.js';

const DAY = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const PLAN_TYPES = ['meeting', 'call', 'whatsapp', 'email', 'task'];

export function isPlanned(activity) {
  return activity?.status === 'planned';
}

export function isDone(activity) {
  return !isPlanned(activity);
}

export function doneOnly(activities) {
  return (activities ?? []).filter(isDone);
}

/** Next-step signals only switch on once someone has started planning, so existing workspaces are not nagged. */
export function planningInUse(activities) {
  return (activities ?? []).some((activity) => isPlanned(activity) || activity.completedAt);
}

function time(activity) {
  return new Date(activity.date).getTime();
}

const ascending = (a, b) => time(a) - time(b);
const descending = (a, b) => time(b) - time(a);

function dayDiff(from, to) {
  return Math.round((Date.parse(`${calendarKey(to)}T00:00:00`) - Date.parse(`${calendarKey(from)}T00:00:00`)) / DAY);
}

/**
 * Splits activities around today. Planned items whose time has passed are overdue;
 * anything dated after today (planned or logged) is upcoming, furthest first.
 */
export function splitTimeline(activities, now) {
  const today = calendarKey(now);
  const groups = { upcoming: [], overdue: [], todayPlanned: [], todayDone: [], past: [] };
  for (const activity of activities ?? []) {
    const key = calendarKey(activity.date);
    if (isPlanned(activity)) {
      if (time(activity) < now.getTime()) groups.overdue.push(activity);
      else if (key === today) groups.todayPlanned.push(activity);
      else groups.upcoming.push(activity);
    } else if (key > today) groups.upcoming.push(activity);
    else if (key === today) groups.todayDone.push(activity);
    else groups.past.push(activity);
  }
  groups.upcoming.sort(descending);
  groups.overdue.sort(ascending);
  groups.todayPlanned.sort(ascending);
  groups.todayDone.sort(descending);
  groups.past.sort(descending);
  return groups;
}

function earliestPlanned(activities, predicate) {
  return (activities ?? []).filter((activity) => isPlanned(activity) && predicate(activity)).sort(ascending)[0] ?? null;
}

export function nextStepForDeal(deal, activities) {
  if (!deal) return null;
  return earliestPlanned(activities, (activity) => activity.dealId === deal.id);
}

export function nextStepForContact(contactId, activities) {
  return earliestPlanned(activities, (activity) => activity.contactId === contactId);
}

export function nextStepForCompany(companyId, activities, contacts, companies) {
  if (!companyId) return null;
  return earliestPlanned(activities, (activity) => activityCompanyId(activity, contacts, companies) === companyId);
}

export function overdueSteps(activities, now) {
  return (activities ?? []).filter((activity) => isPlanned(activity) && time(activity) < now.getTime()).sort(ascending);
}

export function agendaForBriefing(activities, now, days = 7) {
  const today = calendarKey(now);
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 23, 59, 59, 999).getTime();
  const planned = (activities ?? []).filter(isPlanned).sort(ascending);
  return {
    overdue: planned.filter((activity) => time(activity) < now.getTime()),
    today: planned.filter((activity) => time(activity) >= now.getTime() && calendarKey(activity.date) === today),
    soon: planned.filter((activity) => calendarKey(activity.date) > today && time(activity) <= horizon),
  };
}

export function clockTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function shortDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function dueTone(iso, now) {
  const date = new Date(iso);
  if (date.getTime() < now.getTime()) return 'overdue';
  const diff = dayDiff(now, date);
  if (diff === 0) return 'today';
  if (diff <= 7) return 'soon';
  return 'later';
}

/** "Today 3:00 PM", "Tomorrow 10:00 AM", "in 3 days · Tue 27 Oct, 3:00 PM", "2 days overdue". */
export function dueLabel(iso, now) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = dayDiff(now, date);
  if (date.getTime() < now.getTime()) {
    if (diff === 0) return `Overdue · was due ${clockTime(iso)}`;
    if (diff === -1) return 'Overdue since yesterday';
    return `${Math.abs(diff)} days overdue`;
  }
  if (diff === 0) return `Today ${clockTime(iso)}`;
  if (diff === 1) return `Tomorrow ${clockTime(iso)}`;
  return `in ${diff} days · ${shortDate(iso)}, ${clockTime(iso)}`;
}

/** Compact form for cards: "Today", "Tomorrow", "Tue", "27 Oct", "Overdue". */
export function shortDue(iso, now) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (date.getTime() < now.getTime()) return 'Overdue';
  const diff = dayDiff(now, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return WEEKDAYS[date.getDay()];
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Default slot for a new next step: tomorrow at 10:00 local. */
export function defaultPlanDate(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0, 0);
}

export function shiftDate(iso, days) {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date;
}
