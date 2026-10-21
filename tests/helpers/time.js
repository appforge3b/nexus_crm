/** Local calendar dates so tests do not depend on the machine timezone. */

export function at(year, month, day, hour = 12, minute = 0, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second, 0);
}

export function isoDate(year, month, day) {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function daysBefore(now, days) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    snapshot() {
      return { ...data };
    },
  };
}

export function frozenClock(date) {
  let current = date;
  return {
    now: () => current,
    set(next) {
      current = next;
    },
  };
}
