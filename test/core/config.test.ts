import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveEnvFile } from "../../src/core/config.ts";
import { ConfigError } from "../../src/core/errors.ts";

let dir: string;
let skillRoot: string;
let configHome: string;
let userFile: string;
let skillFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "school-env-"));
  skillRoot = join(dir, "skill");
  configHome = join(dir, "config");
  userFile = join(configHome, "israel-school", ".env");
  skillFile = join(skillRoot, ".env");
  mkdirSync(join(configHome, "israel-school"), { recursive: true });
  mkdirSync(skillRoot);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("env file lookup", () => {
  it("prefers the user config dir, which survives skill updates", () => {
    writeFileSync(userFile, "");
    writeFileSync(skillFile, "");
    expect(resolveEnvFile({ XDG_CONFIG_HOME: configHome }, skillRoot)).toBe(userFile);
  });

  it("falls back to .env in the skill folder", () => {
    writeFileSync(skillFile, "");
    expect(resolveEnvFile({ XDG_CONFIG_HOME: configHome }, skillRoot)).toBe(skillFile);
  });

  it("loads nothing when neither file exists", () => {
    expect(resolveEnvFile({ XDG_CONFIG_HOME: configHome }, skillRoot)).toBeUndefined();
  });

  it("uses SCHOOL_ENV_FILE over both, and rejects a missing one", () => {
    writeFileSync(userFile, "");
    const explicit = join(dir, "custom.env");
    writeFileSync(explicit, "");
    expect(
      resolveEnvFile({ SCHOOL_ENV_FILE: explicit, XDG_CONFIG_HOME: configHome }, skillRoot),
    ).toBe(explicit);
    expect(() => resolveEnvFile({ SCHOOL_ENV_FILE: join(dir, "nope") }, skillRoot)).toThrow(
      ConfigError,
    );
  });
});
