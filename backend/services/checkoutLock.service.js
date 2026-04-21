const { CarbonProject, CheckoutLock, Transaction } = require("../models");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const { CARBON_CREDITS_CONFIG } = require("../config/carbonCredits");

let cleanupTimer = null;

function isPurchasableStatus(status) {
  const normalized = String(status || "").trim().toUpperCase();
  return normalized === "PUBLISHED" || normalized === "ACTIVE";
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function now() {
  return new Date();
}

function buildAvailabilityFilter(projectId, companyId, quantity) {
  return {
    _id: projectId,
    companyId,
    status: { $in: ["PUBLISHED", "ACTIVE"] },
    availableCredits: { $gte: quantity },
    $expr: {
      $gte: [
        {
          $subtract: [
            "$availableCredits",
            { $ifNull: ["$reservedCredits", 0] },
          ],
        },
        quantity,
      ],
    },
  };
}

class CheckoutLockService {
  static buildExpiryDate(baseTime = Date.now()) {
    return new Date(baseTime + CARBON_CREDITS_CONFIG.checkoutLockDurationMs);
  }

  static startCleanupWorker() {
    if (cleanupTimer) {
      return;
    }

    cleanupTimer = setInterval(() => {
      void this.releaseExpiredLocks().catch((error) => {
        logger.error("checkout.lock.cleanup_failed", {
          message: error.message,
        });
      });
    }, CARBON_CREDITS_CONFIG.checkoutLockCleanupIntervalMs);

    if (typeof cleanupTimer.unref === "function") {
      cleanupTimer.unref();
    }
  }

  static stopCleanupWorker() {
    if (!cleanupTimer) {
      return;
    }

    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  static async getLockById(lockId, companyId, options = {}) {
    return withSession(
      CheckoutLock.findOne({ _id: lockId, companyId }),
      options.session,
    );
  }

  static async getActiveLockByTransactionId(transactionId, companyId, options = {}) {
    return withSession(
      CheckoutLock.findOne({
        transactionId,
        companyId,
        status: "ACTIVE",
      }),
      options.session,
    );
  }

  static async lockCredits(projectId, quantity, userId, companyId, transactionId, options = {}) {
    const requestedQuantity = Number(quantity);
    const session = options.session || null;
    const expiresAt = options.expiresAt || this.buildExpiryDate();

    const reservedProject = await withSession(
      CarbonProject.findOneAndUpdate(
        buildAvailabilityFilter(projectId, companyId, requestedQuantity),
        {
          $inc: {
            reservedCredits: requestedQuantity,
          },
        },
        {
          new: true,
        },
      ),
      session,
    );

    if (!reservedProject) {
      const project = await withSession(
        CarbonProject.findOne({ _id: projectId, companyId }),
        session,
      );

      if (!project) {
        throw new ApiError(404, "Carbon project not found for checkout.");
      }

      if (!isPurchasableStatus(project.status)) {
        throw new ApiError(409, "This listing is not currently available for purchase.");
      }

      throw new ApiError(409, "Not enough credits available.");
    }

    const lock = new CheckoutLock({
      companyId,
      projectId,
      transactionId,
      userId: userId || null,
      quantity: requestedQuantity,
      expiresAt,
      status: "ACTIVE",
    });

    await lock.save(session ? { session } : undefined);

    return {
      lock,
      project: reservedProject,
    };
  }

  static async finalizeLock(lockId, companyId, options = {}) {
    const session = options.session || null;
    const finalizedAt = options.finalizedAt || now();

    return withSession(
      CheckoutLock.findOneAndUpdate(
        {
          _id: lockId,
          companyId,
          status: "ACTIVE",
        },
        {
          $set: {
            status: "COMPLETED",
            releasedAt: finalizedAt,
            releaseReason: options.reason || "Checkout completed successfully.",
          },
        },
        { new: true },
      ),
      session,
    );
  }

  static async releaseLock(lockId, companyId, reason, options = {}) {
    const session = options.session || null;
    const releasedAt = options.releasedAt || now();
    const nextStatus = options.status || "RELEASED";

    const lock = await withSession(
      CheckoutLock.findOneAndUpdate(
        {
          _id: lockId,
          companyId,
          status: "ACTIVE",
        },
        {
          $set: {
            status: nextStatus,
            releasedAt,
            releaseReason: reason,
          },
        },
        { new: true },
      ),
      session,
    );

    if (!lock) {
      return null;
    }

    await CarbonProject.updateOne(
      {
        _id: lock.projectId,
        companyId,
      },
      [
        {
          $set: {
            reservedCredits: {
              $max: [
                0,
                {
                  $subtract: [
                    { $ifNull: ["$reservedCredits", 0] },
                    lock.quantity,
                  ],
                },
              ],
            },
          },
        },
      ],
      session ? { session } : undefined,
    );

    if (options.markTransactionFailed) {
      await withSession(
        Transaction.findOneAndUpdate(
          {
            _id: lock.transactionId,
            companyId,
            status: "PENDING",
          },
          {
            $set: {
              status: "FAILED",
              "metadata.failureReason": reason,
              "metadata.checkout.lockStatus": nextStatus,
              "metadata.checkout.lockReleasedAt": releasedAt,
              "metadata.checkout.lockReleaseReason": reason,
            },
          },
          { new: true },
        ),
        session,
      );
    }

    return lock;
  }

  static async releaseExpiredLocks(filters = {}) {
    const limit = Number(filters.limit || 50);
    const session = filters.session || null;
    const currentTime = filters.now || now();
    const query = {
      status: "ACTIVE",
      expiresAt: { $lte: currentTime },
    };

    if (filters.companyId) {
      query.companyId = filters.companyId;
    }

    if (filters.projectId) {
      query.projectId = filters.projectId;
    }

    const expiredLocks = await withSession(
      CheckoutLock.find(query).sort({ expiresAt: 1 }).limit(limit),
      session,
    );

    const releasedLocks = [];

    for (const lock of expiredLocks) {
      const linkedTransaction = await withSession(
        Transaction.findOne({
          _id: lock.transactionId,
          companyId: lock.companyId,
        }),
        session,
      );

      if (linkedTransaction?.status === "COMPLETED") {
        const finalized = await this.finalizeLock(lock.id, lock.companyId, {
          session,
          finalizedAt: currentTime,
          reason: "Checkout completion reconciled an expired active lock.",
        });

        if (finalized) {
          releasedLocks.push(finalized);
        }

        continue;
      }

      const released = await this.releaseLock(
        lock.id,
        lock.companyId,
        "Checkout reservation expired.",
        {
          session,
          status: "EXPIRED",
          releasedAt: currentTime,
          markTransactionFailed: true,
        },
      );

      if (released) {
        releasedLocks.push(released);
      }
    }

    return releasedLocks;
  }

  static async ensureActiveLock(transaction, options = {}) {
    if (!transaction?.metadata?.checkout?.lockId) {
      throw new ApiError(409, "Checkout reservation is missing.");
    }

    const lock = await this.getLockById(transaction.metadata.checkout.lockId, transaction.companyId, options);

    if (!lock || lock.status !== "ACTIVE") {
      throw new ApiError(409, "Checkout reservation is no longer active.");
    }

    if (new Date(lock.expiresAt).getTime() <= Date.now()) {
      await this.releaseLock(lock.id, transaction.companyId, "Checkout reservation expired.", {
        session: options.session || null,
        status: "EXPIRED",
        releasedAt: now(),
        markTransactionFailed: true,
      });
      throw new ApiError(409, "Checkout reservation expired.");
    }

    return lock;
  }
}

module.exports = CheckoutLockService;
