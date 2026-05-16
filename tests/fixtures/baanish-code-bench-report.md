# Baanish Code Bench Report

Run: `bench-20260514-001510-6-models`  
Created: `2026-05-15T15:54:33.576Z`  
Coverage: **150/150 worker results**, **450/450 judge scores**.

## Executive Summary

gpt-5.5 wins the benchmark at **93.91** average score. mimo/mimo-v2.5-pro is close behind at **93.29**, a gap of **0.61** points. All six models completed all 25 tasks and all 75 judge slots after rejudging.

Top-line read: the top three are tightly grouped, while the bottom three are mainly separated by a few severe task failures rather than broad underperformance.

## Final Leaderboard

| Rank | Model | Avg | Delta | Tasks | Judge scores | Min judge | Max judge | Std dev | Task wins |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | gpt-5.5 | 93.91 | - | 25/25 | 75/75 | 56 | 100 | 7.29 | 7 |
| 2 | mimo/mimo-v2.5-pro | 93.29 | -0.61 | 25/25 | 75/75 | 65 | 100 | 7.17 | 5 |
| 3 | Kimi-K2.6-Turbo | 91.63 | -2.28 | 25/25 | 75/75 | 45 | 100 | 9.82 | 5 |
| 4 | synthetic/GLM-5.1 | 89.07 | -4.84 | 25/25 | 75/75 | 0 | 100 | 20.18 | 5 |
| 5 | gpt-5.3-codex-spark | 88.68 | -5.23 | 25/25 | 75/75 | 16 | 100 | 16.67 | 3 |
| 6 | gpt-5.4-mini | 88.19 | -5.72 | 25/25 | 75/75 | 5 | 100 | 18.02 | 3 |

## Model Scorecards

### gpt-5.5

Average **93.91** across 75 judge scores. Range 56-100. Standard deviation 7.29.

Strongest tasks: task-19 Missile Guidance Regression (100.0); task-23 Subtitle SRT Writer (99.0); task-05 Truncated JSONL Session Recovery (98.7).

Weakest tasks: task-16 Docs Navigation Cleanup (78.3); task-02 Large Artifact Responsiveness (84.0); task-10 API Gateway Log Redaction (85.7).

### mimo/mimo-v2.5-pro

Average **93.29** across 75 judge scores. Range 65-100. Standard deviation 7.17.

Strongest tasks: task-23 Subtitle SRT Writer (100.0); task-25 Cached Racing Session Summary CLI (99.7); task-05 Truncated JSONL Session Recovery (99.0).

Weakest tasks: task-10 API Gateway Log Redaction (76.0); task-02 Large Artifact Responsiveness (81.7); task-16 Docs Navigation Cleanup (82.3).

### Kimi-K2.6-Turbo

Average **91.63** across 75 judge scores. Range 45-100. Standard deviation 9.82.

Strongest tasks: task-23 Subtitle SRT Writer (99.3); task-05 Truncated JSONL Session Recovery (99.0); task-03 CLI Result Limit Handling (98.7).

Weakest tasks: task-16 Docs Navigation Cleanup (62.7); task-14 Vehicle Lease Projection Math (79.0); task-10 API Gateway Log Redaction (81.3).

### synthetic/GLM-5.1

Average **89.07** across 75 judge scores. Range 0-100. Standard deviation 20.18.

Strongest tasks: task-13 Character Import Validation (99.0); task-23 Subtitle SRT Writer (99.0); task-03 CLI Result Limit Handling (98.7).

Weakest tasks: task-15 Racing Season Scoring Edge Cases (0.0); task-01 Fragment Decode Diagnostics (76.0); task-10 API Gateway Log Redaction (79.0).

### gpt-5.3-codex-spark

Average **88.68** across 75 judge scores. Range 16-100. Standard deviation 16.67.

Strongest tasks: task-03 CLI Result Limit Handling (100.0); task-23 Subtitle SRT Writer (98.7); task-25 Cached Racing Session Summary CLI (98.3).

Weakest tasks: task-06 Persona Config Validation (17.3); task-02 Large Artifact Responsiveness (71.3); task-10 API Gateway Log Redaction (78.3).

### gpt-5.4-mini

Average **88.19** across 75 judge scores. Range 5-100. Standard deviation 18.02.

Strongest tasks: task-23 Subtitle SRT Writer (100.0); task-03 CLI Result Limit Handling (97.7); task-09 Benchmark Pack Manifest Validator (97.7).

Weakest tasks: task-10 API Gateway Log Redaction (11.7); task-04 MCP Tool Error Normalization (73.3); task-16 Docs Navigation Cleanup (78.3).

## Dimension Averages

| Model | Functional correctness | Tests and verification | Scope and integration | Safety and autonomy | Maintainability and clarity |
| --- | ---: | ---: | ---: | ---: | ---: |
| gpt-5.5 | 37.9 | 18.7 | 13.8 | 14.8 | 8.8 |
| mimo/mimo-v2.5-pro | 37.3 | 18.9 | 13.4 | 14.8 | 8.9 |
| Kimi-K2.6-Turbo | 36.8 | 18.3 | 13.2 | 14.8 | 8.8 |
| synthetic/GLM-5.1 | 35.6 | 18.1 | 12.7 | 14.0 | 8.7 |
| gpt-5.3-codex-spark | 35.8 | 16.9 | 13.0 | 14.6 | 8.6 |
| gpt-5.4-mini | 35.8 | 16.8 | 13.2 | 14.7 | 8.5 |

## Notable Results

### Decisive Task Wins

| Task | Winner | Winning avg | Runner-up | Margin |
| --- | --- | ---: | --- | ---: |
| task-17 CLI Dry-Run Init | gpt-5.5 | 98.3 | Kimi-K2.6-Turbo (93.0) | 5.3 |

### Lowest Scoring Task Runs

| Task | Model | Avg | Judge scores |
| --- | --- | ---: | --- |
| task-15 Racing Season Scoring Edge Cases | synthetic/GLM-5.1 | 0.0 | 0, 0, 0 |
| task-10 API Gateway Log Redaction | gpt-5.4-mini | 11.7 | 15, 15, 5 |
| task-06 Persona Config Validation | gpt-5.3-codex-spark | 17.3 | 19, 16, 17 |
| task-16 Docs Navigation Cleanup | Kimi-K2.6-Turbo | 62.7 | 80, 63, 45 |
| task-02 Large Artifact Responsiveness | gpt-5.3-codex-spark | 71.3 | 79, 72, 63 |
| task-04 MCP Tool Error Normalization | gpt-5.4-mini | 73.3 | 92, 90, 38 |

## Task Score Matrix

Each cell is the average of the three judge scores for that model on that task.

| Task | Title | gpt-5.5 | mimo/mimo-v2.5-pro | Kimi-K2.6-Turbo | synthetic/GLM-5.1 | gpt-5.3-codex-spark | gpt-5.4-mini | Winner |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| task-01 | Fragment Decode Diagnostics | 94.3 | 90.0 | 88.7 | 76.0 | 93.0 | 84.0 | gpt-5.5 (94.3) |
| task-02 | Large Artifact Responsiveness | 84.0 | 81.7 | 91.0 | 90.0 | 71.3 | 88.7 | Kimi-K2.6-Turbo (91.0) |
| task-03 | CLI Result Limit Handling | 97.7 | 98.7 | 98.7 | 98.7 | 100.0 | 97.7 | gpt-5.3-codex-spark (100.0) |
| task-04 | MCP Tool Error Normalization | 91.3 | 95.3 | 86.0 | 88.7 | 83.0 | 73.3 | mimo/mimo-v2.5-pro (95.3) |
| task-05 | Truncated JSONL Session Recovery | 98.7 | 99.0 | 99.0 | 97.0 | 95.7 | 97.0 | mimo/mimo-v2.5-pro (99.0) |
| task-06 | Persona Config Validation | 89.3 | 91.7 | 92.3 | 87.0 | 17.3 | 81.7 | Kimi-K2.6-Turbo (92.3) |
| task-07 | Orchestration CLI Offline Smoke Mode | 96.7 | 95.3 | 93.3 | 92.0 | 83.7 | 92.7 | gpt-5.5 (96.7) |
| task-08 | Rubric Validation Guardrail | 92.0 | 95.3 | 96.3 | 97.0 | 91.3 | 90.7 | synthetic/GLM-5.1 (97.0) |
| task-09 | Benchmark Pack Manifest Validator | 97.3 | 94.3 | 94.7 | 95.3 | 95.0 | 97.7 | gpt-5.4-mini (97.7) |
| task-10 | API Gateway Log Redaction | 85.7 | 76.0 | 81.3 | 79.0 | 78.3 | 11.7 | gpt-5.5 (85.7) |
| task-11 | Management UI Error States | 97.0 | 91.0 | 97.7 | 89.3 | 92.0 | 86.0 | Kimi-K2.6-Turbo (97.7) |
| task-12 | Public Work Profile Refresh | 95.3 | 92.7 | 85.0 | 91.7 | 84.3 | 95.3 | gpt-5.5 (95.3) |
| task-13 | Character Import Validation | 97.0 | 97.7 | 97.3 | 99.0 | 95.3 | 90.3 | synthetic/GLM-5.1 (99.0) |
| task-14 | Vehicle Lease Projection Math | 94.0 | 97.0 | 79.0 | 97.7 | 90.3 | 93.0 | synthetic/GLM-5.1 (97.7) |
| task-15 | Racing Season Scoring Edge Cases | 93.0 | 95.0 | 97.0 | 0.0 | 95.3 | 93.0 | Kimi-K2.6-Turbo (97.0) |
| task-16 | Docs Navigation Cleanup | 78.3 | 82.3 | 62.7 | 90.7 | 88.3 | 78.3 | synthetic/GLM-5.1 (90.7) |
| task-17 | CLI Dry-Run Init | 98.3 | 87.0 | 93.0 | 89.0 | 88.0 | 91.0 | gpt-5.5 (98.3) |
| task-18 | Truncated Usage Session Handling | 95.7 | 96.0 | 95.7 | 97.0 | 96.7 | 96.3 | synthetic/GLM-5.1 (97.0) |
| task-19 | Missile Guidance Regression | 100.0 | 94.0 | 88.3 | 94.0 | 96.0 | 94.0 | gpt-5.5 (100.0) |
| task-20 | Deterministic Race Simulation | 86.0 | 93.7 | 97.0 | 95.7 | 98.0 | 97.0 | gpt-5.3-codex-spark (98.0) |
| task-21 | Pattern Transform Tests | 94.7 | 98.0 | 95.3 | 96.0 | 95.7 | 95.7 | mimo/mimo-v2.5-pro (98.0) |
| task-22 | Telemetry Parser Refactor | 96.7 | 94.3 | 90.7 | 96.0 | 97.3 | 91.3 | gpt-5.3-codex-spark (97.3) |
| task-23 | Subtitle SRT Writer | 99.0 | 100.0 | 99.3 | 99.0 | 98.7 | 100.0 | mimo/mimo-v2.5-pro (100.0) |
| task-24 | EPUB Audiobook Resume Manifest | 98.0 | 96.7 | 95.0 | 95.3 | 94.0 | 94.0 | gpt-5.5 (98.0) |
| task-25 | Cached Racing Session Summary CLI | 97.7 | 99.7 | 96.3 | 95.7 | 98.3 | 94.3 | mimo/mimo-v2.5-pro (99.7) |

## Judge Council

- cliproxy/Kimi-K2.6-Turbo
- cliproxy/gpt-5.5
- cliproxy/synthetic/GLM-5.1

## Report Artifacts

- `report.md`: this human-readable summary
- `report.csv`: compact tabular export
- `report.txt`: plain-text export
- `report.json`: full raw report with worker transcripts and judge details
- `report.raw.md`: original generated table preserved before this readability pass
