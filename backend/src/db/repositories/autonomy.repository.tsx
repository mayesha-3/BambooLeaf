import { COLLECTIONS } from '../collections.tsx'

const STATE_ID = 'global'
let saveQueue: Promise<void> = Promise.resolve()

async function loadAutonomyState(database) {
  return database.collection(COLLECTIONS.autonomyState).findOne({ _id: STATE_ID })
}

function saveAutonomyState(database, state) {
  const operation = saveQueue.then(async () => {
    await database.collection(COLLECTIONS.autonomyState).updateOne(
      { _id: STATE_ID },
      { $set: { ...state, updatedAt: new Date() } },
      { upsert: true },
    )
  })
  saveQueue = operation.then(() => undefined, () => undefined)
  return operation
}

export { loadAutonomyState, saveAutonomyState }