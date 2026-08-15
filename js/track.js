import * as THREE from 'three';
import { loadGltf, mountModel } from './roster.js?v=16';
import { SCENERY, LANE_SPACING } from './catalog.js?v=68';
import { DressingKit, decorateStrip, hash } from './dressing.js?v=63';

const TILE = 16;
const AHEAD = 5;
const BEHIND = 2;

/** Sit just above the asphalt (deck is 0.08 after ground-snap). */
const LINE_Y = 0.08 + 0.016;
const EDGE_X = 3.22;
const DASH_LEN = 1.55;
const DASH_GAP = 1.25;
const DASH_PERIOD = DASH_LEN + DASH_GAP;

function makePavementTex() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6e6a7c';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(20,20,28,0.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, i * 16);
    ctx.lineTo(128, i * 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * 16, 0);
    ctx.lineTo(i * 16, 128);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Hide the stock GLB paint (2cm boxes flush with the deck, plus the
 * leftover neon 'mid' stripe). Real markings are separate meshes so
 * we never mutate the shared road geometry or z-fight the asphalt.
 */
function hideStockRoadPaint(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      const n = (m.name || '').toLowerCase();
      if (n === 'mid' || /line|stripe|dash/.test(n)) m.visible = false;
    }
  });
}

function makeLineMaterial() {
  return new THREE.MeshStandardMaterial({
    name: 'laneLine',
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0,
    emissive: 0xffffff,
    emissiveIntensity: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthTest: true,
    depthWrite: true,
    transparent: false,
  });
}

function place(gltf, { height = null, width = 0, length = 0, yaw = 0, x = 0, y = 0, z = 0, sx = 1 } = {}) {
  const m = mountModel(gltf, { targetHeight: height, targetWidth: width || 0, targetLength: length || 0, yaw });
  if (height == null) {
    m.root.scale.setScalar(sx);
    m.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.root);
    m.root.position.y -= box.min.y;
  }
  m.root.position.x += x;
  m.root.position.z += z;
  m.root.position.y += y;
  return m.root;
}

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'track';
    scene.add(this.group);
    this.tiles = [];
    this.ready = false;
    this.assets = null;
    this.cursor = 0;
    this.walkMat = new THREE.MeshStandardMaterial({
      color: 0x6e6a7c,
      roughness: 0.82,
      metalness: 0.08,
      map: makePavementTex(),
    });
    this.curbMat = new THREE.MeshStandardMaterial({ color: 0x8a8694, roughness: 0.62, metalness: 0.14 });
    this.planterMat = new THREE.MeshStandardMaterial({
      color: 0x2a3a2c,
      roughness: 0.85,
      emissive: 0x14f195,
      emissiveIntensity: 0.08,
    });
    this.spillL = new THREE.MeshBasicMaterial({
      color: 0x14f195,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    this.spillR = new THREE.MeshBasicMaterial({
      color: 0x9945ff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    this.accentMat = new THREE.MeshStandardMaterial({
      color: 0x14f195,
      emissive: 0x14f195,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
    this.accentMatR = new THREE.MeshStandardMaterial({
      color: 0x9945ff,
      emissive: 0x9945ff,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1824, roughness: 0.96 });
    this.lineMat = makeLineMaterial();
    this.edgeGeo = new THREE.BoxGeometry(0.12, 0.014, TILE);
    this.dashGeo = new THREE.BoxGeometry(0.10, 0.014, DASH_LEN);
    this.ground = null;
    this.dress = new DressingKit();
    this.landmark = null;
    this.horizonDir = 1;
    this._hillScale = 0;
    this._hillY = 0;
    this.worldLog = [];
  }

  async load() {
    const [road, lamp, sign, rail, ...buildings] = await Promise.all([
      loadGltf(SCENERY.road.model),
      loadGltf(SCENERY.lamp.model),
      loadGltf(SCENERY.sign.model),
      loadGltf(SCENERY.railing.model),
      ...SCENERY.buildings.map((b) => loadGltf(b.model)),
    ]);
    this.assets = { road, buildings, lamp, sign, rail };
    await this.dress.load();
    if (SCENERY.landmark) {
      try {
        const hill = await loadGltf(SCENERY.landmark.model);
        this.landmark = place(hill, { height: SCENERY.landmark.height || 46, x: 0, z: 0 });
        this._hillScale = this.landmark.scale.x || 1;
        this._hillY = this.landmark.position.y + (SCENERY.landmark.lift || 0);
        this.landmark.traverse((o) => {
          if (o.isMesh) {
            o.frustumCulled = false;
            if (o.material) {
              o.material.fog = false;
              if (o.material.map) {
                o.material.map.anisotropy = 4;
                o.material.map.minFilter = THREE.LinearMipmapLinearFilter;
                o.material.map.magFilter = THREE.LinearFilter;
              }
            }
          }
        });
        this.group.add(this.landmark);
        const line = `[ASSET] OK     solangeles  height=${SCENERY.landmark.height}  dist=${SCENERY.landmark.distance}  fixed horizon (above skyline)`;
        this.worldLog.push(line);
        console.log(line);
      } catch (err) {
        const line = '[ASSET] FAILED solangeles  ' + String(err?.message || err);
        this.worldLog.push(line);
        console.error(line);
      }
    }
    this.ready = true;

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(28, 220), this.groundMat);
    this.ground.name = 'fill-ground';
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, -0.05, 60);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);

    this.beginRun(0);
  }

  /**
   * Full environment rebuild. Track is a singleton — leftover cursor / pruned
   * tiles from the last run must not leak into the next one (that was the
   * every-other-run empty-street bug).
   */
  beginRun(z0 = 0) {
    if (!this.group.parent && this.scene) this.scene.add(this.group);
    this.group.visible = true;
    this.horizonDir = 1;
    this._clearTiles();
    const origin = Math.floor(z0 / TILE);
    const i0 = origin - BEHIND;
    const i1 = origin + AHEAD;
    for (let i = i0; i < i1; i += 1) this._spawnTile(i * TILE);
    this.cursor = i1;
    if (this.ground) {
      this.ground.visible = true;
      this.ground.position.set(0, -0.05, z0 + 70);
    }
    this._logEnv(`beginRun z0=${z0.toFixed(1)}`);
  }

  _clearTiles() {
    for (const t of this.tiles) {
      this.group.remove(t);
    }
    this.tiles = [];
  }

  _logEnv(tag) {
    let roads = 0;
    let buildings = 0;
    let trees = 0;
    let rails = 0;
    let marks = 0;
    let attached = 0;
    for (const t of this.tiles) {
      if (t.parent === this.group) attached += 1;
      t.traverse((o) => {
        const n = `${o.name || ''} ${o.material?.name || ''}`.toLowerCase();
        if (o.name === 'lane-markings') marks += 1;
        if (n.includes('road') || n.includes('asphalt')) roads += 1;
        if (n.includes('tree') || n.includes('pine')) trees += 1;
        if (n.includes('rail')) rails += 1;
        if (Math.abs(o.position?.x || 0) > 8.4 && Math.abs(o.position.x) < 10.2 && o.parent === t) {
          buildings += 1;
        }
      });
    }
    const line =
      `[track] ${tag} tiles=${this.tiles.length} attached=${attached} ` +
      `roads=${roads} buildings=${buildings} trees=${trees} rails=${rails} marks=${marks} ` +
      `cursor=${this.cursor} group=${this.group.parent ? 'in-scene' : 'DETACHED'} ` +
      `vis=${this.group.visible}`;
    this.worldLog.push(line);
    console.log(line);
    if (attached < 3 || roads < 1) {
      console.error('[track] ENVIRONMENT MISSING', { attached, roads, tiles: this.tiles.length });
    }
  }

  setTheme(theme) {
    if (!theme) return;
    this.walkMat.color.setHex(theme.sidewalk);
    this.curbMat.color.setHex(theme.curb || 0x6e6a78);
    this.planterMat.color.setHex(theme.planter || 0x1c2a22);
    this.groundMat.color.setHex(theme.sidewalk || 0x6e6a7c);
    this.groundMat.color.multiplyScalar(0.82);
    this.accentMat.color.setHex(0x14f195);
    this.accentMat.emissive.setHex(0x14f195);
    this.accentMat.emissiveIntensity = theme.rain ? 0.7 : 0.55;
    this.accentMatR.emissiveIntensity = theme.rain ? 0.7 : 0.55;
    if (theme.rain) {
      this.walkMat.roughness = 0.28;
      this.walkMat.metalness = 0.35;
    } else {
      this.walkMat.roughness = 0.92;
      this.walkMat.metalness = 0.08;
    }
  }

  _sidewalk(side, z0) {
    const s = side < 0 ? -1 : 1;
    const g = new THREE.Group();

    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, TILE), this.curbMat);
    curb.position.set(s * 3.72, 0.08, z0);
    curb.receiveShadow = true;
    g.add(curb);

    // One plaza from curb to the building line — no dark lot in between.
    const plaza = new THREE.Mesh(new THREE.BoxGeometry(4.85, 0.07, TILE), this.walkMat);
    plaza.position.set(s * 6.2, 0.035, z0);
    plaza.receiveShadow = true;
    g.add(plaza);

    const neon = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.045, TILE),
      s < 0 ? this.accentMat : this.accentMatR,
    );
    neon.position.set(s * 3.86, 0.15, z0);
    g.add(neon);

    const spill = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, TILE),
      s < 0 ? this.spillL : this.spillR,
    );
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(s * 6.25, 0.074, z0);
    g.add(spill);

    return g;
  }

  /** Spawn any missing tiles so [zMin, zMax] is covered. */
  ensureRange(zMin, zMax) {
    if (!this.ready) return;
    const i0 = Math.floor(zMin / TILE);
    const i1 = Math.ceil(zMax / TILE);
    const have = new Set(this.tiles.map((t) => Math.round(t.userData.z0 / TILE)));
    for (let i = i0; i <= i1; i += 1) {
      if (!have.has(i)) this._spawnTile(i * TILE);
    }
    this.cursor = Math.max(this.cursor, i1 + 1);
    if (this.ground) this.ground.position.z = (zMin + zMax) * 0.5;
  }

  pruneOutside(zMin, zMax) {
    this.tiles = this.tiles.filter((t) => {
      if (t.userData.z0 < zMin || t.userData.z0 > zMax) {
        this.group.remove(t);
        return false;
      }
      return true;
    });
  }

  prepareMenu() {
    this.horizonDir = -1;
    if (!this.group.parent && this.scene) this.scene.add(this.group);
    this.group.visible = true;
    this._clearTiles();
    this.cursor = -12;
    this.ensureRange(-12 * TILE, 3 * TILE);
    this._logEnv('prepareMenu');
  }

  setHorizonDir(dir) {
    this.horizonDir = dir < 0 ? -1 : 1;
  }

  /** Fixed far backdrop — not recycled with tiles. Always centered on the horizon. */
  updateHorizon(cam) {
    if (!this.landmark || !this._hillScale) return;
    this.landmark.scale.set(this._hillScale, this._hillScale, this._hillScale);
    const dist = SCENERY.landmark?.distance || 155;
    this.landmark.position.set(cam.position.x * 0.02, this._hillY, cam.position.z + this.horizonDir * dist);
    // Sign faces -Z by default. Game looks +Z at a hill ahead → yaw 180 so letters read LTR.
    this.landmark.rotation.y = this.horizonDir > 0 ? Math.PI : 0;
  }

  _spawnTile(z0) {
    const g = new THREE.Group();
    g.name = `tile:${z0}`;
    g.userData.z0 = z0;
    const road = place(this.assets.road, { z: z0, height: null });
    road.name = 'road';
    hideStockRoadPaint(road);
    g.add(road);
    g.add(this._laneMarkings(z0));

    g.add(this._sidewalk(-1, z0));
    g.add(this._sidewalk(1, z0));
    decorateStrip(g, z0, this.dress);
    this._packBlock(g, z0, -1);
    this._packBlock(g, z0, 1);

    g.add(place(this.assets.rail, { x: -3.7, z: z0, height: 1.2 }));
    g.add(place(this.assets.rail, { x: 3.7, z: z0, height: 1.2 }));

    g.add(place(this.assets.lamp, { x: -4.4, z: z0 - 4, height: 3.4, yaw: Math.PI }));
    g.add(place(this.assets.lamp, { x: 4.4, z: z0 + 4, height: 3.4, yaw: Math.PI }));
    if (Math.abs(z0 / TILE) % 2 === 0) {
      g.add(place(this.assets.sign, { x: -5.4, z: z0 + 5, yaw: Math.PI / 2, height: 2.2 }));
    } else {
      g.add(place(this.assets.sign, { x: 5.4, z: z0 - 5, yaw: -Math.PI / 2, height: 2.2 }));
    }

    this.group.add(g);
    this.tiles.push(g);
  }

  /**
   * White paint as its own meshes: solid shoulders + dashed lane
   * dividers. 1.6cm above the deck, mild polygonOffset, depth on.
   */
  _laneMarkings(z0) {
    const g = new THREE.Group();
    g.name = 'lane-markings';
    const add = (geo, x, z) => {
      const m = new THREE.Mesh(geo, this.lineMat);
      m.position.set(x, LINE_Y, z);
      m.receiveShadow = true;
      m.castShadow = false;
      m.renderOrder = 1;
      m.frustumCulled = false;
      g.add(m);
    };
    add(this.edgeGeo, -EDGE_X, z0);
    add(this.edgeGeo, EDGE_X, z0);
    const zMin = z0 - TILE / 2;
    const zMax = z0 + TILE / 2;
    const first = Math.ceil((zMin + DASH_LEN * 0.5) / DASH_PERIOD) * DASH_PERIOD;
    for (const x of [-LANE_SPACING * 0.5, LANE_SPACING * 0.5]) {
      for (let z = first; z + DASH_LEN * 0.5 <= zMax + 0.02; z += DASH_PERIOD) {
        add(this.dashGeo, x, z);
      }
    }
    return g;
  }

  /** Shoulder-to-shoulder side wall. Never in the center sightline. */
  _packBlock(tile, z0, side) {
    const nB = this.assets.buildings.length || 1;
    const s = side < 0 ? -1 : 1;
    const yaw = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    const slots = 3;
    const span = TILE / slots;
    for (let i = 0; i < slots; i += 1) {
      const idx = Math.abs(Math.floor(z0 / TILE) * slots + i + (s < 0 ? 0 : 2)) % nB;
      const gltf = this.assets.buildings[idx];
      const u = hash(z0 * 1.7 + i * 9.1 + s * 4.3);
      const h = 6.1 + u * 4.4 + (idx % 3) * 0.35;
      const z = z0 - TILE / 2 + span * 0.5 + i * span + (u - 0.5) * 0.12;
      // After yaw, width = toward-road depth, length = along the street.
      // Keep depth shallow so the footprint stays off the curb/cars.
      tile.add(place(gltf, { x: s * 9.15, z, yaw, height: h, width: 3.2, length: span + 0.2 }));
    }
  }

  update(playerZ) {
    if (!this.ready) return;
    if (this.ground) this.ground.position.z = playerZ + 70;
    const here = Math.floor(playerZ / TILE);
    const covering = this.tiles.some(
      (t) => t.parent === this.group && Math.round(t.userData.z0 / TILE) === here,
    );
    if (!covering) {
      console.warn(`[track] no tile under player z=${playerZ.toFixed(1)} — rebuild`);
      this.beginRun(playerZ);
      return;
    }
    const need = Math.floor(playerZ / TILE) + AHEAD;
    while (this.cursor <= need) {
      this._spawnTile(this.cursor * TILE);
      this.cursor += 1;
    }
    const cut = playerZ - BEHIND * TILE - TILE;
    this.tiles = this.tiles.filter((t) => {
      if (t.userData.z0 < cut) {
        this.group.remove(t);
        return false;
      }
      return true;
    });
  }
}
