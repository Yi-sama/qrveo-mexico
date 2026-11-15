import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [baseline, output, baseRelease] = process.argv.slice(2);
assert.ok(baseline && output && /^mx-integrated-\d{8}-\d{2}$/.test(baseRelease),
  "Usage: node scripts/prepare-trial-limit-release.mjs BASELINE OUTPUT BASE_RELEASE");
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
const generator = await readFile("src/scripts/qr-generator.mjs", "utf8");
const previousGenerator = await readFile(path.join(base, "mexico/assets/qr-generator.mjs"), "utf8");
let checked = normalize(generator);
for (const [after, before] of [
  ["    remaining.hidden = !remaining.textContent;\n", ""],
  ['!(data.maxSeconds === null || Number.isSafeInteger(data.maxSeconds) && data.maxSeconds >= 1)', '!Number.isSafeInteger(data.maxSeconds) || data.maxSeconds < 1'],
  ["(data.maxSeconds === null ? T.memberLimits : T.dropLimits)", "T.dropLimits"],
  ['!before || !V("quota").textContent', "!before"],
  ["!member && trialLimits.maxSeconds !== null && seconds >", "!member && seconds >"],
]) checked = once(checked, after, before);
assert.equal(checked, normalize(previousGenerator), "Do not deploy unrelated generator edits");
const generatorName = `qr-generator.trial-limits-${digest(generator).slice(0, 12)}.mjs`;
const firstHtml = await readFile(path.join(base, "mexico/crear-qr/index.html"), "utf8");
const previousSiteName = /assets\/(site[^"]+\.js)"/.exec(firstHtml)?.[1];
assert.ok(previousSiteName);
const previousSite = await readFile(path.join(base, "mexico/assets", previousSiteName), "utf8");
const imported = /import\("\.\/(qr-generator[^"]+)"\)/.exec(previousSite);
assert.ok(imported);
assert.equal(imported[1], `qr-generator.unlimited-${digest(previousGenerator).slice(0, 12)}.mjs`,
  "The frozen generator must match the active import");
const site = once(previousSite, imported[1], generatorName);
const siteName = `site.trial-limits-${digest(site).slice(0, 12)}.js`;
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
  let html = once(before, `<p class="gen-quota" data-trial-quota>${esc(copy.trialQuota)}</p>`,
    '<p class="gen-quota" data-trial-quota hidden></p>');
  html = once(html, `<p class="gen-quota"><span data-qr-remaining aria-live="polite">${esc(copy.loading)}</span></p>`,
    '<p class="gen-quota" data-qr-remaining aria-live="polite" hidden></p>');
  html = once(html, `<p>${esc(copy.quotaNote)}</p>`, "");
  for (const key of ["remaining", "unlimited", "quotaNote", "trialQuota", "trialRemaining"]) copy[key] = "";
  html = once(html, match[0], match[1] + JSON.stringify(copy).replace(/</g, "\\u003c") + match[3]);
  html = once(html, `assets/${previousSiteName}`, `assets/${siteName}`);
  await add(relative, html, before);
}
const handoff = {
  kind: "qrveo-agent-handoff", owner: "temporary-trial-limits", service: "official",
  base_release: baseRelease, status: "ready", production_deployed: false,
  tests: [
    "21 upload-readiness regressions passed, including a 51 MB / 180 second anonymous video with disabled duration limits.",
    "Enabled duration and server-provided size limits remain enforced; member auth and language drafts remain covered.",
    "All eight locales build with strict UTF-8; quantity copy is removed without changing QR entitlements.",
    "Candidate is patched from frozen official HTML and its verified generator import; unrelated local styles and copy are excluded.",
  ],
  rollback: { release: baseRelease, service: "official",
    command: `sudo -n python3 /home/mx/qrveo/operations/release_coordinator.py rollback ${baseRelease} official` },
  files,
};
await writeFile(path.join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ output: out, baseRelease, files: files.length, siteName, generatorName }));
