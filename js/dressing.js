import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mountModel } from './roster.js?v=24';
import { DRESSING } from './catalog.js?v=63';

const gltfLoader = new GLTFLoader();

const _mat = {};
function mat(key, params) {
  if (!_mat[key]) _mat[key] = new THREE.MeshStandardMaterial(params);
  return _mat[key];
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function procTree(tint = 0x14f195) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.13, 0.95, 6),
    mat('trunk', { color: 0x3a2818, roughness: 0.92 }),
  );
  trunk.position.y = 0.48;
  const a = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.52, 0),
    mat(`canopy-${tint}`, { color: tint, emissive: tint, emissiveIntensity: 0.35, roughness: 0.55 }),
  );
  a.position.y = 1.35;
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), a.material);
  b.position.set(0.22, 1.55, -0.08);
  const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), a.material);
  c.position.set(-0.18, 1.62, 0.14);
  g.add(trunk, a, b, c);
  return g;
}

function procBench() {
  const g = new THREE.Group();
  const wood = mat('wood', { color: 0x5a4030, roughness: 0.7 });
  const metal = mat('metal', { color: 0x2a2a32, metalness: 0.55, roughness: 0.4 });
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.05, 8), wood);
  seat.rotation.z = Math.PI / 2;
  seat.position.y = 0.38;
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.05, 8), wood);
  back.rotation.z = Math.PI / 2;
  back.position.set(0, 0.62, -0.16);
  const legA = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.38, 6), metal);
  legA.position.set(-0.38, 0.19, 0);
  const legB = legA.clone();
  legB.position.x = 0.38;
  g.add(seat, back, legA, legB);
  return g;
}

function procPlanter() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.18, 0.3, 8),
    mat('pot', { color: 0x4a3048, roughness: 0.55, emissive: 0x9945ff, emissiveIntensity: 0.12 }),
  );
  pot.position.y = 0.15;
  const bush = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.22, 0),
    mat('bush', { color: 0x14f195, emissive: 0x14f195, emissiveIntensity: 0.28, roughness: 0.6 }),
  );
  bush.position.y = 0.42;
  g.add(pot, bush);
  return g;
}

function procHydrant() {
  const g = new THREE.Group();
  const red = mat('hydrant', { color: 0xc62828, metalness: 0.35, roughness: 0.4, emissive: 0x401010, emissiveIntensity: 0.15 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 8), red);
  body.position.y = 0.22;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), red);
  dome.position.y = 0.46;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 6), red);
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(0.12, 0.3, 0);
  g.add(body, dome, nozzle);
  return g;
}

function procCar(tint = 0x2a2040) {
  const g = new THREE.Group();
  const paint = mat(`car-${tint}`, { color: tint, metalness: 0.45, roughness: 0.35, emissive: tint, emissiveIntensity: 0.08 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.52, 10, 8), paint);
  body.scale.set(1.7, 0.52, 0.82);
  body.position.y = 0.42;
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), paint);
  cabin.scale.set(0.9, 0.7, 0.85);
  cabin.position.set(-0.08, 0.68, 0);
  const wheelMat = mat('tire', { color: 0x111114, roughness: 0.9 });
  const wheelGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.1, 8);
  const spots = [
    [0.42, 0.14, 0.34],
    [0.42, 0.14, -0.34],
    [-0.42, 0.14, 0.34],
    [-0.42, 0.14, -0.34],
  ];
  for (const [x, y, z] of spots) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    g.add(w);
  }
  g.add(body, cabin);
  return g;
}

function procCloud() {
  const g = new THREE.Group();
  const puff = mat('cloud', {
    color: 0xe8dcff,
    emissive: 0x9945ff,
    emissiveIntensity: 0.12,
    transparent: true,
    opacity: 0.78,
    roughness: 1,
    depthWrite: false,
  });
  const spots = [
    [0, 0, 0, 1],
    [0.7, 0.1, 0.15, 0.72],
    [-0.65, 0.05, -0.1, 0.68],
    [0.2, 0.28, -0.2, 0.55],
    [-0.25, 0.22, 0.25, 0.5],
  ];
  for (const [x, y, z, s] of spots) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), puff);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    g.add(m);
  }
  return g;
}

const PROC = {
  tree: () => procTree(hash(Math.random()) > 0.5 ? 0x14f195 : 0x9945ff),
  treeGreen: () => procTree(0x14f195),
  treePurple: () => procTree(0x9945ff),
  bench: procBench,
  planter: procPlanter,
  hydrant: procHydrant,
  car: () => procCar(0x2a1848),
  carAlt: () => procCar(0x143828),
  cloud: procCloud,
};

async function tryGltf(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const base = url.replace(/[^/]+$/, '');
    return await new Promise((resolve, reject) => {
      gltfLoader.parse(buf, base, resolve, reject);
    });
  } catch {
    return null;
  }
}

export class DressingKit {
  constructor() {
    this.proto = {};
    this.source = {};
  }

  async load() {
    await Promise.all(
      DRESSING.map(async (spec) => {
        const gltf = await tryGltf(spec.model);
        if (gltf && gltf.scene) {
          const mounted = mountModel(gltf, { targetHeight: spec.height });
          this.proto[spec.id] = mounted.root;
          this.source[spec.id] = 'glb';
        } else {
          this.proto[spec.id] = (PROC[spec.id] || procTree)();
          this.source[spec.id] = 'proc';
        }
      }),
    );
    if (!this.proto.tree) this.proto.tree = procTree(0x14f195);
    if (!this.proto.tree_pine) this.proto.tree_pine = this.proto.tree;
    if (!this.proto.bush) this.proto.bush = procPlanter();
    if (!this.proto.treeGreen) this.proto.treeGreen = this.proto.tree;
    if (!this.proto.treePurple) this.proto.treePurple = this.proto.tree_pine || this.proto.tree;
    if (!this.proto.carAlt) this.proto.carAlt = this.proto.car || procCar(0x143828);
  }

  make(id) {
    const src = this.proto[id] || this.proto.tree;
    const clone = src.clone(true);
    clone.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = true;
      }
    });
    return clone;
  }
}

export function decorateStrip(tile, z0, kit) {
  for (const side of [-1, 1]) {
    const seed = z0 * 2.17 + side * 19.3;

    for (let i = 0; i < 5; i += 1) {
      const bush = kit.make('bush');
      const u = hash(seed + i * 2.4);
      bush.position.set(side * (4.55 + u * 0.55), 0, z0 - 7.2 + i * 3.0 + hash(seed + 5 + i) * 0.35);
      bush.scale.setScalar(0.85 + u * 0.28);
      bush.rotation.y = u * 4;
      tile.add(bush);
    }

    for (let i = 0; i < 4; i += 1) {
      const tree = kit.make(i % 2 ? 'tree_pine' : 'tree');
      const u = hash(seed + 40 + i * 3.1);
      tree.position.set(side * (6.05 + u * 0.28), 0, z0 - 6.4 + i * 4.1 + hash(seed + 50 + i) * 0.35);
      tree.rotation.y = u * Math.PI * 2;
      tree.scale.setScalar(0.78 + hash(seed + 60 + i) * 0.22);
      tile.add(tree);
    }

    const bench = kit.make('bench');
    bench.position.set(side * 4.7, 0, z0 - 1.2 + hash(seed + 4) * 1.4);
    bench.rotation.y = side > 0 ? Math.PI : 0;
    tile.add(bench);

    const bench2 = kit.make('bench');
    bench2.position.set(side * 4.8, 0, z0 + 4.4);
    bench2.rotation.y = side > 0 ? Math.PI : 0;
    tile.add(bench2);

    const planter = kit.make('planter');
    planter.position.set(side * 5.85, 0, z0 + 1.1);
    tile.add(planter);
    const planter2 = kit.make('planter');
    planter2.position.set(side * 5.95, 0, z0 - 4.6);
    tile.add(planter2);

    const hydrant = kit.make('hydrant');
    hydrant.position.set(side * 4.35, 0, z0 + 6.2);
    tile.add(hydrant);

    if (Math.abs(Math.round(z0 / 16)) % 2 === (side < 0 ? 0 : 1)) {
      const car = kit.make(hash(seed + 11) > 0.5 ? 'car' : 'carAlt');
      // Curb / roadside only — buildings start ~7.5m out. Never in the footprint.
      car.position.set(side * 4.85, 0, z0 + (hash(seed + 13) - 0.5) * 1.6);
      car.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.scale.setScalar(0.72);
      tile.add(car);
    }
  }
}

export { hash };
