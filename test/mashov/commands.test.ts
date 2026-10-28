import { HttpResponse, http, type JsonBodyType } from "msw";
import { describe, expect, it } from "vitest";
import { APPS } from "../../skills/israel-school/src/cli.ts";
import { main } from "../../skills/israel-school/src/core/cli.ts";
import { MASHOV_BASE_URL } from "../../skills/israel-school/src/mashov/client.ts";
import { captureRequests, server } from "../msw.ts";

const API = `${MASHOV_BASE_URL}/api`;
const ENV = {
  MASHOV_USERNAME: "user-sentinel",
  MASHOV_PASSWORD: "password-sentinel",
  MASHOV_SEMEL: "123456",
  MASHOV_YEAR: "2027",
};
const CHILDREN = [
  { childGuid: "g-1", privateName: "Noa", familyName: "Levi" },
  { childGuid: "g-2", privateName: "Ido", familyName: "Levi" },
];

function mockLogin(body: JsonBodyType = { accessToken: { children: CHILDREN } }, csrf = "csrf-1") {
  server.use(
    http.post(`${API}/login`, () =>
      HttpResponse.json(body, {
        headers: [
          ["x-csrf-token", csrf],
          ["set-cookie", "MashovAuthToken=auth-1; Path=/; HttpOnly"],
        ],
      }),
    ),
  );
}

/** Answers every student endpoint with the section, student id and auth it received. */
function mockStudentSections() {
  server.use(
    http.get(`${API}/students/:id/:section`, ({ params, request }) =>
      HttpResponse.json({
        section: params.section,
        student: params.id,
        csrf: request.headers.get("x-csrf-token"),
        cookie: request.headers.get("cookie"),
      }),
    ),
  );
}

async function runCli(argv: string[], env: Record<string, string> = ENV) {
  let output = "";
  const code = await main(APPS, argv, {
    env,
    fetch,
    write: (text) => {
      output += text;
    },
  });
  return { code, output, json: JSON.parse(output) };
}

describe("school mashov", () => {
  it("logs in with the configured credentials and lists students", async () => {
    const seen = captureRequests();
    mockLogin();
    const { code, json } = await runCli(["mashov", "students"]);
    expect(code).toBe(0);
    expect(json.data.students.map((s: { index: number; id: string }) => [s.index, s.id])).toEqual([
      [1, "g-1"],
      [2, "g-2"],
    ]);
    expect(await seen[0]?.json()).toEqual({
      username: "user-sentinel",
      password: "password-sentinel",
      semel: 123456,
      year: 2027,
    });
  });

  it("sends the login's csrf token and cookie on every student call", async () => {
    mockLogin();
    mockStudentSections();
    const { code, json } = await runCli(["mashov", "grades"]);
    expect(code).toBe(0);
    expect(json.data.students).toEqual([
      {
        id: "g-1",
        name: "Noa Levi",
        data: {
          section: "grades",
          student: "g-1",
          csrf: "csrf-1",
          cookie: "MashovAuthToken=auth-1",
        },
      },
      {
        id: "g-2",
        name: "Ido Levi",
        data: {
          section: "grades",
          student: "g-2",
          csrf: "csrf-1",
          cookie: "MashovAuthToken=auth-1",
        },
      },
    ]);
  });

  it("maps behavior to Mashov's behave endpoint and honours --student", async () => {
    mockLogin();
    mockStudentSections();
    const { json } = await runCli(["mashov", "behavior", "--student", "2"]);
    expect(json.data.students).toHaveLength(1);
    expect(json.data.students[0].data).toMatchObject({ section: "behave", student: "g-2" });
  });

  it("uses MASHOV_STUDENT_ID when the login body has no students", async () => {
    mockLogin({});
    mockStudentSections();
    const { code, json } = await runCli(["mashov", "homework"], {
      ...ENV,
      MASHOV_STUDENT_ID: "g-7",
    });
    expect(code).toBe(0);
    expect(json.data.students[0].data).toMatchObject({ section: "homework", student: "g-7" });
  });

  it("asks for MASHOV_STUDENT_ID when no student can be found", async () => {
    mockLogin({});
    const { code, json } = await runCli(["mashov", "grades"]);
    expect(code).toBe(2);
    expect(json.error.hint).toContain("MASHOV_STUDENT_ID");
  });

  it("pages the inbox with --skip and --take", async () => {
    mockLogin();
    server.use(
      http.get(`${API}/mail/inbox/conversations`, ({ request }) =>
        HttpResponse.json([{ query: new URL(request.url).search }]),
      ),
    );
    const { json } = await runCli(["mashov", "messages", "--skip", "20", "--take", "5"]);
    expect(json.data.conversations).toEqual([{ query: "?skip=20&take=5" }]);
  });

  it("fetches every section with a single login for `all`", async () => {
    const seen = captureRequests();
    mockLogin();
    mockStudentSections();
    server.use(http.get(`${API}/mail/inbox/conversations`, () => HttpResponse.json([])));
    const { code, json } = await runCli(["mashov", "all", "--student", "g-1"]);
    expect(code).toBe(0);
    expect(seen.filter((r) => r.url.endsWith("/api/login"))).toHaveLength(1);
    expect(Object.keys(json.data.students[0])).toEqual([
      "id",
      "name",
      "grades",
      "timetable",
      "homework",
      "behavior",
    ]);
    expect(json.data.conversations).toEqual([]);
  });

  it("lists schools without credentials and filters them by --query", async () => {
    const seen = captureRequests();
    server.use(
      http.get(`${API}/schools`, () =>
        HttpResponse.json([
          { semel: 123456, name: "Alon" },
          { semel: 654321, name: "Hadar" },
        ]),
      ),
    );
    const { code, json } = await runCli(["mashov", "schools", "--query", "Hadar"], {});
    expect(code).toBe(0);
    expect(json.data.schools).toEqual([{ semel: 654321, name: "Hadar" }]);
    expect(seen.map((r) => new URL(r.url).pathname)).toEqual(["/api/schools"]);
  });

  it("reports a rejected login as an auth error without echoing credentials", async () => {
    server.use(
      http.post(`${API}/login`, () =>
        HttpResponse.json({ error: "password-sentinel" }, { status: 401 }),
      ),
    );
    const { code, json, output } = await runCli(["mashov", "grades"]);
    expect(code).toBe(3);
    expect(json.error).toEqual({
      type: "auth",
      message: "POST /api/login was rejected (HTTP 401).",
      hint: expect.stringContaining("may lock the account"),
    });
    expect(output).not.toMatch(/sentinel/);
  });

  it("treats a login without a csrf token as an auth error", async () => {
    mockLogin({ accessToken: { children: CHILDREN } }, "");
    const { code, json } = await runCli(["mashov", "students"]);
    expect(code).toBe(3);
    expect(json.error.message).toBe("Mashov login did not return a session.");
  });

  it("redacts the student id from upstream error messages", async () => {
    mockLogin({
      accessToken: { children: [{ childGuid: "6f1c2a9e-0b7d-4c3e-9a51-2d8f7e6b4c10" }] },
    });
    server.use(
      http.get(`${API}/students/:id/grades`, () => new HttpResponse(null, { status: 500 })),
    );
    const { code, json } = await runCli(["mashov", "grades"]);
    expect(code).toBe(4);
    expect(json.error.message).toBe("GET /api/students/:id/grades failed (HTTP 500).");
  });
});
