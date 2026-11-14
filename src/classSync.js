/* Pure helpers (no Firebase, no React) for saving the class list safely when
   the app is open on more than one device or tab.

   The problem they solve: the teacher's browser keeps its own copy of the
   class list. If it saved that copy by overwriting /classes and removing every
   student who is not in it, a second device that had added a class or a
   student in the meantime would be wiped out by the first device's next save.

   The fix is a "baseline": what THIS tab last read from, or wrote to,
   Firebase. A save then only
     - writes classes that this tab changed compared with the baseline, and
     - removes classes / roster memberships that were in the baseline and are
       now gone (the teacher deleted them here).
   Anything this tab never knew about (added on another device) is left alone. */

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const safeId = (text) => String(text).replace(/[^A-Za-z0-9_-]/g, "_");

const entries = (value) => Object.entries(isObject(value) ? value : {});
export const classMap = (value) => Object.fromEntries(entries(value).map(([id, item]) => [id, { ...item, id }]));
export const studentMap = (value) => Object.fromEntries(entries(value).map(([id, item]) => [id, { ...item, id }]));

/** One roster line (what the class screen shows) from a student's enrollment.
    Only "stopped" is written as a membership: calling everyone else "active"
    switched the automatic 試聽 period off for all students as soon as the data
    was reloaded. The teacher's manual choice (forceActive / forceTrial) is kept. */
export function enrollmentToRoster(student, enrollment, cls) {
  return {
    id: student.id,
    name: student.displayName || student.name || "未命名學生",
    school: enrollment.school || "",
    group: enrollment.group || "",
    joinDate: enrollment.joinDate || "",
    endDate: enrollment.endDate || "",
    resumeDate: enrollment.resumeDate || "",
    ...(enrollment.status === "ended" ? { membership: "stopped" } : {}),
    ...(enrollment.forceActive ? { forceActive: true } : {}),
    ...(enrollment.forceTrial ? { forceTrial: true } : {}),
    isTrial: false,
    grade: enrollment.grade || cls.grade || "",
  };
}

/** /classes + /students -> the class list the app works with. */
export function toClassIndex(classesValue, studentsValue) {
  const classes = classMap(classesValue);
  const students = studentMap(studentsValue);
  return Object.values(classes).map((cls) => {
    const roster = [];
    for (const student of Object.values(students)) {
      for (const enrollment of Object.values(student.enrollments || {})) {
        if (enrollment.classId === cls.id) {
          roster.push(enrollmentToRoster(student, enrollment, cls));
          break;
        }
      }
    }
    return {
      ...cls,
      id: cls.id,
      name: cls.name || cls.displayName || "未命名班級",
      subject: cls.subject || "",
      grade: cls.grade || "",
      students: roster,
      scheduleRules: cls.scheduleRules || [],
      overrides: cls.overrides || [],
      archived: Boolean(cls.archived),
      hasFee: Boolean(cls.hasFee),
    };
  });
}

/** Which classes and which (student, class) memberships a class list holds. */
export function membershipOf(classList) {
  const classIds = new Set();
  const pairs = new Set();
  for (const cls of Array.isArray(classList) ? classList : []) {
    if (!cls?.id) continue;
    classIds.add(cls.id);
    for (const roster of cls.students || []) if (roster?.id) pairs.add(`${roster.id}|${cls.id}`);
  }
  return { classIds, pairs };
}

/** /classes root made from the app's class list (rosters live under /students). */
export function toClassesRoot(classList) {
  return Object.fromEntries((Array.isArray(classList) ? classList : []).filter((item) => item?.id).map((item) => {
    const { students, ...cls } = item;
    return [item.id, JSON.parse(JSON.stringify({ ...cls, id: item.id }))];
  }));
}

/** Patch for update(ref(db, "classes")): only this tab's own changes.
    `baseline` is what this tab last saw (id -> class record). */
export function classesPatch(baseline, next) {
  const patch = {};
  const before = isObject(baseline) ? baseline : {};
  for (const id of Object.keys(before)) if (!(id in next)) patch[id] = null;
  for (const [id, record] of Object.entries(next)) if (!same(before[id], record)) patch[id] = record;
  return patch;
}

/** The /students map after applying this tab's class list to `current`.
    `current` must be a map of id -> student (a copy; it is not modified).
    `known` is membershipOf() of the baseline class list.

    An enrollment is removed only when this tab knew about it and it is gone
    now: its class was deleted here, or the student was taken off that roster
    here. A student is removed only when this pass took away their last
    enrollment. Enrollments, students and classes added elsewhere are kept. */
export function applyClassList(current, classList, known) {
  const students = JSON.parse(JSON.stringify(current || {}));
  const list = Array.isArray(classList) ? classList : [];
  const now = membershipOf(list);

  for (const [studentId, student] of Object.entries(students)) {
    const enrollments = { ...(student.enrollments || {}) };
    let removedAny = false;
    for (const [enrollmentId, enrollment] of Object.entries(enrollments)) {
      const classId = enrollment?.classId;
      const classDeletedHere = known.classIds.has(classId) && !now.classIds.has(classId);
      const leftRosterHere = known.pairs.has(`${studentId}|${classId}`) && !now.pairs.has(`${studentId}|${classId}`);
      if (classDeletedHere || leftRosterHere) {
        delete enrollments[enrollmentId];
        removedAny = true;
      }
    }
    if (!removedAny) continue;
    if (Object.keys(enrollments).length === 0) delete students[studentId];
    else students[studentId] = { ...student, enrollments };
  }

  for (const cls of list) {
    for (const roster of cls.students || []) {
      if (!roster?.id) continue;
      const previous = students[roster.id] || { id: roster.id, displayName: roster.name || "", aliases: [], enrollments: {}, sourceRefs: [] };
      const existing = Object.values(previous.enrollments || {}).find((item) => item.classId === cls.id);
      const enrollmentId = existing?.id || safeId(`enr_${roster.id}_${cls.id}`);
      // the manual 試聽 flags are rewritten from the roster every time, so turning one off really removes it
      const carried = { ...(existing || {}) };
      delete carried.forceActive;
      delete carried.forceTrial;
      students[roster.id] = {
        ...previous,
        displayName: roster.name || previous.displayName || "",
        enrollments: {
          ...(previous.enrollments || {}),
          [enrollmentId]: {
            ...carried,
            id: enrollmentId,
            studentId: roster.id,
            classId: cls.id,
            className: cls.name || "",
            subject: cls.subject || "",
            grade: roster.grade || cls.grade || "",
            school: roster.school || "",
            group: roster.group || "",
            joinDate: roster.joinDate || "",
            endDate: roster.endDate || "",
            resumeDate: roster.resumeDate || "",
            status: roster.membership === "stopped" ? "ended" : "active",
            ...(roster.forceActive ? { forceActive: true } : {}),
            ...(roster.forceTrial ? { forceTrial: true } : {}),
          },
        },
      };
    }
  }
  return students;
}
