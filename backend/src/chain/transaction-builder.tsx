import { getAddress, parseEther, parseUnits, Interface } from 'ethers'
import { getToken, isNativeToken } from './token-registry.tsx'

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
]

const erc20Interface = new Interface(ERC20_ABI)

type BuiltTransaction = {
  to: string
  value: bigint
  data: string
}

function buildNativeTransfer(intent: any): BuiltTransaction {
  if (intent.action !== 'transfer' || intent.from.token !== 'ETH') {
    throw new Error('The transaction builder only supports native ETH transfers')
  }
  return {
    to: getAddress(intent.recipient),
    value: parseEther(intent.from.amount),
    data: '0x',
  }
}

function buildErc20Transfer(intent: any): BuiltTransaction {
  if (intent.action !== 'transfer') {
    throw new Error('ERC-20 builder only handles transfer actions')
  }

  const token = getToken(intent.from.token, intent.chainId)
  if (isNativeToken(token.symbol)) {
    throw new Error('Use buildNativeTransfer for ETH')
  }

  const recipient = getAddress(intent.recipient)
  const amount = parseUnits(intent.from.amount, token.decimals)

  const data = erc20Interface.encodeFunctionData('transfer', [recipient, amount])

  return {
    to: token.address,
    value: 0n,
    data,
  }
}

function buildTransaction(intent: any): BuiltTransaction {
  if (intent.action === 'transfer') {
    if (isNativeToken(intent.from.token)) {
      return buildNativeTransfer(intent)
    }
    return buildErc20Transfer(intent)
  }
  throw new Error(`Unsupported action: ${intent.action}`)
}

export { buildNativeTransfer, buildErc20Transfer, buildTransaction }