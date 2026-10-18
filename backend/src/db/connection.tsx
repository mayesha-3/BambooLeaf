import mongoose from 'mongoose'
import { ensureIndexes } from './indexes.tsx'
import { migrateInitialCollections } from './migrations/001-initial-collections.tsx'
import { loadAutonomyState, saveAutonomyState } from './repositories/autonomy.repository.tsx'
import { getState, restoreState } from '../guard/autonomy-manager.tsx'
import { readPolicyConfig } from '../guard/policy-engine.tsx'
import { capturePolicyVersion } from './repositories/policy-versions.repository.tsx'
import { loadRuntimePolicy } from './repositories/runtime-policy.repository.tsx'

let database

async function connectDatabase() {
  const uri = process.env.MONGODB_URI
  const name = process.env.MONGODB_DB_NAME

  if (!uri || !name) {
    throw new Error('MONGODB_URI and MONGODB_DB_NAME must be configured')
  }

  if (mongoose.connection.readyState === 1) {
    if (mongoose.connection.name !== name) {
      throw new Error('Mongoose is already connected to a different database')
    }
    database = mongoose.connection.db
    return database
  }

  await mongoose.connect(uri, {
    dbName: name,
    appName: 'guarded-agent-wallet',
  })
  database = mongoose.connection.db
  if (!database) {
    await mongoose.disconnect()
    throw new Error('Mongoose connected without an active MongoDB database')
  }

  try {
    await migrateInitialCollections(database)
    await ensureIndexes(database)
    await loadRuntimePolicy(database)
    await capturePolicyVersion(database, readPolicyConfig())
    const savedAutonomyState = await loadAutonomyState(database)
    if (savedAutonomyState) {
      restoreState(savedAutonomyState)
    } else {
      await saveAutonomyState(database, getState())
    }
    return database
  } catch (error) {
    database = undefined
    await mongoose.disconnect()
    throw error
  }
}

function getDatabase() {
  if (!database || mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB has not been connected')
  }
  return database
}

async function closeDatabase() {
  await mongoose.disconnect()
  database = undefined
}

export { closeDatabase, connectDatabase, getDatabase }