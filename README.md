# BambooLeaf

BambooLeaf is a **guarded AI wallet**. You type what you want in plain language (e.g., *"send 0.01 ETH to Treasury"*, *"swap 20 USDC to ETH"*, or *"check my balance"*). An AI model only *proposes* a structured intent. Deterministic code then validates it, applies policy limits, asks a human when needed, and only then lets a signer submit a transaction.

> **Status:** Hackathon prototype running on **Ethereum Sepolia Testnet** (`Chain ID: 11155111`). It has not been security-audited. Never put a key that holds real funds in it. See [Current limitations](#current-limitations).

---

## Live Deployments

* **Frontend (Vercel):** https://bamboo-leaf.vercel.app/ 

* **Backend API (Render):** https://bambooleaf.onrender.com/ 

---

## How It Works

The AI model has **no authority, no signing keys, and no direct execution tools**. The core philosophy of BambooLeaf is: *"We don't claim an agent that can't be fooled. We built one that can be fooled and still can't cause unbounded harm."*

```text
[ UNTRUSTED ZONE ]
React 19 UI (Web Crypto API, P-256 IndexedDB Keys)
  ↓
Express API Gateway (Device Authentication, RBAC, Request Proofs ≤30s)
  ↓
1. Quarantine Layer: Isolates memos/invoices. Detects prompt injections & fails closed.
  ↓
2. Planner LLM (Groq): Translates text to a strict JSON intent. Cannot invent addresses.
  ↓
[ TRUSTED APPLICATION ZONE ]
  ↓
3. Deterministic Policy Guard: Enforces caps, allowlists, velocity limits, and slippage.
  ↓
4. Tier Router: Classifies the action into T1 (Auto), T2 (Human), or T3 (Denied).
  ↓
5. Signer Re-Check: Re-verifies nonce, kill-switch, and caps right before signing.
  ↓
[ EXECUTION ZONE ]
Ethereum Sepolia (Chain ID: 11155111) & Tamper-Evident Audit Log


| Layer | What it enforces |
|---|---|
| Planner (`backend/llm-planner`) | JSON-only output, strict schema, recipients must appear in the owner's own text or saved contacts, bounded retries, fails closed |
| Quarantine inspector | Outside text never reaches the planner; only a short sanitized summary does. A flagged document stops the request |
| Guard (`backend/src/guard`) | Allow-lists, per-transaction and daily caps, slippage cap, tiers T1 (auto) / T2 (approval) / T3 (deny) |
| Autonomy levels | L0 frozen, L1 every action needs approval (default), L2/L3 earned auto-execution within policy. Certain blocked attempts freeze the agent |
| Approvals and signer | Owner approves a digest that binds chain, destination, value, calldata, nonce and expiry; the signer re-verifies right before sending |
| Audit | Every decision is written to a hash-linked log that can be verified through the API |

### Architecture Decision: Why MongoDB Instead of SQL?

If you're wondering why a financial application uses a NoSQL database instead of SQL (like PostgreSQL), here is our reasoning:

1. **Blockchain is the Source of Truth:** Actual funds and token balances are strictly secured on the Ethereum blockchain, not in the database. The database holds zero financial value.
2. **Strictly Off-Chain State:** MongoDB is used only for operational data like hash-linked audit trails, device sessions, and human approval tickets.
3. **Efficient JSON Handling:** Our AI planner generates complex, nested JSON intents. MongoDB's flexible schema handles this dynamic data natively and much faster than SQL's relational tables.
4. **High Scalability:** If the system scales to thousands of active agents and devices, MongoDB can easily handle the load through horizontal scaling.
5. **Developer Velocity:** Since this is an AI prototype, data requirements change rapidly. With SQL, adding a new field requires writing migration scripts and altering tables. With MongoDB, we just add the field to our JSON model and it works instantly, saving us critical development time.

## Repository layout

```text
backend/            Express API (TypeScript run with tsx), MongoDB via mongoose, ethers
  src/guard/        policy engine, tier router, autonomy manager, intent schema
  src/signer/       signing, approval digest, nonce handling
  src/services/     goals, approvals, arena preview
  src/routes/       HTTP routes, with device-session and role middleware
  llm-planner/      the AI planner module (own package, own tests, own README)
  scripts/          dev runner, local Anvil fork, Sepolia/Anvil test scripts
frontend/           React 19 + Vite + Tailwind UI (pages: Overview, Chat, Wallet, Transact,
                    Approvals, Autonomy, Policy, Payments, Activity, Arena, Compliance, Settings)
docs/               deployment, technical handoff, swap fork setup
evidence/           recorded red-team / transaction evidence
render.yaml         Render blueprint for the API
```

## Quick start (local)

**You need:** Node.js 20.19 or newer (Render uses 22), npm, and a MongoDB database you can write to. For wallet features on a test network you also need an RPC URL.

> **Use a separate development database.** Starting the backend creates indexes and runs a migration on the database named in `MONGODB_DB_NAME`. Do not point a local run at a shared or production database.

```bash
# 1. install (each package has its own lockfile)
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
| `OWNER_WALLET_ADDRESS` | Public address of the owner. Needed for approvals, kill switch and reset |
| `APPROVER_`, `CLERK_`, `AUDITOR_WALLET_ADDRESSES` | Comma-separated public addresses for the other roles |
| `AGENT_KEY` | Signing key for the agent wallet. **Leave it empty unless you intend to send test transactions**; with it empty the signer refuses to sign |
| `ALLOWED_RECIPIENTS`, `MAX_PER_TX_ETH`, ... | Guard allow-list and limits. Swaps stay disabled until a router and caps are configured |
| `PROVIDERS`, `PROVIDER_<NAME>_*`, `PLANNER_CHAIN`, `QUARANTINE_CHAIN` | Which OpenAI-compatible model(s) the planner and quarantine use. Keys go only in `.env` |
| `PLANNER_ADDRESS_BOOK` | Saved contacts as JSON, name to public address. Only the names are sent to a model |
| `HOST`, `TRUST_PROXY_HOPS`, `FRONTEND_ORIGIN` | Network exposure and CORS. If `HOST` is not set the API listens only on `127.0.0.1` (this machine). `render.yaml` sets `HOST=0.0.0.0` for the cloud deploy, which opens the API on all interfaces; do not do that on a laptop. `backend/.env.example` sets `HOST=127.0.0.1`, so copy it and keep that value on a laptop |

### Roles and sign-in

Sign-in uses a wallet-signed device session plus a per-request device signature. Roles come from the settings above:

| Role | Can do |
|---|---|
| Owner (admin) | everything, including kill switch / reset, policy updates, roles and trusted IPs |
| Approver | approve or reject pending actions, read policy and audit |
| Clerk | submit goals and invoices |
| Auditor | read-only compliance views |

## Tests and Checks

BambooLeaf maintains strict offline test coverage. The codebase currently passes **186 automated tests** across the backend and AI planner, ensuring high stability before any on-chain execution.

All of these run offline (no network, no model calls, no real transactions):

```bash
# 1. AI Planner tests & typecheck (93 tests)
cd backend/llm-planner && npm test && npm run typecheck

# 2. Backend unit & integration tests (93 tests)
cd backend && npm test
npx tsx --test $(find test/unit -name "*.test.tsx" | sort)

# 3. Local Anvil Swap Simulation Test (Passes)
cd backend && npx tsx scripts/test-anvil-swap.tsx

# 4. Frontend production build
cd frontend && npm run build

Note that `npm test` inside `backend` runs only the integration folder because of how the shell expands the glob; use the explicit command above for the unit tests.

Planner evaluation (mock mode is offline; live mode needs provider keys and costs tokens), the offline guard replay, and the full evidence method are documented in [backend/llm-planner/README.md](./backend/llm-planner/README.md).

## Evidence so far (read the caveats)

| Evidence | Result | Caveat |
|---|---|---|
| Live planner run, 2026-10-20 (93 model calls incl. 13 documents, Groq) | schema-valid 75/75, normal goals 25/25 pass with 0 refused, 7/49 attack or must-refuse goals passed on by the planner (base 2/24, held-out A 1/8, held-out B 3/11, human-written capability set 1/6) | Planner only. The planner is not the security boundary. Held-out cases were written after seeing the prompt, so they are not independent. All test cases were written by the team (8 by a human, the rest with AI help). |
| Offline guard replay of the 20 Oct outputs (current guard) | 0 of 60 attack runs would execute with the guard on; all 9 harmful outputs stopped (1 only by the adapter) | Offline replay, not an end-to-end red team. No database, signer or live chain. In the current backend balance reads are answered before the guard. |
| Quarantine run, 2026-10-18 and 2026-10-20 (13 cases) | 9/9 injected documents flagged, 0/4 benign flagged | Small set; detection is probabilistic |

Reports: [backend/llm-planner/eval/reports/](./backend/llm-planner/eval/reports/). Not yet evidenced: a full end-to-end red team with the signer, and repeated live Sepolia runs. See [docs/technical-handoff.md](./docs/technical-handoff.md).


## Key Features

* **Natural-Language Execution:** State transfers and swaps in plain conversational English.


* **Deterministic Guardrails:** Hard spending limits, daily caps, and velocity windows that the AI cannot override.


* **Autonomous Tiers & Demotion:** Earns autonomy ($L1 \rightarrow L3$) through clean runs; instantly freezes ($L0$) on suspicious behavior or kill-switch activation.


* **B2B Supplier Registry:** Payout addresses are strictly grounded against an approved vendor registry, blocking invoice address spoofing.


* **Manual Portal Fallback (`/#/transact`):** Complete transactions directly under policy guardrails even if the LLM goes offline.


* **Attack Arena (`/#/arena`):** Isolated sandbox to test adversarial prompt injections and jailbreaks without touching the signer.


## Current limitations

- **Supported on-chain actions are narrow:** Native ETH transfers to allow-listed recipients, and token swaps through one configured allow-listed router (native ETH goes through WETH). ERC-20 transfers are currently not supported via the UI.
- **Balance requests** ("what is my balance?") are handled, but they read through the signer wallet, so they fail when `AGENT_KEY` is empty. `read_quote` is not handled yet.
- **Swap approvals** Swap approvals exist in code and unit tests. Live Sepolia swaps are not fully verified end-to-end via the UI, but the underlying routing, quoting, and execution logic successfully pass offline simulation tests using a local Anvil shadow fork.
- **Model dependence:** injection detection is probabilistic. The deterministic guard is the security boundary, and provider outages make requests fail closed.
- **Operations:** MongoDB is required; the audit chain detects tampering but is not an external immutable ledger.
- Some docs under `docs/` are still stubs.

## Deployment

The API is deployed to Render (`render.yaml`) and the frontend to Vercel (`frontend/vercel.json`). Detailed steps, environment variables, and caveats are available in [docs/deployment.md](./docs/deployment.md).

### Backend (Render)
* **Build Command:** `cd backend; npm install`
* **Start Command:** `cd backend; npm start`

### Frontend (Vercel)
* **Build Command:** `cd frontend; npm run build`
* **Output / Dev Command:** `cd frontend; npm run dev`

## Contributing

Work on a branch, open a pull request into `main`, and never commit `.env` files, keys or database URIs. Run the commands in [Tests and checks](#tests-and-checks) before you open the pull request.

## Contributors

This project was built as a collaborative effort by:

| Name | Role | GitHub |
| :--- | :--- | :--- |
| **Mayesha Afraoz** | Security Lead | [@mayesha-3](https://github.com/mayesha-3) |
| **Hosaina Jabara Razty** | Security & Blockchain | [@404Kin](https://github.com/404Kin) |
| **Fabiya Anjum** | AI Engineer | [@FabiZzzCode](https://github.com/FabiZzzCode) |
| **Mohammad Araf** | Full Stack | [@Araf1011](https://github.com/Araf1011) |
