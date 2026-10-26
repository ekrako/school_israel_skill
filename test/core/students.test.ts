import { describe, expect, it } from "vitest";
import { selectStudents } from "../../src/core/students.ts";

const STUDENTS = [
  { id: "g-1", name: "Noa Levi" },
  { id: "g-2", name: "Ido Levi" },
];

describe("selectStudents", () => {
  it("returns every student when no selector is given", () => {
    expect(selectStudents(STUDENTS, undefined)).toEqual(STUDENTS);
  });

  it("matches by id, exact name or 1-based index", () => {
    expect(selectStudents(STUDENTS, "g-2")).toEqual([STUDENTS[1]]);
    expect(selectStudents(STUDENTS, "Noa Levi")).toEqual([STUDENTS[0]]);
    expect(selectStudents(STUDENTS, "2")).toEqual([STUDENTS[1]]);
  });

  it("rejects a selector that matches nobody", () => {
    expect(() => selectStudents(STUDENTS, "3")).toThrow("No student matches --student.");
    expect(() => selectStudents(STUDENTS, "0")).toThrow("No student matches --student.");
  });
});
