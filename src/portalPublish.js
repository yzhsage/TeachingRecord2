/* Keeps the family view up to date by itself — no 同步 button.

   Families may only read their own child's copy (portalStudentData/<id>),
   because the shared attendance and score lists hold every student. So after
   the teacher saves attendance, scores or class lists, this rebuilds each
   student's copy and writes only the students whose records changed.
   It runs only in the teacher's browser (only the teacher can write). */
import { ref, update } from "firebase/database";
import { db } from "./firebase";
import { readPath } from "./firebaseRead";
import { loadRecordRoots, onStudentFirstSaved } from "./studentFirstStorage";
import { buildAllPortalData, diffPortalData, publishSafetyCheck } from "./studentRecords.js";

const SAVE_DELAY_MS = 5000;
const FIRST_RUN_DELAY_MS = 3000;
const RETRY_DELAY_MS = 60000;
const WRITE_TIMEOUT_MS = 60000;

const watched = (key) => key === "classIndex" || key === "studentIndex" || /^(attendance|quiz|exam):/.test(key);

let published = null; // what the family copies currently hold, per student
let timer = null;
let running = false;
let runAgain = false;
let started = 0;
let unsubscribe = null;

let status = { state: "idle", at: null, changed: 0, message: "" };
const listeners = new Set();
function setStatus(next) {
  status = { ...status, ...next };
  for (const listener of listeners) listener(status);
}
export function getPublishStatus() { return status; }
export function subscribePublishStatus(listener) {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

function withTimeout(promise, ms) {
  let id;
  return Promise.race([
    promise,
    new Promise((_, reject) => { id = setTimeout(() => reject(new Error(`寫入超過 ${ms / 1000} 秒沒有回應`)), ms); }),
  ]).finally(() => clearTimeout(id));
}

function friendly(error) {
  const message = String(error?.message || error || "");
  if (/permission/i.test(message)) return "沒有寫入權限，請確認 Firebase 規則已更新並發布";
  return message || "未知錯誤";
}

export function schedulePortalPublish(delay = SAVE_DELAY_MS) {
  if (timer) clearTimeout(timer);
  if (status.state !== "publishing") setStatus({ state: "pending" });
  timer = setTimeout(() => { timer = null; run(); }, delay);
}

async function run() {
  if (running) { runAgain = true; return; }
  running = true;
  setStatus({ state: "publishing", message: "" });
  try {
    const roots = await loadRecordRoots();
    const check = publishSafetyCheck(roots);
    if (!check.ok) {
      setStatus({ state: "skipped", message: `${check.reason}，為了保護家長看到的資料，這次沒有更新` });
      return;
    }
    if (!published) published = (await readPath("portalStudentData", "家長查閱資料")) || {};
    const next = buildAllPortalData(roots);
    const patch = diffPortalData(published, next);
    const ids = Object.keys(patch);
    if (ids.length) {
      await withTimeout(update(ref(db, "portalStudentData"), patch), WRITE_TIMEOUT_MS);
      Object.assign(published, patch);
    }
    setStatus({ state: "ok", at: new Date().toISOString(), changed: ids.length, message: "" });
  } catch (error) {
    console.error("family view update failed", error);
    published = null; // read the real state again next time
    setStatus({ state: "error", message: friendly(error) });
    if (!runAgain && !timer) timer = setTimeout(() => { timer = null; run(); }, RETRY_DELAY_MS);
  } finally {
    running = false;
    if (runAgain) { runAgain = false; schedulePortalPublish(1500); }
  }
}

/** Call once after the teacher's data has loaded. Returns a stop function. */
export function startPortalAutoPublish() {
  started += 1;
  if (started === 1) {
    unsubscribe = onStudentFirstSaved((key) => { if (watched(key)) schedulePortalPublish(); });
    schedulePortalPublish(FIRST_RUN_DELAY_MS);
  }
  return () => {
    started -= 1;
    if (started === 0) {
      unsubscribe?.();
      unsubscribe = null;
      // A pending update still runs, so a last-second save is not lost.
    }
  };
}
