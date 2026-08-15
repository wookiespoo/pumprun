import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mountModel } from './roster.js?v=24';

const gltfLoader = new GLTFLoader();

function skyCanvas(top, mid, bot) {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, top);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function puffCloud() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xe4d8ff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: true,
  });
  const spots = [
    [0, 0, 0, 1.15],
    [1.1, 0.15, 0.2, 0.85],
    [-1.05, 0.1, -0.15, 0.8],
    [0.35, 0.45, -0.3, 0.62],
    [-0.4, 0.38, 0.35, 0.58],
  ];
  for (const [x, y, z, s] of spots) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), mat);
    m.position.set(x, y, z);
    m.scale.set(s * 1.4, s * 0.7, s);
    g.add(m);
  }
  g.userData.mat = mat;
  return g;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'sky';
    this.group.frustumCulled = false;
    scene.add(this.group);

    this.domeMat = new THREE.MeshBasicMaterial({
      map: skyCanvas('#7ec8ee', '#b5dff4', '#9ad0ee'),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(90, 24, 16), this.domeMat);
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this.orb = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff4c0, fog: false }),
    );
    this.orb.position.set(14, 18, 40);
    this.orb.scale.setScalar(1.8);
    this.group.add(this.orb);
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffe8a0,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        fog: false,
      }),
    );
    this.orb.add(this.halo);

    this.clouds = [];
    this.sunRoot = null;
    this.viewDir = 1;
    for (let i = 0; i < 16; i += 1) {
      const cloud = puffCloud();
      const side = i % 2 === 0 ? 1 : -1;
      // Sit well above the tallest roadside buildings (~20m) and out on
      // the horizon so they never punch through the skyline.
      cloud.position.set((i - 8) * 8.4, 28 + (i % 4) * 3.4, side * (62 + (i % 5) * 14));
      cloud.scale.setScalar(3.1 + (i % 3) * 0.7);
      cloud.traverse((o) => {
        if (o.isMesh && o.material) o.material.fog = false;
      });
      cloud.userData.dir = i % 2 === 0 ? 1 : -1;
      cloud.userData.speed = 0.28 + (i % 4) * 0.07;
      this.clouds.push(cloud);
      this.group.add(cloud);
    }
    this._placeCelestials();
  }

  setViewDir(dir) {
    this.viewDir = dir < 0 ? -1 : 1;
    this._placeCelestials();
  }

  _placeCelestials() {
    const z = this.viewDir * 48;
    if (this.orb) this.orb.position.set(this.viewDir * 10, 16, z);
    if (this.sunRoot) this.sunRoot.position.set(this.viewDir * 10, 16, z);
  }

  async attachSun(url = 'assets/models/scenery/sun.glb') {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const gltf = await new Promise((resolve, reject) => {
        gltfLoader.parse(buf, url.replace(/[^/]+$/, ''), resolve, reject);
      });
      const mounted = mountModel(gltf, { targetHeight: 10 });
      mounted.root.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false;
          if (o.material) {
            o.material.fog = false;
            o.material.toneMapped = false;
          }
        }
      });
      this.sunRoot = mounted.root;
      this.group.add(this.sunRoot);
      if (this.orb) this.orb.visible = false;
      this._placeCelestials();
      console.log('[ASSET] OK     sun  placed in daytime sky');
    } catch (err) {
      console.warn('[ASSET] FAILED sun', err);
    }
  }

  applyTheme(theme) {
    if (!theme) return;
    const id = theme.id;
    if (id === 'day') {
      this.domeMat.map = skyCanvas('#7ec8ee', '#b5dff4', '#9ad0ee');
      this.orb.material.color.setHex(0xfff4c0);
      this.halo.material.color.setHex(0xffe8a0);
      this._placeCelestials();
      this._tintClouds(0xffffff, 0.72);
    } else if (id === 'sunset') {
      this.domeMat.map = skyCanvas('#ff9966', '#4a1838', '#1a0814');
      this.orb.material.color.setHex(0xff7733);
      this.halo.material.color.setHex(0xff5522);
      this.orb.position.set(-16, 18, -34);
      this._tintClouds(0xffc8a0, 0.5);
    } else {
      this.domeMat.map = skyCanvas('#24145a', '#140c2c', '#070512');
      this.orb.material.color.setHex(0xece4ff);
      this.halo.material.color.setHex(0xc8b4ff);
      this.orb.position.set(-20, 26, -36);
      this._tintClouds(0xe4d8ff, 0.55);
    }
    this.domeMat.map.needsUpdate = true;
    this.domeMat.needsUpdate = true;
  }

  _tintClouds(hex, opacity) {
    for (const c of this.clouds) {
      if (c.userData.mat) {
        c.userData.mat.color.setHex(hex);
        c.userData.mat.opacity = opacity;
      }
    }
  }

  update(dt, z = 0) {
    this.group.position.set(0, 0, z);
    for (const c of this.clouds) {
      c.position.x += dt * c.userData.speed * c.userData.dir;
      if (c.position.x > 46) c.position.x = -46;
      if (c.position.x < -46) c.position.x = 46;
    }
  }
}
