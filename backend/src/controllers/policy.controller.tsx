import { formatEther, parseEther } from 'ethers'
import { listTokens } from '../chain/token-registry.tsx'
import { getDatabase } from '../db/connection.tsx'
import { readPolicyConfig } from '../guard/policy-engine.tsx'
import { saveRuntimePolicy } from '../db/repositories/runtime-policy.repository.tsx'

const FIELD_MAP = {
  maxPerTxEth: 'MAX_PER_TX_ETH',
  maxPerRecipientPerDayEth: 'MAX_PER_RECIPIENT_PER_DAY_ETH',
  maxTxPerWindow: 'MAX_TX_PER_WINDOW',
  velocityWindowSeconds: 'VELOCITY_WINDOW_SECONDS',
  maxSlippageBps: 'MAX_SLIPPAGE_BPS',
  maxSwapInputAmount: 'MAX_SWAP_INPUT_AMOUNT',
  maxSwapPerTokenPerDay: 'MAX_SWAP_PER_TOKEN_PER_DAY',
  allowedRecipients: 'ALLOWED_RECIPIENTS',
}

function policyView(config) {
  return {
    chainId: config.chainId,
    maxPerTxEth: formatEther(config.maxPerTxWei),
    maxPerRecipientPerDayEth: formatEther(config.maxPerRecipientPerDayWei),
    maxTxPerWindow: config.maxTxPerWindow,
    velocityWindowSeconds: config.velocityWindowSeconds,
    maxSlippageBps: config.maxSlippageBps,
    maxSwapInputAmount: config.maxSwapInputAmount,
    maxSwapPerTokenPerDay: config.maxSwapPerTokenPerDay,
    allowedRecipients: [...config.allowedRecipients],
    allowedContracts: [...config.allowedContracts],
    allowedSwapRouters: [...config.allowedSwapRouters],
    swapRouterAddress: config.swapRouterAddress || null,
    supportedAssets: listTokens(config.chainId).map(({ symbol, address, decimals }) => ({
      symbol,
      address,
      decimals,
    })),
  }
}

function policyResponse(config, role) {
  return { ...policyView(config), role }
}

function validPositiveEth(value, max) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,18})?$/.test(value)) return false
  try {
    const parsed = parseEther(value)
    return parsed > 0n && parsed <= parseEther(max)
  } catch {
    return false
  }
}

async function getPolicy(request, response, next) {
  try {
    response.json(policyResponse(readPolicyConfig(), request.userRole))
  } catch (error) {
    next(error)
  }
}

async function updatePolicy(request, response, next) {
  const body = request.body || {}
  const fields = Object.keys(body)
  if (fields.length === 0 || fields.some((field) => !Object.hasOwn(FIELD_MAP, field))) {
    response.status(400).json({ error: 'Policy update contains no supported settings or includes unknown fields.' })
    return
  }
  const current = policyView(readPolicyConfig())
  const candidate = { ...current, ...body }
  const valid = validPositiveEth(candidate.maxPerTxEth, '10') &&
    validPositiveEth(candidate.maxPerRecipientPerDayEth, '100') &&
    parseEther(candidate.maxPerRecipientPerDayEth) >= parseEther(candidate.maxPerTxEth) &&
    Number.isInteger(candidate.maxTxPerWindow) && candidate.maxTxPerWindow >= 1 && candidate.maxTxPerWindow <= 100 &&
    Number.isInteger(candidate.velocityWindowSeconds) && candidate.velocityWindowSeconds >= 1 && candidate.velocityWindowSeconds <= 86400 &&
    Number.isInteger(candidate.maxSlippageBps) && candidate.maxSlippageBps >= 0 && candidate.maxSlippageBps <= 500 &&
    typeof candidate.maxSwapInputAmount === 'string' && /^\d*(?:\.\d{1,18})?$/.test(candidate.maxSwapInputAmount) &&
    typeof candidate.maxSwapPerTokenPerDay === 'string' && /^\d*(?:\.\d{1,18})?$/.test(candidate.maxSwapPerTokenPerDay) &&
    Array.isArray(candidate.allowedRecipients) && candidate.allowedRecipients.length <= 500 &&
    candidate.allowedRecipients.every((address) => typeof address === 'string')
  if (!valid) {
    response.status(400).json({ error: 'Policy limits are invalid or exceed the configured safe bounds.' })
    return
  }
  try {
    const values = {}
    for (const [field, envName] of Object.entries(FIELD_MAP)) {
      const value = field === 'allowedRecipients'
        ? candidate.allowedRecipients.join(',')
        : String(candidate[field])
      values[envName] = value
    }
    const validationEnvironment = { ...process.env, ...values }
    const validatedConfig = readPolicyConfig(validationEnvironment)
    await saveRuntimePolicy(getDatabase(), values, request.deviceSession.walletAddress)
    response.json(policyResponse(validatedConfig, request.userRole))
  } catch (error) {
    if (error instanceof Error && /address|invalid address/i.test(error.message)) {
      response.status(400).json({ error: 'Policy contains an invalid recipient address.' })
      return
    }
    next(error)
  }
}

export { getPolicy, policyView, updatePolicy }
