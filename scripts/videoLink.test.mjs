import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVideoLink } from "../src/videoLink.js";

test("an empty box is fine: it clears the link", () => {
  assert.deepEqual(normalizeVideoLink(""), { ok: true, url: "" });
  assert.deepEqual(normalizeVideoLink("   "), { ok: true, url: "" });
  assert.deepEqual(normalizeVideoLink(undefined), { ok: true, url: "" });
});

test("http and https links are kept as typed (surrounding spaces trimmed)", () => {
  assert.deepEqual(normalizeVideoLink("https://youtu.be/abc"), { ok: true, url: "https://youtu.be/abc" });
  assert.deepEqual(normalizeVideoLink("  http://example.com/v?id=1&t=5  "), { ok: true, url: "http://example.com/v?id=1&t=5" });
  assert.deepEqual(normalizeVideoLink("HTTPS://drive.google.com/file/d/xyz/view?usp=sharing"), { ok: true, url: "HTTPS://drive.google.com/file/d/xyz/view?usp=sharing" });
});

test("a link without the scheme gets https:// so families can open it", () => {
  assert.deepEqual(normalizeVideoLink("youtu.be/abc"), { ok: true, url: "https://youtu.be/abc" });
  assert.deepEqual(normalizeVideoLink("www.youtube.com/watch?v=abc"), { ok: true, url: "https://www.youtube.com/watch?v=abc" });
  assert.deepEqual(normalizeVideoLink("drive.google.com/file/d/xyz/view"), { ok: true, url: "https://drive.google.com/file/d/xyz/view" });
});

test("other schemes, spaces and plain text are rejected with a message, never saved", () => {
  for (const bad of ["javascript:alert(1)", "ftp://example.com/a", "mailto:a@b.com", "file:///C:/a.mp4"]) {
    const result = normalizeVideoLink(bad);
    assert.equal(result.ok, false, bad);
    assert.match(result.message, /http/);
  }
  assert.equal(normalizeVideoLink("https://youtu.be/a b").ok, false);
  assert.equal(normalizeVideoLink("影片在雲端硬碟").ok, false);
  assert.equal(normalizeVideoLink("abc").ok, false);
  assert.equal(normalizeVideoLink("https://").ok, false);
});
