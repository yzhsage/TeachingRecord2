import { get, ref } from "firebase/database";
import { auth, db } from "./firebase";

/* Reliable Realtime Database reads.
   Right after the page opens, the database connection and the login token
   are sometimes not ready yet. A plain get() then fails (permission denied /
   client offline) or hangs, and the app used to treat that as "no data".
   readPath() waits for login, times out instead of hanging, retries a few
   times, and shares one download when several screens ask for the same path. */

const READ_TIMEOUT_MS = 20000;
const RETRY_DELAYS_MS = [800, 2000, 4000];
const inflight = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, label, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`讀取「${label}」超過 ${ms / 1000} 秒沒有回應`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function waitForLogin(forceRefresh) {
  if (typeof auth.authStateReady === "function") await auth.authStateReady();
  if (auth.currentUser) await auth.currentUser.getIdToken(forceRefresh);
}

function isPermissionError(error) {
  return /permission/i.test(String(error?.code || error?.message || error || ""));
}

async function readOnce(path, label) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      // On a retry after "permission denied", refresh the login token first:
      // that error right after page load usually means the token was late.
      await waitForLogin(attempt > 0 && isPermissionError(lastError));
      const snapshot = await withTimeout(get(ref(db, path)), label, READ_TIMEOUT_MS);
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      lastError = error;
      console.warn(`firebase read failed (${path}), attempt ${attempt + 1}`, error);
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

/** Returns the value at `path`, or null when nothing is stored there.
    Throws only after every retry failed — never silently returns empty data. */
export function readPath(path, label = path) {
  if (inflight.has(path)) return inflight.get(path);
  const promise = readOnce(path, label).finally(() => inflight.delete(path));
  inflight.set(path, promise);
  return promise;
}
