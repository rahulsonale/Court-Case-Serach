const express = require("express");
const { searchECourts, submitECourtsCaptcha } = require("./ecourtsController");

const router = express.Router();

router.post("/ecourts/search", searchECourts);
router.post("/ecourts/submit-captcha", submitECourtsCaptcha);

module.exports = router;
