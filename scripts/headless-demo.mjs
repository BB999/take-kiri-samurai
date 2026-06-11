// デモモードで自動スイングさせ、切断の各段階をスクリーンショットで検証する
import { chromium } from "playwright";

const url = "http://127.0.0.1:8082/?demo";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2300); // 初回スイング直後（落下中）
await page.screenshot({ path: "/tmp/vrfps-demo-1-falling.png" });
await page.waitForTimeout(1500); // 着地後
await page.screenshot({ path: "/tmp/vrfps-demo-2-landed.png" });
await page.waitForTimeout(4200); // 複数回切断後
await page.screenshot({ path: "/tmp/vrfps-demo-3-multi.png" });
await page.waitForTimeout(6000); // 再生サイクル確認
await page.screenshot({ path: "/tmp/vrfps-demo-4-regrow.png" });

console.log("--- errors ---");
console.log(errors.length ? errors.join("\n") : "(none)");
await browser.close();
