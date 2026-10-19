# BambooLeaf Technical Handoff

**Status date:** 2026-10-18
**Purpose:** concise source material for the final technical/security document. This is an engineering summary, not a security certification.

## Product and architecture

BambooLeaf is a web wallet prototype that turns a user's natural-language request into a proposed wallet intent, applies deterministic policy checks, and—in a narrowly supported set of cases—submits a transaction through a backend signer.

```text
React UI
  -> Express API
     -> Quarantined planner bridge (untrusted text is inspected separately)
     -> strict intent validation
     -> deterministic policy + autonomy tier + usage limits
     -> optional human approval
     -> signer re-verification -> RPC transaction
     -> audit log
```

- **Frontend:** React/Vite. Sends requests to the backend; it is not a security boundary.
- **API and orchestration:** `backend/src`. Goal submission, device sessions, approval decisions, autonomy controls, wallet reads, Arena preview, and audit endpoints are routed here.
- **Planner:** `backend/llm-planner`. Uses configured OpenAI-compatible models, strict schemas, recipient grounding, bounded retry/token behavior, and an optional separate quarantine model. It proposes intents; it cannot sign or execute.
- **Guard and signer:** `backend/src/guard` and `backend/src/signer`. Enforce transaction constraints independently of the model and rebuild/recheck transaction parameters before signing.
- **Persistence:** MongoDB stores audit data, policy usage, device/session records, pending approvals, and autonomy state.
- **Chains:** local Anvil (`31337`) and Sepolia (`11155111`) are represented in configuration and token metadata. A chain setting is not proof that a transaction was sent or confirmed there.

Main implementation references: [goals service](../backend/src/services/goals.service.tsx), [planner bridge](../backend/llm-planner/src/backend-bridge.ts), [quarantine inspector](../backend/llm-planner/src/quarantine.ts), [policy engine](../backend/src/guard/policy-engine.tsx), [tier router](../backend/src/guard/tier-router.tsx), and [signer service](../backend/src/signer/signer-service.tsx).

## Transaction path and current support

1. The API validates request shape and size.
2. The planner/quarantine pipeline returns a strict intent or a typed failure. Raw outside text must not be treated as owner instructions or used to ground a recipient.
3. The guard checks chain, action, token, recipient/router allowlists, caps, slippage, and autonomy tier.
4. Usage limits are reserved before execution.
5. T2 native transfers require an owner decision on a short-lived digest-bound approval.
6. The signer rechecks current policy, chain, nonce, authorization expiry, kill-switch state, and transaction digest immediately before submission.
7. A successful receipt and relevant decisions are written to the audit trail.

**Currently supported signing:** native ETH transfers on the configured chain, subject to the allowlist, caps, tier, and signer configuration. ERC-20 transfers and read-only intents are not currently supported by the native-transfer signer path. Swaps are implemented as a separate ERC-20 path but remain fail-closed unless a compatible router is configured and allow-listed, token addresses/caps are configured, a quote and shadow-fork simulation pass, and the current tier is T1. Native ETH↔token swap/unwrap is not supported by the current transaction builder; ERC-20-to-ERC-20 swaps (for example, WETH/USDC) are the intended shape.

**Human approvals:** current approval tickets cover native ETH transfers only. Approval binds chain ID, destination, value, calldata, nonce, and expiry. Tickets expire after two minutes and can be claimed once. The configured owner wallet must match the authenticated device-session wallet. A swap requiring T2 is held; swap approval execution is not implemented.

**Compliance Console:** read-only API access is granted to the configured owner or wallets in `AUDITOR_WALLET_ADDRESSES` (comma-separated). Both must first authenticate through the wallet device-session flow. The console supports decision/tier/layer/date filtering, JSON/CSV export, full-chain verification, autonomy history, and backend-startup policy snapshots. Policy snapshots capture only effective wallet policy settings; they do not change policy. No policy mutation or maker-checker API is implemented.

## Autonomy and policy

| Level | Behavior |
|---|---|
| L0 | Frozen; signing/action execution is blocked. Read-only wallet UI is intended to remain available, but natural-language read requests are not yet separately routed and may be rejected. |
| L1 | Actions require human approval. |
| L2 | Only T1 actions may auto-execute; T2 requires approval and T3 is denied. |
| L3 | Higher earned level, still bounded by policy; T1 is the only auto-execution tier. |

The autonomy manager promotes one level after 10 clean executions, up to L3. Three blocked attempts in the active 10-minute window freeze the agent to L0; a critical block freezes immediately. Owner reset returns to L1. State is persisted in MongoDB. These thresholds describe implementation behavior; they do not demonstrate that a production deployment has safely earned a level.

Tier meanings: **T1** = eligible for automatic execution, subject to all other checks; **T2** = human approval; **T3** = deny. The model cannot set autonomy level or override deterministic policy.

## Threat model and principal controls

**Protect:** signer private key, wallet funds, transaction destination/value/calldata, owner approvals, and integrity of recorded decisions.

**Adversaries / failure cases considered:** prompt injection in invoices or other outside text; malicious or malformed model output; ungrounded or unallow-listed recipients; over-limit and replayed transactions; changed policy, chain, or nonce between review and signing; provider/RPC/database failures; unauthorized approval or kill-switch requests.

| Threat | Main controls |
|---|---|
| Indirect prompt injection | Separate quarantine call; raw untrusted text is not passed to the planner; strict quarantine result; fail closed on quarantine failure; planner recipient grounding uses trusted owner input/address book. |
| Model hallucination or malformed output | Strict schemas, bounded retries, trusted code supplies intent metadata, policy validates again. |
| Unauthorized/changed transfer | Allowlisted native recipient, amount and velocity limits, digest-bound owner approval, single-use/expiry, signer revalidation of current chain/nonce/policy. |
| Replayed or tampered approval | Digest binds chain, recipient, value, calldata, nonce, and expiry; signer compares digest at submission. |
| Runaway or compromised agent | T1-only automatic execution, autonomy demotion/freeze, owner-authenticated kill/reset controls. |
| Unauthorized owner controls | Device session plus match against `OWNER_WALLET_ADDRESS`. |
| Auditor overreach | Server-side allowlist check on read-only compliance APIs; console provides no policy or autonomy mutation endpoint. Owner-only control routes retain their separate authorization checks. |
| Swap abuse | Router/token allowlists, exact-input allowance, bounded slippage/caps, outcome comparison and shadow-fork check; missing configuration blocks rather than silently allowing. |
| Audit tampering | Audit events are hash-linked and can be verified through the audit API. Hash chaining detects alteration; it does not make the database independently immutable. |

## Measured evidence (do not overstate)

The following are the recorded offline/live-planner artifacts currently available in the repository. They are not equivalent to a live end-to-end wallet red-team run.

| Evidence | Recorded result | Interpretation / limitation |
|---|---|---|
| Live planner evaluation, 2026-10-17, 68 requested runs | 3 provider/budget errors excluded; schema-valid 64/64; legitimate pass 22/22; false positives 0/22; planner-level false negatives 6/41 (14.6%). | Planner-only behavior. Six attacks produced intents reaching the guard; not an end-to-end exploit result. Held-out cases were AI-written after seeing the prompt and are not independent. See [full evaluation](../backend/llm-planner/eval/reports/2026-10-17-full-68-groq.md). |
| Offline guard replay of recorded live planner outputs, 2026-10-17 | 45 attack runs: 8 harmful planner outputs; guard-on harmful executions 0/45; harmful outputs denied/held 8/8. For 23 legitimate runs, 22 passed planner; 1 would execute at L1 and 21 were held/denied by the guard. | Uses assumed policy values, a mocked swap quote, and no database usage reservation, shadow-fork simulation, outcome checker, or signer. The document explicitly calls this an upper-bound offline replay. See [guard replay report](../backend/llm-planner/eval/reports/2026-10-17-guard-replay-live.md). |
| Quarantine evaluation, 2026-10-18 | Injected text flagged 9/9; attacker-address leak 0/9; benign false-positive 0/4; benign pass 4/4. | Small evaluation set, not an independent or production guarantee. The same artifact reports 0 general planner runs because provider/budget errors prevented those cases. See [indirect evaluation](../backend/llm-planner/eval/reports/2026-10-18-after-refactor-indirect.md). |
| Quarantine suite, 2026-10-18 | 13 indirect cases: 9 injected and 4 benign; recorded summary above. | Model evaluation only; not transaction execution. |
| Automated local validation, prior implementation run | Backend suite: 76 passed, 0 failed. Planner suite: 93 passed, 0 failed; planner typecheck passed. Frontend TypeScript/Vite production build passed. | Local worktree validation only. A clean-clone run has not been established. |

**Not evidenced here:** the Day 4 A1–A10 × N=5 guarded/naive comparison, measured false-positive rate for the full integrated flow, 10/10 repeated Anvil core-flow runs, five newly verified agent-driven Sepolia transactions with hashes, a full 10-minute team dry run, or clean-clone reproducibility. Do not use UI counters, mocked replay, or pre-existing unverified hashes as substitutes.

## Known risks and limitations

1. **Read-only goal routing:** balance/policy queries can currently reach the transfer guard and be denied as unsupported. Route read-only actions separately before claiming these flows work.
2. **Swap configuration and capability:** swaps fail closed without a deployment-specific allowlisted router and token/cap settings. The current environment must be configured deliberately; do not copy an arbitrary router address into the allowlist. Native-output swaps require an unwrap-capable implementation and additional tests.
3. **Approval scope:** native transfers only. Swaps requiring approval do not execute.
4. **Live end-to-end evidence gap:** current planner and replay metrics do not prove on-chain safety. Sepolia transactions, their hashes, and the complete Anvil gate need independent verification.
5. **Provider dependence:** model/quarantine output and availability are external dependencies; injection detection is probabilistic. The deterministic guard is the security boundary.
6. **Persistence/operations:** MongoDB availability and correct deployment configuration are required for audit, approvals, and autonomy persistence. Hash-linked audit records are not an external append-only ledger.
7. **Arena:** the current Arena is a capped, rate-limited planner/policy preview that never invokes the signer. Its naive mode is an illustration, not a competing agent or a measured sandbox exploit.
8. **Repository hygiene:** no secret-scanning or full git-history review is recorded in this handoff; do not claim the repository history is clean without running and recording that check.
9. **Policy history:** snapshots are recorded on backend startup when effective policy values change. Changes made without a backend restart are not captured; policy history is not an approval workflow or maker-checker.

## Setup and validation commands

Use Node/npm versions compatible with the lockfiles. Copy the example environment file, fill secrets and deployment-specific values locally, and never commit real `.env` files or keys.

```powershell
# From the repository root; install each package's locked dependencies.
Set-Location backend
npm ci
npm test

Set-Location llm-planner
npm ci
npm test
npm run typecheck

Set-Location ..\..\frontend
npm ci
npm run build
```

Run services from separate terminals after configuring MongoDB, RPC, planner providers, and wallet policy:

```powershell
# Terminal 1, backend
Set-Location backend
npm run dev

# Terminal 2, frontend
Set-Location frontend
npm run dev
```

Planner evaluation commands are in the [planner README](../backend/llm-planner/README.md). Live commands require configured provider credentials and may consume quota. Only run transaction tests against a disposable Anvil/fork setup and a test signer; do not use a funded production key.

## Handoff TODO before final claims

- Run backend, planner, and frontend commands from a **fresh clone** and save command output.
- Confirm all example configuration fields required by the active API and chosen chain are documented; verify router/token addresses against authoritative deployment sources.
- Add/route read-only intents separately; test balance, policy-limit, native transfer, and supported swap paths.
- Run the predefined, unchanged red-team set end-to-end with naive and guarded modes at N=5; record denominators, failures, and catching layer.
- Run the 10-minute team dry run and all required Anvil repetitions; record the run logs.
- Only run Sepolia transfers with explicit authorization and a test signer; independently verify every transaction hash.
- Run secret scanning on tracked files and git history; record the tool, scope, and result.
- Freeze prompt/model configuration and capture final docs, deck, and video only after the tested build is stable.
