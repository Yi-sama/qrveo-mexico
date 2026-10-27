// 多语言：西语是主文件（content/es.json，结构、图片、视频、链接都只在这里改），
// 其他语言是 content/<code>.json，只放翻译后的文字，结构与 es.json 相同。缺的文字自动用西语。

// 顺序就是语言菜单和“语言”轮播的顺序。word = 各语言里“语言”这个词；suggest = 浏览器语言不同时的提示
export const LANGS = [
  { code: "es", hreflang: "es-MX", og: "es_MX", name: "Español", word: "Idioma", suggest: "Ver esta página en español", close: "Cerrar" },
  { code: "en", hreflang: "en", og: "en_US", name: "English", word: "Language", suggest: "View this page in English", close: "Close" },
  { code: "pt", hreflang: "pt-BR", og: "pt_BR", name: "Português", word: "Língua", suggest: "Ver esta página em português", close: "Fechar" },
  { code: "fr", hreflang: "fr", og: "fr_FR", name: "Français", word: "Langue", suggest: "Voir cette page en français", close: "Fermer" },
  { code: "de", hreflang: "de", og: "de_DE", name: "Deutsch", word: "Sprache", suggest: "Diese Seite auf Deutsch ansehen", close: "Schließen" },
  { code: "zh", hreflang: "zh-CN", og: "zh_CN", name: "中文", word: "语言", suggest: "用中文浏览本页", close: "关闭" },
  { code: "ja", hreflang: "ja", og: "ja_JP", name: "日本語", word: "言語", suggest: "このページを日本語で見る", close: "閉じる" },
  { code: "ko", hreflang: "ko", og: "ko_KR", name: "한국어", word: "언어", suggest: "이 페이지를 한국어로 보기", close: "닫기" },
];
export const DEFAULT_LANG = "es";
// 每种语言的目录：西语在站点根目录，其他语言在 /<code>/
export const langDir = (code) => (code === DEFAULT_LANG ? "" : `${code}/`);

// 不翻译的字段：图片、视频、链接、编号等（与编辑入口隐藏的字段相同），以及短片纸箱上的型号和网址、
// 只有西语的备用示例页、联系方式和品牌名
export const FIXED = /(^|\.)(lang|img|video|poster|href|console|id|action|plan|slug|solution|exampleId|menu|fallback|shot|pick|phone|clip|vid|max)(\[\d+\])?$/;
const FIXED_PREFIX = /^(demo|example|brand\.name|home\.hero\.endCard\.(boxLabel|site)|contact\.(company|city|address|rfc|whatsapp|whatsappLabel|email))(\.|\[|$)/;
export const translatable = (p) => !FIXED.test(p) && !FIXED_PREFIX.test(p);

// 只保留需要翻译的文字（给翻译用的底稿，也是检查缺漏的依据）
export function skeleton(v, p = "") {
  if (typeof v === "string") return translatable(p) && v.trim() ? v : undefined;
  if (Array.isArray(v)) {
    const out = v.map((x, i) => skeleton(x, `${p}[${i}]`));
    return out.some((x) => x !== undefined) ? out.map((x) => (x === undefined ? null : x)) : undefined;
  }
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const s = skeleton(x, p ? `${p}.${k}` : k);
      if (s !== undefined) out[k] = s;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

// 西语为底，用翻译覆盖可翻译的文字；结构、数量、图片和链接永远以西语为准
export function localize(base, tr, p = "") {
  if (typeof base === "string") return translatable(p) && typeof tr === "string" && tr.trim() ? tr : base;
  if (Array.isArray(base)) return base.map((x, i) => localize(x, Array.isArray(tr) ? tr[i] : undefined, `${p}[${i}]`));
  if (base && typeof base === "object") {
    const out = {};
    for (const [k, x] of Object.entries(base)) out[k] = localize(x, tr && typeof tr === "object" ? tr[k] : undefined, p ? `${p}.${k}` : k);
    return out;
  }
  return base;
}

// 列出某种语言还没翻译的文字路径
export function missing(base, tr, p = "", out = []) {
  if (typeof base === "string") {
    if (translatable(p) && base.trim() && !(typeof tr === "string" && tr.trim())) out.push(p);
  } else if (Array.isArray(base)) base.forEach((x, i) => missing(x, Array.isArray(tr) ? tr[i] : undefined, `${p}[${i}]`, out));
  else if (base && typeof base === "object")
    Object.entries(base).forEach(([k, x]) => missing(x, tr && typeof tr === "object" ? tr[k] : undefined, p ? `${p}.${k}` : k, out));
  return out;
}
