import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { skipEmptyTrial } from "./prepare-entry-speed-release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.resolve(root, "../../qrveo-backend-fixes/package.json"));
const { parse } = require("acorn");
const ast = source => parse(source, { ecmaVersion: "latest", sourceType: "module" });
function nodes(tree, predicate) {
  const result = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) result.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(tree);
  return result;
}
const navigation = await readFile(path.join(root, "src/scripts/navigation-media.mjs"), "utf8");
const events = {};
let paused = 0, loaded = 0;
function mediaElement(src) {
  return { src, getAttribute() { return this.src; }, removeAttribute() { this.src = null; },
    setAttribute(name, value) { assert.equal(name, "src"); this.src = value; } };
}
const source = mediaElement("/video.mp4");
const video = { ...mediaElement(null), preload: "auto", paused: false,
  pause() { paused++; }, play() { return Promise.resolve(); },
  querySelectorAll() { return [source]; },
  load() {
    assert.equal(source.src, null, "Resetting a source list must not start new media requests");
    loaded++;
  } };
const location = new URL("https://mx.qrveo.com/mexico/");
vm.runInNewContext(navigation, { URL, location, addEventListener(name, fn) { events[name] = fn; }, document: {
  addEventListener(name, fn) { events[name] = fn; },
  querySelectorAll(selector) { assert.equal(selector, "video"); return [video]; },
} });
function click(url, options = {}, attributes = {}) {
  const link = { href: new URL(url, location).href, target: "", hasAttribute() { return false; }, ...attributes };
  events.click({ button: 0, target: { closest() { return link; } }, ...options });
}
click("#examples");
click("https://example.invalid/");
click("/mexico/iniciar-sesion/", { ctrlKey: true });
click("/mexico/iniciar-sesion/", { button: 1 });
click("/mexico/iniciar-sesion/", { defaultPrevented: true });
click("/mexico/iniciar-sesion/", {}, { target: "_blank" });
click("/mexico/iniciar-sesion/", {}, { hasAttribute: name => name === "download" });
assert.equal(loaded, 0, "Non-navigation clicks must leave media alone");
click("/mexico/iniciar-sesion/");
assert.equal(loaded, 1);
assert.equal(paused, 1);
assert.equal(video.preload, "none");
events.pageshow();
assert.equal(source.src, "/video.mp4", "Back navigation must restore video sources");
assert.equal(video.preload, "auto");

const [baseDirectory, candidateDirectory] = process.argv.slice(2);
assert(baseDirectory && candidateDirectory, "Usage: node scripts/entry-speed.test.mjs BASE CANDIDATE");
const base = path.resolve(baseDirectory), candidate = path.resolve(candidateDirectory);
const manifest = JSON.parse(await readFile(path.join(candidate, "handoff.json"), "utf8"));
assert.equal(manifest.service, "official");
assert.equal(manifest.production_deployed, false);
const sha = data => createHash("sha256").update(data).digest("hex");
let pageCount = 0, moduleCount = 0;
const declared = new Set(manifest.files.map(file => file.path));
for (const file of manifest.files) {
  assert.equal(file.target, "/usr/share/nginx/html", "Do not change runtime configuration");
  const source = await readFile(path.join(candidate, file.path), "utf8");
  assert.equal(sha(source), file.sha256);
  if (file.before_sha256 !== null) {
    const original = await readFile(path.join(base, file.path), "utf8");
    assert.equal(sha(original), file.before_sha256);
    assert.equal(source.slice(source.indexOf("<body")), original.slice(original.indexOf("<body")));
    assert(!/<(?:script|link)[^>]*(?:src|href)="[^"]+[.]mjs"/.test(source),
      "No uncached mjs module URL may remain in an HTML entry");
    pageCount++;
  } else {
    const tree = ast(source);
    for (const node of nodes(tree, node => node.type === "ImportDeclaration" || node.type === "ImportExpression")) {
      assert.match(node.source.value, /^\.\/[^/]+[.]entry-[a-f0-9]{12}[.]js$/);
      assert(declared.has("mexico/assets/" + node.source.value.slice(2)), "Undeclared module dependency");
    }
    moduleCount++;
  }
}
assert.equal(pageCount, 160);
assert(moduleCount >= 10);
const assets = new Set(["site.multipart-9d8d4f55363f.js", "site.multipart-cf7dcb233a7a.js",
  "site.multipart-a751034565cd.js", "site.multipart-bfa4aaa956e0.js"]);
for (const name of assets) {
  const original = await readFile(path.join(base, "mexico/assets", name), "utf8");
  const changed = skipEmptyTrial(original);
  assert.equal(changed.replace('if(!localStorage.getItem("qrveo-last-qr"))return;', ""), original);
  const claim = nodes(ast(changed), node => node.type === "FunctionDeclaration" && node.async &&
    nodes(node.body, child => child.type === "Property" && child.key?.name === "readLastQr").length === 1)[0];
  const generator = nodes(claim, node => node.type === "AwaitExpression" &&
    node.argument.type === "CallExpression" && node.argument.arguments.length === 0)[0].argument.callee.name;
  const api = nodes(claim, node => node.type === "CallExpression" &&
    node.arguments[0]?.value === "/trial/claim")[0].callee.name;
  for (const saved of [null, { kind: "video", trialId: "local-trial", trialToken: "local-token" }]) {
    let imports = 0, claims = 0, cleared = 0;
    const context = {
      Date, setTimeout, localStorage: { getItem() { return saved ? JSON.stringify(saved) : null; } },
      [generator]: async () => { imports++; return { readLastQr: () => saved, clearLastQr: () => cleared++ }; },
      [api]: async (url, options) => {
        claims++;
        assert.equal(url, "/trial/claim");
        assert.equal(options.body.trialId, saved.trialId);
        assert.equal(options.token, "local-session");
      },
    };
    await vm.runInNewContext(changed.slice(claim.start, claim.end) +
      `\n${claim.id.name}("local-session")`, context);
    assert.equal(imports, saved ? 1 : 0);
    assert.equal(claims, saved ? 1 : 0);
    assert.equal(cleared, saved ? 1 : 0);
  }
}
console.log(`PASS: media navigation guards, four trial-claim variants, ${pageCount} unchanged page bodies, ${moduleCount} hashed JS modules and declared dependencies`);
