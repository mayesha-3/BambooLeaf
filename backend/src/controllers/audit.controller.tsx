import { COLLECTIONS } from '../db/collections.tsx'
import { getDatabase } from '../db/connection.tsx'
import { listPolicyVersions } from '../db/repositories/policy-versions.repository.tsx'
import { verifyAuditChain } from '../audit/verify-chain.tsx'

const MAX_SCAN = 10_000
const QUARANTINE_CODES = new Set([
  'UNTRUSTED_CONTENT_FLAGGED',
  'QUARANTINE_FAILED',
  'MODEL_REFUSED',
  'INVALID_OUTPUT',
])

function queryInteger(value, fallback, min, max) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function queryDate(value, endOfDay) {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string') return null
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) return null
    if (endOfDay) date.setUTCHours(23, 59, 59, 999)
    return date
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function entryLayer(entry) {
  const type = String(entry.type || '')
  const code = String(entry.data?.code || '')
  if (QUARANTINE_CODES.has(code) || type.startsWith('quarantine.')) return 'quarantine'
  if (type.startsWith('planner.')) return 'planner'
  if (type.startsWith('policy.')) return 'policy'
  if (type.startsWith('signer.') || type.startsWith('transaction.')) return 'signer'
  if (type.startsWith('approval.')) return 'approval'
  if (type.startsWith('autonomy.')) return 'autonomy'
  return 'system'
}

function entryDecision(entry) {
  const type = String(entry.type || '').toLowerCase()
  if (type.includes('denied') || type.includes('rejected')) return 'denied'
  if (type.includes('blocked') || type.includes('failed') || type.includes('stale')) return 'blocked'
  if (type.includes('confirmed') || type.includes('executed')) return 'confirmed'
  if (type.includes('requested') || type.includes('required')) return 'pending'
  if (type.includes('allowed') || type.includes('approved')) return 'approved'
  return 'info'
}

function buildAuditQuery(request) {
  const { decision, tier, layer } = request.query
  if (decision !== undefined && (typeof decision !== 'string' || !['all', 'blocked', 'denied', 'confirmed', 'approved', 'pending', 'info'].includes(decision))) {
    return { error: 'Decision filter is invalid.' }
  }
  if (tier !== undefined && (typeof tier !== 'string' || !['all', 'T1', 'T2', 'T3'].includes(tier))) {
    return { error: 'Tier filter is invalid.' }
  }
  if (layer !== undefined && (typeof layer !== 'string' || !['all', 'quarantine', 'planner', 'policy', 'signer', 'approval', 'autonomy', 'system'].includes(layer))) {
    return { error: 'Layer filter is invalid.' }
  }
  const from = queryDate(request.query.from, false)
  const to = queryDate(request.query.to, true)
  if (from === null || to === null || (from && to && from > to)) {
    return { error: 'Date filter is invalid.' }
  }
  const limit = queryInteger(request.query.limit, 100, 1, 1000)
  const beforeSeq = queryInteger(request.query.beforeSeq, Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER)
  if (limit === null || beforeSeq === null) return { error: 'Pagination values are invalid.' }
  const format = request.query.format
  if (format !== undefined && (typeof format !== 'string' || !['json', 'csv'].includes(format))) {
    return { error: 'Export format must be json or csv.' }
  }

  const filter = { seq: { $lt: beforeSeq } }
  if (tier && tier !== 'all') filter['data.tier'] = tier
  if (from || to) {
    filter.createdAt = {}
    if (from) filter.createdAt.$gte = from
    if (to) filter.createdAt.$lte = to
  }
  return { filter, decision: decision === 'all' ? undefined : decision, layer: layer === 'all' ? undefined : layer, limit }
}

async function getFilteredEvents(database, filters, { maxResults = filters.limit, maxScan = MAX_SCAN } = {}) {
  const candidates = await database.collection(COLLECTIONS.audit)
    .find(filters.filter, { projection: { _id: 0 } })
    .sort({ seq: -1 })
    .limit(maxScan)
    .toArray()
  const filtered = candidates.filter((entry) =>
    (!filters.decision || entryDecision(entry) === filters.decision) &&
    (!filters.layer || entryLayer(entry) === filters.layer),
  )
  return {
    entries: filtered.slice(0, maxResults),
    scanned: candidates.length,
    truncated: candidates.length === maxScan,
  }
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value)
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

async function getAuditAccess(request, response) {
  response.json({ role: request.auditRole, readOnly: true })
}

async function getAudit(request, response, next) {
  const filters = buildAuditQuery(request)
  if (filters.error) {
    response.status(400).json({ error: filters.error })
    return
  }
  try {
    const result = await getFilteredEvents(getDatabase(), filters)
    response.json({
      ...result,
      entries: result.entries,
      nextBeforeSeq: result.entries.length === filters.limit ? result.entries[result.entries.length - 1].seq : null,
    })
  } catch (error) {
    next(error)
  }
}

async function exportAudit(request, response, next) {
  const filters = buildAuditQuery(request)
  if (filters.error) {
    response.status(400).json({ error: filters.error })
    return
  }
  try {
    const result = await getFilteredEvents(getDatabase(), filters, { maxResults: Math.min(filters.limit, 1000) })
    const format = request.query.format || 'json'
    if (format !== 'json' && format !== 'csv') {
      response.status(400).json({ error: 'Export format must be json or csv.' })
      return
    }
    if (format === 'json') {
      response.type('application/json').attachment('bambooleaf-audit.json').send(JSON.stringify(result.entries, null, 2))
      return
    }
    const columns = ['seq', 'createdAt', 'requestId', 'type', 'decision', 'layer', 'tier', 'data', 'prevHash', 'hash']
    const rows = result.entries.map((entry) => [
      entry.seq,
      entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt,
      entry.requestId,
      entry.type,
      entryDecision(entry),
      entryLayer(entry),
      entry.data?.tier || '',
      entry.data,
      entry.prevHash,
      entry.hash,
    ])
    const csv = [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
    response.type('text/csv').attachment('bambooleaf-audit.csv').send(csv)
  } catch (error) {
    next(error)
  }
}

async function verifyAudit(request, response, next) {
  try {
    const result = await verifyAuditChain(getDatabase())
    response.status(result.valid ? 200 : 409).json(result)
  } catch (error) {
    next(error)
  }
}

async function getAutonomyHistory(request, response, next) {
  try {
    const limit = queryInteger(request.query.limit, 100, 1, 500)
    if (limit === null) {
      response.status(400).json({ error: 'Limit must be an integer between 1 and 500.' })
      return
    }
    const entries = await getDatabase().collection(COLLECTIONS.audit)
      .find({ type: { $regex: '^autonomy\\.' } }, { projection: { _id: 0 } })
      .sort({ seq: -1 })
      .limit(limit)
      .toArray()
    response.json({ entries })
  } catch (error) {
    next(error)
  }
}

async function getPolicyHistory(request, response, next) {
  try {
    const limit = queryInteger(request.query.limit, 100, 1, 200)
    if (limit === null) {
      response.status(400).json({ error: 'Limit must be an integer between 1 and 200.' })
      return
    }
    response.json({ versions: await listPolicyVersions(getDatabase(), limit) })
  } catch (error) {
    next(error)
  }
}

export {
  buildAuditQuery,
  entryDecision,
  entryLayer,
  getFilteredEvents,
  exportAudit,
  getAudit,
  getAuditAccess,
  getAutonomyHistory,
  getPolicyHistory,
  verifyAudit,
}
