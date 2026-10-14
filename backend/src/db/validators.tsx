const auditEventValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['seq', 'requestId', 'type', 'createdAt', 'data', 'prevHash', 'hash'],
    properties: {
      seq: { bsonType: ['int', 'long'], minimum: 1 },
      requestId: { bsonType: 'string', minLength: 1, maxLength: 128 },
      type: { bsonType: 'string', minLength: 1, maxLength: 80 },
      createdAt: { bsonType: 'date' },
      data: { bsonType: 'object' },
      prevHash: { bsonType: 'string', maxLength: 64 },
      hash: { bsonType: 'string', minLength: 64, maxLength: 64 },
    },
  },
}

export { auditEventValidator }