import { route } from "../core/access.ts";
import { AuthError, UpstreamError } from "../core/errors.ts";
import { HttpClient, type Transport } from "../core/http.ts";
import type { BioLogin, WebtopConfig } from "./config.ts";

export const WEBTOP_BASE_URL = "https://webtopserver.smartschool.co.il";
const WEB_ORIGIN = "https://webtop.smartschool.co.il";
const API_PREFIX = "/server/api";

export const WEBTOP_READ_ENDPOINTS = [
  "dashboard/CheckToken",
  "dashboard/InitDashboard",
  "dashboard/GetHomeWork",
  "dashboard/GetGrades",
  "dashboard/GetPupilDiciplineEvents",
  "PupilCard/GetPupilLessonsAndHomework",
  "messageBox/GetMessagesInbox",
  "Menu/GetPreviewUnreadNotifications",
  "user/loginByBio",
] as const;
export type ReadEndpoint = (typeof WEBTOP_READ_ENDPOINTS)[number];

export const WEBTOP_READ_ROUTES = WEBTOP_READ_ENDPOINTS.map((endpoint) =>
  route("POST", `${API_PREFIX}/${endpoint}`),
);

const TOKEN_HINT =
  "The Webtop session expired. Copy a fresh webToken cookie from webtop.smartschool.co.il into SMARTSCHOOL_WEB_TOKEN.";
const BIO_HINT =
  "Webtop refused the saved login. Capture SMARTSCHOOL_BIO_LOGIN again from a signed-in browser.";

/**
 * Webtop API client. Auth is the `webToken` cookie; password login is behind a
 * reCAPTCHA, so sessions come from a pasted token or, when the user opted in, from
 * the browser's saved "remember me" login (`user/loginByBio`).
 */
export class WebtopClient {
  readonly #http: HttpClient;
  readonly #bio: BioLogin | undefined;
  #renewal: Promise<void> | undefined;

  constructor({ access, approve, fetch }: Transport, config: WebtopConfig) {
    this.#http = new HttpClient({
      baseUrl: WEBTOP_BASE_URL,
      access,
      approve,
      readRoutes: WEBTOP_READ_ROUTES,
      headers: { origin: WEB_ORIGIN, referer: `${WEB_ORIGIN}/`, language: "he" },
      fetch,
    });
    this.#bio = config.bio;
    if (config.webToken !== undefined) this.#http.setCookie("webToken", config.webToken);
  }

  /** True once this run minted its own session through the saved login. */
  get renewed(): boolean {
    return this.#renewal !== undefined;
  }

  /** Calls an endpoint and returns the `data` of its `{status, data}` envelope. */
  async call(
    endpoint: ReadEndpoint,
    payload: Readonly<Record<string, unknown>> = {},
  ): Promise<unknown> {
    if (this.#http.cookie("webToken") === undefined) await this.#renew();
    try {
      return await this.#post(endpoint, payload);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      if (this.#bio === undefined) throw new AuthError(error.message, TOKEN_HINT);
      if (this.renewed) throw new AuthError(error.message, BIO_HINT);
      await this.#renew();
      return this.#post(endpoint, payload);
    }
  }

  async #post(
    endpoint: ReadEndpoint,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const path = `${API_PREFIX}/${endpoint}`;
    const { body } = await this.#http.request("POST", path, { json: payload });
    if (!isOkEnvelope(body)) throw new UpstreamError(`POST ${path} returned an error.`);
    return body.data;
  }

  /** Shared so parallel calls that all hit an expired token renew it only once. */
  #renew(): Promise<void> {
    this.#renewal ??= this.#loginByBio();
    return this.#renewal;
  }

  async #loginByBio(): Promise<void> {
    const bio = this.#bio;
    if (bio === undefined) throw new AuthError("No Webtop session.", TOKEN_HINT);
    const { body } = await this.#http
      .request("POST", `${API_PREFIX}/user/loginByBio`, {
        json: {
          id: bio.bioLogin,
          param1: "2",
          param2: bio.deviceId,
          param3: bio.selectedUser,
          param4: bio.uniqueId,
          param5: "true",
        },
      })
      .catch((error: unknown) => {
        throw error instanceof AuthError ? new AuthError(error.message, BIO_HINT) : error;
      });
    const data = isOkEnvelope(body) ? body.data : undefined;
    const token =
      typeof data === "object" && data !== null && "token" in data ? data.token : undefined;
    if (typeof token !== "string" || token === "") {
      throw new AuthError("Webtop declined the saved login.", BIO_HINT);
    }
    this.#http.setCookie("webToken", token);
  }
}

function isOkEnvelope(body: unknown): body is { status: true; data: unknown } {
  return typeof body === "object" && body !== null && "status" in body && body.status === true;
}
