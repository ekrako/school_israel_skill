import { describe, expect, it } from "vitest";
import { effectiveAccess, isReadRoute, parseAccessLevel, route } from "../../src/core/access.ts";
import { ConfigError } from "../../src/core/errors.ts";

describe("access level", () => {
  it("defaults to read when SCHOOL_ACCESS is unset or empty", () => {
    expect(parseAccessLevel(undefined)).toBe("read");
    expect(parseAccessLevel("")).toBe("read");
  });

  it("accepts unattended as its own level", () => {
    expect(parseAccessLevel("unattended")).toBe("unattended");
  });

  it("rejects values other than read, full and unattended", () => {
    expect(() => parseAccessLevel("admin")).toThrow(ConfigError);
    expect(() => parseAccessLevel("FULL")).toThrow(ConfigError);
  });

  it("lets the read-only flag lower full access but never raise read access", () => {
    expect(effectiveAccess("full", true)).toBe("read");
    expect(effectiveAccess("full", false)).toBe("full");
    expect(effectiveAccess("read", false)).toBe("read");
    expect(effectiveAccess("unattended", true)).toBe("read");
  });
});

describe("read allowlist", () => {
  const routes = [route("GET", "/api/students/:id/grades"), route("POST", "/api/login")];

  it("matches listed method and path pairs", () => {
    expect(isReadRoute(routes, "GET", "/api/students/abc-1/grades")).toBe(true);
    expect(isReadRoute(routes, "POST", "/api/login")).toBe(true);
  });

  it("rejects a listed path with a different method", () => {
    expect(isReadRoute(routes, "POST", "/api/students/abc/grades")).toBe(false);
  });

  it("rejects paths that only share a prefix or span extra segments", () => {
    expect(isReadRoute(routes, "POST", "/api/login/reset")).toBe(false);
    expect(isReadRoute(routes, "GET", "/api/students/a/b/grades")).toBe(false);
  });

  it("treats template punctuation literally", () => {
    expect(isReadRoute([route("GET", "/api/v1.0/items")], "GET", "/api/v1x0/items")).toBe(false);
  });
});
