import { randomInt } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Env, stateDir } from "./config.ts";
import { AccessDenied, ConfigError, UsageError } from "./errors.ts";

export const DEFAULT_GRANT_MINUTES = 15;
export const MAX_GRANT_MINUTES = 120;

/** Reads one line typed by a person at a terminal; undefined when there is no terminal. */
export type Prompt = ((question: string) => Promise<string>) | undefined;

const NO_TERMINAL_HINT =
  "Only the user can grant this, by running `scripts/school grant` in their own terminal.";

export function grantPath(env: Env): string {
  return join(stateDir(env), "grant.json");
}

/**
 * Returns the grant's expiry while it is in force. A grant that is unreadable, owned by
 * someone else, writable by others, or longer than the maximum counts as no grant.
 */
export function activeGrant(path: string, now: Date): Date | undefined {
  try {
    const stat = statSync(path);
    if (stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0) return undefined;
    const { expiresAt } = JSON.parse(readFileSync(path, "utf8")) as { expiresAt?: unknown };
    const expiry = new Date(String(expiresAt));
    const remaining = expiry.getTime() - now.getTime();
    return remaining > 0 && remaining <= MAX_GRANT_MINUTES * 60_000 ? expiry : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Lets writes go out without a dialog for `minutes`, once the person at the terminal
 * types back a random code. Agents run commands without a terminal, so they cannot.
 */
export async function grant(
  path: string,
  minutes: number,
  prompt: Prompt,
  now: Date,
): Promise<{ grantedUntil: string }> {
  if (minutes < 1 || minutes > MAX_GRANT_MINUTES) {
    throw new UsageError(`--minutes must be between 1 and ${MAX_GRANT_MINUTES}.`);
  }
  if (prompt === undefined) {
    throw new AccessDenied("A grant needs a person at a terminal.", NO_TERMINAL_HINT);
  }
  const code = String(randomInt(1000, 10_000));
  const answer = await prompt(
    `Let the agent change school data without asking, for ${minutes} minutes?\nType ${code} to confirm: `,
  );
  if (answer.trim() !== code) throw new AccessDenied("The grant was not confirmed.");

  const expiresAt = new Date(now.getTime() + minutes * 60_000);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // `mode` applies only on creation, so drop any older file first.
  rmSync(path, { force: true });
  writeFileSync(path, JSON.stringify({ expiresAt: expiresAt.toISOString() }), { mode: 0o600 });
  return { grantedUntil: expiresAt.toISOString() };
}

export function revoke(path: string): { revoked: boolean } {
  try {
    rmSync(path);
    return { revoked: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { revoked: false };
    throw new ConfigError("Could not remove the grant file.");
  }
}
