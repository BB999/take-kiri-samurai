# 竹斬り侍 — WebXR VR竹切りゲーム

江戸時代の侍になって、目の前の竹を刀で斬るVRゲーム。
Meta Quest Browser + IWSDK (Immersive Web SDK) 製。アセットはすべて手続き生成（外部3Dモデル・画像・音声ファイルなし）。

## 遊び方

- **右手コントローラー = 刀**（WebXRのgripSpace仕様どおり、握った向きに刀身が伸びる）
- 一定以上の速さで振ると竹が斬れる。刃の向きと振りの方向から切断面の角度が決まる（袈裟斬り対応、傾き45°まで）
- 斬った竹の上側はHavok物理で吹き飛び、地面に落ちて転がる
- 残った竹は反動でしなって揺れ、切り口（楕円の断面・肉厚・空洞・節板）が見える
- 切り株まで斬ると数秒後に新しい竹が生えてくる
- スコアは右手前の木の看板に表示
- 左スティックで移動、テレポートも可

## 起動

```bash
npm install
npm run dev
```

初回はmkcertがローカルHTTPS証明書をインストールするためにsudoパスワードを求める（WebXRはHTTPS必須）。
起動後、Quest Browserで `https://<MacのIP>:8081` を開いて「Enter VR」。

### デスクトップでの動作確認（VR機材なし）

```bash
npx vite --config vite.config.check.ts
# http://127.0.0.1:8082/?demo を開くと刀が自動でスイングして竹を斬る
```

`scripts/headless-*.mjs` はPlaywrightによる自動検証スクリプト。

## 構成

| ファイル | 役割 |
|---|---|
| `src/index.ts` | World構築・竹林環境（空・霧・地面・背景竹林・石灯籠・四つ目垣） |
| `src/katana.ts` | 打刀の手続き生成（反り・鎬・切先・刃文・柄巻き） |
| `src/bamboo.ts` | 竹の動的ジオメトリと任意傾き平面でのスライス（断面キャップ・内壁・節板・再生） |
| `src/game.ts` | 斬撃判定（刃のスイープ軌跡×竹軸、サブステップ分割）・物理ピース・揺れ・パーティクル・剣筋・スコア |
| `src/audio.ts` | WebAudioによる効果音合成（風切り・斬撃・落下） |
| `src/textures.ts` | Canvasによる手続きテクスチャ生成 |

## 技術メモ

- IWSDK `@iwsdk/core` 0.4.2 / Havok物理（`PhysicsBody` / `PhysicsShape` / `PhysicsManipulation`）
- XRセッション開始時に `updateTargetFrameRate(90)` を要求
- 描画コール数はQuest 2でも収まる規模（インスタンシング・ジオメトリ統合済み）
