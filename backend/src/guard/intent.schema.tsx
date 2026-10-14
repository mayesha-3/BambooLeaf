import { z } from 'zod'

const decimalAmount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/, 'Amount must be a positive decimal string')
  .refine((value) => Number(value) > 0, 'Amount must be greater than zero')

const intentSchema = z.object({
  intentId: z.string().uuid(),
  action: z.enum(['transfer', 'swap', 'read_balance', 'read_quote']),
  chainId: z.number().int().positive(),
  from: z.object({
    token: z.string().regex(/^[A-Z0-9]{2,10}$/),
    amount: decimalAmount.optional(),
  }).strict(),
  to: z.object({
    token: z.string().regex(/^[A-Z0-9]{2,10}$/),
  }).strict().optional(),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  maxSlippageBps: z.number().int().min(0).max(500).optional(),
  rationale: z.string().max(240),
  sourceRefs: z.array(z.enum(['user_goal', 'saved_contact'])).max(8),
}).strict().superRefine((intent, context) => {
  if (intent.action === 'transfer') {
    if (!intent.from.amount) {
      context.addIssue({ code: 'custom', path: ['from', 'amount'], message: 'Transfers require an amount' })
    }
    if (!intent.recipient) {
      context.addIssue({ code: 'custom', path: ['recipient'], message: 'Transfers require a recipient' })
    }
  }
  if (intent.action === 'swap' && (!intent.from.amount || !intent.to || intent.maxSlippageBps === undefined)) {
    context.addIssue({ code: 'custom', message: 'Swaps require an amount, target token and slippage limit' })
  }
})

const goalRequestSchema = z.object({
  goal: z.string().trim().min(1).max(2000),
}).strict()

export { goalRequestSchema, intentSchema }