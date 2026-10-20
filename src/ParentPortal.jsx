import React, { useEffect, useMemo, useState } from "react";
import { get, ref, set, runTransaction } from "firebase/database";
import { signOut } from "firebase/auth";
import { auth, db } from "./firebase";
import { attendanceBaseStatus, attendanceHasStatus } from "./attendance";

const ADMIN_EMAIL = "yzhsage@gmail.com";
function accountStudentIds(account) {
  if (Array.isArray(account?.studentIds)) return account.studentIds.filter(Boolean);
  if (account?.studentIds && typeof account.studentIds === "object") return Object.entries(account.studentIds).filter(([, allowed]) => allowed === true).map(([id]) => id);
  return account?.studentId ? [account.studentId] : [];
}

function fmtDate(value) {
  return value ? String(value).replaceAll("-", "/") : "";
}

function valuesOf(value) {
  return value && typeof value === "object" ? Object.values(value) : [];
}

function ActivationView({ user, onBound, existingAccount = null }) {
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
      const snapshot = await get(inviteRef);
      const invite = snapshot.val();
      if (!invite || invite.revoked || (invite.claimedBy && invite.claimedBy !== user.uid)) {
        throw new Error("啟用碼無效、已使用或已失效。");
      }
      if (!invite.studentId) throw new Error("啟用碼尚未指定學生，請聯絡管理者。");
      const claim = await runTransaction(inviteRef, (current) => {
        if (!current || current.revoked || (current.claimedBy && current.claimedBy !== user.uid)) return;
        return { ...current, claimedBy: user.uid, claimedAt: new Date().toISOString() };
      });
      if (!claim.committed) throw new Error("啟用碼已被其他帳號使用。");
      await set(ref(db, `portalAccounts/${user.uid}`), {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        studentId: invite.studentId,
        studentIds: Object.fromEntries([...new Set([...accountStudentIds(existingAccount), invite.studentId])].map((id) => [id, true])),
        inviteCode: normalized,
        role: invite.role || "parent",
        boundAt: new Date().toISOString(),
      });
      onBound(invite.studentId);
    } catch (err) {
      setError(err.message || "啟用失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-shell">
      <div className="portal-card portal-activation-card">
        <div className="portal-kicker">TeachingRecord2</div>
        <h1>第一次登入設定</h1>
        <p>此 Google 帳戶尚未綁定學生。請輸入管理者提供的個別啟用碼，系統會直接開啟指定學生的資料。</p>
        <form onSubmit={activate}>
          <label className="portal-field"><span>個別啟用碼</span><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="請輸入啟用碼" autoFocus /></label>
          {error && <div className="portal-error">{error}</div>}
          <button className="portal-primary" disabled={busy || !code.trim()}>{busy ? "設定中…" : "開始查看"}</button>
        </form>
        <button className="portal-link-button" onClick={() => signOut(auth)}>使用其他 Google 帳戶</button>
      </div>
    </div>
  );
}

function scoreRows(assessments, studentId) {
  return valuesOf(assessments).filter((row) => row.studentId === studentId && row.score !== "" && row.score != null)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function attendanceRows(attendance, journal, studentId, classIds) {
  const rows = valuesOf(attendance).filter((row) => row.studentId === studentId && classIds.has(row.classId));
  const journalByKey = new Map(valuesOf(journal).map((row) => [`${row.classId}|${row.date}`, row]));
  return rows.map((row) => ({ ...row, journal: journalByKey.get(`${row.classId}|${row.date}`) || {} }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export default function ParentPortal({ user }) {
  const [account, setAccount] = useState(null);
  const [student, setStudent] = useState(null);
  const [classes, setClasses] = useState({});
  const [assessments, setAssessments] = useState({});
  const [attendance, setAttendance] = useState({});
  const [journal, setJournal] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [addingChild, setAddingChild] = useState(false);

  async function loadAccount() {
    setLoading(true);
    setError("");
    try {
      const accountSnapshot = await get(ref(db, `portalAccounts/${user.uid}`));
      const nextAccount = accountSnapshot.val();
      setAccount(nextAccount || null);
      const studentIds = accountStudentIds(nextAccount);
      if (!studentIds.length) return;
      const activeStudentId = selectedStudentId && studentIds.includes(selectedStudentId) ? selectedStudentId : studentIds[0];
      setSelectedStudentId(activeStudentId);
      const portalSnapshot = await get(ref(db, `portalStudentData/${activeStudentId}`));
      const portalData = portalSnapshot.val();
      if (!portalData) throw new Error("管理者尚未同步這位學生的查閱資料，請聯絡管理者。");
      setStudent(portalData.student || null); setClasses(portalData.classes || {}); setAssessments(portalData.assessments || {}); setAttendance(portalData.attendance || {}); setJournal(portalData.journal || {});
    } catch (err) {
      setError(err.message || "資料載入失敗。");
    } finally { setLoading(false); }
  }

  useEffect(() => { loadAccount(); }, [user.uid, selectedStudentId]);

  const enrollmentRows = useMemo(() => valuesOf(student?.enrollments), [student]);
  const classIds = useMemo(() => new Set(enrollmentRows.map((row) => row.classId)), [enrollmentRows]);
  const scoreList = useMemo(() => scoreRows(assessments, student?.id), [assessments, student]);
  const attendanceList = useMemo(() => attendanceRows(attendance, journal, student?.id, classIds), [attendance, journal, student, classIds]);

  if (loading) return <div className="portal-shell"><div className="portal-loading">載入中…</div></div>;
  const boundStudentIds = accountStudentIds(account);
  if (!boundStudentIds.length || addingChild) return <ActivationView user={user} existingAccount={account} onBound={(studentId) => { setAddingChild(false); setSelectedStudentId(studentId); loadAccount(); }} />;
  if (error) return <div className="portal-shell"><div className="portal-card"><h1>資料暫時無法載入</h1><p className="portal-error">{error}</p><button className="portal-primary" onClick={loadAccount}>重新載入</button></div></div>;

  return (
    <div className="portal-shell">
      <header className="portal-header"><div><div className="portal-kicker">TeachingRecord2 · 學習紀錄</div><h1>{student?.displayName || "學生"}</h1><p>這是您的個人學習紀錄</p>{boundStudentIds.length > 1 && <label className="portal-switcher"><span>切換學生</span><select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>{boundStudentIds.map((id) => <option key={id} value={id}>{id === student?.id ? student.displayName : id}</option>)}</select></label>}<button className="portal-link-button" onClick={() => setAddingChild(true)}>＋綁定另一位學生</button></div><button className="portal-link-button" onClick={() => signOut(auth)}>登出</button></header>
      <main className="portal-main">
        <section className="portal-card"><h2>目前班級</h2><div className="portal-class-list">{enrollmentRows.map((enrollment) => <div className="portal-class-chip" key={enrollment.id}>{enrollment.className || classes[enrollment.classId]?.name || "班級"}<span>{enrollment.school || ""}{enrollment.group ? ` · ${enrollment.group}` : ""}</span></div>)}</div></section>
        <section className="portal-card"><h2>歷次成績</h2>{scoreList.length === 0 ? <p className="portal-muted">目前沒有可顯示的成績。</p> : <div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>考試</th><th>日期</th><th>班級</th><th>成績</th></tr></thead><tbody>{scoreList.map((row) => <tr key={`${row.type}-${row.assessmentId}-${row.classId}`}><td>{row.name || "評量"}</td><td>{row.type === "exam" ? "" : fmtDate(row.date)}</td><td>{classes[row.classId]?.name || ""}</td><td className="portal-score">{row.score}</td></tr>)}</tbody></table></div>}</section>
        <section className="portal-card"><h2>出缺勤與補課</h2>{attendanceList.length === 0 ? <p className="portal-muted">目前沒有可顯示的出缺勤紀錄。</p> : <div className="portal-attendance-list">{attendanceList.map((row) => { const absent = ["請假", "曠課"].includes(attendanceBaseStatus(row.status)); const video = row.journal?.videoUrl; return <article className="portal-attendance-row" key={`${row.classId}-${row.date}`}><div><strong>{fmtDate(row.date)}</strong><span>{classes[row.classId]?.name || ""}</span></div><div className="portal-status">{Array.isArray(row.status) ? row.status.join("、") : row.status}</div><div className="portal-journal">{row.journal?.content && <p><b>教學內容：</b>{row.journal.content}</p>}{row.journal?.note && <p><b>備註：</b>{row.journal.note}</p>}{absent && video && <a href={video} target="_blank" rel="noreferrer">開啟補課影片</a>}</div></article>; })}</div>}</section>
      </main>
      <style>{PORTAL_CSS}</style>
    </div>
  );
}

export function isAdminUser(user) { return user?.email?.toLowerCase() === ADMIN_EMAIL; }

function makeCode() {
  return `TR-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function buildStudentPortalData(studentId, students, classes, assessments, attendance, journal) {
  const student = students[studentId];
  if (!student) return null;
  const classIds = new Set(Object.values(student.enrollments || {}).map((item) => item.classId));
  return {
    generatedAt: new Date().toISOString(),
    student: { id: student.id, displayName: student.displayName || student.name || "", enrollments: student.enrollments || {} },
    classes: Object.fromEntries(Object.entries(classes || {}).filter(([id]) => classIds.has(id)).map(([id, item]) => [id, { id, name: item.name || "", subject: item.subject || "", grade: item.grade || "" }])),
    assessments: Object.fromEntries(Object.entries(assessments || {}).filter(([, item]) => item.studentId === studentId && classIds.has(item.classId))),
    attendance: Object.fromEntries(Object.entries(attendance || {}).filter(([, item]) => item.studentId === studentId && classIds.has(item.classId))),
    journal: Object.fromEntries(Object.entries(journal || {}).filter(([, item]) => classIds.has(item.classId))),
  };
}

export function PortalAdminPanel({ onClose }) {
  const [students, setStudents] = useState({});
  const [classes, setClasses] = useState({});
  const [accounts, setAccounts] = useState({});
  const [code, setCode] = useState("");
  const [studentId, setStudentId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [studentSnap, classSnap, accountSnap] = await Promise.all([get(ref(db, "students")), get(ref(db, "classes")), get(ref(db, "portalAccounts"))]);
    setStudents(studentSnap.val() || {}); setClasses(classSnap.val() || {}); setAccounts(accountSnap.val() || {});
    if (!studentId) setStudentId(Object.keys(studentSnap.val() || {})[0] || "");
  }
  useEffect(() => { load().catch((err) => setMessage(err.message)); }, []);

  async function createInvite() {
    if (!studentId) return;
    setBusy(true); setMessage("");
    try { const nextCode = makeCode(); await set(ref(db, `portalInvites/${nextCode}`), { code: nextCode, studentId, role: "parent", createdAt: new Date().toISOString(), revoked: false }); setCode(nextCode); setMessage("啟用碼已建立，請複製給家長或學生。"); }
    catch (err) { setMessage(err.message || "建立啟用碼失敗"); } finally { setBusy(false); }
  }

  async function syncAll() {
    setBusy(true); setMessage("");
    try {
      const [assessmentSnap, attendanceSnap, journalSnap] = await Promise.all([get(ref(db, "assessments")), get(ref(db, "attendance")), get(ref(db, "attendanceJournal"))]);
      const next = {};
      for (const id of Object.keys(students)) next[id] = buildStudentPortalData(id, students, classes, assessmentSnap.val() || {}, attendanceSnap.val() || {}, journalSnap.val() || {});
      await set(ref(db, "portalStudentData"), next); setMessage(`已同步 ${Object.keys(next).length} 位學生的查閱資料。`);
    } catch (err) { setMessage(err.message || "同步失敗"); } finally { setBusy(false); }
  }

  return <div className="portal-admin-overlay"><div className="portal-admin-card"><div className="portal-admin-head"><div><div className="portal-kicker">家長／學生查閱</div><h2>帳戶與啟用碼管理</h2></div><button className="portal-link-button" onClick={onClose}>關閉</button></div><p className="portal-muted">先同步查閱資料，再建立指定學生的個別啟用碼。家長可用同一個 Google 帳戶分次綁定多位學生。</p><div className="portal-admin-actions"><button className="portal-primary" disabled={busy} onClick={syncAll}>同步全部學生查閱資料</button><label className="portal-field"><span>指定學生</span><select value={studentId} onChange={(e) => setStudentId(e.target.value)}>{Object.entries(students).map(([id, item]) => <option key={id} value={id}>{item.displayName || item.name || id}</option>)}</select></label><button className="portal-primary" disabled={busy || !studentId} onClick={createInvite}>建立個別啟用碼</button>{code && <div className="portal-code">{code}</div>}</div>{message && <div className="portal-admin-message">{message}</div>}<h3>目前已綁定帳戶</h3>{Object.keys(accounts).length === 0 ? <p className="portal-muted">尚無綁定帳戶。</p> : <div className="portal-account-list">{Object.values(accounts).map((account) => <div key={account.uid}><strong>{account.email || account.uid}</strong><span>{(account.studentIds || [account.studentId]).filter(Boolean).map((id) => students[id]?.displayName || id).join("、")}</span></div>)}</div>}</div><style>{PORTAL_ADMIN_CSS}</style></div>;
}

const PORTAL_CSS = `
.portal-shell{min-height:100vh;background:#F7F4EE;color:#283044;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif;padding:28px 18px}.portal-header,.portal-main{width:min(980px,100%);margin:0 auto}.portal-header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:22px}.portal-header h1,.portal-card h1{margin:4px 0 8px;font-size:30px}.portal-header p,.portal-card p{color:#687080;line-height:1.7}.portal-kicker{color:#E56D5A;font-size:13px;font-weight:800;letter-spacing:.06em}.portal-main{display:grid;gap:16px}.portal-card{background:#FFF;border:1px solid #E7E0D5;border-radius:18px;padding:22px;box-shadow:0 8px 28px rgba(41,49,68,.06)}.portal-card h2{margin:0 0 14px;font-size:18px}.portal-class-list{display:flex;flex-wrap:wrap;gap:10px}.portal-class-chip{background:#EEF5F2;border-radius:12px;padding:10px 14px;font-weight:700}.portal-class-chip span{display:block;color:#6E7A76;font-size:12px;font-weight:500;margin-top:3px}.portal-table-wrap{overflow:auto}.portal-table{width:100%;border-collapse:collapse}.portal-table th,.portal-table td{text-align:left;padding:11px 8px;border-bottom:1px solid #EEE8DE}.portal-table th{color:#687080;font-size:12px}.portal-score{font-weight:800;color:#D15D4D}.portal-muted{margin:0}.portal-attendance-list{display:grid;gap:10px}.portal-attendance-row{display:grid;grid-template-columns:130px 100px 1fr;gap:14px;padding:14px 0;border-bottom:1px solid #EEE8DE}.portal-attendance-row strong,.portal-attendance-row span{display:block}.portal-attendance-row span{font-size:12px;color:#687080;margin-top:4px}.portal-status{font-weight:800;color:#487D72}.portal-journal p{margin:0 0 5px;font-size:13px;white-space:pre-wrap}.portal-journal a{display:inline-block;margin-top:5px;color:#D15D4D;font-weight:800}.portal-activation-card{max-width:430px;margin:10vh auto}.portal-field{display:grid;gap:7px;margin:16px 0}.portal-field span{font-size:13px;font-weight:800}.portal-field input{border:1px solid #D9D5CE;border-radius:10px;padding:12px;font-size:16px}.portal-primary{border:0;border-radius:10px;padding:12px 16px;background:#E56D5A;color:#FFF;font-weight:800;cursor:pointer}.portal-primary:disabled{opacity:.5}.portal-link-button{border:0;background:none;color:#687080;cursor:pointer;padding:8px}.portal-error{color:#B23A34;font-size:13px;margin:10px 0}.portal-loading{min-height:100vh;display:grid;place-items:center;color:#687080}@media(max-width:700px){.portal-attendance-row{grid-template-columns:1fr;gap:5px}.portal-header h1{font-size:25px}}
`;

const PORTAL_ADMIN_CSS = `.portal-admin-overlay{position:fixed;inset:0;z-index:50;background:rgba(31,39,56,.35);padding:7vh 18px;overflow:auto}.portal-admin-card{width:min(760px,100%);margin:0 auto;background:#FFF;border-radius:18px;padding:24px;box-shadow:0 18px 60px rgba(31,39,56,.24)}.portal-admin-head{display:flex;justify-content:space-between;gap:12px}.portal-admin-head h2{margin:4px 0 10px}.portal-admin-actions{display:flex;align-items:end;gap:10px;flex-wrap:wrap}.portal-admin-actions .portal-field{margin:0;min-width:220px}.portal-admin-actions select{border:1px solid #D9D5CE;border-radius:10px;padding:11px;font-size:15px}.portal-code{background:#FFF4D9;border:1px dashed #D5A942;border-radius:10px;padding:12px 16px;font-size:20px;font-weight:900;letter-spacing:.08em}.portal-admin-message{margin-top:14px;padding:10px 12px;background:#EEF5F2;border-radius:10px}.portal-admin-card h3{margin:24px 0 8px}.portal-account-list{display:grid;gap:8px}.portal-account-list>div{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #EEE8DE}.portal-account-list span{color:#687080}`;
