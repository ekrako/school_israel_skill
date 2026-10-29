import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamError, UsageError } from "../../skills/israel-school/src/core/errors.ts";
import {
  checkForUpdate,
  installerEnv,
  isNewer,
  type NpxRunner,
  type UpdateCheck,
  updateSkill,
} from "../../skills/israel-school/src/core/update.ts";

const NOW = new Date("2026-10-26T10:00:00Z");
const hoursLater = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "school-update-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function githubVersion(version: unknown) {
  return vi.fn<typeof fetch>(async () => Response.json({ version }));
}

function check(fetch: typeof globalThis.fetch, overrides: Partial<UpdateCheck> = {}): UpdateCheck {
  return {
    env: { SCHOOL_UPDATE_CHECK: "on" },
    fetch,
    now: NOW,
    current: "0.1.0",
    cachePath: join(dir, "c.json"),
    ...overrides,
  };
}

describe("version comparison", () => {
  it.each([
    ["0.2.0", "0.1.0", true],
    ["1.0.0", "0.9.9", true],
    ["0.1.10", "0.1.9", true],
    ["0.1.0", "0.1.0", false],
    ["0.1.0", "0.2.0", false],
    ["latest", "0.1.0", false],
  ])("%s is newer than %s: %s", (latest, current, expected) => {
    expect(isNewer(latest, current)).toBe(expected);
  });
});

describe("update check", () => {
  it("reports a newer version on GitHub with the command that installs it", async () => {
    const fetch = githubVersion("0.2.0");
    expect(await checkForUpdate(check(fetch))).toEqual({
      current: "0.1.0",
      latest: "0.2.0",
      command: "scripts/school update",
    });
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      "https://raw.githubusercontent.com/ekrako/school_israel_skill/main/skills/israel-school/package.json",
    );
  });

  it("stays quiet when this copy is current", async () => {
    expect(await checkForUpdate(check(githubVersion("0.1.0")))).toBeUndefined();
  });

  it("asks GitHub at most once a day", async () => {
    const fetch = githubVersion("0.2.0");
    await checkForUpdate(check(fetch));
    expect(await checkForUpdate(check(fetch, { now: hoursLater(23) }))).toMatchObject({
      latest: "0.2.0",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await checkForUpdate(check(fetch, { now: hoursLater(25) }));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("treats a failed or malformed answer as no update, and waits a day to retry", async () => {
    const offline = vi.fn<typeof fetch>(async () => Promise.reject(new Error("offline")));
    expect(await checkForUpdate(check(offline))).toBeUndefined();
    expect(await checkForUpdate(check(offline, { now: hoursLater(1) }))).toBeUndefined();
    expect(offline).toHaveBeenCalledTimes(1);
    const malformed = githubVersion("2.0; rm -rf ~");
    expect(await checkForUpdate(check(malformed, { cachePath: join(dir, "m.json") }))).toBe(
      undefined,
    );
  });

  it.each([undefined, "", "off", "true"])(
    "does not check GitHub when SCHOOL_UPDATE_CHECK is %s",
    async (value) => {
      const fetch = githubVersion("0.2.0");
      const env = value === undefined ? {} : { SCHOOL_UPDATE_CHECK: value };
      expect(await checkForUpdate(check(fetch, { env }))).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe("school update", () => {
  function installedSkill(root: string, version = "0.1.0"): string {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ version }));
    return root;
  }

  /** Stands in for the skills CLI: rewrites package.json as an update would. */
  function npxInstalling(root: string, version: string, code = 0) {
    return vi.fn<NpxRunner>(async () => {
      writeFileSync(join(root, "package.json"), JSON.stringify({ version }));
      return { code, stdout: "", stderr: "" };
    });
  }

  it("updates a global install with the pinned skills CLI", async () => {
    const root = installedSkill(join(dir, "home", ".claude", "skills", "israel-school"));
    const npx = npxInstalling(root, "0.2.0");
    expect(await updateSkill(root, npx)).toEqual({ from: "0.1.0", to: "0.2.0", scope: "global" });
    expect(npx).toHaveBeenCalledWith(
      ["--yes", "skills@1.7.4", "update", "israel-school", "-g", "-y"],
      undefined,
    );
  });

  it("updates a project install from the project root listed in skills-lock.json", async () => {
    const project = join(dir, "project");
    const root = installedSkill(join(project, ".agents", "skills", "israel-school"));
    writeFileSync(
      join(project, "skills-lock.json"),
      JSON.stringify({ skills: { "israel-school": {} } }),
    );
    const npx = npxInstalling(root, "0.2.0");
    expect(await updateSkill(root, npx)).toMatchObject({ scope: "project" });
    expect(npx.mock.calls[0]?.[0]).toContain("-p");
    expect(npx.mock.calls[0]?.[1]).toBe(project);
  });

  it("treats a lock file that does not list the skill as unrelated", async () => {
    writeFileSync(join(dir, "skills-lock.json"), JSON.stringify({ skills: { other: {} } }));
    const root = installedSkill(join(dir, "x", "skills", "israel-school"));
    expect(await updateSkill(root, npxInstalling(root, "0.2.0"))).toMatchObject({
      scope: "global",
    });
  });

  it("refuses a git checkout, and a folder that holds the .env file", async () => {
    const checkout = installedSkill(join(dir, "checkout"));
    mkdirSync(join(checkout, ".git"));
    const npx = npxInstalling(checkout, "0.2.0");
    await expect(updateSkill(checkout, npx)).rejects.toThrow(/git checkout/);
    const withEnv = installedSkill(join(dir, "with-env"));
    writeFileSync(join(withEnv, ".env"), "");
    await expect(updateSkill(withEnv, npx)).rejects.toThrow(UsageError);
    expect(npx).not.toHaveBeenCalled();
  });

  it("reports a failed update, or a missing npx", async () => {
    const root = installedSkill(join(dir, "skill"));
    await expect(updateSkill(root, npxInstalling(root, "0.1.0", 1))).rejects.toThrow(UpstreamError);
    const missing: NpxRunner = () => Promise.reject(new Error("ENOENT"));
    await expect(updateSkill(root, missing)).rejects.toThrow(UpstreamError);
  });

  it("keeps school credentials out of the installer and turns off its telemetry", () => {
    const env = installerEnv({
      PATH: "/bin",
      HOME: "/home/u",
      MASHOV_PASSWORD: "secret",
      SMARTSCHOOL_WEB_TOKEN: "token",
      SCHOOL_ACCESS: "full",
    });
    expect(env).toEqual({ PATH: "/bin", HOME: "/home/u", DO_NOT_TRACK: "1" });
  });
});
