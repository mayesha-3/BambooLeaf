import { useCallback, useEffect, useState } from 'react'

type DeviceRecord = {
  deviceId: string
  ip: string
  browser: string
  operatingSystem: string
  deviceType: string
  userAgent: string
  firstSeenAt: string
  lastSeenAt: string
  lastSuccessfulLoginAt?: string
  lastAttemptStatus: string
  attemptCount: number
}

type DeviceAttempt = {
  deviceId: string
  ip: string
  browser: string
  operatingSystem: string
  deviceType: string
  status: string
  reason: string
  createdAt: string
}

type DeviceBlock = { type: 'device' | 'ip'; target: string }
type DeviceSnapshot = {
  walletAddress: string
  primaryDeviceId: string
  currentDeviceId: string
  devices: DeviceRecord[]
  attempts: DeviceAttempt[]
  blocks: DeviceBlock[]
}
type InjectedWallet = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function DeviceSecurityPanel({ apiBaseUrl, onAuthenticated }: { apiBaseUrl: string; onAuthenticated?: () => void }) {
  const [deviceId, setDeviceId] = useState('')
  const [token, setToken] = useState('')
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      const storedToken = window.sessionStorage.getItem('bambooleaf-device-session')
      const storedDeviceId = window.localStorage.getItem('bambooleaf-device-id')
      const currentDeviceId = storedDeviceId || window.crypto.randomUUID()
      if (!storedDeviceId) window.localStorage.setItem('bambooleaf-device-id', currentDeviceId)
      setToken(storedToken || '')
      setDeviceId(currentDeviceId)
    } catch {
      setError('Browser storage is unavailable; device security cannot identify this browser.')
    }
  }, [])

  const loadDevices = useCallback(async (sessionToken: string) => {
    const response = await fetch(`${apiBaseUrl}/devices`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
    const payload = await response.json() as DeviceSnapshot & { error?: string }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        window.sessionStorage.removeItem('bambooleaf-device-session')
        setToken('')
      }
      throw new Error(payload.error || `Device request failed (${response.status})`)
    }
    setSnapshot(payload)
    setError('')
  }, [apiBaseUrl])

  useEffect(() => {
    if (!token) {
      setSnapshot(null)
      return
    }
    void loadDevices(token).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load device activity.')
    })
  }, [loadDevices, token])

  const connectWallet = async () => {
    setBusy(true)
    setError('')
    try {
      if (!deviceId) throw new Error('This browser could not create a device identifier.')
      const wallet = (window as Window & { ethereum?: InjectedWallet }).ethereum
      if (!wallet) throw new Error('No browser wallet was found. Install or unlock a wallet extension and try again.')
      const accounts = await wallet.request({ method: 'eth_requestAccounts' })
      const walletAddress = Array.isArray(accounts) ? accounts[0] : undefined
      if (typeof walletAddress !== 'string') throw new Error('Your wallet did not provide an account.')

      const challengeResponse = await fetch(`${apiBaseUrl}/devices/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, deviceId }),
      })
      const challenge = await challengeResponse.json() as { message?: string; nonce?: string; error?: string }
      if (!challengeResponse.ok || !challenge.message || !challenge.nonce) {
        throw new Error(challenge.error || `Wallet challenge failed (${challengeResponse.status})`)
      }

      let signature: unknown
      try {
        signature = await wallet.request({
          method: 'personal_sign',
          params: [challenge.message, walletAddress],
        })
      } catch (signError) {
        await fetch(`${apiBaseUrl}/devices/challenge/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress, deviceId, nonce: challenge.nonce }),
        })
        throw signError
      }
      if (typeof signature !== 'string') throw new Error('Your wallet returned an invalid signature.')

      const loginResponse = await fetch(`${apiBaseUrl}/devices/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, deviceId, nonce: challenge.nonce, signature }),
      })
      const login = await loginResponse.json() as { token?: string; error?: string }
      if (!loginResponse.ok || !login.token) {
        throw new Error(login.error || `Wallet sign-in failed (${loginResponse.status})`)
      }
      window.sessionStorage.setItem('bambooleaf-device-session', login.token)
      setToken(login.token)
      onAuthenticated?.()
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Wallet sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const changeBlock = async (type: DeviceBlock['type'], target: string, blocked: boolean) => {
    if (!token) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${apiBaseUrl}/devices/blocks`, {
        method: blocked ? 'DELETE' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, target }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || `Device update failed (${response.status})`)
      await loadDevices(token)
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : 'Unable to update device access.')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    if (!token) return
    setBusy(true)
    try {
      const response = await fetch(`${apiBaseUrl}/devices/session`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`Session revocation failed (${response.status})`)
    } catch {
      setError('Could not confirm server sign-out. The local session was still cleared.')
    } finally {
      window.sessionStorage.removeItem('bambooleaf-device-session')
      setToken('')
      setSnapshot(null)
      setBusy(false)
    }
  }

  const primaryIp = snapshot?.devices.find((device) => device.deviceId === snapshot.currentDeviceId)?.ip
  const isPrimary = snapshot !== null && snapshot.primaryDeviceId === snapshot.currentDeviceId
  const isBlocked = (type: DeviceBlock['type'], target: string) =>
    snapshot?.blocks.some((block) => block.type === type && block.target === target) ?? false

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-slate-100/90 dark:border-slate-800/80 bg-white dark:bg-[#0f172a] shadow-sm text-slate-900 dark:text-slate-100 transition-colors duration-200" aria-labelledby="device-security-heading">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 px-6 py-5">
        <div>
          <h2 id="device-security-heading" className="text-sm font-bold text-slate-900 dark:text-white">Devices & sign-in attempts</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
            Wallet signatures verify ownership. We record IP address, browser, operating system, device type, and sign-in outcomes. Websites cannot read a device’s MAC address or reliably determine its location.
          </p>
        </div>
        {token ? (
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={busy}
            className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition"
          >
            Sign out
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void connectWallet()}
            disabled={busy || !deviceId}
            className="rounded-full bg-slate-950 dark:bg-lime-400 dark:text-slate-950 dark:hover:bg-lime-300 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 shadow-sm transition"
          >
            {busy ? 'Connecting…' : 'Connect wallet'}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mx-6 mt-4 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
          {error}
        </p>
      )}

      {!token ? (
        <p className="px-6 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          Connect and sign with your wallet to view all recorded devices and manage access. The first wallet-verified device becomes primary.
        </p>
      ) : (
        <div className="space-y-6 p-6">
          {snapshot && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Wallet <span className="font-mono text-slate-900 dark:text-white">{snapshot.walletAddress}</span>
                </p>
                <p className={`text-xs font-bold ${isPrimary ? 'text-[#65A30D] dark:text-lime-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {isPrimary ? 'This is the primary device' : 'Only the primary device can manage blocks'}
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Known devices ({snapshot.devices.length})
                </h3>
                {snapshot.devices.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No device records found.</p>
                ) : (
                  <div className="space-y-3">
                    {snapshot.devices.map((device) => {
                      const current = device.deviceId === snapshot.currentDeviceId
                      const primary = device.deviceId === snapshot.primaryDeviceId
                      const blockedDevice = isBlocked('device', device.deviceId)
                      const blockedIp = isBlocked('ip', device.ip)
                      const canManage = isPrimary && !current
                      return (
                        <div key={device.deviceId} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/40">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {device.deviceType} · {device.operatingSystem} · {device.browser}
                                {primary && <span className="ml-2 rounded-full bg-lime-50 dark:bg-lime-950/50 px-2 py-1 text-[10px] font-bold text-lime-800 dark:text-lime-300">Primary</span>}
                                {current && <span className="ml-2 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">This device</span>}
                              </p>
                              <p className="mt-1 break-all font-mono text-[10px] text-slate-500 dark:text-slate-400">Device ID {device.deviceId}</p>
                              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                                IP {device.ip} · {device.attemptCount} sign-in attempt(s) · Last outcome: {device.lastAttemptStatus}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-400">
                                First seen {new Date(device.firstSeenAt).toLocaleString()} · Last seen {new Date(device.lastSeenAt).toLocaleString()}
                                {device.lastSuccessfulLoginAt && ` · Last successful sign-in ${new Date(device.lastSuccessfulLoginAt).toLocaleString()}`}
                              </p>
                              <details className="mt-2">
                                <summary className="cursor-pointer text-[11px] font-semibold text-[#65A30D] dark:text-lime-400">Device specifications</summary>
                                <p className="mt-1 break-all text-[10px] leading-4 text-slate-500 dark:text-slate-400">{device.userAgent || 'Browser did not provide a user-agent string.'}</p>
                              </details>
                            </div>
                            {canManage && (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void changeBlock('device', device.deviceId, blockedDevice)}
                                  className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition"
                                >
                                  {blockedDevice ? 'Unblock device' : 'Block device'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || device.ip === primaryIp}
                                  title={device.ip === primaryIp ? 'The primary device cannot block its current IP.' : undefined}
                                  onClick={() => void changeBlock('ip', device.ip, blockedIp)}
                                  className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition"
                                >
                                  {blockedIp ? 'Unblock IP' : 'Block IP'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Recent connection attempts ({snapshot.attempts.length})
                </h3>
                {snapshot.attempts.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No connection attempts recorded.</p>
                ) : (
                  <ol className="divide-y divide-slate-100 dark:divide-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {snapshot.attempts.map((attempt, index) => (
                      <li key={`${attempt.createdAt}-${index}`} className="flex flex-wrap justify-between gap-2 px-4 py-3 bg-white dark:bg-slate-900/60">
                        <div>
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {attempt.status} · {attempt.deviceType}, {attempt.operatingSystem}, {attempt.browser}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            IP {attempt.ip}{attempt.reason ? ` · ${attempt.reason}` : ''}
                          </p>
                        </div>
                        <time className="text-[10px] text-slate-400" dateTime={attempt.createdAt}>
                          {new Date(attempt.createdAt).toLocaleString()}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-2 text-[10px] text-slate-400">Showing the latest 100 attempts; device records include every known device.</p>
              </div>
            </>
          )}
          {!snapshot && <p className="text-xs text-slate-500 dark:text-slate-400">Loading device records…</p>}
        </div>
      )}
    </section>
  )
}

export default DeviceSecurityPanel
