import { type Env, optionalEnv, requireEnv } from "../core/config.ts";
import { ConfigError } from "../core/errors.ts";

export interface MashovConfig {
  readonly username: string;
  readonly password: string;
  readonly semel: string;
  readonly year: string;
  readonly studentId: string | undefined;
}

/**
 * Mashov names a school year by the calendar year it ends in, so from September
 * onward the current year is next year's number.
 */
export function currentSchoolYear(now: Date): string {
  const september = 8;
  return String(now.getMonth() >= september ? now.getFullYear() + 1 : now.getFullYear());
}

export function readMashovConfig(env: Env, now: Date = new Date()): MashovConfig {
  const semel = requireEnv(env, "MASHOV_SEMEL");
  if (!/^\d+$/.test(semel)) throw new ConfigError("MASHOV_SEMEL must be a number.");
  const year = optionalEnv(env, "MASHOV_YEAR") ?? currentSchoolYear(now);
  if (!/^\d{4}$/.test(year)) throw new ConfigError("MASHOV_YEAR must be a four-digit year.");
  return {
    username: requireEnv(env, "MASHOV_USERNAME"),
    password: requireEnv(env, "MASHOV_PASSWORD"),
    semel,
    year,
    studentId: optionalEnv(env, "MASHOV_STUDENT_ID"),
  };
}
