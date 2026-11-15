// 生成器（/crear-qr/）：网址二维码 + 免注册视频试用。舞台上的贴纸就是下载的文件（同一个 SVG）。
// 视频试用接口见 qrveo-site/给后端的任务-免注册视频试用码.md；接口还没上线时退回“本地预览 + 注册”。
import { qrMetricsContext, trackSiteEvent, trackVideoFailure } from "./site-metrics.mjs?v=__SITE_METRICS_VERSION__";
import { putVideo } from "./qr-upload.mjs";

export function normalizeQrUrl(value) {
  const text = String(value).trim();
  if (!/^https?:\/\//i.test(text)) throw new Error("url");
  let url;
  try { url = new URL(text); } catch { throw new Error("url"); }
  if (!url.hostname || url.username || url.password || url.href.length > 600) throw new Error("url");
  return url.href;
}

export function validateMatrix(matrix) {
  if (!matrix || !Number.isInteger(matrix.size) || matrix.size < 21 || matrix.size > 177 ||
      (matrix.size - 21) % 4 !== 0 || !Array.isArray(matrix.rows) || matrix.rows.length !== matrix.size ||
      matrix.rows.some(row => typeof row !== "string" || row.length !== matrix.size || /[^01]/.test(row))) {
    throw new Error("service");
  }
  return matrix;
}

export async function generateQr(api, token, value) {
  const url = normalizeQrUrl(value);
  const metrics = qrMetricsContext();
  const response = await api("/free-qr/url", { method: "POST", token, body: { url, ...(metrics ? { metrics } : {}) } });
  const result = response.data;
  if (!result || result.url !== url || !result.quota) throw new Error("service");
  validateMatrix(result.matrix);
  return result;
}

export function isReadableColor(color) {
  if (!/^#[a-f0-9]{6}$/i.test(color)) return false;
  const rgb = color.slice(1).match(/../g).map((hex) => {
    const value = parseInt(hex, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] + 0.05) >= 4.5;
}

const xml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
})[char]);

// 标签文字：短的一行；长的在最靠近中间的空格处断成两行，两行长度接近（中日韩文字没有空格就按字数对半分）
export function captionLines(value) {
  // 已经分好两行（首页贴纸的 sticker1 / sticker2）就照原样用
  const given = String(value).split("\n").map((line) => line.trim()).filter(Boolean);
  if (given.length > 1) return given.slice(0, 2);
  const chars = Array.from(String(value).trim().replace(/\s+/g, " ")).slice(0, 48);
  if (chars.length <= 16) return chars.length ? [chars.join("")] : [];
  const mid = chars.length / 2;
  let cut = -1;
  chars.forEach((ch, i) => { if (ch === " " && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i; });
  if (cut < 0 || Math.abs(cut - mid) > chars.length * 0.3) cut = Math.ceil(mid);
  return [chars.slice(0, cut).join("").trim(), chars.slice(cut).join("").trim()];
}

// 码点：服务器给的矩阵，或者本地二维码库（只用于展示，比如注册页上的“你的二维码”）
function modules(value, matrix, qrcode) {
  if (matrix) return { n: validateMatrix(matrix).size, dark: (r, c) => matrix.rows[r][c] === "1" };
  const qr = qrcode(0, "H");
  qr.addData(value);
  qr.make();
  return { n: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) };
}

// 贴纸：和首页落版的橙色贴纸同一个样子（圆角色块 + 白色码窗 + 下方两行字）。
// value 为空时画一张“码还没印上”的空贴纸，只有三个定位角。
export function createQrSvg(value, { color = "#141210", label = "#ff5a1f", logo = "", template = "product", caption = "", matrix } = {}, qrcode) {
  const blank = value == null;
  const url = blank ? "" : normalizeQrUrl(value);
  if (!isReadableColor(color)) throw new Error("color");
  if (template !== "none" && !/^#[a-f0-9]{6}$/i.test(label)) throw new Error("color");
  if (logo && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(logo)) throw new Error("logo");
  const m = blank ? null : modules(url, matrix, qrcode);
  const n = blank ? 29 : m.n, size = n + 8;
  let path = "";
  if (blank) {
    for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      path += `M${x + 4} ${y + 4}h7v7h-7zM${x + 5} ${y + 5}v5h5v-5zM${x + 6} ${y + 6}h3v3h-3z`;
    }
  } else {
    for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) if (m.dark(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`;
  }
  const logoSize = n * 0.15, logoX = (size - logoSize) / 2;
  const code = `<rect width="${size}" height="${size}" fill="#fff"/><g class="qr-mods"><path d="${path}" fill="${color}"${blank ? ' fill-rule="evenodd" opacity=".35"' : ' shape-rendering="crispEdges"'}/>
${logo ? `<rect x="${logoX - 0.7}" y="${logoX - 0.7}" width="${logoSize + 1.4}" height="${logoSize + 1.4}" fill="#fff"/><image x="${logoX}" y="${logoX}" width="${logoSize}" height="${logoSize}" href="${logo}"/>` : ""}</g>`;
  if (template === "none") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR">${code}</svg>`;
  }
  const lines = captionLines(caption);
  // 字号按最长一行缩放，保证不超出 688 宽的标签（中日韩等宽字符按 1.7 个算）
  const longest = Math.max(1, ...lines.map((line) => Array.from(line).reduce((w, ch) => w + (/[⺀-￯]/.test(ch) ? 1.7 : 1), 0)));
  const fs = Math.min(lines.length > 1 ? 52 : 60, Math.floor(1040 / longest));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000" role="img" aria-label="QR">
<rect width="800" height="1000" rx="64" fill="${label}"/>
<rect x="56" y="56" width="688" height="688" rx="28" fill="#fff"/>
<svg x="76" y="76" width="648" height="648" viewBox="0 0 ${size} ${size}">${code}</svg>
${lines.map((line, i) => `<text x="400" y="${(lines.length > 1 ? 838 : 868) + i * 62}" text-anchor="middle" font-family="Archivo, 'Arial Black', Arial, sans-serif" font-size="${fs}" font-weight="800" fill="#fff">${xml(line.toUpperCase())}</text>`).join("")}
</svg>`;
}

// 最近一次做的二维码：只存在这个浏览器里，注册 / 登录页拿来显示“你的二维码”，登录后用来认领试用视频
export const LAST_QR = "qrveo-last-qr";
export function readLastQr() {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_QR) || "null");
    if (!last) return null;
    if (last.kind === "video" && last.expiresAt && Date.parse(last.expiresAt) < Date.now()) return null;
    if (last.kind === "url" && Date.now() - (last.at || 0) > 7 * 86400e3) return null;
    return last;
  } catch { return null; }
}
const saveLastQr = (data) => { try { localStorage.setItem(LAST_QR, JSON.stringify({ ...data, at: Date.now() })); } catch { /* 隐私模式 */ } };
export const clearLastQr = () => { try { localStorage.removeItem(LAST_QR); } catch { /* 隐私模式 */ } };

const DRAFT_KEY = "qrveo-generator-draft";
const DRAFT_TTL = 60 * 60e3;
// File cannot live in sessionStorage. Commit its IndexedDB transaction before navigating.
function editDraft(work) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DRAFT_KEY, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error("draft")); };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      let transaction, result;
      try {
        transaction = db.transaction("drafts", "readwrite");
        transaction.oncomplete = () => { db.close(); resolve(result); };
        transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error || new Error("draft")); };
        work(transaction.objectStore("drafts"), value => { result = value; });
      } catch (error) {
        if (transaction) transaction.abort();
        db.close();
        reject(error);
      }
    };
  });
}
async function saveVideoDraft(data) {
  const id = sessionStorage.getItem(DRAFT_KEY) || crypto.randomUUID();
  sessionStorage.setItem(DRAFT_KEY, id);
  await editDraft(store => {
    const now = Date.now();
    store.put({ ...data, at: now }, id);
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return;
      if (now - (row.value.at || 0) > DRAFT_TTL) row.delete();
      row.continue();
    };
  });
}
async function takeVideoDraft() {
  let id;
  try { id = sessionStorage.getItem(DRAFT_KEY); } catch { return null; }
  if (!id) return null;
  return editDraft((store, result) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const draft = request.result;
      result(draft && Date.now() - draft.at <= DRAFT_TTL ? draft : null);
    };
    store.delete(id);
  });
}

// 与后端一致：50 MB 按十进制算；类型按扩展名定（有的系统给 .mov 的 type 是空的）
const TRIAL = { maxBytes: 50_000_000, maxSeconds: 60, types: { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } };
export function formatUploadSize(bytes) {
  if (bytes >= 1024 ** 2 && bytes % (1024 ** 2) === 0) return `${bytes / 1024 ** 2} MiB`;
  return `${Math.floor(bytes / 100000) / 10} MB`;
}
// 浏览器的试用令牌：换视频时必须复用，认领后也保留（下一个试用视频还用它）
const TRIAL_TOKEN = "qrveo-trial-token";
const readTrialToken = () => { try { return localStorage.getItem(TRIAL_TOKEN) || ""; } catch { return ""; } };
const saveTrialToken = (t) => { try { localStorage.setItem(TRIAL_TOKEN, t); } catch { /* 隐私模式 */ } };
const trialType = (f) => TRIAL.types[(/\.([a-z0-9]+)$/i.exec(f.name) || [])[1]?.toLowerCase()] || (Object.values(TRIAL.types).includes(f.type) ? f.type : "");

export async function initQrGenerator({ qrcode, readToken, clearToken, consoleHome, lang, api }) {
  const root = document.querySelector("[data-qr-generator]");
  if (!root) return;
  const T = JSON.parse(root.querySelector("[data-qr-text]").textContent);
  const find = (selector) => root.querySelector(selector);
  const desk = find("[data-qr-desk]"), slot = find("[data-desk-sticker]"), pointer = find("[data-desk-pointer]");
  const demoSticker = slot.innerHTML;
  const cap = find("[data-desk-cap]"), example = find("[data-desk-example]");
  const form = find("[data-qr-form]"), input = form.elements.url;
  const message = find("[data-qr-message]"), downloads = find("[data-qr-downloads]");
  const remaining = find("[data-qr-remaining]");
  const colorInput = form.elements.color, captionInput = form.elements.caption;
  const template = () => form.elements.template.value;
  const styleBlock = find("[data-qr-style]");
  let mode = "video";
  // 用户动过样式后，视频模式不再显示示例贴纸，改成跟着样式变的空贴纸（和网址页一样）
  let styleTouched = false;
  let current = "", svg = "", logo = "", matrix, busy = false, logoLoading = false, logoVersion = 0, quotaVersion = 0;
  let qrColor = "#141210", labelColor = "#ff5a1f";
  const say = (text = "", error = false) => {
    message.textContent = text;
    message.hidden = !text;
    message.dataset.error = String(error);
  };
  const errorText = (error) => T.errors[({
    FREE_QR_LIMIT: "limit", INVALID_QR_URL: "url", AUTH_REQUIRED: "session", SERVICE_UNAVAILABLE: "service",
  })[error.code] || error.message] || T.errors.generic;
  const showQuota = (quota) => {
    remaining.textContent = quota.limit === null ? T.unlimited : T.remaining.replace("{remaining}", String(quota.remaining));
    remaining.hidden = !remaining.textContent;
  };
  const updateRemaining = async () => {
    const version = ++quotaVersion;
    try {
      const response = await api("/free-qr/quota", { token: readToken() });
      if (version === quotaVersion) showQuota(response.data);
    } catch (error) {
      // 查不到额度（断网、服务端暂时不可用）就不显示这一行，不能显示成“生成失败”
      if (version === quotaVersion) remaining.textContent = "";
    }
  };

  // —— 舞台 ——
  const put = (html, { tpl = "product", print = false } = {}) => {
    slot.innerHTML = html;
    slot.dataset.template = tpl;
    if (print) {
      slot.classList.remove("is-printing");
      void slot.offsetWidth;
      slot.classList.add("is-printing");
    }
  };
  const caption = (text, showExample = false) => {
    cap.textContent = text;
    example.hidden = !showExample;
  };
  const style = () => ({ color: qrColor, label: labelColor, logo, template: template(), caption: captionInput.value });

  // 网址模式：没生成前是空贴纸（实时跟着标签、颜色变），生成后印上真码
  const drawUrl = (print = false) => {
    pointer.hidden = !current;
    if (current) {
      svg = createQrSvg(current, { ...style(), matrix }, qrcode);
      put(svg, { tpl: template(), print });
      let same = false;
      try { same = normalizeQrUrl(input.value) === current; } catch { /* 改过的网址要重新生成 */ }
      downloads.hidden = !same || logoLoading;
      find("[data-qr-open]").href = current;
      caption(""); // 舞台上的标签已经指着贴纸，下面不再重复
    } else {
      put(createQrSvg(null, style(), qrcode), { tpl: template() });
      downloads.hidden = true;
      caption(T.emptyCap);
    }
  };
  const redraw = () => {
    if (mode === "video") { styleTouched = true; trialStage(); return; }
    if (mode !== "url") return;
    try { drawUrl(); say(); } catch (error) { downloads.hidden = true; say(errorText(error), true); }
  };

  const setMode = (next) => {
    mode = next === "url" ? "url" : "video";
    root.querySelectorAll("[data-qr-tab]").forEach((tab) => {
      const active = tab.dataset.qrTab === mode;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    root.querySelectorAll("[data-qr-panel]").forEach((panel) => (panel.hidden = panel.dataset.qrPanel !== mode));
    desk.dataset.mode = mode;
    // 样式控件只有一套：跟着当前模式搬到网址步骤里或视频结果卡里
    root.querySelector(`[data-style-slot="${mode}"]`).append(styleBlock);
    if (mode === "url") {
      drawUrl();
    } else {
      downloads.hidden = true;
      trialStage();
    }
    const url = new URL(location.href);
    url.searchParams.set("tipo", mode);
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  };
  const tabs = [...root.querySelectorAll("[data-qr-tab]")];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setMode(tab.dataset.qrTab));
    tab.addEventListener("keydown", (event) => {
      let target;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") target = tabs[1 - index];
      if (event.key === "Home") target = tabs[0];
      if (event.key === "End") target = tabs[tabs.length - 1];
      if (!target) return;
      event.preventDefault();
      setMode(target.dataset.qrTab);
      target.focus();
    });
  });

  // —— 网址二维码 ——
  const urlError = find("[data-qr-url-error]");
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    urlError.hidden = true;
    if (!current) return;
    let same = false;
    try { same = normalizeQrUrl(input.value) === current; } catch { /* 网址还没改完 */ }
    downloads.hidden = !same;
    say(same ? "" : T.changed);
  });
  const swatches = [...root.querySelectorAll("[data-qr-color]")];
  const custom = colorInput.closest(".gen-swatch-custom");
  const pickColor = (ink, label, button) => {
    if (!isReadableColor(ink)) return say(T.errors.color, true);
    qrColor = ink;
    labelColor = label;
    swatches.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    custom.classList.toggle("is-on", !button);
    redraw();
  };
  swatches.forEach((button) => button.addEventListener("click", () => pickColor(button.dataset.qrColor, button.dataset.qrLabel, button)));
  colorInput.addEventListener("input", () => pickColor(colorInput.value, colorInput.value, null));
  const captionField = find("[data-qr-caption-field]");
  root.querySelectorAll('input[name="template"]').forEach((radio) => radio.addEventListener("change", () => {
    const labelled = template() !== "none";
    captionField.hidden = !labelled;
    if (labelled) captionInput.value = T.captions[template()];
    redraw();
  }));
  captionInput.addEventListener("input", redraw);
  form.elements.logo.addEventListener("change", async () => {
    const file = form.elements.logo.files[0], version = ++logoVersion;
    if (!file) { logoLoading = false; redraw(); return; }
    logoLoading = true;
    downloads.hidden = true;
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("logo");
      const bitmap = await createImageBitmap(file);
      if (version !== logoVersion) { bitmap.close(); return; }
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d");
      const scale = Math.min(256 / bitmap.width, 256 / bitmap.height);
      context.drawImage(bitmap, (256 - bitmap.width * scale) / 2, (256 - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
      bitmap.close();
      logo = canvas.toDataURL("image/png");
      find("[data-qr-logo-name]").textContent = file.name;
      find("[data-qr-logo-remove]").hidden = false;
      logoLoading = false;
      redraw();
    } catch {
      if (version === logoVersion) {
        logoLoading = false;
        form.elements.logo.value = "";
        redraw();
        say(T.errors.logo, true);
      }
    }
  });
  find("[data-qr-logo-remove]").addEventListener("click", () => {
    logoVersion++;
    logoLoading = false;
    logo = "";
    form.elements.logo.value = "";
    find("[data-qr-logo-name]").textContent = T.logoHint;
    find("[data-qr-logo-remove]").hidden = true;
    redraw();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || logoLoading) return;
    busy = true;
    const controls = [...form.elements];
    controls.forEach((control) => (control.disabled = true));
    form.setAttribute("aria-busy", "true");
    say();
    try {
      const url = normalizeQrUrl(input.value);
      createQrSvg(url, style(), qrcode);
      const result = await generateQr(api, readToken(), url);
      current = result.url;
      matrix = result.matrix;
      input.value = current;
      quotaVersion++;
      showQuota(result.quota);
      drawUrl(true);
      saveLastQr({ kind: "url", url: current, ...style(), logo: "" });
      say(T.ready);
      if (matchMedia("(max-width: 900px)").matches) desk.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      // 网址不对：提示放在网址框下面（和视频页一样，错在哪一步就提示在哪一步）
      if (error.message === "url") {
        urlError.textContent = errorText(error);
        urlError.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.focus();
      } else say(errorText(error), true);
    } finally {
      busy = false;
      controls.forEach((control) => (control.disabled = false));
      form.removeAttribute("aria-busy");
      if (!current || message.dataset.error === "true") updateRemaining();
    }
  });
  // 视频试用码固定是带标签的贴纸
  let trialSvg = "";
  const art = () => ({ svg: mode === "url" ? svg : trialSvg, tpl: template() });
  const save = (blob, extension) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `qrveo-${art().tpl}.${extension}`;
    anchor.click();
    void trackSiteEvent("qr_download", { kind: mode, format: extension });
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  root.querySelectorAll("[data-qr-download]").forEach((button) => button.addEventListener("click", async () => {
    const { svg, tpl } = art();
    if (!svg || downloads.hidden) return;
    button.disabled = true;
    try {
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      if (button.dataset.qrDownload === "svg") save(blob, "svg");
      else {
        const source = URL.createObjectURL(blob);
        try {
          const image = new Image();
          image.src = source;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 1600;
          canvas.height = tpl === "none" ? 1600 : 2000;
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          if (!png) throw new Error("generic");
          save(png, "png");
        } finally { URL.revokeObjectURL(source); }
      }
    } catch (error) { say(errorText(error), true); }
    finally { button.disabled = false; }
  }));

  // —— 视频试用 ——
  const V = (selector) => root.querySelector(`[data-trial-${selector}]`);
  const vform = V("form"), drop = V("drop"), fileInput = V("file"), picked = V("picked");
  const progress = V("progress"), captchaRow = V("captcha"), submit = V("submit"), vmsg = V("msg");
  const ready = V("ready"), expiry = V("expiry"), keep = V("keep");
  const phoneVideo = root.querySelector("[data-desk-video]"), poster = root.querySelector("[data-desk-poster]");
  const uploadUrl = `${consoleHome}/#/secure/upload?from=official&lang=${lang}`;
  let memberToken = readToken();
  let member = !!memberToken;
  let memberLimits = null, limitsRequest, trialLimits, trialLimitsRequest;
  const useTrial = () => {
    if (readToken() !== memberToken) return false;
    clearToken?.();
    memberToken = "";
    member = false;
    memberLimits = null;
    ready.querySelector(".gen-keep").hidden = false;
    V("again-back").querySelector("p").hidden = false;
    return true;
  };
  const accountToken = () => {
    if (readToken() !== memberToken) throw Object.assign(new Error("session"), { code: "AUTH_REQUIRED" });
    return memberToken;
  };
  const loadMemberLimits = () => limitsRequest ||= Promise.resolve()
    .then(() => api("/member-video/limits", { token: accountToken() }))
    .then(({ data }) => {
      if (!data?.userId || !Number.isSafeInteger(data.maxBytes) || data.maxBytes < 1 || !data.quota) throw new Error("service");
      memberLimits = data;
      drop.querySelector(".gen-note").textContent = T.memberLimits.replace("{max}", fmtSize(data.maxBytes));
      V("quota").textContent = data.quota.limit === null ? T.unlimited : T.remaining.replace("{remaining}", String(data.quota.remaining));
      return data;
    }).catch(error => {
      limitsRequest = null;
      if (error.code === "AUTH_REQUIRED" && !trial?.videoId && useTrial()) return loadTrialQuota();
      throw error;
    });
  const loadTrialQuota = () => {
    if (member) return Promise.resolve();
    return trialLimitsRequest ||= api("/trial/quota").then(({ data }) => {
      if (!data || !(data.limit === null && data.remaining === null ||
          Number.isInteger(data.remaining) && Number.isInteger(data.limit)) ||
          !Number.isSafeInteger(data.maxBytes) || data.maxBytes < 1 ||
          !(data.maxSeconds === null || Number.isSafeInteger(data.maxSeconds) && data.maxSeconds >= 1)) throw new Error("service");
      trialLimits = data;
      V("quota").textContent = data.limit === null ? T.unlimited
        : T.trialRemaining.replace("{remaining}", String(Math.max(0, data.remaining))).replace("{limit}", String(data.limit));
      drop.querySelector(".gen-note").textContent = (data.maxSeconds === null ? T.memberLimits : T.dropLimits)
        .replace("{max}", formatUploadSize(data.maxBytes)).replace("{seconds}", String(data.maxSeconds));
      return data;
    }).catch(error => { trialLimitsRequest = null; throw error; });
  };
  let file = null, blobUrl = "", captchaId = "", trial = null, pollTimer = 0, tickTimer = 0, uploading = false, fallback = false, againMode = false;
  let selectionDone = Promise.resolve(), uploadDone = Promise.resolve();

  const vsay = (text = "", error = false) => {
    vmsg.textContent = text;
    vmsg.hidden = !text;
    vmsg.dataset.error = String(error);
  };
  const authLinks = (withReturn) => root.querySelectorAll("[data-qr-video-auth]").forEach((link) => {
    const target = new URL(link.href);
    if (withReturn) target.searchParams.set("return", uploadUrl);
    else target.searchParams.delete("return");
    link.href = target.href;
  });
  const setProgress = (p) => {
    progress.hidden = p == null;
    if (p != null) progress.style.setProperty("--p", `${p}%`);
  };
  // 手机：全屏放视频。优先本地文件；本地文件没了（刷新、回到页面）就放后端给的转码视频（playUrl）；
  // 后端还没给地址时显示“你的视频”占位，不放示例，免得以为是别人的视频。都没有才放示例
  let trialLive = false;
  const playLocal = () => {
    const title = root.querySelector("[data-desk-title]");
    // “放大播放”按钮（hero-player.mjs）只认手机里的 <video>：没有可放的视频时先藏起来
    const opener = root.querySelector("[data-desk-expand]");
    const hideOpener = (hide) => {
      if (!opener) return;
      if (hide && !opener.hidden) { opener.hidden = true; opener.dataset.liveHidden = "1"; }
      if (!hide && opener.dataset.liveHidden) { opener.hidden = false; delete opener.dataset.liveHidden; }
    };
    const mine = !blobUrl && trial && trial.watchUrl;
    title.dataset.demo ||= title.textContent;
    const stem = (name) => name.replace(/\.[^.]+$/, "");
    title.textContent = blobUrl && file ? stem(file.name) : mine ? (trial.name && stem(trial.name)) || T.phoneMine : title.dataset.demo;
    const src = blobUrl || (mine ? (trialLive && trial.playUrl) || "" : matchMedia("(prefers-reduced-motion: reduce)").matches ? "" : phoneVideo.dataset.demoSrc);
    if (!src) {
      phoneVideo.pause();
      phoneVideo.hidden = true;
      phoneVideo.removeAttribute("src");
      // 自己的视频还拿不到地址：深色屏幕只留标题；示例在减少动态时才显示封面
      poster.hidden = !!mine;
      hideOpener(true);
      return;
    }
    hideOpener(false);
    if (phoneVideo.getAttribute("src") !== src) {
      phoneVideo.src = src;
      if (mine && trial.posterUrl) phoneVideo.poster = trial.posterUrl;
    }
    phoneVideo.hidden = false;
    poster.hidden = true;
    phoneVideo.play().catch(() => { /* 自动播放被拦就停在第一帧 */ });
  };
  // 舞台：只有转码成功才印上真码；选好视频或恢复处理中记录时都显示空贴纸。
  // 样式（标签、文字、颜色、Logo）和网址二维码共用一套控件
  function trialStage(print = false) {
    trialSvg = "";
    downloads.hidden = true;
    if (trialLive && trial && trial.watchUrl) {
      trialSvg = createQrSvg(trial.watchUrl, style(), qrcode);
      put(trialSvg, { tpl: template(), print });
      caption("");
      downloads.hidden = false;
      find("[data-qr-open]").href = trial.watchUrl;
      pointer.hidden = false;
    } else if (file || trial) {
      put(createQrSvg(null, style(), qrcode), { tpl: template() });
      caption(trial ? T.trialProcessing : T.trialLocal);
      pointer.hidden = true;
    } else if (styleTouched) {
      put(createQrSvg(null, style(), qrcode), { tpl: template() });
      caption(T.emptyCap);
      pointer.hidden = true;
    } else {
      put(demoSticker);
      caption(T.videoExample, true);
      pointer.hidden = true;
    }
    playLocal();
  }
  // 三步和网址页一样一直在：① 选视频 ② 贴纸样式 ③ 生成（生成后③原地变成“保留视频”）
  const view = (state) => {
    const before = state === "idle" || state === "picked";
    drop.hidden = state !== "idle";
    picked.hidden = state === "idle";
    captchaRow.hidden = state !== "picked" || !captchaId;
    submit.hidden = !before;
    submit.disabled = state !== "picked";
    ready.hidden = state !== "ready";
    keep.hidden = state !== "fallback";
    root.querySelector("[data-trial-remove]").hidden = state !== "picked";
    V("again").hidden = state !== "ready";
    V("quota").hidden = !before || !V("quota").textContent;
    V("keepnote").hidden = member || state === "ready";
    V("again-back").hidden = !(againMode && (state === "idle" || state === "picked"));
  };
  // 后端验证码 180 秒过期：还没提交就每 150 秒自动换一张，免得用户填了一张已经失效的
  let captchaTimer = 0;
  const loadCaptcha = async () => {
    clearTimeout(captchaTimer);
    if (member) return;
    try {
      const d = (await api(`/auth/kaptcha?t=${Date.now()}`)).data || {};
      if (d.enabled === false) {
        captchaId = "";
        captchaRow.hidden = true;
        vform.elements.captcha.value = "";
        return;
      }
      const img = String(d.imgBase64 || d.img || "");
      if (!img) return;
      V("captcha-img").src = img.startsWith("data:") ? img : img.trim().startsWith("<") ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(img)}` : `data:image/png;base64,${img}`;
      captchaId = d.captchaId || "";
      vform.elements.captcha.value = "";
      if (file && !uploading && !trial) captchaRow.hidden = !captchaId;
      captchaTimer = setTimeout(() => { if (file && !uploading && !trial) loadCaptcha(); }, 150e3);
    } catch { captchaId = ""; }
  };
  V("captcha-new").addEventListener("click", loadCaptcha);
  const fmtSize = formatUploadSize;
  // iOS 的 WebKit 对游离的 video 常常不读元数据：最多等 4 秒，读不到就交给后端判断时长
  const duration = (url) => new Promise((resolve) => {
    const probe = document.createElement("video");
    const done = (value) => {
      clearTimeout(timer);
      probe.onloadedmetadata = probe.onerror = null;
      probe.removeAttribute("src");
      probe.load();
      resolve(value);
    };
    const timer = setTimeout(() => done(NaN), 4000);
    probe.preload = "metadata";
    probe.muted = true;
    probe.playsInline = true;
    probe.onloadedmetadata = () => done(probe.duration);
    probe.onerror = () => done(NaN);
    probe.src = url;
    probe.load();
  });
  const reset = () => {
    clearTimeout(pollTimer);
    clearInterval(tickTimer);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    file = null; blobUrl = ""; trial = null; fallback = false; uploading = false; trialLive = false;
    pickMsg.hidden = true;
    fileInput.value = "";
    setProgress(null);
    vsay();
    authLinks(true);
    view("idle");
    if (mode === "video") trialStage();
  };
  // 手机上提示可能在屏幕外：报错时滚到提示那里
  const pickMsg = V("pickmsg");
  const pickError = (text) => {
    pickMsg.textContent = text;
    pickMsg.hidden = false;
    pickMsg.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  let pickSeq = 0;
  const pick = async (chosen) => {
    if (!chosen) return;
    reset();
    if (!trialType(chosen)) return pickError(T.errors.badFormat);
    if (member) {
      try { await loadMemberLimits(); }
      catch (error) { return pickError(trialError(error)); }
    }
    if (!member) {
      try { await loadTrialQuota(); }
      catch (error) { return pickError(trialError(error)); }
    }
    const limit = member ? memberLimits.maxBytes : trialLimits.maxBytes;
    if (chosen.size > limit) {
      return pickError(T.errors.accountSize.replace("{max}", fmtSize(limit)));
    }
    // 先把文件和验证码亮出来，时长在后台读
    const seq = ++pickSeq;
    file = chosen;
    blobUrl = URL.createObjectURL(chosen);
    V("name").textContent = chosen.name;
    V("meta").textContent = fmtSize(chosen.size);
    view("picked");
    trialStage();
    loadCaptcha();
    const seconds = await duration(blobUrl);
    if (seq !== pickSeq || file !== chosen) return;
    // 读不到时长不拦（有的手机格式浏览器读不了，后端能转），只拦确定超长的
    if (!member && trialLimits.maxSeconds !== null && seconds > trialLimits.maxSeconds + 0.5) {
      reset(); return pickError(T.errors.tooLong.replace("{seconds}", String(trialLimits.maxSeconds)));
    }
    if (Number.isFinite(seconds) && seconds > 0) V("meta").textContent = `${Math.round(seconds)} s · ${fmtSize(chosen.size)}`;
  };
  fileInput.addEventListener("change", () => (selectionDone = pick(fileInput.files[0])));
  ["dragenter", "dragover"].forEach((type) => drop.addEventListener(type, () => drop.classList.add("is-over")));
  ["dragleave", "drop"].forEach((type) => drop.addEventListener(type, () => drop.classList.remove("is-over")));
  root.querySelector("[data-trial-remove]").addEventListener("click", () => {
    // “再做一个”途中取消：旧的试用码还在服务器上，回到它
    if (againMode) { reset(); resume(); return; }
    clearLastQr();
    reset();
  });

  const trialError = (error) => error.code === "ACCOUNT_VIDEO_SIZE"
    ? T.errors.accountSize.replace("{max}", fmtSize(memberLimits?.maxBytes || 0))
    : error.code === "TRIAL_TOO_LARGE"
      ? T.errors.accountSize.replace("{max}", fmtSize(trialLimits?.maxBytes || 0))
    : error.code === "TRIAL_TOO_LONG"
      ? T.errors.tooLong.replace("{seconds}", String(trialLimits?.maxSeconds || TRIAL.maxSeconds))
    : T.errors[({
    TRIAL_TOO_LARGE: "tooLarge", TRIAL_TOO_LONG: "tooLong", TRIAL_BAD_FORMAT: "badFormat", TRIAL_RATE_LIMITED: "trialLimit",
    TRIAL_EXPIRED: "trialExpired", TRIAL_NOT_FOUND: "trialExpired", CAPTCHA_INVALID: "captcha", TRIAL_UNAVAILABLE: "service",
    // 服务器那边的失败，不让用户以为是文件的问题
    TRIAL_ENCODING_FAILED: "trialServer", TRIAL_UPLOAD_INCOMPLETE: "trialServer", TRIAL_SIZE_MISMATCH: "trialServer",
    TRIAL_UPLOAD_FAILED: "trialServer",
    AUTH_REQUIRED: "session", ACCOUNT_EXPIRED: "accountExpired", ACCOUNT_STORAGE_FULL: "accountStorage",
    FREE_QR_LIMIT: "limit", MEMBER_UPLOAD_EXPIRED: "generic", MEMBER_UPLOAD_CONFLICT: "generic",
    MEMBER_VIDEO_NOT_FOUND: "generic",
  })[error.code] || (error.network ? "service" : "")] || T.errors.trialFailed;
  const tick = () => {
    if (!trial || !trial.expiresAt) { expiry.textContent = ""; return; }
    const left = Math.max(0, Date.parse(trial.expiresAt) - Date.now());
    if (!left) { clearLastQr(); reset(); return vsay(T.errors.trialExpired, true); }
    expiry.textContent = T.trialExpires.replace("{h}", String(Math.floor(left / 3600e3))).replace("{m}", String(Math.floor((left % 3600e3) / 60e3)));
  };
  const showReady = (print) => {
    trialLive = true;
    view("ready");
    vsay();
    authLinks(false);
    trialStage(print);
    tick();
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 30e3);
  };
  const poll = async (started = Date.now()) => {
    clearTimeout(pollTimer);
    try {
      const d = (await (trial.videoId
        ? api(`/member-video/${encodeURIComponent(trial.videoId)}`, { token: accountToken() })
        : api(`/trial/${encodeURIComponent(trial.trialId)}`, { headers: { "X-Trial-Token": trial.trialToken } }))).data || {};
      if (d.watchUrl && d.watchUrl !== trial.watchUrl) { trial.watchUrl = d.watchUrl; trialStage(true); }
      if (d.expiresAt) trial.expiresAt = d.expiresAt;
      // 后端给了转码后的视频地址（playUrl / posterUrl）就让手机放它，刷新后也能看到自己的视频
      if (d.playUrl) trial.playUrl = d.playUrl;
      if (d.posterUrl) trial.posterUrl = d.posterUrl;
      saveLastQr({ kind: "video", ...trial });
      if (d.status === "ready") {
        if (trial.metricsEventId && !trial.metricsRecorded) {
          const completed = trial;
          void trackSiteEvent("qr_generate", { kind: "video", id: completed.metricsEventId }).then(recorded => {
            if (recorded && trial === completed) {
              completed.metricsRecorded = true;
              saveLastQr({ kind: "video", ...completed });
            }
          });
        }
        showReady(false);
        // 手机上一屏放不下：滚到结果卡，让人看到码和下载按钮
        if (matchMedia("(max-width: 900px)").matches) desk.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (d.status === "failed") { const e = new Error(); e.code = d.errorCode; throw e; }
      if (d.status === "expired") { const e = new Error(); e.code = "TRIAL_EXPIRED"; throw e; }
      if (d.status === "claimed") { clearLastQr(); return reset(); }
      // 后端排队可能要几分钟：不设上限，两分钟后放慢到 10 秒一次
      pollTimer = setTimeout(() => poll(started), Date.now() - started > 2 * 60e3 ? 10e3 : 3000);
    } catch (error) {
      if (error.network) { pollTimer = setTimeout(() => poll(started), 10e3); return; }
      if (error.code !== "TRIAL_EXPIRED") void trackVideoFailure(
        error.code === "TRIAL_ENCODING_FAILED" ? "encode" : "status", error, trial?.metricsEventId);
      clearLastQr();
      const text = trialError(error);
      reset();
      vsay(text, true);
    }
  };
  const putFile = (target) => putVideo(file, target, (p) => {
    setProgress(p);
    vsay(T.trialUploading.replace("{p}", String(p)));
  });
  // 接口还没上线（404 / 405 / 501）：只在本机预览，引导注册后再上传
  const toFallback = () => {
    fallback = true;
    setProgress(null);
    view("fallback");
    picked.hidden = false;
    authLinks(true);
    vsay(T.trialFallback);
  };
  vform.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!file || uploading) return;
    uploading = true;
    let finishUpload;
    uploadDone = new Promise(resolve => { finishUpload = resolve; });
    view("uploading");
    setProgress(0);
    vsay(T.trialUploading.replace("{p}", "0"));
    const attemptId = qrMetricsContext()?.id;
    let failureStage = "prepare";
    void trackSiteEvent("video_attempt", { kind: "video", id: attemptId });
    try {
      const known = readTrialToken();
      const d = (await api(member ? "/member-video/upload" : "/trial/upload", { method: "POST",
        ...(member ? { token: accountToken() } : {}), body: {
        filename: file.name, size: file.size, contentType: trialType(file), multipart: true,
        ...(!member ? { captchaKey: captchaId, captchaCode: vform.elements.captcha.value.trim(),
          ...(known ? { trialToken: known } : {}) } : {}),
      } })).data || {};
      if (!(member ? d.videoId : d.trialId && d.trialToken) ||
          !(d.upload?.url || d.upload?.mode === "multipart")) throw new Error("service");
      if (!member) saveTrialToken(d.trialToken);
      // 新申请会作废这个浏览器之前没认领的试用视频
      clearLastQr();
      againMode = false;
      trial = { ...(member ? { videoId: d.videoId, memberOwner: memberLimits.userId }
        : { trialId: d.trialId, trialToken: d.trialToken }),
        watchUrl: d.watchUrl || "", expiresAt: d.expiresAt || "", name: file.name,
        metricsEventId: attemptId || "", metricsRecorded: false };
      failureStage = "put";
      await putFile(d.upload);
      failureStage = "complete";
      const done = (await (member
        ? api(`/member-video/${encodeURIComponent(trial.videoId)}/complete`, { method: "POST", token: accountToken(), body: {} })
        : api(`/trial/${encodeURIComponent(trial.trialId)}/complete`, { method: "POST", body: { trialToken: trial.trialToken } }))).data || {};
      if (done.watchUrl) { trial.watchUrl = done.watchUrl; trialStage(true); }
      if (done.expiresAt) trial.expiresAt = done.expiresAt;
      setProgress(null);
      view("processing");
      vsay(T.trialProcessing);
      saveLastQr({ kind: "video", ...trial });
      uploading = false;
      if (member) { limitsRequest = null; loadMemberLimits().catch(() => {}); }
      else { trialLimitsRequest = null; loadTrialQuota().catch(() => {}); }
      poll();
    } catch (error) {
      uploading = false;
      if (member && !trial && error.code === "AUTH_REQUIRED" && useTrial()) return await pick(file);
      // 接口本身不存在（没有 errorCode 的 404 / 405 / 501）才退回“注册后上传”
      if (!member && [404, 405, 501].includes(error.status) && !error.code) return toFallback();
      void trackVideoFailure(failureStage, error, attemptId);
      trial = null;
      setProgress(null);
      view("picked");
      vsay(trialError(error) + (error.status ? ` (HTTP ${error.status})` : ""), true);
      // 验证码只能用一次：失败后都换一张
      loadCaptcha();
    } finally {
      finishUpload();
    }
  });

  // 接着显示这个浏览器保存的试用码（回到页面、或“再做一个”中途取消）
  function resume(last = readLastQr()) {
    againMode = false;
    view("idle");
    if (!last || last.kind !== "video" ||
        (last.expiresAt && Date.parse(last.expiresAt) < Date.now()) ||
        (member ? !last.videoId || last.memberOwner !== memberLimits?.userId : !last.trialId)) return trialStage();
    trial = { ...(member ? { videoId: last.videoId, memberOwner: last.memberOwner }
      : { trialId: last.trialId, trialToken: last.trialToken }),
      watchUrl: last.watchUrl || "", expiresAt: last.expiresAt || "", name: last.name || "",
      metricsEventId: last.metricsEventId || "", metricsRecorded: last.metricsRecorded === true };
    // 第①步显示之前那个视频（文件名在本地记着；没有就写“你的视频”）
    V("name").textContent = trial.name || T.phoneMine;
    V("meta").textContent = "";
    view("processing");
    vsay(T.trialProcessing);
    trialStage();
    poll();
  }
  V("again-start").addEventListener("click", () => {
    // 旧码先留着，真正提交新视频时才作废
    againMode = true;
    clearTimeout(pollTimer);
    vsay();
    view("idle");
    authLinks(true);
    drop.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  V("again-cancel").addEventListener("click", () => { reset(); resume(); });
  if (member) {
    ready.querySelector(".gen-keep").hidden = true;
    V("again-back").querySelector("p").hidden = true;
    try { await loadMemberLimits(); }
    catch (error) { vsay(trialError(error), true); }
  }
  authLinks(true);
  loadTrialQuota().catch(() => {});
  let draft;
  try { draft = await takeVideoDraft(); }
  catch { vsay(T.errors.draft, true); }
  if (draft && draft.owner === (member ? memberLimits?.userId : "")) {
    if (draft.file) {
      await pick(draft.file);
      againMode = !!draft.againMode;
      view(file ? "picked" : "idle");
    } else resume(draft.trial);
  } else resume();

  setMode(draft?.mode || new URLSearchParams(location.search).get("tipo"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    updateRemaining();
    // 手机切到后台时定时器会停，回来先查一次处理进度
    if (trial && (ready.hidden || member) && !uploading && !againMode) poll();
  });
  updateRemaining();
  return {
    async prepareLanguageSwitch() {
      root.inert = true;
      root.setAttribute("aria-busy", "true");
      try {
        await selectionDone;
        await uploadDone;
        if (file || trial) await saveVideoDraft({
          owner: member ? memberLimits?.userId : "", mode, againMode,
          file: trial ? null : file, trial: trial ? { kind: "video", ...trial } : null,
        });
        return mode;
      } catch (error) {
        vsay(T.errors.draft, true);
        throw error;
      } finally {
        root.inert = false;
        root.removeAttribute("aria-busy");
      }
    },
  };
}
