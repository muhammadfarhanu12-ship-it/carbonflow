const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const { CARBON_CREDITS_CONFIG } = require("../config/carbonCredits");

function ensureSafeName(fileName) {
  return String(fileName || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveAbsolutePath(storagePath) {
  const absolutePath = path.resolve(CARBON_CREDITS_CONFIG.certificateStorageDir, storagePath);
  const relativePath = path.relative(CARBON_CREDITS_CONFIG.certificateStorageDir, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new ApiError(400, "Invalid certificate storage path.");
  }

  return absolutePath;
}

class DocumentStorageService {
  static async ensureStorageDirectory() {
    await fs.promises.mkdir(CARBON_CREDITS_CONFIG.certificateStorageDir, { recursive: true });
  }

  static async saveCertificate(transactionId, buffer) {
    await this.ensureStorageDirectory();

    const fileName = ensureSafeName(`${transactionId}-certificate.pdf`) || `${crypto.randomUUID()}.pdf`;
    const storagePath = path.join(String(new Date().getUTCFullYear()), fileName);
    const absolutePath = resolveAbsolutePath(storagePath);

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, buffer);

    return {
      fileName,
      storagePath,
      absolutePath,
    };
  }

  static async readCertificate(storagePath) {
    const absolutePath = resolveAbsolutePath(storagePath);

    try {
      return await fs.promises.readFile(absolutePath);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        throw new ApiError(404, "Certificate file is missing.");
      }

      throw error;
    }
  }

  static createReadStream(storagePath) {
    return fs.createReadStream(resolveAbsolutePath(storagePath));
  }

  static async removeCertificate(storagePath) {
    try {
      await fs.promises.unlink(resolveAbsolutePath(storagePath));
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

module.exports = DocumentStorageService;
