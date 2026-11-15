import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.resolve(root, "../../qrveo-backend-fixes/package.json"));
const { parse } = require("acorn");
const htmlParser = await import(pathToFileURL(require.resolve("parse5")).href);
const ast = source => parse(source, { ecmaVersion: "latest", sourceType: "module" });
const sha = source => createHash("sha256").update(source).digest("hex");

function nodes(tree, predicate) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(tree);
  return found;
}

function edits(source, changes) {
  let boundary = source.length;
  for (const [start, end, replacement] of changes.sort((a, b) => b[0] - a[0])) {
    assert(start <= end && end <= boundary, "Overlapping source edits");
    source = source.slice(0, start) + replacement + source.slice(end);
    boundary = start;
  }
  return source;
}

export function skipEmptyTrial(source) {
  const matches = nodes(ast(source), node => node.type === "FunctionDeclaration" && node.async &&
    nodes(node.body, child => child.type === "Property" && child.key?.name === "readLastQr").length === 1);
  assert.equal(matches.length, 1, "Recheck the live trial-claim function");
  const first = matches[0].body.body[0];
  assert.equal(first.type, "TryStatement");
  assert(!source.slice(first.start, first.end).includes('localStorage.getItem("qrveo-last-qr")'),
    "Empty-trial guard is already installed");
  return edits(source, [[first.block.start + 1, first.block.start + 1,
    'if(!localStorage.getItem("qrveo-last-qr"))return;']]);
}

async function pagesIn(directory, prefix = "mexico") {
  const pages = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + "/" + item.name;
    if (item.isDirectory()) pages.push(...await pagesIn(path.join(directory, item.name), relative));
    else if (item.name.endsWith(".html")) pages.push(relative);
  }
  return pages;
}

export async function prepare(baseDirectory, outputDirectory, baseRelease) {
  assert.match(baseRelease, /^mx-integrated-\d{8}-\d{2}$/);
  const base = path.resolve(baseDirectory), out = path.resolve(outputDirectory);
  await assert.rejects(access(out), "Output must not exist");
  const files = [], modules = new Map(), visiting = new Set();
  const navigation = await readFile(path.join(root, "src/scripts/navigation-media.mjs"), "utf8");
  ast(navigation);
  async function add(relative, source, before = null) {
    const destination = path.join(out, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source, "utf8");
    files.push({ target: "/usr/share/nginx/html", path: relative, artifact: relative,
      sha256: sha(source), before_sha256: before === null ? null : sha(before) });
  }
  async function rewrite(name) {
    if (modules.has(name)) return modules.get(name);
    assert(!visiting.has(name), "Recheck cyclic production module graph");
    assert.equal(path.posix.basename(name), name, "Modules must stay inside assets");
    visiting.add(name);
    const original = await readFile(path.join(base, "mexico/assets", name), "utf8");
    let source = original;
    if (name.startsWith("site.") && name.endsWith(".js")) {
      source = navigation + "\n" + skipEmptyTrial(source);
    }
    const tree = ast(source);
    const dependencies = nodes(tree, node =>
      node.type === "ImportDeclaration" || node.type === "ImportExpression");
    const changes = [], preloads = new Set();
    for (const node of dependencies) {
      assert(node.source.type === "Literal" && typeof node.source.value === "string",
        "Recheck nonliteral production import");
      const dependency = node.source.value;
      assert.match(dependency, /^\.\/[^/?]+\.(?:mjs|js)$/);
      const child = await rewrite(dependency.slice(2));
      changes.push([node.source.start, node.source.end, JSON.stringify("./" + child.name)]);
      if (node.type === "ImportDeclaration") {
        preloads.add(child.name);
        child.preloads.forEach(value => preloads.add(value));
      }
    }
    source = edits(source, changes);
    ast(source);
    const newName = `${name.split(".")[0]}.entry-${sha(source).slice(0, 12)}.js`;
    await add("mexico/assets/" + newName, source);
    const result = { name: newName, preloads, before: sha(original), after: sha(source) };
    modules.set(name, result);
    visiting.delete(name);
    return result;
  }

  const pages = await pagesIn(path.join(base, "mexico"));
  let changedPages = 0;
  const mainScripts = new Set();
  for (const relative of pages) {
    const original = await readFile(path.join(base, relative), "utf8");
    const document = htmlParser.parse(original, { sourceCodeLocationInfo: true });
    const elements = [];
    function visit(node) {
      if (node.tagName) elements.push(node);
      node.childNodes?.forEach(visit);
    }
    visit(document);
    const attr = (node, name) => node.attrs.find(item => item.name === name)?.value;
    const scripts = elements.filter(node => node.tagName === "script" && attr(node, "type") === "module");
    if (!scripts.length) continue;
    const changes = [], hints = new Set(), existingHints = new Set();
    for (const script of scripts) {
      const src = attr(script, "src");
      if (!src) continue;
      const match = /^((?:(?:\.\/|\.\.\/)*|\/mexico\/)assets\/)([^/?]+)$/.exec(src);
      assert(match, `Recheck module URL in ${relative}: ${src}`);
      const module = await rewrite(match[2]);
      if (match[2].startsWith("site.")) mainScripts.add(match[2]);
      const loc = script.sourceCodeLocation.attrs.src;
      changes.push([loc.startOffset, loc.endOffset, `src="${match[1] + module.name}"`]);
      module.preloads.forEach(name => hints.add(match[1] + name));
    }
    for (const link of elements.filter(node => node.tagName === "link" && attr(node, "rel") === "modulepreload")) {
      const href = attr(link, "href");
      const match = /^((?:(?:\.\/|\.\.\/)*|\/mexico\/)assets\/)([^/?]+)$/.exec(href);
      assert(match, `Recheck existing module preload in ${relative}`);
      const module = await rewrite(match[2]);
      const replacement = match[1] + module.name;
      existingHints.add(replacement);
      const loc = link.sourceCodeLocation.attrs.href;
      changes.push([loc.startOffset, loc.endOffset, `href="${replacement}"`]);
    }
    const head = elements.find(node => node.tagName === "head");
    const additions = [...hints].filter(href => !existingHints.has(href))
      .map(href => `<link rel="modulepreload" href="${href}">`).join("");
    changes.push([head.sourceCodeLocation.startTag.endOffset, head.sourceCodeLocation.startTag.endOffset, additions]);
    const changed = edits(original, changes);
    assert.equal(changed.slice(changed.indexOf("<body")), original.slice(original.indexOf("<body")),
      `Page body changed: ${relative}`);
    await add(relative, changed, original);
    changedPages++;
  }
  assert.equal(mainScripts.size, 4, "Preserve the four active site-script variants");
  assert.equal(changedPages, 160, "Recheck the active localized page inventory");
  const handoff = {
    kind: "qrveo-agent-handoff", owner: "official-entry-speed", service: "official",
    base_release: baseRelease, status: "ready", production_deployed: false,
    tests: [],
    rollback: { release: baseRelease, service: "official",
      command: `sudo -n python3 /home/mx/qrveo/operations/release_coordinator.py rollback ${baseRelease} official` },
    files,
  };
  await writeFile(path.join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
  return { changedPages, files: files.length,
    modules: Object.fromEntries([...modules].map(([oldName, module]) => [oldName, {
      name: module.name, preloads: [...module.preloads], before: module.before, after: module.after,
    }])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [base, output, release] = process.argv.slice(2);
  assert(base && output && release,
    "Usage: node scripts/prepare-entry-speed-release.mjs BASELINE OUTPUT BASE_RELEASE");
  console.log(JSON.stringify(await prepare(base, output, release), null, 2));
}
