const crypto = require("crypto");
const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const cache = require("../utils/cache");
const { CarbonProject, Shipment, Transaction } = require("../models");
const AuditService = require("./audit.service");
const CertificateService = require("./certificate.service");
const DocumentStorageService = require("./documentStorage.service");
const CheckoutLockService = require("./checkoutLock.service");
const MarketplaceService = require("./marketplace.service");
const LedgerService = require("./ledger.service");
const { CARBON_CREDITS_CONFIG } = require("../config/carbonCredits");

const CHECKOUT_PLATFORM_FEE_RATE = 0.02;
const ACTIVE_SHIPMENT_STATUSES = new Set(["PLANNED", "IN_TRANSIT", "DELAYED"]);

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function buildIdempotencyFingerprint(payload, companyId, actorId) {
  const shipmentIds = Array.from(new Set([
    ...(Array.isArray(payload.shipmentIds) ? payload.shipmentIds : []),
    payload.shipmentId,
  ].map((shipmentId) => String(shipmentId || "").trim()).filter(Boolean))).sort();

  const digest = crypto.createHash("sha256");
  digest.update(JSON.stringify({
    companyId,
    actorId: actorId || null,
    companyName: payload.companyName,
    projectId: payload.projectId || null,
    shipmentId: payload.shipmentId || null,
    shipmentIds,
    quantity: payload.quantity,
  }));

  return digest.digest("hex");
}

function buildSerialNumber() {
  const year = new Date().getUTCFullYear();
  const shortCode = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `CF-RET-${year}-${shortCode}`;
}

function buildPaymentReference() {
  return `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function buildRegistryRecordId() {
  const year = new Date().getUTCFullYear();
  const shortCode = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `REG-${year}-${shortCode}`;
}

function buildMockBlockchainHash(transactionId, paymentReference) {
  return `0x${crypto.createHash("sha256").update(`${transactionId}:${paymentReference}`).digest("hex").slice(0, 40)}`;
}

function isProjectPurchasableStatus(status) {
  const normalized = String(status || "").trim().toUpperCase();
  return normalized === "PUBLISHED" || normalized === "ACTIVE";
}

function calculateCheckoutTotals(quantity, pricePerTon) {
  const subtotalUsd = roundMoney(Number(quantity || 0) * Number(pricePerTon || 0));
  const platformFeeUsd = roundMoney(subtotalUsd * CHECKOUT_PLATFORM_FEE_RATE);
  const totalCostUsd = roundMoney(subtotalUsd + platformFeeUsd);

  return {
    subtotalUsd,
    platformFeeUsd,
    totalCostUsd,
  };
}

function normalizeProjectDetails(project) {
  if (!project) {
    return null;
  }

  return {
    projectName: project.name,
    registry: project.registry || project.verificationStandard || project.certification || "Gold Standard",
    vintageYear: Number(project.vintageYear || new Date().getUTCFullYear()),
    pricePerTon: Number(project.pricePerCreditUsd || project.pricePerTonUsd || 0),
  };
}

function buildCheckoutMetadata(existingMetadata = {}, updates = {}) {
  return {
    ...existingMetadata,
    checkout: {
      ...(existingMetadata.checkout || {}),
      ...updates,
    },
  };
}

function buildTransactionView(transaction) {
  const record = typeof transaction.toJSON === "function" ? transaction.toJSON() : { ...transaction };
  const certificateMetadata = record.certificate?.certificateUrl ? {
    transactionId: record.id,
    issuedAt: record.certificate.issuedAt,
    certificateUrl: record.certificate.certificateUrl,
    checksum: record.certificate.checksum,
  } : null;

  return {
    id: record.id,
    companyId: record.companyId,
    projectId: record.projectId || null,
    companyName: record.companyName,
    projectName: record.projectName,
    registry: record.registry,
    registryRecordId: record.registryRecordId || null,
    blockchainHash: record.blockchainHash || null,
    vintageYear: Number(record.vintageYear || 0),
    shipmentId: record.shipmentId || null,
    shipmentIds: Array.isArray(record.shipmentIds) && record.shipmentIds.length > 0
      ? record.shipmentIds
      : record.shipmentId
        ? [record.shipmentId]
        : [],
    shipmentReference: record.shipmentReference || null,
    shipmentReferences: Array.isArray(record.shipmentReferences) && record.shipmentReferences.length > 0
      ? record.shipmentReferences
      : record.shipmentReference
        ? [record.shipmentReference]
        : [],
    shipmentStatus: record.shipmentStatus || null,
    shipmentStatuses: Array.isArray(record.shipmentStatuses) && record.shipmentStatuses.length > 0
      ? record.shipmentStatuses
      : record.shipmentStatus
        ? [record.shipmentStatus]
        : [],
    pricePerTon: Number(record.pricePerTon ?? record.pricePerTonUsd ?? record.price ?? 0),
    pricePerTonUsd: Number(record.pricePerTonUsd ?? record.price ?? 0),
    quantity: Number(record.quantity ?? record.credits ?? 0),
    credits: Number(record.credits ?? record.quantity ?? 0),
    subtotalUsd: Number(record.subtotalUsd ?? Number(record.quantity ?? record.credits ?? 0) * Number(record.pricePerTon ?? record.pricePerTonUsd ?? record.price ?? 0)),
    platformFeeUsd: Number(record.platformFeeUsd ?? 0),
    totalCost: Number(record.totalCost ?? record.totalCostUsd ?? record.total ?? 0),
    totalCostUsd: Number(record.totalCostUsd ?? record.total ?? 0),
    tCO2eRetired: Number(record.tCO2eRetired ?? record.quantity ?? record.credits ?? 0),
    serialNumber: record.serialNumber || null,
    status: record.status,
    paymentReference: record.paymentReference,
    createdAt: record.createdAt,
    completedAt: record.completedAt || null,
    retiredAt: record.retiredAt || record.completedAt || null,
    idempotencyKey: record.idempotencyKey || null,
    requestChecksum: record.requestChecksum || null,
    lockId: record.metadata?.checkout?.lockId || null,
    lockExpiresAt: record.metadata?.checkout?.lockExpiresAt || null,
    lockStatus: record.metadata?.checkout?.lockStatus || null,
    certificateMetadata,
    certificate: record.certificate || null,
    metadata: record.metadata || {},
  };
}

function buildCheckoutStartResult(transaction) {
  const view = buildTransactionView(transaction);

  return {
    transactionId: view.id,
    status: view.status,
    paymentReference: view.paymentReference,
    createdAt: view.createdAt,
    lockId: view.lockId,
    lockExpiresAt: view.lockExpiresAt,
  };
}

function isTransactionUnsupportedError(error) {
  const message = String(error?.message || "");
  return message.includes("Transaction numbers are only allowed on a replica set member or mongos")
    || message.includes("Transaction is not supported")
    || message.includes("does not support retryable writes");
}

async function executeMongoTransaction(work) {
  const session = await mongoose.startSession();

  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });

    return {
      result,
      usedTransaction: true,
    };
  } catch (error) {
    if (!isTransactionUnsupportedError(error)) {
      throw error;
    }

    logger.warn("credits.checkout.mongo_transaction_unavailable", {
      message: error.message,
    });

    return {
      result: await work(null),
      usedTransaction: false,
    };
  } finally {
    await session.endSession();
  }
}

async function restoreProjectCompletion(transaction, options = {}) {
  if (!transaction?.projectId) {
    return;
  }

  const restoreReservation = Boolean(options.restoreReservation);
  const quantity = Number(transaction.credits || transaction.quantity || 0);

  if (quantity <= 0) {
    return;
  }

  await CarbonProject.findOneAndUpdate(
    {
      _id: transaction.projectId,
      companyId: transaction.companyId,
    },
    {
      $inc: {
        availableCredits: quantity,
        retiredCredits: -quantity,
        ...(restoreReservation ? { reservedCredits: quantity } : {}),
      },
    },
  );
}

function normalizeLinkedShipmentIds(payload = {}) {
  const ids = [];

  if (Array.isArray(payload.shipmentIds)) {
    ids.push(...payload.shipmentIds);
  }

  if (payload.shipmentId) {
    ids.push(payload.shipmentId);
  }

  return Array.from(new Set(
    ids.map((shipmentId) => String(shipmentId || "").trim()).filter(Boolean),
  ));
}

async function getActiveShipmentsOrFail(shipmentIds, companyId) {
  if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
    return [];
  }

  const shipments = await Shipment.find({
    _id: { $in: shipmentIds },
    companyId,
  });

  const shipmentMap = new Map(shipments.map((shipment) => [String(shipment.id || shipment._id), shipment]));
  const orderedShipments = shipmentIds.map((shipmentId) => shipmentMap.get(shipmentId)).filter(Boolean);

  if (orderedShipments.length !== shipmentIds.length) {
    throw new ApiError(404, "One or more linked shipments were not found.");
  }

  const inactiveShipment = orderedShipments.find(
    (shipment) => !ACTIVE_SHIPMENT_STATUSES.has(String(shipment.status || "").toUpperCase()),
  );

  if (inactiveShipment) {
    throw new ApiError(409, "Only active shipments can be linked to a checkout.");
  }

  return orderedShipments;
}

class TransactionService {
  static async markTransactionFailed(transaction, actor, reason, ipAddress = null, options = {}) {
    const updated = await Transaction.findOneAndUpdate(
      {
        _id: transaction.id,
        companyId: transaction.companyId,
        status: "PENDING",
      },
      {
        $set: {
          status: "FAILED",
          completedAt: null,
          retiredAt: null,
          "metadata.failureReason": reason,
          "metadata.checkout.processingStartedAt": null,
          ...(options.lockStatus ? { "metadata.checkout.lockStatus": options.lockStatus } : {}),
        },
      },
      { new: true },
    );

    if (updated) {
      await AuditService.log({
        companyId: updated.companyId,
        userId: actor?.id || updated.userId || null,
        userEmail: actor?.email || updated.metadata?.initiatedBy?.userEmail || null,
        ipAddress,
        action: "credits.checkout.failed",
        entityType: "CarbonCreditTransaction",
        entityId: updated.id,
        details: {
          reason,
          paymentReference: updated.paymentReference,
        },
      });
    }

    return updated || transaction;
  }

  static async syncPendingTransactionState(transaction, actor = null, options = {}) {
    if (!transaction || transaction.status !== "PENDING") {
      return transaction;
    }

    try {
      await CheckoutLockService.ensureActiveLock(transaction, {
        session: options.session || null,
      });
      return transaction;
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 409) {
        throw error;
      }

      return this.markTransactionFailed(transaction, actor, error.message, options.ipAddress || null, {
        lockStatus: "EXPIRED",
      });
    }
  }

  static async getExistingIdempotentTransaction(payload, companyId, actor, options = {}) {
    const effectiveIdempotencyKey = options.idempotencyKey || null;
    const requestChecksum = buildIdempotencyFingerprint(payload, companyId, actor?.id);
    const existing = effectiveIdempotencyKey
      ? await Transaction.findOne({ companyId, idempotencyKey: effectiveIdempotencyKey }).sort({ createdAt: -1 })
      : await Transaction.findOne({
        companyId,
        requestChecksum,
        createdAt: {
          $gte: new Date(Date.now() - CARBON_CREDITS_CONFIG.idempotencyWindowMs),
        },
      }).sort({ createdAt: -1 });

    if (!existing) {
      return {
        existing: null,
        requestChecksum,
      };
    }

    const synced = await this.syncPendingTransactionState(existing, actor, options);
    return {
      existing: synced,
      requestChecksum,
    };
  }

  static async startCheckout(payload, companyId, actor = null, options = {}) {
    const quantity = Number(payload.quantity);
    const effectiveIdempotencyKey = options.idempotencyKey || null;
    const ipAddress = options.ipAddress || null;

    if (!payload.companyName?.trim()) {
      throw new ApiError(422, "companyName is required.");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(422, "quantity must be greater than zero.");
    }

    const { existing, requestChecksum } = await this.getExistingIdempotentTransaction(
      payload,
      companyId,
      actor,
      { idempotencyKey: effectiveIdempotencyKey, ipAddress },
    );

    if (existing) {
      return buildCheckoutStartResult(existing);
    }

    await CheckoutLockService.releaseExpiredLocks({
      companyId,
      projectId: payload.projectId,
      limit: 10,
    });

    const project = await CarbonProject.findOne({
      _id: payload.projectId,
      companyId,
    });

    if (!project) {
      throw new ApiError(404, "Carbon project not found for checkout.");
    }

    const projectDetails = normalizeProjectDetails(project);
    const pricePerTon = Number(projectDetails?.pricePerTon || 0);
    const linkedShipmentIds = normalizeLinkedShipmentIds(payload);
    const linkedShipments = await getActiveShipmentsOrFail(linkedShipmentIds, companyId);
    const primaryLinkedShipment = linkedShipments[0] || null;

    if (pricePerTon <= 0) {
      throw new ApiError(422, "pricePerTon must be greater than zero.");
    }

    if (!isProjectPurchasableStatus(project.status)) {
      throw new ApiError(409, "This listing is not currently available for purchase.");
    }

    const totals = calculateCheckoutTotals(quantity, pricePerTon);
    const transactionId = crypto.randomUUID();
    const lockExpiresAt = CheckoutLockService.buildExpiryDate();
    const transactionInput = {
      _id: transactionId,
      companyId,
      userId: actor?.id || null,
      type: "RETIREMENT",
      status: "PENDING",
      companyName: payload.companyName.trim(),
      projectId: payload.projectId,
      projectName: projectDetails.projectName,
      registry: projectDetails.registry,
      vintageYear: projectDetails.vintageYear,
      shipmentId: primaryLinkedShipment?.id || null,
      shipmentIds: linkedShipments.map((shipment) => shipment.id),
      shipmentReference: primaryLinkedShipment?.reference || null,
      shipmentReferences: linkedShipments.map((shipment) => shipment.reference || shipment.id),
      shipmentStatus: primaryLinkedShipment?.status || null,
      shipmentStatuses: linkedShipments.map((shipment) => shipment.status),
      price: pricePerTon,
      pricePerTonUsd: pricePerTon,
      pricePerTon,
      credits: quantity,
      quantity,
      subtotalUsd: totals.subtotalUsd,
      platformFeeUsd: totals.platformFeeUsd,
      total: totals.totalCostUsd,
      totalCostUsd: totals.totalCostUsd,
      totalCost: totals.totalCostUsd,
      tCO2eRetired: quantity,
      serialNumber: null,
      paymentReference: buildPaymentReference(),
      idempotencyKey: effectiveIdempotencyKey,
      requestChecksum,
      retiredAt: null,
      completedAt: null,
      metadata: {
        initiatedBy: {
          userId: actor?.id || null,
          userEmail: actor?.email || null,
          ipAddress,
        },
        checkout: {
          lockId: null,
          lockExpiresAt,
          lockStatus: "PENDING",
          reservationCreatedAt: new Date(),
          processingStartedAt: null,
          linkedShipmentCount: linkedShipments.length,
        },
      },
    };

    let transaction;
    try {
      transaction = await Transaction.create(transactionInput);
    } catch (error) {
      if (error?.code === 11000 && error?.keyPattern?.idempotencyKey) {
        const duplicate = await Transaction.findOne({ companyId, idempotencyKey: effectiveIdempotencyKey });
        if (duplicate) {
          const synced = await this.syncPendingTransactionState(duplicate, actor, { ipAddress });
          return buildCheckoutStartResult(synced);
        }
      }

      throw error;
    }

    let lock = null;

    try {
      const locked = await CheckoutLockService.lockCredits(
        project.id,
        quantity,
        actor?.id || null,
        companyId,
        transaction.id,
        { expiresAt: lockExpiresAt },
      );
      lock = locked.lock;

      const updated = await Transaction.findOneAndUpdate(
        {
          _id: transaction.id,
          companyId,
          status: "PENDING",
        },
        {
          $set: {
            metadata: buildCheckoutMetadata(transaction.metadata, {
              lockId: lock.id,
              lockExpiresAt: lock.expiresAt,
              lockStatus: "ACTIVE",
            }),
          },
        },
        { new: true },
      );

      if (!updated) {
        throw new ApiError(409, "Checkout transaction could not be reserved.");
      }

      await AuditService.log({
        companyId,
        userId: actor?.id || null,
        userEmail: actor?.email || null,
        ipAddress,
        action: "credits.checkout.started",
        entityType: "CarbonCreditTransaction",
        entityId: updated.id,
        details: {
          projectId: updated.projectId,
          projectName: updated.projectName,
          quantity: updated.credits,
          lockId: lock.id,
          lockExpiresAt: lock.expiresAt,
        },
      });

      return buildCheckoutStartResult(updated);
    } catch (error) {
      if (lock) {
        await CheckoutLockService.releaseLock(lock.id, companyId, "Checkout reservation rolled back.", {
          status: "RELEASED",
        });
      }

      await this.markTransactionFailed(transaction, actor, error.message, ipAddress, {
        lockStatus: "RELEASED",
      });
      throw error;
    }
  }

  static async finalizeTransaction(transactionId, companyId, actor = null, options = {}) {
    const ipAddress = options.ipAddress || null;
    let transaction = await Transaction.findOne({ _id: transactionId, companyId });

    if (!transaction) {
      throw new ApiError(404, "Carbon credit transaction not found.");
    }

    if (transaction.status === "COMPLETED") {
      return buildTransactionView(transaction);
    }

    if (transaction.status === "FAILED") {
      throw new ApiError(409, transaction.metadata?.failureReason || "This checkout cannot be completed.");
    }

    transaction = await this.syncPendingTransactionState(transaction, actor, { ipAddress });
    if (transaction.status === "FAILED") {
      throw new ApiError(409, transaction.metadata?.failureReason || "Checkout reservation expired.");
    }

    const processingLockCutoff = new Date(Date.now() - CARBON_CREDITS_CONFIG.processingLockTimeoutMs);
    const claimed = await Transaction.findOneAndUpdate(
      {
        _id: transaction.id,
        companyId,
        status: "PENDING",
        $or: [
          { "metadata.checkout.processingStartedAt": null },
          { "metadata.checkout.processingStartedAt": { $lte: processingLockCutoff } },
        ],
      },
      {
        $set: {
          "metadata.checkout.processingStartedAt": new Date(),
        },
      },
      { new: true },
    );

    if (!claimed) {
      const current = await Transaction.findOne({ _id: transaction.id, companyId });

      if (!current) {
        throw new ApiError(404, "Carbon credit transaction not found.");
      }

      if (current.status === "COMPLETED") {
        return buildTransactionView(current);
      }

      if (current.status === "FAILED") {
        throw new ApiError(409, current.metadata?.failureReason || "This checkout cannot be completed.");
      }

      throw new ApiError(409, "This checkout is already being finalized.");
    }

    const activeLock = await CheckoutLockService.ensureActiveLock(claimed);
    const completedAt = new Date();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const serialNumber = claimed.serialNumber || buildSerialNumber();
      const registryRecordId = claimed.registryRecordId || buildRegistryRecordId();
      const blockchainHash = claimed.blockchainHash || buildMockBlockchainHash(claimed.id, claimed.paymentReference);
      let certificate = null;
      let updatedProject = null;
      let updatedTransaction = null;
      let finalizedLock = null;
      let usedMongoTransaction = false;

      try {
        certificate = await CertificateService.generateCertificate({
          ...buildTransactionView(claimed),
          serialNumber,
          status: "COMPLETED",
          completedAt,
        });

        const execution = await executeMongoTransaction(async (session) => {
          usedMongoTransaction = Boolean(session);
          updatedProject = await withSession(
            CarbonProject.findOneAndUpdate(
              {
                _id: claimed.projectId,
                companyId,
                availableCredits: { $gte: claimed.credits },
                reservedCredits: { $gte: claimed.credits },
              },
              {
                $inc: {
                  availableCredits: -claimed.credits,
                  reservedCredits: -claimed.credits,
                  retiredCredits: claimed.credits,
                },
              },
              { new: true },
            ),
            session,
          );

          if (!updatedProject) {
            throw new ApiError(409, "Not enough credits available.");
          }

          updatedTransaction = await withSession(
            Transaction.findOneAndUpdate(
              {
                _id: claimed.id,
                companyId,
                status: "PENDING",
              },
              {
                $set: {
                  status: "COMPLETED",
                  serialNumber,
                  registryRecordId,
                  blockchainHash,
                  completedAt,
                  retiredAt: completedAt,
                  certificate: {
                    transactionId: certificate.transactionId,
                    issuedAt: certificate.issuedAt,
                    certificateUrl: certificate.certificateUrl,
                    checksum: certificate.checksum,
                    certificateId: certificate.certificateId,
                    storagePath: certificate.storagePath,
                    fileName: certificate.fileName,
                  },
                  metadata: buildCheckoutMetadata(claimed.metadata, {
                    processingStartedAt: completedAt,
                    completedAt,
                    lockId: activeLock.id,
                    lockExpiresAt: activeLock.expiresAt,
                    lockStatus: "COMPLETED",
                    lockReleasedAt: completedAt,
                    lockReleaseReason: "Checkout completed successfully.",
                  }),
                },
              },
              { new: true },
            ),
            session,
          );

          if (!updatedTransaction) {
            throw new ApiError(409, "Checkout transaction could not be finalized.");
          }

          await LedgerService.linkOffsetTransactionToShipments(
            updatedTransaction,
            companyId,
            actor,
            { session },
          );

          finalizedLock = await CheckoutLockService.finalizeLock(activeLock.id, companyId, {
            session,
            finalizedAt: completedAt,
            reason: "Checkout completed successfully.",
          });

          if (!finalizedLock) {
            throw new ApiError(409, "Checkout reservation is no longer active.");
          }

          return updatedTransaction;
        });

        if (!execution.usedTransaction && updatedTransaction && !finalizedLock) {
          finalizedLock = await CheckoutLockService.finalizeLock(activeLock.id, companyId, {
            finalizedAt: completedAt,
            reason: "Checkout completed successfully.",
          });
        }

        if (!finalizedLock) {
          throw new ApiError(409, "Checkout reservation is no longer active.");
        }

        if (updatedProject?.availableCredits === 0 && isProjectPurchasableStatus(updatedProject.status)) {
          await MarketplaceService.markSoldOutIfNeeded(updatedProject.id, updatedProject.companyId, actor, {
            source: "system.checkout_completion",
            reason: "Checkout depleted the last available credits in the listing.",
            ipAddress,
          });
        }

        cache.removeByPrefix(`dashboard:${claimed.companyId}:`);
        await AuditService.log({
          companyId: claimed.companyId,
          userId: actor?.id || claimed.userId || null,
          userEmail: actor?.email || claimed.metadata?.initiatedBy?.userEmail || null,
          ipAddress,
          action: "credits.checkout.completed",
          entityType: "CarbonCreditTransaction",
          entityId: claimed.id,
          details: {
            serialNumber: updatedTransaction.serialNumber,
            registryRecordId: updatedTransaction.registryRecordId,
            blockchainHash: updatedTransaction.blockchainHash,
            quantity: updatedTransaction.credits,
            totalCostUsd: updatedTransaction.totalCostUsd,
            certificateChecksum: updatedTransaction.certificate?.checksum || null,
          },
        });

        return buildTransactionView(updatedTransaction);
      } catch (error) {
        const isSerialCollision = error?.code === 11000 && error?.keyPattern?.serialNumber;

        if (!usedMongoTransaction && updatedProject && !updatedTransaction) {
          await restoreProjectCompletion(claimed, { restoreReservation: true });
        }

        if (isSerialCollision) {
          if (certificate?.storagePath) {
            await DocumentStorageService.removeCertificate(certificate.storagePath);
          }
          continue;
        }

        if (!usedMongoTransaction && updatedTransaction && !finalizedLock) {
          finalizedLock = await CheckoutLockService.finalizeLock(activeLock.id, companyId, {
            finalizedAt: completedAt,
            reason: "Checkout completed successfully.",
          });

          if (finalizedLock) {
            return buildTransactionView(updatedTransaction);
          }
        }

        if (certificate?.storagePath) {
          await DocumentStorageService.removeCertificate(certificate.storagePath);
        }

        if (!finalizedLock) {
          await CheckoutLockService.releaseLock(activeLock.id, companyId, error.message, {
            status: "RELEASED",
          });
        }

        const failed = await this.markTransactionFailed(claimed, actor, error.message, ipAddress, {
          lockStatus: finalizedLock ? "COMPLETED" : "RELEASED",
        });

        logger.error("credits.checkout.completion_failed", {
          transactionId: claimed.id,
          companyId: claimed.companyId,
          message: error.message,
        });

        throw new ApiError(error.statusCode || 409, failed.metadata?.failureReason || error.message);
      }
    }

    throw new ApiError(500, "Could not assign a unique retirement serial number.");
  }

  static async processCarbonCreditCheckout(payload, companyId, actor = null, options = {}) {
    const started = await this.startCheckout(payload, companyId, actor, options);
    const completed = await this.finalizeTransaction(started.transactionId, companyId, actor, options);

    return {
      transactionId: completed.id,
      status: completed.status,
      serialNumber: completed.serialNumber,
      paymentReference: completed.paymentReference,
      createdAt: completed.createdAt,
      lockId: completed.lockId,
      lockExpiresAt: completed.lockExpiresAt,
    };
  }

  static async getTransactionById(id, companyId, actor = null, options = {}) {
    const transaction = await Transaction.findOne({ _id: id, companyId });

    if (!transaction) {
      throw new ApiError(404, "Carbon credit transaction not found.");
    }

    const synced = await this.syncPendingTransactionState(transaction, actor, {
      ipAddress: options.ipAddress || null,
    });

    return buildTransactionView(synced);
  }

  static async getCertificateDownload(id, companyId, actor = null, options = {}) {
    const transactionView = await this.getTransactionById(id, companyId, actor, options);

    if (transactionView.status !== "COMPLETED") {
      throw new ApiError(409, "Certificate is only available after checkout completion.");
    }

    if (!transactionView.certificate || !transactionView.certificate.storagePath) {
      throw new ApiError(404, "Certificate metadata is missing for this transaction.");
    }

    const fileBuffer = await DocumentStorageService.readCertificate(transactionView.certificate.storagePath);
    if (!fileBuffer || fileBuffer.byteLength === 0) {
      throw new ApiError(409, "Certificate file is empty.");
    }

    const checksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    if (checksum !== transactionView.certificate.checksum) {
      throw new ApiError(409, "Certificate integrity verification failed.");
    }

    return {
      fileName: transactionView.certificate.fileName || `${transactionView.serialNumber || transactionView.id}.pdf`,
      contentType: "application/pdf",
      storagePath: transactionView.certificate.storagePath,
    };
  }
}

module.exports = TransactionService;
module.exports.buildTransactionView = buildTransactionView;
