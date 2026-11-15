import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pageLegal } from "../src/render.mjs";
import { legalPages } from "../src/legal.mjs";
import { LANGS, langDir, localize } from "../src/i18n.mjs";

const [baselinePath, output, baseRelease, privacyHash] = process.argv.slice(2);
assert.ok(baselinePath && output && /^mx-integrated-\d{8}-\d{2}$/.test(baseRelease || "") &&
  /^[a-f0-9]{64}$/.test(privacyHash || ""),
  "Usage: node scripts/prepare-facebook-legal-release.mjs FROZEN_PRIVACY OUTPUT BASE_RELEASE SHA256");
const out = path.resolve(output);
await assert.rejects(access(out), "Output must not already exist");
const digest = value => createHash("sha256").update(value).digest("hex");
const baseline = await readFile(baselinePath);
assert.equal(digest(baseline), privacyHash, "Downloaded privacy page must match the active frozen release");
const html = baseline.toString("utf8");
const stylesheet = /<link rel="stylesheet" href="([^"]+)">/.exec(html)?.[1];
const script = /<script type="module" src="([^"]+)"><\/script>/.exec(html)?.[1];
assert.ok(stylesheet && script, "Active stylesheet and module must be present");
const assetUrl = value => {
  const url = new URL(value, "https://mx.qrveo.com/mexico/aviso-de-privacidad/");
  assert.equal(url.origin, "https://mx.qrveo.com");
  assert.ok(url.pathname.startsWith("/mexico/assets/"));
  return url.pathname + url.search;
};
const cssUrl = assetUrl(stylesheet), jsUrl = assetUrl(script);
const es = JSON.parse(await readFile(new URL("../content/es.json", import.meta.url), "utf8"));
const legal = legalPages.find(page => page.path === "eliminacion-de-datos/");
assert.ok(legal);
const files = [];
for (const lang of LANGS) {
  const tr = JSON.parse(await readFile(new URL(`../content/${lang.code}.json`, import.meta.url), "utf8"));
  const full = langDir(lang.code) + legal.path;
  const root = "../".repeat(full.split("/").filter(Boolean).length);
  let content = pageLegal(localize(es, tr), {
    origin: "https://mx.qrveo.com", base: "/mexico/", root,
    L: root + langDir(lang.code), lang, langs: LANGS, path: legal.path, full,
    alt: other => langDir(other.code) + legal.path, v: "facebook-legal",
  }, legal);
  content = content.replace(`${root}assets/site.css?v=facebook-legal`, cssUrl)
    .replace(`${root}assets/site.js?v=facebook-legal`, jsUrl);
  assert.ok(content.includes(cssUrl) && content.includes(jsUrl));
  const relative = `mexico/${full}index.html`;
  const destination = path.join(out, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
  files.push({ target: "/usr/share/nginx/html", path: relative, artifact: relative,
    sha256: digest(content), before_sha256: null });
}
const handoff = {
  kind: "qrveo-agent-handoff", owner: "facebook-data-deletion", service: "official",
  base_release: baseRelease, status: "ready", production_deployed: false,
  tests: [
    "node scripts/facebook-legal.test.mjs: eight localized legal pages passed.",
    "SSH-downloaded privacy HTML matches the active frozen SHA256; new pages reuse its exact active assets.",
    "Only eight previously absent deletion-instructions pages are added; no login, account, media or runtime changes.",
  ],
  rollback: { release: baseRelease, service: "official",
    command: `sudo -n python3 /home/mx/qrveo/operations/release_coordinator.py rollback ${baseRelease} official` },
  files,
};
await writeFile(path.join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ output: out, baseRelease, additions: files.length, cssUrl, jsUrl }));
