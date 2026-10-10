// shot-app.mjs — screenshots plus an end-to-end smoke run of the app in
// headless system Chrome (puppeteer-core, no bundled browser download).
// Serves the repo via tools/serve.mjs on a random localhost port.
// Localhost ONLY; never point this at external URLs.
//
//   npm run shots
//   Output: build/shots/<state>-<viewport>-<scheme>.png
//
// Besides pictures, it drives the real audio clock: answers a quiz
// question, and plays a full "Tap it" take with synthetic key presses
// timed to the written rhythm, then checks the score that comes back.
// Exits non-zero on console errors or a bad score.
//
// Headless Chrome can't run inside the Bash sandbox (it needs Mach
// services the sandbox blocks), so run this unsandboxed, per the
// shot-* allowlist convention.

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./serve.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(REPO, "build/shots");

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error("No system Chrome/Chromium found. Install Chrome or edit CHROME_CANDIDATES.");
  process.exit(1);
}

const VIEWPORTS = [
  ["phone", { width: 390, height: 844, deviceScaleFactor: 2 }],
  ["desktop", { width: 1280, height: 900, deviceScaleFactor: 1 }],
];
const SCHEMES = ["light", "dark"];
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

mkdirSync(OUT, { recursive: true });
const { server, port } = await serve(0);
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const errors = [];
let failed = false;

async function shoot(page, name, vpName, scheme) {
  const file = join(OUT, `${name}-${vpName}-${scheme}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
}

async function openPage(viewport, scheme, hash = "") {
  const page = await browser.newPage();
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await page.goto(`http://127.0.0.1:${port}/${hash}`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function overflowCheck(page, label) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (wide) {
    console.error(`✖ horizontal overflow: ${label}`);
    failed = true;
  }
}

try {
  for (const [vpName, viewport] of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      const page = await openPage(viewport, scheme);
      await overflowCheck(page, `${vpName}/${scheme}`);
      await shoot(page, "home", vpName, scheme);

      if (vpName === "desktop" && scheme === "light") {
        // Groove view with the playhead mid-bar.
        await page.click("#pattern-picker button:nth-child(3)");
        await page.click('[data-play="straight"]');
        await sleep(2600);
        await shoot(page, "groove-playing", vpName, scheme);
        await page.click("#stop-all");
      }
      await page.close();
    }
  }

  // Quiz: ask, answer, check feedback renders.
  {
    const page = await openPage(VIEWPORTS[1][1], "light");
    await page.click("#quiz-play");
    await sleep(300);
    await page.click('[data-answer="straight"]');
    const feedback = await page.$eval("#quiz-feedback", (el) => el.textContent);
    const total = await page.$eval("#quiz-stats", (el) => el.textContent);
    if (!/That was (as written|swung)/.test(feedback) || !/1\s*\/\s*1|0\s*\/\s*1/.test(total)) {
      console.error(`✖ quiz feedback/stats wrong: "${feedback}" / "${total}"`);
      failed = true;
    } else {
      console.log(`✔ quiz: ${feedback.trim()}`);
    }
    await shoot(page, "quiz-answered", "desktop", "light");
    await page.close();
  }

  // Tap it: a full take with key presses on the written rhythm (m. 47 ×4 at ♩=120).
  for (const scheme of SCHEMES) {
    for (const [vpName, viewport] of VIEWPORTS) {
      if (vpName === "phone" && scheme === "light") continue;
      const page = await openPage(viewport, scheme, "#tap");
      const spb = 0.5;
      const onsets = [];
      for (let rep = 0; rep < 4; rep++) for (const b of [0, 1, 2, 2.75]) onsets.push((4 + rep * 4 + b) * spb);
      await page.focus("#tap-pad");
      await page.keyboard.press("Space");
      // Count-off starts ~0.12 s after the press; schedule keydowns from now.
      await page.evaluate((onsets) => {
        const t0 = performance.now() + 120;
        for (const at of onsets) {
          setTimeout(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true })), t0 - performance.now() + at * 1000);
        }
      }, onsets);
      await page.waitForSelector("#tap-results:not([hidden])", { timeout: 15000 });
      const score = Number(await page.$eval("#result-score", (el) => el.textContent));
      const verdict = await page.$eval("#result-verdict", (el) => el.textContent);
      const ok = score >= 85 && verdict === "Played as written";
      console.log(`${ok ? "✔" : "✖"} tap take (${vpName}/${scheme}): score ${score}, "${verdict}"`);
      if (!ok) failed = true;
      await overflowCheck(page, `tap results ${vpName}/${scheme}`);
      await shoot(page, "tap-results", vpName, scheme);
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (errors.length) {
  console.error("✖ console errors:\n" + errors.join("\n"));
  failed = true;
}
process.exit(failed ? 1 : 0);
