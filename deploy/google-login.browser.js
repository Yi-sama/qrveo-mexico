async (page) => {
  const origin = "http://127.0.0.1:4321";
  const base = origin + "/mexico/";
  const testDist = ".runtime/google-entry-20261105";
  const shotDir = testDist;
  const clientId = "624245332888-lm1iit0fkjsgfg46vpbc8be33peb2hs5.apps.googleusercontent.com";
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const posts = [], errors = [];
  let scenario = "consent";
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", { configurable: true, get: () => ["zh-CN"] });
    window.__VOD_PRIVATE__ = {
      apiOrigin: "http://127.0.0.1:30015",
      consoleOrigin: "http://127.0.0.1:30081",
      watchOrigin: "http://127.0.0.1:30112",
    };
  });
  // Load the local build without a listening server; only provider/API responses are mocked.
  await page.route(base + "**", route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = testDist + pathname + (pathname.endsWith("/") ? "index.html" : "");
    return route.fulfill({ path: file });
  });
  await page.route("**/auth/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "content-type,accept-language", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    const send = (status, json) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(json) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (pathname.endsWith("/google/challenge")) {
      if (scenario === "unavailable") return send(503, { success: false, errorCode: "SERVICE_UNAVAILABLE" });
      return send(200, { success: true, data: { clientId, nonce: "a".repeat(43) } });
    }
    if (pathname.endsWith("/login/google")) {
      const body = request.postDataJSON();
      posts.push(body);
      if (scenario === "consent" && !body.consent) return send(409, { success: false, errorCode: "GOOGLE_CONSENT_REQUIRED" });
      if (scenario === "link" && !body.password) return send(409, { success: false, errorCode: "GOOGLE_LINK_REQUIRED" });
      return send(200, { success: true, data: { token: "google-ui-test-session" } });
    }
    if (pathname.endsWith("/kaptcha")) return send(200, { success: true, data: {} });
    return send(200, { success: true, data: {} });
  });
  await page.route("**/deploy-info", route => route.fulfill({
    contentType: "application/json", headers: { "Access-Control-Allow-Origin": origin },
    body: JSON.stringify({ success: true, data: { emailVerificationRequired: false } }),
  }));
  await page.route("**/gsi/client", route => scenario === "sdk-unavailable" ? route.abort() : route.fulfill({
    contentType: "application/javascript",
    body: `window.google={accounts:{id:{
      initialize:function(config){window.googleTestConfig=config;},
      renderButton:function(target,options){
        var button=document.createElement('button');
        button.type='button';button.textContent='Continue with Google';
        button.style.cssText='width:'+options.width+'px;height:44px;border:1px solid #aaa;border-radius:4px;background:#fff;font:500 15px Arial;cursor:pointer';
        button.onclick=function(){window.googleTestConfig.callback({credential:'test-google-credential'});};
        target.append(button);
      }
    }}};`,
  }));
  await page.route(base + "test-destination", route => route.fulfill({ contentType: "text/html", body: "<h1>Local test destination</h1>" }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "iniciar-sesion/?return=" + encodeURIComponent("/mexico/test-destination"));
  await page.locator("[data-google-button] button").waitFor();
  check(await page.locator("[data-google-start]").isHidden(), "Fallback must be hidden while Google is available");
  check(await page.locator("[data-auth-form=login] input[name=email]").isVisible(), "Email login must remain available");
  check(await page.evaluate(() => window.googleTestConfig.ux_mode === "popup" && window.googleTestConfig.nonce.length === 43), "Popup and nonce must be passed to Google");
  await page.screenshot({ path: testDist + "/browser-desktop.png", fullPage: true });
  await page.locator("[data-google-button] button").click();
  await page.locator("[data-google-consent]").waitFor({ state: "visible" });
  check(posts.length === 1 && posts[0].consent === false, "Do not silently accept terms");
  await page.locator("[data-google-consent] button").click();
  check(posts.length === 1, "Consent is required before registration");
  await page.locator("[data-google-consent] input").check();
  await page.locator("[data-google-consent] button").click();
  await page.waitForURL(base + "test-destination");
  check(posts.length === 2 && posts[1].consent === true, "Accepted consent must reach backend");
  check((await page.context().cookies()).some(cookie => cookie.name === "x-auth-token" && cookie.value === "google-ui-test-session"), "Use existing session cookie");
  await page.context().clearCookies();

  scenario = "link";
  await page.goto(base + "iniciar-sesion/?return=" + encodeURIComponent("/mexico/test-destination"));
  await page.locator("[data-google-button] button").click();
  await page.locator("[data-google-link]").waitFor({ state: "visible" });
  await page.locator("[data-google-link] input").fill("ExistingPass26");
  await page.locator("[data-google-link] button").click();
  await page.waitForURL(base + "test-destination");
  check(posts.at(-1).password === "ExistingPass26", "Explicit linking must use existing account password");
  await page.context().clearCookies();

  for (const lang of ["", "en/", "pt/", "fr/", "de/", "zh/", "ja/", "ko/"]) {
    for (const route of ["iniciar-sesion/", "registro/"]) {
      await page.goto(base + lang + route);
      await page.locator("[data-google-button] button").waitFor();
      check(await page.locator("[data-google-start]").isHidden(), "Fallback switches to the official button: " + lang + route);
      check(await page.locator("[data-google-status]").isHidden(), "No initial error: " + lang + route);
      check(await page.locator("[data-google-consent]").isHidden(), "No initial consent panel: " + lang + route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      check(!overflow, "Desktop horizontal overflow: " + lang + route);
      if (lang !== "zh/") {
        check(await page.locator(".auth-main > .lang-hint").isVisible(), "Language hint stays within the account layout: " + lang + route);
      }
    }
  }
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    for (const lang of ["", "en/", "pt/", "fr/", "de/", "zh/", "ja/", "ko/"]) {
      await page.goto(base + lang + "registro/");
      await page.locator("[data-google-button] button").waitFor();
      check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "Mobile horizontal overflow: " + width + lang);
      const button = await page.locator("[data-google-button] button").boundingBox();
      check(button.x >= 0 && button.x + button.width <= width, "Google button fits mobile: " + width + lang);
      if (lang !== "zh/") {
        check(await page.locator(".lang-hint").evaluate(hint =>
          getComputedStyle(hint).position === "static" &&
          hint.getBoundingClientRect().bottom <= document.querySelector(".auth-main h1").getBoundingClientRect().top
        ), "Language hint must not float over account controls: " + width + lang);
      }
      if (lang === "" && width === 375) await page.screenshot({ path: testDist + "/browser-mobile.png", fullPage: true });
      const submit = page.locator("[data-auth-form=register] .auth-submit");
      await submit.scrollIntoViewIfNeeded();
      check(await submit.evaluate(button => {
        const rect = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      }), "Registration button must be unobstructed: " + width + lang);
    }
  }
  await page.goto(base + "recuperar/");
  check(await page.locator("[data-google-auth]").count() === 0, "Recovery must remain unchanged");
  scenario = "unavailable";
  const unavailable = page.waitForResponse(response => response.url().endsWith("/google/challenge") && response.status() === 503);
  await page.goto(base + "iniciar-sesion/");
  await unavailable;
  await page.locator("[data-google-start]").waitFor({ state: "visible" });
  check(await page.locator("[data-google-status]").isHidden(), "Background failure must not show an error");
  check(await page.locator("[data-auth-form=login] input[name=email]").isVisible(), "Google failure must not remove email login");
  check(await page.locator("[data-google-consent]").isHidden(), "No consent panel on Google failure");
  await page.locator("[data-google-start]").click();
  await page.waitForFunction(() => document.querySelector("[data-google-status]").textContent === JSON.parse(document.getElementById("auth-text").textContent).google.unavailable);
  check(await page.locator("[data-google-start]").isVisible(), "Button stays available after a clicked failure");

  scenario = "sdk-unavailable";
  const sdkRequest = page.waitForRequest("**/gsi/client");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "zh/registro/");
  await sdkRequest;
  await page.waitForFunction(() => !document.querySelector('script[src*="gsi/client"]'));
  check(await page.locator("[data-google-start]").isVisible(), "SDK failure keeps the button visible");
  check(await page.locator("[data-google-status]").isHidden(), "SDK failure stays quiet before clicking");
  check(await page.locator("[data-google-start] img").evaluate(img => img.complete && img.naturalWidth > 0), "Fallback uses a loaded, locally served Google icon");
  await page.screenshot({ path: shotDir + "/fallback-desktop.png" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: shotDir + "/fallback-mobile.png" });
  await page.locator("[data-google-start]").click();
  await page.waitForFunction(() => document.querySelector("[data-google-status]").textContent === JSON.parse(document.getElementById("auth-text").textContent).google.unavailable);
  await page.waitForFunction(() => !document.querySelector('[data-google-start]').disabled);
  check(await page.locator("[data-google-start]").isVisible(), "SDK retry stays on the same button");
  scenario = "link";
  await page.locator("[data-google-start]").click();
  await page.locator("[data-google-button] button").waitFor();
  check(await page.locator("[data-google-start]").isHidden(), "Retry recovers provider initialization");
  check(errors.length === 0, "Unexpected page errors: " + errors.join("; "));
  return { passed: true, googleRequests: posts.length, checks: "consent, linking, cookie/return, 8 languages, desktop/mobile, recovery, silent SDK/API failure and clicked retry", realGoogleAuthorization: "not exercised; SDK and API mocked" };
}
