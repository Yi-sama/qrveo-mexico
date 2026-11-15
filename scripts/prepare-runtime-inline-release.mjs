import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const external = '<script defer src="/mexico/private-runtime.js"></script>';
const inline = '<script><!--# include virtual="/mexico/private-runtime.js" --></script>';
const sha = value => createHash("sha256").update(value).digest("hex");

export function inlineRuntime(config) {
  assert.equal(config.split(external).length, 2, "Recheck the active runtime injection");
  assert.equal(config.split("    sub_filter_once on;").length, 2);
  assert(!/\bssi\s+on;/.test(config), "SSI is already enabled");
  return config.replace(external, inline)
    .replace("    sub_filter_once on;", "    sub_filter_once on;\n    ssi on;");
}

export async function prepare(baselineFile, directory) {
  const baseline = JSON.parse(await readFile(baselineFile, "utf8"));
  assert.match(baseline.base_release, /^mx-integrated-\d{8}-\d{2}$/);
  assert.equal(sha(baseline.config), baseline.before_sha256);
  const out = path.resolve(directory);
  await assert.rejects(access(out), "Output must not exist");
  const config = inlineRuntime(baseline.config);
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "default.conf"), config, "utf8");
  const handoff = {
    kind: "qrveo-agent-handoff", owner: "official-inline-runtime", service: "official",
    base_release: baseline.base_release, status: "ready", production_deployed: false,
    tests: [],
    rollback: {
      release: baseline.base_release, service: "official",
      command: `sudo -n python3 /home/mx/qrveo/operations/release_coordinator.py rollback ${baseline.base_release} official`,
    },
    files: [{
      target: "/etc/nginx/conf.d/default.conf", path: "", artifact: "default.conf",
      before_sha256: baseline.before_sha256, sha256: sha(config),
    }],
  };
  await writeFile(path.join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
  return handoff;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [baseline, output] = process.argv.slice(2);
  assert(baseline && output, "Usage: node scripts/prepare-runtime-inline-release.mjs BASELINE_JSON OUTPUT");
  console.log(JSON.stringify(await prepare(baseline, output), null, 2));
}
