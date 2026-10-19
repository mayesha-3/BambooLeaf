# Swap execution on an Anvil fork

Swap execution is fail-closed: it requires an allow-listed router, ERC-20 tokens configured for the selected chain, a per-transaction and daily input cap, a bounded slippage setting, and a successful shadow-fork simulation. The simulation snapshots the local fork, impersonates the signer only inside that snapshot, records token balance deltas, `Transfer`/`Approval` logs and traced call addresses, then reverts the snapshot before signing.

Configure these values in `backend/.env` (use token/router addresses for the upstream network you fork):

```dotenv
CHAIN_ID=11155111
RPC_URL=<Sepolia RPC URL used by the signer>
SHADOW_RPC_URL=http://127.0.0.1:8546
# Optional: defaults to RPC_URL
ANVIL_FORK_URL=<Sepolia RPC URL>
SWAP_ROUTER_ADDRESS=<router address>
ALLOWED_SWAP_ROUTERS=<same router address>
TOKEN_USDC_ADDRESS=<USDC address>
TOKEN_USDC_DECIMALS=6
TOKEN_WETH_ADDRESS=<WETH address>
TOKEN_WETH_DECIMALS=18
MAX_SLIPPAGE_BPS=50
MAX_SWAP_INPUT_AMOUNT=<per-transaction cap in input-token units>
MAX_SWAP_PER_TOKEN_PER_DAY=<daily cap in input-token units>
AUTONOMY_LEVEL=L2
```

Keep the existing signer, database, and native-transfer policy settings. Router and token addresses are configuration, not planner-provided values. Native ETH swaps route through WETH and use the router's ETH-specific methods.

From `backend`, run `npm run dev`. In development, this starts a local Anvil fork automatically when `SHADOW_RPC_URL` is a loopback HTTP URL, waits for the configured `CHAIN_ID`, then starts the API watcher. If a matching fork is already running it is reused. The fork launcher uses `ANVIL_FORK_URL` when set and otherwise forks the network configured by `RPC_URL`. If you prefer separate terminals, use `npm run anvil:fork` and `npm run dev:api`.

```powershell
npm run dev
```

T1 swaps execute automatically, T2 swaps are added to the Approval Queue and execute only after an authorized reviewer approves them, and T3 swaps are denied. A fork is for simulation only; the signer still submits approved transactions through `RPC_URL`. Use a test signer and review the configured RPC carefully before approving transactions.

The prior signer/policy/audit split already exists in TypeScript (`intent.schema`, `policy-engine`, `signer-service`, and `audit-log`); there is no `signer.mjs` entry point.
