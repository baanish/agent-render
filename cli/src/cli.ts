import { readFile } from "node:fs/promises";
import path from "node:path";
import { stdin as defaultStdin } from "node:process";
import { getConfigValue, resolveConfig, setConfigValue } from "./config";
import { buildPayloadEnvelope, type ArtifactInput } from "./envelope";
import { assertEnvelopeWithinBudget, assertFragmentBudget, createFragmentUrl, encodePayloadEnvelope } from "./encoding";
import { formatArtifactOutput, type OutputFormat } from "./format";
import { createInstanceArtifact } from "./instance";
import type { RequestedKind } from "./kind";

type Mode = "auto" | "instance" | "fragment";

type CreateOptions = {
  files: string[];
  kind: RequestedKind;
  title?: string;
  mode: Mode;
  format: OutputFormat;
  stdin: boolean;
  json: boolean;
  instanceUrl?: string;
  token?: string;
};

// `.html` files auto-detect as code (source view); kit rendering is an explicit `--kind html` so
// arbitrary HTML files are never silently reinterpreted. `--kind choices` reads a JSON document
// shaped {"prompt"?, "multi"?, "options": [{"id", "label", "detail"?}]}.
const KINDS = new Set<RequestedKind>(["auto", "markdown", "code", "diff", "csv", "json", "html", "choices"]);
const MODES = new Set<Mode>(["auto", "instance", "fragment"]);
const FORMATS = new Set<OutputFormat>(["url", "markdown", "discord", "slack", "plain"]);
const DEFAULT_VIEWER_URL = "https://agent-render.com/";

function requireOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

function parseChoice<T extends string>(value: string, choices: Set<T>, option: string): T {
  if (!choices.has(value as T)) {
    throw new Error(`Invalid ${option} value "${value}". Expected one of: ${[...choices].join(", ")}.`);
  }
  return value as T;
}

function parseCreateOptions(args: string[]): CreateOptions {
  const options: CreateOptions = {
    files: [],
    kind: "auto",
    mode: "auto",
    format: "url",
    stdin: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith("--")) {
      options.files.push(arg);
      continue;
    }
    if (arg === "--stdin") options.stdin = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--kind") options.kind = parseChoice(requireOptionValue(args, index++, arg), KINDS, arg);
    else if (arg === "--title") options.title = requireOptionValue(args, index++, arg);
    else if (arg === "--mode") options.mode = parseChoice(requireOptionValue(args, index++, arg), MODES, arg);
    else if (arg === "--format") options.format = parseChoice(requireOptionValue(args, index++, arg), FORMATS, arg);
    else if (arg === "--instance-url") options.instanceUrl = requireOptionValue(args, index++, arg);
    else if (arg === "--token") options.token = requireOptionValue(args, index++, arg);
    else throw new Error(`Unknown option "${arg}".`);
  }

  if (options.stdin && options.files.length > 0) throw new Error("--stdin cannot be combined with file paths.");
  if (!options.stdin && options.files.length === 0) throw new Error("Provide at least one file or use --stdin.");
  if (options.stdin && options.kind === "auto") throw new Error("--kind is required with --stdin.");
  return options;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of defaultStdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readInputs(options: CreateOptions): Promise<ArtifactInput[]> {
  if (options.stdin) {
    return [{ filename: options.title?.trim() || "stdin", content: await readStdin() }];
  }
  return Promise.all(options.files.map(async (filename) => ({
    filename,
    content: await readFile(filename, "utf8"),
  })));
}

function getOutputLabel(options: CreateOptions, inputs: ArtifactInput[]): string {
  return options.title?.trim() || (inputs.length === 1 ? path.basename(inputs[0]!.filename) : `${inputs.length} artifacts`);
}

async function runCreate(args: string[]): Promise<void> {
  const options = parseCreateOptions(args);
  const inputs = await readInputs(options);
  const envelope = buildPayloadEnvelope(inputs, options.kind, options.title);
  assertEnvelopeWithinBudget(envelope);
  const config = await resolveConfig({ instanceUrl: options.instanceUrl, token: options.token });
  const mode: Exclude<Mode, "auto"> = options.mode === "auto"
    ? (config.instanceUrl ? "instance" : "fragment")
    : options.mode;
  const label = getOutputLabel(options, inputs);
  let url: string;
  let markdownUrl: string;

  if (mode === "instance") {
    if (!config.instanceUrl) throw new Error("Instance mode requires INSTANCE_URL configuration.");
    url = await createInstanceArtifact(envelope, config.instanceUrl, config.token);
    markdownUrl = url;
  } else {
    const encoded = await encodePayloadEnvelope(envelope);
    assertFragmentBudget(encoded.fragmentBody);
    url = createFragmentUrl(DEFAULT_VIEWER_URL, encoded.fragmentBody);
    // The markdown surface is a different candidate (selected by percent-escaped length), so it
    // carries its own visible length and needs its own budget check: the viewer enforces the visible
    // budget on whatever fragment it opens, so an unchecked link here could render "too-large" for a
    // payload whose --format url link works.
    if (encoded.transportFragmentBody === encoded.fragmentBody) {
      markdownUrl = url;
    } else {
      assertFragmentBudget(encoded.transportFragmentBody);
      markdownUrl = createFragmentUrl(DEFAULT_VIEWER_URL, encoded.transportFragmentBody);
    }
  }

  const formatted = formatArtifactOutput(options.format, label, url, markdownUrl);
  if (formatted.warning) process.stderr.write(`${formatted.warning}\n`);
  if (options.json) {
    const bytes = inputs.reduce((total, input) => total + Buffer.byteLength(input.content), 0);
    process.stdout.write(`${JSON.stringify({ url, mode, bytes, warning: formatted.warning })}\n`);
  } else {
    process.stdout.write(`${formatted.text}\n`);
  }
}

async function runConfig(args: string[]): Promise<void> {
  const [operation, key, value, ...rest] = args;
  if (rest.length > 0 || !operation || !key) {
    throw new Error("Usage: agent-render config set KEY VALUE | agent-render config get KEY");
  }
  if (operation === "set") {
    if (value === undefined) throw new Error("Usage: agent-render config set KEY VALUE");
    const configPath = await setConfigValue(key, value);
    process.stderr.write(`Updated ${configPath}\n`);
    return;
  }
  if (operation === "get") {
    if (value !== undefined) throw new Error("Usage: agent-render config get KEY");
    const stored = await getConfigValue(key);
    if (stored === undefined) throw new Error(`Config key "${key}" is not set.`);
    process.stdout.write(`${stored}\n`);
    return;
  }
  throw new Error(`Unknown config operation "${operation}". Expected set or get.`);
}

/** Runs the agent-render command-line interface. */
export async function runCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  if (command === "create") return runCreate(rest);
  if (command === "config") return runConfig(rest);
  throw new Error("Usage: agent-render create [files...] [options] | agent-render config set|get ...");
}
