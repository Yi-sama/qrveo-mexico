// QRveo 官网模板（v2，多页 B2B）。所有文案来自 content/es.json；这里只负责结构。
// 约定：文案里用 *星号* 包住的词会显示为橙色强调。
// o（页面参数）：root 到站点根目录的相对路径，path 当前页路径，v 资源版本号，qr(url) 生成二维码 SVG，watch 观看页域名。

export const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const rich = (s = "") => esc(s).replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>');

// 控制台地址在浏览器里由 site.js 按 window.__VOD_PRIVATE__ 改写；这里给出正式环境的默认值
export const CONSOLE = "https://console.qrveo.com";
export const ROUTES = { register: "/#/register", login: "/#/login", upgrade: "/#/secure/upgrade", panel: "/#/secure/overview" };
// 注册、登录、找回密码是官网自己的页面（调用后台接口，成功后带着登录状态进入控制台）；升级付款仍在控制台里
export const AUTH = { register: "registro/", login: "iniciar-sesion/", recover: "recuperar/" };
export const acct = (o, action) =>
  AUTH[action] ? `href="${o.L}${AUTH[action]}" data-auth="${action}"` : `href="${CONSOLE}${ROUTES[action]}" data-console="${action}"`;

export const waHref = (c, text) =>
  `https://wa.me/${encodeURIComponent(c.contact.whatsapp)}?text=${encodeURIComponent(text || c.contact.whatsappText)}`;

export const mark = (size = 22, cls = "mark") => `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 7 7" aria-hidden="true">
<rect width="7" height="7" rx="1.2" fill="var(--mark-outer, #141210)"/><rect x="1" y="1" width="5" height="5" rx=".7" fill="var(--mark-inner, #F7F4EE)"/><rect x="2" y="2" width="3" height="3" rx=".45" fill="#FF5A1F"/></svg>`;

export const waIcon = `<svg class="wa-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>`;

const arrow = `<span class="arr" aria-hidden="true">→</span>`;
const check = `<svg class="ck" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// 示例的观看页地址：后台视频 vid → 观看页域名/videos/vid；没有 vid 时用本站静态页
export const exampleHref = (ex, o) => (ex.vid ? `${o.watch}/videos/${ex.vid}` : `${o.root}${ex.fallback || "ejemplo/"}`);
const exampleAttrs = (ex, o) => `href="${esc(exampleHref(ex, o))}"${ex.vid ? ` data-watch="${esc(ex.vid)}"` : ""}`;

// 贴纸：短片里同一张橙色二维码贴纸
export const sticker = (c, o, { cls = "", href = "", label = "", url = "", vid = "" } = {}) => {
  const tag = href ? "a" : "div";
  const attrs = href ? ` href="${href}" data-demo${vid ? ` data-watch="${esc(vid)}"` : ""} aria-label="${esc(label)}"` : ' aria-hidden="true"';
  return `<${tag} class="sticker ${cls}"${attrs}><span class="sticker-qr" data-qr>${o.qr(url || o.demo)}</span><span class="sticker-txt">${esc(
    c.home.hero.endCard.sticker1,
  )}<br>${esc(c.home.hero.endCard.sticker2)}</span></${tag}>`;
};

const head = (c, o, { title, description, noindex = false }) => `<!doctype html>
<html lang="${esc(o.lang.hreflang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : ""}
<link rel="canonical" href="${esc(o.origin + o.base + o.full)}">
${o.langs.map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${esc(o.origin + o.base + o.alt(l))}">`).join("\n")}
<link rel="alternate" hreflang="x-default" href="${esc(o.origin + o.base + o.alt(o.langs[0]))}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${o.lang.og}">
<meta property="og:site_name" content="${esc(c.brand.name)}">
<meta property="og:title" content="${esc(o.path ? title : c.meta.ogTitle)}">
<meta property="og:description" content="${esc(o.path ? description : c.meta.ogDescription)}">
<meta property="og:image" content="${esc(o.origin + o.base)}img/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(o.origin + o.base + o.full)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#F7F4EE">
${c.demo.url ? `<meta name="qrveo-demo" content="${esc(c.demo.url)}">` : ""}
<link rel="icon" href="${o.root}favicon.svg" type="image/svg+xml">
<link rel="preload" href="${o.root}fonts/archivo.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${o.root}fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${o.root}assets/site.css?v=${o.v}">
<script>document.documentElement.classList.add("js");if(matchMedia("(min-width: 900px) and (prefers-reduced-motion: no-preference)").matches&&!(navigator.connection&&navigator.connection.saveData))document.documentElement.classList.add("autoplay");</script>
<script type="module" src="${o.root}assets/site.js?v=${o.v}"></script>
</head>`;

const isCurrent = (o, href) => (href ? o.path.startsWith(href) : o.path === "");
const cur = (o, href) => (isCurrent(o, href) ? ' aria-current="page"' : "");

const solMenu = (c, o) => `<div class="menu-panel" id="menu-soluciones">
  <ul>${c.solutions
    .map(
      (s) =>
        `<li><a href="${o.L}soluciones/${s.slug}/"${cur(o, `soluciones/${s.slug}/`)}><b>${esc(s.name)}</b><span>${esc(s.short)}</span></a></li>`,
    )
    .join("")}</ul>
  <a class="menu-all" href="${o.L}soluciones/">${esc(c.header.menuAll)} ${arrow}</a>
</div>`;

// 语言切换：顶栏里的“语言”标签，各语言的“语言”一词轮播；菜单里每种语言用它自己的名字
const globe = `<svg class="lang-globe" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9s1.3-6.2 3.9-9Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const langSwitch = (c, o) => {
  const reel = [o.lang, ...o.langs.filter((l) => l !== o.lang)];
  return `<div class="lang" data-lang>
    <button class="lang-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="lang-menu" aria-label="${esc(reel.map((l) => l.word).join(" · "))}" data-lang-btn>
      ${globe}<span class="lang-word" aria-hidden="true"><span class="lang-reel" style="--n:${reel.length}">${reel.map((l) => `<span lang="${l.hreflang}">${esc(l.word)}</span>`).join("")}<span lang="${o.lang.hreflang}">${esc(o.lang.word)}</span></span></span><span class="lang-code" aria-hidden="true">${o.lang.code.toUpperCase()}</span>
    </button>
    <div class="lang-menu" id="lang-menu" hidden data-lang-menu>
      <p class="lang-menu-t">${esc(c.ui.langMenu)}</p>
      <ul>${o.langs
        .map(
          (l) =>
            `<li><a href="${o.root}${o.alt(l)}" hreflang="${l.hreflang}" lang="${l.hreflang}" data-set-lang="${l.code}" data-suggest="${esc(l.suggest)}" data-close="${esc(l.close)}"${l === o.lang ? ' aria-current="true"' : ""}><span>${esc(l.name)}</span><small>${l.code.toUpperCase()}</small></a></li>`,
        )
        .join("")}</ul>
    </div>
  </div>`;
};

const topbar = (c, o) => `<a class="skip" href="#contenido">${esc(c.ui.skip)}</a>
<header class="topbar" data-topbar>
  <div class="topbar-in wrap">
    <a class="brand" href="${o.L}" aria-label="${esc(c.brand.name)}, ${esc(c.ui.home)}">${mark(26)}<span>${esc(c.brand.name)}</span></a>
    <nav class="topnav" aria-label="${esc(c.ui.navMain)}" data-nav>
      <ul class="topnav-list">${c.header.nav
        .map((n) =>
          n.menu
            ? `<li class="has-menu" data-menu><a class="topnav-link" href="${o.L}${esc(n.href)}"${cur(o, n.href)} aria-haspopup="true" aria-expanded="false" aria-controls="menu-${esc(n.menu)}">${esc(n.label)} <span class="caret" aria-hidden="true"></span></a>${solMenu(c, o)}</li>`
            : `<li><a class="topnav-link" href="${o.L}${esc(n.href)}"${cur(o, n.href)}>${esc(n.label)}</a></li>`,
        )
        .join("")}</ul>
      <div class="topnav-actions">
        <a class="link-login" ${acct(o, "login")} data-panel-label="${esc(c.ui.panel)}">${esc(c.header.login)}</a>
        <a class="btn btn-primary btn-sm" ${acct(o, "register")}>${esc(c.header.cta)}</a>
      </div>
    </nav>
    ${langSwitch(c, o)}
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav-mobile" data-menu-btn><span class="burger" aria-hidden="true"></span><span class="sr">${esc(c.header.menuOpen)}</span></button>
  </div>
  <div class="nav-mobile" id="nav-mobile" hidden data-nav-mobile>
    <div class="wrap">
      <ul>${c.header.nav
        .map((n) =>
          n.menu
            ? `<li><a href="${o.L}${esc(n.href)}">${esc(n.label)}</a><ul class="sub">${c.solutions
                .map((s) => `<li><a href="${o.L}soluciones/${s.slug}/">${esc(s.name)}</a></li>`)
                .join("")}</ul></li>`
            : `<li><a href="${o.L}${esc(n.href)}">${esc(n.label)}</a></li>`,
        )
        .join("")}</ul>
      <div class="nav-mobile-actions">
        <a class="btn btn-primary btn-lg btn-block" ${acct(o, "register")}>${esc(c.home.hero.ctaPrimary)}</a>
        <a class="btn btn-ghost btn-lg btn-block" ${acct(o, "login")} data-panel-label="${esc(c.ui.panel)}">${esc(c.header.login)}</a>
      </div>
    </div>
  </div>
</header>`;

const footer = (c, o) => `<footer class="foot">
  <div class="wrap foot-in">
    <div class="foot-brand">
      <a class="brand brand-inv" href="${o.L}">${mark(26)}<span>${esc(c.brand.name)}</span></a>
      <p>${esc(c.footer.tagline)}</p>
      <p class="foot-contact"><a href="${waHref(c)}" target="_blank" rel="noopener">${waIcon}${esc(c.contact.whatsappLabel)}</a><a href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a></p>
    </div>
    ${c.footer.groups
      .map(
        (g) => `<nav class="foot-col" aria-label="${esc(g.title)}"><p class="foot-h">${esc(g.title)}</p>${g.links
          .map((l) => (l.console ? `<a ${acct(o, l.console)}>${esc(l.label)}</a>` : `<a href="${o.L}${esc(l.href)}">${esc(l.label)}</a>`))
          .join("")}</nav>`,
      )
      .join("")}
  </div>
  <div class="wrap foot-base">
    <span>${esc(c.footer.rights)} ${esc(c.contact.company)} · ${esc(c.contact.city)}</span>
    <span class="foot-legal">${c.footer.legal.map((l) => `<a href="${o.L}${esc(l.href)}">${esc(l.label)}</a>`).join("")}</span>
    <span class="powered">${esc(c.brand.poweredBy)}</span>
  </div>
</footer>
<a class="wa-float" href="${waHref(c)}" target="_blank" rel="noopener" aria-label="${esc(c.final.whatsapp)}" data-wa-float>${waIcon}</a>`;

// 页面外壳
const page = (c, o, meta, body, cls = "") => `${head(c, o, meta)}
<body class="${cls}">
${topbar(c, o)}
<main id="contenido">
${body}
</main>
${footer(c, o)}
</body>
</html>
`;

// —— 通用块 ——
const label = (t) => `<p class="eyebrow">${esc(t)}</p>`;
const sectionHead = (lbl, title, intro, id, cls = "") => `<div class="sec-head ${cls}">
  ${lbl ? label(lbl) : ""}
  <h2 id="${id}">${rich(title)}</h2>
  ${intro ? `<p class="sec-intro">${esc(intro)}</p>` : ""}
</div>`;
const more = (href, text) => `<a class="more" href="${href}">${esc(text)} ${arrow}</a>`;
const pageHero = (eyebrow, title, lead, extra = "") => `<section class="page-hero">
  <div class="wrap">
    ${eyebrow ? label(eyebrow) : ""}
    <h1>${rich(title)}</h1>
    ${lead ? `<p class="lead">${esc(lead)}</p>` : ""}
    ${extra}
  </div>
</section>`;

const finalCta = (c, o) => `<section class="final" aria-labelledby="t-final">
  <div class="wrap final-in">
    <h2 id="t-final">${rich(c.final.title)}</h2>
    <p>${esc(c.final.text)}</p>
    <div class="cta-row">
      <a class="btn btn-primary btn-lg" ${acct(o, "register")}>${esc(c.final.cta)}</a>
      <a class="btn btn-wa btn-lg" href="${waHref(c)}" target="_blank" rel="noopener">${waIcon}${esc(c.final.whatsapp)}</a>
    </div>
  </div>
</section>`;

// 手机外框里的真实观看页截图
const phone = (src, alt, cls = "", video = "") => `<div class="phone ${cls}"><div class="phone-screen"><img src="${src}" alt="${esc(alt)}" width="390" height="844" loading="lazy" decoding="async">${
  video ? `<video class="phone-video" muted loop playsinline preload="none" data-inview-video aria-hidden="true"><source src="${video}" type="video/mp4"></video>` : ""
}</div></div>`;
// 控制台截图的语言版本：中英日韩用控制台对应界面语言截的图（img/consola-*-<代码>.webp），
// 控制台没有葡、法、德界面，这三种用英文版。各语言按钮位置略有不同，截图上的光标跟着调整
const SHOT = { zh: "zh", en: "en", ja: "ja", ko: "ko", pt: "en", fr: "en", de: "en" };
const SHOT_CURSOR = {
  "consola-reemplazar": { zh: [42, 75], en: [44, 78], ja: [46, 75], ko: [44, 75] },
  "consola-privacidad": { zh: [28, 29], en: [39, 31], ja: [30, 29], ko: [30, 30] },
};
const shot = (o, img) => {
  const m = /^img\/(consola-[a-z]+)\.webp$/.exec(img);
  return m && SHOT[o.lang.code] ? `img/${m[1]}-${SHOT[o.lang.code]}.webp` : img;
};
const shotCursor = (o, img, cur) => {
  const m = /consola-[a-z]+/.exec(img);
  const v = m && SHOT_CURSOR[m[0]] && SHOT_CURSOR[m[0]][SHOT[o.lang.code]];
  return cur && v ? { ...cur, x: v[0], y: v[1] } : cur;
};
// 浏览器外框里的控制台截图
const cursorSvg = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M5 3l14 8-6.2 1.4L16 20l-2.6 1.2-3.3-7.4L5 18z" fill="#141210" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const screen = (src, alt, cls = "", cur = null) => `<div class="screen ${cls}"${cur ? " data-cursor" : ""}><span class="screen-bar" aria-hidden="true"><i></i><i></i><i></i></span><div class="screen-body"><img src="${src}" alt="${esc(alt)}" width="1440" height="900" loading="lazy" decoding="async">${
  cur ? `<span class="cursor${cur.x > 60 ? " cursor-flip" : ""}" style="--x:${cur.x}%;--y:${cur.y}%" aria-hidden="true"><span class="cursor-ring"></span>${cursorSvg}<span class="cursor-tip">${esc(cur.tip)}</span></span>` : ""
}</div></div>`;

// 示例卡：真实观看页截图 + 可扫二维码
const exampleCard = (c, o, ex, { big = false } = {}) => {
  const sol = c.solutions.find((s) => s.slug === ex.solution);
  const href = exampleHref(ex, o);
  return `<article class="ex-card${big ? " ex-card-big" : ""}">
    ${phone(o.root + ex.shot, c.ui.phoneAlt.replace("{title}", ex.title), "ex-phone", `${o.root}video/demo-${ex.id}.mp4`)}
    <div class="ex-body">
      <p class="ex-sol">${esc(sol ? sol.name : "")} · ${esc(ex.place)}</p>
      <h3>${esc(ex.title)}</h3>
      <p>${esc(ex.text)}</p>
      <div class="ex-scan">
        <a class="ex-qr" ${exampleAttrs(ex, o)} data-qr-for data-scanline target="_blank" rel="noopener" aria-label="${esc(c.examplesPage.open)}: ${esc(ex.title)}">${o.qr(ex.vid ? href : o.origin + o.base + (ex.fallback || "ejemplo/"))}</a>
        <div><p class="ex-scan-t">${esc(c.examplesPage.scan)}</p><a class="more" ${exampleAttrs(ex, o)} target="_blank" rel="noopener">${esc(c.examplesPage.open)} ${arrow}</a></div>
      </div>
    </div>
  </article>`;
};

// —— 首页 ——
const homeHero = (c, o) => {
  const h = c.home.hero;
  const e = h.endCard;
  return `<section class="hero" aria-labelledby="hero-title">
  <div class="hero-grid">
    <div class="hero-copy">
      ${label(h.kicker)}
      <h1 id="hero-title">${rich(h.title)}</h1>
      <p class="lead">${esc(h.lead)}</p>
      <div class="cta-row">
        <a class="btn btn-primary btn-lg" ${acct(o, "register")}>${esc(h.ctaPrimary)}</a>
        <a class="btn btn-ghost btn-lg" href="${o.L}ejemplos/">${esc(h.ctaSecondary)}</a>
      </div>
      <p class="cta-note">${esc(h.note)}</p>
      <p class="cta-note"><a class="wa-link" href="${waHref(c)}" target="_blank" rel="noopener">${waIcon}${esc(h.waLink)}</a></p>
    </div>
    <figure class="hero-film">
      <div class="stage" data-stage data-state="end">
        <div class="stage-inner">
          <video class="stage-film" muted playsinline preload="none" poster="${o.root}img/film-poster.webp" aria-label="${esc(c.ui.filmAria)}: ${esc(h.filmCaption)}">
            <source src="${o.root}video/qrveo-hero.mp4" type="video/mp4">
          </video>
          <div class="endcard" data-endcard>
            <img class="ec-photo" src="${o.root}img/mesa.webp" alt="" width="1536" height="1024" decoding="async">
            <span class="ec-boxlabel">${esc(e.boxLabel)}</span>
            ${sticker(c, o, { cls: "ec-sticker", href: exampleHref(c.examples[0], o), vid: c.examples[0].vid, label: c.ui.openDemo })}
            <p class="ec-title">${esc(e.line1)}<br>${esc(e.line2)}</p>
            <div class="ec-side">
              <span class="ec-logo">${mark(70, "ec-mark")}<span>${esc(c.brand.name)}</span></span>
              <a class="ec-cta" ${acct(o, "register")}>${esc(e.cta1)}<br>${esc(e.cta2)}</a>
              <div class="ec-info"><div class="ec-site">${esc(e.site)}</div><div class="ec-notes">${esc(e.note1)}<br>${esc(e.note2)}</div></div>
            </div>
            <p class="ec-hint" aria-hidden="true"><span class="hint-scan">${esc(h.scanHint)}</span><span class="hint-tap">${esc(h.tapHint)}</span> <span class="ec-arrow">→</span></p>
          </div>
        </div>
      </div>
      <div class="stage-controls">
        <button class="stage-btn stage-play" type="button" data-play><span class="tri" aria-hidden="true"></span>${esc(h.playFilm)} <span class="stage-len">${esc(h.filmLength)}</span></button>
        <button class="stage-btn stage-replay" type="button" data-replay><span aria-hidden="true">↺</span> ${esc(h.replay)}</button>
        <button class="stage-btn stage-skip" type="button" data-skip>${esc(h.skip)} <span aria-hidden="true">→</span></button>
      </div>
      <figcaption class="film-cap">${esc(h.filmCaption)}</figcaption>
    </figure>
  </div>
  <div class="wrap">
    <ul class="proof" aria-label="${esc(c.ui.proof)}">${c.home.proof.map((p) => `<li><b>${esc(p.k)}</b><span>${esc(p.v)}</span></li>`).join("")}</ul>
  </div>
</section>`;
};

const solutionCards = (c, o) => `<ul class="sol-grid">${c.solutions
  .map(
    (s) => `<li><a class="sol-card" href="${o.L}soluciones/${s.slug}/">
      <span class="sol-img"><img src="${o.root}${esc(s.img)}" alt="${esc(s.alt)}" width="800" height="600" loading="lazy" decoding="async"><video muted loop playsinline preload="none" data-hover-video aria-hidden="true"><source src="${o.root}${esc(s.clip)}" type="video/mp4"></video></span>
      <span class="sol-txt"><b>${esc(s.name)}</b><span>${esc(s.short)}</span><span class="sol-who">${esc(s.who)}</span><span class="more">${esc(c.home.uses.more)} ${arrow}</span></span>
    </a></li>`,
  )
  .join("")}</ul>`;

const howSteps = (c, o) => `<ol class="how">${c.home.how.items
  .map(
    (s, i) => `<li class="how-step">
      <div class="how-img">${i < 2 ? screen(o.root + shot(o, s.img), s.alt, "screen-sm") : `<img src="${o.root}${esc(s.img)}" alt="${esc(s.alt)}" width="860" height="600" loading="lazy" decoding="async">`}</div>
      <p class="how-n">${i + 1}</p>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.text)}</p>
    </li>`,
  )
  .join("")}</ol>`;

const replaceBlock = (r, o, id = "t-replace") => `<section class="sec sec-dark" aria-labelledby="${id}">
  <div class="wrap split split-media-right">
    <div class="split-txt">
      ${label(r.label)}
      <h2 id="${id}">${rich(r.title)}</h2>
      <p class="sec-intro">${esc(r.text)}</p>
      <ul class="ticks">${r.points.map((p) => `<li>${check}${esc(p)}</li>`).join("")}</ul>
    </div>
    <div class="split-media">${screen(o.root + shot(o, r.img), r.alt)}</div>
  </div>
</section>`;

const faqList = (items) => `<dl class="faq">${items
  .map((f) => `<div class="faq-row" id="${esc(f.id)}"><dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd></div>`)
  .join("")}</dl>`;
const allFaq = (c) => c.help.groups.flatMap((g) => g.items);

export const pageHome = (c, o) => {
  const H = c.home;
  const faqs = H.faq.pick.map((id) => allFaq(c).find((f) => f.id === id)).filter(Boolean);
  return page(
    c,
    o,
    { title: c.meta.title, description: c.meta.description },
    `${homeHero(c, o)}

<section class="sec" aria-labelledby="t-uses">
  <div class="wrap">
    ${sectionHead(H.uses.label, H.uses.title, H.uses.intro, "t-uses")}
    ${solutionCards(c, o)}
  </div>
</section>

<section class="sec sec-alt" aria-labelledby="t-how">
  <div class="wrap">
    ${sectionHead(H.how.label, H.how.title, H.how.intro, "t-how")}
    ${howSteps(c, o)}
    <p class="sec-more">${more(`${o.L}funciones/`, H.how.more)}</p>
  </div>
</section>

${replaceBlock(H.replace, o)}

<section class="sec" aria-labelledby="t-ex">
  <div class="wrap">
    ${sectionHead(H.example.label, H.example.title, H.example.intro, "t-ex")}
    <div class="ex-row">${c.examples.slice(1, 3).map((ex) => exampleCard(c, o, ex)).join("")}</div>
    <p class="sec-more">${more(`${o.L}ejemplos/`, H.example.more)}</p>
  </div>
</section>

<section class="sec sec-alt" aria-labelledby="t-panel">
  <div class="wrap split">
    <div class="split-txt">
      ${label(H.panel.label)}
      <h2 id="t-panel">${rich(H.panel.title)}</h2>
      <p class="sec-intro">${esc(H.panel.intro)}</p>
      <dl class="kv">${H.panel.points.map((p) => `<div><dt>${esc(p.k)}</dt><dd>${esc(p.v)}</dd></div>`).join("")}</dl>
    </div>
    <div class="split-media">${screen(o.root + shot(o, H.panel.img), H.panel.alt)}</div>
  </div>
</section>

<section class="sec" aria-labelledby="t-price">
  <div class="wrap price-teaser">
    <div>
      ${label(H.pricing.label)}
      <h2 id="t-price">${rich(H.pricing.title)}</h2>
      <p class="sec-intro">${esc(H.pricing.text)}</p>
    </div>
    <div class="price-box">
      <p class="price-from">${esc(H.pricing.from)}</p>
      <p class="price-big">${esc(H.pricing.fromPrice)}</p>
      <a class="btn btn-ink btn-lg" href="${o.L}precios/">${esc(H.pricing.cta)}</a>
    </div>
  </div>
</section>

<section class="sec sec-alt" aria-labelledby="t-faq">
  <div class="wrap faq-wrap">
    ${sectionHead(H.faq.label, H.faq.title, "", "t-faq")}
    <div>${faqList(faqs)}<p class="sec-more">${more(`${o.L}ayuda/`, H.faq.more)}</p></div>
  </div>
</section>

${finalCta(c, o)}`,
    "page-home",
  );
};

// —— 解决方案 ——
export const pageSolutions = (c, o) =>
  page(
    c,
    o,
    { title: `${c.solutionsPage.seoTitle} · ${c.brand.name}`, description: c.solutionsPage.lead },
    `${pageHero("", c.solutionsPage.title, c.solutionsPage.lead)}
<section class="sec sec-tight">
  <div class="wrap">
    ${solutionCards(c, o)}
    <p class="note-box">${esc(c.solutionsPage.other)} <a href="${o.L}contacto/">${esc(c.ui.contact)} ${arrow}</a></p>
  </div>
</section>
${finalCta(c, o)}`,
    "page-solutions",
  );

export const pageSolution = (c, o, s) => {
  const ex = c.examples.find((e) => e.id === s.exampleId);
  const others = c.solutions.filter((x) => x.slug !== s.slug);
  return page(
    c,
    o,
    { title: `${s.name} · ${c.brand.name}`, description: s.lead },
    `<section class="sol-hero">
  <div class="wrap split">
    <div class="split-txt">
      <p class="crumbs"><a href="${o.L}soluciones/">${esc(c.solutionsPage.title)}</a> / ${esc(s.name)}</p>
      <h1>${rich(s.title)}</h1>
      <p class="lead">${esc(s.lead)}</p>
      <p class="sol-who-big">${esc(s.who)}</p>
      <div class="cta-row">
        <a class="btn btn-primary btn-lg" ${acct(o, "register")}>${esc(c.home.hero.ctaPrimary)}</a>
        ${ex ? `<a class="btn btn-ghost btn-lg" href="#ejemplo">${esc(c.home.hero.ctaSecondary)}</a>` : ""}
      </div>
    </div>
    <div class="split-media"><div class="photo-wrap"><video class="photo" muted loop playsinline autoplay preload="metadata" poster="${o.root}${esc(s.img)}" data-inview-video aria-label="${esc(s.alt)}"><source src="${o.root}${esc(s.clip)}" type="video/mp4"></video></div></div>
  </div>
</section>

<section class="sec" aria-labelledby="t-pains">
  <div class="wrap pains-wrap">
    <div class="chat" data-chat aria-hidden="true">
      <div class="chat-top"><span class="chat-av">${esc(s.chatName.slice(0, 1))}</span><div><b>${esc(s.chatName)}</b><span>${esc(c.ui.online)}</span></div></div>
      <div class="chat-body">${s.chat.map((m, i) => `<p class="bubble" style="--i:${i}">${esc(m)}<span class="bubble-t">${9 + i}:${String(12 + i * 7).padStart(2, "0")}</span></p>`).join("")}<p class="typing" style="--i:${s.chat.length}"><i></i><i></i><i></i></p></div>
    </div>
    <div>
      ${sectionHead("", c.solutionsPage.chatTitle, "", "t-pains")}
      <ul class="pains">${s.pains.map((p) => `<li><h3>${esc(p.k)}</h3><p>${esc(p.v)}</p></li>`).join("")}</ul>
    </div>
  </div>
</section>

<section class="sec sec-alt" aria-labelledby="t-uses">
  <div class="wrap split split-top">
    <div class="split-txt">
      <h2 id="t-uses">${esc(s.usesTitle)}</h2>
      <ul class="ticks ticks-lg">${s.uses.map((u) => `<li>${check}${esc(u)}</li>`).join("")}</ul>
    </div>
    <div class="split-txt">
      <h2>${esc(s.featuresTitle)}</h2>
      <dl class="kv">${s.features.map((f) => `<div><dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd></div>`).join("")}</dl>
      ${s.note ? `<p class="fine">${esc(s.note)}</p>` : ""}
    </div>
  </div>
</section>

${
  ex
    ? `<section class="sec" id="ejemplo" aria-labelledby="t-ex">
  <div class="wrap">
    ${sectionHead(c.home.example.label, c.home.example.title, c.home.example.intro, "t-ex")}
    ${exampleCard(c, o, ex, { big: true })}
  </div>
</section>`
    : ""
}

<section class="sec sec-alt" aria-labelledby="t-others">
  <div class="wrap">
    ${sectionHead("", c.ui.others, "", "t-others")}
    <ul class="other-sols">${others
      .map((x) => `<li><a href="${o.L}soluciones/${x.slug}/"><b>${esc(x.name)}</b><span>${esc(x.short)}</span>${arrow}</a></li>`)
      .join("")}</ul>
  </div>
</section>

${finalCta(c, o)}`,
    "page-solution",
  );
};

// 功能页首屏小部件：同一张二维码，右边的视频封面轮换
const swapDemo = (w, o, c) => `<figure class="swap" data-swap aria-label="${esc(w.note)}">
  <div class="swap-qr">${sticker(c, o, { cls: "swap-sticker" })}<span class="swap-qr-cap">${esc(w.qrCaption)}</span></div>
  <div class="swap-link" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="swap-stack">${w.items
    .map(
      (it, i) => `<div class="swap-item${i ? "" : " is-on"}"><img src="${o.root}${esc(it.img)}" alt="" width="640" height="360" decoding="async"><p><span>${esc(it.label)}</span>${esc(it.title)}</p></div>`,
    )
    .join("")}<div class="swap-dots" aria-hidden="true">${w.items.map((_, i) => `<i${i ? "" : ' class="is-on"'}></i>`).join("")}</div></div>
  <figcaption>${esc(w.note)}</figcaption>
</figure>`;

// —— 功能 ——
export const pageFeatures = (c, o) => {
  const F = c.features;
  return page(
    c,
    o,
    { title: `${F.seoTitle} · ${c.brand.name}`, description: F.lead },
    `<section class="page-hero">
  <div class="wrap split">
    <div class="split-txt">
      <h1>${rich(F.title)}</h1>
      <p class="lead">${esc(F.lead)}</p>
      <nav class="chips" aria-label="${esc(c.ui.onPage)}" data-chips>${F.blocks.map((b, i) => `<a href="#f-${i + 1}">${esc(b.label)}</a>`).join("")}</nav>
    </div>
    <div class="split-media">${swapDemo(F.swap, o, c)}</div>
  </div>
</section>
${F.blocks
  .map(
    (b, i) => `<section class="sec feat${i % 2 ? " sec-alt" : ""}" id="f-${i + 1}" aria-labelledby="t-f${i + 1}">
  <div class="wrap split${i % 2 ? " split-media-left" : ""}">
    <div class="split-txt">
      ${label(b.label)}
      <h2 id="t-f${i + 1}">${rich(b.title)}</h2>
      <p class="sec-intro">${esc(b.text)}</p>
      <ul class="ticks">${b.points.map((p) => `<li>${check}${esc(p)}</li>`).join("")}</ul>
    </div>
    <div class="split-media">${b.phone ? phone(o.root + b.img, b.alt, "phone-feature", `${o.root}video/demo-${c.examples[0].id}.mp4`) : screen(o.root + shot(o, b.img), b.alt, "", shotCursor(o, b.img, b.cursor))}</div>
  </div>
</section>`,
  )
  .join("\n")}
<section class="sec" aria-labelledby="t-more">
  <div class="wrap">
    ${sectionHead("", F.more.title, "", "t-more")}
    <dl class="grid-kv">${F.more.items.map((m) => `<div><dt>${esc(m.k)}</dt><dd>${esc(m.v)}</dd></div>`).join("")}</dl>
  </div>
</section>
${finalCta(c, o)}`,
    "page-features",
  );
};

// —— 示例 ——
export const pageExamples = (c, o) =>
  page(
    c,
    o,
    { title: `${c.examplesPage.seoTitle} · ${c.brand.name}`, description: c.examplesPage.lead },
    `${pageHero("", c.examplesPage.title, c.examplesPage.lead)}
<section class="sec sec-tight">
  <div class="wrap">
    <div class="ex-grid">${c.examples.map((ex) => exampleCard(c, o, ex)).join("")}</div>
    ${c.examplesPage.note ? `<p class="fine">${esc(c.examplesPage.note)}</p>` : ""}
  </div>
</section>
${finalCta(c, o)}`,
    "page-examples",
  );

// —— 价格 ——
export const pagePricing = (c, o) => {
  const P = c.pricing;
  return page(
    c,
    o,
    { title: `${P.seoTitle} · ${c.brand.name}`, description: P.lead },
    `${pageHero("", P.title, P.lead)}
<section class="sec sec-tight" aria-label="${esc(c.ui.plans)}">
  <div class="wrap">
    <div class="plans">${P.plans
      .map(
        (pl) => `<article class="plan${pl.badge ? " plan-featured" : ""}" data-plan-id="${esc(pl.id)}" aria-labelledby="plan-${esc(pl.id)}">
        ${pl.badge ? `<p class="plan-badge">${esc(pl.badge)}</p>` : ""}
        <h2 class="plan-name" id="plan-${esc(pl.id)}">${esc(pl.name)}</h2>
        <p class="plan-for">${esc(pl.for)}</p>
        <p class="plan-price"><b>${esc(pl.price)}</b> <span>${esc(pl.unit)}</span></p>
        <p class="plan-monthly">${esc(pl.monthly)}</p>
        <a class="btn ${pl.badge ? "btn-primary" : "btn-ghost"} btn-block" ${acct(o, pl.action || "register")}>${esc(pl.cta)}</a>
        <ul class="plan-keys">${P.rows
          .slice(0, 3)
          .map((r) => `<li><span>${esc(r.k)}</span><b>${esc(r.v[P.plans.indexOf(pl)])}</b></li>`)
          .join("")}</ul>
      </article>`,
      )
      .join("")}</div>
  </div>
</section>

<section class="sec sec-tight" aria-labelledby="t-est">
  <div class="wrap">
    <div class="est" data-estimator data-results="${esc(JSON.stringify(P.estimator.results))}">
      <div class="est-q">
        <h2 id="t-est">${esc(P.estimator.title)}</h2>
        <label for="est-range">${esc(P.estimator.q)}</label>
      </div>
      <div class="est-ctrl">
        <p class="est-val"><b data-est-n>2,000</b> <span>${esc(P.estimator.unit)}</span></p>
        <input id="est-range" type="range" min="0" max="100" value="40" step="1" data-est-range aria-describedby="est-out">
        <div class="est-scale" aria-hidden="true"><span>100</span><span>1,000</span><span>10,000</span><span>100,000</span></div>
        <p class="est-out" id="est-out" aria-live="polite" data-est-out></p>
        <p class="fine">${esc(P.estimator.note)}</p>
      </div>
    </div>
  </div>
</section>

<section class="sec sec-alt" aria-labelledby="t-compare">
  <div class="wrap">
    ${sectionHead("", P.compareTitle, "", "t-compare")}
    <div class="table-wrap" tabindex="0" role="region" aria-labelledby="t-compare">
      <table class="compare">
        <thead><tr><th scope="col"><span class="sr">${esc(c.ui.feature)}</span></th>${P.plans.map((pl) => `<th scope="col">${esc(pl.name)}</th>`).join("")}</tr></thead>
        <tbody>${P.rows
          .map((r) => `<tr><th scope="row">${esc(r.k)}</th>${r.v.map((v) => `<td>${v === "Sí" || v === c.ui.yes ? `${check}<span class="sr">${esc(c.ui.yes)}</span>` : esc(v)}</td>`).join("")}</tr>`)
          .join("")}</tbody>
        <tfoot><tr><td></td>${P.plans.map((pl) => `<td><a class="more" ${acct(o, pl.action || "register")}>${esc(pl.cta)} ${arrow}</a></td>`).join("")}</tr></tfoot>
      </table>
    </div>
    <p class="fine">${esc(P.estimate)}</p>
  </div>
</section>

<section class="sec" aria-labelledby="t-terms">
  <div class="wrap">
    ${sectionHead("", c.ui.termsTitle, "", "t-terms")}
    <dl class="grid-kv grid-kv-2">${P.terms.map((t) => `<div><dt>${esc(t.k)}</dt><dd>${esc(t.v)}</dd></div>`).join("")}</dl>
    <aside class="note-box note-box-row">
      <div><h3>${esc(P.enterprise.title)}</h3><p>${esc(P.enterprise.text)}</p></div>
      <a class="btn btn-ink" href="${waHref(c, c.ui.enterpriseWa)}" target="_blank" rel="noopener">${esc(P.enterprise.cta)}</a>
    </aside>
  </div>
</section>
${finalCta(c, o)}`,
    "page-pricing",
  );
};

// —— 帮助 ——
export const pageHelp = (c, o) =>
  page(
    c,
    o,
    { title: `${c.help.seoTitle} · ${c.brand.name}`, description: c.help.lead },
    `${pageHero("", c.help.title, c.help.lead)}
<section class="sec sec-tight">
  <div class="wrap help-layout">
    <nav class="help-nav" aria-label="${esc(c.ui.topics)}" data-help-nav>
      <p class="help-nav-t">${esc(c.ui.topics)}</p>
      ${c.help.groups.map((g, i) => `<a href="#g-${i + 1}">${esc(g.title)}<span>${g.items.length}</span></a>`).join("")}
      <a class="help-nav-wa" href="${waHref(c)}" target="_blank" rel="noopener">${waIcon}${esc(c.final.whatsapp)}</a>
    </nav>
    <div class="help" data-help>
      <label class="help-search"><span>${esc(c.help.searchLabel)}</span><input type="search" placeholder="${esc(c.help.searchPlaceholder)}" data-help-q autocomplete="off"></label>
      <p class="help-empty" data-help-empty hidden>${esc(c.help.empty)}</p>
      ${c.help.groups
        .map(
          (g, i) => `<section class="help-group" id="g-${i + 1}" aria-labelledby="t-g${i + 1}"><h2 id="t-g${i + 1}">${esc(g.title)}</h2>${g.items
            .map((f) => `<details class="qa" id="${esc(f.id)}"><summary>${esc(f.q)}<span class="qa-plus" aria-hidden="true"></span></summary><p>${esc(f.a)}</p></details>`)
            .join("")}</section>`,
        )
        .join("")}
      <aside class="note-box note-box-row">
        <div><h3>${esc(c.ui.notFound)}</h3><p>${esc(c.contact.hours)}.</p></div>
        <a class="btn btn-wa" href="${waHref(c)}" target="_blank" rel="noopener">${waIcon}${esc(c.final.whatsapp)}</a>
      </aside>
    </div>
  </div>
</section>`,
    "page-help",
  );

// —— 联系 ——
export const pageContact = (c, o) => {
  const K = c.contactPage;
  const f = K.fields;
  return page(
    c,
    o,
    { title: `${K.seoTitle}`, description: K.lead },
    `${pageHero(c.ui.contact, K.title, K.lead)}
<section class="sec sec-tight">
  <div class="wrap contact">
    <form class="contact-form" data-wa-form data-wa="${esc(c.contact.whatsapp)}" data-hello="${esc(c.ui.waHello)}" data-hello-co="${esc(c.ui.waHelloCo)}" data-use="${esc(c.ui.waUse)}" data-name-ph="${esc(c.ui.waNamePh)}" novalidate>
      <h2>${esc(K.formTitle)}</h2>
      <label>${esc(f.name)}<input name="name" autocomplete="name" required maxlength="80"></label>
      <label>${esc(f.company)}<input name="company" autocomplete="organization" maxlength="120"></label>
      <label>${esc(f.use)}<select name="use">${K.useOptions.map((u) => `<option>${esc(u)}</option>`).join("")}</select></label>
      <label>${esc(f.message)}<textarea name="message" rows="4" maxlength="800"></textarea></label>
      <p class="form-err" role="alert" data-form-err hidden>${esc(c.ui.nameRequired)}</p>
      <button class="btn btn-primary btn-lg" type="submit">${waIcon}${esc(K.send)}</button>
      <p class="fine">${esc(K.formNote)}</p>
    </form>
    <div class="contact-side">
      <div class="wa-preview" aria-hidden="true">
        <p class="wa-preview-t">${esc(K.previewTitle)}</p>
        <div class="wa-chat">
          <div class="wa-top"><span class="chat-av">${esc(K.previewName.slice(0, 1))}</span><div><b>${esc(K.previewName)}</b><span>${esc(c.contact.whatsappLabel)}</span></div></div>
          <div class="wa-body"><p class="wa-msg" data-wa-preview></p></div>
        </div>
      </div>
      <h2>${esc(K.channels)}</h2>
      <dl class="kv">
        <div><dt>${esc(c.ui.whatsapp)}</dt><dd><a href="${waHref(c)}" target="_blank" rel="noopener">${esc(c.contact.whatsappLabel)}</a></dd></div>
        <div><dt>${esc(c.ui.email)}</dt><dd><a href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a></dd></div>
        <div><dt>${esc(c.ui.hours)}</dt><dd>${esc(c.contact.hours)}</dd></div>
      </dl>
      <h2>${esc(K.company)}</h2>
      <dl class="kv">
        <div><dt>${esc(c.ui.company)}</dt><dd>${esc(c.contact.company)}</dd></div>
        ${c.contact.rfc ? `<div><dt>RFC</dt><dd>${esc(c.contact.rfc)}</dd></div>` : ""}
        ${c.contact.address ? `<div><dt>${esc(c.ui.address)}</dt><dd>${esc(c.contact.address)}</dd></div>` : ""}
        <div><dt>${esc(c.ui.city)}</dt><dd>${esc(c.contact.city)}</dd></div>
      </dl>
    </div>
  </div>
</section>`,
    "page-contact",
  );
};

// —— 关于我们 ——
export const pageAbout = (c, o) =>
  page(
    c,
    o,
    { title: c.about.seoTitle, description: c.about.lead },
    `${pageHero(c.ui.about, c.about.title, c.about.lead)}
<section class="sec sec-tight">
  <div class="wrap">
    <dl class="grid-kv">${c.about.blocks.map((b) => `<div><dt>${esc(b.k)}</dt><dd>${esc(b.v)}</dd></div>`).join("")}</dl>
  </div>
</section>
<section class="sec sec-alt" aria-labelledby="t-flow">
  <div class="wrap">
    ${sectionHead("", c.about.flowTitle, "", "t-flow")}
    <ol class="flow" data-flow>${c.about.flow.map((f, i) => `<li style="--i:${i}"><span class="flow-dot">${i + 1}</span><b>${esc(f.k)}</b><span>${esc(f.v)}</span></li>`).join("")}</ol>
  </div>
</section>
${finalCta(c, o)}`,
    "page-about",
  );

// —— 注册 / 登录 / 找回密码（官网自己的页面，背后调用后台 /auth 接口，与控制台的表单字段一致）——
const eye = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`;
const fld = (name, lbl, input, extra = "") => `<div class="fld" data-fld="${name}"><label for="a-${name}">${esc(lbl)}</label>${input}${extra}<p class="fld-err" id="e-${name}" data-err hidden></p></div>`;
const inp = (name, type, attrs = "") => `<input id="a-${name}" name="${name}" type="${type}" aria-describedby="e-${name}" ${attrs}>`;
const pwd = (A, auto) =>
  `<div class="fld-pw">${inp("password", "password", `autocomplete="${auto}" required minlength="8" maxlength="16"`)}<button class="pw-eye" type="button" data-pw-toggle aria-pressed="false" aria-label="${esc(A.register.show)}" data-show="${esc(A.register.show)}" data-hide="${esc(A.register.hide)}">${eye}</button></div>`;
const authSide = (c, o) => `<aside class="auth-side" aria-hidden="true">
      ${swapDemo(c.features.swap, o, c)}
      <p class="auth-side-t">${rich(c.auth.sideTitle)}</p>
      <ul class="ticks">${c.auth.sidePoints.map((p) => `<li>${check}${esc(p)}</li>`).join("")}</ul>
    </aside>`;
// 表单提示文字给 site.js 用
const authText = (c) =>
  `<script type="application/json" id="auth-text">${JSON.stringify({ ...c.auth.errors, codeWait: c.auth.register.codeWait, codeSent: c.auth.register.codeSent, regDone: c.auth.register.done, loginDone: c.auth.login.done, loggedOut: c.auth.login.loggedOut, sent: c.auth.recover.sent, copied: c.auth.recover.copied, copy: c.auth.recover.copy }).replace(/</g, "\\u003c")}</script>`;

export const pageAuth = (c, o, kind) => {
  const A = c.auth;
  const submit = (t) => `<button class="btn btn-primary btn-lg btn-block auth-submit" type="submit" data-busy="${esc(t.busy)}"><span>${esc(t.submit)}</span></button>`;
  const msg = `<p class="auth-msg" role="alert" data-auth-msg hidden></p>`;
  const email = fld("email", A.register.email, inp("email", "email", `autocomplete="email" required maxlength="120" placeholder="${esc(A.register.emailPh)}" inputmode="email"`));
  let main = "";
  if (kind === "register") {
    const R = A.register;
    const consent = esc(R.consent)
      .replace("{terms}", `<a href="${o.L}terminos/" target="_blank">${esc(R.terms)}</a>`)
      .replace("{privacy}", `<a href="${o.L}aviso-de-privacidad/" target="_blank">${esc(R.privacy)}</a>`);
    main = `<h1>${esc(R.title)}</h1>
      <p class="lead">${esc(R.lead)}</p>
      <form class="auth-form" data-auth-form="register" novalidate>
        ${fld("name", R.name, inp("name", "text", `autocomplete="organization" required maxlength="60" placeholder="${esc(R.namePh)}"`))}
        ${email}
        <div class="fld" data-fld="code" data-code-row hidden><label for="a-code">${esc(R.code)}</label><div class="fld-row">${inp("code", "text", 'autocomplete="one-time-code" inputmode="numeric" maxlength="8"')}<button class="btn btn-ghost" type="button" data-send-code>${esc(R.codeSend)}</button></div><p class="fld-err" id="e-code" data-err hidden></p></div>
        ${fld("password", R.password, pwd(A, "new-password"), `<p class="fld-hint">${esc(R.passwordHint)}</p>`)}
        <div class="fld fld-check" data-fld="consent"><label><input id="a-consent" name="consent" type="checkbox" required aria-describedby="e-consent"><span>${consent}</span></label><p class="fld-err" id="e-consent" data-err hidden></p></div>
        ${msg}
        ${submit(R)}
      </form>
      <p class="auth-alt">${esc(R.have)} <a ${acct(o, "login")}>${esc(R.loginLink)}</a></p>
      <p class="auth-plan">${esc(R.planQ)} <a href="${o.L}precios/">${esc(R.planLink)} ${arrow}</a></p>`;
  } else if (kind === "login") {
    const L = A.login;
    main = `<div class="auth-already" data-auth-already hidden>
        <h1>${esc(L.already)}</h1>
        <div class="cta-row"><a class="btn btn-primary btn-lg" href="${CONSOLE}${ROUTES.panel}" data-console="panel">${esc(L.goPanel)}</a><button class="btn btn-ghost btn-lg" type="button" data-logout>${esc(L.logout)}</button></div>
      </div>
      <div data-auth-fresh>
      <h1>${esc(L.title)}</h1>
      <p class="lead">${esc(L.lead)}</p>
      <form class="auth-form" data-auth-form="login" novalidate>
        ${email}
        ${fld("password", A.register.password, pwd(A, "current-password"))}
        <div class="fld" data-fld="captcha" data-captcha-row hidden><label for="a-captcha">${esc(L.captcha)}</label><div class="fld-row">${inp("captcha", "text", 'autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="8"')}<button class="captcha-img" type="button" data-captcha-new title="${esc(L.captchaNew)}" aria-label="${esc(L.captchaNew)}"><img alt="" width="120" height="44" data-captcha-img></button></div><p class="fld-err" id="e-captcha" data-err hidden></p></div>
        <p class="auth-forgot"><a ${acct(o, "recover")}>${esc(L.forgot)}</a></p>
        ${msg}
        ${submit(L)}
      </form>
      <p class="auth-alt">${esc(L.no)} <a ${acct(o, "register")}>${esc(L.registerLink)}</a></p>
      </div>`;
  } else {
    const V = A.recover;
    main = `<div data-recover-request>
      <h1>${esc(V.title)}</h1>
      <p class="lead">${esc(V.lead)}</p>
      <form class="auth-form" data-auth-form="recover" novalidate>
        ${email}
        ${msg}
        ${submit(V)}
      </form>
      </div>
      <div class="auth-reset" data-recover-reset hidden>
        <h1>${esc(V.resetTitle)}</h1>
        <p class="lead" data-reset-status>${esc(V.resetBusy)}</p>
        <div class="reset-pw" data-reset-box hidden><code data-reset-pw></code><button class="btn btn-ghost" type="button" data-copy>${esc(V.copy)}</button></div>
        <p class="lead" data-reset-done hidden>${esc(V.resetDone)}</p>
        <p class="lead auth-msg" data-reset-fail hidden>${esc(V.resetFail)}</p>
        <div class="cta-row"><a class="btn btn-primary btn-lg" ${acct(o, "login")}>${esc(c.auth.login.submit)}</a><a class="btn btn-ghost btn-lg" href="${o.L}${AUTH.recover}" data-reset-again hidden>${esc(V.again)}</a></div>
      </div>
      <p class="auth-alt"><a ${acct(o, "login")}>${arrow} ${esc(V.back)}</a></p>`;
  }
  const seo = { register: A.seoRegister, login: A.seoLogin, recover: A.seoRecover }[kind];
  return page(
    c,
    o,
    { title: `${seo} · ${c.brand.name}`, description: kind === "register" ? A.register.lead : kind === "login" ? A.login.lead : A.recover.lead, noindex: kind === "recover" },
    `<section class="auth" data-auth-page="${kind}">
  <div class="wrap auth-grid">
    <div class="auth-main">${main}</div>
    ${authSide(c, o)}
  </div>
</section>
${authText(c)}`,
    `page-auth page-${kind}`,
  );
};

// —— 法律页 ——
export const pageLegal = (c, o, { title, intro, sections }) =>
  page(
    c,
    o,
    { title: `${title} · ${c.brand.name}`, description: intro, noindex: true },
    `<article class="legal wrap" lang="es-MX">
  ${label(c.brand.name)}
  <h1>${esc(title)}</h1>
  <p class="lead">${esc(intro)}</p>
  ${o.lang.code === "es" ? "" : `<p class="note-box legal-note" lang="${o.lang.hreflang}">${esc(c.ui.legalNote)}</p>`}
  ${sections.map((s) => `<h2>${esc(s.h)}</h2>${s.p.map((t) => `<p>${esc(t)}</p>`).join("")}`).join("")}
</article>`,
    "page-legal",
  );
