// Puppeteer login script for Lighthouse CI.
// Runs once before URL collection; establishes the httpOnly auth cookie in the
// shared browser context so /overview and /waterfall render as authenticated.
// Credentials match apps/backend/src/db/seed.ts (dev/CI only — not real creds).

module.exports = async (browser, _context) => {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3000/login", { waitUntil: "networkidle0" });

  // If already authenticated the app redirects away from /login — nothing to do.
  if (!page.url().includes("/login")) {
    await page.close();
    return;
  }

  await page.waitForSelector("#email", { timeout: 15000 });
  await page.type("#email", "owner@finplan.test");
  await page.type("#password", "BrowserTest123!");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click('button[type="submit"]'),
  ]);
  await page.close();
};
