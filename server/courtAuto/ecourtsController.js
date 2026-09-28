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

    await page.getByRole("link", { name: "Case Status", exact: true }).click();
    await page.getByRole("heading", { name: /Case Status/ }).waitFor();

    await page.getByLabel("Select State").selectOption({ label: input.state });

    await page
      .getByLabel("Select District")
      .selectOption({ label: input.district });

    await page
      .getByLabel("Select Court Complex")
      .selectOption({ label: input.courtComplex });

    await page
      .getByRole("textbox", { name: /Petitioner\/Respondent/ })
      .fill(String(input.partyName).trim());

    await page
      .getByRole("textbox", { name: /Registration Year/ })
      .fill(String(input.year).trim());

    await page.getByRole("radio", { name: input.status }).check();

    const title = await page.title();

    return res.json({
      success: true,
      durationMs: Date.now() - startTime,
      totalCases: 0,
      cases: [],
      logs: [
        `Opened the Case Status page: ${title}`,
        "Filled the search form. CAPTCHA has not been entered and the search has not been submitted.",
      ],
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      durationMs: Date.now() - startTime,
      totalCases: 0,
      cases: [],
      logs: [`Could not prepare the Case Status search: ${error.message}`],
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { searchECourts };
