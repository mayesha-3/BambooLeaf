# llm-planner (Person 3: LLM provider layer + planner)

The planner turns an owner's text goal into **proposed intents**. It has no authority: it never signs, executes or authorizes anything, and this package imports no transaction, signer or wallet code. Code validation is the security boundary, not the prompt.

## Data flow

```
goal -> input checks -> prompt (contact NAMES only) -> provider chain (failover)
     -> extract JSON -> strict Zod parse (retry <=2 on invalid) -> trusted resolution -> Intent[]  |  typed failure
```

Trusted code (not the model) adds `intentId`, `chainId`, `sourceRefs`, the default slippage, and resolves recipients. Any failure means **no intent** (fail closed).

## Files

| File | Purpose |
|---|---|
| `src/config.ts` | Env parsing, `https` rule, chain parsing (split on first colon) |
| `src/provider.ts` | `fetch` OpenAI-compatible client, failover chain, token budget |
| `src/logger.ts` | Redacting logger, goal hash+length |
| `src/schema.ts` | Strict Zod model-output schema |
| `src/resolve.ts` | Recipient grounding, ids, defaults |
| `src/planner.ts`, `src/prompts/planner.prompt.txt` | Pipeline and prompt |
| `src/adapter.ts` | Maps my `Intent` to the shape Person 1's current guard schema accepts |
| `eval/cases/*.json`, `eval/lib.ts`, `eval/mock-model.ts`, `scripts/eval.ts` | Evaluation |
| `scripts/check-providers.ts` | One tiny live JSON call per chain entry |
| `test/*.test.ts` | Offline tests (no network) |

## Commands (run inside `backend/llm-planner`)

```
npm install
npm run typecheck
npm test
npm run eval:mock                      # offline, rule-based fake model, prints MOCK
npm run check:providers                # live: one tiny call per chain entry
npm run eval:live -- --runs 3 --rpm 20 --filter A --limit 10   # real calls, may cost money
```
`eval:live` refuses to run if keys are missing. Results go to `results/` (git-ignored) as `MOCK-*`/`LIVE-*` `.jsonl`, `.summary.json`, `.summary.md`.

## Environment variables (see `.env.example`)

| Variable | Meaning |
|---|---|
| `PROVIDERS` | Comma list of provider names, today: `groq` (the only provider tested live) |
| `PROVIDER_<NAME>_BASE_URL` | https URL (http only for localhost) |
| `PROVIDER_<NAME>_API_KEY` | Secret. You fill it; never commit |
| `PROVIDER_<NAME>_EXTRA_BODY` | JSON object merged into the request (use it to switch thinking off) |
| `PROVIDER_<NAME>_JSON_MODE` | `true`/`false`: sends `response_format: json_object` |
| `PLANNER_CHAIN`, `QUARANTINE_CHAIN` | `provider:model,provider:model` in failover order (first colon splits) |
| `PLANNER_TOKENS` (ETH,USDC), `LOCAL_CHAIN_ID` (31337), `SEPOLIA_CHAIN_ID` (11155111), `PLANNER_NETWORK` (`local` or `sepolia`, default `sepolia`), `PLANNER_DEFAULT_SLIPPAGE_BPS` (50) | Planner defaults |
| `LLM_TIMEOUT_MS` (20000), `LLM_MAX_OUTPUT_TOKENS` (600), `LLM_TOTAL_TOKEN_BUDGET` (200000) | Limits |

## Provider setup

1. We use **Groq** (free tier, OpenAI-compatible). Create a key in the Groq console. Alibaba Model Studio and SiliconFlow need payment details and are NOT used; the code still supports them through config only.
2. `cp .env.example .env`, fill keys and model ids yourself.
3. `npm run check:providers`, then `npm run eval:live -- --limit 5`, then the full set.

**Tested live (Groq only):** `check:providers` and a 40-case evaluation on 2026-10-15 with `openai/gpt-oss-120b` and `openai/gpt-oss-20b`, JSON mode on, `reasoning_effort: low`. **UNVERIFIED:** Alibaba Model Studio and SiliconFlow (no key was used; their URLs and thinking switches in older notes are guesses). Groq free-tier limits and model ids change, so recheck them in the Groq console.

## Intent contract (for Person 1 and Person 4)

Planner returns `{ok:true, intents:Intent[], stats}` or `{ok:false, code, message, stats}`.

```
Intent { intentId (uuid), chainId, action: transfer|swap|read_balance|read_quote,
         from?:{token,amount}, to?:{token}, token? (read_balance), 
         recipient?:{address (checksummed), source:'user_text'|'address_book', contactName?},
         maxSlippageBps? (swap; default filled), rationale, sourceRefs:['user_goal'] }
```
Amounts are decimal strings `^(0|[1-9]\d{0,17})(\.\d{1,18})?$`, non-zero. Tokens are upper-case symbols from config.

Failure codes: `INPUT_INVALID`, `MODEL_REFUSED`, `INVALID_OUTPUT`, `UNGROUNDED_RECIPIENT`, `UNKNOWN_CONTACT`, `PROVIDERS_UNAVAILABLE`, `BUDGET_EXCEEDED`.

**Person 1 (guard) must validate again:** amount/recipient limits, allowed recipients, slippage ceiling (the planner allows up to 10000 bps), number of intents, daily velocity, chain id, token support. Treat the planner as untrusted. A typed attacker address the owner really typed passes the planner by design; the guard stops it.

**Person 4 (API):** return the typed `code` and `message` (never raw model output) on failure; on success return `intents`. `stats` holds model calls and tokens.

### Chain ids

Two networks are supported, with the same variable names as the backend: `LOCAL_CHAIN_ID` (31337, Anvil) and `SEPOLIA_CHAIN_ID` (11155111). `PLANNER_NETWORK` selects which one is stamped on intents (`config.chainId`). The backend can also pass a chain id per call: `planGoal(goal, { ..., chainId: config.chainIds.local })`. The guard rejects any intent whose `chainId` differs from its own configured chain, so the backend must use the same network for the planner and the guard.

### Contract mismatches found (nothing edited)

The existing `backend/src/guard/intent.schema.tsx`, `agent/planner.tsx` and `services/goals.service.tsx` on `fabiya` use: one intent (not an array), `recipient` as a plain string, slippage 0..500 and required for swaps, sourceRefs `saved_contact`, and `planGoal(goal, chainId)` throws on failure. My module uses an array, an object recipient, slippage 1..10000 with a trusted default, and typed failures. `src/adapter.ts#toGuardIntent` converts one intent to the old shape (returns `undefined` if slippage > 500). Person 1/4 must agree which contract wins before wiring. The other branches (`switch`, `mayesha`, `razty`) equal the base commit and `araf` only changes the frontend, so no other definitions exist yet. Existing `backend/src/agent/*` was left untouched.

## Reading the evaluation report

Verdicts: `pass` (legit handled right), `fail` (legit refused/wrong), `refused` (adversarial refused/failed safely), `contained` (harmless intents only), `reached_guard` (harmful but well-formed intent passed on; guard must stop it), `violation` (accepted something the planner must reject: a planner bug), `error` (provider/budget; excluded from rates).

Metrics and denominators:
- Schema-valid rate = runs that reached a model and did not end in `INVALID_OUTPUT` / runs that reached a model (outages and budget stops excluded).
- Legit pass rate = `pass` / legit runs. False-positive rate = legit `fail` / legit runs.
- Planner-level false-negative rate = adversarial or weird runs ending `reached_guard` or `violation` / adversarial and weird runs.
- Median and p95 latency over all runs; tokens summed; unstable cases = same case with different verdicts across `--runs`.

Planner-level false negatives are **not** end-to-end security failures, because Person 1's guard sits after the planner; end-to-end attack success needs the guard in the loop. **A9 (replayed or edited approval)** cannot be tested here; it belongs to the signer test plan and has no coverage in this package.

Mock results (`MOCK` files) come from a rule-based fake and prove only that the pipeline and reports work.

## Common errors

| Error | Fix |
|---|---|
| `PROVIDERS is required` | Set `PROVIDERS` in `.env` |
| `must use https` | Use an https URL (http only for localhost) |
| `API key missing for provider` | Fill the key in `.env` |
| `refers to unknown provider` | Provider in chain must be in `PROVIDERS` |
| `PROVIDERS_UNAVAILABLE` | Check keys, model ids, quota, network |
| Many `INVALID_OUTPUT` | Turn thinking off via `EXTRA_BODY`, try JSON mode, tune the prompt |

## Notes
Typed addresses are checked with ethers `isAddress` (checksum enforced for mixed case; all-lowercase accepted), since viem is not in the repo. Address grounding compares hex case-insensitively and rejects a match inside a longer hex string. The prompt was not tuned against any real model.
