import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync, brotliCompressSync } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.resolve(root, "../../qrveo-backend-fixes/package.json"));
const { parse } = require("acorn");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

export async function prepare(baseDirectory, outputDirectory) {
  const base = path.resolve(baseDirectory), output = path.resolve(outputDirectory);
  const baseline = JSON.parse(await readFile(path.join(base, "baseline.json"), "utf8"));
  await assert.rejects(access(output), "Use a fresh candidate directory");
  const originals = new Map();
  async function original(name) {
    if (!originals.has(name)) {
      const bytes = await readFile(path.join(base, name));
      assert.equal(sha(bytes), baseline.files[name]?.sha256, `Stale baseline: ${name}`);
      originals.set(name, bytes.toString("utf8"));
    }
    return originals.get(name);
  }
  const htmlNames = Object.keys(baseline.files).filter(name => name.endsWith(".html"));
  const source = await readFile(path.join(root, "src/scripts/site.js"), "utf8");
  const remember = source.match(/function rememberLanguage\(code\) \{[\s\S]*?\n\}/)?.[0];
  const restore = source.match(/function restoreLanguage\(\) \{[\s\S]*?\n\}/)?.[0];
  assert(remember && restore && source.includes("restoreLanguage();"));
  const files = [];
  async function emit(name, bytes) {
    await mkdir(path.dirname(path.join(output, name)), { recursive: true });
    await writeFile(path.join(output, name), bytes);
    files.push({ target: "/usr/share/nginx/html", path: name, artifact: name,
      before_sha256: baseline.files[name]?.sha256 || null, sha256: sha(bytes) });
  }
  const entryNames = new Set();
  for (const name of htmlNames) {
    for (const match of (await original(name)).matchAll(/site\.entry-[a-f0-9]+\.js/g)) entryNames.add(match[0]);
  }
  assert(entryNames.size > 0 && entryNames.size <= 4, "Recheck the active entry scripts");
  const entries = new Map();
  for (const oldEntry of entryNames) {
    const entryPath = "mexico/assets/" + oldEntry;
    const script = await original(entryPath);
    const ast = parse(script, { ecmaVersion: "latest", sourceType: "module" });
    const label = ast.body.find(node => node.type === "ExpressionStatement" &&
      node.expression.type === "CallExpression" && node.expression.arguments[1]?.value === "rememberLanguage");
    assert(label, "Missing production language helper: " + oldEntry);
    const name = label.expression.arguments[0].name;
    const helper = ast.body.find(node => node.type === "FunctionDeclaration" && node.id.name === name);
    assert(helper && script.slice(helper.start, helper.end).includes('localStorage.setItem("vqr-lang"'));
    const langStatement = ast.body.find(node => node.type === "VariableDeclaration" &&
      node.declarations.some(declaration => declaration.init &&
        script.slice(declaration.init.start, declaration.init.end).includes("document.documentElement.lang")));
    const lang = langStatement?.declarations.find(declaration => declaration.init &&
      script.slice(declaration.init.start, declaration.init.end).includes("document.documentElement.lang"));
    assert(lang, "Missing page language initializer");
    assert(!script.includes("function restoreLanguage("), "Language restoration is already installed");
    const replacement = remember.replace("function rememberLanguage(", "function " + name + "(") + "\n" +
      restore.replace(/\brememberLanguage\(/g, name + "(").replace(/\bLANG\b/g, lang.id.name);
    const changes = [
      { start: helper.start, end: helper.end, text: replacement },
      { start: langStatement.end, end: langStatement.end, text: "\nrestoreLanguage();\n" },
    ].sort((a, b) => b.start - a.start);
    let next = script;
    for (const change of changes) next = next.slice(0, change.start) + change.text + next.slice(change.end);
    parse(next, { ecmaVersion: "latest", sourceType: "module" });
    const newEntry = "site.entry-" + sha(next).slice(0, 12) + ".js";
    entries.set(oldEntry, newEntry);
    await emit("mexico/assets/" + newEntry, next);
    for (const [suffix, encode] of [[".gz", gzipSync], [".br", brotliCompressSync]]) {
      if (baseline.files[entryPath + suffix]) await emit("mexico/assets/" + newEntry + suffix, encode(next));
    }
  }
  let pages = 0;
  for (const name of htmlNames) {
    const html = await original(name);
    let changed = html;
    for (const [oldEntry, newEntry] of entries) changed = changed.replaceAll(oldEntry, newEntry);
    if (changed === html) continue;
    let reverted = changed;
    for (const [oldEntry, newEntry] of entries) reverted = reverted.replaceAll(newEntry, oldEntry);
    assert.equal(reverted, html, "Only entry references may change");
    await emit(name, changed);
    for (const [suffix, encode] of [[".gz", gzipSync], [".br", brotliCompressSync]]) {
      if (baseline.files[name + suffix]) await emit(name + suffix, encode(changed));
    }
    pages++;
  }
  assert(pages >= 100 && pages <= htmlNames.length, "Recheck the multilingual page set");
  const handoff = {
    kind: "qrveo-agent-handoff", owner: "official-console-language-sync", service: "official",
    base_release: baseline.release_id, status: "ready", production_deployed: false,
    tests: [],
    rollback: { release: baseline.release_id, service: "official",
      command: `sudo -n python3 /home/mx/qrveo/operations/release_coordinator.py rollback ${baseline.release_id} official` },
    files,
  };
  await writeFile(path.join(output, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
  return { base: baseline.release_id, entries: Object.fromEntries(entries), pages, files: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [base, output] = process.argv.slice(2);
  assert(base && output, "Usage: node scripts/prepare-language-sync-release.mjs BASELINE_DIRECTORY OUTPUT");
  console.log(JSON.stringify(await prepare(base, output)));
}
