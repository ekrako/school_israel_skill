import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type ExecResult, runFile } from "./approval.ts";
import { type Env, stateDir } from "./config.ts";
import { UpstreamError, UsageError } from "./errors.ts";

export const SKILL_NAME = "israel-school";
const LATEST_URL =
  "https://raw.githubusercontent.com/ekrako/school_israel_skill/main/skills/israel-school/package.json";
const CHECK_INTERVAL_MS = 24 * 60 * 60_000;
const CHECK_TIMEOUT_MS = 3_000;
const UPDATE_TIMEOUT_MS = 5 * 60_000;
/** Pinned so an update runs the installer release this skill was tested with. */
const SKILLS_CLI = "skills@1.7.4";
/** Prefixes of the skill's own variables, kept out of the installer's environment. */
const PRIVATE_ENV_PREFIXES = ["MASHOV_", "SMARTSCHOOL_", "SCHOOL_"];

export interface UpdateNotice {
  readonly current: string;
  readonly latest: string;
  readonly command: string;
}

export function readVersion(skillRoot: string): string {
  const { version } = JSON.parse(readFileSync(join(skillRoot, "package.json"), "utf8")) as {
    version?: unknown;
  };
  return String(version);
}

/** True when `latest` is a higher `major.minor.patch` than `current`. */
export function isNewer(latest: string, current: string): boolean {
  const [a, b] = [parseVersion(latest), parseVersion(current)];
  if (a === undefined || b === undefined) return false;
  const differing = a.findIndex((part, index) => part !== b[index]);
  return differing !== -1 && (a[differing] ?? 0) > (b[differing] ?? 0);
}

function parseVersion(version: string): number[] | undefined {
  return /^\d+\.\d+\.\d+$/.test(version) ? version.split(".").map(Number) : undefined;
}

export function updateCheckPath(env: Env): string {
  return join(stateDir(env), "update-check.json");
}

export interface UpdateCheck {
  readonly env: Env;
  readonly fetch: typeof fetch;
  readonly now: Date;
  readonly current: string;
  readonly cachePath: string;
}

/**
 * Compares this copy's version with the one on GitHub, at most once a day. The check is
 * best effort: any failure reads as "no update", so it can never fail a command.
 * `SCHOOL_UPDATE_CHECK=off` turns it off.
 */
export async function checkForUpdate(check: UpdateCheck): Promise<UpdateNotice | undefined> {
  if (check.env.SCHOOL_UPDATE_CHECK === "off") return undefined;
  const latest = await cachedLatest(check);
  return latest !== undefined && isNewer(latest, check.current)
    ? { current: check.current, latest, command: "scripts/school update" }
    : undefined;
}

async function cachedLatest({ fetch, now, cachePath }: UpdateCheck): Promise<string | undefined> {
  const cache = readCache(cachePath);
  if (cache !== undefined && now.getTime() - cache.checkedAt < CHECK_INTERVAL_MS) {
    return cache.latest;
  }
  const latest = await fetchLatest(fetch).catch(() => undefined);
  try {
    mkdirSync(dirname(cachePath), { recursive: true, mode: 0o700 });
    writeFileSync(cachePath, JSON.stringify({ checkedAt: now.getTime(), latest }));
  } catch {
    // Without a cache the next run checks again; that is slower, not wrong.
  }
  return latest;
}

function readCache(path: string): { checkedAt: number; latest?: string } | undefined {
  try {
    const cache = JSON.parse(readFileSync(path, "utf8")) as {
      checkedAt?: unknown;
      latest?: unknown;
    };
    if (typeof cache.checkedAt !== "number") return undefined;
    return typeof cache.latest === "string"
      ? { checkedAt: cache.checkedAt, latest: cache.latest }
      : { checkedAt: cache.checkedAt };
  } catch {
    return undefined;
  }
}

async function fetchLatest(fetch: typeof globalThis.fetch): Promise<string | undefined> {
  const response = await fetch(LATEST_URL, {
    redirect: "error",
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!response.ok) return undefined;
  const { version } = (await response.json()) as { version?: unknown };
  return typeof version === "string" && parseVersion(version) !== undefined ? version : undefined;
}

/** Runs `npx` with `args` in `cwd` (the current directory when undefined). */
export type NpxRunner = (args: readonly string[], cwd: string | undefined) => Promise<ExecResult>;

export type InstallScope =
  | { readonly kind: "global" }
  | { readonly kind: "project"; readonly dir: string };

/**
 * A project install is listed in `skills-lock.json` at the project root, an ancestor of
 * the skill folder; anything else was installed globally.
 */
export function installScope(skillRoot: string): InstallScope {
  const dir = ancestors(dirname(skillRoot)).find((candidate) =>
    lockListsSkill(join(candidate, "skills-lock.json")),
  );
  return dir === undefined ? { kind: "global" } : { kind: "project", dir };
}

function ancestors(dir: string): string[] {
  const parent = dirname(dir);
  return parent === dir ? [dir] : [dir, ...ancestors(parent)];
}

function lockListsSkill(path: string): boolean {
  try {
    const { skills } = JSON.parse(readFileSync(path, "utf8")) as { skills?: unknown };
    return typeof skills === "object" && skills !== null && Object.hasOwn(skills, SKILL_NAME);
  } catch {
    return false;
  }
}

/** Updates the installed skill with the `skills` CLI, which replaces the skill folder. */
export async function updateSkill(
  skillRoot: string,
  npx: NpxRunner,
): Promise<{ from: string; to: string; scope: InstallScope["kind"] }> {
  if (existsSync(join(skillRoot, ".git"))) {
    throw new UsageError("This copy of the skill is a git checkout.", "Update it with `git pull`.");
  }
  if (existsSync(join(skillRoot, ".env"))) {
    throw new UsageError(
      "Updating replaces the skill folder, which holds the .env file.",
      "Move the .env file to ~/.config/israel-school/.env first.",
    );
  }
  const from = readVersion(skillRoot);
  const scope = installScope(skillRoot);
  const scopeFlag = scope.kind === "global" ? "-g" : "-p";
  const result = await npx(
    ["--yes", SKILLS_CLI, "update", SKILL_NAME, scopeFlag, "-y"],
    scope.kind === "project" ? scope.dir : undefined,
  ).catch(() => undefined);
  if (result?.code !== 0) {
    throw new UpstreamError(
      `The update failed. Run \`npx ${SKILLS_CLI} update ${SKILL_NAME} ${scopeFlag}\` to see why.`,
    );
  }
  return { from, to: readVersion(skillRoot), scope: scope.kind };
}

/** The installer is third-party code: it gets no school credentials, and no telemetry. */
export function installerEnv(env: Env): Env {
  const kept = Object.entries(env).filter(
    ([name]) => !PRIVATE_ENV_PREFIXES.some((prefix) => name.startsWith(prefix)),
  );
  return { ...Object.fromEntries(kept), DO_NOT_TRACK: "1" };
}

export function npxRunner(env: Env): NpxRunner {
  return (args, cwd) =>
    runFile("npx", args, { cwd, env: installerEnv(env), timeout: UPDATE_TIMEOUT_MS });
}
