import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inlineAuthStyles, prefetchLoginAssets } from "../src/scripts/login-prefetch.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.resolve(root, "../../qrveo-backend-fixes/package.json"));
const { parse } = require("parse5");
const origin = "https://mx.qrveo.com";
const sha = value => createHash("sha256").update(value).digest("hex");
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;

function elements(html) {
  const result = [];
  function visit(node) {
    if (node.tagName) result.push(node);
    node.childNodes?.forEach(visit);
  }
  visit(parse(html, { sourceCodeLocationInfo: true }));
  return result;
}

function edit(source, changes) {
  let boundary = source.length;
  for (const [start, end, replacement] of changes.sort((a, b) => b[0] - a[0])) {
    assert(start <= end && end <= boundary, "Overlapping HTML edits");
    source = source.slice(0, start) + replacement + source.slice(end);
    boundary = start;
  }
  return source;
}

export async function prepare(baseDirectory, baselineFile, outputDirectory) {
  const base = path.resolve(baseDirectory), output = path.resolve(outputDirectory);
  const baseline = JSON.parse(await readFile(baselineFile, "utf8"));
  assert.match(baseline.release_id, /^mx-integrated-\d{8}-\d{2}$/);
  await assert.rejects(access(output), "Use a fresh candidate directory");
  const originals = new Map();
  async function original(relative) {
    if (!originals.has(relative)) {
      assert(baseline.files[relative], `Missing production file: ${relative}`);
      const bytes = await readFile(path.join(base, relative));
      assert.equal(sha(bytes), baseline.files[relative].sha256, `Stale production file: ${relative}`);
      originals.set(relative, bytes.toString("utf8"));
    }
    return originals.get(relative);
  }
  const pages = Object.keys(baseline.files).filter(name => name.endsWith(".html"));
  const loginAssets = new Map();
  for (const page of pages.filter(name => /\/iniciar-sesion\/index[.]html$/.test(name))) {
    const document = elements(await original(page));
    const assets = document.filter(node =>
      node.tagName === "script" && attr(node, "type") === "module" ||
      node.tagName === "link" && (attr(node, "rel") === "modulepreload" ||
        attr(node, "rel") === "preload" && attr(node, "as") === "font"));
    const urls = [];
    for (const node of assets) {
      const url = new URL(attr(node, "src") || attr(node, "href"), origin + "/" + page);
      assert.equal(url.origin, origin);
      assert.match(url.pathname, /^\/mexico\/(?:assets\/[^/]+[.]js|fonts\/[^/]+[.]woff2)$/);
      await original(url.pathname.slice(1));
      urls.push(url.pathname + url.search);
    }
    assert.equal(urls.length, 6, "Recheck the active login dependency graph");
    loginAssets.set("/" + page.replace(/index[.]html$/, ""), urls);
  }
  assert.equal(loginAssets.size, 8);
  const files = [];
  let inlinePages = 0, prefetchPages = 0;
  for (const page of pages) {
    const source = await original(page);
    const document = elements(source);
    assert(!source.includes("data-qrveo-login-prefetch") &&
      !source.includes("data-qrveo-auth-style"), "Login acceleration is already installed");
    const changes = [];
    const auth = document.some(node => attr(node, "data-auth-page") !== undefined);
    if (auth) {
      const stylesheets = document.filter(node =>
        node.tagName === "link" && attr(node, "rel") === "stylesheet");
      assert.equal(stylesheets.length, 1, "Recheck the account page stylesheet");
      const link = stylesheets[0];
      const url = new URL(attr(link, "href"), origin + "/" + page);
      assert.equal(url.origin, origin);
      assert.match(url.pathname, /^\/mexico\/assets\/[^/]+[.]css$/);
      const css = inlineAuthStyles(await original(url.pathname.slice(1)));
      assert(!/<\/style/i.test(css), "Unsafe inline style boundary");
      const loc = link.sourceCodeLocation;
      changes.push([loc.startOffset, loc.endOffset, `<style data-qrveo-auth-style>${css}</style>`]);
      inlinePages++;
    } else if (!document.some(node => attr(node, "data-pay-page") !== undefined)) {
      const login = document.find(node => node.tagName === "a" && attr(node, "data-auth") === "login");
      if (login) {
        const url = new URL(attr(login, "href"), origin + "/" + page);
        assert.equal(url.origin, origin);
        const assets = loginAssets.get(url.pathname);
        assert(assets, `Unknown localized login route: ${url.pathname}`);
        const script = `(${prefetchLoginAssets.toString()})(${JSON.stringify(assets)});`;
        assert(!/<\/script/i.test(script), "Unsafe inline script boundary");
        const head = document.find(node => node.tagName === "head").sourceCodeLocation;
        changes.push([head.endTag.startOffset, head.endTag.startOffset,
          `<script data-qrveo-login-prefetch>${script}</script>`]);
        prefetchPages++;
      }
    }
    if (!changes.length) continue;
    const candidate = edit(source, changes);
    assert.equal(candidate.slice(candidate.indexOf("<body")), source.slice(source.indexOf("<body")),
      `Page content changed: ${page}`);
    const target = path.join(output, page);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, candidate, "utf8");
    files.push({ target: "/usr/share/nginx/html", path: page, artifact: page,
      before_sha256: sha(source), sha256: sha(candidate) });
  }
  assert.equal(inlinePages, 24);
  assert.equal(prefetchPages, 128);
  const handoff = {
    kind: "qrveo-agent-handoff", owner: "official-login-resources", service: "official",
    base_release: baseline.release_id, status: "ready", production_deployed: false,
    tests: [],
    rollback: { release: baseline.release_id, service: "official",
      command: `sudo -n python3 /home/mx/qrveo/operations/release_coordinator.py rollback ${baseline.release_id} official` },
    files,
  };
  await writeFile(path.join(output, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
  return { inlinePages, prefetchPages, files: files.length, base_release: baseline.release_id };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [base, baseline, output] = process.argv.slice(2);
  assert(base && baseline && output,
    "Usage: node scripts/prepare-login-speed-release.mjs BASELINE_DIRECTORY BASELINE_JSON OUTPUT");
  console.log(JSON.stringify(await prepare(base, baseline, output)));
}
