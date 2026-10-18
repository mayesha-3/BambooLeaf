import { randomUUID } from 'node:crypto'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { getDatabase } from '../db/connection.tsx'
import { listTrustedIps, trustIp, untrustIp } from '../db/repositories/trusted-ips.repository.tsx'
import { normalizeIpAddress } from '../security/ip-address.tsx'

async function getTrustedIps(_request, response, next) {
  try {
    response.json({
      trustedIps: await listTrustedIps(getDatabase()),
      authenticationBypass: false,
    })
  } catch (error) {
    next(error)
  }
}

async function addTrustedIp(request, response, next) {
  const { ip } = request.body || {}
  if (typeof ip !== 'string' || ip.length > 64) {
    response.status(400).json({ error: 'Provide a valid IPv4 or IPv6 address.' })
    return
  }
  try {
    const database = getDatabase()
    const trustedIp = await trustIp(database, ip, request.deviceSession.walletAddress)
    await appendAuditEvent(database, {
      requestId: request.requestId || randomUUID(),
      type: 'security.ip_trusted',
      data: { ip: trustedIp.ip, updatedBy: request.deviceSession.walletAddress },
    })
    response.status(201).json({ trustedIp, authenticationBypass: false })
  } catch (error) {
    if (error instanceof Error && /IP address is invalid/.test(error.message)) {
      response.status(400).json({ error: error.message })
      return
    }
    next(error)
  }
}

async function removeTrustedIp(request, response, next) {
  const { ip } = request.body || {}
  if (typeof ip !== 'string' || ip.length > 64) {
    response.status(400).json({ error: 'Provide a valid IPv4 or IPv6 address.' })
    return
  }
  try {
    const database = getDatabase()
    const normalizedIp = normalizeIpAddress(ip)
    if (!normalizedIp) {
      response.status(400).json({ error: 'IP address is invalid.' })
      return
    }
    const removed = await untrustIp(database, normalizedIp)
    if (!removed) {
      response.status(404).json({ error: 'Trusted IP address was not found.' })
      return
    }
    await appendAuditEvent(database, {
      requestId: request.requestId || randomUUID(),
      type: 'security.ip_untrusted',
      data: { ip: normalizedIp, updatedBy: request.deviceSession.walletAddress },
    })
    response.json({ success: true })
  } catch (error) {
    if (error instanceof Error && /IP address is invalid/.test(error.message)) {
      response.status(400).json({ error: error.message })
      return
    }
    next(error)
  }
}

export { addTrustedIp, getTrustedIps, removeTrustedIp }
