import test from "node:test";
import assert from "node:assert/strict";
import { ATTENDANCE_STATUSES } from "../src/attendance.js";
import { STATUS_STYLE, THEME_CSS, CHART_THEME } from "../src/theme.js";

test("every attendance status has one colour set, shared by the teacher grid and the student card", () => {
  for (const status of ATTENDANCE_STATUSES) {
    const style = STATUS_STYLE[status];
    assert.ok(style, `no colours for ${status}`);
    for (const key of ["bg", "fg", "bd", "short"]) assert.ok(style[key], `${status}.${key}`);
  }
  assert.ok(STATUS_STYLE.假期);
});

test("shared theme css is well formed and keeps text readable", () => {
  assert.equal((THEME_CSS.match(/\{/g) || []).length, (THEME_CSS.match(/\}/g) || []).length);
  for (const [, size] of THEME_CSS.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(parseFloat(size) >= 11, `font-size ${size}px`);
  assert.ok(THEME_CSS.startsWith("@import"), "font import must come first");
  assert.match(THEME_CSS, /--disabled-opacity:\s*\.45/);
});

test("chart colours are real values (recharts cannot read css variables)", () => {
  for (const value of Object.values(CHART_THEME)) assert.match(value, /^#[0-9A-F]{6}$/i);
});
