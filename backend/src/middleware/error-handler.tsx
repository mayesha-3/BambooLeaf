function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error)
    return
  }
  console.error(JSON.stringify({
    level: 'error',
    requestId: request.requestId,
    message: error.message,
  }))
  response.status(500).json({ error: 'Internal server error.', requestId: request.requestId })
}

export { errorHandler }