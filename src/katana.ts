import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from "three";
import { bladeMaps, tsukaTexture } from "./textures.js";

export interface Katana {
  group: Group;
  /** 刃元（鍔寄りの刃の点）— 斬撃判定用マーカー */
  edgeBase: Object3D;
  /** 切先（刃先端の点）— 斬撃判定用マーカー */
  edgeTip: Object3D;
}

const BLADE_LEN = 0.74;
const BLADE_Z0 = -0.075; // 刃区（はばき元）のz
const SORI = 0.028; // 反り。+Y（棟側）へ湾曲。刃は-Y側

/**
 * 打刀を手続き生成する。WebXRのgripSpaceは「手に握った棒が-Z軸に揃う」
 * 仕様なので、柄を+Z側、刀身を-Z側に伸ばすとそのまま自然に握れる。
 */
export function createKatana(): Katana {
  const group = new Group();

  // ---- 刀身: 反り・鎬・切先付きの断面押し出し ----
  const SEGS = 44;
  const positions: number[] = [];
  const uvs: number[] = [];

  // 断面（XY平面, ループ順）: 刃 → 右鎬 → 右棟角 → 左棟角 → 左鎬 → 刃
  const section: [number, number, number][] = [
    [0, -0.0185, 0], // 刃 (v=0)
    [0.0034, -0.002, 0.45], // 右鎬
    [0.0021, 0.0125, 1], // 右棟
    [-0.0021, 0.0125, 1], // 左棟
    [-0.0034, -0.002, 0.45], // 左鎬
  ];

  const ringPoint = (s: number, i: number): [number, number, number] => {
    const widthScale = (1 - 0.14 * s) * (s > 0.955 ? Math.max(0.001, 1 - (s - 0.955) / 0.045) : 1);
    const thickScale = (1 - 0.38 * s) * (s > 0.955 ? Math.max(0.001, 1 - (s - 0.955) / 0.045) : 1);
    const bend = SORI * s * s;
    const p = section[i % section.length];
    return [p[0] * thickScale, p[1] * widthScale + bend, BLADE_Z0 - s * BLADE_LEN];
  };

  for (let j = 0; j < SEGS; j++) {
    const s0 = j / SEGS;
    const s1 = (j + 1) / SEGS;
    for (let i = 0; i < section.length; i++) {
      const a = ringPoint(s0, i);
      const b = ringPoint(s0, i + 1);
      const c = ringPoint(s1, i + 1);
      const d = ringPoint(s1, i);
      const va = section[i % section.length][2];
      const vb = section[(i + 1) % section.length][2];
      positions.push(...a, ...b, ...c, ...a, ...c, ...d);
      uvs.push(s0, va, s0, vb, s1, vb, s0, va, s1, vb, s1, va);
    }
  }

  const bladeGeo = new BufferGeometry();
  bladeGeo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  bladeGeo.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  bladeGeo.computeVertexNormals();

  const { map, roughnessMap } = bladeMaps();
  const bladeMat = new MeshStandardMaterial({
    map,
    roughnessMap,
    metalness: 1.0,
    roughness: 1.0, // 実際の値はroughnessMapに焼いてある
    envMapIntensity: 1.5,
  });
  const blade = new Mesh(bladeGeo, bladeMat);
  blade.castShadow = true;
  group.add(blade);

  // ---- はばき（真鍮の襟金具） ----
  const brass = new MeshStandardMaterial({ color: 0xb08d3e, metalness: 0.9, roughness: 0.35 });
  const habakiGeo = new CylinderGeometry(0.0085, 0.0095, 0.03, 10);
  habakiGeo.rotateX(Math.PI / 2);
  habakiGeo.scale(0.62, 1.6, 1);
  const habaki = new Mesh(habakiGeo, brass);
  habaki.position.z = -0.072;
  group.add(habaki);

  // ---- 切羽 ----
  const seppaGeo = new CylinderGeometry(0.0145, 0.0145, 0.0018, 16);
  seppaGeo.rotateX(Math.PI / 2);
  const seppa = new Mesh(seppaGeo, brass);
  seppa.position.z = -0.0585;
  group.add(seppa);

  // ---- 鍔（鉄地） ----
  const iron = new MeshStandardMaterial({ color: 0x2c2823, metalness: 0.75, roughness: 0.5 });
  const tsubaGeo = new CylinderGeometry(0.039, 0.039, 0.0045, 28);
  tsubaGeo.rotateX(Math.PI / 2);
  tsubaGeo.scale(1, 1.12, 1); // わずかに縦長（木瓜形の雰囲気）
  const tsuba = new Mesh(tsubaGeo, iron);
  tsuba.position.z = -0.055;
  tsuba.castShadow = true;
  group.add(tsuba);

  // ---- 柄（鮫皮＋濃紺の柄巻き） ----
  const tsukaGeo = new CylinderGeometry(0.0125, 0.0142, 0.25, 14);
  tsukaGeo.rotateX(Math.PI / 2);
  tsukaGeo.scale(0.78, 1.22, 1); // 楕円断面
  const tsukaTex = tsukaTexture();
  tsukaTex.repeat.set(2, 2);
  const tsukaMat = new MeshStandardMaterial({ map: tsukaTex, roughness: 0.85, metalness: 0 });
  const tsuka = new Mesh(tsukaGeo, tsukaMat);
  tsuka.position.z = 0.075;
  tsuka.castShadow = true;
  group.add(tsuka);

  // ---- 縁・頭 ----
  const fuchiGeo = new CylinderGeometry(0.0148, 0.0148, 0.008, 14);
  fuchiGeo.rotateX(Math.PI / 2);
  fuchiGeo.scale(0.82, 1.22, 1);
  const fuchi = new Mesh(fuchiGeo, iron);
  fuchi.position.z = -0.048;
  group.add(fuchi);

  const kashiraGeo = new SphereGeometry(0.0145, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  kashiraGeo.rotateX(Math.PI / 2);
  kashiraGeo.scale(0.82, 1.22, 1);
  const kashira = new Mesh(kashiraGeo, iron);
  kashira.position.z = 0.2;
  group.add(kashira);

  // ---- 斬撃判定マーカー（刃のライン上の2点） ----
  const edgeBase = new Object3D();
  edgeBase.position.set(0, -0.018, -0.12);
  group.add(edgeBase);

  const edgeTip = new Object3D();
  // 切先位置: 幅テーパーと反りを反映した刃のy
  edgeTip.position.set(0, -0.0185 * 0.86 + SORI, BLADE_Z0 - BLADE_LEN);
  group.add(edgeTip);

  return { group, edgeBase, edgeTip };
}
