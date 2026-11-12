import test from "node:test";
import assert from "node:assert/strict";
import { fmtDate, fmtDateShort, fmtDateRange, fmtTimeRange, fmtStamp, ruleWeekLabel, twoCalendarMonthsAgo, parseDateString, localDateString } from "../src/dateFormat.js";

test("full and short dates are zero-padded with a 週X weekday", () => {
  assert.equal(fmtDate("2026-11-09"), "2026/11/09（週一）");
  assert.equal(fmtDateShort("2026-11-09"), "11/09（週一）");
  assert.equal(fmtDate("2026-03-02", { weekday: false }), "2026/03/02");
  assert.equal(fmtDateShort("2026-03-02", { weekday: false }), "03/02");
  assert.equal(fmtDate("2026-11-08"), "2026/11/08（週日）");
});

test("things that are not dates are shown as they are, empty stays empty", () => {
  assert.equal(fmtDate(""), "");
  assert.equal(fmtDate(null), "");
  assert.equal(fmtDate("2026-02-30"), "2026-02-30");
  assert.equal(parseDateString("abc"), null);
});

test("ranges use ～ for both dates and times", () => {
  assert.equal(fmtDateRange("2026-03-02", "2026-06-30"), "2026/03/02 ～ 2026/06/30");
  assert.equal(fmtDateRange("2026-03-02", ""), "2026/03/02 ～ 持續中");
  assert.equal(fmtDateRange("", "2026-06-30"), "");
  assert.equal(fmtTimeRange("18:00", "20:00"), "18:00～20:00");
  assert.equal(fmtTimeRange("18:00", ""), "18:00");
  assert.equal(fmtTimeRange("", "20:00"), "");
});

test("weekly rules read 每週一 / 隔週三, never 每週週一", () => {
  assert.equal(ruleWeekLabel(1, 1), "每週一");
  assert.equal(ruleWeekLabel(2, 3), "隔週三");
  assert.equal(ruleWeekLabel(undefined, 0), "每週日");
});

test("time stamps are 24 hour local time, midnight is 00:xx", () => {
  assert.equal(fmtStamp(new Date(2026, 10, 9, 14, 5).toISOString()), "11/09 14:05");
  assert.equal(fmtStamp(new Date(2026, 10, 9, 0, 7).toISOString()), "11/09 00:07");
  assert.equal(fmtStamp("nonsense"), "");
});

test("two months ago stays inside that month (no overflow into the next one)", () => {
  assert.equal(twoCalendarMonthsAgo(new Date(2027, 0, 31)), "2026-11-30");
  assert.equal(twoCalendarMonthsAgo(new Date(2026, 3, 30)), "2026-02-28");
  assert.equal(twoCalendarMonthsAgo(new Date(2026, 10, 9)), "2026-09-09");
  assert.equal(localDateString(new Date(2026, 0, 5)), "2026-01-05");
});

import { normalizeTime } from "../src/dateFormat.js";

test("typed times become 24 hour HH:MM", () => {
  assert.equal(normalizeTime("18:30"), "18:30");
  assert.equal(normalizeTime("1830"), "18:30");
  assert.equal(normalizeTime("6:30"), "06:30");
  assert.equal(normalizeTime("630"), "06:30");
  assert.equal(normalizeTime("０９：０５"), "09:05");
  assert.equal(normalizeTime(" 20:00 "), "20:00");
  assert.equal(normalizeTime("00:00"), "00:00");
  assert.equal(normalizeTime("23:59"), "23:59");
});

test("an empty field stays empty; unfinished or impossible times are rejected", () => {
  assert.equal(normalizeTime(""), "");
  assert.equal(normalizeTime(undefined), "");
  assert.equal(normalizeTime("18"), null);      // still typing
  assert.equal(normalizeTime("18:3"), null);
  assert.equal(normalizeTime("24:00"), null);
  assert.equal(normalizeTime("12:60"), null);
  assert.equal(normalizeTime("ab:cd"), null);
  assert.equal(normalizeTime("1:2:3"), null);
  assert.equal(normalizeTime("12345"), null);
});

test("leaving the field turns a bare hour into HH:00", () => {
  assert.equal(normalizeTime("18", { final: true }), "18:00");
  assert.equal(normalizeTime("6", { final: true }), "06:00");
  assert.equal(normalizeTime("25", { final: true }), null);
  assert.equal(normalizeTime("18:3", { final: true }), null);
});
