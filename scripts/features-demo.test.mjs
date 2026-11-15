import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { pageFeatures } from "../src/render.mjs";
import { LANGS, langDir, localize } from "../src/i18n.mjs";

const origin = "https://mx.qrveo.com";
const base = JSON.parse(await readFile(new URL("../content/es.json", import.meta.url), "utf8"));
const demo = `${origin}/videos/${base.examples[0].vid}`;
const source = await readFile(new URL("../src/scripts/site.js", import.meta.url), "utf8");
const runtime = source.slice(source.indexOf("export function qrSvg"), source.indexOf("// 3 \u00b7"))
  .replace("export function qrSvg", "function qrSvg");

for (const lang of LANGS) {
  const tr = JSON.parse(await readFile(new URL(`../content/${lang.code}.json`, import.meta.url), "utf8"));
  const c = localize(base, tr);
  const full = langDir(lang.code) + "funciones/";
  const root = "../".repeat(full.split("/").filter(Boolean).length);
  const options = {
    origin, base: "/mexico/", watch: origin, root, L: root + langDir(lang.code),
    lang, langs: LANGS, path: "funciones/", full,
    alt: l => langDir(l.code) + "funciones/", v: "features-demo-test", demo,
    qr: value => `QR:${value}`,
  };
  const html = pageFeatures(c, options);
  const meta = /<meta name="qrveo-demo" content="([^"]+)"[^>]*>/.exec(html);
  assert.equal(meta?.[1], demo, `${full}: runtime must retain the build-time demo URL`);
  assert.ok(html.includes(`>QR:${demo}</span>`), `${full}: static QR agrees with runtime`);
  assert.doesNotMatch(html, /<a\b[^>]*\bdata-demo(?:\s|>)/, `${full}: no clickable demo is needed`);
  for (const watchOrigin of [origin, "http://127.0.0.1:30112"]) {
    const encoded = [];
    const qr = { dataset: {}, innerHTML: "" };
    vm.runInNewContext(runtime, {
      URL, DEV: { lanHost: "192.168.1.20" }, RUNTIME: { watchOrigin },
      location: { href: `${origin}/mexico/${full}` },
      qrcode: () => ({
        addData: value => encoded.push(value), make() {},
        getModuleCount: () => 1, isDark: () => true,
      }),
      document: {
        querySelector: selector => selector.startsWith("meta")
          ? { content: meta[1], dataset: { runtimeDemo: "" } } : null,
        querySelectorAll: selector => selector === "[data-qr]" ? [qr] : [],
      },
    });
    assert.deepEqual(encoded, [
      `${watchOrigin.replace("127.0.0.1", "192.168.1.20")}/videos/${base.examples[0].vid}`,
    ], `${full}: use the runtime watch host and retain LAN phone preview`);
  }
  const custom = pageFeatures({ ...c, demo: { ...c.demo, url: `${origin}/custom-demo` } }, options);
  assert.ok(custom.includes(`<meta name="qrveo-demo" content="${origin}/custom-demo">`),
    `${full}: retain an explicitly configured demo`);
}
console.log("PASS: 8 feature pages retain the real demo, runtime host, LAN preview and explicit overrides");
