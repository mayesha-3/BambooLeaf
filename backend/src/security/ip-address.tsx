import { isIP } from 'node:net'

function normalizeIpAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let address = value.trim()
  if (address.startsWith('[') && address.endsWith(']')) {
    address = address.slice(1, -1)
  }
  if (address.toLowerCase().startsWith('::ffff:')) {
    address = address.slice(7)
  }
  const version = isIP(address)
  if (!version) return null
  if (version === 6) {
    return new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase()
  }
  return address.toLowerCase()
}

function getClientIp(request): string {
  return normalizeIpAddress(request.ip || request.socket.remoteAddress) || 'unknown'
}

export { getClientIp, normalizeIpAddress }
