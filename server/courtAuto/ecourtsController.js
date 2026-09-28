const { chromium } = require("playwright");

async function searchECourts(req, res) {
  const startTime = Date.now();
  const input = req.body || {};

  const requiredFields = [
    "partyName",
    "state",
    "district",
    "courtComplex",
    "year",
    "status",
  ];

  const missingFields = requiredFields.filter(
    (field) => !String(input[field] || "").trim(),
  );

  const validStatuses = ["Pending", "Disposed", "Both"];

  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      durationMs: Date.now() - startTime,
      totalCases: 0,
      cases: [],
      logs: [`Missing required fields: ${missingFields.join(", ")}`],
    });
  }

  if (!validStatuses.includes(input.status)) {
    return res.status(400).json({
      success: false,
      durationMs: Date.now() - startTime,
      totalCases: 0,
      cases: [],
      logs: ["Status must be Pending, Disposed, or Both."],
    });
  }

  let browser;

  try {
    browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto("https://services.ecourts.gov.in/ecourtindia_v6/", {
      waitUntil: "domcontentloaded",
    });

    const title = await page.title();

    return res.json({
      success: true,
      durationMs: Date.now() - startTime,
      totalCases: 0,
      cases: [],
      logs: [
        `Opened the eCourts homepage: ${title}`,
        "The case search has not run yet.",
      ],
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      durationMs: Date.now() - startTime,
      totalCases: 0,
      cases: [],
      logs: [`Could not open the eCourts homepage: ${error.message}`],
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { searchECourts };
