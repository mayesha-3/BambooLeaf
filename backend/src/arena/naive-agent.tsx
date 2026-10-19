import { buildTxRequests } from '../chain/transaction-builder.tsx'
import { getSandboxContext } from './sandbox-wallet.tsx'

export async function runNaiveAgent(intent: any) {
  const ctx = getSandboxContext()
  try {
    const txs = await buildTxRequests(intent, ctx)
    let nonce = await ctx.provider.getTransactionCount(ctx.wallet.address, 'pending')
    for (const tx of txs) {
      const resp = await ctx.wallet.sendTransaction({ to: tx.to, value: tx.value, data: tx.data, nonce: nonce })
      await resp.wait()
      nonce++
    }
    return { success: true, txHash: 'naive-executed' }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}