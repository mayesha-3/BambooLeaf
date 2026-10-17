import { JsonRpcProvider } from 'ethers'

async function getBalance(request, response, next) {
  try {
    const rpcUrl = process.env.RPC_URL
    const address = process.env.AGENT_ADDRESS

    if (!rpcUrl || !address) {
      response.status(500).json({ error: 'RPC_URL or AGENT_ADDRESS not configured' })
      return
    }

    const provider = new JsonRpcProvider(rpcUrl)
    const balanceWei = await provider.getBalance(address)
    const balanceEth = Number(balanceWei) / 1e18
    const usdRate = 3000 // demo rate

    response.json({
      address,
      balanceWei: balanceWei.toString(),
      balanceEth: balanceEth.toFixed(6),
      balanceUsd: (balanceEth * usdRate).toFixed(2),
      chainId: Number(process.env.CHAIN_ID),
    })
  } catch (error) {
    next(error)
  }
}

export { getBalance }