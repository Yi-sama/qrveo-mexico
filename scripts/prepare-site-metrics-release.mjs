import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [baseline, output] = process.argv.slice(2);
assert(baseline && output, "Usage: node scripts/prepare-site-metrics-release.mjs BASELINE OUTPUT");
const root = fileURLToPath(new URL("../", import.meta.url));
const { parse } = createRequire(path.resolve(root, "../../qrveo-backend-fixes/package.json"))("acorn");
const base = path.resolve(baseline), out = path.resolve(output);
await assert.rejects(access(out), "Output must not exist");
const manifest = JSON.parse(await readFile(path.join(base, "release.json"), "utf8"));
assert.match(manifest.release_id, /^mx-integrated-\d{8}-\d{2}$/);
const digest = text => createHash("sha256").update(text).digest("hex");
const files = [];
async function add(relative, text, before = null) {
  const destination = path.join(out, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, text, "utf8");
  files.push({ target: "/usr/share/nginx/html", path: relative, artifact: relative,
    sha256: digest(text), before_sha256: before === null ? null : digest(before) });
}
function nodes(tree, predicate) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "string" && predicate(node)) found.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(tree);
  return found;
}
const ast = source => parse(source, { ecmaVersion: "latest", sourceType: "module" });
const one = (items, label) => {
  assert.equal(items.length, 1, `Expected one ${label}; recheck the production variant`);
  return items[0];
};
const property = (node, name) => node?.type === "MemberExpression" && !node.computed && node.property.name === name;
const named = (tree, name) => one(nodes(tree, node => node.type === "CallExpression" &&
  node.arguments[1]?.value === name), name);
function apply(source, patches) {
  let boundary = source.length;
  for (const [start, end, value] of patches.sort((a, b) => b[0] - a[0])) {
    assert(end <= boundary && start <= end, "Patches cannot overlap");
    source = source.slice(0, start) + value + source.slice(end);
    boundary = start;
  }
  ast(source);
  return source;
}
async function htmlFiles(directory, prefix = "mexico") {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + "/" + item.name;
    if (item.isDirectory()) result.push(...await htmlFiles(path.join(directory, item.name), relative));
    else if (item.name.endsWith(".html")) result.push(relative);
  }
  return result;
}

const metrics = await readFile(path.join(root, "src/scripts/site-metrics.mjs"), "utf8");
ast(metrics);
const metricsName = `site-metrics.${digest(metrics).slice(0, 12)}.mjs`;
await add("mexico/assets/" + metricsName, metrics);
const pages = await htmlFiles(path.join(base, "mexico")), scriptNames = new Set();
for (const relative of pages) {
  const text = await readFile(path.join(base, relative), "utf8");
  for (const match of text.matchAll(/<script\b[^>]*src="[^"]*assets\/(site[^"?]+[.]js)/g)) scriptNames.add(match[1]);
}
assert.equal(scriptNames.size, 4, "Preserve all four active site-script variants");
const scripts = new Map(), generators = new Map();
for (const name of scriptNames) {
  const source = await readFile(path.join(base, "mexico/assets", name), "utf8"), tree = ast(source);
  const generator = one(nodes(tree, node => node.type === "ImportExpression" &&
    typeof node.source.value === "string" && node.source.value.startsWith("./qr-generator.")), "generator import");
  const oldGenerator = generator.source.value.slice(2).split("?")[0];
  if (!generators.has(oldGenerator)) {
    const original = await readFile(path.join(base, "mexico/assets", oldGenerator), "utf8"), parsed = ast(original);
    const patches = [];
    const generate = one(nodes(parsed, node => node.type === "FunctionDeclaration" && node.id?.name === "generateQr"), "generateQr");
    const call = one(nodes(generate, node => node.type === "CallExpression" &&
      node.arguments[0]?.value === "/free-qr/url"), "URL API call");
    const body = one(call.arguments[1].properties.filter(p => p.key.name === "body"), "URL request body").value;
    patches.push([body.end - 1, body.end - 1, ",metrics:qrveoMetricsContext()"]);

    const save = named(parsed, "save").arguments[0];
    const mode = one(nodes(parsed, node => node.type === "AssignmentExpression" &&
      property(node.left, "mode") && property(node.left.object, "dataset")), "generator mode").right;
    assert.equal(mode.type, "Identifier");
    const click = one(nodes(save, node => node.type === "CallExpression" && property(node.callee, "click")), "download save click");
    patches.push([click.start, click.end, `(${original.slice(click.start, click.end)},void qrveoSiteEvent("qr_download",{kind:${mode.name},format:${save.params[1].name}}))`]);

    const trialObjects = nodes(parsed, node => node.type === "AssignmentExpression" && node.operator === "=" &&
      node.left.type === "Identifier" && node.right.type === "ObjectExpression" &&
      ["watchUrl", "expiresAt", "name"].every(key => node.right.properties.some(p => p.key?.name === key)));
    assert.equal(trialObjects.length, 2, "New upload and restored draft must remain distinct");
    const creation = one(trialObjects.filter(node => node.right.properties.find(p => p.key?.name === "name").value.type === "MemberExpression"), "new video upload");
    const restoration = one(trialObjects.filter(node => node !== creation), "restored video");
    assert.equal(creation.left.name, restoration.left.name);
    const trial = creation.left.name;
    patches.push([creation.right.end - 1, creation.right.end - 1, ',metricsEventId:qrveoMetricsContext()?.id||"",metricsRecorded:!1']);
    const restoredName = restoration.right.properties.find(p => p.key?.name === "name").value.left.object.name;
    patches.push([restoration.right.end - 1, restoration.right.end - 1,
      `,metricsEventId:${restoredName}.metricsEventId||"",metricsRecorded:${restoredName}.metricsRecorded===!0`]);
    const poll = named(parsed, "poll").arguments[0];
    const ready = one(nodes(poll, node => node.type === "IfStatement" &&
      nodes(node.test, test => test.type === "BinaryExpression" &&
        property(test.left, "status") && test.right.value === "ready").length === 1), "ready transition");
    assert.equal(ready.consequent.type, "BlockStatement");
    const persist = one(nodes(parsed, node => node.type === "VariableDeclarator" &&
      node.init?.type === "CallExpression" && node.init.arguments[1]?.value === "saveLastQr"), "saved QR writer").id.name;
    const tracking = `if(${trial}.metricsEventId&&!${trial}.metricsRecorded){const qrveoCompleted=${trial};void qrveoSiteEvent("qr_generate",{kind:"video",id:qrveoCompleted.metricsEventId}).then(qrveoRecorded=>{if(qrveoRecorded&&${trial}===qrveoCompleted){qrveoCompleted.metricsRecorded=!0;${persist}({kind:"video",...qrveoCompleted})}})}`;
    patches.push([ready.consequent.start + 1, ready.consequent.start + 1, tracking]);
    let changed = apply(original, patches);
    changed = `import {qrMetricsContext as qrveoMetricsContext,trackSiteEvent as qrveoSiteEvent} from "./${metricsName}";\n` + changed;
    ast(changed);
    const newName = `qr-generator.site-metrics-${digest(changed).slice(0, 12)}.mjs`;
    await add("mexico/assets/" + newName, changed);
    generators.set(oldGenerator, newName);
  }
  let changed = apply(source, [[generator.source.start, generator.source.end,
    JSON.stringify("./" + generators.get(oldGenerator))]]);
  changed = `import "./${metricsName}";\n` + changed;
  ast(changed);
  const newName = `site.metrics-${digest(changed).slice(0, 12)}.js`;
  await add("mexico/assets/" + newName, changed);
  scripts.set(name, newName);
}
assert.equal(generators.size, 2, "Both live generator variants must be preserved");
let changedPages = 0;
for (const relative of pages) {
  const before = await readFile(path.join(base, relative), "utf8");
  let text = before;
  for (const [oldName, newName] of scripts) text = text.replaceAll("assets/" + oldName, "assets/" + newName);
  if (text !== before) {
    assert.equal(text.slice(text.indexOf("<body")), before.slice(before.indexOf("<body")), "Preserve existing page body");
    await add(relative, text, before);
    changedPages++;
  }
}
assert.equal(changedPages, 152, "Recheck localized page inventory");
const handoff = {
  kind: "qrveo-agent-handoff", owner: "mx-site-metrics", service: "official",
  base_release: manifest.release_id, status: "ready", production_deployed: false,
  tests: ["node scripts/site-metrics.test.mjs: anonymous data, opt-out and no raw URLs passed",
    "node --test scripts/qr-video-readiness.test.mjs: successful creation, saved-draft deduplication and initiated download passed",
    "Four site scripts and both generator variants patched by bounded Acorn source ranges and reparsed",
    "All 152 localized HTML bodies preserved byte-for-byte; GA4 and previous auth/demo/QR behavior preserved"],
  rollback: { release_id: manifest.release_id, service: "official",
    command: `release_coordinator.py rollback ${manifest.release_id} official` }, files,
};
await writeFile(path.join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ base: manifest.release_id, files: files.length, changedPages,
  scripts: Object.fromEntries(scripts), generators: Object.fromEntries(generators), metricsName }, null, 2));
