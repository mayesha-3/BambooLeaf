import { useState, type FormEvent } from 'react'
import Icon from './ui/Icon'
import { apiBaseUrl } from '../config/api'
import { authenticatedFetch } from '../lib/device-session'
import type { GoalResponse } from '../types'

/** Human-readable messages for each planner failure code */
const FAILURE_MESSAGES: Record<string, string> = {
  UNTRUSTED_CONTENT_FLAGGED: 'The attached document was flagged as potentially malicious and blocked. No transaction was executed.',
  QUARANTINE_FAILED: 'Security quarantine check could not complete. Please try again or remove the attachment.',
  INPUT_INVALID: 'Your goal text is invalid — it may be empty, too long, or contain unsupported characters.',
  MODEL_REFUSED: 'The AI planner refused this request. The action may be unsupported or out of scope.',
  INVALID_OUTPUT: 'The AI planner returned a malformed response. Please try rephrasing your goal.',
  UNGROUNDED_RECIPIENT: 'The recipient address could not be verified from your input.',
  UNKNOWN_CONTACT: 'The named contact was not found in your address book.',
  PROVIDERS_UNAVAILABLE: 'AI providers are temporarily unreachable. Please try again in a moment.',
  BUDGET_EXCEEDED: 'Token or quota limit for this planning session was exceeded.',
}

export default function GoalComposer({ onSubmitted }: { onSubmitted?: () => void }) {
  const [goal, setGoal] = useState('')
  const [untrustedText, setUntrustedText] = useState('')
  const [showAttach, setShowAttach] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; tone: string; txHash?: string; code?: string } | null>(null)
  const examples = ['Check my ETH balance', 'Send 0.01 ETH to a saved recipient', 'Swap 20 USDC to ETH']

  function getFeedbackMessage(result: GoalResponse, responseOk: boolean): { text: string; tone: string; txHash?: string; code?: string } {
    // If the backend returned a typed planner failure code
    if (result.code && FAILURE_MESSAGES[result.code]) {
      return {
        text: FAILURE_MESSAGES[result.code],
        tone: result.code === 'UNTRUSTED_CONTENT_FLAGGED' || result.code === 'QUARANTINE_FAILED' ? 'red' : 'amber',
        code: result.code,
      }
    }
    // If status is 'blocked' (catch-all for unknown codes)
    if (result.status === 'blocked') {
      return {
        text: result.error || 'Blocked, nothing executed.',
        tone: 'red',
        code: result.code,
      }
    }
    // HTTP-level error
    if (!responseOk) {
      throw new Error(result.error || 'Request failed')
    }
    // Success
    return {
      text: result.txHash ? 'Transaction confirmed on Sepolia testnet.' : result.reason || `Goal status: ${result.status || 'submitted'}`,
      tone: result.status === 'denied' ? 'amber' : 'green',
      txHash: result.txHash,
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)
    try {
      const body: Record<string, unknown> = { goal }
      if (showAttach && untrustedText.trim()) {
        body.untrusted = [untrustedText.trim()]
      }
      const response = await authenticatedFetch(`${apiBaseUrl}/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(body),
      })
      const result = (await response.json()) as GoalResponse
      setFeedback(getFeedbackMessage(result, response.ok))
      if (response.ok && result.status !== 'blocked') {
        setGoal('')
        setUntrustedText('')
        setShowAttach(false)
        onSubmitted?.()
      }
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
        className="w-full resize-none rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-4 text-xs sm:text-sm leading-6 text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#84CC16] dark:focus:border-lime-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-lime-500/10 disabled:opacity-60 transition"
        disabled={submitting}
      />

      {/* Attach invoice / memo toggle */}
      <button
        type="button"
        onClick={() => setShowAttach(!showAttach)}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-[#84CC16] dark:hover:text-lime-400 transition"
      >
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        {showAttach ? 'Remove attachment' : 'Attach invoice or memo'}
      </button>

      {showAttach && (
        <div className="mt-2 rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Icon name="shield" size={12} className="text-amber-600 dark:text-amber-400" />
            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Untrusted content</span>
          </div>
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-2">
            Attached text is treated as untrusted and inspected by the quarantine system before reaching the planner. No funds will move if the content is flagged.
          </p>
          <textarea
            id="untrusted-attachment"
            value={untrustedText}
            onChange={(event) => setUntrustedText(event.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="Paste invoice text, memo, or document content here…"
            className="w-full resize-none rounded-xl border border-amber-200 dark:border-amber-700/50 bg-white dark:bg-slate-900/60 p-3 text-xs leading-5 text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-400 dark:focus:border-amber-500 focus:ring-4 focus:ring-amber-400/10 disabled:opacity-60 transition"
            disabled={submitting}
          />
          <p className="mt-1 text-right text-[10px] text-slate-400">{untrustedText.length} / 4,000</p>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-3 rounded-2xl p-3 text-xs font-semibold ${feedback.tone === 'red'
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50'
              : feedback.tone === 'amber'
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50'
                : 'bg-lime-50 dark:bg-lime-950/40 text-lime-800 dark:text-lime-300 border border-lime-200 dark:border-lime-900/50'
            }`}
        >
          {feedback.text}
          {feedback.code && (
            <p className="mt-1 font-mono text-[10px] opacity-60">Code: {feedback.code}</p>
          )}
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
              className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 px-3 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 transition hover:border-[#84CC16] dark:hover:border-lime-500 hover:text-[#65A30D] dark:hover:text-lime-400"
            >
              {example}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={submitting || !goal.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-slate-950 dark:bg-lime-400 dark:text-slate-950 dark:hover:bg-lime-300 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
        >
          <Icon name="send" size={13} />
          {submitting ? 'Planning…' : 'Plan goal'}
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-400">
        <Icon name="lock" size={12} />Every action is validated by deterministic policy before a signer can act.
      </p>
    </form>
  )
}
