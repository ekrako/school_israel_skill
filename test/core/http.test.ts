import { delay, HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { route } from "../../src/core/access.ts";
import type { Approver } from "../../src/core/approval.ts";
import { AccessDenied, AuthError, UpstreamError, UsageError } from "../../src/core/errors.ts";
import { HttpClient, type HttpClientOptions } from "../../src/core/http.ts";
import { captureRequests, server } from "../msw.ts";

const BASE = "https://school.test";
const READ_ROUTES = [route("GET", "/api/students/:id/grades"), route("POST", "/api/login")];

function client(overrides: Partial<HttpClientOptions> = {}): HttpClient {
  return new HttpClient({ baseUrl: BASE, access: "read", readRoutes: READ_ROUTES, ...overrides });
}

describe("HttpClient", () => {
  it("stores cookies from a response and sends them on the next request", async () => {
    server.use(
      http.post(`${BASE}/api/login`, () =>
        HttpResponse.json(
          { ok: true },
          {
            headers: [
              ["set-cookie", "Session=abc; Path=/; HttpOnly"],
              ["set-cookie", "Csrf=xyz"],
            ],
          },
        ),
      ),
      http.get(`${BASE}/api/students/:id/grades`, ({ request }) =>
        HttpResponse.json({ cookie: request.headers.get("cookie") }),
      ),
    );
    const api = client();
    await api.request("POST", "/api/login", { json: { user: "u" } });
    const response = await api.request("GET", "/api/students/s1/grades");
    expect(response.body).toEqual({ cookie: "Session=abc; Csrf=xyz" });
  });

  it("refuses non-allowlisted calls at read access without sending anything", async () => {
    const seen = captureRequests();
    await expect(client().request("POST", "/api/mail/send", { json: {} })).rejects.toThrow(
      AccessDenied,
    );
    expect(seen).toHaveLength(0);
  });

  it("checks the guard against the normalised path, not the raw one", async () => {
    const seen = captureRequests();
    await expect(client().request("POST", "/api/login/../mail/send")).rejects.toThrow(AccessDenied);
    await expect(client().request("POST", "/api/login/%2e%2e/mail/send")).rejects.toThrow(
      AccessDenied,
    );
    expect(seen).toHaveLength(0);
  });

  it("sends a non-read call at full access once the user approves it", async () => {
    server.use(http.delete(`${BASE}/api/mail/1`, () => HttpResponse.json({ deleted: true })));
    const approve = vi.fn<Approver>(async () => "approved");
    const response = await client({ access: "full", approve }).request("DELETE", "/api/mail/1");
    expect(response.body).toEqual({ deleted: true });
    expect(approve).toHaveBeenCalledOnce();
    expect(approve.mock.calls[0]?.[0]).toMatchObject({ method: "DELETE" });
  });

  it("shows the approver the exact body that would be sent", async () => {
    const approve = vi.fn<Approver>(async () => "denied");
    await client({ access: "full", approve })
      .request("POST", "/api/mail/send", { json: { text: "hi" } })
      .catch(() => undefined);
    expect(approve.mock.calls[0]?.[0].body).toEqual({ text: "hi" });
    expect(approve.mock.calls[0]?.[0].url.pathname).toBe("/api/mail/send");
  });

  it.each([
    ["denied", /did not approve/],
    ["unavailable", /Could not ask/],
  ] as const)("sends nothing when approval is %s", async (approval, message) => {
    const seen = captureRequests();
    const approve: Approver = async () => approval;
    const error = await client({ access: "full", approve })
      .request("POST", "/api/mail/send")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AccessDenied);
    expect((error as AccessDenied).message).toMatch(message);
    expect((error as AccessDenied).hint).toContain("scripts/school grant");
    expect(seen).toHaveLength(0);
  });

  it("denies non-read calls at full access when no approver is wired in", async () => {
    const seen = captureRequests();
    await expect(client({ access: "full" }).request("POST", "/api/mail/send")).rejects.toThrow(
      AccessDenied,
    );
    expect(seen).toHaveLength(0);
  });

  it("sends non-read calls at unattended access without asking", async () => {
    server.use(http.post(`${BASE}/api/mail/send`, () => HttpResponse.json({ sent: true })));
    const approve = vi.fn<Approver>(async () => "denied");
    const response = await client({ access: "unattended", approve }).request(
      "POST",
      "/api/mail/send",
    );
    expect(response.body).toEqual({ sent: true });
    expect(approve).not.toHaveBeenCalled();
  });

  it("never asks for approval at read access or for read calls", async () => {
    server.use(http.post(`${BASE}/api/login`, () => HttpResponse.json({})));
    const approve = vi.fn<Approver>(async () => "approved");
    await expect(client({ approve }).request("POST", "/api/mail/send")).rejects.toThrow(
      AccessDenied,
    );
    await client({ access: "full", approve }).request("POST", "/api/login");
    expect(approve).not.toHaveBeenCalled();
  });

  it.each(["//evil.test/api/login", "https://evil.test/api/login"])(
    "refuses to leave the app's origin even at full access: %s",
    async (path) => {
      const seen = captureRequests();
      await expect(client({ access: "full" }).request("POST", path)).rejects.toThrow(UsageError);
      expect(seen).toHaveLength(0);
    },
  );

  it("maps 401 to an auth error", async () => {
    server.use(http.post(`${BASE}/api/login`, () => new HttpResponse(null, { status: 401 })));
    await expect(client().request("POST", "/api/login")).rejects.toThrow(AuthError);
  });

  it("does not follow redirects", async () => {
    const seen = captureRequests();
    server.use(
      http.post(`${BASE}/api/login`, () =>
        HttpResponse.redirect("https://elsewhere.test/login", 302),
      ),
    );
    await expect(client().request("POST", "/api/login")).rejects.toThrow(UpstreamError);
    expect(seen.map((r) => new URL(r.url).host)).toEqual(["school.test"]);
  });

  it("reports a timeout as an upstream error", async () => {
    server.use(
      http.post(`${BASE}/api/login`, async () => {
        await delay(500);
        return HttpResponse.json({});
      }),
    );
    await expect(client({ timeoutMs: 20 }).request("POST", "/api/login")).rejects.toThrow(
      /timed out/,
    );
  });

  it("keeps ids and response bodies out of error messages", async () => {
    const studentId = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    server.use(
      http.get(`${BASE}/api/students/:id/grades`, () =>
        HttpResponse.text("secret student body", { status: 500 }),
      ),
    );
    const error = await client()
      .request("GET", `/api/students/${studentId}/grades`)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(String((error as Error).message)).toBe(
      "GET /api/students/:id/grades failed (HTTP 500).",
    );
  });

  it("fails requests that have no mock, so tests can never reach a real server", async () => {
    await expect(client().request("POST", "/api/login")).rejects.toThrow(UpstreamError);
  });

  it("returns non-JSON bodies as text", async () => {
    server.use(http.post(`${BASE}/api/login`, () => HttpResponse.text("plain")));
    expect((await client().request("POST", "/api/login")).body).toBe("plain");
  });
});
