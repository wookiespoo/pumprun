import * as THREE from 'three';

const _look = new THREE.Vector3();

/** High enough / far enough that the cop (at z-3.4) is fully in the lower frame. */
export class ChaseCam {
  constructor(camera, runner) {
    this.camera = camera;
    this.runner = runner;
  }

  _pose() {
    const r = this.runner;
    this.camera.clearViewOffset();
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    return {
      pos: new THREE.Vector3(r.x * 0.22, r.y + 3.35, r.z - 6.7),
      look: new THREE.Vector3(r.x * 0.14, r.y + 1.05, r.z + 1.9),
    };
  }

  update(dt) {
    const { pos, look } = this._pose();
    const k = 1 - Math.exp(-10 * dt);
    this.camera.position.lerp(pos, k);
    _look.copy(look);
    this.camera.lookAt(_look);
  }

  snap() {
    const { pos, look } = this._pose();
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
  }

  /**
   * 3/4 front of the cop's face + shoulders. Side offset so the runner
   * isn't in the shot. Snap on the first frame — never lerp from behind.
   */
  faceCloseup(cop, snap = false) {
    if (!cop?.root) return;
    const p = cop.root.position;
    const side = 1.85;
    const fwd = 1.2;
    const pos = new THREE.Vector3(p.x + side, 1.8, p.z + fwd);
    const look = new THREE.Vector3(p.x, 1.5, p.z + 0.06);
    this.camera.fov = 40;
    this.camera.updateProjectionMatrix();
    if (snap) this.camera.position.copy(pos);
    else this.camera.position.lerp(pos, 0.35);
    this.camera.lookAt(look);
  }
}
