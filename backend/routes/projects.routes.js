const express = require("express");
const catchAsync = require("../utils/catchAsync");
const validateRequest = require("../middlewares/validateRequest");
const { authenticate } = require("../middlewares/authMiddleware");
const controller = require("../controllers/project.controller");
const { projectValidator, projectUpdateValidator } = require("../validators/project.validator");

const router = express.Router();

router.use(authenticate);

router.get("/", catchAsync(controller.listProjects));
router.get("/:id", catchAsync(controller.getProjectById));
router.post("/", projectValidator, validateRequest, catchAsync(controller.createProject));
router.put("/:id", projectUpdateValidator, validateRequest, catchAsync(controller.updateProject));
router.delete("/:id", catchAsync(controller.deleteProject));

module.exports = router;
