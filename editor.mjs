// 网站编辑入口：登录后在中文表单里改文字、价格、WhatsApp、常见问题，保存后立即重新生成网站。
// 用法：EDITOR_PASSWORD=你的密码 node editor.mjs     打开 http://127.0.0.1:4322/editar
// 不设密码时会随机生成一个并打印在终端里（仅适合本机使用）。正式环境放在 nginx 后面，只开放 /editar。
import http from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";
import { DEFAULT_LANG, LANGS, skeleton } from "./src/i18n.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(ROOT, "content", "es.json");
// 其他语言只存译文：content/<code>.json
const fileOf = (lang) => path.join(ROOT, "content", `${lang}.json`);
const pickLang = (l) => (LANGS.some((x) => x.code === l) ? l : DEFAULT_LANG);
// 编辑译文时的表单：西语里每条可翻译的文字都列出来，没翻译的留空（网站上会先显示西语）
function fill(base, tr) {
  if (typeof base === "string") return typeof tr === "string" ? tr : "";
  if (Array.isArray(base)) return base.map((x, i) => (x === null ? null : fill(x, Array.isArray(tr) ? tr[i] : undefined)));
  if (base && typeof base === "object") return Object.fromEntries(Object.entries(base).map(([k, x]) => [k, fill(x, tr && typeof tr === "object" ? tr[k] : undefined)]));
  return base;
}
function validateTr(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return "内容格式不对";
  let bad = "";
  const walk = (v, p) => {
    if (bad) return;
    if (typeof v === "string") {
      if (v.length > 2000) bad = `${p} 太长了`;
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, p ? `${p}.${k}` : k));
    else if (v !== null) bad = `${p} 的值不对`;
  };
  walk(c, "");
  return bad;
}
const BACKUPS = path.join(ROOT, "content", "backups");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.EDITOR_PORT || 4322);
const PREVIEW = process.env.SITE_PREVIEW_URL || "http://127.0.0.1:4321/mexico/";
const PASSWORD = process.env.EDITOR_PASSWORD || randomBytes(6).toString("base64url");
const SESSION_HOURS = 8;

const sessions = new Map(); // token → 过期时间
const failures = new Map(); // ip → { n, until }
const sha = (s) => createHash("sha256").update(String(s)).digest();

function cookie(req, name) {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.cookie || "");
  return m ? m[1] : "";
}
function authed(req) {
  const t = cookie(req, "qe_sess");
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(t);
    return false;
  }
  return true;
}
async function body(req, limit = 2_000_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}
const send = (res, code, type, text, headers = {}) =>
  res
    .writeHead(code, {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
      ...headers,
    })
    .end(text);
const json = (res, code, obj) => send(res, code, "application/json; charset=utf-8", JSON.stringify(obj));

// 保存前的基本检查：结构完整、都是字符串、长度合理
function validate(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return "内容格式不对";
  for (const k of ["meta", "brand", "contact", "header", "home", "solutions", "examples", "features", "pricing", "help", "contactPage", "about", "final", "footer", "example"]) {
    if (!c[k] || typeof c[k] !== "object") return `缺少“${k}”部分`;
  }
  let bad = "";
  const walk = (v, p) => {
    if (bad) return;
    if (typeof v === "string") {
      if (v.length > 2000) bad = `${p} 太长了`;
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, p ? `${p}.${k}` : k));
    else if (v !== null && typeof v !== "number" && typeof v !== "boolean") bad = `${p} 的值不对`;
  };
  walk(c, "");
  if (!/^\d{10,15}$/.test(String(c.contact.whatsapp || ""))) return "WhatsApp 号码只能是 10–15 位数字（含国家码 52）";
  return bad;
}

async function backups(lang = DEFAULT_LANG) {
  await mkdir(BACKUPS, { recursive: true });
  return (await readdir(BACKUPS)).filter((f) => f.startsWith(`${lang}-`) && f.endsWith(".json")).sort().reverse().slice(0, 30);
}
const stampName = (lang) => `${lang}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
async function backupCurrent(lang) {
  await mkdir(BACKUPS, { recursive: true });
  try {
    await copyFile(fileOf(lang), path.join(BACKUPS, stampName(lang)));
  } catch {
    /* 这种语言还没有文件 */
  }
}

const LOGIN_PAGE = (msg = "") => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QRveo 官网编辑入口</title><meta name="robots" content="noindex"><style>${BASE_CSS}
.box{max-width:360px;margin:12vh auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 20px 50px -30px rgba(0,0,0,.5)}
input{width:100%;margin:14px 0}button{width:100%}</style></head><body>
<form class="box" method="post" action="/editar/login"><h1>QRveo 官网编辑入口</h1>
<p class="muted">输入编辑密码后可以修改网站上的文字、价格、联系方式和常见问题。</p>
${msg ? `<p class="err">${msg}</p>` : ""}<input type="password" name="password" placeholder="编辑密码" autofocus required>
<button type="submit">登录</button></form></body></html>`;

const BASE_CSS = `*{box-sizing:border-box}body{margin:0;font:15px/1.6 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;background:#f2eee6;color:#141210}
h1{font-size:22px;margin:0 0 6px}.muted{color:#6f675d}.err{color:#b23808;font-weight:600}
input,textarea{font:inherit;border:1px solid #cfc6b8;border-radius:10px;padding:9px 11px;background:#fff;width:100%}
textarea{min-height:64px;resize:vertical}input:focus,textarea:focus{outline:3px solid #ff5a1f55;border-color:#ff5a1f}
button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:10px 16px;background:#ff5a1f;color:#141210;cursor:pointer}
button.ghost{background:transparent;border:1.5px solid #141210}button.small{padding:4px 10px;font-size:13px;font-weight:600}`;

const EDITOR_PAGE = () => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QRveo 官网编辑</title><meta name="robots" content="noindex"><style>${BASE_CSS}
header{position:sticky;top:0;z-index:5;background:#141210;color:#f2eee6;display:flex;gap:12px;align-items:center;padding:12px 20px;flex-wrap:wrap}
header a{color:#f2eee6}header .sp{flex:1}#status{font-weight:600}
main{max-width:980px;margin:0 auto;padding:20px}
.tip{background:#fff;border-radius:12px;padding:12px 16px;margin-bottom:16px}
details.sec{background:#fff;border-radius:14px;margin:0 0 12px;box-shadow:0 1px 0 rgba(0,0,0,.06)}
details.sec>summary{cursor:pointer;padding:14px 18px;font-weight:800;font-size:17px}
.sec-body{padding:0 18px 16px}
.field{margin:10px 0}.field>label{display:block;font-weight:600;font-size:14px;margin-bottom:4px}
.field .path{font:12px ui-monospace,Consolas,monospace;color:#9a9186;margin-left:6px;font-weight:400}
.group{border-left:3px solid #e6e0d4;padding:4px 0 4px 14px;margin:12px 0}
.item{border:1px dashed #cfc6b8;border-radius:12px;padding:10px 14px;margin:10px 0;position:relative}
.item-tools{display:flex;gap:6px;justify-content:flex-end}
.legend{font-weight:700;margin:6px 0}
#raw{width:100%;min-height:340px;font:13px/1.5 ui-monospace,Consolas,monospace}
.bk{display:flex;gap:8px;align-items:center;margin:4px 0}
.orig{margin:4px 0 0;color:#8a8176;font-size:13px}
header select{font:inherit;border-radius:8px;padding:6px 8px}</style></head><body>
<header><strong>QRveo 官网编辑</strong><span class="muted" style="color:#cfc6b8">改完点“保存并更新网站”</span><span class="sp"></span>
<select id="lang" title="选择要编辑的语言">${LANGS.map((l) => `<option value="${l.code}">${l.name}${l.code === DEFAULT_LANG ? "（主文件）" : "（译文）"}</option>`).join("")}</select>
<span id="status"></span><button id="save">保存并更新网站</button><a href="${PREVIEW}" target="_blank" rel="noopener">打开网站 ↗</a>
<form method="post" action="/editar/logout" style="margin:0"><button class="ghost small" style="color:#f2eee6;border-color:#f2eee6">退出</button></form></header>
<main>
<p class="tip">网站文字是西班牙语，直接在框里改即可。标题里用 <b>*星号*</b> 包住的词会显示成橙色。价格要写含增值税（IVA）的总价。图片和视频需要换的话请联系开发同学。<br>右上角可以切换语言：<b>Español 是主文件</b>，结构、价格、图片、视频、链接都只在这里改；其他语言只改译文，每个框下面有西语原文对照，留空的地方网站会先显示西语。</p>
<div id="form"></div>
<details class="sec"><summary>历史版本（每次保存前自动备份）</summary><div class="sec-body" id="backups"></div></details>
<details class="sec"><summary>高级：直接编辑全部内容（JSON）</summary><div class="sec-body"><textarea id="raw" spellcheck="false"></textarea>
<p><button class="ghost small" id="applyRaw">用这段内容替换上面的表单</button></p></div></details>
</main>
<script>
const SECTIONS = {meta:"网页信息与 WhatsApp 分享卡片",brand:"品牌",contact:"联系方式与公司信息",demo:"首屏二维码（一般留空）",header:"顶部导航",home:"首页",final:"每页底部的行动区",solutionsPage:"解决方案 · 总览页",solutions:"解决方案 · 4 个场景页",examplesPage:"示例页",examples:"示例（后台里的真实视频）",features:"功能页",pricing:"价格页",help:"帮助页（常见问题）",contactPage:"联系页",about:"关于我们",footer:"页脚",example:"备用静态示例页（BF-20）",ui:"界面小字（读屏文字、表头、联系表单句式）",auth:"注册 / 登录 / 找回密码页"};
const LABELS = {"meta.title":"浏览器标题","meta.description":"搜索结果里的简介","meta.ogTitle":"WhatsApp 分享卡片标题","meta.ogDescription":"WhatsApp 分享卡片简介",
"brand.name":"品牌名","brand.poweredBy":"页脚“技术提供”字样","contact.whatsapp":"WhatsApp 号码（只填数字，含国家码 52）","contact.whatsappLabel":"页面上显示的 WhatsApp 号码","contact.whatsappText":"点 WhatsApp 按钮时自动带上的消息","contact.email":"联系邮箱","contact.company":"公司名称","contact.city":"城市","contact.hours":"服务时间","contact.address":"地址","contact.rfc":"RFC（税号）",
"demo.url":"首屏二维码指向的地址（留空 = 第一个示例视频）","header.nav[].label":"菜单文字","header.login":"“登录”文字","header.cta":"顶部主按钮文字","header.menuAll":"下拉菜单底部链接",
"home.hero.kicker":"首屏小标题","home.hero.title":"首屏大标题","home.hero.lead":"首屏副标题","home.hero.ctaPrimary":"主按钮","home.hero.ctaSecondary":"次按钮","home.hero.note":"按钮下方小字","home.hero.filmCaption":"短片下方说明","home.hero.endCard":"短片落版文字（必须与短片最后一帧一致，改了要重新导出短片）","home.proof[].k":"卖点","home.proof[].v":"卖点说明",
"examples[].title":"示例标题","examples[].place":"二维码贴在哪里","examples[].text":"说明","examples[].vid":"后台视频 VID（换视频请填后台列表里的 VID）",
"pricing.plans[].name":"套餐名","pricing.plans[].price":"价格（含 IVA）","pricing.plans[].unit":"价格单位","pricing.plans[].monthly":"价格下方说明","pricing.plans[].cta":"按钮文字","pricing.plans[].badge":"角标（留空 = 不显示）","pricing.plans[].for":"适合谁","pricing.rows[].k":"对比项","pricing.rows[].v":"三个套餐的值（依次：试用 / 标准 / 高级）",
"items[].q":"问题","items[].a":"回答","k":"项目","v":"内容","label":"小标签","title":"标题","intro":"导语","lead":"导语","text":"正文","cta":"按钮文字","more":"“查看更多”链接文字","name":"名称","short":"一句话介绍","who":"适合谁","points":"要点","uses":"使用场景","note":"补充说明",
"features.swap.qrCaption":"功能页首屏 · 二维码下方文字","features.swap.items[].label":"轮换卡片 · 小标签","features.swap.items[].title":"轮换卡片 · 视频标题","features.swap.note":"功能页首屏 · 底部说明","cursor.tip":"截图上光标旁的提示文字",
"solutions[].chatName":"聊天窗口的群名","solutions[].chat":"聊天气泡（客户的原话，一条一句）","solutionsPage.chatTitle":"痛点区标题",
"pricing.estimator.title":"估算器标题","pricing.estimator.q":"估算器问题","pricing.estimator.unit":"数字后面的单位","pricing.estimator.results[].text":"推荐结果文字","pricing.estimator.note":"估算器小字",
"help.searchLabel":"搜索框标题","help.searchPlaceholder":"搜索框提示文字","help.empty":"搜不到时显示的文字",
"contactPage.previewTitle":"WhatsApp 预览标题","contactPage.previewName":"WhatsApp 预览里的联系人名",
"about.flowTitle":"流程线标题","about.flow[].k":"流程步骤","about.flow[].v":"步骤说明",
"demo.productName":"示例产品名","header.menuOpen":"手机菜单按钮（读屏用）","home.hero.waLink":"首屏 WhatsApp 链接文字","home.hero.playFilm":"短片“播放”按钮","home.hero.filmLength":"短片时长","home.hero.replay":"“再看一遍”按钮","home.hero.skip":"“跳过”按钮","home.hero.scanHint":"落版提示（电脑）","home.hero.tapHint":"落版提示（手机）","home.hero.endCard.boxLabel":"纸箱上的型号文字","home.hero.endCard.site":"落版网址","home.pricing.from":"“起价”小字","home.pricing.fromPrice":"起价","final.whatsapp":"WhatsApp 按钮文字","seoTitle":"浏览器标题（搜索引擎显示）","solutionsPage.other":"“其他场景”提示","solutions[].usesTitle":"“在哪里用”小标题","solutions[].featuresTitle":"“对你有用的功能”小标题","examplesPage.scan":"“扫码”提示","examplesPage.open":"“在本屏打开”链接","pricing.compareTitle":"对比表标题","pricing.estimate":"对比表下方小字","contactPage.formTitle":"表单标题","contactPage.formNote":"表单下方小字","contactPage.fields.name":"字段：姓名","contactPage.fields.company":"字段：公司或学校","contactPage.fields.use":"字段：用途","contactPage.fields.message":"字段：留言","contactPage.send":"发送按钮","contactPage.channels":"“其他联系方式”标题","contactPage.company":"“公司信息”标题","footer.tagline":"页脚一句话介绍","footer.rights":"版权文字","example.brand":"品牌","example.badge":"标签","example.desc":"视频说明","example.tipTitle":"提示标题","example.footer":"底部文字","example.footerTail":"底部补充（可留空）","example.demoNote":"顶部示例说明条","example.demoBack":"“返回官网”链接",
"auth.seoRegister":"注册页浏览器标题","auth.seoLogin":"登录页浏览器标题","auth.seoRecover":"找回密码页浏览器标题","auth.sideTitle":"右侧大字","auth.sidePoints":"右侧要点",
"auth.register.title":"注册页标题","auth.register.lead":"注册页导语","auth.register.name":"字段：名称","auth.register.namePh":"名称框里的示例","auth.register.email":"字段：邮箱（登录、找回密码页共用）","auth.register.emailPh":"邮箱框里的示例","auth.register.code":"字段：邮箱验证码（后台要求时才显示）","auth.register.codeSend":"“发送验证码”按钮","auth.register.codeWait":"倒计时文字（{s} = 秒数）","auth.register.codeSent":"验证码已发送提示","auth.register.password":"字段：密码（登录页共用）","auth.register.passwordHint":"密码规则","auth.register.show":"“显示密码”（读屏用）","auth.register.hide":"“隐藏密码”（读屏用）","auth.register.consent":"同意条款（{terms}、{privacy} 会变成链接）","auth.register.terms":"链接文字：条款","auth.register.privacy":"链接文字：隐私声明","auth.register.submit":"注册按钮","auth.register.busy":"注册中文字","auth.register.done":"注册成功提示","auth.register.have":"“已有账号？”","auth.register.loginLink":"去登录链接","auth.register.planQ":"“不知道选哪个套餐？”","auth.register.planLink":"去价格页链接",
"auth.login.title":"登录页标题","auth.login.lead":"登录页导语","auth.login.captcha":"字段：图形验证码","auth.login.captchaNew":"“换一张”","auth.login.forgot":"“忘记密码？”链接","auth.login.submit":"登录按钮","auth.login.busy":"登录中文字","auth.login.done":"登录成功提示","auth.login.no":"“没有账号？”","auth.login.registerLink":"去注册链接","auth.login.already":"已登录时的标题","auth.login.goPanel":"“进入面板”按钮","auth.login.logout":"“退出登录”按钮","auth.login.loggedOut":"已退出提示",
"auth.recover.title":"找回密码页标题","auth.recover.lead":"找回密码页导语","auth.recover.submit":"发送按钮","auth.recover.busy":"发送中文字","auth.recover.sent":"已发送提示","auth.recover.back":"返回登录链接","auth.recover.resetTitle":"重置页标题（点邮件链接后）","auth.recover.resetBusy":"正在生成新密码","auth.recover.resetDone":"新密码说明","auth.recover.resetFail":"链接失效提示","auth.recover.copy":"“复制”按钮","auth.recover.copied":"已复制","auth.recover.again":"“重新发送链接”按钮",
"auth.errors.required":"错误：没填","auth.errors.email":"错误：邮箱格式","auth.errors.password":"错误：密码不符合规则","auth.errors.consent":"错误：没勾选同意","auth.errors.code":"错误：没填验证码","auth.errors.captcha":"错误：没填图形验证码","auth.errors.network":"错误：连不上服务器","auth.errors.generic":"错误：其他","auth.errors.exists":"错误：邮箱已注册","auth.errors.credentials":"错误：邮箱或密码不对","auth.errors.captchaBad":"错误：图形验证码不对","auth.errors.codeBad":"错误：邮箱验证码不对","auth.errors.tooMany":"错误：尝试太多次",
"ui.waHello":"WhatsApp 消息第一句（{name} = 姓名）","ui.waHelloCo":"WhatsApp 消息第一句（有公司时）","ui.waUse":"WhatsApp 消息第二句（{use} = 用途）","ui.waNamePh":"预览里没填姓名时","ui.panel":"已登录时顶栏的“我的面板”","ui.langMenu":"语言菜单标题","ui.legalNote":"法律页说明（只在非西语页面显示）","ui.yes":"对比表里的“是”"};
const HIDE = /(^|\\.)(lang|img|video|poster|href|console|id|action|plan|slug|solution|exampleId|menu|fallback|shot|pick|phone|clip)$|\\.alt$/;
let data = null, base = null, lang = "es";
const escH = (t) => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;");
const $ = (s) => document.querySelector(s);
const norm = (p) => p.replace(/\\[\\d+\\]/g, "[]");
function label(p){ const n = norm(p); if (LABELS[n]) return LABELS[n]; const tail = n.split(".").slice(-2).join("."); if (LABELS[tail]) return LABELS[tail]; return LABELS[n.split(".").pop()] || n.split(".").pop(); }
function get(o, p){ return p.split(/\\.|\\[|\\]/).filter(Boolean).reduce((a,k)=>a[k], o); }
function blank(v){ if (typeof v === "string") return ""; if (Array.isArray(v)) return []; if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k,x])=>[k, blank(x)])); return v; }
function field(p, v){ const id = "f_" + p.replace(/\\W/g,"_"); const long = (base ? get(base, p) : v).length > 70 || /\\.(a|text|lead|intro|description)$/.test(p);
  return '<div class="field"><label for="'+id+'">'+label(p)+'<span class="path">'+norm(p)+'</span></label>'+(long?'<textarea id="'+id+'" data-p="'+p+'"></textarea>':'<input id="'+id+'" data-p="'+p+'">')+(base?'<p class="orig">西语：'+escH(get(base, p))+'</p>':'')+'</div>'; }
function render(v, p){
  if (HIDE.test(p)) return "";
  if (typeof v === "string") return field(p, v);
  if (Array.isArray(v) && base) return '<div class="group"><div class="legend">'+label(p)+'</div>'+v.map((x,i)=> x === null ? "" : '<div class="item">'+render(x, p+'['+i+']')+'</div>').join("")+'</div>';
  if (Array.isArray(v)) { let h = '<div class="group"><div class="legend">'+label(p)+'</div>';
    v.forEach((x,i)=>{ h += '<div class="item">'+render(x, p+'['+i+']')+'<div class="item-tools"><button class="ghost small" data-mv="'+p+'" data-i="'+i+'" data-d="-1">上移</button><button class="ghost small" data-mv="'+p+'" data-i="'+i+'" data-d="1">下移</button><button class="ghost small" data-del="'+p+'" data-i="'+i+'">删除</button></div></div>'; });
    return h + '<button class="ghost small" data-add="'+p+'">＋ 添加一项</button></div>'; }
  if (v && typeof v === "object") return Object.entries(v).map(([k,x])=>render(x, p ? p+"."+k : k)).join("");
  return ""; }
function draw(){ const open = [...document.querySelectorAll("details.sec[data-k][open]")].map(d=>d.dataset.k);
  $("#form").innerHTML = Object.keys(data).map(k=>'<details class="sec" data-k="'+k+'"'+(open.includes(k)?" open":"")+'><summary>'+(SECTIONS[k]||k)+'</summary><div class="sec-body">'+render(data[k], k)+'</div></details>').join("");
  document.querySelectorAll("[data-p]").forEach(el=>{ el.value = get(data, el.dataset.p); el.addEventListener("input", ()=>{ setPath(el.dataset.p, el.value); dirty(true); }); });
  $("#raw").value = JSON.stringify(data, null, 2); }
function setPath(p, val){ const keys = p.split(/\\.|\\[|\\]/).filter(Boolean); const last = keys.pop(); const o = keys.reduce((a,k)=>a[k], data); o[last] = val; }
function dirty(on){ $("#status").textContent = on ? "有未保存的修改" : ""; window.onbeforeunload = on ? () => true : null; }
document.addEventListener("click", (e)=>{ const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.add){ const arr = get(data, b.dataset.add); arr.push(arr.length ? blank(arr[arr.length-1]) : ""); dirty(true); draw(); }
  if (b.dataset.del){ if (!confirm("删除这一项？")) return; get(data, b.dataset.del).splice(+b.dataset.i, 1); dirty(true); draw(); }
  if (b.dataset.mv){ const arr = get(data, b.dataset.mv), i = +b.dataset.i, j = i + (+b.dataset.d); if (j<0||j>=arr.length) return; [arr[i],arr[j]] = [arr[j],arr[i]]; dirty(true); draw(); } });
async function api(url, opt={}){ const r = await fetch(url + (url.includes("?") ? "&" : "?") + "lang=" + lang, {...opt, headers:{"Content-Type":"application/json","X-Requested-With":"qrveo-editor"}}); const j = await r.json().catch(()=>({})); if (!r.ok) throw new Error(j.error || r.status); return j; }
async function loadBackups(){ const {list} = await api("/editar/api/backups"); $("#backups").innerHTML = list.length ? list.map(n=>'<div class="bk"><code>'+n+'</code><button class="ghost small" data-restore="'+n+'">恢复这个版本</button></div>').join("") : '<p class="muted">还没有备份。</p>'; }
$("#backups").addEventListener("click", async (e)=>{ const n = e.target.dataset.restore; if (!n || !confirm("恢复到 "+n+"？当前内容会先自动备份。")) return; try { await api("/editar/api/restore", {method:"POST", body: JSON.stringify({name:n})}); await load(); $("#status").textContent = "已恢复并更新网站"; } catch(err){ alert("恢复失败："+err.message); } });
$("#save").addEventListener("click", async ()=>{ $("#status").textContent = "保存中…"; try { const r = await api("/editar/api/content", {method:"PUT", body: JSON.stringify(data)}); dirty(false); $("#status").textContent = "已保存，网站已更新（"+r.time+"）"; loadBackups(); } catch(err){ $("#status").textContent = ""; alert("没有保存：" + err.message); } });
$("#applyRaw").addEventListener("click", ()=>{ try { data = JSON.parse($("#raw").value); dirty(true); draw(); } catch(err){ alert("JSON 格式有误：" + err.message); } });
async function load(){ const j = await api("/editar/api/content"); data = j.content; base = j.base || null; draw(); loadBackups(); }
$("#lang").addEventListener("change", (e)=>{ if (window.onbeforeunload && !confirm("还有没保存的修改，切换语言会丢掉。继续吗？")) { e.target.value = lang; return; } dirty(false); lang = e.target.value; load().catch(err=>alert("读取失败："+err.message)); });
load().catch(err=>alert("读取失败："+err.message));
</script></body></html>`;

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname.replace(/\/+$/, "") || "/";
    const ip = req.socket.remoteAddress || "";
    try {
      if (p === "/" ) return send(res, 302, "text/plain", "", { Location: "/editar" });

      if (p === "/editar/login" && req.method === "POST") {
        const f = failures.get(ip);
        if (f && f.until > Date.now()) return send(res, 429, "text/html; charset=utf-8", LOGIN_PAGE("尝试次数太多，请 10 分钟后再试。"));
        const pw = new URLSearchParams(await body(req, 10_000)).get("password") || "";
        if (timingSafeEqual(sha(pw), sha(PASSWORD))) {
          failures.delete(ip);
          const token = randomBytes(32).toString("hex");
          sessions.set(token, Date.now() + SESSION_HOURS * 3600_000);
          const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
          return send(res, 303, "text/plain", "", {
            Location: "/editar",
            "Set-Cookie": `qe_sess=${token}; HttpOnly; SameSite=Strict; Path=/editar; Max-Age=${SESSION_HOURS * 3600}${secure}`,
          });
        }
        const n = (f && f.until <= Date.now() ? 0 : f?.n || 0) + 1;
        failures.set(ip, { n, until: n >= 10 ? Date.now() + 600_000 : 0 });
        await new Promise((r) => setTimeout(r, 800));
        return send(res, 401, "text/html; charset=utf-8", LOGIN_PAGE("密码不对。"));
      }
      if (p === "/editar/logout" && req.method === "POST") {
        sessions.delete(cookie(req, "qe_sess"));
        return send(res, 303, "text/plain", "", { Location: "/editar", "Set-Cookie": "qe_sess=; Path=/editar; Max-Age=0" });
      }
      if (p === "/editar") return send(res, 200, "text/html; charset=utf-8", authed(req) ? EDITOR_PAGE() : LOGIN_PAGE());

      if (p.startsWith("/editar/api/")) {
        if (!authed(req)) return json(res, 401, { error: "请先登录" });
        if (req.headers["x-requested-with"] !== "qrveo-editor") return json(res, 403, { error: "请求来源不对" });

        const lang = pickLang(url.searchParams.get("lang"));
        if (p === "/editar/api/content" && req.method === "GET") {
          const es = JSON.parse(await readFile(CONTENT, "utf8"));
          if (lang === DEFAULT_LANG) return json(res, 200, { content: es, lang });
          const base = skeleton(es);
          let tr = {};
          try {
            tr = JSON.parse(await readFile(fileOf(lang), "utf8"));
          } catch {
            /* 还没有译文 */
          }
          return json(res, 200, { content: fill(base, tr), base, lang });
        }
        if (p === "/editar/api/content" && req.method === "PUT") {
          const next = JSON.parse(await body(req));
          const err = lang === DEFAULT_LANG ? validate(next) : validateTr(next);
          if (err) return json(res, 400, { error: err });
          await backupCurrent(lang);
          await writeFile(fileOf(lang), `${JSON.stringify(next, null, 2)}\n`);
          await build();
          return json(res, 200, { ok: true, time: new Date().toLocaleTimeString("zh-CN") });
        }
        if (p === "/editar/api/backups" && req.method === "GET") return json(res, 200, { list: await backups(lang) });
        if (p === "/editar/api/restore" && req.method === "POST") {
          const { name } = JSON.parse(await body(req, 10_000));
          if (!(await backups(lang)).includes(name)) return json(res, 404, { error: "找不到这个版本" });
          await backupCurrent(lang);
          await copyFile(path.join(BACKUPS, name), fileOf(lang));
          await build();
          return json(res, 200, { ok: true });
        }
        return json(res, 404, { error: "没有这个接口" });
      }
      send(res, 404, "text/plain; charset=utf-8", "404");
    } catch (e) {
      json(res, 500, { error: String(e.message || e) });
    }
  })
  .listen(PORT, HOST, () => {
    console.log(`官网编辑入口：http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}/editar`);
    if (!process.env.EDITOR_PASSWORD) console.log(`本次随机密码：${PASSWORD}（正式使用请设置环境变量 EDITOR_PASSWORD）`);
  });
