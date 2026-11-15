import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { legalPages } from "../src/legal.mjs";
import { pageLegal } from "../src/render.mjs";
import { LANGS, langDir, localize } from "../src/i18n.mjs";

const legal = legalPages.find(page => page.path === "eliminacion-de-datos/");
assert.ok(legal);
const copy = legal.intro + legal.sections.flatMap(section => section.p).join(" ");
assert.match(copy, /mx@qrveo\.com/);
assert.match(copy, /verificar que eres titular/);
assert.match(copy, /no elimina por sí solo/);
assert.match(copy, /No envíes contraseñas/);
assert.match(copy, /no equivale a eliminar tu cuenta/);
assert.equal(legalPages.filter(page => page.path === legal.path).length, 1);

const es = JSON.parse(await readFile(new URL("../content/es.json", import.meta.url), "utf8"));
for (const lang of LANGS) {
  const tr = JSON.parse(await readFile(new URL(`../content/${lang.code}.json`, import.meta.url), "utf8"));
  const full = langDir(lang.code) + legal.path;
  const root = "../".repeat(full.split("/").filter(Boolean).length);
  const html = pageLegal(localize(es, tr), {
    origin: "https://mx.qrveo.com", base: "/mexico/", root,
    L: root + langDir(lang.code), lang, langs: LANGS, path: legal.path, full,
    alt: other => langDir(other.code) + legal.path, v: "facebook-legal-test",
  }, legal);
  assert.ok(html.includes(`<link rel="canonical" href="https://mx.qrveo.com/mexico/${full}">`));
  assert.ok(html.includes('<article class="legal wrap" lang="es-MX">'));
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(html.includes("<h1>Eliminación de datos</h1>"));
  assert.ok(!html.includes("\ufffd"));
}
console.log("PASS: deletion instructions, account-control requirement, no credential request, eight localized pages");
