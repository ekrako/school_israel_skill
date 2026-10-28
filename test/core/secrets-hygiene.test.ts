import { describe, expect, it } from "vitest";
import { requireEnv } from "../../skills/israel-school/src/core/config.ts";
import { ConfigError } from "../../skills/israel-school/src/core/errors.ts";
import { toErrorResult } from "../../skills/israel-school/src/core/output.ts";
import { redactPath } from "../../skills/israel-school/src/core/redact.ts";

const SENTINEL = "SENTINEL-secret-value-0000";

describe("secret hygiene", () => {
  it("never echoes the message of an unexpected error", () => {
    const { envelope, exitCode } = toErrorResult(new Error(`boom ${SENTINEL}`));
    expect(JSON.stringify(envelope)).not.toContain(SENTINEL);
    expect(exitCode).toBe(1);
  });

  it("names a missing variable without printing other values", () => {
    const env = { OTHER_PASSWORD: SENTINEL };
    const error = (() => {
      try {
        requireEnv(env, "MASHOV_PASSWORD");
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ConfigError);
    expect(JSON.stringify(toErrorResult(error).envelope)).not.toContain(SENTINEL);
    expect((error as Error).message).toContain("MASHOV_PASSWORD");
  });

  it("treats blank variables as missing", () => {
    expect(() => requireEnv({ MASHOV_PASSWORD: "  " }, "MASHOV_PASSWORD")).toThrow(ConfigError);
  });

  it.each([
    ["/api/students/123456789/grades", "/api/students/:id/grades"],
    ["/api/students/3f2504e0-4f89-11d3-9a0c-0305e82c3301/behave", "/api/students/:id/behave"],
    ["/api/x/U2FsdGVkX1abcdefghijklmnop", "/api/x/:id"],
    ["/server/api/dashboard/InitDashboard", "/server/api/dashboard/InitDashboard"],
  ])("redacts id-like path segments: %s", (input, expected) => {
    expect(redactPath(input)).toBe(expected);
  });
});
