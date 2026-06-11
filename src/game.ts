import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  createSystem,
  PhysicsBody,
  PhysicsManipulation,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  type Entity,
} from "@iwsdk/core";
import { Sfx } from "./audio.js";
import { Bamboo } from "./bamboo.js";
import { createKatana, type Katana } from "./katana.js";

const TIP_SPEED_MIN = 2.1; // 切先速度の下限 [m/s]
const CONTACT_SPEED_MIN = 1.3; // 接触点の横方向速度の下限 [m/s]
const PIECE_LIFETIME = 8; // 落ちた竹が消えるまで [s]
const MAX_PIECES = 8;

// ---- 線分同士の最近接点（Ericson, Real-Time Collision Detection） ----
const _d1 = new Vector3();
const _d2 = new Vector3();
const _r = new Vector3();
function closestSegSeg(
  p1: Vector3,
  q1: Vector3,
  p2: Vector3,
  q2: Vector3,
  c1: Vector3,
  c2: Vector3,
): { s: number; t: number; dist: number } {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);
  const a = _d1.dot(_d1);
  const e = _d2.dot(_d2);
  const f = _d2.dot(_r);
  let s: number;
  let t: number;
  if (a <= 1e-9 && e <= 1e-9) {
    s = t = 0;
  } else if (a <= 1e-9) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = _d1.dot(_r);
    if (e <= 1e-9) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = _d1.dot(_d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  c1.copy(p1).addScaledVector(_d1, s);
  c2.copy(p2).addScaledVector(_d2, t);
  return { s, t, dist: c1.distanceTo(c2) };
}

// ---- 切りくずパーティクル ----
class Chips {
  readonly mesh: InstancedMesh;
  private pos: Vector3[] = [];
  private vel: Vector3[] = [];
  private life: Float32Array;
  private readonly max = 64;
  private cursor = 0;
  private mat4 = new Matrix4();
  private q = new Quaternion();
  private scl = new Vector3();

  constructor() {
    const geo = new PlaneGeometry(0.028, 0.07);
    const mat = new MeshBasicMaterial({
      color: 0xffffff,
      side: DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.mesh = new InstancedMesh(geo, mat, this.max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.life = new Float32Array(this.max);
    const palette = [0xcfe6a8, 0x7fa05a, 0xeae6c4, 0x9ec06f];
    const c = new Color();
    for (let i = 0; i < this.max; i++) {
      this.pos.push(new Vector3());
      this.vel.push(new Vector3());
      this.mesh.setColorAt(i, c.setHex(palette[i % palette.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  burst(p: Vector3, v: Vector3) {
    for (let n = 0; n < 13; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[i].copy(p);
      this.vel[i].set(
        v.x * 0.3 + (Math.random() - 0.5) * 1.6,
        0.6 + Math.random() * 1.4,
        v.z * 0.3 + (Math.random() - 0.5) * 1.6,
      );
      this.life[i] = 0.55 + Math.random() * 0.25;
    }
  }

  update(dt: number, camQuat: Quaternion) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.scl.setScalar(0);
        this.mat4.compose(this.pos[i], this.q, this.scl);
        this.mesh.setMatrixAt(i, this.mat4);
        continue;
      }
      this.life[i] -= dt;
      this.vel[i].y -= 4.5 * dt;
      this.pos[i].addScaledVector(this.vel[i], dt);
      const s = Math.max(0, Math.min(1, this.life[i] / 0.5));
      this.q.copy(camQuat);
      this.scl.setScalar(0.4 + s);
      this.mat4.compose(this.pos[i], this.q, this.scl);
      this.mesh.setMatrixAt(i, this.mat4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---- 剣筋トレイル ----
class Trail {
  readonly mesh: Mesh;
  private history: { b: Vector3; t: Vector3; age: number }[] = [];
  private readonly maxAge = 0.14;
  private readonly maxLen = 16;
  private positions: Float32Array;
  private colors: Float32Array;

  constructor() {
    const maxVerts = (this.maxLen - 1) * 6;
    this.positions = new Float32Array(maxVerts * 3);
    this.colors = new Float32Array(maxVerts * 3);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new BufferAttribute(this.colors, 3));
    const mat = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  push(b: Vector3, t: Vector3, speed: number) {
    if (speed > 2.0) {
      this.history.push({ b: b.clone(), t: t.clone(), age: 0 });
      if (this.history.length > this.maxLen) this.history.shift();
    }
  }

  update(dt: number, speed: number) {
    for (const h of this.history) h.age += dt;
    this.history = this.history.filter((h) => h.age < this.maxAge);
    const n = this.history.length;
    const geo = this.mesh.geometry;
    let v = 0;
    const k = Math.min(1, Math.max(0, (speed - 2) / 6));
    for (let i = 0; i + 1 < n; i++) {
      const a = this.history[i];
      const b = this.history[i + 1];
      const quad = [a.b, a.t, b.t, a.b, b.t, b.b];
      for (const p of quad) {
        this.positions[v * 3] = p.x;
        this.positions[v * 3 + 1] = p.y;
        this.positions[v * 3 + 2] = p.z;
        const fade = (1 - a.age / this.maxAge) * k * 0.6;
        this.colors[v * 3] = 0.65 * fade;
        this.colors[v * 3 + 1] = 0.78 * fade;
        this.colors[v * 3 + 2] = 1.0 * fade;
        v++;
      }
    }
    geo.setDrawRange(0, v);
    geo.getAttribute("position").needsUpdate = true;
    geo.getAttribute("color").needsUpdate = true;
  }
}

// ---- スコア看板 ----
class ScoreBoard {
  readonly group = new Group();
  private ctx: CanvasRenderingContext2D;
  private texture: CanvasTexture;

  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    this.ctx = canvas.getContext("2d")!;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;

    const wood = new MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 });
    const plank = new Mesh(new BoxGeometry(0.72, 0.36, 0.03), wood);
    plank.position.y = 1.15;
    plank.castShadow = true;
    const face = new Mesh(
      new PlaneGeometry(0.68, 0.32),
      new MeshStandardMaterial({ map: this.texture, roughness: 0.85 }),
    );
    face.position.set(0, 1.15, 0.017);
    const postGeo = new CylinderGeometry(0.022, 0.025, 1.05, 8);
    const postL = new Mesh(postGeo, wood);
    postL.position.set(-0.28, 0.52, 0);
    const postR = new Mesh(postGeo, wood);
    postR.position.set(0.28, 0.52, 0);
    this.group.add(plank, face, postL, postR);
    this.draw(0);
  }

  draw(count: number) {
    const c = this.ctx;
    c.fillStyle = "#52351c";
    c.fillRect(0, 0, 512, 256);
    c.strokeStyle = "rgba(0,0,0,0.25)";
    for (let y = 12; y < 256; y += 26) {
      c.lineWidth = 1 + (y % 3);
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(140, y + 6, 360, y - 6, 512, y + 3);
      c.stroke();
    }
    c.strokeStyle = "#c9a063";
    c.lineWidth = 8;
    c.strokeRect(8, 8, 496, 240);
    c.fillStyle = "#f3e9d2";
    c.textAlign = "center";
    c.font = "bold 52px sans-serif";
    c.fillText("斬った竹", 256, 78);
    c.font = "bold 110px sans-serif";
    c.fillText(`${count} 本`, 256, 205);
    this.texture.needsUpdate = true;
  }
}

interface FlyingPiece {
  entity: Entity;
  group: Group;
  born: number;
  prevY: number;
  prevVy: number;
  clacked: boolean;
  fading: boolean;
  fadeT: number;
}

export class SamuraiSystem extends createSystem() {
  private katana!: Katana;
  private bamboos: Bamboo[] = [];
  private pieces: FlyingPiece[] = [];
  private sfx = new Sfx();
  private chips!: Chips;
  private trail!: Trail;
  private board!: ScoreBoard;
  private score = 0;
  private t = 0;
  private whooshCd = 0;
  private lastSession: XRSession | null | undefined = undefined;
  private prevBase: Vector3 | null = null;
  private prevTip = new Vector3();
  private subB = new Vector3();
  private subT = new Vector3();
  private vB = new Vector3();
  private vT = new Vector3();
  private c1 = new Vector3();
  private c2 = new Vector3();
  private axisA = new Vector3();
  private axisB = new Vector3();
  private tmpV = new Vector3();
  private tmpN = new Vector3();
  private camQ = new Quaternion();

  init() {
    // 刀を右手のgripSpaceへ（WebXR仕様: 握った棒は-Z軸に揃う）
    this.katana = createKatana();
    this.world.createTransformEntity(this.katana.group, {
      parent: this.world.playerSpaceEntities.gripSpaces.right,
    });

    // 斬れる竹を正面の弧状に配置
    const spots: [number, number][] = [
      [-1.15, -0.95],
      [-0.6, -1.35],
      [0.0, -1.5],
      [0.6, -1.35],
      [1.15, -0.95],
      [-1.6, -0.35],
    ];
    spots.forEach(([x, z], i) => {
      const bamboo = new Bamboo(
        {
          radius: 0.042 + (i % 3) * 0.007,
          height: 2.3 + ((i * 0.37) % 0.7),
          nodeSpacing: 0.34 + (i % 4) * 0.025,
          seed: i + 1,
        },
        new Vector3(x, 0, z),
      );
      this.scene.add(bamboo.group);
      this.bamboos.push(bamboo);
    });

    this.chips = new Chips();
    this.scene.add(this.chips.mesh);
    this.trail = new Trail();
    this.scene.add(this.trail.mesh);
    this.board = new ScoreBoard();
    this.board.group.position.set(1.9, 0, -0.9);
    this.board.group.rotation.y = -Math.PI / 3;
    this.scene.add(this.board.group);

    if (location.search.includes("demo")) {
      (window as unknown as { __sam: SamuraiSystem }).__sam = this;
    }
  }

  update(dt: number) {
    if (dt <= 0) return;
    this.t += dt;
    if (this.whooshCd > 0) this.whooshCd -= dt;

    // XRセッション開始時の初期化（90Hz要求 + AudioContext解禁）
    const session = this.world.session ?? null;
    if (session !== this.lastSession) {
      this.lastSession = session;
      if (session) {
        this.sfx.ensure();
        try {
          const s = session as XRSession & {
            supportedFrameRates?: Float32Array;
            updateTargetFrameRate?: (rate: number) => Promise<void>;
          };
          const rates = s.supportedFrameRates;
          if (rates && s.updateTargetFrameRate) {
            let best = 0;
            for (const r of rates) if (r <= 91 && r > best) best = r;
            if (best > 0) s.updateTargetFrameRate(best).catch(() => {});
          }
        } catch {
          /* 任意機能なので失敗は無視 */
        }
      }
    }

    // ---- 刃のスイープを追跡 ----
    this.katana.edgeBase.getWorldPosition(this.vB);
    this.katana.edgeTip.getWorldPosition(this.vT);

    let tipSpeed = 0;
    if (this.prevBase && dt < 0.1) {
      tipSpeed = this.vT.distanceTo(this.prevTip) / dt;

      if (tipSpeed > 3.4 && this.whooshCd <= 0) {
        this.whooshCd = 0.3;
        this.sfx.whoosh(Math.min(1, tipSpeed / 9));
      }

      if (tipSpeed > TIP_SPEED_MIN) {
        // 高速スイングのすり抜け防止: 前フレームからの軌跡を分割して判定
        const travel = this.vT.distanceTo(this.prevTip);
        const steps = Math.min(6, Math.max(1, Math.ceil(travel / 0.05)));
        for (let j = 1; j <= steps; j++) {
          const f = j / steps;
          this.subB.lerpVectors(this.prevBase, this.vB, f);
          this.subT.lerpVectors(this.prevTip, this.vT, f);
          if (this.tryCut(dt, this.subB, this.subT)) break;
        }
      }
    } else if (!this.prevBase) {
      this.prevBase = new Vector3();
    }
    this.trail.push(this.vB, this.vT, tipSpeed);
    this.trail.update(dt, tipSpeed);
    this.prevBase.copy(this.vB);
    this.prevTip.copy(this.vT);

    // ---- 竹の揺れ・再生 ----
    for (const b of this.bamboos) b.update(dt, this.t);

    // ---- 落下ピースの寿命管理 ----
    this.camera.getWorldQuaternion(this.camQ);
    this.chips.update(dt, this.camQ);
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      const age = this.t - p.born;
      const y = p.group.position.y;
      const vy = (y - p.prevY) / dt;
      // 着地: 落下中の急減速で検出（フレームレートに依存しにくい）
      if (!p.clacked && p.prevVy < -1.2 && vy - p.prevVy > 1.0 && y < 0.8) {
        p.clacked = true;
        this.sfx.clack();
      }
      p.prevY = y;
      p.prevVy = vy;

      if (!p.fading && (age > PIECE_LIFETIME || this.pieces.length > MAX_PIECES)) {
        p.fading = true;
      }
      if (p.fading) {
        p.fadeT += dt;
        const s = Math.max(0.001, 1 - p.fadeT / 0.4);
        p.group.scale.setScalar(s);
        if (p.fadeT >= 0.4) {
          this.disposePiece(p);
          this.pieces.splice(i, 1);
        }
      }
    }
  }

  private tryCut(dt: number, eB: Vector3, eT: Vector3): boolean {
    for (const bamboo of this.bamboos) {
      if (!bamboo.cuttable) continue;
      const root = bamboo.group.position;
      this.axisA.set(root.x, 0.16, root.z);
      this.axisB.set(root.x, bamboo.topY - 0.06, root.z);

      const hit = closestSegSeg(eB, eT, this.axisA, this.axisB, this.c1, this.c2);
      const r = bamboo.radiusAt(this.c2.y);
      if (hit.dist > r * 1.2) continue;

      // 接触点での刃の速度
      const u = hit.s;
      this.tmpV
        .set(
          (this.vB.x - this.prevBase!.x) * (1 - u) + (this.vT.x - this.prevTip.x) * u,
          (this.vB.y - this.prevBase!.y) * (1 - u) + (this.vT.y - this.prevTip.y) * u,
          (this.vB.z - this.prevBase!.z) * (1 - u) + (this.vT.z - this.prevTip.z) * u,
        )
        .divideScalar(dt);
      if (Math.hypot(this.tmpV.x, this.tmpV.z) < CONTACT_SPEED_MIN) continue;

      // 切断平面の法線 = 刃の向き × 振りの方向
      this.tmpN.subVectors(eT, eB).normalize();
      this.tmpN.cross(this.c1.copy(this.tmpV).normalize());
      if (this.tmpN.lengthSq() < 0.09) continue; // 刃と振りがほぼ平行
      this.tmpN.normalize();

      const spec = bamboo.cutAt(this.c2.y, this.tmpN, { x: this.tmpV.x, z: this.tmpV.z });
      if (!spec) continue;

      // ---- 上側を物理ピースとして飛ばす ----
      const entity = this.world.createTransformEntity(spec.group);
      spec.group.position.set(root.x, spec.centerY, root.z);
      entity
        .addComponent(PhysicsBody, {
          state: PhysicsState.Dynamic,
          linearDamping: 0.05,
          angularDamping: 0.3,
        })
        .addComponent(PhysicsShape, {
          shape: PhysicsShapeType.Cylinder,
          dimensions: [spec.radius, spec.length, 0],
          density: 0.8,
          restitution: 0.25,
          friction: 0.75,
        })
        .addComponent(PhysicsManipulation, {
          linearVelocity: [this.tmpV.x * 0.38, Math.max(0.25, this.tmpV.y * 0.3) + 0.2, this.tmpV.z * 0.38],
          angularVelocity: [
            Math.max(-6, Math.min(6, this.tmpV.z * 0.9)),
            0,
            Math.max(-6, Math.min(6, -this.tmpV.x * 0.9)),
          ],
        });

      this.pieces.push({
        entity,
        group: spec.group,
        born: this.t,
        prevY: spec.centerY,
        prevVy: 0,
        clacked: false,
        fading: false,
        fadeT: 0,
      });

      // ---- 演出 ----
      this.score++;
      this.board.draw(this.score);
      this.sfx.slice();
      this.pulse(0.9, 70);
      this.tmpV.y = 0;
      this.chips.burst(this.c2.set(root.x, this.c2.y, root.z), this.tmpV);
      return true; // 1フレームに1本まで
    }
    return false;
  }

  private pulse(strength: number, ms: number) {
    const session = this.world.session;
    if (!session) return;
    for (const src of session.inputSources) {
      if (src.handedness === "right") {
        const pads = (src.gamepad as Gamepad & { hapticActuators?: { pulse?: (s: number, m: number) => void }[] })
          ?.hapticActuators;
        pads?.[0]?.pulse?.(strength, ms);
      }
    }
  }

  private disposePiece(p: FlyingPiece) {
    p.group.traverse((o: Object3D) => {
      if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
    });
    p.entity.destroy();
  }
}
