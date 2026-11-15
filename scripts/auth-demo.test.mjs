import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import { pageAuth } from "../src/render.mjs";
import { LANGS, langDir, localize } from "../src/i18n.mjs";

const require = createRequire(import.meta.url);
const qrcode = require("../src/vendor/qrcode.js");
const origin = "https://mx.qrveo.com";
const film = `${origin}/mexico/hero-player.html`;
const base = JSON.parse(await readFile(new URL("../content/es.json", import.meta.url), "utf8"));
for (const lang of LANGS) {
  const tr = JSON.parse(await readFile(new URL(`../content/${lang.code}.json`, import.meta.url), "utf8"));
  const c = localize(base, tr);
  for (const [kind, route] of [["login", "iniciar-sesion/"], ["register", "registro/"], ["recover", "recuperar/"]]) {
    const full = langDir(lang.code) + route;
    const root = "../".repeat(full.split("/").filter(Boolean).length);
    const html = pageAuth(c, {
      origin, base: "/mexico/", watch: origin, root, L: root + langDir(lang.code),
      lang, langs: LANGS, path: route, full, alt: l => langDir(l.code) + route,
      v: "auth-demo-test", demo: origin + "/videos/other-demo", qr: value => `QR:${value}`,
    }, kind);
    assert.ok(html.includes(`href="${film}" data-demo`), `${full}: clickable homepage film`);
    assert.ok(html.includes(`data-qr-url="${film}">QR:${film}</span>`), `${full}: static QR uses homepage film`);
    assert.ok(!html.includes("auth-side-text"), `${full}: no personal QR display state`);
    assert.ok(html.includes(c.auth.sideTitle.replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>')),
      `${full}: neutral demonstration title`);
  }
}

const source = await readFile(new URL("../src/scripts/site.js", import.meta.url), "utf8");
const section = source.slice(source.indexOf("export function qrSvg"), source.indexOf("// 3 \u00b7"))
  .replace("export function qrSvg", "function qrSvg");
const explicit = { dataset: { qrUrl: film }, innerHTML: "" };
const ordinary = { dataset: {}, innerHTML: "" };
const encoded = [];
vm.runInNewContext(section, {
  URL, DEV: {}, RUNTIME: {}, location: { href: `${origin}/mexico/zh/iniciar-sesion/` },
  qrcode: (...args) => {
    const qr = qrcode(...args);
    const add = qr.addData.bind(qr);
    qr.addData = value => { encoded.push(value); add(value); };
    return qr;
  },
  document: {
    querySelector: selector => selector.startsWith("meta") ? { content: origin + "/videos/other-demo" } : null,
    querySelectorAll: selector => selector === "[data-qr]" ? [explicit, ordinary] : [],
  },
});
assert.deepEqual(encoded, [film, origin + "/videos/other-demo"],
  "Explicit account QR must survive runtime initialization without changing other demos");
assert.ok(explicit.innerHTML.includes("<svg"));
assert.ok(!source.includes('document.querySelector("[data-auth-side]")'),
  "Saved trial QR must not replace the account demonstration");
assert.match(source, /async function claimTrial\(token\)[\s\S]+const last = readLastQr\(\)/,
  "Keep trial claim after login");
console.log("PASS: 24 localized account pages, explicit runtime QR, unchanged default demo and trial claim");
