import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pageAuth } from "../src/render.mjs";
import { LANGS, langDir, localize } from "../src/i18n.mjs";

const [baselinePath, output] = process.argv.slice(2);
assert.ok(baselinePath && output, "Usage: node scripts/prepare-facebook-login-release.mjs FROZEN_BASE OUTPUT");
const baseline = path.resolve(baselinePath), out = path.resolve(output);
await assert.rejects(access(out), "Candidate output must not already exist");
const manifest = JSON.parse(await readFile(path.join(baseline, "release.json"), "utf8"));
const digest = value => createHash("sha256").update(value).digest("hex");
const assetPath = (html, type, relative) => {
  const value = type === "css" ? /<link rel="stylesheet" href="([^"]+)">/.exec(html)?.[1]
    : /<script type="module" src="([^"]+)"><\/script>/.exec(html)?.[1];
  assert.ok(value);
  const url = new URL(value, "https://mx.qrveo.com/" + relative);
  assert.equal(url.origin, "https://mx.qrveo.com");
  assert.ok(url.pathname.startsWith("/mexico/assets/"));
  return url.pathname.slice(1);
};
const source = await readFile(new URL("../src/scripts/site.js", import.meta.url), "utf8");
const start = source.indexOf('  const facebookBox = authPage.querySelector("[data-facebook-auth]");');
const end = source.indexOf("  // 后台的错误", start);
assert.ok(start > 0 && end > start);
const facebookSource = source.slice(start, end);
const require = createRequire(new URL("../../../qrveo-backend-fixes/package.json", import.meta.url));
const { parse } = require("acorn");
function facebookScript(oldJs) {
assert.ok(!oldJs.includes("data-facebook-auth"), "Do not apply Facebook twice");
const tree = parse(oldJs, { ecmaVersion: "latest", sourceType: "module" });
const nodes = [];
function walk(node, parent) {
  if (!node || typeof node !== "object") return;
  if (node.type) nodes.push({ node, parent });
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, node));
    else if (value && typeof value === "object") walk(value, node);
  }
}
walk(tree);
const unique = values => {
  const found = [...new Set(values)];
  assert.equal(found.length, 1, "Frozen auth binding must be unambiguous");
  return found[0];
};
const authName = unique(nodes.filter(({ node }) => node.type === "VariableDeclarator" &&
  node.init?.type === "CallExpression" && node.init.callee?.object?.name === "document" &&
  node.init.callee?.property?.name === "querySelector" &&
  node.init.arguments[0]?.value === "[data-auth-page]").map(({ node }) => node.id.name));
const authBody = unique(nodes.filter(({ node }) => node.type === "IfStatement" &&
  node.test.type === "Identifier" && node.test.name === authName).map(({ node }) => node.consequent));
assert.equal(authBody.type, "BlockStatement");
const copyName = unique(nodes.filter(({ node }) => node.type === "VariableDeclarator" &&
  node.start > authBody.start && node.end < authBody.end &&
  node.init?.callee?.object?.name === "JSON" && node.init.callee?.property?.name === "parse" &&
  oldJs.slice(node.init.start, node.init.end).includes('"auth-text"')).map(({ node }) => node.id.name));
const namedHelper = label => unique(nodes.filter(({ node }) => node.type === "CallExpression" &&
  node.arguments[1]?.value === label).map(({ node, parent }) =>
    node.arguments[0]?.type === "Identifier" ? node.arguments[0].name :
      parent.type === "VariableDeclarator" ? parent.id.name : null).filter(Boolean));
const trackName = unique(nodes.filter(({ node }) => node.type === "CallExpression" &&
  node.arguments[0]?.value === "sign_up" && node.callee.type === "Identifier").map(({ node }) => node.callee.name));
const injection = "\n(function(authPage, T, api, dataOf, afterLogin, track) {\n" + facebookSource +
  "\n})(" + [authName, copyName, namedHelper("api"), namedHelper("dataOf"), namedHelper("afterLogin"), trackName].join(",") + ");\n";
const js = oldJs.slice(0, authBody.end - 1) + injection + oldJs.slice(authBody.end - 1);
parse(js, { ecmaVersion: "latest", sourceType: "module" });
return js;
}
const accountCss = await readFile(new URL("../src/styles/account.css", import.meta.url), "utf8");
const cssStart = accountCss.indexOf(".auth-facebook {");
const cssEnd = accountCss.indexOf(".auth-google-start {", cssStart);
assert.ok(cssStart > 0 && cssEnd > cssStart);
const facebookCss =
  "\n.page-auth .auth-facebook { max-width: 400px; }\n.auth-facebook [hidden] { display: none; }\n" +
  accountCss.slice(cssStart, cssEnd);
const files = [];
async function add(relative, data, before) {
  const destination = path.join(out, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, data, "utf8");
  files.push({ target: "/usr/share/nginx/html", path: relative, artifact: relative,
    sha256: digest(data), before_sha256: before });
}
const assets = new Map();
async function patchAsset(original, type) {
  if (assets.has(original)) return assets.get(original);
  const old = await readFile(path.join(baseline, original), "utf8");
  const next = type === "js" ? facebookScript(old) : old + facebookCss;
  const relative = "mexico/assets/site.facebook." + digest(next).slice(0, 12) + "." + type;
  if (!files.some(file => file.path === relative)) await add(relative, next, null);
  assets.set(original, relative);
  return relative;
}
const es = JSON.parse(await readFile(new URL("../content/es.json", import.meta.url), "utf8"));
for (const lang of LANGS) {
  const tr = JSON.parse(await readFile(new URL(`../content/${lang.code}.json`, import.meta.url), "utf8"));
  const c = localize(es, tr);
  for (const [kind, route] of [["login", "iniciar-sesion/"], ["register", "registro/"]]) {
    const full = langDir(lang.code) + route;
    const root = "../".repeat(full.split("/").filter(Boolean).length);
    const rendered = pageAuth(c, {
      origin: "https://mx.qrveo.com", base: "/mexico/", root, L: root + langDir(lang.code),
      lang, langs: LANGS, path: route, full, alt: other => langDir(other.code) + route, v: "facebook",
      qr: () => "", demo: "https://mx.qrveo.com/mexico/hero-player.html",
    }, kind);
    const facebookStart = rendered.indexOf('<div class="auth-facebook"');
    const facebookEnd = rendered.indexOf('<div class="auth-divider">', facebookStart);
    assert.ok(facebookStart > 0 && facebookEnd > facebookStart);
    const block = rendered.slice(facebookStart, facebookEnd);
    const newCopy = JSON.parse(/id="auth-text">([^<]+)<\/script>/.exec(rendered)[1]).facebook;
    const relative = "mexico/" + full + "index.html";
    const before = await readFile(path.join(baseline, relative), "utf8");
    const nextJs = await patchAsset(assetPath(before, "js", relative), "js");
    const nextCss = await patchAsset(assetPath(before, "css", relative), "css");
    assert.ok(!before.includes("data-facebook-auth"));
    assert.equal(before.split('<div class="auth-divider">').length, 2);
    let html = before.replace('<div class="auth-divider">', block + '<div class="auth-divider">');
    html = html.replace(/(<script type="application\/json" id="auth-text">)([^<]+)(<\/script>)/,
      (match, open, json, close) => open +
        JSON.stringify({ ...JSON.parse(json), facebook: newCopy }).replace(/</g, "\\u003c") + close);
    html = html.replace(/(<link rel="stylesheet" href=")[^"]+(")/, "$1/" + nextCss + "$2")
      .replace(/(<script type="module" src=")[^"]+("><\/script>)/, "$1/" + nextJs + "$2");
    assert.ok(html.includes("data-google-auth") && html.includes("data-facebook-auth"));
    await add(relative, html, digest(before));
  }
}
const handoff = {
  kind: "qrveo-agent-handoff", owner: "facebook-quick-login", service: "official",
  base_release: manifest.release_id, status: "ready", production_deployed: false,
  tests: [
    "Facebook button and translated account states rendered on all 16 login/register pages.",
    "Only Facebook block added to frozen production JS/CSS/HTML; existing Google, email, trial claim and other pages preserved.",
    "Focused browser checks recorded before deployment.",
  ],
  rollback: { command: `release_coordinator.py rollback ${manifest.release_id} official` },
  files,
};
await writeFile(path.join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ output: out, base: manifest.release_id, files: files.length, sourceAssets: assets.size }));
