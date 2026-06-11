// ピースの物理挙動とスコアを内部状態から検証する
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:8082/?demo", { waitUntil: "networkidle" });

const snap = () =>
  page.evaluate(() => {
    const s = window.__sam;
    if (!s) return null;
    return {
      score: s.score,
      pieces: s.pieces.map((p) => ({
        pos: p.group.position.toArray().map((v) => +v.toFixed(2)),
        clacked: p.clacked,
        fading: p.fading,
      })),
      bamboos: s.bamboos.map((b) => ({
        topY: +b.topY.toFixed(2),
        regrowing: b.regrowing,
      })),
    };
  });

for (const wait of [2500, 2000, 2000, 4000, 8000]) {
  await page.waitForTimeout(wait);
  console.log(JSON.stringify(await snap()));
}
console.log("errors:", errors.length ? errors.join("\n") : "(none)");
await browser.close();
