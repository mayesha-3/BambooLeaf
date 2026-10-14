import { getAddress, parseEther } from 'ethers'

function buildNativeTransfer(intent) {
  if (intent.action !== 'transfer' || intent.from.token !== 'ETH') {
    throw new Error('The transaction builder only supports native ETH transfers')
  }
  return {
    to: getAddress(intent.recipient),
    value: parseEther(intent.from.amount),
    data: '0x',
  }
}

export { buildNativeTransfer }