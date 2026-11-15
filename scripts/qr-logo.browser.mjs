import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const [url, output] = process.argv.slice(2);
assert.ok(url && output, "Usage: node scripts/qr-logo.browser.mjs URL SCREENSHOT_DIRECTORY");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const results = [];
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    // Preserve public asset responses while avoiding stalled browser downloads.
    if (new URL(url).protocol === "https:") {
      await page.route("**/mexico/assets/**", async route => {
        const response = await route.fetch({ timeout: 25000 });
        await route.fulfill({ response });
      });
    }
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() =>
      document.querySelector('[data-qr-tab="url"]')?.getAttribute("aria-selected") === "true");
    const hint = await page.locator("[data-qr-logo-name]").textContent();
    assert.doesNotMatch(hint, /2\s*(?:MB|Mo)/i);
    const image = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1200;
      const context = canvas.getContext("2d");
      const pixels = context.createImageData(1200, 1200);
      for (let offset = 0; offset < pixels.data.length; offset += 65536) {
        crypto.getRandomValues(pixels.data.subarray(offset, offset + 65536));
      }
      for (let offset = 3; offset < pixels.data.length; offset += 4) pixels.data[offset] = 255;
      context.putImageData(pixels, 0, 0);
      return canvas.toDataURL("image/png").split(",")[1];
    }), "base64");
    assert.ok(image.length > 2 * 1024 ** 2, "Exercise a real image larger than the former cap");
    const input = page.locator('input[name="logo"]');
    await input.setInputFiles({ name: "large-logo.png", mimeType: "image/png", buffer: image });
    await page.waitForFunction(() =>
      document.querySelector("[data-qr-logo-name]")?.textContent === "large-logo.png");
    const logo = page.locator("[data-desk-sticker] image");
    assert.equal(await logo.count(), 1);
    const dimensions = await logo.evaluate(async element => {
      const image = new Image();
      image.src = element.getAttribute("href");
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    });
    assert.deepEqual(dimensions, [256, 256], "Large files still produce a bounded QR logo");
    assert.ok(await page.locator("[data-qr-logo-remove]").isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "No horizontal overflow");
    await page.locator("[data-qr-style]").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `logo-${width}.png`), fullPage: true });
    await page.locator("[data-qr-logo-remove]").click();
    assert.equal(await logo.count(), 0);
    assert.equal(await page.locator("[data-qr-logo-name]").textContent(), hint);
    assert.equal(await page.locator("[data-qr-logo-remove]").isVisible(), false);
    await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("invalid") });
    await page.waitForFunction(() =>
      document.querySelector("[data-qr-message]")?.dataset.error === "true");
    const copy = await page.locator("[data-qr-text]").textContent().then(JSON.parse);
    assert.equal(await page.locator("[data-qr-message]").textContent(), copy.errors.logo);
    assert.equal(await input.inputValue(), "");
    assert.deepEqual(errors, []);
    results.push({ width, inputBytes: image.length, output: dimensions, removed: true, invalidRejected: true });
    await context.close();
  }
  console.log(JSON.stringify({ url, results }));
} finally {
  await browser.close();
}
