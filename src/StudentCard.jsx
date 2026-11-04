import React, { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildStudentCard, safeVideoUrl } from "./studentRecords.js";

/* One student's card. Used by the teacher (學生總覽) and by families after
   they log in, so both always see the same thing. */

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const STATUS_TONE = { 出席: "ok", 請假: "warn", 曠課: "bad", 遲到: "info", 早退: "info", 延課: "muted", 假期: "muted" };

function fmtDate(value, withWeekday = true) {
  if (!value) return "";
  const [y, m, d] = String(value).split("-").map(Number);
  if (!y || !m || !d) return String(value);
  const day = new Date(y, m - 1, d).getDay();
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}${withWeekday ? `（${WEEKDAYS[day]}）` : ""}`;
}

function fmtStamp(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtNum(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function StatusChips({ statuses }) {
  return <span className="sc-chips">{statuses.map((status) => <span key={status} className={`sc-status sc-tone-${STATUS_TONE[status] || "muted"}`}>{status}</span>)}</span>;
}

function Stat({ label, value, unit, detail, tone }) {
  return (
    <div className={`sc-stat${tone ? ` sc-stat-${tone}` : ""}`}>
      <div className="sc-stat-label">{label}</div>
      <div className="sc-stat-value">{value}{unit && value !== "—" && <small>{unit}</small>}</div>
      {detail && <div className="sc-stat-detail">{detail}</div>}
    </div>
  );
}

function Section({ title, hint, children, extra }) {
  return (
    <section className="sc-section">
      <div className="sc-section-head"><h3>{title}</h3>{extra}</div>
      {hint && <p className="sc-hint">{hint}</p>}
      {children}
    </section>
  );
}

function ScoreChart({ scores }) {
  const data = scores.filter((row) => row.value !== null).map((row) => ({
    label: row.name.length > 8 ? `${row.name.slice(0, 8)}…` : row.name,
    full: `${row.name}${row.date ? `｜${fmtDate(row.date, false)}` : ""}`,
    分數: row.value,
    班平均: row.classAvg,
  }));
  if (data.length < 2) return null;
  const showAvg = data.some((row) => row.班平均 !== null);
  return (
    <div className="sc-chart">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#ECE6DA" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5B6672" }} tickLine={false} axisLine={{ stroke: "#E1DACB" }} interval="preserveStartEnd" />
          <YAxis domain={[(min) => Math.max(0, Math.floor((min - 10) / 10) * 10), (max) => Math.max(100, Math.ceil(max / 10) * 10)]} tick={{ fontSize: 11, fill: "#5B6672" }} tickLine={false} axisLine={false} />
          <Tooltip labelFormatter={(_, items) => items?.[0]?.payload?.full || ""} contentStyle={{ borderRadius: 10, border: "1px solid #E1DACB", fontSize: 12 }} />
          {showAvg && <Legend wrapperStyle={{ fontSize: 12 }} />}
          <Line type="monotone" dataKey="分數" stroke="#B8863B" strokeWidth={2.5} dot={{ r: 4, fill: "#B8863B", stroke: "#FFFFFF", strokeWidth: 1.5 }} activeDot={{ r: 5 }} />
          {showAvg && <Line type="monotone" dataKey="班平均" stroke="#8E99A4" strokeDasharray="5 4" strokeWidth={1.5} dot={false} connectNulls />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const ATTENDANCE_PREVIEW = 20;

export default function StudentCard({ snapshot, footer = null, headerActions = null }) {
  const [classId, setClassId] = useState("all");
  const [type, setType] = useState("all");
  const [showAllAttendance, setShowAllAttendance] = useState(false);
  const card = useMemo(() => buildStudentCard(snapshot, { classId, type }), [snapshot, classId, type]);
  const allClasses = useMemo(() => buildStudentCard(snapshot)?.classes || [], [snapshot]);

  if (!card) return <div className="sc-root"><div className="sc-empty">找不到這位學生的資料。</div><style>{CARD_CSS}</style></div>;
  const { stats } = card;
  const scoresDesc = [...card.scores].reverse();
  const hasRank = card.scores.some((row) => row.rank);
  const attendanceRows = showAllAttendance ? card.attendance : card.attendance.slice(0, ATTENDANCE_PREVIEW);
  const school = [...new Set(allClasses.map((cls) => [cls.school, cls.grade].filter(Boolean).join(" · ")).filter(Boolean))][0] || "";

  return (
    <div className="sc-root">
      <header className="sc-head">
        <div className="sc-head-main">
          <div className="sc-kicker">學習紀錄</div>
          <h2 className="sc-name">{card.student.name}</h2>
          {school && <div className="sc-sub">{school}</div>}
        </div>
        {headerActions}
      </header>

      {allClasses.length > 1 && (
        <div className="sc-filter" role="tablist" aria-label="選擇班級">
          <button type="button" className={classId === "all" ? "active" : ""} onClick={() => setClassId("all")}>全部班級</button>
          {allClasses.map((cls) => <button type="button" key={cls.id} className={classId === cls.id ? "active" : ""} onClick={() => setClassId(cls.id)}>{cls.name}{cls.stopped ? "（已停課）" : ""}</button>)}
        </div>
      )}
      {allClasses.length === 1 && <div className="sc-filter sc-filter-static"><span>{allClasses[0].name}{allClasses[0].stopped ? "（已停課）" : ""}</span></div>}

      <div className="sc-stats">
        <Stat label="出席率" value={fmtNum(stats.attendanceRate)} unit="%" detail={stats.counted ? `出席 ${stats.出席} / 應到 ${stats.counted} 堂` : "還沒有出缺勤紀錄"} tone={stats.attendanceRate !== null && stats.attendanceRate < 80 ? "warn" : ""} />
        <Stat label="請假／曠課" value={`${stats.請假}／${stats.曠課}`} detail={stats.遲到 || stats.早退 ? `遲到 ${stats.遲到} · 早退 ${stats.早退}` : "沒有遲到早退"} tone={stats.曠課 ? "bad" : ""} />
        <Stat label="平均成績" value={fmtNum(stats.scoreAverage)} unit="分" detail={stats.scoreCount ? `共 ${stats.scoreCount} 次 · 最高 ${fmtNum(stats.scoreBest)}` : "還沒有成績"} />
        <Stat label="補課影片" value={String(stats.videoCount)} unit="部" detail={stats.absentCount ? (stats.missingVideoCount ? `缺課 ${stats.absentCount} 次，${stats.missingVideoCount} 次還沒有影片` : `缺課 ${stats.absentCount} 次，都有影片`) : "沒有缺課"} />
      </div>

      <Section
        title="考試成績"
        extra={card.scoreTypes.length > 1 && (
          <div className="sc-mini-tabs">
            {[["all", "全部"], ["quiz", "平時考"], ["exam", "段考"]].map(([key, label]) => <button type="button" key={key} className={type === key ? "active" : ""} onClick={() => setType(key)}>{label}</button>)}
          </div>
        )}
      >
        {card.scores.length === 0 ? <p className="sc-muted">目前沒有成績紀錄。</p> : (
          <>
            <ScoreChart scores={card.scores} />
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead><tr><th>考試</th><th>日期</th>{allClasses.length > 1 && <th className="sc-col-class">班級</th>}<th className="num">成績</th><th className="num">班平均</th>{hasRank && <th className="num">排名</th>}</tr></thead>
                <tbody>
                  {scoresDesc.map((row) => {
                    const diff = row.value !== null && row.classAvg !== null ? row.value - row.classAvg : null;
                    return (
                      <tr key={row.id}>
                        <td><div className="sc-cell-main">{row.name}</div><div className="sc-cell-sub">{row.typeLabel}{row.range ? ` · ${row.range}` : ""}</div></td>
                        <td className="sc-nowrap">{row.date ? fmtDate(row.date, false) : "—"}</td>
                        {allClasses.length > 1 && <td className="sc-col-class sc-nowrap">{row.className}</td>}
                        <td className="num sc-score">{row.raw === "" ? "—" : row.raw}{diff !== null && <span className={diff >= 0 ? "sc-up" : "sc-down"}>{diff >= 0 ? "▲" : "▼"}{fmtNum(Math.abs(Math.round(diff * 10) / 10))}</span>}</td>
                        <td className="num">{row.classAvg === null ? "—" : fmtNum(row.classAvg)}</td>
                        {hasRank && <td className="num">{row.rank || "—"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      <Section title="補課影片" hint={card.makeup.length ? "請假或曠課那一堂的上課影片，可以點開補看。" : ""}>
        {card.makeup.length === 0 ? <p className="sc-muted">沒有缺課紀錄，不需要補課。</p> : (
          <div className="sc-list">
            {card.makeup.map((row) => {
              const url = safeVideoUrl(row.videoUrl);
              return (
                <div className="sc-row" key={row.id}>
                  <div className="sc-row-date"><strong>{fmtDate(row.date)}</strong><span>{row.className}</span></div>
                  <div className="sc-row-body"><StatusChips statuses={row.statuses} />{row.content && <p>{row.content}</p>}</div>
                  <div className="sc-row-action">{url ? <a className="sc-video" href={url} target="_blank" rel="noreferrer">▶ 觀看影片</a> : <span className="sc-no-video">還沒有影片</span>}</div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="出缺勤紀錄" hint={card.attendance.length ? `共 ${card.attendance.length} 筆，最新的在最上面。` : ""}>
        {card.attendance.length === 0 ? <p className="sc-muted">目前沒有出缺勤紀錄。</p> : (
          <>
            <div className="sc-list">
              {attendanceRows.map((row) => (
                <div className="sc-row" key={row.id}>
                  <div className="sc-row-date"><strong>{fmtDate(row.date)}</strong><span>{row.className}</span></div>
                  <div className="sc-row-body"><StatusChips statuses={row.statuses} />{row.content && <p>{row.content}</p>}</div>
                </div>
              ))}
            </div>
            {card.attendance.length > ATTENDANCE_PREVIEW && (
              <button type="button" className="sc-more" onClick={() => setShowAllAttendance((value) => !value)}>{showAllAttendance ? "只看最近 20 筆" : `顯示全部 ${card.attendance.length} 筆`}</button>
            )}
          </>
        )}
      </Section>

      {card.generatedAt && <div className="sc-updated">資料更新時間：{fmtStamp(card.generatedAt)}</div>}
      {footer}
      <style>{CARD_CSS}</style>
    </div>
  );
}

export const CARD_CSS = `
.sc-root{--sc-paper:#FAF8F3;--sc-ink:#21262B;--sc-soft:#5B6672;--sc-brass:#B8863B;--sc-brass-soft:#F4EAD6;--sc-line:#E1DACB;--sc-card:#FFFFFF;color:var(--sc-ink);font-family:'Noto Sans TC',-apple-system,BlinkMacSystemFont,sans-serif;display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
.sc-root>*{min-width:0}
.sc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.sc-kicker{color:var(--sc-brass);font-size:12px;font-weight:700;letter-spacing:.08em}
.sc-name{font-family:'Noto Serif TC',serif;font-size:28px;margin:2px 0 2px;line-height:1.25}
.sc-sub{color:var(--sc-soft);font-size:13px}
.sc-filter{display:flex;gap:6px;flex-wrap:wrap}
.sc-filter button,.sc-filter span{border:1px solid var(--sc-line);background:var(--sc-card);border-radius:999px;padding:6px 13px;font-size:13px;color:var(--sc-soft);font-family:inherit;cursor:pointer}
.sc-filter span{cursor:default;background:var(--sc-brass-soft);border-color:transparent;color:var(--sc-ink);font-weight:700}
.sc-filter button.active{background:var(--sc-ink);border-color:var(--sc-ink);color:#FFF}
.sc-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.sc-stat{background:var(--sc-card);border:1px solid var(--sc-line);border-radius:14px;padding:14px 14px 12px;min-width:0}
.sc-stat-label{font-size:12px;color:var(--sc-soft);font-weight:700}
.sc-stat-value{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:28px;font-weight:600;margin-top:4px;line-height:1.15}
.sc-stat-value small{font-size:13px;margin-left:3px;color:var(--sc-soft);font-family:'Noto Sans TC',sans-serif}
.sc-stat-detail{font-size:12px;color:var(--sc-soft);margin-top:4px;line-height:1.5}
.sc-stat-warn{background:#FFF8EA;border-color:#EFDBA0}.sc-stat-bad .sc-stat-value{color:#B23A34}
.sc-section{background:var(--sc-card);border:1px solid var(--sc-line);border-radius:16px;padding:18px}
.sc-section-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.sc-section h3{font-family:'Noto Serif TC',serif;font-size:17px;margin:0}
.sc-hint{color:var(--sc-soft);font-size:12.5px;margin:4px 0 0}
.sc-muted{color:var(--sc-soft);font-size:14px;margin:10px 0 0}
.sc-mini-tabs{display:flex;gap:4px;background:var(--sc-paper);border-radius:999px;padding:3px}
.sc-mini-tabs button{border:0;background:none;border-radius:999px;padding:4px 11px;font-size:12px;color:var(--sc-soft);cursor:pointer;font-family:inherit}
.sc-mini-tabs button.active{background:var(--sc-card);color:var(--sc-ink);font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.sc-chart{margin:12px 0 4px}
.sc-table-wrap{overflow-x:auto;margin-top:8px}
.sc-table{width:100%;border-collapse:collapse;font-size:14px}
.sc-table th{font-size:12px;color:var(--sc-soft);font-weight:700;text-align:left;padding:8px;border-bottom:1px solid var(--sc-line);white-space:nowrap}
.sc-table td{padding:10px 8px;border-bottom:1px solid #F0EBE1;vertical-align:top}
.sc-table .num{text-align:right;white-space:nowrap;font-family:'IBM Plex Mono',ui-monospace,monospace}
.sc-cell-main{font-weight:700;min-width:6em}.sc-cell-sub{font-size:12px;color:var(--sc-soft);margin-top:2px}.sc-nowrap{white-space:nowrap}
.sc-score{font-weight:700;font-size:15px}
.sc-up,.sc-down{font-size:11px;margin-left:6px}.sc-up{color:#3F7D5C}.sc-down{color:#B23A34}
.sc-list{display:grid;margin-top:8px}
.sc-row{display:grid;grid-template-columns:150px 1fr auto;gap:12px;padding:11px 0;border-bottom:1px solid #F0EBE1;align-items:start}
.sc-row:last-child{border-bottom:0}
.sc-row-date strong{display:block;font-size:14px;white-space:nowrap}.sc-row-date span{display:block;font-size:12px;color:var(--sc-soft);margin-top:2px}
.sc-row-body p{margin:6px 0 0;font-size:13px;color:var(--sc-soft);white-space:pre-wrap;line-height:1.6}
.sc-chips{display:inline-flex;gap:4px;flex-wrap:wrap}
.sc-status{font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;border:1px solid}
.sc-tone-ok{background:#EAF3EC;color:#3F7D5C;border-color:#BFDCC9}.sc-tone-warn{background:#FBF3DE;color:#A87B14;border-color:#EFDBA0}.sc-tone-bad{background:#FBEAE9;color:#B23A34;border-color:#F0C6C3}.sc-tone-info{background:#E9EFF6;color:#3F5E8C;border-color:#C3D3E7}.sc-tone-muted{background:#EEEEEC;color:#71757A;border-color:#D9D9D5}
.sc-video{display:inline-block;background:var(--sc-ink);color:#FFF;text-decoration:none;font-size:13px;font-weight:700;border-radius:9px;padding:7px 12px;white-space:nowrap}
.sc-no-video{font-size:12px;color:var(--sc-soft);white-space:nowrap}
.sc-more{margin-top:8px;border:1px solid var(--sc-line);background:none;border-radius:9px;padding:7px 12px;font-size:13px;color:var(--sc-soft);cursor:pointer;font-family:inherit}
.sc-updated{font-size:12px;color:var(--sc-soft);text-align:right}
.sc-empty{padding:30px;text-align:center;color:var(--sc-soft)}
@media(max-width:760px){.sc-col-class{display:none}.sc-section{padding:16px 14px}.sc-table{font-size:13px}.sc-table td,.sc-table th{padding-left:5px;padding-right:5px}.sc-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.sc-row{grid-template-columns:1fr;gap:6px}.sc-row-action{justify-self:start}.sc-name{font-size:24px}.sc-stat-value{font-size:24px}}
`;
