import type { Exec } from "./approval.ts";
import { type Env, optionalEnv } from "./config.ts";

/** Keychain items use this service; the account is the variable's name. */
export const KEYCHAIN_SERVICE = "israel-school";

/** Finds a stored secret by its variable name; undefined when none is stored. */
export type SecretStore = (name: string) => Promise<string | undefined>;

export const noSecretStore: SecretStore = async () => undefined;

/**
 * Reads secrets from the macOS Keychain (`security`) or the Linux Secret Service
 * (`secret-tool`), without a shell. A missing program or item reads as "not stored", so
 * the caller's usual "is not set" error still names the variable.
 */
export function osSecretStore(platform: NodeJS.Platform, exec: Exec): SecretStore {
  if (platform === "darwin") {
    return async (name) => {
      const result = await exec("security", [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        name,
        "-g",
      ]).catch(() => undefined);
      return result?.code === 0 ? parseMacPassword(result.stderr) : undefined;
    };
  }
  if (platform === "linux") {
    return async (name) => {
      const result = await exec("secret-tool", [
        "lookup",
        "service",
        KEYCHAIN_SERVICE,
        "account",
        name,
      ]).catch(() => undefined);
      return result?.code === 0 && result.stdout !== "" ? result.stdout : undefined;
    };
  }
  return noSecretStore;
}

/**
 * Parses the `password:` line `security -g` prints: `"text"` for plain printable ASCII,
 * otherwise `0x<hex>  "<escaped>"`, as for Hebrew or a password with a quote. `-w` would
 * print that hex bare, which cannot be told apart from a password made of hex digits.
 */
export function parseMacPassword(stderr: string): string | undefined {
  const value = stderr
    .split("\n")
    .find((line) => line.startsWith("password: "))
    ?.slice("password: ".length);
  if (value === undefined) return undefined;
  const hex = /^0x([0-9A-F]+)(?:\s|$)/i.exec(value)?.[1];
  if (hex !== undefined) return Buffer.from(hex, "hex").toString("utf8");
  return /^"(.*)"$/.exec(value)?.[1];
}

/** Fills each of `names` that the environment leaves empty from `store`. */
export async function withStoredSecrets(
  env: Env,
  names: readonly string[],
  store: SecretStore,
): Promise<Env> {
  const missing = names.filter((name) => optionalEnv(env, name) === undefined);
  const found = await Promise.all(missing.map(async (name) => [name, await store(name)] as const));
  return { ...env, ...Object.fromEntries(found.filter(([, value]) => value !== undefined)) };
}
