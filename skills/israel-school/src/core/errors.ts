export type ErrorType = "usage" | "config" | "auth" | "upstream" | "access_denied" | "internal";

export const EXIT_CODES: Readonly<Record<ErrorType, number>> = {
  internal: 1,
  usage: 2,
  config: 2,
  auth: 3,
  upstream: 4,
  access_denied: 5,
};

/**
 * Base for every error the CLI reports. Messages must never contain credentials,
 * tokens, response bodies or student data: they are printed verbatim to stdout.
 */
export class SchoolError extends Error {
  readonly type: ErrorType;
  readonly hint: string | undefined;

  constructor(type: ErrorType, message: string, hint?: string) {
    super(message);
    this.name = new.target.name;
    this.type = type;
    this.hint = hint;
  }
}

export class UsageError extends SchoolError {
  constructor(message: string, hint?: string) {
    super("usage", message, hint);
  }
}

export class ConfigError extends SchoolError {
  constructor(message: string, hint?: string) {
    super("config", message, hint);
  }
}

export class AuthError extends SchoolError {
  constructor(message: string, hint?: string) {
    super("auth", message, hint);
  }
}

export class UpstreamError extends SchoolError {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super("upstream", message);
    this.status = status;
  }
}

const FULL_ACCESS_HINT =
  "This call needs SCHOOL_ACCESS=full or unattended, which only the user can set in the environment.";

export class AccessDenied extends SchoolError {
  constructor(message: string, hint: string = FULL_ACCESS_HINT) {
    super("access_denied", message, hint);
  }
}
