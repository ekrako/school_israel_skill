import { UsageError } from "./errors.ts";

export interface StudentRef {
  readonly id: string;
  readonly name: string;
}

/**
 * Picks the students a command runs for. `selector` may be an id, an exact name, or a
 * 1-based index into the account's student list; without one, every student is used.
 */
export function selectStudents<T extends StudentRef>(
  students: readonly T[],
  selector: string | undefined,
): readonly T[] {
  if (selector === undefined) return students;
  const byIdOrName = students.filter((s) => s.id === selector || s.name === selector);
  if (byIdOrName.length > 0) return byIdOrName;
  const index = /^\d+$/.test(selector) ? Number(selector) - 1 : -1;
  const byIndex = students[index];
  if (byIndex !== undefined) return [byIndex];
  throw new UsageError(
    "No student matches --student.",
    "Run the app's `students` command to list ids, names and indexes.",
  );
}

/** Runs `load` for each student in parallel and tags each result with the student's id and name. */
export function forEachStudent<T extends StudentRef, R extends object>(
  students: readonly T[],
  load: (student: T) => Promise<R>,
): Promise<Array<StudentRef & R>> {
  return Promise.all(
    students.map(async (student) => ({
      id: student.id,
      name: student.name,
      ...(await load(student)),
    })),
  );
}
