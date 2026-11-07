/* Pure helpers (no Firebase, no React) that turn one class's 平時考／段考 table
   ({ columns, scores }) into the rows stored under /assessments and
   /assessmentColumns, and back.

   Every field of a column that the teacher can set must appear in BOTH
   directions below. `subject` (物理／化學 inside a 物理化學 class) used to be
   missing from them, so the tag disappeared after a reload and never reached
   the student's page. */

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const entries = (value) => Object.entries(isObject(value) ? value : {});
const safeKey = (text) => String(text).replace(/[^A-Za-z0-9_-]/g, "_");

/** Only written when set, so columns without a subject keep exactly the same
    stored shape as before (no mass rewrite of old rows). */
const withSubject = (subject) => (subject ? { subject: String(subject) } : {});

/** Firebase rows -> the { columns, scores } table the teacher edits. */
export function assessmentForClass(value, classId, type, storedColumns = {}) {
  const rows = Object.values(isObject(value) ? value : {}).filter((record) => record.classId === classId && record.type === type);
  const byId = new Map(
    Object.values(isObject(storedColumns) ? storedColumns : {})
      .filter((row) => row?.classId === classId && row?.type === type)
      .map((row) => [row.assessmentId, { id: row.assessmentId, name: row.name || "", date: row.date || "", range: row.range || "", segment: row.segment || "", ...withSubject(row.subject) }]),
  );
  for (const row of rows) {
    if (!byId.has(row.assessmentId)) byId.set(row.assessmentId, { id: row.assessmentId, name: row.name || "", date: row.date || "", range: row.range || "", ...withSubject(row.subject) });
  }
  const scores = {};
  for (const row of rows) {
    scores[row.assessmentId] ||= {};
    scores[row.assessmentId][row.studentId] = isObject(row.score) ? row.score : { score: row.score };
  }
  return { columns: [...byId.values()], scores };
}

/** The { columns, scores } table -> the two row lists to store. */
export function assessmentRowsFor(classId, value, type) {
  const rows = {};
  for (const column of value?.columns || []) {
    for (const [studentId, score] of entries(value?.scores?.[column.id])) {
      const id = safeKey(`asm_${type}_${classId}_${column.id}_${studentId}`);
      rows[id] = { id, studentId, classId, type, assessmentId: column.id, name: column.name || "", date: column.date || "", range: column.range || "", ...withSubject(column.subject), score };
    }
  }
  const columns = Object.fromEntries((value?.columns || []).filter((column) => column?.id).map((column) => {
    const id = safeKey(`col_${type}_${classId}_${column.id}`);
    return [id, { id, classId, type, assessmentId: column.id, name: column.name || "", date: column.date || "", range: column.range || "", segment: column.segment || "", ...withSubject(column.subject) }];
  }));
  return { rows, columns };
}
