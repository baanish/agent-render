# Fragment codec token benchmark

This benchmark reuses the corpus from `scripts/bench-codecs.mjs`. It measures the compact fragment body (codec tag plus payload), uses agent-render's conservative percent-escaped transport metric, and tokenizes with `gpt-tokenizer`'s `o200k_base` encoding.

ARX and ARX2 report the wire selected by the current transport-length policy. ARX3 and ARX4 report matched base64url and baseBMP variants produced from the same compressed/coded bytes. The o200k_base counts are directional for Claude tokenizers.

| sample | kind | codec | wire | visible fragment chars | percent-encoded transport chars | o200k_base tokens |
|---|---|---|---|---:|---:|---:|
| markdown-agents | markdown | plain | base64url | 11116 | 11116 | 7229 |
| markdown-agents | markdown | lz | uri-safe | 4068 | 4154 | 2709 |
| markdown-agents | markdown | deflate | base64url | 733 | 733 | 503 |
| markdown-agents | markdown | arx | base64url | 547 | 547 | 368 |
| markdown-agents | markdown | arx2 | base64url | 538 | 538 | 371 |
| markdown-agents | markdown | arx3 | base64url | 538 | 538 | 371 |
| markdown-agents | markdown | arx3 | baseBMP | 206 | 1825 | 482 |
| markdown-agents | markdown | arx4 | base64url | 440 | 440 | 300 |
| markdown-agents | markdown | arx4 | baseBMP | 170 | 1475 | 380 |
| code-bench-report | markdown | plain | base64url | 11468 | 11468 | 7421 |
| code-bench-report | markdown | lz | uri-safe | 5669 | 5767 | 3835 |
| code-bench-report | markdown | deflate | base64url | 3703 | 3703 | 2484 |
| code-bench-report | markdown | arx | base64url | 2987 | 2987 | 2002 |
| code-bench-report | markdown | arx2 | base64url | 2962 | 2962 | 1993 |
| code-bench-report | markdown | arx3 | base64url | 2962 | 2962 | 1993 |
| code-bench-report | markdown | arx3 | baseBMP | 1120 | 9976 | 2593 |
| code-bench-report | markdown | arx4 | base64url | 2572 | 2572 | 1722 |
| code-bench-report | markdown | arx4 | baseBMP | 973 | 8660 | 2281 |
| code-fragment | code | plain | base64url | 11281 | 11281 | 7345 |
| code-fragment | code | lz | uri-safe | 3471 | 3561 | 2364 |
| code-fragment | code | deflate | base64url | 679 | 679 | 478 |
| code-fragment | code | arx | base64url | 530 | 530 | 355 |
| code-fragment | code | arx2 | base64url | 521 | 521 | 358 |
| code-fragment | code | arx3 | base64url | 521 | 521 | 358 |
| code-fragment | code | arx3 | baseBMP | 199 | 1759 | 456 |
| code-fragment | code | arx4 | base64url | 463 | 463 | 304 |
| code-fragment | code | arx4 | baseBMP | 178 | 1565 | 421 |
| diff-patch | diff | plain | base64url | 2264 | 2264 | 1526 |
| diff-patch | diff | lz | uri-safe | 762 | 774 | 518 |
| diff-patch | diff | deflate | base64url | 239 | 239 | 165 |
| diff-patch | diff | arx | base64url | 175 | 175 | 117 |
| diff-patch | diff | arx2 | base64url | 154 | 154 | 108 |
| diff-patch | diff | arx3 | base64url | 154 | 154 | 108 |
| diff-patch | diff | arx3 | baseBMP | 61 | 529 | 146 |
| diff-patch | diff | arx4 | base64url | 110 | 110 | 76 |
| diff-patch | diff | arx4 | baseBMP | 45 | 383 | 102 |
| diff-pair | diff | plain | base64url | 5516 | 5516 | 3638 |
| diff-pair | diff | lz | uri-safe | 799 | 819 | 553 |
| diff-pair | diff | deflate | base64url | 208 | 208 | 136 |
| diff-pair | diff | arx | base64url | 138 | 138 | 86 |
| diff-pair | diff | arx2 | base64url | 126 | 126 | 85 |
| diff-pair | diff | arx3 | base64url | 126 | 126 | 85 |
| diff-pair | diff | arx3 | baseBMP | 51 | 439 | 111 |
| diff-pair | diff | arx4 | base64url | 80 | 80 | 55 |
| diff-pair | diff | arx4 | baseBMP | 34 | 281 | 67 |
| csv-grid | csv | plain | base64url | 9331 | 9331 | 5964 |
| csv-grid | csv | lz | uri-safe | 2246 | 2304 | 1514 |
| csv-grid | csv | deflate | base64url | 1699 | 1699 | 1134 |
| csv-grid | csv | arx | base64url | 842 | 842 | 564 |
| csv-grid | csv | arx2 | base64url | 834 | 834 | 582 |
| csv-grid | csv | arx3 | base64url | 834 | 834 | 582 |
| csv-grid | csv | arx3 | baseBMP | 317 | 2809 | 734 |
| csv-grid | csv | arx4 | base64url | 1015 | 1015 | 671 |
| csv-grid | csv | arx4 | baseBMP | 386 | 3428 | 901 |
| json-package | json | plain | base64url | 1199 | 1199 | 748 |
| json-package | json | lz | uri-safe | 695 | 703 | 453 |
| json-package | json | deflate | base64url | 516 | 516 | 349 |
| json-package | json | arx | base64url | 463 | 463 | 321 |
| json-package | json | arx2 | base64url | 431 | 431 | 286 |
| json-package | json | arx3 | base64url | 431 | 431 | 286 |
| json-package | json | arx3 | baseBMP | 166 | 1462 | 385 |
| json-package | json | arx4 | base64url | 404 | 404 | 266 |
| json-package | json | arx4 | baseBMP | 156 | 1370 | 355 |
| multi-bundle | bundle | plain | base64url | 34103 | 34103 | 22208 |
| multi-bundle | bundle | lz | uri-safe | 12018 | 12264 | 8132 |
| multi-bundle | bundle | deflate | base64url | 2411 | 2411 | 1619 |
| multi-bundle | bundle | arx | base64url | 1759 | 1759 | 1188 |
| multi-bundle | bundle | arx2 | base64url | 1674 | 1674 | 1158 |
| multi-bundle | bundle | arx3 | base64url | 1674 | 1674 | 1158 |
| multi-bundle | bundle | arx3 | baseBMP | 634 | 5641 | 1508 |
| multi-bundle | bundle | arx4 | base64url | 1635 | 1635 | 1089 |
| multi-bundle | bundle | arx4 | baseBMP | 620 | 5507 | 1448 |

## Conclusions

BaseBMP loses to base64url on o200k_base tokens on average. Across 16 matched ARX3/ARX4 sample pairs, baseBMP uses 31.15% more tokens on average (184.1 more tokens per fragment).

The worst case is code-fragment with arx4: baseBMP uses 38.49% more tokens (117 tokens) than base64url.

Token-optimal codec/wire combination per sample kind (summing samples when a kind has more than one fixture):

- markdown: arx4/base64url (2022 tokens)
- code: arx4/base64url (304 tokens)
- diff: arx4/base64url (131 tokens)
- csv: arx/base64url (564 tokens)
- json: arx4/base64url (266 tokens)
- bundle: arx4/base64url (1089 tokens)

These o200k_base counts are directional, not exact, for Claude tokenizers.
