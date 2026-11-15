const departingMedia = new Map();
addEventListener("pageshow", () => {
  for (const [video, saved] of departingMedia) {
    for (const [element, src] of saved.sources) {
      if (src !== null) element.setAttribute("src", src);
    }
    video.preload = saved.preload;
    if (!saved.paused) video.play().catch(() => {});
  }
  departingMedia.clear();
});

document.addEventListener("click", event => {
  if (event.defaultPrevented || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.("a[href]");
  if (!link || link.hasAttribute("download") || link.target && link.target !== "_self") return;
  const next = new URL(link.href, location.href);
  if (next.origin !== location.origin ||
      next.pathname === location.pathname && next.search === location.search) return;
  // Cancel the departing page's media requests before the navigation competes for bandwidth.
  document.querySelectorAll("video").forEach(video => {
    if (departingMedia.has(video)) return;
    const sources = [video, ...video.querySelectorAll("source")]
      .map(element => [element, element.getAttribute("src")]);
    departingMedia.set(video, { sources, preload: video.preload, paused: video.paused });
    video.pause();
    video.preload = "none";
    for (const [element] of sources) element.removeAttribute("src");
    video.load();
  });
});
