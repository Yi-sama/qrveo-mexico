import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import vm from "node:vm";

const source = await readFile(new URL("../src/scripts/site-metrics.mjs", import.meta.url), "utf8");
function runtime(href, options = {}) {
  const calls = [], storage = new Map(), warnings = [];
  const context = { window: {}, location: new URL(href), navigator: options.navigator || {},
    URLSearchParams, crypto: { randomUUID }, AbortSignal,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    console: { warn: value => warnings.push(value) },
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ data: { accepted: !options.fail } }) };
    },
  };
  vm.runInNewContext(source.replaceAll("export ", ""), context);
  return { context, calls, storage, warnings };
}
let checks = 0;
for (const href of ["http://localhost:4321/mexico/", "https://mx.qrveo.com/console/super/",
  "https://mx.qrveo.com/mexico/?analytics=off", "https://mx.qrveo.com/mexico/ejemplo/",
  "https://mx.qrveo.com/mexico/hero-player.html", "https://mx.qrveo.com/mexico/assets/test"]) {
  const r = runtime(href);
  await r.context.trackSiteEvent("qr_download", { kind: "url", format: "png" });
  assert.equal(r.calls.length, 0, href);
  assert.equal(r.context.qrMetricsContext().disabled, true);
  checks++;
}
for (const navigator of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
  assert.equal(runtime("https://mx.qrveo.com/mexico/", { navigator }).calls.length, 0);
  checks++;
}
for (const [route, page, language] of [["", "home", "es"], ["zh/crear-qr/", "generator", "zh"],
  ["registro/", "register", "es"], ["en/iniciar-sesion/", "login", "en"], ["soluciones/productos/", "solutions", "es"]]) {
  const r = runtime(`https://mx.qrveo.com/mexico/${route}?email=private@example.invalid&token=secret#private`);
  await r.context.trackSiteEvent("page_view");
  assert.equal(r.calls.length, 2);
  assert.equal(r.calls[0].body.page, page);
  assert.equal(r.calls[0].body.language, language);
  assert.equal(r.calls[0].body.visitor, r.calls[1].body.visitor);
  assert.notEqual(r.calls[0].body.id, r.calls[1].body.id);
  assert.equal(r.calls[0].init.referrerPolicy, "no-referrer");
  assert.equal(r.calls[0].init.credentials, "omit");
  assert.doesNotMatch(JSON.stringify(r.calls), /private@example|secret|#private|email=/);
  checks++;
}
{
  const r = runtime("https://mx.qrveo.com/mexico/crear-qr/");
  await r.context.trackSiteEvent("qr_generate", { kind: "url" });
  await r.context.trackSiteEvent("qr_download", { kind: "url", format: "exe" });
  assert.equal(r.calls.length, 1, "URL generation is counted by the API, not by a client click");
  const id = randomUUID();
  assert.equal(await r.context.trackSiteEvent("qr_generate", { id, kind: "video" }), true);
  assert.equal(r.calls[1].body.id, id);
  assert.equal(await r.context.trackSiteEvent("qr_download", { kind: "url", format: "png" }), true);
  assert.equal(await r.context.trackSiteEvent("video_attempt", { kind: "video", id }), true);
  assert.equal(await r.context.trackVideoFailure("put", { status: 403, response: "private signed URL" }, id), true);
  assert.equal(r.calls.at(-1).body.event, "put_http_403");
  assert.equal(await r.context.trackVideoFailure("put", { status: 524 }, id), true);
  assert.equal(r.calls.at(-1).body.event, "put_http_524");
  assert.equal(await r.context.trackVideoFailure("put", { network: true }, id), true);
  assert.equal(r.calls.at(-1).body.event, "put_network");
  assert.equal(await r.context.trackVideoFailure("put", { status: 999 }, id), true);
  assert.equal(r.calls.at(-1).body.event, "put_http_other");
  assert.doesNotMatch(JSON.stringify(r.calls), /private signed URL/);
  assert.equal(await r.context.trackVideoFailure("unknown", {}, id), false);
  checks++;
}
{
  const r = runtime("https://mx.qrveo.com/mexico/crear-qr/", { fail: true });
  assert.equal(await r.context.trackSiteEvent("qr_download", { kind: "video", format: "svg" }), false);
  assert.equal(r.warnings.length, 1);
  checks++;
}
const generator = await readFile(new URL("../src/scripts/qr-generator.mjs", import.meta.url), "utf8");
assert.match(generator, /anchor\.click\(\);\s+void trackSiteEvent\("qr_download"/);
assert.match(generator, /if \(d\.status === "ready"\) \{\s+if \(trial\.metricsEventId && !trial\.metricsRecorded\)/);
assert.match(generator, /metricsEventId: last\.metricsEventId \|\| ""/);
assert.match(generator, /body: \{ url, \.\.\.\(metrics \? \{ metrics \} : \{\}\) \}/);
console.log(`PASS: ${checks} anonymous collector scenarios; privacy, opt-out, successful downloads and deduped video readiness hooks.`);
