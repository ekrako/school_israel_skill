import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { type CliDeps, main } from "../../src/core/cli.ts";
import type { Apps, Command, CommandContext } from "../../src/core/commands.ts";
import { ConfigError } from "../../src/core/errors.ts";

function fakeApps(run: Command["run"] = async () => ({ value: 1 })): Apps {
  return {
    demo: {
      commands: {
        read: { summary: "reads", write: false, run },
        send: { summary: "writes", write: true, run },
      },
      options: { take: { type: "string" } },
    },
  };
}

async function runCli(
  argv: string[],
  env: Record<string, string> = {},
  apps = fakeApps(),
  deps: Partial<CliDeps> = {},
) {
  let output = "";
  const code = await main(apps, argv, {
    env,
    fetch: () => Promise.reject(new Error("no network in tests")),
    write: (text) => {
      output += text;
    },
    ...deps,
  });
  return { code, json: JSON.parse(output) };
}

describe("school CLI", () => {
  it("lists apps and commands with their write flag", async () => {
    const { code, json } = await runCli(["help"]);
    expect(code).toBe(0);
    expect(json.data).toEqual({
      demo: { read: { summary: "reads", write: false }, send: { summary: "writes", write: true } },
    });
  });

  it("wraps command results in a success envelope", async () => {
    const { code, json } = await runCli(["demo", "read"]);
    expect(code).toBe(0);
    expect(json).toEqual({
      ok: true,
      app: "demo",
      command: "read",
      access: "read",
      write: false,
      data: { value: 1 },
    });
  });

  it("refuses write commands at read access without running them", async () => {
    const run = vi.fn(async () => ({}));
    const { code, json } = await runCli(["demo", "send"], {}, fakeApps(run));
    expect(code).toBe(5);
    expect(json.error.type).toBe("access_denied");
    expect(run).not.toHaveBeenCalled();
  });

  it("runs write commands at full access", async () => {
    const { code, json } = await runCli(["demo", "send"], { SCHOOL_ACCESS: "full" });
    expect(code).toBe(0);
    expect(json).toMatchObject({ access: "full", write: true });
  });

  it.each(["full", "unattended"])("lets --read-only override %s access", async (level) => {
    const { code } = await runCli(["demo", "send", "--read-only"], { SCHOOL_ACCESS: level });
    expect(code).toBe(5);
  });

  it("runs write commands at unattended access and reports the level", async () => {
    const { code, json } = await runCli(["demo", "send"], { SCHOOL_ACCESS: "unattended" });
    expect(code).toBe(0);
    expect(json).toMatchObject({ access: "unattended", write: true });
  });

  it("reports unknown apps, commands and options as usage errors", async () => {
    expect((await runCli(["nope", "read"])).code).toBe(2);
    expect((await runCli(["demo", "nope"])).code).toBe(2);
    const { code, json } = await runCli(["demo", "read", "--bogus"]);
    expect(code).toBe(2);
    expect(json.error.type).toBe("usage");
  });

  it("maps school errors to their exit codes", async () => {
    const apps = fakeApps(vi.fn(async () => Promise.reject(new ConfigError("X is not set."))));
    const { code, json } = await runCli(["demo", "read"], {}, apps);
    expect(code).toBe(2);
    expect(json.error).toEqual({ type: "config", message: "X is not set." });
  });

  it("hands the approver to commands, denying by default", async () => {
    const run = vi.fn(async ({ approve }: CommandContext) =>
      approve({
        method: "POST",
        url: new URL("https://school.test/x"),
      }),
    );
    expect(
      (await runCli(["demo", "send"], { SCHOOL_ACCESS: "full" }, fakeApps(run))).json.data,
    ).toBe("unavailable");
    const approve = async () => "approved" as const;
    const { json } = await runCli(["demo", "send"], { SCHOOL_ACCESS: "full" }, fakeApps(run), {
      approve,
    });
    expect(json.data).toBe("approved");
  });

  it("gives commands the app's secrets from the store, and nothing else", async () => {
    const apps: Apps = {
      demo: {
        secrets: ["DEMO_TOKEN"],
        commands: {
          read: { summary: "reads", write: false, run: async ({ env }) => env },
        },
      },
    };
    const secrets = vi.fn(async (name: string) => `stored-${name}`);
    const { json } = await runCli(["demo", "read"], { OTHER: "x" }, apps, { secrets });
    expect(json.data).toEqual({ OTHER: "x", DEMO_TOKEN: "stored-DEMO_TOKEN" });
    expect(secrets.mock.calls).toEqual([["DEMO_TOKEN"]]);
  });
});

describe("school update", () => {
  const notice = { current: "0.1.0", latest: "0.2.0", command: "scripts/school update" };
  const checkUpdate = async () => notice;

  it("adds the update notice to results and to errors", async () => {
    expect((await runCli(["demo", "read"], {}, fakeApps(), { checkUpdate })).json.update).toEqual(
      notice,
    );
    const failing = fakeApps(async () => Promise.reject(new ConfigError("X is not set.")));
    const { json } = await runCli(["demo", "read"], {}, failing, { checkUpdate });
    expect(json).toMatchObject({ ok: false, update: notice });
  });

  it("leaves the notice out when the check fails or finds nothing", async () => {
    const broken = async () => Promise.reject(new Error("offline"));
    expect(
      (await runCli(["demo", "read"], {}, fakeApps(), { checkUpdate: broken })).json,
    ).not.toHaveProperty("update");
    expect((await runCli(["demo", "read"])).json).not.toHaveProperty("update");
  });

  it("runs the update without repeating the notice", async () => {
    const update = vi.fn(async () => ({ from: "0.1.0", to: "0.2.0" }));
    const { code, json } = await runCli(["update"], {}, fakeApps(), { checkUpdate, update });
    expect(code).toBe(0);
    expect(json.data).toEqual({ from: "0.1.0", to: "0.2.0" });
    expect(json).not.toHaveProperty("update");
  });

  it("refuses when updating is not available", async () => {
    const { code, json } = await runCli(["update"]);
    expect(code).toBe(2);
    expect(json.error.type).toBe("usage");
  });
});

describe("school grant and revoke", () => {
  function stateEnv(extra: Record<string, string> = {}) {
    return { XDG_STATE_HOME: mkdtempSync(join(tmpdir(), "school-cli-")), ...extra };
  }

  it("refuses to grant when the agent runs it without a terminal", async () => {
    const env = stateEnv({ SCHOOL_ACCESS: "full" });
    const { code, json } = await runCli(["grant"], env);
    expect(code).toBe(5);
    expect(json.error.type).toBe("access_denied");
    rmSync(env.XDG_STATE_HOME, { recursive: true });
  });

  it.each(["read", "unattended"])("refuses to grant at %s access", async (level) => {
    const env = stateEnv({ SCHOOL_ACCESS: level });
    const prompt = vi.fn(async () => "");
    const { code } = await runCli(["grant"], env, fakeApps(), { prompt });
    expect(code).toBe(2);
    expect(prompt).not.toHaveBeenCalled();
    rmSync(env.XDG_STATE_HOME, { recursive: true });
  });

  it("grants for the requested minutes when the user types the code, then revokes", async () => {
    const env = stateEnv({ SCHOOL_ACCESS: "full" });
    const now = () => new Date("2026-10-26T10:00:00Z");
    const prompt = async (question: string) => /Type (\d{4})/.exec(question)?.[1] ?? "";
    const granted = await runCli(["grant", "--minutes", "5"], env, fakeApps(), { prompt, now });
    expect(granted.json.data).toEqual({ grantedUntil: "2026-10-26T10:05:00.000Z" });
    expect((await runCli(["revoke"], env)).json.data).toEqual({ revoked: true });
    rmSync(env.XDG_STATE_HOME, { recursive: true });
  });
});
