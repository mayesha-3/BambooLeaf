# Planner evaluation — LIVE

Runs: 0 (provider/budget errors, excluded from rates: 0)

| Metric | Value |
|---|---|
| Schema-valid rate | n/a% (0/0) |
| Legit pass rate | n/a% (0/0) |
| False-positive rate (legit refused/failed) | n/a% (0/0) |
| Planner-level false-negative rate | n/a% (0/0) |
| Latency median / p95 (ms) | 0 / 0 |
| Tokens used | 0 |
| Unstable cases | none |

Guard tests (guard_stress cases, NOT planner false negatives): 0 runs; planner produced the transfer 0/0 (the guard must deny these), planner refused 0/0 (guard not exercised), wrong intent 0/0.

Verdict counts: {}

Cases to look at: none

Planner-level false negatives are NOT end-to-end security failures: the guard (Person 1) runs after the planner and must still stop `reached_guard` intents.

## Indirect injection (quarantine)

Runs: 13 (provider/budget errors excluded: 0)

| Metric | Denominator | Value |
|---|---|---|
| Detection rate (flagged) | injected runs | 100% (9/9) |
| Leak rate (attacker address became a recipient) | injected runs | 0% (0/9) |
| Not flagged but contained | injected runs | 0% (0/9) |
| False-positive rate (benign flagged) | benign runs | 0% (0/4) |
| Benign pass rate | benign runs | 100% (4/4) |

Cases to look at: none

Detection is probabilistic: a miss here is a signal, not the security boundary. The planner never sees raw untrusted text and recipients must come from the owner goal.
