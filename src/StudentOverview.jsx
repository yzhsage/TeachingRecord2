import React, { useEffect, useMemo, useRef, useState } from "react";
import { ref, set, update } from "firebase/database";
import { db } from "./firebase";
import { readPath } from "./firebaseRead";
import { invalidateRecordRoots, loadRecordRoots, onStudentFirstSaved } from "./studentFirstStorage";
import { schedulePortalPublish, subscribePublishStatus } from "./portalPublish";
import { accountStudentIds, buildAllPortalData, buildStudentCard, isStudentStopped } from "./studentRecords.js";
import StudentCard from "./StudentCard.jsx";
import { fmtDate, fmtStamp } from "./dateFormat.js";
import { friendlyError } from "./friendlyError.js";

/* 學生總覽: every student in one list. Clicking a student opens the same card
   the family sees, plus a teacher-only box for 8-digit login codes. */

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function friendly(error) { return friendlyError(error); }

function usePublishStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => subscribePublishStatus(setStatus), []);
  return status;
}

function PublishStatusLine() {
  const status = usePublishStatus();
  if (!status) return null;
  let text = "存檔約 5 秒後自動更新家長端。";
  let tone = "";
  if (status.state === "pending" || status.state === "publishing") text = "更新家長端中…";
  if (status.state === "ok") text = `家長端已更新（${fmtStamp(status.at)}${status.changed ? `，${status.changed} 位學生` : ""}）`;
  if (status.state === "skipped") { text = status.message; tone = "warn"; }
  if (status.state === "error") { text = `家長端更新失敗：${status.message}。1 分鐘後自動重試。`; tone = "bad"; }
  return (
    <div className={`so-publish${tone ? ` so-publish-${tone}` : ""}`} role="status">
      <span>{text}</span>
      {(status.state === "error" || status.state === "skipped") && <button type="button" className="btn-ghost btn-xs" onClick={() => schedulePortalPublish(0)}>立即重試</button>}
    </div>
  );
}

function AccountPanel({ studentId, studentName, invites, accounts, portalError, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");
  const [confirmCode, setConfirmCode] = useState("");

  const studentInvites = Object.values(invites || {})
    .filter((invite) => invite?.studentId === studentId && invite.code)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const inviteByCode = new Map(studentInvites.map((invite) => [invite.code, invite]));
  const accountByUid = new Map(Object.values(accounts || {}).filter((account) => account?.uid).map((account) => [account.uid, account]));
  const bound = Object.values(accounts || {}).filter((account) => {
    if (!accountStudentIds(account).includes(studentId)) return false;
    const code = account.studentIds?.[studentId];
    return typeof code !== "string" || inviteByCode.get(code)?.revoked !== true;
  });

  async function createInvite() {
    setBusy(true); setMessage("");
    try {
      const code = makeCode();
      await set(ref(db, `portalInvites/${code}`), { code, studentId, role: "parent", createdAt: new Date().toISOString(), revoked: false });
      setMessage(`已建立認證碼 ${code}，請交給 ${studentName} 的家長或本人。`);
      await onChanged();
    } catch (error) { setMessage(`建立失敗：${friendly(error)}`); }
    finally { setBusy(false); }
  }

  async function revokeInvite(code) {
    setConfirmCode("");
    setBusy(true); setMessage("");
    try {
      await update(ref(db, `portalInvites/${code}`), { revoked: true, revokedAt: new Date().toISOString() });
      setMessage(`已停用 ${code}。`);
      await onChanged();
    } catch (error) { setMessage(`停用失敗：${friendly(error)}`); }
    finally { setBusy(false); }
  }

  async function copy(code) {
    try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(""), 1500); }
    catch { setCopied(`fail:${code}`); setTimeout(() => setCopied(""), 3000); } // the code is selectable on screen
  }

  return (
    <section className="so-accounts">
      <div className="so-accounts-head">
        <div><h3>家長／學生登入</h3></div>
        <button type="button" className="btn-primary" disabled={busy || !!portalError} onClick={createInvite}>建立 8 碼認證碼</button>
      </div>
      <p className="so-hint">家長／學生以 Google 或電子郵件登入，首次輸入認證碼後即可查看。一組認證碼僅能綁定一個帳戶。</p>
      {portalError && <div className="so-alert">讀不到認證碼清單：{portalError}。請到 Firebase 後台貼上新版規則並按「發布」。</div>}
      {message && <div className="so-note" role="status">{message}</div>}
      <div className="so-accounts-grid">
        <div>
          <h4>認證碼</h4>
          {studentInvites.length === 0 ? <p className="so-muted">還沒有建立。</p> : (
            <ul className="so-codes">
              {studentInvites.map((invite) => {
                const claimer = invite.claimedBy ? accountByUid.get(invite.claimedBy) : null;
                const state = invite.revoked ? "已停用" : invite.claimedBy ? `已綁定${claimer?.email ? `：${claimer.email}` : ""}` : "尚未使用";
                return (
                  <li key={invite.code} className={invite.revoked ? "is-revoked" : ""}>
                    <code>{invite.code}</code>
                    <span className="so-code-state">{confirmCode === invite.code ? `停用後，用這組碼綁定的帳戶會立刻看不到 ${studentName} 的資料。` : state}</span>
                    <span className="so-code-actions">
                      {confirmCode === invite.code ? (
                        <>
                          <button type="button" className="btn-danger btn-xs" disabled={busy} onClick={() => revokeInvite(invite.code)}>確定停用</button>
                          <button type="button" className="btn-ghost btn-xs" onClick={() => setConfirmCode("")}>保留</button>
                        </>
                      ) : (
                        <>
                          {!invite.revoked && !invite.claimedBy && <button type="button" className="btn-ghost btn-xs" onClick={() => copy(invite.code)}>{copied === invite.code ? "已複製" : copied === `fail:${invite.code}` ? "請手動選取" : "複製"}</button>}
                          {!invite.revoked && <button type="button" className="btn-ghost btn-xs" disabled={busy} onClick={() => setConfirmCode(invite.code)}>停用</button>}
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <h4>已綁定帳戶</h4>
          {bound.length === 0 ? <p className="so-muted">尚無綁定。</p> : (
            <ul className="so-bound">{bound.map((account) => <li key={account.uid}>{account.email || account.displayName || account.uid}</li>)}</ul>
          )}
        </div>
      </div>
    </section>
  );
}

export default function StudentOverview() {
  const [records, setRecords] = useState({ status: "loading", roots: null, error: "" });
  const [portal, setPortal] = useState({ accounts: {}, invites: {}, error: "" });
  const [portalLoaded, setPortalLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [showStopped, setShowStopped] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [parentPreview, setParentPreview] = useState(false);
  const [bulkCodeBusy, setBulkCodeBusy] = useState(false);
  const [bulkCodeMessage, setBulkCodeMessage] = useState("");

  async function loadPortal() {
    const [accounts, invites] = await Promise.allSettled([readPath("portalAccounts", "家長帳戶"), readPath("portalInvites", "認證碼")]);
    const failed = [accounts, invites].find((item) => item.status === "rejected");
    setPortal({
      accounts: accounts.status === "fulfilled" ? accounts.value || {} : {},
      invites: invites.status === "fulfilled" ? invites.value || {} : {},
      error: failed ? friendly(failed.reason) : "",
    });
    setPortalLoaded(true);
  }

  async function load(fresh = false) {
    setRecords((current) => ({ ...current, status: current.roots ? "refreshing" : "loading", error: "" }));
    try {
      if (fresh) invalidateRecordRoots();
      const roots = await loadRecordRoots();
      setRecords({ status: "ready", roots, error: "" });
    } catch (error) {
      setRecords((current) => ({ ...current, status: "error", error: friendly(error) }));
    }
    loadPortal();
  }

  async function createMissingInvites(silent = false) {
    if (portal.error) {
      setBulkCodeMessage(`目前無法讀取認證碼清單：${portal.error}`);
      return;
    }
    const existingStudentIds = new Set(Object.values(portal.invites || {}).filter((invite) => invite?.studentId && invite.revoked !== true && !invite.claimedBy).map((invite) => invite.studentId));
    const pending = rows.filter((row) => !existingStudentIds.has(row.id));
    if (!pending.length) {
      if (!silent) setBulkCodeMessage("每位學生都已有認證碼。");
      return;
    }
    setBulkCodeBusy(true); if (!silent) setBulkCodeMessage(`建立 ${pending.length} 位學生的認證碼中…`);
    try {
      const used = new Set(Object.keys(portal.invites || {}));
      const writes = pending.map((row) => {
        let code = makeCode();
        while (used.has(code)) code = makeCode();
        used.add(code);
        return set(ref(db, `portalInvites/${code}`), { code, studentId: row.id, role: "parent", createdAt: new Date().toISOString(), revoked: false });
      });
      await Promise.all(writes);
      if (!silent) setBulkCodeMessage(`已自動建立 ${pending.length} 位學生的 8 碼認證碼。`);
      await loadPortal();
    } catch (error) {
      setBulkCodeMessage(`自動建立失敗：${friendly(error)}`);
    } finally { setBulkCodeBusy(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => onStudentFirstSaved((key) => {
    if (key === "classIndex" || key === "studentIndex") load(true);
  }), []);

  const snapshots = useMemo(() => (records.roots ? buildAllPortalData(records.roots) : {}), [records.roots]);
  const classOptions = useMemo(() => Object.values(records.roots?.classes || {})
    .filter((cls) => cls?.id)
    .sort((a, b) => Number(Boolean(a.archived)) - Number(Boolean(b.archived)) || String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant")), [records.roots]);

  const rows = useMemo(() => {
    const boundCount = new Map();
    for (const account of Object.values(portal.accounts || {})) for (const id of accountStudentIds(account)) boundCount.set(id, (boundCount.get(id) || 0) + 1);
    return Object.entries(snapshots).map(([id, snapshot]) => {
      const card = buildStudentCard(snapshot);
      return { id, snapshot, card, stopped: isStudentStopped(snapshot), bound: boundCount.get(id) || 0 };
    }).sort((a, b) => a.card.student.name.localeCompare(b.card.student.name, "zh-Hant"));
  }, [snapshots, portal.accounts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showStopped && row.stopped) return false;
      if (classFilter !== "all" && !row.card.classes.some((cls) => cls.id === classFilter)) return false;
      if (!q) return true;
      const haystack = [row.card.student.name, ...row.card.classes.flatMap((cls) => [cls.name, cls.school])].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, classFilter, showStopped]);

  const selectedIndex = visible.findIndex((row) => row.id === selectedId);
  const selected = rows.find((row) => row.id === selectedId) || null;

  const autoCodeRun = useRef("");
  const studentSignature = rows.map((row) => row.id).sort().join(",");
  useEffect(() => {
    if (records.status !== "ready" || !portalLoaded || portal.error || !studentSignature || autoCodeRun.current === studentSignature) return;
    autoCodeRun.current = studentSignature;
    createMissingInvites(true);
  }, [records.status, portalLoaded, portal.error, studentSignature, portal.invites]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setSelectedId(null); };
    window.addEventListener("keydown", onKey);
    window.scrollTo({ top: 0 });
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  useEffect(() => {
    setParentPreview(false);
  }, [selectedId]);

  if (records.status === "loading") return <div className="view-pad"><div className="so-loading">讀取中…</div><style>{OVERVIEW_CSS}</style></div>;
  if (records.status === "error" && !records.roots) {
    return (
      <div className="view-pad">
        <div className="so-error-card"><h3>學生資料讀取失敗</h3><p>{records.error}。資料沒有遺失，請重試。</p><button type="button" className="btn-primary" onClick={() => load(true)}>重新讀取</button></div>
        <style>{OVERVIEW_CSS}</style>
      </div>
    );
  }

  if (selected) {
    const prev = selectedIndex > 0 ? visible[selectedIndex - 1] : null;
    const next = selectedIndex >= 0 && selectedIndex < visible.length - 1 ? visible[selectedIndex + 1] : null;
    return (
      <div className="view-pad so-detail">
        <div className="so-detail-bar">
          <button type="button" className="so-back" onClick={() => setSelectedId(null)}>← 回學生總覽</button>
          <div className="so-detail-nav">
            <button type="button" className={parentPreview ? "btn-ghost btn-sm is-on" : "btn-ghost btn-sm"} onClick={() => setParentPreview((value) => !value)}>{parentPreview ? "切回教師畫面" : "預覽家長畫面"}</button>
            {selectedIndex >= 0 && <span className="so-count">{selectedIndex + 1} / {visible.length}</span>}
            <button type="button" className="btn-ghost btn-sm" disabled={!prev} onClick={() => prev && setSelectedId(prev.id)}>上一位</button>
            <button type="button" className="btn-ghost btn-sm" disabled={!next} onClick={() => next && setSelectedId(next.id)}>下一位</button>
          </div>
        </div>
        {parentPreview && <div className="so-preview-note">家長畫面預覽（出缺勤、補課只顯示近兩個月）</div>}
        <StudentCard
          key={selected.id}
          snapshot={selected.snapshot}
          parentMode={parentPreview}
          footer={parentPreview ? null : <AccountPanel studentId={selected.id} studentName={selected.card.student.name} invites={portal.invites} accounts={portal.accounts} portalError={portal.error} onChanged={loadPortal} />}
        />
        <style>{OVERVIEW_CSS}</style>
      </div>
    );
  }

  return (
    <div className="view-pad">
      <div className="so-head">
        <div>
          <h2 className="so-title">學生總覽</h2>
          <div className="so-subtitle">在學 {rows.filter((row) => !row.stopped).length} 人{rows.some((row) => row.stopped) ? `，已停課 ${rows.filter((row) => row.stopped).length} 人` : ""}</div>
        </div>
        <div className="so-head-actions"><button type="button" className="btn-primary" disabled={bulkCodeBusy || !!portal.error} onClick={createMissingInvites}>{bulkCodeBusy ? "自動建立中…" : "自動建立全部認證碼"}</button><button type="button" className="btn-ghost" disabled={records.status === "refreshing"} onClick={() => load(true)}>{records.status === "refreshing" ? "讀取中…" : "重新讀取"}</button></div>
      </div>
      <PublishStatusLine />
      {bulkCodeMessage && <div className="so-note" role="status">{bulkCodeMessage}</div>}
      {records.status === "error" && <div className="so-alert">重新讀取失敗：{records.error}。下面顯示的是先前讀到的資料。</div>}
      <div className="so-toolbar">
        <input className="so-search" type="search" placeholder="搜尋姓名、班級或學校" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="so-select" value={classFilter} onChange={(event) => setClassFilter(event.target.value)} aria-label="班級">
          <option value="all">全部班級</option>
          {classOptions.map((cls) => <option key={cls.id} value={cls.id}>{cls.name || "未命名班級"}{cls.archived ? "（已封存）" : ""}</option>)}
        </select>
        <label className="so-check"><input type="checkbox" checked={showStopped} onChange={(event) => setShowStopped(event.target.checked)} />顯示已停課</label>
      </div>

      {visible.length === 0 ? <div className="so-empty">{rows.length ? "沒有符合條件的學生。" : "還沒有任何學生。"}</div> : (
        <div className="so-list">
          <div className="so-list-head" aria-hidden="true"><span>學生</span><span>班級</span><span className="num">出席率</span><span className="num">平均成績</span><span>最近上課</span><span className="num">家長帳戶</span></div>
          {visible.map((row) => {
            const { stats, classes } = row.card;
            const last = stats.lastAttendance;
            return (
              <button type="button" key={row.id} className={`so-row${row.stopped ? " is-stopped" : ""}`} onClick={() => setSelectedId(row.id)}>
                <span className="so-row-name"><strong>{row.card.student.name}</strong>{row.stopped && <em>已停課</em>}<small>{classes.map((cls) => cls.school).filter(Boolean)[0] || ""}</small></span>
                <span className="so-row-classes">{classes.map((cls) => <i key={cls.id} className={cls.stopped ? "is-stopped" : ""}>{cls.name}</i>)}</span>
                <span className="num" data-label="出席率"><b className={stats.attendanceRate !== null && stats.attendanceRate < 80 ? "is-low" : ""}>{stats.attendanceRate === null ? "—" : `${stats.attendanceRate}%`}</b></span>
                <span className="num" data-label="平均"><b>{stats.scoreAverage === null ? "—" : stats.scoreAverage}</b></span>
                <span className="so-row-last" data-label="最近">{last ? `${fmtDate(last.date, { year: false, weekday: false })} ${last.statuses.join("、")}` : "—"}</span>
                <span className="num" data-label="家長">{row.bound ? `${row.bound} 個` : <span className="so-dim">未綁定</span>}</span>
              </button>
            );
          })}
        </div>
      )}
      <style>{OVERVIEW_CSS}</style>
    </div>
  );
}

const OVERVIEW_CSS = `
.so-loading,.so-empty{padding:40px;text-align:center;color:var(--ink-soft)}
.so-error-card{max-width:440px;margin:40px auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px;text-align:center;line-height:1.7}
.so-error-card h3{margin:0 0 6px}
.so-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.so-title{font-family:'Noto Serif TC',serif;font-size:24px;margin:0}
.so-subtitle{color:var(--ink-soft);font-size:13px;margin-top:4px}
.so-publish{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--ink-soft);background:#EEF1F8;border-radius:10px;padding:8px 12px;margin-bottom:12px}
.so-publish-warn{background:#FFF1D9;color:#8A5A10}.so-publish-bad{background:#FBEAE9;color:#8C332E}
.so-alert{background:#FBEAE9;border:1px solid #F0C6C3;color:#8C332E;border-radius:10px;padding:9px 12px;font-size:13px;margin:8px 0;line-height:1.6}
.so-note{background:#E8F6F3;border-radius:10px;padding:9px 12px;font-size:13px;margin:8px 0}
.so-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.so-search{flex:1 1 220px;min-width:0}
.so-select{max-width:100%}
.so-check{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--ink-soft);white-space:nowrap}
.so-list{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.so-list-head,.so-row{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(140px,1.6fr) 80px 80px minmax(110px,1fr) 80px;gap:12px;align-items:center;padding:11px 16px}
.so-list-head{font-size:12px;color:var(--ink-soft);font-weight:700;border-bottom:1px solid var(--line);background:#F7F8FC}
.so-row{width:100%;border:0;border-bottom:1px solid #EEF1F7;background:none;text-align:left;font-family:inherit;color:inherit;cursor:pointer;font-size:14px}
.so-row:last-child{border-bottom:0}
.so-row:hover{background:#F6F8FC}
.so-row.is-stopped{color:var(--ink-soft)}
.so-row-name strong{font-size:15px}.so-row-name em{font-style:normal;font-size:11px;background:#EEEEEC;color:#71757A;border-radius:999px;padding:1px 7px;margin-left:6px}.so-row-name small{display:block;font-size:12px;color:var(--ink-soft);margin-top:2px}
.so-row-classes{display:flex;flex-wrap:wrap;gap:4px}.so-row-classes i{font-style:normal;font-size:12px;background:var(--blue-soft);border-radius:999px;padding:2px 8px}.so-row-classes i.is-stopped{background:#EEEEEC;color:#71757A;text-decoration:line-through}
.so-list .num{text-align:right;font-family:'IBM Plex Mono',monospace}.so-list .num b{font-weight:600}.so-list b.is-low{color:#B23A34}
.so-row-last{font-size:13px;color:var(--ink-soft)}.so-dim{color:#A3A8AD;font-family:'Noto Sans TC',sans-serif;font-size:12px}
.so-detail{max-width:980px;margin:0 auto}
.so-detail-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.so-detail-nav{display:flex;align-items:center;gap:6px}
.so-count{font-size:12px;color:var(--ink-soft);font-family:'IBM Plex Mono',monospace;margin-right:4px}
.so-preview-note{font-size:13px;color:var(--ink-soft);margin-bottom:12px}
.so-accounts{border:1px dashed #CBD5E5;background:#FFFFFF;border-radius:18px;padding:18px}
.so-accounts-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
.so-accounts h3{margin:2px 0 0;font-family:'Noto Serif TC',serif;font-size:17px}
.so-accounts h4{font-size:13px;margin:14px 0 6px;color:var(--ink-soft)}
.so-hint{font-size:13px;color:var(--ink-soft);line-height:1.6;margin:8px 0 0}
.so-muted{font-size:13px;color:var(--ink-soft);margin:0}
.so-accounts-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:18px}
.so-codes,.so-bound{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.so-codes li{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:7px 10px}
.so-codes li.is-revoked{opacity:.55}.so-codes li.is-revoked code{text-decoration:line-through}
.so-codes code{user-select:all;font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:600;letter-spacing:.08em}
.so-code-state{font-size:12px;color:var(--ink-soft);flex:1;min-width:80px;overflow-wrap:anywhere}
.so-code-actions{display:flex;gap:4px}
.so-bound li{font-size:13px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px;overflow-wrap:anywhere}
@media(max-width:760px){.so-list-head{display:none}.so-row{grid-template-columns:1fr auto;gap:4px 10px;padding:12px 14px}.so-row-classes{grid-column:1/-1;order:3}.so-row .num[data-label="出席率"]{grid-row:1;grid-column:2}.so-row .num[data-label="平均"],.so-row .num[data-label="家長"],.so-row-last{display:none}.so-accounts-grid{grid-template-columns:1fr}}
.so-head-actions{display:flex;flex-wrap:wrap;gap:8px}
`;
