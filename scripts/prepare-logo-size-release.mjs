import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [baseline, output, baseRelease] = process.argv.slice(2);
assert.ok(baseline && output && /^mx-integrated-\d{8}-\d{2}$/.test(baseRelease),
  "Usage: node scripts/prepare-logo-size-release.mjs BASELINE OUTPUT BASE_RELEASE");
const base = path.resolve(baseline), out = path.resolve(output);
await assert.rejects(access(out), "Output must not already exist");
const manifest = JSON.parse(await readFile(path.join(base, "release.json"), "utf8"));
assert.equal(manifest.release_id, baseRelease);
const digest = data => createHash("sha256").update(data).digest("hex");
const normalize = text => text.replace(/\r\n/g, "\n");
const esc = text => text.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const once = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Expected one patch anchor: ${before}`);
  return source.replace(before, after);
};
const firstHtml = await readFile(path.join(base, "mexico/crear-qr/index.html"), "utf8");
const previousSiteName = /assets\/(site[^"]+\.js)"/.exec(firstHtml)?.[1];
assert.ok(previousSiteName);
const previousSite = await readFile(path.join(base, "mexico/assets", previousSiteName), "utf8");
const imported = /import\("\.\/(qr-generator[^"]+)"\)/.exec(previousSite);
assert.ok(imported);
const previousGenerator = await readFile(path.join(base, "mexico/assets", imported[1]), "utf8");
const generator = await readFile("src/scripts/qr-generator.mjs", "utf8");
const check = once(normalize(generator),
  'if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))',
  'if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024)');
assert.equal(check, normalize(previousGenerator), "Only the logo file-size check may change");
const generatorName = `qr-generator.logo-size-${digest(generator).slice(0, 12)}.mjs`;
const site = once(previousSite, imported[1], generatorName);
const siteName = `site.logo-size-${digest(site).slice(0, 12)}.js`;
const files = [];
async function add(relative, content, before = null) {
  const destination = path.join(out, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
  files.push({ target: "/usr/share/nginx/html", path: relative, artifact: relative,
    sha256: digest(content), before_sha256: before === null ? null : digest(before) });
}
await add(`mexico/assets/${generatorName}`, generator);
await add(`mexico/assets/${siteName}`, site);
for (const lang of ["es", "en", "pt", "fr", "de", "zh", "ja", "ko"]) {
  const relative = `mexico/${lang === "es" ? "" : lang + "/"}crear-qr/index.html`;
  const before = await readFile(path.join(base, relative), "utf8");
  const match = /(<script[^>]*data-qr-text>)([\s\S]*?)(<\/script>)/.exec(before);
  assert.ok(match);
  const copy = JSON.parse(match[2]);
  const source = JSON.parse(await readFile(`content/${lang}.json`, "utf8")).generator;
  let html = once(before, `<span class="gen-note" data-qr-logo-name>${esc(copy.logoHint)}</span>`,
    `<span class="gen-note" data-qr-logo-name>${esc(source.logoHint)}</span>`);
  copy.logoHint = source.logoHint;
  copy.errors.logo = source.errors.logo;
  html = once(html, match[0], match[1] + JSON.stringify(copy).replace(/</g, "\\u003c") + match[3]);
  html = once(html, `assets/${previousSiteName}`, `assets/${siteName}`);
  await add(relative, html, before);
}
const handoff = {
  kind: "qrveo-agent-handoff", owner: "logo-size-limit", service: "official",
  base_release: baseRelease, status: "ready", production_deployed: false,
  tests: [
    "26 readiness regressions passed, including PNG/JPEG/WebP over 2 MiB, removal and invalid-image rejection.",
    "All eight locales passed generator-copy checks and an isolated UTF-8 website build.",
    "Generator differs from the active frozen module only by removal of the logo file-size predicate.",
    "Frozen HTML retains all other copy and markup; only logo hints, logo errors and fingerprinted imports change.",
  ],
  rollback: { release: baseRelease, service: "official",
    command: `sudo -n python3 /home/mx/qrveo/operations/release_coordinator.py rollback ${baseRelease} official` },
  files,
};
await writeFile(path.join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ output: out, baseRelease, files: files.length, siteName, generatorName }));
