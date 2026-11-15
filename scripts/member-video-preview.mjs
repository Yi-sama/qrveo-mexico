// Loopback-only browser fixture. No production APIs, credentials or cloud calls.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.SITE_DIST ? path.resolve(process.env.SITE_DIST)
  : path.resolve(fileURLToPath(new URL("../.runtime/member-video-20261107/", import.meta.url)));
const languagePreview = process.env.QR_LANGUAGE_PREVIEW === "1";
const id = "wtestowner0123456789abcdef01234567";
let expected = 0, uploaded = 0, complete = false;
const calls = [];
const server = http.createServer(async (req, res) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const requestUrl = new URL(req.url, origin);
  const pathname = requestUrl.pathname;
  const json = (data, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ success: status === 200, data }));
  };
  try {
    if (languagePreview && pathname === "/mexico/private-runtime.js") {
      res.setHeader("Content-Type", "application/javascript");
      return res.end(`window.__VOD_PRIVATE__=${JSON.stringify({
        apiOrigin: origin + "/__api", consoleOrigin: origin + "/console", watchOrigin: origin,
      })};`);
    }
    if (languagePreview && pathname === "/__member") {
      res.writeHead(302, { "Set-Cookie": "x-auth-token=isolated-fixture; Path=/; SameSite=Lax",
        Location: "/mexico/zh/crear-qr/?tipo=video" });
      return res.end();
    }
    if (languagePreview && pathname === "/__anonymous") {
      res.writeHead(302, { "Set-Cookie": "x-auth-token=; Path=/; Max-Age=0",
        Location: "/mexico/zh/crear-qr/?tipo=video" });
      return res.end();
    }
    if (languagePreview && pathname === "/__storage-failure") {
      res.setHeader("Content-Type", "application/javascript");
      return res.end('Object.defineProperty(window, "indexedDB", { value: { open() { throw new Error("isolated quota failure"); } } });');
    }
    if (pathname === "/__harness.mjs") {
      res.setHeader("Content-Type", "application/javascript");
      return res.end(`
import qrcode from "/mexico/assets/qrcode.mjs";
import { initQrGenerator } from "/mexico/assets/qr-generator.mjs";
const member = !new URLSearchParams(location.search).has("anonymous");
const state = new URLSearchParams(location.search).get("state");
let polls = 0;
if (state) localStorage.setItem("qrveo-last-qr", JSON.stringify({
  kind: "video", name: "transcoding-check.mp4",
  ...(member ? { videoId: "${id}", memberOwner: "wtestowner" }
    : { trialId: "trial-readiness-test", trialToken: "isolated-trial" }),
  watchUrl: location.origin + "/front/video/view?vid=${id}_${id[0]}"
}));
const api = async (route, options = {}) => {
  const statusQuery = state && (route === "/member-video/${id}" || route === "/trial/trial-readiness-test")
    ? "?state=" + (state === "processing-ready" ? (++polls > 2 ? "ready" : "processing") : state) : "";
  const response = await fetch("/__api" + route + statusQuery, { method: options.method || "GET",
    headers: { "Content-Type": "application/json", ...(options.token ? { "x-auth-token": options.token } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined });
  if (!response.ok) throw new Error("service");
  return response.json();
};
await initQrGenerator({ qrcode, readToken: () => member ? "isolated-fixture" : "",
  consoleHome: location.origin + "/console", lang: document.documentElement.lang, api });
`);
    }
    if (pathname === "/mexico/assets/qr-generator.mjs") {
      res.setHeader("Content-Type", "application/javascript");
      return res.end(await readFile(new URL("../src/scripts/qr-generator.mjs", import.meta.url), "utf8"));
    }
    if (pathname === "/__calls") return json({ calls, uploaded, expected, complete });
    if (pathname === "/__upload") {
      calls.push({ route: pathname, method: req.method });
      uploaded = 0;
      for await (const chunk of req) uploaded += chunk.length;
      assertUpload(uploaded === expected && req.headers["if-none-match"] === "*");
      if (languagePreview) await new Promise(resolve => setTimeout(resolve, 8000));
      res.writeHead(200);
      return res.end();
    }
    if (pathname.startsWith("/__api/")) {
      const route = pathname.slice("/__api".length);
      calls.push({ route, method: req.method, authenticated: req.headers["x-auth-token"] === "isolated-fixture" });
      const watchUrl = `${origin}/front/video/view?vid=${id}_${id[0]}`;
      if (route === "/free-qr/quota") return json({ remaining: 10, limit: 10 });
      if (route === "/trial/quota") return json({ remaining: 3, limit: 3, maxBytes: 50_000_000, maxSeconds: 60 });
      if (route === "/member-video/limits") return json({ userId: "wtestowner",
        maxBytes: 128 * 1024 ** 2, maxSeconds: null, quota: { limit: null, remaining: null } });
      if (route === "/member-video/upload" || route === "/trial/upload") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        if (route === "/member-video/upload") assertUpload(!("captchaKey" in input) && !("trialToken" in input));
        expected = input.size;
        complete = false;
        return json({ ...(route === "/trial/upload" ? { trialId: "trial-readiness-test", trialToken: "isolated-trial" } : { videoId: id }),
          watchUrl, expiresAt: null,
          upload: { url: origin + "/__upload", method: "PUT",
            headers: { "Content-Type": input.contentType, "If-None-Match": "*" } } });
      }
      if (route === `/member-video/${id}/complete` || route === "/trial/trial-readiness-test/complete") {
        assertUpload(uploaded === expected && uploaded > 0);
        complete = true;
        return json({ status: "processing", watchUrl, expiresAt: null });
      }
      if (route === `/member-video/${id}` || route === "/trial/trial-readiness-test") {
        const state = requestUrl.searchParams.get("state");
        const status = ["processing", "ready", "failed"].includes(state) ? state : complete ? "ready" : "processing";
        return json({ videoId: id, status, watchUrl, expiresAt: null,
          playUrl: status === "ready" ? origin + "/mexico/video/demo-productos.mp4" : null,
          errorCode: status === "failed" ? "TRIAL_ENCODING_FAILED" : null, posterUrl: null, durationSec: 125 });
      }
      if (route.startsWith("/auth/kaptcha")) return json({ captchaId: "00000000-0000-0000-0000-000000000000",
        imgBase64: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="44"><text x="5" y="25">test</text></svg>' });
      return json({}, 404);
    }
    const relative = decodeURIComponent(pathname).replace(/^\/+/, "") + (pathname.endsWith("/") ? "index.html" : "");
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) return json({}, 403);
    const info = await stat(file);
    if (!info.isFile()) return json({}, 404);
    const type = { ".html": "text/html; charset=utf-8", ".mjs": "application/javascript", ".js": "application/javascript",
      ".css": "text/css", ".mp4": "video/mp4", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" }[path.extname(file)];
    res.setHeader("Content-Type", type || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    if (file.endsWith(".html")) {
      const html = await readFile(file, "utf8");
      if (languagePreview) return res.end(html.replace("</head>",
        `<script src="/mexico/private-runtime.js"></script>${requestUrl.searchParams.has("storage-failure")
          ? '<script src="/__storage-failure"></script>' : ""}</head>`));
      const edited = html.replace(/<script type="module" src="[^"]*assets\/site\.js[^"]*"><\/script>/,
        '<script type="module" src="/__harness.mjs"></script>');
      if (edited === html) throw new Error("Expected site script tag was not found");
      return res.end(edited);
    }
    if (file.endsWith(".mp4") && req.headers.range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!match) { res.writeHead(416); return res.end(); }
      const start = Number(match[1]), end = Math.min(info.size - 1, match[2] ? Number(match[2]) : info.size - 1);
      res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${info.size}`,
        "Content-Length": end - start + 1, "Accept-Ranges": "bytes" });
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.setHeader("Content-Length", info.size);
    createReadStream(file).pipe(res);
  } catch (error) {
    console.error(error.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
function assertUpload(condition) { if (!condition) throw new Error("Invalid isolated browser upload"); }
server.listen(0, "127.0.0.1", () => console.log(`Preview: http://127.0.0.1:${server.address().port}/mexico/zh/crear-qr/?tipo=video`));
