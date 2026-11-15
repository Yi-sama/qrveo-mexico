// QRveo 官网的浏览器脚本：控制台链接、示例二维码、首屏短片、套餐选择、贴纸动画。
import qrcode from "./qrcode.mjs";
import { track } from "./analytics.mjs?v=__ANALYTICS_VERSION__";
import "./site-metrics.mjs?v=__SITE_METRICS_VERSION__";
import "./navigation-media.mjs?v=__NAVIGATION_VERSION__";

const RUNTIME = window.__VOD_PRIVATE__ || {};
const DEV = window.__QRVEO_DEV__ || {};
const ROUTES = { register: "/#/register", login: "/#/login", upgrade: "/#/secure/upgrade", panel: "/#/secure/overview" };
const LANG = (document.documentElement.lang || "es").slice(0, 2);
restoreLanguage();

// 1 · 控制台（升级付款、我的面板）：部署时由 private-runtime.js 提供地址（与旧官网同一约定）。注册 / 登录是官网自己的页面，见 16
const consoleOrigin = String(RUNTIME.consoleOrigin || "").replace(/\/$/, "");
if (consoleOrigin) {
  document.querySelectorAll("[data-console]").forEach((a) => {
    const route = ROUTES[a.dataset.console];
    if (route) a.href = consoleOrigin + route;
  });
}

// 2 · 示例二维码：按访问地址实时生成；本机预览时换成局域网地址，手机才能扫通
export function qrSvg(text, margin = 1) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const size = n + margin * 2;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  }
  return `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#141210"/></svg>`;
}

// 本机预览：127.0.0.1 换成局域网地址（端口不变），手机才能扫通
const isLocal = (h) => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(h);
function lanify(href) {
  const url = new URL(href, location.href);
  if (DEV.lanHost && isLocal(url.hostname)) url.hostname = DEV.lanHost;
  return url.href;
}

// 观看页（后台 front 服务）：部署时由 private-runtime.js 提供域名
const watchOrigin = String(RUNTIME.watchOrigin || "").replace(/\/$/, "");
document.querySelectorAll("a[data-watch]").forEach((a) => {
  if (watchOrigin) a.href = `${watchOrigin}/videos/${a.dataset.watch}`;
});

function demoUrl() {
  const fixed = document.querySelector('meta[name="qrveo-demo"]');
  if (fixed?.content) {
    const url = new URL(fixed.content, location.href);
    const videoPath = url.pathname.match(/\/videos\/[^/]+$/)?.[0];
    return lanify(fixed.dataset?.runtimeDemo !== undefined && videoPath && watchOrigin
      ? watchOrigin + videoPath + url.search + url.hash : fixed.content);
  }
  const link = document.querySelector("a[data-demo]");
  return lanify(link ? link.href : "ejemplo/");
}

const demo = demoUrl();
document.querySelectorAll("[data-qr]").forEach((el) => {
  el.innerHTML = qrSvg(el.dataset.qrUrl ? lanify(el.dataset.qrUrl) : demo);
});
// 示例卡上的二维码：指向各自的观看页
document.querySelectorAll("a[data-qr-for]").forEach((a) => {
  a.innerHTML = qrSvg(lanify(a.href));
});

// 3 · 首屏短片：电脑端静音播放一次，结束后换成一模一样的网页版落版（按钮、二维码都是真的）
const stage = document.querySelector("[data-stage]");
if (stage) {
  const video = stage.querySelector("video");
  const auto = document.documentElement.classList.contains("autoplay");
  const show = (state) => {
    stage.dataset.state = state;
  };
  const finish = () => {
    stage.dataset.played = "";
    show("end");
  };
  const play = () => {
    stage.dataset.started = "";
    video.preload = "auto";
    show("playing");
    try {
      video.currentTime = 0;
    } catch {
      /* 元数据未就绪时忽略 */
    }
    const p = video.play();
    if (p && p.catch) p.catch(() => show("end"));
  };
  video.addEventListener("ended", finish);
  video.addEventListener("error", () => show("end"), true);
  const controls = stage.parentElement;
  controls.querySelector("[data-play]")?.addEventListener("click", play);
  controls.querySelector("[data-replay]")?.addEventListener("click", play);
  controls.querySelector("[data-skip]")?.addEventListener("click", () => {
    video.pause();
    finish();
  });

  if (auto) {
    video.preload = "auto";
    // 首屏在视口里才开始播放（从锚点直接进入时不抢流量）
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          play();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(stage);
  } else {
    stage.dataset.started = "";
    show("end");
  }
}

// 4 · 顶栏菜单：“解决方案”下拉（悬停或点击箭头）、手机菜单
document.querySelectorAll("[data-menu]").forEach((li) => {
  const link = li.querySelector(".topnav-link");
  const set = (on) => {
    li.classList.toggle("is-open", on);
    link.setAttribute("aria-expanded", String(on));
  };
  li.addEventListener("mouseenter", () => matchMedia("(hover: hover)").matches && set(true));
  li.addEventListener("mouseleave", () => set(false));
  li.addEventListener("focusout", (e) => !li.contains(e.relatedTarget) && set(false));
  link.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      set(true);
      li.querySelector(".menu-panel a")?.focus();
    }
  });
  li.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      set(false);
      link.focus();
    }
  });
});
const menuBtn = document.querySelector("[data-menu-btn]");
const navMobile = document.querySelector("[data-nav-mobile]");
if (menuBtn && navMobile) {
  menuBtn.addEventListener("click", () => {
    const on = menuBtn.getAttribute("aria-expanded") !== "true";
    menuBtn.setAttribute("aria-expanded", String(on));
    navMobile.hidden = !on;
    document.documentElement.classList.toggle("menu-open", on);
  });
}

// 4b · 联系表单：拼成一条 WhatsApp 消息（网站本身不保存任何数据）。句子模板来自页面（各语言不同）
const waForm = document.querySelector("[data-wa-form]");
function waLines(form, name, co, use) {
  const t = form.dataset;
  return [(co ? t.helloCo : t.hello).replace("{name}", name).replace("{company}", co), t.use.replace("{use}", use)];
}
if (waForm) {
  waForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(waForm);
    const err = waForm.querySelector("[data-form-err]");
    const name = String(d.get("name") || "").trim();
    if (!name) {
      err.hidden = false;
      waForm.querySelector('[name="name"]').focus();
      return;
    }
    err.hidden = true;
    const lines = waLines(waForm, name, String(d.get("company") || "").trim(), d.get("use"));
    const msg = String(d.get("message") || "").trim();
    if (msg) lines.push(msg);
    void track("contact_click", { method: "whatsapp", interaction: "form" });
    window.open(`https://wa.me/${waForm.dataset.wa}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener");
  });
}

// 5 · 顶栏滚动后加底线
const topbar = document.querySelector("[data-topbar]");
if (topbar) {
  const onScroll = () => topbar.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// 6 · WhatsApp 浮动按钮：滚过第一屏才出现；页尾自带 WhatsApp 的区块在视野里时让开；联系页和账号页不显示
const wa = document.querySelector("[data-wa-float]");
if (wa && document.querySelector(".contact-form, .auth")) wa.remove();
else if (wa) {
  const ends = [...document.querySelectorAll(".final, .foot")];
  const seen = new Set();
  const update = () => wa.classList.toggle("is-on", scrollY > innerHeight * 0.6 && !seen.size);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target)));
    update();
  });
  ends.forEach((el) => io.observe(el));
  addEventListener("scroll", update, { passive: true });
  update();
}

// 7 · 贴纸进入视野时“拍”上来
const slaps = [...document.querySelectorAll("[data-slap]")];
if (slaps.length && "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.remove("slap-wait");
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.3 },
  );
  slaps
    .filter((el) => el.getBoundingClientRect().top > window.innerHeight)
    .forEach((el) => {
      el.classList.add("slap-wait");
      io.observe(el);
    });
}

// —— 动效 ——
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SAVE_DATA = !!(navigator.connection && navigator.connection.saveData);
// 进入视野时调用一次
function onceInView(els, cb, threshold = 0.25) {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          cb(e.target);
          io.unobserve(e.target);
        }
      }),
    { threshold },
  );
  els.forEach((el) => io.observe(el));
}

// 8 · 区块滚动出现：只藏起加载时在视口下方的，同一组依次出现
const REVEAL =
  ".sec .sec-head, .sol-grid > li, .how-step, .ex-card, .plan, .pains li, .grid-kv > div, .sec .split-txt, .sec .split-media, .other-sols li, .faq-row, .price-box, .est, .note-box, .help-search, .contact-form, .contact-side, .chat";
if (!REDUCED) {
  const below = [...document.querySelectorAll(REVEAL)].filter((el) => el.getBoundingClientRect().top > innerHeight * 0.92);
  below.forEach((el) => {
    const sibs = [...el.parentElement.children];
    el.style.setProperty("--d", String(Math.min(sibs.indexOf(el), 5)));
    el.dataset.reveal = "";
  });
  onceInView(below, (el) => el.classList.add("is-in"), 0.12);
}

// 9 · 截图光标、聊天气泡、流程线：进入视野后开始播放
onceInView([...document.querySelectorAll("[data-cursor], [data-chat], [data-flow]")], (el) => el.classList.add("is-in"), 0.45);

// 10 · 功能页首屏：二维码不变，视频封面轮换
const swap = document.querySelector("[data-swap]");
if (swap && !REDUCED) {
  const items = [...swap.querySelectorAll(".swap-item")];
  const dots = [...swap.querySelectorAll(".swap-dots i")];
  let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    const prev = items[i];
    i = (i + 1) % items.length;
    prev.classList.remove("is-on");
    prev.classList.add("is-out");
    setTimeout(() => prev.classList.remove("is-out"), 650);
    items[i].classList.add("is-on");
    dots.forEach((d, k) => d.classList.toggle("is-on", k === i));
  }, 2800);
}

// 11 · 视频：场景卡悬停播放；手机里的观看页、场景页首屏在视野内才播放
const playable = (v) => {
  v.preload = "auto";
  // 手机里的观看页跳过片头标题卡，直接看到画面
  if (v.classList.contains("phone-video") && !v.dataset.seeked) {
    v.dataset.seeked = "1";
    const seek = () => (v.currentTime = 3.5);
    if (v.readyState >= 1) seek();
    else v.addEventListener("loadedmetadata", seek, { once: true });
  }
  const p = v.play();
  if (p && p.then) p.then(() => v.classList.add("is-playing")).catch(() => {});
};
const hoverable = matchMedia("(hover: hover)").matches;
document.querySelectorAll("[data-hover-video]").forEach((v) => {
  const card = v.closest("a");
  if (hoverable) {
    card.addEventListener("mouseenter", () => playable(v));
    card.addEventListener("mouseleave", () => {
      v.pause();
      v.classList.remove("is-playing");
    });
  }
});
const inview = [...document.querySelectorAll("[data-inview-video]")];
if (inview.length) {
  if (REDUCED || SAVE_DATA) inview.forEach((v) => v.pause());
  else {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) playable(e.target);
          else e.target.pause();
        }),
      { threshold: 0.5 },
    );
    inview.forEach((v) => io.observe(v));
  }
}

// 12 · 功能页：当前看到的功能在顶部标签里高亮
const chips = document.querySelector("[data-chips]");
if (chips) {
  const links = [...chips.querySelectorAll("a")];
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) links.forEach((a) => a.classList.toggle("is-current", a.hash === `#${e.target.id}`));
      }),
    { rootMargin: "-45% 0px -50% 0px" },
  );
  links.forEach((a) => {
    const t = document.querySelector(a.hash);
    if (t) io.observe(t);
  });
}

// 13 · 价格估算：滑块用对数刻度（100 – 100,000），推荐套餐
const est = document.querySelector("[data-estimator]");
if (est) {
  const range = est.querySelector("[data-est-range]");
  const nEl = est.querySelector("[data-est-n]");
  const out = est.querySelector("[data-est-out]");
  const results = JSON.parse(est.dataset.results);
  const plans = [...document.querySelectorAll(".plan[data-plan-id]")];
  const update = () => {
    const raw = 100 * Math.pow(10, (Number(range.value) / 100) * 3);
    const step = raw < 1000 ? 50 : raw < 10000 ? 500 : 5000;
    const n = Math.round(raw / step) * step;
    nEl.textContent = n.toLocaleString(document.documentElement.lang);
    const r = results.find((x) => n <= x.max);
    out.textContent = r.text;
    plans.forEach((p) => p.classList.toggle("is-rec", p.dataset.planId === r.plan));
  };
  range.addEventListener("input", update);
  update();
}

// 14 · 帮助：边输入边筛选
const help = document.querySelector("[data-help]");
if (help) {
  const q = help.querySelector("[data-help-q]");
  const empty = help.querySelector("[data-help-empty]");
  const norm = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const qas = [...help.querySelectorAll(".qa")].map((d) => ({ d, text: norm(d.textContent) }));
  q.addEventListener("input", () => {
    const words = norm(q.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    qas.forEach(({ d, text }) => {
      const hit = words.every((w) => text.includes(w));
      d.hidden = !hit;
      d.open = hit && words.join("").length > 2;
      if (hit) shown++;
    });
    help.querySelectorAll(".help-group").forEach((g) => (g.hidden = !g.querySelector(".qa:not([hidden])")));
    empty.hidden = shown > 0;
    // 左边目录：没有结果的主题变淡
    document.querySelectorAll("[data-help-nav] a[href^=\"#g-\"]").forEach((a) => {
      const g = document.querySelector(a.hash);
      a.classList.toggle("is-hidden", !!g && g.hidden);
    });
  });
  // 左边目录跟着滚动高亮当前主题
  const navLinks = [...document.querySelectorAll("[data-help-nav] a[href^=\"#g-\"]")];
  const navIo = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle("is-current", a.hash === `#${e.target.id}`));
      }),
    { rootMargin: "-30% 0px -60% 0px" },
  );
  help.querySelectorAll(".help-group").forEach((g) => navIo.observe(g));
  // 从首页“常见问题”链接带着 #id 进来时，直接展开那一条
  const target = location.hash && help.querySelector(`details${CSS.escape(location.hash)}`);
  if (target) target.open = true;
}

// 15 · 联系：右边实时预览即将发出的 WhatsApp 消息
const waPreview = document.querySelector("[data-wa-preview]");
if (waForm && waPreview) {
  const render = () => {
    const d = new FormData(waForm);
    const name = String(d.get("name") || "").trim() || waForm.dataset.namePh;
    const msg = String(d.get("message") || "").trim();
    waPreview.textContent = [...waLines(waForm, name, String(d.get("company") || "").trim(), d.get("use")), msg].filter(Boolean).join("\n");
  };
  waForm.addEventListener("input", render);
  render();
}

// 16 · 语言：顶栏“语言”标签展开菜单；选过的语言记在浏览器里（与旧官网同一个键 vqr-lang）
let qrGeneratorReady, changingLanguage = false;
function rememberLanguage(code) {
  try {
    const locales = { es: "es_ES", en: "en_US", pt: "pt_BR", fr: "fr_FR", de: "de_DE", zh: "zh_CN", ja: "ja_JP", ko: "ko_KR" };
    if (!locales[code]) return;
    localStorage.setItem("vqr-lang", code);
    localStorage.setItem("qrveo-official-language", code);
    if (code !== "zh" || localStorage.getItem("cuplayer-admin-language") !== "zh_TW") {
      localStorage.setItem("cuplayer-admin-language", locales[code]);
    }
  } catch {
    /* 无痕模式下忽略 */
  }
}
function restoreLanguage() {
  try {
    const saved = localStorage.getItem("vqr-lang") || localStorage.getItem("qrveo-official-language") ||
      (localStorage.getItem("cuplayer-admin-language") || "").slice(0, 2);
    const link = document.querySelector(`[data-lang-menu] [data-set-lang="${saved}"]`);
    if (LANG === "es" && saved !== "es" && link) {
      const target = new URL(link.href);
      target.search = location.search;
      target.hash = location.hash;
      location.replace(target.href);
      return;
    }
  } catch {
    /* Storage restrictions must not prevent the page from loading. */
  }
  rememberLanguage(LANG);
}
async function changeLanguage(event) {
  const link = event.currentTarget;
  if (!document.querySelector("[data-qr-generator]") ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) {
    rememberLanguage(link.dataset.setLang);
    return;
  }
  event.preventDefault();
  if (link.dataset.setLang === LANG || changingLanguage) return;
  changingLanguage = true;
  try {
    const generator = await qrGeneratorReady;
    if (!generator) throw new Error("generator");
    const target = new URL(link.href);
    target.searchParams.set("tipo", await generator.prepareLanguageSwitch());
    rememberLanguage(link.dataset.setLang);
    location.assign(target.href);
  } catch {
    changingLanguage = false;
    const root = document.querySelector("[data-qr-generator]");
    const T = JSON.parse(root.querySelector("[data-qr-text]").textContent);
    const message = root.querySelector("[data-qr-message]");
    message.textContent = T.errors.draft || T.errors.generic;
    message.hidden = false;
  }
}
const langBox = document.querySelector("[data-lang]");
if (langBox) {
  const btn = langBox.querySelector("[data-lang-btn]");
  const menu = langBox.querySelector("[data-lang-menu]");
  const set = (on) => {
    menu.hidden = !on;
    btn.setAttribute("aria-expanded", String(on));
    langBox.classList.toggle("is-open", on);
  };
  btn.addEventListener("click", () => set(menu.hidden));
  document.addEventListener("click", (e) => !langBox.contains(e.target) && set(false));
  langBox.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      set(false);
      btn.focus();
    }
  });
  const languageReturn = new URLSearchParams(location.search).get("return");
  langBox.querySelectorAll("[data-set-lang]").forEach((a) => {
    if (languageReturn) {
      const url = new URL(a.href);
      url.searchParams.set("return", languageReturn);
      a.href = url.href;
    }
    a.addEventListener("click", changeLanguage);
  });

  // 第一次来、浏览器语言和本页不同：轻轻提示一次，可以关掉
  let saved = "";
  try {
    saved = localStorage.getItem("vqr-lang") || "";
  } catch {
    /* 忽略 */
  }
  const wants = (navigator.languages || [navigator.language || ""]).map((l) => String(l).slice(0, 2).toLowerCase());
  const links = [...langBox.querySelectorAll("[data-set-lang]")];
  const pick = !saved && wants[0] !== LANG ? links.find((a) => a.dataset.setLang === wants[0]) : null;
  if (pick) {
    const bar = document.createElement("div");
    bar.className = "lang-hint";
    bar.lang = pick.lang;
    bar.innerHTML = `<div class="wrap"><a href="${pick.href}" data-set-lang="${pick.dataset.setLang}"></a><button type="button"></button></div>`;
    const a = bar.querySelector("a");
    const x = bar.querySelector("button");
    a.textContent = `${pick.dataset.suggest} →`;
    x.textContent = "×";
    x.setAttribute("aria-label", pick.dataset.close);
    a.addEventListener("click", changeLanguage);
    x.addEventListener("click", () => {
      bar.remove();
      rememberLanguage(LANG);
    });
    document.body.append(bar);
  }
}

// 17 · 账号：官网的注册 / 登录 / 找回密码直接调用后台 /auth 接口（字段与控制台的表单一致），
// 成功后把令牌写进 cookie；只有跨子域名的控制台才需要共享到 .qrveo.com。
const API = String(RUNTIME.apiOrigin || "https://api.qrveo.com").replace(/\/$/, "");
const CONSOLE_HOME = consoleOrigin || "https://console.qrveo.com";
const TOKEN = "x-auth-token";
const readToken = () => {
  const m = document.cookie.match(/(?:^|;\s*)x-auth-token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
};
const cookieTail = () =>
  `; Path=/; SameSite=Lax${new URL(CONSOLE_HOME, location.href).origin !== location.origin && /(^|\.)qrveo\.com$/.test(location.hostname) ? "; Domain=.qrveo.com" : ""}${location.protocol === "https:" ? "; Secure" : ""}`;
const writeToken = (t) => (document.cookie = `${TOKEN}=${encodeURIComponent(t)}${cookieTail()}; Max-Age=${7 * 86400}`);
const clearToken = () => {
  document.cookie = `${TOKEN}=${cookieTail()}; Max-Age=0`;
  document.cookie = `${TOKEN}=; Path=/; Max-Age=0`;
  if (/(^|\.)qrveo\.com$/.test(location.hostname)) {
    document.cookie = `${TOKEN}=; Path=/; Domain=.qrveo.com; Max-Age=0`;
  }
  document.querySelectorAll("[data-panel-label]").forEach((a) => {
    if (!a.dataset.loginLabel) return;
    a.textContent = a.dataset.loginLabel;
    a.href = a.dataset.loginHref;
  });
};
const panelUrl = () => `${CONSOLE_HOME}${ROUTES.panel}?from=official&lang=${LANG}`;
document.querySelectorAll('[data-console="panel"]').forEach((a) => (a.href = panelUrl()));

// 已登录：顶栏的“登录”换成“我的面板”
if (readToken()) {
  document.querySelectorAll("[data-panel-label]").forEach((a) => {
    a.dataset.loginLabel = a.textContent;
    a.dataset.loginHref = a.href;
    a.textContent = a.dataset.panelLabel;
    a.href = panelUrl();
  });
}

async function api(path, { method = "GET", body, token, headers: extra } = {}) {
  const headers = { "Accept-Language": LANG, ...extra };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers[TOKEN] = token;
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error("network"), { network: true });
  }
  const j = await res.json().catch(() => ({}));
  const bad = !res.ok || j.success === false || (typeof j.code === "number" && j.code !== 0 && j.code !== 200);
  if (bad) throw Object.assign(new Error(j.message || j.msg || ""), { status: res.status, code: j.errorCode || j.code, num: typeof j.code === "number" ? j.code : j.statusCode, errors: j.errors });
  return j || {};
}
const dataOf = (j) => (j && j.data && typeof j.data === "object" ? j.data : j) || {};

// 登录成功后去哪：带 ?return= 进来（例如旧官网的上传页）且是本站地址就回去，否则进控制台
// 在生成器里传过试用视频的人，登录或注册成功后把视频认领到账号里（二维码地址不变）。最多等 5 秒，失败也照常进入控制台
const generatorModule = () => import("./qr-generator.mjs?v=__QR_GENERATOR_VERSION__");
async function claimTrial(token) {
  try {
    if (!localStorage.getItem("qrveo-last-qr")) return;
    const { readLastQr, clearLastQr } = await generatorModule();
    const last = readLastQr();
    if (!last || last.kind !== "video" || !last.trialId) return;
    const body = { trialId: last.trialId, trialToken: last.trialToken };
    const deadline = Date.now() + 8000;
    for (;;) {
      try {
        await api("/trial/claim", { method: "POST", token, body });
        break;
      } catch (error) {
        // 视频还在探测：后端要求 3 秒后再试；其他失败（到期、空间不足）保留记录，24 小时内还能再认领
        if (error.code !== "TRIAL_NOT_READY" || Date.now() + 3000 > deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    clearLastQr();
  } catch {
    /* 认领失败不挡登录；试用码 24 小时内还能再认领 */
  }
}

function afterLogin(token) {
  writeToken(token);
  const claimed = claimTrial(token);
  const ret = new URLSearchParams(location.search).get("return");
  let next = panelUrl();
  if (ret) {
    try {
      const u = new URL(ret, location.href);
      if (u.hostname === location.hostname || /(^|\.)qrveo\.com$/.test(u.hostname) || u.origin === consoleOrigin) next = u.href;
    } catch {
      /* 地址不对就进控制台 */
    }
  }
  const target = new URL(next, location.href);
  const admin = new URL(CONSOLE_HOME, location.href);
  if (target.origin === admin.origin && target.pathname.replace(/\/+$/, "") === admin.pathname.replace(/\/+$/, "")) {
    const split = target.hash.indexOf("?");
    const params = new URLSearchParams(split < 0 ? "" : target.hash.slice(split + 1));
    params.set("lang", LANG);
    target.searchParams.delete("lang");
    target.hash = (split < 0 ? target.hash || "#/secure/overview" : target.hash.slice(0, split)) + "?" + params;
    next = target.href;
  }
  Promise.all([claimed, new Promise((resolve) => setTimeout(resolve, 600))]).then(() => location.assign(next));
}

const authPage = document.querySelector("[data-auth-page]");
if (authPage) {
  const T = JSON.parse(document.getElementById("auth-text").textContent);
  const returnTo = new URLSearchParams(location.search).get("return");
  if (returnTo) authPage.querySelectorAll("a[data-auth]").forEach((link) => {
    const url = new URL(link.href);
    url.searchParams.set("return", returnTo);
    link.href = url.href;
  });
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PASSWORD = /^(?=.*[A-Za-z])(?=.*\d).{8,16}$/;

  const googleBox = authPage.querySelector("[data-google-auth]");
  if (googleBox) {
    const mount = googleBox.querySelector("[data-google-button]");
    const status = googleBox.querySelector("[data-google-status]");
    const startButton = googleBox.querySelector("[data-google-start]");
    const consent = googleBox.querySelector("[data-google-consent]");
    const link = googleBox.querySelector("[data-google-link]");
    let challenge, credential = "", sending = false, starting = false, requested = false, renderedWidth = 0;
    const showGoogleStatus = (text) => {
      status.textContent = text;
      status.hidden = !text;
    };
    const loadGoogle = () => new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      const timer = setTimeout(() => { script.remove(); reject(new Error("google-sdk-timeout")); }, 10000);
      script.onload = () => { clearTimeout(timer); window.google?.accounts?.id ? resolve() : reject(new Error("google-sdk-unavailable")); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("google-sdk-network")); };
      document.head.append(script);
    });
    const renderGoogle = () => {
      if (mount.hidden || !challenge || !window.google?.accounts?.id) return;
      const width = Math.max(200, Math.min(400, Math.floor(googleBox.clientWidth)));
      if (width === renderedWidth) return;
      renderedWidth = width;
      mount.replaceChildren();
      window.google.accounts.id.renderButton(mount, {
        type: "standard", theme: "outline", size: "large", text: "continue_with",
        shape: "rectangular", width, locale: googleBox.dataset.googleLocale,
      });
    };
    const submitGoogle = async (accepted = false, password) => {
      if (sending || !credential || !challenge) return;
      sending = true;
      googleBox.setAttribute("aria-busy", "true");
      consent.querySelector("button").disabled = true;
      link.querySelector("button").disabled = true;
      showGoogleStatus(T.google.loading);
      try {
        const result = dataOf(await api("/auth/login/google", {
          method: "POST", body: { credential, nonce: challenge.nonce, consent: accepted, ...(password ? { password } : {}) },
        }));
        if (!result.token) throw new Error("google-token-missing");
        credential = "";
        link.reset();
        showGoogleStatus(T.loginDone);
        authPage.querySelectorAll('button[type="submit"]').forEach((button) => (button.disabled = true));
        if (result.isNew === true) await track("sign_up", { method: "google" });
        afterLogin(result.token);
      } catch (error) {
        if (error.code === "GOOGLE_CONSENT_REQUIRED") {
          consent.hidden = false;
          link.hidden = true;
          mount.hidden = true;
          showGoogleStatus(T.google.consentRequired);
          consent.elements.consent.focus();
        } else if (error.code === "GOOGLE_LINK_REQUIRED") {
          consent.hidden = true;
          link.hidden = false;
          mount.hidden = true;
          showGoogleStatus(T.google.linkRequired);
          link.elements.password.focus();
        } else {
          credential = "";
          consent.hidden = true;
          link.hidden = true;
          mount.hidden = true;
          startButton.hidden = false;
          showGoogleStatus(error.network ? T.network : T.google.failed);
        }
      } finally {
        sending = false;
        googleBox.removeAttribute("aria-busy");
        consent.querySelector("button").disabled = false;
        link.querySelector("button").disabled = false;
      }
    };
    const startGoogle = async (interactive = false) => {
      if (starting) {
        if (interactive) {
          requested = true;
          startButton.disabled = true;
          showGoogleStatus(T.google.loading);
        }
        return;
      }
      if (sending) return;
      starting = true;
      requested = interactive;
      startButton.disabled = interactive;
      consent.hidden = true;
      consent.reset();
      link.hidden = true;
      link.reset();
      credential = "";
      challenge = null;
      renderedWidth = 0;
      mount.hidden = true;
      if (interactive) showGoogleStatus(T.google.loading);
      try {
        challenge = dataOf(await api("/auth/google/challenge", { method: "POST", body: {} }));
        if (!challenge.clientId || !challenge.nonce) throw new Error("google-not-configured");
        await loadGoogle();
        window.google.accounts.id.initialize({
          client_id: challenge.clientId, nonce: challenge.nonce,
          ux_mode: "popup", auto_select: false,
          callback: (response) => {
            if (sending || !response.credential) return;
            credential = response.credential;
            void submitGoogle();
          },
        });
        mount.hidden = false;
        renderGoogle();
        startButton.hidden = true;
        showGoogleStatus("");
      } catch {
        challenge = null;
        mount.hidden = true;
        startButton.hidden = false;
        if (requested) showGoogleStatus(T.google.unavailable);
      } finally {
        starting = false;
        requested = false;
        startButton.disabled = false;
      }
    };
    consent.addEventListener("submit", (event) => {
      event.preventDefault();
      if (consent.reportValidity()) void submitGoogle(true);
    });
    link.addEventListener("submit", (event) => {
      event.preventDefault();
      if (link.reportValidity()) void submitGoogle(false, link.elements.password.value);
    });
    startButton.addEventListener("click", () => void startGoogle(true));
    new ResizeObserver(() => renderGoogle()).observe(googleBox);
    void startGoogle();
  }

  const facebookBox = authPage.querySelector("[data-facebook-auth]");
  if (facebookBox && T.facebook) {
    const button = facebookBox.querySelector("[data-facebook-start]");
    const status = facebookBox.querySelector("[data-facebook-status]");
    const consent = facebookBox.querySelector("[data-facebook-consent]");
    const link = facebookBox.querySelector("[data-facebook-link]");
    let challenge, accessToken = "", preparing = false, sending = false, popup = false, completed = false;
    const say = text => {
      status.textContent = text;
      status.hidden = !text;
    };
    const loadFacebook = () => new Promise((resolve, reject) => {
      if (window.FB?.init) return resolve();
      const script = document.createElement("script");
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      const timer = setTimeout(() => { script.remove(); reject(new Error("facebook-sdk-timeout")); }, 10000);
      script.onload = () => {
        clearTimeout(timer);
        window.FB?.init ? resolve() : reject(new Error("facebook-sdk-unavailable"));
      };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("facebook-sdk-network")); };
      document.head.append(script);
    });
    const prepareFacebook = async (interactive = false) => {
      if (preparing || sending || popup) return;
      preparing = true;
      button.disabled = true;
      challenge = null;
      if (interactive) say(T.facebook.loading);
      try {
        const next = dataOf(await api("/auth/facebook/challenge", { method: "POST", body: {} }));
        if (!next.appId || !next.nonce || !next.version) throw new Error("facebook-not-configured");
        await loadFacebook();
        window.FB.init({ appId: next.appId, version: next.version, cookie: false, xfbml: false, status: false });
        challenge = next;
        say("");
      } catch {
        if (interactive) say(T.facebook.unavailable);
      } finally {
        preparing = false;
        button.disabled = false;
      }
    };
    const submitFacebook = async (accepted = false, password) => {
      if (sending || !accessToken || !challenge) return;
      sending = true;
      facebookBox.setAttribute("aria-busy", "true");
      facebookBox.querySelectorAll("button").forEach(control => { control.disabled = true; });
      say(T.facebook.loading);
      try {
        const result = dataOf(await api("/auth/login/facebook", {
          method: "POST",
          body: { accessToken, nonce: challenge.nonce, consent: accepted, ...(password ? { password } : {}) },
        }));
        if (!result.token) throw new Error("facebook-token-missing");
        accessToken = "";
        link.reset();
        say(T.loginDone);
        authPage.querySelectorAll("button").forEach(control => { control.disabled = true; });
        if (result.isNew === true) await track("sign_up", { method: "facebook" });
        afterLogin(result.token);
        completed = true;
      } catch (error) {
        consent.hidden = error.code !== "FACEBOOK_CONSENT_REQUIRED";
        link.hidden = error.code !== "FACEBOOK_LINK_REQUIRED";
        if (!consent.hidden) {
          say(T.facebook.consentRequired);
          consent.elements.consent.focus();
        } else if (!link.hidden) {
          say(T.facebook.linkRequired);
          link.elements.password.focus();
        } else {
          accessToken = "";
          challenge = null;
          link.reset();
          say(error.network ? T.network : error.code === "FACEBOOK_EMAIL_REQUIRED" ? T.facebook.emailRequired : T.facebook.failed);
        }
      } finally {
        sending = false;
        facebookBox.removeAttribute("aria-busy");
        if (!completed) facebookBox.querySelectorAll("button").forEach(control => { control.disabled = false; });
      }
    };
    button.addEventListener("click", () => {
      if (preparing || sending || popup) return;
      if (!challenge || !window.FB?.login) return void prepareFacebook(true);
      consent.hidden = true;
      consent.reset();
      link.hidden = true;
      link.reset();
      popup = true;
      button.disabled = true;
      say(T.facebook.loading);
      // Keep FB.login synchronous with the click so browsers allow its popup.
      try {
        window.FB.login(response => {
          popup = false;
          button.disabled = false;
          if (!response.authResponse?.accessToken) {
            say("");
            return;
          }
          accessToken = response.authResponse.accessToken;
          void submitFacebook();
        }, { scope: "public_profile,email", return_scopes: true });
      } catch {
        popup = false;
        button.disabled = false;
        say(T.facebook.unavailable);
      }
    });
    consent.addEventListener("submit", event => {
      event.preventDefault();
      if (consent.reportValidity()) void submitFacebook(true);
    });
    link.addEventListener("submit", event => {
      event.preventDefault();
      if (link.reportValidity()) void submitFacebook(false, link.elements.password.value);
    });
    void prepareFacebook();
  }

  // 后台的错误：优先看错误码，其次看消息里的关键词，都认不出就用通用提示
  const errText = (e, kind) => {
    if (e.network) return T.network;
    const code = String(e.code || "").toUpperCase();
    const m = String(e.message || "").toLowerCase();
    if (e.status === 429 || /TOO_MANY|RATE/.test(code) || /频繁|too many/.test(m)) return T.tooMany;
    if (/EXIST|REGISTERED|DUPLICATE/.test(code) || /exist|registrad|已存在|已注册|已被注册/.test(m)) return T.exists;
    if (kind === "login" && (/CAPTCHA|KAPTCHA/.test(code) || /captcha|验证码/.test(m))) return T.captchaBad;
    if (kind === "register" && (/CODE/.test(code) || /code|验证码/.test(m))) return T.codeBad;
    if (kind === "login" && (/PASSWORD|CREDENTIAL|LOGIN/.test(code) || /password|contraseña|密码|账号|用户/.test(m))) return T.credentials;
    return T.generic;
  };

  const forms = [...authPage.querySelectorAll("[data-auth-form]")];
  forms.forEach((form) => {
    const kind = form.dataset.authForm;
    const msg = form.querySelector("[data-auth-msg]");
    const btn = form.querySelector(".auth-submit");
    const label = btn.querySelector("span").textContent;
    const val = (n) => String(form.elements[n]?.value || "").trim();
    const say = (text, ok = false) => {
      msg.hidden = !text;
      msg.textContent = text || "";
      msg.classList.toggle("is-ok", ok);
    };
    const busy = (on) => {
      btn.disabled = on;
      btn.querySelector("span").textContent = on ? btn.dataset.busy : label;
    };
    const fieldErr = (name, text) => {
      const box = form.querySelector(`[data-fld="${name}"]`);
      if (!box) return;
      const el = box.querySelector("[data-err]");
      el.hidden = !text;
      el.textContent = text || "";
      form.elements[name]?.setAttribute("aria-invalid", String(!!text));
    };
    form.addEventListener("input", (e) => e.target.name && fieldErr(e.target.name, ""));
    form.querySelectorAll("[data-pw-toggle]").forEach((b) =>
      b.addEventListener("click", () => {
        const input = b.parentElement.querySelector("input");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        b.setAttribute("aria-pressed", String(show));
        b.setAttribute("aria-label", show ? b.dataset.hide : b.dataset.show);
      }),
    );
    // 逐项检查，把第一个出错的框放到焦点上
    const check = (rules) => {
      let first = null;
      for (const [name, ok, text] of rules) {
        if (!form.querySelector(`[data-fld="${name}"]`) || form.querySelector(`[data-fld="${name}"]`).hidden) continue;
        fieldErr(name, ok ? "" : text);
        if (!ok && !first) first = form.elements[name];
      }
      first?.focus();
      return !first;
    };

    if (kind === "register") {
      const codeRow = form.querySelector("[data-code-row]");
      // 需不需要邮箱验证码由后台决定（私有部署默认不需要）
      api("/deploy-info")
        .then((j) => (codeRow.hidden = !dataOf(j).emailVerificationRequired))
        .catch(() => {});
      const sendBtn = form.querySelector("[data-send-code]");
      const sendLabel = sendBtn.textContent;
      sendBtn.addEventListener("click", async () => {
        if (!check([["email", EMAIL.test(val("email")), T.email]])) return;
        sendBtn.disabled = true;
        try {
          await api("/auth/send-email-code", { method: "POST", body: { email: val("email"), locale: LANG } });
          say(T.codeSent, true);
          let s = 60;
          const tick = () => {
            sendBtn.textContent = T.codeWait.replace("{s}", s);
            if (s-- <= 0) {
              sendBtn.textContent = sendLabel;
              sendBtn.disabled = false;
            } else setTimeout(tick, 1000);
          };
          tick();
        } catch (e) {
          say(errText(e, kind));
          sendBtn.disabled = false;
        }
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        say("");
        const ok = check([
          ["name", !!val("name"), T.required],
          ["email", EMAIL.test(val("email")), T.email],
          ["code", !!val("code"), T.code],
          ["password", PASSWORD.test(form.elements.password.value), T.password],
          ["consent", form.elements.consent.checked, T.consent],
        ]);
        if (!ok) return;
        busy(true);
        try {
          const j = await api("/auth/register/email", {
            method: "POST",
            body: { email: val("email"), code: val("code"), password: form.elements.password.value, name: val("name") },
          });
          const token = j.token || dataOf(j).token;
          say(T.regDone, true);
          await track("sign_up", { method: "email" });
          if (token) afterLogin(token);
          else setTimeout(() => {
            const login = new URL(authPage.querySelector('[data-auth="login"]').href);
            login.searchParams.set("email", val("email"));
            location.assign(login.href);
          }, 900);
        } catch (err) {
          say(errText(err, kind));
          busy(false);
        }
      });
    }

    if (kind === "login") {
      const capRow = form.querySelector("[data-captcha-row]");
      const capImg = form.querySelector("[data-captcha-img]");
      let captchaId = "";
      let captchaEnabled = true, captchaRequest = Promise.resolve();
      // Only an explicit server switch disables the challenge.
      const loadCaptcha = () => {
        captchaRequest = (async () => {
          try {
            const d = dataOf(await api(`/auth/kaptcha?t=${Date.now()}`));
            captchaEnabled = d.enabled !== false;
            capRow.hidden = !captchaEnabled;
            if (!captchaEnabled) {
              captchaId = "";
              form.elements.captcha.value = "";
              return;
            }
            const img = String(d.imgBase64 || d.img || "");
            if (!img) return;
            capImg.src = img.startsWith("data:") ? img : img.trim().startsWith("<") ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(img)}` : `data:image/png;base64,${img}`;
            captchaId = d.captchaId || "";
            form.elements.captcha.value = "";
            capRow.hidden = false;
          } catch {
            /* Leave the challenge required when its status cannot be loaded. */
          }
        })();
        return captchaRequest;
      };
      form.querySelector("[data-captcha-new]").addEventListener("click", loadCaptcha);
      const preset = new URLSearchParams(location.search).get("email");
      if (preset) form.elements.email.value = preset;

      // 这个浏览器已经登录过：先确认令牌还有效，有效就直接给“进入面板”
      const fresh = authPage.querySelector("[data-auth-fresh]");
      const already = authPage.querySelector("[data-auth-already]");
      const token = readToken();
      const showFresh = () => {
        already.hidden = true;
        fresh.hidden = false;
        loadCaptcha();
      };
      if (token) {
        already.hidden = false;
        fresh.hidden = true;
        api("/user/get-user", { token }).catch((e) => {
          if (!e.network) {
            clearToken();
            showFresh();
          }
        });
      } else loadCaptcha();
      already.querySelector("[data-logout]").addEventListener("click", async () => {
        await api("/auth/logout", { method: "POST", token: readToken() }).catch(() => {});
        clearToken();
        showFresh();
        say(T.loggedOut, true);
      });

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        await captchaRequest;
        say("");
        const ok = check([
          ["email", EMAIL.test(val("email")), T.email],
          ["password", !!form.elements.password.value, T.required],
          ["captcha", !captchaEnabled || !!val("captcha"), T.captcha],
        ]);
        if (!ok) return;
        busy(true);
        try {
          const j = await api("/auth/login", {
            method: "POST",
            body: { email: val("email"), password: form.elements.password.value,
              ...(captchaEnabled ? { captcha: val("captcha"), captchaId } : {}) },
          });
          const t = j.token || dataOf(j).token;
          if (!t) throw new Error("");
          say(T.loginDone, true);
          afterLogin(t);
        } catch (err) {
          say(errText(err, kind));
          busy(false);
          if (!capRow.hidden) loadCaptcha();
        }
      });
    }

    if (kind === "recover") {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        say("");
        if (!check([["email", EMAIL.test(val("email")), T.email]])) return;
        busy(true);
        try {
          await api("/auth/send-reset-password-email", { method: "POST", body: { email: val("email"), locale: LANG } });
          say(T.sent, true);
          setTimeout(() => busy(false), 30000);
        } catch (err) {
          // 不泄露邮箱是否注册过：只有“邮箱不存在”这类 4xx 也显示“已发送”；连不上、太频繁、后台出错（例如发信服务不可用）要如实说
          const fail = err.network ? T.network : err.status === 429 ? T.tooMany : err.status >= 500 ? T.generic : "";
          say(fail || T.sent, !fail);
          busy(false);
        }
      });
    }
  });

  // 找回密码邮件里的链接：?user=…&lip=…&ts=…（与控制台的重置页相同），打开后后台生成一个新密码
  const q = new URLSearchParams(location.search);
  const resetBox = authPage.querySelector("[data-recover-reset]");
  if (resetBox && (q.get("user") || q.get("email")) && q.get("lip") && q.get("ts")) {
    authPage.querySelector("[data-recover-request]").hidden = true;
    resetBox.hidden = false;
    const status = resetBox.querySelector("[data-reset-status]");
    api("/auth/reset-password", { method: "POST", body: { email: q.get("user") || q.get("email"), lip: q.get("lip"), ts: q.get("ts") } })
      .then((j) => {
        const pw = dataOf(j).password || j.password;
        if (!pw) throw new Error("");
        status.hidden = true;
        resetBox.querySelector("[data-reset-pw]").textContent = pw;
        resetBox.querySelector("[data-reset-box]").hidden = false;
        resetBox.querySelector("[data-reset-done]").hidden = false;
        const copy = resetBox.querySelector("[data-copy]");
        copy.addEventListener("click", () =>
          navigator.clipboard?.writeText(pw).then(() => {
            copy.textContent = T.copied;
            setTimeout(() => (copy.textContent = T.copy), 1800);
          }),
        );
      })
      .catch(() => {
        status.hidden = true;
        resetBox.querySelector("[data-reset-fail]").hidden = false;
        resetBox.querySelector("[data-reset-again]").hidden = false;
      });
  }
}

if (document.querySelector("[data-qr-generator]")) {
  qrGeneratorReady = generatorModule()
    .then(({ initQrGenerator }) => initQrGenerator({ qrcode, readToken, clearToken, consoleHome: CONSOLE_HOME, lang: LANG, api }))
    .catch(() => {
      const root = document.querySelector("[data-qr-generator]");
      const T = JSON.parse(root.querySelector("[data-qr-text]").textContent);
      const message = root.querySelector("[data-qr-message]");
      message.textContent = T.errors.generic;
      message.hidden = false;
    });
}

// 18 · 结账页（第一阶段是模拟支付：后台 /billing/demo-checkout 收到资料就开通套餐，不扣款）
// 要先登录：令牌来自官网登录写的 cookie；控制台的“升级”按钮跳过来之前也会写这个 cookie
const payPage = document.querySelector("[data-pay-page]");
if (payPage) {
  const T = JSON.parse(document.getElementById("pay-text").textContent);
  const form = payPage.querySelector("[data-pay-form]");
  const login = payPage.querySelector("[data-pay-login]");
  const msg = form.querySelector("[data-auth-msg]");
  const btn = form.querySelector(".auth-submit");
  const btnText = form.querySelector("[data-pay-btn]");
  const untilRow = payPage.querySelector("[data-pay-until]");
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;
  const DAY = 86400000;
  const fmt = (d) => d.toLocaleDateString(document.documentElement.lang, { day: "numeric", month: "long", year: "numeric" });
  // 后台的接口有两种写法：status="success" 或 success=true；都要看
  const ok = (j) => !(j && j.status && j.status !== "success");
  const val = (n) => String(form.elements[n]?.value || "").trim();
  const say = (text) => {
    msg.hidden = !text;
    msg.textContent = text || "";
  };
  const fieldErr = (name, text) => {
    const box = form.querySelector(`[data-fld="${name}"]`);
    const el = box.querySelector("[data-err]");
    el.hidden = !text;
    el.textContent = text || "";
    form.elements[name].setAttribute("aria-invalid", String(!!text));
  };
  form.addEventListener("input", (e) => e.target.name && form.querySelector(`[data-fld="${e.target.name}"]`) && fieldErr(e.target.name, ""));

  // 套餐：?plan= 预选；切换时右边的订单摘要和按钮金额跟着换
  let user = null;
  const want = new URLSearchParams(location.search).get("plan");
  const radio = form.querySelector(`input[name="plan"][value="${CSS.escape(want || "")}"]`);
  if (radio) radio.checked = true;
  const plan = () => form.elements.plan.value;
  // 当前套餐还没到期、又买同一个：在原到期日上加一年；否则从今天起一年
  const sameAs = (id) => user && new RegExp(id === "premium" ? "premium" : "est[aá]ndar|standard", "i").test(String(user.packagetypeName || ""));
  const showPlan = () => {
    const id = plan();
    payPage.querySelectorAll("[data-sum]").forEach((el) => (el.hidden = el.dataset.sum !== id));
    btnText.textContent = method() === "spei" ? T.speiPay : T.pay.replace("{price}", T.plans[id].price);
    form.querySelector("[data-spei-amount]").textContent = T.plans[id].price;
    if (!user) return;
    const exp = new Date(user.serviceExpiration).getTime();
    const extend = sameAs(id) && exp > Date.now();
    untilRow.querySelector("span").textContent = T.until.replace("{date}", fmt(new Date((extend ? exp : Date.now()) + 365 * DAY))) + (extend ? ` · ${T.extend}` : "");
    untilRow.hidden = false;
  };
  // 付款方式：选中的那一种展开它的面板（银行卡填卡，SPEI 显示转账信息）
  const method = () => form.elements.method.value;
  const showMethod = () => {
    form.querySelectorAll("[data-method-panel]").forEach((el) => (el.hidden = el.dataset.methodPanel !== method()));
    showPlan();
  };
  form.addEventListener("change", (e) => (e.target.name === "plan" ? showPlan() : e.target.name === "method" && showMethod()));
  // SPEI 参考号：7 位数字，同一个浏览器标签里保持不变，转账备注要填
  let ref = sessionStorage.getItem("qrveo-spei-ref");
  if (!ref) sessionStorage.setItem("qrveo-spei-ref", (ref = String(1000000 + Math.floor(Math.random() * 9000000))));
  form.querySelector("[data-spei-ref]").textContent = ref;
  form.querySelectorAll(".copy-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const text = b.dataset.copyText || form.querySelector(b.dataset.copyFrom).textContent;
      navigator.clipboard?.writeText(b.dataset.copyText ? text : text.replace(/[^\d.]/g, "")).then(() => {
        b.textContent = T.copied;
        setTimeout(() => (b.textContent = T.copy), 1600);
      });
    }),
  );

  // 银行卡：边输入边分组、认卡组织；提交时校验
  const BRANDS = [
    ["amex", "American Express", /^3[47]/, [15], 4],
    ["visa", "Visa", /^4/, [13, 16, 19], 3],
    ["mastercard", "Mastercard", /^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/, [16], 3],
  ];
  const digits = (n) => val(n).replace(/\D/g, "");
  const brandOf = (num) => BRANDS.find((b) => b[2].test(num));
  const luhn = (num) => {
    let sum = 0;
    for (let i = 0; i < num.length; i++) {
      let d = +num[num.length - 1 - i];
      if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
      sum += d;
    }
    return sum % 10 === 0;
  };
  const cardInput = form.elements.cardnum;
  const brandTag = form.querySelector("[data-card-brand]");
  cardInput.addEventListener("input", () => {
    const num = digits("cardnum").slice(0, 19);
    const b = brandOf(num);
    // American Express 按 4-6-5 分组，其他按 4 位一组
    cardInput.value = b && b[0] === "amex" ? [num.slice(0, 4), num.slice(4, 10), num.slice(10, 15)].filter(Boolean).join(" ") : num.replace(/(\d{4})(?=\d)/g, "$1 ");
    brandTag.textContent = b ? b[1] : "";
    brandTag.dataset.brand = b ? b[0] : "";
    form.elements.cardcvc.maxLength = b ? b[4] : 4;
  });
  form.elements.cardexp.addEventListener("input", (e) => {
    let d = digits("cardexp").slice(0, 4);
    if (d.length === 1 && d > "1") d = `0${d}`; // 输入 8 → 08
    e.target.value = d.length > 2 || (d.length === 2 && e.inputType !== "deleteContentBackward") ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
  });
  form.elements.cardcvc.addEventListener("input", (e) => (e.target.value = digits("cardcvc")));
  const cardRules = () => {
    const num = digits("cardnum");
    const b = brandOf(num);
    const [mm, yy] = [digits("cardexp").slice(0, 2), digits("cardexp").slice(2)];
    const now = new Date();
    const expOk = /^(0[1-9]|1[0-2])$/.test(mm) && yy.length === 2;
    const notPast = expOk && new Date(2000 + +yy, +mm, 1) > now;
    return [
      ["cardnum", num.length >= 12 && (b ? b[3].includes(num.length) && luhn(num) : false), b || num.length < 12 ? T.cardBad : T.cardBrandBad],
      ["cardname", !!val("cardname"), T.required],
      ["cardexp", notPast, expOk ? T.expPast : T.expBad],
      ["cardcvc", digits("cardcvc").length === (b ? b[4] : 3), T.cvcBad],
    ];
  };
  showMethod();

  // 登录后回到这一页（带着选好的套餐）
  const back = () => {
    const u = new URL(location.href);
    u.searchParams.set("plan", plan());
    return u.pathname + u.search;
  };
  payPage.querySelectorAll("[data-pay-return]").forEach((a) => a.addEventListener("click", () => (a.href = `${a.href.split("?")[0]}?return=${encodeURIComponent(back())}`)));
  const needLogin = (text) => {
    clearToken();
    user = null;
    form.hidden = true;
    login.hidden = false;
    const p = login.querySelector("p");
    if (text) p.textContent = text;
  };

  const token = readToken();
  if (!token) needLogin();
  else
    api("/user/get-user", { token })
      .then((j) => {
        if (!ok(j)) throw Object.assign(new Error(""), { status: 401 });
        user = dataOf(j);
        form.querySelector("[data-pay-account]").textContent = user.email || user.name || "";
        if (!form.elements.name.value) form.elements.name.value = user.company || user.name || "";
        if (!form.elements.email.value) form.elements.email.value = user.email || "";
        if (!form.elements.phone.value) form.elements.phone.value = user.telephone || "";
        form.hidden = false;
        showPlan();
      })
      .catch((e) => (e.network ? (form.hidden = false, say(T.network)) : needLogin()));

  payPage.querySelector("[data-pay-logout]").addEventListener("click", async () => {
    await api("/auth/logout", { method: "POST", token: readToken() }).catch(() => {});
    needLogin();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    say("");
    form.elements.rfc.value = val("rfc").toUpperCase().replace(/\s+/g, "");
    const rules = [
      ["name", !!val("name"), T.required],
      ["email", EMAIL.test(val("email")), T.email],
      ["rfc", !val("rfc") || RFC.test(val("rfc")), T.rfcBad],
      ...(method() === "card" ? cardRules() : []),
    ];
    let first = null;
    for (const [name, good, text] of rules) {
      fieldErr(name, good ? "" : text);
      if (!good && !first) first = form.elements[name];
    }
    if (first) return first.focus();
    btn.disabled = true;
    btnText.textContent = btn.dataset.busy;
    try {
      const billing = { name: val("name"), email: val("email") };
      if (val("rfc")) billing.rfc = val("rfc");
      if (val("phone")) billing.phone = val("phone");
      // 卡号和安全码不出浏览器：后台只拿到卡组织和后四位
      const num = digits("cardnum");
      const pay = method() === "card" ? { card: { brand: brandOf(num)[0], last4: num.slice(-4), exp: digits("cardexp").replace(/^(\d\d)(\d\d)$/, "$1/$2"), holder: val("cardname") } } : { spei: { reference: ref } };
      const j = await api("/billing/demo-checkout", { method: "POST", token: readToken(), body: { plan: plan(), method: method(), billing, ...pay } });
      if (!ok(j)) throw Object.assign(new Error(j.message || ""), { status: j.statusCode });
      const d = dataOf(j);
      const done = payPage.querySelector("[data-pay-done]");
      const exp = d.serviceExpiration ? new Date(d.serviceExpiration) : new Date(Date.now() + 365 * DAY);
      const order = d.orderNo || d.orderId || d.order_no || (d.order && (d.order.orderNo || d.order.id)) || "";
      done.querySelector("[data-done-title]").textContent = T.doneTitle.replace("{plan}", T.plans[plan()].name);
      done.querySelector("[data-done-text]").textContent = T.doneText.replace("{date}", fmt(exp));
      done.querySelector("[data-done-order]").textContent = order;
      done.querySelector("[data-done-paid]").textContent = pay.card
        ? T.paidWith.replace("{brand}", brandOf(num)[1]).replace("{last4}", pay.card.last4)
        : T.paidSpei.replace("{ref}", ref);
      ["cardnum", "cardcvc"].forEach((n) => (form.elements[n].value = ""));
      done.querySelector(".pay-done-order").hidden = !order;
      done.querySelector('[data-console="panel"]').href = panelUrl();
      untilRow.querySelector("span").textContent = T.until.replace("{date}", fmt(exp));
      payPage.querySelector("[data-pay-head]").hidden = true;
      form.hidden = true;
      done.hidden = false;
      done.focus();
      scrollTo({ top: 0, behavior: "instant" });
    } catch (err) {
      // 有的错误是 HTTP 200 + 业务码，所以 HTTP 状态不是错误码时看业务码
      const s = err.status >= 400 ? err.status : err.num || err.status;
      // 400 时后台在 errors 里按字段给出原因（例如 email、billing.rfc）；用我们自己的多语言提示标到对应输入框
      const bad = Object.keys((s === 400 && err.errors) || {}).map((k) => k.replace(/^billing\./, ""));
      const known = { name: T.required, email: T.email, rfc: T.rfcBad };
      bad.filter((k) => known[k]).forEach((k) => fieldErr(k, known[k]));
      if (s === 401) needLogin(T.session);
      else if (bad.some((k) => known[k])) form.elements[bad.find((k) => known[k])].focus();
      else say(err.network ? T.network : s === 403 ? T.child : s === 404 || s === 409 ? T.off : T.generic);
      btn.disabled = false;
      showPlan();
    }
  });
}
