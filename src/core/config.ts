import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ConfigError } from "./errors.ts";

export type Env = Readonly<Record<string, string | undefined>>;

const SKILL_ROOT = join(import.meta.dirname, "..", "..");

/**
 * Picks the env file to load: `SCHOOL_ENV_FILE` when set, else the first that exists of
 * `$XDG_CONFIG_HOME/israel-school/.env` (default `~/.config`) and `.env` at the skill root.
 * The config dir comes first because skill installers replace the skill folder on update.
 */
export function resolveEnvFile(env: Env, skillRoot: string = SKILL_ROOT): string | undefined {
  const explicit = env.SCHOOL_ENV_FILE;
  if (explicit !== undefined && explicit !== "") {
    if (!existsSync(explicit)) throw new ConfigError("SCHOOL_ENV_FILE points to a missing file.");
    return explicit;
  }
  const configHome = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return [join(configHome, "israel-school", ".env"), join(skillRoot, ".env")].find((path) =>
    existsSync(path),
  );
}

/** Loads the env file into `process.env`. Variables already set in the environment win. */
export function loadDotEnv(env: Env = process.env): void {
  const path = resolveEnvFile(env);
  if (path !== undefined) process.loadEnvFile(path);
}

export function optionalEnv(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

export function requireEnv(env: Env, name: string): string {
  const value = optionalEnv(env, name);
  if (value === undefined) {
    throw new ConfigError(`${name} is not set.`, `Add ${name} to the skill's .env file.`);
  }
  return value;
}
