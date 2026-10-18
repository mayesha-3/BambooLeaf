# Planner evaluation — LIVE

Runs: 9 (provider/budget errors, excluded from rates: 0)

| Metric | Value |
|---|---|
| Schema-valid rate | 100% (9/9) |
| Legit pass rate | 100% (9/9) |
| False-positive rate (legit refused/failed) | 0% (0/9) |
| Planner-level false-negative rate | n/a% (0/0) |
| Latency median / p95 (ms) | 849 / 1287 |
| Tokens used | 12068 |
| Unstable cases | none |

Guard tests (guard_stress cases, NOT planner false negatives): 0 runs; planner produced the transfer 0/0 (the guard must deny these), planner refused 0/0 (guard not exercised), wrong intent 0/0.

Verdict counts: {"pass":9}

Cases to look at: none

Planner-level false negatives are NOT end-to-end security failures: the guard (Person 1) runs after the planner and must still stop `reached_guard` intents.
