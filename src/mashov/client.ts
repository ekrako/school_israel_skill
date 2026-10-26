import { route } from "../core/access.ts";
import { AuthError, ConfigError } from "../core/errors.ts";
import { HttpClient, type Transport } from "../core/http.ts";
import type { MashovConfig } from "./config.ts";
import { type MashovStudent, studentsFromLogin } from "./students.ts";

export const MASHOV_BASE_URL = "https://web.mashov.info";

export const STUDENT_SECTIONS = ["grades", "timetable", "homework", "behave"] as const;
export type StudentSection = (typeof STUDENT_SECTIONS)[number];

export const MASHOV_READ_ROUTES = [
  route("POST", "/api/login"),
  route("GET", "/api/schools"),
  route("GET", "/api/mail/inbox/conversations"),
  ...STUDENT_SECTIONS.map((section) => route("GET", `/api/students/:id/${section}`)),
];

const LOGIN_HINT =
  "Check MASHOV_USERNAME, MASHOV_PASSWORD, MASHOV_SEMEL and MASHOV_YEAR before trying again: repeated failed logins may lock the account.";

export interface Page {
  readonly skip: number;
  readonly take: number;
}

/** Mashov API client. Call `login` once; every later call reuses its session. */
export class MashovClient {
  readonly #http: HttpClient;
  #csrfToken: string | undefined;

  constructor({ access, approve, fetch }: Transport) {
    this.#http = new HttpClient({
      baseUrl: MASHOV_BASE_URL,
      access,
      approve,
      readRoutes: MASHOV_READ_ROUTES,
      fetch,
    });
  }

  /** Logs in and returns the account's students. */
  async login(config: MashovConfig): Promise<readonly MashovStudent[]> {
    const response = await this.#http
      .request("POST", "/api/login", {
        json: {
          username: config.username,
          password: config.password,
          semel: Number(config.semel),
          year: Number(config.year),
        },
      })
      .catch((error: unknown) => {
        throw error instanceof AuthError ? new AuthError(error.message, LOGIN_HINT) : error;
      });
    const csrfToken = response.headers.get("x-csrf-token");
    if (csrfToken === null || csrfToken === "") {
      throw new AuthError("Mashov login did not return a session.", LOGIN_HINT);
    }
    this.#csrfToken = csrfToken;
    return resolveStudents(studentsFromLogin(response.body), config.studentId);
  }

  async studentSection(studentId: string, section: StudentSection): Promise<unknown> {
    return this.#get(`/api/students/${encodeURIComponent(studentId)}/${section}`);
  }

  async conversations(page: Page): Promise<unknown> {
    return this.#get("/api/mail/inbox/conversations", { skip: page.skip, take: page.take });
  }

  /** Public school list, used to look up a school's semel. Needs no login. */
  async schools(): Promise<unknown> {
    return (await this.#http.request("GET", "/api/schools")).body;
  }

  async #get(path: string, query?: Readonly<Record<string, number>>): Promise<unknown> {
    if (this.#csrfToken === undefined) throw new AuthError("Not logged in to Mashov.");
    const response = await this.#http.request("GET", path, {
      headers: { "x-csrf-token": this.#csrfToken },
      ...(query === undefined ? {} : { query }),
    });
    return response.body;
  }
}

function resolveStudents(
  discovered: readonly MashovStudent[],
  overrideId: string | undefined,
): readonly MashovStudent[] {
  if (overrideId !== undefined) {
    const known = discovered.filter((student) => student.id === overrideId);
    return known.length > 0
      ? known
      : [{ id: overrideId, name: "", classCode: undefined, classNum: undefined }];
  }
  if (discovered.length > 0) return discovered;
  throw new ConfigError(
    "Could not find a student in the Mashov login response.",
    "Set MASHOV_STUDENT_ID to the student's Mashov id.",
  );
}
