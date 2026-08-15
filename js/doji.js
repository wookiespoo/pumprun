import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const GREEN = 0x14f195;
const GOLD = 0xf0d78c;
const WICK = 0x1f6b4a;
const TARGET_H = 0.33; // half-minus of the old 0.72 — small shiny pickup, not a crate

let haloTex = null;
let haloMat = null;
let mats = null;
let geos = null;

function getHalo() {
  if (haloMat) return haloMat;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,228,170,0.32)');
  g.addColorStop(0.3, 'rgba(20,241,149,0.12)');
  g.addColorStop(1, 'rgba(20,241,149,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  haloMat = new THREE.SpriteMaterial({
    map: haloTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.48,
    blending: THREE.NormalBlending,
  });
  return haloMat;
}

function getGeos() {
  if (geos) return geos;
  geos = {
    body: new THREE.BoxGeometry(0.38, 0.06, 0.1),
    bodyCore: new THREE.BoxGeometry(0.16, 0.09, 0.12),
    wick: new THREE.CylinderGeometry(0.02, 0.02, 0.78, 8),
    ring: new THREE.TorusGeometry(0.2, 0.024, 8, 22),
    cap: new THREE.SphereGeometry(0.028, 8, 6),
  };
  return geos;
}

function getMats() {
  if (mats) return mats;
  mats = {
    gold: new THREE.MeshStandardMaterial({
      color: GOLD,
      emissive: 0x3a2a08,
      emissiveIntensity: 0.35,
      roughness: 0.32,
      metalness: 0.72,
    }),
    wick: new THREE.MeshStandardMaterial({
      color: WICK,
      emissive: GREEN,
      emissiveIntensity: 0.22,
      roughness: 0.45,
      metalness: 0.18,
    }),
    neon: new THREE.MeshStandardMaterial({
      color: GREEN,
      emissive: GREEN,
      emissiveIntensity: 0.42,
      roughness: 0.4,
      metalness: 0.15,
    }),
  };
  return mats;
}

function addHalo(root, y = 0.36) {
  const halo = new THREE.Sprite(getHalo());
  halo.scale.set(0.22, 0.22, 1);
  halo.position.y = y;
  halo.name = 'halo';
  root.add(halo);
}

function makeCrossCandle() {
  const g = getGeos();
  const m = getMats();
  const root = new THREE.Group();
  const wick = new THREE.Mesh(g.wick, m.wick);
  wick.position.y = 0.4;
  const body = new THREE.Mesh(g.body, m.gold);
  body.position.y = 0.4;
  const core = new THREE.Mesh(g.bodyCore, m.neon);
  core.position.y = 0.4;
  const ring = new THREE.Mesh(g.ring, m.gold);
  ring.position.y = 0.4;
  ring.rotation.x = Math.PI / 2;
  root.add(wick, body, core, ring);
  addHalo(root, 0.4);
  return root;
}

function dressSpire(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mat = o.material.clone();
    if (mat.emissive) {
      mat.emissive = new THREE.Color(0x0a4a32);
      mat.emissiveIntensity = Math.min(mat.emissiveIntensity || 0.2, 0.28);
    }
    o.material = mat;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = false;
  });
}

export function makeDojiVisual(gltf) {
  if (gltf?.scene) {
    const root = new THREE.Group();
    const model = cloneSkinned(gltf.scene);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = TARGET_H / Math.max(size.y, 0.01);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    root.add(model);
    dressSpire(root);
    addHalo(root, TARGET_H * 0.5);
    return root;
  }
  return makeCrossCandle();
}

export function tickDoji(item, dt, t) {
  const root = item.root;
  if (item.popping) {
    item.pop += dt;
    const k = Math.min(1, item.pop / 0.09);
    const s = 1 + k * 1.4;
    root.scale.setScalar((root.userData.s0 || 1) * s);
    root.traverse((o) => {
      if (o.isSprite && o.material) o.material.opacity = 0.48 * (1 - k);
    });
    if (k >= 1) {
      root.visible = false;
      item.dead = true;
    }
    return;
  }
  const phase = item.phase || 0;
  root.rotation.y += dt * 1.85;
  root.position.y = item.baseY + Math.sin(t * 2.4 + phase) * 0.07;
}

export function startDojiPop(item) {
  item.popping = true;
  item.pop = 0;
  item.root.userData.s0 = item.root.scale.x || 1;
}

export class DojiPool {
  constructor() {
    this.free = [];
  }

  acquire(gltf) {
    const obj = this.free.pop() || makeDojiVisual(gltf);
    obj.visible = true;
    obj.scale.setScalar(1);
    obj.rotation.x = 0;
    obj.rotation.y = 0;
    obj.traverse((o) => {
      if (o.isSprite && o.material) {
        if (!o.userData.ownMat) {
          o.material = o.material.clone();
          o.userData.ownMat = true;
        }
        o.material.opacity = 0.48;
      }
    });
    return obj;
  }

  release(obj) {
    obj.visible = false;
    if (obj.parent) obj.parent.remove(obj);
    this.free.push(obj);
  }
}
