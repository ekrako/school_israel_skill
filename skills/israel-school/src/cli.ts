import { runFromProcess } from "./core/cli.ts";
import type { Apps } from "./core/commands.ts";
import { mashov } from "./mashov/commands.ts";
import { webtop } from "./webtop/commands.ts";

export const APPS: Apps = { mashov, webtop };

if (import.meta.main) {
  process.exitCode = await runFromProcess(APPS);
}
