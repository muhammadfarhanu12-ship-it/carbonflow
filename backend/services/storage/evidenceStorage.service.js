const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const env = require("../../config/env");

const LOCAL_STORAGE_ROOT = path.resolve(__dirname, "../../uploads/evidence");

function sanitizeFileName(value) {
  const ext = path.extname(String(value || "")).toLowerCase();
  const base = path.basename(String(value || "evidence"), ext)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "evidence";
  return `${base}${ext}`;
}

function buildStorageKey({ companyId, supplierId, originalName }) {
  const safeOriginalName = sanitizeFileName(originalName);
  const random = crypto.randomBytes(12).toString("hex");
  return [
    String(companyId || "unknown-company"),
    String(supplierId || "unknown-supplier"),
    `${Date.now()}-${random}-${safeOriginalName}`,
  ].join("/");
}

class LocalEvidenceStorageAdapter {
  async upload({ key, buffer }) {
    const targetPath = path.join(LOCAL_STORAGE_ROOT, key);
    const resolvedRoot = path.resolve(LOCAL_STORAGE_ROOT);
    const resolvedTarget = path.resolve(targetPath);

    if (!resolvedTarget.startsWith(resolvedRoot)) {
      throw new Error("Invalid storage key");
    }

    await fs.promises.mkdir(path.dirname(resolvedTarget), { recursive: true });
    await fs.promises.writeFile(resolvedTarget, buffer);

    const publicBaseUrl = env.storage.publicUrl || "";
    return {
      storageKey: key,
      fileUrl: publicBaseUrl ? `${publicBaseUrl.replace(/\/+$/, "")}/api/storage/evidence/${encodeURIComponent(key)}` : null,
      provider: "local",
    };
  }

  async getFile(key) {
    const targetPath = path.join(LOCAL_STORAGE_ROOT, key);
    const resolvedRoot = path.resolve(LOCAL_STORAGE_ROOT);
    const resolvedTarget = path.resolve(targetPath);

    if (!resolvedTarget.startsWith(resolvedRoot)) {
      throw new Error("Invalid storage key");
    }

    await fs.promises.access(resolvedTarget, fs.constants.R_OK);
    return {
      path: resolvedTarget,
      stream: fs.createReadStream(resolvedTarget),
    };
  }
}

function getEvidenceStorageAdapter() {
  const provider = String(env.storage.provider || "local").toLowerCase();

  if (provider && provider !== "local") {
    return new LocalEvidenceStorageAdapter();
  }

  return new LocalEvidenceStorageAdapter();
}

module.exports = {
  LOCAL_STORAGE_ROOT,
  buildStorageKey,
  getEvidenceStorageAdapter,
  sanitizeFileName,
};
