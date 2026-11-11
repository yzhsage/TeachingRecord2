/* One place for how the whole app looks: colours, button and input sizes,
   hover / focus / disabled states, attendance-status colours and chart colours.
   The teacher app, the student card, the parent portal and the login page all
   use it, so a button or colour changed here changes everywhere.

   Sizes (buttons):  xs 28px · sm 32px · md 38px · lg 44px (login / portal)
   Radius:           6 / 8 / 10 / 14 / 18, plus 999 for pills
   Text:             nothing smaller than 11px */

export const FONT_IMPORT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700&family=Noto+Sans+TC:wght@400;500;700&family=IBM+Plex+Mono:wght@500;600&display=swap');`;

export const THEME_VARS_CSS = `
:root {
  --paper: #F7F8FC; --ink: #243047; --ink-soft: #718096; --brass: #F2A65A;
  --brass-soft: #FFF0D8; --line: #E5E9F2; --card: #FFFFFF;
  --coral: #F27D72; --teal: #41B3A3; --blue: #6177E8; --purple: #8B78D8;
  --blue-soft: #EEF0FF; --blue-deep: #5268D7;
  --danger: #B23A34; --danger-deep: #962F2A; --danger-soft: #FBEAE9;
  --shadow-soft: 0 12px 32px rgba(49, 62, 92, 0.08);
  --shadow-lift: 0 18px 38px rgba(49, 62, 92, 0.14);
  --disabled-opacity: .45;
}
`;

export const THEME_COMPONENTS_CSS = `
/* ===== buttons: one look for every screen ===== */
.btn-primary, .btn-ghost, .btn-danger, .portal-primary, .auth-btn, .google-btn, .portal-email-btn, .load-error-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 38px; padding: 0 16px; border: 1px solid transparent; border-radius: 10px;
  font-family: inherit; font-size: 13px; font-weight: 600; line-height: 1.2; white-space: nowrap;
  text-decoration: none; cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, opacity 160ms ease, transform 160ms ease;
}
.btn-primary, .portal-primary, .auth-btn, .portal-email-btn, .load-error-btn { background: var(--blue); color: #FFFFFF; box-shadow: 0 6px 12px rgba(97,119,232,.18); }
.btn-primary:hover:not(:disabled), .portal-primary:hover:not(:disabled), .auth-btn:hover:not(:disabled), .portal-email-btn:hover:not(:disabled), .load-error-btn:hover { background: var(--blue-deep); transform: translateY(-1px); }
.btn-ghost, .google-btn { background: var(--card); color: var(--ink-soft); border-color: #DCE2ED; }
.google-btn { color: var(--ink); }
.btn-ghost:hover:not(:disabled), .google-btn:hover:not(:disabled) { background: #F5F6FF; border-color: #AAB7EF; color: var(--blue); }
.btn-ghost.is-on { background: var(--blue); border-color: var(--blue); color: #FFFFFF; }
.btn-danger { background: var(--danger); color: #FFFFFF; }
.btn-danger:hover:not(:disabled) { background: var(--danger-deep); }
.btn-sm { min-height: 32px; padding: 0 12px; font-size: 12px; border-radius: 8px; }
.btn-xs { min-height: 28px; padding: 0 10px; font-size: 12px; border-radius: 8px; }
.portal-primary, .auth-btn, .google-btn, .portal-email-btn { width: 100%; min-height: 44px; font-size: 15px; }
.btn-primary:disabled, .btn-ghost:disabled, .btn-danger:disabled, .portal-primary:disabled, .auth-btn:disabled, .google-btn:disabled, .portal-email-btn:disabled, .icon-btn:disabled, .status-btn:disabled, .pill:disabled {
  opacity: var(--disabled-opacity); cursor: not-allowed; transform: none; box-shadow: none;
}
.btn-link, .so-back, .portal-link { border: 0; background: none; padding: 6px 8px; font-family: inherit; font-size: 13px; color: var(--ink-soft); cursor: pointer; }
.btn-link:hover, .so-back:hover, .portal-link:hover { color: var(--blue); }
.so-back { padding-left: 0; color: var(--ink); font-size: 14px; font-weight: 700; }

/* ===== toggle pills (filters, tabs) ===== */
.pill, .sc-filter button, .sc-filter span, .portal-tabs button {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 999px;
  background: var(--card); color: var(--ink-soft); font-family: inherit; font-size: 13px; font-weight: 600; line-height: 1.2; cursor: pointer;
}
.pill-sm { min-height: 28px; padding: 0 12px; font-size: 12px; }
.pill-active, .sc-filter button.active, .portal-tabs button.active { background: var(--blue); border-color: var(--blue); color: #FFFFFF; box-shadow: 0 6px 14px rgba(97,119,232,.22); }
.nav-pill, .utility-pill { border-color: transparent; background: #F6F8FC; font-weight: 700; }
.nav-pill { min-height: 38px; padding: 0 14px; }
.utility-pill { min-height: 34px; padding: 0 12px; }

/* ===== inputs and selects: same height, radius and text size ===== */
.field input, .field select, .student-input, .lesson-videos-toolbar input, .lesson-videos-toolbar select, .lesson-video-form input,
.auth-input, .so-search, .so-select, .sc-attendance-filters input, .sc-attendance-filters select {
  min-height: 38px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px;
  background: #FFFFFF; color: var(--ink); font-family: inherit; font-size: 14px;
}

/* ===== keyboard focus: visible everywhere ===== */
button:focus-visible, a:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible, [role="button"]:focus-visible {
  outline: 2px solid var(--blue); outline-offset: 2px;
}

/* ===== touch screens: 16px text in fields so iPhone / iPad do not zoom in on focus ===== */
@media (pointer: coarse) {
  .field input, .field select, .field textarea, .student-input, .lesson-videos-toolbar input, .lesson-videos-toolbar select, .lesson-video-form input,
  .auth-input, .so-search, .so-select, .sc-attendance-filters input, .sc-attendance-filters select,
  .matrix-input, .matrix-input-sub, .assessment-name-input, .assessment-range-input { font-size: 16px; }
}
`;

/** Everything a screen without its own App stylesheet needs (login page, parent portal). */
export const THEME_CSS = FONT_IMPORT_CSS + THEME_VARS_CSS + THEME_COMPONENTS_CSS;

/** Attendance status colours. The teacher's attendance grid, the student card
    and the parent portal all read this one table. */
export const STATUS_STYLE = {
  出席: { bg: "#EAF3EC", fg: "#3F7D5C", bd: "#BFDCC9", short: "出" },
  請假: { bg: "#FBF3DE", fg: "#A87B14", bd: "#EFDBA0", short: "假" },
  曠課: { bg: "#FBEAE9", fg: "#B23A34", bd: "#F0C6C3", short: "曠" },
  遲到: { bg: "#E9EFF6", fg: "#3F5E8C", bd: "#C3D3E7", short: "遲" },
  早退: { bg: "#EFE9F6", fg: "#6A4E9C", bd: "#D8CBEF", short: "早" },
  延課: { bg: "#EEEEEC", fg: "#71757A", bd: "#D9D9D5", short: "延" },
  假期: { bg: "#E6F1F3", fg: "#2E7D8C", bd: "#BFE0E5", short: "假期" },
};

/** Colours for charts (recharts needs real values, not CSS variables). */
export const CHART_THEME = { line: "#6177E8", average: "#8E99A4", grid: "#E5E9F2", axis: "#E5E9F2", tick: "#718096" };
