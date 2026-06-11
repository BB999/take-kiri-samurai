// 切断直後にカメラを寄せて、切り口・落下ピースの見た目を検証する
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto("http://127.0.0.1:8082/?demo", { waitUntil: "networkidle" });

// スコアが1になる（=切断発生）まで待つ
await page.waitForFunction(() => window.__sam && window.__sam.score >= 1, null, {
  timeout: 30000,
});

// 落下中のピースを横から
await page.evaluate(() => {
  const cam = window.__sam.camera;
  cam.position.set(0.9, 1.3, -0.6);
  cam.lookAt(0.2, 1.1, -1.5);
});
await page.waitForTimeout(250);
await page.screenshot({ path: "/tmp/vrfps-cut-1-falling.png" });

// 切り株の切り口を上から
await page.evaluate(() => {
  const cam = window.__sam.camera;
  cam.position.set(0.3, 1.65, -1.05);
  cam.lookAt(0, 0.95, -1.5);
});
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/vrfps-cut-2-stump.png" });

// 着地したピースを近くから
await page.evaluate(() => {
  const cam = window.__sam.camera;
  const p = window.__sam.pieces[0];
  if (p) {
    const t = p.group.position;
    cam.position.set(t.x + 0.5, 0.6, t.z + 0.8);
    cam.lookAt(t.x, 0.06, t.z);
  }
});
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/vrfps-cut-3-ground.png" });

console.log(
  JSON.stringify(
    await page.evaluate(() => ({
      score: window.__sam.score,
      pieces: window.__sam.pieces.map((p) => ({
        pos: p.group.position.toArray().map((v) => +v.toFixed(2)),
        clacked: p.clacked,
      })),
    })),
  ),
);
await browser.close();
