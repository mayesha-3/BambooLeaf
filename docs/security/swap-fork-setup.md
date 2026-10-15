# Swap execution on an Anvil fork

Swap execution is fail-closed: it requires an allow-listed router, ERC-20 tokens configured for the selected chain, a per-transaction and daily input cap, a bounded slippage setting, and a successful shadow-fork simulation. The simulation snapshots the local fork, impersonates the signer only inside that snapshot, records token balance deltas, `Transfer`/`Approval` logs and traced call addresses, then reverts the snapshot before signing.

Configure these values in `backend/.env` (use token/router addresses for the upstream network you fork):

```dotenv
CHAIN_ID=31337
RPC_URL=http://127.0.0.1:8545
SHADOW_FORK_RPC_URL=http://127.0.0.1:8545
ANVIL_FORK_URL=<upstream RPC URL>
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

Keep the existing signer, database, and native-transfer policy settings. Router and token addresses are configuration, not planner-provided values. Native ETH swaps are not enabled; use wrapped ERC-20 tokens.

From `backend`, start the fork first:

```powershell
npm run anvil:fork
```

In another terminal, start the API with `npm run dev`. Only T1 swaps execute; T2 returns `approval_required` and T3 is denied. Autonomy defaults to L1; set `AUTONOMY_LEVEL=L2` only for a controlled fork test that should auto-execute T1. Use a test signer that has the configured input token on the fork.

The prior signer/policy/audit split already exists in TypeScript (`intent.schema`, `policy-engine`, `signer-service`, and `audit-log`); there is no `signer.mjs` entry point.
