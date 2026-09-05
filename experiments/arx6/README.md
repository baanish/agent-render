# ARX6: frozen native-frame codec experiment

**Draft research import, not viewer support.** Nothing here registers `arx6` in the
application schema, adds a picker option, changes automatic selection, or changes
any historical decoder. The laboratory `#g1L...` wire does **not** open in the
current viewer. Do not distribute it as a supported share link.

This is the general ARX6 candidate from the first research pass. The second-pass
reconstruction-program / dependency-order experiments are deliberately excluded:
they did not earn a general-purpose default.

## Run the conformance checks

From the repository root, with Node 22:

```sh
node experiments/arx6/check.mjs
```

This command needs no installed packages and makes no network requests. It reads
the existing three dictionary/prior assets from `public/`; no new corpus is
trained or downloaded. The same 16 cases are registered with the normal Vitest
suite in `tests/arx6-core.test.ts`:

```sh
npx vitest run tests/arx6-core.test.ts
```

The tests cover implementation hashes, CRC32, all UTF-16 code units, lone
surrogates, exact whitespace/control preservation, bounded framing, all three
prior identities, immutable prior copies, bundles/diff metadata, seeded random
round trips, truncation/corruption, decoded limits, and byte-preserving fallback.

## Compare against the actual production baseline

After the usual `npm ci`, supply a JSON array of `{ "id": "...", "envelope": ... }`
samples. Each envelope must satisfy the existing application schema.

```sh
node --import tsx experiments/arx6/bench.mts corpus.json > arx6-comparison.json
```

The benchmark loads the existing pinned assets, normalizes each envelope, calls
**the complete production `encodeEnvelopeAsync` auto pool** with transport
budgeting, and uses the real Markdown-link formatter. It verifies both the
baseline envelope and experimental tuple round trips. Every header, checksum,
base URL, and Markdown character is counted. Losses and oversized candidates
retain the original baseline wire, byte for byte. It emits measurements and
hashes, not unsupported viewer links.

This production-baseline runner was added for this PR but has **not been executed
in the authoring environment**, which could not clone the repository or install
its npm dependencies. Do not substitute the historical research scores for its
results. The dependency-free conformance command was executed: **16/16 passed**.
The original, larger prototype suite was also rerun separately: **20/20 passed**.

## What is frozen

`src/cm6.mjs`, `src/native-frame.mjs`, `src/arx6-core.mjs`, and its `.d.mts` are copied
byte-for-byte from the evaluated prototype. Keep the wire-affecting code frozen;
a model/representation/prior change needs a new version and compatibility plan,
not a casual golden update. The source-hash test intentionally detects even
formatting changes. If a later cleanup changes formatting only, document it and
also prove unchanged wire vectors before replacing these source pins.

`runtime.mjs` is Node-only laboratory glue. It reproduces the ARX2 tuple mapping
without modifying or importing private production helpers. Application
integration should expose/reuse the canonical production tuple helpers instead
of maintaining this duplicate mapping indefinitely.

The browser-safe core returns **unknown tuples**, not validated application
envelopes. It is not an alternative to schema validation. CRC32 detects accidental
corruption, not malicious tampering or secret disclosure. Its 8,192-character
budget includes `#`; the current application budgets fragment bodies, so the
one-character boundary must be reconciled during integration.

See [research notes](../../docs/arx6-research.md) for the qualified measurements
and the uncompleted deployment gates.
