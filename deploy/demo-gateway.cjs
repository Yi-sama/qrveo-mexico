"use strict";

const http = require("node:http");
const zlib = require("node:zlib");

const PREFIX = "/qrveo-live";
const DEFAULT_PUBLIC_ORIGIN = "https://api.yisama.asia";
const DEFAULT_UPSTREAMS = Object.freeze({
  official: 4321,
  api: 30015,
  admin: 30081,
  player: 30088,
  hls: 30090,
  front: 30112,
  storage: 30900,
});
const VIDEO_IDS = Object.freeze([
  "hceea401fc1874e0fc77733500cc84cb",
  "hceea401fc3ce27f89f66b8d9c406483",
  "hceea401fcc9fba363b5b20e3ce45f62",
  "hceea401fcedbbda388ceee193f8732b",
]);
const EXAMPLE = `/videos/${VIDEO_IDS[1]}_h`;
const PUBLIC_POSTS = new Set([
  "/auth/login",
  "/auth/register/email",
  "/auth/send-email-code",
  "/auth/send-reset-password-email",
  "/auth/reset-password",
]);
const CONSOLE_READS = new Set([
  "/user/get-user",
  "/auth/login/login-status",
  "/overview/playback/today",
  "/overview/playback/trend",
  "/overview/playback/top-videos",
  "/overview/watch-stats",
  "/secure/uploadvideo_v2/main-info",
  "/custom-domain/current",
  "/video/get-video-list",
]);
const EXCLUDED_HEADERS = new Set([
  "connection",
  "transfer-encoding",
  "keep-alive",
  "set-cookie",
  "access-control-allow-origin",
  "content-security-policy",
  "content-security-policy-report-only",
]);

function trimOrigin(value) {
  const origin = String(value || DEFAULT_PUBLIC_ORIGIN).replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)) throw new Error("QRVEO_PUBLIC_ORIGIN must be an https origin");
  return origin;
}

function publicPaths(prefix = PREFIX) {
  return {
    official: "/qrveo",
    api: `${prefix}/__qrveo/api`,
    admin: `${prefix}/__qrveo/console`,
    player: `${prefix}/__qrveo/player`,
    hls: `${prefix}/__qrveo/hls`,
    front: prefix,
    storage: `${prefix}/__qrveo/media`,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSafePath(pathname) {
  return /^[A-Za-z0-9_./-]+$/.test(pathname) && !pathname.split("/").some((part) => part === "." || part === "..");
}

function localUrlPattern(upstreams, lanHost) {
  const ports = [...new Set(Object.values(upstreams).map(String))].join("|");
  const hosts = ["127\\.0\\.0\\.1", "localhost"];
  if (lanHost) hosts.push(escapeRegex(lanHost));
  return new RegExp(`https?://(?:${hosts.join("|")}):(${ports})\\b`, "g");
}

function serviceForPort(port, upstreams) {
  return Object.entries(upstreams).find(([, value]) => String(value) === String(port))?.[0];
}

function rewriteLocalUrls(text, config) {
  const paths = publicPaths(config.prefix);
  return text.replace(config.localUrl, (_, port) => {
    const service = serviceForPort(port, config.upstreams);
    return service && paths[service] ? config.publicOrigin + paths[service] : _;
  });
}

function replaceNuxtConfig(text, key, value) {
  const pattern = new RegExp(`(["']?${key}["']?\\s*:\\s*["'])/?(["'])`, "g");
  return text.replace(pattern, `$1${value}$2`);
}

function rewriteNuxt(text, config, target) {
  if (!/^\/videos\/[^/]+_h\/?$/.test(target.path)) return text;
  const prefix = config.prefix;
  let result = text
    .replace(/((?:src|href)=["'])\/_nuxt\//gi, `$1${prefix}/_nuxt/`)
    .replace(/((?:src|href)=["'])\/favicon\.ico\b/gi, `$1${prefix}/favicon.ico`);
  result = replaceNuxtConfig(result, "baseURL", `${prefix}/`);
  result = replaceNuxtConfig(result, "cdnURL", `${prefix}/`);
  return result;
}

function rewriteAdmin(text, config, bootstrap) {
  const paths = publicPaths(config.prefix);
  let result = text
    .replace(/(["'])\/assets\/qrveo\/bootstrap\.[a-f0-9]+\.js/g, `$1${config.prefix}/__qrveo/console-bootstrap.js`)
    .replace(/(["'])\/assets\//g, `$1${paths.admin}/assets/`)
    .replace(/url\((['"]?)\/assets\//g, `url($1${paths.admin}/assets/`)
    .replace(/(["'])\/favicon\.ico\b/g, `$1${paths.admin}/favicon.ico`)
    .replace(/\bf\.p="\/"/g, `f.p="${paths.admin}/"`);
  if (bootstrap) {
    const fallback = 'return url.hostname === location.hostname && (url.port === "4321" || url.port === "30082");';
    if (!result.includes(fallback)) throw new Error("Admin bootstrap allowedOfficial shape mismatch");
    result = result
      .replace(fallback, `if (url.origin === ${JSON.stringify(config.publicOrigin)}) return true;\n    ${fallback}`)
      .replace(/\/mexico\//g, "/qrveo/");
  }
  return result;
}

function rewriteText(text, config, target) {
  let result = rewriteLocalUrls(text, config);
  if (target.service === "front") result = rewriteNuxt(result, config, target);
  if (target.service === "admin") result = rewriteAdmin(result, config, target.bootstrap);
  if (target.service === "admin" && target.path === "/") {
    const injection = `<script>window.__VOD_PRIVATE__=Object.assign(window.__VOD_PRIVATE__||{},{officialOrigin:${JSON.stringify(config.publicOrigin)}});</script>`;
    result = result.replace("</head>", `${injection}</head>`);
  }
  return result;
}

function publicVideoPath(pathname) {
  const escaped = VIDEO_IDS.map(escapeRegex).join("|");
  return new RegExp(`^/videos/(?:${escaped})_h/?$`).test(pathname);
}

function publicPayloadPath(pathname) {
  const escaped = VIDEO_IDS.map(escapeRegex).join("|");
  return new RegExp(`^/videos/(?:${escaped})_h/_payload\\.json$`).test(pathname) || pathname === "/_payload.json";
}

function sampleVideoApiPath(pathname) {
  const escaped = VIDEO_IDS.map(escapeRegex).join("|");
  return new RegExp(`^/vod/video/(?:${escaped})_h\\.json$`).test(pathname);
}

function sampleMediaPath(pathname) {
  const escaped = VIDEO_IDS.map(escapeRegex).join("|");
  return new RegExp(`^/vod-mp4/hceea401fc/(?:${escaped})/[A-Za-z0-9_./-]+$`).test(pathname);
}

function resolveTarget(method, pathname, prefix = PREFIX) {
  if (!pathname.startsWith(`${prefix}/`)) return null;
  const path = pathname.slice(prefix.length) || "/";
  if (!isSafePath(path)) return null;
  const apiBase = "/__qrveo/api";
  const consoleBase = "/__qrveo/console";
  if (path === "/healthz") return { service: "health" };
  if (method === "POST" && path === `${apiBase}/overview/playback/event`) return { service: "api", path: "/overview/playback/event", playback: true };
  if (path.startsWith(`${apiBase}/`)) {
    const apiPath = path.slice(apiBase.length);
    if (method === "POST" && PUBLIC_POSTS.has(apiPath)) return { service: "api", path: apiPath };
    if (method === "POST" && apiPath === "/auth/logout") return { service: "api", path: apiPath, requiresAuth: true };
    if (["GET", "HEAD"].includes(method) && CONSOLE_READS.has(apiPath)) return { service: "api", path: apiPath, requiresAuth: true };
    if (["GET", "HEAD"].includes(method) && ["/deploy-info", "/auth/kaptcha"].includes(apiPath)) return { service: "api", path: apiPath };
    if (["GET", "HEAD"].includes(method) && sampleVideoApiPath(apiPath)) return { service: "api", path: apiPath };
  }
  if (!["GET", "HEAD"].includes(method)) return null;
  if (path === "/__qrveo/console-bootstrap.js") return { service: "admin", bootstrap: true };
  if (path === consoleBase || path === `${consoleBase}/`) return { service: "admin", path: "/" };
  if (path === `${consoleBase}/favicon.ico`) return { service: "admin", path: "/favicon.ico" };
  if (path.startsWith(`${consoleBase}/assets/`)) return { service: "admin", path: path.slice(consoleBase.length) };
  if (publicVideoPath(path) || publicPayloadPath(path) || /^\/_nuxt\/[A-Za-z0-9_./-]+$/.test(path) || path === "/favicon.ico") {
    return { service: "front", path };
  }
  for (const [base, service, allowed] of [
    ["/__qrveo/player", "player", /^\/vod-player(?:-hls)?\.min\.js$/],
    ["/__qrveo/hls", "hls", sampleMediaPath],
    ["/__qrveo/media", "storage", sampleMediaPath],
  ]) {
    if (path.startsWith(`${base}/`)) {
      const targetPath = path.slice(base.length);
      if (typeof allowed === "function" ? allowed(targetPath) : allowed.test(targetPath)) return { service, path: targetPath };
    }
  }
  const ownedMedia = /^\/__qrveo\/(hls|media)(\/vod-mp4\/([A-Za-z0-9]{1,64})\/[A-Za-z0-9]{1,64}\/[A-Za-z0-9_./-]+)$/.exec(path);
  if (ownedMedia) {
    return { service: ownedMedia[1] === "hls" ? "hls" : "storage", path: ownedMedia[2], requiresAuth: true, cookieAuth: true, ownerId: ownedMedia[3] };
  }
  return null;
}

function requestUpstream(port, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: "127.0.0.1", port, path, method, headers, timeout: 60000 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode || 502, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.on("timeout", () => request.destroy(new Error("Upstream timeout")));
    request.on("error", reject);
    request.end(body);
  });
}

function requestHeaders(req, body) {
  const headers = { "accept-encoding": "identity", "user-agent": req.headers["user-agent"] || "QRveo-Demo-Gateway" };
  for (const name of ["range", "accept", "content-type", "accept-language", "x-auth-token"]) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  if (body) headers["content-length"] = String(body.length);
  return headers;
}

async function readRequestBody(req, res) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) {
      res.writeHead(413).end();
      return null;
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  try {
    return { body, json: JSON.parse(body.length ? body.toString("utf8") : "{}") };
  } catch {
    res.writeHead(400).end();
    return null;
  }
}

async function authenticate(req, target, config) {
  let token = req.headers["x-auth-token"];
  if (!token && target.cookieAuth) {
    const match = String(req.headers.cookie || "").match(/(?:^|;\s*)x-auth-token=([^;]+)/);
    try { token = match ? decodeURIComponent(match[1]) : ""; } catch { token = ""; }
  }
  if (typeof token !== "string" || !token) return null;
  const check = await requestUpstream(config.upstreams.api, "/user/get-user", "GET", { "x-auth-token": token, "accept-encoding": "identity" });
  try {
    const payload = JSON.parse(check.body.toString("utf8"));
    return check.status >= 200 && check.status < 300 && payload.success === true ? payload.data : null;
  } catch {
    return null;
  }
}

function copyHeaders(res, headers, transform, config, target) {
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || EXCLUDED_HEADERS.has(name) || name === "cache-control") continue;
    if (transform && ["content-length", "content-encoding", "etag"].includes(name)) continue;
    if (name === "location") {
      res.setHeader(name, rewriteText(String(value), config, target));
    } else {
      res.setHeader(name, value);
    }
  }
}

function acceptsGzip(value) {
  return String(value || "").split(",").some((entry) => {
    const [coding, ...parameters] = entry.trim().split(";");
    return coding.toLowerCase() === "gzip" && !parameters.some((parameter) => /^q=0(?:\.0*)?$/i.test(parameter.trim()));
  });
}

function addVary(res, value) {
  const current = String(res.getHeader("Vary") || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!current.some((item) => item.toLowerCase() === value.toLowerCase())) current.push(value);
  res.setHeader("Vary", current.join(", "));
}

async function loadBootstrap(req, config) {
  const headers = requestHeaders(req);
  const index = await requestUpstream(config.upstreams.admin, "/", "GET", headers);
  const html = index.body.toString("utf8");
  const match = html.match(/(?:src=["'])?(\/assets\/qrveo\/bootstrap\.[a-f0-9]+\.js)/i);
  if (!match) throw new Error("Admin bootstrap asset was not found");
  return requestUpstream(config.upstreams.admin, match[1], "GET", headers);
}

function createGateway(options = {}) {
  const config = {
    prefix: options.prefix || PREFIX,
    publicOrigin: trimOrigin(options.publicOrigin || process.env.QRVEO_PUBLIC_ORIGIN || DEFAULT_PUBLIC_ORIGIN),
    upstreams: { ...DEFAULT_UPSTREAMS, ...(options.upstreams || {}) },
    lanHost: options.lanHost || process.env.QRVEO_LAN_HOST || "",
  };
  config.localUrl = localUrlPattern(config.upstreams, config.lanHost);
  return http.createServer(async (req, res) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Cache-Control", "no-store");
    try {
      const url = new URL(req.url, "http://gateway.invalid");
      if (["GET", "HEAD"].includes(req.method) && url.pathname === config.prefix) {
        res.writeHead(302, { Location: `${config.prefix}/` }).end();
        return;
      }
      if (["GET", "HEAD"].includes(req.method) && url.pathname === `${config.prefix}/`) {
        res.writeHead(302, { Location: `${config.prefix}${EXAMPLE}` }).end();
        return;
      }
      const target = resolveTarget(req.method || "GET", url.pathname, config.prefix);
      if (!target) {
        res.writeHead(404).end("Not found");
        return;
      }
      if (target.service === "health") {
        res.setHeader("Content-Type", "text/plain");
        res.end("ok\n");
        return;
      }
      let body;
      let input;
      if (req.method === "POST") {
        const parsed = await readRequestBody(req, res);
        if (!parsed) return;
        body = parsed.body;
        input = parsed.json;
        if (target.playback && !VIDEO_IDS.includes(String(input?.videoId || "").split("_")[0])) {
          res.writeHead(404).end("Not found");
          return;
        }
      }
      if (target.requiresAuth) {
        const user = await authenticate(req, target, config);
        if (!user) {
          res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ success: false, code: 401, errorCode: "AUTH_REQUIRED", message: "Please sign in again." }));
          return;
        }
        if (target.ownerId && user.userId !== target.ownerId) {
          res.writeHead(403).end("Resource does not belong to this account.");
          return;
        }
      }
      const upstream = target.bootstrap
        ? await loadBootstrap(req, config)
        : await requestUpstream(config.upstreams[target.service], target.path + url.search, req.method === "HEAD" ? "GET" : (req.method || "GET"), requestHeaders(req, body), body);
      const contentType = String(upstream.headers["content-type"] || "");
      const transform = target.bootstrap || /text\/|javascript|json|mpegurl|xml/.test(contentType);
      if (target.bootstrap && !contentType) res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      copyHeaders(res, upstream.headers, transform, config, target);
      res.statusCode = upstream.status;
      if (transform) {
        let output = Buffer.from(rewriteText(upstream.body.toString("utf8"), config, target));
        if (acceptsGzip(req.headers["accept-encoding"])) {
          output = zlib.gzipSync(output);
          res.setHeader("Content-Encoding", "gzip");
        }
        addVary(res, "Accept-Encoding");
        res.setHeader("Content-Length", String(output.length));
        res.end(req.method === "HEAD" ? undefined : output);
      } else {
        res.end(req.method === "HEAD" ? undefined : upstream.body);
      }
    } catch (error) {
      if (!res.headersSent) res.writeHead(502).end("Preview upstream unavailable");
      else res.destroy(error);
    }
  });
}

module.exports = { PREFIX, VIDEO_IDS, createGateway, resolveTarget, rewriteText };

if (require.main === module) {
  const port = Number(process.env.QRVEO_GATEWAY_PORT || 32084);
  createGateway().listen(port, "127.0.0.1", () => console.log(`QRveo demo gateway: http://127.0.0.1:${port}${PREFIX}/`));
}
