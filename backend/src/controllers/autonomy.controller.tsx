import { getAddress } from 'ethers'
import { randomUUID } from 'node:crypto'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { getDatabase } from '../db/connection.tsx'
import { saveAutonomyState } from '../db/repositories/autonomy.repository.tsx'
import {
  activateKillSwitch,
  getState,
  resetKillSwitch,
} from '../guard/autonomy-manager.tsx'

function isOwner(request) {
  const configuredOwner = process.env.OWNER_WALLET_ADDRESS
  const authenticatedWallet = request.deviceSession?.walletAddress
  if (!configuredOwner || !authenticatedWallet) return false
  try {
    return getAddress(configuredOwner).toLowerCase() === getAddress(authenticatedWallet).toLowerCase()
  } catch {
    return false
  }
}

function getAutonomy(request, response) {
  response.json(getState())
}

async function activate(request, response, next) {
  if (!isOwner(request)) {
    response.status(403).json({ error: 'Only the configured owner wallet can change autonomy controls.' })
    return
  }
  try {
    activateKillSwitch()
    const state = getState()
    await saveAutonomyState(getDatabase(), state)
    await appendAuditEvent(getDatabase(), {
      requestId: request.requestId || randomUUID(),
      type: 'autonomy.kill_switch_activated',
      data: { walletAddress: request.deviceSession.walletAddress, level: state.level },
    })
    response.json(state)
  } catch (error) {
    next(error)
  }
}

async function humanReset(request, response, next) {
  if (!isOwner(request)) {
    response.status(403).json({ error: 'Only the configured owner wallet can reset autonomy controls.' })
    return
  }
  try {
    resetKillSwitch()
    const state = getState()
    await saveAutonomyState(getDatabase(), state)
    await appendAuditEvent(getDatabase(), {
      requestId: request.requestId || randomUUID(),
      type: 'autonomy.human_reset',
      data: { walletAddress: request.deviceSession.walletAddress, level: state.level },
    })
    response.json(state)
  } catch (error) {
    next(error)
  }
}

export { activate, getAutonomy, humanReset }
