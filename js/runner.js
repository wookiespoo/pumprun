import * as THREE from 'three';
import { laneWorldX } from './catalog.js?v=20';

const GRAVITY = -36;
const JUMP_V = 11.15; // apex ~1.73m — clears the 1.52 hurdle, not buses or the 2.4 gantry
const SLIDE_T = 0.85; // long enough to clear a gantry at run speed
const LANE_LERP = 14;
// A notch hotter: quicker ramp, slightly higher cap. Still reactable.
export const START_SPEED = 8.6;
export const MAX_SPEED = 24.5;
export const SPEED_PER_M = 0.025;
export const SPEED_TAU = (MAX_SPEED - START_SPEED) / SPEED_PER_M;

export function speedAtDistance(distance) {
  const d = Math.max(0, distance);
  return MAX_SPEED - (MAX_SPEED - START_SPEED) * Math.exp(-d / SPEED_TAU);
}

console.log(
  `[speed] START=${START_SPEED} MAX=${MAX_SPEED} PER_M=${SPEED_PER_M} TAU=${SPEED_TAU.toFixed(0)} (was 6.2/19/0.011, original 8/27/0.028)`,
);

export class Runner {
  constructor(mounted, input) {
    this.input = input;
    this.root = mounted.root;
    this.clips = mounted.clips;
    this.height = mounted.height;
    this.lane = 0;
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.sliding = false;
    this.slideLeft = 0;
    this.alive = true;
    this.distance = 0;
    this.speed = START_SPEED;
    this.radius = 0.36;
    this.baseScale = mounted.root.scale.x;
    this.powers = { shield: 0, magnet: 0, double: 0 };
    this.powerMax = { shield: 0, magnet: 0, double: 0 };
    this.justJumped = false;
    this.justLanded = false;
    this.justSlid = false;
    this.justMounted = false;
    this.justBumped = false;
    this.invuln = 0;
    this.onTop = false;
    this.jumpLock = 0;
    this.coyote = 0;

    this.mixer = new THREE.AnimationMixer(mounted.model);
    this.actions = {};
    this.jumpDur = 0;
    this.slideDur = SLIDE_T;
    this.slideTimeScale = 1;
    this.hasSlideClip = false;
    this._bind();
    this.current = null;
    this._play('run', 0);
  }

  _bind() {
    const run = this.clips.run;
    const jump = this.clips.jump;
    const walk = this.clips.walk;
    const slide = this.clips.slide;
    const roll = this.clips.roll;
    if (run) this.actions.run = this.mixer.clipAction(run);
    if (jump) {
      this.actions.jump = this.mixer.clipAction(jump);
      this.actions.jump.setLoop(THREE.LoopOnce, 1);
      this.actions.jump.clampWhenFinished = true;
      this.jumpDur = jump.duration || 1.9;
    }
    if (slide) {
      this.actions.slide = this.mixer.clipAction(slide);
      this.actions.slide.setLoop(THREE.LoopOnce, 1);
      this.actions.slide.clampWhenFinished = true;
      this.slideDur = SLIDE_T;
      this.slideTimeScale = Math.max(1.4, (slide.duration || 1.57) / SLIDE_T);
      this.hasSlideClip = true;
    } else if (walk) {
      this.actions.slide = this.mixer.clipAction(walk.clone());
      this.slideDur = SLIDE_T;
      this.slideTimeScale = 1.4;
    }
    for (const a of Object.values(this.actions)) {
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
    }
  }

  _play(name, fade = 0.12) {
    if (this.current === name && name !== 'slide') return;
    const next = this.actions[name] || this.actions.run;
    if (!next) return;
    const prev = this.current ? this.actions[this.current] : null;
    if (name === 'jump') {
      next.reset();
      next.paused = false;
      next.time = Math.min(0.28, this.jumpDur * 0.16);
      next.timeScale = 1.35;
      next.enabled = true;
      next.setEffectiveWeight(1);
    } else if (name === 'slide') {
      next.reset();
      next.paused = false;
      next.time = 0;
      next.timeScale = this.slideTimeScale || 1;
      next.enabled = true;
      next.setEffectiveWeight(1);
    } else {
      next.enabled = true;
      next.paused = false;
      next.timeScale = 1;
      next.setEffectiveWeight(1);
    }
    if (prev && prev !== next) next.crossFadeFrom(prev, fade, false);
    this.current = name;
  }

  give(kind, duration) {
    const next = Math.max(this.powers[kind] || 0, duration);
    if (next > (this.powers[kind] || 0)) this.powerMax[kind] = next;
    this.powers[kind] = next;
  }

  /** First-hit recover. Obstacle is already removed — no iframe, or the next ones get skipped. */
  bump() {
    this.justBumped = true;
    this.invuln = 0;
  }

  colliderHeight() {
    if (this.sliding) return 0.62;
    return this.height * 0.9;
  }

  update(dt, spawn) {
    if (!this.alive) {
      this.mixer.update(dt);
      return;
    }

    this.speed = speedAtDistance(this.distance);
    this.z += this.speed * dt;
    this.distance = this.z;

    const dLane = this.input.laneDelta();
    if (dLane) this.lane = THREE.MathUtils.clamp(this.lane + dLane, -1, 1);

    const targetX = laneWorldX(this.lane);
    this.x += (targetX - this.x) * (1 - Math.exp(-LANE_LERP * dt));

    this.justJumped = false;
    this.justLanded = false;
    this.justSlid = false;
    this.justMounted = false;
    this.justBumped = false;
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.jumpLock > 0) this.jumpLock = Math.max(0, this.jumpLock - dt);
    if (this.grounded) this.coyote = 0.14;
    else this.coyote = Math.max(0, this.coyote - dt);
    if ((this.grounded || this.coyote > 0) && this.input.jump() && !this.sliding) {
      this.vy = JUMP_V;
      this.grounded = false;
      this.onTop = false;
      this.justJumped = true;
      this.coyote = 0;
      this.jumpLock = 0.2;
      this._play('jump', 0.04);
    }
    if (this.grounded && !this.onTop && this.input.slide()) {
      this.sliding = true;
      this.slideLeft = SLIDE_T;
      this.justSlid = true;
      this._play('slide', 0.05);
    }

    const surf = spawn?.surfaceAt?.(this.x, this.z) || null;
    // Ride any time we are in the ramp/roof volume, unless we are jumping
    // UP from it (roof hop). Snap from below so a late lane-change or a
    // skipped frame still mounts — the old "must already be near the
    // slope" window let the surface outrun the feet.
    if (surf) {
      const hopping = this.justJumped || (this.vy > 0.5 && this.y > surf.y + 0.1);
      if (!hopping) {
        if (!this.onTop && surf.kind === 'ramp') this.justMounted = true;
        this.y = surf.y;
        this.vy = 0;
        this.grounded = true;
        this.onTop = true;
        if (this.sliding) {
          this.sliding = false;
          this.slideLeft = 0;
        }
        if (this.current === 'jump' || this.current === 'slide') this._play('run', 0.08);
      }
    } else if (this.onTop) {
      this.onTop = false;
      this.grounded = false;
    }

    if (!this.grounded) {
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      const jump = this.actions.jump;
      if (jump && this.current === 'jump') {
        const holdAt = Math.min(this.jumpDur * 0.48, this.jumpDur - 0.08);
        if (jump.time >= holdAt || this.vy <= 0) {
          jump.time = holdAt;
          jump.paused = true;
          jump.timeScale = 0;
        }
      }
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.onTop = false;
        this.justLanded = true;
        if (jump) {
          jump.paused = false;
          jump.timeScale = 1;
        }
        this._play(this.sliding ? 'slide' : 'run', 0.1);
      }
    }

    if (this.sliding) {
      this.slideLeft -= dt;
      if (this.slideLeft <= 0) {
        this.sliding = false;
        if (this.grounded) this._play('run');
      }
    }

    for (const k of Object.keys(this.powers)) {
      if (this.powers[k] > 0) {
        this.powers[k] = Math.max(0, this.powers[k] - dt);
        if (this.powers[k] <= 0) this.powerMax[k] = 0;
      }
    }

    this.root.position.set(this.x, this.y, this.z);
    if (this.hasSlideClip) {
      this.root.scale.setScalar(this.baseScale);
    } else {
      const squash = this.sliding ? 0.52 : 1;
      this.root.scale.set(this.baseScale, this.baseScale * squash, this.baseScale);
    }
    this.mixer.update(dt);
  }
}
