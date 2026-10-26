import { ConfigError } from "./errors.ts";

/**
 * `read` blocks every change. `full` lets changes out once the user approves each one.
 * `unattended` lets changes out without asking, for runs with nobody at the computer.
 */
export type AccessLevel = "read" | "full" | "unattended";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const HTTP_METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export interface Route {
  readonly method: HttpMethod;
  readonly template: string;
  readonly pattern: RegExp;
}

/** Builds a route from a template such as `/api/students/:id/grades`; `:name` matches one segment. */
export function route(method: HttpMethod, template: string): Route {
  const source = template
    .split("/")
    .map((segment) =>
      segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return { method, template, pattern: new RegExp(`^${source}$`) };
}

export function parseAccessLevel(raw: string | undefined): AccessLevel {
  if (raw === undefined || raw === "" || raw === "read") return "read";
  if (raw === "full" || raw === "unattended") return raw;
  throw new ConfigError('SCHOOL_ACCESS must be "read", "full" or "unattended".');
}

/** The env sets the ceiling; a per-call flag can only lower it, never raise it. */
export function effectiveAccess(envLevel: AccessLevel, readOnlyFlag: boolean): AccessLevel {
  return readOnlyFlag ? "read" : envLevel;
}

/**
 * True when the call is on the read allowlist. `pathname` must already be normalised
 * (dot segments resolved), otherwise `/allowed/../other` could slip past.
 */
export function isReadRoute(
  readRoutes: readonly Route[],
  method: HttpMethod,
  pathname: string,
): boolean {
  return readRoutes.some((r) => r.method === method && r.pattern.test(pathname));
}
