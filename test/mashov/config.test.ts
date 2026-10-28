import { describe, expect, it } from "vitest";
import {
  currentSchoolYear,
  readMashovConfig,
} from "../../skills/israel-school/src/mashov/config.ts";

const ENV = { MASHOV_USERNAME: "user", MASHOV_PASSWORD: "pass", MASHOV_SEMEL: "123456" };

describe("Mashov config", () => {
  it("names the school year by the calendar year it ends in", () => {
    expect(currentSchoolYear(new Date(2026, 7, 31))).toBe("2026");
    expect(currentSchoolYear(new Date(2026, 8, 1))).toBe("2027");
    expect(currentSchoolYear(new Date(2027, 0, 15))).toBe("2027");
  });

  it("lets MASHOV_YEAR override the computed year", () => {
    expect(readMashovConfig({ ...ENV, MASHOV_YEAR: "2025" }).year).toBe("2025");
  });

  it("names the first missing credential", () => {
    expect(() => readMashovConfig({ ...ENV, MASHOV_PASSWORD: " " })).toThrow(
      "MASHOV_PASSWORD is not set.",
    );
  });

  it("rejects malformed semel and year values", () => {
    expect(() => readMashovConfig({ ...ENV, MASHOV_SEMEL: "abc" })).toThrow("MASHOV_SEMEL");
    expect(() => readMashovConfig({ ...ENV, MASHOV_YEAR: "26" })).toThrow("MASHOV_YEAR");
  });
});
