import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getConfigPath,
  getConfigValue,
  resolveConfig,
  setConfigValue,
} from "../src/config";

const temporaryDirectories: string[] = [];

async function temporaryHome(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-render-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("CLI config", () => {
  it("uses HOME when XDG_CONFIG_HOME is absent", async () => {
    const home = await temporaryHome();
    const env = { HOME: home };
    await setConfigValue("INSTANCE_URL", "https://stored.example/base", env);

    expect(getConfigPath(env)).toBe(path.join(home, ".config", "agent-render", "config.json"));
    expect(await getConfigValue("instance-url", env)).toBe("https://stored.example/base");
    const stored = JSON.parse(await readFile(getConfigPath(env), "utf8")) as unknown;
    expect(stored).toEqual({ instanceUrl: "https://stored.example/base" });
  });

  it("never sends a stored token to an --instance-url override for another host", async () => {
    const home = await temporaryHome();
    const fileEnv = { HOME: home };
    await setConfigValue("INSTANCE_URL", "https://private-a", fileEnv);
    await setConfigValue("TOKEN", "secret-a", fileEnv);

    // The config file's token belongs to the config file's instance; pointing the CLI somewhere else
    // must not carry that credential along.
    const overridden = await resolveConfig({ instanceUrl: "https://other-b" }, { HOME: home });
    expect(overridden.instanceUrl).toBe("https://other-b");
    expect(overridden.token).toBeUndefined();

    // An explicit --token is a deliberate choice and still applies.
    const explicit = await resolveConfig(
      { instanceUrl: "https://other-b", token: "for-b" },
      { HOME: home },
    );
    expect(explicit.token).toBe("for-b");
  });

  it("does not send an environment-scoped token to an --instance-url override", async () => {
    const home = await temporaryHome();
    // The env pair names its own host, so its token belongs to that host and must not follow an
    // override elsewhere -- the same rule as the config file, applied to the env layer.
    const environment = {
      HOME: home,
      AGENT_RENDER_INSTANCE_URL: "https://env-host",
      AGENT_RENDER_TOKEN: "env-secret",
    };

    const overridden = await resolveConfig({ instanceUrl: "https://attacker.example" }, environment);
    expect(overridden.instanceUrl).toBe("https://attacker.example");
    expect(overridden.token).toBeUndefined();

    // Without an override the env pair is used as configured.
    const unchanged = await resolveConfig({}, environment);
    expect(unchanged.instanceUrl).toBe("https://env-host");
    expect(unchanged.token).toBe("env-secret");
  });

  it("does not treat a token-only config file as a portable credential", async () => {
    const home = await temporaryHome();
    // No instanceUrl stored: the token is still a stored credential for this file's instance, not a
    // secret to hand to whatever host the caller names.
    await setConfigValue("TOKEN", "stored-secret", { HOME: home });

    const resolved = await resolveConfig({ instanceUrl: "https://attacker.example" }, { HOME: home });
    expect(resolved.instanceUrl).toBe("https://attacker.example");
    expect(resolved.token).toBeUndefined();
  });

  it("still pairs a config-file URL with a token supplied only by the environment", async () => {
    const home = await temporaryHome();
    await setConfigValue("INSTANCE_URL", "https://private-a", { HOME: home });

    // The env token names no host of its own, so it is not tied to a different endpoint.
    const resolved = await resolveConfig({}, { HOME: home, AGENT_RENDER_TOKEN: "ci-secret" });
    expect(resolved.instanceUrl).toBe("https://private-a");
    expect(resolved.token).toBe("ci-secret");
  });

  it("resolves flags over environment over stored values", async () => {
    const home = await temporaryHome();
    const fileEnv = { HOME: home };
    await setConfigValue("INSTANCE_URL", "https://stored.example", fileEnv);
    await setConfigValue("TOKEN", "stored-token", fileEnv);

    const environment = {
      HOME: home,
      AGENT_RENDER_INSTANCE_URL: "https://env.example",
      AGENT_RENDER_TOKEN: "env-token",
    };
    expect(await resolveConfig({}, environment)).toMatchObject({
      instanceUrl: "https://env.example",
      token: "env-token",
    });
    expect(await resolveConfig({ instanceUrl: "https://flag.example", token: "flag-token" }, environment))
      .toMatchObject({ instanceUrl: "https://flag.example", token: "flag-token" });
  });
});
