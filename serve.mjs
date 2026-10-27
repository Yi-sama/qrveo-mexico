// 本地预览服务器：模拟后台里“官网”容器的行为（/ → /mexico/，注入 private-runtime.js，支持视频断点续传）。
// 用法：node serve.mjs            只在本机访问 http://127.0.0.1:4321/mexico/
//       HOST=0.0.0.0 node serve.mjs   同一 Wi-Fi 下的手机也能打开，并能扫首屏二维码
// 后台地址（与官网容器同名的环境变量）：VOD_ADMIN_DOMAIN、VOD_API_HOST、VOD_WATCH_DOMAIN
import http from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4321);
const BASE = "/mexico/";
const env = process.env;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
};

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
    }
  }
  return "";
}
const LAN = HOST === "0.0.0.0" ? env.LAN_HOST || lanAddress() : "";

// 开放给局域网时，后台地址默认也换成局域网 IP，手机上的“注册 / 登录”和观看页才打得开
const BACK = LAN || "127.0.0.1";
const runtime = () =>
  `window.__VOD_PRIVATE__ = ${JSON.stringify({
    apiOrigin: env.VOD_API_HOST || `http://${BACK}:30015`,
    consoleOrigin: env.VOD_ADMIN_DOMAIN || `http://${BACK}:30081`,
    watchOrigin: env.VOD_WATCH_DOMAIN || `http://${BACK}:30112`,
  })};\nwindow.__QRVEO_DEV__ = ${JSON.stringify({ lanHost: LAN })};\n`;

async function resolve(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, "");
  const file = path.join(ROOT, clean);
  if (!file.startsWith(ROOT)) return null;
  for (const f of [file, `${file}.html`, path.join(file, "index.html")]) {
    try {
      const s = await stat(f);
      if (s.isFile()) return { file: f, size: s.size };
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    if (p === "/") return res.writeHead(302, { Location: BASE }).end();
    if (p === "/mexico") return res.writeHead(301, { Location: BASE }).end();
    if (p === `${BASE}private-runtime.js`) {
      return res.writeHead(200, { "Content-Type": MIME[".js"], "Cache-Control": "no-store" }).end(runtime());
    }
    const hit = await resolve(p);
    if (!hit) return res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404");
    const type = MIME[path.extname(hit.file)] || "application/octet-stream";

    if (type.startsWith("text/html")) {
      // 与官网容器的 nginx sub_filter 相同：把后台地址脚本插到 </head> 前
      const html = (await readFile(hit.file, "utf8")).replace("</head>", `<script src="${BASE}private-runtime.js"></script></head>`);
      return res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" }).end(html);
    }

    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (range) {
      const start = range[1] ? Number(range[1]) : hit.size - Number(range[2]);
      const end = range[1] && range[2] ? Math.min(Number(range[2]), hit.size - 1) : hit.size - 1;
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${hit.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
      });
      return createReadStream(hit.file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": hit.size, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" });
    createReadStream(hit.file).pipe(res);
  })
  .listen(PORT, HOST, () => {
    console.log(`QRveo 官网预览：http://127.0.0.1:${PORT}${BASE}`);
    if (LAN) console.log(`同一 Wi-Fi 的手机：http://${LAN}:${PORT}${BASE}`);
  });
