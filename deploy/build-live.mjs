import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

if (!process.env.SITE_DIST) throw new Error("Set SITE_DIST to a separate release directory.");
const origin = new URL(process.env.SITE_ORIGIN || "https://api.yisama.asia").origin;
const base = "/qrveo/";
const live = origin + "/qrveo-live";
process.env.SITE_ORIGIN = origin;
process.env.SITE_BASE = base;
process.env.SITE_WATCH = live;
const { build } = await import("../build.mjs");
await build();
const out = path.join(path.resolve(process.env.SITE_DIST), "qrveo");
const runtime = {
  apiOrigin: live + "/__qrveo/api",
  consoleOrigin: live + "/__qrveo/console",
  watchOrigin: live,
};
await writeFile(path.join(out, "private-runtime.js"),
  `window.__VOD_PRIVATE__ = ${JSON.stringify(runtime)};\n`, "utf8");
const version = Date.now().toString(36);

async function injectRuntime(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await injectRuntime(file);
    else if (entry.name.endsWith(".html")) {
      const html = await readFile(file, "utf8");
      await writeFile(file, html
        .replace(/(assets\/site\.js\?v=[^"]+)/g, `$1&live=${version}`)
        .replace("</head>", `<script src="${base}private-runtime.js?v=${version}"></script></head>`), "utf8");
    }
  }
}
await injectRuntime(out);
console.log(`Live preview ready: ${out}`);
