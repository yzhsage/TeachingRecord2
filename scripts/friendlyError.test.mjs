import test from "node:test";
import assert from "node:assert/strict";
import { friendlyError } from "../src/friendlyError.js";

test("raw English errors become Chinese", () => {
  assert.match(friendlyError(new Error("PERMISSION_DENIED: Permission denied")), /權限/);
  assert.match(friendlyError({ code: "database/permission-denied" }, { audience: "parent" }), /聯絡老師/);
  assert.equal(friendlyError(new Error("Failed to fetch")), "網路連線不穩，請稍後再試。");
  assert.equal(friendlyError({ code: "auth/network-request-failed" }), "網路連線不穩，請稍後再試。");
  assert.match(friendlyError({ code: "auth/user-token-expired" }), /重新登入/);
});

test("unknown English text never leaks to the screen", () => {
  assert.equal(friendlyError(new Error("Something weird happened at 0xDEADBEEF")), "發生未預期的問題，請稍後再試。");
  assert.equal(friendlyError(undefined, { fallback: "設定失敗，請稍後再試。" }), "設定失敗，請稍後再試。");
});

test("the app's own Chinese messages pass through", () => {
  assert.equal(friendlyError(new Error("這組認證碼已被使用")), "這組認證碼已被使用");
});
