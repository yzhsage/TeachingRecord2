/* Checks a pasted video link BEFORE it is saved.
   Families and students only see links that start with http:// or https://
   (anything else is ignored on their page), so a link such as "youtu.be/abc"
   used to be saved without any sign that nobody could open it.

     ""                      -> ok, clears the link
     https://youtu.be/abc    -> ok, kept as typed
     youtu.be/abc            -> ok, https:// is added
     javascript:..., ftp:..  -> not ok, with a message
     text with spaces        -> not ok, with a message */
export function normalizeVideoLink(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: true, url: "" };
  if (/\s/.test(text)) return { ok: false, message: "連結不能含空白，請重新貼上。" };
  if (/^https?:\/\//i.test(text)) {
    try {
      new URL(text);
      return { ok: true, url: text };
    } catch {
      return { ok: false, message: "連結格式不正確，請貼上完整網址。" };
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return { ok: false, message: "連結需以 http:// 或 https:// 開頭。" };
  if (/^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text)) return { ok: true, url: `https://${text}` };
  return { ok: false, message: "連結格式不正確，請貼上完整網址。" };
}
