import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [baseline, output, baseRelease] = process.argv.slice(2);
assert.ok(baseline && output && /^mx-integrated-\d{8}-\d{2}$/.test(baseRelease),
  "Usage: node scripts/prepare-seo-analytics-release.mjs BASELINE OUTPUT BASE_RELEASE");
const base = path.resolve(baseline), out = path.resolve(output);
const root = fileURLToPath(new URL("../", import.meta.url));
await assert.rejects(access(out), "Output must not already exist");
const manifest = JSON.parse(await readFile(path.join(base, "release.json"), "utf8"));
assert.equal(manifest.release_id, baseRelease);
const digest = (data) => createHash("sha256").update(data).digest("hex");
const once = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Expected one patch anchor: ${before}`);
  return source.replace(before, after);
};
const regexOnce = (source, expression, replacement) => {
  assert.equal([...source.matchAll(expression)].length, 1, `Expected one code anchor: ${expression}`);
  return source.replace(expression, replacement);
};
const files = [];
async function add(relative, content, before = null, target = "/usr/share/nginx/html", targetPath = relative) {
  const destination = path.join(out, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
  files.push({ target, path: targetPath, artifact: relative,
    sha256: digest(content), before_sha256: before === null ? null : digest(before) });
}
async function htmlFiles(directory, prefix = "mexico") {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${item.name}`;
    if (item.isDirectory()) result.push(...await htmlFiles(path.join(directory, item.name), relative));
    else if (item.name.endsWith(".html")) result.push(relative);
  }
  return result;
}

const analytics = await readFile(path.join(root, "src/scripts/analytics.mjs"), "utf8");
const analyticsName = `analytics.${digest(analytics).slice(0, 12)}.mjs`;
await add(`mexico/assets/${analyticsName}`, analytics);
const pages = await htmlFiles(path.join(base, "mexico"));
const scripts = new Map();
for (const relative of pages) {
  const html = await readFile(path.join(base, relative), "utf8");
  for (const match of html.matchAll(/<script\b[^>]*src="[^"]*assets\/(site[^"?]+[.]js)/g)) {
    scripts.set(match[1], "");
  }
}
assert.equal(scripts.size, 3, "Recheck the active site's script variants before release");
for (const oldName of scripts.keys()) {
  const before = await readFile(path.join(base, "mexico/assets", oldName), "utf8");
  assert.ok(!before.includes("qrveoTrack"));
  let script = once(before, "window.open(`https://wa.me/",
    'qrveoTrack("contact_click",{method:"whatsapp",interaction:"form"}),window.open(`https://wa.me/');
  script = regexOnce(script, /(\w+)\((\w+)[.]regDone,!0\),/g,
    '$1($2.regDone,!0),await qrveoTrack("sign_up",{method:"email"}),');
  script = regexOnce(script, /,(\w+)\((\w+)[.]token\)\}catch\(\2\)\{/g,
    ',$2.isNew===!0&&await qrveoTrack("sign_up",{method:"google"}),$1($2.token)}catch($2){');
  script = `import {track as qrveoTrack} from "./${analyticsName}";\n` + script;
  const newName = `site.seo-analytics-${digest(script).slice(0, 12)}.js`;
  scripts.set(oldName, newName);
  await add(`mexico/assets/${newName}`, script);
}

const content = JSON.parse(await readFile(path.join(root, "content/es.json"), "utf8"));
const description = content.meta.description;
assert.ok(description.length >= 100 && description.length <= 160);
const escape = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
let changedPages = 0;
for (const relative of pages) {
  const before = await readFile(path.join(base, relative), "utf8");
  let html = before;
  for (const [oldName, newName] of scripts) {
    if (html.includes(`assets/${oldName}`)) html = once(html, `assets/${oldName}`, `assets/${newName}`);
  }
  if (relative === "mexico/index.html") {
    html = regexOnce(html, /<meta name="description" content="[^"]*">/g,
      `<meta name="description" content="${escape(description)}">`);
  }
  if (html !== before) {
    assert.equal(html.slice(html.indexOf("<body")), before.slice(before.indexOf("<body")),
      `Preserve page bodies and existing accessibility semantics: ${relative}`);
    await add(relative, html, before);
    changedPages++;
  }
}
assert.equal(changedPages, 152, "Recheck the active page inventory");
const nginxBefore = await readFile(path.join(base, "nginx.conf"), "utf8");
const mapStart = nginxBefore.indexOf("map $uri $qrveo_analytics_tag {");
assert.ok(mapStart >= 0);
const mapEnd = nginxBefore.indexOf("\n}\n", mapStart) + 3;
assert.ok(mapEnd > mapStart);
let nginx = nginxBefore.slice(0, mapStart) + nginxBefore.slice(mapEnd);
nginx = once(nginx, "$qrveo_analytics_tag", "");
assert.ok(!nginx.includes("googletagmanager.com"));
assert.ok(nginx.includes('name="google-site-verification"'));
assert.ok(nginx.includes('Strict-Transport-Security "max-age=15552000"'));
await add("config/nginx.conf", nginx, nginxBefore, "/etc/nginx/conf.d/default.conf", "");

const handoff = {
  kind: "qrveo-agent-handoff", owner: "codex-seo-analytics-20261112",
  service: "official", base_release: baseRelease, status: "ready", production_deployed: false,
  tests: [
    "node scripts/analytics.test.mjs: local/QA isolation, private-page redaction, real success callbacks and contact-intent checks",
    "All three active script variants receive the same bounded callback patches; all 152 page bodies remain byte-identical",
    "The existing homepage paint-triggered tag loading is preserved in the shared module",
    "The production nginx verification tag, runtime script, HSTS, gzip and caching directives are preserved",
    "Only official service artifacts change; no backend, gateway, database, or existing source edits are replaced",
  ],
  rollback: { release: baseRelease, service: "official",
    command: `sudo -n python3 /home/mx/qrveo/operations/release_coordinator.py rollback ${baseRelease} official` },
  files,
};
await writeFile(path.join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ output: out, baseRelease, files: files.length,
  changedPages, scripts: Object.fromEntries(scripts), analyticsName, descriptionLength: description.length }, null, 2));
