import { randomUUID } from 'node:crypto'

function requestId(request, response, next) {
  request.requestId = randomUUID()
  response.setHeader('X-Request-Id', request.requestId)
  next()
}

export { requestId }