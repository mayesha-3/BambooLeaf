import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getToken,
  isNativeToken,
  listTokens,
} from '../../../src/chain/token-registry.tsx'

test('getToken returns USDC on Sepolia', () => {
  const usdc = getToken('USDC', 11155111)
  assert.equal(usdc.symbol, 'USDC')
  assert.equal(usdc.decimals, 6)
})

test('getToken is case-insensitive', () => {
  assert.equal(getToken('usdc', 11155111).symbol, 'USDC')
  assert.equal(getToken('UsDc', 11155111).symbol, 'USDC')
})

test('getToken throws on unknown token', () => {
  assert.throws(() => getToken('FAKE', 11155111), /Unknown token/)
})

test('isNativeToken identifies ETH', () => {
  assert.equal(isNativeToken('ETH'), true)
  assert.equal(isNativeToken('USDC'), false)
})

test('listTokens returns all Sepolia tokens', () => {
  const tokens = listTokens(11155111)
  assert.equal(tokens.length, 3)
})