import { createHash } from 'node:crypto'

// Redacting logger. Never emits keys, Authorization headers, 32-byte hex strings or goal text.

const SENSITIVE_KEYS = /^(api[-_]?key|authorization|goal|goaltext|password|secret|token)$/i
const HEX32 = /\b(?:0x)?[0-9a-fA-F]{64}\b/g
const BEARER = /Bearer\s+[A-Za-z0-9._\-]+/gi
const SK_KEY = /\bsk-[A-Za-z0-9_\-]{8,}\b/g

export function describeGoal(goal: string): { goalHash: string; goalLength: number } {
  return { goalHash: createHash('sha256').update(goal).digest('hex').slice(0, 12), goalLength: goal.length }
}

export function redactString(text: string, secrets: string[] = []): string {
  let out = text
  for (const s of secrets) if (s.length >= 4) out = out.split(s).join('[REDACTED]')
  return out.replace(BEARER, 'Bearer [REDACTED]').replace(SK_KEY, '[REDACTED]').replace(HEX32, '[REDACTED_HEX32]')
}

function redactValue(value: unknown, secrets: string[], depth = 0): unknown {
  if (depth > 5) return '[DEEP]'
  if (typeof value === 'string') return redactString(value, secrets)
  if (Array.isArray(value)) return value.map((v) => redactValue(v, secrets, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : redactValue(v, secrets, depth + 1)
    }
    return out
  }
  return value
}

export type LogSink = (line: string) => void

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void
  warn(event: string, fields?: Record<string, unknown>): void
}

export function createLogger(sink: LogSink = (l) => console.error(l), secrets: string[] = []): Logger {
  const emit = (level: string, event: string, fields: Record<string, unknown> = {}) =>
    sink(JSON.stringify({ level, event, ...(redactValue(fields, secrets) as object) }))
  return { info: (e, f) => emit('info', e, f), warn: (e, f) => emit('warn', e, f) }
}

export const silentLogger: Logger = { info() {}, warn() {} }
