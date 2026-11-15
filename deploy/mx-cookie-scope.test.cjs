const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/scripts/site.js"), "utf8");
const cookieTail = source.slice(source.indexOf("const cookieTail ="), source.indexOf("const writeToken ="));
assert(cookieTail.startsWith("const cookieTail ="));

function tail(href, consoleHome) {
  return vm.runInNewContext(`${cookieTail}\ncookieTail()`, {
    URL, location: new URL(href), CONSOLE_HOME: consoleHome,
  });
}

const sameHost = tail("https://mx.qrveo.com/mexico/", "https://mx.qrveo.com/console");
assert(!sameHost.includes("Domain="), "Single-domain login must not share tokens with sibling sites");
assert(sameHost.includes("Secure"));
assert(sameHost.includes("SameSite=Lax"));
assert(tail("https://www.qrveo.com/mexico/", "https://console.qrveo.com").includes("Domain=.qrveo.com"));
assert(!tail("http://127.0.0.1:4321/mexico/", "http://127.0.0.1:30081").includes("Domain="));
assert(!tail("http://127.0.0.1:4321/mexico/", "http://127.0.0.1:30081").includes("Secure"));

const consoleSource = fs.readFileSync(path.join(__dirname, "../../console-theme/src/patch.js"), "utf8");
const payHandoff = consoleSource.match(/if \(act === "pay"\) \{[\s\S]*?\n    \}/);
assert(payHandoff, "Console checkout handoff is missing");
function checkoutCookie(href, officialPage) {
  const document = { cookie: "" };
  vm.runInNewContext(`(function () { ${payHandoff[0]} }());`, {
    URL, document, act: "pay", location: new URL(href),
    localStorage: { getItem: () => "test-only+token=" }, siteUrl: () => officialPage,
  });
  return document.cookie;
}
const mxCheckout = checkoutCookie("https://mx.qrveo.com/console/", "https://mx.qrveo.com/mexico/ja/pago/");
assert(!mxCheckout.includes("Domain="), "Same-domain checkout must not share tokens with sibling sites");
assert(mxCheckout.includes("x-auth-token=test-only%2Btoken%3D"));
assert(mxCheckout.includes("; Secure"));
assert(mxCheckout.includes("; SameSite=Lax"));
assert(checkoutCookie("https://console.qrveo.com/", "https://www.qrveo.com/mexico/pago/").includes("Domain=.qrveo.com"));
assert(!checkoutCookie("http://127.0.0.1:30081/", "http://127.0.0.1:4321/mexico/pago/").includes("Domain="));
assert(!checkoutCookie("http://127.0.0.1:30081/", "http://127.0.0.1:4321/mexico/pago/").includes("; Secure"));
console.log("PASS: host-only MX login and checkout cookies; cross-domain and local handoffs retained");
