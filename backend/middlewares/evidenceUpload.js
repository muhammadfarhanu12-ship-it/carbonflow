const path = require("path");
const multer = require("multer");

const MAX_EVIDENCE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EVIDENCE_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".xlsx", ".csv"]);
const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

function isAllowedEvidenceFile(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  return ALLOWED_EVIDENCE_EXTENSIONS.has(ext) || ALLOWED_EVIDENCE_MIME_TYPES.has(file.mimetype);
}

const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_EVIDENCE_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedEvidenceFile(file)) {
      callback(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
      return;
    }

    callback(null, true);
  },
});

module.exports = {
  ALLOWED_EVIDENCE_EXTENSIONS,
  MAX_EVIDENCE_FILE_SIZE_BYTES,
  evidenceUpload,
  isAllowedEvidenceFile,
};
