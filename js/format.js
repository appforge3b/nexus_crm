const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function hashString(name) {
  let hash = 0;
  for (const char of String(name)) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function formatMoney(amount, currency = '₹') {
  const negative = amount < 0;
  const absolute = Math.abs(Number(amount) || 0);
  const fraction = Math.round(absolute * 100) % 100 !== 0;
  const formatted = absolute.toLocaleString('en-IN', {
    minimumFractionDigits: fraction ? 2 : 0,
    maximumFractionDigits: fraction ? 2 : 0,
  });
  return `${negative ? '-' : ''}${currency}${formatted}`;
}

function compactNumber(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatMoneyCompact(amount, currency = '₹') {
  const negative = amount < 0;
  const absolute = Math.abs(Number(amount) || 0);
  if (absolute < 100000) return formatMoney(amount, currency);
  const sign = negative ? '-' : '';
  if (absolute >= 10000000) return `${sign}${currency}${compactNumber(absolute / 10000000)}Cr`;
  return `${sign}${currency}${compactNumber(absolute / 100000)}L`;
}

export function formatMediumDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!match) return '';
  return `${SHORT_MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

export function formatLongDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function greetingForHour(hour) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

function localKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function calendarKey(value) {
  if (value instanceof Date) return localKey(value);
  const match = /^(\d{4}-\d{2}-\d{2})$/.exec(String(value ?? ''));
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return localKey(date);
}

export function formatRelativeTime(iso, now) {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  if (diff < 60 * 1000) return 'just now';
  const thenKey = localKey(then);
  const nowKey = localKey(now);
  if (thenKey === nowKey) {
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    const hours = Math.floor(diff / 3600000);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  const dayDiff = Math.round((Date.parse(`${nowKey}T00:00:00`) - Date.parse(`${thenKey}T00:00:00`)) / 86400000);
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} days ago`;
  return formatMediumDate(thenKey);
}

export function exportFilename(date) {
  return `nexus-backup-${localKey(date)}.json`;
}

export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function avatarGradient(name) {
  const hue = hashString(String(name).trim().toLowerCase()) % 360;
  const next = (hue + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${next} 70% 45%))`;
}

export function truncate(text, max) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export function stageAgeTone(days) {
  if (days < 7) return 'fresh';
  if (days <= 14) return 'aging';
  return 'stale';
}

export function stageAgeDays(iso, now) {
  if (!iso) return 0;
  return (now.getTime() - new Date(iso).getTime()) / 86400000;
}
