const express = require("express");
const { searchECourts } = require("./ecourtsController");

const router = express.Router();

router.post("/ecourts/search", searchECourts);

module.exports = router;
