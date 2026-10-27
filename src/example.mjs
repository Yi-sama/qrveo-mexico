// 示例观看页：结构、尺寸、配色照搬后台现有的“聚合页”（/mexico/ver/*.html），只换成 BF-20 的内容。
// 顾客扫码后看到的就是这种页面，所以这里刻意不用官网的品牌样式。
import { esc } from "./render.mjs";

export const pageExample = (c, o) => {
  const e = c.example;
  return `<!doctype html>
<html lang="es-MX"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(e.title)} · ${esc(e.brand)}</title>
<meta name="robots" content="noindex"/>
<meta property="og:title" content="${esc(e.title)}"/>
<meta property="og:type" content="video.other"/>
<link rel="icon" href="${o.root}favicon.svg"/>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#0f172a;color:#0f172a}
.wrap{max-width:860px;margin:0 auto;padding:0 14px 40px}
.top{display:flex;align-items:center;gap:10px;color:#fff;padding:18px 2px 14px}
.brand{font-weight:800;letter-spacing:.3px;display:flex;align-items:center;gap:8px;text-decoration:none;color:#fff}
.card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.35)}
video{width:100%;display:block;background:#000;aspect-ratio:16/9}
.meta{padding:16px 18px 20px}
h1{font-size:20px;margin:2px 0 6px}
.foot{color:#94a3b8;text-align:center;font-size:12px;margin-top:18px}
.foot a{color:#cbd5e1}
.badge{display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;margin-bottom:8px}
.desc{color:#475569;font-size:14px;line-height:1.6;margin:0}
.content{margin-top:20px;display:flex;flex-direction:column;gap:16px}
.sec{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(2,6,23,.18);display:flex;flex-direction:column}
.sec-img{flex:0 0 auto}
.sec-img img{width:100%;display:block;aspect-ratio:4/3;object-fit:cover;background:#e2e8f0}
.sec-body{padding:16px 18px}
.sec-body h2{margin:0 0 8px;font-size:17px;color:#0f172a}
.sec-body p{margin:0 0 8px;color:#334155;font-size:14px;line-height:1.65}
.sec-body p:last-child{margin:0}
.sec-text .sec-body{padding-top:18px}
@media(min-width:640px){.sec{flex-direction:row}.sec-img{flex:0 0 40%}.sec-img img{aspect-ratio:auto;height:100%;min-height:170px;object-fit:cover}}
/* 仅示例页：说明这是演示，并给一个回官网的入口 */
.demo-note{max-width:860px;margin:0 auto;padding:10px 14px;color:#cbd5e1;font-size:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.demo-note a{color:#fff;font-weight:700}
</style></head>
<body>
<div class="demo-note"><span>${esc(e.demoNote)}</span><a href="${o.root}">${esc(e.demoBack)} →</a></div>
<div class="wrap">
<div class="top"><a class="brand" href="${o.root}">
<svg width="22" height="22" viewBox="0 0 7 7" aria-hidden="true"><rect width="7" height="7" rx="1.2" fill="#fff"/><rect x="1" y="1" width="5" height="5" rx=".7" fill="#0f172a"/><rect x="2" y="2" width="3" height="3" rx=".45" fill="#FF5A1F"/></svg>
${esc(e.brand)}</a></div>
<div class="card">
<video controls playsinline preload="metadata" poster="${o.root}${esc(e.poster)}"><source src="${o.root}${esc(e.video)}" type="video/mp4">Tu navegador no puede reproducir el video.</video>
<div class="meta">
<span class="badge">${esc(e.badge)}</span>
<h1>${esc(e.title)}</h1>
<p class="desc">${esc(e.desc)}</p>
</div></div>
<div class="content">${e.steps
    .map((s) =>
      s.img
        ? `<div class="sec"><div class="sec-img"><img src="${o.root}${esc(s.img)}" alt="${esc(s.title)}" loading="lazy"/></div><div class="sec-body"><h2>${esc(s.title)}</h2>${s.lines
            .map((l) => `<p>${esc(l)}</p>`)
            .join("")}</div></div>`
        : `<div class="sec sec-text"><div class="sec-body"><h2>${esc(s.title)}</h2>${s.lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div></div>`,
    )
    .join("")}<div class="sec sec-text"><div class="sec-body"><h2>${esc(e.tipTitle)}</h2>${e.tips.map((l) => `<p>${esc(l)}</p>`).join("")}</div></div></div>
<div class="foot">${esc(e.footer)} <a href="${o.root}">${esc(e.brand)}</a>${e.footerTail ? ` · ${esc(e.footerTail)}` : ""}</div>
</div></body></html>
`;
};
