import React, { useEffect, useState } from "react";
import { get, ref, runTransaction, update } from "firebase/database";
import { signOut } from "firebase/auth";
import { auth, db } from "./firebase";
import { readPath } from "./firebaseRead";
import { accountStudentIds } from "./studentRecords.js";
import StudentCard from "./StudentCard.jsx";

/* What families and students see after logging in: their own child's card,
   straight away. The teacher's app keeps these copies up to date by itself. */

const ADMIN_EMAIL = "yzhsage@gmail.com";
export function isAdminUser(user) { return user?.email?.toLowerCase() === ADMIN_EMAIL; }

const isPermission = (error) => /permission/i.test(String(error?.code || error?.message || error || ""));

function ActivationView({ user, onBound, onCancel }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function activate(event) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setBusy(true);
    setError("");
    try {
      const inviteRef = ref(db, `portalInvites/${normalized}`);
      let invite = null;
      try { invite = (await get(inviteRef)).val(); }
      catch (err) {
        if (isPermission(err)) throw new Error("認證碼不正確、已被使用或已停用，請再確認一次。");
        throw new Error("網路不穩，請稍後再試。");
      }
      if (!invite || invite.revoked || (invite.claimedBy && invite.claimedBy !== user.uid)) throw new Error("認證碼不正確、已被使用或已停用，請再確認一次。");
      if (!invite.studentId) throw new Error("這組認證碼還沒有指定學生，請聯絡老師。");
      if (invite.claimedBy !== user.uid) {
        const claim = await runTransaction(inviteRef, (current) => {
          if (!current || current.revoked || current.claimedBy) return;
          return { ...current, claimedBy: user.uid, claimedAt: new Date().toISOString() };
        });
        if (!claim.committed) throw new Error("這組認證碼剛剛已被其他帳戶使用。");
      }
      // Safe to repeat: if a previous try stopped halfway, entering the same
      // code again finishes the binding.
      await update(ref(db, `portalAccounts/${user.uid}`), {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        boundAt: new Date().toISOString(),
        [`studentIds/${invite.studentId}`]: normalized,
      });
      onBound(invite.studentId);
    } catch (err) {
      setError(err.message || "設定失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-shell">
      <div className="portal-box portal-activation">
        <div className="portal-kicker">教學紀錄</div>
        <h1>{onCancel ? "綁定另一位學生" : "第一次登入"}</h1>
        <p>請輸入老師給你的 8 碼認證碼。只需要輸入一次，之後登入就會直接看到學生的學習紀錄。</p>
        <form onSubmit={activate}>
          <label className="portal-field"><span>8 碼認證碼</span><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="例如 A7K3P9Q2" maxLength={8} autoFocus autoComplete="off" /></label>
          {error && <div className="portal-error" role="alert">{error}</div>}
          <button className="portal-primary" disabled={busy || code.trim().length < 8}>{busy ? "設定中…" : "開始查看"}</button>
        </form>
        {onCancel
          ? <button className="portal-link" onClick={onCancel}>取消，回到學習紀錄</button>
          : <button className="portal-link" onClick={() => signOut(auth)}>改用其他帳戶登入</button>}
        <div className="portal-who">目前登入：{user.email || user.displayName || "（沒有電子郵件）"}</div>
      </div>
      <style>{PORTAL_CSS}</style>
    </div>
  );
}

export default function ParentPortal({ user }) {
  const [state, setState] = useState({ status: "loading", error: "" });
  const [studentIds, setStudentIds] = useState([]);
  const [entries, setEntries] = useState({}); // id -> { data, error }
  const [activeId, setActiveId] = useState("");
  const [adding, setAdding] = useState(false);

  async function load(preferId) {
    setState({ status: "loading", error: "" });
    try {
      const account = await readPath(`portalAccounts/${user.uid}`, "帳戶資料");
      const ids = accountStudentIds(account);
      const results = await Promise.allSettled(ids.map((id) => readPath(`portalStudentData/${id}`, "學習紀錄")));
      const next = {};
      ids.forEach((id, index) => {
        const result = results[index];
        if (result.status === "fulfilled") next[id] = { data: result.value, error: result.value ? "" : "missing" };
        else next[id] = { data: null, error: isPermission(result.reason) ? "denied" : "failed" };
      });
      setStudentIds(ids);
      setEntries(next);
      setActiveId((current) => [preferId, current].find((id) => id && ids.includes(id)) || ids.find((id) => next[id]?.data) || ids[0] || "");
      setState({ status: "ready", error: "" });
    } catch (err) {
      setState({ status: "error", error: isPermission(err) ? "沒有讀取權限" : "網路不穩或連線還沒準備好" });
    }
  }

  useEffect(() => { load(); }, [user.uid]);

  useEffect(() => {
    const timer = setInterval(() => load(activeId), 30000);
    return () => clearInterval(timer);
  }, [user.uid, activeId]);

  if (state.status === "loading") return <div className="portal-shell"><div className="portal-loading">載入中…</div><style>{PORTAL_CSS}</style></div>;
  if (state.status === "error") {
    return (
      <div className="portal-shell">
        <div className="portal-box portal-activation"><h1>資料暫時無法載入</h1><p>{state.error}，請再試一次。</p><button className="portal-primary" onClick={() => load()}>重新載入</button><button className="portal-link" onClick={() => signOut(auth)}>登出</button></div>
        <style>{PORTAL_CSS}</style>
      </div>
    );
  }
  if (!studentIds.length || adding) {
    return <ActivationView user={user} onCancel={studentIds.length ? () => setAdding(false) : null} onBound={(id) => { setAdding(false); load(id); }} />;
  }

  const active = entries[activeId] || {};
  const nameOf = (id) => entries[id]?.data?.student?.displayName || "學生";

  return (
    <div className="portal-shell">
      <header className="portal-top">
        <div className="portal-brand">教學紀錄 · 學習紀錄查詢</div>
        <div className="portal-top-actions">
          <button className="portal-link" onClick={() => setAdding(true)}>＋綁定另一位學生</button>
          <button className="portal-link" onClick={() => signOut(auth)}>登出</button>
        </div>
      </header>
      {studentIds.length > 1 && (
        <nav className="portal-tabs" aria-label="選擇學生">
          {studentIds.map((id) => <button key={id} className={id === activeId ? "active" : ""} onClick={() => setActiveId(id)}>{nameOf(id)}</button>)}
        </nav>
      )}
      <main className="portal-main">
        {active.data ? <StudentCard key={activeId} snapshot={active.data} parentMode /> : (
          <div className="portal-box">
            {active.error === "denied" && <><h1>這位學生的紀錄目前無法查看</h1><p>認證碼可能已被老師停用，或需要重新輸入一次。如果有新的認證碼，請按下方按鈕輸入。</p><button className="portal-primary" onClick={() => setAdding(true)}>輸入認證碼</button></>}
            {active.error === "missing" && <><h1>學習紀錄準備中</h1><p>老師那邊還沒有產生這位學生的紀錄，通常老師下次開啟系統後就會出現，請稍後再回來看看。</p><button className="portal-primary" onClick={() => load(activeId)}>重新整理</button></>}
            {active.error === "failed" && <><h1>資料暫時無法載入</h1><p>網路不穩或連線還沒準備好，請再試一次。</p><button className="portal-primary" onClick={() => load(activeId)}>重新載入</button></>}
          </div>
        )}
      </main>
      <style>{PORTAL_CSS}</style>
    </div>
  );
}

const PORTAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700&family=Noto+Sans+TC:wght@400;500;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
.portal-shell{min-height:100vh;background:#FAF8F3;color:#21262B;font-family:'Noto Sans TC',-apple-system,BlinkMacSystemFont,sans-serif;padding:18px 16px 48px;box-sizing:border-box}
.portal-shell *{box-sizing:border-box}
.portal-top,.portal-tabs,.portal-main{width:min(980px,100%);margin:0 auto}
.portal-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid #E1DACB;margin-bottom:16px}
.portal-brand{font-family:'Noto Serif TC',serif;font-weight:700;font-size:15px}
.portal-top-actions{display:flex;gap:4px;flex-wrap:wrap}
.portal-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
.portal-tabs button{border:1px solid #E1DACB;background:#FFF;border-radius:999px;padding:8px 16px;font-size:14px;color:#5B6672;cursor:pointer;font-family:inherit}
.portal-tabs button.active{background:#21262B;border-color:#21262B;color:#FFF;font-weight:700}
.portal-box{background:#FFF;border:1px solid #E1DACB;border-radius:16px;padding:24px;line-height:1.7}
.portal-box h1{font-family:'Noto Serif TC',serif;font-size:22px;margin:4px 0 6px}
.portal-box p{color:#5B6672;font-size:14px;margin:0 0 14px}
.portal-activation{max-width:420px;margin:8vh auto 0}
.portal-kicker{color:#B8863B;font-size:12px;font-weight:700;letter-spacing:.08em}
.portal-field{display:grid;gap:6px;margin:6px 0 12px}
.portal-field span{font-size:13px;font-weight:700}
.portal-field input{border:1px solid #D9D5CE;border-radius:10px;padding:12px;font-size:20px;letter-spacing:.15em;font-family:'IBM Plex Mono',monospace;text-transform:uppercase}
.portal-primary{display:block;width:100%;border:0;border-radius:10px;padding:12px 16px;background:#21262B;color:#FFF;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit}
.portal-primary:disabled{opacity:.4;cursor:default}
.portal-link{border:0;background:none;color:#5B6672;cursor:pointer;padding:8px;font-size:13px;font-family:inherit}
.portal-activation .portal-link{display:block;margin:10px auto 0}
.portal-error{color:#B23A34;font-size:13px;margin:0 0 10px}
.portal-who{text-align:center;font-size:12px;color:#8A8F95;margin-top:6px;overflow-wrap:anywhere}
.portal-loading{min-height:80vh;display:grid;place-items:center;color:#5B6672}
`;
