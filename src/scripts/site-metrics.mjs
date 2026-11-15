let visitor, warned = false;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const KEY = "qrveo-site-visitor";
const UPLOAD_HTTP = [400, 401, 403, 408, 409, 412, 413, 429, 500, 502, 503, 504, 524];
const VIDEO_EVENTS = ["video_attempt", "prep_failed", "put_network", "put_http_other",
  ...UPLOAD_HTTP.map(code => "put_http_" + code), "complete_failed", "encode_failed", "status_failed"];

function pageContext() {
  if (typeof window === "undefined" || location.origin !== "https://mx.qrveo.com" ||
      new URLSearchParams(location.search).get("analytics") === "off" ||
      navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true) return null;
  const match = /^\/mexico\/(?:(en|pt|fr|de|zh|ja|ko)\/)?(.*)$/.exec(location.pathname);
  if (!match || /^(?:ejemplo\/|assets\/|hero-player[.]html)/.test(match[2])) return null;
  const path = match[2].replace(/(?:index[.]html)?\/?$/, "").replace(/[.]html$/, "");
  const pages = { "": "home", "crear-qr": "generator", "iniciar-sesion": "login", registro: "register",
    recuperar: "recover", pago: "checkout", funciones: "features", soluciones: "solutions",
    ejemplos: "examples", precios: "pricing", ayuda: "help", contacto: "contact", nosotros: "about",
    "aviso-de-privacidad": "legal", terminos: "legal" };
  return { page: pages[path.split("/")[0]] || "other", language: match[1] || "es" };
}

export function qrMetricsContext() {
  const page = pageContext();
  if (!page) return typeof window === "undefined" ? undefined : { disabled: true };
  if (!visitor) {
    try { visitor = localStorage.getItem(KEY); } catch {}
    if (!UUID.test(visitor)) {
      visitor = crypto.randomUUID();
      try { localStorage.setItem(KEY, visitor); } catch {}
    }
  }
  return { ...page, id: crypto.randomUUID(), visitor };
}

export async function trackSiteEvent(event, { id, kind, format } = {}) {
  const context = qrMetricsContext();
  if (!context || context.disabled) return false;
  const valid = event === "page_view" ? !kind && !format :
    event === "qr_generate" || VIDEO_EVENTS.includes(event) ? kind === "video" && !format :
    event === "qr_download" && ["url", "video"].includes(kind) && ["png", "svg"].includes(format);
  if (!valid || (event !== "page_view" && context.page !== "generator")) return false;
  try {
    const response = await fetch("/api/site-metrics/events", {
      method: "POST", credentials: "omit", cache: "no-store", keepalive: true,
      referrerPolicy: "no-referrer", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...context, ...(id ? { id } : {}), event,
        ...(kind ? { kind } : {}), ...(format ? { format } : {}) }),
    });
    const result = response.ok ? await response.json() : null;
    if (result?.data?.accepted === true) return true;
  } catch {}
  if (!warned) { warned = true; console.warn("QRveo anonymous statistics were not recorded."); }
  return false;
}

export function trackVideoFailure(stage, error, id) {
  const event = stage === "put" ? error.network ? "put_network" :
    "put_http_" + (UPLOAD_HTTP.includes(error.status) ? error.status : "other") :
    ({ prepare: "prep_failed", complete: "complete_failed", encode: "encode_failed", status: "status_failed" })[stage];
  return event ? trackSiteEvent(event, { kind: "video", id }) : Promise.resolve(false);
}

if (typeof window !== "undefined") void trackSiteEvent("page_view");
