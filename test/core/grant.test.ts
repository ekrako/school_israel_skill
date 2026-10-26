import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccessDenied, UsageError } from "../../src/core/errors.ts";
import { activeGrant, grant, grantPath, revoke } from "../../src/core/grant.ts";

const NOW = new Date("2026-10-26T10:00:00Z");
const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

/** Answers the prompt with the code it shows, as a person reading it would. */
const typesCode = async (question: string) => /Type (\d{4})/.exec(question)?.[1] ?? "";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "school-grant-"));
  path = grantPath({ XDG_STATE_HOME: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("school grant", () => {
  it("stores the grant under XDG_STATE_HOME", () => {
    expect(path).toBe(join(dir, "israel-school", "grant.json"));
  });

  it("writes a private grant that is active until it expires", async () => {
    const result = await grant(path, 15, typesCode, NOW);
    expect(result.grantedUntil).toBe(minutesFromNow(15).toISOString());
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(activeGrant(path, minutesFromNow(14))).toEqual(minutesFromNow(15));
    expect(activeGrant(path, minutesFromNow(15))).toBeUndefined();
  });

  it("refuses without a terminal, before writing anything", async () => {
    await expect(grant(path, 15, undefined, NOW)).rejects.toThrow(AccessDenied);
    expect(existsSync(path)).toBe(false);
  });

  it("refuses when the typed code is wrong", async () => {
    await expect(grant(path, 15, async () => "0000", NOW)).rejects.toThrow(/not confirmed/);
    expect(existsSync(path)).toBe(false);
  });

  it.each([0, 121])("rejects %i minutes", async (minutes) => {
    await expect(grant(path, minutes, typesCode, NOW)).rejects.toThrow(UsageError);
  });

  it("ignores a hand-written grant longer than the maximum", async () => {
    await grant(path, 15, typesCode, NOW);
    writeFileSync(path, JSON.stringify({ expiresAt: minutesFromNow(600).toISOString() }));
    expect(activeGrant(path, NOW)).toBeUndefined();
  });

  it("ignores a grant other users can write to, or one that does not parse", async () => {
    await grant(path, 15, typesCode, NOW);
    chmodSync(path, 0o666);
    expect(activeGrant(path, NOW)).toBeUndefined();
    chmodSync(path, 0o600);
    writeFileSync(path, "not json");
    expect(activeGrant(path, NOW)).toBeUndefined();
  });

  it("revokes an active grant and reports when there was none", async () => {
    await grant(path, 15, typesCode, NOW);
    expect(revoke(path)).toEqual({ revoked: true });
    expect(activeGrant(path, NOW)).toBeUndefined();
    expect(revoke(path)).toEqual({ revoked: false });
  });
});
