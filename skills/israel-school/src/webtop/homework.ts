// Ported from smartschool/homework.py in https://github.com/Shanksg/smartschool-webtop
// Copyright (c) 2026 Shanksg, MIT License. See THIRD_PARTY_NOTICES.md.

export interface HomeworkItem {
  readonly date: string;
  readonly subject: string;
  readonly teacher: string;
  readonly homework: string;
  readonly description: string;
}

type Json = Readonly<Record<string, unknown>>;

/** Teachers often type "none" into the homework field instead of leaving it empty. */
const NO_HOMEWORK_VALUES = new Set(
  [
    "אין",
    "אין שיעורי בית",
    "אין שעורי בית",
    "לא הוזן",
    "ללא",
    "ללא שיעורי בית",
    "none",
    "n/a",
    "-",
    "--",
    ".",
  ].map((value) => value.toLowerCase()),
);

export function isNoHomework(text: string): boolean {
  const normalised = text
    .split(/\s+/)
    .join(" ")
    .trim()
    .replace(/^[.!:;־-]+|[.!:;־-]+$/g, "")
    .toLowerCase();
  return normalised === "" || NO_HOMEWORK_VALUES.has(normalised);
}

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const objects = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Homework from PupilCard/GetPupilLessonsAndHomework.
 * Shape: `[{date, hoursData: [{scheduale: [{homeWork, subject_name, teacher, descClass}]}]}]`
 * (`scheduale` is the server's spelling).
 */
export function fromPupilCard(data: unknown): HomeworkItem[] {
  return objects(data).flatMap((day) =>
    objects(day.hoursData)
      .flatMap((hour) => objects(hour.scheduale))
      .filter((entry) => !isNoHomework(text(entry.homeWork)))
      .map((entry) => ({
        date: text(day.date),
        subject: text(entry.subject_name),
        teacher: text(entry.teacher),
        homework: text(entry.homeWork),
        description: text(entry.descClass),
      })),
  );
}

const HOMEWORK_KEYS = ["homeworkData", "homeWork", "homework", "HomeWork", "Homework"];
const SUBJECT_KEYS = ["lesson", "subject_name", "subjectName", "subject", "Subject", "Lesson"];
const TEACHER_KEYS = ["teacher", "Teacher", "teacherName", "TeacherName"];
const DATE_KEYS = ["date", "Date", "lessonDate", "LessonDate", "dueDate", "DueDate"];
const DESCRIPTION_KEYS = ["descClass", "description", "Description"];

const pick = (node: Json, keys: readonly string[]): string =>
  keys.map((key) => text(node[key])).find((value) => value !== "") ?? "";

/**
 * Homework from dashboard/GetHomeWork, which returns today's lessons in `dataTable[]`
 * with the text in `homeworkData`. The shape has changed before, so this walks the
 * whole tree and lets nested lessons inherit the nearest date and subject above them.
 */
export function fromDashboard(
  data: unknown,
  inherited = { date: "", subject: "" },
): HomeworkItem[] {
  if (Array.isArray(data)) return data.flatMap((entry) => fromDashboard(entry, inherited));
  if (!isObject(data)) return [];
  const context = {
    date: pick(data, DATE_KEYS) || inherited.date,
    subject: pick(data, SUBJECT_KEYS) || inherited.subject,
  };
  const homework = pick(data, HOMEWORK_KEYS);
  const own = isNoHomework(homework)
    ? []
    : [
        {
          date: context.date,
          subject: context.subject,
          teacher: pick(data, TEACHER_KEYS),
          homework,
          description: pick(data, DESCRIPTION_KEYS),
        },
      ];
  const nested = Object.values(data)
    .filter((value) => typeof value === "object" && value !== null)
    .flatMap((value) => fromDashboard(value, context));
  return [...own, ...nested];
}
