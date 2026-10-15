import { useState, type FormEvent } from 'react'
import Icon from './ui/Icon'
import { apiBaseUrl } from '../config/api'
import type { GoalResponse } from '../types'

export default function GoalComposer({ onSubmitted }: { onSubmitted?: () => void }) {
  const [goal, setGoal] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; tone: string; txHash?: string } | null>(null)
  const examples = ['Check my ETH balance', 'Send 0.01 ETH to a saved recipient', 'Swap 20 USDC to ETH']

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)
    try {
      const response = await fetch(`${apiBaseUrl}/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ goal }),
      })
      const result = (await response.json()) as GoalResponse
      if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`)
      setFeedback({
        text: result.txHash ? 'Transaction confirmed on Sepolia testnet.' : result.reason || `Goal status: ${result.status || 'submitted'}`,
        tone: result.status === 'denied' ? 'amber' : 'green',
        txHash: result.txHash,
      })
      setGoal('')
      onSubmitted?.()
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not reach the goal API.', tone: 'red' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <label htmlFor="goal" className="sr-only">Your goal</label>
      <textarea
        id="goal"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        maxLength={2000}
        rows={3}
        required
        placeholder="e.g. Send 0.01 ETH to my saved recipient, swap 20 USDC to ETH…"
        className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs sm:text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#84CC16] focus:bg-white focus:ring-4 focus:ring-lime-500/10 disabled:opacity-60 transition"
        disabled={submitting}
      />
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-3 rounded-2xl p-3 text-xs font-semibold ${feedback.tone === 'red'
              ? 'bg-rose-50 text-rose-700'
              : feedback.tone === 'amber'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-lime-50 text-lime-800'
            }`}
        >
          {feedback.text}
          {feedback.txHash && <p className="mt-1 break-all font-mono text-[11px]">{feedback.txHash}</p>}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setGoal(example)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 transition hover:border-[#84CC16] hover:text-[#65A30D]"
            >
              {example}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={submitting || !goal.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
        >
          <Icon name="send" size={13} />
          {submitting ? 'Planning…' : 'Plan goal'}
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
        <Icon name="lock" size={12} />Every action is validated by deterministic policy before a signer can act.
      </p>
    </form>
  )
}
