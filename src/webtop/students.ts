import type { StudentRef } from "../core/students.ts";

export interface WebtopStudent extends StudentRef {
  readonly classCode: number | string | undefined;
  readonly classNum: number | string | undefined;
  readonly studyYear: number | string | undefined;
}

type Json = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const STUDENT_LIST_KEYS = ["childrens", "students", "children"];

/** Reads the account's students from InitDashboard's `data`, where the server spells the list `childrens`. */
export function studentsFromDashboard(data: unknown): readonly WebtopStudent[] {
  const listKey = isObject(data)
    ? STUDENT_LIST_KEYS.find((key) => Array.isArray(data[key]))
    : undefined;
  const entries = Array.isArray(data) ? data : isObject(data) && listKey ? data[listKey] : [];
  return (entries as unknown[]).filter(isObject).flatMap(toStudent);
}

function toStudent(entry: Json): WebtopStudent[] {
  const id = pick(entry, "id", "Id", "studentId", "StudentId");
  if (typeof id !== "string" || id === "") return [];
  const fullName = [pick(entry, "firstName", "FirstName"), pick(entry, "lastName", "LastName")]
    .filter((part) => typeof part === "string")
    .join(" ");
  const name = pick(entry, "studentName", "name", "Name");
  return [
    {
      id,
      name: typeof name === "string" ? name : fullName,
      classCode: scalar(pick(entry, "classCode", "ClassCode")),
      classNum: scalar(pick(entry, "classNum", "classNumber", "ClassNumber")),
      studyYear: scalar(pick(entry, "studyYear", "StudyYear")),
    },
  ];
}

function pick(entry: Json, ...keys: string[]): unknown {
  return keys
    .map((key) => entry[key])
    .find((value) => value !== undefined && value !== null && value !== "");
}

function scalar(value: unknown): number | string | undefined {
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}
