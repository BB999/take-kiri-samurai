import { createSystem } from "@iwsdk/core";

/**
 * ヘッドレス検証用: XRセッションなしで右手gripSpaceを動かして
 * 正面の竹(0,0,-1.5)を2秒ごとに横薙ぎする。`?demo` 付きURLでのみ登録。
 */
export class DemoSwingSystem extends createSystem() {
  private t = 0;

  update(dt: number) {
    this.t += dt;
    const grip = this.world.playerSpaceEntities.gripSpaces.right.object3D;
    if (!grip) return;
    const ph = this.t % 2.0;
    if (ph < 0.3) {
      const k = ph / 0.3;
      grip.position.set(-0.55 + 1.1 * k, 1.05, -0.7);
      grip.rotation.set(0, 0, 0);
    } else {
      grip.position.set(0.4, 1.0, -0.3);
    }
  }
}
