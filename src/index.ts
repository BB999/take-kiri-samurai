import {
  BackSide,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  FogExp2,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PMREMGenerator,
  PlaneGeometry,
  Quaternion,
  SessionMode,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  World,
  EnvironmentType,
  LocomotionEnvironment,
  PhysicsBody,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
} from "@iwsdk/core";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { bambooMaterials } from "./bamboo.js";
import { SamuraiSystem } from "./game.js";
import { bambooSkinTexture, groundTexture, leafClusterTexture } from "./textures.js";

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
    features: { handTracking: true, layers: true },
  },
  features: {
    locomotion: { useWorker: true },
    physics: true,
    grabbing: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
  },
}).then(async (world) => {
  const { scene, camera, renderer } = world;

  // デスクトッププレビュー用の初期カメラ
  camera.position.set(0, 1.6, 0.5);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  // 刀身の金属反射用の環境マップ
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // ---- 空と霧（朝靄の竹林） ----
  scene.fog = new FogExp2(0xc3d4ae, 0.05);
  const sky = new Mesh(
    new SphereGeometry(45, 24, 12),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new Color(0xa8cce4) },
        bottom: { value: new Color(0xe4ecd2) },
      },
      vertexShader: /* glsl */ `
        varying float vY;
        void main() {
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 bottom;
        varying float vY;
        void main() {
          gl_FragColor = vec4(mix(bottom, top, smoothstep(0.0, 0.45, vY)), 1.0);
        }
      `,
    }),
  );
  scene.add(sky);

  // ---- ライティング ----
  scene.add(new HemisphereLight(0xdcead0, 0x44523a, 0.75));
  const sun = new DirectionalLight(0xfff3da, 1.35);
  sun.position.set(5, 9, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -4;
  sun.shadow.camera.right = 4;
  sun.shadow.camera.top = 4;
  sun.shadow.camera.bottom = -4;
  sun.shadow.camera.far = 25;
  scene.add(sun);

  // ---- 地面（見た目 + 移動用 + 物理床） ----
  const groundTex = groundTexture();
  groundTex.repeat.set(20, 20);
  const ground = new Mesh(
    new CircleGeometry(32, 40),
    new MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world
    .createTransformEntity(ground)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  const floorCollider = new Mesh(new BoxGeometry(60, 0.2, 60));
  floorCollider.visible = false;
  floorCollider.position.y = -0.1;
  world
    .createTransformEntity(floorCollider)
    .addComponent(PhysicsBody, { state: PhysicsState.Static })
    .addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto, friction: 0.8 });

  // ---- 背景の竹林（インスタンシング） ----
  const COUNT = 80;
  const culmGeo = new CylinderGeometry(1, 1.12, 1, 7, 1, true);
  culmGeo.translate(0, 0.5, 0);
  const groveTex = bambooSkinTexture();
  groveTex.repeat.set(2, 12);
  const groveMat = new MeshStandardMaterial({ map: groveTex, roughness: 0.6 });
  const grove = new InstancedMesh(culmGeo, groveMat, COUNT);

  const leafGeo = new PlaneGeometry(2.4, 1.5);
  const leafMat = new MeshStandardMaterial({
    map: leafClusterTexture(),
    alphaTest: 0.5,
    side: DoubleSide,
    roughness: 0.9,
  });
  const groveLeaves = new InstancedMesh(leafGeo, leafMat, COUNT * 2);

  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  const tint = new Color();
  let rndState = 12345;
  const rnd = () => {
    rndState = (rndState * 1664525 + 1013904223) >>> 0;
    return rndState / 0xffffffff;
  };
  for (let i = 0; i < COUNT; i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = 4.5 + rnd() * 12;
    const h = 3.5 + rnd() * 3.2;
    const r = 0.05 + rnd() * 0.05;
    p.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
    q.setFromAxisAngle(
      new Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize(),
      rnd() * 0.06,
    );
    s.set(r, h, r);
    m.compose(p, q, s);
    grove.setMatrixAt(i, m);
    grove.setColorAt(i, tint.setHSL(0.26 + rnd() * 0.04, 0.4 + rnd() * 0.2, 0.42 + rnd() * 0.12));

    for (let k = 0; k < 2; k++) {
      const ly = h * (0.72 + rnd() * 0.25);
      q.setFromAxisAngle(new Vector3(0, 1, 0), rnd() * Math.PI * 2);
      s.setScalar(0.8 + rnd() * 0.7);
      m.compose(p.clone().setY(ly), q, s);
      groveLeaves.setMatrixAt(i * 2 + k, m);
      groveLeaves.setColorAt(i * 2 + k, tint.setHSL(0.27, 0.45, 0.4 + rnd() * 0.15));
    }
  }
  scene.add(grove, groveLeaves);

  // ---- 庭の小物: 石灯籠・岩・四つ目垣 ----
  const stone = new MeshStandardMaterial({ color: 0x8d8d85, roughness: 0.95 });
  const lantern = new Mesh(new CylinderGeometry(0.22, 0.26, 0.18, 10), stone);
  lantern.position.set(2.1, 0.09, -2.3);
  const pillar = new Mesh(new CylinderGeometry(0.09, 0.11, 0.55, 8), stone);
  pillar.position.set(2.1, 0.45, -2.3);
  const firebox = new Mesh(new BoxGeometry(0.3, 0.26, 0.3), stone);
  firebox.position.set(2.1, 0.86, -2.3);
  const roof = new Mesh(new CylinderGeometry(0.05, 0.34, 0.22, 4), stone);
  roof.position.set(2.1, 1.1, -2.3);
  roof.rotation.y = Math.PI / 4;
  for (const part of [lantern, pillar, firebox, roof]) {
    part.castShadow = true;
    scene.add(part);
  }

  for (let i = 0; i < 3; i++) {
    const rock = new Mesh(new DodecahedronGeometry(0.2 + i * 0.08, 0), stone);
    rock.position.set(-2.2 + i * 0.5, 0.08, -2.4 - i * 0.3);
    rock.scale.y = 0.55;
    rock.castShadow = true;
    scene.add(rock);
  }

  // 四つ目垣（細い竹の柵）
  const fenceMat = new MeshStandardMaterial({ color: 0xc8b06a, roughness: 0.7 });
  const poleGeo = new CylinderGeometry(0.018, 0.018, 1, 6);
  const fence = new InstancedMesh(poleGeo, fenceMat, 9);
  const fz = -2.6;
  let fi = 0;
  for (let k = 0; k < 5; k++) {
    p.set(-1.4 + k * 0.7, 0.45, fz);
    q.identity();
    s.set(1, 0.9, 1);
    m.compose(p, q, s);
    fence.setMatrixAt(fi++, m);
  }
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < 2; j++) {
      p.set(-0.7 + j * 1.4, 0.32 + k * 0.38, fz);
      q.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
      s.set(1, 1.55, 1);
      m.compose(p, q, s);
      fence.setMatrixAt(fi++, m);
    }
  }
  scene.add(fence);

  // 竹のマテリアルを先に作っておく（初回斬撃時のヒッチ防止）
  bambooMaterials();

  world.registerSystem(SamuraiSystem);

  if (location.search.includes("demo")) {
    const { DemoSwingSystem } = await import("./demo.js");
    world.registerSystem(DemoSwingSystem);
  }
});
