import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { inlineRuntime } from "./prepare-runtime-inline-release.mjs";

const [baselineFile, directory] = process.argv.slice(2);
assert(baselineFile && directory, "Usage: node scripts/runtime-inline.test.mjs BASELINE_JSON CANDIDATE");
const baseline = JSON.parse(await readFile(baselineFile, "utf8"));
const config = await readFile(path.join(directory, "default.conf"), "utf8");
const handoff = JSON.parse(await readFile(path.join(directory, "handoff.json"), "utf8"));
const sha = value => createHash("sha256").update(value).digest("hex");
assert.equal(handoff.base_release, baseline.base_release);
assert.equal(handoff.service, "official");
assert.equal(handoff.production_deployed, false);
assert.equal(handoff.files.length, 1);
assert.equal(handoff.files[0].target, "/etc/nginx/conf.d/default.conf");
assert.equal(handoff.files[0].path, "");
assert.equal(handoff.files[0].before_sha256, sha(baseline.config));
assert.equal(handoff.files[0].sha256, sha(config));
assert.equal(config, inlineRuntime(baseline.config));
assert.equal(config.replace('<script><!--# include virtual="/mexico/private-runtime.js" --></script>',
  '<script defer src="/mexico/private-runtime.js"></script>').replace("\n    ssi on;", ""),
baseline.config, "No unrelated configuration may change");
assert.throws(() => inlineRuntime(config));
assert.throws(() => inlineRuntime(baseline.config.replace('src="/mexico/private-runtime.js"', 'src="/other.js"')));
assert.match(config, /location = \/mexico\/private-runtime\.js \{\s+add_header Cache-Control "no-store";/);
assert.match(config, /add_header Cache-Control "public, max-age=31536000, immutable";/);
const source = await readFile(new URL("../deploy/nginx.conf", import.meta.url), "utf8");
assert.match(source, /\bssi on;/);
assert(source.includes('include virtual="/mexico/private-runtime.js"'));
console.log("PASS: one config artifact, exact reversible injection change, unchanged cache/security headers and startup-generated runtime contract");
