import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPrivateEnvFile,
  resolveEnvFile,
} from "../../skills/israel-school/src/core/config.ts";
import { ConfigError } from "../../skills/israel-school/src/core/errors.ts";

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

describe("env file permissions", () => {
  it("accepts a file only its owner can read", () => {
    writeFileSync(userFile, "", { mode: 0o600 });
    expect(() => assertPrivateEnvFile(userFile)).not.toThrow();
  });

  it.each([0o644, 0o640, 0o604])("refuses mode %o and says how to fix it", (mode) => {
    writeFileSync(userFile, "");
    chmodSync(userFile, mode);
    expect(() => assertPrivateEnvFile(userFile)).toThrow(ConfigError);
    expect(() => assertPrivateEnvFile(userFile)).toThrow(
      expect.objectContaining({ hint: `Run: chmod 600 '${userFile}'` }),
    );
  });
});
