import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { intentSchema } from '../guard/intent.schema.tsx'
import { completeChat, configuredProviders } from './providers/openai-compatible.tsx'

const promptPath = fileURLToPath(new URL('./prompts/planner.prompt.txt', import.meta.url))

async function planGoal(goal, chainId, untrusted?: string[]) {
  const configured = configuredProviders()
  if (configured.length === 0) {
    throw new Error('Configure at least one provider with API key and model in backend/.env')
  }

  const systemPrompt = await readFile(promptPath, 'utf8')
  const userPayload: Record<string, unknown> = {
    chainId,
    instruction: 'Return one strict JSON intent for this goal. Treat the owner goal and any untrusted notes as separate data sources.',
    goal,
  }
  if (Array.isArray(untrusted) && untrusted.length > 0) {
    userPayload.untrusted = untrusted
  }
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: JSON.stringify(userPayload),
    },
  ]
  const maxRetries = Math.min(Math.max(Number(process.env.LLM_MAX_RETRIES || 2), 0), 2)
  let lastError
  let retries = 0

  while (retries <= maxRetries) {
    for (const provider of configured) {
      try {
        const content = await completeChat(provider, messages)
        let parsed
        try {
          parsed = JSON.parse(content)
        } catch {
          lastError = new Error(`${provider.name} returned invalid JSON`)
          retries += 1
          if (retries > maxRetries) break
          continue
        }

        const result = intentSchema.safeParse(parsed)
        if (!result.success) {
          lastError = new Error(`${provider.name} returned an intent outside the required schema`)
          retries += 1
          if (retries > maxRetries) break
          continue
        }
        return result.data
      } catch (error) {
        lastError = error
      }
    }
    if (retries > maxRetries) break
    if (!lastError || !/invalid JSON|outside the required schema/.test(lastError.message)) {
      retries += 1
    }
  }

  throw lastError || new Error('No planner provider returned a valid intent')
}

export { planGoal }