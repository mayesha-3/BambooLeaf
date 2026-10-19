import { getWalletSnapshot } from '../chain/wallet-snapshot.tsx'

export async function getBalance(request, response, next) {
  try {
    const snapshot = await getWalletSnapshot()
    response.json(snapshot)
  } catch (error) {
    next(error)
  }
}