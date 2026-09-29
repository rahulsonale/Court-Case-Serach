const { chromium } = require("playwright");
const { randomUUID } = require("crypto");
const { readCaptcha } = require("./captcha");

const browserSessions = new Map();
const SESSION_TIMEOUT_MS = 3 * 60 * 1000;

async function closeSession(sessionId) {
  const session = browserSessions.get(sessionId);

  if (!session) {
    return;
  }

  clearTimeout(session.timeout);
  browserSessions.delete(sessionId);

  await session.browser.close().catch(() => {});
}

async function waitForOption(select, optionLabel) {
  await select
    .locator("option")
    .filter({ hasText: optionLabel })
    .waitFor({ state: "attached", timeout: 15000 });
}

async function selectAndVerify(page, select, label, expectedValue) {
  let selectedValue = "";

  for (let attempt = 1; attempt <= 3; attempt++) {
    await select.selectOption({ label: expectedValue });
    await page.waitForTimeout(1000);

    selectedValue = (await select.locator("option:checked").innerText()).trim();

    if (selectedValue === expectedValue) {
      return;
    }
  }

  throw new Error(
    `${label} selection failed. Expected "${expectedValue}", got "${selectedValue}".`,
  );
}

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

    const pageText = await page.locator("body").innerText();

    if (/Search Page not Found/i.test(pageText)) {
      throw new Error(`eCourts returned its not-found page at ${page.url()}`);
    }

    const caseStatusLink = page.getByRole("link", {
      name: "Case Status",
      exact: true,
    });

    await caseStatusLink.waitFor({ state: "visible", timeout: 15000 });
    await caseStatusLink.click();

    await page
      .getByRole("heading", { name: "Case Status", exact: true })
      .waitFor({ state: "visible", timeout: 15000 });

    const stateSelect = page.getByLabel("Select State");
    const districtSelect = page.getByLabel("Select District");
    const courtComplexSelect = page.getByLabel("Select Court Complex");

    const stateName = String(input.state).trim();
    const districtName = String(input.district).trim();
    const courtComplexName = String(input.courtComplex).trim();

    await selectAndVerify(page, stateSelect, "State", stateName);

    await waitForOption(districtSelect, districtName);
    await selectAndVerify(page, districtSelect, "District", districtName);

    await waitForOption(courtComplexSelect, courtComplexName);
    await selectAndVerify(
      page,
      courtComplexSelect,
      "Court Complex",
      courtComplexName,
    );

    await page
      .getByRole("textbox", { name: /Petitioner\/Respondent/ })
      .fill(String(input.partyName).trim());

    await page
      .getByRole("textbox", { name: /Registration Year/ })
      .fill(String(input.year).trim());

    await page.getByRole("radio", { name: input.status }).check();

    const captchaImage = await page.locator("#captcha_image").screenshot();
    const captchaSuggestion = await readCaptcha(captchaImage);
    const sessionId = randomUUID();

    const timeout = setTimeout(() => {
      closeSession(sessionId);
    }, SESSION_TIMEOUT_MS);

    browserSessions.set(sessionId, {
      browser,
      page,
      timeout,
    });

    return res.json({
      success: true,
      sessionId,
      captchaImage: `data:image/png;base64,${captchaImage.toString("base64")}`,
      captchaSuggestion: captchaSuggestion || "",
      durationMs: Date.now() - startTime,
      logs: [
        "The search form is ready.",
        "Review the CAPTCHA suggestion and enter the CAPTCHA shown in the browser.",
      ],
    });
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }

    return res.status(502).json({
      success: false,
      durationMs: Date.now() - startTime,
      totalCases: 0,
      cases: [],
      logs: [`Could not prepare the Case Status search: ${error.message}`],
    });
  }
}

async function submitECourtsCaptcha(req, res) {
  const startTime = Date.now();
  const { sessionId, captchaText } = req.body || {};

  if (!String(sessionId || "").trim() || !String(captchaText || "").trim()) {
    return res.status(400).json({
      success: false,
      durationMs: Date.now() - startTime,
      totalCases: 0,
      cases: [],
      logs: ["Both sessionId and captchaText are required."],
    });
  }

  const normalizedSessionId = String(sessionId).trim();
  const session = browserSessions.get(normalizedSessionId);

  if (!session) {
    return res.status(410).json({
      success: false,
      durationMs: Date.now() - startTime,
      totalCases: 0,
      cases: [],
      logs: ["This search session expired. Start the search again."],
    });
  }

  try {
    const { page } = session;

    await page
      .getByRole("textbox", { name: /Enter Captcha/ })
      .fill(String(captchaText).trim());

    await page.getByRole("button", { name: "Go", exact: true }).click();

    const outcome = await Promise.race([
      page
        .locator("#validateError")
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => "captcha-error")
        .catch(() => null),

      page
        .getByText("Record not found", { exact: true })
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => "no-results")
        .catch(() => null),

      page
        .getByText(/Total number of cases\s*:/i)
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => "results")
        .catch(() => null),
    ]);

    if (!outcome) {
      throw new Error("Timed out waiting for the eCourts search response.");
    }

    if (outcome === "captcha-error") {
      const message = await page.locator("#validateError").innerText();

      return res.status(422).json({
        success: false,
        durationMs: Date.now() - startTime,
        totalCases: 0,
        cases: [],
        logs: [`The CAPTCHA was rejected: ${message.trim()}`],
      });
    }

    if (outcome === "no-results") {
      return res.json({
        success: true,
        durationMs: Date.now() - startTime,
        totalCases: 0,
        cases: [],
        logs: ["The search completed, but no matching cases were found."],
      });
    }

    const pageText = await page.locator("body").innerText();
    const countMatch = pageText.match(/Total number of cases\s*:\s*(\d+)/i);
    const totalCases = countMatch ? Number(countMatch[1]) : 0;

    const resultsTable = page
      .locator("table")
      .filter({ hasText: "Case Type/Case Number/Case Year" })
      .first();

    await resultsTable.waitFor({ state: "visible" });

    const rows = await resultsTable.locator("tr").all();
    const cases = [];

    for (const row of rows) {
      const cells = (await row.locator("td").allInnerTexts()).map((text) =>
        text.replace(/\s+/g, " ").trim(),
      );

      if (cells.length < 3 || !/^\d+$/.test(cells[0])) {
        continue;
      }

      cases.push({
        serialNumber: Number(cells[0]),
        caseReference: cells[1],
        parties: cells[2],
      });
    }

    return res.json({
      success: true,
      durationMs: Date.now() - startTime,
      totalCases,
      cases,
      logs: [
        `eCourts reports ${totalCases} cases.`,
        `Extracted ${cases.length} visible case rows.`,
      ],
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      durationMs: Date.now() - startTime,
      totalCases: 0,
      cases: [],
      logs: [`Could not submit the eCourts search: ${error.message}`],
    });
  } finally {
    await closeSession(normalizedSessionId);
  }
}

module.exports = {
  searchECourts,
  submitECourtsCaptcha,
};
