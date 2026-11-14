import test from "node:test";
import assert from "node:assert/strict";
import { membershipAtDate, toggleTrial, TRIAL_SESSION_COUNT } from "../src/students.js";

const sessions = (...dates) => Object.fromEntries(dates.map((date) => [date, { records: { s1: "出席" } }]));
const student = (extra = {}) => ({ id: "s1", name: "王小明", joinDate: "2026-09-01", ...extra });

test("a new student is on trial for the first two recorded sessions, then regular", () => {
  assert.equal(TRIAL_SESSION_COUNT, 2);
  const data = sessions("2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23");
  assert.equal(membershipAtDate(student(), "2026-09-02", data), "trial");
  assert.equal(membershipAtDate(student(), "2026-09-09", data), "trial");
  assert.equal(membershipAtDate(student(), "2026-09-16", data), "active");
  assert.equal(membershipAtDate(student(), "2026-09-23", data), "active");
});

test("before the join date is not_yet, after the end date is stopped", () => {
  assert.equal(membershipAtDate(student(), "2026-08-30", {}), "not_yet");
  assert.equal(membershipAtDate(student({ endDate: "2026-10-01" }), "2026-10-05", sessions("2026-09-02")), "stopped");
});

test("設為試聽生 works even on a student who is already regular (the button used to do nothing)", () => {
  const data = sessions("2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23");
  const regular = student();
  assert.equal(membershipAtDate(regular, "2026-09-23", data), "active");
  const trial = toggleTrial(regular, "active");
  assert.equal(membershipAtDate(trial, "2026-09-23", data), "trial");
  const back = toggleTrial(trial, "trial");
  assert.equal(membershipAtDate(back, "2026-09-23", data), "active");
});

test("a manual choice beats an older membership: \"active\" label, too", () => {
  const legacy = student({ membership: "active" });
  assert.equal(membershipAtDate(legacy, "2026-09-02", sessions("2026-09-02")), "active");
  assert.equal(membershipAtDate(toggleTrial(legacy, "active"), "2026-09-02", sessions("2026-09-02")), "trial");
});

test("轉為班內生 skips the rest of the trial; unchecking 新生 (forceActive) starts as regular", () => {
  assert.equal(membershipAtDate(toggleTrial(student(), "trial"), "2026-09-02", sessions("2026-09-02")), "active");
  assert.equal(membershipAtDate(student({ forceActive: true }), "2026-09-02", {}), "active");
});
