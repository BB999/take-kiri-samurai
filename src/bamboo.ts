import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import { bambooSkinTexture, cutFleshTexture, leafClusterTexture } from "./textures.js";

/**
 * 切断平面（竹ローカル座標）: y = h + kx*x + kz*z
 * h は竹の軸上での切断高さ、(kx,kz) は平面の傾き。
 */
export interface CutPlane {
  h: number;
  kx: number;
  kz: number;
}

export interface BambooOpts {
  radius: number;
  height: number;
  nodeSpacing: number;
  seed: number;
}

export interface PieceSpec {
  group: Group;
  /** 竹ローカルでのピース中心高さ（ワールド配置用） */
  centerY: number;
  /** ピースの軸方向長さ（物理シリンダー用） */
  length: number;
  radius: number;
}

const INNER_RATIO = 0.72; // 肉厚: 外径の28%
const MIN_CUT_Y = 0.18; // これ以下では切れない（切り株保護）
const NODE_BAND = 0.02; // 節の膨らみ幅

const planeYAt = (p: CutPlane, x: number, z: number) => p.h + p.kx * x + p.kz * z;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---- 共有マテリアル ----
let sharedMats: {
  outer: MeshStandardMaterial;
  inner: MeshStandardMaterial;
  flesh: MeshStandardMaterial;
  septum: MeshStandardMaterial;
  leaf: MeshStandardMaterial;
} | null = null;

export function bambooMaterials() {
  if (!sharedMats) {
    const skin = bambooSkinTexture();
    sharedMats = {
      outer: new MeshStandardMaterial({ map: skin, roughness: 0.55, metalness: 0 }),
      inner: new MeshStandardMaterial({
        color: 0xd6cb9e,
        roughness: 0.9,
        metalness: 0,
        side: BackSide,
      }),
      flesh: new MeshStandardMaterial({ map: cutFleshTexture(), roughness: 0.8, metalness: 0 }),
      septum: new MeshStandardMaterial({ color: 0xe5ddb4, roughness: 0.95, metalness: 0 }),
      leaf: new MeshStandardMaterial({
        map: leafClusterTexture(),
        alphaTest: 0.5,
        side: DoubleSide,
        roughness: 0.85,
        metalness: 0,
      }),
    };
  }
  return sharedMats;
}

export class Bamboo {
  readonly group = new Group();
  readonly opts: BambooOpts;
  topY: number;
  topPlane: CutPlane | null = null;
  cooldown = 0;
  regrowing = false;

  private nodeOffset: number;
  private deadT = 0;
  private regrowT = 0;
  private swayPhase: number;
  private impulseDir = { x: 0, z: 0 };
  private impulseT = 1e9;
  private parts: Mesh[] = [];

  constructor(opts: BambooOpts, position: Vector3) {
    this.opts = opts;
    this.topY = opts.height;
    this.nodeOffset = opts.nodeSpacing * (0.55 + 0.3 * Math.sin(opts.seed * 12.9898));
    this.swayPhase = opts.seed * 17.31;
    this.group.position.copy(position);
    this.rebuild();
  }

  get cuttable(): boolean {
    return !this.regrowing && this.cooldown <= 0 && this.topY > MIN_CUT_Y + 0.12;
  }

  /** テーパーと節の膨らみを含む半径 */
  radiusAt(y: number): number {
    const { radius, height, nodeSpacing } = this.opts;
    let r = radius * (1 - 0.42 * smoothstep(height * 0.5, height, y));
    const m = ((((y - this.nodeOffset) % nodeSpacing) + nodeSpacing) % nodeSpacing);
    const d = Math.min(m, nodeSpacing - m);
    if (d < NODE_BAND) {
      r *= 1 + 0.055 * (0.5 + 0.5 * Math.cos((Math.PI * d) / NODE_BAND));
    }
    return r;
  }

  /** y未満で最も高い節の高さ（無ければnull） */
  private nodeBelow(y: number): number | null {
    const { nodeSpacing } = this.opts;
    const i = Math.floor((y - 0.015 - this.nodeOffset) / nodeSpacing);
    if (i < 0) return null;
    return this.nodeOffset + i * nodeSpacing;
  }

  // ---- ジオメトリ生成 ----

  private buildTube(bottom: CutPlane, top: CutPlane, radialMul: number): BufferGeometry {
    const N = 16;
    const span = Math.max(0.02, top.h - bottom.h);
    const M = Math.min(90, Math.max(3, Math.round(span / 0.04)));
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const rB = this.radiusAt(bottom.h) * radialMul;
    const rT = this.radiusAt(top.h) * radialMul;

    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      const cx = Math.cos(th);
      const cz = Math.sin(th);
      const yb = planeYAt(bottom, rB * cx, rB * cz);
      const yt = planeYAt(top, rT * cx, rT * cz);
      for (let j = 0; j <= M; j++) {
        const t = j / M;
        const y = yb + (yt - yb) * t;
        const rad = this.radiusAt(y) * radialMul;
        pos.push(rad * cx, y, rad * cz);
        uv.push((i / N) * 2, (y - this.nodeOffset) / this.opts.nodeSpacing);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j;
        const b = (i + 1) * (M + 1) + j;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** 切断面の輪（肉の断面）。facing=+1で上向き、-1で下向き。 */
  private buildCap(plane: CutPlane, facing: 1 | -1): BufferGeometry {
    const N = 24;
    const rOut = this.radiusAt(plane.h);
    const rIn = rOut * INNER_RATIO;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];

    const n = new Vector3(-plane.kx, 1, -plane.kz).normalize().multiplyScalar(facing);
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      const cx = Math.cos(th);
      const cz = Math.sin(th);
      for (const r of [rOut, rIn]) {
        pos.push(r * cx, planeYAt(plane, r * cx, r * cz), r * cz);
        nor.push(n.x, n.y, n.z);
        uv.push(0.5 + 0.5 * (r / rOut) * cx, 0.5 + 0.5 * (r / rOut) * cz);
      }
    }
    for (let i = 0; i < N; i++) {
      const o = i * 2;
      // (外i, 内i, 外i+1), (内i, 内i+1, 外i+1) — facing=+1で法線+Y側
      if (facing === 1) {
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      } else {
        idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    return g;
  }

  /** 先端の葉のクラスタ（複数の板を1ジオメトリに統合） */
  private buildTip(topH: number): Mesh[] {
    const mats = bambooMaterials();
    const meshes: Mesh[] = [];

    const rTop = this.radiusAt(topH);
    const cone = new ConeGeometry(rTop * 0.95, 0.22, 10);
    cone.translate(0, topH + 0.1, 0);
    const coneMesh = new Mesh(cone, mats.outer);
    coneMesh.castShadow = true;
    meshes.push(coneMesh);

    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const mat4 = new Matrix4();
    let vertBase = 0;
    const rand = (k: number) =>
      0.5 + 0.5 * Math.sin(this.opts.seed * 31.7 + k * 12.9898);

    for (let i = 0; i < 5; i++) {
      const plane = new PlaneGeometry(0.62, 0.4);
      const ang = (i / 5) * Math.PI * 2 + rand(i) * 1.2;
      mat4
        .makeRotationY(ang)
        .multiply(new Matrix4().makeRotationX(-0.5 - rand(i + 9) * 0.5))
        .setPosition(
          Math.cos(ang) * 0.16,
          topH + 0.12 + rand(i + 3) * 0.18,
          Math.sin(ang) * 0.16,
        );
      plane.applyMatrix4(mat4);
      const p = plane.getAttribute("position");
      const nrm = plane.getAttribute("normal");
      const u = plane.getAttribute("uv");
      for (let v = 0; v < p.count; v++) {
        pos.push(p.getX(v), p.getY(v), p.getZ(v));
        nor.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
        uv.push(u.getX(v), u.getY(v));
      }
      const pi = plane.getIndex()!;
      for (let v = 0; v < pi.count; v++) idx.push(pi.getX(v) + vertBase);
      vertBase += p.count;
      plane.dispose();
    }
    const leafGeo = new BufferGeometry();
    leafGeo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    leafGeo.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
    leafGeo.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
    leafGeo.setIndex(idx);
    meshes.push(new Mesh(leafGeo, mats.leaf));
    return meshes;
  }

  /** 立っている部分のメッシュを作り直す */
  private rebuild() {
    for (const m of this.parts) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.parts = [];
    const mats = bambooMaterials();
    const bottom: CutPlane = { h: 0, kx: 0, kz: 0 };
    const top: CutPlane = this.topPlane ?? { h: this.opts.height, kx: 0, kz: 0 };

    const outer = new Mesh(this.buildTube(bottom, top, 1), mats.outer);
    outer.castShadow = true;
    this.parts.push(outer);

    if (this.topPlane) {
      // 切り口: 断面の輪 + 筒の内壁 + 中を覗いたときに見える節板
      this.parts.push(new Mesh(this.buildCap(this.topPlane, 1), mats.flesh));
      const innerBottom = Math.max(0, this.topPlane.h - 0.9);
      this.parts.push(
        new Mesh(
          this.buildTube({ h: innerBottom, kx: 0, kz: 0 }, this.topPlane, INNER_RATIO),
          mats.inner,
        ),
      );
      const nodeY = this.nodeBelow(this.topPlane.h);
      const septumY = nodeY !== null ? nodeY : Math.max(0.01, innerBottom + 0.01);
      const septum = new CircleGeometry(this.radiusAt(septumY) * INNER_RATIO * 0.99, 16);
      septum.rotateX(-Math.PI / 2);
      septum.translate(0, septumY, 0);
      this.parts.push(new Mesh(septum, mats.septum));
    } else {
      this.parts.push(...this.buildTip(this.opts.height));
    }
    for (const m of this.parts) this.group.add(m);
  }

  /**
   * 高さhitYを通る平面（ワールド法線n）で切る。
   * 戻り値は上側ピース（呼び出し側が物理エンティティ化する）。
   */
  cutAt(hitY: number, nWorld: Vector3, swingDir: { x: number; z: number }): PieceSpec | null {
    if (!this.cuttable) return null;
    if (hitY < MIN_CUT_Y || hitY > this.topY - 0.07) return null;

    // 平面の傾きへ変換し、45°までにクランプ
    const n = nWorld.clone();
    if (n.y < 0) n.negate();
    if (n.y < 0.2) n.y = 0.2;
    let kx = -n.x / n.y;
    let kz = -n.z / n.y;
    const kLen = Math.hypot(kx, kz);
    if (kLen > 1) {
      kx /= kLen;
      kz /= kLen;
    }
    const cut: CutPlane = { h: hitY, kx, kz };

    // ---- 上側ピースを構築 ----
    const mats = bambooMaterials();
    const oldTop = this.topPlane;
    const topH = oldTop ? oldTop.h : this.opts.height;
    const tipLen = oldTop ? 0 : 0.3; // 先端の円錐+葉のぶん
    const centerY = (cut.h + topH + tipLen) / 2;
    const length = topH + tipLen - cut.h;

    const piece = new Group();
    const meshes: Mesh[] = [];

    const outer = new Mesh(this.buildTube(cut, oldTop ?? { h: topH, kx: 0, kz: 0 }, 1), mats.outer);
    outer.castShadow = true;
    meshes.push(outer);
    meshes.push(new Mesh(this.buildCap(cut, -1), mats.flesh));
    meshes.push(
      new Mesh(
        this.buildTube(cut, { h: Math.min(cut.h + 0.9, topH), kx: oldTop?.kx ?? 0, kz: oldTop?.kz ?? 0 }, INNER_RATIO),
        mats.inner,
      ),
    );
    if (oldTop) {
      meshes.push(new Mesh(this.buildCap(oldTop, 1), mats.flesh));
    } else {
      meshes.push(...this.buildTip(topH));
    }
    for (const m of meshes) {
      m.geometry.translate(0, -centerY, 0);
      piece.add(m);
    }

    // ---- 自分は残りの下側になる ----
    this.topPlane = cut;
    this.topY = cut.h;
    this.deadT = 0;
    this.cooldown = 0.35;
    this.rebuild();

    // 斬られた反動の揺れ
    const sLen = Math.hypot(swingDir.x, swingDir.z) || 1;
    this.impulseDir = { x: swingDir.x / sLen, z: swingDir.z / sLen };
    this.impulseT = 0;

    return { group: piece, centerY, length, radius: this.radiusAt((cut.h + topH) / 2) };
  }

  update(dt: number, time: number) {
    if (this.cooldown > 0) this.cooldown -= dt;

    // 風によるそよぎ + 斬撃の反動（減衰バネ）
    const amb = 0.0085;
    let rx = amb * Math.sin(time * 0.8 + this.swayPhase);
    let rz = amb * Math.sin(time * 1.13 + this.swayPhase * 1.7);
    if (this.impulseT < 4) {
      this.impulseT += dt;
      const k = 0.065 * Math.exp(-2.6 * this.impulseT) * Math.sin(13 * this.impulseT);
      rx += k * this.impulseDir.z;
      rz += -k * this.impulseDir.x;
    }
    this.group.rotation.x = rx;
    this.group.rotation.z = rz;

    // 切り株になったら少し置いて再生
    if (!this.regrowing && this.topPlane && this.topY <= MIN_CUT_Y + 0.12) {
      this.deadT += dt;
      if (this.deadT > 2.4) {
        this.regrowing = true;
        this.regrowT = 0;
        this.topPlane = null;
        this.topY = this.opts.height;
        this.rebuild();
      }
    }
    if (this.regrowing) {
      this.regrowT += dt;
      const e = smoothstep(0, 1.6, this.regrowT);
      this.group.scale.set(0.45 + 0.55 * e, 0.05 + 0.95 * e, 0.45 + 0.55 * e);
      if (this.regrowT >= 1.6) {
        this.group.scale.set(1, 1, 1);
        this.regrowing = false;
      }
    }
  }
}
