import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { authenticatedFetch, clearDeviceSession, enrollOrLoginDevice, getDeviceSessionToken } from '../../lib/device-session'

type DeviceRecord = {
  deviceId: string
  walletAddress: string
  status: string
  observedIps?: string[]
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
type TrustedIp = { ip: string }
type RoleAccount = {
  walletAddress: string
  role: 'admin' | 'approver' | 'clerk' | 'auditor' | null
  source: string
  deviceCount: number
  lastSeenAt: string | null
  updatedAt?: string
}
type DeviceSnapshot = {
  walletAddress: string
  role: string
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
  const [roleAccounts, setRoleAccounts] = useState<RoleAccount[]>([])
  const [roleSelections, setRoleSelections] = useState<Record<string, string>>({})
  const [trustedIpAddresses, setTrustedIpAddresses] = useState<string[]>([])
  const [newWalletAddress, setNewWalletAddress] = useState('')
  const [newWalletRole, setNewWalletRole] = useState('clerk')
  const [error, setError] = useState('')
  const [pendingApproval, setPendingApproval] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    try {
      const storedToken = getDeviceSessionToken()
      const storedDeviceId = window.localStorage.getItem('bambooleaf-device-id')
      const currentDeviceId = storedDeviceId || window.crypto.randomUUID()
      if (!storedDeviceId) window.localStorage.setItem('bambooleaf-device-id', currentDeviceId)
      void Promise.resolve().then(() => {
        if (!active) return
        setToken(storedToken || '')
        setDeviceId(currentDeviceId)
      })
    } catch {
      void Promise.resolve().then(() => {
        if (active) setError('Browser storage is unavailable; device security cannot identify this browser.')
      })
    }
    return () => { active = false }
  }, [])

  const loadDevices = useCallback(async (sessionToken: string) => {
    const response = await authenticatedFetch(`${apiBaseUrl}/devices`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
    const payload = await response.json() as DeviceSnapshot & { error?: string }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearDeviceSession()
        setToken('')
      }
      throw new Error(payload.error || `Device request failed (${response.status})`)
    }
    setSnapshot(payload)
    if (payload.role === 'admin') {
      const rolesResponse = await authenticatedFetch(`${apiBaseUrl}/roles`)
      const rolesPayload = await rolesResponse.json() as { accounts?: RoleAccount[]; error?: string }
      if (!rolesResponse.ok) throw new Error(rolesPayload.error || `Role list request failed (${rolesResponse.status})`)
      const trustedResponse = await authenticatedFetch(`${apiBaseUrl}/security/trusted-ips`)
      const trustedPayload = await trustedResponse.json() as { trustedIps?: TrustedIp[]; error?: string }
      if (!trustedResponse.ok) throw new Error(trustedPayload.error || `Trusted IP request failed (${trustedResponse.status})`)
      const accounts = rolesPayload.accounts || []
      setRoleAccounts(accounts)
      setTrustedIpAddresses((trustedPayload.trustedIps || []).map((item) => item.ip))
      setRoleSelections(Object.fromEntries(accounts.map((account) => [
        account.walletAddress,
        account.role || '',
      ])))
    } else {
      setRoleAccounts([])
      setRoleSelections({})
      setTrustedIpAddresses([])
    }
    setError('')
  }, [apiBaseUrl])

  useEffect(() => {
    if (!token) return
    const request = Promise.resolve().then(() => loadDevices(token))
    void request.catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load device activity.')
    })
  }, [loadDevices, token])

  const connectWallet = async () => {
    setBusy(true)
    setError('')
    setPendingApproval(false)
    try {
      const wallet = (window as Window & { ethereum?: InjectedWallet }).ethereum
      if (!wallet) throw new Error('No browser wallet was found. Install or unlock a wallet extension and try again.')
      const result = await enrollOrLoginDevice(wallet)
      setDeviceId(result.deviceId)
      if (result.status === 'pending') {
        setPendingApproval(true)
        return
      }
      setToken(result.token || '')
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
      const response = await authenticatedFetch(`${apiBaseUrl}/devices/blocks`, {
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

  void changeBlock

  const reviewDevice = async (device: DeviceRecord, action: 'approve' | 'revoke') => {
    if (!token) return
    setBusy(true)
    setError('')
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/devices/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: device.walletAddress, deviceId: device.deviceId }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || `Device ${action} failed (${response.status})`)
      await loadDevices(token)
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : `Unable to ${action} device.`)
    } finally {
      setBusy(false)
    }

  }

  const saveAccountRole = async (walletAddress: string, role: string) => {
    if (!token) return
    setBusy(true)
    setError('')
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, role: role || null }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || `Role update failed (${response.status})`)
      await loadDevices(token)
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : 'Unable to update account role.')
    } finally {
      setBusy(false)
    }
  }
  const addWalletRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await saveAccountRole(newWalletAddress.trim(), newWalletRole)
    setNewWalletAddress('')
  }

  const trustLoginIp = async (ip: string) => {
    setBusy(true)
    setError('')
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/security/trusted-ips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || `Could not trust IP (${response.status})`)
      await loadDevices(token)
    } catch (trustError) {
      setError(trustError instanceof Error ? trustError.message : 'Unable to trust this IP address.')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    if (!token) return
    setBusy(true)
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/devices/session`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`Session revocation failed (${response.status})`)
    } catch {
      setError('Could not confirm server sign-out. The local session was still cleared.')
    } finally {
      clearDeviceSession()
      setToken('')
      setSnapshot(null)
      setBusy(false)
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-slate-100/90 dark:border-slate-800/80 bg-white dark:bg-[#0f172a] shadow-sm text-slate-900 dark:text-slate-100 transition-colors duration-200" aria-labelledby="device-security-heading">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 px-6 py-5">
        <div>
          <h2 id="device-security-heading" className="text-sm font-bold text-slate-900 dark:text-white">Devices & sign-in attempts</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
            A non-extractable browser key and wallet signature prove device enrollment. Browser, OS, and observed IP are descriptive only—not proof of identity.
          </p>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-400">
            If IP shows 127.0.0.1 or ::1, the app is seeing local loopback (common when the backend runs on this computer), not your public IP. Behind a reverse proxy, configure TRUST_PROXY_HOPS to match only your trusted proxy chain.
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

      {pendingApproval && (
        <p role="status" aria-live="polite" className="mx-6 mt-4 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          This wallet’s device access request is pending admin approval. It will remain pending until an admin approves it.
        </p>
      )}

      {!token ? (
        <p className="px-6 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          Verify your wallet to enroll this browser key. The configured owner wallet is approved by its wallet signature; other wallets’ devices wait for admin approval.
        </p>
      ) : (
        <div className="space-y-6 p-6">
          {snapshot && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Wallet <span className="font-mono text-slate-900 dark:text-white">{snapshot.walletAddress}</span>
                </p>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {snapshot.role === 'admin' ? 'Admin device registry' : `Signed in as ${snapshot.role}`}
                </p>
              </div>

              {snapshot.role === 'admin' && (
                <div className="rounded-2xl border border-lime-200 bg-lime-50/50 p-4 dark:border-lime-900/50 dark:bg-lime-950/20">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Accounts & role assignments</h3>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Wallets that enroll appear here automatically. You can also add a friend’s wallet before they enroll. The configured owner account is protected and cannot be reassigned.
                  </p>
                  <form onSubmit={(event) => void addWalletRole(event)} className="mt-3 flex flex-wrap gap-2">
                    <input
                      required
                      aria-label="Wallet address to add"
                      value={newWalletAddress}
                      onChange={(event) => setNewWalletAddress(event.target.value)}
                      placeholder="Friend’s wallet address"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                    <select
                      aria-label="Role for new wallet"
                      value={newWalletRole}
                      onChange={(event) => setNewWalletRole(event.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="admin">Admin</option>
                      <option value="approver">Approver</option>
                      <option value="clerk">Clerk</option>
                      <option value="auditor">Auditor</option>
                    </select>
                    <button type="submit" disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50 dark:bg-lime-400 dark:text-slate-950">
                      Add wallet
                    </button>
                  </form>
                  <div className="mt-3 space-y-2">
                    {roleAccounts.map((account) => (
                      <div key={account.walletAddress} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="min-w-[220px] flex-1">
                          <p className="break-all font-mono text-[11px] text-slate-700 dark:text-slate-200">{account.walletAddress}</p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {account.deviceCount} enrolled device(s)
                            {account.lastSeenAt ? ` · last seen ${new Date(account.lastSeenAt).toLocaleString()}` : ' · not enrolled yet'}
                            {account.source === 'owner' ? ' · owner account' : ''}
                          </p>
                        </div>
                        <select
                          aria-label={`Role for ${account.walletAddress}`}
                          disabled={busy || account.source === 'owner'}
                          value={roleSelections[account.walletAddress] ?? ''}
                          onChange={(event) => setRoleSelections((current) => ({
                            ...current,
                            [account.walletAddress]: event.target.value,
                          }))}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="">No access</option>
                          <option value="admin">Admin</option>
                          <option value="approver">Approver</option>
                          <option value="clerk">Clerk</option>
                          <option value="auditor">Auditor</option>
                        </select>
                        <button
                          type="button"
                          disabled={busy || account.source === 'owner'}
                          onClick={() => void saveAccountRole(account.walletAddress, roleSelections[account.walletAddress] ?? '')}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-50 dark:border-slate-700"
                        >
                          Save role
                        </button>
                      </div>
                    ))}
                    {!roleAccounts.length && <p className="text-xs text-slate-500">No wallets discovered yet. Add a wallet above to pre-assign access.</p>}
                  </div>
                </div>
              )}

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
                      const canManage = snapshot.role === 'admin'
                      return (
                        <div key={device.deviceId} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/40">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {device.deviceType} · {device.operatingSystem} · {device.browser}
                                <span className={`ml-2 rounded-full px-2 py-1 text-[10px] font-bold ${device.status === 'approved' ? 'bg-lime-50 text-lime-800 dark:bg-lime-950/50 dark:text-lime-300' : device.status === 'revoked' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'}`}>{device.status || 'pending'}</span>
                                {current && <span className="ml-2 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">This device</span>}
                              </p>
                              <p className="mt-1 break-all font-mono text-[10px] text-slate-500 dark:text-slate-400">Device ID {device.deviceId}</p>
                              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                                Wallet {device.walletAddress} · observed IP {device.ip} · {device.attemptCount} sign-in attempt(s)
                              </p>
                              <p className="mt-1 text-[11px] text-slate-400">
                                First seen {new Date(device.firstSeenAt).toLocaleString()} · Last seen {new Date(device.lastSeenAt).toLocaleString()}
                                {device.lastSuccessfulLoginAt && ` · Last successful sign-in ${new Date(device.lastSuccessfulLoginAt).toLocaleString()}`}
                              </p>
                              <p className="mt-1 text-[10px] text-slate-400">Browser and OS are inferred from the client-provided user-agent string; they may differ and are not verified hardware identity.</p>
                              <details className="mt-2">
                                <summary className="cursor-pointer text-[11px] font-semibold text-[#65A30D] dark:text-lime-400">Device specifications</summary>
                                <p className="mt-1 break-all text-[10px] leading-4 text-slate-500 dark:text-slate-400">{device.userAgent || 'Browser did not provide a user-agent string.'} · Observed IPs: {(device.observedIps || []).join(', ') || device.ip || 'not recorded'}. These are descriptive, not security proof.</p>
                              </details>
                            </div>
                            {canManage && (
                              <div className="flex flex-wrap gap-2">
                                {device.status === 'pending' && <button type="button" disabled={busy} onClick={() => void reviewDevice(device, 'approve')} className="rounded-full bg-lime-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">Approve device</button>}
                                {device.status !== 'revoked' && <button type="button" disabled={busy} onClick={() => void reviewDevice(device, 'revoke')} className="rounded-full border border-rose-300 px-3 py-1.5 text-[11px] font-bold text-rose-700 disabled:opacity-50">Revoke now</button>}
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
                          {snapshot.role === 'admin' && attempt.ip !== 'unknown' && (
                            <button
                              type="button"
                              disabled={busy || trustedIpAddresses.includes(attempt.ip)}
                              onClick={() => void trustLoginIp(attempt.ip)}
                              className="mt-2 rounded-lg border border-lime-300 px-2.5 py-1 text-[10px] font-bold text-lime-800 disabled:opacity-50 dark:text-lime-300"
                            >
                              {trustedIpAddresses.includes(attempt.ip) ? 'IP trusted · manage in Settings' : 'Trust this IP in Settings'}
                            </button>
                          )}
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
