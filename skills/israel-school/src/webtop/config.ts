import { type Env, optionalEnv } from "../core/config.ts";
import { ConfigError } from "../core/errors.ts";

export interface BioLogin {
  readonly bioLogin: string;
  readonly deviceId: string;
  readonly selectedUser: string;
  readonly uniqueId: string;
}

export interface WebtopConfig {
  readonly webToken: string | undefined;
  /** Set only when the user opted in to renewing sessions with a saved browser login. */
  readonly bio: BioLogin | undefined;
}

const TOKEN_HINT =
  "Set SMARTSCHOOL_WEB_TOKEN to the webToken cookie from webtop.smartschool.co.il, or set SMARTSCHOOL_BIO_LOGIN.";

export function readWebtopConfig(env: Env): WebtopConfig {
  const webToken = decodeToken(optionalEnv(env, "SMARTSCHOOL_WEB_TOKEN"));
  const bioLogin = optionalEnv(env, "SMARTSCHOOL_BIO_LOGIN");
  if (webToken === undefined && bioLogin === undefined) {
    throw new ConfigError("SMARTSCHOOL_WEB_TOKEN is not set.", TOKEN_HINT);
  }
  const bio =
    bioLogin === undefined
      ? undefined
      : {
          bioLogin,
          deviceId: optionalEnv(env, "SMARTSCHOOL_DEVICE_ID") ?? "",
          selectedUser: optionalEnv(env, "SMARTSCHOOL_SELECTED_USER") ?? "",
          uniqueId: optionalEnv(env, "SMARTSCHOOL_UNIQUE_ID") ?? "",
        };
  return { webToken, bio };
}

/** Browsers' cookie viewers often show the token URL-encoded. */
function decodeToken(raw: string | undefined): string | undefined {
  if (raw === undefined || !raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new ConfigError("SMARTSCHOOL_WEB_TOKEN is not a valid cookie value.", TOKEN_HINT);
  }
}
