import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Point2D, Pose2D } from "@/lib/geometry";
import type { OccupancyGrid, WorldObject } from "@/data/types";

export type ViewMode = "3d" | "top" | "follow";

export interface AxisProjection {
  x: [number, number];
  y: [number, number];
  z: [number, number];
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** ROS map frame (x forward, y left, z up) -> three.js (y up). */
const v3 = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, -y);

const COLORS = {
  background: "#151d2c",
  floor: "#80858c",
  unknown: "#252c39",
  wall: "#a6aab0",
  block: "#2b2e34",
  metal: "#3a3e45",
  cardboard: "#b88752",
  wood: "#9b5a2c",
  robot: "#1c1e21",
  ok: "#22c55e",
  path: "#2f7ff6",
  pathLocal: "#7cc4ff",
  preview: "#60a5fa",
};

function noiseTexture(base: string, amount = 18, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function pinTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = COLORS.ok;
  ctx.beginPath();
  ctx.arc(64, 58, 46, Math.PI, 0);
  ctx.bezierCurveTo(110, 96, 78, 120, 64, 156);
  ctx.bezierCurveTo(50, 120, 18, 96, 18, 58);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(64, 58, 18, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

function box(w: number, h: number, d: number, color: string | THREE.Material, rough = 0.85): THREE.Mesh {
  const mat = typeof color === "string" ? new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 }) : color;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Builds a mesh for a semantic demo-world object, in the object's local frame. */
function buildObject(o: WorldObject, wallTex: THREE.Texture): THREE.Object3D {
  const g = new THREE.Group();
  const W = o.width;
  const D = o.depth;
  const H = o.height;
  switch (o.kind) {
    case "wall": {
      const mat = new THREE.MeshStandardMaterial({ color: COLORS.wall, map: wallTex, roughness: 0.95 });
      const m = box(W, H, D, mat);
      m.position.y = H / 2;
      g.add(m);
      break;
    }
    case "block": {
      const m = box(W, H, D, COLORS.block, 0.75);
      m.position.y = H / 2;
      g.add(m);
      break;
    }
    case "shelf":
    case "workbench": {
      const metal = new THREE.MeshStandardMaterial({ color: o.kind === "shelf" ? "#4a4038" : COLORS.block, roughness: 0.7, metalness: 0.2 });
      const post = 0.04;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const p = box(post, H, post, metal);
          p.position.set((sx * (W - post)) / 2, H / 2, (sz * (D - post)) / 2);
          g.add(p);
        }
      const levels = o.kind === "shelf" ? 4 : 3;
      for (let i = 0; i < levels; i++) {
        const y = 0.08 + (i * (H - 0.1)) / (levels - 1);
        const s = box(W, 0.035, D, metal);
        s.position.y = y;
        g.add(s);
        if (o.kind === "shelf" && i < levels - 1) {
          // Cardboard boxes on each shelf level.
          const n = 3;
          for (let k = 0; k < n; k++) {
            const bh = 0.2 + ((k + i) % 2) * 0.06;
            const b = box(W * 0.8, bh, D / n - 0.08, COLORS.cardboard, 0.95);
            b.position.set(0, y + 0.02 + bh / 2, -D / 2 + (k + 0.5) * (D / n));
            g.add(b);
          }
        }
      }
      if (o.kind === "workbench") {
        const back = box(W, H, 0.02, metal);
        back.position.set(0, H / 2, -(D / 2 - 0.01)); // against the wall behind it (+y)
        g.add(back);
      }
      break;
    }
    case "table": {
      const top = box(W, 0.05, D, COLORS.wood, 0.6);
      top.position.y = H - 0.025;
      g.add(top);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const leg = box(0.05, H - 0.05, 0.05, "#2a2a2a");
          leg.position.set(sx * (W / 2 - 0.06), (H - 0.05) / 2, sz * (D / 2 - 0.06));
          g.add(leg);
        }
      break;
    }
  }
  // Local frame: object x = world x, object y = world y -> three -z.
  g.position.copy(v3(o.x, o.y));
  g.rotation.y = o.yaw;
  return g;
}

function buildRobot(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: COLORS.robot, roughness: 0.55, metalness: 0.3 });
  const plateGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.008, 32);
  for (const y of [0.035, 0.085, 0.135]) {
    const plate = new THREE.Mesh(plateGeo, dark);
    plate.position.y = y;
    plate.castShadow = true;
    body.add(plate);
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 24), new THREE.MeshStandardMaterial({ color: "#2b2f35", roughness: 0.6 }));
  core.position.y = 0.085;
  core.castShadow = true;
  body.add(core);
  const wheelGeo = new THREE.CylinderGeometry(0.033, 0.033, 0.018, 24);
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(wheelGeo, new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.9 }));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, 0.033, side * 0.085);
    body.add(wheel);
  }
  const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.035, 24), new THREE.MeshStandardMaterial({ color: "#3b3f46", roughness: 0.4, metalness: 0.4 }));
  lidar.position.y = 0.16;
  lidar.castShadow = true;
  body.add(lidar);
  body.scale.setScalar(1.6); // enlarged for visibility at warehouse scale
  g.add(body);

  const okMat = new THREE.MeshBasicMaterial({ color: COLORS.ok });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 12, 64), okMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.012;
  g.add(ring);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.ok, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.008;
  g.add(disc);
  // Heading indicator (robot +x).
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 3), okMat);
  arrow.rotation.z = -Math.PI / 2;
  arrow.position.set(0.31, 0.014, 0);
  arrow.scale.set(1, 1, 0.25);
  g.add(arrow);
  return g;
}

function buildGoal(color: string, opacity: number, withPin: boolean): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 12, 64), mat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.012;
  g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.2, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 * opacity, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.008;
  g.add(disc);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 3), mat);
  arrow.rotation.z = -Math.PI / 2;
  arrow.position.set(0.27, 0.014, 0);
  arrow.scale.set(1, 1, 0.25);
  g.add(arrow);
  if (withPin) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(), depthTest: false }));
    sprite.scale.set(0.3, 0.375, 1);
    sprite.position.y = 0.36;
    sprite.renderOrder = 10;
    g.add(sprite);
  }
  return g;
}

function buildPath(points: Point2D[], color: string, radius: number, height: number, glow: boolean): THREE.Group | null {
  if (points.length < 2) return null;
  const pts: THREE.Vector3[] = [];
  const step = Math.max(1, Math.floor(points.length / 150));
  for (let i = 0; i < points.length; i += step) pts.push(v3(points[i].x, points[i].y, height));
  const last = points[points.length - 1];
  pts.push(v3(last.x, last.y, height));
  // Drop duplicate points that would break the curve.
  const clean = pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 1e-6);
  if (clean.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(clean, false, "centripetal");
  const segs = Math.min(400, clean.length * 3);
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(curve, segs, radius, 8, false),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.85, roughness: 0.4 }),
    ),
  );
  if (glow) {
    g.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, segs, radius * 2.4, 8, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }),
      ),
    );
  }
  return g;
}

/** Imperative three.js scene for the Gazebo Simulation panel. */
export class SimulationScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly sun: THREE.DirectionalLight;
  private readonly envGroup = new THREE.Group();
  private readonly robot = buildRobot();
  private readonly goal = buildGoal(COLORS.ok, 1, true);
  private readonly preview = buildGoal(COLORS.preview, 0.75, false);
  private globalPath: THREE.Group | null = null;
  private localPath: THREE.Group | null = null;
  private bounds: Bounds = { minX: 0, minY: 0, maxX: 6, maxY: 6 };
  private view: ViewMode = "3d";
  private robotPose: Pose2D | null = null;
  private frame = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly wallTex = noiseTexture(COLORS.wall, 22);
  private readonly floorTex = noiseTexture(COLORS.floor, 14);
  private lastAxes = "";
  private down: { x: number; y: number } | null = null;

  pickEnabled = false;
  onAxes: ((axes: AxisProjection) => void) | null = null;
  onGroundClick: ((p: Point2D) => void) | null = null;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(COLORS.background);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 200);
    this.scene.add(new THREE.HemisphereLight("#e4ecff", "#3c414b", 1.5));
    this.scene.add(new THREE.AmbientLight("#ffffff", 0.25));
    this.sun = new THREE.DirectionalLight("#ffffff", 2.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.envGroup);

    this.robot.visible = false;
    this.goal.visible = false;
    this.preview.visible = false;
    this.scene.add(this.robot, this.goal, this.preview);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 60;

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.handlePointerDown);
    el.addEventListener("pointerup", this.handlePointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.applyView();
    this.frame = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.handlePointerDown);
    el.removeEventListener("pointerup", this.handlePointerUp);
    this.controls.dispose();
    disposeObject(this.scene);
    this.wallTex.dispose();
    this.floorTex.dispose();
    this.renderer.dispose();
    el.remove();
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  private handlePointerUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || !this.pickEnabled || !this.onGroundClick) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return; // that was an orbit drag
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
      this.onGroundClick({ x: hit.x, y: -hit.z });
    }
  };

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    if (this.view === "follow" && this.robotPose) {
      const p = this.robotPose;
      const target = v3(p.x + Math.cos(p.theta) * 0.6, p.y + Math.sin(p.theta) * 0.6, 0);
      const desired = v3(p.x - Math.cos(p.theta) * 2.2, p.y - Math.sin(p.theta) * 2.2, 1.7);
      this.camera.position.lerp(desired, 0.08);
      this.controls.target.lerp(target, 0.12);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.emitAxes();
  };

  private emitAxes() {
    if (!this.onAxes) return;
    const inv = this.camera.quaternion.clone().invert();
    const proj = (v: THREE.Vector3): [number, number] => {
      const r = v.clone().applyQuaternion(inv);
      return [Math.round(r.x * 100) / 100, Math.round(r.y * 100) / 100];
    };
    const axes: AxisProjection = { x: proj(new THREE.Vector3(1, 0, 0)), y: proj(new THREE.Vector3(0, 0, -1)), z: proj(new THREE.Vector3(0, 1, 0)) };
    const key = JSON.stringify(axes);
    if (key !== this.lastAxes) {
      this.lastAxes = key;
      this.onAxes(axes);
    }
  }

  private clearEnvironment() {
    for (const child of [...this.envGroup.children]) {
      this.envGroup.remove(child);
      disposeObject(child);
    }
  }

  private setBounds(b: Bounds) {
    this.bounds = b;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    this.sun.position.copy(v3(cx - size * 0.35, cy - size * 0.2, size * 1.3));
    this.sun.target.position.copy(v3(cx, cy, 0));
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -size * 0.8;
    cam.right = cam.top = size * 0.8;
    cam.near = 0.1;
    cam.far = size * 4;
    cam.updateProjectionMatrix();
  }

  /** Demo Mode: semantic objects (walls, shelves, tables, blocks). */
  setWorld(objects: WorldObject[]): void {
    this.clearEnvironment();
    const walls = objects.filter((o) => o.kind === "wall");
    const xs = walls.flatMap((w) => [w.x - w.width / 2, w.x + w.width / 2]);
    const ys = walls.flatMap((w) => [w.y - w.depth / 2, w.y + w.depth / 2]);
    const b: Bounds = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    this.addFloor(b);
    for (const o of objects) this.envGroup.add(buildObject(o, this.wallTex));
    this.setBounds(b);
    this.applyView();
  }

  /** Live mode: extrude occupied cells of the real occupancy grid. */
  setMap(grid: OccupancyGrid): void {
    this.clearEnvironment();
    const { width, height, resolution: res, originX, originY, data } = grid;
    const b: Bounds = { minX: originX, minY: originY, maxX: originX + width * res, maxY: originY + height * res };

    // Floor texture: free = concrete, unknown = dark.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(width, height);
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const v = data[j * width + i];
        const o = ((height - 1 - j) * width + i) * 4; // canvas rows run top-down
        const n = (Math.random() - 0.5) * 10;
        const c = v < 0 ? [37, 44, 57] : [128 + n, 133 + n, 140 + n];
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(b.maxX - b.minX, b.maxY - b.minY),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(v3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0));
    floor.receiveShadow = true;
    this.envGroup.add(floor);

    // Merge horizontal runs of occupied cells into boxes.
    const runs: [number, number, number][] = [];
    for (let j = 0; j < height; j++) {
      let start = -1;
      for (let i = 0; i <= width; i++) {
        const occ = i < width && data[j * width + i] >= 65;
        if (occ && start < 0) start = i;
        if (!occ && start >= 0) {
          runs.push([start, i - start, j]);
          start = -1;
        }
      }
    }
    if (runs.length) {
      const wallHeight = 0.5;
      const mat = new THREE.MeshStandardMaterial({ color: COLORS.wall, map: this.wallTex, roughness: 0.95 });
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, runs.length);
      const m = new THREE.Matrix4();
      runs.forEach(([i0, len, j], k) => {
        const x = originX + (i0 + len / 2) * res;
        const y = originY + (j + 0.5) * res;
        m.compose(v3(x, y, wallHeight / 2), new THREE.Quaternion(), new THREE.Vector3(len * res, wallHeight, res));
        mesh.setMatrixAt(k, m);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.envGroup.add(mesh);
    }
    this.setBounds(b);
    this.applyView();
  }

  clear(): void {
    this.clearEnvironment();
  }

  private addFloor(b: Bounds) {
    const w = b.maxX - b.minX;
    const d = b.maxY - b.minY;
    this.floorTex.repeat.set(w / 2, d / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: "#ffffff", map: this.floorTex, roughness: 0.92 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(v3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0));
    floor.receiveShadow = true;
    this.envGroup.add(floor);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(w * 6, d * 6), new THREE.MeshStandardMaterial({ color: "#1e2533", roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.copy(v3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, -0.01));
    this.envGroup.add(outer);
  }

  setRobot(pose: Pose2D | null): void {
    this.robotPose = pose;
    this.robot.visible = !!pose;
    if (!pose) return;
    this.robot.position.copy(v3(pose.x, pose.y));
    this.robot.rotation.y = pose.theta;
  }

  setGoal(goal: Pose2D | null): void {
    this.goal.visible = !!goal;
    if (!goal) return;
    this.goal.position.copy(v3(goal.x, goal.y));
    this.goal.rotation.y = goal.theta;
  }

  setPreview(pose: Pose2D | null): void {
    this.preview.visible = !!pose;
    if (!pose) return;
    this.preview.position.copy(v3(pose.x, pose.y, 0.003));
    this.preview.rotation.y = pose.theta;
  }

  setGlobalPath(points: Point2D[]): void {
    if (this.globalPath) {
      this.scene.remove(this.globalPath);
      disposeObject(this.globalPath);
    }
    this.globalPath = buildPath(points, COLORS.path, 0.045, 0.035, true);
    if (this.globalPath) this.scene.add(this.globalPath);
  }

  setLocalPath(points: Point2D[]): void {
    if (this.localPath) {
      this.scene.remove(this.localPath);
      disposeObject(this.localPath);
    }
    this.localPath = buildPath(points, COLORS.pathLocal, 0.034, 0.06, false);
    if (this.localPath) this.scene.add(this.localPath);
  }

  setView(view: ViewMode): void {
    this.view = view;
    this.applyView();
  }

  resetView(): void {
    this.applyView();
  }

  private applyView() {
    const b = this.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const w = b.maxX - b.minX;
    const d = b.maxY - b.minY;
    const size = Math.max(w, d);
    const aspect = this.camera.aspect || 1.5;
    this.controls.enableRotate = this.view !== "top";
    if (this.view === "top") {
      const fov = (this.camera.fov * Math.PI) / 180;
      const dist = (Math.max(d, w / aspect) * 0.55) / Math.tan(fov / 2);
      this.camera.position.copy(v3(cx, cy - 0.001, dist));
      this.controls.target.copy(v3(cx, cy, 0));
    } else if (this.view === "3d") {
      // Elevated view from the front edge, as in the reference composition.
      const fit = Math.max(size * 0.8, (w * 1.0) / aspect);
      this.camera.position.copy(v3(cx, b.minY - fit * 0.3, fit * 0.92));
      this.controls.target.copy(v3(cx, cy + d * 0.06, 0));
    } else if (this.robotPose) {
      const p = this.robotPose;
      this.camera.position.copy(v3(p.x - Math.cos(p.theta) * 2.2, p.y - Math.sin(p.theta) * 2.2, 1.7));
      this.controls.target.copy(v3(p.x, p.y, 0));
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
}
