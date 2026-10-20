# BambooLeaf

BambooLeaf is a **guarded AI agent wallet** designed for secure, autonomous Web3 disbursements. State your goal in plain language (*"send 0.01 ETH to Treasury"*, *"swap 20 USDC to ETH"*), and an AI model proposes a structured intent. A deterministic policy layer verifies limits, handles approvals, and lets the signer execute on-chain.

> **Status:** Hackathon prototype running on **Ethereum Sepolia Testnet** (`Chain ID: 11155111`). Never use a private key controlling real mainnet assets.
[For detailed information, check "docs" folder]

---

## Live Deployments

* **Frontend (Vercel):** https://bamboo-leaf.vercel.app/ 

* **Backend API (Render):** https://bambooleaf.onrender.com/ 

---

## How It Works

The AI model has **no authority, no signing keys, and no direct execution tools**.

```text
React 19 UI
  -> Express API (P-256 device keys, RBAC)
     -> Quarantine Layer: Isolates memos & invoices to block prompt injection
     -> Planner Bridge: Generates strict JSON intent (no keys, no tools)
     -> Policy Guard: Enforces allowlists, daily spending caps, velocity limits
     -> Human Approvals: High-risk actions generate a 120s Keccak-256 ticket
     -> Backend Signer: Rechecks limits & kill switch before sending to Sepolia
     -> Audit Trail: SHA-256 hash-chained event logging

```

---

## Quick Start (Local Setup)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-org/bambooleaf.git
cd bambooleaf

cd backend && npm ci
cd llm-planner && npm ci && cd ..
cd ../frontend && npm ci && cd ..

```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

```

Fill in your `MONGODB_URI`, `RPC_URL`, and `AGENT_KEY` inside `backend/.env`.

### 3. Run Locally

In two separate terminals:

```bash
# Terminal 1: Backend API (http://127.0.0.1:3000)
cd backend && npm run dev:api

# Terminal 2: Frontend Client (http://localhost:5173)
cd frontend && npm run dev

```

---

## Tests & Checks

Run offline tests across the stack before committing:

```bash
# AI Planner tests & typecheck (104 tests)
cd backend/llm-planner && npm test && npm run typecheck

# Backend unit & integration tests (113 tests)
cd ../backend && npm test
npx tsx --test $(find test/unit -name "*.test.tsx" | sort)

# Frontend production build
cd ../frontend && npm run build

```

---

## Deployment Commands

### Backend (Render)

* **Build Command:**
```bash
cd backend; npm install

```


* **Start Command:**
```bash
cd backend; npm start

```


### Frontend (Vercel)

* **Build Command:**
```bash
cd frontend; npm run build

```


* **Development / Output Command:**
```bash
cd frontend; npm run dev

```



---

## Key Features

* **Natural-Language Execution:** State transfers and swaps in plain conversational English.


* **Deterministic Guardrails:** Hard spending limits, daily caps, and velocity windows that the AI cannot override.


* **Autonomous Tiers & Demotion:** Earns autonomy ($L1 \rightarrow L3$) through clean runs; instantly freezes ($L0$) on suspicious behavior or kill-switch activation.


* **B2B Supplier Registry:** Payout addresses are strictly grounded against an approved vendor registry, blocking invoice address spoofing.


* **Manual Portal Fallback (`/#/transact`):** Complete transactions directly under policy guardrails even if the LLM goes offline.


* **Attack Arena (`/#/arena`):** Isolated sandbox to test adversarial prompt injections and jailbreaks without touching the signer.



```

```