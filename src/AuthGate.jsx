import React, { useEffect, useState } from "react";
import { GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth } from "./firebase";
import ParentPortal, { isAdminUser } from "./ParentPortal.jsx";

const TEACHER_EMAIL = "yzhsage@gmail.com";
const googleProvider = new GoogleAuthProvider();

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [portalMode, setPortalMode] = useState("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => setUser(nextUser)), []);

  async function handleGoogleLogin() {
    setError(""); setLoading(true);
    try { await signInWithPopup(auth, googleProvider); }
    catch (err) { setError(err.code === "auth/popup-closed-by-user" ? "登入視窗已關閉。" : "Google 登入失敗，請確認 Firebase 已啟用 Google 登入。"); }
    finally { setLoading(false); }
  }

  async function handleTeacherLogin(event) {
    event.preventDefault(); setError(""); setLoading(true);
    try { await signInWithEmailAndPassword(auth, TEACHER_EMAIL, password); }
    catch (err) { setError("管理者密碼錯誤，請再試一次。"); }
    finally { setLoading(false); setPassword(""); }
  }

  async function handlePortalEmail(event) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      if (portalMode === "register") await createUserWithEmailAndPassword(auth, email.trim(), password);
      else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const messages = {
        "auth/email-already-in-use": "這個電子郵件已註冊，請改用登入。",
        "auth/invalid-credential": "電子郵件或密碼錯誤。",
        "auth/weak-password": "密碼至少需要 6 個字元。",
        "auth/invalid-email": "電子郵件格式不正確。",
      };
      setError(messages[err.code] || "登入失敗，請稍後再試。");
    } finally { setLoading(false); setPassword(""); }
  }

  if (user === undefined) return <div className="auth-shell"><div className="auth-loading">載入中…</div><style>{AUTH_CSS}</style></div>;
  if (user && !isAdminUser(user)) return <ParentPortal user={user} />;
  if (user) return children;

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-title">教學紀錄系統</div>
        <button type="button" className="google-btn" onClick={handleGoogleLogin} disabled={loading}>使用 Google 帳戶登入</button>
        <div className="auth-divider"><span>家長／學生電子郵件登入</span></div>
        <div className="auth-mode-tabs"><button type="button" className={portalMode === "login" ? "active" : ""} onClick={() => { setPortalMode("login"); setError(""); }}>登入</button><button type="button" className={portalMode === "register" ? "active" : ""} onClick={() => { setPortalMode("register"); setError(""); }}>首次註冊</button></div>
        <form onSubmit={handlePortalEmail}>
          <input type="email" className="auth-input" placeholder="家長／學生電子郵件" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input type="password" className="auth-input" placeholder="密碼（至少 6 個字元）" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={portalMode === "register" ? "new-password" : "current-password"} />
          <button type="submit" className="portal-email-btn" disabled={loading || !email.trim() || password.length < 6}>{portalMode === "register" ? "建立家長／學生帳戶" : "家長／學生登入"}</button>
        </form>
        <div className="auth-divider"><span>管理者登入</span></div>
        <form onSubmit={handleTeacherLogin}>
          <input type="password" className="auth-input" placeholder="請輸入管理者密碼" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-btn" disabled={loading || !password}>{loading ? "登入中…" : "管理者登入"}</button>
        </form>
      </div>
      <style>{AUTH_CSS}</style>
    </div>
  );
}

const AUTH_CSS = `
.auth-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F4F1EA;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif;padding:20px}.auth-card{width:100%;max-width:360px;background:#FFF;border:1px solid #E4DFD3;border-radius:14px;padding:28px 24px;display:flex;flex-direction:column;gap:12px;box-shadow:0 2px 10px rgba(0,0,0,.04)}.auth-title{font-family:"Noto Serif TC",serif;font-weight:700;font-size:19px;text-align:center;margin-bottom:6px;color:#2A2A28}.auth-input{width:100%;box-sizing:border-box;border:1px solid #D9D9D5;border-radius:9px;padding:10px 12px;font-size:15px;font-family:inherit;margin-bottom:8px}.auth-error{color:#B23A34;font-size:12.5px;margin:8px 0}.auth-btn,.google-btn,.portal-email-btn{border:0;border-radius:9px;padding:10px 12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;width:100%}.auth-btn{background:#B8863B;color:#FFF}.google-btn{background:#FFF;color:#2A2A28;border:1px solid #C9C9C4}.portal-email-btn{background:#E56D5A;color:#FFF}.auth-btn:disabled,.google-btn:disabled,.portal-email-btn:disabled{opacity:.6;cursor:default}.auth-divider{display:flex;align-items:center;gap:8px;color:#8A8D91;font-size:12px;margin:6px 0}.auth-divider:before,.auth-divider:after{content:"";height:1px;background:#E8E5DE;flex:1}.auth-mode-tabs{display:flex;gap:6px}.auth-mode-tabs button{flex:1;border:1px solid #E2DED6;background:#FFF;border-radius:8px;padding:7px;color:#8A8D91;cursor:pointer}.auth-mode-tabs button.active{background:#FFF0EC;border-color:#E56D5A;color:#C45142;font-weight:800}.auth-loading{color:#71757A;font-size:14px}
`;
