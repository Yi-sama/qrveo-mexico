const ID = "G-M6PRCQ48SD";
const enabled = location.origin === "https://mx.qrveo.com" &&
  location.pathname.startsWith("/mexico/") &&
  new URLSearchParams(location.search).get("analytics") !== "off";
const privatePage = /^\/mexico\/(?:(?:en|pt|fr|de|zh|ja|ko)\/)?(?:registro|iniciar-sesion|recuperar|pago|crear-qr)(?:\/|[.]html|$)/.test(location.pathname) ||
  /^\/mexico\/(?:ejemplo\/|hero-player[.]html|assets\/)/.test(location.pathname);
const home = /^\/mexico\/(?:(?:en|pt|fr|de|zh|ja|ko)\/)?(?:index[.]html)?$/.test(location.pathname);
let started = false, observer, timer;

function cleanUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.origin + url.pathname;
  } catch {
    return "";
  }
}

function startTag() {
  if (started) return;
  started = true;
  clearTimeout(timer);
  observer?.disconnect();
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  if (privatePage) {
    // Account pages load the tag only after a confirmed business event.
    window.gtag("config", ID, {
      send_page_view: false,
      page_location: cleanUrl(location.href),
      page_referrer: cleanUrl(document.referrer),
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  }
  const script = document.createElement("script");
  script.async = true;
  script.fetchPriority = "low";
  script.src = `https://www.googletagmanager.com/${privatePage ? "gtag/js" : "gtm.js"}?id=${ID}`;
  document.head.append(script);
}

export function track(event, { method, interaction } = {}) {
  const valid = event === "sign_up" ? ["email", "google"].includes(method) :
    event === "contact_click" && ["email", "whatsapp"].includes(method);
  if (!enabled || !valid) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timeout); resolve(); };
    const timeout = setTimeout(done, 1800);
    try {
      startTag();
      window.gtag("event", event, {
        send_to: ID, method,
        ...(event === "contact_click" ? { interaction: interaction === "form" ? "form" : "link" } : {}),
        page_location: cleanUrl(location.href),
        page_referrer: cleanUrl(document.referrer),
        event_callback: done, event_timeout: 1500,
      });
    } catch {
      done();
    }
  });
}

if (enabled) {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const url = new URL(link.href, location.href);
    const method = url.hostname === "wa.me" ? "whatsapp" : url.protocol === "mailto:" ? "email" : "";
    if (method) void track("contact_click", { method, interaction: "link" });
  });
  if (!privatePage) {
    if (home && typeof PerformanceObserver !== "undefined" &&
        PerformanceObserver.supportedEntryTypes.includes("paint")) {
      timer = setTimeout(startTag, 4000);
      observer = new PerformanceObserver((list) => {
        if (list.getEntries().some((entry) => entry.name === "first-contentful-paint")) startTag();
      });
      observer.observe({ type: "paint", buffered: true });
    } else {
      startTag();
    }
  }
}
