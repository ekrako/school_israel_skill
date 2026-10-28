import { createInterface } from "node:readline/promises";
import { type ParseArgsOptionsConfig, parseArgs } from "node:util";
import { type AccessLevel, effectiveAccess, parseAccessLevel } from "./access.ts";
import { type Approver, denyAll, dialogApprover, execFileNoShell, withGrant } from "./approval.ts";
import {
  type Apps,
  type CliOptions,
  type Command,
  intOption,
  type OptionSpecs,
} from "./commands.ts";
import { type Env, loadDotEnv, SKILL_ROOT } from "./config.ts";
import { AccessDenied, ConfigError, UsageError } from "./errors.ts";
import {
  activeGrant,
  DEFAULT_GRANT_MINUTES,
  grant,
  grantPath,
  type Prompt,
  revoke,
} from "./grant.ts";
import { noSecretStore, osSecretStore, type SecretStore, withStoredSecrets } from "./keychain.ts";
import { serialize, toErrorResult } from "./output.ts";
import {
  checkForUpdate,
  npxRunner,
  readVersion,
  type UpdateNotice,
  updateCheckPath,
  updateSkill,
} from "./update.ts";

export interface CliDeps {
  readonly env: Env;
  readonly fetch: typeof fetch;
  readonly write: (text: string) => void;
  /** Approves calls that change data. Defaults to denying them. */
  readonly approve?: Approver;
  /** Asks the person at the terminal; absent when there is none, as for agents. */
  readonly prompt?: Prompt;
  /** Supplies an app's secrets the environment leaves unset. Defaults to none. */
  readonly secrets?: SecretStore;
  /** Reports a newer version of the skill, if there is one. Defaults to never. */
  readonly checkUpdate?: () => Promise<UpdateNotice | undefined>;
  /** Updates the installed skill. Absent where updating is not possible. */
  readonly update?: () => Promise<unknown>;
  readonly now?: () => Date;
}

const GLOBAL_OPTIONS: OptionSpecs = {
  "read-only": { type: "boolean" },
  student: { type: "string" },
  minutes: { type: "string" },
};

const USAGE_HINT = "Run `school help` to list apps and commands.";

/** Runs one CLI invocation and returns its exit code. Output is a single JSON document. */
export async function main(apps: Apps, argv: readonly string[], deps: CliDeps): Promise<number> {
  const notice = (deps.checkUpdate?.() ?? Promise.resolve(undefined)).catch(() => undefined);
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: optionSpecs(apps),
    });
    // No spec sets `multiple`, so parseArgs never produces arrays here.
    const options = values as CliOptions;
    const access = effectiveAccess(
      parseAccessLevel(deps.env.SCHOOL_ACCESS),
      options["read-only"] === true,
    );
    const [app, commandName, ...args] = positionals;

    if (app === undefined || app in SCHOOL_COMMANDS) {
      const name = app ?? "help";
      const data = await runSchoolCommand(name, apps, access, options, deps);
      const update = name === "update" ? {} : updateField(await notice);
      deps.write(
        serialize({
          ok: true,
          app: "school",
          command: name,
          access,
          write: false,
          data,
          ...update,
        }),
      );
      return 0;
    }
    const command = findCommand(apps, app, commandName);
    if (command.write && access === "read") {
      throw new AccessDenied(`${app} ${commandName} changes data in the school app.`);
    }
    const approve = deps.approve ?? denyAll;
    const env = await withStoredSecrets(
      deps.env,
      apps[app]?.secrets ?? [],
      deps.secrets ?? noSecretStore,
    );
    const data = await command.run({
      access,
      approve,
      env,
      fetch: deps.fetch,
      options,
      args,
    });
    deps.write(
      serialize({
        ok: true,
        app,
        command: commandName ?? "",
        access,
        write: command.write,
        data,
        ...updateField(await notice),
      }),
    );
    return 0;
  } catch (error) {
    return reportError(error, deps.write, await notice);
  }
}

function updateField(notice: UpdateNotice | undefined): { update?: UpdateNotice } {
  return notice === undefined ? {} : { update: notice };
}

const SCHOOL_COMMANDS = { help: true, grant: true, revoke: true, update: true } as const;

async function runSchoolCommand(
  name: string,
  apps: Apps,
  access: AccessLevel,
  options: CliOptions,
  deps: CliDeps,
): Promise<unknown> {
  if (name === "help") return describeApps(apps);
  if (name === "update") {
    if (deps.update === undefined) throw new UsageError("Updating is not available here.");
    return deps.update();
  }
  const path = grantPath(deps.env);
  if (name === "revoke") return revoke(path);
  if (access !== "full") {
    throw new ConfigError("A grant only matters when SCHOOL_ACCESS=full.");
  }
  const minutes = intOption(options, "minutes", DEFAULT_GRANT_MINUTES);
  return grant(path, minutes, deps.prompt, (deps.now ?? (() => new Date()))());
}

function optionSpecs(apps: Apps): ParseArgsOptionsConfig {
  return Object.assign({}, GLOBAL_OPTIONS, ...Object.values(apps).map((app) => app.options ?? {}));
}

export function reportError(
  error: unknown,
  write: (text: string) => void,
  notice?: UpdateNotice,
): number {
  const { envelope, exitCode } = toErrorResult(
    isArgParseError(error) ? new UsageError(error.message, USAGE_HINT) : error,
  );
  write(serialize({ ...envelope, ...updateField(notice) }));
  return exitCode;
}

function isArgParseError(error: unknown): error is TypeError {
  return (
    error instanceof TypeError &&
    String((error as { code?: unknown }).code).startsWith("ERR_PARSE_ARGS")
  );
}

function findCommand(apps: Apps, app: string, commandName: string | undefined): Command {
  const commands = apps[app]?.commands;
  if (commands === undefined) throw new UsageError(`Unknown app "${app}".`, USAGE_HINT);
  const command = commandName === undefined ? undefined : commands[commandName];
  if (command === undefined) throw new UsageError(`Unknown ${app} command.`, USAGE_HINT);
  return command;
}

function describeApps(
  apps: Apps,
): Record<string, Record<string, { summary: string; write: boolean }>> {
  return Object.fromEntries(
    Object.entries(apps).map(([app, { commands }]) => [
      app,
      Object.fromEntries(
        Object.entries(commands).map(([name, { summary, write }]) => [name, { summary, write }]),
      ),
    ]),
  );
}

/**
 * Entry point for the real process: loads `.env`, then runs against stdout and global
 * fetch. Writes are approved by an active grant or, failing that, a native dialog.
 */
export async function runFromProcess(apps: Apps): Promise<number> {
  const write = (text: string) => process.stdout.write(text);
  try {
    loadDotEnv();
  } catch (error) {
    return reportError(error, write);
  }
  const env = process.env;
  const path = grantPath(env);
  const approve = withGrant(
    () => activeGrant(path, new Date()) !== undefined,
    dialogApprover(process.platform, env, execFileNoShell),
  );
  const prompt = process.stdin.isTTY && process.stderr.isTTY ? terminalPrompt : undefined;
  const secrets = osSecretStore(process.platform, execFileNoShell);
  const checkUpdate = () =>
    checkForUpdate({
      env,
      fetch,
      now: new Date(),
      current: readVersion(SKILL_ROOT),
      cachePath: updateCheckPath(env),
    });
  const update = () => updateSkill(SKILL_ROOT, npxRunner(env));
  return main(apps, process.argv.slice(2), {
    env,
    fetch,
    write,
    approve,
    prompt,
    secrets,
    checkUpdate,
    update,
  });
}

async function terminalPrompt(question: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
}
