import { type AccessLevel, type HttpMethod, isReadRoute, type Route } from "./access.ts";
import { type Approver, denyAll } from "./approval.ts";
import { AccessDenied, AuthError, UpstreamError, UsageError } from "./errors.ts";
import { redactPath } from "./redact.ts";

const DEFAULT_TIMEOUT_MS = 20_000;

const DENIED_HINT =
  "Ask the user before trying again. They can also run `scripts/school grant` in their own terminal to allow changes for a few minutes.";
const NO_DIALOG_HINT =
  "No approval dialog can be shown here. The user can run `scripts/school grant` in their own terminal to allow changes for a few minutes.";

export interface HttpClientOptions {
  readonly baseUrl: string;
  readonly access: AccessLevel;
  /** Consulted for every call off the read allowlist at `full` access; missing means deny. */
  readonly approve?: Approver;
  readonly readRoutes: readonly Route[];
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

/** What an app client needs from the command context to reach its server. */
export interface Transport {
  readonly access: AccessLevel;
  readonly approve: Approver;
  readonly fetch: typeof fetch;
}

export interface RequestOptions {
  readonly json?: unknown;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

/**
 * Same-origin HTTP client with a cookie jar and an access-level guard.
 *
 * Every request is checked before it leaves the process: read calls must be on the
 * allowlist, and any other call needs full access plus the user's approval. Requests
 * must stay on `baseUrl`'s origin so session cookies can never be sent elsewhere.
 */
export class HttpClient {
  readonly #base: URL;
  readonly #options: HttpClientOptions;
  readonly #cookies = new Map<string, string>();

  constructor(options: HttpClientOptions) {
    this.#base = new URL(options.baseUrl);
    this.#options = options;
  }

  get access(): AccessLevel {
    return this.#options.access;
  }

  cookie(name: string): string | undefined {
    return this.#cookies.get(name);
  }

  setCookie(name: string, value: string): void {
    this.#cookies.set(name, value);
  }

  async request(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<HttpResponse> {
    const url = this.#resolve(path, options.query);
    const label = `${method} ${redactPath(url.pathname)}`;
    await this.#authorize(method, url, options.json, label);

    const response = await this.#send(method, url, options, label);
    this.#storeCookies(response.headers);

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(`${label} was rejected (HTTP ${response.status}).`);
    }
    if (response.status >= 300) {
      throw new UpstreamError(`${label} failed (HTTP ${response.status}).`, response.status);
    }
    return { status: response.status, headers: response.headers, body: await parseBody(response) };
  }

  async #authorize(method: HttpMethod, url: URL, body: unknown, label: string): Promise<void> {
    const { access, readRoutes, approve = denyAll } = this.#options;
    if (isReadRoute(readRoutes, method, url.pathname)) return;
    if (access === "read") throw new AccessDenied(`${label} is not a read-only endpoint.`);
    if (access === "unattended") return;
    const approval = await approve({ method, url, body });
    if (approval === "approved") return;
    throw approval === "denied"
      ? new AccessDenied(`The user did not approve ${label}.`, DENIED_HINT)
      : new AccessDenied(`Could not ask the user to approve ${label}.`, NO_DIALOG_HINT);
  }

  #resolve(path: string, query: RequestOptions["query"]): URL {
    const url = new URL(path, this.#base);
    if (url.origin !== this.#base.origin) {
      throw new UsageError("Request path must stay on the app's own server.");
    }
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, String(value));
    }
    return url;
  }

  async #send(
    method: HttpMethod,
    url: URL,
    options: RequestOptions,
    label: string,
  ): Promise<Response> {
    const fetchFn = this.#options.fetch ?? fetch;
    const headers = new Headers({
      accept: "application/json, text/plain, */*",
      ...this.#options.headers,
      ...options.headers,
    });
    if (this.#cookies.size > 0) headers.set("cookie", this.#cookieHeader());
    if (options.json !== undefined) headers.set("content-type", "application/json; charset=utf-8");

    try {
      return await fetchFn(url, {
        method,
        headers,
        // Redirects are not followed so cookies never travel to another host.
        redirect: "manual",
        signal: AbortSignal.timeout(this.#options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "TimeoutError" ? "timed out" : "failed";
      throw new UpstreamError(`${label} ${reason}.`);
    }
  }

  #storeCookies(headers: Headers): void {
    for (const line of headers.getSetCookie()) {
      const pair = line.split(";", 1)[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "") this.#cookies.delete(name);
      else this.#cookies.set(name, value);
    }
  }

  #cookieHeader(): string {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
