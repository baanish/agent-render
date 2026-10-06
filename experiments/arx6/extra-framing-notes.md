# Additional framing experiments

Reference: `5d82b9f`. These experiments retain `Arx6V2ContextModel`, the frozen
dictionary/curated-prior bytes, the kind-prior-versus-`n` policy, WTF-8, and the CRC32
fraction framing. They use only the existing 52-case diagnostic corpus. The fresh
validation corpus was not evaluated for these candidates.

| Candidate | Fragment characters | Change | Wins / ties / losses |
| --- | ---: | ---: | ---: |
| Existing ARX6 v2 | 29,045 | — | — |
| Exact arithmetic midpoint | 29,028 | −0.0585% | 12 / 35 / 5 |
| JSON metadata before bodies | 29,052 | +0.0241% | 25 / 8 / 19 |
| Binary metadata before bodies | 28,805 | −0.8263% | 39 / 2 / 11 |
| Optional metadata `null` → `0` | 29,040 | −0.0172% | 3 / 47 / 2 |

The midpoint candidate computes `floor(range * probability / 4096)` rather than
`floor(range / 4096) * probability`. Its product stays below 2^44, so JavaScript
represents it exactly. This removes interval quantization error, but its measured
gain does not justify another arithmetic-wire version.

Both metadata-first candidates keep artifact bodies unchanged. The binary form
uses definite-length CBOR-style integer, array, and string headers with WTF-8
strings. It saves metadata punctuation but loses some useful text-model contexts:
one metadata-heavy case grows by 49 characters. This is an experimental serializer,
not a production CBOR parser. Both forms would need a new container version.

The final candidate replaces only optional string metadata's ignored `null`
placeholders with `0`; it preserves body-length slots and the validated diff-view
slot. The existing decoder reconstructs the identical envelope. Its five-character
aggregate saving does not warrant adding another full-model encoding pass.

All four candidates are rejected or deferred. Published `g2` remains unchanged.
The results count complete fragment bodies including their three-character header;
adding the same URL and Markdown wrapper to every candidate would reduce the
reported relative differences. Incompatible candidates use the same header size
and checksum salt solely to isolate the experiment; the script emits no viewer
links. Timings were collected during parallel diagnostics and are not performance
evidence.

`extra-framing-results.json` contains every row, the production/model/asset/test
source hashes, the corpus hash, and aggregate comparisons. Every arithmetic byte
stream round-tripped. Separate checks over all 52 cases verified that metadata
reordering and binary metadata invert exactly and that the zero-placeholder
candidate reconstructs the same envelope.

Reproduce against the recorded source hashes:

```sh
node experiments/arx6/extra-framing-ablation.mjs \
  experiments/arx6/corpora/diagnostic.json /tmp/framing-results.json
```

To run only the reversible-container checks, append `check` after the output path.
The script reads the current checkout and records its hashes, so results from later
model or prior changes remain distinguishable from this reference.
