/* Turns whatever Firebase / the network throws into one short Chinese sentence.
   Raw English messages ("PERMISSION_DENIED", "Failed to fetch") never reach the screen. */

const HAS_CJK = /[\u4e00-\u9fff]/;

export function friendlyError(error, { audience = "teacher", fallback = "發生未預期的問題，請稍後再試。" } = {}) {
  const code = String(error?.code || "");
  const raw = String(error?.message || error || "");
  const text = `${code} ${raw}`;
  if (/permission[_ -]?denied|permission/i.test(text)) {
    return audience === "parent" ? "沒有權限查看，請確認登入的帳號，或聯絡老師。" : "沒有讀取或寫入權限（Firebase 規則可能還沒更新）";
  }
  if (/network|fetch|offline|unavailable|timeout|timed out|ERR_/i.test(text)) return "網路連線不穩，請稍後再試。";
  if (/unauthenticated|token-expired|requires-recent-login/i.test(text)) return "登入已過期，請重新登入。";
  if (/quota|resource-exhausted|too-many-requests/i.test(text)) return "操作太頻繁或已達用量上限，請稍後再試。";
  if (HAS_CJK.test(raw)) return raw; // the app's own Chinese messages pass through
  return fallback;
}
