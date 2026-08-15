import * as THREE from 'three';


/** Prefer idle / search (creep) / groovy over a run cycle on the menu. */
export function pickIdleClip(clips) {
  return resolveClip(clips, ['idle', 'search', 'groovy']);
}

export function resolveClip(clips, names) {
  if (!clips) return null;
  const keys = Object.keys(clips);
  for (const name of names) {
    if (clips[name]) return clips[name];
    const hit = keys.find(
      (k) => k.toLowerCase() === name.toLowerCase() || k.toLowerCase().includes(name.toLowerCase()),
    );
    if (hit) return clips[hit];
  }
  return null;
}

/**
 * Calm menu loop. Real idle/search/groovy if present; otherwise a very
 * slow, low-weight walk plus a procedural breath so nobody marches or T-poses.
 */
export function playMenuIdle(mounted, { role = 'cop' } = {}) {
  const mixer = new THREE.AnimationMixer(mounted.model);
  const realIdle =
    role === 'cop'
      ? resolveClip(mounted.clips, ['search', 'idle', 'groovy', 'walk'])
      : resolveClip(mounted.clips, ['idle', 'search', 'groovy']);
  const walk = resolveClip(mounted.clips, ['walk']);
  let action = null;
  let kind = 'breath';
  if (realIdle) {
    action = mixer.clipAction(realIdle);
    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.setEffectiveWeight(1);
    action.timeScale = role === 'cop' ? 0.95 : 0.85;
    action.time = Math.random() * Math.max(0.1, realIdle.duration || 1);
    action.play();
    kind = realIdle.name || 'idle';
  } else if (walk) {
    action = mixer.clipAction(walk);
    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.setEffectiveWeight(0.26);
    action.timeScale = 0.13;
    action.time = Math.random() * Math.max(0.1, walk.duration || 1);
    action.play();
    kind = 'slow-walk';
  }
  return {
    mixer,
    action,
    kind,
    phase: Math.random() * Math.PI * 2,
    rate: 1.25 + Math.random() * 0.4,
    baseY: 0,
  };
}

export function tickMenuIdle(entry, dt, t) {
  if (!entry) return;
  entry.mixer?.update(dt);
  if (!entry.root) return;
  const breath = Math.sin(t * (entry.rate || 1.4) + (entry.phase || 0));
  const y0 = entry.baseY || 0;
  entry.root.position.y = y0 + breath * 0.014;
  if (entry.kind === 'slow-walk' || entry.kind === 'breath') {
    entry.root.rotation.z = breath * 0.018;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const COP_RED = '#ff4d6d';

function fitName(ctx, name, maxW) {
  const label = String(name || '').toUpperCase();
  const font = (s) => `800 ${s}px "Pricedown", "Pricedown Bl", Impact, sans-serif`;
  let size = 96;
  ctx.font = font(size);
  while (size > 56 && ctx.measureText(label).width > maxW) {
    size -= 2;
    ctx.font = font(size);
  }
  if (ctx.measureText(label).width <= maxW) return { lines: [label], size };
  const cut = label.lastIndexOf(' ');
  if (cut > 0) {
    const lines = [label.slice(0, cut), label.slice(cut + 1)];
    size = 72;
    while (size > 50) {
      ctx.font = font(size);
      if (Math.max(...lines.map((l) => ctx.measureText(l).width)) <= maxW) break;
      size -= 2;
    }
    return { lines, size };
  }
  return { lines: [label], size };
}

export function makeWantedPlate(name, caption, { y = 2.55 } = {}) {
  const w = 1400;
  const h = 340;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  const pad = 52;
  const boxX = pad;
  const boxY = 26;
  const boxW = w - pad * 2;
  const boxH = h - 52;

  ctx.save();
  ctx.shadowColor = 'rgba(245,197,66,0.7)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#08060c';
  roundRect(ctx, boxX, boxY, boxW, boxH, 16);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#08060c';
  roundRect(ctx, boxX, boxY, boxW, boxH, 16);
  ctx.fill();

  ctx.strokeStyle = '#f5c542';
  ctx.lineWidth = 14;
  ctx.stroke();
  ctx.strokeStyle = '#8a6a14';
  ctx.lineWidth = 4;
  roundRect(ctx, boxX + 16, boxY + 16, boxW - 32, boxH - 32, 10);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f5c542';
  ctx.font = 'italic 800 36px "Pricedown", Impact, sans-serif';
  ctx.fillText('MOST FEARED', w / 2, boxY + 58);

  const fitted = fitName(ctx, name, boxW - 100);
  ctx.font = `800 ${fitted.size}px "Pricedown", "Pricedown Bl", Impact, sans-serif`;
  const nameTop = boxY + (fitted.lines.length > 1 ? 138 : 158);
  fitted.lines.forEach((line, i) => {
    const ty = nameTop + i * (fitted.size * 0.95);
    ctx.save();
    ctx.shadowColor = 'rgba(255,77,109,0.95)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = COP_RED;
    ctx.fillText(line, w / 2, ty);
    ctx.restore();
    ctx.fillStyle = COP_RED;
    ctx.fillText(line, w / 2, ty);
  });

  ctx.fillStyle = '#d4c4f0';
  ctx.font = '600 28px "Pricedown", Impact, sans-serif';
  const capY = nameTop + fitted.lines.length * (fitted.size * 0.95) + 18;
  ctx.fillText(caption || '', w / 2, Math.min(capY, boxY + boxH - 28));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const worldW = 1.32;
  spr.scale.set(worldW, worldW * (h / w), 1);
  spr.renderOrder = 12;
  spr.center.set(0.5, 0.12);

  const group = new THREE.Group();
  group.name = 'wanted-plate';
  group.add(spr);

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.34, 8),
    new THREE.MeshBasicMaterial({ color: 0xf5c542 }),
  );
  stem.position.y = -0.22;
  group.add(stem);
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.05, 0.09, 4),
    new THREE.MeshBasicMaterial({ color: 0xf5c542 }),
  );
  tip.rotation.x = Math.PI;
  tip.position.y = -0.42;
  group.add(tip);

  group.position.y = y;
  return group;
}

export class Chaser {
  constructor(mounted, name, meta = {}) {
    this.root = mounted.root;
    this.clips = mounted.clips;
    this.name = name;
    this.meta = meta;
    this.gap = 3.45;
    this.gapClose = 2.15;
    this.gapFar = 4.05;
    this.gapIdle = 18.5;
    this.tension = 0;
    this.engaged = false;
    this.grabbing = false;
    this.stumble = 0;
    this.stumbledZ = null;
    this.block = null;
    this.justStumbled = false;
    this.justGaveUp = false;
    this.chaseGap = 18.5;
    this._spawnGrace = 0;
    this._logT = 0;
    this.state = 'idle';

    this.mixer = new THREE.AnimationMixer(mounted.model);
    this.actions = {};
    const run = this.clips.run;
    const grab = resolveClip(this.clips, ['alert', 'search', 'walk']);
    const stumble = resolveClip(this.clips, ['walk', 'search', 'idle']);
    if (run) this.actions.run = this.mixer.clipAction(run);
    if (grab) {
      this.actions.grab = this.mixer.clipAction(grab);
      this.actions.grab.setLoop(THREE.LoopOnce, 1);
      this.actions.grab.clampWhenFinished = true;
    }
    if (stumble) {
      this.actions.stumble = this.mixer.clipAction(stumble);
      this.actions.stumble.setLoop(THREE.LoopOnce, 1);
      this.actions.stumble.clampWhenFinished = true;
    }
    for (const a of Object.values(this.actions)) {
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
    }
    this._play('run', 0);
    this.root.visible = false;
    this.root.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
    });
    console.log(
      `[cop] ready ${this.name} run=${!!this.actions.run} meshes=${this._meshCount()} visible=hidden until chase`,
    );
  }

  _meshCount() {
    let n = 0;
    this.root.traverse((o) => {
      if (o.isMesh) n += 1;
    });
    return n;
  }

  _play(name, fade = 0.15) {
    const next = this.actions[name] || this.actions.run;
    if (!next) return;
    const prev = this.current ? this.actions[this.current] : null;
    if (name === 'grab' || name === 'stumble' || name === 'alert') {
      next.reset();
      next.time = 0;
      next.paused = false;
    }
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (prev && prev !== next) next.crossFadeFrom(prev, fade, false);
    this.current = name;
  }

  /** Keep the cop between the camera (~z-6.7) and the runner so he never leaves the shot. */
  _clampBehind(runner, z) {
    const lo = runner.z - 4.5;
    const hi = runner.z - 2.1;
    return THREE.MathUtils.clamp(z, lo, hi);
  }

  _log(runner) {
    this._logT += 0.016;
    if (this._logT < 0.45) return;
    this._logT = 0;
    console.log(
      `[cop] ${this.state} vis=${this.root.visible} gap=${this.chaseGap.toFixed(2)} ` +
        `z=${this.root.position.z.toFixed(1)} runZ=${runner.z.toFixed(1)} ` +
        `x=${this.root.position.x.toFixed(2)} tension=${this.tension.toFixed(2)}`,
    );
  }

  update(dt, runner, spawn = null) {
    this.justStumbled = false;
    this.justGaveUp = false;
    if (this.grabbing) {
      this.state = 'caught';
      this.root.visible = true;
      this.root.position.y = 0;
      this.root.rotation.x = 0;
      this.mixer.update(dt);
      return;
    }

    const prevZ = this.root.position.z;
    this.root.position.x += (runner.x - this.root.position.x) * (1 - Math.exp(-7 * dt));

    if (!this.engaged) {
      this.state = 'idle';
      this.root.visible = false;
      this.root.position.set(runner.x, 0, runner.z - this.gapIdle);
      this.root.rotation.x = 0;
      this.chaseGap = this.gapIdle;
      this.mixer.update(dt);
      return;
    }

    // Chase stays on until he catches you. Stumble can slow him; he never leaves.
    this.root.visible = true;
    this.root.scale.setScalar(1);
    if (this._spawnGrace > 0) this._spawnGrace = Math.max(0, this._spawnGrace - dt);

    if (this.stumble > 0) {
      this.state = this.stumble > 0.2 ? 'stumbling' : 'recovering';
      this.stumble = Math.max(0, this.stumble - dt);
      // Slight fall-back only — never recede behind the camera.
      let tz = this._clampBehind(runner, prevZ - dt * 0.7);
      this.root.position.z = tz;
      this.root.position.y = 0;
      this.root.rotation.x = 0.28;
      this.chaseGap = runner.z - tz;
      if (this.actions.stumble) this.actions.stumble.timeScale = 1.15;
      if (this.stumble <= 0) {
        if (this.block) {
          const past = this.block.back + 0.4;
          this.root.position.z = this._clampBehind(runner, Math.max(tz, past));
          this.stumbledZ = this.block.z;
        }
        this.block = null;
        this.state = 'chasing';
        this._play('run', 0.1);
      }
      this.chaseGap = runner.z - this.root.position.z;
      this._log(runner);
      this.mixer.update(dt);
      return;
    }

    // Clean running eases him back to a hang gap — never off-screen, never disengage.
    this.tension = THREE.MathUtils.clamp(this.tension - dt * 0.045, 0.34, 1);

    this.state = 'chasing';
    const base = THREE.MathUtils.lerp(this.gapFar, this.gapClose, this.tension);
    const want = this._clampBehind(runner, runner.z - base);
    const maxStep = (10 + this.tension * 8) * dt;
    let tz = prevZ;
    if (want > prevZ + maxStep) tz = prevZ + maxStep;
    else if (want < prevZ - maxStep) tz = prevZ - maxStep;
    else tz = want;
    tz = this._clampBehind(runner, tz);

    if (spawn && this._spawnGrace <= 0) {
      const hit = spawn.hitsCopSwept(this.root.position.x, prevZ, tz, this.stumbledZ);
      if (hit) {
        this.stumble = 0.55;
        this.block = hit;
        this.stumbledZ = hit.z;
        this.tension = Math.max(0.34, this.tension - 0.12);
        this.justStumbled = true;
        this.state = 'stumbling';
        this._play('stumble', 0.08);
        this.root.position.z = this._clampBehind(runner, tz);
        this.root.position.y = 0;
        this.root.rotation.x = 0.28;
        this.chaseGap = runner.z - this.root.position.z;
        console.log(
          `[cop] stumble @ ${hit.clear || hit.id || 'obs'} z=${hit.z.toFixed(1)} stay z=${this.root.position.z.toFixed(1)}`,
        );
        this.mixer.update(dt);
        return;
      }
    }

    this.root.position.z = tz;
    this.root.position.y = 0;
    this.root.rotation.x = this.tension * 0.12;
    this.chaseGap = runner.z - tz;
    if (this.actions.run) this.actions.run.timeScale = 1.12 + this.tension * 0.45;
    if (this.current !== 'run') this._play('run', 0.1);
    this._log(runner);
    this.mixer.update(dt);
  }

  alert(runner = null) {
    if (!this.engaged) {
      this.engaged = true;
      this.tension = 0.95;
      this.stumble = 0;
      this.block = null;
      this._spawnGrace = 0.85;
      // Sit in the chase-cam cone: ~3.4m behind the runner (cam is at z-6.7).
      // Further back than that falls under the look-at and is off-screen.
      const z = runner ? runner.z - 3.4 : this.root.position.z;
      const x = runner ? runner.x : this.root.position.x;
      this.root.visible = true;
      this.root.position.set(x, 0, z);
      this.root.scale.setScalar(1);
      this.chaseGap = runner ? 3.4 : this.chaseGap;
      this._play('run', 0);
      if (this.actions.run) this.actions.run.timeScale = 1.25;
      console.log(
        `[cop] ENGAGE ${this.name} pos=${x.toFixed(2)},0,${z.toFixed(2)} ` +
          `runnerZ=${runner?.z.toFixed(2)} meshes=${this._meshCount()} visible=${this.root.visible} run=${!!this.actions.run}`,
      );
      if (this._meshCount() < 1) console.error('[cop] FAILED no meshes on chaser root');
      return true;
    }
    this.tension = Math.min(1, this.tension + 0.4);
    this.root.visible = true;
    return false;
  }

  /** Any hit while the chase is on = he tackles you. */
  canCatch() {
    return !!this.engaged;
  }

  nearMiss() {
    this.alert();
  }

  pullAhead() {
    this.tension = Math.max(0.34, this.tension - 0.06);
  }

  grab() {
    this.grabbing = true;
    this.stumble = 0;
    this._play('grab', 0.08);
  }

  /** Face the 3/4 close-up camera (front-right of the cop). */
  poseForCloseup() {
    this.grabbing = true;
    this.stumble = 0;
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.root.rotation.y = Math.atan2(1.85, 1.2);
    this._play('grab', 0.05);
  }
}


