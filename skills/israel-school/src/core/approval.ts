import { type ExecFileOptions, execFile } from "node:child_process";
import type { HttpMethod } from "./access.ts";
import type { Env } from "./config.ts";

export type Approval = "approved" | "denied" | "unavailable";

export interface WriteRequest {
  readonly method: HttpMethod;
  readonly url: URL;
  readonly body?: unknown;
}

/** Asks the user whether one non-read request may go out. */
export type Approver = (request: WriteRequest) => Promise<Approval>;

export const denyAll: Approver = async () => "unavailable";

export interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs a program without a shell. Rejects only when the program cannot start. */
export type Exec = (file: string, args: readonly string[]) => Promise<ExecResult>;

const DIALOG_TITLE = "School skill";
const DIALOG_TIMEOUT_SECONDS = 120;
const BODY_PREVIEW_CHARS = 600;

const MAC_SCRIPT = [
  "on run argv",
  `display dialog (item 1 of argv) with title "${DIALOG_TITLE}" buttons {"Deny", "Allow"} default button "Deny" cancel button "Deny" with icon caution giving up after ${DIALOG_TIMEOUT_SECONDS}`,
  "return button returned of result",
  "end run",
].flatMap((line) => ["-e", line]);

export function dialogText(request: WriteRequest): string {
  const target = `${request.method} ${request.url.host}${request.url.pathname}`;
  const body =
    request.body === undefined
      ? ""
      : `\n\nData sent:\n${truncate(JSON.stringify(request.body, null, 2), BODY_PREVIEW_CHARS)}`;
  return `An agent wants to change data in the school app.\n\n${target}${body}\n\nAllow this one request?`;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

/**
 * Shows a native Allow/Deny dialog: `osascript` on macOS, `zenity` on a Linux desktop.
 * The text travels as an argument, never inside the script, so it cannot inject code.
 * Dialogs are shown one at a time; a timeout counts as a denial.
 */
export function dialogApprover(platform: NodeJS.Platform, env: Env, exec: Exec): Approver {
  let queue: Promise<unknown> = Promise.resolve();
  const ask = async (request: WriteRequest): Promise<Approval> => {
    const text = dialogText(request);
    if (platform === "darwin") {
      const result = await exec("osascript", [...MAC_SCRIPT, "--", text]);
      return result.code === 0 && result.stdout.trim() === "Allow" ? "approved" : "denied";
    }
    if (platform === "linux" && (env.DISPLAY || env.WAYLAND_DISPLAY)) {
      const result = await exec("zenity", [
        "--question",
        "--no-markup",
        "--default-cancel",
        `--title=${DIALOG_TITLE}`,
        `--text=${text}`,
        "--ok-label=Allow",
        "--cancel-label=Deny",
        `--timeout=${DIALOG_TIMEOUT_SECONDS}`,
      ]);
      return result.code === 0 ? "approved" : "denied";
    }
    return "unavailable";
  };
  return (request) => {
    const answer = queue.then(() => ask(request).catch((): Approval => "unavailable"));
    queue = answer;
    return answer;
  };
}

/** Approves without asking while `hasGrant` holds; otherwise defers to `fallback`. */
export function withGrant(hasGrant: () => boolean, fallback: Approver): Approver {
  return (request) => (hasGrant() ? Promise.resolve("approved") : fallback(request));
}

export const execFileNoShell: Exec = (file, args) =>
  runFile(file, args, { timeout: (DIALOG_TIMEOUT_SECONDS + 10) * 1000 });

/** Runs a program without a shell. Rejects only when the program cannot start. */
export function runFile(
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      if (typeof error?.code === "string") reject(error);
      else
        resolve({
          code: error === null ? 0 : (error.code ?? -1),
          stdout: String(stdout),
          stderr: String(stderr),
        });
    });
  });
}
