const express = require("express");
const internalAuth = require("../middleware/internalAuthMiddleware");
const controller = require("../controller/quoteController");
const router = express.Router();
router.post("/quotes", internalAuth, controller.processQuote);
module.exports = router;
