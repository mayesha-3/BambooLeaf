import { getAddress, parseEther } from 'ethers'
import { randomUUID } from 'node:crypto'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { COLLECTIONS } from '../db/collections.tsx'
import { getDatabase } from '../db/connection.tsx'
import { normalizeSupplierName } from '../db/repositories/suppliers.repository.tsx'
import { submitVerifiedSupplierPayment } from '../services/goals.service.tsx'

function validAmount(value) {
  return typeof value === 'string' && /^\d+(?:\.\d{1,18})?$/.test(value) && Number(value) > 0
}

async function listInvoices(request, response, next) {
  try {
    const filter = request.userRole === 'clerk'
      ? { submittedBy: request.deviceSession.walletAddress }
      : {}
    const invoices = await getDatabase().collection(COLLECTIONS.invoices)
      .find(filter, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray()
    response.json({ invoices })
  } catch (error) {
    next(error)
  }
}

async function submitInvoice(request, response, next) {
  const { supplierName, invoiceNumber, amountEth, invoiceAccount, poReference } = request.body || {}
  if (typeof supplierName !== 'string' || !supplierName.trim() || supplierName.trim().length > 120 ||
      typeof invoiceNumber !== 'string' || !invoiceNumber.trim() || invoiceNumber.trim().length > 100 ||
      !validAmount(amountEth) || typeof invoiceAccount !== 'string' || invoiceAccount.length > 42 ||
      typeof poReference !== 'string' || !poReference.trim() || poReference.trim().length > 100) {
    response.status(400).json({ error: 'Structured invoice fields are required: supplier, invoice number, positive ETH amount, payout address, and PO reference.' })
    return
  }

  let normalizedInvoiceAccount
  let amountWei
  try {
    normalizedInvoiceAccount = getAddress(invoiceAccount)
    amountWei = parseEther(amountEth)
  } catch {
    response.status(400).json({ error: 'Invoice payout account or ETH amount is invalid.' })
    return
  }

  try {
    const database = getDatabase()
    const normalizedSupplierName = normalizeSupplierName(supplierName)
    const duplicate = await database.collection(COLLECTIONS.invoices).findOne({
      supplierNameNormalized: normalizedSupplierName,
      invoiceNumber: invoiceNumber.trim(),
    })
    const requestId = request.requestId || randomUUID()
    if (duplicate) {
      await appendAuditEvent(database, {
        requestId,
        type: 'invoice.duplicate_detected',
        data: { invoiceId: duplicate.invoiceId, invoiceNumber: invoiceNumber.trim(), supplierNameNormalized: normalizedSupplierName },
      })
      response.status(409).json({
        invoiceId: duplicate.invoiceId,
        status: 'duplicate',
        reason: 'This supplier invoice number has already been submitted.',
      })
      return
    }

    const supplier = await database.collection(COLLECTIONS.suppliers).findOne({
      normalizedName: normalizedSupplierName,
      status: 'active',
    })
    const invoiceId = randomUUID()
    const invoice = {
      invoiceId,
      supplierId: supplier?.supplierId || null,
      supplierName: supplier?.name || supplierName.trim(),
      supplierNameNormalized: normalizedSupplierName,
      invoiceNumber: invoiceNumber.trim(),
      amountEth,
      invoiceAccount: normalizedInvoiceAccount,
      poReference: poReference.trim(),
      submittedBy: request.deviceSession.walletAddress,
      createdAt: new Date(),
      status: 'processing',
    }
    await database.collection(COLLECTIONS.invoices).insertOne(invoice)

    const escalate = async (status, reason, auditType) => {
      await database.collection(COLLECTIONS.invoices).updateOne(
        { invoiceId, status: 'processing' },
        { $set: { status, escalationReason: reason, reviewedBy: 'treasurer', updatedAt: new Date() } },
      )
      await appendAuditEvent(database, {
        requestId,
        type: auditType,
        data: { invoiceId, supplierId: supplier?.supplierId || null, invoiceNumber: invoice.invoiceNumber, reason },
      })
      response.status(409).json({
        invoiceId,
        status,
        reason,
        humanReview: true,
        explanation: reason,
      })
    }

    if (!supplier) {
      await escalate('escalated', 'Supplier is not in the verified supplier registry.', 'invoice.unknown_supplier')
      return
    }
    if (getAddress(supplier.payoutAccount).toLowerCase() !== normalizedInvoiceAccount.toLowerCase()) {
      await escalate('escalated', 'Invoice payout account differs from the verified supplier registry.', 'invoice.bank_details_mismatch')
      return
    }

    const purchaseOrder = await database.collection(COLLECTIONS.purchaseOrders).findOne({
      supplierId: supplier.supplierId,
      reference: poReference.trim(),
    })
    if (!purchaseOrder) {
      await escalate('escalated', 'Purchase order reference was not found for this supplier.', 'invoice.purchase_order_missing')
      return
    }
    const poAmountWei = parseEther(purchaseOrder.amountEth)
    const toleranceWei = (poAmountWei * BigInt(purchaseOrder.toleranceBps)) / 10_000n
    const poInvoices = await database.collection(COLLECTIONS.invoices).find({
      supplierId: supplier.supplierId,
      poReference: poReference.trim(),
      status: { $nin: ['escalated', 'rejected'] },
    }).toArray()
    const totalInvoicedWei = poInvoices.reduce((total, item) => total + parseEther(item.amountEth), 0n)
    if (totalInvoicedWei > poAmountWei + toleranceWei) {
      await escalate('escalated', 'Invoice amount is outside the purchase-order tolerance.', 'invoice.purchase_order_tolerance_exceeded')
      return
    }

    await appendAuditEvent(database, {
      requestId,
      type: 'invoice.guard_checks_passed',
      data: { invoiceId, supplierId: supplier.supplierId, invoiceNumber: invoice.invoiceNumber, amountEth },
    })
    const result = await submitVerifiedSupplierPayment(database, invoiceId, requestId)
    const body = result.body || {}
    const status = body.status === 'confirmed' ? 'paid'
      : body.status === 'approval_required' ? 'awaiting_approval'
        : body.status === 'denied' || body.status === 'blocked' ? 'escalated'
          : 'not_executed'
    await database.collection(COLLECTIONS.invoices).updateOne(
      { invoiceId, status: 'processing' },
      {
        $set: {
          status,
          requestId,
          paymentResult: body,
          updatedAt: new Date(),
          ...(status === 'escalated' ? { reviewedBy: 'treasurer' } : {}),
        },
      },
    )
    response.status(result.statusCode).json({
      invoiceId,
      status,
      reason: body.reason || body.error,
      tier: body.tier,
      approval: body.approval,
      txHash: body.txHash,
      humanReview: status === 'awaiting_approval' || status === 'escalated',
    })
  } catch (error) {
    if (error?.code === 11000) {
      response.status(409).json({ status: 'duplicate', reason: 'This supplier invoice number has already been submitted.' })
      return
    }
    next(error)
  }
}

export { listInvoices, submitInvoice }
