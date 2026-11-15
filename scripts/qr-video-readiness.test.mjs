import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { initQrGenerator, LAST_QR } = await import(process.env.QRVEO_GENERATOR_TEST_MODULE
  ? pathToFileURL(process.env.QRVEO_GENERATOR_TEST_MODULE).href : new URL("../src/scripts/qr-generator.mjs", import.meta.url).href);

const qrcode = createRequire(import.meta.url)("../src/vendor/qrcode.js");
const copy = JSON.parse(await readFile(new URL("../content/en.json", import.meta.url), "utf8")).generator;

function draftStorage() {
  const drafts = new Map(), sessions = new Map(), commits = [];
  const state = { drafts, sessions, commits, hold: false, fail: false };
  state.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          close() {},
          transaction() {
            const pending = new Map(drafts);
            const transaction = {
              objectStore: () => ({
                // Node's structuredClone drops File metadata; IndexedDB preserves the immutable File.
                put: (value, key) => pending.set(key, { ...structuredClone({ ...value, file: null }), file: value.file }),
                delete: key => pending.delete(key),
                get(key) {
                  const read = { result: pending.get(key) };
                  queueMicrotask(() => read.onsuccess());
                  return read;
                },
                openCursor() {
                  const cursor = { result: null };
                  queueMicrotask(() => cursor.onsuccess());
                  return cursor;
                },
              }),
              abort() { transaction.onabort(); },
            };
            const commit = () => {
              if (state.fail) {
                transaction.error = new Error("quota");
                transaction.onabort();
              } else {
                drafts.clear();
                pending.forEach((value, key) => drafts.set(key, value));
                transaction.oncomplete();
              }
            };
            setImmediate(() => state.hold ? commits.push(commit) : commit());
            return transaction;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  return state;
}

function element(extra = {}) {
  const children = new Map();
  return {
    hidden: false, dataset: {}, handlers: {}, textContent: "", innerHTML: "", value: "",
    style: { setProperty() {} },
    classList: { remove() {}, add() {}, toggle() {} },
    addEventListener(type, handler) { this.handlers[type] = handler; },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; },
    getAttribute(name) { return this[name] ?? null; },
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, element());
      return children.get(selector);
    },
    append() {}, click() {}, scrollIntoView() {}, pause() {}, play() { return Promise.resolve(); },
    ...extra,
  };
}

async function fixture(t, member, resume = true, limits = {}) {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const tabs = ["video", "url"].map(mode => element({ dataset: { qrTab: mode } }));
  const panels = ["video", "url"].map(mode => element({ dataset: { qrPanel: mode } }));
  const swatch = element({ dataset: { qrColor: "#20594d", qrLabel: "#20594d" } });
  const downloadButtons = ["png", "svg"].map(format => element({ dataset: { qrDownload: format } }));
  const root = element({
    querySelector: node,
    querySelectorAll: selector => ({
      "[data-qr-tab]": tabs,
      "[data-qr-panel]": panels,
      "[data-qr-color]": [swatch],
      "[data-qr-download]": downloadButtons,
    })[selector] || [],
  });
  node("[data-qr-text]").textContent = JSON.stringify(copy);
  node("[data-desk-sticker]").innerHTML = "example sticker";
  const color = element({ value: "#141210", closest: () => element() });
  node("[data-qr-form]").elements = {
    url: element(), color, template: element({ value: "product" }),
    caption: element({ value: copy.captions.product }), logo: element(),
  };
  node("[data-trial-form]").elements = { captcha: element() };
  const id = member ? { videoId: "video-test", memberOwner: "owner" }
    : { trialId: "trial-test", trialToken: "fixture-trial-token" };
  const watchUrl = "https://watch.example/video-test";
  const last = { kind: "video", ...id, watchUrl, name: "pending.mp4" };
  const storage = limits.storage || new Map(resume ? [[LAST_QR, JSON.stringify(last)]] : []);
  const draftState = limits.draftState || draftStorage();
  const timers = new Map();
  let timerId = 0, status = "processing", calls = 0, resolveStatus;
  let session = member ? "fixture-session" : "", cleared = 0, authError = limits.authError, finishPut;
  const requests = [], transfers = [];
  const pending = new Promise(resolve => { resolveStatus = resolve; });
  const globals = {
    document: element({
      querySelector: () => root,
      createElement: tag => tag === "canvas" ? element({
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => "data:image/png;base64,bG9nbw==",
      }) : element({ duration: limits.duration ?? 10, load() { this.onloadedmetadata?.(); } }),
    }),
    createImageBitmap: async () => {
      if (limits.invalidLogo) throw new Error("decode");
      return { width: 2048, height: 1024, close() {} };
    },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    sessionStorage: {
      getItem: key => draftState.sessions.get(key) || null,
      setItem: (key, value) => draftState.sessions.set(key, value),
    },
    indexedDB: draftState.indexedDB,
    matchMedia: () => ({ matches: false }),
    location: { href: "https://site.example/mexico/crear-qr/", search: "" },
    history: { replaceState() {} },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    setInterval: () => ++timerId,
    clearInterval() {},
    XMLHttpRequest: class {
      upload = {};
      headers = {};
      open(method, url) { this.method = method; this.url = url; }
      setRequestHeader(key, value) { this.headers[key] = value; }
      send(body) {
        const number = transfers.length + 1;
        this.status = limits.uploadPartStatuses?.[number - 1] ?? limits.uploadStatus ?? 200;
        transfers.push({ method: this.method, url: this.url, headers: this.headers, body });
        finishPut = () => limits.uploadNetwork || limits.uploadNetworkPart === number ? this.onerror() : this.onload();
        if (!limits.holdUpload) finishPut();
      }
    },
  };
  const metricEvents = [];
  if (limits.metrics) {
    globals.window = {};
    globals.location = new URL("https://mx.qrveo.com/mexico/crear-qr/");
    globals.fetch = async (_, init) => {
      metricEvents.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ data: { accepted: true } }) };
    };
  }
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
  const api = async (route, options) => {
    requests.push({ route, options });
    if ((route === "/member-video/limits" || route === "/member-video/upload") && authError) throw authError;
    if (route === "/member-video/limits") return { data: {
      userId: "owner", maxBytes: limits.maxBytes ?? 128_000_000, quota: { limit: null },
    } };
    if (route === "/free-qr/quota" || route === "/trial/quota") {
      return { data: { remaining: null, limit: null, maxBytes: limits.maxBytes ?? 50_000_000,
        maxSeconds: Object.hasOwn(limits, "maxSeconds") ? limits.maxSeconds : 60 } };
    }
    if (route.startsWith("/auth/kaptcha")) return { data: limits.captchaDisabled
      ? { enabled: false } : { captchaId: "fixture", img: "data:image/png;base64,dGVzdA==" } };
    if (route.endsWith("/upload")) return { data: {
      ...(route === "/trial/upload" ? { trialId: "trial-test", trialToken: "fixture-trial-token" } : id),
      watchUrl, upload: limits.uploadTarget || { url: "https://upload.example/fixture" },
    } };
    if (route.endsWith("/complete")) return { data: { status: "processing", watchUrl } };
    calls++;
    await pending;
    return { data: { status, watchUrl, errorCode: "TRIAL_ENCODING_FAILED" } };
  };
  const generator = await initQrGenerator({
    qrcode, readToken: () => session, clearToken: () => { session = ""; cleared++; },
    consoleHome: "https://site.example/console", lang: "en", api,
  });
  const hasQr = () => node("[data-desk-sticker]").innerHTML.includes("h1v1h-1z");
  const concealed = () => {
    assert.equal(hasQr(), false, "A watch URL alone must not produce a scannable QR");
    assert.equal(node("[data-desk-pointer]").hidden, true, "Do not label an unfinished QR as ready");
    assert.equal(node("[data-qr-downloads]").hidden, true);
    assert.equal(node("[data-trial-ready]").hidden, true);
  };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {
    node, tabs, swatch, hasQr, concealed, storage, requests, transfers, draftState, generator, metricEvents, calls: () => calls,
    download: format => downloadButtons.find(button => button.dataset.qrDownload === format).handlers.click(),
    finishPut: () => finishPut(),
    session: () => session, cleared: () => cleared,
    expireSession() { authError = Object.assign(new Error("expired"), { code: "AUTH_REQUIRED" }); },
    async submit() { await node("[data-trial-form]").handlers.submit({ preventDefault() {} }); },
    async answer(next) { status = next; resolveStatus(); await flush(); },
    async pick(size = 7) {
      const file = typeof size === "number" ? new File(["fixture"], "upload.mp4", { type: "video/mp4" }) : size;
      if (typeof size === "number") Object.defineProperty(file, "size", { value: size });
      node("[data-trial-file]").files = [file];
      await node("[data-trial-file]").handlers.change();
    },
    async upload(size = 7) {
      await this.pick(size);
      await node("[data-trial-form]").handlers.submit({ preventDefault() {} });
    },
    async poll(next) {
      status = next;
      const entry = [...timers].find(([, timer]) => timer.delay <= 10_000);
      assert.ok(entry, "Processing must keep polling");
      timers.delete(entry[0]);
      await entry[1].callback();
      await flush();
    },
  };
}

for (const member of [false, true]) {
  test(`${member ? "member" : "anonymous"}: multipart retains the existing completion contract and language-switch wait`, async t => {
    const partSize = 5 * 1024 ** 2;
    const bytes = Uint8Array.from({ length: partSize * 2 + 3 }, (_, index) => index % 251);
    const file = new File([bytes], "multipart.mp4", { type: "video/mp4" });
    const target = { mode: "multipart", partSize, parts: [1, 2, 3].map(partNumber => ({
      partNumber, url: `https://upload.example/part-${partNumber}`, method: "PUT", headers: {},
    })) };
    const f = await fixture(t, member, false, { uploadTarget: target, holdUpload: true });
    const upload = f.upload(file);
    const flush = () => new Promise(resolve => setImmediate(resolve));
    await flush();
    let switched = false;
    const switching = f.generator.prepareLanguageSwitch().then(() => { switched = true; });
    await flush();
    for (let index = 0; index < 3; index++) {
      assert.equal(switched, false, "Navigation waits for all parts and the existing complete request");
      assert.equal(f.requests.some(row => row.route.endsWith("/complete")), false);
      assert.equal(f.transfers.length, index + 1);
      assert.deepEqual(new Uint8Array(await f.transfers[index].body.arrayBuffer()),
        bytes.slice(index * partSize, Math.min((index + 1) * partSize, file.size)));
      f.finishPut();
      await flush();
    }
    await upload;
    await switching;
    const preparation = f.requests.find(row => row.route.endsWith("/upload"));
    assert.equal(preparation.options.body.multipart, true);
    assert.equal(preparation.options.body.size, bytes.length);
    const completions = f.requests.filter(row => row.route.endsWith("/complete"));
    assert.equal(completions.length, 1);
    assert.deepEqual(completions[0], member
      ? { route: "/member-video/video-test/complete", options: { method: "POST", token: "fixture-session", body: {} } }
      : { route: "/trial/trial-test/complete", options: { method: "POST", body: { trialToken: "fixture-trial-token" } } });
    const saved = [...f.draftState.drafts.values()][0];
    assert.equal(saved.file, null);
    assert.equal(saved.trial.watchUrl, "https://watch.example/video-test");
    f.concealed();
    await f.answer("ready");
    assert.equal(f.hasQr(), true);
  });

  for (const [options, expected] of [
    [{ uploadPartStatuses: [200, 524, 200] }, "put_http_524"],
    [{ uploadNetworkPart: 2 }, "put_network"],
  ]) {
    test(`${member ? "member" : "anonymous"}: a middle multipart ${expected} stops before completion and keeps the file`, async t => {
      const partSize = 5 * 1024 ** 2;
      const file = new File([new Uint8Array(partSize * 2 + 3)], "multipart.mp4", { type: "video/mp4" });
      const target = { mode: "multipart", partSize, parts: [1, 2, 3].map(partNumber => ({
        partNumber, url: `https://upload.example/part-${partNumber}`, method: "PUT", headers: {},
      })) };
      const f = await fixture(t, member, false, { metrics: true, uploadTarget: target, ...options });
      await f.upload(file);
      assert.equal(f.transfers.length, 2, "No later part and no retry after failure");
      assert.equal(f.requests.some(row => row.route.endsWith("/complete")), false);
      assert.deepEqual(f.metricEvents.map(row => row.event), ["video_attempt", expected]);
      assert.equal(f.node("[data-trial-file]").files[0], file);
      assert.equal(f.node("[data-trial-submit]").disabled, false);
      assert.equal(f.node("[data-trial-picked]").hidden, false);
      f.concealed();
      if (expected === "put_http_524") assert.match(f.node("[data-trial-msg]").textContent, /HTTP 524/);
      await f.generator.prepareLanguageSwitch();
      const saved = [...f.draftState.drafts.values()][0];
      assert.equal(saved.file, file, "Failed multipart upload resolves uploadDone and preserves the selected file");
      assert.equal(saved.trial, null);
    });
  }

  test(`${member ? "member" : "anonymous"}: metrics count only successful new video QR and initiated download`, async t => {
    const f = await fixture(t, member, false, { metrics: true });
    await f.upload();
    assert.deepEqual(f.metricEvents.map(row => row.event), ["video_attempt"]);
    assert.equal(f.metricEvents.filter(row => row.event === "qr_generate").length, 0, "Upload completion alone is not a ready QR");
    await f.answer("ready");
    assert.equal(f.metricEvents.length, 2);
    assert.equal(f.metricEvents[1].event, "qr_generate");
    const saved = JSON.parse(f.storage.get(LAST_QR));
    assert.equal(saved.metricsRecorded, true);
    assert.equal(saved.metricsEventId, f.metricEvents[1].id);
    assert.equal(saved.metricsEventId, f.metricEvents[0].id, "Attempt and success share a deduplicated correlation ID");
    await f.download("svg");
    assert.equal(f.metricEvents[2].event, "qr_download");
    assert.equal(f.metricEvents[2].format, "svg");
    assert.equal(f.metricEvents[2].kind, "video");
    const restored = await fixture(t, member, true, { metrics: true, storage: f.storage });
    await restored.answer("ready");
    assert.equal(restored.metricEvents.length, 0, "Restoring an existing ready QR is not a new generation");
  });
}

for (const [options, expected] of [
  [{ uploadStatus: 403 }, "put_http_403"], [{ uploadStatus: 413 }, "put_http_413"],
  [{ uploadStatus: 503 }, "put_http_503"], [{ uploadStatus: 524 }, "put_http_524"],
  [{ uploadNetwork: true }, "put_network"],
]) {
  test(`anonymous: failed file transfer records ${expected} without counting a successful QR`, async t => {
    const f = await fixture(t, false, false, { metrics: true, ...options });
    await f.upload();
    assert.deepEqual(f.metricEvents.map(row => row.event), ["video_attempt", expected]);
    assert.equal(f.metricEvents[0].id, f.metricEvents[1].id);
    assert.equal(f.requests.some(row => row.route.endsWith("/complete")), false);
    assert.equal(f.hasQr(), false);
    assert.doesNotMatch(JSON.stringify(f.metricEvents), /upload[.]example|fixture-trial-token|upload[.]mp4/);
    if (options.uploadStatus) assert.match(f.node("[data-trial-msg]").textContent, new RegExp("HTTP " + options.uploadStatus));
  });
}

for (const type of ["image/png", "image/jpeg", "image/webp"]) {
  test(`logo: ${type} over 2 MiB is accepted and removable`, async t => {
    const f = await fixture(t, false, false);
    const logo = f.node("[data-qr-form]").elements.logo;
    logo.files = [new File([new Uint8Array(3 * 1024 ** 2)], "large-logo", { type })];
    await logo.handlers.change();
    assert.equal(f.node("[data-qr-logo-name]").textContent, "large-logo");
    assert.equal(f.node("[data-qr-logo-remove]").hidden, false);
    assert.equal(f.node("[data-qr-message]").textContent, "");
    assert.equal(f.requests.filter(({ route }) => route.endsWith("/upload")).length, 0);
    f.node("[data-qr-logo-remove]").handlers.click();
    assert.equal(f.node("[data-qr-logo-name]").textContent, copy.logoHint);
    assert.equal(f.node("[data-qr-logo-remove]").hidden, true);
  });
}

for (const type of ["image/svg+xml", "image/png"]) {
  test(`logo: ${type === "image/png" ? "undecodable images" : "unsupported formats"} are still rejected`, async t => {
    const f = await fixture(t, false, false, { invalidLogo: type === "image/png" });
    const logo = f.node("[data-qr-form]").elements.logo;
    logo.files = [new File(["not an image"], "invalid-logo", { type })];
    await logo.handlers.change();
    assert.equal(logo.value, "");
    assert.equal(f.node("[data-qr-message]").textContent, copy.errors.logo);
    assert.equal(f.node("[data-qr-message]").dataset.error, "true");
  });
}

for (const member of [false, true]) {
  test(`${member ? "member" : "anonymous"}: language navigation restores the selected file without uploading`, async t => {
    const f = await fixture(t, member, false);
    await f.pick();
    assert.equal(await f.generator.prepareLanguageSwitch(), "video");
    assert.equal(f.draftState.drafts.size, 1);
    const restored = await fixture(t, member, false, { draftState: f.draftState });
    assert.equal(restored.node("[data-trial-name]").textContent, "upload.mp4");
    assert.equal(restored.node("[data-trial-picked]").hidden, false);
    assert.equal(restored.node("[data-trial-submit]").disabled, false);
    assert.ok(!restored.requests.some(({ route }) => route.endsWith("/upload")));
    assert.equal(f.draftState.drafts.size, 0, "Consume the temporary file after restoring it");
    if (!member) assert.equal(restored.node("[data-trial-captcha]").hidden, false);
    restored.node("[data-trial-remove]").handlers.click();
    await restored.generator.prepareLanguageSwitch();
    assert.equal(f.draftState.drafts.size, 0, "Removing a restored video must not resurrect it");
  });

  test(`${member ? "member" : "anonymous"}: language navigation waits for upload completion, not transcoding`, async t => {
    const f = await fixture(t, member, false, { holdUpload: true });
    await f.pick();
    const upload = f.submit();
    await new Promise(resolve => setImmediate(resolve));
    let prepared = false;
    const switching = f.generator.prepareLanguageSwitch().then(() => { prepared = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(prepared, false);
    f.finishPut();
    await upload;
    await switching;
    assert.equal(f.requests.filter(({ route }) => route.endsWith("/upload")).length, 1);
    assert.equal(f.requests.filter(({ route }) => route.endsWith("/complete")).length, 1);
    const saved = [...f.draftState.drafts.values()][0];
    assert.equal(saved.file, null, "Do not copy a completed upload into browser storage");
    assert.equal(saved.trial.watchUrl, "https://watch.example/video-test");
    const restored = await fixture(t, member, false, { draftState: f.draftState });
    await restored.answer("ready");
    assert.equal(restored.node("[data-qr-open]").href, saved.trial.watchUrl);
    assert.ok(!restored.requests.some(({ route }) => route.endsWith("/upload")));
  });
}

test("language navigation requires a committed draft and retains the file if the transaction fails", async t => {
  const f = await fixture(t, false, false);
  await f.pick();
  f.draftState.hold = true;
  let prepared = false;
  const switching = f.generator.prepareLanguageSwitch().then(() => { prepared = true; });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prepared, false, "Request success alone is not a committed IndexedDB write");
  f.draftState.fail = true;
  f.draftState.commits.shift()();
  await assert.rejects(switching, /quota/);
  assert.equal(f.node("[data-trial-picked]").hidden, false);
  assert.equal(f.node("[data-trial-submit]").disabled, false);
  assert.equal(f.node("[data-trial-msg]").textContent, copy.errors.draft);
  f.draftState.hold = f.draftState.fail = false;
  assert.equal(await f.generator.prepareLanguageSwitch(), "video");
});

test("a language draft is not restored to another account and server limits are rechecked", async t => {
  const f = await fixture(t, true, false);
  await f.pick();
  await f.generator.prepareLanguageSwitch();
  const saved = [...f.draftState.drafts.values()][0];
  saved.owner = "another-owner";
  const other = await fixture(t, true, false, { draftState: f.draftState });
  assert.equal(other.node("[data-trial-drop]").hidden, false);
  await f.generator.prepareLanguageSwitch();
  const limited = await fixture(t, true, false, { draftState: f.draftState, maxBytes: 1 });
  assert.equal(limited.node("[data-trial-drop]").hidden, false);
  assert.equal(limited.node("[data-trial-pickmsg]").hidden, false);
  assert.ok(!limited.requests.some(({ route }) => route.endsWith("/upload")));
});

for (const member of [false, true]) {
  const name = member ? "member" : "anonymous";
  test(`${name}: upload completion is not transcoding success`, async t => {
    const f = await fixture(t, member, false);
    await f.upload();
    f.concealed();
    await f.answer("processing");
    f.concealed();
    await f.poll("ready");
    assert.equal(f.hasQr(), true);
    assert.equal(f.node("[data-qr-downloads]").hidden, false);
  });

  test(`${name}: a cached watch URL stays blank until transcoding succeeds`, async t => {
    const f = await fixture(t, member);
    f.concealed();
    await f.answer("processing");
    f.concealed();
    f.swatch.handlers.click();
    f.concealed();
    f.tabs[1].handlers.click();
    f.tabs[0].handlers.click();
    f.concealed();
    await f.poll("ready");
    assert.equal(f.hasQr(), true);
    assert.equal(f.node("[data-desk-pointer]").hidden, false);
    assert.equal(f.node("[data-qr-downloads]").hidden, false);
    assert.equal(f.node("[data-trial-ready]").hidden, false);
    assert.equal(f.node("[data-qr-open]").href, "https://watch.example/video-test");
    assert.equal(f.calls(), 2);
  });

  test(`${name}: transcoding failure never exposes the pending QR`, async t => {
    const f = await fixture(t, member);
    f.concealed();
    await f.answer("failed");
    assert.equal(f.hasQr(), false);
    assert.equal(f.node("[data-desk-pointer]").hidden, true);
    assert.equal(f.node("[data-qr-downloads]").hidden, true);
    assert.equal(f.storage.has(LAST_QR), false);
    assert.equal(f.node("[data-trial-msg]").dataset.error, "true");
  });

  test(`${name}: server size limits are shown and enforced before requesting upload`, async t => {
    const maxBytes = member ? 128 * 1024 ** 2 : 12_000_000;
    const f = await fixture(t, member, false, { maxBytes });
    await f.upload(maxBytes + 1);
    assert.equal(f.calls(), 0);
    assert.match(f.node("[data-trial-pickmsg]").textContent, member ? /128 MiB/ : /12 MB/);
    assert.doesNotMatch(f.node("[data-trial-pickmsg]").textContent, /\{max\}/);
    await f.upload(maxBytes);
    await f.answer("processing");
    f.concealed();
  });
}

test("anonymous: duration limit comes from server configuration", async t => {
  const f = await fixture(t, false, false, { maxSeconds: 30, duration: 31 });
  await f.upload();
  assert.equal(f.calls(), 0);
  assert.match(f.node("[data-trial-pickmsg]").textContent, /30/);
  assert.doesNotMatch(f.node("[data-trial-pickmsg]").textContent, /\{seconds\}/);
});

test("anonymous: disabled trial limits accept a video over 50 MB and 60 seconds", async t => {
  const f = await fixture(t, false, false, { maxBytes: 128 * 1024 ** 2, maxSeconds: null, duration: 180 });
  assert.equal(f.node("[data-trial-drop]").querySelector(".gen-note").textContent, copy.memberLimits.replace("{max}", "128 MiB"));
  assert.equal(f.node("[data-trial-quota]").textContent, "");
  assert.equal(f.node("[data-trial-quota]").hidden, true);
  assert.equal(f.node("[data-qr-remaining]").textContent, "");
  assert.equal(f.node("[data-qr-remaining]").hidden, true);
  await f.upload(51_000_000);
  assert.equal(f.node("[data-trial-pickmsg]").hidden, true);
  assert.equal(f.requests.filter(({ route }) => route === "/trial/upload").length, 1);
  assert.equal(f.requests.filter(({ route }) => route.endsWith("/complete")).length, 1);
  await f.answer("ready");
  assert.equal(f.hasQr(), true);
});

test("anonymous test mode hides the disabled captcha without blocking upload", async t => {
  const f = await fixture(t, false, false, { captchaDisabled: true });
  await f.pick();
  assert.equal(f.node("[data-trial-captcha]").hidden, true);
  assert.equal(f.node("[data-trial-submit]").disabled, false);
  await f.submit();
  assert.equal(f.requests.filter(({ route }) => route === "/trial/upload").length, 1);
  await f.answer("ready");
  assert.equal(f.hasQr(), true);
});

test("an invalid saved session restores anonymous upload and its captcha", async t => {
  const authError = Object.assign(new Error("expired"), { code: "AUTH_REQUIRED" });
  const f = await fixture(t, true, false, { authError });
  assert.equal(f.session(), "");
  assert.equal(f.cleared(), 1);
  assert.equal(f.node("[data-trial-msg]").textContent, "");
  await f.upload();
  assert.equal(f.node("[data-trial-pickmsg]").hidden, true);
  assert.ok(f.requests.some(({ route }) => route.startsWith("/auth/kaptcha")));
  const upload = f.requests.find(({ route }) => route === "/trial/upload");
  assert.ok(upload);
  assert.equal(upload.options.token, undefined);
  assert.equal(upload.options.body.captchaKey, "fixture");
  assert.ok(!f.requests.some(({ route }) => route === "/member-video/upload"));
  await f.answer("ready");
  assert.equal(f.hasQr(), true);
});

test("a session expiring after file selection restores the file and requires anonymous confirmation", async t => {
  const f = await fixture(t, true, false);
  f.expireSession();
  await f.upload();
  assert.equal(f.cleared(), 1);
  assert.equal(f.node("[data-trial-submit]").disabled, false);
  assert.equal(f.node("[data-trial-captcha]").hidden, false);
  assert.ok(!f.requests.some(({ route }) => route === "/trial/upload"));
  await f.submit();
  assert.equal(f.requests.filter(({ route }) => route === "/trial/upload").length, 1);
  await f.answer("ready");
  assert.equal(f.hasQr(), true);
});

for (const authError of [
  Object.assign(new Error("account expired"), { code: "ACCOUNT_EXPIRED" }),
  Object.assign(new Error("offline"), { network: true }),
]) {
  test(`member failures do not silently become anonymous: ${authError.message}`, async t => {
    const f = await fixture(t, true, false, { authError });
    assert.equal(f.session(), "fixture-session");
    assert.equal(f.cleared(), 0);
    assert.ok(!f.requests.some(({ route }) => route === "/trial/quota"));
    await f.upload();
    assert.ok(!f.requests.some(({ route }) => route.endsWith("/upload")));
  });
}
