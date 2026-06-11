import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext("2d")! };
}

// 簡易シード付き乱数（毎回同じ見た目になるように）
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** 竹の表皮。v=0/1 が節（ふし）のラインに対応する。 */
export function bambooSkinTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const rand = rng(7);

  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, "#5d8a38");
  grad.addColorStop(0.5, "#6c9c44");
  grad.addColorStop(1, "#5d8a38");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // 縦の繊維すじ
  for (let i = 0; i < 120; i++) {
    const x = rand() * 256;
    const l = 0.25 + rand() * 0.5;
    ctx.strokeStyle =
      rand() > 0.5
        ? `rgba(255,255,220,${0.04 + rand() * 0.05})`
        : `rgba(30,50,15,${0.05 + rand() * 0.06})`;
    ctx.lineWidth = 0.5 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, rand() * 256 * (1 - l));
    ctx.lineTo(x + (rand() - 0.5) * 4, 256 * l + rand() * 100);
    ctx.stroke();
  }

  // まだら模様
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${90 + rand() * 40}, ${120 + rand() * 30}, ${50 + rand() * 20}, 0.07)`;
    ctx.beginPath();
    ctx.ellipse(
      rand() * 256,
      rand() * 256,
      4 + rand() * 14,
      10 + rand() * 30,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // 節のバンド（上端・下端 = v=0/1 でラップして1本の節になる）
  const band = (y0: number, y1: number) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "rgba(228,228,190,0.85)");
    g.addColorStop(1, "rgba(228,228,190,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, 256, y1 - y0);
  };
  band(0, 9);
  ctx.save();
  ctx.translate(0, 256);
  ctx.scale(1, -1);
  band(0, 9);
  ctx.restore();
  ctx.fillStyle = "rgba(70,60,30,0.9)";
  ctx.fillRect(0, 0, 256, 2);
  ctx.fillRect(0, 254, 256, 2);

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** 切断面（断面の肉）。半径方向にUVマッピングして使う。 */
export function cutFleshTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const rand = rng(13);
  ctx.fillStyle = "#ece7c4";
  ctx.fillRect(0, 0, 256, 256);

  // 同心の成長リング
  for (let r = 10; r < 130; r += 5 + rand() * 6) {
    ctx.strokeStyle = `rgba(160,150,90,${0.1 + rand() * 0.12})`;
    ctx.lineWidth = 1 + rand();
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 維管束の点々
  for (let i = 0; i < 500; i++) {
    const a = rand() * Math.PI * 2;
    const r = 20 + rand() * 108;
    ctx.fillStyle = `rgba(120,110,60,${0.15 + rand() * 0.25})`;
    ctx.beginPath();
    ctx.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 0.8 + rand() * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // 外周は表皮の緑がうっすら
  const rim = ctx.createRadialGradient(128, 128, 110, 128, 128, 128);
  rim.addColorStop(0, "rgba(90,140,60,0)");
  rim.addColorStop(1, "rgba(80,130,50,0.85)");
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** 柄巻き（鮫皮＋組紐の菱模様） */
export function tsukaTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 256);
  const rand = rng(29);
  // 鮫皮（白い粒）
  ctx.fillStyle = "#cfc9bb";
  ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(255,255,250,${0.3 + rand() * 0.5})`;
    ctx.beginPath();
    ctx.arc(rand() * 128, rand() * 256, 1 + rand() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // 濃紺の組紐を斜めに交差させて菱形の窓を作る
  ctx.fillStyle = "#181826";
  const w = 30;
  for (let k = -3; k < 8; k++) {
    ctx.save();
    ctx.translate(0, k * 64);
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(138, 74);
    ctx.lineTo(138, 74 + w);
    ctx.lineTo(-10, w);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(138, 0);
    ctx.lineTo(-10, 74);
    ctx.lineTo(-10, 74 + w);
    ctx.lineTo(138, w);
    ctx.fill();
    ctx.restore();
  }
  // 紐のハイライト
  ctx.strokeStyle = "rgba(90,90,130,0.5)";
  ctx.lineWidth = 2;
  for (let k = -3; k < 8; k++) {
    ctx.beginPath();
    ctx.moveTo(-10, k * 64 + 8);
    ctx.lineTo(138, k * 64 + 82);
    ctx.stroke();
  }

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** 刀身のカラーマップとラフネスマップ（刃文入り）。u=長手方向, v=0が刃側。 */
export function bladeMaps(): { map: CanvasTexture; roughnessMap: CanvasTexture } {
  const W = 512;
  const H = 64;
  const hamon = (x: number) =>
    H * 0.3 + Math.sin(x * 0.06) * 5 + Math.sin(x * 0.023 + 1.7) * 4;

  const m = makeCanvas(W, H);
  {
    const ctx = m.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#eef1f4"); // 刃（白っぽい）
    g.addColorStop(0.45, "#c8cdd4"); // 地鉄
    g.addColorStop(1, "#b6bcc4"); // 棟側
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 刃文（乱刃）
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const y = hamon(x);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 刃文の霞
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    for (let x = 0; x <= W; x += 4) {
      ctx.fillRect(x, hamon(x) - 6, 4, 6);
    }
  }

  const r = makeCanvas(W, H);
  {
    const ctx = r.ctx;
    // ラフネス: 地鉄はよく磨かれて低め、刃区はやや曇る
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgb(90,90,90)"); // 刃側 ≈ 0.35
    g.addColorStop(0.5, "rgb(38,38,38)"); // 地鉄 ≈ 0.15
    g.addColorStop(1, "rgb(50,50,50)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgb(110,110,110)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const y = hamon(x);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const map = new CanvasTexture(m.canvas);
  map.colorSpace = SRGBColorSpace;
  const roughnessMap = new CanvasTexture(r.canvas);
  return { map, roughnessMap };
}

/** 地面（苔むした土） */
export function groundTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const rand = rng(41);
  ctx.fillStyle = "#4d5835";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 380; i++) {
    const palette = ["#3e482b", "#5a6840", "#46532f", "#62704a", "#54503a"];
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
    ctx.globalAlpha = 0.25 + rand() * 0.4;
    ctx.beginPath();
    ctx.ellipse(
      rand() * 256,
      rand() * 256,
      3 + rand() * 12,
      3 + rand() * 12,
      rand() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** 笹の葉のクラスタ（アルファ付き） */
export function leafClusterTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 128);
  const rand = rng(53);
  ctx.clearRect(0, 0, 128, 128);
  const leaf = (x: number, y: number, len: number, ang: number, c: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -len * 0.13, len, 0);
    ctx.quadraticCurveTo(len * 0.45, len * 0.13, 0, 0);
    ctx.fill();
    ctx.restore();
  };
  const greens = ["#4e7c2e", "#5d8f3a", "#446f28", "#69a047"];
  for (let i = 0; i < 9; i++) {
    leaf(
      20 + rand() * 40,
      30 + rand() * 70,
      45 + rand() * 45,
      -0.9 + rand() * 1.4,
      greens[Math.floor(rand() * greens.length)],
    );
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
