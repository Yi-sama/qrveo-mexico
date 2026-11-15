const opener = document.querySelector("[data-stage-expand]");
const dialog = document.querySelector("[data-stage-dialog]");

if (opener && dialog && typeof dialog.showModal === "function") {
  const player = dialog.querySelector("[data-stage-player]");
  const stage = document.querySelector("[data-stage]");
  const video = stage.querySelector("video");
  let updateFloating = () => {};
  let lastOpener = opener;
  opener.hidden = false;

  const openPlayer = (event) => {
    lastOpener = event.currentTarget;
    video.pause();
    stage.dataset.state = "end";
    stage.dataset.played = "";
    dialog.showModal();
    document.documentElement.classList.add("hero-player-open");
    player.src = player.dataset.src;
    updateFloating();
  };
  opener.addEventListener("click", openPlayer);

  dialog.querySelector("[data-stage-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    // Unloading the frame also stops the SDK's media, timers, and audio.
    player.removeAttribute("src");
    document.documentElement.classList.remove("hero-player-open");
    updateFloating();
    (lastOpener === opener || !floating.hidden ? lastOpener : opener).focus({ preventScroll: true });
  });

  const floating = document.querySelector("[data-hero-float]");
  if (floating) {
    const preview = floating.querySelector("video");
    const hero = document.querySelector(".hero-grid");
    let heroVisible = true;
    let dismissed = false;

    updateFloating = () => {
      // Measure the actual content edge, including scrollbars and browser zoom.
      const gutter = Math.floor(hero.getBoundingClientRect().left);
      const width = Math.min(240, gutter - 32);
      floating.hidden = dismissed || heroVisible || dialog.open || document.hidden || document.documentElement.classList.contains("hero-player-open") || width < 144;
      if (floating.hidden) {
        preview.pause();
        return;
      }
      floating.style.width = `${width}px`;
      floating.style.left = `${Math.floor((gutter - width) / 2)}px`;
      if (document.documentElement.classList.contains("autoplay") && preview.paused) {
        preview.play().catch(() => {}); // Keep the poster if autoplay is unavailable.
      }
    };

    const visibility = new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      updateFloating();
    }, { rootMargin: "-80px 0px 0px 0px" });
    visibility.observe(stage);
    new ResizeObserver(updateFloating).observe(document.documentElement);
    document.addEventListener("visibilitychange", updateFloating);
    floating.querySelector("[data-hero-float-open]").addEventListener("click", openPlayer);
    floating.querySelector("[data-hero-float-close]").addEventListener("click", () => {
      dismissed = true;
      updateFloating();
    });
  }
}

const previewOpeners = document.querySelectorAll("[data-desk-expand], [data-preview-expand]");
const deskDialog = document.querySelector("[data-desk-dialog]");

if (previewOpeners.length && deskDialog && typeof deskDialog.showModal === "function") {
  const player = deskDialog.querySelector("[data-desk-player]");
  let preview;
  let lastOpener;
  let resumePreview = false;

  previewOpeners.forEach((opener) => {
    opener.hidden = false;
    opener.addEventListener("click", () => {
      lastOpener = opener;
      const phone = opener.closest(".desk-phone, .phone");
      preview = phone.querySelector("video");
      resumePreview = !preview.paused;
      document.querySelectorAll("video").forEach((video) => video.pause());
      deskDialog.querySelector("[data-desk-player-title]").textContent = opener.dataset.previewTitle || phone.querySelector("[data-desk-title]").textContent;
      const src = preview.currentSrc || preview.getAttribute("src") || preview.dataset.demoSrc;
      const isDemo = new URL(src, document.baseURI).href === new URL(preview.dataset.demoSrc, document.baseURI).href;
      player.src = isDemo && preview.dataset.hdSrc ? preview.dataset.hdSrc : src;
      player.currentTime = preview.currentTime;
      deskDialog.showModal();
      document.documentElement.classList.add("hero-player-open");
      player.play().catch(() => {}); // Native controls remain available if playback is blocked.
    });
  });
  document.addEventListener("play", (event) => {
    const active = event.target;
    if (active.tagName !== "VIDEO") return;
    if (deskDialog.open && active !== player) return active.pause();
    document.querySelectorAll("video").forEach((video) => {
      if (video !== active) video.pause();
    });
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) document.querySelectorAll("video").forEach((video) => video.pause());
  });
  deskDialog.querySelector("[data-desk-close]").addEventListener("click", () => deskDialog.close());
  deskDialog.addEventListener("click", (event) => {
    if (event.target === deskDialog) deskDialog.close();
  });
  deskDialog.addEventListener("close", () => {
    player.pause();
    preview.currentTime = player.currentTime;
    player.removeAttribute("src");
    player.load();
    document.documentElement.classList.remove("hero-player-open");
    if (resumePreview && !document.hidden) preview.play().catch(() => {});
    lastOpener.focus({ preventScroll: true });
  });
}
