// 构建：content/es.json（+ 其他语言的翻译 content/<code>.json）+ 模板 → dist/mexico/（西语在根目录，其他语言在 /<code>/）（纯静态，可直接替换后台里的“官网”服务）
// 用法：node build.mjs      可选环境变量：SITE_ORIGIN（默认 https://www.qrveo.com）、SITE_BASE（默认 /mexico/）、
//       SITE_DIST（输出目录，默认 ./dist；服务器上由编辑入口写进 nginx 的共享目录）
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { AUTH, pageAbout, pageAuth, pageContact, pageExamples, pageFeatures, pageHelp, pageHome, pageLegal, pagePricing, pageSolution, pageSolutions } from "./src/render.mjs";
import { DEFAULT_LANG, LANGS, langDir, localize, missing } from "./src/i18n.mjs";
import { pageExample } from "./src/example.mjs";
import { legalPages } from "./src/legal.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SITE_BASE || "/mexico/";
const ORIGIN = (process.env.SITE_ORIGIN || "https://www.qrveo.com").replace(/\/$/, "");
// 观看页域名（后台 front 服务）。浏览器里会按 window.__VOD_PRIVATE__.watchOrigin 改写
const WATCH = (process.env.SITE_WATCH || "https://v.qrveo.com").replace(/\/$/, "");
const DIST = process.env.SITE_DIST ? path.resolve(process.env.SITE_DIST) : path.join(ROOT, "dist");
const OUT = path.join(DIST, ...BASE.split("/").filter(Boolean));

const qrcode = createRequire(import.meta.url)("./src/vendor/qrcode.js");

// 与浏览器里 site.js 的 qrSvg 相同：没有脚本时也有一张可扫的二维码
function qrSvg(text, margin = 1) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const size = n + margin * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  return `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#141210"/></svg>`;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7"><rect width="7" height="7" rx="1.2" fill="#141210"/><rect x="1" y="1" width="5" height="5" rx=".7" fill="#F2EEE6"/><rect x="2" y="2" width="3" height="3" rx=".45" fill="#FF5A1F"/></svg>`;

async function write(rel, text) {
  const file = path.join(OUT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

// 编辑入口（editor.mjs）保存后也调用这里
export async function build() {
  const es = JSON.parse(await readFile(path.join(ROOT, "content", "es.json"), "utf8"));
  // 只清空本站目录里的内容：输出目录可能是挂载卷；官网容器启动时写入的 private-runtime.js 要保留
  await mkdir(OUT, { recursive: true });
  for (const f of await readdir(OUT)) {
    if (f !== "private-runtime.js") await rm(path.join(OUT, f), { recursive: true, force: true });
  }
  await cp(path.join(ROOT, "public"), OUT, { recursive: true });

  // 样式：全站样式 + 动效 + 首页短片舞台（v1 沿用）
  const css = (
    await Promise.all(["site.css", "motion.css", "stage.css", "account.css"].map((f) => readFile(path.join(ROOT, "src", "styles", f), "utf8")))
  ).join("\n");
  const js = await readFile(path.join(ROOT, "src", "scripts", "site.js"), "utf8");
  // 第三方二维码库（MIT），包成 ES 模块供 site.js 引入
  const qrLib = `${await readFile(path.join(ROOT, "src", "vendor", "qrcode.js"), "utf8")}
export default qrcode;
`;
  const v = createHash("sha1").update(css + js + qrLib).digest("hex").slice(0, 8);
  await write("assets/site.css", css);
  await write("assets/site.js", js);
  await write("assets/qrcode.mjs", qrLib);
  await write("favicon.svg", FAVICON);

  // 首屏贴纸指向第一个示例（产品）的观看页
  const first = es.examples[0];
  const demo = es.demo.url || (first?.vid ? `${WATCH}/videos/${first.vid}` : `${ORIGIN}${BASE}ejemplo/`);
  const pages = [
    ["", pageHome],
    ["funciones/", pageFeatures],
    ["soluciones/", pageSolutions],
    ["ejemplos/", pageExamples],
    ["precios/", pagePricing],
    ["ayuda/", pageHelp],
    ["contacto/", pageContact],
    ["nosotros/", pageAbout],
  ];
  const urls = [];
  const gaps = [];
  for (const lang of LANGS) {
    const file = path.join(ROOT, "content", `${lang.code}.json`);
    const tr = lang.code === DEFAULT_LANG || !existsSync(file) ? {} : JSON.parse(await readFile(file, "utf8"));
    const c = localize(es, tr);
    if (lang.code !== DEFAULT_LANG) gaps.push(`${lang.code} ${missing(es, tr).length}`);
    const dir = langDir(lang.code);
    // o.root 到站点根目录（图片、样式等共用资源），o.L 到本语言首页，o.alt(l) 同一页在另一种语言里的路径
    const opts = (p) => {
      const root = "../".repeat((dir + p).split("/").filter(Boolean).length);
      return { origin: ORIGIN, base: BASE, watch: WATCH, path: p, full: dir + p, root, L: root + dir, lang, langs: LANGS, alt: (l) => langDir(l.code) + p, v, qr: (t) => qrSvg(t), demo };
    };
    const put = async (p, html) => {
      await write(`${dir}${p}index.html`, html);
      urls.push(dir + p);
    };
    for (const [p, fn] of pages) await put(p, fn(c, opts(p)));
    for (const s of c.solutions) await put(`soluciones/${s.slug}/`, pageSolution(c, opts(`soluciones/${s.slug}/`), s));
    for (const kind of ["register", "login", "recover"]) await put(AUTH[kind], pageAuth(c, opts(AUTH[kind]), kind));
    for (const page of legalPages) await write(`${dir}${page.path}index.html`, pageLegal(c, opts(page.path), page));
  }
  // 备用静态示例页只有西语（模仿后台观看页）
  await write("ejemplo/index.html", pageExample(es, { root: "../" }));
  // 站点地图（给搜索引擎）
  await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.filter((u) => !u.endsWith(AUTH.recover)).map((u) => `  <url><loc>${ORIGIN}${BASE}${u}</loc></url>`).join("\n")}
</urlset>
`);

  return { out: path.relative(ROOT, OUT), base: BASE, v, gaps };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const r = await build();
  console.log(`ok → ${r.out}  (base ${r.base}, v=${r.v})  未翻译条数：${r.gaps.join(", ")}`);
}
