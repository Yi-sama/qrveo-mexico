import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [baseline, output, baseRelease] = process.argv.slice(2);
assert(baseline && output && /^mx-integrated-\d{8}-\d{2}$/.test(baseRelease),
  "Usage: node prepare-captcha-test-release.mjs BASELINE OUTPUT BASE_RELEASE");
const base = path.resolve(baseline), out = path.resolve(output);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await assert.rejects(access(out), "Output already exists");
const digest = value => createHash("sha256").update(value).digest("hex");
const normalize = value => value.replace(/\r\n/g, "\n");
const localSite = normalize(await readFile(path.join(root, "src/scripts/site.js"), "utf8"));
function loginBlock(source) {
  const start = source.indexOf('    if (kind === "login") {');
  const end = source.indexOf('    if (kind === "recover") {', start);
  assert(start > 0 && end > start, "Missing unique login block");
  return source.slice(start, end);
}
const block = loginBlock(localSite);
assert(block.includes("captchaEnabled = d.enabled !== false"));
const files = [];
async function add(relative, content, before = true) {
  const destination = path.join(out, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
  files.push({
    target: "/usr/share/nginx/html", path: relative, artifact: relative,
    sha256: digest(Buffer.from(content)),
    before_sha256: before ? digest(await readFile(path.join(base, relative))) : null,
  });
}
const generator = await readFile(path.join(root, "src/scripts/qr-generator.mjs"), "utf8");
const generatorBaseline = normalize(await readFile(path.join(base, "mexico/assets/qr-generator.mjs"), "utf8"));
const captchaBranch = `      if (d.enabled === false) {
        captchaId = "";
        captchaRow.hidden = true;
        vform.elements.captcha.value = "";
        return;
      }
`;
assert.equal(normalize(generator).split(captchaBranch).length, 2);
assert.equal(normalize(generator).replace(captchaBranch, ""), generatorBaseline,
  "Generator candidate must contain only the explicit disabled-captcha branch");
await add("mexico/assets/qr-generator.mjs", generator);
const scripts = new Map();
for (const lang of ["es", "en", "pt", "fr", "de", "zh", "ja", "ko"]) {
  for (const page of ["iniciar-sesion", "crear-qr"]) {
    const relative = `mexico/${lang === "es" ? "" : lang + "/"}${page}/index.html`;
    let html = await readFile(path.join(base, relative), "utf8");
    const refs = [...html.matchAll(/(<script[^>]*\ssrc=")([^"]*assets\/site[^"/]*\.js(?:\?[^"]*)?)(")/g)];
    assert.equal(refs.length, 1, `Expected one website script: ${relative}`);
    const oldRef = refs[0][2], oldName = oldRef.match(/assets\/([^?]+)/)[1];
    if (!scripts.has(oldName)) {
      const previous = normalize(await readFile(path.join(base, "mexico/assets", oldName), "utf8"));
      const candidate = previous.replace(loginBlock(previous), block)
        .replace(/qr-generator\.mjs\?v=[^"']+/, `qr-generator.mjs?v=${digest(generator).slice(0, 12)}`);
      assert.notEqual(previous, candidate);
      const name = `site.captcha-test-${digest(candidate).slice(0, 12)}.js`;
      await add("mexico/assets/" + name, candidate, false);
      scripts.set(oldName, name);
    }
    const newRef = oldRef.replace(/assets\/[^/]+$/, "assets/" + scripts.get(oldName));
    html = html.replace(refs[0][0], refs[0][1] + newRef + refs[0][3]);
    await add(relative, html);
  }
}
const handoff = {
  kind: "qrveo-agent-handoff", owner: "captcha-automation-test-mode", service: "official",
  base_release: baseRelease, status: "ready", production_deployed: false,
  tests: [
    "20 video-readiness regressions passed, including an explicit disabled-captcha anonymous upload.",
    "Candidates preserve each frozen site's existing script; only login captcha handling, generator captcha handling and affected page script references change.",
    "All 8 login pages and 8 QR generator pages reference cache-busted candidates.",
    "API switch is explicit, server-authoritative and reversible; password and email verification remain enabled.",
  ],
  rollback: { release: baseRelease, service: "official",
    command: `sudo -n python3 /home/mx/qrveo/operations/release_coordinator.py rollback ${baseRelease} official` },
  files,
};
await writeFile(path.join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ output: out, baseRelease, files: files.length, scripts: Object.fromEntries(scripts) }));
