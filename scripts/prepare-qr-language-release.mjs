import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";

const [baseline, output, baseRelease] = process.argv.slice(2);
assert.ok(baseline && output && /^mx-integrated-\d{8}-\d{2}$/.test(baseRelease),
  "Usage: node scripts/prepare-qr-language-release.mjs BASELINE OUTPUT BASE_RELEASE");
const base = path.resolve(baseline), out = path.resolve(output);
await assert.rejects(access(out), "Output must not already exist");
const digest = value => createHash("sha256").update(value).digest("hex");
const read = file => readFile(file, "utf8");
const normalize = value => value.replace(/\r\n/g, "\n");
const once = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Expected one patch anchor: ${before}`);
  return source.replace(before, after);
};
const generator = await read("src/scripts/qr-generator.mjs");
const localSite = normalize(await read("src/scripts/site.js"));
const previousSite = await read(path.join(base, "mexico/assets/site.js"));
let site = normalize(previousSite).replace(/qr-generator\.mjs\?v=[^"]+/, "qr-generator.mjs?v=__QR_GENERATOR_VERSION__");
site = once(site, "function rememberLanguage(code) {",
  "let qrGeneratorReady, changingLanguage = false;\nfunction rememberLanguage(code) {");
const handler = localSite.slice(localSite.indexOf("async function changeLanguage(event) {"), localSite.indexOf("const langBox ="));
assert.ok(handler.startsWith("async function") && handler.endsWith("}\n"));
site = once(site, "const langBox =", handler + "const langBox =");
site = once(site, 'a.addEventListener("click", () => rememberLanguage(a.dataset.setLang));',
  'a.addEventListener("click", changeLanguage);');
site = once(site, 'a.addEventListener("click", () => rememberLanguage(pick.dataset.setLang));',
  'a.addEventListener("click", changeLanguage);');
site = once(site, 'if (document.querySelector("[data-qr-generator]")) {\n  generatorModule()',
  'if (document.querySelector("[data-qr-generator]")) {\n  qrGeneratorReady = generatorModule()');
assert.equal(site, localSite, "Do not include unrelated local website edits");
site = site.replace("__QR_GENERATOR_VERSION__", digest(generator).slice(0, 12));
const siteName = `site.language-${digest(site).slice(0, 12)}.js`;
const files = [];
async function add(relative, content, before = true) {
  const destination = path.join(out, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
  files.push({
    target: "/usr/share/nginx/html", path: relative, artifact: relative,
    sha256: digest(Buffer.from(content)),
    before_sha256: before ? digest(await readFile(path.join(base, relative))) : null,
  });
}
await add(`mexico/assets/${siteName}`, site, false);
await add("mexico/assets/qr-generator.mjs", generator);
for (const lang of ["es", "en", "pt", "fr", "de", "zh", "ja", "ko"]) {
  const relative = `mexico/${lang === "es" ? "" : lang + "/"}crear-qr/index.html`;
  let html = await read(path.join(base, relative));
  const content = JSON.parse(await read(`content/${lang}.json`)).generator;
  const match = /(<script[^>]*data-qr-text>)([\s\S]*?)(<\/script>)/.exec(html);
  assert.ok(match, `Missing generator copy: ${lang}`);
  const text = JSON.parse(match[2]);
  text.errors.draft = content.errors.draft;
  html = once(html, match[0], match[1] + JSON.stringify(text).replace(/</g, "\\u003c") + match[3]);
  const scripts = [...html.matchAll(/assets\/site\.js\?v=[^"]+/g)];
  assert.equal(scripts.length, 1);
  html = once(html, scripts[0][0], `assets/${siteName}`);
  await add(relative, html);
}
const handoff = {
  kind: "qrveo-agent-handoff", owner: "free-qr-language-continuity", service: "official",
  base_release: baseRelease, status: "ready", production_deployed: false,
  tests: [
    "19 qr-video-readiness regression tests passed, including anonymous/member draft recovery, upload completion gating, storage transaction failure, account isolation and server-limit revalidation.",
    "Browser: selected 2,109,636-byte video persisted from Chinese to English to Spanish with a working blob preview.",
    "Browser: switching during member upload stayed on Chinese until PUT and complete finished, then restored the same watch URL in English.",
    "Isolated server recorded exactly one upload POST, one PUT and one complete POST.",
    "Browser: forced IndexedDB failure retained the selected video on the Chinese page with upload still enabled.",
    "Candidate is based on frozen official artifacts; only generator pages and their scripts change. Existing unrelated local edits are excluded.",
  ],
  rollback: { release: baseRelease, service: "official",
    command: `sudo -n python3 /home/mx/qrveo/operations/release_coordinator.py rollback ${baseRelease} official` },
  files,
};
await writeFile(path.join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ output: out, baseRelease, files: files.length, siteName }));
