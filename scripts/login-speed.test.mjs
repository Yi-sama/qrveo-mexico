import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { inlineAuthStyles, prefetchLoginAssets } from "../src/scripts/login-prefetch.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const assets = ["/mexico/assets/login.123.js", "/mexico/fonts/archivo.woff2?v=abc",
  "/mexico/assets/shared.123.js", "/mexico/assets/login.123.js"];
function fixture({ saveData = false, effectiveType = "4g", hidden = false, href } = {}) {
  const hints = [], listeners = {}, timers = [];
  const link = { href: href || "https://mx.qrveo.com/mexico/iniciar-sesion/?return=private" };
  const context = {
    URL, Set, Array, location: new URL("https://mx.qrveo.com/mexico/"),
    navigator: { connection: { saveData, effectiveType } },
    window: { requestIdleCallback: fn => timers.push(fn) },
    setTimeout: fn => timers.push(fn),
    document: {
      visibilityState: hidden ? "hidden" : "visible", readyState: "loading",
      createElement: tag => { assert.equal(tag, "link"); return {}; },
      head: { append: hint => hints.push(hint) },
      querySelector: () => link,
      querySelectorAll: () => [{ href: "https://mx.qrveo.com/mexico/assets/shared.123.js" }],
      addEventListener: (type, fn) => { listeners[type] = fn; },
    },
  };
  vm.runInNewContext(`(${prefetchLoginAssets.toString()})(${JSON.stringify(assets)})`, context);
  const intent = type => listeners[type]?.({ target: { closest: () => link } });
  const idle = () => {
    listeners.DOMContentLoaded?.();
    while (timers.length) timers.shift()();
  };
  return { hints, listeners, intent, idle };
}
for (const event of ["pointerover", "focusin", "touchstart"]) {
  const test = fixture();
  test.intent(event);
  test.intent(event);
  test.idle();
  assert.equal(test.hints.length, 2, "Deduplicate hints and already-used shared modules");
  assert(test.hints.every(hint => hint.rel === "prefetch" && hint.fetchPriority === "low"));
  assert.equal(test.hints[1].crossOrigin, "anonymous");
  assert(!JSON.stringify(test.hints).includes("return="), "Never prefetch an account document or its parameters");
}
const idle = fixture();
idle.idle();
assert.equal(idle.hints.length, 2);
for (const options of [{ saveData: true }, { hidden: true },
  { href: "https://mx.qrveo.com/console/#/secure/overview" },
  { href: "https://other.invalid/mexico/iniciar-sesion/" }]) {
  const test = fixture(options);
  test.intent("focusin");
  test.idle();
  assert.equal(test.hints.length, 0);
}
const slow = fixture({ effectiveType: "2g" });
slow.idle();
assert.equal(slow.hints.length, 0);
slow.intent("focusin");
assert.equal(slow.hints.length, 2, "Explicit intent may warm a slow connection without automatic background work");
assert.equal(inlineAuthStyles('url("../fonts/a.woff2?v=x") url(../fonts/b.woff2) url("data:image/svg+xml,x")'),
  'url("/mexico/fonts/a.woff2?v=x") url(/mexico/fonts/b.woff2) url("data:image/svg+xml,x")');

const [base, directory] = process.argv.slice(2);
assert(base && directory, "Usage: node scripts/login-speed.test.mjs BASE CANDIDATE");
const manifest = JSON.parse(await readFile(path.join(directory, "handoff.json"), "utf8"));
assert.equal(manifest.service, "official");
assert.equal(manifest.production_deployed, false);
assert.equal(manifest.files.length, 152);
let auth = 0, warm = 0;
for (const file of manifest.files) {
  assert.equal(file.target, "/usr/share/nginx/html");
  assert.match(file.path, /[.]html$/);
  const before = await readFile(path.join(base, file.path), "utf8");
  const after = await readFile(path.join(directory, file.path), "utf8");
  assert.equal(sha(before), file.before_sha256);
  assert.equal(sha(after), file.sha256);
  assert.equal(after.slice(after.indexOf("<body")), before.slice(before.indexOf("<body")));
  if (after.includes("data-qrveo-auth-style")) {
    auth++;
    assert(!after.includes('rel="stylesheet"'));
    assert(!after.includes('data-qrveo-login-prefetch'));
    assert(!after.includes("url(../fonts/"));
    const css = await readFile(path.join(base, "mexico/assets/site.auth-google-a7d1b20364f5.css"), "utf8");
    const originalLink = before.match(/<link rel="stylesheet"[^>]+>/)[0];
    assert.equal(after.replace(`<style data-qrveo-auth-style>${inlineAuthStyles(css)}</style>`, originalLink), before);
  } else {
    warm++;
    const match = after.match(/<script data-qrveo-login-prefetch>([\s\S]*?)<\/script>/);
    assert(match);
    new vm.Script(match[1]);
    assert.equal(after.replace(match[0], ""), before, "Only a static-resource warmup may be added");
    assert(!match[1].includes("/api/") && !match[1].includes("fetch("));
  }
}
assert.equal(auth, 24);
assert.equal(warm, 128);
console.log("PASS: intent/idle warmup, cache deduplication, data-saving/hidden/slow/foreign/account guards, 24 CSS-only and 128 warmup-only head edits, unchanged page bodies and JS");
