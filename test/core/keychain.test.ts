import { describe, expect, it, vi } from "vitest";
import type { Exec } from "../../src/core/approval.ts";
import {
  osSecretStore,
  parseMacPassword,
  type SecretStore,
  withStoredSecrets,
} from "../../src/core/keychain.ts";

function fakeExec(code: number, stdout: string, stderr = ""): ReturnType<typeof vi.fn<Exec>> {
  return vi.fn<Exec>(async () => ({ code, stdout, stderr }));
}

describe("macOS keychain output", () => {
  it("reads a plain password", () => {
    expect(parseMacPassword('password: "abc#123"\n')).toBe("abc#123");
  });

  it("decodes the hex form, used for Hebrew or a quote, and keeps hex-looking passwords as typed", () => {
    expect(parseMacPassword('password: 0xD7A1D799D7A1D79ED79431  "\\327..."\n')).toBe("סיסמה1");
    expect(parseMacPassword('password: 0x6122625C6320642331  "a"b\\134c d#1"\n')).toBe(
      'a"b\\c d#1',
    );
    expect(parseMacPassword('password: "deadbeef"\n')).toBe("deadbeef");
  });

  it("finds nothing without a password line", () => {
    expect(parseMacPassword("security: The specified item could not be found.\n")).toBeUndefined();
  });
});

describe("OS secret store", () => {
  it("asks security for the item named after the variable, without a shell", async () => {
    const exec = fakeExec(0, "keychain: ...\n", 'password: "s3cret"\n');
    expect(await osSecretStore("darwin", exec)("MASHOV_PASSWORD")).toBe("s3cret");
    expect(exec).toHaveBeenCalledWith("security", [
      "find-generic-password",
      "-s",
      "israel-school",
      "-a",
      "MASHOV_PASSWORD",
      "-g",
    ]);
  });

  it("asks secret-tool on Linux", async () => {
    const exec = fakeExec(0, "s3cret");
    expect(await osSecretStore("linux", exec)("MASHOV_PASSWORD")).toBe("s3cret");
    expect(exec).toHaveBeenCalledWith("secret-tool", [
      "lookup",
      "service",
      "israel-school",
      "account",
      "MASHOV_PASSWORD",
    ]);
  });

  it("treats a missing item, a missing program or another OS as not stored", async () => {
    expect(await osSecretStore("darwin", fakeExec(44, ""))("X")).toBeUndefined();
    expect(await osSecretStore("linux", fakeExec(1, ""))("X")).toBeUndefined();
    const missing: Exec = () => Promise.reject(new Error("ENOENT"));
    expect(await osSecretStore("darwin", missing)("X")).toBeUndefined();
    const exec = fakeExec(0, "s3cret");
    expect(await osSecretStore("win32", exec)("X")).toBeUndefined();
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("stored secrets", () => {
  it("looks up only the named secrets the environment leaves empty", async () => {
    const store = vi.fn<SecretStore>(async (name) => `stored-${name}`);
    const env = await withStoredSecrets({ A: "from-env", B: " ", OTHER: "x" }, ["A", "B"], store);
    expect(env).toEqual({ A: "from-env", B: "stored-B", OTHER: "x" });
    expect(store.mock.calls).toEqual([["B"]]);
  });

  it("leaves a secret unset when nothing is stored", async () => {
    expect(await withStoredSecrets({}, ["A"], async () => undefined)).toEqual({});
  });
});
