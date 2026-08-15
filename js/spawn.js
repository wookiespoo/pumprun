import * as THREE from 'three';
import { loadGltf, mountModel } from './roster.js?v=16';
import { OBSTACLES, PICKUPS, POWERS, RAMP, ITEM_FILES, DOJI_STEP, DOJI_GRAB, DOJI_GRAB_BODY, MAGNET_RADIUS, MAGNET_AHEAD, laneWorldX } from './catalog.js?v=66';
import { DojiPool, tickDoji, startDojiPop } from './doji.js?v=51';
import { speedAtDistance } from './runner.js?v=69';

const TRAIL_Y = 1.02; // waist/chest — bag bottom, sits clearly above the road

/** Gap / density knobs. Time-based so faster = wider meters, never less react time. */
export const SPAWN = {
  FIRST_Z: 14,
  REACT_START: 0.84,
  REACT_END: 0.62,
  REACT_TAU: 420,
  MIN_GAP: 5.6,
  TIGHT_AFTER: 55,
  TIGHT_CHANCE: 0.68,
  TIGHT_REACT: 0.55,
  DOJI_STEP: 0.72,
};

console.log(
  `[spawn] was FIRST=28 react 2.05s→1.05s minGap=11 tight@180 | now FIRST=${SPAWN.FIRST_Z} react ${SPAWN.REACT_START}s→${SPAWN.REACT_END}s minGap=${SPAWN.MIN_GAP} tight@${SPAWN.TIGHT_AFTER} doji=${SPAWN.DOJI_STEP}`,
);

export class Spawner {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rows = [];
    this.nextZ = SPAWN.FIRST_Z;
    this.nextPowerZ = 90;
    this.lastTrailZ = 8;
    this.guideLane = 0;
    this.gltfs = {};
    this.ready = false;
    this.spawnedDojis = 0;
    this.collectedDojis = 0;
    this._blockers = [];
    this.pool = new DojiPool();
    this._time = 0;
    this._busAlt = 0;
    this._cycle = 0;
    this._nextTight = false;
    this.assetLog = [];
    this.placeLog = [];
    this._placeN = 0;
  }

  async load() {
    const origin = typeof location !== 'undefined' ? location.origin : '';
    console.log('[ASSET] ——— item GLBs ———');
    for (const item of ITEM_FILES) {
      const resolved = origin ? `${origin}/${item.path}` : item.path;
      let fetchOk = false;
      let bytes = 0;
      let fetchErr = '';
      try {
        const res = await fetch(item.path);
        fetchOk = res.ok;
        bytes = Number(res.headers.get('content-length')) || 0;
        if (!res.ok) fetchErr = `HTTP ${res.status}`;
      } catch (err) {
        fetchErr = String(err?.message || err);
      }
      let gltfOk = false;
      let gltfErr = '';
      if (fetchOk) {
        try {
          this.gltfs[item.id] = await loadGltf(item.path);
          gltfOk = !!this.gltfs[item.id];
        } catch (err) {
          gltfErr = String(err?.message || err);
          console.error(`[ASSET] FAILED parse ${item.source} ${resolved}`, err);
        }
      } else {
        console.error(`[ASSET] FAILED fetch ${item.source} ${resolved} ${fetchErr}`);
      }
      const status = fetchOk && gltfOk ? 'OK' : 'FAILED';
      const line = `[ASSET] ${status.padEnd(6)} ${item.source.padEnd(24)} ${resolved}  ${bytes}b${gltfErr ? ' ' + gltfErr : ''}${fetchErr && !fetchOk ? ' ' + fetchErr : ''}`;
      this.assetLog.push(line);
      console.log(line);
      if (item.id === 'hurdle' || item.role === 'jump') {
        console.log(
          `[JUMP]  file=${item.path}  source=${item.source}  ` +
            `raw=Meshy_AI_metal_warning_barrier_0814045157_image-to-3d-texture.glb  ` +
            `(yellow-black BIG hurdle — jump over, NOT blue)`,
        );
      }
      if (item.id === 'gantry' || item.role === 'slide') {
        console.log(
          `[SLIDE] file=${item.path}  source=${item.source}  ` +
            `(steel overhead gantry — slide under, NOT gradient_gate_tall / no blue arches)`,
        );
      }
    }
    this._measureSpecs();
    this.ready = true;
    const jump = ITEM_FILES.find((i) => i.role === 'jump');
    const slide = ITEM_FILES.find((i) => i.role === 'slide');
    console.log(
      `[OBSTACLES] JUMP=${jump?.path} (${jump?.source})  SLIDE=${slide?.path} (${slide?.source})  ` +
        `blue=NONE (gate_narrow/gate_tall not loaded)`,
    );
    console.log('[ASSET] ——— end ———  parked buses common, ramp-ride rare');
  }

  _fitOpts(spec) {
    return {
      targetHeight: spec.height,
      targetWidth: spec.width || 0,
      yaw: spec.yaw ?? 0,
    };
  }

  _measureSpecs() {
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    for (const spec of OBSTACLES) {
      const gltf = this.gltfs[spec.id];
      if (!gltf) continue;
      const probe = mountModel(gltf, this._fitOpts(spec));
      box.setFromObject(probe.root);
      box.getSize(size);
      spec.halfW = size.x * 0.5;
      spec.halfL = size.z * 0.5;
      spec.roofY = size.y * 0.96;
      console.log(`[spawn] ${spec.id} ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)} halfL=${spec.halfL.toFixed(2)}`);
    }
    if (this.gltfs.ramp) {
      const roof = OBSTACLES.find((o) => o.clear === 'ramp')?.roofY || 1.7;
      const probe = mountModel(this.gltfs.ramp, {
        targetHeight: roof,
        targetLength: RAMP.length,
        targetWidth: RAMP.width,
        yaw: RAMP.yaw,
      });
      box.setFromObject(probe.root);
      box.getSize(size);
      for (const spec of OBSTACLES) {
        if (spec.clear === 'ramp') spec.rampLen = size.z;
      }
      console.log(`[spawn] ramp ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)} len=${size.z.toFixed(2)}`);
    }
  }

  reset() {
    for (const r of this.rows) {
      for (const it of r.items) {
        if (it.kind === 'doji') this.pool.release(it.root);
      }
      this.group.remove(r.group);
    }
    this.rows = [];
    this._blockers = [];
    this.nextZ = SPAWN.FIRST_Z;
    this.nextPowerZ = 90;
    this.lastTrailZ = 8;
    this.guideLane = 0;
    this.spawnedDojis = 0;
    this.collectedDojis = 0;
    this._busAlt = 0;
    this._cycle = 0;
    this._nextTight = false;
    this.placeLog = [];
    this._placeN = 0;
  }

  surfaceAt(x, z) {
    for (const b of this._blockers) {
      if (b.clear !== 'ramp') continue;
      // Stay inside this bus's footprint so a gap between two buses
      // does not snap you onto a neighbor's roof.
      if (Math.abs(x - laneWorldX(b.lane)) > b.halfW + 0.22) continue;
      const rampLen = b.rampLen || 3.5;
      const rampStart = b.z - b.halfL - rampLen;
      const rampEnd = b.z - b.halfL;
      const roofEnd = b.z + b.halfL;
      const roofY = b.roofY || 1.82;
      // Short lead-in so the first frame of contact already mounts.
      if (z >= rampStart - 0.45 && z < rampStart) {
        return { y: 0, endZ: roofEnd, kind: 'approach' };
      }
      if (z >= rampStart && z <= rampEnd) {
        const t = (z - rampStart) / rampLen;
        return { y: t * roofY, endZ: roofEnd, kind: 'ramp' };
      }
      if (z > rampEnd && z <= roofEnd + 0.2) {
        return { y: roofY, endZ: roofEnd, kind: 'roof' };
      }
    }
    return null;
  }

  update(dt, runner) {
    if (!this.ready || !runner.alive) return null;
    this._time += dt;
    const dist = runner.distance;
    while (this.nextZ < runner.z + 95) {
      const spd = speedAtDistance(this.nextZ);
      const longEase = 1 - Math.exp(-this.nextZ / SPAWN.REACT_TAU);
      const react = THREE.MathUtils.lerp(SPAWN.REACT_START, SPAWN.REACT_END, longEase);
      const baseGap = Math.max(SPAWN.MIN_GAP, spd * react);
      const spec = this._pickSpec(dist);
      if (!spec) {
        this._spawnOpenTrail(this.nextZ, baseGap);
        this.nextZ += baseGap;
        continue;
      }
      const allowTight = dist > SPAWN.TIGHT_AFTER && spec.variant === 'parked' && Math.random() < SPAWN.TIGHT_CHANCE;
      const minReact = Math.max(spd * SPAWN.TIGHT_REACT, spec.halfL * 2 + 2.2);
      const gap = this._nextTight ? minReact : baseGap;
      this._nextTight = false;
      this._spawnSegment(this.nextZ, gap, spec, dist);
      if (allowTight) this._nextTight = true;
      this.nextZ += gap;
    }
    while (this.nextPowerZ < runner.z + 95) {
      this._spawnPower(this.nextPowerZ);
      this.nextPowerZ += 150 + Math.random() * 100;
    }
    this.rows = this.rows.filter((r) => {
      if (r.z < runner.z - 16) {
        for (const it of r.items) {
          if (it.kind === 'doji') this.pool.release(it.root);
        }
        this.group.remove(r.group);
        return false;
      }
      return true;
    });
    this._blockers = this._blockers.filter((b) => b.z > runner.z - 16);

    let hit = null;
    let coins = 0;
    let bags = 0;
    let power = null;
    let near = false;
    const magnet = runner.powers.magnet > 0;
    const mult = runner.powers.double > 0 ? 2 : 1;

    for (const row of this.rows) {
      for (const item of row.items) {
        if (item.dead) continue;
        if (item.kind === 'doji') {
          if (magnet && !item.popping) {
            const mdx = item.x - runner.x;
            const mdz = item.z - runner.z;
            if (Math.abs(mdx) < MAGNET_RADIUS && mdz > -0.35 && mdz < MAGNET_AHEAD) {
              const k = 1 - Math.exp(-16 * dt);
              const magnetZ = runner.z + 0.85;
              item.root.position.x += (runner.x - item.x) * k;
              item.root.position.z += (magnetZ - item.z) * k;
              item.root.position.y += (TRAIL_Y - item.root.position.y) * k * 0.65;
              item.x = item.root.position.x;
              item.z = item.root.position.z;
            }
          }
          tickDoji(item, dt, this._time);
          if (!item.popping && this._canGrabDoji(runner, item, magnet)) {
            startDojiPop(item);
            coins += PICKUPS.doji.score * mult;
            this.collectedDojis += 1;
            bags += 1;
            if (this.collectedDojis % 5 === 1) {
              console.log(`[doji] collect=${this.collectedDojis} spawned=${this.spawnedDojis}`);
            }
          }
          continue;
        }
        if (item.kind === 'power') {
          item.root.rotation.y += dt * 2.4;
          item.root.position.y = 1.05 + Math.sin(performance.now() * 0.004) * 0.12;
          if (this._overlap(runner, item, 0.95)) {
            item.dead = true;
            item.root.visible = false;
            power = item.power;
            console.log('[spawn] collected power-up', power.id);
          }
          continue;
        }
        const crash = this._hitsObstacle(runner, item);
        if (crash) {
          console.log(
            `[HIT] type=${item.spec.clear}/${item.spec.variant || item.spec.id} id=${item.spec.id} y=${runner.y.toFixed(2)} top=${(item.topY ?? item.spec.height).toFixed(2)} dx=${Math.abs(runner.x - item.x).toFixed(2)} dz=${Math.abs(runner.z - item.z).toFixed(2)} grounded=${runner.grounded} sliding=${runner.sliding}`,
          );
          item.dead = true;
          if (item.root) item.root.visible = false;
          for (const b of this._blockers) {
            if (b.lane === item.lane && Math.abs(b.z - item.z) < 0.35) b.dead = true;
          }
          if (runner.powers.shield > 0) {
            runner.powers.shield = 0;
            runner.powerMax.shield = 0;
            near = true;
            console.log('[spawn] shield ate a hit');
          } else {
            hit = item;
          }
        }
      }
    }
    return { hit, coins, bags, collected: this.collectedDojis, power, near };
  }

  /** Solid hit for the chasing cop — buses, hurdles, arches in his lane. */
  hitsCop(x, z) {
    return this.hitsCopSwept(x, z, z);
  }

  /**
   * Swept test from z0 → z1 so a fast chase can't skip a thin hurdle.
   * Returns the nearest blocker the cop would run into, with `face`/`back`.
   */
  hitsCopSwept(x, z0, z1, skipZ = null) {
    const zLo = Math.min(z0, z1);
    const zHi = Math.max(z0, z1);
    let best = null;
    for (const b of this._blockers) {
      if (b.dead) continue;
      if (skipZ != null && b.z === skipZ) continue;
      const halfL = Math.max(0.22, b.halfL || 1.2);
      const face = b.z - halfL;
      const back = b.z + halfL;
      if (zHi < face - 0.12 || zLo > back + 0.12) continue;
      if (Math.abs(x - laneWorldX(b.lane)) > (b.halfW || 0.7) + 0.42) continue;
      if (!best || face < best.face) best = { ...b, face, back };
    }
    return best;
  }

  _spawnSegment(obsZ, gap, spec, dist = 0) {
    const blocked = this._pickBlockedLanes(dist);
    const safe = [-1, 0, 1].filter((l) => !blocked.has(l));
    const prevLane = this.guideLane;
    this.guideLane = safe.includes(prevLane) ? prevLane : safe[0];

    const group = new THREE.Group();
    const items = [];

    for (const lane of blocked) {
      const root = this._makeObstacle(spec);
      root.position.x = laneWorldX(lane);
      root.position.z = obsZ;
      root.position.y = 0;
      group.add(root);
      items.push({
        kind: 'obs',
        spec,
        lane,
        z: obsZ,
        x: laneWorldX(lane),
        root,
        dead: false,
        topY: spec.height,
        halfW: spec.halfW,
        halfL: spec.halfL,
      });
      this._blockers.push({
        lane,
        z: obsZ,
        halfL: spec.halfL,
        halfW: spec.halfW,
        clear: spec.clear,
        rampLen: spec.rampLen,
        roofY: spec.roofY,
        dead: false,
      });
    }

    const approach = Math.max(this.lastTrailZ, obsZ - gap + 0.5);
    const before =
      spec.clear === 'ramp' ? obsZ - spec.halfL - (spec.rampLen || 2.25) - 0.4 : obsZ - spec.halfL - 0.8;
    const after = obsZ + spec.halfL + 1.0;

    if (before > approach) {
      if (this.guideLane !== prevLane) {
        this._trailCurve(group, items, approach, before, prevLane, this.guideLane);
      } else {
        this._trailLine(group, items, approach, before, this.guideLane, TRAIL_Y);
      }
      for (const lane of safe) {
        if (lane === this.guideLane) continue;
        this._trailLine(group, items, approach, before, lane, TRAIL_Y);
      }
    }

    if (spec.clear === 'jump') {
      for (const lane of blocked) {
        this._trailArc(group, items, obsZ - 3.2, obsZ + 3.2, lane);
      }
      this._trailLine(group, items, before, after, this.guideLane, TRAIL_Y);
    } else if (spec.clear === 'slide') {
      for (const lane of blocked) {
        this._trailLine(group, items, obsZ - 3.0, obsZ + 3.0, lane, 0.4);
      }
      this._trailLine(group, items, before, after, this.guideLane, TRAIL_Y);
    } else if (spec.clear === 'ramp') {
      for (const lane of blocked) {
        this._trailRampRoof(group, items, obsZ, spec, lane);
      }
      this._trailLine(group, items, before, after, this.guideLane, TRAIL_Y);
    } else {
      // Parked bus / default: coins stay in the open lane.
      this._trailLine(group, items, before, after, this.guideLane, TRAIL_Y);
    }

    this.lastTrailZ = Math.max(this.lastTrailZ, after);
    this.group.add(group);
    this.rows.push({ z: obsZ, group, items });
    this._placeN += 1;
    const busName = spec.id === 'bus_degen' ? 'degens_elementary_bus' : spec.id === 'bus_trench' ? 'trenches_city_bus' : spec.id;
    const source =
      spec.variant === 'ramp'
        ? `${busName} + crystal_ramp`
        : spec.variant === 'parked'
          ? `${busName} (parked)`
          : spec.id === 'hurdle'
            ? 'metal_warning_barrier'
            : spec.id === 'car'
              ? 'lowpoly_car'
            : spec.id === 'gantry'
              ? 'gantry'
              : spec.id;
    const kind = spec.id === 'car' ? 'CAR' : spec.id === 'hurdle' ? 'HURDLE' : spec.id === 'gantry' ? 'SLIDE' : spec.variant === 'parked' ? 'PARKED' : spec.clear === 'ramp' ? 'RIDE' : spec.clear.toUpperCase();
    const line = `[PLACE] #${this._placeN} ${kind} ${source}  model=${spec.model}  lanes=[${[...blocked].join(',')}] z=${obsZ.toFixed(0)}`;
    this.placeLog.push(line);
    console.log(line);
    if (spec.id === 'hurdle' || spec.clear === 'jump') {
      console.log(`[JUMP]  using ${spec.model}  source=metal_warning_barrier  height=${spec.height}`);
    }
    if (spec.id === 'gantry' || spec.clear === 'slide') {
      console.log(`[SLIDE] using ${spec.model}  source=gantry  hangMinY=${spec.hangMinY}  (not gate_tall.glb)`);
    }
  }

  _spawnOpenTrail(z0, gap) {
    const group = new THREE.Group();
    const items = [];
    const z1 = z0 + gap;
    this._trailLine(group, items, Math.max(this.lastTrailZ, z0), z1, this.guideLane, TRAIL_Y);
    this.lastTrailZ = Math.max(this.lastTrailZ, z1);
    this.group.add(group);
    this.rows.push({ z: z0, group, items });
  }

  _trailLine(group, items, z0, z1, lane, y) {
    let n = 0;
    for (let z = z0; z < z1; z += SPAWN.DOJI_STEP) {
      if (this._buried(lane, z)) continue;
      this._placeDoji(group, items, laneWorldX(lane), y, z, lane);
      n += 1;
    }
    if (n) console.log(`[doji] trail +${n} line lane=${lane} z=${z0.toFixed(0)}-${z1.toFixed(0)} spawned=${this.spawnedDojis}`);
  }

  _trailRampRoof(group, items, obsZ, spec, lane) {
    const rampLen = spec.rampLen || 3.5;
    const halfL = spec.halfL;
    const roofY = spec.roofY || 1.82;
    const z0 = obsZ - halfL - rampLen;
    const rampEnd = obsZ - halfL;
    const roofEnd = obsZ + halfL;
    const z1 = roofEnd + 1.6;
    let n = 0;
    for (let z = z0; z < z1; z += SPAWN.DOJI_STEP) {
      let y;
      if (z < rampEnd) {
        const t = (z - z0) / rampLen;
        y = 0.55 + Math.max(0, t) * roofY + 0.28;
      } else if (z <= roofEnd) {
        y = roofY + 0.38;
      } else {
        const t = (z - roofEnd) / 1.6;
        y = roofY + 0.38 - t * (roofY - 0.5);
      }
      this._placeDoji(group, items, laneWorldX(lane), y, z, lane);
      n += 1;
    }
    if (n) console.log(`[doji] trail +${n} ramp-roof lane=${lane} spawned=${this.spawnedDojis}`);
  }

  _trailArc(group, items, z0, z1, lane) {
    let n = 0;
    const span = Math.max(0.01, z1 - z0);
    for (let z = z0; z < z1; z += SPAWN.DOJI_STEP) {
      const t = (z - z0) / span;
      const y = TRAIL_Y + Math.sin(t * Math.PI) * 0.58;
      this._placeDoji(group, items, laneWorldX(lane), y, z, lane);
      n += 1;
    }
    if (n) console.log(`[doji] trail +${n} jump-arc lane=${lane} spawned=${this.spawnedDojis}`);
  }

  _trailCurve(group, items, z0, z1, fromLane, toLane) {
    let n = 0;
    const span = Math.max(0.01, z1 - z0);
    for (let z = z0; z < z1; z += SPAWN.DOJI_STEP) {
      const t = (z - z0) / span;
      const s = t * t * (3 - 2 * t);
      const x = THREE.MathUtils.lerp(laneWorldX(fromLane), laneWorldX(toLane), s);
      const lane = s < 0.5 ? fromLane : toLane;
      if (this._buried(lane, z)) continue;
      this._placeDoji(group, items, x, TRAIL_Y, z, lane);
      n += 1;
    }
    if (n) console.log(`[doji] trail +${n} curve ${fromLane}→${toLane} spawned=${this.spawnedDojis}`);
  }

  _placeDoji(group, items, x, y, z, lane) {
    const root = this.pool.acquire(this.gltfs.doji);
    root.position.set(x, y, z);
    group.add(root);
    items.push({
      kind: 'doji',
      lane,
      z,
      x,
      baseY: y,
      phase: z * 0.85 + x * 2.1,
      popping: false,
      pop: 0,
      root,
      dead: false,
    });
    this.spawnedDojis += 1;
  }

  _buried(lane, z) {
    for (const b of this._blockers) {
      if (b.lane !== lane) continue;
      if (b.clear === 'ramp') continue;
      if (b.clear === 'lane') {
        if (Math.abs(z - b.z) < b.halfL + 0.4) return true;
        continue;
      }
      if (Math.abs(z - b.z) < b.halfL + 0.3) return true;
    }
    return false;
  }

  _spawnPower(z) {
    const power = POWERS[(Math.random() * POWERS.length) | 0];
    const lane = this.guideLane;
    const group = new THREE.Group();
    const root = this._makePickup(power.id, power.height || 0.8, parseInt(power.color.slice(1), 16));
    root.position.set(laneWorldX(lane), 1.05, z);
    group.add(root);
    this.group.add(group);
    this.rows.push({
      z,
      group,
      items: [{ kind: 'power', power, lane, z, x: laneWorldX(lane), root, dead: false }],
    });
    console.log('[spawn] power-up', power.id, 'lane', lane, 'z', z.toFixed(1));
  }

  _makeObstacle(spec) {
    if (spec.kind === 'car') {
      if (!this.gltfs.car) {
        console.warn('[spawn] car GLB missing — placeholder');
        return this._placeholder(0x334455, spec.height);
      }
      const mounted = mountModel(this.gltfs.car, this._fitOpts(spec));
      return mounted.root;
    }
    if (spec.kind === 'bus' || spec.clear === 'ramp' || spec.clear === 'lane') return this._makeBusUnit(spec);
    if (!this.gltfs[spec.id]) {
      console.warn(`[spawn] ${spec.id} GLB missing — placeholder`);
      return this._placeholder(spec.clear === 'slide' ? 0x9945ff : 0xffcc33, spec.height);
    }
    const mounted = mountModel(this.gltfs[spec.id], this._fitOpts(spec));
    this._nightRead(mounted.root, spec.clear === 'slide' ? 0.28 : 0.18);
    return mounted.root;
  }

  _makeBusUnit(spec) {
    const ride = spec.clear === 'ramp';
    const pack = new THREE.Group();
    pack.name = ride ? `bus+ramp:${spec.id}` : `bus:${spec.id}`;
    if (!this.gltfs[spec.id]) {
      console.error(`[spawn] bus GLB missing (${spec.id}) path=${spec.model}`);
      pack.add(this._placeholder(0xffaa33, spec.height));
    } else {
      const bus = mountModel(this.gltfs[spec.id], this._fitOpts(spec));
      this._nightRead(bus.root, 0.38);
      pack.add(bus.root);
    }
    if (ride) {
      if (!this.gltfs.ramp) {
        console.error('[spawn] ramp GLB missing — ride bus has no on-ramp');
      } else {
        const ramp = mountModel(this.gltfs.ramp, {
          targetHeight: spec.roofY || spec.height,
          targetLength: spec.rampLen || RAMP.length,
          targetWidth: RAMP.width,
          yaw: RAMP.yaw,
        });
        const box = new THREE.Box3().setFromObject(ramp.root);
        ramp.root.position.z = -spec.halfL - box.max.z + 0.04;
        pack.add(ramp.root);
      }
    }
    return pack;
  }

  _nightRead(root, lift = 0.15) {
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const m = o.material;
      if (!m.emissive) return;
      if (m.emissive.getHex() === 0) {
        m.emissive = new THREE.Color(0x3a3228);
        m.emissiveIntensity = lift;
      } else {
        m.emissiveIntensity = Math.min(0.55, (m.emissiveIntensity || 0.2) + 0.05);
      }
    });
  }

  _hitsObstacle(runner, item) {
    const spec = item.spec;
    const dx = Math.abs(runner.x - item.x);
    const dz = Math.abs(runner.z - item.z);
    const pad = 0.1; // near-miss forgiveness
    const halfW = Math.max(0.22, (item.halfW ?? spec.halfW) - pad);
    const halfL = Math.max(0.12, (item.halfL ?? spec.halfL) - pad);
    const topY = item.topY ?? spec.height;
    const head = runner.y + runner.colliderHeight();

    if (spec.clear === 'ramp') {
      if (runner.onTop) return false;
      if (this.surfaceAt(runner.x, runner.z)) return false;
      if (dx > halfW + runner.radius * 0.7) return false;
      const bodyFront = item.z - spec.halfL + 0.15;
      const bodyBack = item.z + spec.halfL - 0.08;
      if (runner.z < bodyFront || runner.z > bodyBack) return false;
      return runner.y < (spec.roofY || topY) - 0.4;
    }

    if (spec.clear === 'lane') {
      if (dx > halfW + runner.radius * 0.65) return false;
      if (dz > halfL) return false;
      // Parked buses/cars: jump does NOT clear them. Ramp-ride uses onTop / surfaceAt.
      if (runner.onTop) return false;
      return true;
    }

    if (spec.clear === 'jump') {
      if (dx > halfW + runner.radius * 0.55) return false;
      if (dz > halfL + 0.02) return false;
      // Only a real hop over the bar — any-airborne used to clear buses too.
      if (runner.y >= topY - 0.08) return false;
      return true;
    }

    if (spec.clear === 'slide') {
      if (dx > halfW + runner.radius * 0.4) return false;
      if (dz > halfL + 0.06) return false;
      // Slide pose ducks under the lintel. A normal jump cannot clear 2.4m.
      if (runner.sliding) return false;
      const gap = spec.hangMinY ?? 1.12;
      const bodyTop = runner.y + (runner.colliderHeight?.() ?? head);
      if (bodyTop < gap) return false;
      if (runner.y >= topY - 0.06) return false;
      return true;
    }

    if (dx > halfW + runner.radius) return false;
    if (dz > halfL) return false;
    return true;
  }

  _makePickup(id, height, color) {
    if (this.gltfs[id]) {
      return mountModel(this.gltfs[id], { targetHeight: height, yaw: 0 }).root;
    }
    return this._placeholder(color, height);
  }

  _placeholder(color, height) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(height * 0.38, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 }),
    );
    mesh.position.y = height * 0.4;
    g.add(mesh);
    const light = new THREE.PointLight(color, 2.2, 5, 2);
    light.position.y = height * 0.5;
    g.add(light);
    return g;
  }

  _pickSpec(dist = 0) {
    // Always a real obstacle. Mix unlocks with distance — more hurdles/gantries/buses.
    let order;
    if (dist < 35) order = ['jump', 'parked', 'car', 'hurdle', 'slide'];
    else if (dist < 90) order = ['parked', 'hurdle', 'slide', 'car', 'jump', 'parked', 'hurdle'];
    else order = ['hurdle', 'parked', 'slide', 'car', 'jump', 'ramp', 'parked', 'hurdle', 'slide'];
    const kind = order[this._cycle % order.length];
    this._cycle += 1;
    if (kind === 'empty') return null;
    if (kind === 'jump' || kind === 'hurdle') return { ...OBSTACLES.find((o) => o.id === 'hurdle') };
    if (kind === 'slide') return { ...OBSTACLES.find((o) => o.clear === 'slide') };
    if (kind === 'car') return { ...OBSTACLES.find((o) => o.id === 'car'), variant: 'parked' };
    const buses = OBSTACLES.filter((o) => o.kind === 'bus');
    const base = buses[this._busAlt++ % buses.length];
    if (kind === 'ramp') return { ...base, clear: 'ramp', variant: 'ramp' };
    return { ...base, clear: 'lane', variant: 'parked' };
  }

  _pickBlockedLanes(dist = 0) {
    // Always leave one open lane. Two-lane packs show up earlier and more often.
    const twoLane = dist > 50 && Math.random() < (dist > 160 ? 0.66 : 0.48);
    const n = twoLane ? 2 : 1;
    const lanes = [-1, 0, 1];
    const blocked = new Set();
    while (blocked.size < n) blocked.add(lanes[(Math.random() * 3) | 0]);
    return blocked;
  }

  _overlap(runner, item, pad) {
    return Math.hypot(runner.x - item.x, runner.z - item.z) < pad;
  }

  /**
   * Collect slightly IN FRONT of the runner so the bag pops before it
   * reaches the body (never clips through the back). Jumping above a bag
   * still misses it. Magnet vacuums to a point ahead of the chest.
   */
  _canGrabDoji(runner, item, magnet) {
    const dx = runner.x - item.x;
    const bagBot = item.root?.position?.y ?? item.baseY ?? 0;
    const bagTop = bagBot + (PICKUPS.doji.height || 0.33);

    if (magnet) {
      const mdx = item.x - runner.x;
      const mdz = item.z - runner.z;
      if (Math.abs(mdx) > MAGNET_RADIUS || mdz < -0.35 || mdz > MAGNET_AHEAD) return false;
      const magnetZ = runner.z + 0.85;
      return Math.hypot(dx, item.z - magnetZ) < 0.7;
    }

    if (runner.y > bagTop + 0.06) return false;
    const reach = (runner.height || 1.78) * 0.9;
    if (runner.y + reach < bagBot - 0.04) return false;
    if (Math.abs(dx) > 0.62) return false;

    const traveled = Math.max(0.16, (runner.speed || 8) * 0.05);
    const lo = runner.z + DOJI_GRAB_BODY;
    const hi = runner.z + DOJI_GRAB + traveled;
    return item.z > lo && item.z <= hi;
  }
}
