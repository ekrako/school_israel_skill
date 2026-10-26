import { describe, expect, it } from "vitest";
import { studentsFromLogin } from "../../src/mashov/students.ts";

describe("studentsFromLogin", () => {
  it("reads a parent's children", () => {
    const body = {
      accessToken: {
        children: [
          { childGuid: "g-1", privateName: "Noa", familyName: "Levi", classCode: "ז", classNum: 2 },
          { privateName: "No id" },
        ],
      },
    };
    expect(studentsFromLogin(body)).toEqual([
      { id: "g-1", name: "Noa Levi", classCode: "ז", classNum: 2 },
    ]);
  });

  it("falls back to a student's own user id", () => {
    const body = { credential: { userId: "u-9" }, accessToken: { displayName: "Ido Levi" } };
    expect(studentsFromLogin(body)).toEqual([
      { id: "u-9", name: "Ido Levi", classCode: undefined, classNum: undefined },
    ]);
  });

  it("returns no students for an unrecognised body", () => {
    expect(studentsFromLogin("<html>")).toEqual([]);
    expect(studentsFromLogin({ accessToken: { children: "x" } })).toEqual([]);
  });
});
