import { setupServer } from "msw/node";

export const server = setupServer();

/** Records every request msw sees, so tests can assert that nothing left the process. */
export function captureRequests(): Request[] {
  const seen: Request[] = [];
  server.events.on("request:start", ({ request }) => {
    seen.push(request.clone());
  });
  return seen;
}
