import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiBaseUrl } from '../config/api'
import { authenticatedFetch } from '../lib/device-session'
import Card from '../components/ui/Card'
import PageHeading from '../components/ui/PageHeading'

type Supplier = {
  supplierId: string
  name: string
  payoutAccount: string
  status: string
  requestedBy: string
  pendingChange?: { name: string; payoutAccount: string; requestedBy: string }
}

type Invoice = {
  invoiceId: string
  supplierName: string
  invoiceNumber: string
  amountEth: string
  poReference: string
  status: string
  escalationReason?: string
  txHash?: string
  paymentResult?: { txHash?: string }
}

type PurchaseOrder = {
  supplierId: string
  reference: string
  amountEth: string
  toleranceBps: number
}

async function sendJson<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await authenticatedFetch(`${apiBaseUrl}${url}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`)
  return payload
}

export default function PaymentsPage() {
  const [role, setRole] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [supplierName, setSupplierName] = useState('')
  const [payoutAccount, setPayoutAccount] = useState('')
  const [editSupplierId, setEditSupplierId] = useState('')
  const [editName, setEditName] = useState('')
  const [editPayoutAccount, setEditPayoutAccount] = useState('')
  const [poSupplierId, setPoSupplierId] = useState('')
  const [poReference, setPoReference] = useState('')
  const [poAmountEth, setPoAmountEth] = useState('')
  const [poToleranceBps, setPoToleranceBps] = useState('0')
  const [invoiceSupplier, setInvoiceSupplier] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceAmountEth, setInvoiceAmountEth] = useState('')
  const [invoiceAccount, setInvoiceAccount] = useState('')
  const [invoicePoReference, setInvoicePoReference] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [supplierResult, orderResult, invoiceResult] = await Promise.all([
        sendJson<{ suppliers: Supplier[]; role: string }>('/suppliers'),
        sendJson<{ purchaseOrders: PurchaseOrder[] }>('/suppliers/purchase-orders'),
        sendJson<{ invoices: Invoice[] }>('/invoices'),
      ])
      setError('')
      setRole(supplierResult.role)
      setSuppliers(supplierResult.suppliers)
      setPurchaseOrders(orderResult.purchaseOrders)
      setInvoices(invoiceResult.invoices)
      const activeSupplier = supplierResult.suppliers.find((item) => item.status === 'active')
      if (activeSupplier) {
        setInvoiceSupplier((current) => current || activeSupplier.name)
        setPoSupplierId((current) => current || activeSupplier.supplierId)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the supplier and invoice records.')
    }
  }, [])

  useEffect(() => {
    const refresh = Promise.resolve().then(loadData)
    void refresh
  }, [loadData])

  async function runAction(event: FormEvent<HTMLFormElement>, action: () => Promise<string>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setNotice(await action())
      await loadData()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed.')
    } finally {
      setBusy(false)
    }
  }

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    await runAction(event, async () => {
      const result = await sendJson<{
        status: string
        reason?: string
        explanation?: string
        txHash?: string
        approval?: { id: string }
      }>('/invoices', 'POST', {
        supplierName: invoiceSupplier,
        invoiceNumber,
        amountEth: invoiceAmountEth,
        invoiceAccount,
        poReference: invoicePoReference,
      })
      return [
        `Invoice ${result.status}.`,
        result.explanation || result.reason || '',
        result.txHash ? `Transaction: ${result.txHash}` : '',
        result.approval ? `Approval request: ${result.approval.id}` : '',
      ].filter(Boolean).join(' ')
    })
  }

  return (
    <>
      <PageHeading
        eyebrow="Verified destination only"
        title="Supplier payments"
        description="The registry—not invoice content—supplies the payout destination. Account mismatches, duplicates, missing POs, and out-of-tolerance amounts are held for human review."
        action={<span className="rounded-full border px-3 py-1.5 text-xs font-bold uppercase">{role || 'Sign in required'}</span>}
      />
      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-lime-200 bg-lime-50 p-3 text-sm text-lime-900">{notice}</p>}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-bold">Verified supplier registry</h2>
          <p className="mb-4 mt-1 text-xs text-slate-500">New and changed payout details require a different approver before they become active.</p>
          {role === 'admin' && (
            <div className="space-y-3 border-b pb-4">
              <form onSubmit={(event) => void runAction(event, async () => {
                await sendJson('/suppliers', 'POST', { name: supplierName, payoutAccount })
                setSupplierName('')
                setPayoutAccount('')
                return 'Supplier added as pending approval.'
              })} className="grid gap-2 sm:grid-cols-2">
                <input required maxLength={120} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Supplier name" className="rounded-lg border p-2 text-sm" />
                <input required value={payoutAccount} onChange={(event) => setPayoutAccount(event.target.value)} placeholder="Verified Sepolia EVM address" className="rounded-lg border p-2 font-mono text-xs" />
                <button disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white sm:col-span-2">Add supplier for second approval</button>
              </form>
              <form onSubmit={(event) => void runAction(event, async () => {
                const payload: Record<string, string> = {}
                if (editName.trim()) payload.name = editName.trim()
                if (editPayoutAccount.trim()) payload.payoutAccount = editPayoutAccount.trim()
                await sendJson(`/suppliers/${editSupplierId}`, 'PUT', payload)
                setEditName('')
                setEditPayoutAccount('')
                return 'Supplier change requested; the existing verified payout remains active until approval.'
              })} className="grid gap-2 sm:grid-cols-3">
                <select required value={editSupplierId} onChange={(event) => setEditSupplierId(event.target.value)} className="rounded-lg border p-2 text-xs">
                  <option value="">Select active supplier</option>
                  {suppliers.filter((supplier) => supplier.status === 'active').map((supplier) => <option key={supplier.supplierId} value={supplier.supplierId}>{supplier.name}</option>)}
                </select>
                <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="New name (optional)" className="rounded-lg border p-2 text-xs" />
                <input value={editPayoutAccount} onChange={(event) => setEditPayoutAccount(event.target.value)} placeholder="New payout address (optional)" className="rounded-lg border p-2 font-mono text-xs" />
                <button disabled={busy || !editSupplierId || (!editName.trim() && !editPayoutAccount.trim())} className="rounded-lg border px-3 py-2 text-xs font-bold sm:col-span-3">Request supplier change</button>
              </form>
            </div>
          )}
          <div className="mt-4 space-y-3">
            {suppliers.map((supplier) => (
              <div key={supplier.supplierId} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{supplier.name}</p>
                  <span className="rounded-full border px-2 py-1 text-[10px] font-bold uppercase">{supplier.status}</span>
                </div>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{supplier.payoutAccount}</p>
                {supplier.pendingChange && <p className="mt-2 break-all text-xs text-amber-700">Pending: {supplier.pendingChange.name} · {supplier.pendingChange.payoutAccount}</p>}
                {role === 'approver' && (supplier.status === 'pending_approval' || supplier.pendingChange) && (
                  <button type="button" disabled={busy} onClick={() => {
                    setBusy(true)
                    void sendJson(`/suppliers/${supplier.supplierId}/approve`, 'POST', {}).then(async () => {
                      setNotice('Supplier registry change approved and audited.')
                      await loadData()
                    }).catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : 'Approval failed.')).finally(() => setBusy(false))
                  }} className="mt-3 rounded-lg bg-lime-600 px-3 py-2 text-xs font-bold text-white">Approve as second approver</button>
                )}
              </div>
            ))}
            {!suppliers.length && <p className="text-xs text-slate-500">No supplier records.</p>}
          </div>
        </Card>

        <div className="space-y-5">
          {role === 'admin' && (
            <Card className="p-5">
              <h2 className="text-sm font-bold">Purchase orders</h2>
              <form onSubmit={(event) => void runAction(event, async () => {
                await sendJson('/suppliers/purchase-orders', 'POST', {
                  supplierId: poSupplierId,
                  reference: poReference,
                  amountEth: poAmountEth,
                  toleranceBps: Number(poToleranceBps),
                })
                setPoReference('')
                setPoAmountEth('')
                return 'Purchase order recorded.'
              })} className="mt-3 grid gap-2 sm:grid-cols-2">
                <select required value={poSupplierId} onChange={(event) => setPoSupplierId(event.target.value)} className="rounded-lg border p-2 text-sm">
                  <option value="">Select active supplier</option>
                  {suppliers.filter((supplier) => supplier.status === 'active').map((supplier) => <option key={supplier.supplierId} value={supplier.supplierId}>{supplier.name}</option>)}
                </select>
                <input required value={poReference} onChange={(event) => setPoReference(event.target.value)} placeholder="PO reference" className="rounded-lg border p-2 text-sm" />
                <input required type="number" min="0.000000000000000001" step="any" value={poAmountEth} onChange={(event) => setPoAmountEth(event.target.value)} placeholder="PO amount (ETH)" className="rounded-lg border p-2 text-sm" />
                <input required type="number" min="0" max="10000" value={poToleranceBps} onChange={(event) => setPoToleranceBps(event.target.value)} placeholder="Tolerance in basis points" className="rounded-lg border p-2 text-sm" />
                <button disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white sm:col-span-2">Add PO</button>
              </form>
              <ul className="mt-4 space-y-2 text-xs">{purchaseOrders.map((order) => (
                <li key={`${order.supplierId}-${order.reference}`} className="rounded-lg border p-2">{order.reference} · {order.amountEth} ETH · tolerance {order.toleranceBps} bps</li>
              ))}</ul>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="text-sm font-bold">Submit structured invoice</h2>
            <p className="mb-4 mt-1 text-xs text-slate-500">Enter the extracted fields and PO reference. Raw invoice documents are not sent to an external model. The payout destination used for payment is always loaded from the verified supplier registry.</p>
            <form onSubmit={(event) => void submitInvoice(event)} className="grid gap-2 sm:grid-cols-2">
              <input required value={invoiceSupplier} onChange={(event) => setInvoiceSupplier(event.target.value)} list="active-supplier-names" placeholder="Supplier name" className="rounded-lg border p-2 text-sm" />
              <datalist id="active-supplier-names">{suppliers.filter((supplier) => supplier.status === 'active').map((supplier) => <option key={supplier.supplierId} value={supplier.name} />)}</datalist>
              <input required value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="Invoice number" className="rounded-lg border p-2 text-sm" />
              <input required type="number" min="0.000000000000000001" step="any" value={invoiceAmountEth} onChange={(event) => setInvoiceAmountEth(event.target.value)} placeholder="Amount (ETH)" className="rounded-lg border p-2 text-sm" />
              <input required value={invoiceAccount} onChange={(event) => setInvoiceAccount(event.target.value)} placeholder="Payout account shown on invoice" className="rounded-lg border p-2 font-mono text-xs" />
              <input required value={invoicePoReference} onChange={(event) => setInvoicePoReference(event.target.value)} placeholder="PO reference" className="rounded-lg border p-2 text-sm" />
              <button disabled={busy || !['admin', 'approver', 'clerk'].includes(role)} className="rounded-lg bg-lime-600 px-3 py-2 text-xs font-bold text-white sm:col-span-2">Run registry, duplicate, PO and policy checks</button>
            </form>
          </Card>
        </div>
      </div>

      <Card className="mt-5 overflow-x-auto p-5">
        <h2 className="mb-3 text-sm font-bold">Invoice register</h2>
        <table className="w-full min-w-[750px] text-left text-xs">
          <thead><tr>{['Supplier', 'Invoice', 'Amount', 'PO', 'Status', 'Outcome'].map((item) => <th key={item} className="border-b p-2">{item}</th>)}</tr></thead>
          <tbody>{invoices.map((invoice) => (
            <tr key={invoice.invoiceId} className="border-b">
              <td className="p-2">{invoice.supplierName}</td>
              <td className="p-2">{invoice.invoiceNumber}</td>
              <td className="p-2">{invoice.amountEth} ETH</td>
              <td className="p-2">{invoice.poReference}</td>
              <td className="p-2 font-bold">{invoice.status}</td>
              <td className="max-w-md p-2 break-all">{invoice.escalationReason || invoice.paymentResult?.txHash || invoice.txHash || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        {!invoices.length && <p className="py-4 text-center text-xs text-slate-500">No invoices submitted.</p>}
      </Card>
    </>
  )
}
