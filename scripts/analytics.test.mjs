import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const analytics = await readFile(new URL("../src/scripts/analytics.mjs", import.meta.url), "utf8");
const site = await readFile(new URL("../src/scripts/site.js", import.meta.url), "utf8");
let checks = 0;

function runtime(href) {
  const calls = [], scripts = [], listeners = {};
  const context = {
    location: new URL(href), URL, URLSearchParams, setTimeout, clearTimeout,
    window: { gtag: (...args) => {
      calls.push(args);
      if (args[0] === "event") args[2].event_callback();
    } },
    document: {
      referrer: "https://mx.qrveo.com/mexico/iniciar-sesion/?email=private@example.test#token",
      createElement: () => ({}),
      head: { append: (script) => scripts.push(script) },
      addEventListener: (type, callback) => { listeners[type] = callback; },
    },
  };
  vm.runInNewContext(analytics.replace("export function track", "function track"), context);
  return { context, calls, scripts, listeners };
}

for (const href of [
  "http://127.0.0.1:4321/mexico/", "http://localhost:4321/mexico/",
  "http://192.168.1.2:4321/mexico/", "https://qrveo.com/mexico/",
  "http://mx.qrveo.com/mexico/", "https://mx.qrveo.com/admin/",
  "https://mx.qrveo.com/mexico/?analytics=off",
]) {
  const { context, calls, scripts } = runtime(href);
  await context.track("sign_up", { method: "email" });
  assert.equal(calls.length, 0, href);
  assert.equal(scripts.length, 0, href);
  checks++;
}

for (const route of ["registro/", "en/registro/", "zh/iniciar-sesion/", "pago/", "crear-qr/"]) {
  const { context, calls, scripts } = runtime(`https://mx.qrveo.com/mexico/${route}?email=private@example.test#token`);
  assert.equal(scripts.length, 0, "Private pages must not start collection on page load");
  await context.track("sign_up", { method: "google", email: "private@example.test", token: "secret" });
  assert.equal(scripts.length, 1);
  assert.match(scripts[0].src, /\/gtag\/js[?]id=G-M6PRCQ48SD$/);
  const config = calls.find(([command]) => command === "config")[2];
  assert.equal(config.send_page_view, false);
  const events = calls.filter(([command]) => command === "event");
  assert.equal(events.length, 1);
  assert.equal(events[0][1], "sign_up");
  assert.equal(events[0][2].method, "google");
  assert.equal(events[0][2].page_location, `https://mx.qrveo.com/mexico/${route}`);
  assert.equal(events[0][2].page_referrer, "https://mx.qrveo.com/mexico/iniciar-sesion/");
  assert.doesNotMatch(JSON.stringify(calls), /private@example|secret|#token|[?]email=/);
  checks++;
}

{
  const { context, calls, scripts, listeners } = runtime("https://mx.qrveo.com/mexico/contacto/");
  assert.equal(scripts.length, 1);
  assert.match(scripts[0].src, /\/gtm[.]js[?]id=G-M6PRCQ48SD$/);
  for (const href of ["https://wa.me/8613202327165?text=private", "mailto:mx@qrveo.com"]) {
    listeners.click({ target: { closest: () => ({ href }) } });
  }
  const events = calls.filter(([command]) => command === "event");
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event[1]), ["contact_click", "contact_click"]);
  assert.deepEqual(events.map((event) => event[2].method), ["whatsapp", "email"]);
  assert.doesNotMatch(JSON.stringify(events), /text=private|8613202327165|mailto:/);
  await context.track("purchase", { method: "email" });
  await context.track("sign_up", { method: "anything" });
  assert.equal(calls.filter(([command]) => command === "event").length, 2);
  checks++;
}

const googleHandler = /const submitGoogle = (async [\s\S]+?);\r?\n    const startGoogle/.exec(site)?.[1];
assert.ok(googleHandler, "Find the real Google authentication callback");
for (const scenario of [{ isNew: true }, { isNew: false }, {}, { failed: true }]) {
  const events = [], redirects = [];
  const form = { querySelector: () => ({}), reset() {}, elements: { password: {}, consent: {} } };
  const context = {
    sending: false, credential: "test-credential", challenge: { nonce: "test-nonce" },
    googleBox: { setAttribute() {}, removeAttribute() {} },
    consent: form, link: form, mount: {}, startButton: {},
    showGoogleStatus() {},
    T: { google: { loading: "", failed: "" }, loginDone: "" },
    dataOf: (value) => value.data || value,
    api: async () => {
      if (scenario.failed) throw new Error("rejected");
      return { data: { token: "test-token", ...scenario } };
    },
    authPage: { querySelectorAll: () => [] },
    track: async (...args) => events.push(args),
    afterLogin: (token) => redirects.push(token),
  };
  await vm.runInNewContext(`(${googleHandler})`, context)();
  assert.equal(events.length, scenario.isNew === true ? 1 : 0);
  if (events.length) assert.deepEqual(JSON.parse(JSON.stringify(events[0])), ["sign_up", { method: "google" }]);
  assert.equal(redirects.length, scenario.failed ? 0 : 1);
  checks++;
}

const registration = site.split('if (kind === "register") {')[1].split('if (kind === "login") {')[0];
const emailHandler = /form[.]addEventListener\("submit", (async [\s\S]+?)\);\r?\n    \}/.exec(registration)?.[1];
assert.ok(emailHandler, "Find the real email registration callback");
for (const scenario of [{}, { invalid: true }, { failed: true }, { noToken: true }]) {
  const events = [], redirects = [], requests = [];
  const context = {
    kind: "register",
    say() {}, busy() {}, check: () => !scenario.invalid,
    form: { elements: { password: { value: "Test12345" }, consent: { checked: true } } },
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    PASSWORD: /^(?=.*[A-Za-z])(?=.*\d).{8,16}$/,
    val: () => "test@example.test",
    T: { regDone: "", network: "" }, errText: () => "rejected",
    api: async (...args) => {
      requests.push(args);
      if (scenario.failed) throw new Error("rejected");
      return scenario.noToken ? { success: true } : { data: { token: "test-token" } };
    },
    dataOf: (value) => value.data || value,
    track: async (...args) => events.push(args),
    afterLogin: (token) => redirects.push(token),
    setTimeout: () => 0,
  };
  await vm.runInNewContext(`(${emailHandler})`, context)({ preventDefault() {} });
  assert.equal(requests.length, scenario.invalid ? 0 : 1);
  assert.equal(events.length, scenario.invalid || scenario.failed ? 0 : 1);
  if (events.length) assert.deepEqual(JSON.parse(JSON.stringify(events[0])), ["sign_up", { method: "email" }]);
  assert.equal(redirects.length, scenario.invalid || scenario.failed || scenario.noToken ? 0 : 1);
  checks++;
}

const waBlock = site.slice(site.indexOf("const waForm ="), site.indexOf("// 5 "));
for (const name of ["", "Test person"]) {
  const events = [], opened = [];
  let submit;
  const context = {
    document: { querySelector: () => ({
      dataset: { hello: "{name}", use: "{use}", wa: "8613202327165" },
      addEventListener: (_type, callback) => { submit = callback; },
      querySelector: () => ({ focus() {} }),
    }) },
    FormData: class { get(key) { return { name, message: "Private message", use: "test" }[key]; } },
    track: (...args) => events.push(args),
    window: { open: (...args) => opened.push(args) },
  };
  vm.runInNewContext(waBlock, context);
  submit({ preventDefault() {} });
  assert.equal(events.length, name ? 1 : 0);
  assert.equal(opened.length, name ? 1 : 0);
  assert.doesNotMatch(JSON.stringify(events), /Private message|Test person|8613202327165/);
  checks++;
}

console.log(`PASS: ${checks} analytics checks; no live accounts, messages, or analytics events created.`);
