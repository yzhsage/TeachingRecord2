import fs from "node:fs";

const path = new URL("../src/App.jsx", import.meta.url);
let source = fs.readFileSync(path, "utf8");

function replaceBetween(text, startMarker, endMarker, replacement) {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`找不到起點：${startMarker}`);
  const end = text.indexOf(endMarker, start);
  if (end < 0) throw new Error(`找不到終點：${endMarker}`);
  return text.slice(0, start) + replacement + text.slice(end);
}

const topNav = `function TopNav({ view, setView, saveStatus, backupOverdue, onToggleBackup }) {
  return (
    <header className="topnav">
      <div className="brand">
        <span className="brand-mark">課</span>
        <div>
          <div className="brand-text">教學紀錄</div>
          <div className="brand-caption">一人教師工作台</div>
        </div>
      </div>
      <div className="topnav-middle">
        <span className="topnav-breadcrumb">今日工作區</span>
        <span className="topnav-dot" />
        <span className="topnav-note">把每一堂課，整理成看得見的進步</span>
      </div>
      <nav className="nav-pills" aria-label="主要導覽">
        <button className={"pill nav-pill" + (view === "today" ? " pill-active" : "")} onClick={() => setView("today")}><CalendarDays size={15} />行事曆</button>
        <button className={"pill nav-pill" + (view !== "today" ? " pill-active" : "")} onClick={() => setView("classes")}><Users size={15} />所有班級</button>
      </nav>
      <div className="topnav-actions">
        <SaveIndicator status={saveStatus.status} onRetry={saveStatus.retry} />
        <button className={"pill utility-pill" + (backupOverdue ? " pill-warning" : "")} onClick={onToggleBackup} title="資料備份">備份{backupOverdue ? " · 待處理" : ""}</button>
        <button className="pill utility-pill logout-pill" onClick={() => signOut(auth)} title="登出">登出</button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Today (date/calendar) view                                          */
/* ------------------------------------------------------------------ */

`;
source = replaceBetween(source, "function TopNav(", "function MonthCalendar(", topNav + "function MonthCalendar(");

const monthCalendar = `function MonthCalendar({ selected, onSelect, classes, hasSession, calendarEvents, onAddEvent, knownSchools, calendarSaveState }) {
  const selDate = fromDateStr(selected);
  const [viewMode, setViewMode] = useState("month");
  const [viewYear, setViewYear] = useState(selDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selDate.getMonth());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (viewMode === "week") return;
    if (selDate.getFullYear() !== viewYear || selDate.getMonth() !== viewMonth) {
      setViewYear(selDate.getFullYear());
      setViewMonth(selDate.getMonth());
    }
  }, [selected, viewMode]);

  const startWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const gridStart = new Date(viewYear, viewMonth, 1 - startWeekday);
  const monthCells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  const weekStart = new Date(selDate);
  weekStart.setDate(selDate.getDate() - selDate.getDay());
  const weekCells = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  function changeMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }
  function changeWeek(delta) {
    onSelect(addDays(selected, delta * 7));
  }
  function selectToday() {
    const value = todayStr();
    onSelect(value);
    const d = fromDateStr(value);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }
  function dayData(ds) {
    return {
      dayClasses: classes.filter((c) => hasSession(c, ds)),
      dayEvents: eventsOnDate(calendarEvents, ds),
    };
  }
  function renderMonthCell(d, i) {
    const ds = toDateStr(d);
    const inMonth = d.getMonth() === viewMonth;
    const { dayClasses, dayEvents } = dayData(ds);
    const hasHoliday = dayEvents.some((event) => event.type === "nationalHoliday");
    const isToday = ds === todayStr();
    const isSelected = ds === selected;
    return (
      <button key={i} className={"calendar-cell" + (inMonth ? "" : " calendar-cell-out") + (hasHoliday ? " calendar-cell-holiday" : "") + (isSelected ? " calendar-cell-selected" : "") + (isToday ? " calendar-cell-today" : "")} onClick={() => onSelect(ds)} title={dayEvents.length ? dayEvents.map((event) => event.title).join("、") : formatDisplay(ds)} aria-label={formatDisplay(ds) + (dayEvents.length ? "：" + dayEvents.map((event) => event.title).join("、") : "")}>
        <span className="calendar-cell-topline"><span className="calendar-cell-num">{d.getDate()}</span>{isToday && <span className="today-badge">今天</span>}</span>
        {dayClasses.length > 0 && <span className="calendar-cell-dots">{dayClasses.slice(0, 4).map((c) => <span key={c.id} className="dot" style={{ background: colorForClass(c.id) }} />)}</span>}
        {dayEvents.length > 0 && <span className="calendar-cell-event-labels">
          {dayEvents.slice(0, 2).map((event) => {
            const dates = eventDates(event);
            const continuous = isContinuousEvent(event);
            const isStart = dates[0] === ds;
            const isEnd = dates[dates.length - 1] === ds;
            const meta = eventTypeMeta(event.type);
            return <span key={event.id} className={"calendar-event-label" + (continuous ? " calendar-event-label-range" : " calendar-event-label-scattered") + (isStart ? " calendar-event-label-start" : "") + (isEnd ? " calendar-event-label-end" : "")} style={{ color: meta.color, borderColor: meta.color, backgroundColor: event.type === "nationalHoliday" ? "#FFE8E3" : "#F4F1EA" }}>{event.title}</span>;
          })}
          {dayEvents.length > 2 && <span className="calendar-event-more">+{dayEvents.length - 2}</span>}
        </span>}
      </button>
    );
  }
  function renderWeekCell(d) {
    const ds = toDateStr(d);
    const { dayClasses, dayEvents } = dayData(ds);
    const isToday = ds === todayStr();
    const isSelected = ds === selected;
    return (
      <button key={ds} className={"week-column" + (isSelected ? " week-column-selected" : "") + (isToday ? " week-column-today" : "")} onClick={() => onSelect(ds)}>
        <div className="week-column-head"><span>週{WEEKDAY_FULL[d.getDay()]}</span><strong>{d.getMonth() + 1}/{d.getDate()}</strong>{isToday && <em>今天</em>}</div>
        <div className="week-column-body">
          {dayEvents.length === 0 && dayClasses.length === 0 && <span className="week-empty">無排程</span>}
          {dayEvents.map((event) => { const meta = eventTypeMeta(event.type); return <span key={event.id} className="week-event" style={{ borderLeftColor: meta.color, background: event.type === "nationalHoliday" ? "#FFF0EB" : "#F5F2FF" }}><b>{event.title}</b><small>{event.schools?.length ? event.schools.join("、") : meta.label}</small></span>; })}
          {dayClasses.map((c) => <span key={c.id} className="week-class" style={{ borderLeftColor: colorForClass(c.id) }}><b>{c.name}</b><small>{getSessionInfo(c, ds).time || "課堂"} · {activeStudentCount(c)} 人</small></span>)}
        </div>
      </button>
    );
  }

  const title = viewMode === "month"
    ? viewYear + " 年 " + (viewMonth + 1) + " 月"
    : weekCells[0].getFullYear() + " 年 " + (weekCells[0].getMonth() + 1) + " 月 " + weekCells[0].getDate() + " 日起的一週";

  return (
    <div className={"calendar calendar-shell calendar-view-" + viewMode}>
      <div className="calendar-header">
        <div className="calendar-title-group">
          <div className="calendar-kicker">教學節奏</div>
          <IconBtn title={viewMode === "month" ? "上個月" : "上一週"} onClick={() => viewMode === "month" ? changeMonth(-1) : changeWeek(-1)}><ChevronLeft size={18} /></IconBtn>
          <div className="calendar-title">{title}</div>
          <IconBtn title={viewMode === "month" ? "下個月" : "下一週"} onClick={() => viewMode === "month" ? changeMonth(1) : changeWeek(1)}><ChevronRight size={18} /></IconBtn>
        </div>
        <div className="calendar-header-actions">
          <button type="button" className="btn-ghost btn-sm calendar-today-button" onClick={selectToday}>回到今天</button>
          <div className="calendar-view-switch" role="group" aria-label="行事曆檢視方式">
            <button type="button" className={viewMode === "month" ? "active" : ""} onClick={() => setViewMode("month")}>月曆</button>
            <button type="button" className={viewMode === "week" ? "active" : ""} onClick={() => setViewMode("week")}>週曆</button>
          </div>
          <SaveIndicator status={calendarSaveState.status} onRetry={calendarSaveState.retry} />
          <button type="button" className="btn-primary btn-sm" onClick={() => setAdding((value) => !value)}>{adding ? "取消新增" : "新增事件"}</button>
        </div>
      </div>
      {adding && <CalendarEventForm date={selected} knownSchools={knownSchools} onCancel={() => setAdding(false)} onCreate={(event) => { onAddEvent(event); setAdding(false); }} />}
      {viewMode === "month" ? <>
        <div className="calendar-weekdays">{WEEKDAY_FULL.map((w) => <div key={w} className="calendar-wd">{w}</div>)}</div>
        <div className="calendar-grid">{monthCells.map(renderMonthCell)}</div>
      </> : <div className="week-grid">{weekCells.map(renderWeekCell)}</div>}
    </div>
  );
}

`;
source = replaceBetween(source, "function MonthCalendar(", "function CalendarEventsPanel(", monthCalendar + "function CalendarEventsPanel(");

const todayView = `function TodayView({ classes, onOpenClass, calendarEvents, onAddCalendarEvent, onDeleteCalendarEvent, onEditCalendarEvent, calendarReady, officialCalendarStatus, calendarSaveState, knownSchools }) {
  const [selected, setSelected] = useState(todayStr());
  const [attendanceMap, setAttendanceMap] = useState({});
  const classIdsKey = classes.map((c) => c.id).join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(classes.map(async (c) => [c.id, await loadKey("attendance:" + c.id, {})]));
      if (!cancelled) setAttendanceMap(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [classIdsKey]);

  function hasSession(cls, dateStr) { return isSessionDay(cls, dateStr, attendanceMap[cls.id]); }
  const matches = classes.filter((c) => hasSession(c, selected)).map((c) => ({ c, time: getSessionInfo(c, selected).time })).sort((a, b) => parseTimeMinutes(a.time) - parseTimeMinutes(b.time));
  const selectedDayEvents = eventsOnDate(calendarEvents, selected);
  const studentTotal = classes.reduce((sum, cls) => sum + activeStudentCount(cls), 0);
  const courseCount = matches.length;
  const eventCount = selectedDayEvents.length;

  return (
    <div className="view-pad today-page">
      <section className="today-hero">
        <div className="hero-copy">
          <div className="page-kicker"><span className="kicker-dot" />{formatDisplay(selected)} · 教學工作區</div>
          <h1>今天，先看見課堂的節奏。</h1>
          <p>用一張行事曆掌握上課班級、學生狀況與重要日程。點選日期，就能接著進入點名。</p>
        </div>
        <div className="hero-sticker" aria-hidden="true"><span>好好<br />教學</span><small>TEACH<br />WITH CARE</small></div>
      </section>
      <section className="today-metrics" aria-label="今日摘要">
        <div className="metric-card metric-card-coral"><span>今日課堂</span><strong>{courseCount}</strong><em>個班級</em></div>
        <div className="metric-card metric-card-teal"><span>目前學生</span><strong>{studentTotal}</strong><em>位學習者</em></div>
        <div className="metric-card metric-card-blue"><span>日程提醒</span><strong>{eventCount}</strong><em>{eventCount ? "項待查看" : "今天很清爽"}</em></div>
        <div className="metric-note"><CalendarDays size={20} /><div><strong>先選一天</strong><span>再從下方班級進入點名與紀錄</span></div></div>
      </section>
      <MonthCalendar selected={selected} onSelect={setSelected} classes={classes} hasSession={hasSession} calendarEvents={calendarEvents} onAddEvent={onAddCalendarEvent} knownSchools={knownSchools} calendarSaveState={calendarSaveState} />
      {selectedDayEvents.length > 0 && <CalendarEventsPanel date={selected} events={calendarEvents} onDelete={onDeleteCalendarEvent} onEdit={onEditCalendarEvent} knownSchools={knownSchools} />}
      <div className="section-heading-row"><div><div className="section-label">{formatDisplay(selected)} 的上課班級</div><div className="section-hint">點選班級即可直接開始點名</div></div><span className="section-count">{courseCount} 個班級</span></div>
      {matches.length === 0 && <div className="empty-note empty-note-card">這天沒有排定的課。可以利用「新增事件」記下其他重要日程。</div>}
      <div className="card-list">{matches.map(({ c, time }) => (
        <button key={c.id} className="class-card class-card-vivid" onClick={() => onOpenClass(c.id, "attendance", selected)}>
          <div className="class-card-ribbon" style={{ background: colorForClass(c.id) }} />
          <div className="class-card-body"><div className="class-card-title">{c.name}</div><div className="class-card-sub">{c.subject}{c.grade ? " · " + c.grade : ""} · {activeStudentCount(c)} 位學生</div></div>
          {time && <div className="class-card-time"><Clock size={13} /> {time}</div>}<ChevronRight size={18} color="#8792A2" />
        </button>
      ))}</div>
      {classes.length === 0 && <div className="empty-state">還沒有任何班級。到「所有班級」新增第一個班級吧。</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Classes list / management view                                      */
/* ------------------------------------------------------------------ */

`;
source = replaceBetween(source, "function TodayView(", "/* ------------------------------------------------------------------ */\n/* Classes list / management view", todayView);

const cssOverrides = `
/* TeachingRecord2 visual refresh: learning handbook / sticky-note style */
:root {
  --paper: #F7F8FC; --ink: #243047; --ink-soft: #718096; --brass: #F2A65A;
  --brass-soft: #FFF0D8; --line: #E5E9F2; --card: #FFFFFF;
  --coral: #F27D72; --teal: #41B3A3; --blue: #6177E8; --purple: #8B78D8;
  --shadow-soft: 0 12px 32px rgba(49, 62, 92, 0.08);
  --shadow-lift: 0 18px 38px rgba(49, 62, 92, 0.14);
}
body { margin: 0; background: var(--paper); }
button, input, select, textarea { transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease, transform 160ms ease; }
button:active { transform: scale(.98); }
.shell { position: relative; min-height: 100vh; background: radial-gradient(circle at 88% 0%, #FFF3E7 0, transparent 25rem), radial-gradient(circle at 0% 35%, #EAF8F5 0, transparent 28rem), var(--paper); }
.shell::before { content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .28; background-image: radial-gradient(#CBD4E7 0.7px, transparent 0.7px); background-size: 18px 18px; mask-image: linear-gradient(to bottom, black, transparent 75%); }
.topnav { position: sticky; top: 0; z-index: 10; min-height: 74px; padding: 13px clamp(18px, 4vw, 48px); gap: 22px; background: rgba(255,255,255,.88); border-bottom: 1px solid rgba(229,233,242,.9); box-shadow: 0 5px 22px rgba(49,62,92,.06); backdrop-filter: blur(18px); }
.brand { gap: 10px; min-width: 180px; }
.brand-mark { width: 40px; height: 40px; border-radius: 12px 12px 12px 4px; background: linear-gradient(145deg, var(--coral), #F7B36D); font-size: 18px; box-shadow: 0 8px 15px rgba(242,125,114,.26); transform: rotate(-5deg); }
.brand-text { color: var(--ink); font-family: 'Noto Sans TC', sans-serif; font-size: 17px; letter-spacing: .04em; }
.brand-caption { color: #9CA8BA; font-size: 10px; letter-spacing: .16em; margin-top: 2px; }
.topnav-middle { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 150px; color: #99A4B6; font-size: 12px; }
.topnav-breadcrumb { color: var(--ink); font-weight: 700; }
.topnav-dot, .kicker-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--teal); display: inline-block; box-shadow: 0 0 0 4px rgba(65,179,163,.12); }
.nav-pills { gap: 6px; }
.nav-pill { display: inline-flex; align-items: center; gap: 6px; border: 0; padding: 9px 13px; color: #7B8799; }
.nav-pill.pill-active { background: #EEF0FF; color: var(--blue); }
.pill { border-color: transparent; background: #F6F8FC; font-weight: 700; }
.utility-pill { padding: 8px 11px; color: #8290A4; }
.pill-warning { background: #FFF0D8 !important; color: #B8791B !important; }
.view-pad { position: relative; z-index: 1; max-width: 1240px; padding: 28px clamp(18px, 4vw, 48px) 56px; }
.today-hero { display: flex; justify-content: space-between; align-items: center; gap: 28px; padding: 30px 34px; margin-bottom: 18px; border-radius: 28px; background: linear-gradient(120deg, #FFF6EC 0%, #FFFDF8 58%, #ECF9F7 100%); border: 1px solid rgba(255,255,255,.8); box-shadow: var(--shadow-soft); overflow: hidden; }
.page-kicker { display: flex; align-items: center; gap: 9px; color: #E28A46; font-size: 12px; font-weight: 700; letter-spacing: .08em; }
.hero-copy h1 { margin: 10px 0 8px; max-width: 680px; color: var(--ink); font-size: clamp(25px, 4vw, 39px); line-height: 1.25; letter-spacing: -.04em; }
.hero-copy p { max-width: 620px; margin: 0; color: #78869A; font-size: 14px; line-height: 1.8; }
.hero-sticker { width: 128px; height: 128px; flex: 0 0 auto; display: grid; place-items: center; align-content: center; gap: 6px; color: #FFFFFF; text-align: center; background: linear-gradient(145deg, var(--teal), #64CBBB); border-radius: 45% 55% 48% 52%; transform: rotate(7deg); box-shadow: 0 14px 24px rgba(65,179,163,.22); }
.hero-sticker span { font-size: 20px; font-weight: 700; line-height: 1.25; }
.hero-sticker small { font: 700 8px/1.3 'IBM Plex Mono', monospace; letter-spacing: .12em; opacity: .72; }
.today-metrics { display: grid; grid-template-columns: repeat(3, minmax(130px, 1fr)) minmax(200px, 1.5fr); gap: 12px; margin-bottom: 22px; }
.metric-card, .metric-note { min-height: 108px; padding: 17px 18px; border-radius: 18px; box-shadow: var(--shadow-soft); }
.metric-card { display: grid; grid-template-columns: 1fr auto; align-items: end; border: 1px solid rgba(255,255,255,.75); }
.metric-card span { grid-column: 1/-1; color: rgba(36,48,71,.72); font-size: 12px; font-weight: 700; }
.metric-card strong { color: var(--ink); font: 700 32px/1 'IBM Plex Mono', monospace; margin-top: 13px; }
.metric-card em { align-self: end; color: rgba(36,48,71,.62); font-size: 11px; font-style: normal; }
.metric-card-coral { background: #FFE8E2; }.metric-card-teal { background: #DFF6F0; }.metric-card-blue { background: #E9EDFF; }
.metric-note { display: flex; align-items: center; gap: 12px; background: #FFFFFF; border: 1px dashed #CBD5E5; color: var(--blue); }
.metric-note div { display: flex; flex-direction: column; gap: 4px; }.metric-note strong { color: var(--ink); font-size: 13px; }.metric-note span { color: var(--ink-soft); font-size: 11px; line-height: 1.5; }
.calendar-shell { border: 0; border-radius: 24px; padding: 20px; box-shadow: var(--shadow-soft); }
.calendar-header { margin-bottom: 18px; }.calendar-title-group { gap: 8px; }.calendar-kicker { color: #9CA8BA; font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; margin-right: 6px; }.calendar-title { color: var(--ink); font-size: 19px; letter-spacing: -.02em; }
.calendar-header-actions { gap: 9px; }.calendar-view-switch { display: inline-flex; padding: 3px; border-radius: 10px; background: #F0F3F9; }.calendar-view-switch button { border: 0; border-radius: 7px; padding: 6px 10px; color: #8792A2; background: transparent; font: 700 11px 'Noto Sans TC', sans-serif; cursor: pointer; }.calendar-view-switch button.active { color: var(--blue); background: white; box-shadow: 0 3px 8px rgba(49,62,92,.12); }
.calendar-weekdays { color: #9CA8BA; font-weight: 700; }.calendar-wd:first-child, .calendar-wd:last-child { color: var(--coral); }.calendar-grid { gap: 6px; }.calendar-cell { min-height: 98px; padding: 8px 6px 6px; border-radius: 14px; background: #FBFCFE; border: 1px solid #F0F2F7; }.calendar-cell:hover { background: #F4F6FF; border-color: #DCE2FA; transform: translateY(-1px); }.calendar-cell-selected { background: #EEF0FF !important; border-color: #98A7F1 !important; box-shadow: inset 0 0 0 1px #98A7F1; }.calendar-cell-holiday { background: #FFF4F1; color: #D9675D; }.calendar-cell-today { box-shadow: 0 0 0 2px #F4B26E, 0 5px 12px rgba(242,166,90,.12); border-color: #F4B26E; }.calendar-cell-topline { display: flex; align-items: center; justify-content: center; gap: 5px; }.calendar-cell-num { color: var(--ink); font-size: 13px; font-weight: 700; }.today-badge { padding: 2px 4px; border-radius: 5px; color: #FFFFFF; background: var(--coral); font-size: 8px; font-weight: 700; }.calendar-cell-dots { margin-top: 4px; }.dot { width: 6px; height: 6px; }.calendar-event-label { padding: 3px 4px; border-radius: 5px; font-size: 9px; font-weight: 700; }.calendar-event-label-range { background: #F1EEFF !important; }.calendar-event-more { font-weight: 700; }
.week-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }.week-column { min-width: 0; min-height: 310px; padding: 0; border: 1px solid #E9EDF5; border-radius: 15px; background: #FBFCFE; overflow: hidden; text-align: left; cursor: pointer; }.week-column:hover { border-color: #B9C5F7; transform: translateY(-2px); }.week-column-selected { border: 2px solid #8E9FF0; background: #F2F4FF; }.week-column-today { box-shadow: 0 0 0 2px #F4B26E; }.week-column-head { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 11px 6px 10px; color: #8490A3; background: #F1F4FA; font-size: 11px; }.week-column-head strong { color: var(--ink); font: 700 16px 'IBM Plex Mono', monospace; }.week-column-head em { color: var(--coral); font-size: 9px; font-style: normal; font-weight: 700; }.week-column-body { display: flex; flex-direction: column; gap: 7px; padding: 10px; }.week-class, .week-event { display: flex; flex-direction: column; gap: 3px; padding: 8px 8px 8px 10px; border-left: 4px solid; border-radius: 7px; background: #FFFFFF; box-shadow: 0 4px 9px rgba(49,62,92,.06); }.week-class b, .week-event b { overflow: hidden; color: var(--ink); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.week-class small, .week-event small { overflow: hidden; color: var(--ink-soft); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }.week-empty { padding: 28px 4px; color: #B4BECC; font-size: 11px; text-align: center; }
.section-heading-row { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin: 24px 2px 9px; }.section-heading-row .section-label { margin: 0; }.section-count { padding: 5px 9px; border-radius: 999px; color: var(--blue); background: #EEF0FF; font: 700 10px 'IBM Plex Mono', monospace; }.empty-note-card { padding: 18px; border-radius: 14px; background: rgba(255,255,255,.72); border: 1px dashed #D7DFEC; }
.class-card { position: relative; overflow: hidden; border: 0; box-shadow: var(--shadow-soft); transition: transform 180ms ease, box-shadow 180ms ease; }.class-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift); }.class-card-vivid { min-height: 76px; padding: 16px 18px 16px 22px; background: #FFFFFF; }.class-card-ribbon { position: absolute; inset: 0 auto 0 0; width: 6px; }.class-card-title { color: var(--ink); }.class-card-sub { color: var(--ink-soft); }.class-card-time { color: #E28A46; }
.calendar-events-panel, .form-card, .panel, .fee-card { border: 0; box-shadow: var(--shadow-soft); }.section-label, .form-title, .panel-title { color: var(--ink); }.section-label { font-size: 17px; }.btn-primary { background: var(--blue); box-shadow: 0 7px 13px rgba(97,119,232,.18); }.btn-primary:hover { background: #5268D7; transform: translateY(-1px); }.btn-ghost { background: #FFFFFF; border-color: #DCE2ED; color: #748197; }.btn-ghost:hover, .icon-btn:hover { border-color: #AAB7EF; color: var(--blue); background: #F5F6FF; }.icon-btn { border-color: #E0E6F0; background: #FFFFFF; }
.form-card, .calendar-events-panel { border-radius: 18px; }.field input, .field select, .student-input { border-color: #E1E6F0; }.field input:focus, .field select:focus, .student-input:focus { outline: none; border-color: #91A0EE; box-shadow: 0 0 0 4px rgba(97,119,232,.12); }
.toast { background: var(--ink); box-shadow: var(--shadow-lift); }.backup-warning { background: #FFF1D9; border-color: #F5D39B; }.detail-title { color: var(--ink); }.tab-active { color: var(--blue); border-bottom-color: var(--blue); }
@media (max-width: 860px) { .topnav { gap: 12px; }.topnav-middle { order: 3; flex-basis: 100%; }.today-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }.metric-note { grid-column: span 2; } }
@media (max-width: 720px) { .view-pad { padding: 18px 12px 42px; }.today-hero { align-items: flex-start; padding: 23px 20px; }.hero-sticker { width: 86px; height: 86px; }.hero-sticker span { font-size: 15px; }.hero-copy p { font-size: 13px; }.calendar-shell { padding: 12px; }.calendar-header { align-items: flex-start; flex-direction: column; }.calendar-header-actions { width: 100%; flex-wrap: wrap; }.week-grid { overflow-x: auto; grid-template-columns: repeat(7, minmax(120px, 1fr)); padding-bottom: 6px; }.week-column { min-height: 260px; }.today-metrics { gap: 8px; }.metric-card { min-height: 92px; padding: 13px; }.metric-card strong { font-size: 26px; } }
`;
const cssEnd = source.lastIndexOf("\n`;");
if (cssEnd < 0) throw new Error("找不到 CSS 結尾");
source = source.slice(0, cssEnd) + cssOverrides + source.slice(cssEnd);

fs.writeFileSync(path, source);
console.log("UI refactor applied");
