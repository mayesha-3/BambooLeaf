# BambooLeaf

BambooLeaf is a **guarded AI wallet** for supplier payments. You type what you want in plain language (*"send 0.01 ETH to Treasury"*, *"swap 20 USDC to ETH"*, *"check my balance"*). An AI model only *proposes* a structured intent. Deterministic code then validates it, applies policy limits, asks a human when needed, and only then lets a signer submit the transaction.

> **Status:** hackathon prototype on **Ethereum Sepolia testnet** (chain id `11155111`). It has not been security-audited. Never put a key that holds real funds in it. See [Current limitations](#current-limitations).

*"We don't claim an agent that can't be fooled. We built one that can be fooled and still can't cause unbounded harm."*

## Live deployments

| Part | URL |
|---|---|
| Frontend (Vercel) | https://bamboo-leaf.vercel.app/ |
| Backend API (Render) | https://bambooleaf.onrender.com/ |

## How it works

The AI model has **no authority**: no signing key, no tools, and it cannot change a limit. If the model is fooled, the guard behind it still has to agree.

```text
Browser (React UI, P-256 device key)          untrusted
  -> Express API: device session, roles, one-use request proof (30 s)
     -> Quarantine model: reads outside text (invoices, memos); a flagged document stops the request
     -> Planner model (Groq): goal -> strict JSON intent, or a refusal
     -> Recipient grounding: address must come from the owner's text, saved contacts or the supplier registry
     -> Policy guard: allow-lists, caps, velocity, slippage
     -> Tier router: T1 auto / T2 human approval / T3 deny
     -> Human approval (T2): Keccak-256 digest, valid 2 minutes, single use
     -> Signer re-check: chain, nonce, caps, kill switch -> Ethereum Sepolia
  -> SHA-256 hash-linked audit log
```

| Layer | What it enforces |
|---|---|
| Planner (`backend/llm-planner`) | JSON-only output, strict schema, bounded retries, fails closed. Acts only **now**: requests for a later time, date, repeat or condition are refused |
| Quarantine inspector | Outside text never reaches the planner; only a short sanitized summary does |
| Guard (`backend/src/guard`) | Recipient and router allow-lists, per-transaction and daily caps, velocity window, slippage cap, tiers T1/T2/T3 |
| Supplier registry | Invoice payouts must match an approved supplier's registered address; a removed supplier or changed address blocks the payment |
| Autonomy levels | L0 frozen, L1 every action needs approval (default), L2/L3 earned auto-execution within policy. Repeated blocks or the kill switch freeze the agent |
| Approvals and signer | The approver signs off a digest that binds chain, destination, value, calldata, nonce and expiry; the signer re-verifies right before sending |
| Audit | Every decision is written to a hash-linked log that can be verified and exported through the API |

## Key features

- **Natural-language payments:** transfers, swaps and balance checks from plain text, in English or Banglish.
- **Deterministic guardrails:** spending caps, daily caps and velocity windows that the AI cannot override.
- **Earned autonomy:** promotion from L1 after 10 clean executions; freeze to L0 after 3 blocks in 10 minutes or the kill switch.
- **Supplier registry with maker-checker:** an admin adds a supplier, an approver activates it, and payouts go only to its registered address.
- **Transact page (`/#/transact`):** a send and swap form that goes through the same planner and guard as chat.
- **Attack Arena (`/#/arena`):** try prompt injections and over-limit attacks against the guarded pipeline without touching the signer.
- **Compliance console (`/#/compliance`):** verify the audit hash chain and export it as JSON or CSV.

## Repository layout

```text
backend/            Express API (TypeScript run with tsx), MongoDB, ethers
  src/guard/        policy engine, tier router, autonomy manager, intent schema
  src/signer/       signing, approval digest, nonce handling
  src/services/     goals, approvals, arena preview
  src/routes/       HTTP routes, with device-session and role middleware
  llm-planner/      the AI planner and quarantine (own package, tests and README)
  scripts/          dev runner, local Anvil fork, Sepolia/Anvil test scripts
frontend/           React 19 + Vite + Tailwind UI
docs/               deployment, technical handoff, swap fork setup, reports (PDF)
evidence/           recorded Sepolia transaction evidence
render.yaml         Render blueprint for the API
```

## Quick start (local)

**You need:** Node.js 20.19 or newer (Render uses 22), npm, and a MongoDB database you can write to. For wallet features you also need a Sepolia or local Anvil RPC URL.

> **Use a separate development database.** Starting the backend creates indexes and runs a migration on the database named in `MONGODB_DB_NAME`. Never point a local run at a shared or production database.

```bash
# 1. get the code and install (each package has its own lockfile)
git clone https://github.com/mayesha-3/BambooLeaf.git
cd BambooLeaf
cd backend && npm ci
cd llm-planner && npm ci && cd ..
cd ../frontend && npm ci && cd ..

# 2. configure (never commit the real .env files)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# edit backend/.env: MongoDB, chain/RPC, role wallets, planner provider (see below)

# 3. run, in two terminals
cd backend  && npm run dev:api     # API on http://127.0.0.1:3000  (health: /health)
cd frontend && npm run dev         # UI  on http://localhost:5173
```

`npm run dev` in `backend` also starts a local shadow fork (Anvil) when `SHADOW_RPC_URL` points to localhost; use `dev:api` if you only want the API.

### Settings you must understand

All names are in [`backend/.env.example`](./backend/.env.example); the planner's own settings are in [`backend/llm-planner/.env.example`](./backend/llm-planner/.env.example) (the backend reads them from the same environment).

| Setting | Why it matters |
|---|---|
| `MONGODB_URI`, `MONGODB_DB_NAME` | Required to start. Audit, approvals and autonomy state live here |
| `CHAIN_ID`, `RPC_URL` | Local Anvil is `31337`, Sepolia is `11155111`. The planner stamps the same chain id |
| `OWNER_WALLET_ADDRESS` | Public address of the owner (admin). Needed for approvals, kill switch and reset |
| `APPROVER_`, `CLERK_`, `AUDITOR_WALLET_ADDRESSES` | Comma-separated public addresses for the other roles |
| `AGENT_KEY` | Signing key for the agent wallet. **Leave it empty unless you intend to send test transactions**; with it empty the signer refuses to sign |
| `ALLOWED_RECIPIENTS`, `MAX_PER_TX_ETH`, ... | Guard allow-list and limits. Swaps stay disabled until a router and caps are configured |
| `PROVIDERS`, `PROVIDER_<NAME>_*`, `PLANNER_CHAIN`, `QUARANTINE_CHAIN` | Which OpenAI-compatible models the planner and quarantine use (Groq `openai/gpt-oss-120b` and `openai/gpt-oss-20b` in our runs). Keys go only in `.env` |
| `PLANNER_ADDRESS_BOOK` | Saved contacts as JSON, name to public address. Only the names are sent to a model |
| `HOST`, `TRUST_PROXY_HOPS`, `FRONTEND_ORIGIN` | Network exposure and CORS. Without `HOST` the API listens only on `127.0.0.1`. `render.yaml` sets `HOST=0.0.0.0` for the cloud; never do that on a laptop |

### Roles and sign-in

Sign-in uses a wallet-signed device session plus a one-use device signature on every request. The owner's first device is approved automatically; other devices wait for the admin.

| Role | Can do |
|---|---|
| Admin (owner) | everything: kill switch and reset, policy updates, roles, devices, suppliers, trusted IPs |
| Approver | approve or reject pending actions, activate suppliers, read policy and audit |
| Clerk | submit goals and invoices, use the Transact page |
| Auditor | read-only compliance and audit views |

Wallet balances are shown only to a signed-in user; the balance API returns `401` when logged out.

## Tests and checks

**225 automated tests** pass on `main` (20 Oct 2026): 104 planner, 113 backend unit and 8 backend integration. These run offline (no network, no model calls, no transactions). Run each command from the repository root:

```bash
# AI planner: 104 tests + strict typecheck
cd backend/llm-planner && npm test && npm run typecheck

# backend unit tests: 113
cd backend && npx tsx --test $(find test/unit -name "*.test.tsx" | sort)

# backend integration tests: 8 (npm test runs only the integration folder)
cd backend && npm test

# frontend production build
cd frontend && npm run build
```

Swap simulation on a local Anvil fork (not offline: needs a running fork in `SHADOW_RPC_URL` and `AGENT_ADDRESS`):

```bash
cd backend && npx tsx scripts/test-anvil-swap.tsx
```

Planner evaluation (mock mode is offline; live mode needs provider keys and costs tokens) and the offline guard replay are documented in [backend/llm-planner/README.md](./backend/llm-planner/README.md).

## Evidence so far (read the caveats)

| Evidence | Result | Caveat |
|---|---|---|
| Live planner run, 2026-10-20 (93 model calls incl. 13 documents, Groq) | schema-valid 75/75; normal goals 25/25 pass, 0 refused; 7/49 attack or must-refuse goals passed on by the planner (base 2/24, held-out A 1/8, held-out B 3/11, capability 1/6) | Planner only; the planner is not the security boundary. Held-out A and B (28 cases) were written with AI help after seeing the prompt, so they are not independent. The 8 capability cases were written by a team member |
| Offline guard replay of the 20 Oct outputs | 0 of 60 attack runs would execute with the guard on; all 9 harmful outputs stopped (1 only by the adapter) | Offline replay, not an end-to-end red team. No database, signer or live chain |
| Quarantine runs, 2026-10-16, 10-18 and 10-20 (13 cases) | 9/9 injected documents flagged, 0 leaks, 0/4 benign flagged | Small set; detection is probabilistic |

Reports: [backend/llm-planner/eval/reports/](./backend/llm-planner/eval/reports/). Sepolia transactions: [evidence/red-team/sepolia-transactions.txt](./evidence/red-team/sepolia-transactions.txt). Not yet evidenced: a full end-to-end red team with the signer, and repeated live Sepolia runs. More detail: [docs/technical-handoff.md](./docs/technical-handoff.md).

## Why MongoDB instead of SQL

1. **The blockchain is the source of truth.** Funds and balances live on Ethereum, not in the database.
2. **Only off-chain state is stored:** the hash-linked audit trail, device sessions, approval tickets, suppliers and invoices.
3. **JSON-shaped data:** intents, audit events and policy versions are nested JSON documents and are stored as they are.
4. **Fast iteration:** adding a field during the prototype needs no migration script.

## Current limitations

- **Narrow on-chain actions:** native ETH transfers to allow-listed recipients, and token swaps through one allow-listed router (native ETH goes through WETH). ERC-20 transfers are not supported.
- **Now only:** scheduled, repeated or conditional payments are not supported; the planner refuses them.
- **Model dependence:** chat and the Transact page both need the planner model. During a provider outage, requests fail closed; there is no model-free payment path yet. Injection detection is probabilistic; the deterministic guard is the security boundary.
- **Balance requests** read through the signer wallet, so they fail when `AGENT_KEY` is empty. `read_quote` is not handled yet.
- **Swap approvals** exist in code and unit tests, and swaps pass simulation on a local Anvil fork, but they are not yet verified end to end on Sepolia through the UI.
- **Operations:** MongoDB is required; the audit chain detects tampering but is not an external immutable ledger.

## Deployment

The API runs on Render (`render.yaml`) and the frontend on Vercel (`frontend/vercel.json`). Steps and variables are in [docs/deployment.md](./docs/deployment.md). Add provider keys, wallet and role settings as secrets in the dashboards, never in a file.

| Service | Root directory | Build | Start / output |
|---|---|---|---|
| Render (API) | `backend` | `npm ci` | `npm start` (health check `/health`) |
| Vercel (UI) | `frontend` | `npm run build` | output directory `dist` |

On Vercel, set `VITE_API_BASE_URL` to `https://bambooleaf.onrender.com/api` and redeploy after changing it.

## Contributing

Work on a branch, open a pull request into `main`, and never commit `.env` files, keys or database URIs. Run the commands in [Tests and checks](#tests-and-checks) before you open the pull request.

## Contributors

| Name | Role | GitHub |
| :--- | :--- | :--- |
| **Mayesha Afrooz** | Security Lead | [@mayesha-3](https://github.com/mayesha-3) |
| **Hosaina Jabara Razty** | Security & Blockchain | [@404Kin](https://github.com/404Kin) |
| **Fabiya Anjum** | AI Engineer | [@FabiZzzCode](https://github.com/FabiZzzCode) |
| **Mohammad Araf** | Full Stack | [@Araf1011](https://github.com/Araf1011) |
