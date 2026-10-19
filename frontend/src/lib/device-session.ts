import { apiBaseUrl } from '../config/api'

const DATABASE = 'bambooleaf-device-keys'
const STORE = 'key-pairs'
const DEVICE_ID_KEY = 'bambooleaf-device-id'
const SESSION_KEY = 'bambooleaf-device-session'
const SESSION_CHANGED_EVENT = 'bambooleaf-session-changed'

type DeviceKeys = { privateKey: CryptoKey; publicKey: JsonWebKey; deviceId: string }
type InjectedWallet = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

export function getDeviceSessionToken(): string {
  const persistentToken = window.localStorage.getItem(SESSION_KEY)
  if (persistentToken) return persistentToken
  const legacyToken = window.sessionStorage.getItem(SESSION_KEY)
  if (!legacyToken) return ''
  window.localStorage.setItem(SESSION_KEY, legacyToken)
  window.sessionStorage.removeItem(SESSION_KEY)
  return legacyToken
}

export function clearDeviceSession(): void {
  window.localStorage.removeItem(SESSION_KEY)
  window.sessionStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
}

export async function signOutDeviceSession(): Promise<void> {
  if (getDeviceSessionToken()) {
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/devices/session`, { method: 'DELETE' })
      if (!response.ok && response.status !== 401) {
        throw new Error(`Server sign-out failed (${response.status}).`)
      }
    } finally {
      clearDeviceSession()
    }
    return
  }
  clearDeviceSession()
}

function setDeviceSessionToken(token: string): void {
  window.localStorage.setItem(SESSION_KEY, token)
  window.sessionStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
}

function openKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open device key storage.'))
  })
}

async function getDeviceKeys(): Promise<DeviceKeys> {
  const database = await openKeyDatabase()
  try {
    const existing = await new Promise<DeviceKeys | undefined>((resolve, reject) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).get('current')
      request.onsuccess = () => resolve(request.result as DeviceKeys | undefined)
      request.onerror = () => reject(request.error || new Error('Could not read the device key.'))
    })
    if (existing?.deviceId && existing.privateKey && existing.publicKey) return existing

    const generated = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    )
    const keys: DeviceKeys = {
      privateKey: generated.privateKey,
      publicKey: await crypto.subtle.exportKey('jwk', generated.publicKey),
      deviceId: crypto.randomUUID(),
    }
    localStorage.setItem(DEVICE_ID_KEY, keys.deviceId)
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put(keys, 'current')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error('Could not save the device key.'))
      transaction.onabort = () => reject(transaction.error || new Error('Could not save the device key.'))
    })
    return keys
  } finally {
    database.close()
  }
}

async function signMessage(message: string, privateKey: CryptoKey): Promise<string> {
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(message),
  ))
  let binary = ''
  for (const byte of signature) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || `Device request failed (${response.status})`)
  return payload
}

export async function enrollOrLoginDevice(
  wallet: InjectedWallet,
): Promise<{ token?: string; status: 'pending' | 'approved'; walletAddress: string; deviceId: string }> {
  const accounts = await wallet.request({ method: 'eth_requestAccounts' })
  const walletAddress = Array.isArray(accounts) ? accounts[0] : undefined
  if (typeof walletAddress !== 'string') throw new Error('Wallet did not return an account.')
  const keys = await getDeviceKeys()
  const id = keys.deviceId

  let challengeResponse = await fetch(`${apiBaseUrl}/devices/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, deviceId: id }),
  })
  if (challengeResponse.status === 202) {
    return { status: 'pending', walletAddress, deviceId: id }
  }
  if (challengeResponse.status === 403) {
    const enrollmentChallenge = await readResponse<{ nonce: string; message: string }>(await fetch(`${apiBaseUrl}/devices/enrollment/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, deviceId: id }),
    }))
    const walletSignature = await wallet.request({
      method: 'personal_sign',
      params: [enrollmentChallenge.message, walletAddress],
    })
    if (typeof walletSignature !== 'string') throw new Error('Wallet returned an invalid enrollment signature.')
    const deviceSignature = await signMessage(enrollmentChallenge.message, keys.privateKey)
    const enrollment = await readResponse<{ status: 'pending' | 'approved' }>(await fetch(`${apiBaseUrl}/devices/enrollment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        deviceId: id,
        nonce: enrollmentChallenge.nonce,
        walletSignature,
        deviceSignature,
        publicKey: keys.publicKey,
      }),
    }))
    if (enrollment.status === 'pending') return { status: 'pending', walletAddress, deviceId: id }
    if (enrollment.status !== 'approved') throw new Error('The backend returned an invalid device enrollment status.')
    challengeResponse = await fetch(`${apiBaseUrl}/devices/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, deviceId: id }),
    })
    if (challengeResponse.status === 202) return { status: 'pending', walletAddress, deviceId: id }
  }

  const challenge = await readResponse<{ nonce: string; message: string }>(challengeResponse)
  const walletSignature = await wallet.request({
    method: 'personal_sign',
    params: [challenge.message, walletAddress],
  })
  if (typeof walletSignature !== 'string') throw new Error('Wallet returned an invalid login signature.')
  const signature = await signMessage(challenge.message, keys.privateKey)
  const login = await readResponse<{ token: string }>(await fetch(`${apiBaseUrl}/devices/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, deviceId: id, nonce: challenge.nonce, signature, walletSignature }),
  }))
  setDeviceSessionToken(login.token)
  return { status: 'approved', token: login.token, walletAddress, deviceId: id }
}

async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getDeviceSessionToken()
  const headers = new Headers(init.headers)
  if (!token) return fetch(input, init)
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

  const url = new URL(input instanceof Request ? input.url : input.toString(), window.location.href)
  const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const body = typeof init.body === 'string' ? init.body : ''
  const bodyHash = await sha256(body)
  const path = `${url.pathname}${url.search}`
  const proofResponse = await fetch(`${apiBaseUrl}/devices/proof-challenge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, path, bodyHash }),
  })
  let proof: { nonce: string; message: string }
  try {
    proof = await readResponse<{ nonce: string; message: string }>(proofResponse)
  } catch (error) {
    if (proofResponse.status === 401) clearDeviceSession()
    throw error
  }
  const keys = await getDeviceKeys()
  const signature = await signMessage(proof.message, keys.privateKey)
  headers.set('x-device-challenge', proof.nonce)
  headers.set('x-device-signature', signature)
  const response = await fetch(input, { ...init, headers })
  if (response.status === 401) clearDeviceSession()
  return response
}
