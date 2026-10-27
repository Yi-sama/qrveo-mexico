"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { PREFIX, VIDEO_IDS, resolveTarget } = require("./demo-gateway.cjs");

const GATEWAY = "http://127.0.0.1:32084";
const PUBLIC_ORIGIN = process.env.QRVEO_PUBLIC_ORIGIN || "https://api.yisama.asia";

function canExport(pathname) {
  const target = resolveTarget("GET", pathname);
  // Session/API responses stay live, including public video metadata and counters.
  // Watch HTML and payloads vary by device and query; they cannot share a snapshot.
  if (target?.service === "front") return target.path.startsWith("/_nuxt/") || target.path === "/favicon.ico";
  return !!target && !target.requiresAuth && !["api", "health"].includes(target.service);
}

function containerFiles(container, directory, publicPrefix) {
  const output = execFileSync("wsl.exe", [
    "-d", "Ubuntu", "-u", "root", "--", "docker", "exec", container,
    "find", directory, "-type", "f",
  ], { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  return output.trim().split(/\r?\n/)
    .filter((name) => name.startsWith(`${directory}/`) && !/\.(?:map|gz|br)$/.test(name))
    .map((name) => publicPrefix + name.slice(directory.length));
}

async function fetchLocal(pathname) {
  const response = await fetch(GATEWAY + pathname, {
    headers: { "accept-encoding": "identity" },
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  if (response.status !== 200) throw new Error(`${pathname}: HTTP ${response.status}`);
  return response;
}

async function main() {
  if (!process.argv[2]) throw new Error("Usage: node deploy/export-demo-static.cjs NEW_OUTPUT_DIRECTORY");
  const output = path.resolve(process.argv[2]);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output); // A release must be new; never mix it with an older snapshot.
  const frontManifest = execFileSync("wsl.exe", [
    "-d", "Ubuntu", "-u", "root", "--", "docker", "exec", "vod-private-front-1",
    "cat", "/data/service-render/.output/server/chunks/nitro/nitro.mjs",
  ], { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  const frontFiles = containerFiles("vod-private-front-1", "/data/service-render/.output/public/_nuxt", `${PREFIX}/_nuxt`)
    .filter((name) => frontManifest.includes(JSON.stringify(name.slice(PREFIX.length))));
  const adminHtml = await (await fetchLocal(`${PREFIX}/__qrveo/console/`)).text();
  const entryScripts = [...adminHtml.matchAll(/src=["']([^"']*\/assets\/js\/[^"']+\.js)["']/g)];
  if (!entryScripts.length) throw new Error("Admin entry script was not found");
  let adminReferences = adminHtml;
  for (const [, entry] of entryScripts) {
    const entryPath = new URL(entry, PUBLIC_ORIGIN).pathname;
    if (!canExport(entryPath)) throw new Error("Unexpected admin entry script");
    adminReferences += await (await fetchLocal(entryPath)).text();
  }
  // Webpack's entry contains the hashes of its lazy JS and CSS chunks.
  const adminFiles = containerFiles("vod-private-admin-1", "/usr/share/nginx/html/assets", `${PREFIX}/__qrveo/console/assets`)
    .filter((name) => {
      const hash = /\.([a-f0-9]{16})\.(?:js|css)$/.exec(name);
      return !hash || adminReferences.includes(hash[1]);
    });
  const queue = new Set([
    `${PREFIX}/__qrveo/console/`,
    `${PREFIX}/__qrveo/console/favicon.ico`,
    `${PREFIX}/__qrveo/console-bootstrap.js`,
    `${PREFIX}/__qrveo/player/vod-player.min.js`,
    `${PREFIX}/__qrveo/player/vod-player-hls.min.js`,
    ...adminFiles,
    ...frontFiles,
  ]);
  function addMedia(value, base = PUBLIC_ORIGIN) {
    const url = new URL(value, base);
    const target = resolveTarget("GET", url.pathname);
    if (url.origin !== PUBLIC_ORIGIN || !canExport(url.pathname) ||
        !["hls", "storage"].includes(target.service) || url.search) {
      throw new Error(`Unexpected sample media reference: ${url.pathname}`);
    }
    queue.add(url.pathname);
  }
  function collectMedia(value) {
    if (typeof value === "string" && value.startsWith(`${PUBLIC_ORIGIN}${PREFIX}/__qrveo/hls/`)) addMedia(value);
    else if (value && typeof value === "object") Object.values(value).forEach(collectMedia);
  }
  for (const id of VIDEO_IDS) {
    const metadata = await (await fetchLocal(`${PREFIX}/__qrveo/api/vod/video/${id}_h.json`)).json();
    if (metadata.success !== true) throw new Error(`Cannot load sample ${id}`);
    collectMedia(metadata.data);
  }

  const manifest = [];
  let totalBytes = 0;
  for (const pathname of queue) {
    if (!canExport(pathname)) throw new Error(`Not a public static path: ${pathname}`);
    const response = await fetchLocal(pathname);
    const contentType = response.headers.get("content-type") || "";
    const body = Buffer.from(await response.arrayBuffer());
    if (/mpegurl/i.test(contentType) || pathname.endsWith(".m3u8")) {
      for (const line of body.toString("utf8").split(/\r?\n/).map((item) => item.trim())) {
        if (line && !line.startsWith("#")) addMedia(line, PUBLIC_ORIGIN + pathname);
        for (const match of line.matchAll(/URI="([^"]+)"/g)) addMedia(match[1], PUBLIC_ORIGIN + pathname);
      }
    }
    const isHtml = /text\/html/i.test(contentType);
    if (isHtml && path.posix.extname(pathname)) throw new Error(`HTML returned for asset: ${pathname}`);
    const relative = isHtml ? `${pathname.replace(/\/$/, "")}/index.html` : pathname;
    const destination = path.join(output, relative.slice(1));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, body);
    if (/text\/|javascript|json|xml|svg/.test(contentType) && body.length > 1024) {
      await fs.writeFile(destination + ".gz", zlib.gzipSync(body, { level: 9 }));
    }
    manifest.push({ path: pathname, file: relative, bytes: body.length, contentType });
    totalBytes += body.length;
    if (manifest.length % 50 === 0) console.log(`Exported ${manifest.length} files`);
  }
  await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const archiveFiles = [];
  for (const entry of manifest) {
    const relative = entry.file.slice(1);
    try {
      await fs.access(path.join(output, relative + ".gz"));
      archiveFiles.push(relative + ".gz");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      archiveFiles.push(relative);
    }
  }
  await fs.writeFile(path.join(output, "archive-files.txt"), archiveFiles.join("\n") + "\n", "utf8");
  console.log(`Exported ${manifest.length} public files, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB to ${output}`);
}

module.exports = { canExport };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
