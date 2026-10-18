import assert from 'node:assert/strict'
import test from 'node:test'
import { getClientIp, normalizeIpAddress } from '../../../src/security/ip-address.tsx'
import { createApp } from '../../../src/app.tsx'

test('normalizes IPv4-mapped IPv6 and canonicalizes IPv6', () => {
  assert.equal(normalizeIpAddress('::ffff:192.168.1.20'), '192.168.1.20')
  assert.equal(normalizeIpAddress('[2001:0db8:0:0:0:0:0:1]'), '2001:db8::1')
  assert.equal(normalizeIpAddress('not-an-ip'), null)
})

test('uses the Express-resolved client address and labels invalid input unknown', () => {
  assert.equal(getClientIp({ ip: '::ffff:127.0.0.1', socket: { remoteAddress: '192.168.1.10' } }), '127.0.0.1')
  assert.equal(getClientIp({ ip: undefined, socket: { remoteAddress: 'invalid' } }), 'unknown')
})

test('proxy trust is disabled by default and rejects invalid hop counts', () => {
  const previous = process.env.TRUST_PROXY_HOPS
  try {
    delete process.env.TRUST_PROXY_HOPS
    assert.equal(createApp().get('trust proxy'), 0)
    process.env.TRUST_PROXY_HOPS = '1'
    assert.equal(createApp().get('trust proxy'), 1)
    process.env.TRUST_PROXY_HOPS = 'true'
    assert.throws(() => createApp(), /TRUST_PROXY_HOPS must be an integer/)
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY_HOPS
    else process.env.TRUST_PROXY_HOPS = previous
  }
})
