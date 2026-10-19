import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activateKillSwitch,
  getLevel,
  isKillSwitchActive,
  recordBlockedAttempt,
  recordCleanExecution,
  requireKillSwitchOff,
  reset,
  resetKillSwitch,
  restoreState,
} from '../../../src/guard/autonomy-manager.tsx'

test('starts at L1', () => {
  reset()
  assert.equal(getLevel(), 'L1')
})

test('promotes L1 → L2 after 10 clean executions', () => {
  reset()
  for (let i = 0; i < 10; i++) recordCleanExecution()
  assert.equal(getLevel(), 'L2')
})

test('promotes L2 → L3 after 20 clean executions', () => {
  reset()
  for (let i = 0; i < 20; i++) recordCleanExecution()
  assert.equal(getLevel(), 'L3')
})

test('critical block demotes to L0', () => {
  reset()
  for (let i = 0; i < 10; i++) recordCleanExecution()
  assert.equal(getLevel(), 'L2')

  recordBlockedAttempt('Malicious intent detected', true)
  assert.equal(getLevel(), 'L0')
  assert.equal(isKillSwitchActive(), true)
})

test('three blocked attempts demote to L0', () => {
  reset()
  recordBlockedAttempt('Recipient not allow-listed')
  recordBlockedAttempt('Amount too high')
  recordBlockedAttempt('Unknown contract')
  assert.equal(getLevel(), 'L0')
  assert.equal(isKillSwitchActive(), true)
})

test('kill switch blocks signing', () => {
  reset()
  activateKillSwitch()
  assert.throws(() => requireKillSwitchOff(), /Kill switch is active/)
})

test('resetKillSwitch restores L1', () => {
  activateKillSwitch()
  resetKillSwitch()
  assert.equal(isKillSwitchActive(), false)
  assert.equal(getLevel(), 'L1')
})

test('restoring frozen state preserves the fail-closed level', () => {
  restoreState({
    level: 'L3',
    cleanStreak: 9,
    blockedInWindow: 3,
    windowStartedAt: Date.now(),
    lastDemotionReason: 'Repeated blocked attempts',
    frozen: true,
  })
  assert.equal(getLevel(), 'L0')
  assert.equal(isKillSwitchActive(), true)
  assert.throws(() => restoreState({ level: 'L4' } as never), /invalid level/)
  reset()
})