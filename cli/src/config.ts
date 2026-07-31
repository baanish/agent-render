import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type ConfigKey = "INSTANCE_URL" | "TOKEN";

export type StoredConfig = {
  instanceUrl?: string;
  token?: string;
};

export type ResolvedConfig = StoredConfig & {
  configPath: string;
};

/** The env shape these helpers read: a bag of optional string vars, not the framework-augmented ProcessEnv. */
export type EnvLookup = Readonly<Record<string, string | undefined>>;

function normalizeConfigKey(key: string): ConfigKey {
  const normalized = key.replace(/[-_]/g, "").toLowerCase();
  if (normalized === "instanceurl") return "INSTANCE_URL";
  if (normalized === "token") return "TOKEN";
  throw new Error(`Unknown config key "${key}". Expected INSTANCE_URL or TOKEN.`);
}

/** Resolves the XDG-compatible agent-render config file path. */
export function getConfigPath(env: EnvLookup = process.env): string {
  const configHome = env.XDG_CONFIG_HOME?.trim();
  const home = env.HOME?.trim() || os.homedir();
  return path.join(configHome || path.join(home, ".config"), "agent-render", "config.json");
}

/** Reads stored CLI configuration, treating a missing file as empty configuration. */
export async function readStoredConfig(env: EnvLookup = process.env): Promise<StoredConfig> {
  const configPath = getConfigPath(env);
  let contents: string;
  try {
    contents = await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    // Name the file: config is read on every create, including fragment mode that needs none, so a
    // bare SyntaxError here would fail an unrelated command with no way to find the cause.
    throw new Error(`Config file ${configPath} is not valid JSON.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Config file ${configPath} must contain a JSON object.`);
  }

  const record = parsed as Record<string, unknown>;
  return {
    instanceUrl: typeof record.instanceUrl === "string" ? record.instanceUrl : undefined,
    token: typeof record.token === "string" ? record.token : undefined,
  };
}

/**
 * Resolves CLI configuration with flags taking precedence over environment and file values.
 *
 * The endpoint and its credential resolve as a pair, not independently: a token is only carried
 * forward from a layer at or below the one that supplied the URL. Resolving them separately means
 * `--instance-url https://other-host` (with no `--token`) sends the token stored for a *different*
 * instance to that host.
 */
export async function resolveConfig(
  flags: StoredConfig = {},
  env: EnvLookup = process.env,
): Promise<ResolvedConfig> {
  const stored = await readStoredConfig(env);

  const layers: { instanceUrl?: string; token?: string }[] = [
    { instanceUrl: flags.instanceUrl, token: flags.token },
    { instanceUrl: env.AGENT_RENDER_INSTANCE_URL, token: env.AGENT_RENDER_TOKEN },
    { instanceUrl: stored.instanceUrl, token: stored.token },
  ];

  const instanceUrl = layers.find((layer) => layer.instanceUrl !== undefined)?.instanceUrl;
  // A token is usable only if its own layer does not name a DIFFERENT host: a layer that names no
  // URL (a bare --token, or AGENT_RENDER_TOKEN beside a config-file URL) is not tied to an endpoint,
  // but the config file's token belongs to the config file's instance and must not follow an
  // --instance-url override to somewhere else.
  const token = layers.find(
    (layer) =>
      layer.token !== undefined
      && (layer.instanceUrl === undefined || layer.instanceUrl === instanceUrl),
  )?.token;

  return {
    instanceUrl,
    token,
    configPath: getConfigPath(env),
  };
}

/** Stores one supported CLI configuration value. */
export async function setConfigValue(
  keyInput: string,
  value: string,
  env: EnvLookup = process.env,
): Promise<string> {
  const key = normalizeConfigKey(keyInput);
  const configPath = getConfigPath(env);
  const config = await readStoredConfig(env);
  if (key === "INSTANCE_URL") config.instanceUrl = value;
  else config.token = value;

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  // writeFile's mode only applies when it creates the file, so an existing world-readable config
  // would keep its permissions while now holding a bearer token.
  await chmod(configPath, 0o600);
  return configPath;
}

/** Reads one supported value directly from the config file. */
export async function getConfigValue(
  keyInput: string,
  env: EnvLookup = process.env,
): Promise<string | undefined> {
  const key = normalizeConfigKey(keyInput);
  const config = await readStoredConfig(env);
  return key === "INSTANCE_URL" ? config.instanceUrl : config.token;
}
