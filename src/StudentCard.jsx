import React, { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildStudentCard, orderSubjects, safeVideoUrl } from "./studentRecords.js";
import { DateField } from "./DateTimeFields.jsx";
import { fmtDate, fmtStamp, localDateString, twoCalendarMonthsAgo } from "./dateFormat.js";
import { CHART_THEME, STATUS_STYLE } from "./theme.js";

/* One student's card. Used by the teacher (學生總覽) and by families after
   they log in, so both always see the same thing. */

const STATUS_TONE = { 出席: "ok", 請假: "warn", 曠課: "bad", 遲到: "info", 早退: "early", 延課: "muted", 假期: "holiday" };
/* Tone colours come from the same table the teacher's attendance grid uses. */
const TONE_CSS = Object.entries(STATUS_TONE).map(([status, tone]) => { const c = STATUS_STYLE[status]; return `.sc-tone-${tone}{background:${c.bg};color:${c.fg};border-color:${c.bd}}`; }).join("");

function fmtNum(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function inDateRange(date, from, to = "") {
  const value = String(date || "").slice(0, 10);
  return Boolean(value) && value >= from && (!to || value <= to);
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

function ScoreChart({ scores, title, showDate = true }) {
  const data = scores.filter((row) => row.value !== null).map((row) => ({
    label: row.name.length > 8 ? `${row.name.slice(0, 8)}…` : row.name,
    full: `${row.name}${row.subject ? ` · ${row.subject}` : ""}${showDate && row.date ? `｜${fmtDate(row.date, { weekday: false })}` : ""}`,
    分數: row.value,
    班平均: row.classAvg,
  }));
  if (data.length < 2) return null;
  const showAvg = data.some((row) => row.班平均 !== null);
  return (
    <div className="sc-chart">{title && <div className="sc-chart-title">{title}</div>}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_THEME.tick }} tickLine={false} axisLine={{ stroke: CHART_THEME.axis }} interval="preserveStartEnd" />
          <YAxis domain={[(min) => Math.max(0, Math.floor((min - 10) / 10) * 10), (max) => Math.max(100, Math.ceil(max / 10) * 10)]} tick={{ fontSize: 11, fill: CHART_THEME.tick }} tickLine={false} axisLine={false} />
          <Tooltip labelFormatter={(_, items) => items?.[0]?.payload?.full || ""} contentStyle={{ borderRadius: 10, border: `1px solid ${CHART_THEME.axis}`, fontSize: 12 }} />
          {showAvg && <Legend wrapperStyle={{ fontSize: 12 }} />}
          <Line type="monotone" dataKey="分數" stroke={CHART_THEME.line} strokeWidth={2.5} dot={{ r: 4, fill: CHART_THEME.line, stroke: "#FFFFFF", strokeWidth: 1.5 }} activeDot={{ r: 5 }} />
          {showAvg && <Line type="monotone" dataKey="班平均" stroke={CHART_THEME.average} strokeDasharray="5 4" strokeWidth={1.5} dot={false} connectNulls />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const ATTENDANCE_PREVIEW = 20;


function ScoreTable({ scores, allClasses, showSubject = false, showDate = true }) {
  const rows = [...scores].reverse();
  const hasRank = rows.some((row) => row.rank);
  if (!rows.length) return <p className="sc-muted">目前沒有成績紀錄。</p>;
  return <div className="sc-table-wrap"><table className="sc-table"><thead><tr><th>考試</th>{showDate && <th>日期</th>}{allClasses.length > 1 && <th className="sc-col-class">班級</th>}<th className="num">成績</th><th className="num">班平均</th>{hasRank && <th className="num">排名</th>}</tr></thead><tbody>{rows.map((row) => {
    const diff = row.value !== null && row.classAvg !== null ? row.value - row.classAvg : null;
    return <tr key={row.id}><td><div className="sc-cell-main">{row.name}</div><div className="sc-cell-sub">{row.typeLabel}{showSubject && row.subject ? <> · <span className="sc-subject-tag">{row.subject}</span></> : ""}{row.range ? ` · ${row.range}` : ""}</div></td>{showDate && <td className="sc-nowrap">{row.date ? fmtDate(row.date, { weekday: false }) : "—"}</td>}{allClasses.length > 1 && <td className="sc-col-class sc-nowrap">{row.className}</td>}<td className="num sc-score">{row.raw === "" ? "—" : row.raw}{diff !== null && <span className={diff >= 0 ? "sc-up" : "sc-down"}>{diff >= 0 ? "▲" : "▼"}{fmtNum(Math.abs(Math.round(diff * 10) / 10))}</span>}</td><td className="num">{row.classAvg === null ? "—" : fmtNum(row.classAvg)}</td>{hasRank && <td className="num">{row.rank || "—"}</td>}</tr>;
  })}</tbody></table></div>;
}

const UNTAGGED_LABEL = "未分科";

function averageOf(rows) {
  const values = rows.map((row) => row.value).filter((value) => value !== null);
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
}

/* One kind (平時考 or 段考) of one class. In a class that has subjects
   (例如 物理化學 → 物理、化學) the scores are listed per subject, each with its
   own chart and average, so physics and chemistry are never drawn as one line. */
function ScoreKind({ label, chartTitle, rows, cls, allClasses, showDate = true }) {
  const subjects = orderSubjects(rows, [cls]);
  const untagged = rows.filter((row) => !row.subject);
  const split = subjects.length > 1 || (subjects.length === 1 && untagged.length > 0);
  const groups = split
    ? [...subjects.map((subject) => ({ key: subject, label: subject, rows: rows.filter((row) => row.subject === subject) })), ...(untagged.length ? [{ key: "", label: UNTAGGED_LABEL, rows: untagged }] : [])]
    : [];
  return (
    <div className="sc-score-kind">
      <div className="sc-score-kind-head"><strong>{label}</strong><span>{rows.length} 筆</span></div>
      {split ? groups.map((group) => {
        const average = averageOf(group.rows);
        return (
          <div className="sc-subject-group" key={group.key || "untagged"}>
            <div className="sc-subject-head"><strong>{group.label}</strong><span>{group.rows.length} 筆{average !== null ? ` · 平均 ${fmtNum(average)}` : ""}</span></div>
            {group.rows.length >= 2 && <ScoreChart scores={group.rows} title={`${group.label}${chartTitle}`} showDate={showDate} />}
            <ScoreTable scores={group.rows} allClasses={allClasses} showDate={showDate} />
          </div>
        );
      }) : (
        <>
          {rows.length >= 2 && <ScoreChart scores={rows} title={`${subjects[0] || ""}${chartTitle}`} showDate={showDate} />}
          <ScoreTable scores={rows} allClasses={allClasses} showSubject showDate={showDate} />
        </>
      )}
    </div>
  );
}

function ScoreSections({ scores, allClasses }) {
  const groups = allClasses.map((cls) => ({ cls, quiz: scores.filter((row) => row.classId === cls.id && row.type === "quiz"), exam: scores.filter((row) => row.classId === cls.id && row.type === "exam") })).filter((group) => group.quiz.length || group.exam.length);
  if (!groups.length) return <p className="sc-muted">目前沒有成績紀錄。</p>;
  return (
    <div className="sc-score-groups">
      {groups.map(({ cls, quiz, exam }) => (
        <section className="sc-score-group" key={cls.id}>
          <h4>{cls.name}{cls.school ? ` · ${cls.school}` : ""}</h4>
          <ScoreKind label="平時考" chartTitle="平時考成績變化" rows={quiz} cls={cls} allClasses={allClasses} />
          <ScoreKind label="段考" chartTitle="段考成績變化" rows={exam} cls={cls} allClasses={allClasses} showDate={false} />
        </section>
      ))}
    </div>
  );
}

export default function StudentCard({ snapshot, footer = null, headerActions = null, parentMode = false }) {
  const [classId, setClassId] = useState("all");
  const [type, setType] = useState("all");
  const [showAllAttendance, setShowAllAttendance] = useState(false);
  const [attendanceFrom, setAttendanceFrom] = useState(() => parentMode ? twoCalendarMonthsAgo() : "");
  const [attendanceTo, setAttendanceTo] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState("all");
  const [attendanceSort, setAttendanceSort] = useState("date");
  const card = useMemo(() => buildStudentCard(snapshot, { classId, type }), [snapshot, classId, type]);
  const allClasses = useMemo(() => buildStudentCard(snapshot)?.classes || [], [snapshot]);
  const parentCutoff = parentMode ? twoCalendarMonthsAgo() : "";

  React.useEffect(() => {
    setAttendanceFrom(parentMode ? twoCalendarMonthsAgo() : "");
    setAttendanceTo("");
    setShowAllAttendance(false);
  }, [parentMode, snapshot?.student?.id]);

  if (!card) return <div className="sc-root"><div className="sc-empty">找不到這位學生的資料。</div><style>{CARD_CSS}</style></div>;
  const { stats } = card;
  const filteredAttendance = card.attendance.filter((row) => (!attendanceFrom || row.date >= attendanceFrom) && (!attendanceTo || row.date <= attendanceTo) && (!attendanceStatus || attendanceStatus === "all" || row.statuses.includes(attendanceStatus))).sort((a, b) => attendanceSort === "class" ? a.className.localeCompare(b.className, "zh-Hant") || b.date.localeCompare(a.date) : b.date.localeCompare(a.date) || a.className.localeCompare(b.className, "zh-Hant"));
  const attendanceRows = showAllAttendance ? filteredAttendance : filteredAttendance.slice(0, ATTENDANCE_PREVIEW);
  const makeupRows = parentMode ? card.makeup.filter((row) => inDateRange(row.date, parentCutoff, localDateString())) : card.makeup;
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
        <Stat label="平均成績" value={fmtNum(stats.scoreAverage)} unit="分" detail={stats.scoreCount ? (stats.subjectAverages?.length ? stats.subjectAverages.map((item) => `${item.subject || UNTAGGED_LABEL} ${fmtNum(item.average)}（${item.count} 次）`).join(" · ") : `共 ${stats.scoreCount} 次 · 最高 ${fmtNum(stats.scoreBest)}`) : "還沒有成績"} />
        <Stat label="補課影片" value={String(stats.videoCount)} unit="部" detail={stats.absentCount ? (stats.missingVideoCount ? `缺課 ${stats.absentCount} 次，${stats.missingVideoCount} 次還沒有影片` : `缺課 ${stats.absentCount} 次，都有影片`) : "沒有缺課"} />
      </div>

      <Section title="考試成績" hint="已依班級分開；每個班級內再分為平時考與段考，有分科的班級會再依科目分開。">
        {card.scores.length === 0 ? <p className="sc-muted">目前沒有成績紀錄。</p> : <ScoreSections scores={card.scores} allClasses={allClasses} />}
      </Section>
      <Section title="補課影片" hint={card.makeup.length ? "請假或曠課那一堂的上課影片，可以點開補看。" : ""}>
        {makeupRows.length === 0 ? <p className="sc-muted">{parentMode ? "近兩個月沒有缺課紀錄，不需要補課。" : "沒有缺課紀錄，不需要補課。"}</p> : (
          <div className="sc-list">
            {makeupRows.map((row) => {
              const url = safeVideoUrl(row.videoUrl);
              return (
                <div className="sc-row" key={row.id}>
                  <div className="sc-row-date"><strong>{fmtDate(row.date)}</strong><span>{row.className}</span></div>
                  <div className="sc-row-body"><StatusChips statuses={row.statuses} />{row.content && <p>{row.content}</p>}</div>
                  <div className="sc-row-action">{url ? <a className="btn-primary btn-sm" href={url} target="_blank" rel="noreferrer">▶ 觀看影片</a> : <span className="sc-no-video">還沒有影片</span>}</div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="出缺勤紀錄" hint={card.attendance.length ? `${parentMode ? "預設顯示近兩個月；" : ""}原始紀錄 ${card.attendance.length} 筆；可依日期、班級與狀態篩選。` : ""}>
        <div className="sc-attendance-filters"><label>開始日期<DateField value={attendanceFrom} onChange={(value) => { setAttendanceFrom(value); setShowAllAttendance(false); }} aria-label="開始日期" /></label><label>結束日期<DateField value={attendanceTo} onChange={(value) => { setAttendanceTo(value); setShowAllAttendance(false); }} aria-label="結束日期" /></label><label>狀態<select value={attendanceStatus} onChange={(e) => { setAttendanceStatus(e.target.value); setShowAllAttendance(false); }}><option value="all">全部狀態</option><option value="出席">出席</option><option value="請假">請假</option><option value="曠課">曠課</option><option value="遲到">遲到</option><option value="早退">早退</option><option value="延課">延課</option><option value="假期">假期</option></select></label><label>排序<select value={attendanceSort} onChange={(e) => setAttendanceSort(e.target.value)}><option value="date">依日期</option><option value="class">依班級</option></select></label></div>
        {filteredAttendance.length === 0 ? <p className="sc-muted">目前篩選條件沒有出缺勤紀錄。</p> : (
          <>
            <div className="sc-list">
              {attendanceRows.map((row) => (
                <div className="sc-row" key={row.id}>
                  <div className="sc-row-date"><strong>{fmtDate(row.date)}</strong><span>{row.className}</span></div>
                  <div className="sc-row-body"><StatusChips statuses={row.statuses} />{row.content && <p>{row.content}</p>}</div>
                </div>
              ))}
            </div>
            {filteredAttendance.length > ATTENDANCE_PREVIEW && (
              <button type="button" className="btn-ghost btn-sm sc-more" onClick={() => setShowAllAttendance((value) => !value)}>{showAllAttendance ? "只看前 20 筆" : `顯示全部 ${filteredAttendance.length} 筆`}</button>
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
.sc-root{--sc-paper:var(--paper);--sc-ink:var(--ink);--sc-soft:var(--ink-soft);--sc-brass:var(--blue);--sc-brass-soft:var(--blue-soft);--sc-line:var(--line);--sc-card:var(--card);color:var(--sc-ink);font-family:'Noto Sans TC',-apple-system,BlinkMacSystemFont,sans-serif;display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
.sc-root>*{min-width:0}
.sc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.sc-kicker{color:var(--sc-brass);font-size:12px;font-weight:700;letter-spacing:.08em}
.sc-name{font-family:'Noto Serif TC',serif;font-size:28px;margin:2px 0 2px;line-height:1.25}
.sc-sub{color:var(--sc-soft);font-size:13px}
.sc-filter{display:flex;gap:6px;flex-wrap:wrap}
.sc-filter span{cursor:default;background:var(--sc-brass-soft);border-color:transparent;color:var(--sc-ink);font-weight:700}
.sc-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.sc-stat{background:var(--sc-card);border:1px solid var(--sc-line);border-radius:14px;padding:14px 14px 12px;min-width:0}
.sc-stat-label{font-size:12px;color:var(--sc-soft);font-weight:700}
.sc-stat-value{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:28px;font-weight:600;margin-top:4px;line-height:1.15}
.sc-stat-value small{font-size:13px;margin-left:3px;color:var(--sc-soft);font-family:'Noto Sans TC',sans-serif}
.sc-stat-detail{font-size:12px;color:var(--sc-soft);margin-top:4px;line-height:1.5}
.sc-stat-warn{background:#FFF6E5;border-color:#F5D39B}.sc-stat-bad .sc-stat-value{color:#B23A34}
.sc-section{background:var(--sc-card);border:1px solid var(--sc-line);border-radius:18px;padding:18px}
.sc-section-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.sc-section h3{font-family:'Noto Serif TC',serif;font-size:17px;margin:0}
.sc-hint{color:var(--sc-soft);font-size:13px;margin:4px 0 0}
.sc-muted{color:var(--sc-soft);font-size:14px;margin:10px 0 0}
.sc-mini-tabs{display:flex;gap:4px;background:var(--sc-paper);border-radius:999px;padding:3px}
.sc-mini-tabs button{border:0;background:none;border-radius:999px;padding:4px 11px;font-size:12px;color:var(--sc-soft);cursor:pointer;font-family:inherit}
.sc-mini-tabs button.active{background:var(--sc-card);color:var(--sc-ink);font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.sc-chart{margin:12px 0 4px}
.sc-table-wrap{overflow-x:auto;margin-top:8px}
.sc-table{width:100%;border-collapse:collapse;font-size:14px}
.sc-table th{font-size:12px;color:var(--sc-soft);font-weight:700;text-align:left;padding:8px;border-bottom:1px solid var(--sc-line);white-space:nowrap}
.sc-table td{padding:10px 8px;border-bottom:1px solid #EEF1F7;vertical-align:top}
.sc-table .num{text-align:right;white-space:nowrap;font-family:'IBM Plex Mono',ui-monospace,monospace}
.sc-cell-main{font-weight:700;min-width:6em}.sc-cell-sub{font-size:12px;color:var(--sc-soft);margin-top:2px}.sc-nowrap{white-space:nowrap}
.sc-score{font-weight:700;font-size:15px}
.sc-score-groups{display:grid;gap:14px;margin-top:12px}.sc-score-group{border:1px solid var(--sc-line);border-radius:14px;padding:13px;background:var(--sc-paper)}.sc-score-group h4{margin:0 0 10px;font-size:16px}.sc-score-kind{background:var(--sc-card);border-radius:10px;padding:10px;margin-top:9px}.sc-score-kind-head{display:flex;justify-content:space-between;align-items:center;color:var(--sc-soft);font-size:12px}.sc-score-kind-head strong{color:var(--sc-ink);font-size:14px}.sc-score-kind .sc-table-wrap{margin-top:4px}
.sc-subject-group{margin-top:10px;padding-top:9px;border-top:1px dashed var(--sc-line)}
.sc-subject-head{display:flex;justify-content:space-between;align-items:center;gap:8px;color:var(--sc-soft);font-size:12px}
.sc-subject-head strong{color:var(--sc-ink);font-size:14px}
.sc-subject-tag{display:inline-block;padding:0 7px;border-radius:999px;background:var(--sc-brass-soft);color:var(--sc-ink);font-weight:700}.sc-chart-title{font-size:12px;font-weight:800;color:var(--sc-soft);margin:5px 0 -5px}
.sc-up,.sc-down{font-size:11px;margin-left:6px}.sc-up{color:#3F7D5C}.sc-down{color:#B23A34}
.sc-list{display:grid;margin-top:8px}
.sc-row{display:grid;grid-template-columns:150px 1fr auto;gap:12px;padding:11px 0;border-bottom:1px solid #EEF1F7;align-items:start}
.sc-row:last-child{border-bottom:0}
.sc-row-date strong{display:block;font-size:14px;white-space:nowrap}.sc-row-date span{display:block;font-size:12px;color:var(--sc-soft);margin-top:2px}
.sc-row-body p{margin:6px 0 0;font-size:13px;color:var(--sc-soft);white-space:pre-wrap;line-height:1.6}
.sc-chips{display:inline-flex;gap:4px;flex-wrap:wrap}
.sc-status{font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;border:1px solid}
${TONE_CSS}
.sc-no-video{font-size:12px;color:var(--sc-soft);white-space:nowrap}
.sc-more{margin-top:8px}
.sc-attendance-filters{display:flex;flex-wrap:wrap;gap:8px;padding:10px 0 3px}.sc-attendance-filters label{display:grid;gap:4px;color:var(--sc-soft);font-size:11px;font-weight:700}
.sc-updated{font-size:12px;color:var(--sc-soft);text-align:right}
.sc-empty{padding:30px;text-align:center;color:var(--sc-soft)}
@media(max-width:760px){.sc-col-class{display:none}.sc-section{padding:16px 14px}.sc-table{font-size:13px}.sc-table td,.sc-table th{padding-left:5px;padding-right:5px}.sc-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.sc-row{grid-template-columns:1fr;gap:6px}.sc-row-action{justify-self:start}.sc-name{font-size:24px}.sc-stat-value{font-size:24px}}
`;
