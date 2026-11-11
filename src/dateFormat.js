/* The one way dates and times are written on screen.

   Full date (records, archives, parent view)   2026/11/09（週一）
   Short date (teacher's daily work)            11/09（週一）
   Numbers are always zero-padded, weekdays are always 週X, and a range uses
   the full-width ～ for both dates and times.
   Dates are kept as "YYYY-MM-DD" strings everywhere else in the app. */

export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const pad = (value) => String(value).padStart(2, "0");

/** "2026-11-09" -> { y, mo, d, day } (day 0 = Sunday), or null when it is not a real date. */
export function parseDateString(value) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value || ""));
  if (!match) return null;
  const [y, mo, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return { y, mo, d, day: date.getDay() };
}

/** 0..6 -> 週日..週六 */
export const weekdayLabel = (day) => `週${WEEKDAYS[day]}`;

/** 2026/11/09（週一）. year:false -> 11/09（週一）. weekday:false drops the （週一）. */
export function fmtDate(value, { year = true, weekday = true } = {}) {
  const parsed = parseDateString(value);
  if (!parsed) return value ? String(value) : "";
  const base = `${year ? `${parsed.y}/` : ""}${pad(parsed.mo)}/${pad(parsed.d)}`;
  return weekday ? `${base}（${weekdayLabel(parsed.day)}）` : base;
}

/** Short form for the teacher's daily screens: 11/09（週一） */
export const fmtDateShort = (value, options = {}) => fmtDate(value, { year: false, ...options });

/** 2026/03/02 ～ 2026/06/30, or "2026/03/02 ～ 持續中" when there is no end. */
export function fmtDateRange(from, to, { ongoing = "持續中" } = {}) {
  if (!from) return "";
  return `${fmtDate(from, { weekday: false })} ～ ${to ? fmtDate(to, { weekday: false }) : ongoing}`;
}

/** 18:00～20:00 */
export function fmtTimeRange(startTime, endTime) {
  if (!startTime) return "";
  return endTime ? `${startTime}～${endTime}` : startTime;
}

/** Time stamp for "last updated": 11/09 14:30 (24 hour, local time). */
export function fmtStamp(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 每週一 / 隔週一 (not 每週週一). */
export function ruleWeekLabel(interval, dayOfWeek) {
  return `${interval === 2 ? "隔週" : "每週"}${WEEKDAYS[dayOfWeek]}`;
}

/** Local "YYYY-MM-DD" for a Date (default: today). */
export function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Same day two calendar months ago, kept inside that month (Jan 31 -> Nov 30). */
export function twoCalendarMonthsAgo(now = new Date()) {
  const target = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return localDateString(new Date(target.getFullYear(), target.getMonth(), Math.min(now.getDate(), lastDay)));
}
