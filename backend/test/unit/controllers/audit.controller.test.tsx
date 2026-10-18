import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAuditQuery, entryDecision, entryLayer } from '../../../src/controllers/audit.controller.tsx'

test('audit browser accepts controlled decision, tier, layer, and inclusive date filters', () => {
  const result = buildAuditQuery({
    query: {
      decision: 'blocked',
      tier: 'T2',
      layer: 'policy',
      from: '2026-10-18',
      to: '2026-10-18',
      limit: '25',
    },
  })
  assert.equal(result.error, undefined)
  assert.equal(result.filter['data.tier'], 'T2')
  assert.equal(result.filter.createdAt.$gte.toISOString(), '2026-10-18T00:00:00.000Z')
  assert.equal(result.filter.createdAt.$lte.toISOString(), '2026-10-18T23:59:59.999Z')
  assert.equal(result.limit, 25)
  assert.match(buildAuditQuery({ query: { from: '2026-02-30' } }).error, /Date/)
})

test('audit browser rejects malformed and repeated filters', () => {
  assert.match(buildAuditQuery({ query: { tier: 'T4' } }).error, /Tier/)
  assert.match(buildAuditQuery({ query: { decision: ['blocked', 'denied'] } }).error, /Decision/)
  assert.match(buildAuditQuery({ query: { from: 'not-a-date' } }).error, /Date/)
  assert.match(buildAuditQuery({ query: { limit: '1001' } }).error, /Pagination/)
})

test('audit entries receive stable decision and layer labels', () => {
  assert.equal(entryDecision({ type: 'policy.denied' }), 'denied')
  assert.equal(entryDecision({ type: 'autonomy.blocked_attempt' }), 'blocked')
  assert.equal(entryDecision({ type: 'approval.executed' }), 'confirmed')
  assert.equal(entryLayer({ type: 'planner.blocked', data: { code: 'UNTRUSTED_CONTENT_FLAGGED' } }), 'quarantine')
  assert.equal(entryLayer({ type: 'policy.tier_routed', data: {} }), 'policy')
})
