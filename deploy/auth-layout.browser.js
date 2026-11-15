async (page) => {
  const base = "http://127.0.0.1:4321/mexico/";
  const dist = ".runtime/login-layout-20261107";
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  let release;
  let ready;
  const reset = () => { ready = new Promise(resolve => { release = resolve; }); };
  reset();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__VOD_PRIVATE__ = { apiOrigin: location.origin + "/api" };
    window.googleRenders = 0;
  });
  await page.route(base + "**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ path: dist + path + (path.endsWith("/") ? "index.html" : "") });
  });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/google/challenge") || path.endsWith("/kaptcha")) await ready;
    const data = path.endsWith("/google/challenge")
      ? { clientId: "layout-test.apps.googleusercontent.com", nonce: "a".repeat(43) }
      : path.endsWith("/kaptcha")
        ? { captchaId: "layout-test", img: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="44"><rect width="120" height="44" fill="#eee"/></svg>' }
        : {};
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(path.endsWith("/login/google")
        ? { success: false, errorCode: "GOOGLE_CONSENT_REQUIRED" }
        : { success: true, data }),
    });
  });
  await page.route("https://accounts.google.com/gsi/client", route => route.fulfill({
    contentType: "application/javascript",
    body: `window.google={accounts:{id:{
      initialize:function(config){window.googleConfig=config;},
      renderButton:function(target,options){
        window.googleRenders++;
        var button=document.createElement('button');
        button.type='button';button.textContent='Continue with Google';
        button.style.cssText='width:'+options.width+'px;height:40px;border:1px solid #dadce0;border-radius:4px;background:#fff;font:500 14px Arial';
        button.onclick=function(){window.googleConfig.callback({credential:'layout-test'});};
        target.append(button);
      }
    }}};`,
  }));
  const results = [];
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["", "en/", "pt/", "fr/", "de/", "zh/", "ja/", "ko/"]
      .flatMap(lang => [lang + "iniciar-sesion/", lang + "registro/"])) {
      reset();
      await page.goto(base + path);
      await page.evaluate(() => document.fonts.ready);
      const submit = page.locator(".auth-form .auth-submit");
      const before = await submit.boundingBox();
      const beforeGoogle = await page.locator("[data-google-start]").boundingBox();
      const beforeStyle = await page.locator("[data-google-start]").evaluate(el => {
        const style = getComputedStyle(el);
        return { radius: style.borderRadius, border: style.borderColor, background: style.backgroundColor };
      });
      const login = path.includes("iniciar-sesion");
      if (login) {
        check(await page.locator("[data-captcha-row]").isVisible(), "Reserve captcha space before the API responds");
      }
      check(await page.locator(".lang-reel").evaluate(el => getComputedStyle(el).animationName) === "none",
        "Account language label must stay in the selected language");
      release();
      await page.locator("[data-google-button] button").waitFor();
      const afterGoogle = await page.locator("[data-google-button] button").boundingBox();
      for (const key of ["x", "y", "width", "height"]) {
        check(Math.abs(beforeGoogle[key] - afterGoogle[key]) <= 1,
          "Google button must not change " + key + " after loading: " + width + " " + path);
      }
      check(afterGoogle.width <= 400 && afterGoogle.height === 40, "Use the provider's supported button dimensions");
      const email = await page.locator(".auth-form input[name=email]").boundingBox();
      check(Math.abs(email.width - afterGoogle.width) <= 1, "Google and email controls must align");
      const afterStyle = await page.locator("[data-google-button] button").evaluate(el => {
        const style = getComputedStyle(el);
        return { radius: style.borderRadius, border: style.borderColor, background: style.backgroundColor };
      });
      check(JSON.stringify(beforeStyle) === JSON.stringify(afterStyle), "Loading must preserve the Google button outline");
      if (login) await page.locator("[data-captcha-img]").evaluate(img => img.decode());
      const after = await submit.boundingBox();
      check(Math.abs(before.y - after.y) <= 1, "Authentication loading must not move submit: " + width + " " + path);
      check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "No horizontal overflow");
      const renders = await page.evaluate(() => window.googleRenders);
      await page.waitForTimeout(200);
      check(await page.evaluate(() => window.googleRenders) === renders, "A stable button must not continuously redraw");
      if (path.startsWith("zh/iniciar")) {
        await page.screenshot({ path: dist + (width === 1440 ? "/desktop.png" : "/mobile.png"), fullPage: true });
      }
      await page.locator("[data-google-button] button").click();
      await page.locator("[data-google-consent]").waitFor({ state: "visible" });
      await page.waitForTimeout(100);
      check(await page.evaluate(() => window.googleRenders) === renders, "Hiding the provider for consent must not redraw it");
      results.push({ width, path, shift: after.y - before.y, renders });
    }
  }
  check(errors.length === 0, "Unexpected page errors: " + errors.join("; "));
  return { passed: true, results, realGoogleAuthorization: "not exercised; SDK/API mocked" };
}
