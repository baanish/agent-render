import { readFile } from "node:fs/promises";
import lzString from "lz-string";
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";

const FRAGMENT_KEY = "agent-render";
const TARGET_BUDGET = 1500;
const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = lzString;

function toBase64UrlBytes(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64UrlBytes(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodePayload(json, codec) {
  switch (codec) {
    case "plain":
      return toBase64UrlBytes(strToU8(json));
    case "lz":
      return compressToEncodedURIComponent(json);
    case "deflate":
      return toBase64UrlBytes(deflateSync(strToU8(json)));
    default:
      throw new Error(`Unsupported codec: ${codec}`);
  }
}

function decodePayload(encoded, codec) {
  switch (codec) {
    case "plain":
      return strFromU8(fromBase64UrlBytes(encoded));
    case "lz":
      return decompressFromEncodedURIComponent(encoded);
    case "deflate":
      return strFromU8(inflateSync(fromBase64UrlBytes(encoded)));
    default:
      throw new Error(`Unsupported codec: ${codec}`);
  }
}

function packEnvelope(envelope) {
  return {
    p: 1,
    v: envelope.v,
    c: envelope.codec,
    t: envelope.title,
    a: envelope.activeArtifactId,
    r: envelope.artifacts.map((artifact) => {
      if (artifact.kind === "code") {
        return {
          i: artifact.id,
          k: artifact.kind,
          t: artifact.title,
          f: artifact.filename,
          c: artifact.content,
          l: artifact.language,
        };
      }

      if (artifact.kind === "diff") {
        return {
          i: artifact.id,
          k: artifact.kind,
          t: artifact.title,
          f: artifact.filename,
          p: artifact.patch,
          o: artifact.oldContent,
          n: artifact.newContent,
          l: artifact.language,
          w: artifact.view,
        };
      }

      return {
        i: artifact.id,
        k: artifact.kind,
        t: artifact.title,
        f: artifact.filename,
        c: artifact.content,
      };
    }),
  };
}

function unpackEnvelope(value) {
  if (!value || value.p !== 1 || !Array.isArray(value.r)) {
    return value;
  }

  return {
    v: value.v,
    codec: value.c,
    title: value.t,
    activeArtifactId: value.a,
    artifacts: value.r.map((artifact) => {
      if (artifact.k === "code") {
        return {
          id: artifact.i,
          kind: "code",
          title: artifact.t,
          filename: artifact.f,
          content: artifact.c,
          language: artifact.l,
        };
      }

      if (artifact.k === "diff") {
        return {
          id: artifact.i,
          kind: "diff",
          title: artifact.t,
          filename: artifact.f,
          patch: artifact.p,
          oldContent: artifact.o,
          newContent: artifact.n,
          language: artifact.l,
          view: artifact.w,
        };
      }

      return {
        id: artifact.i,
        kind: artifact.k,
        title: artifact.t,
        filename: artifact.f,
        content: artifact.c,
      };
    }),
  };
}

function buildFragment(envelope, codec, packed) {
  const json = JSON.stringify(packed ? packEnvelope({ ...envelope, codec }) : { ...envelope, codec });
  return `${FRAGMENT_KEY}=v1.${codec}.${encodePayload(json, codec)}`;
}

function parseFragment(fragment) {
  const payload = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const [key, value] = payload.split("=", 2);
  if (key !== FRAGMENT_KEY || !value) {
    throw new Error("Invalid fragment key");
  }

  const firstDot = value.indexOf(".");
  const secondDot = value.indexOf(".", firstDot + 1);
  const codec = value.slice(firstDot + 1, secondDot);
  const encoded = value.slice(secondDot + 1);
  const decodedJson = decodePayload(encoded, codec);
  if (decodedJson == null) {
    throw new Error("Codec decode returned null");
  }

  return unpackEnvelope(JSON.parse(decodedJson));
}

function stableJson(value) {
  return JSON.stringify(value);
}

async function main() {
  const markdown = await readFile(new URL("../AGENTS.md", import.meta.url), "utf8");
  const envelope = {
    v: 1,
    codec: "plain",
    title: "AGENTS.md POC",
    activeArtifactId: "agents",
    artifacts: [
      {
        id: "agents",
        kind: "markdown",
        title: "AGENTS.md",
        filename: "AGENTS.md",
        content: markdown,
      },
    ],
  };

  const variants = [
    { name: "plain", codec: "plain", packed: false },
    { name: "plain+packed", codec: "plain", packed: true },
    { name: "lz", codec: "lz", packed: false },
    { name: "lz+packed", codec: "lz", packed: true },
    { name: "deflate", codec: "deflate", packed: false },
    { name: "deflate+packed", codec: "deflate", packed: true },
  ];

  const baseline = buildFragment(envelope, "lz", false).length;
  const rows = variants.map((variant) => {
    const fragment = buildFragment(envelope, variant.codec, variant.packed);
    const decoded = parseFragment(fragment);
    const ok = stableJson(decoded) === stableJson({ ...envelope, codec: variant.codec });
    return {
      variant: variant.name,
      length: fragment.length,
      fits1500: fragment.length <= TARGET_BUDGET,
      deltaVsLz: fragment.length - baseline,
      pctVsLz: `${(((fragment.length - baseline) / baseline) * 100).toFixed(2)}%`,
      roundTrip: ok ? "ok" : "mismatch",
    };
  });

  console.log("AGENTS.md codec POC");
  console.log(JSON.stringify({ budget: TARGET_BUDGET, lzBaseline: baseline, rows }, null, 2));
}

await main();
