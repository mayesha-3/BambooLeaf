import { useEffect, useState, type FormEvent } from 'react'
import { apiBaseUrl } from '../config/api'
import { authenticatedFetch } from '../lib/device-session'
import Card from '../components/ui/Card'

type TrustedIp = {
  ip: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export default function TrustedIpSettings() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [trustedIps, setTrustedIps] = useState<TrustedIp[]>([])
  const [ip, setIp] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function loadTrustedIps() {
    const sessionResponse = await authenticatedFetch(`${apiBaseUrl}/devices`)
    if (!sessionResponse.ok) return
    const session = await sessionResponse.json() as { role?: string }
    if (session.role !== 'admin') return
    setIsAdmin(true)
    const response = await authenticatedFetch(`${apiBaseUrl}/security/trusted-ips`)
    const payload = await response.json() as { trustedIps?: TrustedIp[]; error?: string }
    if (!response.ok) throw new Error(payload.error || `Trusted IP request failed (${response.status})`)
    setTrustedIps(payload.trustedIps || [])
    setError('')
  }

  useEffect(() => {
    const load = Promise.resolve().then(loadTrustedIps)
    void load.catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load trusted IP addresses.')
    }).finally(() => setLoading(false))
  }, [])

  async function addIp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/security/trusted-ips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: ip.trim() }),
      })
      const payload = await response.json() as { trustedIp?: TrustedIp; error?: string }
      if (!response.ok) throw new Error(payload.error || `Could not trust IP (${response.status})`)
      setIp('')
      setNotice('IP added to the admin trusted-IP list. Device approval and signature checks still apply.')
      await loadTrustedIps()
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Unable to trust this IP address.')
    } finally {
      setBusy(false)
    }
  }

  async function removeIp(address: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/security/trusted-ips`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: address }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || `Could not remove IP (${response.status})`)
      setNotice(`${address} removed from the trusted-IP list.`)
      await loadTrustedIps()
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove this IP address.')
    } finally {
      setBusy(false)
    }
  }

  if (loading || !isAdmin) return null

  return (
    <Card className="p-6 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Trusted IP addresses</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
            Admin-only list for recognizing expected sign-in locations. Trusting an IP only labels it for review; it does not approve devices, bypass wallet/device-key proofs, or block other IPs.
          </p>
        </div>
        <span className="rounded-full border border-lime-300 px-2.5 py-1 text-[10px] font-bold uppercase text-lime-800 dark:text-lime-300">Admin only</span>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-lime-200 bg-lime-50 p-3 text-xs text-lime-900">{notice}</p>}

      <form onSubmit={(event) => void addIp(event)} className="mt-4 flex flex-wrap gap-2">
        <input
          required
          value={ip}
          onChange={(event) => setIp(event.target.value)}
          placeholder="IPv4 or IPv6 address"
          aria-label="IP address to trust"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
        />
        <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 dark:bg-lime-400 dark:text-slate-950">
          Add trusted IP
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {trustedIps.map((trustedIp) => (
          <div key={trustedIp.ip} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="min-w-[220px] flex-1">
              <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">{trustedIp.ip}</p>
              <p className="mt-1 text-[10px] text-slate-400">
                Added {new Date(trustedIp.createdAt).toLocaleString()} by {trustedIp.createdBy}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void removeIp(trustedIp.ip)}
              className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ))}
        {!trustedIps.length && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-slate-500">No trusted IP addresses have been added.</p>}
      </div>
    </Card>
  )
}
