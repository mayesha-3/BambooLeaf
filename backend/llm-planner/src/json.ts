/** Parse a model answer as JSON. Accepts a single ```json fence; never repairs or guesses values. */
export function extractJson(text: string): unknown {
  let t = text.trim()
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) t = fence[1]!.trim()
  return JSON.parse(t)
}
