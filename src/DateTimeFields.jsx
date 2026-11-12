import React, { useEffect, useRef, useState } from "react";
import { fmtDate, normalizeTime } from "./dateFormat.js";

/* The browser's own date and time boxes write their text in the browser's
   language: "yyyy/月/dd" for an empty date, a 12 hour clock "-- --:--" for
   time. These two components show OUR text instead, so every screen reads the
   same way:

   DateField  shows 2026/11/09（週一）, empty shows 選擇日期. Clicking it opens
              the browser's own calendar (a transparent date input sits on top,
              so phones and keyboards keep working).
   TimeField  is a text box for a 24 hour time: 1830, 18:30 and 6:30 all become
              HH:MM. */

const CalendarIcon = () => (
  <svg className="date-field-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

/** value / onChange use "YYYY-MM-DD" strings ("" = empty). onChange gets the string, not an event. */
export function DateField({ value, onChange, min, max, placeholder = "選擇日期", showWeekday = true, clearable = false, disabled = false, className = "", "aria-label": ariaLabel }) {
  const inputRef = useRef(null);
  const text = value ? fmtDate(value, { weekday: showWeekday }) : placeholder;

  function openPicker() {
    try { inputRef.current?.showPicker?.(); } catch { /* no picker available: the field still works by keyboard */ }
  }

  return (
    <span className={`date-field${value ? "" : " is-empty"}${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}>
      <span className="date-field-text">{text}</span>
      <CalendarIcon />
      <input
        ref={inputRef}
        type="date"
        lang="zh-TW"
        className="date-field-native"
        value={value || ""}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel || placeholder}
        onChange={(event) => onChange(event.target.value)}
        onClick={openPicker}
      />
      {clearable && value && !disabled && (
        <button type="button" className="date-field-clear" aria-label="清除日期" title="清除日期" onClick={() => onChange("")}>×</button>
      )}
    </span>
  );
}

/** value / onChange use "HH:MM" strings ("" = empty). onChange gets the string, not an event. */
export function TimeField({ value, onChange, placeholder = "例：18:30", className = "", disabled = false, "aria-label": ariaLabel }) {
  const [draft, setDraft] = useState(value || "");
  const [invalid, setInvalid] = useState(false);

  // follow the outside value (form reset, editing another rule)
  useEffect(() => { setDraft(value || ""); setInvalid(false); }, [value]);

  function handleChange(event) {
    const text = event.target.value.slice(0, 5);
    setDraft(text);
    const time = normalizeTime(text);
    if (time === null) {
      const badCharacters = /\D/.test(text.replace(/[:：０-９]/g, ""));
      const tooManyDigits = text.replace(/\D/g, "").length >= 4; // looks finished but is not a real time, e.g. 25:00
      setInvalid(text.trim() !== "" && (badCharacters || tooManyDigits));
      return;
    }
    setInvalid(false);
    if (time !== (value || "")) onChange(time);
  }

  function handleBlur() {
    const time = normalizeTime(draft, { final: true });
    if (time === null) { setDraft(value || ""); setInvalid(false); return; } // not a time: put the last good one back
    setDraft(time);
    setInvalid(false);
    if (time !== (value || "")) onChange(time);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      className={`time-field${invalid ? " is-invalid" : ""}${className ? ` ${className}` : ""}`}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel || "時間（24 小時制）"}
      aria-invalid={invalid || undefined}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    />
  );
}
