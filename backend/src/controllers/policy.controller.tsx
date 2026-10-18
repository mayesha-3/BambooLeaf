import { formatEther } from 'ethers'
import { listTokens } from '../chain/token-registry.tsx'
import { readPolicyConfig } from '../guard/policy-engine.tsx'

function getPolicy(request, response, next) {
  try {
    const policy = readPolicyConfig()
    response.json({
      chainId: policy.chainId,
      maxPerTxEth: formatEther(policy.maxPerTxWei),
      maxPerRecipientPerDayEth: formatEther(policy.maxPerRecipientPerDayWei),
      maxTransactionsPerWindow: policy.maxTxPerWindow,
      velocityWindowSeconds: policy.velocityWindowSeconds,
      allowedRecipients: [...policy.allowedRecipients],
      allowedContracts: [...policy.allowedContracts],
      allowedSwapRouters: [...policy.allowedSwapRouters],
      swapRouterAddress: policy.swapRouterAddress || null,
      maxSlippageBps: policy.maxSlippageBps,
      maxSwapInputAmount: policy.maxSwapInputAmount || null,
      maxSwapPerTokenPerDay: policy.maxSwapPerTokenPerDay || null,
      supportedAssets: listTokens(policy.chainId).map(({ symbol, address, decimals }) => ({
        symbol,
        address,
        decimals,
      })),
    })
  } catch (error) {
    next(error)
  }
}

export { getPolicy }