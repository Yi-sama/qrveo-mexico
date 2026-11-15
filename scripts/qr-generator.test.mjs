import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import {
  normalizeQrUrl, validateMatrix, generateQr,
  isReadableColor, captionLines, createQrSvg,
} from "../src/scripts/qr-generator.mjs";
import { LANGS, localize, missing } from "../src/i18n.mjs";

const qrcode = createRequire(import.meta.url)("../src/vendor/qrcode.js");
const matrix = { size: 21, rows: Array(21).fill("1".repeat(21)) };

test("accepts only bounded, direct HTTP destinations without embedded credentials", () => {
  assert.equal(normalizeQrUrl(" HTTPS://EXAMPLE.COM "), "https://example.com/");
  assert.equal(normalizeQrUrl("https://example.com/教程"), "https://example.com/%E6%95%99%E7%A8%8B");
  for (const input of ["", "example.com", "javascript:alert(1)", "data:text/html,test", "//evil.test", "https://user:secret@example.com", `https://example.com/${"x".repeat(600)}`]) {
    assert.throws(() => normalizeQrUrl(input), /url/);
  }
});

test("generation uses the authenticated server allowance and matrix, never local storage", async () => {
  const result = { url: "https://example.com/", matrix, quota: { remaining: null, limit: null } };
  const calls = [];
  const api = async (...args) => { calls.push(args); return { data: result }; };
  assert.equal(await generateQr(api, "session", " HTTPS://EXAMPLE.COM "), result);
  assert.deepEqual(calls, [["/free-qr/url", { method: "POST", token: "session", body: { url: result.url } }]]);
  await assert.rejects(generateQr(async () => { throw new Error("offline"); }, "", result.url), /offline/);
  await assert.rejects(generateQr(async () => ({ data: { ...result, url: "https://wrong.example/" } }), "", result.url), /service/);
  await assert.rejects(generateQr(async () => ({ data: { ...result, matrix: {} } }), "", result.url), /service/);
  await assert.rejects(generateQr(async () => ({ data: { ...result, quota: null } }), "", result.url), /service/);
  const limit = Object.assign(new Error("limit"), { code: "FREE_QR_LIMIT" });
  await assert.rejects(generateQr(async () => { throw limit; }, "", result.url), error => error === limit);
});

test("malformed or oversized server matrices cannot be rendered", () => {
  assert.equal(validateMatrix(matrix), matrix);
  for (const invalid of [null, {}, { size: 20, rows: [] }, { ...matrix, size: 22 },
    { ...matrix, rows: matrix.rows.slice(1) }, { ...matrix, rows: Array(21).fill("<".repeat(21)) },
    { ...matrix, size: 181 }]) {
    assert.throws(() => validateMatrix(invalid), /service/);
  }
  const svg = createQrSvg("https://example.com/", { matrix }, () => { throw new Error("local encoder called"); });
  assert.equal([...svg.matchAll(/h1v1h-1z/g)].length, 441);
});

test("QR colors retain contrast, logo input is raster-only, and caption XML is escaped", () => {
  for (const color of ["#141210", "#20594d", "#214d80", "#a6370f"]) assert.equal(isReadableColor(color), true);
  for (const color of ["#ffffff", "#ffff00", "#ff5a1f", "red", "#000"]) assert.equal(isReadableColor(color), false);
  assert.throws(() => createQrSvg("https://example.com", { color: "#ffffff" }, qrcode), /color/);
  assert.throws(() => createQrSvg("https://example.com", { logo: "https://tracker.example/logo.svg" }, qrcode), /logo/);
  const svg = createQrSvg("https://example.com", { template: "product", caption: '<img src=x> & "text"' }, qrcode);
  assert.ok(!svg.includes("<img"));
  assert.ok(svg.includes("&lt;img"));
  assert.ok(svg.includes("&amp;"));
  assert.ok(svg.includes('height="960"'));
  assert.ok(captionLines("W".repeat(48)).every((line) => Array.from(line).length <= 24));
  assert.equal(captionLines("字".repeat(60)).join("").length, 48);
});

test("matrix is the existing H-correction encoder with four-module quiet zones", () => {
  const value = "https://example.com/product?campaign=qr";
  const qr = qrcode(0, "H");
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const svg = createQrSvg(value, {}, qrcode);
  assert.ok(svg.includes(`viewBox="0 0 ${n + 8} ${n + 8}"`));
  const matrix = [...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((match) => [+match[1], +match[2]]);
  assert.ok(matrix.length > 100);
  const encoded = new Set(matrix.map(([x, y]) => `${x - 4},${y - 4}`));
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    assert.equal(encoded.has(`${col},${row}`), qr.isDark(row, col));
  }
  assert.ok(matrix.every(([x, y]) => x >= 4 && y >= 4 && x < n + 4 && y < n + 4));
});

test("all eight languages contain the full generator copy without Spanish fallback", async () => {
  const content = (code) => readFile(new URL(`../content/${code}.json`, import.meta.url), "utf8").then(JSON.parse);
  const es = await content("es");
  for (const lang of LANGS) {
    const tr = await content(lang.code);
    assert.deepEqual(missing(es.generator, tr.generator, "generator"), [], lang.code);
    assert.equal(localize(es, tr).generator.templates.length, 4);
    assert.equal(localize(es, tr).generator.videoTab, tr.generator.videoTab);
    assert.equal(tr.generator.remaining, tr.generator.unlimited);
    for (const key of ["remaining", "unlimited", "quotaNote", "trialQuota", "trialRemaining"]) {
      assert.equal(tr.generator[key], "", `${lang.code}: removed quantity copy ${key}`);
    }
    for (const text of [tr.generator.logoHint, tr.generator.errors.logo]) {
      assert.doesNotMatch(text, /2\s*(?:MB|Mo)/i, `${lang.code}: removed logo size limit`);
      assert.match(text, /PNG/);
    }
    assert.ok(!/(?:10|3)\b/.test(JSON.stringify([
      tr.generator.videoLimit, tr.generator.quotaNote, tr.generator.trialQuota,
      tr.generator.errors.limit, tr.generator.errors.trialLimit,
    ])));
    assert.ok(!JSON.stringify(tr.generator).includes("\uFFFD"));
  }
});
