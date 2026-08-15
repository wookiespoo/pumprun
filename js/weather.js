import * as THREE from 'three';
import { Sky } from './sky.js?v=52';

export const THEMES = [
  {
    id: 'night',
    name: 'NEON NIGHT',
    bg: 0x0c0a18,
    fog: 0x1a1630,
    fogNear: 34,
    fogFar: 95,
    hemiSky: 0xb48cff,
    hemiGround: 0x1a1228,
    hemi: 1.05,
    key: 0xffe8c8,
    keyInt: 0.8,
    fill: 0x3a2a66,
    fillInt: 0.45,
    sidewalk: 0x6e6a7c,
    curb: 0x6e6a78,
    planter: 0x1c2a22,
    walkAccent: 0x14f195,
    exposure: 1.15,
    rain: false,
  },
  {
    id: 'day',
    name: 'CLEAR DAY',
    bg: 0x6eb4dc,
    fog: 0x86c0de,
    fogNear: 48,
    fogFar: 125,
    hemiSky: 0xfff4e4,
    hemiGround: 0x6e7c58,
    hemi: 1.12,
    key: 0xffefd2,
    keyInt: 1.02,
    fill: 0x88b0d8,
    fillInt: 0.36,
    sidewalk: 0x8a8680,
    curb: 0xa49e94,
    planter: 0x4a6a40,
    walkAccent: 0x14f195,
    exposure: 1.12,
    rain: false,
  },
  {
    id: 'rain',
    name: 'TRENCH RAIN',
    bg: 0x1a2430,
    fog: 0x2a3644,
    fogNear: 22,
    fogFar: 70,
    hemiSky: 0x88a0b8,
    hemiGround: 0x141820,
    hemi: 0.85,
    key: 0xc8d4e0,
    keyInt: 0.55,
    fill: 0x446688,
    fillInt: 0.35,
    sidewalk: 0x3a424c,
    curb: 0x525860,
    planter: 0x1a2420,
    walkAccent: 0x14f195,
    exposure: 1.05,
    rain: true,
  },
  {
    id: 'sunset',
    name: 'RUGSET',
    bg: 0x2a1428,
    fog: 0x4a2838,
    fogNear: 32,
    fogFar: 90,
    hemiSky: 0xff9966,
    hemiGround: 0x2a1020,
    hemi: 1.1,
    key: 0xff7733,
    keyInt: 1.0,
    fill: 0x9945ff,
    fillInt: 0.4,
    sidewalk: 0x5a4040,
    curb: 0x6e5450,
    planter: 0x2a2018,
    walkAccent: 0x14f195,
    exposure: 1.18,
    rain: false,
  },
];

export const DAY = THEMES.find((t) => t.id === 'day');

export class Weather {
  constructor(scene, { hemi, key, neonA, neonB, renderer }) {
    this.scene = scene;
    this.hemi = hemi;
    this.key = key;
    this.neonA = neonA;
    this.neonB = neonB;
    this.renderer = renderer;
    this.fill = new THREE.AmbientLight(0x334466, 0.35);
    scene.add(this.fill);
    this.theme = DAY;
    this.index = 0;
    this.shiftAt = Infinity;
    this.rain = null;
    this._rainGeo = null;
    this._rainPos = null;
    this.sky = new Sky(scene);
    this.apply(DAY);
  }

  pick() {
    this.apply(DAY);
    return this.theme;
  }

  maybeShift() {
    return null;
  }

  apply(theme) {
    this.theme = theme;
    this.scene.background = new THREE.Color(theme.bg);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(theme.fog);
      this.scene.fog.near = theme.fogNear;
      this.scene.fog.far = theme.fogFar;
    } else {
      this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    }
    this.hemi.color.setHex(theme.hemiSky);
    this.hemi.groundColor.setHex(theme.hemiGround);
    this.hemi.intensity = theme.hemi;
    this.key.color.setHex(theme.key);
    this.key.intensity = theme.keyInt;
    this.fill.color.setHex(theme.fill);
    this.fill.intensity = theme.fillInt;
    this.renderer.toneMappingExposure = theme.exposure;
    if (this.neonA) this.neonA.intensity = theme.id === 'day' ? 2.1 : 3.4;
    if (this.neonB) this.neonB.intensity = theme.id === 'day' ? 1.9 : 3.2;
    this.sky?.applyTheme(theme);
    if (theme.rain) this._ensureRain();
    else this._stopRain();
  }

  _ensureRain() {
    if (this.rain) {
      this.rain.visible = true;
      return;
    }
    const n = 450;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = Math.random() * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xb8d4e8,
      size: 0.045,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.rain = new THREE.Points(geo, mat);
    this.rain.frustumCulled = false;
    this._rainGeo = geo;
    this._rainPos = pos;
    this.scene.add(this.rain);
  }

  _stopRain() {
    if (this.rain) this.rain.visible = false;
  }

  update(dt, z, x = 0) {
    this.sky?.update(dt, z);
    if (!this.rain?.visible || !this._rainPos) return;
    const pos = this._rainPos;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] -= (9 + (i % 5)) * dt;
      pos[i + 2] -= 4 * dt;
      if (pos[i + 1] < 0) {
        pos[i] = x + (Math.random() - 0.5) * 16;
        pos[i + 1] = 8 + Math.random() * 4;
        pos[i + 2] = z + 6 + Math.random() * 18;
      }
    }
    this._rainGeo.attributes.position.needsUpdate = true;
    this.rain.position.set(0, 0, 0);
  }
}
