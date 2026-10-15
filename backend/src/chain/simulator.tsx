import { JsonRpcProvider, TransactionRequest } from 'ethers'

type SimulationResult = {
  success: boolean
  gasUsed: bigint
  returnData: string
  error?: string
}

/**
 * Simulates a transaction against the configured RPC without sending it.
 * Uses eth_call to check whether the transaction would succeed.
 */
export async function simulateTransaction(
  provider: JsonRpcProvider,
  from: string,
  tx: TransactionRequest,
): Promise<SimulationResult> {
  try {
    const callRequest: TransactionRequest = {
      from,
      to: tx.to,
      value: tx.value ?? 0n,
      data: tx.data ?? '0x',
    }

    // eth_call: returns the result without changing state
    const returnData = await provider.call(callRequest)

    // Estimate gas to catch reverts
    let gasUsed = 0n
    try {
      const estimate = await provider.estimateGas(callRequest)
      gasUsed = estimate
    } catch (estimateError) {
      return {
        success: false,
        gasUsed: 0n,
        returnData: '0x',
        error: `Gas estimation failed: ${(estimateError as Error).message}`,
      }
    }

    return {
      success: true,
      gasUsed,
      returnData,
    }
  } catch (error) {
    return {
      success: false,
      gasUsed: 0n,
      returnData: '0x',
      error: (error as Error).message,
    }
  }
}

/**
 * Simulates a transfer and returns the expected balance change.
 */
export async function simulateTransferBalanceDelta(
  provider: JsonRpcProvider,
  from: string,
  to: string,
  value: bigint,
): Promise<{ balanceBefore: bigint; balanceAfter: bigint; delta: bigint }> {
  const balanceBefore = await provider.getBalance(from)
  const balanceAfter = balanceBefore - value

  return {
    balanceBefore,
    balanceAfter,
    delta: -value,
  }
}