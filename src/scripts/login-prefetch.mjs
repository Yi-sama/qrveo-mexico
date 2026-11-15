export function inlineAuthStyles(css, base = "/mexico/") {
  return css.replace(/url\((['"]?)\.\.\/fonts\//g, (_, quote) => `url(${quote}${base}fonts/`);
}

export function prefetchLoginAssets(assets) {
  const connection = navigator.connection || {};
  if (connection.saveData) return;
  let started = false;
  const warm = (link) => {
    if (started || document.visibilityState === "hidden" || !link) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin ||
        !/\/iniciar-sesion\/$/.test(destination.pathname)) return;
    started = true;
    const current = new Set(Array.from(
      document.querySelectorAll('script[src],link[rel="modulepreload"],link[rel="preload"]'),
      node => node.src || node.href));
    for (const asset of new Set(assets)) {
      const url = new URL(asset, location.href);
      if (current.has(url.href)) continue;
      const hint = document.createElement("link");
      hint.rel = "prefetch";
      hint.href = url.href;
      hint.as = url.pathname.endsWith(".woff2") ? "font" : "script";
      if (hint.as === "font") hint.crossOrigin = "anonymous";
      hint.fetchPriority = "low";
      document.head.append(hint);
    }
  };
  const intent = event => warm(event.target.closest?.('a[data-auth="login"]'));
  document.addEventListener("pointerover", intent, { passive: true });
  document.addEventListener("focusin", intent);
  document.addEventListener("touchstart", intent, { passive: true });
  const schedule = () => {
    if (/^(slow-)?2g$/.test(connection.effectiveType || "")) return;
    setTimeout(() => {
      const idle = () => warm(document.querySelector('a[data-auth="login"]'));
      if (window.requestIdleCallback) window.requestIdleCallback(idle, { timeout: 1500 });
      else idle();
    }, 1500);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else schedule();
}
