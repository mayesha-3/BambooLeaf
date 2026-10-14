import { getAddress, parseEther } from 'ethers'
import { issueGuardAuthorization } from './guard-auth.tsx'

function parsePositiveWei(amount) {
  try {
    const wei = parseEther(amount)
    return wei > 0n ? wei : null
  } catch {
    return null
  }
}

function readPolicyConfig(environment = process.env) {
  return {
    chainId: Number(environment.CHAIN_ID || 31337),
    maxPerTxWei: parseEther(environment.MAX_PER_TX_ETH || '0.02'),
    maxPerRecipientPerDayWei: parseEther(environment.MAX_PER_RECIPIENT_PER_DAY_ETH || '0.05'),
    maxTxPerWindow: Number(environment.MAX_TX_PER_WINDOW || 5),
    velocityWindowSeconds: Number(environment.VELOCITY_WINDOW_SECONDS || 600),
    allowedRecipients: new Set((environment.ALLOWED_RECIPIENTS || '')
      .split(',').map((address) => address.trim()).filter(Boolean).map(getAddress)),
  }
}

function evaluateNativeTransfer(intent, config) {
  if (intent.action !== 'transfer' || intent.from.token !== 'ETH') {
    return { allowed: false, reason: 'Only native ETH transfers are enabled by this signer.' }
  }
  if (intent.chainId !== config.chainId) {
    return { allowed: false, reason: 'Intent chain ID does not match the configured chain.' }
  }

  let recipient
  try {
    recipient = getAddress(intent.recipient)
  } catch {
    return { allowed: false, reason: 'Recipient address is invalid.' }
  }
  if (!config.allowedRecipients.has(recipient)) {
    return { allowed: false, reason: 'Recipient is not allow-listed.' }
  }

  const valueWei = parsePositiveWei(intent.from.amount)
  if (valueWei === null) {
    return { allowed: false, reason: 'Transfer amount is invalid.' }
  }
  if (valueWei > config.maxPerTxWei) {
    return { allowed: false, reason: 'Transfer exceeds the per-transaction cap.' }
  }
  if (config.maxTxPerWindow < 1 || config.velocityWindowSeconds < 1 ||
      config.maxPerRecipientPerDayWei <= 0n) {
    return { allowed: false, reason: 'Transfer policy limits are not configured safely.' }
  }

  const authorization = issueGuardAuthorization({
    chainId: intent.chainId,
    intentId: intent.intentId,
    recipient,
    valueWei: valueWei.toString(),
  })
  return {
    allowed: true,
    reason: 'Recipient, chain, and per-transaction policy checks passed.',
    authorization,
    valueWei: valueWei.toString(),
  }
}

export { evaluateNativeTransfer, parsePositiveWei, readPolicyConfig }