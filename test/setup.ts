import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw.ts";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  server.events.removeAllListeners();
});
afterAll(() => server.close());
