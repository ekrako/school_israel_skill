import type { AccessLevel } from "./access.ts";
import { type ErrorType, EXIT_CODES, SchoolError } from "./errors.ts";

export interface SuccessEnvelope {
  readonly ok: true;
  readonly app: string;
  readonly command: string;
  readonly access: AccessLevel;
  readonly write: boolean;
  readonly data: unknown;
}

export interface ErrorEnvelope {
  readonly ok: false;
  readonly error: { readonly type: ErrorType; readonly message: string; readonly hint?: string };
}

export interface ErrorResult {
  readonly envelope: ErrorEnvelope;
  readonly exitCode: number;
}

/** Unknown errors are reported generically: their messages may carry secrets or school data. */
export function toErrorResult(error: unknown): ErrorResult {
  if (!(error instanceof SchoolError)) {
    return {
      envelope: { ok: false, error: { type: "internal", message: "Unexpected internal error." } },
      exitCode: EXIT_CODES.internal,
    };
  }
  const envelope: ErrorEnvelope = {
    ok: false,
    error: {
      type: error.type,
      message: error.message,
      ...(error.hint === undefined ? {} : { hint: error.hint }),
    },
  };
  return { envelope, exitCode: EXIT_CODES[error.type] };
}

export function serialize(envelope: SuccessEnvelope | ErrorEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}
