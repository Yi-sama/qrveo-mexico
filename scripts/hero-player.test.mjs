import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { pageHome, pageGenerator, pageExamples, pageFeatures, pageSolution, pageAuth } from "../src/render.mjs";
import { LANGS, langDir, localize } from "../src/i18n.mjs";

const source = await readFile(new URL("../public/assets/hero-player.mjs", import.meta.url), "utf8");
const embed = await readFile(new URL("../public/hero-player.html", import.meta.url), "utf8");

function element(extra = {}) {
  return {
    handlers: {},
    dataset: {},
    addEventListener(type, fn) { this.handlers[type] = fn; },
    focus() { this.focused = true; },
    ...extra,
  };
}

const opener = element({ hidden: true });
const closer = element();
const player = element({
  dataset: { src: "../hero-player.html" },
  removeAttribute(name) { delete this[name]; },
});
const video = { paused: false, pause() { this.paused = true; } };
const stage = element({ dataset: { state: "playing" }, querySelector: () => video });
const classes = new Set();
const dialog = element({
  open: false,
  querySelector: (selector) => selector === "[data-stage-player]" ? player : closer,
  showModal() { this.open = true; },
  close() { this.open = false; this.handlers.close(); },
});
const nodes = { "[data-stage-expand]": opener, "[data-stage-dialog]": dialog, "[data-stage]": stage };
vm.runInNewContext(source, {
  document: {
    querySelector: (selector) => nodes[selector],
    querySelectorAll: () => [],
    documentElement: { classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) } },
  },
});

assert.equal(opener.hidden, false);
assert.equal(player.src, undefined, "Do not load the full video before opening");
opener.handlers.click({ currentTarget: opener });
assert.equal(video.paused, true);
assert.equal(stage.dataset.state, "end");
assert.equal(dialog.open, true);
assert.equal(player.src, player.dataset.src);
assert.equal(classes.has("hero-player-open"), true);
dialog.handlers.click({ target: player });
assert.equal(dialog.open, true, "Clicks inside the player must not close it");
closer.handlers.click();
assert.equal(dialog.open, false);
assert.equal(player.src, undefined, "Closing must unload the player");
assert.equal(classes.size, 0);
opener.handlers.click({ currentTarget: opener });
assert.equal(player.src, player.dataset.src, "Reopening must create a fresh player");
dialog.handlers.click({ target: dialog });
assert.equal(dialog.open, false);
assert.equal(player.src, undefined);
assert.ok(embed.includes("<video controls playsinline preload=\"metadata\""));
assert.ok(!/<script\b|https?:\/\/|data-kingsway-player/.test(embed),
  "The enlarged homepage video must not depend on an external player or media host");
const fullVideo = embed.match(/<source src="video\/(qrveo-hero-hd\.([a-f0-9]{12})\.mp4)" type="video\/mp4">/);
assert.ok(fullVideo, "Use a versioned video URL served from the website");
const previewHash = createHash("sha256").update(
  await readFile(new URL("../public/video/qrveo-hero.mp4", import.meta.url)),
).digest("hex").slice(0, 12);
const shareHash = createHash("sha256").update(
  await readFile(new URL("../public/img/og.jpg", import.meta.url)),
).digest("hex").slice(0, 12);

let gutter = 360;
let resize;
let intersect;
const floatOpener = element();
const floatCloser = element();
const preview = {
  paused: true,
  playCount: 0,
  pause() { this.paused = true; },
  play() { this.paused = false; this.playCount++; return Promise.resolve(); },
};
const floating = element({
  hidden: true,
  style: {},
  querySelector: (selector) => ({
    video: preview,
    "[data-hero-float-open]": floatOpener,
    "[data-hero-float-close]": floatCloser,
  })[selector],
});
nodes["[data-hero-float]"] = floating;
nodes[".hero-grid"] = { getBoundingClientRect: () => ({ left: gutter }) };
const doc = element({
  hidden: false,
  baseURI: "https://mx.qrveo.com/mexico/zh/crear-qr/",
  querySelector: (selector) => nodes[selector],
  querySelectorAll: (selector) => selector === "video"
    ? [nodes["[data-desk-video]"], nodes["largePlayer"], nodes["casePreview"]].filter(Boolean)
    : [nodes["[data-desk-expand]"], nodes["caseOpener"]].filter(Boolean),
  documentElement: {
    classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
  },
});
classes.add("autoplay");
vm.runInNewContext(source, {
  document: doc,
  IntersectionObserver: class {
    constructor(callback) { intersect = callback; }
    observe() {}
  },
  ResizeObserver: class {
    constructor(callback) { resize = callback; }
    observe() { resize(); }
  },
});
assert.equal(floating.hidden, true, "Do not duplicate the visible hero video");
intersect([{ isIntersecting: false }]);
assert.equal(floating.hidden, false);
assert.equal(preview.paused, false);
assert.equal(player.src, undefined, "The floating preview must not load the full video");

for (const left of [600, 360, 250, 200, 176, 175, 83, 48, 20]) {
  gutter = left;
  resize();
  assert.equal(floating.hidden, left < 176);
  if (!floating.hidden) {
    const width = parseInt(floating.style.width);
    const x = parseInt(floating.style.left);
    assert.ok(width >= 144 && width <= 240);
    assert.ok(x >= 16);
    assert.ok(x + width <= gutter - 16, `The preview must stay out of content at gutter ${left}`);
  } else {
    assert.equal(preview.paused, true, "Hidden previews must stop playback");
  }
}

gutter = 360;
resize();
floatOpener.handlers.click({ currentTarget: floatOpener });
assert.equal(dialog.open, true);
assert.equal(floating.hidden, true);
assert.equal(preview.paused, true);
closer.handlers.click();
assert.equal(player.src, undefined);
assert.equal(floating.hidden, false);
assert.equal(floatOpener.focused, true, "Closing must return focus to the trigger");
floatOpener.handlers.click({ currentTarget: floatOpener });
gutter = 20;
resize();
opener.focused = false;
closer.handlers.click();
assert.equal(opener.focused, true, "Use the inline trigger when the floating trigger no longer fits");
gutter = 360;
resize();

classes.delete("autoplay");
preview.pause();
const plays = preview.playCount;
resize();
assert.equal(preview.playCount, plays, "Respect reduced motion and data-saving preferences");
doc.hidden = true;
doc.handlers.visibilitychange();
assert.equal(floating.hidden, true);
doc.hidden = false;
doc.handlers.visibilitychange();
assert.equal(floating.hidden, false);
intersect([{ isIntersecting: true }]);
assert.equal(floating.hidden, true);
intersect([{ isIntersecting: false }]);
floatCloser.handlers.click();
resize();
assert.equal(floating.hidden, true, "Dismissal must survive scrolling and resizing");
const deskOpener = element({
  hidden: true,
  closest: () => ({ querySelector: (selector) => selector === "video" ? deskPreview : deskTitle }),
});
const deskCloser = element();
const deskTitle = element({ textContent: "Selected video" });
const largeTitle = element();
const deskPreview = element({
  currentSrc: "blob:local-video",
  currentTime: 7,
  paused: false,
  dataset: { demoSrc: "../../video/demo-productos.mp4", hdSrc: "../../video/demo-productos-hd.mp4" },
  getAttribute() { return this.currentSrc; },
  pause() { this.paused = true; },
  play() { this.paused = false; return Promise.resolve(); },
});
const largePlayer = element({
  tagName: "VIDEO",
  currentTime: 0,
  paused: true,
  play() { this.paused = false; return Promise.resolve(); },
  pause() { this.paused = true; },
  removeAttribute(name) { delete this[name]; },
  load() { this.unloaded = !this.src; },
});
const deskDialog = element({
  open: false,
  querySelector: (selector) => ({
    "[data-desk-player]": largePlayer,
    "[data-desk-player-title]": largeTitle,
    "[data-desk-close]": deskCloser,
  })[selector],
  showModal() { this.open = true; },
  close() { this.open = false; this.handlers.close(); },
});
nodes["[data-desk-expand]"] = deskOpener;
nodes["[data-desk-dialog]"] = deskDialog;
nodes["[data-desk-video]"] = deskPreview;
nodes["[data-desk-title]"] = deskTitle;
nodes.largePlayer = largePlayer;
const casePreview = element({
  tagName: "VIDEO",
  currentSrc: "https://mx.qrveo.com/mexico/video/demo-educacion.mp4",
  currentTime: 4,
  paused: false,
  dataset: { demoSrc: "../../video/demo-educacion.mp4", hdSrc: "../../video/demo-educacion-hd.mp4" },
  getAttribute() { return this.currentSrc; },
  pause() { this.paused = true; },
  play() { this.paused = false; return Promise.resolve(); },
});
const caseOpener = element({
  hidden: true,
  dataset: { previewTitle: "Education example" },
  closest: () => ({ querySelector: () => casePreview }),
});
nodes.casePreview = casePreview;
nodes.caseOpener = caseOpener;
delete nodes["[data-stage-expand]"];
vm.runInNewContext(source, { document: doc, URL });
assert.equal(deskOpener.hidden, false);
assert.equal(caseOpener.hidden, false);
assert.equal(largePlayer.src, undefined, "Do not load the enlarged preview before opening");
deskOpener.handlers.click();
assert.equal(deskDialog.open, true);
assert.equal(deskPreview.paused, true);
assert.equal(casePreview.paused, true, "Pause every other inline video while the large player is open");
assert.equal(largePlayer.src, "blob:local-video", "Enlarge the chosen video, not the homepage film");
assert.equal(largePlayer.currentTime, 7);
assert.equal(largePlayer.paused, false);
assert.equal(largeTitle.textContent, deskTitle.textContent);
assert.equal(classes.has("hero-player-open"), true);
deskDialog.handlers.click({ target: largePlayer });
assert.equal(deskDialog.open, true);
largePlayer.currentTime = 12;
deskCloser.handlers.click();
assert.equal(deskDialog.open, false);
assert.equal(largePlayer.src, undefined);
assert.equal(largePlayer.paused, true);
assert.equal(largePlayer.unloaded, true);
assert.equal(deskPreview.currentTime, 12);
assert.equal(deskPreview.paused, false);
assert.equal(deskOpener.focused, true);
assert.equal(classes.has("hero-player-open"), false);

deskPreview.pause();
deskPreview.currentSrc = "";
deskPreview.currentTime = 0;
deskOpener.handlers.click();
assert.equal(largePlayer.src, deskPreview.dataset.hdSrc, "Explicit clicks load the HD demo even when only the poster was shown");
deskDialog.handlers.click({ target: deskDialog });
assert.equal(deskPreview.paused, true, "Do not start a preview that was originally paused");
deskPreview.currentSrc = "blob:second-video";
deskTitle.textContent = "Second video";
deskPreview.paused = false;
deskOpener.handlers.click();
assert.equal(largePlayer.src, deskPreview.currentSrc);
assert.equal(largeTitle.textContent, "Second video");
doc.hidden = true;
deskCloser.handlers.click();
assert.equal(deskPreview.paused, true, "Do not resume the preview in a background tab");
doc.hidden = false;
deskPreview.currentSrc = new URL(deskPreview.dataset.demoSrc, doc.baseURI).href;
deskOpener.handlers.click();
assert.equal(largePlayer.src, deskPreview.dataset.hdSrc, "Normalize absolute currentSrc against the relative demo URL");
deskCloser.handlers.click();
casePreview.paused = false;
caseOpener.handlers.click();
assert.equal(largePlayer.src, casePreview.dataset.hdSrc, "Each example must load its own HD source");
assert.equal(largeTitle.textContent, "Education example");
assert.equal(largePlayer.currentTime, 4);
casePreview.paused = false;
doc.handlers.play({ target: casePreview });
assert.equal(casePreview.paused, true, "An observer must not restart an inline video behind the dialog");
assert.equal(largePlayer.paused, false);
deskCloser.handlers.click();
assert.equal(caseOpener.focused, true);
assert.equal(largePlayer.src, undefined);
assert.equal(casePreview.paused, false);
deskPreview.paused = false;
doc.handlers.play({ target: casePreview });
assert.equal(deskPreview.paused, true, "Keep only one native video playing at a time");
doc.hidden = true;
doc.handlers.visibilitychange();
assert.equal(casePreview.paused, true, "Pause native videos when the page is hidden");
const es = JSON.parse(await readFile(new URL("../content/es.json", import.meta.url), "utf8"));
for (const lang of LANGS) {
  const translation = JSON.parse(await readFile(new URL(`../content/${lang.code}.json`, import.meta.url), "utf8"));
  const content = localize(es, lang.code === "es" ? {} : translation);
  const options = (path) => ({
    path, root: "../", L: "../", v: "test", lang, langs: LANGS,
    full: langDir(lang.code) + path, base: "/mexico/", origin: "https://mx.qrveo.com",
    watch: "https://mx.qrveo.com", demo: "https://mx.qrveo.com/demo",
    alt: (other) => langDir(other.code) + path, qr: () => "<svg></svg>",
  });
  const pages = [
    pageHome(content, options("")),
    pageGenerator(content, options("crear-qr/")),
    pageExamples(content, options("ejemplos/")),
    pageFeatures(content, options("funciones/")),
    ...content.solutions.map((solution) => pageSolution(content, options(`soluciones/${solution.slug}/`), solution)),
  ];
  assert.equal(pages[0].split(`video/qrveo-hero.mp4?v=${previewHash}`).length, 3,
    "Both homepage previews must invalidate the old film's cache");
  for (const html of pages) {
    assert.ok(html.includes(`img/og.jpg?v=${shareHash}`),
      "The share image must invalidate its old QR code");
    assert.equal(html.split("hero-player.mjs?v=20261107-hd").length, 2, lang.code);
    assert.equal(html.split("data-desk-dialog").length, 2, "Use one native preview dialog per page");
    assert.ok(html.includes("<video controls playsinline preload=\"none\" data-desk-player></video>"));
    assert.ok(html.includes("data-hd-src="));
    assert.ok(!/<(?:video|source)[^>]*\ssrc="[^"]+-hd\.mp4"/.test(html), "HD must not have an initial media src");
  }
  const auth = pageAuth(content, options("iniciar-sesion/"), "login");
  assert.ok(!auth.includes("hero-player.mjs"), "Do not add preview resources to unrelated account pages");
}
for (const filename of [
  ...["productos", "educacion", "capacitacion", "marketing"].map((id) => `demo-${id}-hd.mp4`),
  fullVideo[1],
]) {
  const bytes = await readFile(new URL(`../public/video/${filename}`, import.meta.url));
  const boxes = [];
  for (let offset = 0; offset < bytes.length;) {
    assert.ok(offset + 8 <= bytes.length);
    const size = bytes.readUInt32BE(offset);
    assert.ok(size >= 8 && offset + size <= bytes.length, "Expected a valid small MP4 box");
    boxes.push(bytes.toString("ascii", offset + 4, offset + 8));
    offset += size;
  }
  assert.ok(boxes.includes("moov") && boxes.includes("mdat"));
  assert.ok(boxes.indexOf("moov") < boxes.indexOf("mdat"), `${filename}: faststart metadata must precede media`);
  if (filename === fullVideo[1]) {
    assert.equal(createHash("sha256").update(bytes).digest("hex").slice(0, 12), fullVideo[2]);
    assert.ok(bytes.includes(Buffer.from("soun")), "Keep the full homepage film's audio track");
    assert.ok(bytes.includes(Buffer.from("avc1")), "Use browser-compatible H.264 video");
  }
}
console.log("Hero and HD previews: lazy source selection, local-file priority, playback position, single playback, cleanup, focus, gutter boundaries, and dismissal passed.");
console.log("64 localized pages: one lazy HD dialog each; unrelated account pages unchanged. All five MP4s have faststart metadata; the self-hosted homepage film retains audio.");
