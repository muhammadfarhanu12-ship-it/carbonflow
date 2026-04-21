const express = require("express");
const multer = require("multer");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/upload.controller");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const allowedMimeTypes = new Set([
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ]);

    const isAllowedExtension = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    callback(null, allowedMimeTypes.has(file.mimetype) || isAllowedExtension);
  },
});

router.use(authenticate);
router.post("/", upload.single("file"), asyncHandler(controller.upload));

module.exports = router;
