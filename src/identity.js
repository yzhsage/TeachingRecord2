const ID_PREFIXES = Object.freeze({
  student: "stu_",
  lineage: "lin_",
  classInstance: "cls_",
  enrollment: "enr_",
  attendance: "att_",
  assessment: "asm_",
  fee: "fee_",
  calendarEvent: "evt_",
});

function randomUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error("目前環境不支援安全亂數 UUID，無法建立新的身分 ID。");
}

export function createId(kind) {
  const prefix = ID_PREFIXES[kind];
  if (!prefix) throw new Error(`未知的 ID 類型：${kind}`);
  return `${prefix}${randomUuid()}`;
}

export function createStudentId() { return createId("student"); }
export function createLineageId() { return createId("lineage"); }
export function createClassInstanceId() { return createId("classInstance"); }
export function createEnrollmentId() { return createId("enrollment"); }
export function createAttendanceId() { return createId("attendance"); }
export function createAssessmentId() { return createId("assessment"); }
export function createFeeId() { return createId("fee"); }
export function createCalendarEventId() { return createId("calendarEvent"); }

export function isGeneratedId(value, kind) {
  const prefix = ID_PREFIXES[kind];
  return typeof value === "string" && Boolean(prefix) && value.startsWith(prefix) && value.length > prefix.length;
}

export function idPrefixes() {
  return { ...ID_PREFIXES };
}
