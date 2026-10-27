"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { PREFIX, VIDEO_IDS, createGateway } = require("./demo-gateway.cjs");
const { canExport } = require("./export-demo-static.cjs");

assert.equal(canExport(`${PREFIX}/__qrveo/console/`), true);
assert.equal(canExport(`${PREFIX}/__qrveo/hls/vod-mp4/hceea401fc/${VIDEO_IDS[0]}/stream.m3u8`), true);
for (const pathname of [
  "/__qrveo/api/user/get-user", "/__qrveo/api/auth/kaptcha",
  `/__qrveo/api/vod/video/${VIDEO_IDS[0]}_h.json`,
  "/__qrveo/hls/vod-mp4/other/private/stream.m3u8",
  "/__qrveo/media/vod-mp4/other/private/source.mp4",
  "/healthz", "/../private",
]) assert.equal(canExport(PREFIX + pathname), false, pathname);

const OLD_BOOTSTRAP = `
function allowedOfficial(url) {
  if (!/^https?:$/.test(url.protocol)) return false;
  if (/(^|\\.)qrveo\\.com$/i.test(location.hostname)) return url.origin === "https://www.qrveo.com";
  return url.hostname === location.hostname && (url.port === "4321" || url.port === "30082");
}
function officialOrigin() {
  var candidates = [(window.__VOD_PRIVATE__ || {}).officialOrigin, document.referrer, sessionStorage.getItem("qrveo-official-origin")];
  for (var index = 0; index < candidates.length; index += 1) {
    if (!candidates[index]) continue;
    try {
      var url = new URL(candidates[index]);
      if (allowedOfficial(url)) {
        sessionStorage.setItem("qrveo-official-origin", url.origin);
        return url.origin;
      }
    } catch (_) {}
  }
  if (/(^|\\.)qrveo\\.com$/i.test(location.hostname)) return "https://www.qrveo.com";
  return location.protocol + "//" + location.hostname + ":4321";
}
window.__gatewayTestOfficialOrigin = officialOrigin();
`;

function bootstrapOrigin(source) {
  const store = new Map();
  const window = { __VOD_PRIVATE__: { officialOrigin: "https://api.yisama.asia" } };
  vm.runInNewContext(source, {
    URL,
    window,
    document: { referrer: "" },
    location: { protocol: "https:", hostname: "api.yisama.asia", origin: "https://api.yisama.asia" },
    sessionStorage: { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
  });
  return window.__gatewayTestOfficialOrigin;
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body));
    const headers = { ...(options.headers || {}) };
    if (body) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(body.length);
    }
    const req = http.request({ hostname: "127.0.0.1", port, path, method: options.method || "GET", headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const bodyBuffer = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, bodyBuffer, body: bodyBuffer.toString("utf8") });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

function json(res, value) {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value));
}

async function main() {
  const calls = [];
  const api = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      calls.push({ path: req.url, token: req.headers["x-auth-token"], body, contentLength: req.headers["content-length"] });
      if (req.url === "/user/get-user") return json(res, req.headers["x-auth-token"] === "ok" ? { success: true, data: { userId: "owner" } } : { success: false });
      if (req.url.startsWith("/vod/video/")) return json(res, { success: true, hls: `http://127.0.0.1:${ports.hls}/vod-mp4/hceea401fc/${VIDEO_IDS[1]}/stream.m3u8` });
      if (req.url === "/overview/playback/event") return json(res, { success: true });
      if (req.url === "/deploy-info") return json(res, { success: true, data: { emailVerificationRequired: false } });
      if (req.url === "/auth/login") return json(res, { success: true, token: "demo" });
      if (req.url === "/auth/logout") return json(res, { success: true });
      res.statusCode = 404;
      json(res, { success: false });
    });
  });
  const player = http.createServer((req, res) => res.end("player"));
  const hls = http.createServer((req, res) => {
    res.setHeader("content-type", "application/vnd.apple.mpegurl");
    res.end(`#EXTM3U\nhttp://127.0.0.1:${ports.storage}/vod-mp4/hceea401fc/${VIDEO_IDS[1]}/part.ts\n`);
  });
  const storage = http.createServer((req, res) => {
    res.setHeader("content-type", "video/mp4");
    res.end(Buffer.from([0, 1, 2, 3]));
  });
  const admin = http.createServer((req, res) => {
    if (req.url === "/") {
      res.setHeader("content-type", "text/html");
      res.end(`<html><head><script>window.__VOD_PRIVATE__={"apiHost":"http://127.0.0.1:${ports.api}","playerScriptUrl":"http://127.0.0.1:${ports.player}/vod-player.min.js"};</script><link rel="icon" href="/favicon.ico"><link href="/assets/js/index.css" rel="stylesheet"></head><body><script src="/assets/qrveo/bootstrap.abc123.js"></script><script src="/assets/js/index.js"></script></body></html>`);
      return;
    }
    if (req.url === "/assets/qrveo/bootstrap.abc123.js") return res.end(OLD_BOOTSTRAP + 'const target=new URL("/mexico/iniciar-sesion/",location.origin);');
    if (req.url === "/assets/js/index.js") {
      res.setHeader("content-type", "application/javascript");
      res.end('var f={};f.p="/";var n={};n.p="";');
      return;
    }
    res.end("asset");
  });
  const front = http.createServer((req, res) => {
    if (req.url.includes("_nuxt")) {
      res.setHeader("content-type", "application/javascript");
      res.end('const router="/videos/:id";const payload="/videos/example/_payload.json";window.__NUXT__={config:{app:{baseURL:"/",cdnURL:"",buildAssetsDir:"/_nuxt/"}}};');
      return;
    }
    res.setHeader("content-type", "text/html");
    res.end(`<html><head><script>window.__NUXT__={config:{app:{baseURL:"/",cdnURL:"",buildAssetsDir:"/_nuxt/"},public:{apiBaseUrl:"http://127.0.0.1:${ports.api}"}}};</script><script src="/_nuxt/app.js"></script><link rel="icon" href="/favicon.ico"></head><body><a href="/videos/${VIDEO_IDS[1]}_h/_payload.json">payload</a></body></html>`);
  });
  const servers = [api, player, hls, storage, admin, front];
  const ports = {};
  for (const [name, server] of Object.entries({ api, player, hls, storage, admin, front })) ports[name] = await listen(server);
  const gateway = createGateway({ publicOrigin: "https://api.yisama.asia", upstreams: ports });
  const gatewayPort = await listen(gateway);
  const video = `${VIDEO_IDS[1]}_h`;
  try {
    assert.equal((await request(gatewayPort, "/videos/" + video)).status, 404);
    const root = await request(gatewayPort, PREFIX + "/");
    assert.equal(root.status, 302);
    assert.equal(root.headers.location, `${PREFIX}/videos/${video}`);
    assert.equal((await request(gatewayPort, PREFIX + "/healthz")).body, "ok\n");

    const watch = await request(gatewayPort, `${PREFIX}/videos/${video}`);
    assert.equal(watch.status, 200);
    assert.match(watch.body, new RegExp(`baseURL:"${PREFIX}/"`));
    assert.match(watch.body, new RegExp(`cdnURL:"${PREFIX}/"`));
    assert.match(watch.body, /buildAssetsDir:"\/_nuxt\/"/);
    assert.match(watch.body, new RegExp(`${PREFIX}/_nuxt/app\\.js`));
    assert.match(watch.body, new RegExp(`href="/videos/${video}/_payload\\.json"`));
    assert.match(watch.body, new RegExp(`https://api\\.yisama\\.asia${PREFIX}/__qrveo/api`));
    const compressedWatch = await request(gatewayPort, `${PREFIX}/videos/${video}`, { headers: { "accept-encoding": "br, gzip" } });
    assert.equal(compressedWatch.headers["content-encoding"], "gzip");
    assert.match(String(compressedWatch.headers.vary), /Accept-Encoding/i);
    assert.equal(Number(compressedWatch.headers["content-length"]), compressedWatch.bodyBuffer.length);
    assert.match(zlib.gunzipSync(compressedWatch.bodyBuffer).toString("utf8"), new RegExp(`${PREFIX}/_nuxt/app\\.js`));
    const watchHead = await request(gatewayPort, `${PREFIX}/videos/${video}`, { method: "HEAD", headers: { "accept-encoding": "gzip" } });
    assert.equal(watchHead.headers["content-encoding"], "gzip");
    assert.equal(watchHead.bodyBuffer.length, 0);
    assert.equal(Number(watchHead.headers["content-length"]), compressedWatch.bodyBuffer.length);
    assert.equal((await request(gatewayPort, `${PREFIX}/videos/${video}/_payload.json`)).status, 200);
    const nuxt = await request(gatewayPort, `${PREFIX}/_nuxt/app.js`);
    assert.match(nuxt.body, /const router="\/videos\/:id"/);
    assert.match(nuxt.body, /const payload="\/videos\/example\/_payload\.json"/);
    assert.match(nuxt.body, /baseURL:"\/",cdnURL:"",buildAssetsDir:"\/_nuxt\/"/);

    const consolePage = await request(gatewayPort, `${PREFIX}/__qrveo/console/`);
    assert.equal(consolePage.status, 200);
    assert.match(consolePage.body, new RegExp(`${PREFIX}/__qrveo/console/assets/js/index\\.js`));
    assert.match(consolePage.body, new RegExp(`${PREFIX}/__qrveo/console-bootstrap\\.js`));
    assert.match(consolePage.body, new RegExp(`https://api\\.yisama\\.asia${PREFIX}/__qrveo/player/vod-player\\.min\\.js`));
    assert.match(consolePage.body, /officialOrigin:"https:\/\/api\.yisama\.asia"/);
    const bootstrap = await request(gatewayPort, `${PREFIX}/__qrveo/console-bootstrap.js`);
    assert.equal(bootstrapOrigin(OLD_BOOTSTRAP), "https://api.yisama.asia:4321");
    assert.match(OLD_BOOTSTRAP, /return url\.hostname === location\.hostname && \(url\.port === "4321" \|\| url\.port === "30082"\);/);
    assert.match(bootstrap.body, /if \(url\.origin === "https:\/\/api\.yisama\.asia"\) return true;/);
    assert.equal(bootstrapOrigin(bootstrap.body), "https://api.yisama.asia");
    assert.match(bootstrap.body, /\/qrveo\/iniciar-sesion\//);
    const adminJs = await request(gatewayPort, `${PREFIX}/__qrveo/console/assets/js/index.js`);
    assert.match(adminJs.body, new RegExp(`f\\.p="${PREFIX}/__qrveo/console/"`));
    assert.match(adminJs.body, /n\.p=""/);

    const detail = await request(gatewayPort, `${PREFIX}/__qrveo/api/vod/video/${video}.json`);
    assert.equal(detail.status, 200);
    assert.match(detail.body, new RegExp(`https://api\\.yisama\\.asia${PREFIX}/__qrveo/hls/`));
    assert.equal((await request(gatewayPort, `${PREFIX}/__qrveo/api/cos/get-upload-credential`)).status, 404);
    assert.equal((await request(gatewayPort, `${PREFIX}/__qrveo/api/user/get-user`)).status, 401);
    assert.equal((await request(gatewayPort, `${PREFIX}/__qrveo/api/user/get-user`, { headers: { "x-auth-token": "ok" } })).status, 200);
    const logout = await request(gatewayPort, `${PREFIX}/__qrveo/api/auth/logout`, { method: "POST", body: {}, headers: { "x-auth-token": "ok", "accept-language": "es-MX" } });
    assert.equal(logout.status, 200);
    const logoutCall = calls.findLast((call) => call.path === "/auth/logout");
    assert.equal(logoutCall.token, "ok");
    assert.equal(logoutCall.contentLength, "2");
    assert.equal((await request(gatewayPort, `${PREFIX}/__qrveo/api/overview/playback/event`, { method: "POST", body: { videoId: video, sessionId: "s", event: "play" } })).status, 200);
    assert.equal((await request(gatewayPort, `${PREFIX}/__qrveo/api/overview/playback/event`, { method: "POST", body: { videoId: "other", sessionId: "s", event: "play" } })).status, 404);
    assert.ok(calls.some((call) => call.path === "/overview/playback/event"));

    const hlsPath = `${PREFIX}/__qrveo/hls/vod-mp4/hceea401fc/${VIDEO_IDS[1]}/stream.m3u8`;
    const playlist = await request(gatewayPort, hlsPath);
    assert.equal(playlist.status, 200);
    assert.match(playlist.body, new RegExp(`https://api\\.yisama\\.asia${PREFIX}/__qrveo/media/`));
    const owned = `${PREFIX}/__qrveo/media/vod-mp4/owner/private/file.mp4`;
    assert.equal((await request(gatewayPort, owned)).status, 401);
    const media = await request(gatewayPort, owned, { headers: { "x-auth-token": "ok", "accept-encoding": "gzip" } });
    assert.equal(media.status, 200);
    assert.equal(media.headers["content-encoding"], undefined);
    assert.deepEqual(media.bodyBuffer, Buffer.from([0, 1, 2, 3]));
    console.log("demo gateway checks passed");
  } finally {
    await close(gateway);
    await Promise.all(servers.map(close));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
