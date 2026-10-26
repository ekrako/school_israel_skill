import type { AccessLevel } from "./access.ts";
import type { Approver } from "./approval.ts";
import type { Env } from "./config.ts";
import { UsageError } from "./errors.ts";

export type CliOptions = Readonly<Record<string, string | boolean | undefined>>;
export type OptionSpecs = Readonly<Record<string, { readonly type: "string" | "boolean" }>>;

export interface CommandContext {
  readonly access: AccessLevel;
  readonly approve: Approver;
  readonly env: Env;
  readonly fetch: typeof fetch;
  readonly options: CliOptions;
  readonly args: readonly string[];
}

export interface Command {
  readonly summary: string;
  /**
   * Write commands are refused up front at `read` access, before any login. At `full`
   * access each of their non-read calls still waits for the user's approval.
   */
  readonly write: boolean;
  run(context: CommandContext): Promise<unknown>;
}

export type AppCommands = Readonly<Record<string, Command>>;

export interface App {
  readonly commands: AppCommands;
  readonly options?: OptionSpecs;
}

export type Apps = Readonly<Record<string, App>>;

export function stringOption(options: CliOptions, name: string): string | undefined {
  const value = options[name];
  return typeof value === "string" ? value : undefined;
}

export function intOption(options: CliOptions, name: string, fallback: number): number {
  const value = parseInteger(options, name) ?? fallback;
  if (value < 0) throw new UsageError(`--${name} must not be negative.`);
  return value;
}

export function signedIntOption(options: CliOptions, name: string, fallback: number): number {
  return parseInteger(options, name) ?? fallback;
}

function parseInteger(options: CliOptions, name: string): number | undefined {
  const raw = stringOption(options, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isInteger(value)) {
    throw new UsageError(`--${name} must be an integer.`);
  }
  return value;
}
