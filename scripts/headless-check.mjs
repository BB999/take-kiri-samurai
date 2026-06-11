// ヘッドレスChromiumでページを読み込み、コンソールエラーとスクリーンショットを取る
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:8082/";
const shot = process.argv[3] ?? "/tmp/vrfps-check.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    errors.push(`[${msg.type()}] ${msg.text()}`);
  }
});
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(6000); // World初期化と数フレームの描画を待つ

await page.screenshot({ path: shot });
console.log("--- console errors/warnings ---");
console.log(errors.length ? errors.join("\n") : "(none)");
console.log("--- screenshot:", shot);
await browser.close();
