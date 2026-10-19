import { evaluateArenaRequest } from '../services/arena.service.tsx'

async function evaluate(request, response, next) {
  const result = await evaluateArenaRequest(request.body).catch(next)
  if (result) response.status(result.status === 'invalid_request' ? 400 : 200).json(result)
}

export { evaluate }