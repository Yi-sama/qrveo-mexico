import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = new URL(process.env.SITE_ORIGIN || "https://api.yisama.asia").origin;
const base = process.env.SITE_BASE || "/qrveo/";
if (!process.env.SITE_DIST) throw new Error("Set SITE_DIST to a separate preview output directory.");
const dist = path.resolve(process.env.SITE_DIST);
if (dist === root || dist === path.join(root, "dist")) {
  throw new Error("The preview must use a separate output directory.");
}
process.env.SITE_ORIGIN = origin;
process.env.SITE_BASE = base;
process.env.SITE_WATCH = origin + base.slice(0, -1);
const { build } = await import("../build.mjs");
const { esc } = await import("../src/render.mjs");
const { pageExample } = await import("../src/example.mjs");
await build();
const out = path.join(dist, ...base.split("/").filter(Boolean));
const content = JSON.parse(await readFile(path.join(root, "content/es.json"), "utf8"));
const previewVersion = Date.now().toString(36);

// The shared preview host has no QRveo backend or account session.
const browserScript = path.join(out, "assets/site.js");
const browserSource = await readFile(browserScript, "utf8");
const accountStart = browserSource.indexOf('const API = String(RUNTIME.apiOrigin');
if (accountStart < 0) throw new Error("Cannot locate the account section for the static preview.");
await writeFile(browserScript, browserSource.slice(0, accountStart), "utf8");

for (const [index, example] of content.examples.entries()) {
  const folder = path.join(out, "videos", example.vid);
  await mkdir(folder, { recursive: true });
  const html = index === 0
    ? pageExample(content, { root: "../../" })
    : `<!doctype html>
<html lang="es-MX"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(example.title)} - QRveo</title>
<link rel="icon" href="../../favicon.svg">
<style>
*{box-sizing:border-box}body{margin:0;background:#181818;color:#fff;font:16px/1.6 system-ui,sans-serif}
main{max-width:860px;margin:auto;padding:20px 16px 40px}a{color:inherit}
header{display:flex;justify-content:space-between;gap:16px;margin-bottom:20px}
video{display:block;width:100%;aspect-ratio:16/9;background:#000}
h1{font-size:22px;line-height:1.3;overflow-wrap:anywhere}p{color:#d4d4d4}
</style></head><body><main>
<header><strong>QRveo</strong><a href="../../">Volver a QRveo</a></header>
<video controls playsinline preload="metadata" poster="../../img/swap-${esc(example.id)}.webp">
<source src="../../video/demo-${esc(example.id)}.mp4" type="video/mp4">
Tu navegador no puede reproducir el video.</video>
<h1>${esc(example.title)}</h1><p>Video de demostraci\u00f3n.</p>
</main></body></html>`;
  await writeFile(path.join(folder, "index.html"), html, "utf8");
}

// Account pages remain browsable; no credentials leave the preview.
await writeFile(path.join(out, "preview.js"), `const messages = {
  es: "Vista previa: el registro, el inicio de sesi\\u00f3n y los pagos todav\\u00eda no est\\u00e1n disponibles.",
  en: "Preview: registration, sign-in and payments are not available yet.",
  pt: "Pr\\u00e9via: cadastro, login e pagamentos ainda n\\u00e3o est\\u00e3o dispon\\u00edveis.",
  fr: "Aper\\u00e7u : inscription, connexion et paiements ne sont pas encore disponibles.",
  de: "Vorschau: Registrierung, Anmeldung und Zahlungen sind noch nicht verf\\u00fcgbar.",
  zh: "\\u9884\\u89c8\\u7248\\uff1a\\u6ce8\\u518c\\u3001\\u767b\\u5f55\\u548c\\u652f\\u4ed8\\u5c1a\\u672a\\u5f00\\u653e\\u3002",
  ja: "\\u30d7\\u30ec\\u30d3\\u30e5\\u30fc\\u7248\\uff1a\\u767b\\u9332\\u3001\\u30ed\\u30b0\\u30a4\\u30f3\\u3001\\u304a\\u652f\\u6255\\u3044\\u306f\\u307e\\u3060\\u5229\\u7528\\u3067\\u304d\\u307e\\u305b\\u3093\\u3002",
  ko: "\\ubbf8\\ub9ac\\ubcf4\\uae30: \\ud68c\\uc6d0\\uac00\\uc785, \\ub85c\\uadf8\\uc778, \\uacb0\\uc81c\\ub294 \\uc544\\uc9c1 \\uc774\\uc6a9\\ud560 \\uc218 \\uc5c6\\uc2b5\\ub2c8\\ub2e4."
};
const message = messages[document.documentElement.lang.slice(0, 2)] || messages.en;
document.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-pw-toggle]");
  if (toggle) {
    const input = toggle.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(show));
    toggle.setAttribute("aria-label", show ? toggle.dataset.hide : toggle.dataset.show);
  }
  if (!event.target.closest("[data-console], [data-send-code]")) return;
  event.preventDefault();
  alert(message);
});
document.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-auth-form]")) return;
  event.preventDefault();
  const status = event.target.querySelector("[data-auth-msg]");
  status.textContent = message;
  status.hidden = false;
});
`, "utf8");

async function prepareHtml(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await prepareHtml(file);
    else if (entry.name.endsWith(".html")) {
      const html = await readFile(file, "utf8");
      await writeFile(file, html
        .replace(/href="https:\/\/console\.qrveo\.com[^"]*"/g, 'href="#panel-no-disponible"')
        .replace(/((?:src|poster)="[^"?]+\.(?:mp4|webp|png|jpe?g))"/g, `$1?preview=${previewVersion}"`)
        .replace("</head>", `<script defer src="${base}preview.js?v=${previewVersion}"></script></head>`), "utf8");
    }
  }
}
await prepareHtml(out);
console.log(`Preview ready: ${out}`);
