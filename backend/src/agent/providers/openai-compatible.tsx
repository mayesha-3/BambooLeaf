const providers = [
  {
    name: 'Alibaba Model Studio',
    baseUrl: process.env.ALIBABA_BASE_URL,
    apiKey: process.env.ALIBABA_API_KEY,
    model: process.env.ALIBABA_MODEL,
  },
  {
    name: 'SiliconFlow',
    baseUrl: process.env.SILICONFLOW_BASE_URL,
    apiKey: process.env.SILICONFLOW_API_KEY,
    model: process.env.SILICONFLOW_MODEL,
  },
].filter((provider) => provider.baseUrl && provider.apiKey && provider.model)

async function completeChat(provider, messages) {
  const baseUrl = provider.baseUrl.replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages,
    }),
    signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS || 15000)),
  })

  if (!response.ok) {
    throw new Error(`${provider.name} returned HTTP ${response.status}`)
  }

  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`${provider.name} returned an empty response`)
  }
  return content
}

function configuredProviders() {
  return providers
}

export { completeChat, configuredProviders }
