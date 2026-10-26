import { HttpResponse, http, type JsonBodyType } from "msw";
import { describe, expect, it } from "vitest";
import { APPS } from "../../src/cli.ts";
import { main } from "../../src/core/cli.ts";
import { WEBTOP_BASE_URL } from "../../src/webtop/client.ts";
import { captureRequests, server } from "../msw.ts";

const API = `${WEBTOP_BASE_URL}/server/api`;
const ENV = { SMARTSCHOOL_WEB_TOKEN: "token-sentinel" };
const BIO_ENV = { ...ENV, SMARTSCHOOL_BIO_LOGIN: "bio-sentinel", SMARTSCHOOL_UNIQUE_ID: "u-1" };
const CHILDREN = [
  { id: "enc-1", firstName: "Noa", lastName: "Levi", classCode: 7, classNum: 2, studyYear: 2027 },
  { id: "enc-2", firstName: "Ido", lastName: "Levi", classCode: 4, classNum: 1, studyYear: 2027 },
];

const ok = (data: JsonBodyType) =>
  HttpResponse.json({ status: true, data, errorDescription: null });

/** Answers `endpoint` with `data`, echoing nothing about the request. */
function mock(endpoint: string, data: JsonBodyType) {
  server.use(http.post(`${API}/${endpoint}`, () => ok(data)));
}

function mockDashboard() {
  mock("dashboard/InitDashboard", { childrens: CHILDREN });
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

const bodies = (requests: Request[], endpoint: string) =>
  Promise.all(requests.filter((r) => r.url.endsWith(endpoint)).map((r) => r.clone().json()));

describe("school webtop", () => {
  it("sends the webToken cookie and browser origin on every call", async () => {
    const seen = captureRequests();
    mockDashboard();
    const { code, json } = await runCli(["webtop", "students"]);
    expect(code).toBe(0);
    expect(
      json.data.students.map((s: { index: number; name: string }) => [s.index, s.name]),
    ).toEqual([
      [1, "Noa Levi"],
      [2, "Ido Levi"],
    ]);
    expect(seen[0]?.headers.get("cookie")).toBe("webToken=token-sentinel");
    expect(seen[0]?.headers.get("origin")).toBe("https://webtop.smartschool.co.il");
  });

  it("asks for the week's lessons with the student's class and the --week offset", async () => {
    const seen = captureRequests();
    mockDashboard();
    mock("PupilCard/GetPupilLessonsAndHomework", [
      {
        date: "2026-10-19",
        hoursData: [{ scheduale: [{ homeWork: "עמוד 12", subject_name: "מתמטיקה" }] }],
      },
    ]);
    const { code, json } = await runCli(["webtop", "homework", "--student", "1", "--week=-1"]);
    expect(code).toBe(0);
    expect(await bodies(seen, "GetPupilLessonsAndHomework")).toEqual([
      {
        classCode: 7,
        moduleID: 11,
        studentID: "enc-1",
        studentName: "Noa Levi",
        studyYear: 2027,
        viewType: 0,
        weekIndex: -1,
      },
    ]);
    expect(json.data.students[0].homework).toEqual([
      { date: "2026-10-19", subject: "מתמטיקה", teacher: "", homework: "עמוד 12", description: "" },
    ]);
  });

  it("asks for grades and behavior by encrypted id and class code", async () => {
    const seen = captureRequests();
    mockDashboard();
    mock("dashboard/GetGrades", [{ grade: 95 }]);
    mock("dashboard/GetPupilDiciplineEvents", []);
    await runCli(["webtop", "grades", "--student", "2"]);
    await runCli(["webtop", "behavior", "--student", "2"]);
    expect(await bodies(seen, "GetGrades")).toEqual([{ id: "enc-2", ClassCode: 4 }]);
    expect(await bodies(seen, "GetPupilDiciplineEvents")).toEqual([{ id: "enc-2", ClassCode: 4 }]);
  });

  it("lists unread inbox messages without opening them", async () => {
    const seen = captureRequests();
    mock("messageBox/GetMessagesInbox", [
      { subject: "טיול", student_F_name: "דוד", student_L_name: "כהן" },
    ]);
    const { json } = await runCli(["webtop", "messages", "--unread", "--page", "2"]);
    expect(await bodies(seen, "GetMessagesInbox")).toEqual([
      { PageId: 2, LabelId: 0, HasRead: false, SearchQuery: "" },
    ]);
    expect(json.data.messages[0]).toMatchObject({ subject: "טיול", sender: "כהן דוד" });
  });

  it("loads the dashboard once for `all`", async () => {
    const seen = captureRequests();
    mockDashboard();
    mock("dashboard/GetGrades", []);
    mock("PupilCard/GetPupilLessonsAndHomework", []);
    mock("dashboard/GetPupilDiciplineEvents", []);
    mock("messageBox/GetMessagesInbox", []);
    mock("Menu/GetPreviewUnreadNotifications", { count: 0 });
    const { code, json } = await runCli(["webtop", "all"]);
    expect(code).toBe(0);
    expect(seen.filter((r) => r.url.endsWith("InitDashboard"))).toHaveLength(1);
    expect(json.data.students).toHaveLength(2);
    expect(json.data.notifications).toEqual({ count: 0 });
  });

  it("reports status=false as an upstream error without the server's description", async () => {
    server.use(
      http.post(`${API}/dashboard/CheckToken`, () =>
        HttpResponse.json({ status: false, data: null, errorDescription: "secret detail" }),
      ),
    );
    const { code, json, output } = await runCli(["webtop", "check"]);
    expect(code).toBe(4);
    expect(json.error.message).toBe("POST /server/api/dashboard/CheckToken returned an error.");
    expect(output).not.toContain("secret detail");
  });

  it("explains how to refresh an expired token when no saved login is set", async () => {
    server.use(
      http.post(`${API}/dashboard/CheckToken`, () => new HttpResponse(null, { status: 401 })),
    );
    const { code, json, output } = await runCli(["webtop", "check"]);
    expect(code).toBe(3);
    expect(json.error.hint).toContain("SMARTSCHOOL_WEB_TOKEN");
    expect(output).not.toMatch(/sentinel/);
  });

  it("renews an expired token once with the saved login and retries", async () => {
    const seen = captureRequests();
    server.use(
      http.post(`${API}/dashboard/CheckToken`, ({ request }) =>
        request.headers.get("cookie") === "webToken=fresh-token"
          ? ok(true)
          : new HttpResponse(null, { status: 401 }),
      ),
      http.post(`${API}/user/loginByBio`, () => ok({ token: "fresh-token" })),
    );
    const { code, json, output } = await runCli(["webtop", "check"], BIO_ENV);
    expect(code).toBe(0);
    expect(json.data).toEqual({ valid: true, renewed: true });
    expect(await bodies(seen, "loginByBio")).toEqual([
      { id: "bio-sentinel", param1: "2", param2: "", param3: "", param4: "u-1", param5: "true" },
    ]);
    expect(output).not.toMatch(/sentinel|fresh-token/);
  });

  it("renews the token only once per run", async () => {
    const seen = captureRequests();
    server.use(
      http.post(`${API}/:area/:endpoint`, ({ request, params }) => {
        if (params.endpoint === "loginByBio") return ok({ token: "fresh-token" });
        if (request.headers.get("cookie") !== "webToken=fresh-token") {
          return new HttpResponse(null, { status: 401 });
        }
        return params.endpoint === "InitDashboard" ? ok({ childrens: CHILDREN }) : ok([]);
      }),
    );
    const { code } = await runCli(["webtop", "grades"], BIO_ENV);
    expect(code).toBe(0);
    expect(seen.filter((r) => r.url.endsWith("loginByBio"))).toHaveLength(1);
  });

  it("gives up after one renewal when the new session is rejected too", async () => {
    const seen = captureRequests();
    server.use(
      http.post(`${API}/dashboard/CheckToken`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${API}/user/loginByBio`, () => ok({ token: "fresh-token" })),
    );
    const { code, json } = await runCli(["webtop", "check"], {
      SMARTSCHOOL_BIO_LOGIN: "bio-sentinel",
    });
    expect(code).toBe(3);
    expect(json.error.hint).toContain("SMARTSCHOOL_BIO_LOGIN");
    expect(seen.filter((r) => r.url.endsWith("loginByBio"))).toHaveLength(1);
  });

  it("reports a declined saved login as an auth error", async () => {
    server.use(
      http.post(`${API}/user/loginByBio`, () => HttpResponse.json({ status: false, data: null })),
    );
    const { code, json } = await runCli(["webtop", "check"], {
      SMARTSCHOOL_BIO_LOGIN: "bio-sentinel",
    });
    expect(code).toBe(3);
    expect(json.error.message).toBe("Webtop declined the saved login.");
    expect(json.error.hint).toContain("SMARTSCHOOL_BIO_LOGIN");
  });
});
