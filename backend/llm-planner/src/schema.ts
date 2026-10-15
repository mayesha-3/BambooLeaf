import { z } from 'zod'
import { getAddress, isAddress } from 'ethers'

// Strict model-output schema. Every object is strict: unknown fields are rejected.

export const AMOUNT_REGEX = /^(0|[1-9]\d{0,17})(\.\d{1,18})?$/

export function makeSchemas(supportedTokens: string[]) {
  const allowed = new Set(supportedTokens.map((t) => t.toUpperCase()))

  const token = z
    .string()
    .regex(/^[A-Za-z0-9]{2,10}$/, 'token must be a symbol')
    .transform((s) => s.toUpperCase())
    .refine((s) => allowed.has(s), { message: `token must be one of ${[...allowed].join(', ')}` })

  const amount = z
    .string()
    .regex(AMOUNT_REGEX, 'amount must be a decimal string like "0.01"')
    .refine((s) => /[1-9]/.test(s), 'amount must not be zero')

  const rationale = z.string().min(1).max(200)

  const typedAddress = z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'address must be 0x plus 40 hex characters')
    .refine((s) => isAddress(s), 'address checksum is invalid')
    .transform((s) => getAddress(s))

  const recipient = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('contact'), name: z.string().min(1).max(50) }),
    z.strictObject({ type: z.literal('address'), address: typedAddress }),
  ])

  const from = z.strictObject({ token, amount })
  const toToken = z.strictObject({ token })

  const transfer = z.strictObject({ action: z.literal('transfer'), from, recipient, rationale })
  const swap = z
    .strictObject({
      action: z.literal('swap'),
      from,
      to: toToken,
      maxSlippageBps: z.number().int().min(1).max(10000).optional(),
      rationale,
    })
    .refine((s) => s.from.token !== s.to.token, { message: 'swap tokens must differ', path: ['to', 'token'] })
  const readBalance = z.strictObject({ action: z.literal('read_balance'), token: token.optional(), rationale })
  const readQuote = z
    .strictObject({ action: z.literal('read_quote'), from, to: toToken, rationale })
    .refine((s) => s.from.token !== s.to.token, { message: 'quote tokens must differ', path: ['to', 'token'] })

  const rawIntent = z.union([transfer, swap, readBalance, readQuote])

  const plan = z.strictObject({ intents: z.array(rawIntent).min(1).max(5) })
  const refusal = z.strictObject({ cannotComply: z.string().min(1).max(300) })
  const modelOutput = z.union([plan, refusal])

  return { modelOutput, plan, refusal }
}

export type ModelOutput = z.infer<ReturnType<typeof makeSchemas>['modelOutput']>
export type RawIntent = z.infer<ReturnType<typeof makeSchemas>['plan']>['intents'][number]

/** Flatten Zod issues into short human-readable lines for the retry message (no model text is echoed). */
export function describeIssues(error: z.ZodError): string[] {
  const lines: string[] = []
  for (const issue of error.issues) {
    // For unions Zod nests branch errors; the top-level message is enough for the model to retry.
    if (issue.code === 'invalid_union' && Array.isArray((issue as any).errors)) {
      for (const branch of (issue as any).errors as z.core.$ZodIssue[][]) {
        for (const sub of branch.slice(0, 3)) lines.push(`${sub.path.join('.') || '(root)'}: ${sub.message}`)
      }
    } else {
      lines.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`)
    }
  }
  return [...new Set(lines)].slice(0, 12)
}
