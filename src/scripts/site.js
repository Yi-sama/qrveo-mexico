// QRveo 官网的浏览器脚本：控制台链接、示例二维码、首屏短片、套餐选择、贴纸动画。
import qrcode from "./qrcode.mjs";

const RUNTIME = window.__VOD_PRIVATE__ || {};
const DEV = window.__QRVEO_DEV__ || {};
const ROUTES = { register: "/#/register", login: "/#/login", upgrade: "/#/secure/upgrade", panel: "/#/secure/overview" };
const LANG = (document.documentElement.lang || "es").slice(0, 2);

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
  const fixed = document.querySelector('meta[name="qrveo-demo"]')?.content;
  if (fixed) return fixed;
  const link = document.querySelector("a[data-demo]");
  return lanify(link ? link.href : "ejemplo/");
}

const demo = demoUrl();
document.querySelectorAll("[data-qr]").forEach((el) => {
  el.innerHTML = qrSvg(demo);
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

// 6 · 离开首屏后才出现 WhatsApp 浮动按钮
const wa = document.querySelector("[data-wa-float]");
const hero = document.querySelector(".hero");
if (wa && hero) {
  new IntersectionObserver(([e]) => wa.classList.toggle("is-on", !e.isIntersecting), {
    rootMargin: "0px 0px -35% 0px",
  }).observe(hero);
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
  langBox.querySelectorAll("[data-set-lang]").forEach((a) =>
    a.addEventListener("click", () => {
      try {
        localStorage.setItem("vqr-lang", a.dataset.setLang);
      } catch {
        /* 无痕模式下忽略 */
      }
    }),
  );

  // 第一次来、浏览器语言和本页不同：顶部轻轻提示一次，可以关掉
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
    a.addEventListener("click", () => localStorage.setItem("vqr-lang", pick.dataset.setLang));
    x.addEventListener("click", () => {
      bar.remove();
      try {
        localStorage.setItem("vqr-lang", LANG);
      } catch {
        /* 忽略 */
      }
    });
    document.querySelector("[data-topbar]")?.after(bar);
  }
}

// 17 · 账号：官网的注册 / 登录 / 找回密码直接调用后台 /auth 接口（字段与控制台的表单一致），
// 成功后把令牌写进 x-auth-token cookie（正式环境写到 .qrveo.com，官网和控制台都能读到），再打开控制台
const API = String(RUNTIME.apiOrigin || "https://api.qrveo.com").replace(/\/$/, "");
const CONSOLE_HOME = consoleOrigin || "https://console.qrveo.com";
const TOKEN = "x-auth-token";
const readToken = () => {
  const m = document.cookie.match(/(?:^|;\s*)x-auth-token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
};
const cookieTail = () =>
  `; Path=/; SameSite=Lax${/(^|\.)qrveo\.com$/.test(location.hostname) ? "; Domain=.qrveo.com" : ""}${location.protocol === "https:" ? "; Secure" : ""}`;
const writeToken = (t) => (document.cookie = `${TOKEN}=${encodeURIComponent(t)}${cookieTail()}; Max-Age=${7 * 86400}`);
const clearToken = () => {
  document.cookie = `${TOKEN}=${cookieTail()}; Max-Age=0`;
  document.cookie = `${TOKEN}=; Path=/; Max-Age=0`;
};
const panelUrl = () => `${CONSOLE_HOME}${ROUTES.panel}?from=official&lang=${LANG}`;
document.querySelectorAll('[data-console="panel"]').forEach((a) => (a.href = panelUrl()));

// 已登录：顶栏的“登录”换成“我的面板”
if (readToken()) {
  document.querySelectorAll("[data-panel-label]").forEach((a) => {
    a.textContent = a.dataset.panelLabel;
    a.href = panelUrl();
  });
}

async function api(path, { method = "GET", body, token } = {}) {
  const headers = { "Accept-Language": LANG };
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
  if (bad) throw Object.assign(new Error(j.message || j.msg || ""), { status: res.status, code: j.errorCode || j.code });
  return j || {};
}
const dataOf = (j) => (j && j.data && typeof j.data === "object" ? j.data : j) || {};

// 登录成功后去哪：带 ?return= 进来（例如旧官网的上传页）且是本站地址就回去，否则进控制台
function afterLogin(token) {
  writeToken(token);
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
  setTimeout(() => location.assign(next), 600);
}

const authPage = document.querySelector("[data-auth-page]");
if (authPage) {
  const T = JSON.parse(document.getElementById("auth-text").textContent);
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PASSWORD = /^(?=.*[A-Za-z])(?=.*\d).{8,16}$/;

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
          if (token) afterLogin(token);
          else setTimeout(() => location.assign(`${authPage.querySelector('[data-auth="login"]').href}?email=${encodeURIComponent(val("email"))}`), 900);
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
      // 图形验证码：控制台登录页每次都要，官网照做；拿不到就不显示
      const loadCaptcha = async () => {
        try {
          const d = dataOf(await api(`/auth/kaptcha?t=${Date.now()}`));
          const img = String(d.imgBase64 || d.img || "");
          if (!img) return;
          capImg.src = img.startsWith("data:") ? img : img.trim().startsWith("<") ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(img)}` : `data:image/png;base64,${img}`;
          captchaId = d.captchaId || "";
          form.elements.captcha.value = "";
          capRow.hidden = false;
        } catch {
          /* 后台没开验证码时忽略 */
        }
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
        say("");
        const ok = check([
          ["email", EMAIL.test(val("email")), T.email],
          ["password", !!form.elements.password.value, T.required],
          ["captcha", !!val("captcha"), T.captcha],
        ]);
        if (!ok) return;
        busy(true);
        try {
          const j = await api("/auth/login", {
            method: "POST",
            body: { email: val("email"), password: form.elements.password.value, captcha: val("captcha"), captchaId },
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
