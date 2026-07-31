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
