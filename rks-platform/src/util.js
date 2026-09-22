// Hulpfuncties: geld, uren, datums, ISO-weken, tokens.
import { randomBytes } from 'node:crypto';

// ---------- geld (centen) ----------
const eurFmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
const eurFmt0 = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 });
export const euro = (cents) => eurFmt.format((cents || 0) / 100).replace(/ /g, ' ');
export const euro0 = (cents) => eurFmt0.format(Math.round((cents || 0) / 100)).replace(/ /g, ' ');

// '47', '47,50', '€ 47.5' -> 4750. Leeg of ongeldig -> null.
export function parseEuro(input) {
  if (input === undefined || input === null) return null;
  let s = String(input).trim().replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = Number(s);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100);
}
export const centsToInput = (cents) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ','));

// bedrag = minuten × tarief per uur, afgerond op hele centen
export const lineAmount = (minuten, tariefCents) => Math.round((minuten * tariefCents) / 60);

// ---------- uren (minuten) ----------
// '8', '8,5', '8.25', '7:30' -> minuten. Leeg -> 0. Ongeldig -> null.
export function parseHours(input) {
  const s = String(input ?? '').trim();
  if (!s) return 0;
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':').map(Number);
    return m < 60 ? h * 60 + m : null;
  }
  const v = Number(s.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0 || v > 24) return null;
  return Math.round(v * 60);
}
const hoursFmt = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 });
export const hours = (minuten) => hoursFmt.format((minuten || 0) / 60);
export const hoursInput = (minuten) => (minuten ? hoursFmt.format(minuten / 60) : '');

// ---------- datums ----------
export const pad = (n, l = 2) => String(n).padStart(l, '0');
export const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parseDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};
export const addDays = (s, n) => { const d = parseDate(s); d.setUTCDate(d.getUTCDate() + n); return isoDate(d); };
export const today = () => {
  const fixed = process.env.RKS_TODAY; // voor tests en demo's
  if (fixed && parseDate(fixed)) return fixed;
  return isoDate(new Date());
};
const dateFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateShort = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayName = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', timeZone: 'UTC' });
export const fmtDate = (s) => (parseDate(s) ? dateFmt.format(parseDate(s)) : '');
export const fmtDateShort = (s) => (parseDate(s) ? dateShort.format(parseDate(s)) : '');
export const fmtDay = (s) => (parseDate(s) ? dayName.format(parseDate(s)) : '');
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

// ---------- ISO-weken ----------
export function isoWeekOf(dateStr) {
  const d = parseDate(dateStr);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}
export function isValidWeek(w) {
  if (!/^\d{4}-W\d{2}$/.test(w || '')) return false;
  return isoWeekOf(weekDays(w)[0]) === w;
}
// maandag t/m zondag van een ISO-week
export function weekDays(week) {
  const [y, w] = week.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (w - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + i); return isoDate(d); });
}
export const shiftWeek = (week, n) => isoWeekOf(addDays(weekDays(week)[0], n * 7));
export const weekLabel = (week) => {
  const days = weekDays(week);
  return `Week ${Number(week.split('-W')[1])} · ${fmtDateShort(days[0])} tot ${fmtDateShort(days[6])}`;
};
export const weekNumber = (week) => Number(week.split('-W')[1]);

// ---------- tokens ----------
export const token = (bytes = 24) => randomBytes(bytes).toString('base64url');

// ---------- diversen ----------
export const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
export const toInt = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : null; };
