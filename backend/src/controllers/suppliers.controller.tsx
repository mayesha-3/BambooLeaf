import { getAddress, parseEther } from 'ethers'
import { randomUUID } from 'node:crypto'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { COLLECTIONS } from '../db/collections.tsx'
import { getDatabase } from '../db/connection.tsx'
import {
  approveSupplierChange,
  createSupplier,
  requestSupplierChange,
  setPurchaseOrder,
} from '../db/repositories/suppliers.repository.tsx'

const supplierIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeSupplier(supplier) {
  const { _id, ...safe } = supplier
  return safe
}

async function listSuppliers(request, response, next) {
  try {
    const suppliers = await getDatabase().collection(COLLECTIONS.suppliers)
      .find({}, { projection: { _id: 0 } })
      .sort({ name: 1 })
      .toArray()
    response.json({ suppliers, role: request.userRole, readOnly: request.userRole !== 'admin' })
  } catch (error) {
    next(error)
  }
}

async function addSupplier(request, response, next) {
  const { name, payoutAccount } = request.body || {}
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 ||
      typeof payoutAccount !== 'string' || payoutAccount.length > 42) {
    response.status(400).json({ error: 'Supplier name and verified EVM payout address are required.' })
    return
  }
  try {
    const supplier = await createSupplier(getDatabase(), {
      name,
      payoutAccount,
      requestedBy: request.deviceSession.walletAddress,
    })
    await appendAuditEvent(getDatabase(), {
      requestId: request.requestId || randomUUID(),
      type: 'supplier.created_pending',
      data: { supplierId: supplier.supplierId, name: supplier.name, requestedBy: request.deviceSession.walletAddress },
    })
    response.status(202).json({ supplier: safeSupplier(supplier), message: 'A second approver must verify this supplier before payment.' })
  } catch (error) {
    if (error?.code === 11000) {
      response.status(409).json({ error: 'A supplier with this name is already registered.' })
      return
    }
    next(error)
  }
}

async function editSupplier(request, response, next) {
  const supplierId = request.params.supplierId
  const { name, payoutAccount } = request.body || {}
  if (!supplierIdPattern.test(supplierId) ||
      (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 120)) ||
      (payoutAccount !== undefined && (typeof payoutAccount !== 'string' || payoutAccount.length > 42)) ||
      (name === undefined && payoutAccount === undefined)) {
    response.status(400).json({ error: 'A valid supplier and at least one valid change are required.' })
    return
  }
  try {
    if (payoutAccount !== undefined) getAddress(payoutAccount)
    const supplier = await requestSupplierChange(getDatabase(), supplierId, { name, payoutAccount }, request.deviceSession.walletAddress)
    if (!supplier) {
      response.status(409).json({ error: 'Supplier was not found or already has a pending change.' })
      return
    }
    await appendAuditEvent(getDatabase(), {
      requestId: request.requestId || randomUUID(),
      type: 'supplier.change_requested',
      data: { supplierId, changedFields: Object.keys(supplier.pendingChange).filter((key) => ['name', 'payoutAccount'].includes(key)) },
    })
    response.status(202).json({ supplier: safeSupplier(supplier), message: 'The current payout remains active until a different approver confirms this change.' })
  } catch (error) {
    if (error?.code === 11000) {
      response.status(409).json({ error: 'The requested supplier name is already registered.' })
      return
    }
    next(error)
  }
}

async function approveSupplier(request, response, next) {
  const supplierId = request.params.supplierId
  if (!supplierIdPattern.test(supplierId)) {
    response.status(400).json({ error: 'Supplier identifier is invalid.' })
    return
  }
  try {
    const supplier = await approveSupplierChange(
      getDatabase(),
      supplierId,
      request.deviceSession.walletAddress,
    )
    if (!supplier) {
      response.status(409).json({ error: 'Supplier approval requires a different approver than the requester.' })
      return
    }
    await appendAuditEvent(getDatabase(), {
      requestId: request.requestId || randomUUID(),
      type: 'supplier.verified',
      data: { supplierId, approvedBy: request.deviceSession.walletAddress, status: supplier.status },
    })
    response.json({ supplier: safeSupplier(supplier), message: 'Supplier payout details are now verified.' })
  } catch (error) {
    next(error)
  }
}

async function listPurchaseOrders(request, response, next) {
  try {
    const purchaseOrders = await getDatabase().collection(COLLECTIONS.purchaseOrders)
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray()
    response.json({ purchaseOrders })
  } catch (error) {
    next(error)
  }
}

async function addPurchaseOrder(request, response, next) {
  const { supplierId, reference, amountEth, toleranceBps } = request.body || {}
  let validAmount = false
  try {
    validAmount = typeof amountEth === 'string' && /^\d+(?:\.\d{1,18})?$/.test(amountEth) &&
      parseEther(amountEth) > 0n && parseEther(amountEth) <= parseEther('1000000')
  } catch {
    validAmount = false
  }
  if (typeof supplierId !== 'string' || !supplierIdPattern.test(supplierId) ||
      typeof reference !== 'string' || !reference.trim() || reference.trim().length > 100 ||
      !validAmount ||
      !Number.isInteger(toleranceBps) || toleranceBps < 0 || toleranceBps > 10000) {
    response.status(400).json({ error: 'Purchase order requires a supplier, reference, positive ETH amount, and tolerance between 0 and 10000 bps.' })
    return
  }
  try {
    const supplier = await getDatabase().collection(COLLECTIONS.suppliers)
      .findOne({ supplierId, status: 'active' })
    if (!supplier) {
      response.status(409).json({ error: 'Purchase orders require an active verified supplier.' })
      return
    }
    const purchaseOrder = await setPurchaseOrder(getDatabase(), {
      supplierId,
      reference: reference.trim(),
      amountEth,
      toleranceBps,
      createdBy: request.deviceSession.walletAddress,
    })
    await appendAuditEvent(getDatabase(), {
      requestId: request.requestId || randomUUID(),
      type: 'purchase_order.created',
      data: { supplierId, reference: purchaseOrder.reference, amountEth, toleranceBps },
    })
    response.status(201).json({ purchaseOrder })
  } catch (error) {
    if (error?.code === 11000) {
      response.status(409).json({ error: 'Purchase order reference already exists for this supplier.' })
      return
    }
    next(error)
  }
}

export { addPurchaseOrder, addSupplier, approveSupplier, editSupplier, listPurchaseOrders, listSuppliers }
