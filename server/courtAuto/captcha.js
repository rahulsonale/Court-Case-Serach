const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

async function readCaptcha(imageBuffer) {
  const processedImage = await sharp(imageBuffer)
    .resize({ width: 360 })
    .grayscale()
    .normalize()
    .threshold(150)
    .png()
    .toBuffer();

  const worker = await createWorker("eng");

  try {
    const {
      data: { text },
    } = await worker.recognize(processedImage);

    return text.replace(/[^a-zA-Z0-9]/g, "");
  } finally {
    await worker.terminate();
  }
}

module.exports = { readCaptcha };
